import * as THREE from 'three';
import { PS1_CANVAS_TILE_MEANS, ps1SurfaceTexture } from './Ps1Surfaces.ts';

/** The PS1 look's drawn tile for a family, shared with every tagged surface. */
export function pixelSurface(kind:'plaster'|'brick'|'ceramic'|'asphalt'):THREE.Texture {
  return ps1SurfaceTexture(kind,PS1_CANVAS_TILE_MEANS[kind]);
}

/** Project by the actual face orientation, so a four-unit wall and path share texel scale. */
export function worldSurfaceUV(g:THREE.BufferGeometry,metres=4):void {
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv:number[]=[];
  for(let i=0;i<p.count;i++) {
    const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
    uv.push((nx>ny&&nx>nz?p.getZ(i):p.getX(i))/metres,(ny>nx&&ny>nz?p.getZ(i):p.getY(i))/metres);
  }
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
}


/** Subtract convex road strips from paving triangles, preserving interpolated height. */
export function excludeRoads(mesh:THREE.Mesh,roads:readonly (readonly (readonly [number,number])[])[]):void {
  type P=[number,number,number];
  const positions=mesh.geometry.getAttribute('position'),vertices:number[]=[];
  const cross=(a:readonly number[],b:readonly number[],p:P)=>(b[0]-a[0])*(p[2]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  const half=(poly:P[],a:readonly number[],b:readonly number[],inside:boolean)=>{
    const out:P[]=[];
    for(let i=0;i<poly.length;i++){
      const p=poly[i],q=poly[(i+1)%poly.length],dp=cross(a,b,p),dq=cross(a,b,q);
      if(inside?dp>=-1e-8:dp<=1e-8)out.push(p);
      if(dp*dq<0){const t=dp/(dp-dq);out.push(p.map((v,j)=>v+(q[j]-v)*t) as P);}
    }
    return out;
  };
  for(let i=0;i<positions.count;i+=3){
    let pieces:P[][]=[[0,1,2].map(j=>[positions.getX(i+j),positions.getY(i+j),positions.getZ(i+j)] as P)];
    for(const road of roads){
      const outside:P[][]=[];
      for(const poly of pieces){
        let remaining=poly;
        for(let e=0;e<road.length&&remaining.length;e++){
          const a=road[e],b=road[(e+1)%road.length],part=half(remaining,a,b,false);
          if(part.length>=3)outside.push(part);
          remaining=half(remaining,a,b,true);
        }
      }
      pieces=outside;
    }
    for(const poly of pieces)for(let j=1;j<poly.length-1;j++){
      const a=poly[0],b=poly[j],c=poly[j+1];
      if(Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))>1e-8)vertices.push(...a,...b,...c);
    }
  }
  mesh.geometry.dispose();mesh.geometry=new THREE.BufferGeometry();
  mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));mesh.geometry.computeVertexNormals();
  mesh.userData.groundExclusions=roads;
}
