export class AmbientAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private ambient?: GainNode;
  private screening?: GainNode;
  private muted = true;
  private masterVolume = 0.7;
  private ambientVolume = 0.28;
  private screeningVolume = 0.85;

  async start(muted: boolean): Promise<void> {
    this.muted = muted;
    if (!this.context) this.createGraph();
    await this.context?.resume();
    this.applyVolumes();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
  }

  setMasterVolume(value: number): void {
    this.masterVolume = value;
    this.applyVolumes();
  }

  setAmbientVolume(value: number): void {
    this.ambientVolume = value;
    this.applyVolumes();
  }

  setScreeningVolume(value: number): void {
    this.screeningVolume = value;
    this.applyVolumes();
  }

  private createGraph(): void {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.ambient = this.context.createGain();
    this.screening = this.context.createGain();

    this.ambient.connect(this.master);
    this.screening.connect(this.master);
    this.master.connect(this.context.destination);

    const buffer = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      samples[index] = last * 1.8;
    }

    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    filter.Q.value = 0.6;
    source.buffer = buffer;
    source.loop = true;
    source.connect(filter);
    filter.connect(this.ambient);
    source.start();

    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.context || !this.master || !this.ambient || !this.screening) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, now, 0.08);
    this.ambient.gain.setTargetAtTime(this.ambientVolume, now, 0.08);
    this.screening.gain.setTargetAtTime(this.screeningVolume, now, 0.08);
  }
}
