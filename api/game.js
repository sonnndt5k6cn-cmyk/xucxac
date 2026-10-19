import {getRedis,getRoom,keyFor,createUniqueRoom,atomicMutate} from '../lib/redis.js';
import {actorHash,assert,newRoomCode,createRoom,mutate,publicRoom,isMember} from '../lib/logic.js';

const validCode=c=>typeof c==='string' && /^[A-HJ-NP-Z2-9]{6}$/.test(c);
function actorOf(req){const token=req.headers['x-session-token'];assert(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token),'Phiên chơi không hợp lệ.',401);return actorHash(token);}
const sendError=(res,e)=>{const status=e.status||500;if(status===500)console.error('Dice API:',e);return res.status(status).json({ok:false,error:status===500?'Lỗi máy chủ. Hãy thử lại.':e.message});};
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Yêu cầu không hợp lệ.'});
  if(Number(req.headers['content-length']||0)>4096)return res.status(413).json({ok:false,error:'Nội dung quá lớn.'});
  try {
    const actor=actorOf(req),{action,code,name,playerId,count}=req.body||{},redis=getRedis();
    assert(typeof action==='string','Thiếu thao tác.');
    if(action==='create'){
      const newCode=await createUniqueRoom(redis,newRoomCode,()=>createRoom(actor,name));
      return res.status(200).json({ok:true,code:newCode});
    }
    assert(validCode(code),'Mã phòng không hợp lệ.');
    if(action==='close'){
      const room=await getRoom(redis,code);assert(room,'Phòng không tồn tại.',404);assert(room.host===actor,'Chỉ chủ phòng được đóng phòng.',403);
      const script="local s=redis.call('GET',KEYS[1]); if not s then return 0 end; if s~=ARGV[1] then return 0 end; return redis.call('DEL',KEYS[1]);";
      const ok=await redis.eval(script,[keyFor(code)],[JSON.stringify(room)]);
      assert(Number(ok)===1,'Phòng có thay đổi, hãy thử đóng lại.',409);
      return res.json({ok:true,closed:true});
    }
    const updated=await atomicMutate(redis,code,room=>mutate(room,actor,{action,name,playerId,count}));
    return res.status(200).json({ok:true,version:updated.version,...(action==='shake'?{shakes:updated.active.shakes}:{}),...(action==='finish'?{room:publicRoom(updated,actor)}:{})});
  }catch(e){return sendError(res,e);}
}