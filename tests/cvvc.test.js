import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {cnEnding,cnInitial,cnVcKey,jpVcvKey,cnEndings,cnInitials,loadTransitions} from '../dist/phonology.js';
import {shapePhrases} from '../dist/articulation.js';
import {naturalSyllable} from '../dist/natural.js';
import {estimatePeriod} from '../dist/synthesis.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url)));
const sr=24000,f0=261.625565;
function buffer(input,rate=sr){return {length:input.length,duration:input.length/rate,sampleRate:rate,numberOfChannels:1,getChannelData:()=>input,copyToChannel:x=>input.set(x)}}
const tone=(duration=.4,phase=0)=>Float32Array.from({length:Math.round(duration*sr)},(_,i)=>.3*Math.sin(2*Math.PI*f0*i/sr+phase));
const rms=x=>Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length);
const group=(time,syllable,voice='tianyi',extra={})=>({time,syllable,voice,duration:.3,baseMidi:60,pitches:[{time:0,midi:60}],index:Math.round(time*100),...extra});
const meta={sprite:'assets/tianyi-vc/vc-a-test.mp3',start:0,duration:.18,preutterance:.095,overlap:.028,midi:60};

test('all 409 Mandarin syllables resolve into the shared 8 x 24 grid',()=>{
 assert.equal(cnEndings.length,8);assert.equal(cnInitials.length,24);
 for(const {id} of catalog.tianyi.syllables){assert.ok(cnEndings.includes(cnEnding(id)),id);assert.ok(cnInitials.includes(cnInitial(id)),id)}
 for(const [id,wanted] of Object.entries({chuang:'ng',qing:'ng',tian:'n',yun:'n',zhi:'ir',shi:'ir',zi:'ir',yi:'i',ai:'i',hui:'i',ju:'v',qu:'v',xu:'v',yu:'v','nǚ':'v','lü':'v',yue:'e',jue:'e',er:'e',ao:'u',ou:'u',wo:'u',hua:'a'}))assert.equal(cnEnding(id),wanted,id);
 assert.equal(cnInitial('zhuang'),'zh');assert.equal(cnInitial('chi'),'ch');assert.equal(cnInitial('shi'),'sh');assert.equal(cnInitial('an'),'0');assert.equal(cnVcKey('chuang','wai'),'ng_w');assert.equal(jpVcvKey('ka','shi'),'a_shi');assert.equal(jpVcvKey('n','ba'),'n_ba');
});

test('optional manifests share one lazy request and a failure can be retried',async()=>{
 let requests=0,fail=true;
 const fetcher=async()=>{requests++;if(fail)throw Error('offline');return {ok:true,json:async()=>({version:1,miku:{},tianyi:{}})}};
 await Promise.all([loadTransitions(fetcher),loadTransitions(fetcher)]);assert.equal(requests,1);
 fail=false;await Promise.all([loadTransitions(fetcher),loadTransitions(fetcher)]);assert.equal(requests,2);
 await loadTransitions(fetcher);assert.equal(requests,2);
});

test('transitions activate only after decode, within the same lane and phrase',()=>{
 const groups=[group(.4,'ba'),group(.5,'shi','tianyi',{sourceTrack:9}),group(.7,'ma'),group(1.3,'na')];
 shapePhrases(groups,{natural:true});const legacy=groups.find(g=>g.syllable==='ma').startTime;
 assert.equal(groups.find(g=>g.syllable==='ma').vcKey,'a_m');assert.ok(groups.every(g=>!g.trimCoda&&!g.skipAttack));
 const transitions=new Map([['tianyi:a_m',{buffer:buffer(tone(.18)),meta}]]);
 shapePhrases(groups,{natural:true,transitions});
 const first=groups.find(g=>g.syllable==='ba'),next=groups.find(g=>g.syllable==='ma');
 assert.equal(first.trimCoda,true);assert.equal(next.skipAttack,true);assert.ok(Math.abs(next.startTime-(next.time-.095))<1e-9);
 assert.ok(Math.abs(first.startTime+first.playDuration-next.startTime-.028)<1e-9);
 assert.equal(groups.find(g=>g.sourceTrack===9).trimCoda,undefined);assert.equal(groups.find(g=>g.syllable==='na').vcKey,undefined);
 shapePhrases(groups,{natural:true});assert.equal(next.startTime,legacy);assert.equal(next.skipAttack,undefined);
 const broken=[group(0,'ba','tianyi',{phrase:0}),group(.3,'ma','tianyi',{phrase:1})];shapePhrases(broken,{natural:true,transitions});assert.equal(broken[1].vcKey,undefined);
});

