"""Keep original Mikutap clips byte-for-byte; overlay only available phonemes.
Usage: python tools/restore-original-miku.py main.json original-catalog.json pitches.json
The source original-catalog.json is the first source revision's mapping from the
upstream list.txt; MIDI is remeasured on the original clips, not copied from Tianyi.
"""
from pathlib import Path
import json,sys,base64,hashlib
root=Path(__file__).resolve().parents[1];dist=root/'dist'
data=json.loads(Path(sys.argv[1]).read_text());mapping=json.loads(Path(sys.argv[2]).read_text())['miku']['samples'];pitches=json.loads(Path(sys.argv[3]).read_text());catalog=json.loads((dist/'catalog.json').read_text());voice=catalog['miku']
folder=dist/'assets/original-miku';folder.mkdir(parents=True,exist_ok=True);(dist/'data/main').mkdir(exist_ok=True)
(dist/'data/main/main.json').write_text(json.dumps(data,separators=(',',':')))
volume={1:1.3,2:1.6,3:1.35,5:1.7,9:.8,17:.8,22:.9,25:.7,29:1.2}
samples=[]
for entry,pitch in zip(mapping,pitches):
 i=entry['id'];assert i==pitch['id'];raw=base64.b64decode(data[f'{i}.mp3'].split(',')[1]);path=f'assets/original-miku/{i}.mp3';(dist/path).write_bytes(raw)
 samples.append({'id':i,'syllable':entry['syllable'],'midi':pitch['midi'],'volume':round(volume.get(i,1)*1.2,4),'path':path,'sha256':hashlib.sha256(raw).hexdigest()})
voice['originalBank']={'path':'data/main/main.json','source':'https://aidn.jp/mikutap/','mirror':'https://github.com/HFIProgramming/mikutap','samples':samples}
for id in {e['syllable'] for e in samples}:
 if id not in voice['phonemes']:raise ValueError(id)
 primary=min((e for e in samples if e['syllable']==id),key=lambda e:abs(e['midi']-60));old=voice['phonemes'][id]
 voice['phonemes'][id]={**old,'expandedPath':old.get('expandedPath',old['path']),'path':primary['path'],'midi':primary['midi'],'originalId':primary['id'],'nativeVolume':primary['volume'],'method':'Original Mikutap MP3, unchanged bytes','source':'daniwell / aidn.jp Mikutap'}
(dist/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'originalClips':len(samples),'originalPhonemes':len({e['syllable'] for e in samples})}))
