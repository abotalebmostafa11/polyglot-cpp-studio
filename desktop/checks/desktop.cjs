const {app,BrowserWindow,dialog}=require('electron');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const output=process.env.QA_OUT; app.setPath('userData',path.join(output,'prefs'));
const fixtures=path.join(output,'input.cpp');
dialog.showSaveDialog=async (_w,o)=>({filePath:path.join(output,'lesson.'+o.filters[0].extensions[0]),canceled:false});
dialog.showMessageBox=async()=>({response:1});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=15000){let v;for(let i=0;i<ms/80;i++){try{v=await fn();if(v)return v;}catch{}await wait(80);}throw Error('timed out: '+fn.toString());}
require(process.env.QA_APP+'/main.js');
app.whenReady().then(async()=>{
 try{
 const w=await until(()=>BrowserWindow.getAllWindows()[0]),web=w.webContents;
 web.on('console-message',(_e,d)=>{if(d.level==='error')console.error('UI',d.message);});
 const js=s=>web.executeJavaScript(s); const text=fs.readFileSync(fixtures,'utf8');
 await until(()=>js("typeof gutter==='function' && document.querySelector('#record')===null && !!document.querySelector('#videoToggle') && !!window.desktop"));
 await until(()=>js("document.querySelector('#status').textContent==='Ready' && !!window.studio"));
 const setup=async value=>js("source.focus();source.value="+JSON.stringify(value)+";source.dispatchEvent(new Event('input',{bubbles:true}));true");
 async function key(k,mods=[]){web.sendInputEvent({type:'keyDown',keyCode:k,modifiers:mods});web.sendInputEvent({type:'keyUp',keyCode:k,modifiers:mods});await wait(80);}
 await setup('one\n  two\nthree');await js("source.setSelectionRange(0,10,'backward');true");await key('Tab');
 assert.equal(await js('source.value'),'    one\n      two\nthree');await key('Tab',['shift']);assert.equal(await js('source.value'),'one\n  two\nthree');
 await setup(text);await js("var dot=source.value.indexOf('text.c_str')+5;source.setSelectionRange(dot,dot+7);document.execCommand('delete');source.dispatchEvent(new Event('input'));true");
 await until(()=>js("!find('completion').hidden && [...find('completion').children].some(n=>n.firstChild.textContent==='c_str')"));
 await js("document.execCommand('insertText',false,'c_s');true");await until(()=>js("find('completion').children.length===1"));await key('Enter');
 assert.equal(await js('source.value'),text);console.log('PASS multiline Tab and Shift+Tab, Clang list and keyboard insertion');
 await js("command('run');true");await until(()=>js("find('output').textContent==='code\\n' && find('status').textContent.includes('Finished')"));
 console.log('PASS sample output');
 await setup('#include <iostream>\n#include <string>\nint main(){ std::string s; std::getline(std::cin,s); std::cout << s << "\\n"; }\n');
 await js("input.value='বাংলা • مرحبا • English • Привет';command('run');true");
 await until(()=>js("output.textContent==='বাংলা • مرحبا • English • Привет\\n'"));
 await js("find('screenshot').click();true");await until(()=>fs.existsSync(path.join(output,'lesson.png')));
 await js("find('videoToggle').click();true");await until(()=>js("find('videoToggle').textContent==='Pause'"));
 await wait(1050);await js("find('videoToggle').click();true");await until(()=>js("find('videoToggle').textContent==='Resume'"));await wait(1100);
 await js("find('videoToggle').click();true");await until(()=>js("find('videoToggle').textContent==='Pause'"));await js("input.value='দ্বিতীয় অংশ • resumed';true");await wait(1100);
 await js("find('endVideo').click();true");await until(()=>fs.existsSync(path.join(output,'lesson.mp4')),50000);
 await until(()=>js("find('videoToggle').textContent==='Record video'"));
 await setup('struct Lesson { void teach(int n); int grade; };\nint main(){ Lesson l; l.');await js("source.setSelectionRange(source.value.length,source.value.length);source.dispatchEvent(new Event('input'));true");
 await until(()=>js("[...find('completion').children].some(n=>n.firstChild.textContent==='teach')"));
 await setup('int main(){\n  bad_name;\n}');await js("command('trace');true");await until(()=>js("find('status').textContent.includes('bad_name') && source.selectionStart===14"));
 console.log('PASS Unicode I/O, custom-class completion, diagnostic jumps, PNG, start/pause/resume/stop MP4');app.exit(0);
 }catch(e){console.error(e);const w=BrowserWindow.getAllWindows()[0];if(w)console.error(await w.webContents.executeJavaScript("({status:document.querySelector('#status')?.textContent, src:document.querySelector('#source')?.value,sel:document.querySelector('#source')?.selectionStart,menu:document.querySelector('#completion')?.textContent.slice(0,300),out:document.querySelector('#output')?.textContent})").catch(()=>''));app.exit(1);}
});
