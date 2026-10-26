import * as THREE from 'three';

export const SNOW_SURFACE_BUDGET = Object.freeze({
  terrainStep: 2, minimumStep: .25, maximumRise: 1, maximumError: .12,
  terrainTriangles: 100_000, sourceTriangles: 200_000, surfaceTriangles: 40_000,
  // The box-office shell has many small, overlapping roof-edge faces. Allow
  // their exact exposed envelope while retaining independent total triangle,
  // input, spatial-reference and construction-time bounds.
  terrainSamples:250_000, clippingPieces: 256, binSize: 8, binReferences:1_000_000, contactLift: .006,
});
export interface SnowTerrainQuery {
  heightAt(x: number, z: number): number;
  dryAt(x: number, z: number): boolean;
  shelteredAt(x: number, z: number, y: number): boolean;
}
export interface SnowSurfaceSource {
  id: string;
  object: THREE.Object3D;
  /** Moving boats/actors remain independent of the fixed dock registry. */
  exclude?: readonly THREE.Object3D[];
  /** Dock caps must stay above the real waterline, including tide bands. */
  minimumHeight?:number;
  /** Real treads/decks replace their virtual walking ramp at any height. */
  terrainMask?:boolean;
  /** Imported fixed shells replace a fallback after admission downloads.
   * Proxies intentionally keep the default, which also reads hidden objects. */
  visibleOnly?:boolean;
  /** Exact midpoint refinement for broad faces below a dense sculpture.
   * Bounds local clipping work without changing its surface or global caps. */
  maximumFaceSpan?:number;
  /** Detailed outdoor props catch snow without acting as a building roof.
   * Keep the surrounding ground blanket and particle shelter query unchanged. */
  sheltersGround?:boolean;
}
type Point = { x: number; y: number; z: number };
type Triangle = { a: Point; b: Point; c: Point; index: number; sourceId:string; terrainMask:boolean; sheltersGround:boolean; minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number; plane: [number, number, number] };
export interface SnowSurfaceReport {sourceTriangles:number;topTriangles:number;triangles:number;sources:Array<{id:string;sourceTriangles:number;topTriangles:number}>}
type Face = readonly [Point, Point, Point];
const EPS = 1e-7;
const area = (a: Point, b: Point, c: Point) => (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const pointKey = (p: Point) => `${Math.round(p.x*100_000)},${Math.round(p.y*100_000)},${Math.round(p.z*100_000)}`;

/** Welded, indexed geometry keeps adaptive coverage cheaper than repeating
 * every terrain corner. A skirt's lower edge stays on its real support while
 * its upper edge grows with the same snow uniform as every other surface. */
function geometryFromFaces(faces: readonly Face[], skirts: boolean): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], lifts: number[] = [], indices: number[] = [];
  const vertices = new Map<string, number>(), edges = new Map<string, { a: Point; b: Point; count: number }>();
  const vertex = (p: Point, lift = 1) => {
    const key = pointKey(p)+':'+lift; let index = vertices.get(key);
    if (index !== undefined) return index;
    index = positions.length/3; vertices.set(key,index);
    positions.push(p.x,p.y+SNOW_SURFACE_BUDGET.contactLift,p.z); lifts.push(lift);
    const shade=.94+.055*(Math.sin(p.x*3.1+p.z*2.4)*.5+.5); colors.push(shade,shade,shade);
    return index;
  };
  const edge = (a: Point,b: Point) => {
    const ak=pointKey(a),bk=pointKey(b),key=ak<bk?ak+'|'+bk:bk+'|'+ak;
    const existing=edges.get(key);if(existing)existing.count++;else edges.set(key,{a,b,count:1});
  };
  for(const face of faces){
    indices.push(...face.map(p=>vertex(p)));
    if(skirts){edge(face[0],face[1]);edge(face[1],face[2]);edge(face[2],face[0]);}
  }
  if(skirts)for(const {a,b,count}of edges.values())if(count===1){
    const at=vertex(a),bt=vertex(b),ab=vertex(a,0),bb=vertex(b,0);
    indices.push(at,ab,bt,bt,ab,bb);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('snowLift',new THREE.Float32BufferAttribute(lifts,1));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  if(geometry.boundingBox&&!geometry.boundingBox.isEmpty()){
    geometry.boundingBox.max.y+=.12;
    geometry.boundingBox.getBoundingSphere(geometry.boundingSphere!);
  }
  return geometry;
}

/** Refine only genuine shoreline/shelter/cliff/curvature boundaries. The
 * second pass shares every neighbouring edge vertex, so a refined hill never
 * opens a T-junction crack against a broad pavement cell. */
