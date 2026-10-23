import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {ArcadePreviewAccess,arcadeProofText,ARCADE_PREVIEW_END} from '../server/arcade-preview.mjs';
const built=await build({stdin:{contents:"export * from './src/network/ArcadePreview';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
const {ArcadePreviewClient,arcadePreviewProof}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
// Structured-clone the real CryptoKeys just as IndexedDB does. Browser tests
// exercise actual IndexedDB; this fixture retains real WebCrypto signatures.
function storage(){
 const values=new Map(),db={objectStoreNames:{contains:()=>true},close(){},transaction(){const tx={};tx.objectStore=()=>({get(key){const r={};queueMicrotask(()=>{r.result=values.has(key)?structuredClone(values.get(key)):undefined;r.onsuccess();queueMicrotask(()=>tx.oncomplete());});return r;},put(value,key){values.set(key,structuredClone(value));}});return tx;}};
 return{values,open(){const request={};queueMicrotask(()=>{request.result=db;request.onsuccess();});return request;}};
}
function fixture(store=storage(),time=ARCADE_PREVIEW_END-60000){
 const server=new ArcadePreviewAccess(()=>time),sent=[];
 const post=async(action,payload)=>{sent.push({action,payload});if(action==='challenge')return server.challenge(payload.publicKey,payload.action,'local');const id=server.authenticate(payload,action);return action==='redeem'?server.redeem(id,payload.code):server.status(id);};
 const client=new ArcadePreviewClient(post,()=>time,store,webcrypto);return{client,server,post,sent,store};
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
test('storage failure prevents checkout binding and public release needs neither a key nor a special request',async()=>{
 const bad={open(){throw new Error('storage denied');}},f=fixture(bad);await assert.rejects(f.client.checkoutKey(),/storage denied|browser/);assert.equal(f.sent.length,0);
 const released=new ArcadePreviewClient(async()=>{throw Error('must not request');},()=>ARCADE_PREVIEW_END,bad,webcrypto);assert.equal(await released.checkoutKey(),undefined);assert.deepEqual(await released.status(),{released:true,expiresAt:ARCADE_PREVIEW_END,unlocked:true,codes:[]});
});
test('a slower earlier status reply cannot undo successful redemption in the same client',async()=>{
 const f=fixture(),key=await f.client.checkoutKey(),grant=f.server.issue({id:randomUUID(),state:'paid',arcadeDeviceKey:key});let release;
 const delayed=new ArcadePreviewClient(async(action,payload)=>{const result=await f.post(action,payload);if(action==='status')return await new Promise(resolve=>release=()=>resolve(result));return result;},()=>ARCADE_PREVIEW_END-60000,f.store,webcrypto);
 const pending=delayed.status();while(!release)await new Promise(resolve=>setTimeout(resolve,0));assert.equal((await delayed.redeem(grant.code)).unlocked,true);release();await pending;assert.equal(delayed.state.unlocked,true);
});
