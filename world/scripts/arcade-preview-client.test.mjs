import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {ArcadePreviewAccess,arcadeProofText,ARCADE_PREVIEW_END} from '../server/arcade-preview.mjs';
const built=await build({stdin:{contents:"export * from './src/network/ArcadePreview';export {ARCADE_UNLOCK_AT} from './src/world/ArcadeRules';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
const {ArcadePreviewClient,arcadePreviewProof,ARCADE_UNLOCK_AT}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
// Structured-clone the real CryptoKeys just as IndexedDB does. Browser tests
// exercise actual IndexedDB; this fixture retains real WebCrypto signatures.
function storage(){
 const values=new Map(),db={objectStoreNames:{contains:()=>true},close(){},transaction(){const tx={};tx.objectStore=()=>({get(key){const r={};queueMicrotask(()=>{r.result=values.has(key)?structuredClone(values.get(key)):undefined;r.onsuccess();queueMicrotask(()=>tx.oncomplete());});return r;},put(value,key){values.set(key,structuredClone(value));}});return tx;}};
 return{values,open(){const request={};queueMicrotask(()=>{request.result=db;request.onsuccess();});return request;}};
}
function fixture(store=storage(),time=ARCADE_PREVIEW_END-60000){
 const now=typeof time==='function'?time:()=>time,server=new ArcadePreviewAccess({now}),sent=[];
 const post=async(action,payload)=>{sent.push({action,payload});if(action==='challenge')return server.challenge(payload.publicKey,payload.action,'local');const id=server.authenticate(payload,action);return action==='redeem'?server.redeem(id,payload.code):server.status(id);};
 const client=new ArcadePreviewClient(post,now,store,webcrypto);return{client,server,post,sent,store};
}
test('the browser stores a non-extractable private key and only signed ownership retrieves and redeems a new paid code',async()=>{
 const f=fixture();assert.equal((await f.client.status()).codes.length,0);assert.equal(f.sent.length,0,'a visitor without a key sends no identity');
 const publicKey=await f.client.checkoutKey();assert.equal(publicKey.kty,'EC');assert.equal(publicKey.crv,'P-256');assert.equal(publicKey.d,undefined);
 const held=f.store.values.get('identity');assert.equal(held.privateKey.extractable,false);await assert.rejects(webcrypto.subtle.exportKey('jwk',held.privateKey));
 const donation={id:randomUUID(),state:'paid',arcadeDeviceKey:publicKey},grant=f.server.issue(donation);
 const paid=await f.client.status();assert.equal(paid.unlocked,false);assert.equal(paid.codes[0].code,grant.code);
 const redeemed=await f.client.redeem(' '+grant.code.toLowerCase().replaceAll('-',' - ')+' ');assert.equal(redeemed.unlocked,true);assert.equal(redeemed.codes[0].redeemed,true);
 for(const message of f.sent){assert.equal(message.payload.publicKey.d,undefined);if(message.action!=='challenge'){assert.match(message.payload.signature,/^[A-Za-z0-9_-]{86}$/);assert.equal(Buffer.from(message.payload.signature,'base64url').length,64,'WebCrypto uses the server’s IEEE-P1363 signature format');}}
 const reloaded=new ArcadePreviewClient(f.post,()=>ARCADE_PREVIEW_END-60000,f.store,webcrypto);assert.equal((await reloaded.status()).unlocked,true,'a fresh client reads the same committed key');
 // Codes work on any device (owner, 2026-10-22): another browser with its own key unlocks too, but never lists the code.
 const other=new ArcadePreviewClient(f.post,()=>ARCADE_PREVIEW_END-60000,storage(),webcrypto);assert.equal((await other.status()).unlocked,false);const shared=await other.redeem(grant.code);assert.equal(shared.unlocked,true);assert.deepEqual(shared.codes,[]);
});
test('proof text matches the backend exactly, including normalization and the forty-character limit',()=>{
 for(const action of ['status','redeem'])for(const code of ['', ' moth-aa bb-cc ', 'X'.repeat(100)])assert.equal(arcadePreviewProof(action,'nonce',code),arcadeProofText(action,'nonce',code));
});
test('the postponed release preserves donor access and keeps other browsers locked throughout the extended preview window',async()=>{
 const oldRelease=Date.parse('2026-11-02T00:00:00+08:00'),release=Date.parse('2026-11-16T00:00:00+08:00');
 assert.equal(ARCADE_UNLOCK_AT,release);assert.equal(ARCADE_PREVIEW_END,release,'browser and backend must unlock together');
 let time=oldRelease-1;const now=()=>time,f=fixture(storage(),now),key=await f.client.checkoutKey();
 const grant=f.server.issue({id:randomUUID(),state:'paid',arcadeDeviceKey:key});assert.ok(grant);
 assert.equal((await f.client.redeem(grant.code)).unlocked,true);
 const nonDonor=new ArcadePreviewClient(f.post,now,storage(),webcrypto);
 await nonDonor.checkoutKey(); // A key permits a real signed status query; it grants no paid access.
 const reloadedDonor=new ArcadePreviewClient(f.post,now,f.store,webcrypto);
 for(time of[oldRelease,oldRelease+1,oldRelease+7*86400000,release-1]){
  const donor=await reloadedDonor.status(),locked=await nonDonor.status();
  assert.equal(donor.released,false);assert.equal(donor.unlocked,true);assert.equal(donor.expiresAt,release);
  assert.equal(donor.codes[0].code,grant.code);assert.equal(donor.codes[0].redeemed,true);
  assert.deepEqual(locked,{released:false,expiresAt:release,unlocked:false,codes:[]});
  assert.equal(f.server.snapshot().length,1,'the old release must not prune an issued code');
 }
 time=release;const before=f.sent.length;
 for(const client of[reloadedDonor,nonDonor])assert.deepEqual(await client.status(),{released:true,expiresAt:release,unlocked:true,codes:[]});
 assert.equal(f.sent.length,before,'the public release needs no signed request or redemption');
 assert.deepEqual(f.server.status(''),{released:true,expiresAt:release,unlocked:true,codes:[]});
 assert.deepEqual(f.server.snapshot(),[],'preview grants expire at the new public release');
 time=release+1;assert.equal((await nonDonor.status()).unlocked,true);assert.equal(f.sent.length,before);
});
test('storage failure prevents checkout binding and public release needs neither a key nor a special request',async()=>{
 const bad={open(){throw new Error('storage denied');}},f=fixture(bad);await assert.rejects(f.client.checkoutKey(),/storage denied|browser/);assert.equal(f.sent.length,0);
 const released=new ArcadePreviewClient(async()=>{throw Error('must not request');},()=>ARCADE_PREVIEW_END,bad,webcrypto);assert.equal(await released.checkoutKey(),undefined);assert.deepEqual(await released.status(),{released:true,expiresAt:ARCADE_PREVIEW_END,unlocked:true,codes:[]});
});
test('a slower earlier status reply cannot undo successful redemption in the same client',async()=>{
 const f=fixture(),key=await f.client.checkoutKey(),grant=f.server.issue({id:randomUUID(),state:'paid',arcadeDeviceKey:key});let release;
 const delayed=new ArcadePreviewClient(async(action,payload)=>{const result=await f.post(action,payload);if(action==='status')return await new Promise(resolve=>release=()=>resolve(result));return result;},()=>ARCADE_PREVIEW_END-60000,f.store,webcrypto);
 const pending=delayed.status();while(!release)await new Promise(resolve=>setTimeout(resolve,0));assert.equal((await delayed.redeem(grant.code)).unlocked,true);release();await pending;assert.equal(delayed.state.unlocked,true);
});
