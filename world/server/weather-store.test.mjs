import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherStore, createWeatherPersistence, WEATHER_STORE_KEY } from './weather-store.mjs';
import { FestivalWeather } from './weather.mjs';

const START=Date.UTC(2026,10,2),snow={type:'snow',startsAt:START,endsAt:START+600000};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const model=()=>new FestivalWeather({now:()=>START+1000,id:()=> 'weather-test-0001'});

test('weather storage uses a separate bounded key and existing optional credentials, never wish or donation keys',async()=>{
 const calls=[];const store=createWeatherStore({env:{UPSTASH_REDIS_REST_URL:'https://redis.test/',UPSTASH_REDIS_REST_TOKEN:'test-token'},fetchImpl:async(url,options)=>{calls.push({url,args:JSON.parse(options.body),headers:options.headers});return Response.json({result:calls.length===1?null:'OK'});}});
 assert.equal(store.enabled,true);assert.equal(await store.load(),null);await store.save({version:1,schedule:[],clearedSeats:[],updatedAt:0});
 assert.deepEqual(calls.map(c=>c.args.slice(0,2)),[['GET',WEATHER_STORE_KEY],['SET',WEATHER_STORE_KEY]]);
 assert.equal(WEATHER_STORE_KEY,'festival:weather:v1');assert.equal(calls[0].headers.Authorization,'Bearer test-token');
 const disabled=createWeatherStore({env:{},fetchImpl:()=>{throw Error('no remote requests allowed');}});assert.equal(disabled.enabled,false);assert.equal(await disabled.load(),null);await disabled.save({});
});

test('weather store serializes writes and a failed write does not poison later weather saves',async()=>{
 let active=0,peak=0,calls=0;const store=createWeatherStore({env:{KV_REST_API_URL:'https://redis.test',KV_REST_API_TOKEN:'test'},fetchImpl:async()=>{active++;peak=Math.max(peak,active);await turn();active--;return ++calls===1?new Response('',{status:503}):Response.json({result:'OK'});}});
 const first=store.save({updatedAt:1}),second=store.save({updatedAt:2});await assert.rejects(first,/503/);await second;assert.equal(peak,1);
});

test('remote hydration happens before saving, and a late older load cannot overwrite a newer staff change',async()=>{
 let completeLoad;const saves=[],weather=model();const original=weather.replace([snow]);
 const store={enabled:true,load:()=>new Promise(resolve=>{completeLoad=resolve;}),save:async value=>saves.push(value)};
 const persistence=createWeatherPersistence({store,weather,warn:()=>{},retryDelaysMs:[]});
 weather.replace([{...snow,type:'rain'}]);persistence.changed();await turn();assert.equal(saves.length,0,'never overwrite remote data before GET completes');
 completeLoad({...original,updatedAt:1});assert.equal(await persistence.flush(),true);assert.equal(saves.at(-1).schedule[0].type,'rain');persistence.dispose();
});

test('newer remote weather restores absolute windows and shared brushes without restarting the occurrence',async()=>{
 const retained=model();const event=retained.replace([snow]).schedule[0];retained.clearSeat('BEACH-MAT-1',event.id);
 const weather=model();let changes=0;const persistence=createWeatherPersistence({store:{enabled:true,load:async()=>retained.snapshot(),save:async()=>{throw Error('read-only hydration should not save');}},weather,onChange:()=>changes++,warn:()=>{},retryDelaysMs:[]});
 assert.equal(await persistence.flush(),true);assert.equal(weather.snapshot().clearedSeats[0].seatId,'BEACH-MAT-1');assert.equal(changes,1);persistence.dispose();
});

test('failed hydration never writes an unknown remote snapshot, and shutdown remains bounded',async()=>{
 let saves=0;const weather=model();const persistence=createWeatherPersistence({store:{enabled:true,load:async()=>{throw Error('offline');},save:async()=>saves++},weather,warn:()=>{},retryDelaysMs:[]});
 weather.replace([snow]);persistence.changed();await turn();assert.equal(await persistence.flush(25),false);assert.equal(saves,0);persistence.dispose();
});
