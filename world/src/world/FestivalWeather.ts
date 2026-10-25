import * as THREE from 'three';
import { weatherAt, type SharedWeather, type WeatherSample } from '../weather/WeatherModel.mjs';

export const WEATHER_BUDGET = Object.freeze({ rain: 640, snow: 960, phoneRain: 220, phoneSnow: 420, snowBands: 3,
  snowNearRadius: 10, snowMidRadius: 18, snowFarRadius: 29, snowPointSize: .18,
  grid: 2, thickness: .12, groundMasks: 10, capGrid: .35, capSegments: 24 });
const EMPTY: SharedWeather = { version: 1, updatedAt: 0, schedule: [], clearedSeats: [] };
const CLEAR:WeatherSample=Object.freeze({type:'clear',occurrenceId:null,snowCoverage:0});
const wrapParticle=(value:number,span:number)=>((value%span)+span)%span;
const SNOW_TRIANGLE=[0,1,2,2,1,3] as const;
export interface SnowSupport {
  id: string; x: number; z: number; y: number; width: number; depth: number; facing?: number;
  /** Keep the ground blanket out from under a low cloth surface. */
  groundMask?: boolean;
  /** Finished world-space surface, including a mat's slope and pillow. */
  heightAt?: (x: number, z: number) => number;
}
export interface WeatherGround { heightAt(x: number, z: number): number; shelteredAt(x: number, z: number, y: number): boolean; dryAt(x: number, z: number): boolean }

