'use strict';
const {app,BrowserWindow,Menu,dialog,ipcMain,shell} = require('electron');
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFile}=require('node:child_process'), runFile=require('node:util').promisify(execFile);
const {randomUUID}=require('node:crypto');
const engine=require('./compiler'), {Recording}=require('./record');
const languages=require('./ui/languages.json');
const name='Polyglot C++ Studio', ui=path.join(__dirname,'ui');
let win, file=null, dirty=false, closing=false, closePrompt=false, rec=null, stopping=null, docLock=false;
let lang='en', theme='system', issues=[], logFile, prefFile, prefQueue=Promise.resolve(), startupFile;
const files=[{name:'C++',extensions:['cpp','cxx','cc','h','hpp','hh','hxx','C']},{name:'All files',extensions:['*']}];
const tr=k=>languages[lang]?.[k]||languages.en[k]||k;
function send(event){if(win && !win.isDestroyed()) win.webContents.send('studio',event);}
function status(key,detail=''){send({kind:'status',key,detail});}
function title(){win.setTitle((file?path.basename(file):'Untitled.cpp')+(dirty?' •':'')+' — '+name+' 2.4.1');}
function settings(){
  const json=JSON.stringify({lang,theme});prefQueue=prefQueue.then(()=>fs.writeFile(prefFile,json)).catch(()=>{});
}
async function writeAtomic(target,bytes){
  const tmp=path.join(path.dirname(target),'.polyglot-'+randomUUID()+'.tmp');
  try {await fs.writeFile(tmp,bytes,{flag:'wx'});await fs.rename(tmp,target);}
  finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
}
async function save(text,as=false){
  let selected=file;
  if(!selected||as){
    selected=(await dialog.showSaveDialog(win,{title:tr(as?'saveAs':'save'),defaultPath:file||path.join(app.getPath('documents'),'Untitled.cpp'),filters:files})).filePath;
    if(!selected)return false;
  }
  await writeAtomic(selected,Buffer.from(text,'utf8'));
  file=selected;dirty=false;title();send({kind:'saved',name:path.basename(file)});return true;
}
async function mayLeave(source){
  if(!dirty)return true;
  const {response}=await dialog.showMessageBox(win,{type:'question',message:tr('saveChanges'),buttons:[tr('save'),tr('discard'),tr('cancel')],defaultId:0,cancelId:2});
  if(response===2)return false;
  return response===1||await save(source);
}
async function readDocument(target,jump=false){
  const stat=await fs.stat(target);if(!stat.isFile()||stat.size>16*1024*1024)throw new Error(tr('fileLarge'));
  const b=await fs.readFile(target);
  const encoding=b[0]===0xfe&&b[1]===0xff?'utf-16be':b[0]===0xff&&b[1]===0xfe?'utf-16le':'utf-8';
  let content;try{content=new TextDecoder(encoding,{fatal:true}).decode(b);}catch{throw new Error(tr('encoding'));}
  file=target;dirty=false;title();send({kind:'document',content,name:path.basename(file),traceNavigation:jump});
}
async function connect(force){
  if(!force && sync.existsSync(path.join(app.getPath('userData'),'vscode-2.3.0')))return;
  const pkg=path.join(__dirname,'runtime','polyglot-cpp-studio-2.3.0.vsix');
  const mac=process.platform==='darwin',windows=process.platform==='win32';
  let bin, args;
  if(windows){
    const dirs=[path.join(process.env.LOCALAPPDATA,'Programs','Microsoft VS Code'),process.env.ProgramFiles&&path.join(process.env.ProgramFiles,'Microsoft VS Code'),process.env['ProgramFiles(x86)']&&path.join(process.env['ProgramFiles(x86)'],'Microsoft VS Code')];
    const dir=dirs.find(d=>d&&sync.existsSync(path.join(d,'Code.exe'))&&sync.existsSync(path.join(d,'resources','app','out','cli.js')));
    if(dir){bin=path.join(dir,'Code.exe');args=[path.join(dir,'resources','app','out','cli.js'),'--install-extension',pkg];}
  }else if(mac){
    const dirs=['/Applications',path.join(os.homedir(),'Applications')];
    bin=dirs.map(d=>path.join(d,'Visual Studio Code.app','Contents','Resources','app','bin','code')).find(p=>sync.existsSync(p));
    if(bin)args=['--install-extension',pkg];
  }
  if(!bin){if(force)status('vsInfo','Open VS Code and choose Extensions → Install from VSIX.');
    if(force) shell.showItemInFolder(pkg);return;}
  await runFile(bin,args,{env:windows?{...process.env,ELECTRON_RUN_AS_NODE:'1'}:process.env,windowsHide:true,timeout:120000});
  await fs.writeFile(path.join(app.getPath('userData'),'vscode-2.3.0'),'2.3.0');if(force)status('vsReady');
}
async function initialize(){
  send({kind:'init',languages,language:lang,theme});
  if(startupFile)await readDocument(startupFile);
  else send({kind:'document',content:null,name:'Untitled.cpp'});
  let cfg=await engine.compiler(false);send({kind:'tools',installed:!!cfg});
  connect(false).catch(()=>{});
  if(!cfg&&process.platform==='win32')await prepare();
}
async function prepare(){
  try{const cfg=await engine.compiler(true,msg=>status('compiling',msg));send({kind:'tools',installed:!!cfg});status('ready');}
  catch(e){status(process.platform==='darwin'?'appleTools':'buildFailed',e.message);}
}
function runEvent(e){
  if(e.kind==='finished')issues=e.issues;
  if(e.kind==='output')lastOutput=e.value;
  if(e.kind==='start')lastOutput='';
  if(e.kind==='finished'){
    const report=new Date().toISOString()+'  '+(file||'Untitled.cpp')+'  exit '+e.exit+'\n'+lastOutput+'\n';
    fs.writeFile(logFile,report).catch(()=>{});
  }
  send(e);
}
let lastOutput='';
async function changeDoc(action,data){
  if(docLock)return;docLock=true;
  try{
    if(action==='save'||action==='saveAs'){await save(data.source,action==='saveAs');return;}
    if(action==='trace'){
      const issue=issues[data.index];if(!issue)return;
      if(issue.file&&issue.file!==file){
        if(!await mayLeave(data.source))return;
        await readDocument(issue.file,true);
      }
      send({kind:'selection',line:issue.line,column:issue.column,message:issue.message});return;
    }
    if(!await mayLeave(data.source))return;
    if(action==='new'){file=null;dirty=false;issues=[];title();send({kind:'document',name:'Untitled.cpp',content:null});return;}
    if(action==='open'||action==='openNative'){
      const pick=await dialog.showOpenDialog(win,{properties:['openFile'],filters:files});if(!pick.canceled)await readDocument(pick.filePaths[0]);
    }
  }finally{docLock=false;}
}
const api=evt=>win && evt.sender===win.webContents && evt.senderFrame===win.webContents.mainFrame;
ipcMain.on('command',async(evt,action,data={})=>{
  if(!api(evt))return;
  try{
    switch(action){
      case 'ready':await initialize();break;
      case 'dirty':dirty=true;title();break;
      case 'language':if(languages[data.value]){lang=data.value;settings();buildMenu();}break;
      case 'theme':if(['light','dark','system'].includes(data.value)){theme=data.value;settings();}break;
      case 'tools':await prepare();break;
      case 'run':case 'check': await engine.execute({file,source:data.source,input:data.input||'',check:action==='check'},runEvent);break;
      case 'stop':engine.halt();break;
      case 'log':if(!sync.existsSync(logFile))await fs.writeFile(logFile,'');await shell.openPath(logFile);break;
      case 'vscode':await connect(true);break;
      case 'save':case 'saveAs':case 'new':case 'open':case 'openNative':case 'trace':await changeDoc(action,data);break;
    }
  }catch(e){status('',''+e.message);}
});
ipcMain.handle('complete',(evt,text,line,col)=>api(evt)&&typeof text==='string'&&Number.isSafeInteger(line)&&line>0&&Number.isSafeInteger(col)&&col>0?engine.complete(text,line,col,file):[]);
async function finishVideo(){
  if(stopping)return stopping;if(!rec)return null;
  const item=rec;stopping=item.stop().finally(()=>{rec=null;stopping=null;});return stopping;
}
ipcMain.handle('capture',async(evt,action)=>{
  if(!api(evt))return;
  if(action==='pause'&&rec){rec.pause();return true;}
  if(action==='resume'&&rec){rec.resume();return true;}
  if(action==='stop'&&rec)return {file:await finishVideo()};
  const photo=action==='screenshot';
  if(!photo&&(action!=='start'||rec))return null;
  const img=photo?await win.webContents.capturePage():null;
  const ext=photo?'png':'mp4', label=photo?'PNG':'MP4';
  const stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const result=await dialog.showSaveDialog(win,{title:tr(photo?'screenshot':'record'),defaultPath:path.join(app.getPath(photo?'pictures':'videos'),path.parse(file||'Lesson').name+'-'+stamp+'.'+ext),filters:[{name:label,extensions:[ext]}]});
  if(result.canceled||!result.filePath)return null;
  const target=result.filePath.toLowerCase().endsWith('.'+ext)?result.filePath:result.filePath+'.'+ext;
  if(photo){if(img.isEmpty())throw new Error('No editor image is available.');await writeAtomic(target,img.toPNG());return {file:target};}
  const encoder=process.platform==='linux'?'/usr/bin/ffmpeg':path.join(__dirname,'runtime',process.platform==='win32'?'ffmpeg.exe':'ffmpeg');
  rec=await Recording.start(win.webContents,encoder,target);return true;
});
function buildMenu(){
  const action=(key,accelerator)=>({label:tr(key),accelerator,click:()=>send({kind:'command',name:key})});
  const menu=[{label:tr('file'),submenu:[action('new','CmdOrCtrl+N'),action('open','CmdOrCtrl+O'),action('save','CmdOrCtrl+S'),action('saveAs','CmdOrCtrl+Shift+S'),{type:'separator'},{role:'close'}]},
    {label:tr('edit'),submenu:['undo','redo','separator','cut','copy','paste','selectAll'].map(role=>role==='separator'?{type:'separator'}:{role})}];
  if(process.platform==='darwin')menu.unshift({role:'appMenu'});
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
}
app.setName(name);
app.on('open-file',(e,f)=>{e.preventDefault();if(!win)startupFile=f;else send({kind:'command',name:'openNative'});});
app.whenReady().then(async()=>{
  const dir=app.getPath('userData');await fs.mkdir(dir,{recursive:true});prefFile=path.join(dir,'preferences.json');logFile=path.join(dir,'last-run.log');
  try {const p=JSON.parse(await fs.readFile(prefFile,'utf8'));if(languages[p.lang])lang=p.lang;if(['light','dark','system'].includes(p.theme))theme=p.theme;}catch{}
  if(!startupFile)startupFile=process.argv.slice(1).find(f=>path.isAbsolute(f)&&/\.(cpp|cxx|cc|hpp|h)$/i.test(f)&&sync.existsSync(f));
  buildMenu();win=new BrowserWindow({width:1230,height:820,minWidth:740,minHeight:540,title:name,autoHideMenuBar:true,icon:path.join(ui,'app.png'),backgroundColor:'#f5f7fa',webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
  win.on('close',async e=>{
    if(closing)return;e.preventDefault();if(closePrompt)return;closePrompt=true;
    try{
      const text=await win.webContents.executeJavaScript("document.getElementById('source').value");
      if(!await mayLeave(text))return;
      if(rec)await finishVideo();engine.halt();closing=true;win.close();
    }catch(err){dialog.showErrorBox(name,err.message);}finally{closePrompt=false;}
  });
  win.on('closed',()=>app.quit());
  await win.loadFile(path.join(ui,'index.html'));title();
});
