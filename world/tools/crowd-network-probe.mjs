// Isolated local HTTP/SSE load; never contacts the published service.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFile } from 'node:fs/promises';
const delay = ms => new Promise(r=>setTimeout(r,ms));
const port = await new Promise(r=>{const p=createServer();p.listen(0,'127.0.0.1',()=>{const n=p.address().port;p.close(()=>r(n));});});
const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,FESTIVAL_PORT:String(port),FESTIVAL_STATE_FILE:'off',FESTIVAL_SEED_FILE:'off',FESTIVAL_YOUTUBE_TITLES:'off',FESTIVAL_MAX_VISITORS:'20'},stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',b=>stderr+=b);
const controller=new AbortController();
try{
 await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error(stderr||'server startup timeout')),5000);child.stdout.on('data',b=>{if(String(b).includes('listening')){clearTimeout(t);resolve();}});});
 const base=`http://127.0.0.1:${port}`, sessions=[];
 for(let i=0;i<20;i++){const r=await fetch(base+'/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Load'+i})});if(r.status!==201)throw Error('admission '+r.status);sessions.push((await r.json()).session);}
 let bytes=0,events=0,maxEventBytes=0;const latency=[];
 const readers=sessions.map(async s=>{const r=await fetch(base+'/api/events'+(process.env.DELTA?'?updates=delta-v1':''),{headers:{'x-festival-session':s.id,authorization:'Bearer '+s.token},signal:controller.signal});const reader=r.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;const text=new TextDecoder().decode(value);events+=(text.match(/event: state(?:-patch)?/g)||[]).length;maxEventBytes=Math.max(maxEventBytes,value.length);}}catch(e){if(!controller.signal.aborted)throw e;}finally{reader.releaseLock();}});
 const started=performance.now();
 await Promise.all(sessions.map(async(s,i)=>{await delay(i*7);for(let tick=0;tick<70;tick++){const t=performance.now();const r=await fetch(base+'/api/presence',{method:'POST',headers:{'content-type':'application/json','x-festival-session':s.id,authorization:'Bearer '+s.token},body:JSON.stringify({x:Math.sin(tick*.1+i)*8,y:.28,z:22+Math.cos(tick*.1+i)*6,rotation:tick*.1,state:'walking',moving:true,venue:'shore'})});await r.arrayBuffer();if(r.status!==202)throw Error('presence '+r.status);latency.push(performance.now()-t);await delay(Math.max(0,140-(performance.now()-t)));}}));
 const seconds=(performance.now()-started)/1000;controller.abort();await Promise.all(readers);latency.sort((a,b)=>a-b);
 const serverRssMiB=Number(execFileSync('ps',['-o','rss=','-p',String(child.pid)],{encoding:'utf8'}).trim())/1024;
 const result={serverRssMiB,protocol:process.env.DELTA?'delta-v1':'legacy',visitors:20,posts:latency.length,seconds,sseBytes:bytes,sseBytesPerSecond:bytes/seconds,stateEvents:events,maxChunkBytes:maxEventBytes,postLatencyMs:{p50:latency[Math.floor(latency.length*.5)],p95:latency[Math.floor(latency.length*.95)],max:latency.at(-1)},note:'Local transport latency excludes internet/mobile network and renderer costs'};
 console.log(JSON.stringify(result));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(result,null,2)+'\n');
}finally{controller.abort();child.kill();}
