import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Authored pixel silhouettes: sunlit lobes, cool stepped undersides, no frame noise. */
function cloudTexture(variant: number): THREE.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;
  const c=canvas.getContext('2d')!;
  const lobes = [[22,41,20,12],[43,32,24,22],[67,24,23,23],[87,37,25,16],[107,44,16,9]];
  c.fillStyle='#f4f3e7';
  for(const [x,y,rx,ry] of lobes) {
    c.beginPath();c.ellipse(x+(variant-1)*3,y+Math.sin(x+variant)*4,rx,ry,0,0,Math.PI*2);c.fill();
  }
  c.globalCompositeOperation='source-atop';
  c.fillStyle='#a9bacb';c.fillRect(0,46,128,18);
  c.fillStyle='#c8d4dc';
  for(let x=4;x<128;x+=8){const y=38+Math.round(Math.sin(x*.1+variant)*5);c.fillRect(x,y,12,12);}
  c.fillStyle='#e1e6e3';
  for(let x=18;x<105;x+=13){const y=30+Math.round(Math.sin(x*.12+variant)*6);c.fillRect(x,y,9,9);}
  // Quantize alpha at a deliberately coarse texel grid; no feathered billboard halo.
  const pixels=c.getImageData(0,0,128,64);
  for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]>100?255:0;
  c.putImageData(pixels,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;
  return texture;
}

