import * as THREE from 'three';
import { CoastalSky } from './CoastalSky';
import { SolarClock, solarOrbitAtHour, type SolarClockOptions } from './SolarClock';

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
  /** What the renderer should be exposed at right now. See LightingKeyframe. */
  exposure: number;
  localHour:number;
  clockSource:'device'|'time-zone'|'review';
  timeZone:string;
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
  /** Whole-frame exposure. Keep highlights controlled while the key shapes forms. */
  exposure: number;
}

const CYCLE_MINUTES = 60;
const CELESTIAL_HORIZON_Y = 0.2;
const SUN_RADIUS = 6.8;
const MOON_RADIUS = 5.2;
/** Art direction only: no extra sources, shadow maps or material variants. */
export const CINEMATIC_LIGHTING = Object.freeze({
  skyFill: 0x9dbbff,
  groundBounce: 0x43516c,
  nightKey: 0xffdda6,
  mobileFillAddition: .24,
  maxAmbientLift: 1,
});

const frame = (
  minute: number,
  sky: number,
  fog: number,
  sun: number,
  sunIntensity: number,
  ambientIntensity: number,
  lampIntensity: number,
  moonIntensity: number,
  exposure: number,
): LightingKeyframe => ({
  minute,
  sky: new THREE.Color(sky),
  fog: new THREE.Color(fog),
  sun: new THREE.Color(sun),
  sunIntensity,
  ambientIntensity,
  lampIntensity,
  moonIntensity,
  exposure,
});

// Warm directional highlights separate the authored relief from cool shadows.
// A bounded blue fill keeps roads legible; it no longer lights midnight like
// midday. The existing moon supplies the night key and lanterns remain local.
// `sky` is the gradient's middle band, and the flat colour behind it.
const KEYFRAMES: LightingKeyframe[] = [
  frame(0, 0xeda08c, 0x9a86a8, 0xff8b3b, 1.25, .90, .22, .40, 1.08),
  frame(5, 0x267bd9, 0x6ba7b8, 0xffcc8f, 1.60, .95, .08, 0, .98),
  frame(20, 0x1758c4, 0x6badd0, 0xffe0ac, 2.30, 1.02, 0, 0, .96),
  frame(25, 0xf27a5e, 0xc07e5c, 0xffa43c, 2.10, .98, .40, 0, 1.02),
  // Lamps and blue bounce bridge the low-angle sun/moon handover.
  frame(30, 0xd9667a, 0x6e5a8f, 0xff562d, 1.30, .96, 1.0, .62, 1.16),
  frame(35, 0x1d3e91, 0x234d86, 0x6a91f0, .35, .84, 1.18, 1.25, 1.23),
  frame(42, 0x101e62, 0x17396b, 0x5379d9, .09, .78, 1.48, 1.75, 1.26),
  frame(52, 0x0b194b, 0x113e64, 0x4178bf, .04, .80, 1.56, 1.65, 1.26),
  // Identical to minute zero: no brightness or colour seam at sunrise.
  frame(60, 0xeda08c, 0x9a86a8, 0xff8b3b, 1.25, .90, .22, .40, 1.08),
];

/**
 * The sky as a film would light it rather than one flat purple (the owner,
 * 2026-10-22): at dusk an orange-gold horizon, a coral band, deep blue
 * overhead; at dawn a pale gold horizon, peach, soft blue. Full day and full
 * night keep their single flat colour. The glow is a warm bank that sits on
 * the horizon on the sun's side. One row per KEYFRAMES row, same minutes.
 */
const SKY_GRADIENT: ReadonlyArray<{ horizon: THREE.Color; zenith: THREE.Color; glow: THREE.Color; glowStrength: number }> = [
  [0xf7c27a, 0x5f86c4, 0xffd79c, .55],
  [0x267bd9, 0x267bd9, 0xfff0d0, 0],
  [0x1758c4, 0x1758c4, 0xffe3b0, 0],
  [0xffa24f, 0x3a5fb4, 0xffc06a, .65],
  [0xf28a4a, 0x253e8f, 0xffb067, .6],
  [0x5b5a98, 0x152f80, 0xff9a6a, .15],
  [0x101e62, 0x101e62, 0x4466aa, 0],
  [0x0b194b, 0x0b194b, 0x4466aa, 0],
  [0xf7c27a, 0x5f86c4, 0xffd79c, .55],
].map(([horizon, zenith, glow, glowStrength]) => ({ horizon: new THREE.Color(horizon), zenith: new THREE.Color(zenith), glow: new THREE.Color(glow), glowStrength }));

