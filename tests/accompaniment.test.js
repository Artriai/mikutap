import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {AccompanimentCache,playAccompaniment} from '../dist/accompaniment.js';
test('instrumental cache shares a decode and retries a failed download',async()=>{
 let requests=0,decodes=0,fail=true;const buffer={duration:182.48748};
 const cache=new AccompanimentCache(async()=>{requests++;if(fail)throw Error('offline');return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}}),ctx={decodeAudioData:async()=>{decodes++;return buffer}};
 await assert.rejects(cache.load(ctx,{path:'instrumental.mp3'}));fail=false;
 const [a,b]=await Promise.all([cache.load(ctx,{path:'instrumental.mp3'}),cache.load(ctx,{path:'instrumental.mp3',gain:.2})]);
 assert.equal(requests,2);assert.equal(decodes,1);assert.equal(a.buffer,b.buffer);assert.equal(b.gain,.2);assert.equal(await cache.load(ctx,null),null);
});
function context(){return {currentTime:10,sources:[],createBufferSource(){const s={playbackRate:{setValueAtTime(){}},addEventListener(){},connect(){},disconnect(){},start(...args){this.started=args},stop(...args){(this.stops??=[]).push(args)}};this.sources.push(s);return s},createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}})}}
test('instrumental follows the same anchor, offset and cancellation as live voice',async()=>{
 const ctx=context(),voice={sampleRate:22050,length:8820,duration:.4,getChannelData:()=>Float32Array.from({length:8820},(_,i)=>.3*Math.sin(i*2*Math.PI*261.6/22050))},backing={duration:5};ctx.decodeAudioData=async()=>backing;
 const saved={setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval,fetch:globalThis.fetch};let frame,locked=false,preference=true;const events=new Map();
 globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};globalThis.requestAnimationFrame=fn=>(frame=fn,1);globalThis.cancelAnimationFrame=()=>{frame=null};globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
 globalThis.CustomEvent=class{};globalThis.document={getElementById:()=>({dataset:{}}),addEventListener:(type,fn)=>events.set(type,fn),dispatchEvent(){}};
 globalThis.window={MikutapVisual:{performance(){},lockBacktrack:value=>locked=value,getBacktrack:()=>preference,backtrack(){throw Error('Song must not change manual backtrack preference')}},MikutapVoice:{ensureReady:async()=>ctx,stopAll(){},getContext:()=>ctx,getDestination:()=>({}),getCatalog:async()=>({miku:{syllables:[{id:'a'}],phonemes:{a:{midi:60}}}}),getBank:()=> 'miku',getBuffer:async()=>voice,flash(){}}};
 try{
  await import('../dist/performance.js?accompaniment-test');const api=window.Mikutap;
  await api.play({engine:'sampler',duration:2,accompaniment:{path:'instrumental.mp3',gain:.42},notes:[{time:0,duration:1.5,syllable:'a'}]},{muteBacktrack:true});
  const [music,vocal]=ctx.sources;assert.equal(music.buffer,backing);assert.equal(vocal.buffer,voice);assert.deepEqual(music.started,[10.075,0]);assert.deepEqual(vocal.started,[10.075,0]);assert.equal(locked,true);
  ctx.currentTime=10.4;api.pause();assert.ok(ctx.sources.every(source=>source.stops.length===2));
  api.seek(.6);await api.resume();assert.equal(ctx.sources[2].buffer,backing);assert.ok(Math.abs(ctx.sources[2].started[1]-.6)<1e-9);assert.equal(ctx.sources[2].started[0],ctx.sources[3].started[0]);
  ctx.currentTime=20;frame();assert.equal(api.state,'ended');assert.equal(ctx.sources[2].stops.length,2);
  await api.resume();events.get('mikutap:manualstart')();assert.equal(api.state,'stopped');assert.equal(locked,false);assert.equal(api.owner,null);assert.equal(preference,true);assert.ok(ctx.sources.every(source=>source.stops.length>=2));
  const count=ctx.sources.length;await api.play({engine:'sampler',duration:2,accompaniment:{path:'instrumental.mp3'},notes:[{time:0,duration:1.5,syllable:'a'}]},{muteBacktrack:true,owner:'playlist',startAt:.75,paused:true});assert.equal(api.state,'paused');assert.equal(api.owner,'playlist');assert.equal(api.position,.75);assert.equal(ctx.sources.length,count,'paused singer switch must not emit a burst of audio');await api.resume();assert.equal(ctx.sources[count].started[1],.75);api.stop();
 }finally{Object.assign(globalThis,saved)}
});
test('a seek at the end never starts an empty instrumental',()=>{
 const ctx=context();assert.equal(playAccompaniment(ctx,{}, {buffer:{duration:2},gain:.42},10,2,2),null);assert.equal(ctx.sources.length,0);
});
test('initializing song audio never clicks START or enters the manual scene',async()=>{
 const code=fs.readFileSync(new URL('../dist/voice.js',import.meta.url),'utf8'),catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url)));
 let entries=0,constructs=0;const ctx={state:'running',destination:{},createGain:()=>({gain:{},connect(){}}),createDynamicsCompressor:()=>({threshold:{},ratio:{},connect(){}})};
 const chain={each(){return this},attr(){return this},text(){return this},on(){return this}};
 class Cache{prime(){return Promise.resolve()}loadOriginal(){return Promise.resolve()}}
 const sandbox={window:{MikutapBankCache:Cache},aidn:{WebAudio:class{constructor(){constructs++;this._context=ctx}}},fetch:async()=>({ok:true,json:async()=>catalog}),$:arg=>typeof arg==='function'?undefined:chain,Map,Set,Promise,console,document:{querySelector(){throw Error('Must not synthesize START click')},body:{classList:{toggle(){entries++}}},dispatchEvent(){}}};
 vm.runInNewContext(code,sandbox);const api=sandbox.window.MikutapVoice;await Promise.all([api.ensureReady(),api.ensureReady()]);assert.equal(constructs,1);assert.equal(entries,0);assert.equal(api.getContext(),ctx);
});
