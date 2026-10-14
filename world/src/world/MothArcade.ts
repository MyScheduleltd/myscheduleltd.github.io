import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { fetchAsset } from './AssetMirror';
import { ARCADE_HEIGHT, ARCADE_WIDTH, ARCADE_DEPTH } from './ArcadeRules';
import { PLANET, planetBendPoint } from './PlanetCurve';

export class MothArcadeCabinet {
  readonly root = new THREE.Group();
  readonly ready: Promise<void>;
  screen?: THREE.Mesh;
  status: 'loading' | 'ready' | 'failed' = 'loading';
  private disposed = false;
  private floorSupport?: THREE.Mesh;

  constructor(x: number, y: number, z: number) {
    this.root.name = 'M.O.T.H arcade cabinet';
    this.root.userData.dynamic = true;
    this.root.position.set(x, y, z);
    // The generated cabinet faces +Z; the road is west of the venue.
    this.root.rotation.y = -Math.PI / 2;
    this.ready = this.load();
  }

  /** A level cabinet on a shallow, recessed foot that reaches the lowest ground. */
  seatOnGround(surfaceAt: (x: number, z: number) => number): void {
    const heights: number[] = [];
    // The cabinet faces west, so its depth runs along world X. Sample the
    // middle as well as the edges: a paving strip can cross inside the base.
    for (const x of [-1, -.5, 0, .5, 1]) for (const z of [-1, -.5, 0, .5, 1]) {
      heights.push(surfaceAt(this.root.position.x + x * ARCADE_DEPTH / 2, this.root.position.z + z * ARCADE_WIDTH / 2));
    }
    const top = Math.max(...heights), bottom = Math.min(...heights) - .025;
    this.root.position.y = top + .01;
    if (this.floorSupport) {
      this.floorSupport.geometry.dispose();
      (this.floorSupport.material as THREE.Material).dispose();
      this.floorSupport.removeFromParent();
    }
    // This overlaps the model's lower edge by 2 cm. Its lower face is buried
    // beneath the full footprint, so a slope or thin paving seam cannot leave
    // the body apparently suspended above the ground.
    const height = this.root.position.y + .02 - bottom;
    const mat = new THREE.MeshStandardMaterial({ color: 0x17191a, roughness: .88, metalness: 0 });
    mat.userData.preserveAuthoredSurface = true;
    this.floorSupport = new THREE.Mesh(new THREE.BoxGeometry(ARCADE_WIDTH * .995, height, ARCADE_DEPTH * .995), mat);
    this.floorSupport.name = 'Arcade grounded rubber plinth';
    this.floorSupport.position.y = .02 - height / 2;
    this.floorSupport.userData.dynamic = true;
    this.floorSupport.userData.wornNoMasonry = true; this.floorSupport.userData.wornNoGrain = true;
    this.floorSupport.layers.enable(1);
    this.floorSupport.castShadow = true; this.floorSupport.receiveShadow = true;
    this.root.add(this.floorSupport);
    this.root.updateMatrixWorld(true);
  }

  private async load(): Promise<void> {
    try {
      const bytes = await fetchAsset(new URL('../assets/venue-scenery/moth-arcade.glb', import.meta.url).href);
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, '');
      if (this.disposed) { disposeCabinetModel(gltf.scene); return; }
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
      if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('Arcade cabinet has no usable bounds');
      const scale = ARCADE_HEIGHT / size.y;
      model.scale.setScalar(scale);
      model.position.set(-box.getCenter(new THREE.Vector3()).x * scale, -box.min.y * scale, -box.getCenter(new THREE.Vector3()).z * scale);
      model.traverse(node => {
        node.userData.dynamic = true;
        node.layers.enable(1);
        if (!(node instanceof THREE.Mesh)) return;
        node.castShadow = true; node.receiveShadow = true;
        node.userData.wornNoMasonry = true; node.userData.wornNoGrain = true;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          material.userData.preserveAuthoredSurface = true;
        }
        if (node.userData.arcadeScreen) {
          this.screen = node;
          // The live DOM picture supplies this surface. The foreground pass
          // still draws the physical bezel, controls and anything in front.
          node.layers.disable(1);
        }
      });
      if (!this.screen) throw new Error('Arcade cabinet is missing its authored screen surface');
      this.root.add(model); this.root.updateMatrixWorld(true); this.status = 'ready';
    } catch (error) {
      this.status = 'failed';
      console.warn('M.O.T.H cabinet could not load', error);
    }
  }

  dispose(): void { this.disposed = true; disposeCabinetModel(this.root); this.root.removeFromParent(); }
}

