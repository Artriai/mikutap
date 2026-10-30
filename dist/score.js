import {normalizeSyllable} from './engine.js';
export function midiNumber(value){
 if(typeof value==='string'){
  const match=/^([A-Ga-g])([#♯b♭]?)(-?\d+)$/.exec(value);
  if(!match)throw Error('无效音高：'+value);
  value=({C:0,D:2,E:4,F:5,G:7,A:9,B:11})[match[1].toUpperCase()]+(Number(match[3])+1)*12+(['#','♯'].includes(match[2])?1:['b','♭'].includes(match[2])?-1:0);
 }
 if(!Number.isFinite(value)||value<24||value>96)throw Error('音高须在 C1 到 C7 之间');return value;
}
export function compileScore(input,catalog,defaultVoice='miku'){
 const score=Array.isArray(input)?{notes:input}:input;
 if(!score||!Array.isArray(score.notes)||!score.notes.length)throw Error('乐谱需要非空 notes 数组');
 const factor=score.unit==='beats'?60/(score.bpm??120):1;
 if(!Number.isFinite(factor)||factor<=0)throw Error('BPM 必须大于 0');
 let lyricIndex=0;
 const lyrics=typeof score.lyrics==='string'?score.lyrics.trim().split(/\s+/):score.lyrics;
 if(lyrics!==undefined&&(!Array.isArray(lyrics)||!lyrics.length))throw Error('lyrics 需要音节数组或用空格分隔的音节');
 const entries=score.notes.map((original,index)=>{
  const note={...original};
  if(note.syllable===undefined&&!note.tie&&lyrics)note.syllable=lyrics[lyricIndex++];
  const time=Number(note.time??0)*factor,duration=Number(note.duration)*factor;
  if(!Number.isFinite(time)||time<0||!Number.isFinite(duration)||duration<=0||duration>60)throw Error('无效的音符时间／时长，第 '+(index+1)+' 项');
  const voice=note.voice??score.voice??defaultVoice;
  if(!catalog[voice])throw Error('未知音源：'+voice);
  const syllable=note.syllable===undefined?undefined:normalizeSyllable(String(note.syllable),voice,catalog[voice].syllables);
  if(syllable!==undefined&&!catalog[voice].phonemes[syllable])throw Error('音节不存在：'+voice+':'+syllable);
  const velocity=Number(note.velocity??.85);if(!Number.isFinite(velocity)||velocity<0||velocity>1)throw Error('velocity 须在 0 到 1 之间');
  const visual=Number(note.visual??index%32);if(!Number.isFinite(visual))throw Error('无效动画编号');
  const midi=midiNumber(note.midi??60);let pitches;
  if(note.pitches!==undefined){
   if(!Array.isArray(note.pitches)||!note.pitches.length)throw Error('pitches 需要非空音高曲线');
   let prior=-1;
   pitches=note.pitches.map(point=>{
    const at=Number(point.time)*factor;
    if(!Number.isFinite(at)||at<0||at>=duration||at<=prior)throw Error('音高曲线时间必须递增且位于音符内');
    prior=at;return {time:at,midi:midiNumber(point.midi)};
   });
   if(pitches[0].time!==0)throw Error('音高曲线必须从 0 开始');
  }
  return {time,duration,voice,syllable,midi,velocity,visual:Math.abs(Math.floor(visual))%32,tie:!!note.tie,index,...(pitches?{pitches}:{})};
 }).sort((a,b)=>a.time-b.time||a.index-b.index);
 if(lyrics&&lyricIndex!==lyrics.length)throw Error('歌词音节数与非连音音符数不匹配');
 const groups=[];let previous;
 for(const note of entries){
  if(note.tie){
   if(!previous||previous.voice!==note.voice||Math.abs(previous.time+previous.duration-note.time)>.003||(note.syllable&&note.syllable!==previous.syllable))throw Error('连音必须紧接同一音源、同一音节的前一个音符');
   previous.pitches.push(...(note.pitches??[{time:0,midi:note.midi}]).map(point=>({...point,time:note.time-previous.time+point.time})));previous.duration=note.time+note.duration-previous.time;
   if(previous.duration>60)throw Error('单个连音段不能超过 60 秒');
   note.syllable=previous.syllable;previous.events.push(note);
  }else{
   if(!note.syllable)throw Error('非连音音符需要 syllable');
   previous={...note,pitches:note.pitches??[{time:0,midi:note.midi}],events:[note]};groups.push(previous);
  }
 }
 const end=Math.max(...entries.map(n=>n.time+n.duration));
 const duration=score.duration===undefined?end:Number(score.duration)*factor;
 if(!Number.isFinite(duration)||duration<end-.001)throw Error('歌曲时长不能短于最后一个音符');
 return {groups,events:entries,duration,bpm:score.bpm??120};
}
