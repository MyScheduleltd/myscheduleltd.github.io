import * as THREE from 'three';

/**
 * Head tracking from an ordinary webcam, for the desktop VR preview.
 *
 * A monitor is not a headset, and pretending otherwise is what makes desktop
 * "VR" feel like a gimmick. A webcam sees a face across about thirty-five
 * degrees of turn before the tracking gives out, so mapping head angle to view
 * angle one for one would leave the visitor looking around a sixty-degree cone
 * and no further.
 *
 * So the head does two different jobs here, and only one of them is rotation:
 *
 * - **Position is the window.** Leaning left, right, up, down or in moves the
 *   camera the same way, which is what turns a monitor into an opening you can
 *   look around the edge of. This works perfectly inside the small range a
 *   webcam gives, because it is a translation rather than a turn.
 * - **Rotation is amplified.** Head yaw and pitch are multiplied, so a twenty
 *   degree glance sweeps eighty degrees of world.
 *
 * Roll is deliberately dropped. Tilting your head in front of a monitor does
 * not tilt the room, and rolling the picture when it happens reads as a fault.
 *
 * Nothing leaves the machine. The video element is never added to the document,
 * no frame is uploaded, stored or sent anywhere, and the model runs in this
 * tab's own WebAssembly.
 */

export type HeadTrackingStatus =
  | 'idle'
  | 'loading'
  | 'requesting'
  | 'denied'
  | 'unsupported'
  | 'searching'
  | 'tracking'
  | 'failed';

export interface HeadPose {
  /** Radians, positive when the head turns to the visitor's left. */
  yaw: number;
  /** Radians, positive when the chin lifts. */
  pitch: number;
  /** Metres from the calibration pose, positive to the visitor's right. */
  x: number;
  /** Metres from the calibration pose, positive upward. */
  y: number;
  /** Metres from the calibration pose, positive toward the screen. */
  z: number;
}

export interface HeadTrackingCamera {
  id: string;
  label: string;
}

/** The tracker only runs this often. Sixty would spend frames on nothing. */
const DETECT_INTERVAL_MS = 33;
/** After this long with no face, ease back to centre rather than freeze. */
const LOST_AFTER_MS = 600;
/** Below this the reading is the sensor talking to itself. */
const TRANSLATION_DEADZONE_M = 0.004;
const ROTATION_DEADZONE_RAD = 0.012;

const VISION_BUNDLE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs';
const VISION_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

interface FaceLandmarkerResultLike {
  facialTransformationMatrixes?: Array<{ data: number[] }>;
}

interface FaceLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestamp: number): FaceLandmarkerResultLike;
  close(): void;
}

interface VisionModule {
  FilesetResolver: { forVisionTasks(path: string): Promise<unknown> };
  FaceLandmarker: {
    createFromOptions(fileset: unknown, options: Record<string, unknown>): Promise<FaceLandmarkerLike>;
  };
}

export class HeadTracking {
  status: HeadTrackingStatus = 'idle';
  message = '';
  /** The pose the world should use: smoothed, and relative to the calibration. */
  readonly pose: HeadPose = { yaw: 0, pitch: 0, x: 0, y: 0, z: 0 };

  private landmarker?: FaceLandmarkerLike;
  private stream?: MediaStream;
  private video?: HTMLVideoElement;
  private deviceId?: string;
  private lastDetectAt = 0;
  private lastFaceAt = 0;
  private starting = false;
  /**
   * A review browser has no face to hold up to it, so the fixture drives the
   * same maths with poses it makes up. Everything downstream — the deadzone,
   * the calibration, the easing, the world's window — is the live path.
   */
  private reviewMode = false;

  /** The raw reading, before the calibration pose is taken off it. */
  private readonly raw: HeadPose = { yaw: 0, pitch: 0, x: 0, y: 0, z: 0 };
  private reference?: HeadPose;
  private readonly target: HeadPose = { yaw: 0, pitch: 0, x: 0, y: 0, z: 0 };
  private frames = 0;

  private readonly matrix = new THREE.Matrix4();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  get running(): boolean {
    return this.reviewMode || Boolean(this.landmarker && this.stream);
  }

