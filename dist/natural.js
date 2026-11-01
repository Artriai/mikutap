/* Formant-preserving, pitch-synchronous syllable stretching. Sustains the high-energy
 * open vowel nucleus steadily while reserving nasal/diphthong codas for note release.
 * Cycle-correlated pitch marks prevent phase drift; pitch and time stay independent. */
import {estimatePeriod} from './synthesis.js';
const analyses=new WeakMap(),transitionAnalyses=new WeakMap();
function read(x,t){
 const n=x.length,i=Math.floor(t),f=t-i;
 if(f===0)return x[i]??0;
 const p0=x[Math.max(0,Math.min(n-1,i-1))]??0,p1=x[Math.max(0,Math.min(n-1,i))]??0;
 const p2=x[Math.max(0,Math.min(n-1,i+1))]??0,p3=x[Math.max(0,Math.min(n-1,i+2))]??0;
 return p1+.5*f*(p2-p0+f*(2*p0-5*p1+4*p2-p3+f*(3*(p1-p2)+p3-p0)));
}
function localRms(x,center,half){
 const a=Math.max(0,center-half),b=Math.min(x.length,center+half);
 if(b<=a)return 0;
 let sum=0;for(let i=a;i<b;i++)sum+=x[i]*x[i];
 return Math.sqrt(sum/(b-a));
}
function analyze(buffer,baseMidi,profile){
 if(analyses.has(buffer))return analyses.get(buffer);
 const x=buffer.getChannelData(0),sr=buffer.sampleRate;
 const {period}=estimatePeriod(x,sr,baseMidi);
 const hop=Math.max(1,Math.round(sr*.004)),energy=[];let peak=0;
 for(let i=0;i<x.length;i+=hop){let power=0;const stop=Math.min(x.length,i+hop);for(let j=i;j<stop;j++)power+=x[j]*x[j];const rms=Math.sqrt(power/Math.max(1,stop-i));energy.push(rms);peak=Math.max(peak,rms)}
 let last=energy.length-1;while(last>0&&energy[last]<peak*.06)last--;
 const onset=Math.max(0,profile.onset??0)*sr,end=Math.min(x.length,(last+1)*hop);
 const voiced=Math.min(Math.max(onset,end-period*3),Math.max(onset+period,(profile.voicedAt??0)*sr));
 const marks=[];
 let first=Math.max(Math.round(period),Math.round(voiced)),firstVal=-Infinity;
 const searchEnd=Math.min(x.length-1,Math.round(first+period));
 for(let i=Math.max(0,Math.round(first-period*.25));i<=searchEnd;i++)if(x[i]>firstVal){firstVal=x[i];first=i}
 if(first<end-period)marks.push(first);
 let localP=period;
 const minP=Math.max(8,period*.76),maxP=period*1.32,halfW=Math.max(4,Math.round(period*.42));
 while(marks.length){
  const prev=marks.at(-1);
  if(prev+localP>=end-period*.75)break;
  const lo=Math.max(Math.round(minP),Math.round(localP*.85)),hi=Math.min(Math.round(maxP),Math.round(localP*1.17));
  let bestLag=Math.round(localP),bestCorr=-Infinity;
  for(let lag=lo;lag<=hi;lag+=2){
   if(prev+lag+halfW>=x.length)break;
   let dot=0,aa=0,bb=0;
   for(let k=-halfW;k<=halfW;k+=2){const u=x[prev+k]??0,v=x[prev+lag+k]??0;dot+=u*v;aa+=u*u;bb+=v*v}
   const corr=dot/Math.sqrt(aa*bb+1e-18);
   if(corr>bestCorr){bestCorr=corr;bestLag=lag}
  }
  for(const delta of [-1,1]){
   const lag=bestLag+delta;
   if(lag<lo||lag>hi||prev+lag+halfW>=x.length)continue;
   let dot=0,aa=0,bb=0;
   for(let k=-halfW;k<=halfW;k+=2){const u=x[prev+k]??0,v=x[prev+lag+k]??0;dot+=u*v;aa+=u*u;bb+=v*v}
   const corr=dot/Math.sqrt(aa*bb+1e-18);
   if(corr>bestCorr){bestCorr=corr;bestLag=lag}
  }
  let next=prev+bestLag;
  const snap=Math.max(2,Math.round(localP*(bestCorr>.55?.08:.22)));
  let peakIdx=next,peakVal=-Infinity;
  for(let i=Math.max(prev+Math.round(minP*.7),next-snap);i<=Math.min(x.length-1,next+snap);i++)if(x[i]>peakVal){peakVal=x[i];peakIdx=i}
  next=peakIdx;
  if(next<=prev)break;
  marks.push(next);
  localP=Math.max(minP,Math.min(maxP,localP*.75+(next-prev)*.25));
 }
 const markRms=marks.map(m=>localRms(x,m,Math.round(period)));
 const maxRms=markRms.length?Math.max(...markRms):peak;
 let nucStart=0,nucEnd=Math.max(0,marks.length-1);
 if(marks.length>=8&&maxRms>1e-5){
  while(nucStart<marks.length-6&&markRms[nucStart]<maxRms*.38)nucStart++;
  nucStart=Math.min(nucStart,Math.floor(marks.length*.28));
  while(nucEnd>nucStart+5&&markRms[nucEnd]<maxRms*.46)nucEnd--;
 }
 const nucSlice=markRms.slice(nucStart,nucEnd+1).filter(v=>v>1e-5).sort((a,b)=>a-b);
 const targetRms=nucSlice.length?nucSlice[Math.min(nucSlice.length-1,Math.floor(nucSlice.length*.72))]:maxRms;
 const result={x,sr,period,onset,voiced:Math.max(onset,voiced),end,marks,markRms,nucStart,nucEnd,targetRms};
 analyses.set(buffer,result);return result;
}
function analyzeTransition(buffer,baseMidi=60){
 if(transitionAnalyses.has(buffer))return transitionAnalyses.get(buffer);
 const x=buffer.getChannelData(0),sr=buffer.sampleRate;
 const period=sr/(440*2**((baseMidi-69)/12));
 const hop=Math.max(1,Math.round(sr*.003)),half=Math.max(8,Math.round(period*.6));
 const loLag=Math.max(8,Math.round(period*.82)),hiLag=Math.round(period*1.2);
 const voicedFrames=new Uint8Array(Math.ceil(x.length/hop));
 for(let f=0;f<voicedFrames.length;f++){
  const c=f*hop,a=Math.max(1,c-half),b=Math.min(x.length,c+half);
  let zc=0,power=0;
  for(let i=a;i<b;i++){if((x[i]>=0)!==(x[i-1]>=0))zc++;power+=x[i]*x[i]}
  const count=Math.max(1,b-a),zcr=zc/count,rms=Math.sqrt(power/count);
  if(rms<1e-4||zcr>=.22){voicedFrames[f]=0;continue}
  let bestCorr=-1;
  for(let lag=loLag;lag<=hiLag;lag+=3){
   let dot=0,aa=0,bb=0;
   for(let i=Math.max(0,c-half);i<Math.min(x.length-lag,c+half);i+=2){const u=x[i],v=x[i+lag];dot+=u*v;aa+=u*u;bb+=v*v}
   const corr=dot/Math.sqrt(aa*bb+1e-18);
   if(corr>bestCorr)bestCorr=corr;
  }
  voicedFrames[f]=bestCorr>.38?1:0;
 }
 // Place pitch marks across voiced spans, re-anchoring cleanly after unvoiced consonants.
 const marks=[],pRound=Math.round(period),halfW=Math.max(4,Math.round(period*.42));
 let cursor=Math.round(period*.5);
 while(cursor<x.length-pRound){
  const f=Math.min(voicedFrames.length-1,Math.floor(cursor/hop));
  if(!voicedFrames[f]){cursor+=hop;continue}
  let peakIdx=cursor,peakVal=-Infinity;
  for(let i=Math.max(0,cursor-Math.round(period*.45));i<=Math.min(x.length-1,cursor+Math.round(period*.55));i++)if(x[i]>peakVal){peakVal=x[i];peakIdx=i}
  marks.push(peakIdx);
  let prev=peakIdx;
  while(prev+pRound<x.length-Math.round(period*.5)){
   const nf=Math.min(voicedFrames.length-1,Math.floor((prev+pRound)/hop));
   if(!voicedFrames[nf])break;
   let bestLag=pRound,bestCorr=-Infinity;
   for(let lag=loLag;lag<=hiLag;lag+=2){
    if(prev+lag+halfW>=x.length)break;
    let dot=0,aa=0,bb=0;
    for(let k=-halfW;k<=halfW;k+=2){const u=x[prev+k]??0,v=x[prev+lag+k]??0;dot+=u*v;aa+=u*u;bb+=v*v}
    const corr=dot/Math.sqrt(aa*bb+1e-18);
    if(corr>bestCorr){bestCorr=corr;bestLag=lag}
   }
   let next=prev+bestLag,snap=Math.max(2,Math.round(period*.12)),pIdx=next,pVal=-Infinity;
   for(let i=Math.max(prev+loLag,next-snap);i<=Math.min(x.length-1,next+snap);i++)if(x[i]>pVal){pVal=x[i];pIdx=i}
   if(pIdx<=prev)break;
   marks.push(pIdx);prev=pIdx;
  }
  cursor=prev+pRound;
 }
 const info={x,sr,period,hop,voicedFrames,marks};
 transitionAnalyses.set(buffer,info);return info;
}
function renderTransition(buffer,{offset=0,duration,baseMidi=60,pitches=[{time:0,midi:60}]}){
 const {x,sr,period,hop,voicedFrames,marks}=analyzeTransition(buffer,baseMidi);
 const size=Math.max(1,Math.round(duration*sr)),psola=new Float32Array(size),weights=new Float32Array(size),out=new Float32Array(size);
 let markIndex=0,pitchIndex=0;
 for(let center=0;center<size;){
  const t=center/sr,srcPos=(t+offset)*sr;
  const f=Math.max(0,Math.min(voicedFrames.length-1,Math.floor(srcPos/hop)));
  while(pitchIndex+1<pitches.length&&pitches[pitchIndex+1].time<=t)pitchIndex++;
  const a=pitches[pitchIndex],b=pitches[pitchIndex+1],mix=b?Math.min(1,Math.max(0,(t-a.time)/(b.time-a.time))):0;
  const midi=a.midi+(b?b.midi-a.midi:0)*mix,step=sr/(440*2**((midi-69)/12));
  if(voicedFrames[f]&&marks.length){
   while(markIndex+1<marks.length&&marks[markIndex+1]<=srcPos)markIndex++;
   while(markIndex>0&&marks[markIndex]>srcPos)markIndex--;
   if(markIndex+1<marks.length&&Math.abs(marks[markIndex+1]-srcPos)<Math.abs(marks[markIndex]-srcPos))markIndex++;
   const source=marks[markIndex];
   if(Math.abs(source-srcPos)<period*1.6){
    const spanW=Math.ceil(period);
    for(let j=-spanW;j<=spanW;j++){
     const dest=Math.round(center+j);if(dest<0||dest>=size||Math.abs(j)>period)continue;
     const w=.5+.5*Math.cos(Math.PI*j/period);
     psola[dest]+=read(x,source+j)*w;weights[dest]+=w;
    }
   }
  }
  center+=step;
 }
 // Crisp 2.5 ms linear gate between pitch-shifted voiced spans and native-speed unvoiced consonants.
 let gate=voicedFrames[Math.min(voicedFrames.length-1,Math.floor(offset*sr/hop))]?1:0;
 const stepGate=1/Math.max(1,Math.round(sr*.0025));
 for(let i=0;i<size;i++){
  const srcPos=i+offset*sr;
  const target=voicedFrames[Math.max(0,Math.min(voicedFrames.length-1,Math.floor(srcPos/hop)))]&&weights[i]>1e-4?1:0;
  gate=target>gate?Math.min(1,gate+stepGate):Math.max(0,gate-stepGate);
  const raw=read(x,srcPos),pitched=weights[i]>1e-4?psola[i]/weights[i]:raw;
  out[i]=gate>.999?pitched:gate<.001?raw:raw*(1-gate)+pitched*gate;
 }
 return {samples:out,sampleRate:sr};
}
function renderSyllable(buffer,{duration,baseMidi=60,pitches=[{time:0,midi:60}],profile={},trimCoda=false,skipAttack=false,openEdges=false}){
 if(!Number.isFinite(duration)||duration<=0||duration>60)throw Error('无效的演唱时长');
 const {x,sr,period,onset,voiced,end,marks,markRms,nucStart,nucEnd,targetRms}=analyze(buffer,baseMidi,profile);
 const size=Math.round(duration*sr),out=new Float32Array(size),weights=new Float32Array(size);
 const bodyStart=marks[nucStart]??Math.max(voiced,marks[0]??voiced);
 const rawBodyEnd=marks[nucEnd]??Math.max(bodyStart+1,end-.035*sr);
 const bodyEnd=Math.max(bodyStart+Math.min(period*4,Math.max(1,end-bodyStart-1)),rawBodyEnd);
 const head=skipAttack?0:Math.min(Math.max(0,bodyStart-onset)/sr,duration*.28,.105);
 const codaSec=Math.max(.032,(end-bodyEnd)/sr);
 const tail=trimCoda?0:Math.min(codaSec,duration*.22,.09);
 const middle=Math.max(1/sr,duration-head-tail);
 const span=Math.max(1,bodyEnd-bodyStart),spanSec=span/sr;
 const longSustain=marks.length>=8&&middle>spanSec*1.65&&spanSec>.045;
 function mapping(t){
  if(t<head)return onset+t/Math.max(head,1/sr)*(bodyStart-onset);
  if(!trimCoda&&t>duration-tail)return bodyEnd+(t-duration+tail)/Math.max(tail,1/sr)*Math.max(0,end-bodyEnd-1);
  const u=(t-head)/middle;
  if(!longSustain)return bodyStart+u*span;
  // Traverse into the open vowel plateau, cruise smoothly inside its steady core
  // without hitting the nasal/diphthong coda early, then hand off at bodyEnd.
  const entry=Math.min(.22,spanSec*.6/middle),exit=Math.min(.18,spanSec*.5/middle);
  const coreLo=bodyStart+span*.16,coreHi=bodyStart+span*.84;
  if(u<entry)return bodyStart+(u/entry)*(coreLo-bodyStart);
  if(u>1-exit)return coreHi+((u-(1-exit))/exit)*(bodyEnd-coreHi);
  const cruise=(u-entry)/Math.max(1e-5,1-entry-exit);
  const halfCycles=Math.max(1,Math.round((middle*(1-entry-exit))/Math.max(.09,spanSec*.72)));
  const wave=(halfCycles%2===1)?(.5-.5*Math.cos(Math.PI*halfCycles*cruise)):(.5-.5*Math.cos(Math.PI*(halfCycles+1)*cruise));
  return coreLo+wave*(coreHi-coreLo);
 }
 let markIndex=0,pitchIndex=0;
 for(let center=0;center<size;){
  const t=center/sr,wanted=mapping(t);
  if(marks.length){
   while(markIndex+1<marks.length&&marks[markIndex+1]<=wanted)markIndex++;
   while(markIndex>0&&marks[markIndex]>wanted)markIndex--;
   if(markIndex+1<marks.length&&Math.abs(marks[markIndex+1]-wanted)<Math.abs(marks[markIndex]-wanted))markIndex++;
  }
  const source=marks[markIndex]??wanted;
  const local=markIndex+1<marks.length?marks[markIndex+1]-source:markIndex>0?source-marks[markIndex-1]:period;
  const width=Math.max(period*.78,Math.min(period*1.25,local));
  let grainGain=1;
  if(targetRms>1e-4&&markRms[markIndex]>1e-4&&t>=head&&t<=duration-tail){
   const rawGain=Math.max(.74,Math.min(1.42,targetRms/markRms[markIndex]));
   const env=Math.min(1,(t-head)/.018,(duration-tail-t)/.022);
   grainGain=1+(rawGain-1)*Math.max(0,env);
  }
  const spanW=Math.ceil(width);
  for(let j=-spanW;j<=spanW;j++){
   const dest=Math.round(center+j);if(dest<0||dest>=size||Math.abs(j)>width)continue;
   const weight=.5+.5*Math.cos(Math.PI*j/width);
   out[dest]+=read(x,source+j)*grainGain*weight;weights[dest]+=weight;
  }
  while(pitchIndex+1<pitches.length&&pitches[pitchIndex+1].time<=t)pitchIndex++;
  const a=pitches[pitchIndex],b=pitches[pitchIndex+1],mix=b?Math.min(1,Math.max(0,(t-a.time)/(b.time-a.time))):0;
  const midi=a.midi+(b?b.midi-a.midi:0)*mix;
  center+=sr/(440*2**((midi-69)/12));
 }
 let peak=0;const fadeIn=Math.max(1/sr,Math.min(.012,head*.5));
 for(let i=0;i<size;i++){
  const t=i/sr,blend=Math.min(1,Math.max(0,(t-(head-fadeIn))/fadeIn));
  const hasWeight=weights[i]>1e-5;
  const rawSample=(blend<1||!hasWeight)?read(x,mapping(t)):0;
  const processed=hasWeight?out[i]/weights[i]:rawSample;
  const fade=openEdges?1:Math.max(0,Math.min(1,t/.004,(duration-t-1/sr)/Math.max(.018,Math.min(.045,tail))));
  out[i]=(blend<1?rawSample*(1-blend)+processed*blend:processed)*fade;peak=Math.max(peak,Math.abs(out[i]));
 }
 if(peak>.96)for(let i=0;i<size;i++)out[i]*=.96/peak;
 if(!openEdges){out[0]=0;out[size-1]=0}return out;
}

