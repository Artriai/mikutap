/* Homepage playlist owns its transport; manual START stays separate. */
import './performance.js?v=19';
import {convertScore} from './voice-conversion.js?v=2';
const panel=document.getElementById('playlist'),rows=document.getElementById('playlist_tracks');
const toggle=document.getElementById('player_toggle'),stopButton=document.getElementById('player_stop');
const progress=document.getElementById('player_progress'),label=document.getElementById('player_title'),clock=document.getElementById('player_time');
let tracks=[],current=null,generation=0,loading=false,showPreparation=false,seeking=false,pendingPosition=0,pendingPaused=false,selectingVoice=0;
const scoreCache=new Map(),resolvedScores=new Map(),warmJobs=new Map(),selectedVoice=()=>window.MikutapVoice.getBank();
function formatTime(time){time=Math.max(0,Math.floor(time||0));return Math.floor(time/60)+':'+String(time%60).padStart(2,'0')}
function status(text){document.getElementById('player_status').textContent=text}
function render(){
 const owned=window.Mikutap.owner==='playlist',state=owned?window.Mikutap.state:'stopped',active=!!current,playing=active&&state==='playing';
 panel.dataset.state=loading&&showPreparation?'loading':active?state:'idle';document.getElementById('view').dataset.playlistState=panel.dataset.state;
 toggle.disabled=!active||loading;stopButton.disabled=!active;progress.disabled=!active||loading||!owned;
 toggle.textContent=playing?'暂停':'播放';toggle.setAttribute('aria-label',playing?'暂停歌曲':'播放歌曲');
 label.textContent=current?current.title:'选择歌曲开始播放';
 const time=loading?pendingPosition:active&&owned?window.Mikutap.position:0,total=current?.duration||0;
 clock.textContent=formatTime(time)+' / '+formatTime(total);progress.max=total||1;if(!seeking)progress.value=time;
 for(const row of rows.children){
  const selected=current&&row.dataset.track===current.id,track=tracks.find(t=>t.id===row.dataset.track);row.classList.toggle('selected',!!selected);row.setAttribute('aria-current',String(!!selected));row.querySelector('.track_action').textContent=selected&&loading&&showPreparation?'准备中':selected&&playing?'演唱中':'播放';
  const voice=selected?selectedVoice():track.voice;
  row.querySelector('small').textContent=(track.descriptions?.[voice]??(voice==='tianyi'?'洛天依 · 日语近似发音':track.artist))+' · '+formatTime(track.duration);
 }
}
function stop(){generation++;window.Mikutap.stop();loading=false;status('');render()}
async function loadScore(track,voice){
 const url=track.variants?.[voice]??track.score;
 if(!scoreCache.has(url))scoreCache.set(url,fetch(url).then(r=>{if(!r.ok)throw Error('歌曲加载失败');return r.json()}).then(score=>{resolvedScores.set(url,score);return score}).catch(e=>{scoreCache.delete(url);resolvedScores.delete(url);throw e}));return scoreCache.get(url);
}
function warmOtherVoice(track,voice){
 const other=voice==='miku'?'tianyi':'miku',key=track.id+':'+other;
 if(warmJobs.has(key))return;
 const job=Promise.all([loadScore(track,other),window.MikutapVoice.getCatalog()]).then(([source,catalog])=>window.Mikutap.prepare(convertScore(source,other,catalog),{engine:source.engine||'sampler'})).catch(error=>{warmJobs.delete(key);console.debug('Background voice preparation deferred',error)});
 warmJobs.set(key,job);
}
async function playTrack(track,{position=0,paused=false,switching=false}={}){
 if(!switching&&current?.id!==track.id&&selectedVoice()!==track.voice){
  stop();current=null;render();const request=generation;selectingVoice++;
  try{await window.MikutapVoice.choose(track.voice)}finally{selectingVoice--}
  if(request!==generation)return;
 }
 const voice=selectedVoice(),known=resolvedScores.get(track.variants?.[voice]??track.score),ready=known?.voice===voice&&window.Mikutap.isPrepared(known,{engine:known.engine||'sampler'});stop();current=track;loading=true;showPreparation=!ready;pendingPosition=position;pendingPaused=paused;status(ready?'':switching?'正在切换演唱音源':'正在准备歌曲');render();const token=generation;
 try{
  const [source,catalog]=await Promise.all([loadScore(track,voice),window.MikutapVoice.getCatalog()]);if(token!==generation)return;
  const score=convertScore(source,voice,catalog);
  await window.Mikutap.play(score,{engine:score.engine||'sampler',muteBacktrack:true,owner:'playlist',cache:true,startAt:position,paused,onProgress:({loaded,total})=>{if(token===generation)status((switching?'切换音源 ':'准备歌曲 ')+loaded+' / '+total)}});
  if(token!==generation)return;loading=false;status('');render();warmOtherVoice(track,voice);
 }catch(error){if(token!==generation)return;loading=false;status('加载失败，请点击歌曲重试');render();console.error(error)}
}
async function pauseResume(){
 if(!current||loading)return;status('');
 if(window.Mikutap.owner!=='playlist'||['stopped','ended'].includes(window.Mikutap.state))await playTrack(current);
 else if(window.Mikutap.state==='playing')window.Mikutap.pause();
 else await window.Mikutap.resume();render();
}
for(const type of ['keydown','keyup'])panel.addEventListener(type,event=>event.stopPropagation());
toggle.addEventListener('click',()=>pauseResume().catch(console.error));stopButton.addEventListener('click',stop);
progress.addEventListener('input',()=>{window.Mikutap.seek(Number(progress.value));render()});
progress.addEventListener('pointerdown',()=>{seeking=true});
window.addEventListener('pointerup',()=>{if(seeking){seeking=false;render()}});window.addEventListener('pointercancel',()=>{if(seeking){seeking=false;render()}});
rows.addEventListener('click',event=>{const row=event.target.closest('[data-track]');if(!row)return;const track=tracks.find(t=>t.id===row.dataset.track);if(current?.id===track.id&&!loading&&window.Mikutap.owner==='playlist'&&['playing','paused','ended'].includes(window.Mikutap.state))pauseResume().catch(console.error);else playTrack(track)});
document.addEventListener('mikutap:voicechange',()=>{
 if(selectingVoice)return;
 const state=window.Mikutap.state;
 if(current&&(loading||(window.Mikutap.owner==='playlist'&&['playing','paused'].includes(state)))){
  const position=loading?pendingPosition:window.Mikutap.position,paused=loading?pendingPaused:state==='paused';playTrack(current,{position,paused,switching:true});
 }else render();
});
document.addEventListener('mikutap:transport',event=>{render();if(event.detail.state==='ended'&&event.detail.owner==='playlist')status('演唱结束')});
document.addEventListener('mikutap:exit',stop);document.addEventListener('mikutap:manualstart',stop);
fetch('songs/playlist.json?v=9').then(r=>{if(!r.ok)throw Error('播放列表加载失败');return r.json()}).then(data=>{
 tracks=data.tracks;for(const track of tracks){const row=document.createElement('button');row.type='button';row.className='playlist_track';row.dataset.track=track.id;row.innerHTML='<span class="track_number"></span><span class="track_info"><span class="track_title"></span><small></small></span><span class="track_action">播放</span>';row.querySelector('.track_number').textContent=String(rows.children.length+1).padStart(2,'0');row.querySelector('.track_title').textContent=track.title;rows.append(row)}render();
}).catch(error=>{status('播放列表加载失败，请刷新重试');console.error(error)});
setInterval(()=>{if(current)render()},100);render();
