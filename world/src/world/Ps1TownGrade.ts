import * as THREE from 'three';

/**
 * The town's colour grade in the PS1 look (the owner, 2026-11-11): "the
 * current color palette for the map/town is a bit too dark/dead. I want it to
 * be more lively and bright tone, and japanese style aesthetic driven", with
 * a sunny anime Japanese street as the lead reference: clean whites, pale
 * concrete, soft blue shadows, warm sun, small bright accents.
 *
 * The restyle's first palette was deliberately aged (soot-darkened brick,
 * grey-green tile, ink). This lifts every lit town surface once, after the
 * palette pass: darks rise to a soft blue-grey rather than near-black, greys
 * and creams warm towards sunlit render, colours keep their hue and gain a
 * little life. Pure white stays white, so tinted pictures are untouched.
 *
 * Left exactly as they are: people (players, residents, visitors), anything
 * drawn from a picture (posters, signs, light-box faces, imported props with
 * their own textures), whatever glows, the unlit and shader materials (sky,
 * sea, screens), and the ground, whose grass and sand are vertex colours
 * under a white material (the owner kept the grass green, 2026-11-09).
 */
export const PS1_TOWN_GRADE = Object.freeze({
  /** Where black lands: a soft shadow, not a hole. */
  floor: .32,
  /** Below 1, mid-tones rise faster than the lights. */
  gamma: .84,
  /** A grey (saturation under this) is re-tinted by how light it is. */
  neutral: .14,
  /** Lights warm towards sunlit render… */
  warm: { hue: .105, saturation: .2 },
  /** …and shadows cool towards the anime soft blue. */
  cool: { hue: .6, saturation: .14 },
  /** Where a grey counts as light. */
  split: .62,
  /** Colours gain this much saturation, up to the cap. */
  vivid: 1.12,
  cap: .68,
  /**
   * Reds stay red (the owner, 2026-11-11: "the red carpet should stay red").
   * Lifted like everything else they went salmon pink, and even unlifted the
   * brighter sun and fill pushed them orange; so a saturated red is made a
   * touch deeper and richer instead, to read as the red it was.
   */
  red: { hue: .045, saturation: .35, depth: .86, richer: 1.12 },
});

export interface Ps1TownGradeReport { graded: number; skipped: number }

const hsl = { h: 0, s: 0, l: 0 };

/** The grade for one base colour (sRGB). */
export function ps1TownColour(source: THREE.Color, out = new THREE.Color()): THREE.Color {
  const g = PS1_TOWN_GRADE;
  source.getHSL(hsl, THREE.SRGBColorSpace);
  let { h, s } = hsl;
  if ((h < g.red.hue || h > 1 - g.red.hue) && s > g.red.saturation) {
    return out.setHSL(h, Math.min(.85, s * g.red.richer), hsl.l * g.red.depth, THREE.SRGBColorSpace);
  }
  const l = g.floor + (1 - g.floor) * Math.pow(hsl.l, g.gamma);
  if (s < g.neutral && hsl.l < .985) {
    const tint = l > g.split ? g.warm : g.cool;
    // A grey keeps a trace of its own cast, mostly the new one.
    h = tint.hue; s = Math.max(s * .5, tint.saturation * Math.min(1, (1 - Math.abs(l - .5) * 1.2)));
  } else {
    s = Math.min(g.cap, s * g.vivid);
  }
  return out.setHSL(h, s, Math.min(l, hsl.l > .985 ? hsl.l : .96), THREE.SRGBColorSpace);
}

function isPicture(texture: THREE.Texture | null | undefined): boolean {
  if (!texture) return false;
  // The PS1 surface tiles are drawn data; pictures are images and canvases.
  return !(texture as THREE.DataTexture).isDataTexture;
}

function glows(material: THREE.MeshStandardMaterial): boolean {
  const e = material.emissive;
  return !!e && material.emissiveIntensity > 0 && Math.max(e.r, e.g, e.b) > .04;
}

/** Grades every lit town material under `root` once. Safe to call again for late arrivals. */
export function applyPs1TownGrade(root: THREE.Object3D): Ps1TownGradeReport {
  const report: Ps1TownGradeReport = { graded: 0, skipped: 0 };
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (let parent: THREE.Object3D | null = mesh; parent; parent = parent.parent) {
      const data = parent.userData;
      // People, and the drive-in's cars, whose paint is the owner's restored original.
      if (data.coastalCharacter !== undefined || data.dynamic || data.environmentExclude || data.ps1TownKeep || data.driveInPaint !== undefined || parent.name === 'character-body') return;
    }
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const lit = material as THREE.MeshStandardMaterial;
      if (!lit || lit.userData.ps1TownGraded) continue;
      lit.userData.ps1TownGraded = true;
      const kind = lit as unknown as { isMeshStandardMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean };
      if (!(kind.isMeshStandardMaterial || kind.isMeshLambertMaterial || kind.isMeshPhongMaterial) || !lit.color
        || lit.vertexColors || isPicture(lit.map) || glows(lit) || (lit.transparent && lit.opacity < .6) || lit.userData.ps1TownKeep) {
        report.skipped++;
        continue;
      }
      ps1TownColour(lit.color, lit.color);
      report.graded++;
    }
  });
  return report;
}
