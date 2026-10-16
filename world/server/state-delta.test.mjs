import test from 'node:test';
import assert from 'node:assert/strict';
import { StateDelta } from './state-delta.mjs';
const state = () => ({serverTime:1,selfId:'self',visitors:[{id:'a',presence:{x:0},palette:{skin:'red'}},{id:'b',presence:{x:2}}],messages:[],schedule:{shore:{index:0}},npcProfiles:[{name:'Resident'}]});
test('a negotiated connection always starts with complete state',()=>{const s=state(), delta=new StateDelta();assert.deepEqual(delta.encode(s),{event:'state',data:s});});
test('movement sends only the changed attendee and clock, keeping static data off the wire',()=>{const s=state(), delta=new StateDelta();delta.encode(s);s.serverTime=2;s.visitors[0].presence.x=3;assert.deepEqual(delta.encode(s),{event:'state-patch',data:{serverTime:2,visitors:[s.visitors[0]]}});});
test('join, departure, palette and shared programme changes are not lost',()=>{const s=state(),delta=new StateDelta();delta.encode(s);s.visitors=[{...s.visitors[0],palette:{skin:'blue'}},{id:'c'}];s.schedule.shore.index=1;const {data}=delta.encode(s);assert.deepEqual(data.removedVisitors,['b']);assert.deepEqual(data.visitors,s.visitors);assert.deepEqual(data.schedule,s.schedule);});
test('viewer-specific chat caches cannot leak across connections',()=>{const a=state(), b=state(), da=new StateDelta(),db=new StateDelta();a.messages=[{text:'near a'}];da.encode(a);db.encode(b);a.messages=[];assert.deepEqual(da.encode(a).data.messages,[]);assert.equal(db.encode(b).data.messages,undefined);});
test('a new stream after reconnect receives full state even if another stream has cached it',()=>{const s=state(),a=new StateDelta();a.encode(s);assert.equal(a.encode(s).event,'state-patch');assert.equal(new StateDelta().encode(s).event,'state');});