export function buildSnowTerrain(query: SnowTerrainQuery): { geometry: THREE.BufferGeometry; samples: number; cells: number } {
  const west=-126,east=128,north=-74,south=100;
  type Sample=Point&{valid:boolean};
  type Cell={x:number;z:number;size:number;a:Sample;b:Sample;c:Sample;d:Sample;centre:Sample};
  const cache=new Map<number,Sample>(),leaves:Cell[]=[];
  const key=(x:number,z:number)=>(Math.round((z-north)*8)*4096+Math.round((x-west)*8));
  const sample=(x:number,z:number):Sample=>{
    const k=key(x,z),known=cache.get(k);if(known)return known;
    if(cache.size>=SNOW_SURFACE_BUDGET.terrainSamples)throw new Error('Snow terrain queries exceed the fixed construction budget');
    const y=query.heightAt(x,z),p={x,y,z,valid:Number.isFinite(y)&&query.dryAt(x,z)&&!query.shelteredAt(x,z,y+.1)};
    cache.set(k,p);return p;
  };
  const visit=(x:number,z:number,size:number):void=>{
    const a=sample(x,z),b=sample(x,z+size),c=sample(x+size,z),d=sample(x+size,z+size),centre=sample(x+size/2,z+size/2);
    const points=[a,b,c,d],all=points.every(p=>p.valid),any=points.some(p=>p.valid)||centre.valid;
    if(!any)return;
    const rise=all?Math.max(a.y,b.y,c.y,d.y)-Math.min(a.y,b.y,c.y,d.y):Infinity;
    const error=all&&centre.valid?Math.abs(centre.y-(a.y+b.y+c.y+d.y)/4):Infinity;
    if((!all||!centre.valid||rise>SNOW_SURFACE_BUDGET.maximumRise||error>SNOW_SURFACE_BUDGET.maximumError)&&size>SNOW_SURFACE_BUDGET.minimumStep){
      const half=size/2;visit(x,z,half);visit(x+half,z,half);visit(x,z+half,half);visit(x+half,z+half,half);return;
    }
    if(all&&centre.valid&&rise<=SNOW_SURFACE_BUDGET.maximumRise)leaves.push({x,z,size,a,b,c,d,centre});
    if(leaves.length>SNOW_SURFACE_BUDGET.terrainTriangles/2)throw new Error('Snow terrain coverage exceeds the fixed construction budget');
  };
  for(let z=north;z<south;z+=SNOW_SURFACE_BUDGET.terrainStep)for(let x=west;x<east;x+=SNOW_SURFACE_BUDGET.terrainStep)visit(x,z,SNOW_SURFACE_BUDGET.terrainStep);
  const faces:Face[]=[];
  for(const cell of leaves){
    const {x,z,size,a,b,c,d,centre}=cell,ring:Sample[]=[];
    const append=(sx:number,sz:number,dx:number,dz:number)=>{
      for(let at=0;at<size-.00001;at+=SNOW_SURFACE_BUDGET.minimumStep){
        const p=cache.get(key(sx+dx*at,sz+dz*at));if(p?.valid)ring.push(p);
      }
    };
    append(x,z,0,1);append(x,z+size,1,0);append(x+size,z+size,0,-1);append(x+size,z,-1,0);
    if(ring.length===4)faces.push([a,b,c],[c,b,d]);
    else for(let i=0;i<ring.length;i++)faces.push([centre,ring[i],ring[(i+1)%ring.length]]);
    if(faces.length>SNOW_SURFACE_BUDGET.terrainTriangles)throw new Error('Snow terrain triangles exceed the fixed construction budget');
  }
  return {geometry:geometryFromFaces(faces,false),samples:cache.size,cells:leaves.length};
}

