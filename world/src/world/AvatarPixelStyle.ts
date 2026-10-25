import * as THREE from 'three';
import { applyAvatarShadeLighting } from './AvatarShadeLighting';

/** Shared in the sign-in preview, world, fixed staff and roof musicians. */
export const AVATAR_PIXEL_STYLE=Object.freeze({textureEdge:256,printEdge:512,lightBands:5,bandMix:.65,clothWear:.12});
const styled=new WeakSet<THREE.Material>();

/** Real scene illumination and shadows, simplified into deliberate light bands. */
export function avatarLightBands(shader:THREE.WebGLProgramParametersWithUniforms,softness:THREE.IUniform<number>):void {
  shader.uniforms.avatarEven=softness;
  shader.fragmentShader='uniform float avatarEven;\n'+shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
    // AVATAR_SCENE_LIGHT_BANDS_V1
    vec3 avatarLitDiffuse=reflectedLight.directDiffuse+reflectedLight.indirectDiffuse;
    float avatarAlbedoLuma=max(dot(material.diffuseColor,vec3(.2126,.7152,.0722)),.015);
    float avatarIrradiance=dot(avatarLitDiffuse,vec3(.2126,.7152,.0722))/avatarAlbedoLuma;
    float avatarBanded=floor(avatarIrradiance*${AVATAR_PIXEL_STYLE.lightBands.toFixed(1)}+.5)/${AVATAR_PIXEL_STYLE.lightBands.toFixed(1)};
    float avatarBandGain=clamp(avatarBanded/max(avatarIrradiance,.0001),.55,1.45);
    reflectedLight.directDiffuse=avatarLitDiffuse*mix(1.,avatarBandGain,mix(.8,.45,avatarEven));
    // AVATAR_SHADE_BOUNCE_SLOT
    reflectedLight.indirectDiffuse=vec3(0.);
    reflectedLight.directSpecular*=.12;
    reflectedLight.indirectSpecular*=.12;
  `);
  applyAvatarShadeLighting(shader);
}

/** Pixel sampling and restrained cloth wear add no maps, geometry or draws. */
export function applyAvatarPixelTexture(material:THREE.MeshStandardMaterial,print=false,clothWear=0):void {
  if(styled.has(material))return;styled.add(material);
  material.toneMapped=true;material.emissiveIntensity=0;material.roughness=.96;material.metalness=0;
  const prior=material.onBeforeCompile,key=material.customProgramCacheKey,priorKey=key.call(material);
  const image=material.map?.image as {width?:number;height?:number}|undefined;
  const width=Math.max(1,image?.width??AVATAR_PIXEL_STYLE.textureEdge),height=Math.max(1,image?.height??width);
  const scale=Math.min(1,(print?AVATAR_PIXEL_STYLE.printEdge:AVATAR_PIXEL_STYLE.textureEdge)/Math.max(width,height));
  const grid={value:new THREE.Vector2(Math.round(width*scale),Math.round(height*scale))};
  if(material.map&&!material.map.userData.avatarPixelSampling){
    material.map.magFilter=THREE.NearestFilter;material.map.minFilter=THREE.NearestMipmapNearestFilter;
    material.map.anisotropy=1;material.map.userData.avatarPixelSampling=true;material.map.needsUpdate=true;
  }
  material.userData.avatarPixelStyle={...AVATAR_PIXEL_STYLE,print,grid:grid.value.toArray(),clothWear};
  material.onBeforeCompile=(shader,renderer)=>{
    prior.call(material,shader,renderer);shader.uniforms.avatarPixelGrid=grid;
    shader.fragmentShader=`uniform vec2 avatarPixelGrid;
      vec2 avatarPixelUv(vec2 uv){return(floor(uv*avatarPixelGrid)+.5)/avatarPixelGrid;}
      float avatarFabricHash(vec2 cell){return fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);}
      `+shader.fragmentShader;
    // Keep the dye's mask on exactly the same texel as its colour map.
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment)
      .replace(/texture2D\(\s*(map|avatarDye)\s*,\s*vMapUv/g,'texture2D($1, avatarPixelUv(vMapUv)');
    if(clothWear>0)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      // AVATAR_CLOTH_WEAR_V1: the neutral dark fabric only, not warm skin or white ink.
      #ifdef USE_MAP
      float avatarFabricLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      float avatarFabricChroma=max(max(diffuseColor.r,diffuseColor.g),diffuseColor.b)-min(min(diffuseColor.r,diffuseColor.g),diffuseColor.b);
      float avatarFabricMask=(1.-smoothstep(.15,.28,avatarFabricChroma))*(1.-smoothstep(.55,.8,avatarFabricLuma));
      float avatarFabricWear=avatarFabricHash(floor(vMapUv*avatarPixelGrid*.5));
      diffuseColor.rgb*=1.-${clothWear.toFixed(3)}*avatarFabricMask*(.35+.65*avatarFabricWear);
      #endif`);
  };
  material.customProgramCacheKey=()=>priorKey+':avatar-pixel-v2-shade:'+print+':'+clothWear;
  material.needsUpdate=true;
}
