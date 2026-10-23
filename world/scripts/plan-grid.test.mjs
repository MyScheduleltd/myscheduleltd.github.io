import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({stdin:{contents:"export * from './src/world/PlanGrid';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {PlanGrid}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));

test('the plan grid answers exactly as a scan of every box would, wide boxes included',()=>{
 let seed=7;const rand=()=>((seed=(seed*16807)%2147483647)/2147483647);
 const boxes=[];for(let i=0;i<400;i++){const x=rand()*240-110,z=rand()*180-80,w=rand()<.05?rand()*300:rand()*12,d=rand()<.05?rand()*300:rand()*12;boxes.push({minX:x,maxX:x+w,minZ:z,maxZ:z+d,id:i});}
 boxes.push({minX:-Infinity,maxX:Infinity,minZ:-1,maxZ:1,id:'endless'});
 const grid=new PlanGrid(4,256);for(const b of boxes)grid.add(b,b.minX,b.maxX,b.minZ,b.maxZ);
 for(let i=0;i<5000;i++){
  const x=rand()*260-120,z=rand()*200-90,inside=b=>x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ;
  assert.equal(grid.some(x,z,inside),boxes.some(inside),`${x},${z}`);
  const seen=new Set();grid.forEach(x,z,b=>{if(inside(b))seen.add(b.id);});
  assert.deepEqual([...seen].sort(),boxes.filter(inside).map(b=>b.id).sort());
 }
 grid.clear();assert.equal(grid.some(0,0,()=>true),false,'cleared');
});
