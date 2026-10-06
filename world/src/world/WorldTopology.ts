/** The approved island world is shared by the two public festival channels. */
export function worldTopologyFor(hostname: string, pathname: string, search: string): { island: boolean; radius: number | null } {
  const params = new URLSearchParams(search);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const festival = ['myscheduleltd.com', 'www.myscheduleltd.com'].includes(hostname)
    && ['/beta/', '/beta/index.html', '/beta/ps2/', '/beta/ps2/index.html'].includes(pathname);
  const requested = params.get('island');
  const enabled = festival || (local && (params.get('era') === 'ps2' || requested !== null));
  if (!enabled || requested === 'off') return { island: false, radius: null };
  const radius = Number(requested);
  return { island: true, radius: requested === 'flat' ? null : radius > 20 ? radius : 320 };
}

/** Configure terrain and shader curvature before world/avatars are constructed. */
export async function configureWorldTopology(hostname: string, pathname: string, search: string): Promise<void> {
  const topology = worldTopologyFor(hostname, pathname, search);
  if (!topology.island) return;
  const [{ installPlanetCurve }, { setIslandTerrain }] = await Promise.all([
    import('./PlanetCurve'), import('./CoastalTerrain'),
  ]);
  setIslandTerrain(true);
  if (topology.radius !== null) installPlanetCurve(topology.radius);
}
