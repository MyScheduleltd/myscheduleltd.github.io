import * as THREE from 'three';
import { PLANET, programUniforms } from './PlanetCurve';

/** Small contact skirt around the booth's solid base, including Lite where
 * dynamic shadow maps are deliberately disabled. No image or extra light. */
export const CONCESSION_CONTACT_SHADOW = Object.freeze({ width: 4.8, depth: 4.1, lift: .025, opacity: .16 });
const geometry = new THREE.PlaneGeometry(CONCESSION_CONTACT_SHADOW.width, CONCESSION_CONTACT_SHADOW.depth, 2, 2);
const material = new THREE.MeshBasicMaterial({ color: 0x10151a, transparent: true,
  opacity: CONCESSION_CONTACT_SHADOW.opacity, depthWrite: false, toneMapped: true });
material.userData.filmGrainExclude = true;
material.userData.wornNoMasonry = true;
material.onBeforeCompile = shader => {
  // Also support importing this shared material before the planet prototype
  // hook is installed. These are the same wrappers every world program uses.
  Object.assign(shader.uniforms, programUniforms);
  shader.uniforms.planetCentre = PLANET.centre;
  shader.uniforms.planetRadius = PLANET.radiusUniform;
  shader.vertexShader = 'varying vec2 vConcessionContactUv;\n' + shader.vertexShader.replace(
    '#include <begin_vertex>', '#include <begin_vertex>\n vConcessionContactUv = uv;');
  shader.fragmentShader = 'varying vec2 vConcessionContactUv;\n' + shader.fragmentShader.replace(
    '#include <alphatest_fragment>', `
      // CONCESSION_CONTACT_SHADOW_V1
      vec2 concessionContactEdge = abs(vConcessionContactUv * 2. - 1.);
      float concessionContactFade = 1. - smoothstep(.48, 1., max(concessionContactEdge.x, concessionContactEdge.y));
      diffuseColor.a *= concessionContactFade * concessionContactFade;
      #include <alphatest_fragment>`);
};
material.customProgramCacheKey = () => 'concession-contact-shadow-v1';

/** Height is local to the booth. Built-in vertex chunks receive the same
 * planet bend as the pavement; the small grid follows its curved surface. */
export function createConcessionContactShadow(localGroundY: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Popcorn booth ground contact';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = localGroundY + CONCESSION_CONTACT_SHADOW.lift;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.wornNoMasonry = true;
  mesh.userData.wornNoGrain = true;
  mesh.userData.filmGrainExclude = true;
  mesh.userData.concessionContactShadow = true;
  return mesh;
}
