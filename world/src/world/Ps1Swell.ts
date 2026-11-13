/**
 * The PS1 sea's swell, shared by the cel-shaded sea (StylizedWater) and the
 * light setting's sea (LiteSea) so both roll alike. No imports, so Node tests
 * that load LiteSea directly can load it too.
 */
/** Well below the dock deck, 1.35 over the sea. */
export const PS1_SWELL_HEIGHT = .55;
export const PS1_SWELL_GLSL = /* glsl */ `
  // The PS1 sea's swell (the owner, 2026-11-09: the pattern should look
  // different, with volume): three slow crossing waves, the longest about 45
  // units, the shortest about 23, so the 10-unit mesh rolls in big facets.
  float ps1Swell(vec2 p, float t) {
    return (sin(dot(p, vec2(.139, .041)) + t * .9)
      + sin(dot(p, vec2(-.052, .118)) + t * .7) * .8
      + sin(dot(p, vec2(.21, -.17)) + t * 1.3) * .45) / 2.25;
  }
`;