/** Bounded, preallocated scenery. Snow never alters collision or covers the sea. */
export class FestivalWeather {
  readonly root = new THREE.Group();
  private shared = EMPTY;
  private sharedStamp=EMPTY.updatedAt;
  private scheduleRef=EMPTY.schedule;
  private clearRef=EMPTY.clearedSeats;
  private readonly clearedBySeat=new Map<string,string>();
  private offset = 0;
  private sample: WeatherSample = weatherAt([], 0);
  private readonly rain: THREE.LineSegments;
  private readonly snow: THREE.Points;
  private readonly ground: THREE.Mesh;
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
    const points: number[] = [], colors: number[] = [];
    const step = WEATHER_BUDGET.grid;
    const west=-126,east=128,north=-74,south=100,columns=Math.ceil((east-west)/step)+1;
    let upper=new Float64Array(columns),lower=new Float64Array(columns);
    let upperAllowed=new Uint8Array(columns),lowerAllowed=new Uint8Array(columns);
    const sampleRow=(heights:Float64Array,allowed:Uint8Array,z:number)=>{
      for(let column=0;column<columns;column++){
        const x=west+column*step,y=ground.heightAt(x,z);heights[column]=y;
        allowed[column]=Number.isFinite(y)&&ground.dryAt(x,z)&&!ground.shelteredAt(x,z,y+.1)?1:0;
      }
    };
    sampleRow(upper,upperAllowed,north);
    // Sample the same finished ground the attendee stands on. Reject entire
    // cells at roof/water boundaries instead of bridging a snowy triangle indoors.
    // Adjacent cells share corners. Two short rows retain exact samples without
    // four terrain queries per cell or a temporary array/object for each one.
    for (let z=north;z<south;z+=step) {
      sampleRow(lower,lowerAllowed,z+step);
      for(let column=0;column<columns-1;column++){
        if(!upperAllowed[column]||!upperAllowed[column+1]||!lowerAllowed[column]||!lowerAllowed[column+1])continue;
        const a=upper[column],b=lower[column],c=upper[column+1],d=lower[column+1];
        if(Math.max(a,b,c,d)-Math.min(a,b,c,d)>1.2)continue;
        const x=west+column*step;
        const v = .91 + .08 * ((Math.sin(x*3.1+z*2.4)*437.2)%1+1)/2;
        for(const corner of SNOW_TRIANGLE){
          const right=corner>=2,next=corner%2===1;
          const y=right?(next?d:c):(next?b:a);
          points.push(x+(right?step:0),y+.03,z+(next?step:0));colors.push(v,v,v);
        }
      }
      const oldHeights=upper;upper=lower;lower=oldHeights;
      const oldAllowed=upperAllowed;upperAllowed=lowerAllowed;lowerAllowed=oldAllowed;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3)); geometry.computeVertexNormals();
    this.ground = new THREE.Mesh(geometry,this.coverMaterial);
    this.ground.name='thin-ground-snow'; this.ground.receiveShadow=true;
    this.ground.userData.dynamic=true; this.root.add(this.ground);
    const rainPositions=new Float32Array(WEATHER_BUDGET.rain*6);
    const rg=new THREE.BufferGeometry(); rg.setAttribute('position',new THREE.BufferAttribute(rainPositions,3).setUsage(THREE.DynamicDrawUsage));
    this.rain=new THREE.LineSegments(rg,new THREE.LineBasicMaterial({color:0xb3c9d1,transparent:true,opacity:0,depthWrite:false}));
    this.rain.name='ink-rain-streaks'; this.rain.frustumCulled=false; this.rain.userData.dynamic=true;
    const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(WEATHER_BUDGET.snow*3),3).setUsage(THREE.DynamicDrawUsage));
    // Static per-flake variation, shared by all later snowfalls. Near/middle/far
    // bands are interleaved so the smaller phone draw retains every depth.
    const flakes=new Float32Array(WEATHER_BUDGET.snow*4);
    for(let i=0;i<WEATHER_BUDGET.snow;i++) {
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
        float bandFade=1.0-smoothstep(bandRadius*.8,bandRadius,max(fromObserver.x,fromObserver.y));
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
    material.customProgramCacheKey=()=> 'festival-layered-falling-snow-v2-vertex-motion';
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
      shader.vertexShader='uniform float snowCoverage; varying vec3 snowPosition;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsnowPosition=position; transformed.y += snowCoverage * '+WEATHER_BUDGET.thickness+';');
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
    material.customProgramCacheKey=()=> 'festival-settled-snow-v3-depth12-masked-surfaces'; return material;
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
      const g=new THREE.PlaneGeometry(s.width,s.depth,segments(s.width),segments(s.depth));g.rotateX(-Math.PI/2);
      if(s.heightAt) {
        const positions=g.attributes.position;
        for(let i=0;i<positions.count;i++) {
          const x=positions.getX(i),z=positions.getZ(i);
          const height=s.heightAt(s.x+x*cos+z*sin,s.z-x*sin+z*cos);
          positions.setY(i,Number.isFinite(height)?height-s.y:0);
        }
        positions.needsUpdate=true;g.computeVertexNormals();
      }
      g.setAttribute('color',new THREE.Float32BufferAttribute(Array(g.attributes.position.count*3).fill(1),3));
      const mesh=new THREE.Mesh(g,mat);mesh.position.set(s.x,s.y+.025,s.z);mesh.rotation.y=facing;
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
      for(const record of next.clearedSeats)this.clearedBySeat.set(record.seatId,record.occurrenceId);
      this.lastSurface=-Infinity;
    }
    this.shared=next;
    if(Number.isFinite(serverTime))this.offset=serverTime!-Date.now();
  }
  now(): number { return Date.now()+this.offset; }
  seatCoverage(id: string): number {
    const sample=this.shared.schedule.length?weatherAt(this.shared.schedule,this.now()):CLEAR;
    return this.clearedBySeat.get(id)===sample.occurrenceId?0:sample.snowCoverage;
  }
  current(): WeatherSample { return this.sample; }
  cloudiness(): number { return this.cloud; }
  audioMix(): { rain:number; snow:number; snowFootsteps:boolean } { return {rain:this.rainMix,snow:this.snowMix,snowFootsteps:this.sample.snowCoverage>.12}; }
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
      for(const cap of this.caps)cap.mesh.visible=this.warming||cap.uniform.value>.001;
    }
    this.rain.visible=this.warming||this.rainMix>.005;
    this.snow.visible=this.warming||this.snowMix>.005;
  }
  /** Kept visible through the existing sign-in shader warmup, then hidden when clear. */
  update(delta:number,observer:THREE.Vector3,now=this.now()): void {
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
      for(const cap of this.caps)cap.uniform.value=this.clearedBySeat.get(cap.id)===this.sample.occurrenceId?0:this.sample.snowCoverage;
      this.lastSurface=now;
    }
    this.applyVisibility(surfacesDue);
    (this.rain.material as THREE.LineBasicMaterial).opacity=this.rainMix*.55;
    (this.snow.material as THREE.PointsMaterial).opacity=this.snowMix*.9;
    const time=this.snowTime.value;
    if(this.rain.visible) {
      const a=this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const count=this.phone?WEATHER_BUDGET.phoneRain:WEATHER_BUDGET.rain;
      for(let i=0;i<count;i++) {
        const seed=(i*.61803398875)%1;
        const x=observer.x-24+((i*13.713+time*1.8)%48);
        const z=observer.z-24+((i*21.371+Math.sin(time*.22+i)*1.2)%48+48)%48;
        const floor=this.groundQuery.heightAt(x,z);
        const y=floor+((seed*22-time*14)%22+22)%22;
        const sheltered=!Number.isFinite(y)||this.groundQuery.shelteredAt(x,z,y);
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
        const sheltered=!Number.isFinite(y)||this.groundQuery.shelteredAt(x,z,y);
        a.setXYZ(i,x,sheltered?-100:y,z);
      }
      a.needsUpdate=true;this.snow.geometry.setDrawRange(0,count);
    }
  }
  snapshot(): unknown { return {...this.sample,cloudiness:this.cloud,rain:this.rainMix,snow:this.snowMix,settledDepth:this.coverage.value*WEATHER_BUDGET.thickness,maximumSettledDepth:WEATHER_BUDGET.thickness,groundTriangles:(this.ground.geometry.attributes.position?.count??0)/3,seatCaps:this.caps.length,groundMasks:this.maskCount.value,
    snowfall:{depthBands:WEATHER_BUDGET.snowBands,flakes:this.phone?WEATHER_BUDGET.phoneSnow:WEATHER_BUDGET.snow,pointSize:WEATHER_BUDGET.snowPointSize},extraLights:0}; }
  dispose(): void {
    if(this.disposed)return;
    this.disposed=true;this.root.removeFromParent();
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    this.root.traverse(object=>{
      const drawable=object as THREE.Mesh;
      if(drawable.geometry)geometries.add(drawable.geometry);
      for(const material of Array.isArray(drawable.material)?drawable.material:drawable.material?[drawable.material]:[])materials.add(material);
    });
    for(const geometry of geometries){geometry.dispose();for(const key of Object.keys(geometry.attributes))geometry.deleteAttribute(key);geometry.setIndex(null);}
    for(const material of materials)material.dispose();
    this.root.clear();this.caps.length=0;this.maskCount.value=0;this.clearedBySeat.clear();
  }
}
