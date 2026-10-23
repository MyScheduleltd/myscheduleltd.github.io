import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EnvironmentAssets } from './world/EnvironmentAssets';
import { applyDriveInCarArt, DRIVE_IN_PAINTS, DRIVE_IN_CAR_YAW, DRIVE_IN_CUSHION_TOP, type DriveInCarArtHandle } from './world/DriveInCarArt';
import { applyEnvironmentArt } from './world/EnvironmentArt';
import { prepareEnvironmentReflections, type EnvironmentReflectionHandle } from './world/EnvironmentReflections';
import { createCoastalSedan, CONVERTIBLE } from './world/CoastalGeometry';
import { createCoastalAvatar } from './world/CoastalAvatar';
import { seatCoastalLegs, coastalFootHeights } from './world/CoastalPose';
import { applyDriveInLicensePlates, type DriveInLicensePlateHandle } from './world/DriveInLicensePlates';

if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) throw new Error('Car art review is available on localhost only');

const query = new URLSearchParams(location.search);
const stage = document.getElementById('stage')!;
const status = document.getElementById('status')!;
const metrics = document.getElementById('metrics')!;
const paintStatus = document.getElementById('paint-status')!;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xd8e3e6);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(38, 1, .05, 80);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false; controls.minDistance = 3; controls.maxDistance = 25;
controls.target.set(0, 1, 0);
const sun = new THREE.DirectionalLight(0xffedcf, 2.2); sun.position.set(-5, 8, -5); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -5; sun.shadow.camera.right = 5;
sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5; sun.shadow.camera.near = .5; sun.shadow.camera.far = 25;
sun.shadow.bias = -.0004; sun.shadow.normalBias = .025;
scene.add(sun, new THREE.HemisphereLight(0xe1eff7, 0x9a8d77, 1.7));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: 0xbfc0b3, roughness: .94 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(16, 16, 0x8b969d, 0xaab1ae); grid.position.y = .002; scene.add(grid);

const colors = [
  { name: 'Vermilion', hex: DRIVE_IN_PAINTS[0] }, { name: 'Amber', hex: DRIVE_IN_PAINTS[1] },
  { name: 'Cyan', hex: DRIVE_IN_PAINTS[2] }, { name: 'Cream', hex: DRIVE_IN_PAINTS[3] },
  { name: 'Cobalt', hex: DRIVE_IN_PAINTS[4] }, { name: 'Jade', hex: DRIVE_IN_PAINTS[5] },
] as const;
let colorIndex = Math.max(0, Math.min(colors.length - 1, Number.parseInt(query.get('color') ?? '0', 10) || 0));
const oldCar = createCoastalSedan(colors[colorIndex].hex); scene.add(oldCar);
oldCar.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = !((mesh.material as THREE.Material).transparent); mesh.receiveShadow = true; } });
const originalPaint = (oldCar.getObjectByName('bonnet') as THREE.Mesh).material as THREE.MeshStandardMaterial;
const newCar = new THREE.Group(); newCar.name = 'Car review imported source'; scene.add(newCar);
let source: 'old' | 'new' = query.get('source') === 'old' ? 'old' : 'new';
let loadState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
let loadMessage = '';
let disposed = false;
let reflections: EnvironmentReflectionHandle | undefined;
let carArt: DriveInCarArtHandle | undefined;
let plates: DriveInLicensePlateHandle | undefined;
newCar.userData.driveInSeatNumber=colorIndex+1;
const carKind = 'drive-in-car';
const files = import.meta.glob<string>('./assets/environment/drive-in-car*.glb', { eager: true, query: '?url', import: 'default' });
const mobile = query.get('mobile') === '1';
const filename = mobile && Object.keys(files).some(path => path.endsWith('/drive-in-car-mobile.glb')) ? 'drive-in-car-mobile.glb' : 'drive-in-car.glb';
const modelUrl = query.get('raw') === '1' ? '/art/car-upgrade-20261019/raw/convertible.glb'
  : Object.entries(files).find(([path]) => path.endsWith('/' + filename))?.[1];
const models = new EnvironmentAssets({ assets: modelUrl ? { [carKind]: modelUrl } : {}, mobile });