/** Inside the camera's far plane (300) with the player's orbit added, outside the stars (253). */
export const SKY_DOME_RADIUS = 270;
const SKY_VERTEX = `varying vec3 vDirection;
void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// Horizon to middle to zenith by elevation, plus a warm bank towards the sun
// that hugs the horizon: what a flat background colour could never show. At
// and below the horizon it is the fog's colour, so fogged land and sea meet
// the sky without a seam.
const SKY_FRAGMENT = `uniform vec3 fogColour;
uniform vec3 horizon;
uniform vec3 middle;
uniform vec3 zenith;
uniform vec3 glow;
uniform vec3 sunDirection;
uniform float glowStrength;
varying vec3 vDirection;
void main() {
  vec3 d = normalize(vDirection);
  float e = d.y;
  // Wide, overlapping blends (owner, 2026-10-23). The pale horizon used to
  // turn blue within the first eleven degrees, which read as two colours
  // dissolving into each other rather than one sky.
  vec3 colour = mix(mix(horizon, middle, smoothstep(-0.02, 0.5, e)), zenith, smoothstep(0.28, 0.95, e));
  vec2 around = normalize(d.xz + vec2(1e-5));
  vec2 towardSun = normalize(sunDirection.xz + vec2(1e-5));
  float facing = pow(max(dot(around, towardSun), 0.0), 3.0);
  float band = 1.0 - smoothstep(0.0, 0.42, abs(e - 0.03));
  colour = mix(colour, glow, glowStrength * facing * band);
  // The fog's colour at the horizon fades into the sky over about fifteen
  // degrees, not three: a narrow fade read as a second colour laid on top.
  colour = mix(fogColour, colour, smoothstep(-0.01, 0.26, e));
  gl_FragColor = vec4(colour, 1.0);
  #include <colorspace_fragment>
}`;

export function nightSkyAmount(minute: number): number {
  return THREE.MathUtils.smoothstep(minute,31,39)*(1-THREE.MathUtils.smoothstep(minute,54,60));
}

export class CoastalSky {
  readonly root=new THREE.Group();
  private readonly clouds: THREE.MeshBasicMaterial[]=[];
  private readonly stars: THREE.Points;
  private readonly starMaterial: THREE.PointsMaterial;
  private readonly daylight=new THREE.Color(0xffffff);
  private readonly sunset=new THREE.Color(0xefb393);
  private readonly moonlight=new THREE.Color(0x64799f);
  private lastMinute=0;
  private cloudiness=0;
  private readonly weatherClouds: THREE.MeshBasicMaterial[]=[];
  private readonly weatherBanks:THREE.Mesh[]=[];
  /** Drawn first and behind everything; follows the observer, never turns with the stars. */
  readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

  constructor(scene: THREE.Scene) {
    this.root.name='coastal-atmosphere';this.root.userData.projectorBackground=true;
    for(let variant=0;variant<4;variant++) {
      const geometries: THREE.BufferGeometry[]=[];
      for(let i=0;i<5;i++) {
        const index=variant*5+i,angle=index/20*Math.PI*2+.16*Math.sin(index*2.1);
        const distance=211+(index%3)*7,width=48+(index%4)*13,height=width*.5;
        const y=26+(index%5)*10;
        const g=new THREE.PlaneGeometry(width,height);g.rotateY(angle+Math.PI);
        g.translate(Math.sin(angle)*distance,y,Math.cos(angle)*distance);geometries.push(g);
      }
      const mat=new THREE.MeshBasicMaterial({map:cloudTexture(variant),alphaTest:.5,transparent:true,fog:false,depthWrite:true,side:THREE.DoubleSide,toneMapped:false});
      mat.userData.wornNoGrain=true;mat.userData.wornNoMasonry=true;this.clouds.push(mat);
      const mesh=new THREE.Mesh(mergeGeometries(geometries)!,mat);mesh.name='cumulus-bank-'+variant;mesh.renderOrder=-2;
      this.root.add(mesh);geometries.forEach(g=>g.dispose());
      // Reuse the four tiny authored pixel maps, with a denser upper layer.
      // The geometry and shader exist at sign-in even on a clear day.
      const overcast=mat.clone();overcast.map=mat.map;overcast.opacity=0;overcast.alphaTest=.01;overcast.depthWrite=false;
      this.weatherClouds.push(overcast);
      const bank=new THREE.Mesh(mesh.geometry.clone(),overcast);bank.rotation.y=.37;
      bank.scale.set(1.03,.8,1.03);bank.position.y=30;bank.renderOrder=-2;
      bank.name='overcast-bank-'+variant;this.weatherBanks.push(bank);this.root.add(bank);
    }
    const positions:number[]=[],colours:number[]=[];
    // Stable quasi-uniform sky points; keep the horizon clear of stars below land/sea.
    for(let i=0;i<260;i++) {
      const a=i*2.39996323,y=.11+.87*((i*.618033989)%1),r=Math.sqrt(1-y*y),radius=253;
      positions.push(Math.cos(a)*r*radius,y*radius,Math.sin(a)*r*radius);
      const value=.50+.50*((i*.41421356)%1);colours.push(value*.91,value*.96,value);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
    this.starMaterial=new THREE.PointsMaterial({size:1.8,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:0,fog:false,depthWrite:false,toneMapped:false});
    this.starMaterial.userData.wornNoGrain=true;
    this.stars=new THREE.Points(g,this.starMaterial);this.stars.name='night-stars';this.stars.renderOrder=-3;this.root.add(this.stars);scene.add(this.root);
    const domeMaterial=new THREE.ShaderMaterial({
      name:'sky-gradient',vertexShader:SKY_VERTEX,fragmentShader:SKY_FRAGMENT,side:THREE.BackSide,depthTest:false,depthWrite:false,fog:false,toneMapped:false,
      uniforms:{fogColour:{value:new THREE.Color()},horizon:{value:new THREE.Color()},middle:{value:new THREE.Color()},zenith:{value:new THREE.Color()},glow:{value:new THREE.Color()},sunDirection:{value:new THREE.Vector3(0,1,0)},glowStrength:{value:0}},
    });
    // This authored gradient has its own vertex/fragment contract. WornStyle
    // patches built-in shader anchors; applying just its final colour step
    // here would reference uniforms its declaration anchor never installed.
    domeMaterial.userData.preserveAuthoredSurface=true;
    domeMaterial.userData.wornNoGrain=true;domeMaterial.userData.filmGrainExclude=true;
    // Down to about twenty degrees under the horizon, which is as low as any view looks past the land.
    this.dome=new THREE.Mesh(new THREE.SphereGeometry(SKY_DOME_RADIUS,32,14,0,Math.PI*2,0,Math.PI*.62),domeMaterial);
    this.dome.name='sky-dome';this.dome.renderOrder=-10;this.dome.frustumCulled=false;
    this.dome.userData.projectorBackground=true;this.dome.userData.filmGrainExclude=true;this.dome.userData.environmentExclude=true;
    scene.add(this.dome);
  }

  /** The keyframed gradient for this moment, and where the sun is (any length). */
  setSky(fog:THREE.Color,horizon:THREE.Color,middle:THREE.Color,zenith:THREE.Color,glow:THREE.Color,glowStrength:number,sunDirection:THREE.Vector3): void {
    const u=this.dome.material.uniforms;
    u.fogColour.value.copy(fog);u.horizon.value.copy(horizon);u.middle.value.copy(middle);u.zenith.value.copy(zenith);u.glow.value.copy(glow);
    u.glowStrength.value=glowStrength;u.sunDirection.value.copy(sunDirection);
  }

  setCloudiness(value:number): void {this.cloudiness=THREE.MathUtils.clamp(value,0,1);}

  update(minute:number,observer:THREE.Vector3,now=Date.now()): void {
    this.lastMinute=minute;
    this.root.position.set(observer.x,0,observer.z);
    this.dome.position.set(observer.x,observer.y,observer.z);
    this.root.rotation.y=(now*.07/3600000)%(Math.PI*2);
    const night=nightSkyAmount(minute);
    // Sunset and sunrise both colour the clouds; dawn is the start of the cycle.
    const dusk=THREE.MathUtils.smoothstep(minute,21,28)*(1-THREE.MathUtils.smoothstep(minute,30,37))
      +(1-THREE.MathUtils.smoothstep(minute,2,8))+THREE.MathUtils.smoothstep(minute,56,60);
    for(const m of this.clouds){m.color.copy(this.daylight).lerp(this.sunset,dusk).lerp(this.moonlight,night).lerp(new THREE.Color(0x87959c),this.cloudiness*.8);m.opacity=1;}
    for(const [i,m] of this.weatherClouds.entries()){m.color.set(0x8c999e).lerp(this.moonlight,night*.55);m.opacity=this.cloudiness;this.weatherBanks[i].visible=this.cloudiness>.001;}
    this.starMaterial.opacity=night*.95*(1-this.cloudiness);this.stars.visible=night>.001;
  }

  snapshot(): unknown {
    return {cloudBanks:4,cloudCards:20,cloudTextures:this.clouds.length,weatherCloudBanks:4,cloudiness:this.cloudiness,stars:260,starOpacity:this.starMaterial.opacity,starsVisible:this.stars.visible,cycleMinute:this.lastMinute};
  }
}
