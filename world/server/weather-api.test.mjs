import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { weatherAt } from './weather.mjs';

const directory=mkdtempSync(join(tmpdir(),'festival-weather-test-'));
const stateFile=join(directory,'state.json');
const key='test-weather-admin';let instance,alice,bob,currentSnow;
const children=new Set();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const freePort=async()=>{const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;};
async function start({file=stateFile,seed='off',extra={}}={}){
 const port=await freePort();let stderr='';
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,
  FESTIVAL_PORT:String(port),FESTIVAL_HOST:'127.0.0.1',FESTIVAL_ADMIN_KEY:key,FESTIVAL_STATE_FILE:file,FESTIVAL_SEED_FILE:seed,
  FESTIVAL_YOUTUBE_TITLES:'off',FESTIVAL_MAX_VISITORS:'20',NODE_ENV:'development',
  UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:'',KV_REST_API_URL:'',KV_REST_API_TOKEN:'',...extra},stdio:['ignore','pipe','pipe']});
 children.add(child);child.stderr.on('data',chunk=>stderr+=chunk);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Local weather server did not start: '+stderr)),5000);child.once('error',reject);child.stdout.on('data',chunk=>{if(chunk.toString().includes('listening')){clearTimeout(timer);resolve();}});});
 return {child,base:`http://127.0.0.1:${port}`};
}
async function stop(server){if(!server||server.child.exitCode!==null)return;const ended=once(server.child,'exit');server.child.kill('SIGTERM');await ended;children.delete(server.child);}
const headers=session=>session?{'content-type':'application/json',authorization:`Bearer ${session.token}`,'x-festival-session':session.id}:{'content-type':'application/json'};
async function request(path,{session,staff=false,body,method}={},server=instance){const response=await fetch(server.base+path,{method:method??(body===undefined?'GET':'POST'),headers:{...headers(session),...(staff?{'x-festival-admin-key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};}
async function joinVisitor(name,server=instance){const result=await request('/api/session',{body:{name,palette:{top:'#18191b'}}},server);assert.equal(result.status,201);return result.data.session;}
async function sharedState(session){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),3000);try{const response=await fetch(instance.base+'/api/events',{headers:headers(session),signal:controller.signal});assert.equal(response.status,200);const reader=response.body.getReader();let text='';for(;;){const part=await reader.read();if(part.done)throw Error('Missing state');text+=new TextDecoder().decode(part.value);const match=text.match(/event: state\ndata: ([^\n]+)/);if(match)return JSON.parse(match[1]);}}finally{clearTimeout(timer);controller.abort();}}
before(async()=>{instance=await start();alice=await joinVisitor('Weather Alice');bob=await joinVisitor('Weather Bob');});
after(async()=>{for(const child of children){if(child.exitCode===null)child.kill('SIGTERM');}await Promise.all([...children].map(child=>child.exitCode===null?once(child,'exit').catch(()=>{}):undefined));rmSync(directory,{recursive:true,force:true});});

test('only staff configure validated shared weather; config and SSE agree on the absolute schedule',async()=>{
 const now=Date.now(),period={type:'snow',startsAt:now-5*60000,endsAt:now+20*60000};
 assert.equal((await request('/api/admin/weather',{body:{schedule:[period]}})).status,401);
 assert.equal((await request('/api/admin/weather',{staff:true,body:{schedule:[{...period,startsAt:'bad'}]}})).status,400);
 assert.equal((await request('/api/admin/weather',{staff:true,body:{schedule:[period,{type:'rain',startsAt:now,endsAt:now+60000}]}})).status,400);
 const edited=await request('/api/admin/weather',{staff:true,body:{schedule:[period]}});assert.equal(edited.status,200);currentSnow=edited.data.weather.schedule[0];
 const config=await request('/api/config');assert.deepEqual(config.data.weather,edited.data.weather);assert.ok(config.data.serverTime>=now);
 const shared=await sharedState(alice);assert.deepEqual(shared.weather,config.data.weather);assert.ok(weatherAt(shared.weather.schedule,shared.serverTime).snowCoverage>.49);
 const admin=await request('/api/admin/state',{staff:true});assert.equal(admin.data.weatherPersistence.enabled,false);assert.deepEqual(admin.data.weather,shared.weather);
});

test('brush and claim are atomic: an occupied seat cannot be cleared, and all viewers receive one shared clearance',async()=>{
 assert.equal((await request('/api/seats/BEACH-CHAIR-1/claim',{body:{snowAction:'brush'}})).status,401);
 assert.equal((await request('/api/seats/BEACH-CHAIR-99/claim',{session:alice,body:{snowAction:'brush'}})).status,404);
 assert.equal((await request('/api/seats/PALACE-1-1/claim',{session:alice,body:{snowAction:'brush'}})).status,404);
 const sitting=await request('/api/seats/BEACH-CHAIR-1/claim',{session:alice,body:{snowAction:'sit'}});assert.equal(sitting.status,200);assert.equal(sitting.data.snowCleared,false);
 const blocked=await request('/api/seats/BEACH-CHAIR-1/claim',{session:bob,body:{snowAction:'brush'}});assert.equal(blocked.status,409);
 assert.equal((await request('/api/config')).data.weather.clearedSeats.length,0);
 assert.equal((await request('/api/seats/BEACH-CHAIR-1/release',{session:alice,method:'POST'})).status,200);
 const brushed=await request('/api/seats/BEACH-CHAIR-1/claim',{session:bob,body:{snowAction:'brush',occurrenceId:currentSnow.id}});assert.equal(brushed.status,200);assert.equal(brushed.data.snowCleared,true);
 assert.deepEqual(brushed.data.weather.clearedSeats.map(row=>row.seatId),['BEACH-CHAIR-1']);
 const repeated=await request('/api/seats/BEACH-CHAIR-1/claim',{session:bob,body:{snowAction:'brush'}});assert.equal(repeated.data.snowCleared,false);assert.deepEqual(repeated.data.weather,brushed.data.weather);
 const other=await sharedState(alice);assert.deepEqual(other.weather,brushed.data.weather);
 assert.equal((await request('/api/seats/BEACH-MAT-1/claim',{session:alice,body:{snowAction:'unknown'}})).status,400);
});

test('fresh snow after a shared wipe allows another authoritative wipe, with retries still silent',async()=>{
 const seat='SHORE-2-6';
 const first=await request(`/api/seats/${seat}/claim`,{session:alice,body:{snowAction:'brush'}});
 assert.equal(first.status,200);assert.equal(first.data.snowCleared,true);
 const firstMark=first.data.weather.clearedSeats.find(row=>row.seatId===seat);
 const immediate=await request(`/api/seats/${seat}/claim`,{session:alice,body:{snowAction:'brush'}});
 assert.equal(immediate.data.snowCleared,false);
 await delay(750);
 const again=await request(`/api/seats/${seat}/claim`,{session:alice,body:{snowAction:'brush'}});
 assert.equal(again.status,200);assert.equal(again.data.snowCleared,true);
 const mark=again.data.weather.clearedSeats.find(row=>row.seatId===seat);assert.ok(mark.clearedAt>firstMark.clearedAt);
 assert.equal(again.data.weather.clearedSeats.filter(row=>row.seatId===seat).length,1);
 const shared=await sharedState(bob);assert.deepEqual(shared.weather.clearedSeats.find(row=>row.seatId===seat),mark);
 await request(`/api/seats/${seat}/release`,{session:alice,method:'POST'});
});

test('physical beach claims own their relaxation pose; unclaimed floor rest requires seated state and release clears posture',async()=>{
 await request('/api/presence',{session:alice,body:{state:'walking',relaxation:'recline'}});
 let own=(await sharedState(alice)).visitors.find(visitor=>visitor.id===alice.id);assert.equal(own.presence.relaxation,undefined);
 await request('/api/presence',{session:alice,body:{state:'seated',relaxation:'ground-sit'}});
 own=(await sharedState(alice)).visitors.find(visitor=>visitor.id===alice.id);assert.equal(own.presence.relaxation,'ground-sit');
 await request('/api/presence',{session:alice,body:{state:'seated',relaxation:'chair-sit'}});
 own=(await sharedState(alice)).visitors.find(visitor=>visitor.id===alice.id);assert.equal(own.presence.relaxation,undefined);
 assert.equal((await request('/api/seats/BEACH-MAT-1/claim',{session:alice,method:'POST'})).status,200);
 await request('/api/presence',{session:alice,body:{state:'walking',relaxation:'ground-sit'}});
 own=(await sharedState(alice)).visitors.find(visitor=>visitor.id===alice.id);assert.equal(own.presence.state,'seated');assert.equal(own.presence.relaxation,'recline');
 await request('/api/seats/BEACH-MAT-1/release',{session:alice,method:'POST'});
 own=(await sharedState(alice)).visitors.find(visitor=>visitor.id===alice.id);assert.equal(own.presence.relaxation,undefined);assert.equal(own.presence.state,'walking');
 own=(await sharedState(bob)).visitors.find(visitor=>visitor.id===bob.id);assert.equal(own.presence.relaxation,'chair-sit');
});

test('a claim that finishes its request body late cannot steal or brush a seat claimed in the meantime',async()=>{
 const first=await joinVisitor('Slow claim'),second=await joinVisitor('Quick claim');
 const payload=JSON.stringify({snowAction:'brush'});
 let complete;
 const response=new Promise((resolve,reject)=>{
  const delayed=httpRequest(instance.base+'/api/seats/BEACH-CHAIR-2/claim',{method:'POST',headers:{...headers(first),'content-length':Buffer.byteLength(payload)}},reply=>{
   let data='';reply.on('data',chunk=>data+=chunk);reply.on('end',()=>resolve({status:reply.statusCode,data:JSON.parse(data)}));
  });
  delayed.on('error',reject);delayed.write(payload.slice(0,12));complete=()=>delayed.end(payload.slice(12));
 });
 await delay(40);
 const won=await request('/api/seats/BEACH-CHAIR-2/claim',{session:second,body:{snowAction:'sit'}});assert.equal(won.status,200);
 complete();const lost=await response;assert.equal(lost.status,409);
 const state=await sharedState(second);
 assert.deepEqual(state.seats.filter(row=>row.seatId==='BEACH-CHAIR-2'),[{seatId:'BEACH-CHAIR-2',visitorId:second.id}]);
 assert.ok(!state.weather.clearedSeats.some(row=>row.seatId==='BEACH-CHAIR-2'),'the losing claim never brushed the winner’s snow');
 assert.equal(state.visitors.find(row=>row.id===first.id).seatedAt,undefined);
});

test('each of the six drive-in cars has independent driver and passenger occupancy and snow',async()=>{
 const driver=await joinVisitor('Car driver'),passenger=await joinVisitor('Car passenger');
 for(let index=1;index<=6;index++){
  const driverId=`DRIVE-${Math.floor((index-1)/3)+1}-${(index-1)%3+1}`,passengerId=`DRIVE-${index}-PASSENGER`;
  const claimed=await request(`/api/seats/${driverId}/claim`,{session:driver,body:{snowAction:'sit'}});assert.equal(claimed.status,200);
  const joined=await request(`/api/seats/${passengerId}/claim`,{session:passenger,body:{snowAction:'brush'}});assert.equal(joined.status,200);assert.equal(joined.data.snowCleared,true);
  const state=await sharedState(driver);
  assert.equal(state.visitors.find(row=>row.id===driver.id).seatedAt,driverId);
  assert.equal(state.visitors.find(row=>row.id===passenger.id).seatedAt,passengerId);
  assert.ok(state.weather.clearedSeats.some(row=>row.seatId===passengerId));
  assert.ok(!state.weather.clearedSeats.some(row=>row.seatId===driverId),'brushing the passenger side does not clear the driver side');
  assert.equal((await request(`/api/seats/${passengerId}/claim`,{session:driver,body:{snowAction:'brush'}})).status,409);
 }
 assert.equal((await request('/api/seats/DRIVE-7-PASSENGER/claim',{session:driver,method:'POST'})).status,404);
 await request('/api/seats/DRIVE-6-PASSENGER/release',{session:passenger,method:'POST'});
 const state=await sharedState(driver);
 assert.equal(state.visitors.find(row=>row.id===driver.id).seatedAt,'DRIVE-2-3');
 assert.equal(state.visitors.find(row=>row.id===passenger.id).seatedAt,undefined,'releasing one side leaves the other occupied');
 await request('/api/seats/DRIVE-2-3/release',{session:driver,method:'POST'});
});

test('brushing is rate bounded without breaking idempotent retries or changing occupancy on failure',async()=>{
 const visitor=await joinVisitor('Brush limits');
 for(let column=1;column<=6;column++){
  const claim=await request(`/api/seats/SHORE-1-${column}/claim`,{session:visitor,body:{snowAction:'brush'}});
  assert.equal(claim.status,200);assert.equal(claim.data.snowCleared,true);
 }
 const blocked=await request('/api/seats/SHORE-1-7/claim',{session:visitor,body:{snowAction:'brush'}});assert.equal(blocked.status,429);
 const state=await sharedState(visitor);assert.equal(state.visitors.find(row=>row.id===visitor.id).seatedAt,'SHORE-1-6');
 assert.ok(!state.weather.clearedSeats.some(row=>row.seatId==='SHORE-1-7'));
 const repeated=await request('/api/seats/SHORE-1-6/claim',{session:visitor,body:{snowAction:'brush'}});assert.equal(repeated.status,200);assert.equal(repeated.data.snowCleared,false);
});

test('canceling or changing snow ends precipitation now but retains its accumulation for melting',async()=>{
 const before=(await request('/api/config')).data.weather;
 const canceled=await request('/api/admin/weather',{staff:true,body:{schedule:[]}});assert.equal(canceled.status,200);
 assert.ok(canceled.data.weather.schedule.some(row=>row.id===currentSnow.id&&row.endsAt<=canceled.data.serverTime));
 assert.ok(weatherAt(canceled.data.weather.schedule,canceled.data.serverTime).snowCoverage>.49);
 assert.equal(canceled.data.weather.clearedSeats[0].seatId,before.clearedSeats[0].seatId);
 const now=Date.now();const rain=await request('/api/admin/weather',{staff:true,body:{schedule:[{type:'rain',startsAt:now,endsAt:now+60000}]}});assert.equal(rain.status,200);
 const sample=weatherAt(rain.data.weather.schedule,rain.data.serverTime);assert.equal(sample.type,'rain');assert.ok(sample.snowCoverage>.49);
});

test('weather and shared brushes survive JSON restart and public seed capture without unrelated records being changed',async()=>{
 const now=Date.now();const edited=await request('/api/admin/weather',{staff:true,body:{schedule:[{type:'snow',startsAt:now-2*60000,endsAt:now+10*60000}]}});assert.equal(edited.status,200);
 currentSnow=edited.data.weather.schedule.find(row=>row.endsAt>now);
 const brushed=await request('/api/seats/BEACH-CHAIR-1/claim',{session:bob,body:{snowAction:'brush',occurrenceId:currentSnow.id}});assert.equal(brushed.status,200);
 const expected=brushed.data.weather;
 await stop(instance);const disk=JSON.parse(readFileSync(stateFile,'utf8'));assert.deepEqual(disk.weather,expected);assert.ok(Array.isArray(disk.messages));assert.ok(Array.isArray(disk.donations));
 instance=await start();assert.deepEqual((await request('/api/config')).data.weather,expected);
 const seed=join(directory,'captured-seed.json');const capture=spawn(process.execPath,['scripts/capture-state.mjs',instance.base],{cwd:new URL('..',import.meta.url),env:{...process.env,FESTIVAL_SEED_FILE:seed},stdio:['ignore','ignore','pipe']});
 const [code]=await once(capture,'exit');assert.equal(code,0);assert.deepEqual(JSON.parse(readFileSync(seed,'utf8')).weather,expected);
 const seeded=await start({file:join(directory,'new-state.json'),seed});try{assert.deepEqual((await request('/api/config',{},seeded)).data.weather,expected);}finally{await stop(seeded);}
});

test('optional Redis uses the isolated weather key and hydrates a fresh deployment with shared clearances',async()=>{
 const retained=(await request('/api/config')).data.weather;
 const values=new Map([['festival:weather:v1',JSON.stringify(retained)]]),commands=[];
 const redis=createServer(async(request,response)=>{let data='';for await(const chunk of request)data+=chunk;const args=JSON.parse(data);commands.push(args);if(args[0]==='SET')values.set(args[1],args[2]);response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({result:args[0]==='GET'?values.get(args[1])??null:'OK'}));});
 redis.listen(0,'127.0.0.1');await once(redis,'listening');const endpoint=`http://127.0.0.1:${redis.address().port}`;
 const extra={UPSTASH_REDIS_REST_URL:endpoint,UPSTASH_REDIS_REST_TOKEN:'local-weather-test-token'};
 let deployed;
 try{
  deployed=await start({file:join(directory,'cloud-state.json'),extra});let config;
  for(let i=0;i<50;i++){config=(await request('/api/config',{},deployed)).data;if(config.weather.updatedAt===retained.updatedAt)break;await delay(20);}
  assert.deepEqual(config.weather,retained);
  const now=Date.now();const changed=await request('/api/admin/weather',{staff:true,body:{schedule:[{type:'rain',startsAt:now,endsAt:now+60000}]}},deployed);assert.equal(changed.status,200);
  await stop(deployed);deployed=undefined;
  const stored=JSON.parse(values.get('festival:weather:v1'));assert.deepEqual(stored,changed.data.weather);
  assert.ok(commands.some(command=>command[0]==='SET'&&command[1]==='festival:weather:v1'));
  assert.ok(commands.filter(command=>command[0]==='SET').every(command=>command[1]==='festival:weather:v1'),'weather writes must not target wishes or other records');
  deployed=await start({file:join(directory,'fresh-redeploy.json'),extra});
  for(let i=0;i<50;i++){config=(await request('/api/config',{},deployed)).data;if(config.weather.updatedAt===stored.updatedAt)break;await delay(20);}
  assert.deepEqual(config.weather,stored);
 }finally{await stop(deployed);await new Promise(resolve=>redis.close(resolve));}
});