const phaseAt = (minute: number): { phase: DayPhase; start: number; end: number } => {
  if (minute < 5) return { phase: 'dawn', start: 0, end: 5 };
  if (minute < 12) return { phase: 'morning', start: 5, end: 12 };
  if (minute < 20) return { phase: 'daylight', start: 12, end: 20 };
  if (minute < 25) return { phase: 'golden-hour', start: 20, end: 25 };
  if (minute < 30) return { phase: 'sunset', start: 25, end: 30 };
  if (minute < 35) return { phase: 'blue-hour', start: 30, end: 35 };
  return { phase: 'night', start: 35, end: 60 };
};

/**
 * How far into night the hour is, for the sound beds: 0 by day, 1 by night.
 * It follows the light — night takes over through sunset and blue hour and
 * hands back through dawn (owner, 2026-10-17).
 */
export function nightAmountAt(minute: number): number {
  const m = ((minute % 60) + 60) % 60;
  const ease = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
  if (m < 5) return 1 - ease(m / 5);
  if (m < 25) return 0;
  if (m < 35) return ease((m - 25) / 10);
  return 1;
}

export class DayNightCycle {
  readonly atmosphere: CoastalSky;
  readonly directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  readonly hemisphereLight = new THREE.HemisphereLight(CINEMATIC_LIGHTING.skyFill, CINEMATIC_LIGHTING.groundBounce, 1);
  readonly moonLight = new THREE.DirectionalLight(CINEMATIC_LIGHTING.nightKey, 0);
  readonly sunObject = new THREE.Group();
  readonly moonObject = new THREE.Group();