/* Fuse coarticulated VCV/VC transition prefix with the full steady-vowel syllable body. */
export function naturalSyllable(buffer,options){
 const {transitionBuffer,transitionMeta,transitionKind,transitionOffset=0}=options;
 if(!transitionBuffer)return renderSyllable(buffer,options);
 const sr=buffer.sampleRate,meta=transitionMeta,offset=Math.max(0,transitionOffset);
 const preLead=Math.max(0,meta.preutterance-offset);
 // Stop Mandarin VC right after consonant release (avoiding the 85 ms carrier 'a' vowel),
 // and hand Japanese VCV off right after vowel onset into the full 450 ms miku-full vowel nucleus.
 const postTail=transitionKind==='vcv'?.028:.012;
 const cross=Math.min(.022,options.duration*.24);
 const maxPrefix=Math.min(preLead+postTail,Math.max(.008,meta.duration-offset));
 const prefix=Math.min(maxPrefix,Math.max(cross,options.duration-cross));
 const prefixStart=Math.max(0,prefix-cross),bodyDuration=Math.max(2/sr,options.duration-prefixStart);
 const bodyPitches=shiftPitches(options.pitches,prefixStart);
 const body=renderSyllable(buffer,{...options,duration:bodyDuration,pitches:bodyPitches,skipAttack:true,openEdges:true});
 const trans=renderTransition(transitionBuffer,{offset,duration:prefix,baseMidi:meta.midi,pitches:options.pitches});
 const out=new Float32Array(Math.round(options.duration*sr));
 let best=0,bestCorr=-Infinity;
 const period=sr/(440*2**(((bodyPitches[0]?.midi??60)-69)/12)),width=Math.max(4,Math.round(cross*sr));
 for(let lag=0;lag<Math.min(body.length-width,Math.ceil(period));lag++){
  let dot=0,aa=0,bb=0;
  for(let i=0;i<width;i+=2){
   const a=read(trans.samples,(prefixStart+i/sr)*trans.sampleRate),b=body[i+lag]??0;
   dot+=a*b;aa+=a*a;bb+=b*b;
  }
  const corr=dot/Math.sqrt(aa*bb+1e-20);if(corr>bestCorr){bestCorr=corr;best=lag}
 }
 for(let i=0;i<out.length;i++){
  const t=i/sr,u=cross>1e-5?Math.min(1,Math.max(0,(t-prefixStart)/cross)):1;
  const a=t<prefix?(trans.sampleRate===sr?(trans.samples[i]??0):read(trans.samples,t*trans.sampleRate)):0;
  const b=t>=prefixStart?read(body,(t-prefixStart)*sr+best):0;
  const fade=Math.max(0,Math.min(1,t/.004,(options.duration-t-1/sr)/.026));
  out[i]=(t<prefixStart?a:t>=prefix?b:(a*Math.cos(u*Math.PI/2)+b*Math.sin(u*Math.PI/2)))*fade;
 }
 let peak=0;for(const value of out)peak=Math.max(peak,Math.abs(value));
 if(peak>.96)for(let i=0;i<out.length;i++)out[i]*=.96/peak;
 out[0]=0;out[out.length-1]=0;return out;
}
function shiftPitches(pitches=[{time:0,midi:60}],offset){
 let index=0;while(index+1<pitches.length&&pitches[index+1].time<=offset)index++;
 const a=pitches[index],b=pitches[index+1],u=b?Math.max(0,Math.min(1,(offset-a.time)/(b.time-a.time))):0;
 return [{time:0,midi:a.midi+(b?b.midi-a.midi:0)*u},...pitches.filter(p=>p.time>offset).map(p=>({...p,time:p.time-offset}))].filter((p,i)=>i===0||p.time>0);
}
