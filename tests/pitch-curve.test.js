import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileScore} from '../dist/score.js';
import {convertScore,approximateMandarinSyllable} from '../dist/voice-conversion.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/catalog.json',import.meta.url)));
test('one sung syllable keeps its pitch curve through compilation, ties and voice switching',()=>{
 const score={voice:'tianyi',unit:'beats',bpm:120,notes:[{time:0,duration:2,syllable:'yu',midi:64,pitches:[{time:0,midi:64},{time:1,midi:67}]},{time:2,duration:1,tie:true,syllable:'yu',midi:69,pitches:[{time:0,midi:69},{time:.5,midi:68.8}]}]};
 const before=JSON.stringify(score),compiled=compileScore(score,catalog);
 assert.equal(compiled.groups.length,1);assert.equal(compiled.groups[0].duration,1.5);
 assert.deepEqual(compiled.groups[0].pitches,[{time:0,midi:64},{time:.5,midi:67},{time:1,midi:69},{time:1.25,midi:68.8}]);
 const miku=convertScore(score,'miku',catalog);
 assert.deepEqual(miku.notes.map(n=>n.pitches),score.notes.map(n=>n.pitches));
 assert.deepEqual(compileScore(miku,catalog).groups[0].pitches,compiled.groups[0].pitches);
 assert.equal(JSON.stringify(score),before);
});
test('malformed pitch curves fail before audio preparation',()=>{
 for(const pitches of [[],[{time:.1,midi:60}],[{time:0,midi:60},{time:0,midi:61}],[{time:0,midi:60},{time:1,midi:61}],[{time:0,midi:60},{time:.5,midi:NaN}],[{time:-1,midi:60}]]){
  assert.throws(()=>compileScore({voice:'tianyi',notes:[{time:0,duration:1,syllable:'yu',pitches}]},catalog));
 }
});
test('all Mandarin syllables have a playable optional Miku approximation',()=>{
 for(const id of Object.keys(catalog.tianyi.phonemes))assert.ok(catalog.miku.phonemes[approximateMandarinSyllable(id,catalog.miku)]);
});
