import * as THREE from 'three';
import { PLANET, planetBendPoint } from './PlanetCurve';

interface Anchor {
  object:THREE.Object3D;
  original:THREE.Object3D['updateMatrixWorld'];
  wrapper:THREE.Object3D['updateMatrixWorld'];
  ownedMethod:boolean;
  flat:THREE.Vector3;
  bent:THREE.Vector3;
  hasBent:boolean;
}
interface AnchorSet { anchors:Map<THREE.Object3D,Anchor>; sources:Set<THREE.Light>; targets:Set<THREE.Object3D>; }
const prepared=new WeakMap<THREE.Object3D,AnchorSet>();

function attach(object:THREE.Object3D,state:AnchorSet):void {
  if(state.anchors.has(object))return;
  const anchor:Anchor={object,original:object.updateMatrixWorld,wrapper:object.updateMatrixWorld,ownedMethod:Object.hasOwn(object,'updateMatrixWorld'),flat:new THREE.Vector3(),bent:new THREE.Vector3(),hasBent:false};
  anchor.wrapper=function(this:THREE.Object3D,force?:boolean):void {
    // Renderer-side matrices were curved last time; restore the flat source
    // before the normal hierarchy update so an unchanged light cannot accrue
    // curvature on successive draws or shadow/foreground passes.
    if(anchor.hasBent)this.matrixWorld.setPosition(anchor.flat);
    anchor.original.call(this,force);anchor.flat.setFromMatrixPosition(this.matrixWorld);
    anchor.hasBent=PLANET.on&&PLANET.radius>0;
    if(anchor.hasBent){planetBendPoint(anchor.flat,anchor.bent);this.matrixWorld.setPosition(anchor.bent);}
  };
  object.updateMatrixWorld=anchor.wrapper;state.anchors.set(object,anchor);
}

export interface PlanetLightAnchorReport { sources:number; targets:number; wrapped:number; }

/** Three's light upload and shadow cameras read matrixWorld, whereas the
 * scene's geometry is bent in its vertex shader. Bend local lamp sources and
 * spot targets at that same render boundary. Authored transforms and ordinary
 * getWorldPosition() remain flat for placement, collisions and light budgets.
 * No new light, material, shader, per-frame traversal or allocation is needed.
 */
export function applyPlanetLightAnchors(root:THREE.Object3D):PlanetLightAnchorReport {
  let state=prepared.get(root);
  if(!state){state={anchors:new Map(),sources:new Set(),targets:new Set()};prepared.set(root,state);}
  root.traverse(object=>{
    const light=object as THREE.PointLight&THREE.SpotLight;
    if((!light.isPointLight&&!light.isSpotLight)||light.userData.planetLightExclude===true)return;
    state.sources.add(light);attach(light,state);
    if(light.isSpotLight){state.targets.add(light.target);attach(light.target,state);}
  });
  const report={sources:state.sources.size,targets:state.targets.size,wrapped:state.anchors.size};root.userData.planetLightAnchors=report;return report;
}

export function disposePlanetLightAnchors(root:THREE.Object3D):void {
  const state=prepared.get(root);if(!state)return;
  for(const anchor of state.anchors.values()){
    if(anchor.hasBent)anchor.object.matrixWorld.setPosition(anchor.flat);
    if(anchor.object.updateMatrixWorld===anchor.wrapper){
      if(anchor.ownedMethod)anchor.object.updateMatrixWorld=anchor.original;else Reflect.deleteProperty(anchor.object,'updateMatrixWorld');
    }
    anchor.hasBent=false;
  }
  prepared.delete(root);delete root.userData.planetLightAnchors;
}
