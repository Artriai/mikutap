#!/usr/bin/env python3
"""Split an aligned exported PCM WAV using prepare-bank's exact timing plan."""
import argparse,json,wave,contextlib
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('plan');p.add_argument('wav');p.add_argument('--out',required=True);p.add_argument('--offset',type=float,default=0,help='Exported silence before the first MIDI note, in seconds');a=p.parse_args()
plan=json.loads(Path(a.plan).read_text());out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
if a.offset<0:p.error('--offset must be nonnegative')
with contextlib.closing(wave.open(a.wav,'rb')) as src:
    rate=src.getframerate();params=src.getparams();needed=max(x['start']+x['duration']+a.offset for x in plan['notes'])
    if src.getnframes()/rate+1/rate<needed:raise SystemExit(f'WAV too short: need {needed:.3f}s, got {src.getnframes()/rate:.3f}s. Check export range/offset.')
    for row in plan['notes']:
        filename=Path(row['filename'])
        if filename.name!=str(filename):raise SystemExit('Invalid filename in render plan')
        src.setpos(round((row['start']+a.offset)*rate));frames=src.readframes(round(row['duration']*rate))
        with wave.open(str(out/filename),'wb') as dst:dst.setparams(params);dst.writeframes(frames)
print(f'Split {len(plan["notes"])} syllables. Audition alignment and pronunciation before importing.')
