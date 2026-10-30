from pathlib import Path
import struct,re,json,sys
p=Path(sys.argv[1]);data=p.read_bytes();pos=0
assert data[:4]==b'MThd';size=struct.unpack_from('>I',data,4)[0];fmt,tracks,ppq=struct.unpack_from('>HHH',data,8);pos=8+size
print('header',fmt,tracks,ppq);parsed=[];tempos=[]
def vlq():
 global pos
 v=0
 while True:
  b=data[pos];pos+=1;v=v*128+(b&127)
  if not b&128:return v
for t in range(tracks):
 assert data[pos:pos+4]==b'MTrk';length=struct.unpack_from('>I',data,pos+4)[0];pos+=8;end=pos+length;tick=0;running=0;chunks=[];name=''
 while pos<end:
  tick+=vlq();status=data[pos];pos+=1
  if status<128:pos-=1;status=running
  elif status<240:running=status
  if status==255:
   kind=data[pos];pos+=1;n=vlq();raw=data[pos:pos+n];pos+=n
   if kind==3:name=raw.decode('cp932',errors='replace')
   if kind==81:tempos.append([tick,int.from_bytes(raw,'big')])
   if kind==1 and raw.startswith(b'DM:'):chunks.append(raw[8:])
  elif status in (240,247):pos+=vlq()
  else:pos+=1 if status>>4 in (12,13) else 2
 raw=b''.join(chunks)
 if not raw:continue
 try:text=raw.decode('utf-8-sig')
 except:text=raw.decode('cp932',errors='replace')
 sections={};current={}
 for line in text.splitlines():
  if line.startswith('[') and line.endswith(']'):current={};sections[line[1:-1]]=current
  elif '=' in line:key,value=line.split('=',1);current[key]=value
 events=sections.get('EventList',{});notes=[]
 for time,ids in events.items():
  if not time.isdigit():continue
  for id in ids.split(','):
   note=sections.get(id,{})
   if note.get('Type')=='Anote':notes.append({'tick':int(time),**note,'lyric':sections.get(note.get('LyricHandle',''),{}).get('L0','')})
 entry={'track':t,'name':name,'sections':sections,'notes':notes};parsed.append(entry)
 print({'track':t,'name':name,'common':sections.get('Common'),'master':sections.get('Master'),'notes':len(notes),'first':notes[0]['tick'] if notes else None,'end':max(int(n['tick'])+int(n['Length']) for n in notes) if notes else None,'pitchRange':[min(int(n['Note#']) for n in notes),max(int(n['Note#']) for n in notes)] if notes else None})
print('tempos',tempos[:20]);p.with_name('parsed-vsq.json').write_text(json.dumps({'ppq':ppq,'tempos':tempos,'tracks':parsed},ensure_ascii=False))