function sourceTriangles(sources: readonly SnowSurfaceSource[],minimumUp=.5): Triangle[] {
  const result:Triangle[]=[];let inspected=0,refinements=0;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
  for(const source of sources){
    if(source.maximumFaceSpan!==undefined&&(!Number.isFinite(source.maximumFaceSpan)||source.maximumFaceSpan<=0))throw new Error('Snow source face span must be finite and positive');
    const excluded=new Set(source.exclude??[]);source.object.updateWorldMatrix(true,true);
    const visit=(object:THREE.Object3D)=>{
      if(excluded.has(object)||(source.visibleOnly&&!object.visible))return;
      const mesh=object as THREE.Mesh;
      if(mesh.isMesh&&!(mesh as THREE.SkinnedMesh).isSkinnedMesh&&!(mesh as THREE.InstancedMesh).isInstancedMesh){
        const geometry=mesh.geometry,position=geometry?.attributes.position,index=geometry?.index;
        if(position){
          const count=index?index.count:position.count,flipped=mesh.matrixWorld.determinant()<0;
          for(let i=0;i+2<count;i+=3){
            if(++inspected>SNOW_SURFACE_BUDGET.sourceTriangles)throw new Error('Authored snow sources exceed the fixed triangle inspection budget');
            const read=(point:THREE.Vector3,offset:number)=>point.fromBufferAttribute(position,index?index.getX(i+offset):i+offset).applyMatrix4(mesh.matrixWorld);
            read(a,0);read(b,flipped?2:1);read(c,flipped?1:2);
            normal.crossVectors(ab.subVectors(b,a),ac.subVectors(c,a));
            if(![a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z].every(Number.isFinite)||normal.y<=0||normal.y/normal.length()<minimumUp)continue;
            if(source.minimumHeight!==undefined&&Math.min(a.y,b.y,c.y)<source.minimumHeight)continue;
            const pa={x:a.x,y:a.y,z:a.z},pb={x:b.x,y:b.y,z:b.z},pc={x:c.x,y:c.y,z:c.z};
            const nx=normal.x,ny=normal.y,nz=normal.z;
            const plane:[number,number,number]=[-nx/ny,-nz/ny,(nx*a.x+ny*a.y+nz*a.z)/ny];
            const append=(a:Point,b:Point,c:Point)=>{
              if(result.length>=SNOW_SURFACE_BUDGET.sourceTriangles)throw new Error('Authored snow refinement exceeds the fixed triangle inspection budget');
              result.push({a,b,c,index:result.length,sourceId:source.id,terrainMask:!!source.terrainMask,sheltersGround:source.sheltersGround!==false,minX:Math.min(a.x,b.x,c.x),maxX:Math.max(a.x,b.x,c.x),
                minZ:Math.min(a.z,b.z,c.z),maxZ:Math.max(a.z,b.z,c.z),minY:Math.min(a.y,b.y,c.y),maxY:Math.max(a.y,b.y,c.y),plane});
            };
            // The existing roofs and terrain retain their unrefined path.
            if(source.maximumFaceSpan===undefined){append(pa,pb,pc);continue;}
            const pending:Array<[Point,Point,Point,number]>=[[pa,pb,pc,0]];
            while(pending.length){
              const[a,b,c,depth]=pending.pop()!;
              if(Math.max(Math.max(a.x,b.x,c.x)-Math.min(a.x,b.x,c.x),Math.max(a.z,b.z,c.z)-Math.min(a.z,b.z,c.z))>source.maximumFaceSpan){
                if(depth>=32)throw new Error('Authored snow refinement exceeds the fixed subdivision depth');
                if(++refinements>SNOW_SURFACE_BUDGET.sourceTriangles)throw new Error('Authored snow refinement exceeds the fixed triangle inspection budget');
                const face=[a,b,c];
                const length=(a:Point,b:Point)=>(a.x-b.x)**2+(a.z-b.z)**2;
                let edge=0;if(length(face[1],face[2])>length(face[0],face[1]))edge=1;
                if(length(face[2],face[0])>length(face[edge],face[(edge+1)%3]))edge=2;
                const start=face[edge],end=face[(edge+1)%3],opposite=face[(edge+2)%3],middle={x:(start.x+end.x)/2,y:(start.y+end.y)/2,z:(start.z+end.z)/2};
                pending.push([start,middle,opposite,depth+1],[middle,end,opposite,depth+1]);continue;
              }
              append(a,b,c);
            }
          }
        }
      }
      for(const child of object.children)visit(child);
    };visit(source.object);
  }
  return result;
}
type HalfPlane=(p:Point)=>number;
const interpolate=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
function splitPolygon(polygon:Point[],distance:HalfPlane):{inside:Point[];outside:Point[]}{
  const inside:Point[]=[],outside:Point[]=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],da=distance(a),db=distance(b),ain=da>=-EPS,bin=db>=-EPS;
    (ain?inside:outside).push(a);
    if(ain!==bin){const p=interpolate(a,b,da/(da-db));inside.push(p);outside.push(p);}
  }
  return {inside,outside};
}
function subtractAbove(polygon:Point[],cover:Triangle,subject:Triangle,terrainSubject=false):Point[][]{
  let remaining=polygon;const outside:Point[][]=[];
  const winding=Math.sign(area(cover.a,cover.b,cover.c));
  const planes:HalfPlane[]=[];
  for(const [a,b]of[[cover.a,cover.b],[cover.b,cover.c],[cover.c,cover.a]])planes.push(p=>winding*((b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x)));
  // A deterministic first triangle owns any coplanar overlap. This also
  // removes duplicate roof panels without shaving a legitimate higher tier.
  const threshold=cover.index<subject.index?-1e-5:1e-5;
  if(!(terrainSubject&&cover.terrainMask))planes.push(p=>cover.plane[0]*p.x+cover.plane[1]*p.z+cover.plane[2]-p.y-threshold);
  // Bins deliberately include neighbours. A shared edge, or a covering plane
  // entirely below this face, removes no area and must not fragment the face
  // into ever smaller pieces on every neighbouring triangle.
  let overlap=polygon;
  for(const plane of planes){overlap=splitPolygon(overlap,plane).inside;if(overlap.length<3)return[polygon];}
  let overlapArea=0;for(let i=1;i+1<overlap.length;i++)overlapArea+=Math.abs(area(overlap[0],overlap[i],overlap[i+1]));
  if(overlapArea<1e-7)return[polygon];
  if(polygon.every(p=>planes.every(plane=>plane(p)>=-EPS)))return[];
  for(const plane of planes){
    const split=splitPolygon(remaining,plane);
    if(split.outside.length>=3)outside.push(split.outside);
    remaining=split.inside;if(remaining.length<3)break;
  }
  return outside;
}

