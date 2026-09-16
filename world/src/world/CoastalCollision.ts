export interface SolidBounds {
  minX:number;maxX:number;minZ:number;maxZ:number;minY?:number;maxY?:number;
  physical?:boolean;
}

export function overlapsBodyHeight(y:number,c:SolidBounds):boolean {
  if(c.physical)return (c.minY===undefined||y+3.05>c.minY+.001)&&(c.maxY===undefined||y-.28<c.maxY-.001);
  return (c.minY===undefined||y>=c.minY)&&(c.maxY===undefined||y<=c.maxY);
}

function penetration(x:number,z:number,y:number,radius:number,c:SolidBounds):number {
  if(!overlapsBodyHeight(y,c))return 0;
  return Math.max(0,Math.min(x-c.minX+radius,c.maxX+radius-x,z-c.minZ+radius,c.maxZ+radius-z));
}

/** Substeps prevent crossing thin posts. Escape is allowed only out of existing overlaps. */
export function moveCoastalBody(
  start:{x:number;y:number;z:number},dx:number,dz:number,radius:number,
  solids:readonly SolidBounds[],floor:(x:number,z:number)=>number,airborne=false,
):{x:number;z:number} {
  let x=start.x,z=start.z;
  const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
  const canStep=(nx:number,nz:number)=>{
    const sourceFloor=airborne?start.y:floor(x,z),targetFloor=airborne?start.y:floor(nx,nz);
    let escaping=false,overlapping=false;
    for(const solid of solids){
      const before=Math.max(penetration(x,z,start.y,radius,solid),penetration(x,z,sourceFloor,radius,solid));
      const after=Math.max(penetration(nx,nz,start.y,radius,solid),penetration(nx,nz,targetFloor,radius,solid));
      if(before>0){overlapping=true;if(after<before-1e-7)escaping=true;}
      if(after>before+1e-7)return false;
    }
    return !overlapping||escaping;
  };
  for(let i=0;i<count;i++){
    const nx=x+dx/count,nz=z+dz/count;
    if(canStep(nx,z))x=nx;
    if(canStep(x,nz))z=nz;
  }
  return {x,z};
}

/** A short static-obstacle detour, with a stable side choice per resident. */
export function coastalDetour(x:number,z:number,dx:number,dz:number,step:number,hand:number,blocked:(x:number,z:number)=>boolean):{x:number;z:number}|undefined {
  for(const angle of [Math.PI/6,Math.PI/3,Math.PI/2])for(const side of [hand,-hand]) {
    const c=Math.cos(angle),s=Math.sin(angle)*side;
    const vx=dx*c-dz*s,vz=dx*s+dz*c;
    // Check a little ahead as well as this frame, so the turn clears the post.
    if(!blocked(x+vx*step,z+vz*step)&&!blocked(x+vx*Math.max(step,.18),z+vz*Math.max(step,.18)))
      return {x:x+vx*step,z:z+vz*step};
  }
  return undefined;
}

/** Bounded A* around scenery. Edges sample both clearance and floor continuity. */
export function coastalRouteAround(
 start:{x:number;y:number;z:number}, goal:{x:number;y:number;z:number},
 blocked:(x:number,z:number,y:number)=>boolean, floor:(x:number,z:number,fromY:number)=>number,
):Array<{x:number;y:number;z:number}> {
 const cell=.65, margin=5;
 const edge=(a:typeof start,b:typeof start)=>{
   let y=a.y;
   const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.025));
   for(let i=1;i<=n;i++){
     const x=a.x+(b.x-a.x)*i/n,z=a.z+(b.z-a.z)*i/n,ny=floor(x,z,y);
     if(Math.abs(ny-y)>.45||blocked(x,z,ny))return undefined;
     y=ny;
   }
   return y;
 };
 type Node={x:number;y:number;z:number;g:number;f:number;parent?:Node;key:string};
 const h=(x:number,z:number)=>Math.hypot(goal.x-x,goal.z-z);
 const first:Node={...start,g:0,f:h(start.x,start.z),key:'0,0'};
 const open=[first],best=new Map<string,number>([['0,0',0]]);
 const minX=Math.min(start.x,goal.x)-margin,maxX=Math.max(start.x,goal.x)+margin;
 const minZ=Math.min(start.z,goal.z)-margin,maxZ=Math.max(start.z,goal.z)+margin;
 for(let visited=0;open.length&&visited<5000;visited++){
   let at=0;for(let i=1;i<open.length;i++)if(open[i].f<open[at].f)at=i;
   const node=open.splice(at,1)[0];
   if(node.g>(best.get(node.key)??Infinity))continue;
   if(h(node.x,node.z)<cell*1.5){
     const y=edge(node,goal);
     if(y!==undefined&&Math.abs(y-goal.y)<.6){
       const path:Array<typeof start>=[{...goal,y}];let p:Node|undefined=node;
       while(p?.parent){path.unshift({x:p.x,y:p.y,z:p.z});p=p.parent;}
       return path;
     }
   }
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
     const x=node.x+dx*cell,z=node.z+dz*cell;
     if(x<minX||x>maxX||z<minZ||z>maxZ)continue;
     const g=node.g+Math.hypot(dx,dz)*cell,key=`${Math.round((x-start.x)/cell)},${Math.round((z-start.z)/cell)}`;
     if(g>=(best.get(key)??Infinity))continue;
     const y=edge(node,{x,y:node.y,z});if(y===undefined)continue;
     best.set(key,g);open.push({x,y,z,g,f:g+h(x,z),key,parent:node});
   }
 }
 return [];
}
