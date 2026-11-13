import * as THREE from 'three';
import { weatherAt, seatSnowCoverageFromSample, type SharedWeather, type WeatherSample, type ClearedSnowSeat } from '../weather/WeatherModel.mjs';
import { buildSnowTerrain, buildSnowSurfaceMeshes, SNOW_SURFACE_BUDGET, type SnowSurfaceSource, type SnowSurfaceReport } from './SnowSurfaceCoverage';

export const WEATHER_BUDGET = Object.freeze({ rain: 640, snow: 960, phoneRain: 220, phoneSnow: 420, snowBands: 3,
  snowNearRadius: 10, snowMidRadius: 18, snowFarRadius: 29, snowPointSize: .18,
  grid: 2, thickness: .12, groundMasks: 10, capGrid: .35, capSegments: 24,
  // The isometric view sees the whole window at once, so precipitation is
  // spread over it rather than round the attendee, and grows with the view
  // when zoomed out (the owner, 2026-11-13: same density on screen), capped.
  isoSnow: 1900, isoPhoneSnow: 800, isoRain: 1280, isoPhoneRain: 440,
  /** The window's area, in world units, that the plain counts are made for: zoom 1 on a 16:10 desktop. */
  isoReferenceArea: 11 * 11 * 1.6, isoMargin: .08, isoLowest: .2, isoHighest: 9 });
const EMPTY: SharedWeather = { version: 1, updatedAt: 0, schedule: [], clearedSeats: [] };
const CLEAR:WeatherSample=Object.freeze({type:'clear',occurrenceId:null,snowCoverage:0});
const wrapParticle=(value:number,span:number)=>((value%span)+span)%span;
export interface SnowSupport {
  id: string; x: number; z: number; y: number; width: number; depth: number; facing?: number;
  /** Keep the ground blanket out from under a low cloth surface. */
  groundMask?: boolean;
  /** Finished world-space surface, including a mat's slope and pillow. */
  heightAt?: (x: number, z: number) => number;
  /** Exact authored cushion/proxy; replaces a guessed rectangular plane. */
  object?: THREE.Object3D;
}
export interface WeatherGround { heightAt(x: number, z: number): number; shelteredAt(x: number, z: number, y: number): boolean; dryAt(x: number, z: number): boolean }

/** Bounded, preallocated scenery. Snow never alters collision or covers the sea. */
export class FestivalWeather {
  readonly root = new THREE.Group();
  private shared = EMPTY;
  private sharedStamp=EMPTY.updatedAt;
  private scheduleRef=EMPTY.schedule;
  private clearRef=EMPTY.clearedSeats;
  private readonly clearedBySeat=new Map<string,ClearedSnowSeat>();
  private offset = 0;
  private sample: WeatherSample = weatherAt([], 0);
  private readonly rain: THREE.LineSegments;
  private readonly snow: THREE.Points;
  private readonly ground: THREE.Mesh;
  private fixedSurfaces?:THREE.Mesh;
  private fixedDetail?:THREE.Mesh;
  /** Snow of its own, carried as its object's child: on something that moves
   * (the ferry), or that steps aside (a cabinet while its game is played). */
  private readonly moving:Array<{id:string;meshes:THREE.Mesh[];hidden:boolean}>=[];
  private authoredShelter?: (x:number,z:number,y:number)=>boolean;
  private surfaceReport:SnowSurfaceReport={sourceTriangles:0,topTriangles:0,triangles:0,sources:[]};
  private readonly terrainReport:{samples:number;cells:number};
  private readonly coverage = { value: 0 };
  private readonly masks = { value: Array.from({length:WEATHER_BUDGET.groundMasks},()=>new THREE.Vector4()) };
  private readonly maskRotations = { value: Array.from({length:WEATHER_BUDGET.groundMasks},()=>new THREE.Vector2(1,0)) };
  private readonly maskCount = { value: 0 };
  private readonly caps: Array<{ id: string; mesh: THREE.Mesh; uniform: { value: number } }> = [];
  private readonly coverMaterial: THREE.MeshStandardMaterial;
  private readonly groundQuery: WeatherGround;
  private lastSurface = -Infinity;
  private cloud = 0;
  private rainMix = 0;
  private snowMix = 0;
  private readonly snowTime = { value: 0 };
  private readonly snowObserver = { value: new THREE.Vector3() };
  private phone: boolean;
  private warming = false;
  private disposed = false;

