import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
const seed=JSON.parse(readFileSync(new URL('./festival-seed.json',import.meta.url),'utf8'));
const ids=seed.jukeboxTracks.map(track=>track.id);
const staff={'x-festival-admin-key':'shelf-test-key','content-type':'application/json',origin:'http://127.0.0.1:5173'};
const freePort=()=>new Promise((resolve,reject)=>{const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
async function start(port,stateFile,seedFile){
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,FESTIVAL_HOST:'127.0.0.1',FESTIVAL_PORT:String(port),FESTIVAL_ADMIN_KEY:'shelf-test-key',FESTIVAL_YOUTUBE_TITLES:'off',FESTIVAL_STATE_FILE:stateFile,FESTIVAL_SEED_FILE:seedFile,FESTIVAL_ALLOWED_ORIGINS:'http://127.0.0.1:5173'},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Server failed: '+output)),4000);child.on('error',reject);child.stderr.on('data',b=>output+=b);child.stdout.on('data',b=>{if(String(b).includes('listening')){clearTimeout(timer);resolve();}});});return child;
}
const stop=child=>new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);child.kill('SIGTERM');});
async function capture(url,target,only=false){
 const child=spawn(process.execPath,['scripts/capture-state.mjs',url,...(only?['--jukebox-only']:[])],{cwd:new URL('..',import.meta.url),env:{...process.env,FESTIVAL_SEED_FILE:target},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(output)));});
}

test('the local deployment seed retains the three exact records recovered from the live catalogue',()=>{
 for(const [id,title]of[['XcKvndexQYE','DOUDOU - A Rusty Dream'],['KvMY1uzSC1E','Rosa Walton - I Really Want to Stay At Your House'],['jLXTBbMRxK8',"Rat Boy & IBDY - WHO'S READY FOR TOMORROW"]]){
  assert.deepEqual(seed.jukeboxTracks.find(track=>track.id===id),{id,youtubeId:id,title});
 }
 assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,10);
});

test('authenticated atomic shelf ordering survives disk restart and captured redeploy without changing queued or playing requests',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'festival-shelf-')),port=await freePort(),url=`http://127.0.0.1:${port}`,state=join(dir,'state.json'),sourceSeed=join(dir,'source.json'),captured=join(dir,'captured.json');
 writeFileSync(sourceSeed,JSON.stringify(seed));let child=await start(port,state,sourceSeed);
 const config=()=>fetch(url+'/api/config').then(r=>r.json());
 const move=(stockOrder,headers=staff)=>fetch(url+'/api/admin/jukebox',{method:'POST',headers,body:JSON.stringify({stockOrder})});
 const reordered=[...ids.slice(-3).reverse(),...ids.slice(0,-3)];
 try{
  assert.deepEqual((await config()).jukebox.tracks.map(t=>t.id),ids);
  assert.equal((await move(reordered,{'content-type':'application/json'})).status,401);
  for(const bad of [null,{},[ids[0],ids[0]],ids.map((id,i)=>i===0?12:id),new Array(121).fill(ids[0])])assert.equal((await move(bad)).status,400);
  assert.equal((await move(ids.slice(1))).status,409);
  assert.equal((await move([...ids.slice(1),'aaaaaaaaaaa'])).status,409);
  assert.deepEqual((await config()).jukebox.tracks.map(t=>t.id),ids,'invalid orders must never partly mutate the shelf');
  const admission=await fetch(url+'/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'SHELF LISTENER',palette:{top:'#18191b'}})}).then(r=>r.json());
  const as={'content-type':'application/json',authorization:`Bearer ${admission.session.token}`,'x-festival-session':admission.session.id};
  for(const trackId of ids.slice(0,3))assert.equal((await fetch(url+'/api/jukebox/request',{method:'POST',headers:as,body:JSON.stringify({trackId})})).status,200);
  const before=(await config()).jukebox;
  const response=await move(reordered);assert.equal(response.status,200);
  const after=(await response.json()).jukebox;assert.deepEqual(after.tracks.map(t=>t.id),reordered);
  assert.deepEqual(after.queue,before.queue);assert.deepEqual(after.nowPlaying,before.nowPlaying,'catalogue edits cannot restart the active song');
  const admin=await fetch(url+'/api/admin/state',{headers:staff}).then(r=>r.json());assert.deepEqual(admin.jukebox.tracks,after.tracks);
  // Every web/body/graphics mode receives this same shared catalogue payload.
  for(const suffix of ['?era=ps2','?era=ps2&graphics=lite','?era=ps2&island','?era=ps2&vr=1'])assert.deepEqual((await fetch(url+'/api/config'+suffix).then(r=>r.json())).jukebox.tracks,after.tracks);
  await capture(url,captured);assert.deepEqual(JSON.parse(readFileSync(captured,'utf8')).jukeboxTracks,after.tracks,'normal deployment capture retains shelf order');
  const local={...JSON.parse(readFileSync(captured,'utf8')),npcTitles:{LOCAL:'NEW LOCAL TITLE'},npcIntroductions:{LOCAL:'UNPUBLISHED LOCAL BIO'},trackDurations:{...seed.trackDurations}};
  writeFileSync(captured,JSON.stringify(local));await capture(url,captured,true);
  const narrow=JSON.parse(readFileSync(captured,'utf8'));assert.deepEqual(narrow.npcTitles,local.npcTitles);assert.deepEqual(narrow.npcIntroductions,local.npcIntroductions);assert.deepEqual(narrow.trackDurations,local.trackDurations);assert.deepEqual(narrow.jukeboxTracks,after.tracks);
  await stop(child);child=await start(port,state,sourceSeed);
  assert.deepEqual((await config()).jukebox.tracks.map(t=>t.id),reordered,'file-backed restart preserves shelf order');
  assert.deepEqual((await config()).jukebox.queue,[],'requests belong to a running session');
  await stop(child);child=await start(port,join(dir,'fresh-after-deploy.json'),captured);
  const deployed=(await config()).jukebox;assert.deepEqual(deployed.tracks.map(t=>t.id),reordered,'fresh diskless instance restores the captured shelf');assert.equal(deployed.nowPlaying,null);
 }finally{await stop(child);rmSync(dir,{recursive:true,force:true});}
});
