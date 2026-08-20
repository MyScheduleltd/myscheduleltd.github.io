import * as THREE from 'three';

export type DayPhase =
  | 'dawn'
  | 'morning'
  | 'daylight'
  | 'golden-hour'
  | 'sunset'
  | 'blue-hour'
  | 'night';

export interface DayNightState {
  cycleMinute: number;
  progress: number;
  phase: DayPhase;
  phaseProgress: number;
}

export interface WaterReflectionState {
  sun: { x: number; strength: number; elevation: number; color: THREE.Color };
  moon: { x: number; strength: number; elevation: number; color: THREE.Color };
}

interface LightingKeyframe {
  minute: number;
  sky: THREE.Color;
  fog: THREE.Color;
  sun: THREE.Color;
  sunIntensity: number;
  ambientIntensity: number;
  lampIntensity: number;
  moonIntensity: number;
}

const CYCLE_MINUTES = 60;
const CYCLE_MS = CYCLE_MINUTES * 60 * 1000;
const SYNC_EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);
const CELESTIAL_HORIZON_Y = 0.2;
const CELESTIAL_OCEAN_Z = -170;
const SUN_ORBIT_X = 72;
const SUN_ORBIT_Y = 62;
const SUN_RADIUS = 6.8;
const MOON_ORBIT_X = 66;
const MOON_ORBIT_Y = 54;
const MOON_RADIUS = 5.2;

const frame = (
  minute: number,
  sky: number,
  fog: number,
  sun: number,
  sunIntensity: number,
  ambientIntensity: number,
  lampIntensity: number,
  moonIntensity: number,
): LightingKeyframe => ({
  minute,
  sky: new THREE.Color(sky),
  fog: new THREE.Color(fog),
  sun: new THREE.Color(sun),
  sunIntensity,
  ambientIntensity,
  lampIntensity,
  moonIntensity,
});

const KEYFRAMES: LightingKeyframe[] = [
  frame(0, 0x87676a, 0x6d6262, 0xffb28a, 1.15, 0.78, 0.2, 0.18),
  frame(5, 0x9ab5c6, 0x899aa0, 0xffd3a6, 1.45, 1.05, 0.08, 0),
  frame(20, 0x83b4d1, 0xa1b3b5, 0xfff1d0, 2.2, 1.35, 0, 0),
  frame(25, 0xd28b62, 0xb28a76, 0xffa65c, 2.0, 0.95, 0.15, 0),
  frame(30, 0x8e4c4b, 0x6e5259, 0xff5d38, 1.1, 0.66, 0.65, 0.08),
  frame(35, 0x253652, 0x2b3448, 0x7889c7, 0.35, 0.48, 1.3, 0.28),
  frame(42, 0x070b18, 0x0a0d16, 0x6072a8, 0.09, 0.4, 1.75, 0.82),
  frame(52, 0x03050d, 0x080912, 0x4a5d8c, 0.04, 0.38, 1.9, 0.96),
  frame(60, 0x87676a, 0x6d6262, 0xffb28a, 1.15, 0.78, 0.2, 0.18),
];

const phaseAt = (minute: number): { phase: DayPhase; start: number; end: number } => {
  if (minute < 5) return { phase: 'dawn', start: 0, end: 5 };
  if (minute < 12) return { phase: 'morning', start: 5, end: 12 };
  if (minute < 20) return { phase: 'daylight', start: 12, end: 20 };
  if (minute < 25) return { phase: 'golden-hour', start: 20, end: 25 };
  if (minute < 30) return { phase: 'sunset', start: 25, end: 30 };
  if (minute < 35) return { phase: 'blue-hour', start: 30, end: 35 };
  return { phase: 'night', start: 35, end: 60 };
};

export class DayNightCycle {
  readonly directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  readonly hemisphereLight = new THREE.HemisphereLight(0xb8d6ff, 0x28211d, 1);
  readonly moonLight = new THREE.DirectionalLight(0xaac8ff, 0);
  readonly sunObject = new THREE.Group();
  readonly moonObject = new THREE.Group();

