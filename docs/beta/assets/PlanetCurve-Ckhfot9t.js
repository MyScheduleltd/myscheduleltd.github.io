import{V as M,s as A,J as F,bo as R,b6 as B,Q as W,f as U,d as G,g as V}from"./three-CDfBmyXa.js";const f={on:!1,radius:170,centre:{value:new M},radiusUniform:{value:170}},j={},z=Symbol("material-compile-hook");function X(n){let t=n;for(;t[z]&&t[z]!==t;)t=t[z];return t}const q=`
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
`;function Y(n){if(f.on)return;f.on=!0,f.radius=n,f.radiusUniform.value=n;const t=F;t.logdepthbuf_pars_vertex=q+t.logdepthbuf_pars_vertex,t.project_vertex=H,t.worldpos_vertex=t.worldpos_vertex.replace("worldPosition = modelMatrix * worldPosition;",`worldPosition = modelMatrix * worldPosition;
	#ifndef PLANET_FLAT
	worldPosition.xyz = planetBend( worldPosition.xyz );
	#endif`);const a=R.sprite;a.vertexShader=a.vertexShader.replace("vec4 mvPosition = modelViewMatrix[ 3 ];",`#ifdef PLANET_FLAT
	vec4 mvPosition = modelViewMatrix[ 3 ];
	#else
	vec4 mvPosition = viewMatrix * vec4( planetBend( modelMatrix[ 3 ].xyz ), 1.0 );
	#endif`);const r=new WeakMap,s=function(){};Object.defineProperty(B.prototype,"onBeforeCompile",{configurable:!0,get(){const i=r.get(this),c=(o,l)=>{Object.assign(o.uniforms,j),o.uniforms.planetCentre=f.centre,o.uniforms.planetRadius=f.radiusUniform,i?.call(this,o,l)};return Object.defineProperty(c,z,{value:i??s}),c},set(i){r.set(this,i)}}),B.prototype.customProgramCacheKey=function(){return(r.get(this)??s).toString()}}function Z(n){if(!f.on)return;const t=n;t.defines={...t.defines??{},PLANET_FLAT:""},n.needsUpdate=!0}function tt(n,t){f.centre.value.set(n,0,t)}const w={d:new U,axis:new M,q:new W,m:new A,t:new A};function K(n,t=new M){const a=f.centre.value,r=f.radius,s=n.x-a.x,i=n.z-a.z,c=Math.hypot(s,i);if(c<1e-4)return t.copy(n);const o=Math.min(c/r,3.1),l=r+n.y,p=Math.sin(o)*l;return t.set(a.x+s/c*p,Math.cos(o)*l-r,a.z+i/c*p)}function Q(n,t=new A){const a=f.centre.value,r=n.x-a.x,s=n.z-a.z,i=Math.hypot(r,s);if(i<1e-4)return t.identity();const c=Math.min(i/f.radius,3.1);w.axis.set(s/i,0,-r/i),w.q.setFromAxisAngle(w.axis,c);const o=K(n);return t.makeTranslation(-n.x,-n.y,-n.z),w.m.makeRotationFromQuaternion(w.q),t.premultiply(w.m),w.t.makeTranslation(o.x,o.y,o.z),t.premultiply(w.t)}const L=new M,$=new A;function et(n){f.on&&(n.updateMatrixWorld(!0),n.traverse(t=>{t.isCSS3DObject&&(L.setFromMatrixPosition(t.matrixWorld),t.matrixWorld.premultiply(Q(L,$)))}))}function D(n,t,a=12e4,r=new M(1,1,1)){const s=n.index?n.toNonIndexed():n,i=Object.keys(s.attributes),c=i.map(e=>s.getAttribute(e)),o=s.getAttribute("position");o.count/3;const l=c.map(()=>[]),p=s.groups.length?s.groups:[{start:0,count:o.count,materialIndex:0}],y=[],g=t*t;let x=0,_=!1;const E=(e,u)=>{const m=[];for(let d=0;d<e.itemSize;d++)m.push(e.array[u*e.itemSize+d]);return m},P=i.indexOf("position"),N=(e,u)=>e.map((m,d)=>m.map((h,v)=>(h+u[d][v])/2)),S=(e,u)=>((e[P][0]-u[P][0])*r.x)**2+((e[P][1]-u[P][1])*r.y)**2+((e[P][2]-u[P][2])*r.z)**2,C=(e,u)=>{const m=[S(e[0],e[1]),S(e[1],e[2]),S(e[2],e[0])],d=m.indexOf(Math.max(...m));if(m[d]>g&&u<12&&x<a){_=!0;const h=e[d],v=e[(d+1)%3],b=e[(d+2)%3],T=N(h,v);C([h,T,b],u+1),C([T,v,b],u+1);return}x++;for(const h of e)h.forEach((v,b)=>l[b].push(...v))};for(const e of p){const u=x*3,m=Math.min(e.start+e.count,o.count);for(let d=e.start;d+2<m;d+=3)C([0,1,2].map(h=>c.map(v=>E(v,d+h))),0);y.push({start:u,count:x*3-u,materialIndex:e.materialIndex})}if(!_||x>=a)return;const k=new G;if(c.forEach((e,u)=>{const m=e.array.constructor;k.setAttribute(i[u],new V(new m(l[u]),e.itemSize,e.normalized))}),s.groups.length)for(const e of y)k.addGroup(e.start,e.count,e.materialIndex);return k}const I=new WeakMap,O=new WeakSet;function nt(n,t=3){if(!f.on)return 0;let a=0;const r=new M,s=new M,i=c=>Math.round(Math.log2(Math.max(Math.abs(c),1e-4))*8);return n.updateMatrixWorld(!0),n.traverse(c=>{const o=c;if(!o.isMesh||o.isSkinnedMesh||o.isInstancedMesh||o.renderOrder<=-2||!o.geometry?.getAttribute("position")||O.has(o.geometry))return;o.getWorldScale(r),r.set(Math.abs(r.x),Math.abs(r.y),Math.abs(r.z));const l=o.geometry;let p=I.get(l);p||I.set(l,p=new Map);const y=`${i(r.x)},${i(r.y)},${i(r.z)}`;if(p.has(y)){const x=p.get(y);x&&(o.geometry=x,a++);return}if(l.boundingBox||l.computeBoundingBox(),l.boundingBox.getSize(s).multiply(r),Math.max(s.x,s.y,s.z)<t*1.5){p.set(y,null);return}const g=D(l,t,12e4,r)??null;p.set(y,g),g&&(O.add(g),o.geometry=g,a++)}),a}export{z as MATERIAL_COMPILE_HOOK,f as PLANET,q as PLANET_GLSL,et as bendCss3d,Y as installPlanetCurve,Z as keepFlat,X as materialCompileHookIdentity,Q as planetBendMatrix,K as planetBendPoint,j as programUniforms,tt as setPlanetCentre,D as subdivideForPlanet,nt as subdivideSceneForPlanet};
