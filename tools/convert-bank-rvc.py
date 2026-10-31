#!/usr/bin/env python3
"""Convert a timed singing export in bounded GPU chunks while preserving its grid."""
import argparse
import json
import os
import sys
import tempfile
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', type=Path)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--rvc', type=Path, required=True, help='RVC-Project source directory (Transformers HuBERT version)')
    p.add_argument('--model', type=Path, required=True)
    p.add_argument('--index', type=Path, required=True)
    p.add_argument('--step', type=float, required=True, help='Render-grid item step: base 1.1, VC 1.2')
    p.add_argument('--boundary-lead', type=float, required=True, help='Place chunk boundaries inside item rests: base .175, VC .15')
    p.add_argument('--chunk-items', type=int, default=8)
    p.add_argument('--index-rate', type=float, default=.65)
    p.add_argument('--report', type=Path, required=True)
    a = p.parse_args()
    if a.step <= 0 or not 0 < a.boundary_lead < a.step or a.chunk_items < 1:
        p.error('Invalid render-grid chunk settings')
    # RVC configuration reads argv and relative model/config directories.
    source = a.rvc.resolve()
    for name in ('input', 'out', 'model', 'index', 'report'):
        setattr(a, name, getattr(a, name).resolve())
    os.chdir(source)
    sys.path.insert(0, str(source))
    sys.argv = [sys.argv[0]]
    os.environ['weight_root'] = str(a.model.parent)
    os.environ['rmvpe_root'] = str(source/'assets/rmvpe')
    os.environ['OPENBLAS_NUM_THREADS'] = '1'
    # Bounded offline chunks vary in length; avoid retaining several graph activation pools.
    os.environ['RVC_CUDA_GRAPH'] = '0'
    import numpy as np
    import soundfile as sf
    import torch
    import faiss
    from configs.config import Config
    from infer.vc.modules import VC
    torch.set_num_threads(4)
    faiss.omp_set_num_threads(4)
    torch.manual_seed(0)
    config = Config()
    print('RVC device:', config.device, 'precision:', config.dtype, flush=True)
    converter = VC(config)
    converter.get_vc(a.model.name)
    # Avoid rereading and reconstructing a 250 MB index for every short chunk.
    original_read = faiss.read_index
    class IndexView:
        def __init__(self, index):
            self.index = index
            self.ntotal = index.ntotal
            self.vectors = index.reconstruct_n(0, index.ntotal)
        def reconstruct_n(self, start, count):
            return self.vectors[start:start+count]
        def search(self, *args, **kwargs):
            return self.index.search(*args, **kwargs)
    cached = {}
    def read_index(path):
        if path not in cached:
            cached[path] = IndexView(original_read(path))
        return cached[path]
    faiss.read_index = read_index
    audio, sr = sf.read(a.input, dtype='float32', always_2d=True)
    audio = audio.mean(axis=1)
    seconds = len(audio)/sr
    rate = 24000
    output = np.zeros(round(seconds*rate), dtype=np.float32)
    edges = [0.0]
    item = a.chunk_items
    while item*a.step-a.boundary_lead < seconds:
        edges.append(item*a.step-a.boundary_lead)
        item += a.chunk_items
    edges.append(seconds)
    rows = []
    a.out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=a.out.parent) as temp:
        chunk = Path(temp)/'chunk.wav'
        for i, (start, end) in enumerate(zip(edges, edges[1:])):
            capture_start = max(0, start-.12)
            capture_end = min(seconds, end+.12)
            # Grid boundaries lie in rests; context keeps filtering/padding out of syllables.
            lo, hi = round(capture_start*sr), round(capture_end*sr)
            sf.write(chunk, audio[lo:hi], sr, subtype='PCM_16')
            status, result = converter.vc_single(0, str(chunk), 0, 'rmvpe', str(a.index), a.index_rate, rate, 1.0, .4)
            if not result or result[0] is None or result[1] is None:
                raise RuntimeError('RVC chunk failed: '+str(status))
            out_rate, samples = result
            if out_rate != rate:
                raise ValueError('Unexpected RVC sample rate')
            samples = np.asarray(samples)
            if samples.dtype.kind in 'iu':
                samples = samples.astype(np.float32)/32768
            expected = (hi-lo)/sr
            delta = len(samples)/rate-expected
            if abs(delta) > .05:
                raise ValueError(f'RVC changed chunk duration by {delta:.4f}s')
            at, stop = round(start*rate), round(end*rate)
            offset = round((start-lo/sr)*rate)
            core = samples[offset:offset+stop-at]
            output[at:at+len(core)] = core
            rows.append({'start': start, 'end': end, 'durationError': delta})
            print(f'Converted {i+1}/{len(edges)-1}: {end:.2f}/{seconds:.2f}s', flush=True)
    if not np.isfinite(output).all():
        raise ValueError('Non-finite RVC samples')
    sf.write(a.out, output, rate, subtype='PCM_16')
    a.report.write_text(json.dumps({'inputSeconds': seconds, 'outputSeconds': len(output)/rate, 'midi': 60, 'f0Method': 'rmvpe', 'f0UpKey': 0, 'indexRate': a.index_rate, 'protect': .4, 'chunks': rows}, indent=2), encoding='utf-8')
    print('EXPORTED', a.out, flush=True)


if __name__ == '__main__':
    main()
