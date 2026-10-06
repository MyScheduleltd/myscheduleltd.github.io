import{e as y,g as b,aP as I,aQ as R,a0 as T,Q as W,V as O,o as G,p as U}from"./three-2rK2zi8m.js";const l={on:!1,radius:170,centre:{value:new y},radiusUniform:{value:170}},V=`
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
`,Q=`
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
`;function H(e){if(l.on)return;l.on=!0,l.radius=e,l.radiusUniform.value=e;const n=I;n.logdepthbuf_pars_vertex=V+n.logdepthbuf_pars_vertex,n.project_vertex=Q,n.worldpos_vertex=n.worldpos_vertex.replace("worldPosition = modelMatrix * worldPosition;",`worldPosition = modelMatrix * worldPosition;
	#ifndef PLANET_FLAT
	worldPosition.xyz = planetBend( worldPosition.xyz );
	#endif`);const c=R.sprite;c.vertexShader=c.vertexShader.replace("vec4 mvPosition = modelViewMatrix[ 3 ];",`#ifdef PLANET_FLAT
	vec4 mvPosition = modelViewMatrix[ 3 ];
	#else
	vec4 mvPosition = viewMatrix * vec4( planetBend( modelMatrix[ 3 ].xyz ), 1.0 );
	#endif`);const o=new WeakMap,s=function(){};Object.defineProperty(T.prototype,"onBeforeCompile",{configurable:!0,get(){const i=o.get(this);return(a,r)=>{a.uniforms.planetCentre=l.centre,a.uniforms.planetRadius=l.radiusUniform,i?.call(this,a,r)}},set(i){o.set(this,i)}}),T.prototype.customProgramCacheKey=function(){return(o.get(this)??s).toString()}}function J(e){if(!l.on)return;const n=e;n.defines={...n.defines??{},PLANET_FLAT:""},e.needsUpdate=!0}function X(e,n){l.centre.value.set(e,0,n)}const w={d:new O,axis:new y,q:new W,m:new b,t:new b};function q(e,n=new y){const c=l.centre.value,o=l.radius,s=e.x-c.x,i=e.z-c.z,a=Math.hypot(s,i);if(a<1e-4)return n.copy(e);const r=Math.min(a/o,3.1),f=o+e.y,p=Math.sin(r)*f;return n.set(c.x+s/a*p,Math.cos(r)*f-o,c.z+i/a*p)}function $(e,n=new b){const c=l.centre.value,o=e.x-c.x,s=e.z-c.z,i=Math.hypot(o,s);if(i<1e-4)return n.identity();const a=Math.min(i/l.radius,3.1);w.axis.set(s/i,0,-o/i),w.q.setFromAxisAngle(w.axis,a);const r=q(e);return n.makeTranslation(-e.x,-e.y,-e.z),w.m.makeRotationFromQuaternion(w.q),n.premultiply(w.m),w.t.makeTranslation(r.x,r.y,r.z),n.premultiply(w.t)}const _=new y,j=new b;function Y(e){l.on&&(e.updateMatrixWorld(!0),e.traverse(n=>{n.isCSS3DObject&&(_.setFromMatrixPosition(n.matrixWorld),n.matrixWorld.premultiply($(_,j)))}))}function D(e,n,c=12e4,o=new y(1,1,1)){const s=e.index?e.toNonIndexed():e,i=Object.keys(s.attributes),a=i.map(t=>s.getAttribute(t)),r=s.getAttribute("position");r.count/3;const f=a.map(()=>[]),p=s.groups.length?s.groups:[{start:0,count:r.count,materialIndex:0}],M=[],g=n*n;let x=0,k=!1;const F=(t,u)=>{const m=[];for(let d=0;d<t.itemSize;d++)m.push(t.array[u*t.itemSize+d]);return m},P=i.indexOf("position"),E=(t,u)=>t.map((m,d)=>m.map((h,v)=>(h+u[d][v])/2)),A=(t,u)=>((t[P][0]-u[P][0])*o.x)**2+((t[P][1]-u[P][1])*o.y)**2+((t[P][2]-u[P][2])*o.z)**2,S=(t,u)=>{const m=[A(t[0],t[1]),A(t[1],t[2]),A(t[2],t[0])],d=m.indexOf(Math.max(...m));if(m[d]>g&&u<12&&x<c){k=!0;const h=t[d],v=t[(d+1)%3],z=t[(d+2)%3],B=E(h,v);S([h,B,z],u+1),S([B,v,z],u+1);return}x++;for(const h of t)h.forEach((v,z)=>f[z].push(...v))};for(const t of p){const u=x*3,m=Math.min(t.start+t.count,r.count);for(let d=t.start;d+2<m;d+=3)S([0,1,2].map(h=>a.map(v=>F(v,d+h))),0);M.push({start:u,count:x*3-u,materialIndex:t.materialIndex})}if(!k||x>=c)return;const C=new G;if(a.forEach((t,u)=>{const m=t.array.constructor;C.setAttribute(i[u],new U(new m(f[u]),t.itemSize,t.normalized))}),s.groups.length)for(const t of M)C.addGroup(t.start,t.count,t.materialIndex);return C}const L=new WeakMap,N=new WeakSet;function Z(e,n=3){if(!l.on)return 0;let c=0;const o=new y,s=new y,i=a=>Math.round(Math.log2(Math.max(Math.abs(a),1e-4))*8);return e.updateMatrixWorld(!0),e.traverse(a=>{const r=a;if(!r.isMesh||r.isSkinnedMesh||r.isInstancedMesh||r.renderOrder<=-2||!r.geometry?.getAttribute("position")||N.has(r.geometry))return;r.getWorldScale(o),o.set(Math.abs(o.x),Math.abs(o.y),Math.abs(o.z));const f=r.geometry;let p=L.get(f);p||L.set(f,p=new Map);const M=`${i(o.x)},${i(o.y)},${i(o.z)}`;if(p.has(M)){const x=p.get(M);x&&(r.geometry=x,c++);return}if(f.boundingBox||f.computeBoundingBox(),f.boundingBox.getSize(s).multiply(o),Math.max(s.x,s.y,s.z)<n*1.5){p.set(M,null);return}const g=D(f,n,12e4,o)??null;p.set(M,g),g&&(N.add(g),r.geometry=g,c++)}),c}export{l as PLANET,V as PLANET_GLSL,Y as bendCss3d,H as installPlanetCurve,J as keepFlat,$ as planetBendMatrix,q as planetBendPoint,X as setPlanetCentre,D as subdivideForPlanet,Z as subdivideSceneForPlanet};
