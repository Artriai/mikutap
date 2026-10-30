import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const root=new URL('../dist/',import.meta.url),catalog=JSON.parse(fs.readFileSync(new URL('catalog.json',root))),encoded=JSON.parse(fs.readFileSync(new URL('data/main/main.json',root)));
test('all 32 original MP3s retain identical bytes and the original per-note volume table',()=>{
 const bank=catalog.miku.originalBank;assert.equal(bank.samples.length,32);assert.equal(new Set(bank.samples.map(s=>s.syllable)).size,21);
 const volumes={1:1.3,2:1.6,3:1.35,5:1.7,9:.8,17:.8,22:.9,25:.7,29:1.2};
 for(const sample of bank.samples){const bytes=fs.readFileSync(new URL(sample.path,root));assert.deepEqual(bytes,Buffer.from(encoded[sample.id+'.mp3'].split(',')[1],'base64'));assert.equal(createHash('sha256').update(bytes).digest('hex'),sample.sha256);assert.equal(sample.volume,Number(((volumes[sample.id]??1)*1.2).toFixed(4)))}
 for(const meta of Object.values(catalog.miku.phonemes))if(meta.originalId!==undefined)assert.equal(meta.path,bank.samples[meta.originalId].path);
});
test('manual original notes use native speed, full buffer, original gain, and no added audio processing',async()=>{
 const sources=[],gains=[],ctx={state:'running',currentTime:10,destination:{name:'speakers'},async decodeAudioData(bytes){return {duration:.5,sampleRate:22050,length:11025,raw:new Uint8Array(bytes),getChannelData:()=>new Float32Array(11025)}},createBuffer(channels,length,sr){return {length,sampleRate:sr,duration:length/sr,copyToChannel(){},getChannelData:()=>new Float32Array(length)}},createDynamicsCompressor(){return {threshold:{},ratio:{},connect(){}}},createGain(){const node={gain:{value:1,setValueAtTime(){throw Error('No envelope permitted on original manual clip')},linearRampToValueAtTime(){throw Error('No envelope permitted')}},connect(target){this.destination=target},disconnect(){}};gains.push(node);return node},createBufferSource(){const node={playbackRate:{value:1},connect(target){this.destination=target},disconnect(){},start(...args){this.started=args},stop(){}};sources.push(node);return node}};
 const chain={each(){return this},attr(){return this},text(){return this},on(){return this}};
 const s={window:{},Map,Set,WeakMap,Uint8Array,Promise,console,atob,$:arg=>typeof arg==='function'?undefined:chain,document:{body:{classList:{toggle(){}}},dispatchEvent(){}},fetch:async path=>({ok:true,json:async()=>path.startsWith('catalog')?catalog:encoded,arrayBuffer:async()=>new ArrayBuffer(1)})};
 vm.runInNewContext(fs.readFileSync(new URL('sample-cache.js',root),'utf8'),s);vm.runInNewContext(fs.readFileSync(new URL('voice.js',root),'utf8'),s);const api=s.window.MikutapVoice;await api.getCatalog();await api.load(ctx,null,()=>api.setPlaying(true));
 api.play(1,.05,1.56);await new Promise(setImmediate);const source=sources.at(-1),gain=gains.at(-1);assert.equal(source.playbackRate.value,1);assert.deepEqual(source.started,[10.05]);assert.equal(gain.gain.value,1.56);assert.equal(gain.destination,ctx.destination);assert.equal(source.destination,gain);assert.equal(api.getSampleMeta(source.buffer).id,1);
 assert.deepEqual(Buffer.from(source.buffer.raw),Buffer.from(encoded['1.mp3'].split(',')[1],'base64'));
 await api.tap('a',0);assert.equal(sources.at(-1).playbackRate.value,1);assert.deepEqual(sources.at(-1).started,[10]);assert.equal(gains.at(-1).destination,ctx.destination);
 const low=await api.getBuffer('miku','do',55),high=await api.getBuffer('miku','do',79);assert.notEqual(low,high);assert.ok(api.getSampleMeta(low).midi<api.getSampleMeta(high).midi,'singing chooses the closest original pitch variant');
});