  /** Loopback fixtures only: run the mapping with no camera behind it. */
  startForReview(): void {
    this.reviewMode = true;
    this.status = 'tracking';
    this.message = '';
    this.reference = undefined;
    this.frames = 0;
    this.lastFaceAt = 0;
  }

  /**
   * Cameras this browser will admit to having. Labels are blank until the
   * visitor has granted access once, which is why the picker is only worth
   * showing after tracking has started.
   */
  async cameras(): Promise<HeadTrackingCamera[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          id: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Ask for the camera, fetch the model, and begin. Must be called from a
   * visitor's own gesture: a browser will not hand over a camera otherwise, and
   * neither should this.
   */
  async start(deviceId?: string): Promise<boolean> {
    if (this.starting) return this.running;
    if (this.running && deviceId === this.deviceId) return true;
    this.starting = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        this.status = 'unsupported';
        this.message = 'This browser will not open a camera on this page.';
        return false;
      }
      this.stop();
      this.status = 'loading';
      const landmarker = await this.loadLandmarker();
      if (!landmarker) return false;
      this.status = 'requesting';
      const stream = await this.openCamera(deviceId);
      if (!stream) return false;
      this.landmarker = landmarker;
      this.stream = stream;
      this.deviceId = deviceId;
      this.status = 'searching';
      this.message = '';
      this.reference = undefined;
      this.frames = 0;
      return true;
    } finally {
      this.starting = false;
    }
  }

  private async loadLandmarker(): Promise<FaceLandmarkerLike | undefined> {
    try {
      // Loaded only now, and only for a visitor who asked for it. It is several
      // megabytes of WebAssembly and model weights, which is not something to
      // spend on somebody who came to watch a film.
      const vision = await import(/* @vite-ignore */ VISION_BUNDLE) as unknown as VisionModule;
      const fileset = await vision.FilesetResolver.forVisionTasks(VISION_WASM);
      return await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        // The head's own pose, rather than four hundred landmarks we would then
        // have to fit a pose to ourselves.
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: false,
      });
    } catch (error) {
      this.status = 'failed';
      this.message = error instanceof Error ? error.message : 'The tracker could not be loaded.';
      return undefined;
    }
  }

  private async openCamera(deviceId?: string): Promise<MediaStream | undefined> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: 640, height: 480 }
          : { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      });
      const video = document.createElement('video');
      video.playsInline = true;
      video.muted = true;
      video.srcObject = stream;
      // Never attached to the document. There is no reason for the visitor's
      // own face to be on screen, and every reason for it not to be.
      await video.play();
      this.video = video;
      return stream;
    } catch (error) {
      const denied = error instanceof DOMException
        && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      this.status = denied ? 'denied' : 'failed';
      this.message = denied
        ? 'Camera access was refused.'
        : error instanceof Error ? error.message : 'No camera could be opened.';
      return undefined;
    }
  }

  stop(): void {
    this.reviewMode = false;
    this.landmarker?.close();
    this.landmarker = undefined;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = undefined;
    if (this.video) {
      this.video.srcObject = null;
      this.video = undefined;
    }
    this.reference = undefined;
    this.frames = 0;
    this.pose.yaw = 0;
    this.pose.pitch = 0;
    this.pose.x = 0;
    this.pose.y = 0;
    this.pose.z = 0;
    this.target.yaw = 0;
    this.target.pitch = 0;
    this.target.x = 0;
    this.target.y = 0;
    this.target.z = 0;
    if (this.status !== 'denied' && this.status !== 'failed' && this.status !== 'unsupported') {
      this.status = 'idle';
    }
  }

  /** However the head is held now becomes straight ahead. */
  recenter(): void {
    if (!this.frames) {
      this.reference = undefined;
      return;
    }
    this.reference = { ...this.raw };
  }

  /**
   * Read the camera and ease the pose toward it.
   *
   * Unlike a phone's gyroscope — which the operating system has already fused
   * and which should be applied whole — this is a guess made from pixels
   * thirty times a second, and it jitters. Easing is the difference between a
   * window and a shiver. It is frame-rate independent, and translation is held
   * a little softer than rotation because a wobbling viewpoint is worse than a
   * wobbling aim.
   */
  update(now: number, delta: number): void {
    if (this.running && now - this.lastDetectAt >= DETECT_INTERVAL_MS) {
      this.lastDetectAt = now;
      this.detect(now);
    }
    if (!this.reviewMode && this.running && this.lastFaceAt && now - this.lastFaceAt > LOST_AFTER_MS) {
      // Nobody in front of the camera. Drift home rather than hold the last
      // pose, which would leave the world leaning until somebody sat back down.
      this.target.yaw = 0;
      this.target.pitch = 0;
      this.target.x = 0;
      this.target.y = 0;
      this.target.z = 0;
      if (this.status === 'tracking') this.status = 'searching';
    }
    const rotationEase = 1 - Math.exp(-delta * 11);
    const positionEase = 1 - Math.exp(-delta * 8);
    this.pose.yaw += (this.target.yaw - this.pose.yaw) * rotationEase;
    this.pose.pitch += (this.target.pitch - this.pose.pitch) * rotationEase;
    this.pose.x += (this.target.x - this.pose.x) * positionEase;
    this.pose.y += (this.target.y - this.pose.y) * positionEase;
    this.pose.z += (this.target.z - this.pose.z) * positionEase;
  }

  private detect(now: number): void {
    const video = this.video;
    if (!video || !this.landmarker || video.readyState < 2) return;
    let result: FaceLandmarkerResultLike;
    try {
      result = this.landmarker.detectForVideo(video, now);
    } catch {
      return;
    }
    const data = result.facialTransformationMatrixes?.[0]?.data;
    if (!data || data.length < 16) return;
    this.applyMatrix(data);
    this.lastFaceAt = now;
    this.status = 'tracking';
  }

  /**
   * The tracker's own 4x4, column-major, placing the face in a space measured
   * from the camera in centimetres: x to the visitor's right as the camera sees
   * it, y up, z away from the lens.
   *
   * Exposed rather than private so a loopback fixture can drive it without a
   * camera — there is no way to hold a face up to a review browser.
   */
  applyMatrix(data: ArrayLike<number>): void {
    this.matrix.fromArray(Array.from(data));
    this.euler.setFromRotationMatrix(this.matrix, 'YXZ');
    this.raw.yaw = this.euler.y;
    this.raw.pitch = this.euler.x;
    // Centimetres to metres. The camera is a mirror, so the x the tracker
    // reports grows as the visitor moves to their own left.
    this.raw.x = -this.matrix.elements[12] / 100;
    this.raw.y = this.matrix.elements[13] / 100;
    this.raw.z = this.matrix.elements[14] / 100;
    this.frames += 1;
    if (!this.reference) this.reference = { ...this.raw };
    const reference = this.reference;
    this.target.yaw = deadzone(this.raw.yaw - reference.yaw, ROTATION_DEADZONE_RAD);
    this.target.pitch = deadzone(this.raw.pitch - reference.pitch, ROTATION_DEADZONE_RAD);
    this.target.x = deadzone(this.raw.x - reference.x, TRANSLATION_DEADZONE_M);
    this.target.y = deadzone(this.raw.y - reference.y, TRANSLATION_DEADZONE_M);
    // Toward the lens is toward the screen, so the sign flips to read as
    // "leaning in".
    this.target.z = deadzone(-(this.raw.z - reference.z), TRANSLATION_DEADZONE_M);
  }

  snapshot(): Record<string, unknown> {
    const round = (value: number) => Number(value.toFixed(4));
    return {
      status: this.status,
      message: this.message,
      running: this.running,
      frames: this.frames,
      calibrated: Boolean(this.reference),
      cameraId: this.deviceId ?? null,
      pose: {
        yaw: round(this.pose.yaw),
        pitch: round(this.pose.pitch),
        x: round(this.pose.x),
        y: round(this.pose.y),
        z: round(this.pose.z),
      },
      target: {
        yaw: round(this.target.yaw),
        pitch: round(this.target.pitch),
        x: round(this.target.x),
        y: round(this.target.y),
        z: round(this.target.z),
      },
    };
  }
}

/** Nothing below the threshold, and no step at it either. */
function deadzone(value: number, threshold: number): number {
  if (value > threshold) return value - threshold;
  if (value < -threshold) return value + threshold;
  return 0;
}
