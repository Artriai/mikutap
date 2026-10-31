"""Shared offline PCM/sprite helpers. Only FFmpeg is external; no Python packages."""
import array
import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENDINGS = ['a', 'u', 'e', 'i', 'v', 'ir', 'n', 'ng']
INITIALS = 'b p m f d t n l g k h j q x zh ch sh r z c s y w 0'.split()
# Each carrier MUST end in the class it labels. In particular bo is u, not a.
ENDING_CARRIERS = dict(zip(ENDINGS, 'ba bo ge yi yu shi an ang'.split()))
INITIAL_CARRIERS = dict(zip(INITIALS, 'ba pa ma fa da ta na la ga ka ha ji qi xi zha cha sha ri za ca sa ya wa a'.split()))


def dump(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def decode(path, rate=24000):
    result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 's16le', '-ac', '1', '-ar', str(rate), '-'], capture_output=True, check=True)
    pcm = array.array('h', result.stdout)
    if sys.byteorder != 'little':
        pcm.byteswap()
    return pcm


def pcm_bytes(pcm):
    values = array.array('h', pcm)
    if sys.byteorder != 'little':
        values.byteswap()
    return values.tobytes()


def fade(pcm, rate, seconds=.005):
    pcm = array.array('h', pcm)
    count = min(round(seconds * rate), len(pcm) // 2)
    for i in range(count):
        gain = .5 - .5 * math.cos(math.pi * i / max(1, count - 1))
        pcm[i] = round(pcm[i] * gain)
        pcm[-1-i] = round(pcm[-1-i] * gain)
    return pcm


def pack_sprites(groups, dist, folder, prefix, rate=24000, bitrate='160k'):
    """Rows are (key, PCM samples, metadata); offsets describe gapless decoded PCM."""
    dist = Path(dist)
    directory = dist / 'assets' / folder
    directory.mkdir(parents=True, exist_ok=True)
    entries = {}
    for category, rows in groups.items():
        if not rows:
            continue
        pcm = array.array('h')
        local = {}
        for key, clip, meta in rows:
            pcm.extend([0] * round(rate * .012))
            local[key] = {**meta, 'start': len(pcm)/rate, 'duration': len(clip)/rate}
            pcm.extend(clip)
        pcm.extend([0] * round(rate * .012))
        target = directory / f'{prefix}-{category}.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ac', '1', '-ar', str(rate), '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', bitrate, '-write_xing', '1', str(target)], input=pcm_bytes(pcm), check=True)
        # Content-address paths invalidate browser + prepared-note caches after a rebuild.
        digest = hashlib.sha256(target.read_bytes()).hexdigest()[:12]
        versioned = target.with_name(f'{prefix}-{category}-{digest}.mp3')
        target.replace(versioned)
        decoded = decode(versioned, rate)
        needed = max(round((entry['start']+entry['duration'])*rate) for entry in local.values())
        if len(decoded) < needed or abs(len(decoded)-len(pcm)) > round(rate*.05):
            raise ValueError(f'Encoder delay/padding mismatch: {versioned} ({len(decoded)} decoded, {len(pcm)} input, {needed} needed)')
        for key, meta in local.items():
            entries[key] = {**meta, 'sprite': versioned.relative_to(dist).as_posix()}
    return entries


def merge_manifest(dist, voice, entries):
    path = Path(dist) / 'transitions.json'
    data = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'version': 1, 'miku': {}, 'tianyi': {}}
    if data.get('version') != 1:
        raise ValueError('Unsupported transitions manifest')
    data[voice] = entries
    # A combined incremental audio budget, not a per-script budget.
    files = {m['sprite'] for bank in ('miku', 'tianyi') for m in data.get(bank, {}).values()}
    size = sum((Path(dist)/name).stat().st_size for name in files)
    if size > 8 * 1024 * 1024:
        raise ValueError(f'Transition sprites exceed 8 MiB: {size} bytes; reduce bitrate or sample length')
    dump(path, data)
    return size
