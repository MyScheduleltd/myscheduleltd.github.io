/** The guard's movement barrier is deliberately taller than its open ironwork. */
export const ROOFTOP_STAIR_OPEN_GUARD = 'rooftop-stair-open-guard';

export interface RooftopStairCameraBounds {
  minX:number;
  stairMinX:number;
  stairMaxX:number;
  stairMinZ:number;
  stairLandingMinZ:number;
  stairLandingMaxZ:number;
  stairTopZ:number;
  stairMaxZ:number;
}

export interface RooftopCameraCollider {
  label?:string;
  minX:number;maxX:number;minZ:number;maxZ:number;
  minY?:number;maxY?:number;
}

/**
 * Keep the normal orbit when its ray passes a slender freestanding pole from
 * the stair. A 0.4-unit utility pole can briefly cover a sliver of the avatar;
 * treating it as a building wall instead zooms the whole view by 26 percent.
 * This camera-only rule applies inside the actual stair/landing footprint,
 * to the explicit utility-pole label, with its small padded footprint and a
 * known tall post. Wide piers, masonry and unbounded obstacles still count.
 * The original collider remains in the body's physical collision solver.
 */
export function rooftopStairPassesSlenderPole(c:RooftopCameraCollider,x:number,z:number,r:RooftopStairCameraBounds):boolean {
  if(c.label!=='utility-pole')return false;
  const width=c.maxX-c.minX,depth=c.maxZ-c.minZ;
  if(width<=0||depth<=0||width>.65||depth>.65)return false;
  if(c.minY===undefined||c.maxY===undefined||!Number.isFinite(c.minY)||!Number.isFinite(c.maxY)||c.maxY-c.minY<6)return false;
  if(x<=r.stairMinX||z<r.stairMinZ-2.4||z>r.stairMaxZ)return false;
  return x<(z>=r.stairTopZ?r.minX:r.stairMaxX);
}

/**
 * Real masonry tread tops for camera clearance. Locomotion uses a continuous
 * pitch line and an avatar origin offset, neither of which is a solid surface.
 * At the half-landing that extra height falsely caught an uphill camera ray.
 */
export function rooftopStairCameraFloor(x:number,z:number,r:RooftopStairCameraBounds,roofY:number):number|undefined {
  if(x<=r.stairMinX||z<r.stairMinZ-2.4||z>r.stairMaxZ)return undefined;
  if(z>=r.stairTopZ)return x<r.minX?roofY:undefined;
  if(x>=r.stairMaxX)return undefined;
  if(z<r.stairMinZ)return .16;
  const half=roofY/2,riser=roofY/20,going=(r.stairLandingMinZ-r.stairMinZ)/9;
  if(z<r.stairLandingMinZ)return Math.min(9,Math.floor((z-r.stairMinZ)/going)+1)*riser;
  if(z<r.stairLandingMaxZ)return half;
  return half+Math.min(9,Math.floor((z-r.stairLandingMaxZ)/going)+1)*riser;
}

/**
 * Camera-only top of the sloping open guard, using the actual rail path in
 * createRooftopStair. The body barrier remains at the deck's coping height.
 * A single 8.5-high box formerly made the lower handrail an invisible wall.
 */
export function rooftopStairGuardCameraTop(z:number,r:RooftopStairCameraBounds,roofY:number):number {
  const half=roofY/2,riser=roofY/20,going=(r.stairLandingMinZ-r.stairMinZ)/9;
  const flightTwo=(at:number)=>half+riser+(at-r.stairLandingMaxZ)*riser/going;
  const landingEnd=r.stairLandingMaxZ-.04;
  // The 0.13 square beam's rotated corners extend above its centreline; the
  // cap is also taller. A 0.10 envelope includes both without widening the
  // camera barrier back to the old deck-height box.
  const railTop=1.8+.10;
  const firstZ=r.stairMinZ+.16,firstY=riser+.16*riser/going;
  const lowerEnd=r.stairLandingMinZ+.04,upperEnd=r.stairTopZ+.04;
  if(z<=firstZ)return firstY+railTop;
  if(z<lowerEnd)return firstY+(half-firstY)*(z-firstZ)/(lowerEnd-firstZ)+railTop;
  // The gooseneck is capped by a 0.2-deep joint. Its high edge belongs to the
  // half-landing too; keeping that narrow cap prevents a ray through its lip.
  if(z<landingEnd-.1)return half+railTop;
  const upperStart=flightTwo(landingEnd);
  if(z<=landingEnd)return upperStart+railTop;
  if(z<upperEnd)return upperStart+(roofY-upperStart)*(z-landingEnd)/(upperEnd-landingEnd)+railTop;
  return roofY+railTop;
}
