/* Cached audio sprites for manual play; full phonemes load only when requested. */
(function(){
 'use strict';
 window.MikutapBankCache=class {
  constructor(catalog,context,fetcher){this.catalog=catalog;this.context=context;this.fetch=(url,options)=>fetcher?fetcher(url,options):fetch(url,options);this.buffers=new Map();this.files=new Map();this.jobs=new Map();this.profiles=new WeakMap();this.metadata=new WeakMap();this.originals=new Map();this.originalFiles=new Map();this.originalJobs=new Map();}
  getMeta(buffer){return this.metadata.get(buffer)}
  async getTransition(voice,key,meta){
   if(!['miku','tianyi'].includes(voice)||!meta||typeof meta.sprite!=='string'||!/^assets\/(miku-vcv|tianyi-vc)\/[\w.-]+\.(mp3|wav)$/.test(meta.sprite))throw Error('无效过渡音源');
   if(!Number.isFinite(meta.start)||meta.start<0||!Number.isFinite(meta.duration)||meta.duration<=0||meta.duration>3||!Number.isFinite(meta.midi)||meta.midi<24||meta.midi>96)throw Error('无效过渡片段');
   for(const field of ['preutterance','overlap'])if(!Number.isFinite(meta[field])||meta[field]<0||meta[field]>=meta.duration)throw Error('无效过渡时间');
   const id='transition:'+voice+':'+key+':'+JSON.stringify(meta),file='transition:'+meta.sprite;
   if(!this.buffers.has(id)){
    const job=(async()=>{
     if(!this.files.has(file)){
      const load=this.fetch(meta.sprite,{priority:'low'}).then(r=>{if(!r.ok)throw Error('过渡音源加载失败');return r.arrayBuffer()}).then(bytes=>this.context().decodeAudioData(bytes));
      this.files.set(file,load);load.catch(()=>{if(this.files.get(file)===load)this.files.delete(file)});
     }
     const decoded=await this.files.get(file),start=Math.round(meta.start*decoded.sampleRate),length=Math.round(meta.duration*decoded.sampleRate);
     if(length<1||start+length>decoded.length)throw Error('过渡音源片段不完整');
     // AudioBuffer owns its storage: copy a view of the decoded sprite once per key.
     const buffer=this.context().createBuffer(decoded.numberOfChannels,length,decoded.sampleRate);
     for(let ch=0;ch<decoded.numberOfChannels;ch++)buffer.copyToChannel(decoded.getChannelData(ch).subarray(start,start+length),ch);
     this.metadata.set(buffer,{...meta,transition:true});return buffer;
    })();
    this.buffers.set(id,job);job.catch(()=>{if(this.buffers.get(id)===job)this.buffers.delete(id)});
   }
   return this.buffers.get(id);
  }
  primeOriginal(voice){
   const bank=this.catalog[voice]?.originalBank;if(!bank)return Promise.resolve(null);
   if(!this.originalFiles.has(voice)){
    const job=this.fetch(bank.path,{priority:'low'}).then(r=>{if(!r.ok)throw Error('原版音源加载失败');return r.json()});
    this.originalFiles.set(voice,job);job.catch(()=>{if(this.originalFiles.get(voice)===job)this.originalFiles.delete(voice)});
   }
   return this.originalFiles.get(voice);
  }
  loadOriginal(voice){
   const bank=this.catalog[voice]?.originalBank;if(!bank)return Promise.resolve();
   if(!this.originalJobs.has(voice)){
    const job=(async()=>{
     const encoded=await this.primeOriginal(voice).catch(()=>null);let next=0;
     await Promise.all(Array.from({length:8},async()=>{while(next<bank.samples.length){
      const sample=bank.samples[next++];let bytes;
      if(encoded?.[sample.id+'.mp3']){const binary=atob(encoded[sample.id+'.mp3'].split(',')[1]);bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)).buffer}
      else {const response=await this.fetch(sample.path);if(!response.ok)throw Error('原版片段加载失败');bytes=await response.arrayBuffer()}
      const buffer=await this.context().decodeAudioData(bytes);this.metadata.set(buffer,{...sample,original:true});this.originals.set(voice+':'+sample.id,buffer);
      if(this.catalog[voice].phonemes[sample.syllable]?.originalId===sample.id)this.buffers.set(voice+':'+sample.syllable,Promise.resolve(buffer));
     }}));
    })();this.originalJobs.set(voice,job);job.catch(()=>{if(this.originalJobs.get(voice)===job)this.originalJobs.delete(voice)});
   }
   return this.originalJobs.get(voice);
  }
  async original(voice,slot){await this.loadOriginal(voice);const sample=this.catalog[voice]?.originalBank?.samples[slot];if(!sample)throw Error('原版音符不存在');return this.originals.get(voice+':'+sample.id)}
  profile(buffer){
   if(this.profiles.has(buffer))return this.profiles.get(buffer);
   const input=buffer.getChannelData(0),sr=buffer.sampleRate,hop=Math.max(1,Math.round(sr*.003)),energy=[];
   let max=0;for(let start=0;start<input.length;start+=hop){let sum=0;const end=Math.min(input.length,start+hop);for(let i=start;i<end;i++)sum+=input[i]*input[i];const rms=Math.sqrt(sum/(end-start));energy.push(rms);max=Math.max(max,rms)}
   const threshold=Math.max(.0015,max*.015);let first=energy.findIndex(value=>value>threshold);if(first<0)first=0;
   const onset=Math.max(0,(first*hop/sr)-.003);let voicedAt=onset;
   const baseMidi=this.getMeta(buffer)?.midi??60,lag=Math.round(sr/(440*2**((baseMidi-69)/12))),width=Math.round(sr*.025);
   for(let start=Math.round(onset*sr);start+width+lag<input.length&&start<sr*.22;start+=hop){
    let dot=0,a=0,b=0;for(let i=start;i<start+width;i++){dot+=input[i]*input[i+lag];a+=input[i]**2;b+=input[i+lag]**2}
    if(a/width>.0001&&dot/Math.sqrt(a*b+1e-20)>.72){voicedAt=start/sr;break}
   }
   const middle=input.subarray(Math.round(Math.max(onset,voicedAt)*sr),Math.max(Math.round(input.length*.85),Math.round(voicedAt*sr)+1));let sum=0;for(const value of middle)sum+=value*value;
   const rms=Math.sqrt(sum/Math.max(1,middle.length)),gain=Math.max(.75,Math.min(1.3,.28/Math.max(.01,rms)));
   const profile={onset,voicedAt,gain};this.profiles.set(buffer,profile);return profile;
  }
  prime(voice){
   if(this.files.has(voice))return this.files.get(voice);
   var sprite=this.catalog[voice].basicSprite;
   if(!sprite)return Promise.reject(Error('基础音源缺失：'+voice));
   var job=this.fetch(sprite.path,{priority:'low'}).then(function(r){if(!r.ok)throw Error('基础音源加载失败');return r.arrayBuffer()});
   this.files.set(voice,job);job.catch(()=>{if(this.files.get(voice)===job)this.files.delete(voice)});return job;
  }
  raw(voice,id){
   var key=voice+':'+id,sample=this.catalog[voice]?.phonemes[id];
   if(!sample)return Promise.reject(Error('音节不存在：'+key));
   if(!this.buffers.has(key)){
    var job=this.fetch(sample.path).then(function(r){if(!r.ok)throw Error('音频加载失败：'+key);return r.arrayBuffer()}).then(bytes=>this.context().decodeAudioData(bytes)).then(buffer=>{if(sample.originalId!==undefined)this.metadata.set(buffer,{...sample,id:sample.originalId,syllable:id,volume:sample.nativeVolume,original:true});return buffer});
    this.buffers.set(key,job);job.catch(()=>{if(this.buffers.get(key)===job)this.buffers.delete(key)});
   }
   return this.buffers.get(key);
  }
  loadBasic(voice,progress){
   if(!this.catalog[voice])return Promise.reject(Error('未知音源：'+voice));
   if(this.jobs.has(voice))return this.jobs.get(voice).then(function(){if(progress)progress(1)});
   if(progress)progress(0);
   var job=(async()=>{
    try{
     var sprite=this.catalog[voice].basicSprite,bytes=await this.prime(voice),ctx=this.context();
     var decoded=await ctx.decodeAudioData(bytes.slice(0));
     for(var [id,entry] of Object.entries(sprite.entries)){
      if(this.catalog[voice].phonemes[id].originalId!==undefined)continue;
      var start=Math.round(entry.start*decoded.sampleRate),length=Math.round(entry.duration*decoded.sampleRate);
      if(start+length>decoded.length)throw Error('基础音源片段不完整');
      var buffer=ctx.createBuffer(decoded.numberOfChannels,length,decoded.sampleRate);
      for(var ch=0;ch<decoded.numberOfChannels;ch++)buffer.copyToChannel(decoded.getChannelData(ch).subarray(start,start+length),ch);
      this.buffers.set(voice+':'+id,Promise.resolve(buffer));
     }
    }catch(error){
     // A failed sprite must not disable the instrument. Fetch only the 46 basics.
     var ids=[...new Set(this.catalog[voice].basicGrid.filter(Boolean))],next=0;
     await Promise.all(Array.from({length:6},async()=>{while(next<ids.length)await this.raw(voice,ids[next++])}));
    }
    await this.loadOriginal(voice);
    if(progress)progress(1);
   })();
   this.jobs.set(voice,job);job.catch(()=>{if(this.jobs.get(voice)===job)this.jobs.delete(voice)});return job;
  }
  rawFull(voice,id){
   var sample=this.catalog[voice]?.phonemes[id];
   if(!sample)return Promise.reject(Error('音节不存在：'+voice+':'+id));
   if(!sample.expandedPath)return this.get(voice,id);
   var key='full:'+voice+':'+id;
   if(!this.buffers.has(key)){
    var job=this.fetch(sample.expandedPath).then(function(r){if(!r.ok)throw Error('音频加载失败：'+key);return r.arrayBuffer()}).then(bytes=>this.context().decodeAudioData(bytes)).then(buffer=>{this.metadata.set(buffer,{...sample,path:sample.expandedPath,midi:60,originalId:undefined,original:false});return buffer});
    this.buffers.set(key,job);job.catch(()=>{if(this.buffers.get(key)===job)this.buffers.delete(key)});
   }
   return this.buffers.get(key);
  }
  get(voice,id,midi,options){
   var key=voice+':'+id;
   const sample=this.catalog[voice]?.phonemes[id];
   if(options?.fullBank&&sample?.expandedPath)return this.rawFull(voice,id);
   if(sample?.originalId!==undefined){
    const choices=this.catalog[voice].originalBank.samples.filter(s=>s.syllable===id),selected=Number.isFinite(midi)?choices.reduce((a,b)=>Math.abs(a.midi-midi)<=Math.abs(b.midi-midi)?a:b):choices.find(s=>s.id===sample.originalId);
    return this.loadOriginal(voice).then(()=>this.originals.get(voice+':'+selected.id));
   }
   if(this.buffers.has(key))return this.buffers.get(key);
   if(this.catalog[voice]?.basicSprite?.entries[id])return this.loadBasic(voice).then(()=>this.buffers.get(key));
   return this.raw(voice,id);
  }
 };
})();