const guides = new THREE.Group(); guides.name = 'Expected driver seat guides'; guides.userData.environmentExclude = true; scene.add(guides);
function outline(size: [number, number, number], at: [number, number, number], color: number): THREE.LineSegments {
  const shape = new THREE.BoxGeometry(...size), edges = new THREE.EdgesGeometry(shape); shape.dispose();
  const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: .9 }));
  lines.position.set(...at); lines.renderOrder = 10; return lines;
}
const cushionGuide=outline([1.38, .025, 1.15], [CONVERTIBLE.seatX, CONVERTIBLE.cushionTop + .0125, CONVERTIBLE.seatZ], 0x00c7e5);
guides.add(cushionGuide);
guides.add(outline([1.18, .025, 1.55], [CONVERTIBLE.seatX, CONVERTIBLE.footFloor + .0125, -.62], 0xffa027));
guides.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(CONVERTIBLE.seatX, 1.04, CONVERTIBLE.seatZ), 1.5, 0x00c7e5, .24, .14));
const envelope = outline([4.02, 2.05, 5.76], [0, 1.025, 0], 0xd53185); envelope.visible = false; scene.add(envelope);

const occupant = new THREE.Group(); occupant.name = 'Procedural seating fit reference'; occupant.userData.environmentExclude = true;
occupant.userData.wardrobeVariant = 0;
const board = new THREE.Group(); board.visible = false; occupant.add(board);
const rig = createCoastalAvatar(occupant, { skin: '#bb8e69', hair: '#29252a', top: '#d3b356', bottoms: '#334f6a', swimwear: '#335d3f' }, false, board);
occupant.position.set(CONVERTIBLE.seatX, CONVERTIBLE.cushionTop + .23 - 1.1, CONVERTIBLE.seatZ - .3);
occupant.rotation.y = Math.PI;
seatCoastalLegs(rig, () => CONVERTIBLE.footFloor);
rig.leftArm.rotation.set(-.5, 0, -.10); rig.rightArm.rotation.set(-.5, 0, .10);
rig.leftElbow?.rotation.set(-.8, 0, 0); rig.rightElbow?.rotation.set(-.8, 0, 0);
occupant.visible = query.get('occupant') === '1'; scene.add(occupant);

function snapshot() {
  const active = source === 'new' && loadState === 'ready' ? newCar : oldCar;
  const bounds = new THREE.Box3().setFromObject(active);
  let triangles = 0, meshes = 0;
  active.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.isMesh) { meshes++; triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3; } });
  active.updateWorldMatrix(true,true);
  const ray = new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
  const surfaceHeights = Object.fromEntries([['hip',CONVERTIBLE.seatX,CONVERTIBLE.seatZ-.3],['cushion',CONVERTIBLE.seatX,CONVERTIBLE.seatZ],['back',CONVERTIBLE.seatX,.95],['foot',CONVERTIBLE.seatX,-.7]].map(([label,x,z])=>{
    ray.ray.origin.set(x as number,4,z as number);
    return [label,ray.intersectObject(active,true).filter(hit=>(hit.object as THREE.Mesh).isMesh).slice(0,4).map(hit=>Number(hit.point.y.toFixed(4)))];
  }));
  return {
    source, shown: active === newCar ? 'new' : 'old', loadState, color: colors[colorIndex].name,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size: bounds.getSize(new THREE.Vector3()).toArray() },
    triangles, meshes, occupant: occupant.visible, footHeights: coastalFootHeights(rig),
    expected: { ...CONVERTIBLE, supportTop:active===newCar?DRIVE_IN_CUSHION_TOP:CONVERTIBLE.cushionTop, direction: '-Z', exactSize: [4.02, 2.05, 5.76] },
    models: models.snapshot(), reflections: reflections?.report, paint: carArt?.report,plates:plates?.report,surfaceHeights,
  };
}

function render() {
  if (disposed) return;
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  const value = snapshot();
  metrics.textContent = `Shown: ${value.shown} · ${value.triangles.toLocaleString()} triangles · ${value.meshes} meshes\nBounds: ${value.bounds.size.map(n => n.toFixed(3)).join(' × ')} · Procedural soles: ${value.footHeights.map(n => n.toFixed(3)).join(', ')}`;
  document.body.dataset.carReview = JSON.stringify(value);
}

function applyPaint() {
  const color = colors[colorIndex]; originalPaint.color.setHex(color.hex);
  if (loadState === 'ready') {
    reflections?.dispose(); carArt?.dispose();
    newCar.userData.driveInPaint = color.hex;
    carArt = applyDriveInCarArt(newCar);
    plates?.dispose(); newCar.userData.driveInSeatNumber=colorIndex+1;
    plates=applyDriveInLicensePlates(newCar,{skipFallbacks:true});
    reflections = prepareEnvironmentReflections(renderer, newCar, { faceSize: 32, intensity: .6 });
    applyEnvironmentArt(newCar);
  }
  const painted=carArt?.report.materials??0;
  paintStatus.textContent = `${color.name}: original paint updated. ${painted ? `New body paint updated (${painted} material).` : 'New-car paint awaits an explicitly tagged body material.'}`;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-color]')) button.setAttribute('aria-pressed', String(Number(button.dataset.color) === colorIndex));
}

