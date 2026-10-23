import {ARCADE_UNLOCK_AT} from '../world/ArcadeRules';
export interface ArcadePreviewState {released:boolean;expiresAt:number;unlocked:boolean;codes:Array<{code:string;issuedAt:number;redeemed:boolean}>}
type Identity={version:1;privateKey:CryptoKey;publicKey:CryptoKey};
type Post=(action:'challenge'|'status'|'redeem',payload:Record<string,unknown>)=>Promise<Record<string,unknown>>;
const DB='myschedule-arcade-key-v1',STORE='keys';
export const normalizedArcadeCode=(value:string)=>value.toUpperCase().replace(/[\s-]/g,'').slice(0,40);
export const arcadePreviewProof=(action:'status'|'redeem',nonce:string,code='')=>`MYSCHEDULE ARCADE PREVIEW\n1\n${action}\n${nonce}\n${normalizedArcadeCode(code)}`;
const empty=(released=false):ArcadePreviewState=>({released,expiresAt:ARCADE_UNLOCK_AT,unlocked:released,codes:[]});
const storageError=()=>new Error('This browser could not save its arcade key. Allow browser storage and try again before paying.');

/** The private key is structured-cloned into IndexedDB, never exported or
 * copied to localStorage. Creating it does not identify hardware or a person. */
export class ArcadePreviewClient {
 state:ArcadePreviewState=empty();
 private identity?:Identity;
 private loading?:Promise<Identity|undefined>;
 private revision=0;
 private applied=0;
 constructor(private post:Post,private now=()=>Date.now(),private storage:IDBFactory|undefined=globalThis.indexedDB,private cryptography:Crypto=globalThis.crypto){}
 private async database():Promise<IDBDatabase>{
  if(!this.storage||!this.cryptography?.subtle)throw storageError();
  return new Promise((resolve,reject)=>{
   const request=this.storage!.open(DB,1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
   request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
   request.onerror=request.onblocked=()=>reject(storageError());
  });
 }
 private async stored(db:IDBDatabase,candidate?:Identity):Promise<Identity|undefined>{
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(STORE,candidate?'readwrite':'readonly'),store=tx.objectStore(STORE),request=store.get('identity');let value:Identity|undefined;
   request.onsuccess=()=>{value=request.result;if(!value&&candidate){value=candidate;store.put(candidate,'identity');}};
   tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(storageError());
  });
 }
 private async validate(value:Identity):Promise<Identity>{
  if(value.version!==1||value.privateKey?.type!=='private'||value.privateKey.extractable||value.publicKey?.type!=='public'
   ||value.privateKey.algorithm.name!=='ECDSA'||(value.privateKey.algorithm as EcKeyAlgorithm).namedCurve!=='P-256')throw storageError();
  try{
   const probe=new TextEncoder().encode('MYSCHEDULE ARCADE KEY CHECK');
   const signature=await this.cryptography.subtle.sign({name:'ECDSA',hash:'SHA-256'},value.privateKey,probe);
   if(!await this.cryptography.subtle.verify({name:'ECDSA',hash:'SHA-256'},value.publicKey,signature,probe))throw storageError();
   return value;
  }catch{throw storageError();}
 }
 private async key(create:boolean):Promise<Identity|undefined>{
  if(this.identity)return this.identity;
  if(this.loading){const value=await this.loading;if(value||!create)return value;}
  this.loading=(async()=>{
   const db=await this.database();
   try{
    let value=await this.stored(db);
    if(!value&&create){
     const pair=await this.cryptography.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
     // The read/write transaction rechecks before writing: concurrent tabs
     // cannot replace a key that already owns a paid donation.
     value=await this.stored(db,{version:1,privateKey:pair.privateKey,publicKey:pair.publicKey});
     value=await this.stored(db); // Read the committed structured clone back.
    }
    if(value)this.identity=await this.validate(value);
    return this.identity;
   }finally{db.close();}
  })();
  try{return await this.loading;}finally{this.loading=undefined;}
 }
 async checkoutKey():Promise<JsonWebKey|undefined>{
  if(this.now()>=ARCADE_UNLOCK_AT||this.state.released)return;
  const key=await this.key(true);return this.cryptography.subtle.exportKey('jwk',key!.publicKey);
 }
 private apply(value:Record<string,unknown>,revision:number):ArcadePreviewState{
  if(revision>=this.applied){
   this.applied=revision;
   this.state={released:value.released===true,expiresAt:Number(value.expiresAt)||ARCADE_UNLOCK_AT,unlocked:value.unlocked===true||value.released===true,
    codes:Array.isArray(value.codes)?value.codes.filter(v=>v&&typeof v.code==='string').map(v=>({code:v.code,issuedAt:Number(v.issuedAt),redeemed:v.redeemed===true})):[]};
  }
  return this.state;
 }
 async status():Promise<ArcadePreviewState>{return this.prove('status');}
 async redeem(code:string):Promise<ArcadePreviewState>{return this.prove('redeem',code);}
 private async prove(action:'status'|'redeem',code=''):Promise<ArcadePreviewState>{
  const revision=++this.revision;
  if(this.now()>=ARCADE_UNLOCK_AT)return this.apply(empty(true) as unknown as Record<string,unknown>,revision);
  const key=await this.key(action==='redeem');
  if(!key)return this.state;
  const publicKey=await this.cryptography.subtle.exportKey('jwk',key.publicKey);
  const challenge=await this.post('challenge',{publicKey,action});
  if(challenge.released===true)return this.apply(empty(true) as unknown as Record<string,unknown>,revision);
  if(typeof challenge.nonce!=='string'||!challenge.nonce)throw new Error('The arcade service could not verify this browser. Please try again.');
  const normalized=normalizedArcadeCode(code);
  const signature=await this.cryptography.subtle.sign({name:'ECDSA',hash:'SHA-256'},key.privateKey,new TextEncoder().encode(arcadePreviewProof(action,challenge.nonce,normalized)));
  const encoded=btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return this.apply(await this.post(action,{publicKey,nonce:challenge.nonce,signature:encoded,...(action==='redeem'?{code:normalized}:{})}),revision);
 }
}
