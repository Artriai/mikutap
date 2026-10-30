/* Formant-preserving, pitch-synchronous syllable stretching. Unlike a short
 * sustain loop, this traverses the whole vowel once, keeping its articulation.
 * Consonants keep their original speed; pitch and time are independent. */
import {estimatePeriod} from './synthesis.js';
const analyses=new WeakMap();
const read=(x,t)=>{const i=Math.floor(t),f=t-i;return (x[i]??0)*(1-f)+(x[i+1]??0)*f};
function analyze(buffer,baseMidi,profile){
 if(analyses.has(buffer))return analyses.get(buffer);
 const x=buffer.getChannelData(0),sr=buffer.sampleRate;
 const {period}=estimatePeriod(x,sr,baseMidi);
 const hop=Math.max(1,Math.round(sr*.004)),energy=[];let peak=0;
 for(let i=0;i<x.length;i+=hop){let power=0;for(let j=i;j<Math.min(x.length,i+hop);j++)power+=x[j]*x[j];const rms=Math.sqrt(power/hop);energy.push(rms);peak=Math.max(peak,rms)}
 let last=energy.length-1;while(last>0&&energy[last]<peak*.06)last--;
 const onset=Math.max(0,profile.onset??0)*sr,end=Math.min(x.length,(last+1)*hop);
 const voiced=Math.min(end-period*3,Math.max(onset+period, (profile.voicedAt??0)*sr));
 const marks=[];let cursor=Math.max(period,voiced),radius=Math.round(period*.22);
 while(cursor<end-period){
  let mark=Math.round(cursor),value=-Infinity;
  for(let i=Math.max(0,Math.round(cursor-radius));i<=Math.min(x.length-1,Math.round(cursor+radius));i++)if(x[i]>value){value=x[i];mark=i}
  if(marks.length&&mark<=marks.at(-1))break;
  marks.push(mark);cursor=mark+period;
 }
 const result={x,sr,period,onset,voiced:Math.max(onset,voiced),end,marks};analyses.set(buffer,result);return result;
}
export function naturalSyllable(buffer,{duration,baseMidi=60,pitches=[{time:0,midi:60}],profile={}}){
 if(!Number.isFinite(duration)||duration<=0||duration>60)throw Error('无效的演唱时长');
 const {x,sr,period,onset,voiced,end,marks}=analyze(buffer,baseMidi,profile);
 const size=Math.round(duration*sr),out=new Float32Array(size),weights=new Float32Array(size);
 const head=Math.min(Math.max(0,voiced-onset)/sr,duration*.3,.11),tail=Math.min(.035,duration*.15);
 const bodyStart=Math.max(voiced,marks[0]??voiced),bodyEnd=Math.max(bodyStart+1,end-tail*sr);
 const middle=Math.max(1/sr,duration-head-tail);
 function mapping(t){
  if(t<head)return onset+t/Math.max(head,1/sr)*(bodyStart-onset);
  if(t>duration-tail)return bodyEnd+(t-duration+tail)/Math.max(tail,1/sr)*(end-bodyEnd-1);
  return bodyStart+(t-head)/middle*(bodyEnd-bodyStart);
 }
 let markIndex=0,pitchIndex=0;
 for(let center=0;center<size;){
  const t=center/sr,wanted=mapping(t);
  while(markIndex+1<marks.length&&Math.abs(marks[markIndex+1]-wanted)<Math.abs(marks[markIndex]-wanted))markIndex++;
  const source=marks[markIndex]??wanted;
  // A source-period window retains the spectral envelope when F0 changes.
  // Shrinking this window to the target period makes high notes sound metallic.
  const local=markIndex+1<marks.length?marks[markIndex+1]-source:period,width=Math.max(period*.8,Math.min(period*1.2,local));
  for(let j=-Math.ceil(width);j<=Math.ceil(width);j++){
   const dest=Math.round(center+j);if(dest<0||dest>=size||Math.abs(j)>width)continue;
   const weight=.5+.5*Math.cos(Math.PI*j/width);out[dest]+=read(x,source+j)*weight;weights[dest]+=weight;
  }
  while(pitchIndex+1<pitches.length&&pitches[pitchIndex+1].time<=t)pitchIndex++;
  const a=pitches[pitchIndex],b=pitches[pitchIndex+1],mix=b?Math.min(1,Math.max(0,(t-a.time)/(b.time-a.time))):0;
  const midi=a.midi+(b?b.midi-a.midi:0)*mix;
  center+=sr/(440*2**((midi-69)/12));
 }
 let peak=0;
 for(let i=0;i<size;i++){
  const t=i/sr,blend=Math.min(1,Math.max(0,(t-head)/.012));
  const processed=weights[i]>1e-5?out[i]/weights[i]:read(x,mapping(t));
  const fade=Math.max(0,Math.min(1,t/.004,(duration-t-1/sr)/Math.max(.018,tail)));
  out[i]=(read(x,mapping(t))*(1-blend)+processed*blend)*fade;peak=Math.max(peak,Math.abs(out[i]));
 }
 if(peak>.96)for(let i=0;i<size;i++)out[i]*=.96/peak;
 out[0]=0;out[size-1]=0;return out;
}
