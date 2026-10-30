import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {synthesize} from '../dist/synthesis.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
if(!process.argv[2])throw Error('Usage: node tools/render-song.mjs /absolute/path/vocal.wav');
const score=JSON.parse(fs.readFileSync(root+'songs/senbonzakura.json'));
const catalog=JSON.parse(fs.readFileSync(root+'catalog.json'));
const rate=22050,sources=new Map(),cache=new Map(),output=new Float32Array(Math.ceil(score.duration*rate));
for(const id of new Set(score.notes.map(n=>n.syllable))){
 const bytes=execFileSync('ffmpeg',['-v','error','-i',root+catalog.miku.phonemes[id].path,'-f','f32le','-ac','1','-ar',String(rate),'-']);
 sources.set(id,new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
}
let count=0;
for(const note of score.notes){
 const attack=.018,duration=note.duration+attack+.008;
 const key=JSON.stringify([note.syllable,note.midi,Math.round(duration*10000),note.vibrato]);let sound=cache.get(key);
 if(!sound){
  const pitches=[{time:0,midi:note.midi}];
  if(note.vibrato&&duration>.2){for(let t=Math.max(.15,note.vibrato.start);t<duration;t+=.02){const fade=Math.min(1,(t-note.vibrato.start)/.12);pitches.push({time:t,midi:note.midi+note.vibrato.depth*Math.max(0,fade)*Math.sin(2*Math.PI*note.vibrato.rate*(t-note.vibrato.start))})}}
  sound=synthesize(sources.get(note.syllable),rate,{duration,pitches});
  let power=0;for(const x of sound)power+=x*x;const gain=Math.min(3,.15/Math.sqrt(power/sound.length+1e-12));
  for(let i=0;i<sound.length;i++)sound[i]*=gain;cache.set(key,sound);
 }
 const at=Math.round((note.time-attack)*rate);
 for(let i=0;i<sound.length&&at+i<output.length;i++)if(at+i>=0)output[at+i]+=sound[i]*note.velocity;
 if(++count%150===0)process.stdout.write('rendered '+count+' notes\n');
}
const header=Buffer.alloc(44),pcm=Buffer.alloc(output.length*2);let peak=0;
for(const x of output)peak=Math.max(peak,Math.abs(x));const gain=Math.min(1,.9/peak);
for(let i=0;i<output.length;i++)pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,output[i]*gain))*32767),i*2);
header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
fs.writeFileSync(process.argv[2],Buffer.concat([header,pcm]));
console.log(JSON.stringify({notes:count,uniqueRenders:cache.size,peak,gain}));
