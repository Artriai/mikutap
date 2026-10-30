"""Build explicit syllable inventories and preserve upstream sample provenance."""
from pathlib import Path
import json,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
JP=[
('元音 / 清音','a i u e o ka ki ku ke ko sa shi su se so ta chi tsu te to na ni nu ne no ha hi fu he ho ma mi mu me mo ya yu yo ra ri ru re ro wa wo n','あ い う え お か き く け こ さ し す せ そ た ち つ て と な に ぬ ね の は ひ ふ へ ほ ま み む め も や ゆ よ ら り る れ ろ わ を ん'),
('浊音 / 半浊音','ga gi gu ge go za ji zu ze zo da di du de do ba bi bu be bo pa pi pu pe po','が ぎ ぐ げ ご ざ じ ず ぜ ぞ だ ぢ づ で ど ば び ぶ べ ぼ ぱ ぴ ぷ ぺ ぽ'),
('拗音','kya kyu kyo sha shu sho cha chu cho nya nyu nyo hya hyu hyo mya myu myo rya ryu ryo gya gyu gyo ja ju jo dya dyu dyo bya byu byo pya pyu pyo','きゃ きゅ きょ しゃ しゅ しょ ちゃ ちゅ ちょ にゃ にゅ にょ ひゃ ひゅ ひょ みゃ みゅ みょ りゃ りゅ りょ ぎゃ ぎゅ ぎょ じゃ じゅ じょ ぢゃ ぢゅ ぢょ びゃ びゅ びょ ぴゃ ぴゅ ぴょ'),
('外来音','ye wi we kwa kwi kwe kwo gwa gwi gwe gwo she je che tsa tsi tse tso ti tu tya tyu tyo dhi dhu dho fa fi fe fo fya fyu fyo va vi vu ve vo vya vyu vyo si zi','いぇ うぃ うぇ くぁ くぃ くぇ くぉ ぐぁ ぐぃ ぐぇ ぐぉ しぇ じぇ ちぇ つぁ つぃ つぇ つぉ てぃ とぅ てゃ てゅ てょ でぃ でゅ でょ ふぁ ふぃ ふぇ ふぉ ふゃ ふゅ ふょ ゔぁ ゔぃ ゔ ゔぇ ゔぉ ゔゃ ゔゅ ゔょ すぃ ずぃ')]
CN={
'零声母':'a ai an ang ao e ei en eng er o ou',
'b':'ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu',
'p':'pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu',
'm':'ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu',
'f':'fa fan fang fei fen feng fo fou fu',
'd':'da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo',
't':'ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo',
'n':'na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo nü nüe',
'l':'la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lun luo lü lüe',
'g':'ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo',
'k':'ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo',
'h':'ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo',
'j':'ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun',
'q':'qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun',
'x':'xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun',
'zh':'zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo',
'ch':'cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo',
'sh':'sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo',
'r':'ran rang rao re ren reng ri rong rou ru ruan rui run ruo',
'z':'za zai zan zang zao ze zei zen zeng zi zong zou zu zuan zui zun zuo',
'c':'ca cai can cang cao ce cen ceng ci cong cou cu cuan cui cun cuo',
's':'sa sai san sang sao se sen seng si song sou su suan sui sun suo',
'y':'ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun',
'w':'wa wai wan wang wei wen weng wo wu'}
# Original Mikutap romanizations normalized for the Japanese inventory.
old='mo ku do ga de mo so wo da na ra ba ma e de ra re do sa ba sa de na sa ya bo de ha fo a ji do'.split()
# TianyiTap template note order is lexicographic file order, not numerical order.
source=ROOT/'docs/upstream-template.vsqx'
ns={'v':'http://www.yamaha.co.jp/vocaloid/schema/vsq4/'}
notes=ET.parse(source).findall('.//v:note',ns)
order=sorted(range(32),key=lambda i:f'{i}.mp3')
tianyi=[None]*32
for idx,n in zip(order,notes): tianyi[idx]={'id':idx,'syllable':n.find('v:y',ns).text,'midi':int(n.find('v:n',ns).text)}
miku=[{'id':i,'syllable':s,'midi':tianyi[i]['midi']} for i,s in enumerate(old)]
jp=[]
for group,romaji,kana in JP:
 assert len(romaji.split())==len(kana.split())
 jp.extend({'id':r,'label':k,'group':group} for r,k in zip(romaji.split(),kana.split()))
cn=[{'id':s,'label':s,'group':g} for g,syllables in CN.items() for s in syllables.split()]
for entries in [jp,cn]: assert len(entries)==len({x['id'] for x in entries})
data={'miku':{'name':'初音未来','subtitle':'HATSUNE MIKU','language':'ja-JP','color':'#63ead5','syllables':jp,'samples':miku,'provenance':'Mikutap / daniwell，TianyiTap 镜像；片段音节按上游 list.txt 规范化，待逐项听校。'},'tianyi':{'name':'洛天依','subtitle':'LUO TIANYI','language':'zh-CN','color':'#72c8ff','syllables':cn,'samples':tianyi,'provenance':'TianyiTap / cyjin-yl；采样音节、基准音高取自上游 template.vsqx。'}}
old_catalog=ROOT/'dist/catalog.json'
if old_catalog.exists():
 old=json.loads(old_catalog.read_text())
 for bank in data:
  if old.get(bank,{}).get('phonemes'):data[bank]['phonemes']=old[bank]['phonemes']
(ROOT/'dist/catalog.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
print({k:{'inventory':len(v['syllables']),'samples':len(v['samples']),'unique':len({x['syllable'] for x in v['samples']})}for k,v in data.items()})
