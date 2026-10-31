import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {shapePhrases} from '../dist/articulation.js';
import {samplePlan} from '../dist/sampler.js';
const root=new URL('../dist/',import.meta.url),catalog=JSON.parse(fs.readFileSync(new URL('catalog.json',root)));
function waveBuffer(path){
 const bytes=fs.readFileSync(path);let offset=12,sr,channels,pcm;
 while(offset+8<=bytes.length){const tag=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4);offset+=8;if(tag==='fmt '){channels=bytes.readUInt16LE(offset+2);sr=bytes.readUInt32LE(offset+4);assert.equal(bytes.readUInt16LE(offset+14),16)}if(tag==='data')pcm=bytes.subarray(offset,offset+size);offset+=size+(size%2)}
 const input=Float32Array.from({length:pcm.length/channels/2},(_,i)=>pcm.readInt16LE(i*channels*2)/32768);return {length:input.length,duration:input.length/sr,sampleRate:sr,getChannelData:()=>input};
}
const sandbox={window:{},Map,WeakMap,Set,Float32Array};vm.runInNewContext(fs.readFileSync(new URL('sample-cache.js',root),'utf8'),sandbox);const cache=new sandbox.window.MikutapBankCache(catalog,()=>({}));
function energy(buffer,start,duration){const input=buffer.getChannelData(0).slice(Math.round(start*buffer.sampleRate),Math.round((start+duration)*buffer.sampleRate));return Math.sqrt(input.reduce((sum,x)=>sum+x*x,0)/input.length)}
test('a real 49 ms Miku vowel is audible instead of being spent inside leading silence',()=>{
 for(const id of ['a','i','n']){
  const buffer=waveBuffer(new URL((catalog.miku.phonemes[id].expandedPath??catalog.miku.phonemes[id].path),root)),profile=cache.profile(buffer),plan=samplePlan(buffer,{duration:.049,profile});
  assert.ok(profile.onset>.04&&profile.onset<.11,id+' trims only lead-in');assert.ok(energy(buffer,0,.049)<.01);assert.ok(energy(buffer,plan.sourceOffset,.049)>.08,id+' must contain voice within the short note');assert.equal(cache.profile(buffer),profile);
 }
 const shi=waveBuffer(new URL(catalog.miku.phonemes.shi.path,root)),fricative=cache.profile(shi);assert.ok(fricative.onset<.015,'manual clips retain the initial sh consonant');
 const quick=samplePlan(shi,{duration:.049,profile:fricative});assert.ok(quick.sourceOffset<fricative.voicedAt,'retain part of the consonant');assert.ok(fricative.voicedAt-quick.sourceOffset<=.023,'short notes must reach the vowel');
});
test('phrase shaping joins short gaps, preserves long rests and leaves score pitches/events intact',()=>{
 const groups=[{time:0,duration:.1,voice:'miku',baseMidi:60,pitches:[{time:0,midi:62}],profile:{onset:.04,voicedAt:.08},index:0},{time:.24,duration:.1,voice:'miku',baseMidi:60,pitches:[{time:0,midi:65}],profile:{onset:.01,voicedAt:.06},index:1},{time:.8,duration:.2,voice:'miku',baseMidi:60,pitches:[{time:0,midi:67}],index:2}];
 const before=groups.map(g=>({time:g.time,duration:g.duration,pitches:JSON.stringify(g.pitches)}));shapePhrases(groups);
 assert.ok(groups[0].startTime+groups[0].playDuration>groups[1].time,'vowels overlap into the next lyric');assert.ok(groups[1].startTime<groups[1].time,'consonant anticipates the vowel beat');assert.ok(groups[1].startTime+groups[1].playDuration<.4,'retain the real phrase rest');assert.ok(groups[2].startTime>=.755);
 groups.forEach((g,i)=>{assert.equal(g.time,before[i].time);assert.equal(g.duration,before[i].duration);assert.equal(JSON.stringify(g.pitches),before[i].pitches)});
});
test('phrase shaping isolates multi-track vocal lanes by sourceTrack',()=>{
 const groups=[
  {time:0,duration:.2,voice:'miku',sourceTrack:1,baseMidi:60,pitches:[{time:0,midi:64}],index:0},
  {time:.1,duration:.08,voice:'miku',sourceTrack:9,baseMidi:60,pitches:[{time:0,midi:67}],index:1},
  {time:.25,duration:.2,voice:'miku',sourceTrack:1,baseMidi:60,pitches:[{time:0,midi:65}],index:2}
 ];
 shapePhrases(groups,{natural:true});
 assert.ok(groups[0].startTime+groups[0].playDuration>groups[2].time,'Track 1 sustains across interleaved Track 9 call-and-response');
 assert.ok(groups[1].startTime+groups[1].playDuration<.24,'Track 9 call ends cleanly without bridging into Track 1');
});
test('both manual banks expose exactly the original 32 slots without limiting the program catalog',async()=>{
 const chain={each(){return this},attr(){return this},text(){return this},on(){return this}};
 const s={window:{MikutapBankCache:class{prime(){return Promise.resolve()}}},fetch:async()=>({ok:true,json:async()=>catalog}),$:arg=>typeof arg==='function'?undefined:chain,Map,Set,WeakMap,Promise,console};vm.runInNewContext(fs.readFileSync(new URL('voice.js',root),'utf8'),s);const api=s.window.MikutapVoice;await api.getCatalog();
 for(const bank of ['miku','tianyi']){assert.equal(api.getBasic()[bank].length,32);assert.ok(api.getBasic()[bank].every(id=>api.getTapRate(bank,id)===1))}
 assert.equal(catalog.miku.syllables.length,150);assert.equal(catalog.tianyi.syllables.length,409);
 const html=fs.readFileSync(new URL('index.html',root),'utf8'),source=fs.readFileSync(new URL('voice.js',root),'utf8');assert.doesNotMatch(html,/tap_surface/);assert.doesNotMatch(source,/pointerdown|setPointerCapture/);
});
