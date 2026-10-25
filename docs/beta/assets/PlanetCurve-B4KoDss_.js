import{V as M,s as A,J as F,bo as R,b6 as B,Q as W,d as U,e as G,f as V}from"./three-2LnOrGny.js";const f={on:!1,radius:170,centre:{value:new M},radiusUniform:{value:170}},j={},z=Symbol("material-compile-hook");function X(n){let e=n;for(;e[z]&&e[z]!==e;)e=e[z];return e}const q=`
uniform vec3 planetCentre;
uniform float planetRadius;
vec3 planetBend(vec3 w) {
  if (planetRadius <= 0.0) return w;
  vec2 d = w.xz - planetCentre.xz;
  float r = length(d);
  if (r < 1e-4) return w;
  float th = min(r / planetRadius, 3.1);
  float h = planetRadius + w.y;
  vec2 dir = d / r;
  float s = sin(th) * h;
  return vec3(planetCentre.x + dir.x * s, cos(th) * h - planetRadius, planetCentre.z + dir.y * s);
}
`,H=`
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
#ifdef PLANET_FLAT
	mvPosition = modelViewMatrix * mvPosition;
#else
	mvPosition = viewMatrix * vec4( planetBend( ( modelMatrix * mvPosition ).xyz ), 1.0 );
#endif
gl_Position = projectionMatrix * mvPosition;
`;function Y(n){if(f.on)return;f.on=!0,f.radius=n,f.radiusUniform.value=n;const e=F;e.logdepthbuf_pars_vertex=q+e.logdepthbuf_pars_vertex,e.project_vertex=H,e.worldpos_vertex=e.worldpos_vertex.replace("worldPosition = modelMatrix * worldPosition;",`worldPosition = modelMatrix * worldPosition;
	#ifndef PLANET_FLAT
	worldPosition.xyz = planetBend( worldPosition.xyz );
	#endif`);const a=R.sprite;a.vertexShader=a.vertexShader.replace("vec4 mvPosition = modelViewMatrix[ 3 ];",`#ifdef PLANET_FLAT
	vec4 mvPosition = modelViewMatrix[ 3 ];
	#else
	vec4 mvPosition = viewMatrix * vec4( planetBend( modelMatrix[ 3 ].xyz ), 1.0 );
	#endif`);const r=new WeakMap,s=function(){};Object.defineProperty(B.prototype,"onBeforeCompile",{configurable:!0,get(){const i=r.get(this),c=(o,l)=>{Object.assign(o.uniforms,j),o.uniforms.planetCentre=f.centre,o.uniforms.planetRadius=f.radiusUniform,i?.call(this,o,l)};return Object.defineProperty(c,z,{value:i??s}),c},set(i){r.set(this,i)}}),B.prototype.customProgramCacheKey=function(){return(r.get(this)??s).toString()}}function Z(n){if(!f.on)return;const e=n;e.defines={...e.defines??{},PLANET_FLAT:""},n.needsUpdate=!0}function ee(n,e){f.centre.value.set(n,0,e)}const w={d:new U,axis:new M,q:new W,m:new A,t:new A};function K(n,e=new M){const a=f.centre.value,r=f.radius,s=n.x-a.x,i=n.z-a.z,c=Math.hypot(s,i);if(c<1e-4)return e.copy(n);const o=Math.min(c/r,3.1),l=r+n.y,p=Math.sin(o)*l;return e.set(a.x+s/c*p,Math.cos(o)*l-r,a.z+i/c*p)}function Q(n,e=new A){const a=f.centre.value,r=n.x-a.x,s=n.z-a.z,i=Math.hypot(r,s);if(i<1e-4)return e.identity();const c=Math.min(i/f.radius,3.1);w.axis.set(s/i,0,-r/i),w.q.setFromAxisAngle(w.axis,c);const o=K(n);return e.makeTranslation(-n.x,-n.y,-n.z),w.m.makeRotationFromQuaternion(w.q),e.premultiply(w.m),w.t.makeTranslation(o.x,o.y,o.z),e.premultiply(w.t)}const L=new M,$=new A;function te(n){f.on&&(n.updateMatrixWorld(!0),n.traverse(e=>{e.isCSS3DObject&&(L.setFromMatrixPosition(e.matrixWorld),e.matrixWorld.premultiply(Q(L,$)))}))}function D(n,e,a=12e4,r=new M(1,1,1)){const s=n.index?n.toNonIndexed():n,i=Object.keys(s.attributes),c=i.map(t=>s.getAttribute(t)),o=s.getAttribute("position");o.count/3;const l=c.map(()=>[]),p=s.groups.length?s.groups:[{start:0,count:o.count,materialIndex:0}],y=[],g=e*e;let x=0,_=!1;const E=(t,u)=>{const m=[];for(let d=0;d<t.itemSize;d++)m.push(t.array[u*t.itemSize+d]);return m},P=i.indexOf("position"),N=(t,u)=>t.map((m,d)=>m.map((h,v)=>(h+u[d][v])/2)),S=(t,u)=>((t[P][0]-u[P][0])*r.x)**2+((t[P][1]-u[P][1])*r.y)**2+((t[P][2]-u[P][2])*r.z)**2,C=(t,u)=>{const m=[S(t[0],t[1]),S(t[1],t[2]),S(t[2],t[0])],d=m.indexOf(Math.max(...m));if(m[d]>g&&u<12&&x<a){_=!0;const h=t[d],v=t[(d+1)%3],b=t[(d+2)%3],T=N(h,v);C([h,T,b],u+1),C([T,v,b],u+1);return}x++;for(const h of t)h.forEach((v,b)=>l[b].push(...v))};for(const t of p){const u=x*3,m=Math.min(t.start+t.count,o.count);for(let d=t.start;d+2<m;d+=3)C([0,1,2].map(h=>c.map(v=>E(v,d+h))),0);y.push({start:u,count:x*3-u,materialIndex:t.materialIndex})}if(!_||x>=a)return;const k=new G;if(c.forEach((t,u)=>{const m=t.array.constructor;k.setAttribute(i[u],new V(new m(l[u]),t.itemSize,t.normalized))}),s.groups.length)for(const t of y)k.addGroup(t.start,t.count,t.materialIndex);return k}const I=new WeakMap,O=new WeakSet;function ne(n,e=3){if(!f.on)return 0;let a=0;const r=new M,s=new M,i=c=>Math.round(Math.log2(Math.max(Math.abs(c),1e-4))*8);return n.updateMatrixWorld(!0),n.traverse(c=>{const o=c;if(!o.isMesh||o.isSkinnedMesh||o.isInstancedMesh||o.renderOrder<=-2||!o.geometry?.getAttribute("position")||O.has(o.geometry))return;o.getWorldScale(r),r.set(Math.abs(r.x),Math.abs(r.y),Math.abs(r.z));const l=o.geometry;let p=I.get(l);p||I.set(l,p=new Map);const y=`${i(r.x)},${i(r.y)},${i(r.z)}`;if(p.has(y)){const x=p.get(y);x&&(o.geometry=x,a++);return}if(l.boundingBox||l.computeBoundingBox(),l.boundingBox.getSize(s).multiply(r),Math.max(s.x,s.y,s.z)<e*1.5){p.set(y,null);return}const g=D(l,e,12e4,r)??null;p.set(y,g),g&&(O.add(g),o.geometry=g,a++)}),a}export{z as MATERIAL_COMPILE_HOOK,f as PLANET,q as PLANET_GLSL,te as bendCss3d,Y as installPlanetCurve,Z as keepFlat,X as materialCompileHookIdentity,Q as planetBendMatrix,K as planetBendPoint,j as programUniforms,ee as setPlanetCentre,D as subdivideForPlanet,ne as subdivideSceneForPlanet};
