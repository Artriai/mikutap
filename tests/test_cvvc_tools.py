"""Offline tooling regression: exact grids, OTO units/cutoffs, encoded sprite offsets."""
import array
import importlib.util
import json
import math
import shutil
import sys
import tempfile
import unittest
import wave
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'tools'))
from cvvc_bank import dump, decode, pcm_bytes, merge_manifest


def module(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT/'tools'/f'{name}.py')
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


prepare = module('prepare-tianyi-cvvc')
build = module('build-miku-vcv')
slice_bank = module('slice-tianyi-cvvc')


def wav(path, duration, rate=24000):
    audio = array.array('h', (round(9000*math.sin(2*math.pi*261.625565*i/rate)) for i in range(round(duration*rate))))
    with wave.open(str(path), 'wb') as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(pcm_bytes(audio))


class ToolTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT.parent)
        self.path = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_generated_projects_have_exact_notes_and_render_grid(self):
        self.assertEqual(prepare.prepare(self.path, ROOT/'dist/catalog.json'), (409, 192))
        base = json.loads((self.path/'tianyi-base-plan.json').read_text(encoding='utf-8'))
        pairs = json.loads((self.path/'tianyi-vc-plan.json').read_text(encoding='utf-8'))
        self.assertEqual(base['notes'][408]['start'], 448.8)
        self.assertTrue(all(n['duration'] == .85 for n in base['notes']))
        self.assertEqual(len({p['key'] for p in pairs['pairs']}), 192)
        for name, count in [('tianyi-base-409', 409), ('tianyi-vc-192', 384)]:
            ustx = json.loads((self.path/f'{name}.ustx').read_text(encoding='utf-8'))
            self.assertEqual(ustx['resolution'], 480)
            notes = ustx['voice_parts'][0]['notes']
            self.assertEqual(len(notes), count)
            self.assertTrue(all(n['tone'] == 60 and n['vibrato']['length'] == 0 for n in notes))
            midi = (self.path/f'{name}.mid').read_bytes()
            self.assertEqual(midi[:4], b'MThd')
            self.assertEqual(midi.count(b'\x90\x3c\x60'), count)

    @unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg required for encoded audio checks')
    def test_oto_negative_cutoff_units_and_multisprite_manifest_merge(self):
        source = self.path/'C4'
        source.mkdir()
        wav(source/'tone.wav', 1)
        (source/'oto.ini').write_text('tone.wav=a かC4,100,140,-360,100,30\ntone.wav=a しC4,500,140,100,100,30\n', encoding='utf-8')
        dist = self.path/'dist'
        count, size = build.build(source, dist)
        self.assertEqual(count, 2)
        self.assertLess(size, 8*1024*1024)
        manifest = json.loads((dist/'transitions.json').read_text(encoding='utf-8'))
        ka, shi = manifest['miku']['a_ka'], manifest['miku']['a_shi']
        self.assertEqual(ka['preutterance'], .1)
        self.assertEqual(ka['overlap'], .03)
        self.assertAlmostEqual(ka['duration'], .24)
        self.assertGreater(shi['start'], ka['start']+ka['duration'])
        self.assertEqual(ka['sprite'], shi['sprite'])
        audio = decode(dist/ka['sprite'])
        self.assertGreater(len(audio)/24000, shi['start']+shi['duration'])
        merge_manifest(dist, 'tianyi', {})
        self.assertEqual(json.loads((dist/'transitions.json').read_text(encoding='utf-8'))['miku'], manifest['miku'])

    @unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg required for export checks')
    def test_vc_slice_reports_grid_offset_and_rejects_short_exports(self):
        plan = self.path/'plan.json'
        dump(plan, {'version': 1, 'bank': 'tianyi', 'kind': 'vc', 'baseMidi': 60, 'pairs': [{'key': 'a_b', 'ending': 'a', 'start': 0, 'duration': .9, 'boundary': .45}]})
        wav(self.path/'voice.wav', 1)
        result = slice_bank.slice_bank(plan, self.path/'voice.wav', self.path/'dist', offset=.1, refine=False)
        self.assertEqual(result['vcEntries'], 1)
        self.assertEqual(result['alignment'][0]['boundary'], .55)
        meta = json.loads((self.path/'dist/transitions.json').read_text())['tianyi']['a_b']
        self.assertEqual(meta['duration'], .18)
        self.assertEqual(meta['preutterance'], .095)
        with self.assertRaisesRegex(ValueError, 'too short'):
            slice_bank.slice_bank(plan, self.path/'voice.wav', self.path/'dist', offset=.2)

    @unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg required for export checks')
    def test_sung_base_updates_only_program_bank_and_preserves_manual_catalog(self):
        dist = self.path/'dist'
        catalog = {'tianyi': {'phonemes': {'ba': {'path': 'old.wav'}}, 'originalBank': {'samples': [{'id': 1, 'path': 'manual.mp3'}]}}}
        dump(dist/'catalog.json', catalog)
        dump(self.path/'base.json', {'version': 1, 'bank': 'tianyi', 'kind': 'base', 'baseMidi': 60, 'notes': [{'start': 0, 'duration': .85, 'syllable': 'ba', 'filename': 'ba.wav'}]})
        wav(self.path/'base.wav', .9)
        slice_bank.slice_bank(self.path/'base.json', self.path/'base.wav', dist)
        updated = json.loads((dist/'catalog.json').read_text(encoding='utf-8'))
        self.assertEqual(updated['tianyi']['originalBank'], catalog['tianyi']['originalBank'])
        self.assertEqual(updated['tianyi']['phonemes']['ba']['expandedPath'], 'assets/tianyi-full/ba.wav')
        with wave.open(str(dist/'assets/tianyi-full/ba.wav')) as audio:
            self.assertEqual(audio.getnframes(), 20400)

    def test_failed_budget_does_not_replace_live_manifest(self):
        dump(self.path/'transitions.json', {'version': 1, 'miku': {}, 'tianyi': {}})
        target = self.path/'huge.mp3'
        with target.open('wb') as f:
            f.truncate(8*1024*1024+1)
        before = (self.path/'transitions.json').read_bytes()
        with self.assertRaisesRegex(ValueError, 'exceed'):
            merge_manifest(self.path, 'miku', {'a_ka': {'sprite': target.name}})
        self.assertEqual((self.path/'transitions.json').read_bytes(), before)

    @unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg required for OTO checks')
    def test_unusable_oto_entry_falls_back_without_disabling_valid_neighbors(self):
        source = self.path/'C4'
        source.mkdir()
        wav(source/'tone.wav', 1)
        (source/'oto.ini').write_text('tone.wav=a かC4,100,140,-360,100,30\ntone.wav=i かC4,500,200,400,200,30\n', encoding='utf-8')
        with warnings.catch_warnings(record=True) as skipped:
            warnings.simplefilter('always')
            count, _ = build.build(source, self.path/'dist')
        self.assertEqual(count, 1)
        self.assertTrue(any('no usable vowel' in str(w.message) for w in skipped))

    @unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg required for export checks')
    def test_native_timing_keeps_the_prebeat_initial_consonant_in_base_sample(self):
        dist = self.path/'dist'
        dump(dist/'catalog.json', {'tianyi': {'phonemes': {'ba': {'path': 'old.wav'}}}})
        dump(self.path/'base.json', {'version': 1, 'bank': 'tianyi', 'kind': 'base', 'baseMidi': 60, 'notes': [{'start': .2, 'duration': .7, 'syllable': 'ba', 'lyric': 'ba', 'filename': 'ba.wav'}]})
        wav(self.path/'base.wav', 1)
        alignment = [{'start': .2, 'lyric': 'ba', 'phones': [{'start': .1, 'error': False}, {'start': .2, 'error': False}]}]
        slice_bank.slice_bank(self.path/'base.json', self.path/'base.wav', dist, alignment=alignment)
        with wave.open(str(dist/'assets/tianyi-full/ba.wav')) as audio:
            self.assertEqual(audio.getnframes(), round(.805*24000))
        updated = json.loads((dist/'catalog.json').read_text(encoding='utf-8'))
        self.assertAlmostEqual(updated['tianyi']['phonemes']['ba']['duration'], .805)


if __name__ == '__main__':
    unittest.main()
