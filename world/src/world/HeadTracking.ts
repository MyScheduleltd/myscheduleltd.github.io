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
  /** Radians, positive when the chin lifts and the view should rise with it. */
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
/**
 * No single download may sit there for longer than this. Generous on purpose:
 * the complaint being fixed is a load that never ends, not one that takes a
 * while, and cutting off a slow connection mid-download would turn a working
 * feature into a broken one on exactly the machines least able to spare it.
 */
const FETCH_TIMEOUT_MS = 120_000;
/** Nor may building the tracker, which is where a bad runtime path hangs. */
const BUILD_TIMEOUT_MS = 25_000;
/** After this long with no face, ease back to centre rather than freeze. */
const LOST_AFTER_MS = 600;
/** Below this the reading is the sensor talking to itself. */
const TRANSLATION_DEADZONE_M = 0.004;
const ROTATION_DEADZONE_RAD = 0.012;

/**
 * Pinned, and the pin is checked against the registry rather than remembered:
 * `@mediapipe/tasks-vision` left the `0.10.x` line for `1.0.x`, and a version
 * that never existed is a 404 the moment somebody presses the button. Confirm
 * all three of these resolve before changing any of them.
 */
const VISION_VERSION = '1.0.1';
const VISION_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/vision_bundle.mjs`;
const VISION_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
/**
 * The SIMD build, chosen rather than detected. `FilesetResolver.forVisionTasks`
 * would feature-test and pick for us, but it does its own fetching by URL,
 * which is the one thing this must not hand off — see `fetchWithoutStoring`.
 * Every browser that can hold a camera open and run a WebGL festival has had
 * WebAssembly SIMD for years; if one has not, the load fails and says so.
 */
const VISION_WASM_LOADER = `${VISION_WASM}/vision_wasm_internal.js`;
const VISION_WASM_BINARY = `${VISION_WASM}/vision_wasm_internal.wasm`;
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/**
 * What each of those four files must hash to.
 *
 * This is the part that matters, and pinning a version is not a substitute for
 * it. Code fetched from a CDN runs with everything this page has, and this page
 * can hold a camera open — so a compromised CDN, a hijacked package or anything
 * sitting between the visitor and jsDelivr would be a webcam in a stranger's
 * hands, on a site whose own panel promises the video never leaves the machine.
 *
 * `<script integrity>` cannot help here: none of this arrives through a script
 * tag. Because the bytes are fetched by hand for the no-store guarantee, they
 * can be weighed before anything is allowed to run, which is the same promise
 * Subresource Integrity makes and the reason the fetching is worth doing.
 *
 * Regenerate after changing any URL, and never by trusting what is served now:
 *   curl -s --compressed -L <url> | openssl dgst -sha256 -binary | openssl base64 -A
 * A mismatch means the file changed. It is not something to paper over by
 * updating the digest without knowing why it moved.
 */
const INTEGRITY: Record<string, string> = {
  [VISION_BUNDLE]: 'sha256-2IVjDCl8CyCx/oYJbLBikcTICAh28nhS5yTySsYDcT8=',
  [VISION_WASM_LOADER]: 'sha256-4XDuZ91OFsGm/NiECiBmh+WlmyLCDkqQK8RFsJVFTXM=',
  [VISION_WASM_BINARY]: 'sha256-jaJ3pzOSbqzQR0uHBLNnQtbsMjHFeoYMW4id/48d+IY=',
  [FACE_MODEL]: 'sha256-ZBhOIpsmMQe8K4BMZiXbE0H/K7cxh0sLzC/mVE4Lyf8=',
};

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
  /** Which of the three downloads was in flight, so a failure can name it. */
  private loadStage = 'the tracker library';
  /**
   * Set when the runtime had to come the ordinary cached way. The panel says
   * nothing is written to the visitor's machine, so on the rare path where that
   * stops being wholly true, it has to be said rather than quietly dropped.
   */
  private runtimeCached = false;
  private prefetching = false;
  /**
   * Whether the visitor has said the browser may keep the tracker.
   *
   * Off by default, and the panel says which mode it is in either way: the
   * promise that nothing is written to their machine is only worth making if it
   * is also visibly withdrawn when they choose otherwise.
   */
  private remember = false;
  /**
   * The tracker, held in memory for as long as the page is open and written
   * nowhere. Kept across a stop and start so that turning tracking off and on
   * again does not fetch fifteen megabytes twice; it all goes when the tab does.
   */
  private modelBuffer?: Uint8Array;
  private wasmFileset?: { wasmLoaderPath: string; wasmBinaryPath: string };
  private bundle?: VisionModule;
  private readonly objectUrls: string[] = [];

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

  /**
   * Fetch the library, the runtime and the model, and build the tracker —
   * without asking for a camera.
   *
   * This is the half that broke in the field: a pinned version that did not
   * exist, so the first press produced a 404 and nothing else. A review browser
   * has no face to offer, but it can prove every download resolves and that the
   * tracker will build, which is what that failure actually was.
   */
  async loadForReview(): Promise<boolean> {
    this.status = 'loading';
    const landmarker = await this.loadLandmarker();
    if (!landmarker) return false;
    this.landmarker?.close();
    this.landmarker = landmarker;
    this.startForReview();
    return true;
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
      // Not from inside somebody else's frame. A page that has framed this one
      // can put its own overlay over this panel and steer a visitor into
      // pressing the button underneath — and the one control on the page that
      // reaches for a camera is exactly the one worth stealing a click on. The
      // browser would still name the real origin in its own prompt, but the
      // honest answer is that a festival has no business running in a frame.
      if (window.top !== window.self) {
        this.status = 'unsupported';
        this.message = 'Head tracking is not available inside an embedded frame.';
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

  /**
   * Fetch something without letting the browser keep a copy.
   *
   * `cache: 'no-store'` is a promise to the visitor, not an optimisation: the
   * browser is required not to write the response to its HTTP cache, so nothing
   * of the tracker lands on the disk of a machine whose owner only wanted to
   * look around a film festival. What comes back is turned into an object URL
   * that lives in this tab's memory and dies with it.
   *
   * The cost is real and deliberate: there is no second visit that starts
   * faster. Within one page it is fetched once and kept, so turning tracking
   * off and on again is free.
   */
  /** Let the browser keep the tracker between visits, or not. */
  setRemember(remember: boolean): void {
    this.remember = remember;
  }

  remembering(): boolean {
    return this.remember;
  }

  private async fetchWithoutStoring(url: string): Promise<ArrayBuffer> {
    // A request with no deadline is the reason a stuck load looked like a slow
    // one for ever. Aborted rather than left hanging, so the failure has a name.
    const abort = new AbortController();
    const deadline = window.setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        // 'default' lets the browser store and reuse it, which is the whole
        // point of the setting; 'no-store' obliges it not to.
        cache: this.remember ? 'default' : 'no-store',
        mode: 'cors',
        credentials: 'omit',
        signal: abort.signal,
      });
    } catch (error) {
      window.clearTimeout(deadline);
      if (abort.signal.aborted) throw new Error(`Timed out fetching ${url}.`);
      throw error;
    }
    window.clearTimeout(deadline);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url}`);
    const bytes = await response.arrayBuffer();
    const expected = INTEGRITY[url];
    if (!expected) throw new Error(`No integrity digest is recorded for ${url}.`);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    let binary = '';
    for (const byte of digest) binary += String.fromCharCode(byte);
    const actual = `sha256-${btoa(binary)}`;
    if (actual !== expected) {
      // Nothing runs, nothing is decoded, and the visitor is told. A file that
      // is not the one this was built against is not a file to execute beside
      // an open camera.
      throw new Error(`${url} did not match its recorded digest (${actual}).`);
    }
    return bytes;
  }

  /** A verified buffer, handed to the runtime as a URL it can load from. */
  private toObjectUrl(bytes: ArrayBuffer, type: string): string {
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type }));
    this.objectUrls.push(objectUrl);
    return objectUrl;
  }

  private async loadLandmarker(): Promise<FaceLandmarkerLike | undefined> {
    try {
      // Fetched only now, and only for a visitor who asked for it. About seven
      // megabytes over the wire — a three-megabyte WebAssembly runtime and a
      // three-and-a-half-megabyte model, both already compressed — which is not
      // something to spend on somebody who came to watch a film. (The runtime
      // is 11.7MB uncompressed; measure what is transferred, not what is on
      // disk at the far end.)
      await this.fetchAll();
      this.loadStage = 'the tracker';
      return await this.buildLandmarker();
    } catch (error) {
      this.status = 'failed';
      const detail = error instanceof Error ? error.message : String(error);
      this.message = `Could not load ${this.loadStage}. ${detail}`;
      return undefined;
    }
  }

  /**
   * Pull down everything the tracker needs, **all four at once**.
   *
   * These used to come one after another, so seven megabytes was spent in
   * single file: the three-megabyte runtime waited on a forty-four-kilobyte
   * library, and the three-and-a-half-megabyte model waited on the runtime. The
   * two big ones have nothing to say to each other and there is no reason for
   * either to wait.
   *
   * Safe to call more than once and safe to call early — anything already in
   * hand is skipped, so opening the panel can start this while the visitor is
   * still reading it.
   */
  async fetchAll(): Promise<void> {
    if (this.bundle && this.wasmFileset && this.modelBuffer) return;
    this.loadStage = 'the tracker files (about 7 MB)';
    const [bundleBytes, loaderBytes, wasmBytes, modelBytes] = await Promise.all([
      this.bundle ? undefined : this.fetchWithoutStoring(VISION_BUNDLE),
      this.wasmFileset ? undefined : this.fetchWithoutStoring(VISION_WASM_LOADER),
      this.wasmFileset ? undefined : this.fetchWithoutStoring(VISION_WASM_BINARY),
      this.modelBuffer ? undefined : this.fetchWithoutStoring(FACE_MODEL),
    ]);
    if (bundleBytes) {
      // Imported from a blob rather than from the CDN URL directly, because an
      // `import()` of a real URL is cached like any other script and this must
      // leave nothing behind.
      const bundleUrl = this.toObjectUrl(bundleBytes, 'text/javascript');
      this.bundle = await import(/* @vite-ignore */ bundleUrl) as unknown as VisionModule;
    }
    if (loaderBytes && wasmBytes) {
      // Explicit paths rather than `FilesetResolver.forVisionTasks`, which
      // fetches by URL itself and would put the runtime straight into the disk
      // cache.
      this.wasmFileset = {
        wasmLoaderPath: this.toObjectUrl(loaderBytes, 'text/javascript'),
        wasmBinaryPath: this.toObjectUrl(wasmBytes, 'application/wasm'),
      };
    }
    if (modelBytes) this.modelBuffer = new Uint8Array(modelBytes);
  }

  /**
   * Start the download without asking for a camera, so the seconds a visitor
   * spends reading the panel are not seconds they spend waiting afterwards.
   * Failures are swallowed: this is an optimisation, and pressing the button is
   * what is allowed to report one.
   */
  prefetch(): void {
    if (this.prefetching || this.starting) return;
    this.prefetching = true;
    void this.fetchAll()
      .catch(() => undefined)
      .finally(() => { this.prefetching = false; });
  }

  /**
   * Build the tracker, and do not accept silence for an answer.
   *
   * The runtime's loader script is handed over as a blob so that nothing of it
   * reaches the disk. Emscripten works out where to look for its own files from
   * where that script was loaded, and from a blob URL that resolves to nothing
   * useful — on some browsers it then waits rather than failing, which is a hang
   * with no error attached to it and is exactly how this was reported.
   *
   * So: a deadline, and one retry down the ordinary path with real URLs. That
   * second attempt lets the browser cache the three-megabyte runtime, which the
   * panel has promised it would not, so it is recorded and said out loud. The
   * model — the larger half — still goes in as a buffer either way.
   */
  private async buildLandmarker(): Promise<FaceLandmarkerLike | undefined> {
    const options = {
      // The weights themselves, not a path to them. A path would be fetched by
      // the runtime and cached the ordinary way.
      baseOptions: { modelAssetBuffer: this.modelBuffer, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      // The head's own pose, rather than four hundred landmarks we would then
      // have to fit a pose to ourselves.
      outputFacialTransformationMatrixes: true,
      outputFaceBlendshapes: false,
    };
    const bundle = this.bundle;
    if (!bundle) throw new Error('The tracker library did not load.');
    try {
      return await this.withDeadline(
        bundle.FaceLandmarker.createFromOptions(this.wasmFileset, options),
        BUILD_TIMEOUT_MS,
      );
    } catch {
      this.loadStage = 'the tracker runtime, the ordinary way';
      const fileset = await this.withDeadline(
        bundle.FilesetResolver.forVisionTasks(VISION_WASM),
        FETCH_TIMEOUT_MS,
      );
      const landmarker = await this.withDeadline(
        bundle.FaceLandmarker.createFromOptions(fileset, options),
        BUILD_TIMEOUT_MS,
      );
      this.runtimeCached = true;
      return landmarker;
    }
  }

  private withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      work,
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error(`Timed out on ${this.loadStage}.`)), ms);
      }),
    ]);
  }

  /**
   * Let go of the tracker itself. Separate from `stop()`, which runs every time
   * a visitor leaves VR — the point of holding these is that going back in does
   * not fetch them again.
   */
  release(): void {
    this.stop();
    for (const objectUrl of this.objectUrls) URL.revokeObjectURL(objectUrl);
    this.objectUrls.length = 0;
    this.modelBuffer = undefined;
    this.wasmFileset = undefined;
    this.bundle = undefined;
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
    // Confirmed against a real face on 2026-09-04: yaw came out the right way
    // round, pitch did not — lifting the chin looked down. The tracker measures
    // the face's own rotation in front of the lens, and the lens is looking
    // back at it, so the vertical axis arrives mirrored where the horizontal
    // one does not. This is the only place any of these signs live.
    this.raw.pitch = -this.euler.x;
    // Centimetres to metres, and every sign the visitor can feel is settled
    // here so the deltas below are plain subtraction.
    //
    // Confirmed against a real face on 2026-09-04: side to side and up and
    // down were already the right way round; **z was not** — leaning in pushed
    // the view back. The lens is looking at the face rather than out with it,
    // so both axes that point along its line — pitch above, and depth here —
    // arrive mirrored, while the two across it do not.
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
    this.target.z = deadzone(this.raw.z - reference.z, TRANSLATION_DEADZONE_M);
  }

  snapshot(): Record<string, unknown> {
    const round = (value: number) => Number(value.toFixed(4));
    return {
      status: this.status,
      message: this.message,
      running: this.running,
      remember: this.remember,
      loadStage: this.loadStage,
      runtimeCached: this.runtimeCached,
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
