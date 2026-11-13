import * as THREE from 'three';
import { PLANET_GLSL } from './PlanetCurve';
import { PS1_WAVES_GLSL, PS1_WAVE_HEIGHT, PS1_ROLLER_HEIGHT } from './Ps1Waves';

/**
 * The PS1 look's sea: a Japanese woodblock print drawn in chunky pixels.
 *
 * Real waves lift the vertices (Ps1Waves, the same table the CPU floats
 * swimmers on): one swell bending to the shore, rollers over the shallows and
 * a still harbour. The fragment shader (ps1Net) paints it lit, in flat
 * outlined bands at one size everywhere, then puts it through the world's
 * 4x4 ordered dither. The film look's Voronoi water was retired on 2026-11-12.
 */

// PLANET_ON: drawn round the island prototype's planet (PlanetCurve.ts).
const VERTEX = /* glsl */ `
  varying vec2 vWorldPos;
  uniform float uTime;
  // Per vertex (FestivalWorld seaAroundIslandWaves): how tall the waves stand
  // here, the water's depth, and how open it is (0 in the harbour).
  attribute vec3 aSea;
  // 1 in the world; 0 on the sign-in globe and the flight down, whose coarser
  // seabed rose through the troughs (and the rise does not show from there).
  uniform float uWaveLift;
  varying vec3 vSeaPos;
  varying vec3 vSea;
  ${PS1_WAVES_GLSL}
  #ifdef PLANET_ON
  ${PLANET_GLSL}
  #endif
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xz;
    // Real waves (the owner, 2026-11-11: "more 3D... depth and volume").
    // The open sea's swell, and the rollers coming in over the shallows.
    worldPosition.y += (ps1Waves(worldPosition.xz, uTime, 1.0) * aSea.x * ${PS1_WAVE_HEIGHT.toFixed(2)}
      + ps1Rollers(aSea.y, uTime) * ps1RollerReach(aSea.y, aSea.z) * ${PS1_ROLLER_HEIGHT.toFixed(2)}) * uWaveLift;
    vSea = aSea;
    vSeaPos = worldPosition.xyz;
    #ifdef PLANET_ON
    worldPosition.xyz = planetBend(worldPosition.xyz);
    #endif
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeepColor;
  uniform vec3 uMidColor;
  uniform vec3 uHighlight;
  uniform float uOpacity;
  uniform float uDeepOpacity;
  uniform vec2 uCamXZ;
  uniform float uFadeDistance;
  uniform vec3 uGlintColor;
  uniform vec2 uGlintOrigin;
  uniform float uGlintStrength;
  uniform vec3 uRipple;
  uniform float uNetGlow;
  // How many times larger the caustic net is drawn: 1 in the world, more on
  // the sign-in globe so it reads from orbit (2026-11-11).
  uniform float uNetScale;
  // Where the harbour's posts stand (x, z, radius; radius 0 for none) and the
  // ferry's hull (centre, half width, half length), for the wash round them.
  uniform vec3 uWashPosts[16];
  uniform vec4 uWashBoat;

  varying vec2 vWorldPos;
  varying vec3 vSeaPos;
  varying vec3 vSea;

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }

  // Value noise: random stretches, so the sea's busy and calm patches never
  // line up into the bands that sines make (the owner, 2026-11-10).
  float seaNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i).x, hash2(i + vec2(1.0, 0.0)).x, f.x), mix(hash2(i + vec2(0.0, 1.0)).x, hash2(i + vec2(1.0, 1.0)).x, f.x), f.y);
  }

  ${PS1_WAVES_GLSL}
  // The sea as a Japanese woodblock print drawn in chunky pixels (the owner,
  // 2026-11-11, after a Great Wave print and its 8-bit version), with real
  // depth and volume, and (2026-11-12) the logic of a real sea: one swell
  // rolling in, rollers lying along every beach, a still harbour, foam only
  // on the biggest crests (Ps1Waves.ts). Everything is read off those waves:
  // their slope lights each one, sunlit faces pale and backs and troughs in
  // indigo shadow, in flat bands outlined in dark ink; contour lines follow
  // their shapes, as the print's carved lines do.
  //
  // Worked out on a grid of SEA_PIXEL texels, so it reads as pixel art up
  // close. It is drawn at one size everywhere, the sign-in globe and the
  // flight down included; from far off the small chop, the lines and the
  // pixel outlines fade, so only the long swell shows (no switching sizes,
  // which dissolved one pattern into another: the owner, 2026-11-12).
  const float SEA_PIXEL = .25;
  const vec3 SEA_SUN = vec3(.38, .82, -.43);
  // Light on the wave's face: .5 on level water, more facing the sun. From
  // high above light barely changes across a slope, so there the slopes are
  // lit more steeply.
  float seaShade(float h, float hx, float hz) {
    float steep = 3.0 + 4.0 * smoothstep(30.0, 140.0, cameraPosition.y);
    vec3 n = normalize(vec3(-(hx - h) / SEA_PIXEL * steep, 1.0, -(hz - h) / SEA_PIXEL * steep));
    return clamp(.5 + (dot(n, normalize(SEA_SUN)) - .82) * 1.9, 0.0, 1.0);
  }
  // 0 trough or shadowed back, 1 slope, 2 sunlit shoulder, 3 a whitecap.
  float seaBand(float h, float shade, float amp, vec2 q) {
    float claws = (seaNoise(q * .55) - .5) * .12 + (seaNoise(q * 1.7 + 3.1) - .5) * .07;
    // Whitecaps on the swell's higher crests (the owner, 2026-11-12: "I want
    // more white foams").
    if (amp > .4 && h > .6 + claws) return 3.0;
    float tone = .38 * shade + .62 * (h * .35 + .5);
    return tone < .37 ? 0.0 : tone < .55 ? 1.0 : 2.0;
  }
  vec4 ps1Net(vec2 netPos, float amp, float depth, float open) {
    vec2 q = (floor(netPos / SEA_PIXEL) + .5) * SEA_PIXEL;
    // How many screen pixels a world unit covers: fine detail fades out as
    // it shrinks, rather than shimmering in the distance.
    float unitPx = 1.0 / max(max(fwidth(netPos.x), fwidth(netPos.y)), 1e-4);
    float detail = smoothstep(4.0, 9.6, unitPx), chop = smoothstep(.3, .8, unitPx);
    vec2 qx = q + vec2(SEA_PIXEL, 0.0), qy = q + vec2(0.0, SEA_PIXEL), qxy = q + vec2(SEA_PIXEL);
    float h = ps1Waves(q, uTime, chop) * amp, hx = ps1Waves(qx, uTime, chop) * amp, hy = ps1Waves(qy, uTime, chop) * amp, hxy = ps1Waves(qxy, uTime, chop) * amp;
    float shade = seaShade(h, hx, hy);
    float band = seaBand(h, shade, amp, q);
    float bandX = seaBand(hx, seaShade(hx, hxy, hy), amp, qx), bandY = seaBand(hy, seaShade(hy, hxy, hx), amp, qy);
    // The pale band is a lighter blue of the same water, not grey.
    vec3 shoulder = uMidColor + (uMidColor - uDeepColor) * .9, ink = uDeepColor * .38;
    vec3 color = band < .5 ? uDeepColor : band < 1.5 ? uMidColor : band < 2.5 ? shoulder : uHighlight;
    // A little light within each flat band, so the faces still turn.
    color *= .92 + .16 * shade;
    // Carved lines along the swell's shapes: contours of its height, broken
    // into strokes, on the troughs and slopes.
    float level = floor(h * 3.0 + 9.5);
    float contour = step(.5, abs(level - floor(hx * 3.0 + 9.5)) + abs(level - floor(hy * 3.0 + 9.5)));
    float stroke = step(.38, seaNoise(q * .35 + level * 4.1));
    float lineOn = contour * stroke * step(band, 1.5) * step(.3, amp) * detail;
    color = mix(color, band < .5 ? uMidColor : shoulder, lineOn);
    // Spray: loose cream dots flung off a whitecap.
    float spray = step(.9, hash2(q * 1.31).x) * step(.42, h) * step(band, 2.5) * step(.4, amp) * detail;
    color = mix(color, uHighlight, spray);
    // Dark ink outlines where a band ends, one texel wide.
    float edge = step(.5, abs(band - bandX) + abs(band - bandY)) * detail;
    color = mix(color, ink, edge * (band > 2.5 || bandX > 2.5 || bandY > 2.5 ? .95 : .7));
    float foam = step(2.5, band);
    // Rollers over the shelving sand: their crests lie along the depth
    // contours, parallel to the beach, and march in to break (ps1Rollers).
    // A lighter face, a ragged cream crest, an ink line ahead of it, and a
    // pale fringe at the water's edge. Only where the seabed shelves: over a
    // flat bottom every point was at the same stage of the roll, and the
    // whole stretch turned to foam at once (2026-11-12).
    float shelf = length(vec2(dFdx(depth), dFdy(depth))) / max(length(vec2(dFdx(vWorldPos.x), dFdy(vWorldPos.x))) + length(vec2(dFdx(vWorldPos.y), dFdy(vWorldPos.y))), 1e-4);
    float r = depth / 3.0 + uTime * .26, f = fract(r);
    float rag = (seaNoise(q * .8 + floor(r) * 5.7) - .5) * .1;
    // Under four deep only: the harbour channel's cut walls, four deep and
    // steep, drew two straight surf lines out to sea (2026-11-12).
    float reach = (1.0 - smoothstep(2.4, 3.8, depth)) * open * smoothstep(.04, .12, shelf);
    float face = step(.62 + rag, f) * (1.0 - step(.8 + rag, f)) * reach;
    float crestLine = step(.8 + rag, f) * (1.0 - step(.9 + rag * .5, f)) * reach;
    float lip = step(.585 + rag, f) * (1.0 - step(.62 + rag, f)) * reach * detail;
    float fringe = step(depth, .45 + rag * 2.0) * open;
    color = mix(color, shoulder, face * .85);
    color = mix(color, ink, lip * .6);
    float surf = min(crestLine + fringe, 1.0);
    color = mix(color, uHighlight, surf);
    foam = max(foam, surf);
    // The walled harbour: still water, with a few small ripple lines.
    float still = 1.0 - smoothstep(.2, .6, open);
    if (still > 0.0) {
      // Short curved ripples, bent by noise and broken into dashes, drifting.
      vec2 bent = q + 5.0 * (vec2(seaNoise(q * .09 + vec2(2.1, 7.3)), seaNoise(q * .09 + vec2(8.4, 1.2))) - .5);
      float r1 = sin(dot(bent, vec2(.6, .8)) * 1.3 - uTime * .9);
      float ripple = step(.95, r1) * step(.62, seaNoise(q * .42 + vec2(uTime * .12, 0.0))) * still * detail;
      color = mix(color, shoulder, ripple * .8);
      lineOn = max(lineOn, ripple);
      // A little wash round the pier's posts and the ferry's hull.
      float wash = 0.0;
      for (int i = 0; i < 16; i++) {
        vec3 post = uWashPosts[i];
        if (post.z <= 0.0) continue;
        float d = length(q - post.xy) - post.z;
        wash = max(wash, step(.05, d) * (1.0 - step(.22 + .08 * sin(uTime * 2.3 + float(i) * 1.7), d)));
      }
      vec2 hull = (q - uWashBoat.xy) / max(uWashBoat.zw, vec2(.01));
      float hd = (length(hull) - 1.0) * min(uWashBoat.z, uWashBoat.w);
      if (uWashBoat.z > 0.0) wash = max(wash, step(.08, hd) * (1.0 - step(.3 + .1 * sin(uTime * 1.7 + atan(hull.y, hull.x) * 3.0), hd)) * step(.35, seaNoise(q * 1.2 + uTime * .3)));
      color = mix(color, uHighlight, wash * detail);
      foam = max(foam, wash * detail);
    }
    // Under the moon the foam and spray give a little light of their own.
    color += uHighlight * uNetGlow * (foam * .1 + spray * .2 + lineOn * .05);
    return vec4(color, max(max(foam, lineOn), .35));
  }

  void main() {
    // The woodblock sea (ps1Net): one swell, rollers and a still harbour,
    // lit, in flat outlined bands, in chunky pixels, at one size everywhere.
    vec4 net = ps1Net(vWorldPos, vSea.x, vSea.y, vSea.z);
    vec3 color = net.rgb;
    float t = net.a;

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
    // In display colour, as the uniform colours were chosen.
    gl_FragColor = linearToOutputTexel(gl_FragColor);
    // The same 4x4 ordered dither as every other surface in the PS1 look
    // (WorldFilmGrain), which this hand-written shader otherwise skips; the
    // sea's is coarser, for the banded gradients of pixel-art water.
    vec2 ps1Cell = mod(floor(gl_FragCoord.xy), 4.0);
    vec2 ps1Low = mod(ps1Cell, 2.0), ps1High = floor(ps1Cell / 2.0);
    float ps1Threshold = ((2.0 * ps1Low.x + 3.0 * ps1Low.y - 4.0 * ps1Low.x * ps1Low.y) * 4.0
      + (2.0 * ps1High.x + 3.0 * ps1High.y - 4.0 * ps1High.x * ps1High.y) + 0.5) / 16.0;
    const float ps1Levels = 14.0;
    gl_FragColor.rgb = clamp(floor(gl_FragColor.rgb * ps1Levels + ps1Threshold) / ps1Levels, 0.0, 1.0);
  }
`;

