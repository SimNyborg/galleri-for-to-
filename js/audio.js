// Al lyd er syntetiseret med Web Audio, så der ikke skal hentes lydfiler.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
    this.zone = 'outside';
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(c.destination);
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.2);
    this.reverbGain = c.createGain();
    this.reverbGain.gain.value = 0.35;
    this.reverb.connect(this.reverbGain).connect(this.master);
    this.sfx = c.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);
    this.sfx.connect(this.reverb);
    this.music = c.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);
    this.music.connect(this.reverb);
    this.crowd = c.createGain();
    this.crowd.gain.value = 0;
    this.crowd.connect(this.master);
    this.noise = this.noiseBuffer(2);
    this.startCrowd();
    this.startMusic();
    this.started = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }

  setZone(zone) {
    if (!this.ctx || zone === this.zone) return;
    this.zone = zone;
    const t = this.ctx.currentTime;
    this.crowd.gain.setTargetAtTime(zone === 'outside' ? 0.05 : 0.0, t, 1.2);
    this.music.gain.setTargetAtTime(zone === 'outside' ? 0.05 : 0.16, t, 1.5);
  }

  impulse(sec, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  noiseBuffer(sec) {
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  noiseBurst({ dur = 0.2, freq = 1000, q = 1, type = 'bandpass', gain = 0.5, attack = 0.005, when = 0, dest = null }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
    return { f, g, t };
  }

  tone({ freq = 440, dur = 0.5, type = 'sine', gain = 0.2, attack = 0.01, when = 0, dest = null, detune = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // --- Stemninger --------------------------------------------------------------
  startCrowd() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 520;
    f.Q.value = 0.7;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.35;
    const lg = c.createGain();
    lg.gain.value = 140;
    lfo.connect(lg).connect(f.frequency);
    src.connect(f).connect(this.crowd);
    src.start();
    lfo.start();
  }

  startMusic() {
    // Rolig generativ klavermusik i F-dur.
    const chords = [
      [53, 57, 60, 64], // Fmaj7
      [50, 53, 57, 60], // Dm7
      [46, 50, 53, 57], // Bbmaj7
      [48, 52, 55, 60], // C
    ];
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    let step = 0;
    let next = this.ctx.currentTime + 0.5;
    const beat = 0.62;
    const schedule = () => {
      if (!this.ctx) return;
      while (next < this.ctx.currentTime + 1.2) {
        const chord = chords[Math.floor(step / 8) % chords.length];
        const i = step % 8;
        if (i === 0) {
          this.piano(midi(chord[0] - 12), 3.2, 0.11, next);
          this.piano(midi(chord[1]), 2.6, 0.05, next);
        }
        const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
        const note = chord[pattern[i]] + (i > 3 ? 12 : 12);
        if (Math.random() > 0.12) this.piano(midi(note), 1.8, 0.055 + Math.random() * 0.02, next);
        if (i === 6 && Math.random() > 0.5) this.piano(midi(chord[3] + 24), 1.4, 0.03, next + beat / 2);
        next += beat;
        step++;
      }
      setTimeout(schedule, 300);
    };
    schedule();
  }

  piano(freq, dur, gain, when) {
    const c = this.ctx;
    const t = when;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(gain * 0.35, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    g.connect(f).connect(this.music);
    for (const [mul, type, gg] of [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq * mul;
      const og = c.createGain();
      og.gain.value = gg;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  // --- Effekter -----------------------------------------------------------------
  fanfare() {
    if (!this.ctx) return;
    const notes = [[60, 0], [64, 0.18], [67, 0.36], [72, 0.6], [67, 0.95], [72, 1.1]];
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    for (const [n, w] of notes) {
      const dur = w >= 1.1 ? 1.6 : 0.5;
      for (const det of [-6, 6]) this.tone({ freq: midi(n), dur, type: 'sawtooth', gain: 0.045, attack: 0.03, when: w, detune: det });
      this.tone({ freq: midi(n - 12), dur, type: 'square', gain: 0.02, attack: 0.03, when: w });
    }
  }

  applause(sec = 4, gain = 0.22) {
    if (!this.ctx) return;
    const n = Math.floor(sec * 70);
    for (let i = 0; i < n; i++) {
      const w = Math.random() * sec;
      const env = Math.sin((w / sec) * Math.PI);
      this.noiseBurst({ dur: 0.03 + Math.random() * 0.03, freq: 1200 + Math.random() * 2200, q: 1.2, gain: gain * env * (0.4 + Math.random() * 0.6), when: w });
    }
  }

  shutter() {
    this.noiseBurst({ dur: 0.04, freq: 3500, q: 2, gain: 0.25 });
    this.noiseBurst({ dur: 0.05, freq: 1800, q: 2, gain: 0.18, when: 0.06 });
  }

  pop() {
    this.noiseBurst({ dur: 0.08, freq: 700, q: 0.8, gain: 0.7 });
    this.tone({ freq: 180, dur: 0.12, type: 'sine', gain: 0.4 });
    this.noiseBurst({ dur: 1.2, freq: 6000, type: 'highpass', gain: 0.06, attack: 0.05, when: 0.08 });
  }

  clink() {
    for (const [f, g] of [[2650, 0.12], [3980, 0.07], [5310, 0.05]]) this.tone({ freq: f, dur: 1.1, gain: g, attack: 0.002 });
    this.tone({ freq: 2790, dur: 0.9, gain: 0.08, attack: 0.002, when: 0.04 });
  }

  fizz() {
    this.noiseBurst({ dur: 1.4, freq: 7000, type: 'highpass', gain: 0.05, attack: 0.1 });
  }

  sip() {
    this.noiseBurst({ dur: 0.25, freq: 600, q: 3, gain: 0.16, attack: 0.05 });
  }

  munch() {
    for (let i = 0; i < 3; i++) this.noiseBurst({ dur: 0.09, freq: 900 + Math.random() * 400, q: 1.5, gain: 0.3, when: i * 0.17 });
  }

  espresso(sec = 2.6) {
    if (!this.ctx) return;
    this.noiseBurst({ dur: 0.35, freq: 140, q: 1, type: 'lowpass', gain: 0.25, attack: 0.05 });
    const b = this.noiseBurst({ dur: sec, freq: 900, q: 0.6, gain: 0.08, attack: 0.3, when: 0.2 });
    for (let i = 0; i < 10; i++) this.noiseBurst({ dur: 0.08, freq: 300 + Math.random() * 200, q: 4, gain: 0.08, when: 0.4 + Math.random() * sec });
    return b;
  }

  chime() {
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    [72, 76, 79, 84].forEach((n, i) => this.tone({ freq: midi(n), dur: 1.6, gain: 0.09, attack: 0.005, when: i * 0.12 }));
  }

  whoosh() {
    const b = this.noiseBurst({ dur: 0.35, freq: 400, q: 0.8, gain: 0.12, attack: 0.12 });
    if (b) b.f.frequency.exponentialRampToValueAtTime(2400, b.t + 0.3);
  }

  door() {
    this.noiseBurst({ dur: 0.6, freq: 260, q: 6, gain: 0.08, attack: 0.1 });
    this.tone({ freq: 98, dur: 0.4, gain: 0.08, when: 0.5 });
  }

  click() {
    this.tone({ freq: 1400, dur: 0.06, gain: 0.05, type: 'triangle' });
  }

  finale() {
    if (!this.ctx) return;
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    [53, 60, 65, 69, 72, 77].forEach((n, i) => this.piano(midi(n), 4, 0.08, this.ctx.currentTime + i * 0.16));
    this.chime();
  }

  engine(sec = 3) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(48, t);
    o.frequency.linearRampToValueAtTime(34, t + sec);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + sec);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + sec + 0.1);
  }
}
