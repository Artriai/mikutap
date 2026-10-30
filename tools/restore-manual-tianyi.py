"""Restore TianyiTap's 32 manual clips without changing the 409-note program bank."""
import json,subprocess,hashlib,base64
from pathlib import Path
root=Path(__file__).resolve().parents[1];dist=root/'dist'
catalog=json.loads((dist/'catalog.json').read_text());old=json.loads(subprocess.check_output(['git','show','aa2507d:dist/catalog.json'],cwd=root))['tianyi']['samples'];source={};samples=[]
(dist/'assets/manual-tianyi').mkdir(parents=True,exist_ok=True);(dist/'data/manual-tianyi').mkdir(parents=True,exist_ok=True)
for sample,reference in zip(old,catalog['miku']['originalBank']['samples']):
 i=sample['id'];raw=subprocess.check_output(['git','show',f'aa2507d:dist/assets/tianyi/{i}.mp3'],cwd=root);path=f'assets/manual-tianyi/{i}.mp3';(dist/path).write_bytes(raw);source[f'{i}.mp3']='data:audio/mp3;base64,'+base64.b64encode(raw).decode()
 samples.append({**sample,'canonicalSyllable':reference['syllable'],'volume':reference['volume'],'path':path,'sha256':hashlib.sha256(raw).hexdigest()})
catalog['tianyi']['originalBank']={'path':'data/manual-tianyi/main.json','source':'cyjin-yl/TianyiTap','manualOnly':True,'samples':samples}
(dist/'data/manual-tianyi/main.json').write_text(json.dumps(source,separators=(',',':')))
(dist/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
print('Restored 32 corresponding manual clips; program bank still',len(catalog['tianyi']['phonemes']))
