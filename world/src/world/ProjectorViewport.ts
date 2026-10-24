/** CSS player pixels and their reciprocal world scale. Geometry stays identical. */
export function publicProjectorViewport(mobile: boolean): {
  width: number; height: number; border: number; shadow: number; worldScale: number;
} {
  // A CSS3D transform made the 1600×900 player look small on phones while
  // retaining its full embedded-document/compositor viewport. Half each edge
  // keeps a useful 800×450 player, with one quarter of that surface area.
  const scale = mobile ? .5 : 1;
  return { width: 1600 * scale, height: 900 * scale, border: 22 * scale, shadow: 65 * scale, worldScale: 1 / scale };
}
