/* Direct AudioBuffer sampler: the same syllables as manual tapping.
 * Pitch is a source playback rate; sustained vowels use phase-aligned loops.
 * No oscillator, pre-rendered song, or spectral voice reconstruction. */
import {estimatePeriod} from './synthesis.js';
const loops=new WeakMap();
function loopFor(buffer,baseMidi){
 if(loops.has(buffer))return loops.get(buffer);
 const input=buffer.getChannelData(0),sr=buffer.sampleRate,{period,confidence}=estimatePeriod(input,sr,baseMidi);
 let start=Math.floor(input.length*.43),end=Math.floor(start+period*8);
 function crossing(near){let best=Math.min(input.length-2,near),distance=Infinity;for(let i=Math.max(1,Math.floor(near-period*.65));i<Math.min(input.length-1,Math.ceil(near+period*.65));i++)if(input[i-1]<=0&&input[i]>0&&Math.abs(i-near)<distance){best=i;distance=Math.abs(i-near)}return best;}
 start=crossing(start);end=crossing(Math.min(input.length-period*2,start+period*8));
 const result={start:start/sr,end:end/sr,voiced:confidence>.4&&end>start+period*2};loops.set(buffer,result);return result;
}
export function samplePlan(buffer,{baseMidi=60,pitches=[{time:0,midi:60}],duration,offset=0,profile={onset:0}}={}){
 if(!Number.isFinite(duration)||duration<=0||offset<0||offset>=duration)throw Error('无效采样时长或偏移');
 const loop=loopFor(buffer,baseMidi),initialRate=2**((pitches[0].midi-baseMidi)/12);
 // A very short note still needs a vowel: shorten an overlong consonant head,
 // retaining its last portion instead of spending the entire note on noise.
 const sampleStart=Math.max(profile.onset||0,(profile.voicedAt||0)-duration*initialRate*.45);
 let consumed=0,rate=1;
 for(let i=0;i<pitches.length;i++){
  const point=pitches[i],next=pitches[i+1]?.time??duration;
  if(point.time>offset)break;
  rate=2**((point.midi-baseMidi)/12);consumed+=Math.max(0,Math.min(offset,next)-point.time)*rate;
 }
 const total=sampleStart+pitches.reduce((sum,point,i)=>sum+Math.max(0,(pitches[i+1]?.time??duration)-point.time)*2**((point.midi-baseMidi)/12),0);
 const looping=loop.voiced&&total>buffer.duration-.01;
 let sourceOffset=sampleStart+consumed;
 if(looping&&sourceOffset>=loop.end)sourceOffset=loop.start+(sourceOffset-loop.start)%(loop.end-loop.start);
 sourceOffset=Math.min(sourceOffset,Math.max(0,buffer.duration-.001));
 return {rate,sourceOffset,remaining:duration-offset,loop:looping,loopStart:loop.start,loopEnd:loop.end,rates:pitches.filter(p=>p.time>offset).map(p=>({time:p.time-offset,rate:2**((p.midi-baseMidi)/12)}))};
}
export function playSample(context,destination,buffer,at,options){
 const plan=samplePlan(buffer,options),source=context.createBufferSource(),gain=context.createGain();
 at=Math.max(context.currentTime,at);source.buffer=buffer;source.loop=plan.loop;
 if(plan.loop){source.loopStart=plan.loopStart;source.loopEnd=plan.loopEnd;}
 source.playbackRate.setValueAtTime(plan.rate,at);for(const point of plan.rates)source.playbackRate.setValueAtTime(point.rate,at+point.time);
 const end=at+plan.remaining,fade=Math.min(options.release??.008,plan.remaining/4),attack=Math.min(.004,plan.remaining/4),volume=(options.velocity??.85)*(options.profile?.gain??1);
 gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+attack);gain.gain.setValueAtTime(volume,end-fade);gain.gain.linearRampToValueAtTime(0,end);
 source.connect(gain);gain.connect(destination);source.start(at,plan.sourceOffset);source.stop(end);
 let stopped=false;const handle={source,at,duration:plan.remaining,stop(){if(stopped)return;stopped=true;try{source.stop()}catch{}}};
 source.addEventListener('ended',()=>{source.disconnect();gain.disconnect()},{once:true});return handle;
}
