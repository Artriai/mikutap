/* Align consonants before the beat and overlap adjacent vowels, while preserving
 * actual phrase rests. Score lyric events and accompaniment timing stay intact. */
export function shapePhrases(groups){
 const voices=new Map();for(const group of groups){if(!voices.has(group.voice))voices.set(group.voice,[]);voices.get(group.voice).push(group)}
 for(const lane of voices.values())for(let i=0;i<lane.length;i++){
  const group=lane[i],next=lane[i+1],rate=2**((group.pitches[0].midi-group.baseMidi)/12),profile=group.profile??{onset:0,voicedAt:0};
  const lead=Math.min(group.time,.045,Math.max(0,(profile.voicedAt-profile.onset)/rate*.75));
  const gap=next?next.time-group.time-group.duration:Infinity;
  const join=gap>=-.003&&gap<=.16;
  const release=join?Math.max(0,gap)+.026:gap>=0&&gap<=.22?.065:.025;
  group.startTime=group.time-lead;group.playDuration=group.duration+lead+release;
  group.playPitches=group.pitches.map((point,j)=>({...point,time:j?point.time+lead:0}));
  group.release=join?.026:Math.min(.025,release);
 }
 return groups.sort((a,b)=>(a.startTime??a.time)-(b.startTime??b.time)||a.index-b.index);
}
