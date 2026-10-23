import * as THREE from 'three';
import { materialCompileHookIdentity } from './PlanetCurve';

/** Dense monochrome film grain, evaluated directly in existing draw calls. */
export const WORLD_FILM_GRAIN_SETTINGS=Object.freeze({strength:.13,clump:.12,clumpPixels:2.25,hz:18,period:4096});
/** Hue-preserving ordered light bands; the existing PBR/colour palette stays. */
export const WORLD_DITHER_SETTINGS=Object.freeze({levels:12,amount:.65,pixelSize:1.5});
const frameUniform={value:0};
const marker='// WORLD_FILM_GRAIN_V1';
const cacheSuffix=':world-film-grain-v1';
type CompileHook=THREE.Material['onBeforeCompile'];
interface Patch { hook:CompileHook; prior:CompileHook; key:THREE.Material['customProgramCacheKey']; }
const patched=new WeakMap<THREE.Material,Patch>();

const declaration=/* glsl */`
  uniform float worldFilmFrame;
  float worldFilmHash(vec2 point) {
    vec3 hash = fract(vec3(point.xyx) * .1031);
    hash += dot(hash, hash.yzx + 33.33);
    return fract((hash.x + hash.y) * hash.z);
  }
  float worldDitherBayer2(vec2 point) {
    return mod(2. * point.x + 3. * point.y, 4.);
  }
  float worldDitherThreshold(vec2 pixel) {
    vec2 point = floor(pixel / ${WORLD_DITHER_SETTINGS.pixelSize.toFixed(2)});
    float fine = worldDitherBayer2(mod(point, 2.));
    float middle = worldDitherBayer2(mod(floor(point / 2.), 2.));
    float broad = worldDitherBayer2(mod(floor(point / 4.), 2.));
    return (fine * 16. + middle * 4. + broad + .5) / 64.;
  }
`;
const grain=/* glsl */`
  // WORLD_ORDERED_DITHER_V1
  float worldStyleLuma = dot(gl_FragColor.rgb, vec3(.2126, .7152, .0722));
  float worldStyleBand = floor(worldStyleLuma * ${WORLD_DITHER_SETTINGS.levels.toFixed(1)} + worldDitherThreshold(gl_FragCoord.xy)) / ${WORLD_DITHER_SETTINGS.levels.toFixed(1)};
  // Keep near-black paint dark: tiny blue components must not become bright
  // speckles when a Bayer cell selects its first nonzero luminance band.
  float worldStyleGain = clamp(worldStyleBand / max(worldStyleLuma, .0001), .5, 1.5);
  vec3 worldStyleColour = gl_FragColor.rgb * worldStyleGain;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, clamp(worldStyleColour, 0., 1.), ${WORLD_DITHER_SETTINGS.amount.toFixed(2)});
  ${marker}
  // Every covered world fragment receives grain. No sparse-dot threshold.
  vec2 worldFilmPixel = floor(gl_FragCoord.xy);
  vec2 worldFilmShift = vec2(worldFilmFrame * 19.19, worldFilmFrame * 7.73);
  float worldFilmFine = worldFilmHash(worldFilmPixel + worldFilmShift) - .5;
  float worldFilmClump = worldFilmHash(floor(worldFilmPixel / ${WORLD_FILM_GRAIN_SETTINGS.clumpPixels.toFixed(2)}) + worldFilmShift.yx + 41.7) - .5;
  float worldFilmSignal = mix(worldFilmFine, worldFilmClump, ${WORLD_FILM_GRAIN_SETTINGS.clump.toFixed(2)});
  float worldFilmLuma = clamp(dot(gl_FragColor.rgb, vec3(.2126, .7152, .0722)), 0., 1.);
  float worldFilmHeadroom = .65 + .35 * (1. - abs(worldFilmLuma * 2. - 1.));
  gl_FragColor.rgb = clamp(gl_FragColor.rgb + vec3(worldFilmSignal * ${WORLD_FILM_GRAIN_SETTINGS.strength.toFixed(2)} * worldFilmHeadroom), 0., 1.);
`;

function containsVideo(material:THREE.Material):boolean {
  // Test all authored slots, including an emissive movie map rather than
  // just .map. No texture is copied, changed, created or disposed here.
  return Object.values(material).some(value=>value instanceof THREE.Texture&&(value as THREE.VideoTexture).isVideoTexture);
}

function isEligible(material:THREE.Material):boolean {
  const basic=material as THREE.MeshBasicMaterial,standard=material as THREE.MeshStandardMaterial;
  return (basic.isMeshBasicMaterial===true||standard.isMeshStandardMaterial===true)
    &&!material.transparent&&material.userData.filmGrainExclude!==true&&!containsVideo(material);
}

