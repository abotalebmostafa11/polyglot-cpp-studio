'use strict';
const {spawn,execFile} = require('node:child_process');
const {promisify} = require('node:util');
const runFile=promisify(execFile);
const os=require('node:os'), fs=require('node:fs/promises'), sync=require('node:fs'), path=require('node:path');
const {StringDecoder}=require('node:string_decoder');
const isWin=process.platform==='win32', isMac=process.platform==='darwin';
const home=path.join(__dirname,'runtime','windows');
const powershell=isWin?path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'):'';
let config, settingUp, active, proposal;
async function compiler(install=false,progress=()=>{}) {
  if(config)return config;
  if(settingUp)return settingUp;
  async function detect(){
    if(isWin){
      const bin=path.join(process.env.LOCALAPPDATA,'CppStart','toolchain','bin'),file=path.join(bin,'clang++.exe');
      if(!sync.existsSync(file)){
        if(!install)return null;
        const proc=spawn(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(home,'setup.ps1')],{windowsHide:true});
        let tail='';proc.stdout.on('data',c=>{const msg=String(c).trim();if(msg)progress(msg);});proc.stderr.on('data',c=>tail=(tail+c).slice(-4000));
        const code=await new Promise((ok,no)=>{proc.once('error',no);proc.once('close',ok);});
        if(code)throw new Error(tail.trim()||'Compiler setup failed. See CppStart/setup.log in your local application data.');
      }
      return {file,args:[],env:{...process.env,PATH:bin+';'+process.env.PATH}};
    }
    if(isMac){
      try {
        await runFile('/usr/bin/xcode-select',['-p']);
        const cc=(await runFile('/usr/bin/xcrun',['--sdk','macosx','--find','clang++'])).stdout.trim();
        const sdk=(await runFile('/usr/bin/xcrun',['--sdk','macosx','--show-sdk-path'])).stdout.trim();
        return {file:cc,args:['-isysroot',sdk],env:process.env};
      }catch{
        if(!install)return null;
        await runFile('/usr/bin/xcode-select',['--install']).catch(()=>{});
        throw new Error('Complete Apple’s Command Line Tools installation, then click Run.');
      }
    }
    return {file:process.env.CXX||'clang++',args:[],env:process.env};
  }
  settingUp=detect().then(value=>(config=value)).finally(()=>{settingUp=null;});
  return settingUp;
}
function common(cfg){return ['-std=c++20','-finput-charset=UTF-8','-fexec-charset=UTF-8','-fno-color-diagnostics',...cfg.args];}
function parseMembers(output){
  const list=new Map();
  for(const line of output.split('\n')){
    const m=/^COMPLETION: ([\p{L}_][\p{L}\p{N}_]*) : (.*)$/u.exec(line);
    if(!m||m[1].startsWith('_'))continue;
    const signature=m[2].replace(/\[#(.*?)#\]/g,'$1 ').replace(/<#(.*?)#>/g,'$1').replace(/\{#(.*?)#\}/g,'$1');
    const callable=m[2].includes(m[1]+'('),args=callable&&!m[2].includes(m[1]+'()');
    const previous=list.get(m[1]);
    if(!previous || (previous.args&&!args))list.set(m[1],{name:m[1],detail:signature.trim(),call:callable,args});
  }
  return [...list.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
async function complete(source,line,col,file){
  if(proposal)proposal.kill();
  const cfg=await compiler(); if(!cfg)return [];
  const args=[...common(cfg),'-x','c++','-fsyntax-only','-Xclang','-code-completion-at=-:'+line+':'+col,'-'];
  return new Promise(resolve=>{
    const child=spawn(cfg.file,args,{cwd:file?path.dirname(file):os.homedir(),env:cfg.env,windowsHide:true});
    proposal=child;let out='',timer=setTimeout(()=>child.kill(),9000);
    child.stdout.setEncoding('utf8');child.stdout.on('data',c=>{if(out.length<2e6)out+=c;});
    child.stderr.resume();child.stdin.on('error',()=>{});child.stdin.end(source,'utf8');
    child.once('error',()=>resolve([]));
    child.once('close',()=>{clearTimeout(timer);if(proposal===child)proposal=null;resolve(parseMembers(out));});
  });
}
function halt(){
  if(!active)return;
  active.cancel=true;const c=active.child;if(!c||!c.pid)return;
  if(isWin){spawn(path.join(process.env.SystemRoot,'System32','taskkill.exe'),['/PID',String(c.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>c.kill());}
  else {try{process.kill(-c.pid,'SIGKILL');}catch{c.kill();}}
}
async function execute({file,source,input,check},notify){
  if(active)return;
  const job={cancel:false,child:null};active=job;
  notify({kind:'start',tracing:check});
  let work='',compiled=false,exit=1,buffer='',limited=false,issues=[],pending;
  const show=()=>{clearTimeout(pending);pending=null;notify({kind:'output',value:buffer,limited});};
  function append(s){
    const added=Math.min(1048576-buffer.length,s.length);buffer+=s.slice(0,added);limited ||=added<s.length;
    if(!pending)pending=setTimeout(show,45);
  }
  function childRun(cmd,args,cwd,env,stdin=''){
    return new Promise((ok,bad)=>{
      const p=spawn(cmd,args,{cwd,env,windowsHide:true,detached:!isWin,stdio:'pipe'});job.child=p;
      for(const stream of [p.stdout,p.stderr]){
        const utf8=new StringDecoder('utf8');stream.on('data',b=>append(utf8.write(b)));stream.on('end',()=>append(utf8.end()));
      }
      p.stdin.on('error',()=>{});p.stdin.end(stdin,'utf8');p.once('error',bad);p.once('close',n=>{job.child=null;ok(n??1);});
    });
  }
  try {
    const cfg=await compiler(true,p=>notify({kind:'status',key:'compiling',detail:p}));if(job.cancel)return;
    work=await fs.mkdtemp(path.join(os.tmpdir(),'polyglot-'));
    const snapshot=path.join(work,'lesson.cpp'),output=path.join(work,isWin?'lesson.exe':'lesson');
    await fs.writeFile(snapshot,source,'utf8');const cwd=file?path.dirname(file):os.homedir();
    const args=[...common(cfg),'-g','-O0','-Wall','-Wextra'];
    if(file && sync.existsSync(file)){
      const overlay=path.join(work,'buffer.json');await fs.writeFile(overlay,JSON.stringify({version:0,'use-external-names':false,roots:[{type:'file',name:file,'external-contents':snapshot}]}));
      args.push('-ivfsoverlay',overlay,'-x','c++',file);
    }else args.push('-x','c++',snapshot);
    if(check)args.push('-fsyntax-only');
    else {if(isWin)args.push('-x','none',path.join(home,'program-utf8.res'));args.push('-o',output);}
    if(job.cancel)return;
    exit=await childRun(cfg.file,args,cwd,cfg.env);
    for(const ln of buffer.split(/\r?\n/)){
      const m=/^(.*?):(\d+):(\d+): (fatal error|error|warning|note): (.*)/.exec(ln);
      if(m)issues.push({file:m[1]===snapshot?file:path.resolve(cwd,m[1]),line:+m[2],column:+m[3],level:m[4],message:m[5]});
    }
    compiled=exit===0;
    if(!check&&compiled&&!job.cancel){notify({kind:'status',key:'running'});exit=await childRun(output,[],cwd,cfg.env,input);}
  }catch(e){append(e.message+'\n');}finally{
    if(work)await fs.rm(work,{recursive:true,force:true}).catch(()=>{});
    show();active=null;notify({kind:'finished',tracing:check,compiled,exit,stopped:job.cancel,issues});
  }
}
module.exports={execute,halt,complete,compiler,parseMembers};
