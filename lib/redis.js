import { Redis } from '@upstash/redis';
import { TTL_SECONDS } from './logic.js';
let instance;
export function getRedis(){
  if(!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN){
    throw Object.assign(new Error('Máy chủ chưa được cấu hình Upstash Redis. Cần UPSTASH_REDIS_REST_URL và UPSTASH_REDIS_REST_TOKEN.'),{status:503});
  }
  return instance ??= Redis.fromEnv();
}
export const keyFor = code => `diceparty:v3:${code}`;
const SCRIPT = `local current = redis.call('GET', KEYS[1]); if current ~= ARGV[1] then return 0 end; redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]); return 1;`;
export async function getRoom(redis,code){return await redis.get(keyFor(code));}
export async function createUniqueRoom(redis, generateCode, generateRoom) {
  for(let attempt=0;attempt<8;attempt++){
    const code=generateCode();const ok=await redis.set(keyFor(code),JSON.stringify(generateRoom()),{nx:true,ex:TTL_SECONDS});
    if(ok==='OK')return code;
  }
  throw Object.assign(new Error('Không thể tạo mã phòng. Hãy thử lại.'),{status:503});
}
export async function atomicMutate(redis,code, updater) {
  for(let attempt=0;attempt<12;attempt++){
    const current=await getRoom(redis,code);
    if(!current)throw Object.assign(new Error('Phòng đã đóng hoặc hết hạn.'),{status:404});
    const serialized=JSON.stringify(current);
    const updated=updater(structuredClone(current));
    if(JSON.stringify(updated)===serialized)return updated;
    const committed=await redis.eval(SCRIPT,[keyFor(code)],[serialized,JSON.stringify(updated),String(TTL_SECONDS)]);
    if(Number(committed)===1)return updated;
  }
  throw Object.assign(new Error('Phòng đang được cập nhật. Hãy thử lại.'),{status:409});
}