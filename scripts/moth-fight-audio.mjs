// Give the native decoder time to settle before the first recorded sample.
// Silent AAC frames prepare playback while the chart waits at its start.
export function prependAudioSilence(data, seconds = .35) {
  const bytes = new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const containers = new Set(['moov', 'trak', 'edts', 'mdia', 'minf', 'stbl']);
  const boxes = [];
  const read = (from, end) => {
    for (let at = from; at < end;) {
      const size = view.getUint32(at) || end - at;
      const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
      if (size < 8 || at + size > end) throw new Error("Invalid audio container");
      const box = { at, size, type };
      boxes.push(box);
      if (containers.has(type)) read(at + 8, at + size);
      at += size;
    }
  };
  read(0, bytes.length);
  const find = type => {
    const matching = boxes.filter(box => box.type === type);
    if (matching.length !== 1) throw new Error("Unsupported audio track layout");
    return matching[0];
  };
  const movie = find('mvhd'), header = find('tkhd'), media = find('mdhd');
  const edit = find('elst'), chunks = find('stco'), samples = find('stsz');
  const timing = find('stts'), chunkSamples = find('stsc'), movieBox = find('moov'), payload = find('mdat');
  const sampleRate = view.getUint32(media.at + 20);
  if ([movie, header, media, edit].some(box => view.getUint8(box.at + 8) !== 0)
    || ![44100, 96000].includes(sampleRate) || view.getUint32(samples.at + 12) !== 0
    || movieBox.at > payload.at) throw new Error("Unsupported fight audio format");
  // A stereo AAC-LC silent frame, verified at both source sample rates. Actual
  // packets keeps one continuous media timeline through the silent lead.
  const silent = new Uint8Array([33, 16, 4, 96, 140, 28]);
  const frames = Math.ceil(seconds * sampleRate / 1024);
  const lead = frames * 1024 / sampleRate;
  const units = Math.round(lead * view.getUint32(movie.at + 20));
  const replacements = new Map();
  const clone = box => {
    const result = bytes.slice(box.at, box.at + box.size);
    replacements.set(box.at, result);
    return new DataView(result.buffer);
  };
  for (const [box, duration, extra] of [[movie, 24, units], [header, 28, units], [media, 24, frames * 1024]]) {
    clone(box).setUint32(duration, view.getUint32(box.at + duration) + extra);
  }
  clone(edit).setUint32(16, view.getUint32(edit.at + 16) + units);
  clone(timing).setUint32(16, view.getUint32(timing.at + 16) + frames);
  const originalCount = view.getUint32(samples.at + 16);
  const sizes = new Uint8Array(samples.size + frames * 4);
  sizes.set(bytes.subarray(samples.at, samples.at + 20));
  sizes.set(bytes.subarray(samples.at + 20, samples.at + samples.size), 20 + frames * 4);
  const sizeView = new DataView(sizes.buffer);
  sizeView.setUint32(0, sizes.length);
  sizeView.setUint32(16, originalCount + frames);
  for (let index = 0; index < frames; index++) sizeView.setUint32(20 + index * 4, silent.length);
  replacements.set(samples.at, sizes);

  const chunkCount = view.getUint32(chunks.at + 12);
  const rules = [];
  const ruleCount = view.getUint32(chunkSamples.at + 12);
  for (let index = 0; index < ruleCount; index++) {
    const at = chunkSamples.at + 16 + index * 12;
    rules.push([view.getUint32(at), view.getUint32(at + 4), view.getUint32(at + 8)]);
  }
  const revised = [];
  let rule = 0;
  for (let chunk = 1; chunk <= chunkCount; chunk++) {
    if (rules[rule + 1]?.[0] === chunk) rule++;
    const count = rules[rule][1] + (chunk === 1 ? frames : 0);
    const description = rules[rule][2];
    if (revised.at(-1)?.[1] !== count || revised.at(-1)?.[2] !== description) revised.push([chunk, count, description]);
  }
  const mapping = new Uint8Array(16 + revised.length * 12);
  mapping.set(bytes.subarray(chunkSamples.at, chunkSamples.at + 16));
  const mappingView = new DataView(mapping.buffer);
  mappingView.setUint32(0, mapping.length);
  mappingView.setUint32(12, revised.length);
  revised.forEach((entry, index) => entry.forEach((value, column) => mappingView.setUint32(16 + index * 12 + column * 4, value)));
  replacements.set(chunkSamples.at, mapping);
  const groups = boxes.find(box => box.type === 'sbgp');
  if (groups && view.getUint8(groups.at + 8) === 0) clone(groups).setUint32(20, view.getUint32(groups.at + 20) + frames);

  const join = parts => {
    const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
    let at = 0;
    for (const part of parts) { result.set(part, at); at += part.length; }
    return result;
  };
  const rebuild = box => {
    if (replacements.has(box.at)) return replacements.get(box.at);
    if (!containers.has(box.type)) return bytes.subarray(box.at, box.at + box.size);
    const children = [];
    for (let at = box.at + 8; at < box.at + box.size;) {
      const child = boxes.find(candidate => candidate.at === at);
      children.push(rebuild(child));
      at += child.size;
    }
    const result = join([bytes.subarray(box.at, box.at + 8), ...children]);
    new DataView(result.buffer).setUint32(0, result.length);
    return result;
  };
  const headerGrowth = rebuild(movieBox).length - movieBox.size;
  const offsets = clone(chunks);
  for (let index = 0; index < chunkCount; index++) {
    const at = 16 + index * 4, offset = view.getUint32(chunks.at + at);
    offsets.setUint32(at, offset + headerGrowth + (index > 0 ? frames * silent.length : 0));
  }
  const prefix = join(Array.from({ length: frames }, () => silent));
  const mediaBytes = join([bytes.subarray(payload.at, payload.at + 8), prefix, bytes.subarray(payload.at + 8, payload.at + payload.size)]);
  new DataView(mediaBytes.buffer).setUint32(0, mediaBytes.length);
  replacements.set(payload.at, mediaBytes);
  const top = [];
  for (let at = 0; at < bytes.length;) {
    const box = boxes.find(candidate => candidate.at === at);
    top.push(rebuild(box));
    at += box.size;
  }
  return { data: join(top), lead, sampleRate };
}

