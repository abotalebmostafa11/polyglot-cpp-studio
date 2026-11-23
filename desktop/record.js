'use strict';
const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {performance} = require('node:perf_hooks');

class Recording {
  static async start(contents, encoder, destination) {
    const frame=await contents.capturePage();
    if(frame.isEmpty())throw new Error('The editor window is unavailable.');
    const temp=path.join(path.dirname(destination),'.polyglot-'+randomUUID()+'.mp4');
    const size=frame.getSize();
    const [w,h]=size.width>=size.height?[1920,1080]:[1080,1920];
    const filters='scale='+w+':'+h+':force_original_aspect_ratio=decrease:flags=lanczos,pad='+w+':'+h+':(ow-iw)/2:(oh-ih)/2:color=0x111820,setsar=1';
    const proc=spawn(encoder,['-hide_banner','-loglevel','error','-nostdin','-f','image2pipe','-framerate','30','-vcodec','png','-i','pipe:0','-an','-vf',filters,'-c:v','libx264','-preset','veryfast','-crf','15','-pix_fmt','yuv420p','-threads','4','-movflags','+faststart','-n',temp],{windowsHide:true,stdio:['pipe','ignore','pipe']});
    const item=new Recording(contents,proc,temp,destination,frame.toPNG());
    try {
      await new Promise((ok,bad)=>{proc.once('spawn',ok);proc.once('error',bad);});
      await item.writeFrame();
    } catch(error){proc.kill();await item.closed;await fs.rm(temp,{force:true});throw error;}
    item.pump=setInterval(()=>item.tick(),12);
    return item;
  }
  constructor(contents,proc,temp,file,frame) {
    Object.assign(this,{contents,proc,temp,file,frame});
    this.active=true;this.stopping=false;this.writing=null;this.capturing=false;
    this.frames=0;this.elapsed=0;this.since=performance.now();this.lastCapture=0;this.error='';
    proc.stderr.on('data',chunk=>{this.error=(this.error+chunk).slice(-2000);});
    proc.stdin.on('error',e=>{this.error ||=e.message;});
    this.closed=new Promise(resolve=>{
      proc.once('error',e=>{this.error=e.message;resolve(-1);});
      proc.once('close',code=>{clearInterval(this.pump);resolve(code);});
    });
  }
  time(){return this.elapsed+(this.active?performance.now()-this.since:0);}
  pause(){if(this.active){this.elapsed=this.time();this.active=false;}}
  resume(){if(!this.active){this.since=performance.now();this.active=true;}}
  async writeFrame(){
    await new Promise((ok,bad)=>this.proc.stdin.write(this.frame,e=>e?bad(e):ok()));
    this.frames++;
  }
  tick(){
    if(!this.active||this.stopping||this.error)return;
    const now=performance.now();
    if(!this.capturing && now-this.lastCapture>=32){
      this.capturing=true;this.lastCapture=now;
      this.contents.capturePage().then(img=>{
        if(this.active&&!this.stopping&&!img.isEmpty())this.frame=img.toPNG();
      }).catch(()=>{}).finally(()=>{this.capturing=false;});
    }
    if(!this.writing && this.frames<Math.ceil(this.time()*0.03)){
      this.writing=this.writeFrame().catch(e=>{this.error=e.message;}).finally(()=>{this.writing=null;});
    }
  }
  async stop(){
    this.pause();this.stopping=true;clearInterval(this.pump);
    try {
      if(this.writing)await this.writing;
      if(this.error)throw new Error(this.error);
      const goal=Math.max(1,Math.ceil(this.elapsed*.03));
      while(this.frames<goal)await this.writeFrame();
      this.proc.stdin.end();
      if(await this.closed!==0)throw new Error(this.error||'The video encoder stopped.');
      await fs.rename(this.temp,this.file);
      return this.file;
    } finally {
      if(this.proc.exitCode===null && !this.proc.killed)this.proc.kill();
      await this.closed;await fs.rm(this.temp,{force:true}).catch(()=>{});
    }
  }
}
module.exports={Recording};
