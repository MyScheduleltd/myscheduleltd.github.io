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
  }

  update(minute:number,observer:THREE.Vector3,now=Date.now()): void {
    this.lastMinute=minute;
    this.root.position.set(observer.x,0,observer.z);
    this.root.rotation.y=(now*.07/3600000)%(Math.PI*2);
    const night=nightSkyAmount(minute);
    const dusk=THREE.MathUtils.smoothstep(minute,21,28)*(1-THREE.MathUtils.smoothstep(minute,30,37));
    for(const m of this.clouds){m.color.copy(this.daylight).lerp(this.sunset,dusk).lerp(this.moonlight,night);m.opacity=1;}
    this.starMaterial.opacity=night*.95;this.stars.visible=night>.001;
  }

  snapshot(): unknown {
    return {cloudBanks:4,cloudCards:20,cloudTextures:this.clouds.length,stars:260,starOpacity:this.starMaterial.opacity,starsVisible:this.stars.visible,cycleMinute:this.lastMinute};
  }
}