export function patchFightAudio(once) {
  once('  getRhythmAudioFor(theme) {\n', `  getRhythmAudioFor(theme) {
    const track = this.getFightAudioPlayer(theme);
    if (theme && track) track.mothFightAudio = true;
    return track;
  }

  getFightAudioPlayer(theme) {
`);
  once('      await this.adoptSongCopy(track);\n',
    '      await this.adoptSongCopy(track);\n      await this.prepareFightAudioStart(track);\n');
  once('      if (source && track.getAttribute(\'src\') !== this.mirroredAudioUrl(source)) {',
    '      if (source && track.getAttribute(\'src\') !== (track.mothFightCopy || this.mirroredAudioUrl(source))) {');
  once('    if (this.hasBakedFades(spec)) return 0;\n',
    '    const lead = this.getActiveLevel1OfficeRhythmAudio()?.mothFightLead || 0;\n    if (this.hasBakedFades(spec)) return lead;\n');
  once('    return Number.isFinite(start) && start > 0 ? start : 0;\n',
    '    return (Number.isFinite(start) && start > 0 ? start : 0) + lead;\n');
  once('      track.currentTime = this.getRhythmAudioStart();\n      track.volume = 0;',
    '      track.currentTime = this.getRhythmPlaybackStart();\n      track.volume = 0;');
  once('      const start = this.getRhythmAudioStart();\n',
    '      const start = this.getRhythmPlaybackStart();\n');
  once('this.primeRhythmTrack(track, this.getRhythmAudioStart()).then',
    'this.primeRhythmTrack(track, this.getRhythmPlaybackStart()).then');
  once('track.currentTime < this.getRhythmAudioStart() || (!track.currentTime && this.songTime > 0)',
    'track.currentTime < this.getRhythmPlaybackStart() || (!track.currentTime && this.songTime > 0)');
  once('      ? audio.duration : spec.duration || this.config?.duration || 120;',
    '      ? audio.duration - (audio.mothFightLead || 0) : spec.duration || this.config?.duration || 120;');
  once('Math.abs(fullSongTrack.duration - spec.duration) <= 0.25',
    'Math.abs(fullSongTrack.duration - (fullSongTrack.mothFightLead || 0) - spec.duration) <= 0.25');
  once('      fresh.loop = track.loop;\n      fresh.playbackRate = track.playbackRate;',
    `      fresh.loop = track.loop;
      fresh.mothAudioSource = track.mothAudioSource;
      fresh.mothFightAudio = track.mothFightAudio;
      fresh.mothFightLead = track.mothFightLead;
      fresh.mothFightCopy = track.mothFightCopy;
      fresh.playbackRate = track.playbackRate;`);
  once('    const fresh = new Audio(source);\n',
    '    this.releaseFightAudioStart(track);\n    const fresh = new Audio(source);\n');
  once('    if (this.gameAudioRegistry) this.gameAudioRegistry = new Set([...this.gameAudioRegistry].map(replace));',
    `    if (this.preparedFightAudioTrack) this.preparedFightAudioTrack = replace(this.preparedFightAudioTrack);
    if (this.gameAudioRegistry) this.gameAudioRegistry = new Set([...this.gameAudioRegistry].map(replace));`);
  once('  primeRhythmSong(rhythm, track) {\n',
    '  async primeRhythmSong(rhythm, track) {\n    await this.prepareFightAudioStart(track);\n');
  once('      : rhythm?.result ? `result ${rhythm.result.rank || rhythm.reviewResult}`',
    `      : rhythm && this.getActiveLevel1OfficeRhythmAudio()?.currentTime < this.getRhythmAudioStart() ? "audio warm-up"
      : rhythm?.result ? \`result \${rhythm.result.rank || rhythm.reviewResult}\``);
  once('    if (!playing || (!track.seeking',
    `    if (playing && track.currentTime < (track.mothFightLead || 0)) {
      rhythm.stalledSince = performance.now();
      return true;
    }
    if (!playing || (!track.seeking`);
  once('  isBakedMusicTrack(audio) {\n', FIGHT_AUDIO_METHODS + '\n  isBakedMusicTrack(audio) {\n');
  return '\n' + prependAudioSilence.toString() + '\n';
}

