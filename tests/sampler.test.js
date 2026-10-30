import test from 'node:test';
import assert from 'node:assert/strict';
import {samplePlan,playSample} from '../dist/sampler.js';
import {compileScore} from '../dist/score.js';
const sr=22050,data=Float32Array.from({length:sr*.4},(_,i)=>.3*Math.sin(i*2*Math.PI*261.6256/sr));
const buffer={sampleRate:sr,length:data.length,duration:data.length/sr,getChannelData:()=>data};
function context(){const sources=[];const ctx={currentTime:10,sources,createOscillator(){throw Error('No beep oscillator permitted')},createBufferSource(){const s={playbackRate:{points:[],setValueAtTime(...v){this.points.push(v)}},connect(){},disconnect(){},addEventListener(){},start(...v){this.started=v},stop(...v){(this.stops??=[]).push(v)}};sources.push(s);return s},createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}}};return ctx}
test('live sampler uses original buffer identity, MIDI rates, and exact note gate',()=>{
 const ctx=context(),handle=playSample(ctx,{},buffer,10.075,{duration:1,pitches:[{time:0,midi:60},{time:.5,midi:72}]});
 assert.equal(handle.source.buffer,buffer);assert.deepEqual(handle.source.playbackRate.points,[[1,10.075],[2,10.575]]);assert.deepEqual(handle.source.started,[10.075,0]);assert.deepEqual(handle.source.stops[0],[11.075]);assert.ok(handle.source.loop);handle.stop();handle.stop();assert.equal(handle.source.stops.length,2);
});
test('seeking into a sustained vowel resumes inside phase-aligned loop without consonant replay',()=>{
 const plan=samplePlan(buffer,{duration:2,offset:1.5,pitches:[{time:0,midi:60},{time:1,midi:72}]});assert.equal(plan.rate,2);assert.equal(plan.remaining,.5);assert.ok(plan.sourceOffset>=plan.loopStart&&plan.sourceOffset<plan.loopEnd);assert.ok(plan.sourceOffset>0);
 const start=Math.round(plan.loopStart*sr),end=Math.round(plan.loopEnd*sr);assert.ok(data[start-1]<=0&&data[start]>0);assert.ok(data[end-1]<=0&&data[end]>0);
 assert.equal(samplePlan(buffer,{duration:.1}).loop,false);
});
test('sampler transport cancels scheduled syllables and mutes the background without overwriting the manual preference',async()=>{
 const interval=globalThis.setInterval,clear=globalThis.clearInterval,ctx=context(),view={dataset:{}};let frame,backtrack=true,locked=false;
 const catalog={miku:{syllables:[{id:'a',aliases:['a']}],phonemes:{a:{midi:60}}}};
 globalThis.document={getElementById:()=>view,addEventListener(){},dispatchEvent(){}};globalThis.CustomEvent=class{};
 globalThis.requestAnimationFrame=fn=>(frame=fn,1);globalThis.cancelAnimationFrame=()=>{frame=null};globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
 globalThis.window={MikutapVisual:{lockBacktrack:v=>locked=v,backtrack:v=>{if(!locked)backtrack=v},getBacktrack:()=>backtrack},MikutapVoice:{ensureReady:async()=>ctx,getContext:()=>ctx,getDestination:()=>({}),getCatalog:async()=>catalog,getBank:()=> 'miku',getBuffer:async()=>buffer,flash(){},playBuffer(){throw Error('Must use original live buffer')}}};
 try{
  await import('../dist/performance.js?live-sampler-test');const api=window.Mikutap;
  await api.play([{time:0,duration:1,syllable:'a',midi:72},{time:.45,duration:.02,syllable:'a',midi:60}],{engine:'sampler',muteBacktrack:true});assert.equal(view.dataset.playbackEngine,'sampler');assert.equal(ctx.sources[0].buffer,buffer);assert.equal(backtrack,true);assert.equal(locked,true);
  ctx.currentTime=10.3;api.pause();assert.equal(api.state,'paused');assert.equal(backtrack,true);assert.equal(locked,true);assert.equal(ctx.sources[0].stops.length,2);
  api.seek(.5);await assert.doesNotReject(()=>api.resume(),'skip short notes ending between current clock and the seek anchor');assert.ok(ctx.sources.at(-1).started[1]>0);ctx.currentTime=12;frame();assert.equal(api.state,'ended');assert.equal(backtrack,true);
  api.stop();assert.equal(locked,false);assert.equal(backtrack,true);assert.equal(api.state,'stopped');
 }finally{globalThis.setInterval=interval;globalThis.clearInterval=clear}
});
test('explicit song tail is preserved and cannot truncate final lyric',()=>{
 const cat={miku:{syllables:[{id:'a'}],phonemes:{a:{midi:60}}}};
 assert.equal(compileScore({duration:2,notes:[{time:0,duration:1,syllable:'a'}]},cat).duration,2);
 assert.throws(()=>compileScore({duration:.5,notes:[{time:0,duration:1,syllable:'a'}]},cat));
});