export interface StylizedWaterTint {
  deep: THREE.ColorRepresentation;
  mid: THREE.ColorRepresentation;
  highlight: THREE.ColorRepresentation;
  glint: THREE.ColorRepresentation;
  glintStrength: number;
  /** How much the PS1 caustic net glows by itself (night), 0 to 1. */
  netGlow?: number;
}

export const createStylizedWaterMaterial = (): THREE.ShaderMaterial => {
  return new THREE.ShaderMaterial({
  vertexShader: VERTEX,
  fragmentShader: FRAGMENT,
  transparent: true,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uDeepColor: { value: new THREE.Color(0x172d5a) },
    uMidColor: { value: new THREE.Color(0x365f91) },
    uHighlight: { value: new THREE.Color(0xd8f2f4) },
    uOpacity: { value: 0.94 },
    uDeepOpacity: { value: 0.72 },
    uCamXZ: { value: new THREE.Vector2() },
    uFadeDistance: { value: 190 },
    uGlintColor: { value: new THREE.Color(0xffe6b8) },
    uGlintOrigin: { value: new THREE.Vector2(0, -70) },
    uGlintStrength: { value: 0 },
    uRipple: { value: new THREE.Vector3(0, 0, 0) },
    uNetGlow: { value: 0 },
    uNetScale: { value: 1 },
    uWashPosts: { value: Array.from({ length: 16 }, () => new THREE.Vector3()) },
    uWashBoat: { value: new THREE.Vector4() },
    uWaveLift: { value: 1 },
  },
  });
};

/** Applies a time-of-day palette without rebuilding the material. */
export const tintStylizedWater = (material: THREE.ShaderMaterial, tint: StylizedWaterTint): void => {
  (material.uniforms.uDeepColor.value as THREE.Color).set(tint.deep);
  (material.uniforms.uMidColor.value as THREE.Color).set(tint.mid);
  (material.uniforms.uHighlight.value as THREE.Color).set(tint.highlight);
  (material.uniforms.uGlintColor.value as THREE.Color).set(tint.glint);
  material.uniforms.uGlintStrength.value = tint.glintStrength;
  material.uniforms.uNetGlow.value = tint.netGlow ?? 0;
};
