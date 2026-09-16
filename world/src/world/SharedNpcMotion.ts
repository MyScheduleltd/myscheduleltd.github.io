export type NpcPoint={x:number;y:number;z:number};
export type NpcLeg={from:NpcPoint;to:NpcPoint;start:number;duration:number;pause?:boolean};
export const npcSeed=(id:string):number=>[...id].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,7);
/** Absolute service time makes motion independent of join time, frame rate and local obstacles. */
export function sampleNpcMotion(legs:readonly NpcLeg[],seconds:number,offset=0){
 const total=legs.at(-1)!.start+legs.at(-1)!.duration;
 const t=((seconds+offset)%total+total)%total;
 const leg=legs.find(l=>t<l.start+l.duration)??legs[legs.length-1];
 const p=leg.pause?0:Math.min(1,(t-leg.start)/leg.duration);
 return {x:leg.from.x+(leg.to.x-leg.from.x)*p,y:leg.from.y+(leg.to.y-leg.from.y)*p,z:leg.from.z+(leg.to.z-leg.from.z)*p,
 rotation:Math.atan2(leg.to.x-leg.from.x,leg.to.z-leg.from.z),moving:!leg.pause};
}
