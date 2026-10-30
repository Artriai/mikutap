/* Song-specific instrumental only. Vocals remain separate live syllables. */
export class AccompanimentCache{
 constructor(fetcher=(...args)=>fetch(...args)){this.fetcher=fetcher;this.buffers=new Map()}
 async load(context,definition){
  if(!definition)return null;
  if(typeof definition.path!=='string'||!definition.path)throw Error('歌曲伴奏地址无效');
  const gain=Number(definition.gain??.42);if(!Number.isFinite(gain)||gain<0||gain>1)throw Error('伴奏音量无效');
  if(!this.buffers.has(definition.path)){
   const job=this.fetcher(definition.path).then(response=>{if(!response.ok)throw Error('伴奏加载失败');return response.arrayBuffer()}).then(bytes=>context.decodeAudioData(bytes)).catch(error=>{this.buffers.delete(definition.path);throw error});
   this.buffers.set(definition.path,job);
  }
  return {buffer:await this.buffers.get(definition.path),gain};
 }
}
export function playAccompaniment(context,destination,track,at,offset,duration){
 const remaining=Math.min(duration-offset,track.buffer.duration-offset);if(remaining<=0)return null;
 const source=context.createBufferSource(),gain=context.createGain();source.buffer=track.buffer;
 const end=at+remaining,fade=Math.min(.008,remaining/4);
 gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(track.gain,at+fade);gain.gain.setValueAtTime(track.gain,end-fade);gain.gain.linearRampToValueAtTime(0,end);
 source.connect(gain);gain.connect(destination);source.start(at,offset);source.stop(end);
 let stopped=false;const handle={source,stop(){if(stopped)return;stopped=true;try{source.stop()}catch{}}};
 source.addEventListener('ended',()=>{source.disconnect();gain.disconnect()},{once:true});return handle;
}
