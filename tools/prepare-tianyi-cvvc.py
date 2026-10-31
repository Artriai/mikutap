#!/usr/bin/env python3
"""Generate C4 MIDI, USTX, lyrics and exact render grids for 409 CV + 192 VC pairs."""
import argparse
import struct
from pathlib import Path
from cvvc_bank import ROOT, ENDINGS, INITIALS, ENDING_CARRIERS, INITIAL_CARRIERS, dump
import json


def vlq(value):
    out = [value & 127]
    while value >> 7:
        value >>= 7
        out.insert(0, (value & 127) | 128)
    return bytes(out)


def write_project(directory, name, notes, singer='', phonemizer='OpenUtau.Core.DiffSinger.DiffSingerChinesePhonemizer'):
    # 120 BPM / 480 PPQ => 960 ticks per second, all requested lengths exact.
    track = bytearray(b'\x00\xff\x51\x03\x07\xa1\x20')
    previous = 0
    ust_notes = []
    for note in notes:
        start, duration = round(note['start'] * 960), round(note['duration'] * 960)
        lyric = note['lyric'].encode('utf-8')
        track += vlq(start-previous) + b'\xff\x05' + vlq(len(lyric)) + lyric
        track += b'\x00\x90\x3c\x60' + vlq(duration) + b'\x80\x3c\x00'
        previous = start+duration
        ust_notes.append({'position': start, 'duration': duration, 'tone': 60, 'lyric': note['lyric'], 'pitch': {'data': [{'x': -40, 'y': 0, 'shape': 'io'}, {'x': 40, 'y': 0, 'shape': 'io'}], 'snap_first': False}, 'vibrato': {'length': 0, 'period': 175, 'depth': 0, 'in': 10, 'out': 10, 'shift': 0, 'drift': 0}, 'phoneme_expressions': [], 'phoneme_overrides': []})
    track += b'\x00\xff\x2f\x00'
    (directory / f'{name}.mid').write_bytes(b'MThd' + struct.pack('>IHHH', 6, 0, 1, 480) + b'MTrk' + struct.pack('>I', len(track)) + track)
    (directory / f'{name}.lyrics.txt').write_text(' '.join(n['lyric'] for n in notes)+'\n', encoding='utf-8')
    # JSON is valid YAML 1.2. Native .ustx loader reads the documented 0.6 schema.
    dump(directory / f'{name}.ustx', {'name': name, 'ustx_version': '0.6', 'resolution': 480, 'key': 0, 'time_signatures': [{'bar_position': 0, 'beat_per_bar': 4, 'beat_unit': 4}], 'tempos': [{'position': 0, 'bpm': 120}], 'tracks': [{'singer': singer, 'phonemizer': phonemizer, 'track_name': name, 'mute': False, 'solo': False, 'volume': 0}], 'voice_parts': [{'name': name, 'position': 0, 'track_no': 0, 'duration': previous, 'notes': ust_notes, 'curves': []}], 'wave_parts': []})


def prepare(output, catalog, singer='', phonemizer='OpenUtau.Core.DiffSinger.DiffSingerChinesePhonemizer'):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    syllables = json.loads(Path(catalog).read_text(encoding='utf-8'))['tianyi']['syllables']
    base = [{'syllable': row['id'], 'lyric': row['id'].replace('ü', 'v'), 'filename': row['id']+'.wav', 'start': round(i*1.1, 6), 'duration': .85, 'baseMidi': 60} for i, row in enumerate(syllables)]
    pairs, notes = [], []
    for ending in ENDINGS:
        for initial in INITIALS:
            start = round(len(pairs)*1.2, 6)
            left, right = ENDING_CARRIERS[ending], INITIAL_CARRIERS[initial]
            pairs.append({'key': ending+'_'+initial, 'ending': ending, 'initial': initial, 'left': left, 'right': right, 'start': start, 'boundary': round(start+.45, 6), 'duration': .9})
            notes.extend([{'start': start, 'duration': .45, 'lyric': left}, {'start': round(start+.45, 6), 'duration': .45, 'lyric': right}])
    write_project(output, 'tianyi-base-409', base, singer, phonemizer)
    write_project(output, 'tianyi-vc-192', notes, singer, phonemizer)
    dump(output / 'tianyi-base-plan.json', {'version': 1, 'bank': 'tianyi', 'kind': 'base', 'bpm': 120, 'baseMidi': 60, 'notes': base})
    dump(output / 'tianyi-vc-plan.json', {'version': 1, 'bank': 'tianyi', 'kind': 'vc', 'bpm': 120, 'baseMidi': 60, 'pairs': pairs})
    return len(base), len(pairs)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--catalog', type=Path, default=ROOT/'dist/catalog.json')
    parser.add_argument('--singer', default='', help='Installed OpenUTAU singer ID; otherwise select a singer after opening')
    parser.add_argument('--phonemizer', default='OpenUtau.Core.DiffSinger.DiffSingerChinesePhonemizer')
    args = parser.parse_args()
    print('Created base syllables / VC pairs:', prepare(args.out, args.catalog, args.singer, args.phonemizer))