const FIGHT_AUDIO_METHODS = String.raw`
  getRhythmPlaybackStart() {
    return this.getRhythmAudioStart() - (this.getActiveLevel1OfficeRhythmAudio()?.mothFightLead || 0);
  }

  releaseFightAudioStart(track) {
    if (!track?.mothFightCopy) return;
    const source = this.canonicalAudioSource(track);
    track.pause();
    this.audioFades = (this.audioFades || []).filter(fade => fade.audio !== track);
    URL.revokeObjectURL(track.mothFightCopy);
    track.mothFightCopy = null;
    track.mothFightLead = 0;
    track.preload = "none";
    track.src = this.mirroredAudioUrl(source) || source;
    this.primedRhythmTracks?.delete(track);
    if (this.preparedFightAudioTrack === track) this.preparedFightAudioTrack = null;
  }

  async prepareFightAudioStart(track) {
    if (!track?.mothFightAudio || track.mothFightCopy) return;
    if (track.mothFightPreparing) return track.mothFightPreparing;
    const source = this.canonicalAudioSource(track);
    const ready = track.mothFightPreparing = (async () => {
      const copy = await this.songCopy(source);
      if (!copy) throw new Error("The fight song could not be prepared");
      await this.rhythmTrackPriming?.get(track);
      track.pause();
      if (this.preparedFightAudioTrack && this.preparedFightAudioTrack !== track) {
        this.releaseFightAudioStart(this.preparedFightAudioTrack);
      }
      const bytes = await fetch(copy).then(response => response.arrayBuffer());
      const padded = prependAudioSilence(bytes);
      track.mothAudioSource = source;
      track.mothFightLead = padded.lead;
      track.mothFightCopy = URL.createObjectURL(new Blob([padded.data], { type: "audio/mp4" }));
      this.preparedFightAudioTrack = track;
      track.src = track.mothFightCopy;
      const route = this.musicAudioRoutes?.get(track);
      if (route) route.playedSource = track.mothFightCopy;
      track.load();
    })();
    try { await ready; }
    finally { if (track.mothFightPreparing === ready) track.mothFightPreparing = null; }
  }
`;
