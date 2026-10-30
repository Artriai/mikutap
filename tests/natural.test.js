import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {naturalSyllable} from '../dist/natural.js';
import {estimatePeriod} from '../dist/synthesis.js';
import {shapePhrases} from '../dist/articulation.js';
const sr=24000;
const buffer=x=>({sampleRate:sr,getChannelData:()=>x});
function powerAt(x,hz){let a=0,b=0;for(let i=0;i<x.length;i++){a+=x[i]*Math.cos(i*2*Math.PI*hz/sr);b+=x[i]*Math.sin(i*2*Math.PI*hz/sr)}return a*a+b*b}
test('an octave lift moves F0 while retaining the source vowel resonance',()=>{
 const f0=440*2**((60-69)/12),x=Float32Array.from({length:sr*.4},(_,i)=>{
  let v=0;for(let h=1;h<=12;h++)v+=(.05+Math.exp(-(((h*f0-1050)/230)**2)))*.16*Math.sin(i*2*Math.PI*h*f0/sr);return v;
 });
 const out=naturalSyllable(buffer(x),{duration:1,baseMidi:60,pitches:[{time:0,midi:72}]}),body=out.slice(sr*.25,sr*.75);
 assert.equal(out.length,sr);assert.ok(out.every(Number.isFinite));assert.equal(out[0],0);assert.equal(out.at(-1),0);
 assert.ok(powerAt(body,f0*4)>powerAt(body,f0*8)*2,'resonance stays near 1050 Hz instead of shifting to 2100 Hz');
});
test('a sustained syllable glides continuously across pitch control points',()=>{
 const x=Float32Array.from({length:sr*.4},(_,i)=>.3*Math.sin(i*2*Math.PI*261.6256/sr));
 const out=naturalSyllable(buffer(x),{duration:1.2,pitches:[{time:0,midi:60},{time:1,midi:72}]});
 for(const [time,midi] of [[.25,63],[.5,66],[.75,69]]){
  const body=out.slice(Math.round((time-.025)*sr),Math.round((time+.025)*sr));
  const actual=sr/estimatePeriod(body,sr,midi).period,want=440*2**((midi-69)/12);
  assert.ok(Math.abs(actual-want)/want<.035,`${time}: ${actual} vs ${want}`);
 }
});
test('real rain-love syllables retain audible vowels throughout short and long notes',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url))),sandbox={window:{},Map,WeakMap,Set,Float32Array};
 vm.runInNewContext(fs.readFileSync(new URL('../dist/sample-cache.js',import.meta.url),'utf8'),sandbox);
 const cache=new sandbox.window.MikutapBankCache(catalog,()=>({}));
 for(const id of ['chuang','wai','de','qi','shi','yu','qing']){
  const bytes=fs.readFileSync(new URL('../dist/'+catalog.tianyi.phonemes[id].path,import.meta.url));let pos=12,pcm;
  while(pos+8<=bytes.length){const tag=bytes.toString('ascii',pos,pos+4),size=bytes.readUInt32LE(pos+4);pos+=8;if(tag==='fmt ')assert.equal(bytes.readUInt32LE(pos+4),sr);if(tag==='data')pcm=bytes.subarray(pos,pos+size);pos+=size+(size%2)}
  const raw=buffer(Float32Array.from({length:pcm.length/2},(_,i)=>pcm.readInt16LE(i*2)/32768));
  for(const duration of [.12,.6,1.8]){
   const out=naturalSyllable(raw,{duration,profile:cache.profile(raw),pitches:[{time:0,midi:68}]});
   assert.ok(out.every(Number.isFinite));
   for(let t=duration*.3;t<duration*.75;t+=.04){
    const frame=out.slice(Math.round(t*sr),Math.round((t+.02)*sr)),rms=Math.sqrt(frame.reduce((s,v)=>s+v*v,0)/frame.length);
    assert.ok(rms>.015,`${id} ${duration}s: no silent hole at ${t}s (${rms})`);
   }
  }
 }
});
test('natural joins close words in the same phrase and preserves phrase breaks',()=>{
 const groups=[0,.4,.9].map((time,i)=>({time,duration:.2,voice:'tianyi',phrase:i<2?0:1,baseMidi:60,pitches:[{time:0,midi:64}],index:i}));
 shapePhrases(groups,{natural:true});
 assert.ok(groups[0].startTime+groups[0].playDuration>groups[1].startTime);
 assert.ok(groups[1].startTime+groups[1].playDuration<groups[2].startTime);
});
