/* Transition keys use normalized catalog syllables. No request at module load. */
import {normalizeSyllable} from './engine.js';
export const cnEndings=Object.freeze(['a','u','e','i','v','ir','n','ng']);
export const cnInitials=Object.freeze('b p m f d t n l g k h j q x zh ch sh r z c s y w 0'.split(' '));
export function cnInitial(syllable){
 const s=normalizeSyllable(String(syllable),'tianyi');
 return /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/.exec(s)?.[0]??'0';
}
export function cnEnding(syllable){
 const s=normalizeSyllable(String(syllable),'tianyi');
 if(s.endsWith('ng'))return 'ng';
 if(s.endsWith('n'))return 'n';
 if(/^(zhi|chi|shi|ri|zi|ci|si)$/.test(s))return 'ir';
 if(/ü$/.test(s)||/^(ju|qu|xu|yu)$/.test(s))return 'v';
 if(s.endsWith('i'))return 'i';
 if(/[uo]$/.test(s))return 'u';
 if(s.endsWith('a'))return 'a';
 if(/(e|er)$/.test(s))return 'e';
 return null;
}
export function cnVcKey(previous,next){const ending=cnEnding(previous);return ending?ending+'_'+cnInitial(next):null}
export function jpVcvKey(previous,next){
 const prev=normalizeSyllable(String(previous),'miku'),syllable=normalizeSyllable(String(next),'miku');
 const vowel=prev==='n'?'n':/[aiueo]$/.exec(prev)?.[0];
 return vowel&&/^[a-z]+$/.test(syllable)?vowel+'_'+syllable:null;
}
const manifests=new Map();
export function loadTransitions(fetcher=globalThis.fetch){
 if(!manifests.has(fetcher)){
  const job=(async()=>{
   const response=await fetcher('transitions.json?v=2');
   if(!response.ok)throw Error('过渡目录不可用');
   const data=await response.json();if(data?.version!==1)throw Error('未知过渡目录版本');return data;
  })();
  manifests.set(fetcher,job);
  job.catch(()=>{if(manifests.get(fetcher)===job)manifests.delete(fetcher)});
 }
 return manifests.get(fetcher).catch(()=>({version:1,miku:{},tianyi:{}}));
}
