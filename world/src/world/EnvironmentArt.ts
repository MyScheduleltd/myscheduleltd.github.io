import * as THREE from 'three';
import type { EnvironmentFamily } from './EnvironmentMaterials';

/** The original festival's stone, brick and park colours, with neon kept separate. */
export const ISLAND_PALETTE = {
  cream: 0xe0d4b8, paleStone: 0xd8ccb0, amber: 0xd6a65a,
  vermilion: 0x9e4b3c, redFabric: 0x903b3b, cyan: 0x4b9294,
  teal: 0x3b665e, cobalt: 0x233e75, ink: 0x293b40,
  wood: 0x705743, foliage: 0x3b6a49, yellow: 0xd4b24a,
} as const;
type Accent = keyof typeof ISLAND_PALETTE;

export function environmentPaletteTint(family: EnvironmentFamily, source: THREE.Color): THREE.Color {
  const rgb = source.getRGB({r:0,g:0,b:0},THREE.SRGBColorSpace);
  const value = Math.max(rgb.r,rgb.g,rgb.b);
  const hue = source.getHSL({h:0,s:0,l:0},THREE.SRGBColorSpace).h;
  let color: number;
  switch(family) {
    case 'plaster': color=value<.36?ISLAND_PALETTE.ink:ISLAND_PALETTE.cream; break;
    case 'brick': color=value<.42?0x713f38:ISLAND_PALETTE.vermilion; break;
    case 'ceramic': color=value<.37?ISLAND_PALETTE.teal:ISLAND_PALETTE.cyan; break;
    case 'asphalt': color=0x262e3b; break;
    case 'wood': color=hue<.055||hue>.94?ISLAND_PALETTE.vermilion:ISLAND_PALETTE.wood; break;
    case 'stone': color=value<.43?0x4a5c61:ISLAND_PALETTE.paleStone; break;
  }
  return new THREE.Color(color);
}

/** World-anchored grain + ordered print dithering; authored normals/maps survive. */
const PRINT = /* glsl */ `
  float islandLuma = dot(gl_FragColor.rgb, vec3(.2126,.7152,.0722));
  gl_FragColor.rgb = mix(vec3(islandLuma),gl_FragColor.rgb,1.04);
  vec3 islandGrainPosition = vIslandPrintWorld * 240.0;
  vec3 islandCell = floor(islandGrainPosition);
  vec3 islandHash = fract(islandCell * .3183099 + vec3(.1,.13,.17));
  islandHash *= 17.0;
  float islandGrain = fract(islandHash.x*islandHash.y*islandHash.z*(islandHash.x+islandHash.y+islandHash.z))-.5;
  float islandFootprint=max(length(dFdx(islandGrainPosition)),length(dFdy(islandGrainPosition)));
  float islandGrainVisibility=1.0-smoothstep(.65,1.6,islandFootprint);
  gl_FragColor.rgb += islandGrain * .075 * islandGrainVisibility * islandPrintStrength;
  vec2 islandPixel = mod(floor(gl_FragCoord.xy),2.0);
  float islandBayer = (2.0*islandPixel.x + 3.0*islandPixel.y - 4.0*islandPixel.x*islandPixel.y + .5)/4.0;
  vec3 islandPrint = floor(clamp(gl_FragColor.rgb,0.0,1.0)*18.0+islandBayer)/18.0;
  gl_FragColor.rgb = clamp(mix(gl_FragColor.rgb,islandPrint,.64*islandPrintStrength),0.0,1.0);
`;

function printMaterial(material: THREE.Material): void {
  if(material.userData.islandPrintPatched) return;
  const previous=material.onBeforeCompile, previousKey=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.uniforms.islandPrintStrength={value:material.userData.islandPrintStrength??1};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vIslandPrintWorld;')
      .replace('#include <project_vertex>','#include <project_vertex>\nvIslandPrintWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vIslandPrintWorld;\nuniform float islandPrintStrength;')
      .replace('#include <colorspace_fragment>','#include <colorspace_fragment>\n'+PRINT);
  };
  material.customProgramCacheKey=()=>previousKey+':island-reference-print-v2';
  material.userData.islandPrintPatched=true;
  material.needsUpdate=true;
}

export interface EnvironmentArtReport { materials:number; recolored:number; imported:number; grain:number; printSteps:number; }

/** Explicit environment tags protect faces, clothing, logos, UI and film pixels. */
export function applyEnvironmentArt(scene:THREE.Object3D):EnvironmentArtReport {
  const seen=new Set<THREE.Material>();
  const report:EnvironmentArtReport={materials:0,recolored:0,imported:0,grain:.075,printSteps:18};
  scene.traverse(object=>{
    const mesh=object as THREE.Mesh;
    if(!mesh.isMesh) return;
    for(let parent:THREE.Object3D|null=mesh;parent;parent=parent.parent)
      if(parent.userData.environmentExclude||parent.userData.coastalCharacter!==undefined||parent.userData.dynamic||parent.name==='character-body')return;
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]) {
      if(seen.has(material))continue;
      const family=material.userData.environmentFamily as EnvironmentFamily|undefined;
      const accent=material.userData.environmentAccent as Accent|undefined;
      const imported=mesh.userData.environmentImported===true;
      const architecture=material.userData.environmentArchitecture===true;
      if(!family&&!accent&&!imported&&!architecture)continue;
      if(!(material as THREE.MeshStandardMaterial).isMeshStandardMaterial||material.transparent)continue;
      seen.add(material);report.materials++;
      const surface=material as THREE.MeshStandardMaterial;
      if(!surface.userData.islandPaletteApplied) {
        if(family) {surface.color.copy(environmentPaletteTint(family,surface.color));report.recolored++;}
        else if(accent&&accent in ISLAND_PALETTE){surface.color.setHex(ISLAND_PALETTE[accent]);report.recolored++;}
        else if(architecture){surface.color.setHex(surface.metalness>.65?0xf2b84b:ISLAND_PALETTE.ink);report.recolored++;}
        surface.userData.islandPaletteApplied=true;
      }
      if(imported)report.imported++;
      // Existing procedural accent materials already carry the original print
      // pass. New authored PBR needs this gentler patch without flat shading.
      if(!surface.userData.wornPatched)printMaterial(surface);
    }
  });
  scene.userData.environmentArtReport=report;
  return report;
}
