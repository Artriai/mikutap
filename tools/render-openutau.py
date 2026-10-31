#!/usr/bin/env python3
"""Render USTX through a local OpenUTAU .NET 10 build without automating the editor UI."""
import argparse
import os
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', type=Path)
    parser.add_argument('--app', type=Path, required=True, help='Extracted OpenUTAU directory')
    parser.add_argument('--singers', type=Path, required=True, help='Directory containing installed singer folders')
    parser.add_argument('--out', type=Path, required=True, help='Export stem; OpenUTAU appends the track name')
    parser.add_argument('--dotnet', default='dotnet', help='Path to a .NET 10 SDK dotnet executable')
    parser.add_argument('--work', type=Path, default=ROOT/'renders/openutau-helper')
    parser.add_argument('--alignment-only', action='store_true', help='Export native phoneme timing without running the acoustic renderer')
    parser.add_argument('--max-consonant-lead', type=float, help='For generated JSON USTX projects, cap pre-beat consonant duration in seconds')
    args = parser.parse_args()
    if not args.project.is_file() or not (args.app/'OpenUtau.Core.dll').is_file():
        parser.error('Project or OpenUTAU application DLL not found')
    env = {**os.environ, 'DOTNET_CLI_TELEMETRY_OPTOUT': '1', 'DOTNET_SKIP_FIRST_TIME_EXPERIENCE': '1'}
    if not subprocess.check_output([args.dotnet, '--list-sdks'], text=True, env=env).strip():
        parser.error('A .NET 10 SDK is required; an installed runtime alone cannot build the helper')
    args.work.mkdir(parents=True, exist_ok=True)
    for name in ('Program.cs', 'OpenUtauRender.csproj'):
        shutil.copyfile(ROOT/'tools/openutau-render'/name, args.work/name)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([args.dotnet, 'build', str(args.work/'OpenUtauRender.csproj'), '-c', 'Release', '--nologo', '-p:OpenUtauDir='+str(args.app.resolve())], check=True, env=env)
    dll = args.work/'bin/Release/net10.0-windows/OpenUtauRender.dll'
    command = [args.dotnet, str(dll.resolve()), str(args.app.resolve()), str(args.project.resolve()), str(args.out.resolve()), str(args.singers.resolve())]
    if args.max_consonant_lead is not None:
        if not 0 < args.max_consonant_lead <= .2:
            parser.error('--max-consonant-lead must be in (0, .2] seconds')
        subprocess.run(command+['alignment-only'], check=True, env=env)
        timing = json.loads(Path(str(args.out)+'.alignment.json').read_text(encoding='utf-8'))
        project = json.loads(args.project.read_text(encoding='utf-8'))
        if project.get('resolution', 480) != 480 or project.get('tempos') != [{'position': 0, 'bpm': 120}]:
            parser.error('Consonant capping requires a generated fixed-120-BPM render project')
        adjusted = 0
        for part in project['voice_parts']:
            for note in part['notes']:
                start = (part['position']+note['position'])/960
                row = next((r for r in timing if abs(r['start']-start) < .001 and r['lyric'] == note['lyric']), None)
                if not row or len(row['phones']) < 2:
                    continue
                lead = start-row['phones'][0]['start']
                if lead > args.max_consonant_lead:
                    overrides = note.setdefault('phoneme_overrides', [])
                    current = next((v for v in overrides if v['index'] == 0), None)
                    if current is None:
                        current = {'index': 0, 'offset': 0}
                        overrides.append(current)
                    current['offset'] = current.get('offset', 0)+round((lead-args.max_consonant_lead)*960)
                    adjusted += 1
        capped = args.work/'capped.ustx'
        capped.write_text(json.dumps(project, ensure_ascii=False), encoding='utf-8')
        command[3] = str(capped.resolve())
        print('Capped consonant leads:', adjusted, flush=True)
    if args.alignment_only:
        command.append('alignment-only')
    subprocess.run(command, check=True, env=env)


if __name__ == '__main__':
    main()
