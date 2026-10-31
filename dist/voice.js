/* Complete audio bank and invisible full-screen input. GPL-2.0. */
(function () {
 'use strict';
 var ctx, master, catalog, cache, bank='miku', switching=false, loaded=false, playing=false, selection=0;
 var bankLoads=new Map(), active=new Set(), voices=new Map();
 var readyResolve, readyReject, starting=false, engineLoad;
 var ready=new Promise(function(resolve,reject){readyResolve=resolve;readyReject=reject});
 ready.catch(function(){});
 var basic={};
 var catalogReady=fetch('catalog.json?v=9').then(function(r){if(!r.ok)throw Error('目录加载失败');return r.json()}).then(function(data){
  catalog=data;basic={miku:data.miku.originalBank.samples.map(function(s){return s.syllable}),tianyi:data.tianyi.originalBank.samples.map(function(s){return s.syllable})};
  cache=new window.MikutapBankCache(data,function(){return ctx});
  cache.prime('miku').catch(function(){});cache.primeOriginal?.('miku').catch(function(){});cache.prime('tianyi').catch(function(){});cache.primeOriginal?.('tianyi').catch(function(){});
  return data;
 });
 function status(text){$('#audio_status').text(text)}
 function render(){
  $('[data-voice]').each(function(){var selected=this.dataset.voice===bank;$(this).toggleClass('selected',selected).attr('aria-pressed',String(selected));this.disabled=false;this.setAttribute('aria-busy',String(switching&&selected))});
  $('#view').attr({'data-voice':bank,'data-count':catalog?(playing?32:catalog[bank].syllables.length):0,'data-manual-count':32});

 }
 function buildVocalImpulse(context){
  var sr=context.sampleRate||44100,seconds=.82,len=Math.max(1,Math.round(sr*seconds)),pre=Math.round(sr*.016);
  var ir=context.createBuffer(2,len,sr),seed=2463534242;
  function rand(){seed=(seed^(seed<<13))>>>0;seed=(seed^(seed>>>17))>>>0;seed=(seed^(seed<<5))>>>0;return (seed/2147483648)-1}
  for(var ch=0;ch<2;ch++){
   var data=ir.getChannelData(ch),lp=0;
   for(var i=pre;i<len;i++){
    var t=(i-pre)/(len-pre),env=Math.pow(1-t,3.4)*Math.exp(-t*2.4);
    var early=(i-pre<sr*.045&&((i-pre+ch*97)%Math.max(1,Math.round(sr*.0073))===0))?.35:0;
    lp=lp*.48+(rand()+early)*.52;
    data[i]=lp*env*.38;
   }
  }
  return ir;
 }
 function connect(context){
  ctx=context;if(!master){
   master=ctx.createGain();master.gain.value=.68;
   var limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-8;limiter.ratio.value=6;
   master.connect(limiter);
   if(typeof ctx.createConvolver==='function'&&typeof ctx.createBiquadFilter==='function'&&typeof ctx.createBuffer==='function'){
    try{
     var hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=190;
     var lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=4400;
     var verb=ctx.createConvolver();verb.buffer=buildVocalImpulse(ctx);
     var wet=ctx.createGain();wet.gain.value=.15;
     master.connect(hp);hp.connect(lp);lp.connect(verb);verb.connect(wet);wet.connect(limiter);
    }catch(e){}
   }
   limiter.connect(ctx.destination);
  }
  if(ctx.state==='suspended')ctx.resume().catch(function(){});
 }
 function bufferFor(voice,id,midi,options){return cache.get(voice,id,midi,options)}
 async function loadBank(voice,progress){
  await catalogReady;if(!catalog[voice])throw Error('未知音源：'+voice);
  if(bankLoads.has(voice)){await bankLoads.get(voice);if(progress)progress(1);return}
  var entries=catalog[voice].syllables,done=0,next=0;
  var job=Promise.all(Array.from({length:12},async function(){while(next<entries.length){await bufferFor(voice,entries[next++].id);if(progress)progress(++done/entries.length)}}));
  bankLoads.set(voice,job);try{await job}catch(e){bankLoads.delete(voice);throw e}
 }
 async function choose(next){
  await catalogReady;if(!catalog[next])throw Error('未知音源：'+next);
  if(next===bank)return;
  var token=++selection;bank=next;render();document.dispatchEvent(new CustomEvent('mikutap:voicechange',{detail:{voice:next}}));if(playing)stopAll();
  if(!ctx||!loaded){render();return}
  switching=true;render();status('正在载入'+(next==='miku'?'初音未来':'洛天依'));
  try{await cache.loadOriginal(next);if(token===selection)status('音源已切换')}finally{if(token===selection){switching=false;render()}}
 }
 function tapRate(){return 1}
 function stopAll(){active.forEach(function(handle){handle.stop()});voices.clear()}
 function playBuffer(buffer,at,options){
  options=options||{};at=Math.max(ctx.currentTime,at||0);
  var source=ctx.createBufferSource(),gain=ctx.createGain(),stopped=false;
  source.buffer=buffer;
  var original=cache.getMeta(buffer);
  if(original?.original){
   // Original WebAudio playback: no EQ, pitch change, trimming, normalization,
   // compressor or added envelope. The upstream third argument is VOLUME.
   source.playbackRate.value=1;gain.gain.value=options.volume??original.volume;
   source.connect(gain);gain.connect(ctx.destination);
   var exact={source:source,at:at,duration:buffer.duration,stop:function(){if(stopped)return;stopped=true;try{source.stop()}catch(e){}}};
   active.add(exact);source.onended=function(){active.delete(exact);source.disconnect();gain.disconnect()};source.start(at);
   return exact;
  }
  source.playbackRate.value=options.rate||1;
  var profile=cache.profile(buffer),offset=options.offset??profile.onset,duration=options.duration||((buffer.duration-offset)/source.playbackRate.value);
  duration=Math.min(duration,(buffer.duration-offset)/source.playbackRate.value);
  gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime((options.velocity??1)*profile.gain,at+Math.min(.006,duration/4));gain.gain.setValueAtTime((options.velocity??1)*profile.gain,at+Math.max(duration/2,duration-.015));gain.gain.linearRampToValueAtTime(0,at+duration);
  source.connect(gain);gain.connect(master);
  var handle={source:source,at:at,duration:duration,stop:function(){if(stopped)return;stopped=true;try{source.stop()}catch(e){}}};
  active.add(handle);source.onended=function(){active.delete(handle);source.disconnect();gain.disconnect()};source.start(at,offset,duration*source.playbackRate.value);
  return handle;
 }
 function flash(voice,id,visual,point){
  if(window.MikutapVisual)window.MikutapVisual.trigger(visual||0,point);
  $('#view').attr({'data-last-syllable':id,'data-audio-state':'playing'});

  status((voice==='miku'?'初音未来':'洛天依')+' 演奏中');
 }
 async function tap(id,visual,point){
  if(!loaded)return;var voice=bank,token=selection;
  flash(voice,id,visual,point);
  if(ctx.state==='suspended')await ctx.resume();
  var buffer=await bufferFor(voice,id);if(token!==selection||!playing)return;
  playBuffer(buffer,ctx.currentTime,{rate:tapRate(voice,id),voice:voice});
 }
 var api=window.MikutapVoice={
  load:async function(context,progress,done){try{await catalogReady;connect(context);$('#load_error').text('');await cache.loadOriginal(bank);if(progress)progress(1);loaded=true;cache.loadOriginal(bank==='miku'?'tianyi':'miku').catch(function(){});starting=false;render();if(done)done();readyResolve();status('演奏就绪')}catch(e){starting=false;readyReject(e);ready=new Promise(function(resolve,reject){readyResolve=resolve;readyReject=reject});ready.catch(function(){});throw e}},
  // Program playback unlocks shared audio without entering the manual START scene.
  ensureReady:async function(){if(!ctx)connect((new aidn.WebAudio)._context);if(ctx.state!=='running')await ctx.resume();await catalogReady;if(!loaded){if(!engineLoad)engineLoad=api.load(ctx).catch(function(error){engineLoad=null;throw error});await engineLoad}return ctx},
  setPlaying:function(value){playing=value;starting=false;document.body.classList.toggle('is-playing',value);render();if(!value){stopAll();document.dispatchEvent(new Event('mikutap:exit'))}},
  play:function(slot,delay,volume){
   if(!ctx||!loaded)return;var voice=bank,token=selection;
   if(catalog[voice].originalBank){
    cache.original(voice,slot%32).then(function(buffer){if(token!==selection||!playing)return;var meta=cache.getMeta(buffer),handle=playBuffer(buffer,ctx.currentTime+Math.max(0,delay||0),{volume:volume??meta.volume});voices.set(slot,handle);$('#view').attr({'data-last-syllable':meta.syllable,'data-audio-state':'playing','data-source':'original'})}).catch(console.error);return;
   }
   var ids=basic[voice].filter(Boolean),id=ids[slot%ids.length];bufferFor(voice,id).then(function(buffer){if(token!==selection||!playing)return;var handle=playBuffer(buffer,ctx.currentTime+Math.max(0,delay||0),{rate:tapRate(voice,id),velocity:volume?volume/1.2:1,voice:voice});voices.set(slot,handle);$('#view').attr({'data-last-syllable':id,'data-audio-state':'playing'})}).catch(console.error);
  },
  stop:function(slot){var handle=voices.get(slot);if(handle){handle.stop();voices.delete(slot)}},
  turn:function(){},stopAll:stopAll,choose:choose,getBuffer:bufferFor,loadBank:loadBank,playBuffer:playBuffer,flash:flash,
  getTransition:function(voice,key,meta){return cache.getTransition(voice,key,meta)},getSampleMeta:function(buffer){return cache.getMeta(buffer)},getProfile:function(buffer){return cache.profile(buffer)},getTapRate:tapRate,getDestination:function(){return master},getContext:function(){return ctx},getCatalog:function(){return catalogReady},getBank:function(){return bank},getBasic:function(){return basic},tap:tap
 };
 $(function(){
  $('#bt_start a').on('click.voice',function(){starting=true});
  catalogReady.then(render).catch(function(e){$('#load_error').text('目录加载失败，请刷新重试');console.error(e)});
  $('[data-voice]').on('click',function(e){e.preventDefault();e.stopPropagation();choose(this.dataset.voice).catch(function(e){status('切换失败，请重试');console.error(e)})});
  $('#bt_close,#bt_back,#bt_fs').on('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();this.click()}});
  document.addEventListener('visibilitychange',function(){if(document.hidden)stopAll()});
 });
})();
