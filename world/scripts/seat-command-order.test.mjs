import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real UI handlers and command queue without booting a WebGL world.
const source=await readFile('src/ui/App.ts','utf8');
const tree=ts.createSourceFile('App.ts',source,ts.ScriptTarget.Latest,true);
const app=tree.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='App');
const methods=['confirmSeatClaim','handleWorldAction'].map(name=>{
 const method=app.members.find(node=>node.name?.getText(tree)===name);assert.ok(method,name);return method.getText(tree);
}).join('\n');
const queue=await readFile('src/network/SeatCommands.ts','utf8');
const globals={};
runInNewContext(ts.transpileModule(queue.replace('export class SeatCommands','class SeatCommands')+`\nclass SeatHarness {${methods}};Object.assign(globalThis,{SeatCommands,SeatHarness});`,{
 compilerOptions:{target:ts.ScriptTarget.ES2022},
}).outputText,globals);

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({holdRelease=false}={}){
 const ui=new globals.SeatHarness(),calls=[],claims=[],releases=[],alerts=[],pending=[];
 let serverSeat;
 const world={stands:0,brushes:0,snowBrushed(){this.brushes++;},forceStand(){this.stands++;ui.handleWorldAction({type:'stood'});}};
 Object.assign(ui,{
  seatCommands:new globals.SeatCommands(),seatAttempt:0,activeSeatId:'CURRENT SEAT',world,language:'en',snapshot:{inTheater:false},
  root:{querySelector:()=>null},
  festivalClient:{online:true,
   claimSeat(id,snowAction){const reply=deferred();claims.push(reply);calls.push(['claim',id,snowAction]);return reply.promise.then(result=>{if(result.ok)serverSeat=id;return result;});},
   releaseSeat(id){calls.push(['release',id]);const reply=deferred();releases.push(reply);if(!holdRelease)reply.resolve();return reply.promise.then(()=>{if(serverSeat===id)serverSeat=undefined;});},
  },
  pausePrivateScreening(){},hideSeatMenu(){},hidePublicSeatHud(){},hideVenueScreen(){},closeFestivalPass(){},
  showWorldAlert:message=>alerts.push(message),
 });
 const confirm=ui.confirmSeatClaim.bind(ui);
 ui.confirmSeatClaim=(...args)=>{const result=confirm(...args);pending.push(result);return result;};
 const sit=(id,snowAction)=>ui.handleWorldAction({type:'relaxed',seatId:id,snowAction});
 return {ui,world,calls,claims,releases,alerts,pending,sit,serverSeat:()=>serverSeat};
}

test('delayed claim, get-up and another claim reach the service in order without leaving a ghost reservation',async()=>{
 const f=fixture({holdRelease:true});
 f.sit('BEACH-CHAIR-1','brush');await turn();
 assert.deepEqual(f.calls,[['claim','BEACH-CHAIR-1','brush']]);
 f.ui.handleWorldAction({type:'stood'});f.sit('BEACH-MAT-1','sit');await turn();
 assert.equal(f.calls.length,1,'neither release nor the second claim overtakes the pending claim');
 f.claims[0].resolve({ok:true});await turn();
 assert.equal(f.serverSeat(),'BEACH-CHAIR-1');
 assert.deepEqual(f.calls,[['claim','BEACH-CHAIR-1','brush'],['release','BEACH-CHAIR-1']]);
 f.releases[0].resolve();await turn();
 assert.equal(f.serverSeat(),undefined,'get-up clears the late successful claim before the next claim');
 assert.deepEqual(f.calls.at(-1),['claim','BEACH-MAT-1','sit']);
 f.claims[1].resolve({ok:true});await Promise.all(f.pending);
 assert.equal(f.serverSeat(),'BEACH-MAT-1');assert.equal(f.ui.activeSeatId,'BEACH-MAT-1');
 assert.equal(f.world.stands,0);assert.deepEqual(f.alerts,[]);
});

test('a stale rejection cannot stand up a newer seat or a same-seat retry',async t=>{
 for(const secondId of ['BEACH-MAT-2','BEACH-CHAIR-1'])await t.test(secondId,async()=>{
  const f=fixture();f.sit('BEACH-CHAIR-1');await turn();
  f.ui.handleWorldAction({type:'stood'});f.sit(secondId);await turn();
  f.claims[0].resolve({ok:false,message:'Seat A was occupied'});await turn();
  assert.equal(f.world.stands,0);assert.deepEqual(f.alerts,[]);assert.equal(f.ui.activeSeatId,secondId);
  assert.deepEqual(f.calls.map(call=>call.slice(0,2)),[['claim','BEACH-CHAIR-1'],['release','BEACH-CHAIR-1'],['claim',secondId]]);
  f.claims[1].resolve({ok:true});await Promise.all(f.pending);
  assert.equal(f.serverSeat(),secondId);assert.equal(f.world.stands,0);
 });
});

