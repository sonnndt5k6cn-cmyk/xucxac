import {getRedis,getRoom} from '../lib/redis.js';
import {actorHash,assert,publicRoom,isMember} from '../lib/logic.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try{
    const token=req.headers['x-session-token'];assert(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token),'Phiên chơi không hợp lệ.',401);
    const code=req.query?.code;assert(typeof code==='string'&&/^[A-HJ-NP-Z2-9]{6}$/.test(code),'Mã phòng không hợp lệ.');
    const room=await getRoom(getRedis(),code);
    assert(room&&room.expiresAt>Date.now(),'Phòng đã đóng hoặc hết hạn.',404);
    const actor=actorHash(token);assert(isMember(room,actor),'Bạn chưa tham gia phòng.',403);
    const v=Number(req.query?.since);
    if(Number.isInteger(v)&&v===room.version)return res.status(200).json({ok:true,unchanged:true,version:room.version});
    return res.status(200).json({ok:true,room:publicRoom(room,actor)});
  }catch(err){if(!err.status)console.error('State:',err);return res.status(err.status||500).json({ok:false,error:err.status?err.message:'Không tải được phòng.'});}
}