test('transition sprite decode is shared across keys, with bounds checks and retry',async()=>{
 const sandbox={window:{},Map,WeakMap,Set,Float32Array};vm.runInNewContext(fs.readFileSync(new URL('../dist/sample-cache.js',import.meta.url),'utf8'),sandbox);
 let requests=0,decodes=0,fail=true;
 const ctx={decodeAudioData:async()=>{decodes++;return buffer(tone(1))},createBuffer:(n,length,rate)=>buffer(new Float32Array(length),rate)};
 const cache=new sandbox.window.MikutapBankCache(catalog,()=>ctx,async()=>{requests++;return {ok:!fail,arrayBuffer:async()=>new ArrayBuffer(1)}});
 await assert.rejects(cache.getTransition('tianyi','a_b',meta));fail=false;
 const [a,b]=await Promise.all([cache.getTransition('tianyi','a_b',meta),cache.getTransition('tianyi','a_m',{...meta,start:.2})]);
 assert.equal(requests,2);assert.equal(decodes,1);assert.equal(a.length,sr*.18);assert.equal(b.length,sr*.18);assert.equal(await cache.getTransition('tianyi','a_b',meta),a);
 await assert.rejects(cache.getTransition('tianyi','a_n',{...meta,start:10}),/不完整/);
 await assert.rejects(cache.getTransition('tianyi','a_n',{...meta,preutterance:NaN}));
});

test('long VCV preutterance cannot swallow a preceding short note or move its vowel beat',()=>{
 const groups=[group(0,'ka','miku',{duration:.049}),group(.049,'shi','miku',{duration:.049}),group(.098,'ka','miku',{duration:.049})];
 const entries=new Map(['a_shi','i_ka'].map(key=>['miku:'+key,{buffer:buffer(tone(.4)),meta:{...meta,duration:.4,preutterance:.25}}]));
 shapePhrases(groups,{natural:true,transitions:entries});
 for(const g of groups){assert.ok(g.startTime>=0);assert.ok(g.playDuration>0);if(g.transitionMeta)assert.ok(Math.abs(g.startTime+g.transitionMeta.preutterance-g.transitionOffset-g.time)<1e-9)}
 assert.ok(groups.find(g=>g.time===0).playDuration>.015);
});

test('CVVC skips the isolated consonant and retains the unvoiced transition at original speed',()=>{
 const source=tone(.5);for(let i=0;i<sr*.065;i++)source[i]=i%2?.8:-.8;
 const vc=tone(.18);for(let i=sr*.035;i<sr*.09;i++)vc[i]=i%2?.22:-.22;
 const out=naturalSyllable(buffer(source),{duration:.7,pitches:[{time:0,midi:67}],transitionBuffer:buffer(vc),transitionMeta:meta,transitionKind:'vc',skipAttack:true,profile:{onset:0,voicedAt:.07}});
 assert.equal(out.length,sr*.7);assert.ok(out.every(Number.isFinite));assert.equal(out[0],0);assert.equal(out.at(-1),0);
 let error=0;for(let i=sr*.055;i<sr*.075;i++)error+=Math.abs(out[i]-vc[i]);assert.ok(error/(sr*.02)<.015,'fricative stays at native speed');
 let alternation=0;for(let i=sr*.22;i<sr*.4;i++)alternation+=Math.abs(out[i]-out[i-1]);assert.ok(alternation/(sr*.18)<.08,'isolated noisy consonant does not replay after transition');
});

