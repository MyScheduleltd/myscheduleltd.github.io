import * as THREE from 'three';

export interface PamphletSurfaceHandle { readonly report:{meshes:number;materials:number};dispose():void; }
const prepared=new WeakMap<THREE.Object3D,PamphletSurfaceHandle>();

/** Explicit stand-only finish. Paper/wood keep colour; high-metal brass keeps
 * its authored small detail. Shared lamp/car materials are never changed.
 */
export function polishPamphletSurface(scene:THREE.Object3D):PamphletSurfaceHandle {
  const cached=prepared.get(scene);if(cached)return cached;
  const variants=new Map<THREE.MeshStandardMaterial,THREE.MeshStandardMaterial>();
  const restored:Array<{mesh:THREE.Mesh;before:THREE.Material|THREE.Material[]}>=[];
  scene.traverse(object=>{
    const mesh=object as THREE.Mesh;if(!mesh.isMesh||!mesh.userData.environmentImported)return;
    let parent:THREE.Object3D|null=mesh;
    while(parent&&parent.userData.environmentAssetKind!=='pamphlet-stand')parent=parent.parent;
    if(!parent)return;
    const before=mesh.material;
    const next=(Array.isArray(before)?before:[before]).map(source=>{
      const standard=source as THREE.MeshStandardMaterial;if(!standard.isMeshStandardMaterial)return source;
      let material=variants.get(standard);
      if(!material){
        material=standard.clone();
        Object.assign(material.userData,{preserveAuthoredSurface:true,islandPrintStrength:.3});
        const prior=standard.onBeforeCompile,key=standard.customProgramCacheKey();
        material.onBeforeCompile=(shader,renderer)=>{
          prior.call(material!,shader,renderer);
          shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
            vec3 pamphletPanelNormal = normal;
            #include <normal_fragment_maps>
            float pamphletWood = 1.0-smoothstep(.12,.45,metalnessFactor);
            normal = normalize(mix(normal,pamphletPanelNormal,.80*pamphletWood));
            roughnessFactor = mix(roughnessFactor,max(roughnessFactor,.55),pamphletWood);
          `);
        };
        material.customProgramCacheKey=()=>key+':pamphlet-polished-v1';variants.set(standard,material);
      }
      return material;
    });
    restored.push({mesh,before});mesh.material=Array.isArray(before)?next:next[0];
  });
  let disposed=false;
  const handle={report:{meshes:restored.length,materials:variants.size},dispose(){
    if(disposed)return;disposed=true;for(const {mesh,before} of restored)mesh.material=before;
    variants.forEach(mat=>mat.dispose());prepared.delete(scene);
  }};prepared.set(scene,handle);return handle;
}
