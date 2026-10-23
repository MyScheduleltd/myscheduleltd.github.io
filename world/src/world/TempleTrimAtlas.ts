import * as THREE from 'three';
import { fetchAsset } from './AssetMirror';
import { mobileAssetBudgetEnabled } from './MobileAssetBudget';

/** One pre-sized Higgsfield colour atlas, shared by temple and Wish Wall.
 * The encoded mobile variant is 512px, desktop 1024px. No normal/roughness
 * images or runtime texture-generation pass are added. Both paths use HTML
 * image decoding so flipY has the same meaning for the four atlas bands.
 */
export class TempleTrimAtlas {
  readonly material = new THREE.MeshStandardMaterial({ color: 0xd9a444, roughness: .52, metalness: .18 });
  readonly report = { status: 'unused', encodedBytes: 0, decodedBytesWithMips: 0, edge: 0, errors: [] as string[] };
  private readonly url?: string;
  private pending?: Promise<void>;
  private texture?: THREE.Texture;
  private disposed = false;

  constructor(files: Record<string,string>, mobile = mobileAssetBudgetEnabled()) {
    const filename=mobile?'temple-trim-mobile.webp':'temple-trim.webp';
    this.url=Object.entries(files).find(([path])=>path.endsWith('/'+filename))?.[1];
    this.material.name='Higgsfield temple and Wish Wall carved trim';
    Object.assign(this.material.userData, { preserveAuthoredSurface:true, environmentArchitecture:true, islandPaletteApplied:true, islandPrintStrength:.5 });
  }

  prepare(): Promise<void> {
    if(this.pending)return this.pending;
    this.pending=(async()=>{
      if(!this.url){this.report.status='missing';return;}
      this.report.status='loading';
      let objectUrl:string|undefined, loaded:THREE.Texture|undefined;
      try{
        const bytes=await fetchAsset(this.url);
        if(this.disposed)return;
        this.report.encodedBytes=bytes.byteLength;
        objectUrl=URL.createObjectURL(new Blob([bytes],{type:'image/webp'}));
        loaded=await new THREE.TextureLoader().loadAsync(objectUrl);
        if(this.disposed){loaded.dispose();return;}
        loaded.colorSpace=THREE.SRGBColorSpace;
        loaded.wrapS=THREE.RepeatWrapping;loaded.wrapT=THREE.ClampToEdgeWrapping;
        loaded.flipY=true;loaded.anisotropy=2;
        loaded.minFilter=THREE.LinearMipmapLinearFilter;loaded.magFilter=THREE.LinearFilter;loaded.generateMipmaps=true;
        this.texture=loaded;this.material.map=loaded;this.material.color.setHex(0xffffff);this.material.needsUpdate=true;
        const image=loaded.image as {width:number;height:number};
        this.report.edge=Math.max(image.width,image.height);
        this.report.decodedBytesWithMips=Math.ceil(image.width*image.height*4*4/3);
        this.report.status='ready';
      }catch(error){
        if(loaded&&loaded!==this.texture)loaded.dispose();
        this.report.status='failed';this.report.errors.push(error instanceof Error?error.message:String(error));
      }finally{if(objectUrl)URL.revokeObjectURL(objectUrl);}
    })();
    return this.pending;
  }

  dispose():void {
    if(this.disposed)return;this.disposed=true;
    this.material.map=null;this.texture?.dispose();this.texture=undefined;this.material.dispose();
  }
}