function disposeCabinetModel(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
  });
  for (const material of materials) {
    if (material instanceof THREE.MeshStandardMaterial && material.map) textures.add(material.map);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
}

export interface ArcadeScreenFrame {
  centre: THREE.Vector3;
  normal: THREE.Vector3;
  quaternion: THREE.Quaternion;
  width: number;
  height: number;
}

export function arcadeScreenFrame(screen: THREE.Mesh): ArcadeScreenFrame {
  screen.updateWorldMatrix(true, false);
  if (!screen.geometry.boundingBox) screen.geometry.computeBoundingBox();
  const box = screen.geometry.boundingBox!, size = box.getSize(new THREE.Vector3());
  const scale = screen.getWorldScale(new THREE.Vector3()), quaternion = screen.getWorldQuaternion(new THREE.Quaternion());
  return {
    centre: box.getCenter(new THREE.Vector3()).applyMatrix4(screen.matrixWorld),
    normal: new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion), quaternion,
    width: size.x * scale.x, height: size.y * scale.y,
  };
}

/** One live iframe, mounted exactly on the generated cabinet's screen. */
export class MothArcadeSession {
  readonly object: CSS3DObject;
  readonly iframe: HTMLIFrameElement;
  readonly frame: ArcadeScreenFrame;
  readonly origin: string;
  private readonly exit: () => void;
  private disposed = false;

  constructor(screen: THREE.Mesh, url: string, exit: () => void) {
    this.frame = arcadeScreenFrame(screen); this.exit = exit; this.origin = new URL(url).origin;
    const element = document.createElement('div'); element.className = 'moth-arcade-screen';
    const width = 1024, height = Math.round(width * this.frame.height / this.frame.width);
    element.style.width = `${width}px`; element.style.height = `${height}px`;
    element.setAttribute('aria-label', 'M.O.T.H arcade screen');
    this.iframe = document.createElement('iframe');
    this.iframe.title = 'M.O.T.H arcade game'; this.iframe.src = url;
    this.iframe.allow = 'autoplay; fullscreen'; this.iframe.referrerPolicy = 'strict-origin';
    this.iframe.addEventListener('load', this.focusGame);
    element.append(this.iframe);
    this.object = new CSS3DObject(element);
    this.object.position.copy(this.frame.centre).addScaledVector(this.frame.normal, .003);
    this.object.quaternion.copy(this.frame.quaternion); this.object.scale.setScalar(this.frame.width / width);
    window.addEventListener('message', this.message);
    // Keys sent to the iframe never bubble into the parent. A click on the
    // cabinet surround can put focus back in the world, however, so recover
    // that first key as well as moving focus back onto the game.
    window.addEventListener('keydown', this.forwardKey, true);
    window.addEventListener('keyup', this.forwardKey, true);
    window.addEventListener('pointerup', this.restorePointerFocus);
    document.addEventListener('visibilitychange', this.releaseHiddenKeys);
  }

  private readonly message = (event: MessageEvent): void => {
    if (event.source !== this.iframe.contentWindow || event.origin !== this.origin) return;
    if (event.data?.type === 'moth-arcade-exit') this.exit();
    else if (event.data?.type === 'moth-arcade-ready') this.focusGame();
  };

  private readonly focusGame = (): void => {
    if (this.disposed) return;
    this.iframe.focus({ preventScroll: true });
    this.iframe.contentWindow?.focus();
  };

