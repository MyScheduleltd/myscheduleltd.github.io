import * as THREE from 'three';

/**
 * Cel-shaded water for The Shore.
 *
 * The look comes from an animated Voronoi field: the distance to the nearest
 * cell minus a smooth-minimum over all of them is near zero inside a cell and
 * rises at its boundaries, so a hard step across that difference draws crisp
 * foam lines rather than a soft gradient. Colour is a three-stop ramp keyed off
 * the same step, which is what keeps it reading as flat anime water instead of
 * a lit surface.
 *
 * Everything happens in the fragment shader on a flat plane. There is no vertex
 * displacement and no render target, which is what makes it affordable enough
 * to sit in a world that also runs four venues.
 */

const VERTEX = /* glsl */ `
  varying vec2 vWorldPos;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uSmoothness;
  uniform float uEdgeThreshold;
  uniform float uEdgeSoftness;
  uniform vec2 uFlow;
  uniform float uCellSpeed;
  uniform vec3 uDeepColor;
  uniform vec3 uMidColor;
  uniform vec3 uHighlight;
  uniform float uMidPos;
  uniform float uOpacity;
  uniform float uDeepOpacity;
  uniform vec2 uCamXZ;
  uniform float uFadeDistance;
  uniform vec3 uGlintColor;
  uniform vec2 uGlintOrigin;
  uniform float uGlintStrength;
  uniform vec3 uRipple;

  varying vec2 vWorldPos;

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }

  float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * h * k / 6.0;
  }

  vec2 cellPoint(vec2 seed) {
    return 0.5 + 0.5 * sin(uTime * uCellSpeed + 6.2831 * seed);
  }

  // Nearest cell distance, and the same field smoothed. Their difference is the
  // cell boundary, which is what becomes foam.
  vec2 voronoiPair(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float nearest = 8.0;
    float smoothed = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 point = cellPoint(hash2(cell + offset));
        float d = length(offset + point - f);
        nearest = min(nearest, d);
        smoothed = smin(smoothed, d, uSmoothness);
      }
    }
    return vec2(nearest, smoothed);
  }

  void main() {
    vec2 uv = vWorldPos * uScale + uFlow * uTime;
    vec2 field = voronoiPair(uv);
    float edge = field.x - field.y;

    float t = smoothstep(uEdgeThreshold - uEdgeSoftness, uEdgeThreshold + uEdgeSoftness, edge);

    float mid = max(uMidPos, 1e-4);
    float lower = clamp(t / mid, 0.0, 1.0);
    float upper = clamp((t - mid) / max(1.0 - mid, 1e-4), 0.0, 1.0);
    vec3 color = mix(
      mix(uDeepColor, uMidColor, lower),
      mix(uMidColor, uHighlight, upper),
      step(mid, t)
    );

    // A single expanding ring, used while an attendee is swimming.
    float ringDistance = abs(length(vWorldPos - uRipple.xy) - uRipple.z);
    float ring = (1.0 - smoothstep(0.0, 0.5, ringDistance)) * step(0.01, uRipple.z);
    color = mix(color, uHighlight, ring * 0.4);

    // Sun and moon glint: a broad band that stretches toward the light rather
    // than a point, which is how low light reads across open water.
    vec2 toLight = vWorldPos - uGlintOrigin;
    float lane = exp(-abs(toLight.x) * 0.05) * exp(-abs(toLight.y) * 0.012);
    float glint = lane * (0.45 + 0.55 * t) * uGlintStrength;
    color += uGlintColor * glint;

    float fade = 1.0 - pow(clamp(length(vWorldPos - uCamXZ) / uFadeDistance, 0.0, 1.0), 2.0);
    float alpha = mix(uDeepOpacity, 1.0, max(t, ring)) * uOpacity * fade;
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface StylizedWaterTint {
  deep: THREE.ColorRepresentation;
  mid: THREE.ColorRepresentation;
  highlight: THREE.ColorRepresentation;
  glint: THREE.ColorRepresentation;
  glintStrength: number;
}

export const createStylizedWaterMaterial = (): THREE.ShaderMaterial => new THREE.ShaderMaterial({
  vertexShader: VERTEX,
  fragmentShader: FRAGMENT,
  transparent: true,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uScale: { value: 0.22 },
    uSmoothness: { value: 0.55 },
    uEdgeThreshold: { value: 0.045 },
    uEdgeSoftness: { value: 0.022 },
    uFlow: { value: new THREE.Vector2(0.012, 0.006) },
    uCellSpeed: { value: 0.55 },
    uDeepColor: { value: new THREE.Color(0x0d3346) },
    uMidColor: { value: new THREE.Color(0x2f7f96) },
    uHighlight: { value: new THREE.Color(0xd8f2f4) },
    uMidPos: { value: 0.42 },
    uOpacity: { value: 0.94 },
    uDeepOpacity: { value: 0.72 },
    uCamXZ: { value: new THREE.Vector2() },
    uFadeDistance: { value: 190 },
    uGlintColor: { value: new THREE.Color(0xffe6b8) },
    uGlintOrigin: { value: new THREE.Vector2(0, -70) },
    uGlintStrength: { value: 0 },
    uRipple: { value: new THREE.Vector3(0, 0, 0) },
  },
});

/** Applies a time-of-day palette without rebuilding the material. */
export const tintStylizedWater = (material: THREE.ShaderMaterial, tint: StylizedWaterTint): void => {
  (material.uniforms.uDeepColor.value as THREE.Color).set(tint.deep);
  (material.uniforms.uMidColor.value as THREE.Color).set(tint.mid);
  (material.uniforms.uHighlight.value as THREE.Color).set(tint.highlight);
  (material.uniforms.uGlintColor.value as THREE.Color).set(tint.glint);
  material.uniforms.uGlintStrength.value = tint.glintStrength;
};
