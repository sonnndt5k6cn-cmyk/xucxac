import test from 'node:test';
import assert from 'node:assert/strict';
import {actorHash,createRoom,mutate,publicRoom,TTL_SECONDS} from '../lib/logic.js';
const guest='guest-actor',host='host-actor',now=1700000000000;
const room0=()=>createRoom(host,'Chủ phòng',now);
const step=(room,actor,action,extra={},at=now)=>mutate(room,actor,{action,...extra},at,()=>[3,5]);
test('khách vào phòng không cần đăng ký và không trùng tên',()=>{
 let r=room0();r=step(r,guest,'join',{name:'Người 2'});assert.equal(r.players.length,2);
 assert.throws(()=>step(r,'other','join',{name:'Người 2'}),/tồn tại|sử dụng/);
 assert.equal(publicRoom(r,guest).myPlayerIds.length,1);
 assert.equal(publicRoom(r,host).isHost,true);
});
test('lắc nhiều lần chỉ hé lộ sau finish',()=>{
 let r=room0();const p=r.players[0].id;r=step(r,host,'start');
 r=step(r,host,'shake',{playerId:p});r=step(r,host,'shake',{playerId:p});
 assert.equal(r.active.shakes,2);assert.deepEqual(r.secretPair,[3,5]);
 const pub=JSON.stringify(publicRoom(r,host));assert(!pub.includes('secretPair'));assert(!pub.includes('host-actor'));assert(!pub.includes('"pair"'));assert.equal(r.players[0].total,0);
 r=step(r,host,'finish',{playerId:p});assert.equal(r.players[0].total,8);assert.equal(r.players[0].rolls,1);
 assert.deepEqual(publicRoom(r,host).lastReveal.pair,[3,5]);assert.equal(r.active,null);
 assert.throws(()=>step(r,host,'finish',{playerId:p}),/công bố kết quả/);
});
test('người khác không thể đổ hộ, và chuyển lượt chính xác',()=>{
 let r=room0();r=step(r,guest,'join',{name:'Khách'});r=step(r,host,'start');
 const a=r.players[0].id,b=r.players[1].id;
 assert.throws(()=>step(r,guest,'shake',{playerId:a}),/Không phải lượt/);
 r=step(r,host,'shake',{playerId:a});r=step(r,host,'finish',{playerId:a});assert.equal(r.turn,1);
 assert.throws(()=>step(r,host,'shake',{playerId:a},now+3000),/Không phải lượt/);
 r=step(r,guest,'finish',{playerId:b},now+3000);assert.equal(r.turn,0);assert.equal(r.round,2);
});
test('kết thúc, chơi lại, xoá điểm/lịch sử và TTL',()=>{
 let r=room0();const id=r.players[0].id;r=step(r,host,'start');r=step(r,host,'finish',{playerId:id});
 r=step(r,host,'end',{},now+3000);assert.equal(r.phase,'ended');assert.equal(r.players[0].total,8);
 r=step(r,host,'rematch',{},now+3100);assert.equal(r.phase,'lobby');assert.equal(r.players[0].total,0);assert.equal(r.history.length,0);
 assert.equal(r.expiresAt,now+3100+TTL_SECONDS*1000);
 assert.throws(()=>step(r,host,'start',{},now+TTL_SECONDS*1000+10000),/hết hạn/);
});
test('chỉ host quản lý game và không thể sửa kết quả bằng input',()=>{
 let r=room0();r=step(r,guest,'join',{name:'Khách'});assert.throws(()=>step(r,guest,'start'),/Chỉ chủ phòng/);
 r=step(r,host,'start');const id=r.players[0].id;
 r=step(r,host,'finish',{playerId:id,pair:[6,6]});assert.equal(r.lastReveal.score,8);
});
test('mã nhận diện dựa trên hash của token',()=>{
 assert.equal(actorHash('x'),actorHash('x'));assert.notEqual(actorHash('x'),actorHash('y'));
});