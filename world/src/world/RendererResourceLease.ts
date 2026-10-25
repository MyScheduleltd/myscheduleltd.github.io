import type * as THREE from 'three';
import { PreviewResourceLease } from './PreviewResourceLease';

/** A renderer owns GPU allocations even when its source art is shared. Three's
 * renderer.dispose() leaves geometry/texture callbacks on those source objects.
 * Track new registrations during synchronous driver work only: no scene scan
 * or permanent change to Three's event dispatcher is needed for each frame. */
export class RendererResourceLease {
  private readonly resources: PreviewResourceLease;
  private readonly restore: Array<() => void> = [];
  private refreshPending = false;
  private refreshing = false;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.resources = PreviewResourceLease.forRenderer(renderer);
    const originalRender = renderer.render;
    const contextRestored = () => { this.refreshPending = true; };
    renderer.domElement.addEventListener('webglcontextrestored', contextRestored);
    this.restore.push(() => renderer.domElement.removeEventListener('webglcontextrestored', contextRestored));
    const refresh = (): void => {
      if (!this.refreshPending || this.refreshing || this.disposed) return;
      this.refreshing = true;
      // Three's own restore handler ran first. Learn its new callbacks before
      // the next driver work, bypassing this render wrapper for the probe.
      const render = renderer.render;
      renderer.render = originalRender;
      try { this.resources.includeRenderer(renderer); this.refreshPending = false; }
      finally { renderer.render = render; this.refreshing = false; }
    };
    const wrap = <K extends 'render' | 'compile' | 'initTexture'>(name: K): void => {
      const original = renderer[name];
      const wrapped = ((...args: Parameters<THREE.WebGLRenderer[K]>) => {
        refresh();
        return this.resources.capture(() => Reflect.apply(original, renderer, args));
      }) as THREE.WebGLRenderer[K];
      renderer[name] = wrapped;
      this.restore.push(() => { if (renderer[name] === wrapped) renderer[name] = original; });
    };
    wrap('render'); wrap('compile'); wrap('initTexture');
  }

  /** Before renderer.dispose, release its exact callbacks and GPU payload.
   * Other renderers and the shared CPU art remain ready for the next entry. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.refreshPending = false;
    for (const restore of this.restore) restore();
    this.restore.length = 0;
    this.resources.release();
  }
}
