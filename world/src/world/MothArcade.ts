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
  private locked = false;
  private lockLanguage: 'en' | 'zh-TW' = 'zh-TW';
  private authoredScreenMaterial?: THREE.Material | THREE.Material[];
  private authoredScreenUv?: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  private lockMaterial?: THREE.MeshBasicMaterial;
  private lockTexture?: THREE.CanvasTexture;

  constructor(x: number, y: number, z: number) {
    this.root.name = 'M.O.T.H arcade cabinet';
    this.root.userData.dynamic = true;
    this.root.position.set(x, y, z);
    // The generated cabinet faces +Z; the road is west of the venue.
    this.root.rotation.y = -Math.PI / 2;
    this.ready = this.load();
  }

  /** Keep a release notice on the physical CRT, including while its GLB is loading. */
  setLocked(locked: boolean, language: 'en' | 'zh-TW' = 'zh-TW'): void {
    if (this.disposed || (this.locked === locked && this.lockLanguage === language)) return;
    this.locked = locked; this.lockLanguage = language;
    this.updateLockScreen();
  }

  private updateLockScreen(): void {
    if (!this.screen || !this.authoredScreenMaterial) return;
    this.releaseLockScreen();
    if (!this.locked) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 856;
    const context = canvas.getContext('2d');
    if (!context) return;
    paintArcadeLock(context, this.lockLanguage, canvas.width, canvas.height);
    this.lockTexture = new THREE.CanvasTexture(canvas);
    this.lockTexture.colorSpace = THREE.SRGBColorSpace;
    this.lockMaterial = new THREE.MeshBasicMaterial({ map: this.lockTexture, toneMapped: false });
    this.lockMaterial.name = 'M.O.T.H release lock notice';
    this.lockMaterial.userData.preserveAuthoredSurface = true;
    // The authored, formerly black CRT has no UVs. Project its local XY plane
    // so the notice reads upright from the same front face as the live game.
    const geometry = this.screen.geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!, size = box.getSize(new THREE.Vector3());
    const positions = geometry.getAttribute('position');
    const uv = new Float32Array(positions.count * 2);
    for (let i = 0; i < positions.count; i++) {
      uv[i * 2] = (positions.getX(i) - box.min.x) / size.x;
      uv[i * 2 + 1] = (positions.getY(i) - box.min.y) / size.y;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.screen.material = this.lockMaterial;
  }

  private releaseLockScreen(): void {
    if (this.screen && this.authoredScreenMaterial) {
      this.screen.material = this.authoredScreenMaterial;
      if (this.authoredScreenUv) this.screen.geometry.setAttribute('uv', this.authoredScreenUv);
      else this.screen.geometry.deleteAttribute('uv');
    }
    this.lockMaterial?.dispose(); this.lockTexture?.dispose();
    this.lockMaterial = undefined; this.lockTexture = undefined;
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
          this.authoredScreenMaterial = node.material;
          this.authoredScreenUv = node.geometry.getAttribute('uv');
          // The live DOM picture supplies this surface. The foreground pass
          // still draws the physical bezel, controls and anything in front.
          node.layers.disable(1);
        }
      });
      if (!this.screen) throw new Error('Arcade cabinet is missing its authored screen surface');
      this.updateLockScreen();
      this.root.add(model); this.root.updateMatrixWorld(true); this.status = 'ready';
    } catch (error) {
      this.status = 'failed';
      console.warn('M.O.T.H cabinet could not load', error);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.releaseLockScreen();
    disposeCabinetModel(this.root); this.root.removeFromParent();
  }
}

