import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {approximateSyllable,convertScore} from '../dist/voice-conversion.js';
import {compileScore} from '../dist/score.js';
const root=new URL('../dist/',import.meta.url),read=path=>JSON.parse(fs.readFileSync(new URL(path,root))),catalog=read('catalog.json'),miku=read('songs/senbonzakura.json'),tianyi=read('songs/senbonzakura-tianyi.json');
test('Tianyi manual slots match every Miku slot while all 409 program phonemes remain separate',()=>{
 const a=catalog.miku.originalBank.samples,b=catalog.tianyi.originalBank.samples;assert.equal(a.length,32);assert.equal(b.length,32);assert.deepEqual(a.map(s=>s.syllable),b.map(s=>s.canonicalSyllable));
 for(const sample of b){assert.ok(fs.existsSync(new URL(sample.path,root)));assert.ok(catalog.tianyi.phonemes[sample.syllable])}
 assert.equal(Object.keys(catalog.tianyi.phonemes).length,409);assert.ok(Object.values(catalog.tianyi.phonemes).every(p=>p.originalId===undefined&&p.midi===60));
});
test('the complete forced cover keeps all lyrics, pitches, rests, ICBM and accompaniment timing',()=>{
 const before=JSON.stringify(miku),converted=convertScore(miku,'tianyi',catalog);assert.equal(JSON.stringify(miku),before);assert.equal(converted.voice,'tianyi');assert.equal(converted.notes.length,657);assert.deepEqual(converted,tianyi);assert.equal(converted.duration,miku.duration);assert.deepEqual(converted.accompaniment,miku.accompaniment);
 converted.notes.forEach((note,i)=>{const source=miku.notes[i];assert.equal(note.voice,'tianyi');assert.equal(note.sourceSyllable,source.syllable);assert.equal(note.midi,source.midi);assert.equal(note.time,source.time);assert.equal(note.duration,source.duration);assert.equal(note.phrase,source.phrase);assert.ok(catalog.tianyi.phonemes[note.syllable])});
 assert.equal(converted.notes.filter(n=>n.phrase==='ICBM').length,8);assert.equal(compileScore(converted,catalog).duration,converted.duration);assert.equal(convertScore(miku,'miku',catalog),miku);
});
test('every Japanese inventory syllable has a playable Mandarin approximation',()=>{
 for(const {id} of catalog.miku.syllables)assert.ok(catalog.tianyi.phonemes[approximateSyllable(id,catalog.tianyi)]);
 assert.equal(approximateSyllable('shi',catalog.tianyi),'xi');assert.equal(approximateSyllable('ryo',catalog.tianyi),'liao');assert.equal(approximateSyllable('i',catalog.tianyi),'yi');
});
