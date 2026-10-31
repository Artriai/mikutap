"""Prepare the complete vocal score from the downloaded VSQ interpretation.
Usage: python tools/build-full-song.py /absolute/path/to/parsed-vsq.json
The original lyric document and VSQ container are not republished.
"""
import json,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];data=json.loads(Path(sys.argv[1]).read_text());catalog=json.loads((root/'dist/catalog.json').read_text())
quarter=data['tempos'][0][1]/1e6;ppq=data['ppq'];offset=1.40084-20*quarter
notes=[]
# Track 9 contains the lead ICBM / one-two response; track 8 is its harmony.
for track in [*data['tracks'][:2],data['tracks'][8]]:
 previous=None
 for item in track['notes']:
  label=re.match(r'"(.*?)"',item['lyric']).group(1).lower()
  time=item['tick']/ppq*quarter+offset;duration=int(item['Length'])/ppq*quarter
  is_ext=label=='-'
  if is_ext:
   if previous is None:raise ValueError('Unresolved lyric extension')
   label=next((v for v in reversed(previous['syllable']) if v in 'aiueo'),'n')
  if label=='s':label='su'
  if label not in catalog['miku']['phonemes']:raise ValueError('Unmapped syllable: '+label)
  note={'time':round(time,5),'duration':round(duration,5),'syllable':label,'midi':int(item['Note#']),'velocity':.88,'visual':len(notes)%32,'sourceTrack':track['track']}
  if is_ext and previous is not None and abs((previous['time']+previous['duration'])-time)<=.003:
   note['tie']=True;note['tieVowel']=True
  if track['track']==9:note['phrase']='ICBM' if item['tick']<100000 else 'one-two-san-shi'
  if 'VibratoHandle' in item:
   handle=track['sections'].get(item['VibratoHandle'],{});note['vibrato']={'start':int(item.get('VibratoDelay',int(item['Length'])*.65))/ppq*quarter,'depth':min(.25,int(handle.get('StartDepth',32))*.003),'rate':5.3}
  notes.append(note);previous=note
notes.sort(key=lambda n:(n['time'],n['sourceTrack']))
# One overlap is a deliberately doubled boundary; avoid a second consonant.
unique=[];seen=set()
for note in notes:
 key=(note['time'],note['syllable'],note['midi'])
 if key not in seen:unique.append(note);seen.add(key)
vocal_offset=unique[0]['time']
for note in unique:note['time']=round(note['time']-vocal_offset,5)
duration=round(max(n['time']+n['duration'] for n in unique)+.15,5)
score={'title':'千本樱','voice':'miku','engine':'natural','articulation':'legato','duration':duration,'originalVocalOffset':vocal_offset,'accompaniment':{'path':'assets/songs/senbonzakura-instrumental.mp3','gain':.42},'notes':unique,'source':{'song':'黒うさP / WhiteFlame','sequence':'Kate / Vocaloader sequence 3548','sequenceUrl':'https://vocaloader.app/sequences/3548','method':'Complete main, sub lead, and track 9 response vocals; formant-preserving live PSOLA playback of uniform C4 Miku VCV syllable buffers with tied vowel extensions and vibrato'}}
(root/'dist/songs/senbonzakura.json').write_text(json.dumps(score,ensure_ascii=False,separators=(',',':')))
manifest={'tracks':[{'id':'senbonzakura','title':'千本樱','artist':'初音未来 · 完整歌词实时演唱','voice':'miku','engine':'natural','articulation':'legato','duration':duration,'score':'songs/senbonzakura.json?v=7'}]}
(root/'dist/songs/playlist.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'notes':len(unique),'syllables':len(set(n['syllable'] for n in unique)),'firstVocal':unique[0]['time'],'lastVocal':max(n['time']+n['duration'] for n in unique),'range':[min(n['midi'] for n in unique),max(n['midi'] for n in unique)]}))
