import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {synthesize,estimatePeriod} from '../dist/synthesis.js';
import {compileScore,midiNumber} from '../dist/score.js';
import {readMidi} from '../dist/midi.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url)));
const sr=22050;
function sine(frequency,seconds=.45){return Float32Array.from({length:Math.round(sr*seconds)},(_,i)=>.4*Math.sin(i*2*Math.PI*frequency/sr));}
function frequency(samples,midi){return sr/estimatePeriod(samples,sr,midi).period;}
test('pitch changes by octaves without changing requested duration or adding non-finite samples',()=>{
 const input=sine(261.6256);
 for(const [midi,want] of [[48,130.8128],[60,261.6256],[72,523.2511]]){
  const out=synthesize(input,sr,{midi,duration:1.25});
  assert.equal(out.length,Math.round(sr*1.25));assert.ok(out.every(Number.isFinite));
  assert.ok(Math.abs(frequency(out,midi)-want)/want<.02,`${midi}: ${frequency(out,midi)}`);
  assert.ok(out.some(x=>Math.abs(x)>.1));assert.ok(out[0]===0);assert.ok(out.at(-1)===0);
 }
});
test('a tied syllable can change pitch without a new consonant or a gap',()=>{
 const out=synthesize(sine(261.6256),sr,{duration:1.5,pitches:[{time:0,midi:60},{time:.75,midi:67}]});
 assert.ok(Math.abs(frequency(out.slice(sr*.2,sr*.65),60)-261.6256)<6);
 assert.ok(Math.abs(frequency(out.slice(sr*.9,sr*1.3),67)-391.9954)<8);
 assert.ok(out.slice(Math.round(sr*.74),Math.round(sr*.76)).some(x=>Math.abs(x)>.15));
});
test('score uses explicit syllables, notes, beat timing and ties independently of screen slots',()=>{
 const score=compileScore({unit:'beats',bpm:120,voice:'miku',lyrics:['キャ','あ'],notes:[{time:0,duration:1,midi:'D#4'},{time:1,duration:1,midi:'F4',tie:true},{time:2,duration:.5,midi:60}]},catalog);
 assert.equal(score.groups.length,2);assert.equal(score.groups[0].syllable,'kya');assert.equal(score.groups[0].duration,1);assert.deepEqual(score.groups[0].pitches,[{time:0,midi:63},{time:.5,midi:65}]);assert.equal(score.events[1].syllable,'kya');assert.equal(score.duration,1.25);
 const cn=compileScore([{time:0,duration:.4,voice:'tianyi',syllable:'lüè',midi:64}],catalog);assert.equal(cn.groups[0].syllable,'lüe');
 assert.equal(midiNumber('Bb3'),58);
});
test('score rejects absent phonemes, malformed timing and disconnected ties before playback',()=>{
 for(const notes of [[{duration:.2,syllable:'missing'}],[{duration:-1,syllable:'a'}],[{duration:.2,syllable:'a',midi:Infinity}],[{duration:.2,tie:true}],[{duration:.2,syllable:'a'},{time:1,duration:.2,tie:true}]])assert.throws(()=>compileScore(notes,catalog));
 assert.throws(()=>compileScore({lyrics:['a','i'],notes:[{duration:.2}]},catalog));
});
function midiFile(){
 const header=[77,84,104,100,0,0,0,6,0,0,0,1,1,224];
 // C4 quarter, tempo doubles at the next note. PPQ = 480.
 const track=[0,255,81,3,7,161,32,0,144,60,100,131,96,128,60,0,0,255,81,3,3,208,144,0,144,64,90,131,96,128,64,0,0,255,47,0];
 return new Uint8Array([...header,77,84,114,107,0,0,0,track.length,...track]);
}
test('MIDI import follows tempo changes, keeps melody and assigns provided syllables',()=>{
 const score=readMidi(midiFile(),{voice:'tianyi',syllables:['ni','hao']});
 assert.equal(score.notes.length,2);assert.equal(score.notes[0].duration,.5);assert.equal(score.notes[1].time,.5);assert.equal(score.notes[1].duration,.25);assert.equal(score.notes[1].midi,64);assert.equal(score.notes[1].syllable,'hao');
 assert.throws(()=>readMidi(midiFile().slice(0,-2)),/截断/);assert.throws(()=>readMidi(midiFile(),{syllables:['a','i','u']}));
});
function readWave(file){
 const bytes=fs.readFileSync(file);let offset=12,format,channels,rate,bits,data;
 while(offset+8<=bytes.length){const tag=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4);offset+=8;if(tag==='fmt '){format=bytes.readUInt16LE(offset);channels=bytes.readUInt16LE(offset+2);rate=bytes.readUInt32LE(offset+4);bits=bytes.readUInt16LE(offset+14);}if(tag==='data')data=bytes.subarray(offset,offset+size);offset+=size+(size%2);}
 assert.equal(format,1);assert.equal(bits,16);const input=Float32Array.from({length:data.length/(channels*2)},(_,i)=>data.readInt16LE(i*channels*2)/32768);return {input,rate};
}
test('real Miku and Tianyi samples retain audible voiced content at specified pitch and length',()=>{
 for(const [voice,id] of [['miku','a'],['miku','kya'],['tianyi','a'],['tianyi','lüe']]){
  const {input,rate}=readWave(new URL('../dist/'+(catalog[voice].phonemes[id].expandedPath??catalog[voice].phonemes[id].path),import.meta.url));
  const out=synthesize(input,rate,{midi:67,duration:1.4}),body=out.slice(Math.round(rate*.4),Math.round(rate*1.1));
  assert.equal(out.length,Math.round(rate*1.4));assert.ok(out.every(Number.isFinite));assert.ok(Math.max(...body.map(Math.abs))>.02);
  const actual=rate/estimatePeriod(body,rate,67).period;assert.ok(Math.abs(actual-391.9954)/391.9954<.06,`${voice}:${id} ${actual}`);
 }
});
