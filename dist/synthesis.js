/* Pitch-synchronous overlap-add for short, approximately C4 voiced samples.
 * Preserves the attack and ending; stretches the voiced middle independently
 * of pitch. This is a sampler, not a neural singing synthesizer. GPL-2.0. */
export function estimatePeriod(input, sampleRate, midi=60) {
 const expected=sampleRate/(440*2**((midi-69)/12));
 const lo=Math.max(8,Math.floor(expected*.8)),hi=Math.ceil(expected*1.22);
 const start=Math.floor(input.length*.32),length=Math.min(Math.floor(sampleRate*.075),Math.floor(input.length*.35));
 let best=-Infinity,period=expected;
 for(let lag=lo;lag<=hi;lag++){
  let dot=0,a=0,b=0;
  for(let j=start;j<start+length&&j+lag<input.length;j++){dot+=input[j]*input[j+lag];a+=input[j]**2;b+=input[j+lag]**2;}
  const correlation=dot/Math.sqrt(a*b+1e-20);
  if(correlation>best){best=correlation;period=lag;}
 }
 return {period,confidence:best};
}
function read(input,position){const i=Math.floor(position),f=position-i;return (input[i]||0)*(1-f)+(input[i+1]||0)*f;}
export function synthesize(input,sampleRate,{midi=60,baseMidi=60,duration,pitches}={}) {
 if(!Number.isFinite(duration)||duration<=0||duration>60)throw Error('音符时长须在 0 到 60 秒之间');
 const size=Math.max(1,Math.round(duration*sampleRate)),out=new Float32Array(size);
 const {period,confidence}=estimatePeriod(input,sampleRate,baseMidi);
 const rawDuration=input.length/sampleRate;
 // Protect the consonant and final nasal/diphthong rather than looping the word.
 let attack=Math.min(rawDuration*.25,.09),tail=Math.min(rawDuration*.18,.065);
 for(let time=.015;time<Math.min(.16,rawDuration*.4);time+=.01){
  const start=Math.floor(time*sampleRate),lag=Math.round(period),end=Math.min(input.length-lag,start+Math.floor(sampleRate*.025));
  let dot=0,a=0,b=0;for(let j=start;j<end;j++){dot+=input[j]*input[j+lag];a+=input[j]**2;b+=input[j+lag]**2;}
  if(dot/Math.sqrt(a*b+1e-20)>.72){attack=Math.max(.018,time);break;}
 }
 const outAttack=Math.min(attack,duration*.28),outTail=Math.min(tail,duration*.22);
 const middle=Math.max(.001,duration-outAttack-outTail),sourceMiddle=Math.max(.001,rawDuration-attack-tail);
 function mapping(t){if(t<outAttack)return t*attack/Math.max(.001,outAttack);if(t>duration-outTail)return rawDuration-tail+(t-duration+outTail)*tail/Math.max(.001,outTail);return attack+(t-outAttack)/middle*sourceMiddle;}
 const marks=[];
 let cursor=Math.round(attack*sampleRate),radius=Math.floor(period*.22);
 while(cursor<input.length-period){
  let peak=cursor,amplitude=-Infinity;
  for(let k=Math.max(0,cursor-radius);k<=Math.min(input.length-1,cursor+radius);k++){if(input[k]>amplitude){amplitude=input[k];peak=k;}}
  marks.push(peak);cursor=Math.round(peak+period);
 }
 if(!marks.length)marks.push(Math.floor(input.length/2));
 const weights=new Float32Array(size);let markIndex=0;
 const segments=pitches||[{time:0,midi}];let segmentIndex=0;
 for(let center=0;center<size;){
  const t=center/sampleRate;while(segmentIndex+1<segments.length&&segments[segmentIndex+1].time<=t)segmentIndex++;
  const pitch=segments[segmentIndex].midi,targetPeriod=sampleRate/(440*2**((pitch-69)/12));
  const wanted=mapping(t)*sampleRate;
  while(markIndex+1<marks.length&&Math.abs(marks[markIndex+1]-wanted)<Math.abs(marks[markIndex]-wanted))markIndex++;
  const source=marks[markIndex],width=Math.ceil(targetPeriod<period*.9?targetPeriod*.95:period);
  for(let j=-width;j<=width;j++){
   const dest=Math.round(center+j);if(dest<0||dest>=size)continue;
   const weight=.5+.5*Math.cos(Math.PI*j/width);
   out[dest]+=read(input,source+j)*weight;weights[dest]+=weight;
  }
  center+=targetPeriod;
 }
 let peak=0;
 for(let i=0;i<size;i++){
  const t=i/sampleRate,original=read(input,mapping(t)*sampleRate);
  const voiced=Math.min(1,Math.max(0,(t-outAttack)/.012),Math.max(0,(duration-outTail-t)/.012));
  const processed=weights[i]>.00001?out[i]/weights[i]:original;
  out[i]=confidence>.25?original*(1-voiced)+processed*voiced:original;
  const fade=Math.min(1,i/(sampleRate*.004),(size-1-i)/(sampleRate*.008));out[i]*=Math.max(0,fade);
  peak=Math.max(peak,Math.abs(out[i]));
 }
 if(peak>.98)for(let i=0;i<size;i++)out[i]*=.98/peak;
 return out;
}
