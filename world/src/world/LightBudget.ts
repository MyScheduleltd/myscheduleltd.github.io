import type * as THREE from 'three';

/** Shader light counts must stay fixed while the visitor moves between rooms. */
export function selectDecorativeLights(
  lights: THREE.Light[], normal: boolean, score: (light: THREE.Light) => number,
): void {
  const groups = [
    { budget: normal ? 8 : 6, lights: lights.filter(light => (light as THREE.PointLight).isPointLight) },
    { budget: normal ? 1 : 0, lights: lights.filter(light => (light as THREE.SpotLight).isSpotLight && !light.castShadow) },
    { budget: normal ? 1 : 0, lights: lights.filter(light => (light as THREE.SpotLight).isSpotLight && light.castShadow) },
  ];
  for (const group of groups) {
    const ranked = group.lights.map(light => ({ light, score: score(light) })).sort((a, b) => a.score - b.score);
    ranked.forEach(({ light }, index) => { light.visible = index < group.budget; });
  }
}
