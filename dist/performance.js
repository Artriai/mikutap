import {synthesize} from './synthesis.js';
import {naturalSyllable} from './natural.js?v=2';
import {compileScore} from './score.js?v=4';
import {PreparedCache} from './prepared-cache.js';
const preparedCache=new PreparedCache();
import {readMidi} from './midi.js';
import {playSample} from './sampler.js?v=2';
import {shapePhrases} from './articulation.js?v=3';
import {AccompanimentCache,playAccompaniment} from './accompaniment.js?v=2';
const accompaniments=new AccompanimentCache();
const audio=window.MikutapVoice;
const rendered=new Map();let renderBytes=0,lastYield=0;
function nowMs(){return globalThis.performance?.now?.()??Date.now()}
let engine='psola',keepSilent=false,owner=null;
let version=0,current=null,position=0,anchor=0,next=0,state='stopped',timer=null,raf=null,handles=new Set(),flashed=new Set(),priorBacktrack=null;
function notify(){document.getElementById('view').dataset.transport=state;document.getElementById('view').dataset.playbackEngine=engine;document.dispatchEvent(new CustomEvent('mikutap:transport',{detail:{state,position:getPosition(),duration:current?.duration??0,owner}}));}
function getPosition(){return state==='playing'?Math.min(current.duration,Math.max(position,audio.getContext().currentTime-anchor)):position;}
function restoreBacktrack(release=false){if(keepSilent){if(release){window.MikutapVisual?.lockBacktrack(false);keepSilent=false;priorBacktrack=null}return}if(priorBacktrack!==null){window.MikutapVisual?.backtrack(priorBacktrack);priorBacktrack=null;}}
function cancel(){clearInterval(timer);cancelAnimationFrame(raf);timer=null;raf=null;for(const handle of handles)handle.stop();handles.clear();}
function stop(){version++;cancel();position=0;state='stopped';owner=null;flashed.clear();restoreBacktrack(true);window.MikutapVisual?.performance?.(false);notify();}
async function prepare(group,natural=false){
 const source=natural&&group.buffer?group.buffer:await audio.getBuffer(group.voice,group.syllable,group.midi,natural?{fullBank:true}:undefined);
 const meta=(await audio.getCatalog())[group.voice].phonemes[group.syllable];
 const key=JSON.stringify([natural,group.voice,group.syllable,group.baseMidi,group.playDuration??group.duration,group.playPitches??group.pitches]);
 if(rendered.has(key))return rendered.get(key);
 // Yield periodically so a long score never blocks pointer interaction or wastes 4ms per note.
 if(nowMs()-lastYield>=14){await new Promise(resolve=>setTimeout(resolve,0));lastYield=nowMs();}
 const samples=natural?naturalSyllable(source,{baseMidi:group.baseMidi,duration:group.playDuration??group.duration,pitches:group.playPitches??group.pitches,profile:group.profile}):synthesize(source.getChannelData(0),source.sampleRate,{baseMidi:audio.getSampleMeta?.(source)?.midi??meta.midi,duration:group.duration,pitches:group.pitches});
 const buffer=audio.getContext().createBuffer(1,samples.length,source.sampleRate);buffer.copyToChannel(samples,0);
 if(renderBytes+samples.byteLength>64*1024*1024){rendered.clear();renderBytes=0;}
 rendered.set(key,buffer);renderBytes+=samples.byteLength;return buffer;
}
function schedule(){
 if(state!=='playing')return;
 const ctx=audio.getContext(),now=ctx.currentTime,horizon=now+.18;
 while(next<current.groups.length){
  const group=current.groups[next],at=anchor+(group.startTime??group.time),duration=group.playDuration??group.duration;
  if(at>horizon)break;next++;
  if(at+duration<=Math.max(now,anchor+position))continue;
  const startAt=Math.max(now,at,anchor+position),offset=Math.max(0,startAt-at);
  const handle=engine==='sampler'?playSample(ctx,audio.getDestination(group.voice),group.buffer,startAt,{baseMidi:group.baseMidi,pitches:group.playPitches??group.pitches,duration,offset,velocity:group.velocity,profile:group.profile,release:group.release}):audio.playBuffer(group.buffer,startAt,{offset,velocity:group.velocity});handles.add(handle);
  handle.source.addEventListener('ended',()=>handles.delete(handle),{once:true});
 }
}
function visuals(){
 if(state!=='playing')return;
 const rawTime=audio.getContext().currentTime-anchor;
 if(rawTime<position){raf=requestAnimationFrame(visuals);return;}
 const time=getPosition();
 for(const event of current.events){
  if(event.time>time)break;
  if(!flashed.has(event.index)){flashed.add(event.index);if(event.time+event.duration>time){if(event.kind==='beat')window.MikutapVisual?.trigger(event.visual);else audio.flash(event.voice,event.syllable,event.visual);}}
 }
 if(time>=current.duration){cancel();position=current.duration;state='ended';restoreBacktrack();notify();return;}
 raf=requestAnimationFrame(visuals);
}
function begin(at){
 cancel();position=at;anchor=audio.getContext().currentTime+.075-at;next=0;flashed.clear();
 for(const event of current.events)if(event.time+event.duration<=at)flashed.add(event.index);
 if(!keepSilent&&priorBacktrack===null)priorBacktrack=window.MikutapVisual?.getBacktrack()??false;
 if(!keepSilent)window.MikutapVisual?.backtrack(false);state='playing';notify();if(current.accompaniment){const handle=playAccompaniment(audio.getContext(),audio.getDestination(),current.accompaniment,anchor+at,at,current.duration);if(handle){handles.add(handle);handle.source.addEventListener('ended',()=>handles.delete(handle),{once:true})}}schedule();timer=setInterval(schedule,25);raf=requestAnimationFrame(visuals);
}
function preparationKey(score,selectedEngine){return selectedEngine+':'+(score.voice??audio.getBank())}
async function buildPrepared(score,selectedEngine,onProgress,defaultVoice){
 const catalog=await audio.getCatalog(),prepared=compileScore(score,catalog,defaultVoice);
 prepared.accompaniment=await accompaniments.load(audio.getContext(),score.accompaniment);
 const unique=[...new Map(prepared.groups.map(group=>[group.voice+':'+group.syllable,group])).values()];let nextLoad=0,done=0;
 const bankOpts=selectedEngine==='natural'?{fullBank:true}:undefined;
 const total=unique.length+(selectedEngine==='natural'?prepared.groups.length:0);
 await Promise.all(Array.from({length:8},async()=>{while(nextLoad<unique.length){const group=unique[nextLoad++];await audio.getBuffer(group.voice,group.syllable,group.midi,bankOpts);done++;onProgress?.({loaded:done,total})}}));
 for(const group of prepared.groups){
  if(['sampler','natural'].includes(selectedEngine)){
   group.buffer=await audio.getBuffer(group.voice,group.syllable,group.midi,bankOpts);
   const phoneme=catalog[group.voice].phonemes[group.syllable];
   group.baseMidi=audio.getSampleMeta?.(group.buffer)?.midi??(selectedEngine==='natural'&&phoneme.expandedPath?60:phoneme.midi);
   group.profile=audio.getProfile?.(group.buffer);
  }
  else group.buffer=await prepare(group);
 }
 if(['sampler','natural'].includes(selectedEngine)&&score.articulation==='legato')shapePhrases(prepared.groups,{natural:selectedEngine==='natural'});
 if(selectedEngine==='natural')for(const group of prepared.groups){group.buffer=await prepare(group,true);onProgress?.({loaded:++done,total})}
 if(score.visuals)prepared.events.push(...score.visuals.map((event,i)=>({...event,index:prepared.events.length+i,kind:'beat'})));
 prepared.events.sort((a,b)=>a.time-b.time||a.index-b.index);return prepared;
}
function getPrepared(score,selectedEngine,options={}){
 const defaultVoice=audio.getBank();
 if(!options.cache)return buildPrepared(score,selectedEngine,options.onProgress,defaultVoice);
 return preparedCache.get(score,preparationKey(score,selectedEngine),report=>buildPrepared(score,selectedEngine,report,defaultVoice),options.onProgress);
}
function isPrepared(score,options={}){return !!preparedCache.peek(score,preparationKey(score,options.engine||score.engine||'psola'))}
async function preload(score,options={}){
 const selectedEngine=options.engine||score.engine||'psola';if(!['sampler','psola','natural'].includes(selectedEngine))throw Error('未知演奏方式');
 await audio.ensureReady();const data=await getPrepared(score,selectedEngine,{...options,cache:true});return {duration:data.duration,notes:data.groups.length,engine:selectedEngine};
}
async function play(score,options={}){
 stop();audio.stopAll?.();const token=version;owner=options.owner??null;engine=options.engine||score.engine||'psola';keepSilent=options.muteBacktrack===true;
 if(!['sampler','psola','natural'].includes(engine))throw Error('未知演奏方式');
 const selectedEngine=engine,preparedAlready=options.cache&&preparedCache.peek(score,preparationKey(score,selectedEngine));
 if(keepSilent)window.MikutapVisual?.lockBacktrack(true);
 window.MikutapVisual?.performance?.(true);
 if(!preparedAlready){state='loading';notify()}
 try{
  await audio.ensureReady();if(token!==version)return;
  const prepared=preparedAlready||await getPrepared(score,selectedEngine,options);if(token!==version)return;
  current=prepared;const startAt=Math.max(0,Math.min(current.duration,Number(options.startAt)||0));if(options.paused){position=startAt;state='paused';notify()}else begin(startAt);return {duration:current.duration,notes:current.groups.length,engine:selectedEngine};
 }catch(error){if(token===version){state='stopped';restoreBacktrack(true);window.MikutapVisual?.performance?.(false);notify();}throw error;}
}
function pause(){if(state!=='playing')return;position=getPosition();cancel();state='paused';restoreBacktrack();notify();}
async function resume(){if(!current||state==='loading'||state==='playing')return;const token=version;await audio.ensureReady();if(token===version)begin(state==='ended'?0:position);}
function seek(time){if(!current||state==='loading')return;time=Number(time);if(!Number.isFinite(time))throw Error('无效的跳转时间');time=Math.max(0,Math.min(current.duration,time));if(state==='playing')begin(time);else{position=time;if(state==='ended')state='paused';notify();}}
async function note(options){
 const token=version;await audio.ensureReady();const compiled=compileScore([{time:0,...options}],await audio.getCatalog(),audio.getBank());
 const group=compiled.groups[0],buffer=await prepare(group);if(token!==version)return;
 const at=audio.getContext().currentTime+.025,handle=audio.playBuffer(buffer,at,{velocity:group.velocity});
 handles.add(handle);handle.source.addEventListener('ended',()=>handles.delete(handle),{once:true});
 const visualTimer=setTimeout(()=>{if(token===version)audio.flash(group.voice,group.syllable,group.visual)},25);
 return {stop(){clearTimeout(visualTimer);handle.stop()},duration:group.duration};
}
window.Mikutap={
 ready:()=>audio.ensureReady(),prepare:preload,isPrepared,note,play,pause,resume,stop,seek,
 selectVoice:voice=>audio.choose(voice),
 get owner(){return owner},get state(){return state},get position(){return getPosition()},get duration(){return current?.duration??0},
 async catalog(){return audio.getCatalog()},
 fromMidi:readMidi
};
// Leaving the page or changing tabs must not resume half a song unexpectedly.
// Visuals follow AudioContext time; timers only fill a short scheduling window.
// Original pointer/keyboard behaviour remains separate from this transport.
 document.addEventListener('mikutap:exit',stop);
 document.addEventListener('mikutap:manualstart',stop);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
