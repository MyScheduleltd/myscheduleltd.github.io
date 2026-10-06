import * as THREE from 'three';
import { BAND_MEMBERS, RooftopBand } from './world/RooftopBand';

// The band's rehearsal room: the stage and the bonfire side by side on a
// plain floor. ?play starts them playing; ?t=seconds runs the clock that far
// first; ?look=x,y,z&from=x,y,z&zoom=n frames the camera (orthographic).
const q = new URLSearchParams(location.search);
if (!['localhost', '127.0.0.1'].includes(location.hostname) && !location.pathname.includes('/beta/ps2/')) throw new Error('Band review opens locally or on the PS2 preview only');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(q.has('night') ? 0x1a1d2a : 0xe8e5df);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, q.has('night') ? .35 : 1.6));
const sun = new THREE.DirectionalLight(0xffffff, q.has('night') ? .2 : 2.2);
sun.position.set(-4, 10, -8);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -20;
sun.shadow.camera.right = sun.shadow.camera.top = 20;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
// As on the roof: the stage faces -z (the beach), the fire in the far corner.
// ?roof places them exactly as in the world, on a stand-in slab over the shop
// with the screen's back behind them.
const roof = q.has('roof');
if (roof) {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(36, 7, 11), new THREE.MeshStandardMaterial({ color: 0x4a3d35 }));
  slab.position.set(40, 3.5, 13.5); slab.receiveShadow = true; scene.add(slab);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(16, 8, .6), new THREE.MeshStandardMaterial({ color: 0x354d47 }));
  screen.name = 'review-screen';
  screen.position.set(40, 7 + 6.6, 19.6); scene.add(screen);
}
const band = roof
  ? new RooftopBand({ x: 40, y: 7, z: 12.2, yaw: Math.PI }, { x: 53.5, y: 7, z: 15.6, yaw: Math.PI / 2 })
  : new RooftopBand({ x: 0, y: 0, z: 0, yaw: Math.PI }, { x: 13.5, y: 0, z: 4, yaw: Math.PI / 2 });
scene.add(band.group);
const aspect = innerWidth / innerHeight;
const zoom = Number(q.get('zoom') ?? 1);
const half = 9 / zoom;
const camera = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, .1, 200);
const vec = (s: string | null, d: number[]) => new THREE.Vector3(...(s ? s.split(',').map(Number) : d));
camera.position.copy(vec(q.get('from'), [4, 10, -26]));
camera.lookAt(vec(q.get('look'), [5, 2, 2]));
(async () => {
  await band.load();
  if (q.has('play')) band.setPlaying(true);
  const t = Number(q.get('t') ?? 0), stop = Number(q.get('stop') ?? Infinity);
  for (let s = 0; s < t; s += 1 / 30) {
    // ?stop=seconds takes the record off then, to watch them go back.
    if (s >= stop && band.isPlaying) band.setPlaying(false);
    band.update(1 / 30, s);
  }
  band.update(0, t); // Evaluate the initial pose even for a frozen t=0 review.
  // Hold each member at their review mark while inspecting a specific clip.
  const previewClip = q.get('clip');
  const clipMembers = (band as unknown as { musicians: {
    mixer: THREE.AnimationMixer; actions: Record<string, THREE.AnimationAction>;
    carried: THREE.Object3D[];
  }[] }).musicians;
  const inspectClip = previewClip && ['walk', 'sit', 'play'].includes(previewClip);
  if (inspectClip) for (const m of clipMembers) {
    m.mixer.stopAllAction(); m.actions[previewClip].reset().play();
    m.mixer.setTime(Number(q.get('phase') ?? 0));
    m.carried.forEach(object => { object.visible = previewClip === 'play'; });
  }
  const w = window as Window & { __band?: RooftopBand; __bandReady?: boolean };
  w.__band = band;
  w.__bandReady = true;
  document.body.dataset.bandReady = 'true';
  let paused = q.has('still');
  if (q.has('controls')) {
    const controls = document.createElement('nav');
    controls.setAttribute('aria-label', 'Band review controls');
    controls.style.cssText = 'position:fixed;bottom:16px;left:16px;display:flex;gap:8px;padding:10px;background:#e8e5dfee;border-radius:6px';
    const pause = document.createElement('button');
    pause.textContent = paused ? 'Play motion' : 'Pause';
    pause.onclick = () => { paused = !paused; pause.textContent = paused ? 'Play motion' : 'Pause'; };
    const perform = document.createElement('button');
    perform.textContent = band.isPlaying ? 'Return to fire' : 'Walk to stage';
    perform.onclick = () => {
      if (inspectClip) {
        q.delete('clip'); q.delete('phase'); q.delete('play'); q.delete('still');
        q.set('t', '0'); location.search = q.toString(); return;
      }
      band.setPlaying(!band.isPlaying); perform.textContent = band.isPlaying ? 'Return to fire' : 'Walk to stage'; paused = false; pause.textContent = 'Pause';
    };
    const member = document.createElement('select');
    member.setAttribute('aria-label', 'Band member');
    for (const [value, label] of [['all', 'Full band'], ['vocal', 'Singer'], ['guitarist', 'Guitarist'], ['bass-player', 'Bassist'], ['drummer', 'Drummer']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; member.append(option);
    }
    const view = document.createElement('select');
    view.setAttribute('aria-label', 'Camera angle');
    view.disabled = true;
    for (const angle of ['Front', 'Side', 'Other side', 'Back']) {
      const option = document.createElement('option'); option.textContent = angle; view.append(option);
    }
    const defaultPosition = camera.position.clone(), defaultRotation = camera.quaternion.clone();
    const frame = () => {
      view.disabled = member.value === 'all';
      const screen = scene.getObjectByName('review-screen');
      if (screen) screen.visible = member.value === 'all';
      for (const name of BAND_MEMBERS) {
        const root = band.group.getObjectByName('band-' + name);
        if (root) root.visible = member.value === 'all' || member.value === name;
      }
      const root = band.group.getObjectByName('band-' + member.value);
      if (!root) {
        camera.position.copy(defaultPosition); camera.quaternion.copy(defaultRotation);
        camera.top = half; camera.bottom = -half;
      } else {
        const target = root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 2.1, 0));
        const offset = view.value === 'Back' ? [3, 1.5, 10] : view.value === 'Side' ? [10, 1.5, 1] : view.value === 'Other side' ? [-10, 1.5, 1] : [3, 1.5, -10];
        camera.position.copy(target).add(new THREE.Vector3(...offset)); camera.lookAt(target);
        camera.top = Math.min(2.3, half); camera.bottom = -camera.top;
      }
      camera.left = -camera.top * innerWidth / innerHeight; camera.right = -camera.left;
      camera.updateProjectionMatrix();
    };
    member.onchange = frame; view.onchange = frame;
    controls.append(pause, perform, member, view); document.body.append(controls);
    const selected = q.get('member');
    if (selected && Array.from(member.options).some(option => option.value === selected)) {
      member.value = selected;
      const angle = q.get('angle');
      if (angle && Array.from(view.options).some(option => option.value === angle)) view.value = angle;
      frame();
    }
  }
  let last = performance.now(), elapsed = t;
  const loop = () => {
    const now = performance.now();
    if (!paused) {
      const dt = Math.min((now - last) / 1000, .1); elapsed += dt;
      if (inspectClip) clipMembers.forEach(m => m.mixer.update(dt));
      else band.update(dt, elapsed);
    }
    last = now;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  loop();
})();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.left = -half * innerWidth / innerHeight;
  camera.right = half * innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
