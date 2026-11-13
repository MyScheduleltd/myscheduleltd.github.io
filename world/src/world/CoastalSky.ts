import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Small, seeded: the same sky every load. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The clouds' authored pixel silhouettes (128 by 64): sunlit lobes, cool
 * stepped undersides. The owner liked their style, shape and placement best
 * (2026-11-12), so they stay; what changed is that they are built in 3D.
 * Returns the RGBA pixels, or undefined without a 2D canvas (Node tests).
 */
function cloudPixels(variant: number): Uint8ClampedArray | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;
  const c=canvas.getContext('2d');
  if(!c)return undefined;
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
  const data=c.getImageData(0,0,128,64)?.data;
  return data && data.length===128*64*4 ? data : undefined;
}

/** Texels per block: the silhouette is built from 32 by 16 blocks. */
const CLOUD_BLOCK = 4;

/**
 * One cloud card's silhouette as chunky pixel blocks with depth (the owner,
 * 2026-11-12: "make the clouds 3D... real lighting reaction and shadings";
 * then, keeping the old look: "old look, made 3D"). Each block of the
 * silhouette is extruded front and back, thicker towards the middle of the
 * cloud in whole-block steps, so it has volume and stepped sides like the
 * pixel art it is. Coloured from the silhouette's own pixels and lit by the
 * world. Built facing +z, centred, `width` by `width / 2`.
 */
export function cloudBlockGeometry(variant: number, width: number): THREE.BufferGeometry | undefined {
  const pixels = cloudPixels(variant);
  if (!pixels) return undefined;
  const cols = 128 / CLOUD_BLOCK, rows = 64 / CLOUD_BLOCK, size = width / cols;
  const filled: boolean[] = [], colour: THREE.Color[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    // The block's middle texel decides it, as the coarse alpha cut did.
    const px = i * CLOUD_BLOCK + CLOUD_BLOCK / 2, py = j * CLOUD_BLOCK + CLOUD_BLOCK / 2, k = (py * 128 + px) * 4;
    filled.push(pixels[k + 3] > 100);
    colour.push(new THREE.Color().setRGB(pixels[k] / 255, pixels[k + 1] / 255, pixels[k + 2] / 255, THREE.SRGBColorSpace));
  }
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < cols && j < rows && filled[j * cols + i];
  // How far each block is from the outline, in blocks: its half-thickness.
  const depth = new Array<number>(cols * rows).fill(0);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (!at(i, j)) continue;
    let d = 1;
    for (let r = 1; r <= 3; r++) {
      let inside = true;
      for (let dj = -r; dj <= r && inside; dj++) for (let di = -r; di <= r && inside; di++) if (!at(i + di, j + dj)) inside = false;
      if (inside) d = r + 1; else break;
    }
    depth[j * cols + i] = d;
  }
  const position: number[] = [], normal: number[] = [], tint: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], col: THREE.Color) => {
    for (const v of [a, b, c, a, c, d]) { position.push(...v); normal.push(...n); tint.push(col.r, col.g, col.b); }
  };
  const half = (v: number) => v * size * .55;
  // Front and back faces: runs of blocks along a row with the same thickness
  // and colour become one face, which halves the triangles on phones.
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols;) {
    if (!at(i, j)) { i++; continue; }
    const k = j * cols + i, col = colour[k];
    let end = i + 1;
    while (end < cols && at(end, j) && depth[j * cols + end] === depth[k] && colour[j * cols + end].equals(col)) end++;
    const d = half(depth[k]), x0 = -width / 2 + i * size, x1 = -width / 2 + end * size, y1 = width / 4 - j * size, y0 = y1 - size;
    quad([x0, y0, d], [x1, y0, d], [x1, y1, d], [x0, y1, d], [0, 0, 1], col);
    quad([x1, y0, -d], [x0, y0, -d], [x0, y1, -d], [x1, y1, -d], [0, 0, -1], col);
    i = end;
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    if (!at(i, j)) continue;
    const d = half(depth[j * cols + i]), col = colour[j * cols + i];
    // Texel rows run top down; the cloud's y runs up.
    const x0 = -width / 2 + i * size, x1 = x0 + size, y1 = width / 4 - j * size, y0 = y1 - size;
    // Sides: wherever this block stands thicker than its neighbour (or the neighbour is empty).
    const side = (ni: number, nj: number) => (at(ni, nj) ? half(depth[nj * cols + ni]) : 0);
    const left = side(i - 1, j), right = side(i + 1, j), up = side(i, j - 1), down = side(i, j + 1);
    for (const [from, to] of [[left, d], [-d, -left]]) if (to > from) quad([x0, y0, from], [x0, y0, to], [x0, y1, to], [x0, y1, from], [-1, 0, 0], col);
    for (const [from, to] of [[right, d], [-d, -right]]) if (to > from) quad([x1, y0, to], [x1, y0, from], [x1, y1, from], [x1, y1, to], [1, 0, 0], col);
    for (const [from, to] of [[up, d], [-d, -up]]) if (to > from) quad([x0, y1, to], [x1, y1, to], [x1, y1, from], [x0, y1, from], [0, 1, 0], col);
    for (const [from, to] of [[down, d], [-d, -down]]) if (to > from) quad([x0, y0, from], [x1, y0, from], [x1, y0, to], [x0, y0, to], [0, -1, 0], col);
  }
  if (!position.length) return undefined;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(tint, 3));
  return geometry;
}

