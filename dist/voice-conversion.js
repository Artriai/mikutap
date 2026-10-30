/* Approximate Japanese pronunciation with the Mandarin bank; no lyric translation. */
const approximations={
 i:'yi',u:'wu',ki:'ji',ko:'kuo',gi:'ji',go:'guo',shi:'xi',se:'se',so:'suo',chi:'qi',tsu:'cu',to:'tuo',no:'nuo',hi:'xi',ho:'huo',mo:'mo',yo:'you',yu:'you',
 ra:'la',ri:'li',ru:'lu',re:'le',ro:'luo',n:'en',zo:'zuo',do:'duo',be:'bei',po:'po',pe:'pei',
 kya:'jia',kyu:'ju',kyo:'jiao',sha:'xia',shu:'xu',sho:'xiao',cha:'qia',chu:'qu',cho:'qiao',nya:'niao',nyu:'niu',nyo:'niao',hya:'xia',hyu:'xiu',hyo:'xiao',
 mya:'miao',myu:'miu',myo:'miao',rya:'lia',ryu:'liu',ryo:'liao',gya:'jia',gyu:'ju',gyo:'jiao',ja:'jia',ju:'ju',jo:'jiao',dya:'jia',dyu:'ju',dyo:'jiao',
 bya:'biao',byu:'bu',byo:'biao',pya:'piao',pyu:'pu',pyo:'piao',wi:'wei',we:'wei',kwa:'kua',kwi:'kui',kwe:'kui',kwo:'kuo',gwa:'gua',gwi:'gui',gwe:'gui',gwo:'guo',
 she:'xie',je:'jie',che:'qie',tsa:'ca',tsi:'ci',tse:'ce',tso:'cuo',tya:'qia',tyu:'qu',tyo:'qiao',dhi:'di',dhu:'du',dho:'duo',fi:'fei',fe:'fei',
 fya:'fa',fyu:'fu',fyo:'fo',va:'wa',vi:'wei',vu:'wu',ve:'wei',vo:'wo',vya:'wa',vyu:'wu',vyo:'wo'
};
export function approximateSyllable(syllable,targetCatalog){
 const mapped=approximations[syllable]??syllable;
 if(!targetCatalog.phonemes[mapped])throw Error('无法近似该音节：'+syllable+' → '+mapped);
 return mapped;
}
// The optional Japanese-bank cover keeps one Mandarin syllable per note.
const mandarinRows={
 b:['ba','bi','bu','be','bo'],p:['pa','pi','pu','pe','po'],m:['ma','mi','mu','me','mo'],f:['fa','fi','fu','fe','fo'],d:['da','di','du','de','do'],t:['ta','ti','tu','te','to'],n:['na','ni','nu','ne','no'],l:['ra','ri','ru','re','ro'],g:['ga','gi','gu','ge','go'],k:['ka','ki','ku','ke','ko'],h:['ha','hi','fu','he','ho'],j:['ja','ji','ju','je','jo'],q:['cha','chi','chu','che','cho'],x:['sha','shi','shu','she','sho'],zh:['ja','ji','ju','je','jo'],ch:['cha','chi','chu','che','cho'],sh:['sha','shi','shu','she','sho'],r:['ra','ri','ru','re','ro'],z:['za','zi','zu','ze','zo'],c:['tsa','tsi','tsu','tse','tso'],s:['sa','si','su','se','so'],y:['ya','i','yu','ye','yo'],w:['wa','wi','u','we','wo'],'':['a','i','u','e','o']
};
export function approximateMandarinSyllable(syllable,targetCatalog){
 const id=syllable.toLowerCase().replace(/ü/g,'v'),initial=/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/.exec(id)?.[0]??'';
 const final=id.slice(initial.length),vowel=/^(ia|ya|a|ua)/.test(final)?0:/^(ie|ve|e)/.test(final)?3:/^(io|o|uo)/.test(final)?4:/^(iu|v|u)/.test(final)?2:1;
 const mapped=id==='er'?'e':id==='en'?'n':mandarinRows[initial][vowel];
 if(!targetCatalog.phonemes[mapped])throw Error('无法近似该中文音节：'+syllable);
 return mapped;
}
export function convertScore(score,voice,catalog){
 if(voice===score.voice)return score;
 if(score.voice==='tianyi'&&voice==='miku')return {...score,voice,conversion:{from:'tianyi',to:'miku',method:'Mandarin syllables approximated with Japanese; no translation'},notes:score.notes.map(note=>({...note,voice,sourceSyllable:note.syllable,syllable:note.syllable?approximateMandarinSyllable(note.syllable,catalog.miku):undefined}))};
 if(score.voice!=='miku'||voice!=='tianyi')throw Error('不支持该音源转换');
 return {...score,voice,conversion:{from:'miku',to:'tianyi',method:'Japanese syllables approximated with Mandarin; no translation'},notes:score.notes.map(note=>({...note,voice,sourceSyllable:note.syllable,syllable:approximateSyllable(note.syllable,catalog.tianyi)}))};
}
