export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.json({configured:!!(process.env.UPSTASH_REDIS_REST_URL&&process.env.UPSTASH_REDIS_REST_TOKEN)});
}