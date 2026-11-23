'use strict';
const find = id => document.getElementById(id);
const source = find('source'), output = find('output'), input = find('input');
const native = (action, extra = {}) => window.desktop.command(action, extra);
const starter = '#include <iostream>\n#include <string>\n\nint main() {\n    std::cout << "Hello!\\n";\n    std::cout << "مرحبا بالعالم!\\n";\n    std::cout << "বাংলাদেশে স্বাগতম!\\n";\n    std::cout << "Привет, мир!\\n";\n    return 0;\n}\n';
let languages = {}, language = 'en', name = 'Untitled.cpp', dirty = false, issues = [], next = 0;
let state = {key:'ready', extra:'', style:''}, theme = 'system', running = false, failed = false;
let captured = '', limited = false, revision = 0, startedRevision = -1, checkedRevision = -1;
const media = window.matchMedia('(prefers-color-scheme: dark)');
const tr = key => languages[language]?.[key] ?? languages.en?.[key] ?? key;
function applyTheme() {
  const dark = theme === 'dark' || (theme === 'system' && media.matches);
  document.documentElement.dataset.tone = dark ? 'dark' : 'light';
  find('university').src = dark ? 'university-dark.png' : 'university-light.png';
}
media.addEventListener('change', applyTheme);
function cursor() {
  const prior = source.value.slice(0, source.selectionStart);
  const line = 1 + (prior.match(/\n/g) || []).length;
  const column = Array.from(prior.slice(prior.lastIndexOf('\n')+1)).length + 1;
  find('cursor').textContent = tr('line')+' '+line+' · '+tr('col')+' '+column;
}
let lineCount = 0;
function gutter() {
  const count = 1 + (source.value.match(/\n/g) || []).length;
  if (count !== lineCount) {
    lineCount = count;
    // Keep the active buffer responsive on very large files.
    find('lines').textContent = count <= 20000 ? Array.from({length:count},(_,i) => i+1).join('\n') : '';
  }
  find('lines').scrollTop = source.scrollTop;
  cursor();
}
function renderStatus() {
  const str = state.key ? tr(state.key) : '';
  find('status').textContent = [str, state.extra].filter(Boolean).join(' · ');
  find('status').title = find('status').textContent;
  find('indicator').dataset.state = state.style || (running ? 'busy' : '');
}
function status(key, extra='', style='') { state = {key,extra,style}; renderStatus(); }
function displayOutput() { output.textContent = captured + (limited ? '\n['+tr('limited')+']' : ''); output.scrollTop=output.scrollHeight; }
function setLocale() {
  document.documentElement.lang = language; document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  for (const element of document.querySelectorAll('[data-t]')) {
    element.textContent = tr(element.dataset.t);
    if (element.dataset.icon) {
      const span=document.createElement('span'); span.className='glyph'; span.dataset.i=element.dataset.icon; span.setAttribute('aria-hidden','true'); element.prepend(span);
    }
  }
  for (const key of ['source','input','output','theme','language']) find(key).setAttribute('aria-label',tr(key));
  find('trace').title=tr('traceTip'); find('theme').title=tr('theme'); find('language').title=tr('language');
  window.dispatchEvent(new Event('localechange')); input.placeholder=tr('inputHint'); renderStatus(); cursor(); displayOutput();
}
function updateName() {find('filename').textContent=name+(dirty?' •':'');}
function setBusy(b) {
  running=b;
  document.querySelectorAll('[data-action]').forEach(button=>{
    const action=button.dataset.action;
    button.disabled= action==='stop' ? !b : (b && ['new','open','run','trace','saveAs'].includes(action));
  });
}
function edited() { revision++; if (!dirty) {dirty=true; native('dirty'); updateName();} gutter(); }
function trace() {
  if (checkedRevision !== revision) { startedRevision=revision; native('check',{source:source.value}); return; }
  if (!issues.length) {status(failed?'exitIssue':'noIssues');return;}
  // Prioritize errors so a warning on line 1 won't hide the build failure.
  const ranks = level => /error/.test(level)?0:level==='warning'?1:2;
  const order=issues.map((v,index)=>({v,index})).sort((a,b)=>ranks(a.v.level)-ranks(b.v.level));
  const target=order[next++%order.length];
  native('trace',{index:target.index,source:source.value});
}
function command(a) {
  if (a === 'trace') { trace(); return; }
  const button=document.querySelector('[data-action="'+a+'"]'); if (button?.disabled) return;
  if (a==='run') {startedRevision=revision;native(a,{source:source.value,input:input.value}); return;}
  if (['new','open','openNative','save','saveAs','close'].includes(a)) {native(a,{source:source.value}); return;}
  native(a);
}
function selectLocation(line,column,msg) {
  const lines=source.value.split('\n');
  const row=Math.max(0, Math.min(lines.length-1,line-1)), text=lines[row];
  // Clang's default column is a UTF-8 byte offset. A textarea uses UTF-16 offsets.
  const encoder=new TextEncoder(); let col=0, used=0;
  for (const c of text) {const size=encoder.encode(c).length; if (used+size>column-1) break; used+=size; col+=c.length;}
  let base=0; for(let i=0;i<row;i++) base+=lines[i].length+1;
  source.focus(); const at=base+col;
  const ch=Array.from(text.slice(col))[0] || '';
  source.setSelectionRange(at,at+ch.length);
  source.scrollTop=Math.max(0,row*24-source.clientHeight*0.4); find('lines').scrollTop=source.scrollTop; cursor();
  status('issueAt',tr('line')+' '+line+' · '+tr('col')+' '+column+' · '+msg,'error');
}
window.studio = {
  receive(e) {
    switch(e.kind) {
    case 'init':
      languages=e.languages || {};language=e.language||'en';theme=e.theme||'system';
      find('language').value=language;find('theme').value=theme;setLocale();applyTheme();break;
    case 'document':
      source.value=e.content===null ? starter : e.content;name=e.name;dirty=false;revision++;
      window.dispatchEvent(new Event('documentchanged'));
      if (e.traceNavigation) checkedRevision=revision;
      else {issues=[];next=0;failed=false;captured='';limited=false;displayOutput();checkedRevision=-1;}
      updateName();gutter();status('ready');source.focus();break;
    case 'saved': if(name!==e.name) revision++; name=e.name;dirty=false;updateName();status('ready');break;
    case 'tools':find('tools').hidden=e.installed; if (e.installed && state.key==='appleTools') status('ready');break;
    case 'start':issues=[];next=0;failed=false;captured='';limited=false;displayOutput();setBusy(true);status(e.tracing?'checking':'compiling');break;
    case 'status':status(e.key,e.detail||'');break;
    case 'output':captured=e.value;limited=!!e.limited;displayOutput();break;
    case 'finished':setBusy(false);issues=e.issues||[];next=0;failed=e.exit!==0 && !e.stopped;
      checkedRevision=e.stopped?-1:startedRevision;
      if(e.tracing && !e.stopped && checkedRevision===revision) { if(issues.length) trace(); else status(failed?'buildFailed':'noIssues'); break; }
      status(e.stopped?'stopped':e.compiled?'finished':'buildFailed',e.stopped?'':tr('exit')+' '+e.exit,failed?'error':'');break;
    case 'selection':selectLocation(e.line,e.column,e.message);break;
    case 'command':command(e.name);break;
    }
  }
};
document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>command(el.dataset.action)));
find('language').addEventListener('change',e=>{language=e.target.value;setLocale();native('language',{value:language});});
find('theme').addEventListener('change',e=>{theme=e.target.value;applyTheme();native('theme',{value:theme});});
source.addEventListener('input',edited);source.addEventListener('scroll',()=>{find('lines').scrollTop=source.scrollTop;});
for (const key of ['click','keyup','select']) source.addEventListener(key,cursor);
document.addEventListener('keydown',e=>{if(e.key==='F5'){e.preventDefault();command('run');}});
window.desktop.events(e=>window.studio.receive(e));
source.value=starter; applyTheme(); gutter(); updateName(); setBusy(false); native('ready');
