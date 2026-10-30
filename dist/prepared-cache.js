/* Immutable score preparations share decoded buffers and pending work. */
export class PreparedCache{
 constructor(){this.scores=new WeakMap()}
 entry(score,key){const entry=this.scores.get(score)?.get(key);return entry?.signature===JSON.stringify(score)?entry:null}
 peek(score,key){return this.entry(score,key)?.data??null}
 get(score,key,build,onProgress){
  let entry=this.entry(score,key);
  if(!entry){
   let slots=this.scores.get(score);if(!slots){slots=new Map();this.scores.set(score,slots)}
   entry={signature:JSON.stringify(score),data:null,observers:new Set(),progress:null};slots.set(key,entry);
   entry.promise=Promise.resolve().then(()=>build(progress=>{entry.progress=progress;for(const observer of entry.observers)observer(progress)})).then(data=>{entry.data=data;return data},error=>{if(slots.get(key)===entry)slots.delete(key);throw error});
  }
  if(onProgress&&!entry.data){entry.observers.add(onProgress);if(entry.progress)onProgress(entry.progress)}
  return entry.promise.then(data=>{entry.observers.delete(onProgress);return data},error=>{entry.observers.delete(onProgress);throw error});
 }
}
