import * as THREE from 'three';

type Disposable = THREE.BufferGeometry | THREE.Material | THREE.Texture;
type DisposeListener = (event: { type: 'dispose'; target: unknown }) => void;
type ResourceListeners = Disposable & { _listeners?: { dispose?: DisposeListener[] } };
const listeners = (resource: Disposable): DisposeListener[] => [...((resource as ResourceListeners)._listeners?.dispose ?? [])];

/**
 * Three 0.179 keeps renderer-specific dispose callbacks on shared resources,
 * even after renderer.dispose(). A short-lived entrance renderer must remove
 * only its own callbacks, preserving the game renderer's GPU buffers and the
 * owner's custom listeners. Losing the old context then frees only its VRAM.
 */
export class PreviewResourceLease {
  private readonly owned: Set<DisposeListener>;
  private readonly registrations = new Map<Disposable, Set<DisposeListener>>();

  constructor(owners: readonly DisposeListener[]) { this.owned = new Set(owners); }

  static forRenderer(renderer: THREE.WebGLRenderer): PreviewResourceLease {
    // Private, unshared resources reveal callback identities without relying
    // on minified function names or inspecting another renderer's internals.
    const geometry = new THREE.PlaneGeometry(1, 1);
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
    camera.position.z = 2;
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    try {
      renderer.setViewport(0, 0, 1, 1);
      renderer.setScissor(0, 0, 1, 1);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
      return new PreviewResourceLease([...listeners(geometry), ...listeners(material), ...listeners(texture)]);
    } finally {
      geometry.dispose(); material.dispose(); texture.dispose();
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
    }
  }

  /** renderer.render() is synchronous; the original method is always restored. */
  capture(render: () => void): void {
    const prototype = THREE.EventDispatcher.prototype;
    const original = prototype.addEventListener;
    const registrations = this.registrations, owned = this.owned;
    prototype.addEventListener = function (type, listener): void {
      Reflect.apply(original, this, [type, listener]);
      if (type !== 'dispose' || !owned.has(listener as DisposeListener)) return;
      const resource = this as unknown as Disposable;
      const recorded = registrations.get(resource) ?? new Set<DisposeListener>();
      recorded.add(listener as DisposeListener);
      registrations.set(resource, recorded);
    };
    try { render(); }
    finally { prototype.addEventListener = original; }
  }

  dispose(): void {
    for (const [resource, recorded] of this.registrations) {
      for (const listener of recorded) resource.removeEventListener('dispose', listener);
    }
    this.registrations.clear();
    this.owned.clear();
  }
}