function paintArcadeLock(context: CanvasRenderingContext2D, language: 'en' | 'zh-TW', width: number, height: number): void {
  const orange = '#ff5c21', cream = '#f1e9d5';
  context.fillStyle = '#15191c'; context.fillRect(0, 0, width, height);
  context.strokeStyle = orange; context.lineWidth = 10;
  context.strokeRect(24, 24, width - 48, height - 48);
  context.strokeStyle = '#66503b'; context.lineWidth = 2;
  context.strokeRect(42, 42, width - 84, height - 84);
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillStyle = cream; context.font = 'bold 76px Georgia, serif';
  context.fillText('M.O.T.H', width / 2, 130);
  context.fillStyle = orange; context.font = 'bold 23px sans-serif';
  context.fillText('MASTER OF THE HOUSE', width / 2, 192);
  // A simple padlock stays legible at world distance and needs no extra asset.
  context.strokeStyle = orange; context.lineWidth = 12;
  context.beginPath(); context.moveTo(width / 2 - 48, 346); context.lineTo(width / 2 - 48, 312);
  context.arc(width / 2, 312, 48, Math.PI, 0);
  context.lineTo(width / 2 + 48, 346); context.stroke();
  context.strokeRect(width / 2 - 72, 338, 144, 106);
  context.fillStyle = cream; context.font = 'bold 58px sans-serif';
  context.fillText(language === 'en' ? 'CURRENTLY LOCKED' : '遊戲 COMING SOON', width / 2, 516);
  context.fillStyle = orange; context.font = 'bold 51px sans-serif';
  context.fillText('2026.11.02  00:00', width / 2, 618);
  context.fillStyle = cream; context.font = '28px sans-serif';
  context.fillText(language === 'en' ? 'TAIWAN TIME (UTC+8)' : '台灣時間（UTC+8）', width / 2, 680);
  // Keep the lower screen band clear for the in-world Exit control.

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

export interface ArcadeScreenPoint { x: number; y: number }

/** Map one flat DOM rectangle onto the physical screen's TL, TR, BR, BL corners. */
export function arcadeQuadTransform(points: readonly ArcadeScreenPoint[], width: number, height: number): number[] | undefined {
  if (points.length !== 4 || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
    || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return undefined;
  const [p0, p1, p2, p3] = points;
  const edgeScale = Math.max(...points.map((p, i) => {
    const next = points[(i + 1) % 4]; return (next.x - p.x) ** 2 + (next.y - p.y) ** 2;
  }));
  if (edgeScale < 1e-8) return undefined;
  // A collapsed or folded quad has no safe, clickable projection. A convex
  // screen may face either direction, but all four turns must agree.
  const turns = points.map((p, i) => {
    const next = points[(i + 1) % 4], after = points[(i + 2) % 4];
    return (next.x - p.x) * (after.y - next.y) - (next.y - p.y) * (after.x - next.x);
  });
  if (turns.some(turn => Math.abs(turn) < edgeScale * 1e-8 || Math.sign(turn) !== Math.sign(turns[0]))) return undefined;
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y;
  const dx3 = p0.x - p1.x + p2.x - p3.x, dy3 = p0.y - p1.y + p2.y - p3.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(determinant) < edgeScale * 1e-8) return undefined;
  const gx = (dx3 * dy2 - dx2 * dy3) / determinant;
  const gy = (dx1 * dy3 - dx3 * dy1) / determinant;
  if ([1 + gx, 1 + gy, 1 + gx + gy].some(w => w <= 1e-8)) return undefined;
  const matrix = [
    (p1.x - p0.x + gx * p1.x) / width, (p1.y - p0.y + gx * p1.y) / width, 0, gx / width,
    (p3.x - p0.x + gy * p3.x) / height, (p3.y - p0.y + gy * p3.y) / height, 0, gy / height,
    0, 0, 1, 0,
    p0.x, p0.y, 0, 1,
  ];
  return matrix.every(Number.isFinite) ? matrix : undefined;
}

/** The physical CRT's frame and projection, without a game, DOM or network. */
export class MothArcadeView {
  readonly frame: ArcadeScreenFrame;
  protected disposed = false;
  protected screenProjection?: number[];

  constructor(screen: THREE.Mesh) { this.frame = arcadeScreenFrame(screen); }

  /** Position an overlay control within the same projected monitor surface. */
  projectedScreenPoint(u: number, v: number): ArcadeScreenPoint | undefined {
    const matrix = this.screenProjection;
    if (!matrix || !Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) return undefined;
    const x = u * 1024, y = v * Math.round(1024 * this.frame.height / this.frame.width);
    const w = matrix[3] * x + matrix[7] * y + matrix[15];
    if (w <= 1e-8) return undefined;
    const point = { x: (matrix[0] * x + matrix[4] * y + matrix[12]) / w, y: (matrix[1] * x + matrix[5] * y + matrix[13]) / w };
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : undefined;
  }

  scissor(camera: THREE.Camera, width: number, height: number): { x: number; y: number; width: number; height: number } | undefined {
    this.screenProjection = undefined;
    if (this.disposed || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.frame.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.frame.quaternion);
    const points = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) => {
      const point = this.frame.centre.clone().addScaledVector(right, x * this.frame.width / 2).addScaledVector(up, y * this.frame.height / 2);
      if (PLANET.on) planetBendPoint(point, point);
      return point.project(camera);
    });
    if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z) || p.z < -1 || p.z > 1)) return undefined;
    const corners = points.map(p => ({ x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 }));
    const projection = arcadeQuadTransform(corners, 1024, Math.round(1024 * this.frame.height / this.frame.width));
    if (!projection) return undefined;
    const x = Math.max(0, Math.floor(Math.min(...points.map(p => (p.x + 1) * width / 2))));
    const y = Math.max(0, Math.floor(Math.min(...points.map(p => (p.y + 1) * height / 2))));
    const xmax = Math.min(width, Math.ceil(Math.max(...points.map(p => (p.x + 1) * width / 2))));
    const ymax = Math.min(height, Math.ceil(Math.max(...points.map(p => (p.y + 1) * height / 2))));
    if (xmax <= x || ymax <= y) return undefined;
    this.screenProjection = projection;
    return { x, y, width: xmax - x, height: ymax - y };
  }


  dispose(): void {
    this.disposed = true;
    this.screenProjection = undefined;
  }
}

/** One live iframe, mounted exactly on the generated cabinet's screen. */
export class MothArcadeSession extends MothArcadeView {
  readonly object: CSS3DObject;
  readonly iframe: HTMLIFrameElement;
  readonly origin: string;
  private readonly exit: () => void;

  constructor(screen: THREE.Mesh, url: string, exit: () => void) {
    super(screen); this.exit = exit; this.origin = new URL(url).origin;
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
    // Use one directly projected DOM element: nested CSS3DRenderer perspective
    // stacks can lose iframe hit tests in WebKit. The camera may stay level
    // while this element follows the physical monitor's slight backward tilt.
    this.object.element.style.transformOrigin = '0 0';
    this.object.element.style.left = '0'; this.object.element.style.top = '0';
    host.append(this.object.element);
  }

  renderScreen(_box: { x: number; y: number; width: number; height: number }, _viewportHeight: number): void {
    const element = this.object.element;
    const matrix = this.screenProjection;
    if (!matrix) { element.style.visibility = 'hidden'; return; }
    element.style.transform = `matrix3d(${matrix.join(',')})`;
    element.style.visibility = 'visible';
  }

  scissor(camera: THREE.Camera, width: number, height: number): { x: number; y: number; width: number; height: number } | undefined {
    this.object.element.style.visibility = 'hidden';
    return super.scissor(camera, width, height);
  }

  dispose(): void {
    if (this.disposed) return;
    super.dispose();
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
