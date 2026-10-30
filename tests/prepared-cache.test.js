import test from 'node:test';
import assert from 'node:assert/strict';
import {PreparedCache} from '../dist/prepared-cache.js';
test('parallel preparations share work and changed scores invalidate cached plans',async()=>{
 const cache=new PreparedCache(),score={notes:[{midi:60}]};let builds=0,finish;const progress=[];
 const build=report=>{builds++;report({loaded:1,total:2});return new Promise(resolve=>finish=resolve)};
 const a=cache.get(score,'sampler:miku',build,p=>progress.push(p)),b=cache.get(score,'sampler:miku',build);await new Promise(setImmediate);assert.equal(builds,1);assert.equal(cache.peek(score,'sampler:miku'),null);const result={groups:[1,2]};finish(result);assert.equal(await a,result);assert.equal(await b,result);assert.equal(cache.peek(score,'sampler:miku'),result);assert.equal(progress.length,1);
 score.notes[0].midi=67;assert.equal(cache.peek(score,'sampler:miku'),null);await cache.get(score,'sampler:miku',async()=>{builds++;return {groups:[3]}});assert.equal(builds,2);
});
test('a failed preparation can be retried',async()=>{
 const cache=new PreparedCache(),score={notes:[]};await assert.rejects(cache.get(score,'sampler',async()=>{throw Error('offline')}));assert.equal(cache.peek(score,'sampler'),null);assert.equal(await cache.get(score,'sampler',async()=>42),42);
});
test('warming another singer is silent, and cached replay skips preparation entirely',async()=>{
 const interval=globalThis.setInterval,clear=globalThis.clearInterval;let bufferCalls=0;const events=[],sources=[];
 const sr=22050,data=Float32Array.from({length:8820},(_,i)=>.3*Math.sin(i*2*Math.PI*261.6256/sr)),buffers=Object.fromEntries(['miku','tianyi'].map(voice=>[voice,{voice,sampleRate:sr,length:data.length,duration:data.length/sr,getChannelData:()=>data}]));
 const ctx={currentTime:10,createBufferSource(){const source={playbackRate:{setValueAtTime(){}},addEventListener(){},connect(){},disconnect(){},start(...args){this.started=args},stop(){}};sources.push(source);return source},createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}})};
 globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 globalThis.CustomEvent=class{constructor(type,options){this.detail=options.detail}};globalThis.document={getElementById:()=>({dataset:{}}),addEventListener(){},dispatchEvent:event=>events.push(event.detail?.state)};
 globalThis.window={MikutapVisual:{lockBacktrack(){},backtrack(){},performance(){},getBacktrack:()=>true},MikutapVoice:{ensureReady:async()=>ctx,getBank:()=> 'miku',getContext:()=>ctx,getDestination:()=>({}),getCatalog:async()=>({miku:{syllables:[{id:'a'}],phonemes:{a:{midi:60}}},tianyi:{syllables:[{id:'yi'}],phonemes:{yi:{midi:60}}}}),getBuffer:async voice=>(bufferCalls++,buffers[voice]),stopAll(){},flash(){}}};
 try{
  await import('../dist/performance.js?prepared-plan-test');const api=window.Mikutap,miku={voice:'miku',engine:'sampler',notes:[{time:0,duration:1,syllable:'a'}]},tianyi={voice:'tianyi',engine:'sampler',notes:[{time:0,duration:1,syllable:'yi'}]};
  await api.play(miku,{cache:true,muteBacktrack:true,owner:'playlist'});ctx.currentTime=10.3;const at=api.position,count=sources.length;await api.prepare(tianyi);assert.equal(api.state,'playing');assert.equal(api.owner,'playlist');assert.equal(api.position,at);assert.equal(sources.length,count,'background preparation must never start sound');assert.equal(api.isPrepared(tianyi),true);
  const calls=bufferCalls;events.length=0;await api.play(tianyi,{cache:true,muteBacktrack:true,startAt:at,paused:true});assert.equal(bufferCalls,calls);assert.equal(api.state,'paused');assert.equal(api.position,at);assert.ok(!events.includes('loading'));await api.resume();assert.equal(sources.at(-1).buffer,buffers.tianyi);
  events.length=0;await api.play(miku,{cache:true,muteBacktrack:true});assert.equal(bufferCalls,calls);assert.ok(!events.includes('loading'));
  await api.play(miku,{muteBacktrack:true});assert.ok(bufferCalls>calls,'normal program play keeps its existing fresh-score behavior');api.stop();
 }finally{globalThis.setInterval=interval;globalThis.clearInterval=clear}
});
