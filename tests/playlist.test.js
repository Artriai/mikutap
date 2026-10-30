import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../dist/',import.meta.url);
const catalog=JSON.parse(fs.readFileSync(new URL('catalog.json',root)));
const playlist=JSON.parse(fs.readFileSync(new URL('songs/playlist.json',root)));
test('main playlist sings every lyric event live without a song recording',()=>{
 const track=playlist.tracks.find(t=>t.id==='senbonzakura');assert.ok(track);assert.equal(track.engine,'sampler');assert.equal(track.audio,undefined);
 const score=JSON.parse(fs.readFileSync(new URL(track.score.split('?')[0],root)));
 assert.equal(score.notes.length,657);assert.equal(new Set(score.notes.map(n=>n.syllable)).size,66);
 assert.ok(fs.statSync(new URL(score.accompaniment.path,root)).size>2000000);assert.ok(score.accompaniment.path.endsWith('-instrumental.mp3'));
 assert.deepEqual(score.notes.filter(n=>n.phrase==='ICBM').map(n=>n.syllable),['a','i','shi','i','i','bi','e','mu']);
 assert.equal(score.notes.filter(n=>n.phrase==='one-two-san-shi').length,9);
 assert.equal(score.notes[0].time,0);assert.equal(score.duration,track.duration);assert.ok(score.duration>180);
 let last=-1;for(const note of score.notes){assert.ok(note.time>=last);last=note.time;assert.ok(note.duration>0);assert.ok(note.time+note.duration<track.duration);assert.ok(catalog[track.voice].phonemes[note.syllable]);assert.ok(note.midi>=24&&note.midi<=96)}
 assert.ok(last>180,'the final verse must exist');assert.ok(!fs.existsSync(new URL('assets/songs/senbonzakura-miku.mp3',root)));
 const script=fs.readFileSync(new URL('playlist.js',root),'utf8');assert.doesNotMatch(script,/new Audio\(|createMediaElementSource|track\.audio/);assert.match(script,/engine:score\.engine\|\|'sampler',muteBacktrack:true/);
 const html=fs.readFileSync(new URL('index.html',root),'utf8');assert.match(html,/id="bt_start"/);assert.match(html,/id="playlist_tracks"/);assert.match(html,/src="playlist.js/);assert.doesNotMatch(html,/src="song.js/);assert.doesNotMatch(html,/playlist_dock/);assert.doesNotMatch(script,/relocate|append\(panel\)|MutationObserver/);
});