/**
 * The clouds' material: lit by the world's sun, moon and sky light, outside
 * the fog (they stand beyond it). Its emissive is set each frame from the
 * sky's own colour (update): real clouds glow with scattered light, so they
 * read pale by day, pink at sunset and dim at night, with the sun's shading.
 */
function cloudMaterial(): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, fog: false });
  material.name = 'PS1 cloud';
  material.userData.wornNoGrain = true;
  material.userData.wornNoMasonry = true;
  material.userData.preserveAuthoredSurface = true;
  return material;
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
  private readonly cloudMaterial = cloudMaterial();
  private readonly overcastMaterial = cloudMaterial();
  private readonly starSets: Array<{ points: THREE.Points; material: THREE.PointsMaterial; rate: number; phase: number }> = [];
  private lastMinute=0;
  private cloudiness=0;
  private readonly weatherBanks:THREE.Mesh[]=[];
  /** The sky's middle band, for the clouds' scattered light. */
  private readonly skyGlow=new THREE.Color(0xbfd3ff);
  /** Drawn first and behind everything; follows the observer, never turns with the stars. */
  readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

  constructor(scene: THREE.Scene) {
    this.root.name='coastal-atmosphere';this.root.userData.projectorBackground=true;
    // The ring of clouds round the horizon, in the old cards' places and
    // sizes, riding with the observer like the sky and drawn unbent
    // (renderOrder -2, keepSkyFlat). Four silhouettes, five clouds each.
    this.overcastMaterial.color.set(0x9aa5ab);
    this.overcastMaterial.transparent = true; this.overcastMaterial.opacity = 0;
    for(let variant=0;variant<4;variant++) {
      const geometries: THREE.BufferGeometry[]=[];
      for(let i=0;i<5;i++) {
        const index=variant*5+i,angle=index/20*Math.PI*2+.16*Math.sin(index*2.1);
        const distance=211+(index%3)*7,width=48+(index%4)*13;
        const y=26+(index%5)*10;
        const g=cloudBlockGeometry(variant,width);
        if(!g)continue;
        g.rotateY(angle+Math.PI);
        g.translate(Math.sin(angle)*distance,y,Math.cos(angle)*distance);geometries.push(g);
      }
      if(!geometries.length)continue;
      const merged=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());
      const mesh=new THREE.Mesh(merged,this.cloudMaterial);mesh.name='cumulus-bank-'+variant;mesh.renderOrder=-2;
      this.root.add(mesh);
      // Weather: a greyer layer of the same clouds, higher and turned.
      const bank=new THREE.Mesh(merged,this.overcastMaterial);bank.rotation.y=.37;
      bank.scale.set(1.03,.8,1.03);bank.position.y=30;bank.renderOrder=-2;bank.visible=false;
      bank.name='overcast-bank-'+variant;this.weatherBanks.push(bank);this.root.add(bank);
    }
    // Stars scattered at random over the sky, most small and faint, a few
    // larger and brighter, each set twinkling at its own pace (the owner,
    // 2026-11-12: "more spread out randomly, instead of being in an
    // alignment"; the old golden-angle spiral drew visible arcs).
    const starRand = seeded(4207);
    for (const [count, size, bright] of [[170, 1.2, .55], [150, 1.3, .7], [70, 1.9, .8], [60, 1.9, .9], [22, 2.6, 1], [8, 3.4, 1]] as const) {
      const positions: number[] = [], colours: number[] = [];
      for (let i = 0; i < count; i++) {
        const y = .1 + starRand() * .88, a = starRand() * Math.PI * 2, r = Math.sqrt(1 - y * y), radius = 253;
        positions.push(Math.cos(a) * r * radius, y * radius, Math.sin(a) * r * radius);
        const value = bright * (.75 + starRand() * .25), warm = starRand() < .15;
        colours.push(value * (warm ? 1 : .9), value * (warm ? .92 : .96), value * (warm ? .8 : 1));
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
      const material = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false, toneMapped: false });
      material.userData.wornNoGrain = true;
      const points = new THREE.Points(g, material);
      points.name = 'night-stars'; points.renderOrder = -3; this.root.add(points);
      this.starSets.push({ points, material, rate: .6 + starRand() * 1.4, phase: starRand() * Math.PI * 2 });
    }
    scene.add(this.root);
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
    this.skyGlow.copy(middle).lerp(horizon,.35);
  }

  setCloudiness(value:number): void {this.cloudiness=THREE.MathUtils.clamp(value,0,1);}

  update(minute:number,observer:THREE.Vector3,now=Date.now()): void {
    this.lastMinute=minute;
    this.root.position.set(observer.x,0,observer.z);
    this.dome.position.set(observer.x,observer.y,observer.z);
    this.root.rotation.y=(now*.07/3600000)%(Math.PI*2);
    const night=nightSkyAmount(minute);
    // The clouds are lit by the world's own lights (sun, moon, sky), so dawn,
    // sunset and night colour them by themselves; weather only greys them.
    // At night the moonlit clouds are a dim blue-grey, not the day's white.
    this.cloudMaterial.color.set(0xffffff).lerp(new THREE.Color(0x9aa3a8),this.cloudiness*.7).lerp(new THREE.Color(0x56627a),night*.6);
    // Scattered light: the sky's colour, brightened; almost none at night.
    this.cloudMaterial.emissive.copy(this.skyGlow).lerp(new THREE.Color(0xffffff),.45).multiplyScalar(.5*(1-night*.94)*(1-this.cloudiness*.5));
    this.overcastMaterial.emissive.copy(this.cloudMaterial.emissive).multiplyScalar(.6);
    this.overcastMaterial.opacity=this.cloudiness;
    for(const bank of this.weatherBanks)bank.visible=this.cloudiness>.001;
    const seconds=now/1000;
    for(const set of this.starSets){
      set.material.opacity=night*.95*(1-this.cloudiness)*(.78+.22*Math.sin(seconds*set.rate+set.phase));
      set.points.visible=night>.001;
    }
  }

  snapshot(): unknown {
    return {cloudBanks:4,cloudCards:20,cloudBlocks:true,weatherCloudBanks:this.weatherBanks.length,cloudiness:this.cloudiness,stars:this.starSets.reduce((n,set)=>n+set.points.geometry.getAttribute('position').count,0),starOpacity:this.starSets[0]?.material.opacity??0,starsVisible:this.starSets[0]?.points.visible??false,cycleMinute:this.lastMinute};
  }
}
