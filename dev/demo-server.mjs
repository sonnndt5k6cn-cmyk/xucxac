import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRoom,mutate,publicRoom,actorHash,newRoomCode} from '../lib/logic.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),rooms=new Map();
const response=(res,obj,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj))};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),token=req.headers['x-session-token'],actor=token?actorHash(token):'',code=url.searchParams.get('code');
 if(url.pathname==='/api/config')return response(res,{configured:true});
 if(url.pathname==='/api/state'){const r=rooms.get(code);if(!r)return response(res,{ok:false,error:'Phòng không tồn tại'},404);return response(res,{ok:true,room:publicRoom(r,actor)})}
 if(url.pathname==='/api/game'){let body='';for await(const c of req)body+=c;try{const d=JSON.parse(body);if(d.action==='create'){let key;do{key=newRoomCode()}while(rooms.has(key));rooms.set(key,createRoom(actor,d.name));return response(res,{ok:true,code:key})}const room=rooms.get(d.code);if(!room)throw Object.assign(new Error('Phòng không tồn tại'),{status:404});if(d.action==='close'){if(room.host!==actor)throw Object.assign(new Error('Không phải chủ phòng'),{status:403});rooms.delete(d.code);return response(res,{ok:true})}const updated=mutate(room,actor,d);rooms.set(d.code,updated);return response(res,{ok:true,version:updated.version})}catch(e){return response(res,{ok:false,error:e.message},e.status||400)}}
 const pathname=url.pathname==='/'?'/index.html':url.pathname;const file=path.resolve(ROOT,'.'+pathname);if(!file.startsWith(ROOT+path.sep))return response(res,{error:'forbidden'},403);try{const b=fs.readFileSync(file);res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8'});res.end(b)}catch{res.writeHead(404);res.end('Not found')}
});
server.listen(4173,()=>console.log('Local demo: http://localhost:4173'));
