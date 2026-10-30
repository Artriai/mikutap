import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url)));
const cacheSource=fs.readFileSync(new URL('../dist/sample-cache.js',import.meta.url),'utf8');
const voiceSource=fs.readFileSync(new URL('../dist/voice.js',import.meta.url),'utf8');
test('basic sprites plus the original bank cache four shared files without requests on repeated switching',async()=>{
 const requests=[];let decodes=0;
 const ctx={async decodeAudioData(){decodes++;return {length:4000,sampleRate:100,numberOfChannels:1,getChannelData:()=>new Float32Array(4000)}},createBuffer(channels,length,sampleRate){return {length,sampleRate,copyToChannel(){}}}};
 const sandbox={window:{},Map,Set,fetch:async path=>{requests.push(path);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1),json:async()=>Object.fromEntries(catalog.miku.originalBank.samples.map(s=>[s.id+'.mp3','data:audio/mp3;base64,AA==']))}},atob};vm.runInNewContext(cacheSource,sandbox);
 const cache=new sandbox.window.MikutapBankCache(catalog,()=>ctx);
 await Promise.all([cache.prime('miku'),cache.prime('tianyi')]);
 await Promise.all([cache.loadBasic('miku'),cache.get('miku','a'),cache.get('miku','shi'),cache.loadBasic('tianyi')]);
 for(let i=0;i<20;i++)await cache.loadBasic(i%2?'miku':'tianyi');
 assert.equal(requests.length,4);assert.equal(decodes,66);assert.equal(cache.originals.size,64);assert.equal(cache.buffers.size,new Set([...catalog.miku.basicGrid.filter(Boolean),...catalog.miku.originalBank.samples.map(s=>s.syllable)]).size+46);
 assert.equal(requests.filter(path=>path.includes('assets/basic/')).length,2);assert.ok(requests.includes(catalog.miku.originalBank.path));
 assert.notEqual(await cache.original('tianyi',29),await cache.get('tianyi','a'),'manual native clips do not replace the complete program bank');
 await cache.get('tianyi','lüe');assert.equal(requests.length,5);assert.ok(requests[4].endsWith('/lüe.wav'));
});
test('every sprite contains exactly the 46 declared basics and every fragment fits the encoded audio',()=>{
 for(const [voice,data] of Object.entries(catalog)){
  const basics=new Set(data.basicGrid.filter(Boolean)),entries=data.basicSprite.entries;
  assert.equal(basics.size,46);assert.deepEqual(new Set(Object.keys(entries)),basics);
  assert.ok(fs.statSync(new URL('../dist/'+data.basicSprite.path,import.meta.url)).size<400000);
  let end=0;for(const [id,entry] of Object.entries(entries)){assert.ok(data.phonemes[id]);assert.ok(entry.start>=end);assert.ok(entry.duration>.1);end=entry.start+entry.duration;}
 }
});
test('a slow first Tianyi load never locks controls or overwrites a newer Miku selection',async()=>{
 let finish;const pending=new Promise(resolve=>finish=resolve),buttons=['miku','tianyi'].map(voice=>({dataset:{voice},disabled:false,setAttribute(){}}));
 function jquery(){return {each(fn){for(const button of buttons)fn.call(button);return this},toggleClass(){return this},attr(){return this},text(){return this},on(){return this}}}
 const chain=jquery();const ctx={state:'running',destination:{},createGain:()=>({gain:{},connect(){}}),createDynamicsCompressor:()=>({threshold:{},ratio:{},connect(){}})};
 class Cache{prime(){return Promise.resolve()}loadOriginal(voice){return voice==='tianyi'?pending:Promise.resolve()}}
 const sandbox={window:{MikutapBankCache:Cache},fetch:async()=>({ok:true,json:async()=>catalog}),$:arg=>typeof arg==='function'?undefined:chain,Map,Set,Promise,console,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},document:{body:{classList:{toggle(){}}},dispatchEvent(){}}};
 vm.runInNewContext(voiceSource,sandbox);const api=sandbox.window.MikutapVoice;
 await api.getCatalog();await api.load(ctx,null,()=>api.setPlaying(true));
 const slow=api.choose('tianyi');await new Promise(setImmediate);assert.equal(api.getBank(),'tianyi');assert.ok(buttons.every(b=>!b.disabled));
 await api.choose('miku');assert.equal(api.getBank(),'miku');finish();await slow;assert.equal(api.getBank(),'miku');
});
test('manual pointers and scripted notes route feedback through the original toggle-aware flash',()=>{
 const source=fs.readFileSync(new URL('../dist/mikutap.js',import.meta.url),'utf8');
 const tile=source.slice(source.indexOf('var s=function(n,a){this.id=n,')+6,source.indexOf(',n=function(n){',source.indexOf('var s=function(n,a){this.id=n,')));
 let flashes=0;const sandbox={U:true,TweenLite:{fromTo(){flashes++}},Power0:{},PIXI:{Graphics:class{clear(){}beginFill(){}drawRect(){}}}};
 vm.createContext(sandbox);const Tile=vm.runInContext('('+tile+')',sandbox),region=new Tile(0,{addChild(){}});
 region.play();sandbox.U=false;region.play();assert.equal(flashes,1,'FEEDBACK OFF suppresses the original rectangle flash');
 const route=/this\.visual=(function\(n,point\)\{[^}]+\});/.exec(source)[1];let hits=0,animations=0;
 sandbox.M=[region];sandbox.l=(x,y)=>{assert.equal(x,120);assert.equal(y,70);hits++;region.play()};sandbox.c=(n,a,e,silent)=>{assert.equal(silent,true);animations++};sandbox.u=-1;sandbox.U=true;
 const visual=vm.runInContext('('+route+')',sandbox);visual(0,{x:120,y:70});visual(0);assert.equal(hits,1);assert.equal(flashes,3);assert.equal(animations,2);
});