test('a failed current claim stands up and queues release, while a replacement world or seat ignores the old failure',async t=>{
 await t.test('current claim',async()=>{
  const f=fixture();f.sit('BEACH-CHAIR-3');await turn();
  f.claims[0].resolve({ok:false,message:'Occupied'});await Promise.all(f.pending);await turn();
  assert.equal(f.world.stands,1);assert.equal(f.ui.activeSeatId,'CURRENT SEAT');
  assert.equal(f.alerts[0],'BEACH-CHAIR-3 · Occupied');assert.deepEqual(f.calls.at(-1),['release','BEACH-CHAIR-3']);
 });
 for(const replacement of ['world','seat'])await t.test(replacement,async()=>{
  const f=fixture();f.sit('BEACH-CHAIR-3');await turn();
  const fresh={stands:0,forceStand(){this.stands++;}};
  if(replacement==='world')f.ui.world=fresh;else f.ui.activeSeatId='BEACH-MAT-4';
  f.claims[0].resolve({ok:false,message:'Outdated'});await Promise.all(f.pending);
  assert.equal(f.world.stands,0);assert.equal(fresh.stands,0);assert.deepEqual(f.alerts,[]);
 });
});

test('a release transport failure does not poison subsequent App seat commands',async()=>{
 const f=fixture({holdRelease:true});f.sit('BEACH-CHAIR-5');await turn();
 f.ui.handleWorldAction({type:'stood'});f.sit('BEACH-CHAIR-6');
 f.claims[0].resolve({ok:true});await turn();assert.equal(f.calls.at(-1)[0],'release');
 f.releases[0].reject(new Error('radio disconnected'));await turn();
 assert.deepEqual(f.calls.at(-1),['claim','BEACH-CHAIR-6',undefined]);
 f.claims[1].resolve({ok:true});await Promise.all(f.pending);
 assert.equal(f.serverSeat(),'BEACH-CHAIR-6');assert.equal(f.world.stands,0);assert.deepEqual(f.alerts,[]);
});

test('the production queue propagates a failing command while allowing the next command to complete',async()=>{
 const queue=new globals.SeatCommands(),first=deferred(),calls=[];
 const failing=queue.run(()=>{calls.push('claim');return first.promise;});
 const rejected=assert.rejects(failing,/failed claim/);
 const next=queue.run(async()=>{calls.push('release');return 'released';});
 await turn();assert.deepEqual(calls,['claim']);first.reject(new Error('failed claim'));
 await rejected;assert.equal(await next,'released');assert.deepEqual(calls,['claim','release']);
});

test('only a confirmed fresh brush plays the clear cue; sit, already-cleared, old-server and rejected claims stay silent',async t=>{
 for(const [name,snowAction,result,expected]of[
  ['fresh clear','brush',{ok:true,snowCleared:true},1],
  ['already clear','brush',{ok:true,snowCleared:false},0],
  ['older server without flag','brush',{ok:true},0],
  ['sit anyway','sit',{ok:true,snowCleared:true},0],
  ['ordinary seat',undefined,{ok:true,snowCleared:true},0],
  ['rejected claim','brush',{ok:false,snowCleared:true,message:'Occupied'},0],
 ])await t.test(name,async()=>{
  const f=fixture();f.sit('BEACH-MAT-3',snowAction);await turn();
  assert.equal(f.world.brushes,0,'the optimistic pose must not sound before the server answers');
  f.claims[0].resolve(result);await Promise.all(f.pending);
  assert.equal(f.world.brushes,expected);assert.equal(f.world.stands,result.ok?0:1);
 });
});

test('a successful brush response becomes silent after standing, replacing the world/seat, or retrying that same seat',async t=>{
 for(const replacement of ['stood','world','seat','same-seat-retry'])await t.test(replacement,async()=>{
  const f=fixture();f.sit('BEACH-MAT-3','brush');await turn();
  const fresh={stands:0,brushes:0,snowBrushed(){this.brushes++;},forceStand(){this.stands++;}};
  if(replacement==='stood')f.ui.handleWorldAction({type:'stood'});
  if(replacement==='world')f.ui.world=fresh;
  if(replacement==='seat')f.ui.activeSeatId='BEACH-MAT-4';
  if(replacement==='same-seat-retry')f.sit('BEACH-MAT-3','brush');
  f.claims[0].resolve({ok:true,snowCleared:true});await turn();
  assert.equal(f.world.brushes,0);assert.equal(fresh.brushes,0);
  if(replacement==='same-seat-retry'){
   assert.equal(f.claims.length,2);f.claims[1].resolve({ok:true,snowCleared:true});
   await Promise.all(f.pending);assert.equal(f.world.brushes,1,'only the latest acknowledged attempt can sound');
  }else await Promise.all(f.pending);
 });
});
