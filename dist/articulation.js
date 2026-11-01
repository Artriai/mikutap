/* Align consonants before the beat and overlap adjacent vowels, while preserving
 * actual phrase rests. Multi-track lanes stay isolated; lyric/accompaniment timing stays intact. */
import {jpVcvKey,cnVcKey} from './phonology.js?v=2';
export function shapePhrases(groups,{natural=false,transitions=new Map()}={}){
 const voices=new Map();
 for(const group of groups){
  const laneKey=group.voice+':'+(group.sourceTrack??'');
  if(!voices.has(laneKey))voices.set(laneKey,[]);
  voices.get(laneKey).push(group);
 }
 for(const group of groups)for(const field of ['vcvKey','vcKey','trimCoda','skipAttack','transitionBuffer','transitionMeta','transitionKind','transitionOffset'])delete group[field];
 for(const lane of voices.values()){
  lane.sort((a,b)=>a.time-b.time||a.index-b.index);
  for(let i=0;i<lane.length;i++){
   const group=lane[i],next=lane[i+1],rate=2**((group.pitches[0].midi-group.baseMidi)/12),profile=group.profile??{onset:0,voicedAt:0};
   const lead=Math.min(group.time,.045,Math.max(0,(profile.voicedAt-profile.onset)/rate*.75));
   const gap=next?next.time-group.time-group.duration:Infinity;
   const samePhrase=group.phrase===undefined||next?.phrase===group.phrase;
   const join=gap>=-.003&&gap<=(natural?.23:.16)&&(!natural||samePhrase);
   const overlap=natural?.045:.026;
   const release=join?Math.max(0,gap)+overlap:gap>=0&&gap<=.22?.065:.025;
   group.startTime=group.time-lead;group.playDuration=group.duration+lead+release;
   group.playPitches=group.pitches.map((point,j)=>({...point,time:j?point.time+lead:0}));
   group.release=join?overlap:Math.min(.025,release);
  }
  if(natural)for(let i=1;i<lane.length;i++){
   const prev=lane[i-1],group=lane[i],gap=group.time-prev.time-prev.duration;
   if(gap<-.003||gap>.16||(prev.phrase!==undefined&&prev.phrase!==group.phrase))continue;
   const kind=group.voice==='miku'?'vcv':group.voice==='tianyi'?'vc':null;
   const key=kind==='vcv'?jpVcvKey(prev.syllable,group.syllable):kind==='vc'?cnVcKey(prev.syllable,group.syllable):null;
   if(!key)continue;group[kind+'Key']=key;
   const entry=transitions.get(group.voice+':'+key);if(!entry)continue;
   const maxLead=kind==='vcv'?.075:.095;
   const keepPrev=Math.min(prev.duration*.62,Math.max(.025,prev.duration-maxLead));
   const available=Math.max(0,group.time-prev.time-keepPrev);
   const lead=Math.min(group.time,entry.meta.preutterance,maxLead,available);
   if(lead<.012)continue;
   if(kind==='vc'&&group.duration<.075)continue;
   group.transitionBuffer=entry.buffer;group.transitionMeta=entry.meta;group.transitionKind=kind;
   group.transitionOffset=entry.meta.preutterance-lead;
   const release=group.playDuration-group.duration-(group.time-group.startTime);
   group.startTime=group.time-lead;
   group.playDuration=group.duration+lead+release;
   const prevEndMidi=prev.pitches.at(-1)?.midi??prev.pitches[0].midi;
   const shifted=group.pitches.map((point,j)=>({...point,time:j?point.time+lead:lead}));
   group.playPitches=[{time:0,midi:prevEndMidi},{time:lead*.58,midi:prevEndMidi},...shifted];
   prev.trimCoda=true;group.skipAttack=true;
   prev.playDuration=Math.max(.016,group.startTime+.028-prev.startTime);prev.release=.028;
  }
 }
 return groups.sort((a,b)=>(a.startTime??a.time)-(b.startTime??b.time)||a.index-b.index);
}