  constructor(scene: THREE.Scene, ground: WeatherGround, phone = false) {
    this.groundQuery = ground; this.phone = phone;
    this.root.name = 'festival-weather'; this.root.userData.dynamic = true;
    this.coverMaterial = this.snowMaterial(this.coverage,true);
    const terrain=buildSnowTerrain(ground),geometry=terrain.geometry;
    this.terrainReport={samples:terrain.samples,cells:terrain.cells};
    this.ground = new THREE.Mesh(geometry,this.coverMaterial);
    this.ground.name='thin-ground-snow'; this.ground.receiveShadow=true;
    this.ground.userData.dynamic=true; this.root.add(this.ground);
    const rainPositions=new Float32Array(Math.max(WEATHER_BUDGET.rain,WEATHER_BUDGET.isoRain)*6);
    const rg=new THREE.BufferGeometry(); rg.setAttribute('position',new THREE.BufferAttribute(rainPositions,3).setUsage(THREE.DynamicDrawUsage));
    this.rain=new THREE.LineSegments(rg,new THREE.LineBasicMaterial({color:0xb3c9d1,transparent:true,opacity:0,depthWrite:false}));
    this.rain.name='ink-rain-streaks'; this.rain.frustumCulled=false; this.rain.userData.dynamic=true;
    const flakeCount=Math.max(WEATHER_BUDGET.snow,WEATHER_BUDGET.isoSnow);
    const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(flakeCount*3),3).setUsage(THREE.DynamicDrawUsage));
    // Static per-flake variation, shared by all later snowfalls. Near/middle/far
    // bands are interleaved so the smaller phone draw retains every depth.
    const flakes=new Float32Array(flakeCount*4);
    for(let i=0;i<flakeCount;i++) {
      const seed=(i*.61803398875)%1,band=i%WEATHER_BUDGET.snowBands;
      flakes.set([.7+seed*.95+(band===0?.45:band===1?.2:.05),seed,(i*.754877666)%1,band===0?.95:band===1?.78:.6],i*4);
    }
    sg.setAttribute('snowFlake',new THREE.BufferAttribute(flakes,4));
    this.snow=new THREE.Points(sg,this.fallingSnowMaterial(phone));
    this.snow.name='paper-snow-flakes'; this.snow.frustumCulled=false; this.snow.userData.dynamic=true;
    this.root.add(this.rain,this.snow); scene.add(this.root);
  }

  /** One texture-free draw, with stepped silhouettes rather than white squares.
   * Built-in Points still owns fog, depth/planet projection and size attenuation.
   * Only uniforms change in play; the admission draw prepares this one variant.
   */
  private fallingSnowMaterial(phone:boolean):THREE.PointsMaterial {
    const material=new THREE.PointsMaterial({color:0xf4f4e8,size:WEATHER_BUDGET.snowPointSize,sizeAttenuation:true,transparent:true,opacity:0,depthWrite:false});
    material.onBeforeCompile=shader=>{
      shader.uniforms.snowDriftTime=this.snowTime;
      shader.uniforms.snowObserver=this.snowObserver;
      shader.uniforms.snowSizeLimit={value:phone?18:24};
      shader.vertexShader=`attribute vec4 snowFlake;
        uniform float snowDriftTime;
        uniform float snowSizeLimit;
        uniform vec3 snowObserver;
        varying vec4 vSnowShape;
        varying float vSnowDepthFade;\n`+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <logdepthbuf_vertex>',`
        // The world's isometric camera still needs world-sized flakes; the
        // built-in points shader attenuates only its perspective counterpart.
        if(!isPerspectiveMatrix(projectionMatrix))gl_PointSize*=scale*projectionMatrix[1][1];
        gl_PointSize=min(gl_PointSize*snowFlake.x,snowSizeLimit);
        // A point has one rotation/brightness for all its fragments. Do this
        // work once per vertex, rather than once per covered screen pixel.
        float turn=snowFlake.y*6.2831853+snowDriftTime*(.28+fract(snowFlake.y*7.13)*.65);
        vSnowShape=vec4(cos(turn),sin(turn),snowFlake.z,snowFlake.w*(.88+.12*sin(snowDriftTime*.75+snowFlake.y*6.2831853)));
        // Fade instead of filling the lens with a huge passing white square.
        float bandRadius=snowFlake.w>.85?${WEATHER_BUDGET.snowNearRadius.toFixed(1)}:snowFlake.w>.69?${WEATHER_BUDGET.snowMidRadius.toFixed(1)}:${WEATHER_BUDGET.snowFarRadius.toFixed(1)};
        vec2 fromObserver=abs(position.xz-snowObserver.xz);
        // Isometric flakes fill the window and wrap off-screen: no band edge.
        float bandFade=isPerspectiveMatrix(projectionMatrix)?1.0-smoothstep(bandRadius*.8,bandRadius,max(fromObserver.x,fromObserver.y)):1.0;
        float lensFade=isPerspectiveMatrix(projectionMatrix)?smoothstep(1.5,4.0,-mvPosition.z)*(1.0-smoothstep(38.0,65.0,-mvPosition.z)):1.0;
        vSnowDepthFade=lensFade*bandFade;
        #include <logdepthbuf_vertex>`);
      shader.fragmentShader=`varying vec4 vSnowShape;
        varying float vSnowDepthFade;\n`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_particle_fragment>',`#include <map_particle_fragment>
        vec2 p=mat2(vSnowShape.x,-vSnowShape.y,vSnowShape.y,vSnowShape.x)*(gl_PointCoord-.5);
        // Ten small steps give the flakes the world's cut-paper/pixel edge.
        p=floor(p*10.0+.5)/10.0;
        vec2 q=abs(p);
        float arms=max(step(q.x,.14),step(q.y,.14));
        float core=step(max(q.x,q.y),.27);
        if(max(arms,core)*step(q.x+q.y,.54)<.5)discard;
        float facet=.8+.2*step(p.x+p.y,.1);
        vec3 iceTint=mix(vec3(.76,.85,.94),vec3(1.0,.98,.91),vSnowShape.z);
        diffuseColor.rgb*=iceTint*facet;
        diffuseColor.a*=vSnowShape.w*vSnowDepthFade;`);
    };
    material.customProgramCacheKey=()=> 'festival-layered-falling-snow-v3-isometric-window';
    return material;
  }

  private snowMaterial(coverage: { value: number },ground=false): THREE.MeshStandardMaterial {
    const material=new THREE.MeshStandardMaterial({color:0xe8e9df,roughness:1,vertexColors:true,flatShading:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    material.userData.preserveAuthoredSurface=true;
    material.onBeforeCompile=shader=>{
      shader.uniforms.snowCoverage=coverage;
      shader.uniforms.snowGroundMask={value:ground?1:0};
      shader.uniforms.snowMasks=this.masks;
      shader.uniforms.snowMaskRotations=this.maskRotations;
      shader.uniforms.snowMaskCount=this.maskCount;
      shader.vertexShader='uniform float snowCoverage; attribute float snowLift; varying vec3 snowPosition;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsnowPosition=position; transformed.y += snowCoverage * '+WEATHER_BUDGET.thickness+' * snowLift;');
      shader.fragmentShader=`uniform float snowCoverage;
        uniform float snowGroundMask;
        uniform vec4 snowMasks[${WEATHER_BUDGET.groundMasks}];
        uniform vec2 snowMaskRotations[${WEATHER_BUDGET.groundMasks}];
        uniform int snowMaskCount;
        varying vec3 snowPosition;\n`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
        // A low mat can be brushed clean independently of the terrain. Keep
        // this cutout even when the separate surface cap has zero coverage.
        // The fixed uniform layout is shared by caps; only ground enables it.
        if(snowGroundMask > .5) {
          for(int i=0;i<${WEATHER_BUDGET.groundMasks};i++) {
            if(i>=snowMaskCount)break;
            vec2 d=snowPosition.xz-snowMasks[i].xy;
            vec2 r=snowMaskRotations[i];
            vec2 local=vec2(d.x*r.x-d.y*r.y,d.x*r.y+d.y*r.x);
            if(all(lessThanEqual(abs(local),snowMasks[i].zw)))discard;
          }
        }
        vec2 snowCell=floor(snowPosition.xz*5.0); float snowPatch=fract(sin(dot(snowCell,vec2(12.9898,78.233)))*43758.5453); if(snowCoverage <= snowPatch) discard;`);
    };
    material.customProgramCacheKey=()=> 'festival-settled-snow-v4-authored-contact-surfaces'; return material;
  }

  /** Once, after fixed architecture is finished and before admission warmup.
   * One exact, exposed, world-space mesh is shared by roofs/dock/steps. */
  addSurfaceMeshes(sources:readonly SnowSurfaceSource[]):void {
    if(this.disposed||this.fixedSurfaces)return;
    // Constructor shelter boxes are a safe provisional fallback. Once real
    // roofs exist they must not leave permanent holes outside their eaves.
    const terrain=buildSnowTerrain({heightAt:(x,z)=>this.groundQuery.heightAt(x,z),dryAt:(x,z)=>this.groundQuery.dryAt(x,z),shelteredAt:()=>false});
    let built:ReturnType<typeof buildSnowSurfaceMeshes>;
    try{built=buildSnowSurfaceMeshes(sources,terrain.geometry,true);}
    catch(error){terrain.geometry.dispose();throw error;}
    const previous=this.ground.geometry;
    this.ground.geometry=built.terrainGeometry??terrain.geometry;
    if(built.terrainGeometry)terrain.geometry.dispose();
    previous.dispose();Object.assign(this.terrainReport,{samples:terrain.samples,cells:terrain.cells});
    this.authoredShelter=built.shelteredAt;
    this.surfaceReport={sourceTriangles:built.sourceTriangles,topTriangles:built.topTriangles,triangles:built.triangles,sources:built.sources};
    const mesh=new THREE.Mesh(built.geometry,this.snowMaterial(this.coverage));
    mesh.name='authored-outdoor-snow';mesh.receiveShadow=true;mesh.userData.dynamic=true;
    this.root.add(mesh);this.fixedSurfaces=mesh;
    if(built.detailGeometry){
      // Keep dense prop vertices indexed. Mixing them with large roofs would
      // expand every prop triangle during the roofs' planet subdivision.
      const detail=new THREE.Mesh(built.detailGeometry,mesh.material);
      detail.name='authored-detail-snow';detail.receiveShadow=true;detail.userData.dynamic=true;
      this.root.add(detail);this.fixedDetail=detail;
    }
    this.applyVisibility();
  }

  /**
   * Snow on something that moves (the owner, 2026-11-13: the ferry, bobbing).
   * Built once from the object's sky-facing faces as it stands now, then
   * carried in its own frame as its child, so it bobs and tilts with it. It
   * shares the settled snow's material, so it builds up, melts and shows in
   * step with every other surface. After `addSurfaceMeshes`.
   * The arcade cabinets have theirs this way too, so it can be put aside while
   * their games are played (see `setSurfaceHidden`).
   */
  addMovingSurface(id:string,object:THREE.Object3D,options:Omit<SnowSurfaceSource,'id'|'object'|'sheltersGround'>={}):void {
    if(this.disposed||this.moving.some(entry=>entry.id===id))return;
    object.updateWorldMatrix(true,true);
    const built=buildSnowSurfaceMeshes([{...options,id,object,sheltersGround:false}]);
    const toLocal=object.matrixWorld.clone().invert();
    const material=(this.fixedSurfaces?.material as THREE.Material|undefined)??this.snowMaterial(this.coverage);
    const meshes:THREE.Mesh[]=[];
    for(const geometry of [built.geometry,built.detailGeometry]){
      if(!geometry)continue;
      if(!(geometry.index?.count??geometry.attributes.position?.count)){geometry.dispose();continue;}
      geometry.applyMatrix4(toLocal);
      const mesh=new THREE.Mesh(geometry,material);
      mesh.name=`moving-snow-${id}`;mesh.receiveShadow=true;mesh.userData.dynamic=true;
      object.add(mesh);meshes.push(mesh);
    }
    this.moving.push({id,meshes,hidden:false});
    this.applyVisibility();
  }

  /**
   * Put one object's own snow aside, or back (the owner, 2026-11-13). An
   * arcade game is a web page laid over the 3D view, so snow on the control
   * deck in front of the screen would be cut through by the picture; that
   * cabinet's snow is hidden while its game is open, like its joystick.
   */
  setSurfaceHidden(id:string,hidden:boolean):void {
    const entry=this.moving.find(item=>item.id===id);
    if(this.disposed||!entry||entry.hidden===hidden)return;
    entry.hidden=hidden;
    this.applyVisibility();
  }

  /** Undefined until the fixed architecture registry is prepared under gate. */
  shelteredAt(x:number,z:number,y:number):boolean|undefined {
    return this.authoredShelter?.(x,z,y);
  }

  addSupports(supports: SnowSupport[]): void {
    if(this.disposed)return;
    for(const s of supports) {
      if(this.caps.some(cap=>cap.id===s.id))continue;
      const facing=s.facing??0,cos=Math.cos(facing),sin=Math.sin(facing);
      if(s.groundMask) {
        if(this.maskCount.value>=WEATHER_BUDGET.groundMasks)throw new Error('Snow ground-mask budget exceeded');
        const index=this.maskCount.value++;
        this.masks.value[index].set(s.x,s.z,s.width/2,s.depth/2);
        this.maskRotations.value[index].set(cos,sin);
      }
      const uniform={value:0},mat=this.snowMaterial(uniform);
      // Colour attribute keeps ground/caps on a single stable shader variant.
      const segments=(size:number)=>s.heightAt?Math.min(WEATHER_BUDGET.capSegments,Math.max(1,Math.ceil(size/WEATHER_BUDGET.capGrid))):1;
      let g:THREE.BufferGeometry;
      if(s.object)g=buildSnowSurfaceMeshes([{id:s.id,object:s.object}]).geometry;
      else {g=new THREE.PlaneGeometry(s.width,s.depth,segments(s.width),segments(s.depth));g.rotateX(-Math.PI/2);}
      if(s.heightAt&&!s.object) {
        const positions=g.attributes.position;
        for(let i=0;i<positions.count;i++) {
          const x=positions.getX(i),z=positions.getZ(i);
          const height=s.heightAt(s.x+x*cos+z*sin,s.z-x*sin+z*cos);
          positions.setY(i,Number.isFinite(height)?height-s.y:0);
        }
        positions.needsUpdate=true;g.computeVertexNormals();
      }
      if(!s.object){
        g.deleteAttribute('uv');
        g.setAttribute('color',new THREE.Float32BufferAttribute(Array(g.attributes.position.count*3).fill(1),3));
        g.setAttribute('snowLift',new THREE.Float32BufferAttribute(Array(g.attributes.position.count).fill(1),1));
      }
      const mesh=new THREE.Mesh(g,mat);
      if(!s.object){mesh.position.set(s.x,s.y+.025,s.z);mesh.rotation.y=facing;}
      mesh.name='seat-snow-'+s.id;mesh.receiveShadow=true;mesh.userData.dynamic=true;
      this.root.add(mesh);this.caps.push({id:s.id,mesh,uniform});
    }
    this.lastSurface=-Infinity;
  }

  setShared(weather: SharedWeather | undefined, serverTime?: number): void {
    if(this.disposed)return;
    const next=weather??EMPTY;
    // Movement SSE patches reuse weather. Keep their clock updates without
    // rebuilding brush lookup or defeating the quarter-second surface cadence.
    if(next.updatedAt!==this.sharedStamp||next.schedule!==this.scheduleRef||next.clearedSeats!==this.clearRef){
      this.sharedStamp=next.updatedAt;this.scheduleRef=next.schedule;this.clearRef=next.clearedSeats;
      this.clearedBySeat.clear();
      for(const record of next.clearedSeats)this.clearedBySeat.set(record.seatId,record);
      this.lastSurface=-Infinity;
    }
    this.shared=next;
    if(Number.isFinite(serverTime))this.offset=serverTime!-Date.now();
  }
  now(): number { return Date.now()+this.offset; }
  seatCoverage(id: string): number {
    const now=this.now(),sample=this.shared.schedule.length?weatherAt(this.shared.schedule,now):CLEAR;
    return seatSnowCoverageFromSample(sample,this.shared.schedule,this.clearedBySeat.get(id),now);
  }
  current(): WeatherSample { return this.sample; }
  cloudiness(): number { return this.cloud; }
  /** Audio owns its short gain glide. Feeding the four-second visual ease
   * through that glide too would leave ordinary ambience under snow for tens
   * of seconds; settled melt must not keep the winter sound playing either. */
  audioMix(): { rain:number; snow:number; snowFootsteps:boolean } { return {rain:this.sample.type==='rain'?1:0,snow:this.sample.type==='snow'?1:0,snowFootsteps:this.sample.snowCoverage>.12}; }
  /** Wrap the existing compile/draw warmup. Coverage stays an ordinary
   * uniform: clear-day startup must still prepare every later weather kind. */
  setWarmup(enabled: boolean): void {
    if(this.disposed)return;
    this.warming=enabled;
    this.applyVisibility();
  }
  private applyVisibility(surfaces=true): void {
    if(surfaces){
      this.ground.visible=this.warming||this.coverage.value>.001;
      if(this.fixedSurfaces)this.fixedSurfaces.visible=this.warming||this.coverage.value>.001;
      if(this.fixedDetail)this.fixedDetail.visible=this.warming||this.coverage.value>.001;
      for(const entry of this.moving)for(const mesh of entry.meshes)mesh.visible=!entry.hidden&&(this.warming||this.coverage.value>.001);
      for(const cap of this.caps)cap.mesh.visible=this.warming||cap.uniform.value>.001;
    }
    this.rain.visible=this.warming||this.rainMix>.005;
    this.snow.visible=this.warming||this.snowMix>.005;
  }
  /**
   * The isometric camera's window, as world-space axes and half extents, or
   * nothing for a perspective view. Precipitation is laid across it.
   */
  private isometricWindow(view?:THREE.Camera):{origin:THREE.Vector3;right:THREE.Vector3;up:THREE.Vector3;forward:THREE.Vector3;halfWidth:number;halfHeight:number}|undefined {
    const camera=view as (THREE.Camera&{isOrthographicCamera?:boolean;left:number;right:number;top:number;bottom:number;zoom:number})|undefined;
    if(!camera?.isOrthographicCamera)return undefined;
    camera.updateMatrixWorld();
    const e=camera.matrixWorld.elements,zoom=camera.zoom||1;
    const forward=this.isoForward.set(-e[8],-e[9],-e[10]).normalize();
    if(forward.y>-.05)return undefined;
    return {origin:this.isoOrigin.set(e[12],e[13],e[14]),right:this.isoRight.set(e[0],e[1],e[2]).normalize(),up:this.isoUp.set(e[4],e[5],e[6]).normalize(),forward,
      halfWidth:Math.abs(camera.right-camera.left)/(2*zoom),halfHeight:Math.abs(camera.top-camera.bottom)/(2*zoom)};
  }
  private readonly isoOrigin=new THREE.Vector3();
  private readonly isoRight=new THREE.Vector3();
  private readonly isoUp=new THREE.Vector3();
  private readonly isoForward=new THREE.Vector3();
  private readonly isoPoint=new THREE.Vector3();
  private lastIsometric={snow:0,rain:0};

  /**
   * A point on the isometric frame at height `height` above `base`. `u` and
   * `v` run -1..1 across the frame; the depth along the view is whatever puts
   * the point at that height, so it sits in the world among the buildings
   * (and behind them where it should) wherever it is on screen.
   */
  private onWindow(frame:NonNullable<ReturnType<FestivalWeather['isometricWindow']>>,u:number,v:number,base:number,height:number):THREE.Vector3 {
    const {origin,right,up,forward,halfWidth,halfHeight}=frame;
    const across=u*halfWidth,rise=v*halfHeight;
    const depth=(base+height-origin.y-right.y*across-up.y*rise)/forward.y;
    return this.isoPoint.copy(origin).addScaledVector(right,across).addScaledVector(up,rise).addScaledVector(forward,depth);
  }

  /** Kept visible through the existing sign-in shader warmup, then hidden when clear. */
  update(delta:number,observer:THREE.Vector3,now=this.now(),view?:THREE.Camera): void {
    if(this.disposed)return;
    this.sample=this.shared.schedule.length?weatherAt(this.shared.schedule,now):CLEAR;
    const active=this.shared.schedule.find(p=>p.startsAt<=now&&p.endsAt>now);
    // Clouds gather 45 seconds before precipitation; changes glide rather than pop.
    const upcoming=this.shared.schedule.find(p=>p.startsAt>now&&p.startsAt-now<45_000);
    const target=active?1:upcoming?1-(upcoming.startsAt-now)/45_000:0;
    const stepTime=Number.isFinite(delta)?Math.max(0,Math.min(delta,.1)):0;
    const glide=1-Math.exp(-stepTime/4);
    // Local motion does not need epoch-sized GPU floats. Server time above
    // remains authoritative for weather, buildup, brushing and melting.
    this.snowTime.value=(this.snowTime.value+stepTime)%3600;
    this.snowObserver.value.copy(observer);
    this.cloud+=(target-this.cloud)*glide;
    this.rainMix+=((this.sample.type==='rain'?1:0)-this.rainMix)*glide;
    this.snowMix+=((this.sample.type==='snow'?1:0)-this.snowMix)*glide;
    const surfacesDue=now-this.lastSurface>250||now<this.lastSurface;
    if(surfacesDue) {
      this.coverage.value=this.sample.snowCoverage;
      for(const cap of this.caps)cap.uniform.value=seatSnowCoverageFromSample(this.sample,this.shared.schedule,this.clearedBySeat.get(cap.id),now);
      this.lastSurface=now;
    }
    this.applyVisibility(surfacesDue);
    (this.rain.material as THREE.LineBasicMaterial).opacity=this.rainMix*.55;
    (this.snow.material as THREE.PointsMaterial).opacity=this.snowMix*.9;
    const time=this.snowTime.value;
    const frame=this.isometricWindow(view);
    if(frame&&(this.rain.visible||this.snow.visible)) { this.isometricPrecipitation(frame,observer.y,time); return; }
    this.lastIsometric.snow=this.lastIsometric.rain=0;
    if(this.rain.visible) {
      const a=this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const count=this.phone?WEATHER_BUDGET.phoneRain:WEATHER_BUDGET.rain;
      for(let i=0;i<count;i++) {
        const seed=(i*.61803398875)%1;
        const x=observer.x-24+((i*13.713+time*1.8)%48);
        const z=observer.z-24+((i*21.371+Math.sin(time*.22+i)*1.2)%48+48)%48;
        const floor=this.groundQuery.heightAt(x,z);
        const y=floor+((seed*22-time*14)%22+22)%22;
        const sheltered=!Number.isFinite(y)||(this.authoredShelter?.(x,z,y)??this.groundQuery.shelteredAt(x,z,y));
        const py=sheltered?-100:y;
        a.setXYZ(i*2,x,py,z);a.setXYZ(i*2+1,x-.09,py+.65,z+.02);
      }
      a.needsUpdate=true;this.rain.geometry.setDrawRange(0,count*2);
    }
    if(this.snow.visible) {
      const a=this.snow.geometry.attributes.position as THREE.BufferAttribute;
      const count=this.phone?WEATHER_BUDGET.phoneSnow:WEATHER_BUDGET.snow;
      for(let i=0;i<count;i++) {
        const seed=(i*.61803398875)%1,band=i%WEATHER_BUDGET.snowBands;
        const radius=band===0?WEATHER_BUDGET.snowNearRadius:band===1?WEATHER_BUDGET.snowMidRadius:WEATHER_BUDGET.snowFarRadius;
        const height=band===0?14:band===1?20:26;
        const gust=Math.sin(time*.19)*1.5+Math.sin(time*.43+seed*6.28)*.45;
        const x=observer.x-radius+wrapParticle(i*13.713+time*(.75+band*.12)+gust,radius*2);
        const z=observer.z-radius+wrapParticle(i*21.371+time*.28+Math.sin(time*.7+i)*.65,radius*2);
        const floor=this.groundQuery.heightAt(x,z);
        // Larger/heavier clusters fall faster. Small sideways oscillations
        // keep the volume alive without a uniform screen-space noise sheet.
        const y=floor+wrapParticle(seed*height-time*(1.55+seed*1.9+band*.2),height);
        const sheltered=!Number.isFinite(y)||(this.authoredShelter?.(x,z,y)??this.groundQuery.shelteredAt(x,z,y));
        a.setXYZ(i,x,sheltered?-100:y,z);
      }
      a.needsUpdate=true;this.snow.geometry.setDrawRange(0,count);
    }
  }
  /**
   * Isometric snow and rain, laid across the whole frame (the owner,
   * 2026-11-13: in the isometric view they stopped short of the edges). Each
   * flake keeps a place across the frame and a height above the attendee's
   * ground; it moves down the screen at its falling speed and wraps round
   * just outside the frame, so none appears or vanishes in view. More of
   * them as the frame grows, up to the isometric caps.
   */
  private isometricPrecipitation(frame:NonNullable<ReturnType<FestivalWeather['isometricWindow']>>,base:number,time:number):void {
    const margin=WEATHER_BUDGET.isoMargin,span=2+2*margin;
    const scale=Math.max(1,(frame.halfWidth*frame.halfHeight)/WEATHER_BUDGET.isoReferenceArea);
    const lift=Math.max(.2,frame.up.y);
    const shelter=(p:THREE.Vector3)=>this.authoredShelter?.(p.x,p.z,p.y)??this.groundQuery.shelteredAt(p.x,p.z,p.y);
    if(this.rain.visible) {
      const a=this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const count=Math.min(this.phone?WEATHER_BUDGET.isoPhoneRain:WEATHER_BUDGET.isoRain,Math.round((this.phone?WEATHER_BUDGET.phoneRain:WEATHER_BUDGET.rain)*scale));
      for(let i=0;i<count;i++) {
        const seed=(i*.61803398875)%1,depth=(i*.754877666)%1;
        const u=-1-margin+wrapParticle(i*.137+time*1.8/frame.halfWidth,span);
        const v=-1-margin+wrapParticle(seed*span-time*14*lift/frame.halfHeight,span);
        const p=this.onWindow(frame,u,v,base,WEATHER_BUDGET.isoLowest+depth*(WEATHER_BUDGET.isoHighest-WEATHER_BUDGET.isoLowest));
        const hidden=shelter(p);
        const y=hidden?-100:p.y;
        a.setXYZ(i*2,p.x,y,p.z);a.setXYZ(i*2+1,p.x-.09,y+.65,p.z+.02);
      }
      a.needsUpdate=true;this.rain.geometry.setDrawRange(0,count*2);this.lastIsometric.rain=count;
    } else this.lastIsometric.rain=0;
    if(this.snow.visible) {
      const a=this.snow.geometry.attributes.position as THREE.BufferAttribute;
      const count=Math.min(this.phone?WEATHER_BUDGET.isoPhoneSnow:WEATHER_BUDGET.isoSnow,Math.round((this.phone?WEATHER_BUDGET.phoneSnow:WEATHER_BUDGET.snow)*scale));
      const gust=Math.sin(time*.19)*1.5;
      for(let i=0;i<count;i++) {
        const seed=(i*.61803398875)%1,depth=(i*.754877666)%1,band=i%WEATHER_BUDGET.snowBands;
        // The same falling speeds and sideways drift as round the attendee.
        const fall=1.55+seed*1.9+band*.2;
        const drift=time*(.75+band*.12)+gust+Math.sin(time*.43+seed*6.28)*.45+Math.sin(time*.7+i)*.65;
        const u=-1-margin+wrapParticle(i*.0917+drift/frame.halfWidth,span);
        const v=-1-margin+wrapParticle(seed*span*7.31-time*fall*lift/frame.halfHeight,span);
        const p=this.onWindow(frame,u,v,base,WEATHER_BUDGET.isoLowest+depth*(WEATHER_BUDGET.isoHighest-WEATHER_BUDGET.isoLowest));
        a.setXYZ(i,p.x,shelter(p)?-100:p.y,p.z);
      }
      a.needsUpdate=true;this.snow.geometry.setDrawRange(0,count);this.lastIsometric.snow=count;
    } else this.lastIsometric.snow=0;
  }

  snapshot(): unknown { return {...this.sample,isometric:{...this.lastIsometric},cloudiness:this.cloud,rain:this.rainMix,snow:this.snowMix,settledDepth:this.coverage.value*WEATHER_BUDGET.thickness,maximumSettledDepth:WEATHER_BUDGET.thickness,groundTriangles:(this.ground.geometry.index?.count??this.ground.geometry.attributes.position?.count??0)/3,terrain:this.terrainReport,authoredSurfaces:this.surfaceReport,contactLift:SNOW_SURFACE_BUDGET.contactLift,seatCaps:this.caps.length,groundMasks:this.maskCount.value,
    snowfall:{depthBands:WEATHER_BUDGET.snowBands,flakes:this.phone?WEATHER_BUDGET.phoneSnow:WEATHER_BUDGET.snow,pointSize:WEATHER_BUDGET.snowPointSize},extraLights:0}; }
  dispose(): void {
    if(this.disposed)return;
    this.disposed=true;this.root.removeFromParent();
    for(const entry of this.moving)for(const mesh of entry.meshes){mesh.removeFromParent();mesh.geometry.dispose();}
    this.moving.length=0;
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    this.root.traverse(object=>{
      const drawable=object as THREE.Mesh;
      if(drawable.geometry)geometries.add(drawable.geometry);
      for(const material of Array.isArray(drawable.material)?drawable.material:drawable.material?[drawable.material]:[])materials.add(material);
    });
    for(const geometry of geometries){geometry.dispose();for(const key of Object.keys(geometry.attributes))geometry.deleteAttribute(key);geometry.setIndex(null);}
    for(const material of materials)material.dispose();
    this.root.clear();this.caps.length=0;this.maskCount.value=0;this.clearedBySeat.clear();this.fixedSurfaces=undefined;this.fixedDetail=undefined;this.authoredShelter=undefined;
  }
}
