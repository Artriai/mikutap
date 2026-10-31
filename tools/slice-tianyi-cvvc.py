#!/usr/bin/env python3
"""Split aligned sung C4 exports; pack 180 ms VC transitions with alignment reports."""
import argparse
import json
import math
import wave
from pathlib import Path
from cvvc_bank import ROOT, ENDINGS, decode, fade, pcm_bytes, pack_sprites, merge_manifest, dump


def locate_boundary(audio, rate, expected):
    """Conservative envelope/ZCR refinement, not a phonetic forced aligner."""
    half = round(.012*rate)
    def features(center):
        clip = audio[max(0, center-half):min(len(audio), center+half)]
        energy = math.sqrt(sum(x*x for x in clip)/max(1, len(clip)))
        zcr = sum((a >= 0) != (b >= 0) for a, b in zip(clip, clip[1:]))/max(1, len(clip))
        return energy, zcr
    scores = []
    center = round(expected*rate)
    for shift in range(-30, 31, 3):
        at = center+round(shift*.001*rate)
        e1, z1 = features(at-half)
        e2, z2 = features(at+half)
        score = abs(e2-e1)/max(500, e1+e2)+min(.5, abs(z2-z1)*3)
        scores.append((score, at/rate))
    score, found = max(scores)
    return (found if score > .22 else expected), score


def slice_bank(plan_path, wav, dist, offset=0, refine=True, overrides=None, bitrate='160k', alignment=None):
    plan = json.loads(Path(plan_path).read_text(encoding='utf-8'))
    if plan.get('version') != 1 or plan.get('bank') != 'tianyi' or plan.get('baseMidi') != 60:
        raise ValueError('Expected a C4 Tianyi plan from prepare-tianyi-cvvc.py')
    if not math.isfinite(offset) or offset < 0:
        raise ValueError('Export offset must be finite and nonnegative')
    dist, rate = Path(dist), 24000
    audio = decode(wav, rate)
    rows = plan['notes'] if plan['kind'] == 'base' else plan['pairs']
    needed = max(r['start']+r['duration']+offset for r in rows)
    if len(audio)/rate+1/rate < needed:
        raise ValueError(f'WAV too short: need {needed:.3f}s, got {len(audio)/rate:.3f}s; check export offset/range')
    report = []
    if plan['kind'] == 'base':
        directory = dist/'assets/tianyi-full'
        directory.mkdir(parents=True, exist_ok=True)
        durations = {}
        # Validate every filename before replacing existing program-only audio.
        for row in rows:
            if Path(row['filename']).name != row['filename'] or not row['filename'].endswith('.wav'):
                raise ValueError('Invalid syllable filename')
        for row in rows:
            # Singing phonemizers anticipate consonants before the note's vowel beat.
            # Include that native lead instead of slicing off the initial consonant.
            timing = next((n for n in (alignment or []) if abs(n['start']-row['start']) < .001 and n['lyric'] == row['lyric']), None)
            if timing and any(p.get('error') for p in timing['phones']):
                raise ValueError('Native phonemizer error: '+row['syllable'])
            start = max(0, min([row['start'], *[p['start']-.005 for p in timing['phones']]]) if timing else row['start'])
            if row['start']-start > .22:
                raise ValueError('Unexpected consonant lead: '+row['syllable'])
            clip = fade(audio[round((start+offset)*rate):round((row['start']+offset+row['duration'])*rate)], rate)
            durations[row['filename']] = len(clip)/rate
            with wave.open(str(directory/row['filename']), 'wb') as target:
                target.setnchannels(1)
                target.setsampwidth(2)
                target.setframerate(rate)
                target.writeframes(pcm_bytes(clip))
        # Point all program syllables at the new sung bank, including existing basics.
        catalog_path = dist/'catalog.json'
        catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
        for row in rows:
            phoneme = catalog['tianyi']['phonemes'][row['syllable']]
            phoneme.update({'expandedPath': 'assets/tianyi-full/'+row['filename'], 'method': 'AI voice conversion', 'renderMethod': 'DiffSinger singing + RVC (offline C4 export)', 'midi': 60, 'duration': durations[row['filename']], 'renderText': row.get('lyric', row['syllable']), 'revision': phoneme.get('revision', 0)+1})
        dump(catalog_path, catalog)
        return {'baseSyllables': len(rows)}
    overrides = overrides or {}
    groups = {v: [] for v in ENDINGS}
    for row in rows:
        expected = row['boundary']+offset
        boundary, confidence = locate_boundary(audio, rate, expected) if refine else (expected, 0)
        if row['key'] in overrides:
            boundary = float(overrides[row['key']])+offset
        if not math.isfinite(boundary) or abs(boundary-expected) > .1:
            raise ValueError('Boundary override exceeds 100 ms: '+row['key'])
        start = round((boundary-.095)*rate)
        clip = audio[start:start+round(.180*rate)]
        if start < 0 or len(clip) != round(.180*rate):
            raise ValueError('Truncated VC: '+row['key'])
        rms = math.sqrt(sum(v*v for v in clip)/max(1, len(clip)))/32768
        if rms < .0005:
            raise ValueError('Silent VC: '+row['key'])
        groups[row['ending']].append((row['key'], fade(clip, rate), {'preutterance': .095, 'overlap': .028, 'midi': 60}))
        report.append({'key': row['key'], 'expected': expected, 'boundary': boundary, 'shift': boundary-expected, 'featureScore': confidence, 'rms': rms})
    entries = pack_sprites(groups, dist, 'tianyi-vc', 'vc', rate, bitrate)
    size = merge_manifest(dist, 'tianyi', entries)
    return {'vcEntries': len(entries), 'transitionBytes': size, 'alignment': report}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('plan', type=Path)
    p.add_argument('wav', type=Path, help='Dry sung export after optional RVC, preserving the full timing grid')
    p.add_argument('--dist', type=Path, default=ROOT/'dist')
    p.add_argument('--offset', type=float, default=0)
    p.add_argument('--grid-only', action='store_true')
    p.add_argument('--boundaries', type=Path, help='JSON {key: absolute seconds in the original render grid}')
    p.add_argument('--report', type=Path, required=True)
    p.add_argument('--bitrate', default='160k')
    p.add_argument('--alignment', type=Path, help='Native .alignment.json from render-openutau.py (retains pre-beat consonants)')
    a = p.parse_args()
    overrides = json.loads(a.boundaries.read_text(encoding='utf-8')) if a.boundaries else None
    alignment = json.loads(a.alignment.read_text(encoding='utf-8')) if a.alignment else None
    result = slice_bank(a.plan, a.wav, a.dist, a.offset, not a.grid_only, overrides, a.bitrate, alignment)
    dump(a.report, result)
    print({k: v for k, v in result.items() if k != 'alignment'})