  private readonly restorePointerFocus = (event: PointerEvent): void => {
    // The live public release can be cross-origin and need not implement our
    // optional input bridge. Restore native iframe focus after a surround
    // click, before the next key; leave Exit and other controls accessible.
    if (event.target instanceof Element
      && event.target.closest('button, input, textarea, select, [contenteditable="true"]')) return;
    this.focusGame();
  };

  private readonly forwardKey = (event: KeyboardEvent): void => {
    if (this.disposed || event.altKey || event.ctrlKey || event.metaKey || !arcadeKey(event.code)) return;
    // Keep the Exit button and normal browser keyboard navigation accessible.
    // A release still reaches the game if focus moved while a key was held.
    const interactive = event.target instanceof Element
      && event.target.closest('button, input, textarea, select, [contenteditable="true"]');
    if (interactive && event.type === 'keydown') return;
    if (!interactive) {
      event.preventDefault(); event.stopPropagation();
      this.focusGame();
    }
    this.iframe.contentWindow?.postMessage({
      type: 'moth-arcade-key', eventType: event.type, code: event.code,
      key: event.key, repeat: event.repeat, shiftKey: event.shiftKey,
    }, this.origin);
  };

  private readonly releaseHiddenKeys = (): void => {
    if (document.hidden) this.iframe.contentWindow?.postMessage({ type: 'moth-arcade-release' }, this.origin);
  };

  mount(host: HTMLElement): void {
    // The camera is locked square to the cabinet during play. A flat DOM
    // projection avoids WebKit losing iframe hit tests inside CSS 3D stacks.
    this.object.element.style.transformOrigin = '0 0';
    this.object.element.style.left = '0'; this.object.element.style.top = '0';
    host.append(this.object.element);
  }

  renderScreen(box: { x: number; y: number; width: number; height: number }, viewportHeight: number): void {
    const element = this.object.element;
    const width = 1024, height = Math.round(width * this.frame.height / this.frame.width);
    element.style.transform = `translate(${box.x}px, ${viewportHeight - box.y - box.height}px) scale(${box.width / width}, ${box.height / height})`;
  }

  scissor(camera: THREE.Camera, width: number, height: number): { x: number; y: number; width: number; height: number } | undefined {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.frame.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.frame.quaternion);
    const points = [-1, 1].flatMap(x => [-1, 1].map(y => {
      const point = this.frame.centre.clone().addScaledVector(right, x * this.frame.width / 2).addScaledVector(up, y * this.frame.height / 2);
      if (PLANET.on) planetBendPoint(point, point);
      return point.project(camera);
    }));
    if (points.some(p => p.z < -1 || p.z > 1)) return undefined;
    const x = Math.max(0, Math.floor(Math.min(...points.map(p => (p.x + 1) * width / 2))));
    const y = Math.max(0, Math.floor(Math.min(...points.map(p => (p.y + 1) * height / 2))));
    const xmax = Math.min(width, Math.ceil(Math.max(...points.map(p => (p.x + 1) * width / 2))));
    const ymax = Math.min(height, Math.ceil(Math.max(...points.map(p => (p.y + 1) * height / 2))));
    return xmax > x && ymax > y ? { x, y, width: xmax - x, height: ymax - y } : undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('message', this.message);
    window.removeEventListener('keydown', this.forwardKey, true);
    window.removeEventListener('keyup', this.forwardKey, true);
    window.removeEventListener('pointerup', this.restorePointerFocus);
    document.removeEventListener('visibilitychange', this.releaseHiddenKeys);
    this.iframe.contentWindow?.postMessage({ type: 'moth-arcade-release' }, this.origin);
    this.iframe.removeEventListener('load', this.focusGame);
    this.object.removeFromParent(); this.iframe.src = 'about:blank'; this.object.element.remove();
  }
}

function arcadeKey(code: string): boolean {
  return /^(Arrow(?:Up|Down|Left|Right)|Key[ADWHSMOTRBPC]|Digit[1-9]|Enter|Space)$/.test(code);
}