/** Retain only compact numeric triangle data, never the source object tree or
 * construction geometry. The nested lookup also avoids per-particle key strings. */
function shelterQuery(bins:Map<string,Triangle[]>,size:number):(x:number,z:number,y:number)=>boolean {
  const columns=new Map<number,Map<number,Triangle[]>>();
  for(const [key,triangles]of bins){
    const overhead=triangles.filter(t=>t.sheltersGround);if(!overhead.length)continue;
    const [x,z]=key.split(',').map(Number),column=columns.get(x)??new Map<number,Triangle[]>();
    column.set(z,overhead.sort((a,b)=>b.maxY-a.maxY));columns.set(x,column);
  }
  return(x,z,y)=>{
    const candidates=columns.get(Math.floor(x/size))?.get(Math.floor(z/size));
    if(!candidates||!Number.isFinite(y))return false;
    for(const t of candidates){
      if(t.maxY<=y+.01)break;
      if(x<t.minX-EPS||x>t.maxX+EPS||z<t.minZ-EPS||z>t.maxZ+EPS||t.plane[0]*x+t.plane[1]*z+t.plane[2]<=y+.01)continue;
      const winding=Math.sign(area(t.a,t.b,t.c));
      if(winding*((t.b.x-t.a.x)*(z-t.a.z)-(t.b.z-t.a.z)*(x-t.a.x))>=-EPS&&
        winding*((t.c.x-t.b.x)*(z-t.b.z)-(t.c.z-t.b.z)*(x-t.b.x))>=-EPS&&
        winding*((t.a.x-t.c.x)*(z-t.c.z)-(t.a.z-t.c.z)*(x-t.c.x))>=-EPS)return true;
    }
    return false;
  };
}

/** The exact exposed upward envelope of the explicit fixed registry. No
 * bounding rectangle can spill over a kicked roof, coat an interior floor,
 * bridge a gap between dock planks, or rise above a real car cushion. */
