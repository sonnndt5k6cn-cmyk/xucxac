import { randomInt, randomBytes, createHash } from 'node:crypto';

export const TTL_SECONDS = 3600;
export const REVEAL_MS = 2600;
export const MAX_PLAYERS = 40;
export const MAX_HISTORY = 250;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRoomCode = () => Array.from(randomBytes(6), b => alphabet[b % alphabet.length]).join('');
export const newId = () => randomBytes(10).toString('hex');
export const randomPair = () => [randomInt(1, 7), randomInt(1, 7)];
export const actorHash = token => createHash('sha256').update(token).digest('hex');
export const cleanName = name => typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 24) : '';
export function assert(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), {status});
}
const bump = (room, now) => {room.version += 1; room.expiresAt = now + TTL_SECONDS * 1000; return room;};
const members = room => room?.players || [];
const hasName = (room, name) => members(room).some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase());
export const isMember = (room, actor) => members(room).some(p => p.actor === actor);
export function createRoom(actor, name, now = Date.now()) {
  const clean = cleanName(name); assert(clean.length > 0, 'Hãy nhập tên của bạn.');
  return {host: actor, phase: 'lobby', players: [{id:newId(), actor, name:clean, total:0, rolls:0}],turn:0,round:1,
    history:[], active:null, secretPair:null, lastReveal:null,version:1,createdAt:now,expiresAt:now+TTL_SECONDS*1000};
}
export function mutate(room, actor, input, now=Date.now(), rng=randomPair) {
  assert(room && room.expiresAt > now, 'Phòng không tồn tại hoặc đã hết hạn.', 404);
  const {action, name, playerId} = input;
  const isHost = room.host === actor;
  const ps = members(room);
  if (action === 'join') {
    if (isMember(room, actor)) return room;
    assert(room.phase !== 'ended', 'Ván đã kết thúc.');
    const n=cleanName(name); assert(n, 'Bạn chưa nhập tên.');
    assert(!hasName(room,n), 'Tên này đã được sử dụng.'); assert(ps.length<MAX_PLAYERS,'Phòng đã đủ người.');
    room.players.push({id:newId(),actor,name:n,total:0,rolls:0});return bump(room,now);
  }
  assert(isMember(room,actor), 'Bạn chưa tham gia phòng chơi.',403);
  if(action === 'add') {
    assert(isHost,'Chỉ chủ phòng được thêm người tại máy.',403);
    assert(room.phase!=='ended','Ván đã kết thúc.');
    const n=cleanName(name);assert(n,'Tên không được để trống.');
    assert(!hasName(room,n),'Tên này đã tồn tại.');assert(ps.length<MAX_PLAYERS,'Phòng đã đủ người.');
    room.players.push({id:newId(),actor,name:n,total:0,rolls:0});return bump(room,now);
  }
  if(action === 'remove') {
    assert(isHost,'Chỉ chủ phòng được xóa người.',403);assert(room.phase==='lobby','Chỉ xóa người ở phòng chờ.');
    const index=ps.findIndex(p=>p.id===playerId);assert(index>0,'Không thể xóa người này.');
    ps.splice(index,1);return bump(room,now);
  }
  if(action === 'start') {
    assert(isHost,'Chỉ chủ phòng được bắt đầu.',403);assert(room.phase==='lobby','Ván đã bắt đầu.');
    room.phase='playing';room.turn=0;room.round=1;room.history=[];room.active=null;room.secretPair=null;room.lastReveal=null;
    for(const p of ps){p.total=0;p.rolls=0;}return bump(room,now);
  }
  if(action === 'end') {
    assert(isHost,'Chỉ chủ phòng được kết thúc.',403);assert(room.phase==='playing','Không có ván đang chơi.');
    assert(!room.active,'Đợi mở cốc rồi kết thúc.'); room.phase='ended';room.secretPair=null;return bump(room,now);
  }
  if(action === 'rematch') {
    assert(isHost,'Chỉ chủ phòng được chơi lại.',403);assert(room.phase==='ended','Hãy kết thúc ván trước.');
    room.phase='lobby';room.turn=0;room.round=1;room.history=[];room.active=null;room.secretPair=null;room.lastReveal=null;
    for(const p of ps){p.total=0;p.rolls=0;}return bump(room,now);
  }
  const p=ps[room.turn];
  assert(room.phase==='playing','Ván chưa bắt đầu.');
  assert(p && p.actor===actor && p.id===playerId,'Không phải lượt của bạn.',403);
  assert(!room.lastReveal || now-room.lastReveal.at>=REVEAL_MS,'Đang công bố kết quả.');
  if(action==='shake') {
    if (room.active && room.active.playerId!==playerId) assert(false,'Có người đang lắc.');
    if (!room.active) room.active={playerId,shakes:0,startedAt:now};
    const count=input.count===undefined?1:input.count;
    assert(Number.isInteger(count)&&count>=1&&count<=12,'Số lần lắc không hợp lệ.');
    assert(room.active.shakes+count<=100,'Tối đa 100 lần lắc mỗi lượt.');
    // Every shake counts as one new independent server-side random draw.
    for(let i=0;i<count;i++)room.secretPair=rng();
    room.active.shakes+=count;room.active.lastAt=now;return bump(room,now);
  }
  if(action==='finish') {
    const pair=room.secretPair || rng();
    assert(Array.isArray(pair)&&pair.length===2,'Trạng thái xúc xắc lỗi.');
    const score=pair[0]+pair[1],shakes=room.active?.shakes||1;
    p.total+=score;p.rolls++;
    const ev={id:newId(),playerId:p.id,name:p.name,pair,score,shakes,round:room.round,at:now};
    room.history=[...room.history.slice(-MAX_HISTORY+1),ev];room.lastReveal=ev;
    room.secretPair=null;room.active=null;room.turn++;
    if(room.turn>=room.players.length){room.turn=0;room.round++;}
    return bump(room,now);
  }
  assert(false,'Thao tác không được hỗ trợ.');
}
export function publicRoom(room,actor) {
  const {players,host,secretPair,...rest}=room;
  return {...rest,players:players.map(({actor:a,...p})=>({...p,isHost:p.id===players[0].id})),
    isHost:host===actor,myPlayerIds:players.filter(p=>p.actor===actor).map(p=>p.id)};
}