  private readonly scene: THREE.Scene;
  private readonly fixedCycleMinute?: number;
  private readonly solarClock:SolarClock;
  private readonly lampMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly lampLights: Array<{ light: THREE.Light; intensityScale: number }> = [];
  private readonly sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffb75e, fog: false, transparent: true });
  private readonly sunHaloMaterial: THREE.SpriteMaterial;
  private readonly moonMaterial = new THREE.MeshBasicMaterial({ color: 0xe5edff, fog: false, transparent: true });
  private readonly moonHaloMaterial: THREE.SpriteMaterial;
  private shadowsEnabled = true;
  private weatherCloud=0;
  setWeatherCloud(value:number):void {this.weatherCloud=THREE.MathUtils.clamp(value,0,1);this.atmosphere.setCloudiness(this.weatherCloud);}
  private state: DayNightState = {
    cycleMinute: 0,
    progress: 0,
    phase: 'dawn',
    phaseProgress: 0,
    exposure: 1,
    localHour:6,
    clockSource:'device',
    timeZone:'',
  };
  private readonly waterReflectionState: WaterReflectionState = {
    sun: { x: 0, strength: 0, elevation: 0, color: new THREE.Color(0xffb86b) },
    moon: { x: 0, strength: 0, elevation: 0, color: new THREE.Color(0xaac8ff) },
  };

  constructor(scene: THREE.Scene, fixedCycleMinute?: number, clockOptions:SolarClockOptions={}) {
    this.scene = scene;
    this.atmosphere = new CoastalSky(scene);
    this.fixedCycleMinute = fixedCycleMinute;
    this.solarClock=new SolarClock(clockOptions);
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
    // Match the moon: cloud cutouts must cover both the disc and its glow.
    sun.renderOrder = -4; halo.renderOrder = -4;
    this.sunMaterial.depthWrite = false;
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
    // Celestial discs render before cloud alpha cutouts and never mask their depth.
    moon.renderOrder = -4; moonHalo.renderOrder = -4;
    this.moonMaterial.depthWrite = false;
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

  /**
   * Extra sky at night, to stand in for lamps the light setting cannot afford.
   * Zero on the full setting, which still has all of them.
   */
  private ambientLift = 0;

  setAmbientLift(lift: number): void {
    this.ambientLift = THREE.MathUtils.clamp(Number.isFinite(lift) ? lift : 0, 0, CINEMATIC_LIGHTING.maxAmbientLift);
  }

  setShadowsEnabled(enabled: boolean): void {
    this.shadowsEnabled = enabled;
    if (!enabled) {
      this.directionalLight.castShadow = false;
      this.moonLight.castShadow = false;
    }
  }

  /**
   * Both the sun and the moon are always shadow casters (with shadows on);
   * only drawing the shadow map stops while one is too faint to need it.
   *
   * Turning `castShadow` on and off with the light changed how many shadowed
   * lights there were, which is part of every lit shader's key: at each sunrise
   * and sunset, and on the first frame after the loading warm-up, every lit
   * material in the world recompiled — seconds of frozen picture in Safari
   * (WebKit probe, 2026-10-18). A light that has set has a colour of exactly
   * zero, and the light loop skips it whole, shadow lookup included
   * (LightLoop.ts), so the constant count costs nothing per pixel.
   */
  private castsShadowWhileLit(light: THREE.DirectionalLight): void {
    light.castShadow = this.shadowsEnabled;
    light.shadow.autoUpdate = this.shadowsEnabled && light.intensity > 0.12;
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
    const clock=this.solarClock.read(now);
    const cycleMinute = this.fixedCycleMinute === undefined
      ? clock.cycleMinute
      : THREE.MathUtils.clamp(this.fixedCycleMinute, 0, CYCLE_MINUTES - 0.001);
    const localHour=this.fixedCycleMinute===undefined?clock.localHour:(6+cycleMinute/CYCLE_MINUTES*24)%24;
    const phaseData = phaseAt(cycleMinute);
    const phaseProgress =
      (cycleMinute - phaseData.start) / Math.max(phaseData.end - phaseData.start, 0.001);

    let from = KEYFRAMES[0];
    let to = KEYFRAMES[1];
    let fromIndex = 0;
    for (let index = 0; index < KEYFRAMES.length - 1; index += 1) {
      if (cycleMinute >= KEYFRAMES[index].minute && cycleMinute < KEYFRAMES[index + 1].minute) {
        from = KEYFRAMES[index];
        to = KEYFRAMES[index + 1];
        fromIndex = index;
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
    const overcast=new THREE.Color(0x71828e).multiplyScalar(.45+.55*(1-nightAmountAt(cycleMinute)));
    sky.lerp(overcast,this.weatherCloud*.9);fog.lerp(overcast,this.weatherCloud*.75);
    const sun = from.sun.clone().lerp(to.sun, mix);
    const sunIntensity = THREE.MathUtils.lerp(from.sunIntensity, to.sunIntensity, mix);
    const ambientIntensity = THREE.MathUtils.lerp(
      from.ambientIntensity,
      to.ambientIntensity,
      mix,
    );
    const lampIntensity = THREE.MathUtils.lerp(from.lampIntensity, to.lampIntensity, mix);
    const moonIntensity = THREE.MathUtils.lerp(from.moonIntensity, to.moonIntensity, mix);
    const exposure = THREE.MathUtils.lerp(from.exposure, to.exposure, mix);
    // How far through the bright part of the cycle we are, for the night lift
    // below. Taken from the keyframed sun rather than the solar angle, so it
    // follows the look of the sky rather than the geometry of the orbit.
    const sunElevationHint = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(from.sunIntensity, to.sunIntensity, mix) / 1.2,
      0,
      1,
    );

    this.scene.background = sky;
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(fog);
    const gradientFrom = SKY_GRADIENT[fromIndex], gradientTo = SKY_GRADIENT[Math.min(fromIndex + 1, SKY_GRADIENT.length - 1)];
    this.directionalLight.color.copy(sun);
    // Mobile keeps fewer local lamps. A small additive blue bounce replaces
    // some of their visibility without doubling the entire night's fill.
    const darkness = 1 - THREE.MathUtils.clamp(sunElevationHint, 0, 1);
    this.hemisphereLight.intensity = ambientIntensity + this.ambientLift * CINEMATIC_LIGHTING.mobileFillAddition * darkness;
    // A full civil day on the island's dock-to-beach axis: sunrise at the
    // +Z entrance, overhead near noon, sunset at the opposite -Z beach.
    // The fixed-minute override remains solely for deterministic local QA.
    const sunOrbit=solarOrbitAtHour(localHour),sunElevation=sunOrbit.elevation;
    const sunPosition = new THREE.Vector3(sunOrbit.x,sunOrbit.y,sunOrbit.z);
    this.sunObject.position.copy(sunPosition);
    this.atmosphere.setSky(fog,
      gradientFrom.horizon.clone().lerp(gradientTo.horizon, mix).lerp(overcast,this.weatherCloud*.8), sky,
      gradientFrom.zenith.clone().lerp(gradientTo.zenith, mix).lerp(overcast,this.weatherCloud*.9),
      gradientFrom.glow.clone().lerp(gradientTo.glow, mix),
      THREE.MathUtils.lerp(gradientFrom.glowStrength, gradientTo.glowStrength, mix)*(1-this.weatherCloud), sunPosition);
    this.sunObject.visible = sunPosition.y > CELESTIAL_HORIZON_Y - SUN_RADIUS;
    this.sunMaterial.opacity = 1-this.weatherCloud*.92;
    this.sunMaterial.color.copy(sun);
    this.sunHaloMaterial.color.copy(sun);
    const sunAboveHorizon = THREE.MathUtils.smoothstep(sunElevation, -0.04, 0.08);
    const visibleSunElevation = THREE.MathUtils.clamp(sunElevation, 0, 1);
    this.sunHaloMaterial.opacity = sunPosition.y >= CELESTIAL_HORIZON_Y
      ? THREE.MathUtils.lerp(0.82, 0.42, visibleSunElevation)
      : 0;
    this.directionalLight.intensity = sunIntensity * sunAboveHorizon*(1-this.weatherCloud*.65);
    this.sunHaloMaterial.opacity*=1-this.weatherCloud;
    this.castsShadowWhileLit(this.directionalLight);
    this.directionalLight.position.copy(sunPosition).multiplyScalar(0.48);
    this.directionalLight.target.position.set(0, 0, 0);

    // The moon runs the same continuous orbit half a cycle behind the sun: it
    // rises as the sun sets, crosses the night sky, and sets as dawn arrives.
    const moonOrbit=solarOrbitAtHour(localHour+12,205,130),moonElevation=moonOrbit.elevation;
    const moonPosition = new THREE.Vector3(moonOrbit.x,moonOrbit.y,moonOrbit.z);
    this.moonObject.position.copy(moonPosition);
    this.moonObject.visible = moonPosition.y > CELESTIAL_HORIZON_Y - MOON_RADIUS;
    this.moonMaterial.opacity = 1-this.weatherCloud*.92;
    const visibleMoonElevation = THREE.MathUtils.clamp(moonElevation, 0, 1);
    this.moonMaterial.color.set(0xe5edff).lerp(new THREE.Color(0x91a7d7), 1 - visibleMoonElevation);
    const moonAboveHorizon = THREE.MathUtils.smoothstep(moonElevation, -0.04, 0.08);
    this.moonHaloMaterial.opacity = moonPosition.y >= CELESTIAL_HORIZON_Y
      ? THREE.MathUtils.lerp(0.76, 0.42, visibleMoonElevation)
      : 0;
    this.moonLight.intensity = moonIntensity * moonAboveHorizon*(1-this.weatherCloud*.6);
    this.moonHaloMaterial.opacity*=1-this.weatherCloud;
    this.castsShadowWhileLit(this.moonLight);
    this.moonLight.position.copy(moonPosition).multiplyScalar(0.5);
    this.moonLight.target.position.set(0, 0, 0);

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
      exposure,
      localHour,
      clockSource:this.fixedCycleMinute===undefined?clock.clockSource:'review',
      timeZone:clock.timeZone,
    };
    return this.state;
  }
}
