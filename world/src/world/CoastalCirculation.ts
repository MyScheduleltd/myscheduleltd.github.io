import { HILL_WALK, EAST_SERVICE_LANE, groundRibbonEdges, insidePaving, type PlanPoint } from './CoastalTerrain';
export type Route={name:string;points:readonly PlanPoint[];width:number;kind:'road'|'walk'|'carpet'|'crossing'};
export const COASTAL_ROUTES:Route[]=[
 {name:'Arrival street',points:[[0,67],[0,12]],width:12,kind:'road'},
 {name:'Warehouse access street',points:[[-20,23.5],[-6,23.5]],width:7,kind:'road'},
 {name:'Drive-In access lane',points:EAST_SERVICE_LANE.map(p=>[p[0],p[2]] as PlanPoint),width:4.5,kind:'road'},
 {name:'West pavement south',points:[[-8.5,62],[-8.5,27.2]],width:3,kind:'walk'},
 {name:'West pavement north',points:[[-8.5,19.8],[-8.5,8]],width:3,kind:'walk'},
 {name:'East pavement south',points:[[8.5,62],[8.5,58.25]],width:3,kind:'walk'},
 {name:'East pavement north',points:[[8.5,53.75],[8.5,8]],width:3,kind:'walk'},
 {name:'Square to Drive-In',points:[[8.5,8],[8.5,-12],[0,-28]],width:3,kind:'walk'},
 // Stop the promenade before the Shore service lane. Its former diagonal
 // branch crossed the asphalt and met a second approach plus zebra stripes at
 // the theatre entrance, producing the stacked pale surfaces seen from the
 // road. The Shore frontage is intentionally open ground beside a clean lane.
 {name:'Coastal promenade',points:[[-49,-19],[-35,-18],[0,-18]],width:4,kind:'walk'},
 {name:'Palace public approach',points:[[-35,-16],[-35,-30.8]],width:7,kind:'walk'},
 {name:'Palace carpet',points:[[-13,-13],[-35,-13],[-35,-31.4]],width:3,kind:'carpet'},
 {name:'Warehouse forecourt north',points:[[-10,18.3],[-18,18.3]],width:3,kind:'walk'},
 {name:'Roof stair approach',points:[[10,8],[19.6,16],[19.6,17.6]],width:3,kind:'walk'},
 {name:'Shop pedestrian apron',points:[[23,5.5],[58,5.5]],width:5,kind:'walk'},
 {name:'Square east connection',points:[[10,5.5],[23,5.5]],width:3,kind:'walk'},
 {name:'Temple stair approach',points:[[63,4],[65,4]],width:13,kind:'walk'},
 {name:'Temple contour walk',points:HILL_WALK.map(p=>[p[0],p[2]] as PlanPoint),width:4,kind:'walk'},
];
for(const x of [59,60,61,62])COASTAL_ROUTES.push({name:'Hill walk crossing',points:[[x,4],[x,7]],width:.5,kind:'crossing'});

// Only painted stripes cross vehicle surfaces, with asphalt visible between them.
for(const x of [-4,-2,0,2,4])COASTAL_ROUTES.push({name:'Arrival zebra crossing',points:[[x,13],[x,16]],width:.8,kind:'crossing'});
for(const z of [21,23.5,26])COASTAL_ROUTES.push({name:'Warehouse zebra crossing',points:[[-10,z],[-7,z]],width:.8,kind:'crossing'});
for(const z of [54.2,55.1,56,56.9,57.8])COASTAL_ROUTES.push({name:'East lane zebra crossing',points:[[7,z],[10,z]],width:.55,kind:'crossing'});

export const ROAD_POLYGONS=COASTAL_ROUTES.filter(r=>r.kind==='road').flatMap(r=>{
  const edges=groundRibbonEdges(r.points,r.width);
  return edges.slice(1).map((e,i)=>[edges[i][0],e[0],e[1],edges[i][1]]);
});

// Keep posts and their footings outside the complete walking/vehicle envelope.
const LAMP_EXCLUSIONS=COASTAL_ROUTES.filter(r=>r.kind!=='crossing').flatMap(r=>{
  const edges=groundRibbonEdges(r.points,r.width+1.2);
  return edges.slice(1).map((e,i)=>[edges[i][0],e[0],e[1],edges[i][1]]);
});
export const streetLampObstructsRoute=(x:number,z:number):boolean=>LAMP_EXCLUSIONS.some(p=>insidePaving(x,z,p));
