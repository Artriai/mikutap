"""Build compact, gapless MP3 sprites for the manual base phonemes."""
import array,json,re,subprocess,tempfile,wave
from pathlib import Path
root=Path(__file__).resolve().parents[1];dist=root/'dist'
catalog=json.loads((dist/'catalog.json').read_text())
# On first build migrate the existing invisible-grid mapping into the catalog.
source=(dist/'voice.js').read_text()
for bank in ('miku','tianyi'):
    voice=catalog[bank]
    if 'basicGrid' not in voice:
        match=re.search(r'\b'+bank+r':(\[[^\]]+\])',source)
        voice['basicGrid']=json.loads(match.group(1).replace("'",'"'))
    ids=list(dict.fromkeys(filter(None,voice['basicGrid'])))
    entries={};pcm=bytearray();rate=22050;gap=bytes(round(rate*.06)*2)
    for id in ids:
        clip=subprocess.run(['ffmpeg','-v','error','-i',str(dist/voice['phonemes'][id]['path']),'-f','s16le','-ac','1','-ar',str(rate),'-'],capture_output=True,check=True).stdout
        pcm.extend(gap);entries[id]={'start':len(pcm)/2/rate,'duration':len(clip)/2/rate};pcm.extend(clip);pcm.extend(gap)
    target=dist/'assets/basic'/f'{bank}.mp3';target.parent.mkdir(exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
        with wave.open(tmp.name,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(rate);wav.writeframes(pcm)
        subprocess.run(['ffmpeg','-v','error','-y','-i',tmp.name,'-codec:a','libmp3lame','-b:a','96k','-write_xing','1',str(target)],check=True)
    voice['basicSprite']={'path':f'assets/basic/{bank}.mp3','entries':entries}
    print(bank,len(ids),target.stat().st_size,'bytes')
(dist/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