function excludedByParent(object:THREE.Object3D):boolean {
  for(let parent:THREE.Object3D|null=object;parent;parent=parent.parent)
    if(parent.userData.filmGrainExclude===true)return true;
  return false;
}

function patchMaterial(material:THREE.Material):boolean {
  const existing=patched.get(material);
  // A cloned material can copy userData flags without copying compile hooks.
  // The real hook, not that diagnostic flag, is the source of truth.
  if(existing?.hook===materialCompileHookIdentity(material.onBeforeCompile))return false;
  const prior=material.onBeforeCompile,key=material.customProgramCacheKey;
  const priorKey=key.call(material);
  const hook:CompileHook=(shader,renderer)=>{
    prior.call(material,shader,renderer);
    if(!isEligible(material))return;
    // Another plugin may have wrapped our previous hook before this call.
    // Preserve that whole chain but never inject the film pass twice.
    if(shader.fragmentShader.includes(marker))return;
    if(!shader.fragmentShader.includes('#include <colorspace_fragment>'))return;
    shader.uniforms.worldFilmFrame=frameUniform;
    // Existing print/dither hooks append their own code to colorspace. Put
    // film after that whole chain and after fog, so it is not quantized away.
    const tail='#include <premultiplied_alpha_fragment>';
    shader.fragmentShader=declaration+(shader.fragmentShader.includes(tail)
      ?shader.fragmentShader.replace(tail,grain+'\n'+tail)
      :shader.fragmentShader.replace('#include <colorspace_fragment>','#include <colorspace_fragment>\n'+grain));
  };
  material.onBeforeCompile=hook;
  material.customProgramCacheKey=()=>priorKey.includes(cacheSuffix)?priorKey:priorKey+cacheSuffix;
  material.userData.worldFilmGrain=true;
  material.needsUpdate=true;patched.set(material,{hook,prior,key});return true;
}

function unpatchProtectedMaterial(material:THREE.Material):boolean {
  const state=patched.get(material);if(!state||state.hook!==materialCompileHookIdentity(material.onBeforeCompile))return false;
  material.onBeforeCompile=state.prior;material.customProgramCacheKey=state.key;
  delete material.userData.worldFilmGrain;material.needsUpdate=true;patched.delete(material);return true;
}

export interface WorldFilmGrainReport { meshes:number; materials:number; added:number; alreadyPatched:number; excluded:number; restored:number; strength:number; hz:number; dither:typeof WORLD_DITHER_SETTINGS; }

/** Apply after other art hooks and after late avatar mounting. No GPU resources
 * are allocated; material maps, PBR properties, vertex shaders and alpha stay
 * untouched. Explicitly protected shared materials are kept clear everywhere.
 */
export function applyWorldFilmGrain(root:THREE.Object3D):WorldFilmGrainReport {
  const materials=new Set<THREE.Material>(),protectedMaterials=new Set<THREE.Material>();
  const report:WorldFilmGrainReport={meshes:0,materials:0,added:0,alreadyPatched:0,excluded:0,restored:0,strength:WORLD_FILM_GRAIN_SETTINGS.strength,hz:WORLD_FILM_GRAIN_SETTINGS.hz,dither:WORLD_DITHER_SETTINGS};
  root.traverse(object=>{
    const mesh=object as THREE.Mesh,sprite=object as THREE.Sprite;
    if(!mesh.isMesh&&!sprite.isSprite)return;
    const excluded=sprite.isSprite||excludedByParent(object);
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      if(!material)continue;
      if(excluded||!isEligible(material))protectedMaterials.add(material);
      else materials.add(material);
    }
    if(mesh.isMesh&&!excluded)report.meshes++;
  });
  for(const material of protectedMaterials){
    materials.delete(material);report.excluded++;
    if(unpatchProtectedMaterial(material))report.restored++;
  }
  for(const material of materials){
    report.materials++;
    if(patchMaterial(material))report.added++;else report.alreadyPatched++;
  }
  root.userData.worldFilmGrainReport=report;return report;
}

/** Call once per scene frame. Quantization holds each exposure for 1/18 s;
 * modulo bounds the shader seed during long sessions. No allocations/uploads.
 */
export function setWorldFilmGrainFrame(elapsedSeconds:number):boolean {
  const exposure=Math.floor(Math.max(0,elapsedSeconds)*WORLD_FILM_GRAIN_SETTINGS.hz);
  const next=Number.isFinite(exposure)?exposure%WORLD_FILM_GRAIN_SETTINGS.period:0;
  if(next===frameUniform.value)return false;frameUniform.value=next;return true;
}
