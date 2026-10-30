/* Standard MIDI files, formats 0/1 with PPQ time division. No dependencies. */
export function readMidi(data,{track,channel,voice='miku',syllables=['a']}={}){
 const bytes=data instanceof Uint8Array?data:new Uint8Array(data),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let pos=0;
 function require(n){if(pos+n>bytes.length)throw Error('MIDI 文件已截断');}
 function byte(){require(1);return bytes[pos++];}
 function u16(){require(2);const value=view.getUint16(pos);pos+=2;return value;}
 function u32(){require(4);const value=view.getUint32(pos);pos+=4;return value;}
 function tag(){return String.fromCharCode(byte(),byte(),byte(),byte());}
 function variable(){let value=0;for(let i=0;i<4;i++){const b=byte();value=value*128+(b&127);if(!(b&128))return value;}throw Error('无效的 MIDI 可变长度整数');}
 if(tag()!=='MThd')throw Error('不是标准 MIDI 文件');const header=u32();if(header<6)throw Error('无效的 MIDI 文件头');
 const format=u16(),count=u16(),division=u16();if(format>1||division&0x8000||!division)throw Error('仅支持格式 0／1、PPQ 计时的 MIDI');pos+=header-6;require(0);
 const tempos=[{tick:0,micros:500000}],tracks=[];
 for(let t=0;t<count;t++){
  if(tag()!=='MTrk')throw Error('缺少 MIDI 音轨');const length=u32(),end=pos+length;require(length);
  let tick=0,running=0;const notes=[],active=new Map();
  while(pos<end){
   tick+=variable();let status=byte();
   if(status<128){if(!running)throw Error('无效的 MIDI running status');pos--;status=running;}
   else if(status<240)running=status;else running=0;
   if(status===255){const type=byte(),len=variable();require(len);if(type===81&&len===3)tempos.push({tick,micros:bytes[pos]*65536+bytes[pos+1]*256+bytes[pos+2]});pos+=len;}
   else if(status===240||status===247){const len=variable();require(len);pos+=len;}
   else if(status>=240)throw Error('不支持的 MIDI 系统事件');
   else{
    const kind=status>>4,ch=status&15,a=byte(),b=(kind===12||kind===13)?0:byte();
    if(channel!==undefined&&ch!==channel)continue;
    const key=ch+':'+a;
    if(kind===9&&b>0){if(!active.has(key))active.set(key,[]);active.get(key).push({tick,midi:a,velocity:b/127,channel:ch});}
    else if(kind===8||(kind===9&&b===0)){const note=active.get(key)?.shift();if(note&&tick>note.tick)notes.push({...note,end:tick});}
   }
   if(pos>end)throw Error('MIDI 事件超出音轨边界');
  }
  tracks.push(notes.sort((a,b)=>a.tick-b.tick));pos=end;
 }
 // Format 1 usually stores tempo separately from the melody track.
 tempos.sort((a,b)=>a.tick-b.tick);const timeline=[];let seconds=0,last=0,micros=500000;
 for(const event of tempos){seconds+=(event.tick-last)/division*micros/1e6;last=event.tick;micros=event.micros;if(!micros)throw Error('无效 MIDI 速度');timeline.push({tick:last,seconds,micros});}
 function toSeconds(tick){let event=timeline[0];for(const candidate of timeline){if(candidate.tick>tick)break;event=candidate;}return event.seconds+(tick-event.tick)/division*event.micros/1e6;}
 if(track!==undefined&&(!Number.isInteger(track)||!tracks[track]))throw Error('MIDI 音轨不存在');
 const selected=track??tracks.findIndex(notes=>notes.some(n=>n.channel!==9));
 const notes=(tracks[selected]||[]).filter(n=>channel!==undefined||n.channel!==9);
 if(!notes.length)throw Error('选中的 MIDI 音轨没有音符');
 if(!Array.isArray(syllables)||!syllables.length||syllables.some(s=>typeof s!=='string'))throw Error('syllables 需要非空音节数组');
 if(syllables.length!==1&&syllables.length!==notes.length)throw Error('请为每个音符提供一个音节，或提供单个音节循环演奏');
 return {voice,notes:notes.map((n,i)=>({time:toSeconds(n.tick),duration:toSeconds(n.end)-toSeconds(n.tick),midi:n.midi,velocity:n.velocity,syllable:syllables.length===1?syllables[0]:syllables[i]}))};
}
