import fs from 'node:fs';
import {convertScore} from '../dist/voice-conversion.js';
const root=new URL('../dist/',import.meta.url),read=path=>JSON.parse(fs.readFileSync(new URL(path,root)));
const score=convertScore(read('songs/senbonzakura.json'),'tianyi',read('catalog.json'));
fs.writeFileSync(new URL('songs/senbonzakura-tianyi.json',root),JSON.stringify(score));
const manifest=read('songs/playlist.json');manifest.tracks[0].variants={tianyi:'songs/senbonzakura-tianyi.json?v=1'};fs.writeFileSync(new URL('songs/playlist.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({voice:score.voice,notes:score.notes.length,syllables:new Set(score.notes.map(n=>n.syllable)).size}));
