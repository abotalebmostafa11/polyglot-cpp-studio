'use strict';
(() => {
  const photo=find('screenshot'), video=find('videoToggle'), stop=find('endVideo'), indicator=find('captureStatus');
  let mode='idle', began=0, elapsed=0, busy=false;
  function draw() {
    video.textContent=tr(mode==='idle'?'record':mode==='recording'?'pause':'resume');
    video.classList.toggle('active',mode!=='idle'); stop.hidden=mode==='idle'; stop.textContent=tr('stopSave');
    if (mode!=='idle') {
      const sec=Math.floor((elapsed+(mode==='recording'?performance.now()-began:0))/1000);
      indicator.textContent=tr(mode==='recording'?'recording':'paused')+' '+Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
    } else indicator.textContent='';
    video.disabled=stop.disabled=busy;
  }
  async function control(action) {
    if(busy)return; busy=true;draw();
    try {
      const result=await window.desktop.capture(action);
      if(!result)return;
      if(action==='start'){elapsed=0;began=performance.now();mode='recording';}
      if(action==='pause'){elapsed+=performance.now()-began;mode='paused';}
      if(action==='resume'){began=performance.now();mode='recording';}
      if(action==='stop')mode='idle';
      if(result.file)status('savedCapture',result.file);
    } catch(e) {
      if(action==='stop')mode='idle';
      status('captureError',e.message.replace(/^.*?Error: /,''),'error');
    } finally {busy=false;draw();}
  }
  photo.onclick=()=>control('screenshot');
  video.onclick=()=>control(mode==='idle'?'start':mode==='recording'?'pause':'resume');
  stop.onclick=()=>control('stop');
  window.addEventListener('localechange',draw); setInterval(draw,500); draw();
})();