function refreshSource() {
  oldCar.visible = source === 'old' || loadState !== 'ready';
  newCar.visible = source === 'new' && loadState === 'ready';
  occupant.position.y=(newCar.visible?DRIVE_IN_CUSHION_TOP:CONVERTIBLE.cushionTop)+.23-1.1;
  cushionGuide.position.y=(newCar.visible?DRIVE_IN_CUSHION_TOP:CONVERTIBLE.cushionTop)+.0125;
  document.getElementById('support-top')!.textContent=(newCar.visible?DRIVE_IN_CUSHION_TOP:CONVERTIBLE.cushionTop).toFixed(2);
  seatCoastalLegs(rig,()=>CONVERTIBLE.footFloor);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-source]')) button.setAttribute('aria-pressed', String(button.dataset.source === source));
  status.textContent = source === 'old' ? 'Original procedural source' : loadState === 'ready' ? loadMessage || 'Higgsfield source ready' : loadMessage || 'Original fallback · preparing Higgsfield source';
  applyPaint(); render();
}

async function loadNewCar() {
  if (loadState !== 'idle') return;
  if (!modelUrl) { loadState = 'failed'; loadMessage = 'No drive-in-car.glb installed · original fallback remains visible'; refreshSource(); return; }
  loadState = 'loading'; loadMessage = `Loading ${filename} · original fallback visible`; refreshSource();
  const loaded = await models.attach(carKind, newCar, { exactSize: [4.02, 2.05, 5.76], yaw:Number(query.get('yaw')??DRIVE_IN_CAR_YAW), fallback: [oldCar], castShadow: true, receiveShadow: true });
  if (disposed) return;
  if (loaded) {
    loadState = 'ready'; loadMessage = '';
  } else { loadState = 'failed'; loadMessage = `Higgsfield model failed · original fallback retained: ${(models.snapshot().errors[carKind] ?? []).join('; ')}`; }
  refreshSource();
  if (loadMessage) status.textContent = loadMessage;
}

for (const [index, color] of colors.entries()) {
  const button = document.createElement('button'); button.dataset.color = String(index);
  const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.backgroundColor = '#' + color.hex.toString(16).padStart(6, '0');
  button.append(swatch, color.name); button.onclick = () => { colorIndex = index; query.set('color', String(index)); history.replaceState(null, '', '?' + query); applyPaint(); render(); };
  document.getElementById('colors')!.append(button);
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-source]')) button.onclick = () => {
  source = button.dataset.source === 'old' ? 'old' : 'new'; query.set('source', source); history.replaceState(null, '', '?' + query);
  refreshSource(); if (source === 'new') void loadNewCar();
};
function setView(view: string) {
  camera.up.set(0, 1, 0); controls.target.set(0, 1, 0);
  if (view === 'hero') camera.position.set(7,4.5,-8);
  else if (view === 'rear') camera.position.set(0, 2.8, 11);
  else if (view === 'side') camera.position.set(11, 2.8, 0);
  else if (view === 'top') { camera.position.set(0, 12, .001); camera.up.set(0, 0, -1); controls.target.set(0, 0, 0); }
  else camera.position.set(0, 2.8, -11);
  controls.update(); render();
}
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-view]')) button.onclick = () => setView(button.dataset.view!);
function toggle(id: string, object: THREE.Object3D) {
  const button = document.getElementById(id)!;
  button.setAttribute('aria-pressed', String(object.visible));
  button.onclick = () => { object.visible = !object.visible; button.setAttribute('aria-pressed', String(object.visible)); render(); };
}
toggle('markers', guides); toggle('occupant', occupant); toggle('bounds', envelope);
controls.addEventListener('change', render);
function resize() {
  const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
  camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); render();
}
window.addEventListener('resize', resize);
const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage);
resize(); setView(query.get('view') ?? 'front'); refreshSource();
if (source === 'new') void loadNewCar();
(window as Window & { __carReview?: unknown }).__carReview = { scene, renderer, camera, oldCar, newCar, occupant, rig, snapshot, render, setView, applyPaint };
window.addEventListener('pagehide', () => {
  disposed = true; resizeObserver.disconnect(); controls.dispose(); reflections?.dispose(); carArt?.dispose(); plates?.dispose(); models.dispose();
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  scene.traverse(object => {
    const mesh = object as THREE.Mesh; if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
      materials.add(material); for (const value of Object.values(material)) if ((value as THREE.Texture | null)?.isTexture) textures.add(value as THREE.Texture);
    }
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose()); renderer.dispose();
}, { once: true });
