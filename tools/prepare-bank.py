#!/usr/bin/env python3
"""Create a timed MIDI/lyric render plan; no commercial singing engine required to run."""
import argparse,json,struct,csv
from pathlib import Path

def vlq(value):
    out=[value&127]
    while value>>7:
        value>>=7;out.insert(0,(value&127)|128)
    return bytes(out)

def prepare(bank,output):
    root=Path(__file__).resolve().parents[1]
    voice=json.loads((root/'dist/catalog.json').read_text())[bank]
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    track=bytearray(b'\x00\xff\x51\x03\x07\xa1\x20') # 120 BPM, 480 PPQ
    track+=b'\x00\xff\x58\x04\x04\x02\x18\x08'
    entries=[]
    for index,s in enumerate(voice['syllables']):
        lyric=(s['label'] if bank=='miku' else s['id']).encode('utf-8')
        track+=vlq(0 if index==0 else 240)+b'\xff\x05'+vlq(len(lyric))+lyric
        track+=b'\x00\x90\x3c\x60'+vlq(720)+b'\x80\x3c\x00'
        entries.append({'syllable':s['id'],'lyric':s['label'],'filename':s['id']+'.wav','start':index,'duration':1.0,'baseMidi':60})
    track+=b'\x00\xff\x2f\x00'
    midi=b'MThd'+struct.pack('>IHHH',6,0,1,480)+b'MTrk'+struct.pack('>I',len(track))+track
    (output/f'{bank}.mid').write_bytes(midi)
    (output/'lyrics.txt').write_text(' '.join(s['label'] if bank=='miku' else s['id'] for s in voice['syllables'])+'\n')
    (output/'render-plan.json').write_text(json.dumps({'bank':bank,'bpm':120,'stepSeconds':1,'baseMidi':60,'notes':entries},ensure_ascii=False,indent=2))
    with (output/'syllables.csv').open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=entries[0].keys());w.writeheader();w.writerows(entries)
    return len(entries)
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('bank',choices=['miku','tianyi']);p.add_argument('--out',required=True);a=p.parse_args();print(f'Created {prepare(a.bank,a.out)} C4 notes, 1.0 second each. Assign your own singer and verify lyrics before rendering.')
