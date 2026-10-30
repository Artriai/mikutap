// Mikutap Phoneme Lab, rewritten 2026-10-30. GPL-2.0; see project notices.
export function normalizeSyllable(value, bank, inventory=[]) {
 let s=value.replace(/\.[^.]+$/,'').toLowerCase().trim().normalize('NFC');
 if(bank==='miku') {
  s=s.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
  const kana=inventory.find(x=>x.label===s); if(kana)return kana.id;
  return ({si:'shi',ti:'chi',tu:'tsu',hu:'fu',sya:'sha',syu:'shu',syo:'sho',zya:'ja',zyu:'ju',zyo:'jo',cya:'cha',cyu:'chu',cyo:'cho',nn:'n'})[s]||s;
 }
 return s.replace(/u:/g,'ü').replace(/v/g,'ü').replace(/[āáǎà]/g,'a').replace(/[ēéěè]/g,'e').replace(/[īíǐì]/g,'i').replace(/[ōóǒò]/g,'o').replace(/[ūúǔù]/g,'u').replace(/[ǖǘǚǜ]/g,'ü').replace(/[1-5]$/,'');
}
export const midiName=n=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((Math.round(n)%12)+12)%12]+(Math.floor(n/12)-1);
export class AudioEngine {
 constructor(){this.buffers=new Map();this.sources=new Set();this.volume=.7;this.stopped=0;}
 async init(){
  if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=this.volume*.65;const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=10;limiter.ratio.value=8;this.master.connect(limiter);limiter.connect(this.ctx.destination);}
  await this.ctx.resume();return this.ctx;
 }
 setVolume(v){this.volume=v;if(this.master)this.master.gain.setTargetAtTime(v*.65,this.ctx.currentTime,.025);}
 async load(key,source){
  if(!this.buffers.has(key))this.buffers.set(key,(async()=>{const bytes=source instanceof Blob?await source.arrayBuffer():await fetch(source).then(r=>{if(!r.ok)throw Error('采样加载失败');return r.arrayBuffer();});return this.ctx.decodeAudioData(bytes);})().catch(e=>{this.buffers.delete(key);throw e;}));
  return this.buffers.get(key);
 }
 async play(key,source,semitones=0,when=0){
  const generation=this.stopped;await this.init();const buffer=await this.load(key,source);if(generation!==this.stopped)return;
  const s=this.ctx.createBufferSource(),g=this.ctx.createGain();s.buffer=buffer;s.playbackRate.value=2**(semitones/12);const at=Math.max(when,this.ctx.currentTime);const duration=buffer.duration/s.playbackRate.value;
  g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(1,at+.008);g.gain.setValueAtTime(1,Math.max(at+.009,at+duration-.025));g.gain.linearRampToValueAtTime(0,at+duration);s.connect(g);g.connect(this.master);this.sources.add(s);s.onended=()=>{this.sources.delete(s);s.disconnect();g.disconnect();};s.start(at);return {duration,at};
 }
 stop(){this.stopped++;for(const s of this.sources){try{s.stop();}catch{}}this.sources.clear();}
 tick(accent=false){if(!this.ctx)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.setValueAtTime(accent?110:700,t);o.frequency.exponentialRampToValueAtTime(accent?45:240,t+.07);g.gain.setValueAtTime(accent?.24:.07,t);g.gain.exponentialRampToValueAtTime(.001,t+.09);o.connect(g);g.connect(this.master);o.start();o.stop(t+.1);}
}
export function openSampleDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open('mikutap-phoneme-lab',1);request.onupgradeneeded=()=>request.result.createObjectStore('samples',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function readSamples(){const db=await openSampleDB();return new Promise((resolve,reject)=>{const tx=db.transaction('samples','readonly'),req=tx.objectStore('samples').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});}
export async function writeSamples(rows){const db=await openSampleDB();return new Promise((resolve,reject)=>{const tx=db.transaction('samples','readwrite');for(const row of rows)tx.objectStore('samples').put(row);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('保存失败'));};});}
export async function deleteBank(bank){const db=await openSampleDB();return new Promise((resolve,reject)=>{const tx=db.transaction('samples','readwrite'),store=tx.objectStore('samples'),req=store.openCursor();req.onsuccess=()=>{const c=req.result;if(c){if(c.value.bank===bank)c.delete();c.continue();}};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}

// Resolve complete-bank sounds first for syllable mode; preserve original 32-key clips.
export function resolveVoiceSample(voice, bank, syllable, index, local){
 if(local)return {source:local.blob,key:`${local.key}:${local.updated}`,midi:local.midi,method:'local import'};
 if(index===undefined&&voice.phonemes?.[syllable]){const p=voice.phonemes[syllable];return {source:p.path,key:`full:${bank}:${syllable}:${p.revision||1}`,midi:p.midi,method:p.method};}
 const clip=index!==undefined?voice.samples[index]:voice.samples.find(s=>s.syllable===syllable);
 if(clip)return {source:`assets/${bank}/${clip.id}.mp3`,key:`${bank}:${clip.id}`,midi:clip.midi,method:'original sample'};
 return null;
}
