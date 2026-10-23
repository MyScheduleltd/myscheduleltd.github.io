import * as THREE from 'three';

export type WorldCameraMode='follow'|'first-person'|'isometric';
export const WORLD_CAMERA_MODES:readonly WorldCameraMode[]=['follow','first-person','isometric'];
export const ISOMETRIC_VIEW=Object.freeze({yaw:Math.PI/4,pitch:Math.atan(1/Math.sqrt(2)),distance:34,span:22,clearance:24});
/**
 * How much deeper than the camera's own 34 the orthographic box has to start.
 * The picture does not depend on it, but clipping does: zoomed out, or on a
 * portrait phone whose box is twice as tall, the box's lower edge ran under
 * the ground at 34, so the ground nearest the camera and the tops of buildings
 * on that side were sliced off. Deep enough that the lowest edge clears the
 * ground by `clearance`, room for rooftops and the planet's fall. The camera
 * itself stays at 34, so the fog, which is measured from it, is unchanged.
 */
export function isometricExtraDepth(top:number):number {
  return Math.max(0,(top*Math.cos(ISOMETRIC_VIEW.pitch)+ISOMETRIC_VIEW.clearance)/Math.sin(ISOMETRIC_VIEW.pitch)-ISOMETRIC_VIEW.distance);
}
export const MOBILE_CAMERA_FOLLOW=Object.freeze({cooldownMs:1600,rate:.85});

/** One camera object preserves XR, CSS3D and projector ownership. Isometric
 * mode uses a real orthographic frustum and Three's orthographic type flag;
 * perspective properties remain available for the other two modes and XR. */
export class WorldCamera extends THREE.PerspectiveCamera {
  isOrthographicCamera=false;
  left=-11;right=11;top=11;bottom=-11;
  private orthographic=false;
  private orthographicSpan:number=ISOMETRIC_VIEW.span;
  /** Depth the orthographic box reaches behind the camera; `near` stays the perspective views'. */
  private orthographicBehind=0;
  setIsometricBehind(depth:number):void {
    if(depth===this.orthographicBehind)return;
    this.orthographicBehind=depth;if(this.orthographic)this.updateProjectionMatrix();
  }
  setIsometric(enabled:boolean,zoom=1):void {
    const span=ISOMETRIC_VIEW.span*THREE.MathUtils.clamp(zoom,.35,3);
    if(this.orthographic===enabled&&(!enabled||this.orthographicSpan===span))return;
    this.orthographic=enabled;this.orthographicSpan=span;
    Object.assign(this,{isPerspectiveCamera:!enabled,isOrthographicCamera:enabled});
    this.updateProjectionMatrix();
  }
  override updateProjectionMatrix():void {
    if(!this.orthographic){super.updateProjectionMatrix();return;}
    const half=this.orthographicSpan/2;
    // Portrait retains horizontal room rather than cropping a narrow slot.
    this.top=half/Math.min(1,this.aspect);this.bottom=-this.top;
    this.right=this.top*this.aspect;this.left=-this.right;
    this.projectionMatrix.makeOrthographic(this.left,this.right,this.top,this.bottom,this.near-this.orthographicBehind,this.far,this.coordinateSystem);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}

export function nextWorldCameraMode(current:WorldCameraMode):WorldCameraMode {
  return WORLD_CAMERA_MODES[(WORLD_CAMERA_MODES.indexOf(current)+1)%WORLD_CAMERA_MODES.length];
}

export function mobileFollowYaw(yaw:number,travelHeading:number,delta:number,now:number,lastManual:number,moving:boolean):number {
  if(!moving||now-lastManual<MOBILE_CAMERA_FOLLOW.cooldownMs)return yaw;
  const difference=Math.atan2(Math.sin(travelHeading+Math.PI-yaw),Math.cos(travelHeading+Math.PI-yaw));
  return yaw+difference*(1-Math.exp(-MOBILE_CAMERA_FOLLOW.rate*Math.min(.1,Math.max(0,delta))));
}