  private readonly scene: THREE.Scene;
  private readonly fixedCycleMinute?: number;
  private readonly lampMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly lampLights: Array<{ light: THREE.Light; intensityScale: number }> = [];
  private readonly sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffb75e, fog: false, transparent: true });
  private readonly sunHaloMaterial: THREE.SpriteMaterial;
  private readonly moonMaterial = new THREE.MeshBasicMaterial({ color: 0xe5edff, fog: false, transparent: true });
  private readonly moonHaloMaterial: THREE.SpriteMaterial;
  private shadowsEnabled = true;
  private state: DayNightState = {
    cycleMinute: 0,
    progress: 0,
    phase: 'dawn',
    phaseProgress: 0,
  };
  private readonly waterReflectionState: WaterReflectionState = {
    sun: { x: 0, strength: 0, elevation: 0, color: new THREE.Color(0xffb86b) },
    moon: { x: 0, strength: 0, elevation: 0, color: new THREE.Color(0xaac8ff) },
  };

  constructor(scene: THREE.Scene, fixedCycleMinute?: number) {
    this.scene = scene;
    this.fixedCycleMinute = fixedCycleMinute;
    this.directionalLight.position.set(36, 42, 24);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(1024, 1024);
    this.directionalLight.shadow.camera.left = -70;
    this.directionalLight.shadow.camera.right = 70;
    this.directionalLight.shadow.camera.top = 70;
    this.directionalLight.shadow.camera.bottom = -70;
    this.directionalLight.shadow.camera.far = 140;
    this.directionalLight.shadow.bias = -0.00035;
    this.directionalLight.shadow.normalBias = 0.045;

    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.moonLight.shadow.camera.left = -65;
    this.moonLight.shadow.camera.right = 65;
    this.moonLight.shadow.camera.top = 65;
    this.moonLight.shadow.camera.bottom = -65;
    this.moonLight.shadow.camera.near = 1;
    this.moonLight.shadow.camera.far = 150;
    this.moonLight.shadow.bias = -0.00045;
    this.moonLight.shadow.normalBias = 0.065;
    const sun = new THREE.Mesh(new THREE.IcosahedronGeometry(6.8, 2), this.sunMaterial);
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 256;
    haloCanvas.height = 256;
    const haloContext = haloCanvas.getContext('2d');
    if (haloContext) {
      const glow = haloContext.createRadialGradient(128, 128, 20, 128, 128, 128);
      glow.addColorStop(0, 'rgba(255,220,135,.85)');
      glow.addColorStop(0.35, 'rgba(255,159,70,.35)');
      glow.addColorStop(1, 'rgba(255,99,45,0)');
      haloContext.fillStyle = glow;
      haloContext.fillRect(0, 0, 256, 256);
    }
    const haloTexture = new THREE.CanvasTexture(haloCanvas);
    this.sunHaloMaterial = new THREE.SpriteMaterial({
      map: haloTexture,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.65,
    });
    const halo = new THREE.Sprite(this.sunHaloMaterial);
    halo.scale.set(30, 30, 1);
    this.sunObject.add(halo, sun);
    this.sunObject.userData.projectorBackground = true;

    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(5.2, 3), this.moonMaterial);
    const moonHaloCanvas = document.createElement('canvas');
    moonHaloCanvas.width = 256;
    moonHaloCanvas.height = 256;
    const moonHaloContext = moonHaloCanvas.getContext('2d');
    if (moonHaloContext) {
      const glow = moonHaloContext.createRadialGradient(128, 128, 24, 128, 128, 128);
      glow.addColorStop(0, 'rgba(222,234,255,.78)');
      glow.addColorStop(0.38, 'rgba(145,181,255,.24)');
      glow.addColorStop(1, 'rgba(91,126,218,0)');
      moonHaloContext.fillStyle = glow;
      moonHaloContext.fillRect(0, 0, 256, 256);
    }
    this.moonHaloMaterial = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(moonHaloCanvas),
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.62,
    });
    const moonHalo = new THREE.Sprite(this.moonHaloMaterial);
    moonHalo.scale.set(25, 25, 1);
    this.moonObject.add(moonHalo, moon);
    this.moonObject.userData.projectorBackground = true;
    scene.add(
      this.directionalLight,
      this.directionalLight.target,
      this.hemisphereLight,
      this.moonLight,
      this.moonLight.target,
      this.sunObject,
      this.moonObject,
    );
  }

  addLampMaterial(material: THREE.MeshStandardMaterial): void {
    this.lampMaterials.push(material);
  }

  addLampLight(light: THREE.Light, intensityScale = 1): void {
    this.lampLights.push({ light, intensityScale });
  }

  setShadowsEnabled(enabled: boolean): void {
    this.shadowsEnabled = enabled;
    if (!enabled) {
      this.directionalLight.castShadow = false;
      this.moonLight.castShadow = false;
    }
  }

  getState(): DayNightState {
    return this.state;
  }

  getWaterReflectionState(): WaterReflectionState {
    return this.waterReflectionState;
  }

  getCelestialReviewState(): {
    sun: { position: [number, number, number]; visible: boolean; opacity: number };
    moon: { position: [number, number, number]; visible: boolean; opacity: number };
  } {
    return {
      sun: {
        position: [this.sunObject.position.x, this.sunObject.position.y, this.sunObject.position.z],
        visible: this.sunObject.visible,
        opacity: this.sunMaterial.opacity,
      },
      moon: {
        position: [this.moonObject.position.x, this.moonObject.position.y, this.moonObject.position.z],
        visible: this.moonObject.visible,
        opacity: this.moonMaterial.opacity,
      },
    };
  }

  update(now = Date.now()): DayNightState {
    const elapsed = ((now - SYNC_EPOCH) % CYCLE_MS + CYCLE_MS) % CYCLE_MS;
    const cycleMinute = this.fixedCycleMinute === undefined
      ? (elapsed / CYCLE_MS) * CYCLE_MINUTES
      : THREE.MathUtils.clamp(this.fixedCycleMinute, 0, CYCLE_MINUTES - 0.001);
    const phaseData = phaseAt(cycleMinute);
    const phaseProgress =
      (cycleMinute - phaseData.start) / Math.max(phaseData.end - phaseData.start, 0.001);

    let from = KEYFRAMES[0];
    let to = KEYFRAMES[1];
    for (let index = 0; index < KEYFRAMES.length - 1; index += 1) {
      if (cycleMinute >= KEYFRAMES[index].minute && cycleMinute < KEYFRAMES[index + 1].minute) {
        from = KEYFRAMES[index];
        to = KEYFRAMES[index + 1];
        break;
      }
    }

    const mix = THREE.MathUtils.smoothstep(
      (cycleMinute - from.minute) / Math.max(to.minute - from.minute, 0.001),
      0,
      1,
    );
    const sky = from.sky.clone().lerp(to.sky, mix);
    const fog = from.fog.clone().lerp(to.fog, mix);
    const sun = from.sun.clone().lerp(to.sun, mix);
    const sunIntensity = THREE.MathUtils.lerp(from.sunIntensity, to.sunIntensity, mix);
    const ambientIntensity = THREE.MathUtils.lerp(
      from.ambientIntensity,
      to.ambientIntensity,
      mix,
    );
    const lampIntensity = THREE.MathUtils.lerp(from.lampIntensity, to.lampIntensity, mix);
    const moonIntensity = THREE.MathUtils.lerp(from.moonIntensity, to.moonIntensity, mix);

    this.scene.background = sky;
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(fog);
    this.directionalLight.color.copy(sun);
    this.hemisphereLight.intensity = ambientIntensity;
    // One full solar orbit per festival cycle. The world camera mirrors the
    // ocean's x-axis on screen, so the positive-to-negative path is the one
    // visitors read as sunrise on the left and sunset on the right. There is no
    // reset jump and no opacity-based disappearance in mid-air.
    const solarAngle = (cycleMinute / CYCLE_MINUTES) * Math.PI * 2;
    const sunElevation = Math.sin(solarAngle);
    const sunPosition = new THREE.Vector3(
      Math.cos(solarAngle) * SUN_ORBIT_X,
      CELESTIAL_HORIZON_Y + sunElevation * SUN_ORBIT_Y,
      CELESTIAL_OCEAN_Z,
    );
    this.sunObject.position.copy(sunPosition);
    this.sunObject.visible = sunPosition.y > CELESTIAL_HORIZON_Y - SUN_RADIUS;
    this.sunMaterial.opacity = 1;
    this.sunMaterial.color.copy(sun);
    this.sunHaloMaterial.color.copy(sun);
    const sunAboveHorizon = THREE.MathUtils.smoothstep(sunElevation, -0.04, 0.08);
    const visibleSunElevation = THREE.MathUtils.clamp(sunElevation, 0, 1);
    this.sunHaloMaterial.opacity = sunPosition.y >= CELESTIAL_HORIZON_Y
      ? THREE.MathUtils.lerp(0.82, 0.42, visibleSunElevation)
      : 0;
    this.directionalLight.intensity = sunIntensity * sunAboveHorizon;
    this.directionalLight.castShadow = this.shadowsEnabled && this.directionalLight.intensity > 0.12;
    this.directionalLight.position.copy(sunPosition).multiplyScalar(0.48);
    this.directionalLight.target.position.set(0, 0, -18);

    // The moon runs the same continuous orbit half a cycle behind the sun: it
    // rises as the sun sets, crosses the night sky, and sets as dawn arrives.
    const lunarAngle = solarAngle + Math.PI;
    const moonElevation = Math.sin(lunarAngle);
    const moonPosition = new THREE.Vector3(
      Math.cos(lunarAngle) * MOON_ORBIT_X,
      CELESTIAL_HORIZON_Y + moonElevation * MOON_ORBIT_Y,
      CELESTIAL_OCEAN_Z,
    );
    this.moonObject.position.copy(moonPosition);
    this.moonObject.visible = moonPosition.y > CELESTIAL_HORIZON_Y - MOON_RADIUS;
    this.moonMaterial.opacity = 1;
    const visibleMoonElevation = THREE.MathUtils.clamp(moonElevation, 0, 1);
    this.moonMaterial.color.set(0xe5edff).lerp(new THREE.Color(0x91a7d7), 1 - visibleMoonElevation);
    const moonAboveHorizon = THREE.MathUtils.smoothstep(moonElevation, -0.04, 0.08);
    this.moonHaloMaterial.opacity = moonPosition.y >= CELESTIAL_HORIZON_Y
      ? THREE.MathUtils.lerp(0.76, 0.42, visibleMoonElevation)
      : 0;
    this.moonLight.intensity = moonIntensity * moonAboveHorizon;
    this.moonLight.castShadow = this.shadowsEnabled && this.moonLight.intensity > 0.12;
    this.moonLight.position.copy(moonPosition).multiplyScalar(0.5);
    this.moonLight.target.position.set(0, 0, -22);

    // Reflections follow the actual celestial positions and fade in as each
    // light moves over the sea. This avoids a uniform highlight that appears
    // disconnected from the visible sun or moon.
    const sunOverSea = THREE.MathUtils.smoothstep(-sunPosition.z, 18, 150);
    const moonOverSea = THREE.MathUtils.smoothstep(-moonPosition.z, 12, 145);
    this.waterReflectionState.sun.x = sunPosition.x;
    this.waterReflectionState.sun.elevation = visibleSunElevation;
    this.waterReflectionState.sun.strength = THREE.MathUtils.clamp(
      sunIntensity * sunAboveHorizon * sunOverSea * (0.2 + (1 - visibleSunElevation) * 0.72),
      0,
      1,
    );
    this.waterReflectionState.sun.color.copy(sun).lerp(new THREE.Color(0xffe1a3), 0.28);
    this.waterReflectionState.moon.x = moonPosition.x;
    this.waterReflectionState.moon.elevation = visibleMoonElevation;
    this.waterReflectionState.moon.strength = THREE.MathUtils.clamp(
      moonIntensity * moonAboveHorizon * moonOverSea * (0.32 + (1 - visibleMoonElevation) * 0.68),
      0,
      0.78,
    );
    this.waterReflectionState.moon.color.set(0xb9d2ff);

    for (const material of this.lampMaterials) {
      material.emissiveIntensity = lampIntensity;
    }
    for (const { light, intensityScale } of this.lampLights) {
      light.intensity = lampIntensity * intensityScale;
    }


    this.state = {
      cycleMinute,
      progress: cycleMinute / CYCLE_MINUTES,
      phase: phaseData.phase,
      phaseProgress,
    };
    return this.state;
  }
}
