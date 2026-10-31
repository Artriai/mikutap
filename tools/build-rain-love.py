"""Build the live Tianyi score from a full MP3, separated vocal and timed lyrics.
Offline prerequisites: Demucs htdemucs, faster-whisper small, Mandarin wav2vec2,
librosa, scipy, numpy, soundfile, pypinyin, torch and transformers.
Use: python tools/build-rain-love.py /absolute/work-directory [stage]
     python tools/build-rain-love.py --polish
Stage: transcribe, align, ctc, pitch, export, or all. Stages cache intermediate
analysis; no original recorded vocals are copied into the hosted application.
"""
from pathlib import Path
import json,re,sys,subprocess,os
os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY','1')
import numpy as np
try:
 import soundfile as sf
 from pypinyin import lazy_pinyin
except ImportError:
 sf=None;lazy_pinyin=None
ROOT=Path(__file__).resolve().parents[1]
BASE=Path(sys.argv[1]).resolve() if len(sys.argv)>1 and not sys.argv[1].startswith('--') else ROOT
def read(name):return json.loads((BASE/name).read_text())
def save(name,data):
 (BASE/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
def syllable(c):return lazy_pinyin(c)[0].replace('ü','v')
def wav(source,target):
 if not (BASE/target).exists():subprocess.run(['ffmpeg','-v','error','-y','-i',str(BASE/source),'-ac','1','-ar','16000',str(BASE/target)],check=True)
def transcribe():
 from faster_whisper import WhisperModel
 wav('source.mp3','source-16k.wav')
 model=WhisperModel(str(BASE/'models/whisper-small'),device='cpu',compute_type='int8',cpu_threads=4)
 # Array input avoids differing PyAV MP3 metadata APIs. VAD is disabled: its
 # speech assumptions can discard quiet sung phrases and long vowels.
 audio,_=sf.read(BASE/'source-16k.wav',dtype='float32')
 segments,_=model.transcribe(audio,language='zh',word_timestamps=True,vad_filter=False,condition_on_previous_text=False,beam_size=5)
 out=[]
 for s in segments:
  out.append({'start':s.start,'end':s.end,'words':[{'start':w.start,'end':w.end,'word':w.word,'probability':w.probability} for w in s.words]})
  print('recognition',round(s.end,1),flush=True)
 save('transcription.json',out)
def align():
 lines=[]
 for m in re.finditer(r'\[(\d+):(\d+\.\d+)\](.*)',(BASE/'source.lrc').read_text()):
  at=int(m[1])*60+float(m[2])
  if at>=15:lines.append((at,m[3].strip()))
 expected=[]
 for line,(at,text) in enumerate(lines):
  end=min(lines[line+1][0] if line+1<len(lines) else 237,at+10)
  for char in re.findall(r'[\u4e00-\u9fff]|Rainie\s*love',text,re.I):
   for p in ['lei','ni','la'] if char.lower().startswith('rainie') else [syllable(char)]:
    expected.append({'label':char,'syllable':p,'line':line,'lineStart':at,'lineEnd':end})
 observed=[]
 for segment in read('transcription.json'):
  for word in segment['words']:
   if not 14<word['start']<237:continue
   chars=re.findall('[\u4e00-\u9fff]',word['word'])
   if chars:
    for j,char in enumerate(chars):
     observed.append({'label':char,'syllable':syllable(char),'start':word['start']+(word['end']-word['start'])*j/len(chars),'end':word['start']+(word['end']-word['start'])*(j+1)/len(chars),'probability':word['probability']})
   else:
    token=word['word'].strip().lower()
    if token not in ['r','ain','y','long','love']:continue
    if token=='ain' and observed and observed[-1]['syllable']=='lei':observed[-1]['end']=word['end'];continue
    observed.append({**word,'label':token,'syllable':{'r':'lei','ain':'lei','y':'ni','long':'la','love':'la'}[token]})
 n,m=len(expected),len(observed);dp=np.full((n+1,m+1),np.inf);back=np.zeros((n+1,m+1),np.uint8);dp[0,0]=0
 for i in range(n+1):
  for j in range(m+1):
   v=dp[i,j]
   if i<n and v+.85<dp[i+1,j]:dp[i+1,j]=v+.85;back[i+1,j]=1
   if j<m and v+.75<dp[i,j+1]:dp[i,j+1]=v+.75;back[i,j+1]=2
   if i<n and j<m:
    a,b=expected[i],observed[j];distance=max(0,a['lineStart']-1.4-b['start'],b['start']-a['lineEnd']+.2)
    cost=(0 if a['syllable']==b['syllable'] else .58)+distance*1.2
    if v+cost<dp[i+1,j+1]:dp[i+1,j+1]=v+cost;back[i+1,j+1]=3
 i,j=n,m;matched={}
 while i or j:
  b=back[i,j]
  if b==3:matched[i-1]=observed[j-1];i-=1;j-=1
  elif b==1:i-=1
  elif b==2:j-=1
  else:raise ValueError('Unresolved lyric alignment')
 for i,e in enumerate(expected):
  if i in matched:continue
  left=next((k for k in range(i-1,-1,-1) if k in matched and expected[k]['line']==e['line']),None)
  right=next((k for k in range(i+1,n) if k in matched and expected[k]['line']==e['line']),None)
  start=matched[left]['end'] if left is not None else e['lineStart']-.5
  end=matched[right]['start'] if right is not None else min(e['lineEnd']-.5,start+.6)
  if end-start<.12:
   if left is not None:start=max(matched[left]['start']+.06,end-.18);matched[left]['end']=start
   else:end=start+.2
  count=(right if right is not None else i+1)-(left if left is not None else i-1)-1;span=max(.12,end-start)/max(1,count)
  for k in range(i,i+max(1,count)):
   if k not in matched:matched[k]={'start':start+(k-i)*span,'end':start+(k-i+1)*span,'syllable':expected[k]['syllable'],'probability':0,'label':'inferred'}
 records=[{**e,**{k:matched[i][k] for k in ['start','end','probability']},'asr':matched[i]['syllable'],'inferred':matched[i]['label']=='inferred'} for i,e in enumerate(expected)]
 save('aligned.json',records);print('aligned',n,'inferred',sum(r['inferred'] for r in records),flush=True)
def ctc():
 wav('separated/htdemucs/source/vocals.wav','vocals-16k.wav')
 import torch
 from transformers import Wav2Vec2ForCTC,Wav2Vec2Config,Wav2Vec2Processor
 from scipy.special import logsumexp
 torch.set_num_threads(4);path=BASE/'models/aligner'
 processor=Wav2Vec2Processor.from_pretrained(path,local_files_only=True)
 model=Wav2Vec2ForCTC(Wav2Vec2Config.from_pretrained(path,local_files_only=True))
 model.load_state_dict(torch.load(path/'pytorch_model.bin',map_location='cpu',weights_only=True));model.eval()
 records=read('aligned.json');vocab=processor.tokenizer.get_vocab();blank=model.config.pad_token_id;classes={}
 for char,idx in vocab.items():
  if len(char)==1 and '\u4e00'<=char<='\u9fff':classes.setdefault(syllable(char),[]).append(idx)
 audio,sr=sf.read(BASE/'vocals-16k.wav',dtype='float32');out=[dict(r) for r in records]
 for line in sorted(set(r['line'] for r in records)):
  ids=[i for i,r in enumerate(records) if r['line']==line and not r['label'].lower().startswith('rainie')];rows=[records[i] for i in ids]
  start=max(0,min(r['start'] for r in rows)-.35);end=max(r['end'] for r in rows)+.55
  english=[r for r in records if r['line']==line and r['label'].lower().startswith('rainie')]
  if english:end=min(end,min(r['start'] for r in english))
  inputs=processor(audio[int(start*sr):int(end*sr)],sampling_rate=sr,return_tensors='pt')
  with torch.inference_mode():logits=model(inputs.input_values).logits[0].log_softmax(-1).numpy()
  times=np.arange(len(logits))/len(logits)*(end-start)+start;labels=[blank]
  for r in rows:labels.extend([vocab.get(r['label'],processor.tokenizer.unk_token_id),blank])
  emit=logits[:,labels].copy()
  for j,r in enumerate(rows):
   emit[:,2*j+1]=logsumexp(logits[:,classes.get(r['syllable'],[labels[2*j+1]])],axis=1)
   emit[(times<r['start']-.4)|(times>r['end']+.5),2*j+1]=-1000
  T,S=emit.shape;dp=np.full(S,-1e9);dp[0]=emit[0,0];dp[1]=emit[0,1];paths=np.zeros((T,S),np.uint8)
  for t in range(1,T):
   choices=np.stack([dp,np.r_[-1e9,dp[:-1]],np.r_[[-1e9,-1e9],dp[:-2]]])
   for s in range(S):
    if s%2==0 or (s>=2 and labels[s]==labels[s-2]):choices[2,s]=-1e9
   pick=choices.argmax(axis=0);dp=choices[pick,np.arange(S)]+emit[t];paths[t]=pick
  state=S-1 if dp[-1]>=dp[-2] else S-2;trace=np.empty(T,int)
  for t in range(T-1,-1,-1):trace[t]=state;state-=int(paths[t,state])
  for j,idx in enumerate(ids):
   frames=np.where(trace==2*j+1)[0];out[idx]['ctcStart']=float(times[frames[0]]);out[idx]['ctcEnd']=float(times[frames[-1]]+(end-start)/T)
  print('ctc',line,flush=True)
 save('aligned-ctc.json',out)
def pitch():
 wav('separated/htdemucs/source/vocals.wav','vocals-16k.wav')
 import librosa
 x,sr=sf.read(BASE/'vocals-16k.wav',dtype='float32');arrays=[]
 for a in range(0,len(x),sr*20):
  y=x[max(0,a-sr):min(len(x),a+sr*21)]
  f,_,p=librosa.pyin(y,fmin=librosa.note_to_hz('B2'),fmax=librosa.note_to_hz('D6'),sr=sr,frame_length=1024,hop_length=160,fill_na=np.nan)
  times=librosa.times_like(f,sr=sr,hop_length=160)+max(0,a-sr)/sr;keep=(times>=a/sr)&(times<min(len(x),a+sr*20)/sr)
  arrays.append(np.array([times[keep],f[keep],p[keep]]).T);print('pitch',round(min(len(x),a+sr*20)/sr),flush=True)
 np.save(BASE/'pitch.npy',np.concatenate(arrays))
def export():
 import librosa
 from scipy.ndimage import median_filter
 records=read('aligned-ctc.json');pitch=np.load(BASE/'pitch.npy');audio,sr=sf.read(BASE/'vocals-16k.wav');duration=len(audio)/sr
 flux=librosa.onset.onset_strength(y=audio,sr=sr,hop_length=80,n_fft=512);ft=librosa.times_like(flux,sr=sr,hop_length=80);starts=[]
 for i,r in enumerate(records):
  center=r.get('ctcStart',r['start']+.13)-.13
  continuous=i>0 and r['start']-records[i-1]['end']<.25
  # CTC emissions can occur at the END of a long sung vowel. Keep its
  # recognizer onset when the emission is late inside a continuous phrase.
  if (continuous and r['end']-r['start']>.6 and center>r['start']+.32) or r.get('ctcStart',r['start'])>r['end']+.08:center=r['start']+.06
  candidates=np.where((ft>=center-.075)&(ft<=center+.075))[0]
  if len(candidates):
   quality=flux[candidates]/(1+np.abs(ft[candidates]-center)/.04)
   if quality.max()>.35:center=float(ft[candidates[np.argmax(quality)]])
  starts.append(max(0,center))
 for i in range(1,len(starts)):starts[i]=max(starts[i],starts[i-1]+.055)
 notes=[];failures=[]
 for i,r in enumerate(records):
  start=starts[i];nextStart=starts[i+1] if i+1<len(starts) else duration;lastCandidate=max(r['end'],r.get('ctcEnd',0));limit=min(nextStart-.012,lastCandidate+1.45)
  frames=pitch[(pitch[:,0]>=start)&(pitch[:,0]<=limit)];voiced=np.isfinite(frames[:,1])&(frames[:,2]>.45)
  if not voiced.any():
   nearby=pitch[(pitch[:,0]>=start-.1)&(pitch[:,0]<=lastCandidate+.2)&np.isfinite(pitch[:,1])]
   if not len(nearby):failures.append(i);midi=64
   else:midi=float(np.median(librosa.hz_to_midi(nearby[:,1])));midi=midi+12 if midi<58 else midi
   end=min(nextStart-.012,max(start+.1,lastCandidate));points=[{'time':0,'midi':round(midi,2)}]
  else:
   active=frames[voiced];last=float(active[-1,0]);run=0
   for f in frames[frames[:,0]>=lastCandidate-.08]:
    run=run+1 if not np.isfinite(f[1]) or f[2]<.3 else 0
    if run>=10:last=min(last,float(f[0])-.09);break
   end=min(nextStart-.012,max(start+.08,last+.055))
   if nextStart-end<.12:end=nextStart-.012
   selected=active[(active[:,0]<=end)&(active[:,0]>=start+.04)]
   if not len(selected):selected=active
   tt=selected[:,0];mm=librosa.hz_to_midi(selected[:,1]);mm=np.where(mm<58,mm+12,mm);mm=np.clip(mm,58,76)
   for k in range(1,len(mm)-1):
    if abs(mm[k]-mm[k-1])>8 and abs(mm[k+1]-mm[k-1])<3:mm[k]=mm[k-1]
   mm=median_filter(mm,size=min(5,len(mm)//2*2+1),mode='nearest');grid=np.arange(start,end-.009,.05);curve=np.interp(grid,tt,mm);points=[]
   for at,v in zip(grid,curve):
    point={'time':round(float(at-start),5),'midi':round(float(v),2)}
    if not points or abs(point['midi']-points[-1]['midi'])>=.045:points.append(point)
   midi=points[0]['midi']
  note={'time':round(start,5),'duration':round(end-start,5),'syllable':r['syllable'],'midi':midi,'velocity':.88,'visual':i%32,'phrase':r['line'],'pitches':points}
  if note['duration']<=.04:raise ValueError(('short note',i))
  notes.append(note)
 score={'title':'雨爱','voice':'tianyi','engine':'natural','articulation':'legato','duration':round(duration,5),'accompaniment':{'path':'assets/songs/rain-love-instrumental.mp3','gain':.48},'notes':notes,'source':{'song':'杨丞琳 / 雨爱','composer':'金大洲','lyricist':'Wonderful','audioUrl':'https://2110-rainie-yang.mp3.pm/song/128260436-yu-ai/','method':'Complete MP3; local Demucs separation, Whisper recognition, constrained Mandarin CTC alignment, pYIN pitch extraction with phrase Viterbi/parallel-section octave continuity; live Tianyi syllable PSOLA sampler. No original recorded vocals shipped.'}}
 # Keep three seconds of lead-in; accompaniment stays at its original offset.
 cut=round(notes[0]['time']-3,5)
 score['introTrim']=cut;score['originalDuration']=score['duration']
 score['duration']=round(score['duration']-cut,5);score['accompaniment']['offset']=cut
 for note in notes:note['time']=round(note['time']-cut,5)
 repair_melody(score)
 (ROOT/'dist/songs/rain-love.json').write_text(json.dumps(score,ensure_ascii=False,separators=(',',':')))
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(BASE/'separated/htdemucs/source/no_vocals.wav'),'-codec:a','libmp3lame','-b:a','160k','-map_metadata','-1',str(ROOT/'dist/assets/songs/rain-love-instrumental.mp3')],check=True)
 print(json.dumps({'syllables':len(notes),'phonemes':len(set(n['syllable'] for n in notes)),'duration':score['duration'],'first':notes[0]['time'],'last':notes[-1]['time']+notes[-1]['duration'],'noVoicing':failures,'pitchPoints':sum(len(n['pitches']) for n in notes)}),flush=True)

PARALLEL_PHRASES=[[0,19],[1,20],[2,21],[3,22],[4,23],[5,24],[6,25],[7,26],[8,27],[9,28],[10,29],[11,30],[12,31],[13,32],[14,33,38],[15,34,39],[16,35,40],[17,36,41],[18,37,42]]
def repair_melody(score):
 """Repair pYIN subharmonic octave drops (58.3..61.2 vs 70.3..73.2), intra-note
 octave splits, and accompaniment bleed using phrase Viterbi continuity and
 parallel-section consensus while preserving low B3/C#4 verse phrases and 71->64 melismas."""
 notes=score['notes'];by_phrase={}
 for n in notes:by_phrase.setdefault(n['phrase'],[]).append(n)
 for pid,pnotes in by_phrase.items():
  pmed=float(np.median([p['midi'] for pn in pnotes for p in pn['pitches']]))
  for n in pnotes:
   pts=n['pitches'];vals=np.array([p['midi'] for p in pts],dtype=float);hi,lo=float(vals.max()),float(vals.min());changed=False
   if pmed<62.5 and hi>=68.0 and lo<62.0:
    for k in range(len(vals)):
     if vals[k]>=67.5:vals[k]=round(vals[k]-12.0 if vals[k]-12.0>=58.0 else lo,2);changed=True
   elif hi>=66.5 and lo<61.0 and (hi-lo)>=7.2 and abs((lo+12.0)-hi)<=5.0:
    for k in range(len(vals)):
     if vals[k]<61.5 and (hi-vals[k])>=6.5:vals[k]=round(min(74.5,vals[k]+12.0),2);changed=True
   if changed:
    for p,nv in zip(pts,vals):p['midi']=round(float(nv),2)
    n['midi']=pts[0]['midi']
 ref_pitch={}
 for grp in PARALLEL_PHRASES:
  if any(pid not in by_phrase for pid in grp):continue
  lengths=[len(by_phrase[pid]) for pid in grp]
  if len(set(lengths))==1:
   L=lengths[0];avg_pmed=float(np.mean([np.median([p['midi'] for pn in by_phrase[pid] for p in pn['pitches']]) for pid in grp]))
   for pos in range(L):
    meds=[float(np.median([p['midi'] for p in by_phrase[pid][pos]['pitches']])) for pid in grp]
    if avg_pmed<62.5:
     lo_m=[m for m in meds if m<64.0]
     if lo_m and (max(meds)-min(lo_m))>=4.2:
      c=float(np.median(lo_m))
      for pid in grp:ref_pitch[(pid,pos)]=c
    else:
     hi_m=[m for m in meds if m>=64.5]
     if hi_m and (max(hi_m)-min(meds))>=4.2:
      c=float(np.median(hi_m))
      for pid in grp:ref_pitch[(pid,pos)]=c
 for pid,pnotes in sorted(by_phrase.items()):
  L=len(pnotes);meds=[float(np.median([p['midi'] for p in n['pitches']])) for n in pnotes];candidates=[]
  for pos,n in enumerate(pnotes):
   m=meds[pos];cands=[(0.0,m)]
   if m<61.2 and m+12.0<=74.5:cands.append((12.0,m+12.0))
   if (pid,pos) in ref_pitch:
    tgt=ref_pitch[(pid,pos)]
    if abs(tgt-m)>=4.0 and all(abs(tgt-cv)>1.8 for _,cv in cands):cands.append((round(tgt-m,2),tgt))
   candidates.append(cands)
  dp=[{} for _ in range(L)];back=[{} for _ in range(L)]
  for ci,(sh,val) in enumerate(candidates[0]):
   dp[0][ci]=(0.0 if sh==0 else 1.4)+(abs(val-ref_pitch[(pid,0)])*1.1 if (pid,0) in ref_pitch else 0.0);back[0][ci]=None
  for pos in range(1,L):
   gap=pnotes[pos]['time']-(pnotes[pos-1]['time']+pnotes[pos-1]['duration'])
   sub_break=(gap>=0.12) or (L==10 and pos==5)
   for ci,(sh,val) in enumerate(candidates[pos]):
    nc=(0.0 if sh==0 else 1.4)+(abs(val-ref_pitch[(pid,pos)])*1.1 if (pid,pos) in ref_pitch else 0.0)
    bc,bp=1e9,0
    for pi,(_,pval) in enumerate(candidates[pos-1]):
     jmp=abs(val-pval);c=dp[pos-1][pi]+jmp*(0.25 if sub_break else 0.65)+(max(0.0,jmp-6.0)**2)*(0.12 if sub_break else 0.45)+nc
     if c<bc:bc,bp=c,pi
    dp[pos][ci]=bc;back[pos][ci]=bp
  cur=min(dp[L-1],key=lambda k:dp[L-1][k]);chosen=[0]*L
  for pos in range(L-1,-1,-1):chosen[pos]=cur;cur=back[pos][cur]
  for pos,ci in enumerate(chosen):
   sh,_=candidates[pos][ci]
   if abs(sh)>0.1:
    n=pnotes[pos]
    for p in n['pitches']:p['midi']=round(min(75.5,max(58.0,p['midi']+sh)),2)
    n['midi']=n['pitches'][0]['midi']
 for pid in (12,31):
  pnotes=by_phrase.get(pid,[])
  if len(pnotes)>=3 and [n['syllable'] for n in pnotes[-3:]]==['lei','ni','la']:
   for n,tgt in zip(pnotes[-3:],[64.2,65.8,64.0]):
    om=float(np.median([p['midi'] for p in n['pitches']]))
    if abs(om-tgt)>3.0:
     for p in n['pitches']:p['midi']=round(tgt+(p['midi']-om)*0.25,2)
     n['midi']=n['pitches'][0]['midi']
 for n in notes:
  vals=np.array([p['midi'] for p in n['pitches']],dtype=float)
  if vals.max()-vals.min()>8.2:
   med=float(np.median(vals))
   for p in n['pitches']:
    if abs(p['midi']-med)>4.2:p['midi']=round(med+float(np.sign(p['midi']-med))*2.5,2)
   n['midi']=n['pitches'][0]['midi']
 return score

def polish_existing():
 path=ROOT/'dist/songs/rain-love.json'
 score=json.loads(path.read_text(encoding='utf-8'))
 repair_melody(score)
 path.write_text(json.dumps(score,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 print('Polished',path,'notes=',len(score['notes']))

if __name__=='__main__':
 if len(sys.argv)>1 and sys.argv[1]=='--polish':
  polish_existing()
 else:
  stages={'transcribe':transcribe,'align':align,'ctc':ctc,'pitch':pitch,'export':export};stage=sys.argv[2] if len(sys.argv)>2 else 'all'
  for name,fn in stages.items():
   if stage in ['all',name]:fn()
