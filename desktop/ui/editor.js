'use strict';
(() => {
  const box = find('completion');
  const tabSize = 4;
  let request = 0, timer, context, all = [], shown = [], selected = 0;

  function replace(start, end, value) {
    source.focus();
    source.setSelectionRange(start, end);
    if (!document.execCommand(value ? 'insertText' : 'delete', false, value)) {
      source.setRangeText(value, start, end, 'end');
      source.dispatchEvent(new Event('input', {bubbles:true}));
    }
  }

  function indent(reverse) {
    const text = source.value, start = source.selectionStart, end = source.selectionEnd;
    const direction = source.selectionDirection;
    const first = start ? text.lastIndexOf('\n', start - 1) + 1 : 0;
    if (start === end && !reverse) {
      const col = Array.from(text.slice(first, start)).reduce((n,c) => c === '\t' ? n + tabSize - n % tabSize : n+1, 0);
      replace(start, end, ' '.repeat(tabSize - col % tabSize));
      return;
    }
    const lastIncluded = end > start && text[end-1] === '\n' ? end-1 : end;
    const eol = text.indexOf('\n', lastIncluded);
    const last = eol < 0 ? text.length : eol;
    const lines = text.slice(first, last).split('\n');
    let at = first, startShift = 0, endShift = 0;
    const mapped = lines.map(line => {
      const removed = reverse ? (line.match(/^(?:\t| {1,4})/) || [''])[0].length : 0;
      const change = reverse ? -removed : tabSize;
      const offset = pos => reverse ? -Math.min(removed, Math.max(0, pos-at)) : (pos >= at ? change : 0);
      startShift += offset(start); endShift += offset(end);
      at += line.length + 1;
      return reverse ? line.slice(removed) : ' '.repeat(tabSize) + line;
    }).join('\n');
    if (mapped === text.slice(first,last)) return;
    replace(first, last, mapped);
    source.setSelectionRange(start+startShift, end+endShift, direction);
  }

  function hide() {
    clearTimeout(timer); request++; context = null; all = []; shown = []; box.hidden = true;
    source.removeAttribute('aria-activedescendant');
  }

  function locate() {
    if (source.selectionStart !== source.selectionEnd) return null;
    const pos = source.selectionStart;
    const m = /(?:\.|->)([a-zA-Z_0-9]*)$/.exec(source.value.slice(0,pos));
    if (!m) return null;
    return {start:pos-m[1].length, pos, prefix:m[1]};
  }

  function position(at) {
    const style=getComputedStyle(source), rect=source.getBoundingClientRect();
    const before=source.value.slice(0,at).split('\n');
    const canvas=document.createElement('canvas'), c=canvas.getContext('2d');
    c.font=style.fontSize+' '+style.fontFamily;
    const x=rect.left+parseFloat(style.paddingLeft)+c.measureText(before.at(-1).replace(/\t/g,'    ')).width-source.scrollLeft;
    const y=rect.top+parseFloat(style.paddingTop)+before.length*parseFloat(style.lineHeight)-source.scrollTop;
    box.style.left=Math.max(4,Math.min(x, innerWidth-box.offsetWidth-5))+'px';
    box.style.top=(y+box.offsetHeight+4>innerHeight?Math.max(4,y-box.offsetHeight-parseFloat(style.lineHeight)):Math.max(4,y))+'px';
  }

  function paint() {
    const loc=locate(); if (!loc) return hide();
    shown=all.filter(item=>item.name.startsWith(loc.prefix)); selected=0;
    box.replaceChildren(); box.hidden=!shown.length;
    if (box.hidden) return;
    for (const [i,item] of shown.entries()) {
      const row=document.createElement('div'), name=document.createElement('span'), signature=document.createElement('small');
      row.setAttribute('role','option'); row.id='member-'+i; row.dataset.index=i;
      row.setAttribute('aria-selected',String(i===0)); name.textContent=item.name;
      signature.textContent=item.detail; row.title=item.detail; row.append(name,signature); box.append(row);
    }
    source.setAttribute('aria-activedescendant','member-0'); position(loc.start);
  }
  function accept(i) {
    const loc=locate(), item=shown[i]; if (!loc || !item) return hide();
    const tail=source.value.slice(loc.pos), word=(tail.match(/^\w*/)||[''])[0];
    const suffix=tail.slice(word.length);
    const add=item.call && !/^\s*\(/.test(suffix);
    hide(); replace(loc.start,loc.pos+word.length,item.name+(add?'()':''));
    if (add && item.args) source.setSelectionRange(loc.start+item.name.length+1,loc.start+item.name.length+1);
  }
  function refresh() {
    const loc=locate(); if (!loc || document.activeElement!==source) return hide();
    const base=source.value.slice(0,loc.start), tail=source.value.slice(loc.pos);
    if (context && context.base===base && context.tail===tail) {paint();return;}
    hide(); context={base,tail}; const id=request;
    const chunks=base.split('\n'), line=chunks.length;
    const col=new TextEncoder().encode(chunks.at(-1)).length+1;
    timer=setTimeout(async()=>{
      try {
        const result=await window.desktop.complete(source.value,line,col);
        if (id!==request || !locate()) return;
        all=result; paint();
      } catch {if(id===request)hide();}
    },90);
  }
  box.addEventListener('mousedown',e=>{
    const row=e.target.closest('[role=option]'); if(row){e.preventDefault();accept(+row.dataset.index);}
  });
  source.addEventListener('input',refresh);
  source.addEventListener('scroll',()=>{if(!box.hidden && locate())position(locate().start);});
  source.addEventListener('blur',hide);
  source.addEventListener('pointerdown',hide);
  window.addEventListener('documentchanged',hide);
  window.addEventListener('resize',hide);
  source.addEventListener('keydown',e=>{
    if(e.isComposing || e.altKey || e.metaKey)return;
    if(e.key===' ' && e.ctrlKey){e.preventDefault();refresh();return;}
    if(e.ctrlKey)return;
    if(!box.hidden && source.selectionStart===source.selectionEnd && !e.shiftKey){
      if(['ArrowDown','ArrowUp'].includes(e.key)){
        e.preventDefault();const old=box.children[selected];old.setAttribute('aria-selected','false');
        selected=(selected+(e.key==='ArrowDown'?1:-1)+shown.length)%shown.length;
        const row=box.children[selected];row.setAttribute('aria-selected','true');row.scrollIntoView({block:'nearest'});source.setAttribute('aria-activedescendant',row.id);return;
      }
      if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();accept(selected);return;}
    }
    if(e.key==='Tab'){e.preventDefault();hide();indent(e.shiftKey);return;}
    if(['Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))hide();
  });
})();
