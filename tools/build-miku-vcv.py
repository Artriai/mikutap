#!/usr/bin/env python3
"""Cut a local C4 oto.ini VCV bank into six sprites, preserving OTO timing in seconds."""
import argparse
import json
import re
from pathlib import Path
from cvvc_bank import ROOT, decode, fade, pack_sprites, merge_manifest


def kana(text):
    return ''.join(chr(ord(c)-0x60) if 'ァ' <= c <= 'ヶ' else c for c in text)


def build(source, dist, pitch='C4', encoding=None, bitrate='160k'):
    source, dist = Path(source).resolve(), Path(dist)
    otos = [source] if source.is_file() else list(source.rglob('oto.ini'))
    selected = [p for p in otos if pitch.lower() in [part.lower() for part in p.parent.parts]]
    if selected:
        otos = selected
    if len(otos) != 1:
        raise ValueError(f'Expected one {pitch} oto.ini, found {len(otos)}. Pass the C4 directory or oto.ini explicitly.')
    oto = otos[0]
    raw = oto.read_bytes()
    try:
        text = raw.decode(encoding or 'utf-8-sig')
    except UnicodeDecodeError:
        if encoding:
            raise
        text = raw.decode('cp932')
    catalog = json.loads((ROOT/'dist/catalog.json').read_text(encoding='utf-8'))['miku']['syllables']
    mapping = {kana(s['label']): [s['id']] for s in catalog}
    for alias, target in [('じゃ', 'ぢゃ'), ('じゅ', 'ぢゅ'), ('じょ', 'ぢょ')]:
        mapping[alias] += mapping[target]
    groups = {v: [] for v in 'aiueon'}
    decoded, seen = {}, set()
    rate = 24000
    for number, line in enumerate(text.splitlines(), 1):
        if not line.strip() or line.lstrip().startswith(';'):
            continue
        if '=' not in line:
            raise ValueError(f'Invalid OTO line {number}')
        filename, spec = line.split('=', 1)
        fields = spec.split(',')
        if len(fields) < 6:
            raise ValueError(f'Invalid OTO fields on line {number}')
        alias = re.sub(r'[_ ]?'+re.escape(pitch)+r'$', '', fields[0].strip(), flags=re.I)
        match = re.fullmatch(r'([aiueon])\s+(.+)', alias)
        if not match:
            continue
        previous, label = match.groups()
        ids = mapping.get(kana(label))
        if not ids:
            continue
        offset, consonant, cutoff, pre, overlap = [float(x or 0)/1000 for x in fields[1:6]]
        if offset < 0 or pre < 0:
            raise ValueError(f'Negative offset/preutterance on line {number}')
        path = (oto.parent / filename.strip().replace('\\', '/')).resolve()
        if not path.is_relative_to(source.parent if source.is_file() else source):
            raise ValueError(f'WAV outside voicebank on line {number}')
        if path not in decoded:
            decoded[path] = decode(path, rate)
        audio = decoded[path]
        # Positive cutoff trims from the file end; negative cutoff is length after offset.
        end = len(audio)/rate-cutoff if cutoff >= 0 else offset-cutoff
        end = min(end, offset+max(pre+.14, consonant+.035), offset+.55)
        if end-offset < pre+.04:
            raise ValueError(f'OTO has no usable vowel on line {number}')
        clip = fade(audio[round(offset*rate):round(end*rate)], rate)
        for syllable in ids:
            key = previous+'_'+syllable
            if key in seen:
                continue
            seen.add(key)
            groups[previous].append((key, clip, {'preutterance': pre, 'overlap': max(0, min(overlap, pre)), 'midi': 60}))
    if not seen:
        raise ValueError('No supported VCV aliases found. Check pitch, OTO encoding and alias suffix.')
    entries = pack_sprites(groups, dist, 'miku-vcv', 'vcv', rate, bitrate)
    size = merge_manifest(dist, 'miku', entries)
    return len(entries), size


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path)
    p.add_argument('--dist', type=Path, default=ROOT/'dist')
    p.add_argument('--pitch', default='C4')
    p.add_argument('--encoding')
    p.add_argument('--bitrate', default='160k')
    a = p.parse_args()
    print('VCV entries / combined transition bytes:', build(a.source, a.dist, a.pitch, a.encoding, a.bitrate))