test('opposite-phase vowels have no cancellation hole in the 28 ms internal handoff',()=>{
 const out=naturalSyllable(buffer(tone(.4,Math.PI)),{duration:.7,pitches:[{time:0,midi:60}],transitionBuffer:buffer(tone(.18)),transitionMeta:meta,transitionKind:'vc',trimCoda:true});
 for(let t=.14;t<.2;t+=.006)assert.ok(rms(out.slice(Math.round(t*sr),Math.round((t+.012)*sr)))>.1,'no phase-cancellation energy hole at '+t);
});

test('VCV uses the recorded attack and pitches the following vowel at exact output duration',()=>{
 const vcv=tone(.4);for(let i=sr*.035;i<sr*.08;i++)vcv[i]=i%2?.2:-.2;
 const out=naturalSyllable(buffer(tone()),{duration:.7,pitches:[{time:0,midi:67}],transitionBuffer:buffer(vcv),transitionMeta:{...meta,duration:.4,preutterance:.1},transitionKind:'vcv',trimCoda:true});
 assert.equal(out.length,sr*.7);assert.ok(out.every(Number.isFinite));
 let error=0;for(let i=sr*.04;i<sr*.06;i++)error+=Math.abs(out[i]-vcv[i]);assert.ok(error/(sr*.02)<.01);
 const body=out.slice(sr*.25,sr*.5),actual=sr/estimatePeriod(body,sr,67).period;assert.ok(Math.abs(actual-391.995)/391.995<.04);
});

test('natural transport warms only needed keys and seeks into the same fused note buffer',async()=>{
 const saved=Object.fromEntries(['window','document','CustomEvent','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','fetch'].map(k=>[k,globalThis[k]]));
 const scheduled=[],keys=[];let manifests=0;
 const ctx={currentTime:10,createBuffer:(n,len,rate)=>buffer(new Float32Array(len),rate)};
 globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 globalThis.CustomEvent=class{};globalThis.document={getElementById:()=>({dataset:{}}),addEventListener(){},dispatchEvent(){}};
 globalThis.fetch=async()=>{manifests++;return {ok:true,json:async()=>({version:1,tianyi:{a_m:meta},miku:{}})}};
 globalThis.window={MikutapVoice:{ensureReady:async()=>ctx,getContext:()=>ctx,getBank:()=> 'tianyi',getCatalog:async()=>catalog,getBuffer:async()=>buffer(tone()),getTransition:async(voice,key)=>(keys.push(key),buffer(tone(.18))),getProfile:()=>({onset:0,voicedAt:0}),playBuffer(buffer,at,options){const h={buffer,at,options,stop(){},source:{addEventListener(){}}};scheduled.push(h);return h}}};
 try{
  await import('../dist/performance.js?cvvc-transport-test');const api=window.Mikutap;
  const score={voice:'tianyi',engine:'natural',articulation:'legato',notes:[{time:0,duration:.3,syllable:'ba'},{time:.3,duration:.3,syllable:'ma'},{time:.6,duration:.3,syllable:'ba'},{time:.9,duration:.3,syllable:'ma'}]};
  await api.prepare(score);assert.deepEqual(keys,['a_m']);assert.equal(manifests,1);
  await api.play(score,{cache:true,paused:true});api.seek(.4);await api.resume();
  const entry=scheduled.find(h=>h.options.offset>0);assert.ok(entry);const fused=entry.buffer;
  api.pause();api.seek(.45);await api.resume();assert.equal(scheduled.findLast(h=>h.options.offset>0).buffer,fused);assert.equal(keys.length,1);api.stop();
 }finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
});
