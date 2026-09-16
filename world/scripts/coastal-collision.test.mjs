import test from 'node:test';
import assert from 'node:assert/strict';
import { moveCoastalBody, overlapsBodyHeight, coastalDetour } from '../src/world/CoastalCollision.ts';

test('a long movement frame cannot tunnel through a narrow lamp or wall',()=>{
  const solids=[{minX:-.09,maxX:.09,minZ:-3,maxZ:3}];
  const result=moveCoastalBody({x:-3,y:.28,z:0},6,0,.6,solids,()=>.28);
  assert.ok(result.x<=-.69&&result.x>-.82);
});

test('an overlapping spawn can escape but cannot use that overlap to cross another wall',()=>{
  const furniture={minX:-1,maxX:1,minZ:-1,maxZ:1};
  const wall={minX:2,maxX:2.2,minZ:-3,maxZ:3};
  const result=moveCoastalBody({x:.3,y:.28,z:0},6,0,.4,[furniture,wall],()=>.28);
  assert.ok(result.x>=1.4&&result.x<=1.6);
  const deeper=moveCoastalBody({x:.7,y:.28,z:0},-.2,0,.4,[furniture],()=>.28);
  assert.equal(deeper.x,.7,'escape must not move deeper through the furniture');
});

test('diagonal movement slides along the wall without entering it',()=>{
  const result=moveCoastalBody({x:-1,y:.28,z:0},2,2,.6,[{minX:0,maxX:.2,minZ:-4,maxZ:4}],()=>.28);
  assert.ok(result.x<=-.6);assert.ok(Math.abs(result.z-2)<.00001);
});

test('physical solids test the whole avatar height while permitting passage under high beams',()=>{
  assert.equal(overlapsBodyHeight(.28,{physical:true,minY:2.8,maxY:3.2}),true);
  assert.equal(overlapsBodyHeight(.28,{physical:true,minY:4,maxY:5}),false);
  assert.equal(overlapsBodyHeight(7.28,{physical:true,minY:7,maxY:7.7}),true);
  assert.equal(overlapsBodyHeight(8.0,{physical:true,minY:7,maxY:7.7}),false);
});


test('residents walk around a Palace support from both sides without entering the post',()=>{
  const blocked=(x,z)=>Math.abs(x+26)<.725&&Math.abs(z+26.2)<.725;
  for(const hand of [-1,1])for(const heading of [-1,1]) {
    let x=-26-heading*3,z=-26.2;
    const target={x:-26+heading*3,z:-26.2};
    for(let frame=0;frame<360&&Math.hypot(target.x-x,target.z-z)>.1;frame++){
      const d=Math.hypot(target.x-x,target.z-z),dx=(target.x-x)/d,dz=(target.z-z)/d,step=Math.min(.04,d);
      const next=blocked(x+dx*step,z+dz*step)?coastalDetour(x,z,dx,dz,step,hand,blocked):{x:x+dx*step,z:z+dz*step};
      if(next){x=next.x;z=next.z;}
      assert.equal(blocked(x,z),false);
    }
    assert.ok(Math.hypot(target.x-x,target.z-z)<.1,`resident remained stuck ${hand},${heading}`);
  }
});

import { coastalRouteAround } from '../src/world/CoastalCollision.ts';
test('planned scenery detours reach the destination without oscillating at a lamp',()=>{
 const blocked=(x,z)=>Math.abs(x)<.8&&Math.abs(z)<.8;
 for(const sign of [-1,1]){
  const start={x:sign*3,y:.28,z:0},goal={x:-sign*3,y:.28,z:0};
  const path=coastalRouteAround(start,goal,blocked,()=>.28);
  assert.ok(path.length>2);assert.deepEqual(path.at(-1),goal);
  let previous=start;
  for(const p of path){for(let i=0;i<=20;i++)assert.equal(blocked(previous.x+(p.x-previous.x)*i/20,previous.z+(p.z-previous.z)*i/20),false);previous=p;}
 }
});
test('scenery routing respects a rooftop ledge instead of cutting down through it',()=>{
 const floor=(x,z)=>x>0?7.28:.28;
 assert.deepEqual(coastalRouteAround({x:-2,y:.28,z:0},{x:2,y:7.28,z:0},()=>false,floor),[]);
 const ramp=(x,z)=>.28+Math.max(0,Math.min(7,z*.5));
 const path=coastalRouteAround({x:0,y:.28,z:0},{x:0,y:7.28,z:14},()=>false,ramp);
 assert.ok(path.length>10);assert.equal(path.at(-1).y,7.28);
});

test('a resident already beside a lamp can start and finish a detour at movement clearance',()=>{
 const blocked=(x,z)=>Math.abs(x)<.8&&Math.abs(z)<.8;
 for(const sign of [-1,1])for(const offset of [-.5,0,.5]){
  let position={x:sign*.81,y:.28,z:offset};const goal={x:-sign*3,y:.28,z:offset};
  const path=coastalRouteAround(position,goal,blocked,()=>.28);
  assert.ok(path.length,'route must start from a legal position within the old extra margin');
  for(let frame=0;frame<1200&&path.length;frame++){
   const target=path[0],gap=Math.hypot(target.x-position.x,target.z-position.z);
   if(gap<=.01){path.shift();continue;}
   const step=Math.min(gap,.04),next={x:position.x+(target.x-position.x)/gap*step,y:.28,z:position.z+(target.z-position.z)/gap*step};
   assert.equal(blocked(next.x,next.z),false,'arrival tolerance must not cut a planned corner');position=next;
  }
  assert.ok(Math.hypot(position.x-goal.x,position.z-goal.z)<.011,'resident must complete, not oscillate');
 }
});


import {sampleNpcMotion,npcSeed} from '../src/world/SharedNpcMotion.ts';
test('NPC position is identical across staggered joins, frame rates and corrected visitor clocks',()=>{
 const legs=[{from:{x:0,y:.28,z:0},to:{x:0,y:7.28,z:14},start:0,duration:14},{from:{x:0,y:7.28,z:14},to:{x:0,y:.28,z:0},start:14,duration:14}];
 for(const id of ['NUNO','KENNY','MENTOR'])for(let second=0;second<300;second++){
  const a=sampleNpcMotion(legs,1789470000+second,npcSeed(id)%800);
  const b=sampleNpcMotion(legs,(1789470000+second+180)-180,npcSeed(id)%800);
  assert.deepEqual(a,b);assert.ok(a.y>=.28&&a.y<=7.28);
 }
});
