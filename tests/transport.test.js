import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url)));
test('transport schedules on the audio clock and handles pause, seek, resume, cancel and visuals',async()=>{
 const interval=globalThis.setInterval,clear=globalThis.clearInterval;
 const ctx={currentTime:10,createBuffer(channels,length,sampleRate){return {duration:length/sampleRate,copyToChannel(){}}}};
 const sr=22050,input=Float32Array.from({length:sr*.4},(_,i)=>.3*Math.sin(i*2*Math.PI*261.6256/sr));
 const source={sampleRate:sr,getChannelData:()=>input};
 const scheduled=[],flashes=[],handlers=new Map();let frame,fill,backtrack=true;
 const view={dataset:{}};
 globalThis.document={getElementById:()=>view,addEventListener(type,fn){handlers.set(type,fn)},dispatchEvent(){}};
 globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail}};
 globalThis.requestAnimationFrame=fn=>(frame=fn,1);globalThis.cancelAnimationFrame=()=>{frame=null};
 globalThis.setInterval=fn=>(fill=fn,1);globalThis.clearInterval=()=>{fill=null};
 globalThis.window={MikutapVisual:{backtrack:value=>backtrack=value,getBacktrack:()=>backtrack},MikutapVoice:{
  ensureReady:async()=>ctx,getContext:()=>ctx,getCatalog:async()=>catalog,getBank:()=> 'miku',getBuffer:async()=>source,
  playBuffer(buffer,at,options){const h={at,options,buffer,stopped:false,stop(){this.stopped=true},source:{addEventListener(){}}};scheduled.push(h);return h},
  flash:(...args)=>flashes.push(args),choose:async()=>{}
 }};
 try{
  await import('../dist/performance.js?transport-test');const api=window.Mikutap;
  await api.play([{time:0,duration:1,syllable:'a',midi:60},{time:1,duration:.5,syllable:'kya',midi:64}]);
  assert.equal(api.state,'playing');assert.equal(backtrack,false);assert.equal(scheduled[0].at,10.075);
  frame();assert.equal(flashes.length,0,'visual must wait for the scheduled audio start');
  ctx.currentTime=10.1;frame();assert.equal(flashes[0][1],'a');
  ctx.currentTime=10.4;api.pause();assert.equal(api.state,'paused');assert.ok(scheduled[0].stopped);assert.equal(backtrack,true);assert.ok(Math.abs(api.position-.325)<.001);
  api.seek(.6);await api.resume();assert.equal(api.state,'playing');assert.equal(api.position,.6);assert.ok(Math.abs(scheduled.at(-1).options.offset-.6)<.001,'seek into a sustained note uses a buffer offset');
  ctx.currentTime=11;fill();frame();assert.ok(flashes.some(x=>x[1]==='kya'));
  ctx.currentTime=20;frame();assert.equal(api.state,'ended');api.seek(.9);assert.equal(api.state,'paused');await api.resume();assert.equal(api.position,.9);
  api.stop();assert.equal(api.state,'stopped');assert.equal(api.position,0);assert.equal(backtrack,true);assert.ok(scheduled.every(x=>x.stopped));
  const promise=api.play([{time:0,duration:1,syllable:'a'}]);api.stop();await promise;assert.equal(api.state,'stopped','stop invalidates asynchronous preparation');
 }finally{globalThis.setInterval=interval;globalThis.clearInterval=clear;}
});