export function buildSnowSurfaceMeshes(sources: readonly SnowSurfaceSource[],terrain?:THREE.BufferGeometry,separateRefined=false): SnowSurfaceReport&{geometry:THREE.BufferGeometry; detailGeometry?:THREE.BufferGeometry; terrainGeometry?:THREE.BufferGeometry; shelteredAt:(x:number,z:number,y:number)=>boolean} {
  const triangles=sourceTriangles(sources),terrainTriangles:Triangle[]=[];
  if(terrain&&triangles.length){
    // The terrain's input already has the tiny contact lift. Compare its true
    // supporting height with the authored registry, then add that lift once
    // when the clipped geometry is packed again. This is a CPU-only temporary.
    const measurement=new THREE.Mesh(terrain,new THREE.MeshBasicMaterial());
    measurement.position.y=-SNOW_SURFACE_BUDGET.contactLift;
    try{terrainTriangles.push(...sourceTriangles([{id:'terrain',object:measurement}],.001));}
    finally{measurement.material.dispose();}
    for(const t of terrainTriangles)t.index+=triangles.length;
  }
  const bins=new Map<string,Triangle[]>(),size=SNOW_SURFACE_BUDGET.binSize;
  let references=0;
  for(const t of triangles){
    if((Math.floor(t.maxX/size)-Math.floor(t.minX/size)+1)*(Math.floor(t.maxZ/size)-Math.floor(t.minZ/size)+1)>4096)throw new Error('Authored snow source exceeds the spatial bounds');
    for(let z=Math.floor(t.minZ/size);z<=Math.floor(t.maxZ/size);z++)for(let x=Math.floor(t.minX/size);x<=Math.floor(t.maxX/size);x++){
      if(++references>SNOW_SURFACE_BUDGET.binReferences)throw new Error('Authored snow registry exceeds the spatial reference budget');
      const key=x+','+z,list=bins.get(key)??[];list.push(t);bins.set(key,list);
    }
  }
  const faces:Face[]=[],detailFaces:Face[]=[],terrainFaces:Face[]=[],counts=new Map(sources.map(s=>[s.id,{id:s.id,sourceTriangles:0,topTriangles:0}]));
  const refinedIds=new Set(separateRefined?sources.filter(s=>s.maximumFaceSpan!==undefined).map(s=>s.id):[]);
  for(const t of triangles)counts.get(t.sourceId)!.sourceTriangles++;
  for(const subject of [...triangles,...terrainTriangles]){
    const terrainSubject=subject.index>=triangles.length;
    const candidates=new Set<Triangle>();
    for(let z=Math.floor(subject.minZ/size);z<=Math.floor(subject.maxZ/size);z++)for(let x=Math.floor(subject.minX/size);x<=Math.floor(subject.maxX/size);x++)for(const candidate of bins.get(x+','+z)??[]) {
      if(candidate!==subject&&(!terrainSubject||candidate.sheltersGround)&&((terrainSubject&&candidate.terrainMask)||candidate.maxY>=subject.minY-1e-5)&&candidate.maxX>subject.minX+EPS&&candidate.minX<subject.maxX-EPS&&candidate.maxZ>subject.minZ+EPS&&candidate.minZ<subject.maxZ-EPS)candidates.add(candidate);
    }
    let pieces:Point[][]=[[subject.a,subject.b,subject.c]];
    // A broad roof should erase covered floor pieces before fine trim can
    // split them into many temporary shards. This order changes no exposed
    // envelope, but bounds work for the loaded booth's dense authored shell.
    const ordered=[...candidates].sort((a,b)=>Math.abs(area(b.a,b.b,b.c))-Math.abs(area(a.a,a.b,a.c))||b.maxY-a.maxY);
    for(const cover of ordered){
      pieces=pieces.flatMap(piece=>subtractAbove(piece,cover,subject,terrainSubject));
      if(pieces.length>SNOW_SURFACE_BUDGET.clippingPieces)throw new Error(`Authored snow occlusion exceeds the fixed clipping budget (${subject.sourceId}: ${pieces.length}; y=${subject.minY.toFixed(3)}..${subject.maxY.toFixed(3)}; cover=${cover.sourceId})`);
      if(!pieces.length)break;
    }
    const output=terrainSubject?terrainFaces:refinedIds.has(subject.sourceId)?detailFaces:faces;
    for(const piece of pieces)for(let i=1;i+1<piece.length;i++)if(Math.abs(area(piece[0],piece[i],piece[i+1]))>1e-7){
      output.push([piece[0],piece[i],piece[i+1]]);
      if(output!==terrainFaces)counts.get(subject.sourceId)!.topTriangles++;
    }
    if(faces.length+detailFaces.length>SNOW_SURFACE_BUDGET.surfaceTriangles)throw new Error('Authored snow surface exceeds the fixed output budget');
    if(terrainFaces.length>SNOW_SURFACE_BUDGET.terrainTriangles)throw new Error('Clipped snow terrain exceeds the fixed output budget');
  }
  const geometry=geometryFromFaces(faces,true);
  const detailGeometry=detailFaces.length?geometryFromFaces(detailFaces,true):undefined;
  return {geometry,...(detailGeometry?{detailGeometry}:{}),...(terrainTriangles.length?{terrainGeometry:geometryFromFaces(terrainFaces,false)}:{}),shelteredAt:shelterQuery(bins,size),sourceTriangles:triangles.length,topTriangles:faces.length+detailFaces.length,triangles:((geometry.index?.count??0)+(detailGeometry?.index?.count??0))/3,sources:[...counts.values()]};
}
