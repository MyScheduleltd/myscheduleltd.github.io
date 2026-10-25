import * as THREE from 'three';

/** A cool-neutral bounce for people standing out of the key light. Its small
 * directional range keeps facial planes readable instead of filling every
 * shadow to the same colour. This is albedo-dependent diffuse, never emission. */
export const AVATAR_SHADE_LIGHTING = Object.freeze({
  diffuseFloor: [.11, .12, .14] as const,
  fadeStart: .16,
  fadeEnd: .60,
  directionalContrast: .40,
});

const floor = { value: new THREE.Vector3(...AVATAR_SHADE_LIGHTING.diffuseFloor) };
// A shared scalar also permits an exact matched-frame comparison: zero is the
// previous uniform bounce, with no shader switch or material recompilation.
const contrast = { value: AVATAR_SHADE_LIGHTING.directionalContrast };
const marker = '// AVATAR_SHADE_BOUNCE_V1';
const slot = '// AVATAR_SHADE_BOUNCE_SLOT';

/** Composes inside the existing avatar light-band shader: no light, map,
 * renderer or additional draw. The one shared value survives all wardrobes. */
export function applyAvatarShadeLighting(shader: THREE.WebGLProgramParametersWithUniforms): void {
  if (shader.fragmentShader.includes(marker) || !shader.fragmentShader.includes(slot)) return;
  shader.uniforms.avatarShadeFloor = floor;
  shader.uniforms.avatarShadeContrast = contrast;
  shader.fragmentShader = 'uniform vec3 avatarShadeFloor;\nuniform float avatarShadeContrast;\n' + shader.fragmentShader.replace(slot, `${marker}
    float avatarShadeWeight = 1. - smoothstep(${AVATAR_SHADE_LIGHTING.fadeStart.toFixed(2)}, ${AVATAR_SHADE_LIGHTING.fadeEnd.toFixed(2)}, avatarIrradiance);
    // Use the same view-space normal and existing sun/moon directions as the
    // physical light pass. Camera movement cannot rotate this shade onto a face.
    vec3 avatarShadeKey = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz);
    float avatarShadeKeyEnergy = .0001;
    #if NUM_DIR_LIGHTS > 0
      #pragma unroll_loop_start
      for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
        if (dot(directionalLights[ i ].color, vec3(.2126, .7152, .0722)) > avatarShadeKeyEnergy) {
          avatarShadeKeyEnergy = dot(directionalLights[ i ].color, vec3(.2126, .7152, .0722));
          avatarShadeKey = directionalLights[ i ].direction;
        }
      }
      #pragma unroll_loop_end
    #endif
    float avatarShadeFacing = smoothstep(-.45, .75, dot(normal, avatarShadeKey));
    float avatarShadeDirectional = 1. + clamp(avatarShadeContrast, 0., .40) * (avatarShadeFacing - .70);
    vec3 avatarBounceFloor = material.diffuseColor * avatarShadeFloor * avatarShadeDirectional;
    reflectedLight.directDiffuse = mix(reflectedLight.directDiffuse,
      max(reflectedLight.directDiffuse, avatarBounceFloor), avatarShadeWeight);
  `);
}
