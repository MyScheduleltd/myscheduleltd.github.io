import{e as y,x as b,aN as F,aO as E,$ as _,Q as I,V as R,m as O,n as W}from"./three-BUSHR60o.js";const d={on:!1,radius:170,centre:{value:new y},radiusUniform:{value:170}},G=`
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
`,U=`
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
`;function K(n){if(d.on)return;d.on=!0,d.radius=n,d.radiusUniform.value=n;const o=F;o.logdepthbuf_pars_vertex=G+o.logdepthbuf_pars_vertex,o.project_vertex=U,o.worldpos_vertex=o.worldpos_vertex.replace("worldPosition = modelMatrix * worldPosition;",`worldPosition = modelMatrix * worldPosition;
	#ifndef PLANET_FLAT
	worldPosition.xyz = planetBend( worldPosition.xyz );
	#endif`);const a=E.sprite;a.vertexShader=a.vertexShader.replace("vec4 mvPosition = modelViewMatrix[ 3 ];",`#ifdef PLANET_FLAT
	vec4 mvPosition = modelViewMatrix[ 3 ];
	#else
	vec4 mvPosition = viewMatrix * vec4( planetBend( modelMatrix[ 3 ].xyz ), 1.0 );
	#endif`);const r=new WeakMap,l=function(){};Object.defineProperty(_.prototype,"onBeforeCompile",{configurable:!0,get(){const t=r.get(this);return(i,c)=>{i.uniforms.planetCentre=d.centre,i.uniforms.planetRadius=d.radiusUniform,t?.call(this,i,c)}},set(t){r.set(this,t)}}),_.prototype.customProgramCacheKey=function(){return(r.get(this)??l).toString()}}function H(n){if(!d.on)return;const o=n;o.defines={...o.defines??{},PLANET_FLAT:""},n.needsUpdate=!0}function J(n,o){d.centre.value.set(n,0,o)}const h={d:new R,axis:new y,q:new I,m:new b,t:new b};function V(n,o=new y){const a=d.centre.value,r=d.radius,l=n.x-a.x,t=n.z-a.z,i=Math.hypot(l,t);if(i<1e-4)return o.copy(n);const c=Math.min(i/r,3.1),v=r+n.y,m=Math.sin(c)*v;return o.set(a.x+l/i*m,Math.cos(c)*v-r,a.z+t/i*m)}function q(n,o=new b){const a=d.centre.value,r=n.x-a.x,l=n.z-a.z,t=Math.hypot(r,l);if(t<1e-4)return o.identity();const i=Math.min(t/d.radius,3.1);h.axis.set(l/t,0,-r/t),h.q.setFromAxisAngle(h.axis,i);const c=V(n);return o.makeTranslation(-n.x,-n.y,-n.z),h.m.makeRotationFromQuaternion(h.q),o.premultiply(h.m),h.t.makeTranslation(c.x,c.y,c.z),o.premultiply(h.t)}const k=new y,Q=new b;function $(n){d.on&&(n.updateMatrixWorld(!0),n.traverse(o=>{o.isCSS3DObject&&(k.setFromMatrixPosition(o.matrixWorld),o.matrixWorld.premultiply(q(k,Q)))}))}function j(n,o,a=12e4){const r=n.index?n.toNonIndexed():n,l=Object.keys(r.attributes),t=l.map(e=>r.getAttribute(e)),i=r.getAttribute("position");i.count/3;const c=t.map(()=>[]),v=r.groups.length?r.groups:[{start:0,count:i.count,materialIndex:0}],m=[],L=o*o;let w=0,C=!1;const B=(e,s)=>{const f=[];for(let u=0;u<e.itemSize;u++)f.push(e.array[s*e.itemSize+u]);return f},g=l.indexOf("position"),N=(e,s)=>e.map((f,u)=>f.map((p,x)=>(p+s[u][x])/2)),z=(e,s)=>(e[g][0]-s[g][0])**2+(e[g][1]-s[g][1])**2+(e[g][2]-s[g][2])**2,A=(e,s)=>{const f=[z(e[0],e[1]),z(e[1],e[2]),z(e[2],e[0])],u=f.indexOf(Math.max(...f));if(f[u]>L&&s<12&&w<a){C=!0;const p=e[u],x=e[(u+1)%3],P=e[(u+2)%3],T=N(p,x);A([p,T,P],s+1),A([T,x,P],s+1);return}w++;for(const p of e)p.forEach((x,P)=>c[P].push(...x))};for(const e of v){const s=w*3,f=Math.min(e.start+e.count,i.count);for(let u=e.start;u+2<f;u+=3)A([0,1,2].map(p=>t.map(x=>B(x,u+p))),0);m.push({start:s,count:w*3-s,materialIndex:e.materialIndex})}if(!C||w>=a)return;const S=new O;if(t.forEach((e,s)=>{const f=e.array.constructor;S.setAttribute(l[s],new W(new f(c[s]),e.itemSize,e.normalized))}),r.groups.length)for(const e of m)S.addGroup(e.start,e.count,e.materialIndex);return S}const M=new WeakMap;function X(n,o=3){if(!d.on)return 0;let a=0;const r=new y;return n.updateMatrixWorld(!0),n.traverse(l=>{const t=l;if(!t.isMesh||t.isSkinnedMesh||t.isInstancedMesh||t.renderOrder<=-2||!t.geometry?.getAttribute("position"))return;const i=M.get(t.geometry);if(i!==void 0){i&&(t.geometry=i);return}t.geometry.boundingSphere||t.geometry.computeBoundingSphere(),t.getWorldScale(r);const c=Math.max(Math.abs(r.x),Math.abs(r.y),Math.abs(r.z));if(t.geometry.boundingSphere.radius*c<o*.75){M.set(t.geometry,null);return}const v=t.geometry,m=j(v,o/c)??null;M.set(v,m),m&&(M.set(m,null),t.geometry=m,a++)}),a}export{d as PLANET,G as PLANET_GLSL,$ as bendCss3d,K as installPlanetCurve,H as keepFlat,q as planetBendMatrix,V as planetBendPoint,J as setPlanetCentre,j as subdivideForPlanet,X as subdivideSceneForPlanet};
