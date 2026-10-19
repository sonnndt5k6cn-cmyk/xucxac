// Dice Party multiplayer client: private server-side dice; synchronized room state.
const $=id=>document.getElementById(id),safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const faces=[['front',1],['back',6],['right',3],['left',4],['top',2],['bottom',5]];
const dots={1:[[1,1]],2:[[0,0],[2,2]],3:[[0,0],[1,1],[2,2]],4:[[0,0],[0,2],[2,0],[2,2]],5:[[0,0],[0,2],[1,1],[2,0],[2,2]],6:[[0,0],[0,2],[1,0],[1,2],[2,0],[2,2]]};
const positions={1:[0,0],2:[-90,0],3:[0,-90],4:[0,90],5:[90,0],6:[0,180]};
for(let d=0;d<2;d++)for(const [side,n] of faces){const f=document.createElement('div');f.className='face '+side;for(const [r,c] of dots[n]){const dot=document.createElement('i');dot.className='pip';dot.style.gridRow=r+1;dot.style.gridColumn=c+1;f.append(dot)}$('die'+d).append(f)}
let token=sessionStorage.getItem('dice-party-browser-v3');
if(!token){const b=new Uint8Array(32);crypto.getRandomValues(b);token=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');sessionStorage.setItem('dice-party-browser-v3',token)}
let code='',room=null,pollBusy=false,working=false,hand=null,busyRelease=false,releaseCount=0,lastRevealId='',lastPhase='',animSeq=0,sound=true,audio;
const members=()=>room?.players||[],current=()=>members()[room?.turn||0],mine=p=>p&&room?.myPlayerIds?.includes(p.id);
const eligible=()=>room?.phase==='playing'&&mine(current())&&!busyRelease&&(!room.lastReveal||Date.now()-room.lastReveal.at>=2600);
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),3000)}
function beep(){if(!sound)return;try{audio||=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=360;g.gain.value=.015;o.start();o.stop(audio.currentTime+.04)}catch{}}
function cup(open){$('diceZone').classList.toggle('revealed',!!open);$('cupHint').textContent=open?'':'CỐC ĐANG ÚP · GIẤU KẾT QUẢ'}
function reveal(ev){if(!ev||lastRevealId===ev.id)return;lastRevealId=ev.id;animSeq++;ev.pair.forEach((n,i)=>{const a=positions[n];$('die'+i).style.transform=`rotateX(${a[0]+animSeq*720}deg) rotateY(${a[1]+animSeq*720}deg)`});cup(true);$('resultNumber').style.display='block';$('resultNumber').innerHTML='<span>TỔNG</span>'+ev.score;$('resultLabel').textContent=ev.pair.join(' + ');$('floatCue').textContent=safe(ev.name)+' +'+ev.score+' điểm';beep();setTimeout(()=>{if(!hand){cup(false);$('resultNumber').style.display='none'}},Math.max(0,2600-(Date.now()-ev.at)))}
async function api(action,payload={}){const r=await fetch('/api/game',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','x-session-token':token},body:JSON.stringify({code,action,...payload})});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'Lỗi kết nối');return j}
async function sync(force=false){if(!code||pollBusy)return;pollBusy=true;try{const q=new URLSearchParams({code});if(room&&!force)q.set('since',room.version);const r=await fetch('/api/state?'+q,{cache:'no-store',headers:{'x-session-token':token}});const j=await r.json();if(!r.ok)throw Error(j.error||'Không tải được phòng');if(j.room&&(!room||j.room.version>=room.version)){room=j.room;render()}$('connectionLabel').textContent='● ĐỒNG BỘ'}catch(e){$('connectionLabel').textContent='○ MẤT KẾT NỐI';if(/hết hạn|đã đóng/.test(e.message)){leave(false);toast(e.message)}}finally{pollBusy=false}}
async function action(a,data={}){if(working)return;working=true;try{await api(a,data);await sync(true)}catch(e){toast(e.message)}finally{working=false;render()}}
function render(){if(!room)return;const ps=members(),p=current(),isHost=room.isHost,phase=room.phase;const escapedName=n=>safe(n||'');$('roomCode').textContent=code;$('playerCount').textContent=ps.length+' người';$('roundBadge').textContent=phase==='playing'?room.round:'—';$('statRolls').textContent=room.history.length;$('statHigh').textContent=room.history.length?Math.max(...room.history.map(h=>h.score)):'—';$('statTotal').textContent=ps.reduce((n,p)=>n+p.total,0);$('histCount').textContent=room.history.length+' lượt';$('addForm').style.display=isHost&&phase!=='ended'?'flex':'none';$('startBtn').style.display=isHost&&phase==='lobby'?'block':'none';$('startBtn').disabled=false;$('endBtn').style.display=isHost&&phase==='playing'?'block':'none';
$('playerList').innerHTML=ps.map((x,i)=>`<div class="player-item" style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-bottom:1px solid #ffffff16"><span>${i===room.turn&&phase==='playing'?'🎲 ':''}${escapedName(x.name)} ${mine(x)?'· BẠN':''}</span><span>${x.total} điểm ${isHost&&phase==='lobby'&&i>0?`<button data-id="${x.id}">✕</button>`:''}</span></div>`).join('');
$('rankList').innerHTML=[...ps].sort((a,b)=>b.total-a.total).map((x,i)=>`<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #ffffff22"><span>#${i+1} ${escapedName(x.name)}</span><strong>${x.total}</strong></div>`).join('');
$('history').innerHTML=[...room.history].reverse().slice(0,30).map(x=>`<div style="padding:8px 0;border-bottom:1px solid #ffffff1b">${escapedName(x.name)}: ${x.pair.join(' + ')} = <b>${x.score}</b></div>`).join('')||'<div class="empty">Chưa có lượt nào.</div>';
if(phase==='lobby'){$('stateEyebrow').textContent='PHÒNG CHỜ';$('turnName').textContent='Mời bạn bè cùng chơi';$('rollBtn').textContent='CHỜ CHỦ PHÒNG BẮT ĐẦU';$('rollBtn').disabled=true}
if(phase==='playing'){$('stateEyebrow').textContent=mine(p)?'ĐẾN LƯỢT BẠN':'ĐANG CHỜ NGƯỜI CHƠI';$('turnName').innerHTML='<span class="accent">'+escapedName(p?.name)+'</span>';$('rollBtn').textContent=busyRelease?'ĐANG MỞ CỐC...':room.active?'🎲 ĐANG LẮC · THẢ ĐỂ XEM':eligible()?'🎲 NHẤN ĐỔ / GIỮ CỐC ĐỂ LẮC':'ĐỢI ĐẾN LƯỢT';$('rollBtn').disabled=!eligible()||!!hand||working;$('stageHint').textContent=mine(p)?'Giữ và kéo cốc nhiều lần, thả để mở và ghi điểm.':'Đang chờ lượt chơi từ thiết bị khác.'}
if(phase==='ended'){$('stateEyebrow').textContent='🏆 KẾT THÚC VÁN';const mx=Math.max(...ps.map(x=>x.total));$('turnName').textContent=ps.filter(x=>x.total===mx).map(x=>x.name).join(' & ')+' thắng!';$('rollBtn').textContent='↻ CHƠI VÁN MỚI';$('rollBtn').disabled=!isHost}
if(phase==='playing'&&room.lastReveal&&Date.now()-room.lastReveal.at<2600)reveal(room.lastReveal);
else if(!hand){cup(false);$('resultNumber').style.display='none';$('resultLabel').textContent=room.active?'ĐANG LẮC · '+room.active.shakes+' LẦN RANDOM':'XÚC XẮC ĐƯỢC GIẤU DƯỚI CỐC'}
lastPhase=phase;updateShakeMeter()}
async function open(next){code=next;room=null;lastRevealId='';sessionStorage.setItem('dice-party-last-room',next);const u=new URL(location);u.searchParams.set('room',code);history.replaceState({},'',u);await sync(true);if(!room)throw Error('Không thể vào phòng');$('lobbyOverlay').style.display='none';$('topTools').style.display='flex'}
function leave(msg=true){code='';room=null;sessionStorage.removeItem('dice-party-last-room');$('lobbyOverlay').style.display='flex';$('topTools').style.display='none';const u=new URL(location);u.searchParams.delete('room');history.replaceState({},'',u);if(msg)toast('Đã rời phòng')}
async function enter(e,a){e.preventDefault();const name=(a==='create' ? $('createName'):$('joinName')).value.trim(),next=$('joinCode').value.trim().toUpperCase();if(!name)return;try{const j=await api(a,{name,code:a==='join'?next:''});await open(j.code||next)}catch(err){$('lobbyMessage').textContent=err.message}}
$('createForm').onsubmit=e=>enter(e,'create');$('joinForm').onsubmit=e=>enter(e,'join');
$('addForm').onsubmit=e=>{e.preventDefault();const name=$('nameInput').value.trim();if(name){action('add',{name});$('nameInput').value=''}};
$('playerList').onclick=e=>{const b=e.target.closest('[data-id]');if(b)action('remove',{playerId:b.dataset.id})};
$('startBtn').onclick=()=>action('start');
$('endBtn').onclick=()=>{if(confirm('Kết thúc ván và công bố người thắng?'))action('end')};
$('shareBtn').onclick=async()=>{const u=new URL(location);u.searchParams.set('room',code);try{await navigator.clipboard.writeText(u.href);toast('Đã sao chép link mời')}catch{prompt('Link mời:',u.href)}};
$('leaveBtn').onclick=async()=>{if(room?.isHost){if(!confirm('Đóng phòng và xóa toàn bộ điểm?'))return;try{await api('close');leave(false);toast('Đã xóa phòng')}catch(e){toast(e.message)}}else leave()};
$('soundBtn').onclick=()=>{sound=!sound;toast(sound?'Bật âm thanh':'Tắt âm thanh')};
async function finish(){
 if(!hand||busyRelease)return;
 const h=hand;hand=null;busyRelease=true;releaseCount=h.localShakes||1;
 clearTimeout(h.flushTimer);h.flushTimer=null;
 zone.classList.remove('grabbing');zone.style.removeProperty('--shake-x');zone.style.removeProperty('--shake-r');updateShakeMeter();
 try{
  await flushShakeBatch(h);
  // Immediate authoritative result from finish: no extra polling roundtrip.
  const result=await api('finish',{playerId:h.playerId});
  if(result.room){room=result.room;render()}else await sync(true);
  void sync(true);
 }catch(e){toast(e.message)}
 finally{busyRelease=false;releaseCount=0;render()}
}
const zone=$('diceZone');
const shakeMeter=document.createElement('div');
shakeMeter.id='shakeMeter';
shakeMeter.innerHTML='<span class="meter-title">SỐ LẦN RANDOM</span><strong id="shakeCount">0</strong><small id="shakeDetail">ĐANG LẮC</small>';
zone.append(shakeMeter);
const meterStyle=document.createElement('style');
meterStyle.textContent=`#shakeMeter{position:absolute;z-index:20;top:62px;right:clamp(4px,4vw,55px);min-width:125px;padding:12px 14px;text-align:center;border-radius:18px;color:#dff9f2;background:#121c33ea;border:1px solid #83f5cd85;box-shadow:0 7px 35px #0006;pointer-events:none;opacity:0;visibility:hidden;transform:scale(.92);transition:opacity .13s,transform .13s}#shakeMeter.visible{opacity:1;visibility:visible;transform:scale(1)}#shakeMeter .meter-title{font-size:9px;letter-spacing:1px;font-weight:800;display:block}#shakeCount{font:900 44px/1.1 'Space Grotesk',sans-serif;color:#83f5cd;display:block;font-variant-numeric:tabular-nums}#shakeDetail{font-size:9px;color:#d8e2ef}#diceZone.remote-shaking:not(.grabbing):not(.revealed) .cup-shell{animation:remoteShake .22s infinite alternate ease-in-out}@keyframes remoteShake{0%{transform:translate(-50%,-52%) rotate(-6deg)}100%{transform:translate(calc(-50% + 10px),calc(-52% - 4px)) rotate(6deg)}}@media(max-width:540px){#shakeMeter{right:4px;top:44px;min-width:88px;padding:8px}#shakeCount{font-size:32px}#shakeMeter .meter-title,#shakeDetail{font-size:8px}}`;
document.head.append(meterStyle);
function updateShakeMeter(){
 const visible=room?.phase==='playing'&&!zone.classList.contains('revealed')&&(!!hand||!!room.active||busyRelease);
 const count=Math.max(hand?.localShakes||0,room?.active?.shakes||0,busyRelease?releaseCount:0);
 shakeMeter.classList.toggle('visible',Boolean(visible));
 $('shakeCount').textContent=count;
 $('shakeDetail').textContent=busyRelease?'ĐANG MỞ CỐC':hand?'ĐANG RANDOM':'CỐC ĐANG LẮC';
 zone.classList.toggle('remote-shaking',!!room?.active&&!hand&&!busyRelease);
 if(visible){$('resultLabel').textContent='ĐANG LẮC · '+count+' LẦN RANDOM';$('resultNumber').style.display='none'}
}
function addShake(){
 const h=hand;if(!h||h.failed||h.localShakes>=100)return;
 h.localShakes++;h.pending++;updateShakeMeter();beep();
 if(!h.flushTimer)h.flushTimer=setTimeout(()=>{h.flushTimer=null;void flushShakeBatch(h)},110);
}
async function flushShakeBatch(h){
 if(h.sending)return h.sending;
 const run=async()=>{
  while(h.pending>0&&!h.failed){
   const count=Math.min(12,h.pending);h.pending-=count;
   try{const res=await api('shake',{playerId:h.playerId,count});h.confirmed=res.shakes;updateShakeMeter()}
   catch(e){h.failed=e;toast('Không đồng bộ được lần lắc: '+e.message)}
  }
 };
 h.sending=run().finally(()=>{h.sending=null});return h.sending;
}
zone.addEventListener('pointerdown',e=>{if(e.button!==0||!eligible()||room.active||hand)return;e.preventDefault();cup(false);hand={id:e.pointerId,playerId:current().id,x:e.clientX,y:e.clientY,dist:0,t:0,localShakes:0,pending:0,sending:null,flushTimer:null,failed:null};updateShakeMeter();zone.setPointerCapture(e.pointerId);zone.classList.add('grabbing');$('floatCue').textContent='↔ LẮC CỐC · THẢ ĐỂ MỞ';beep()});
zone.addEventListener('pointermove',e=>{if(!hand||hand.id!==e.pointerId)return;hand.dist+=Math.hypot(e.clientX-hand.x,e.clientY-hand.y);hand.x=e.clientX;hand.y=e.clientY;zone.style.setProperty('--shake-x',Math.max(-20,Math.min(20,e.movementX||0))+'px');zone.style.setProperty('--shake-r',Math.max(-15,Math.min(15,(e.movementX||0)/2))+'deg');if(hand.dist>38&&performance.now()-hand.t>190&&hand.localShakes<100){hand.dist=0;hand.t=performance.now();addShake()}});
zone.addEventListener('pointerup',e=>{if(hand?.id===e.pointerId)void finish()});
zone.addEventListener('pointercancel',e=>{if(hand?.id===e.pointerId)void finish()});
zone.addEventListener('lostpointercapture',e=>{if(hand?.id===e.pointerId)void finish()});
async function roll(){if(room?.phase==='ended')return action('rematch');if(!eligible()||working||hand)return;working=true;try{const playerId=current().id;if(!room.active)await api('shake',{playerId});const result=await api('finish',{playerId});if(result.room){room=result.room;render()}else await sync(true);void sync(true)}catch(e){toast(e.message)}finally{working=false;render()}}
$('rollBtn').onclick=roll;zone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();roll()}});
$('rejoinBtn').onclick=async()=>{const c=$('joinCode').value.trim().toUpperCase();if(!c)return;try{await open(c)}catch(e){toast('Không thể vào lại. Hãy nhập tên tham gia phòng.')}};
(async()=>{try{const r=await fetch('/api/config');const j=await r.json();$('setupStatus').textContent=j.configured?'● Sẵn sàng · không cần đăng ký':'Chưa cấu hình Redis trên Vercel';if(!j.configured){$('lobbyMessage').textContent='Cần cấu hình UPSTASH_REDIS_REST_URL và UPSTASH_REDIS_REST_TOKEN';return}const c=(new URL(location).searchParams.get('room')||sessionStorage.getItem('dice-party-last-room')||'').toUpperCase();if(c){$('joinCode').value=c;try{await open(c)}catch{ $('lobbyMessage').textContent='Nhập tên để tham gia phòng.'}}}catch(e){$('setupStatus').textContent='Không kết nối được API'}})();
setInterval(()=>{if(room&&document.visibilityState==='visible')void sync()},950);
