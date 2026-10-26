export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.volume = 0.5;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    const length = Math.floor(this.ctx.sampleRate * 0.5);
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  get t() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  noiseBurst(duration, volume, filterFreq, type = 'lowpass') {
    if (!this.ctx) return;
    const t = this.t;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1 + Math.random() * 0.15;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, filterFreq * 0.18), t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  tone(freq, endFreq, duration, volume, type = 'sine', delay = 0) {
    if (!this.ctx) return;
    const t = this.t + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  shot(distance = 0, ads = false) {
    if (!this.ctx) return;
    const falloff = Math.max(0.12, Math.min(1, 1 - distance / 55));
    this.noiseBurst(ads ? 0.12 : 0.17, 0.55 * falloff, ads ? 2400 : 3400);
    this.tone(ads ? 130 : 105, 42, 0.11, 0.5 * falloff, 'sine');
    this.tone(2200, 900, 0.03, 0.06 * falloff, 'square');
  }

  reload() {
    if (!this.ctx) return;
    this.noiseBurst(0.05, 0.22, 5200, 'highpass');
    setTimeout(() => this.noiseBurst(0.04, 0.25, 3800, 'bandpass'), 620);
    setTimeout(() => this.noiseBurst(0.06, 0.3, 4800, 'highpass'), 1500);
  }

  empty() {
    if (!this.ctx) return;
    this.noiseBurst(0.03, 0.25, 6000, 'highpass');
    this.tone(1200, 700, 0.03, 0.06, 'square');
  }

  hit(head = false, kill = false) {
    if (!this.ctx) return;
    if (kill) {
      this.tone(880, 440, 0.12, 0.16, 'triangle');
      this.tone(1320, 660, 0.16, 0.12, 'sine', 0.05);
      return;
    }
    if (head) {
      this.tone(1700, 1200, 0.07, 0.13, 'square');
    } else {
      this.tone(1050, 850, 0.05, 0.11, 'square');
    }
  }

  blocked() {
    this.tone(420, 300, 0.08, 0.1, 'triangle');
  }

  damage() {
    if (!this.ctx) return;
    this.noiseBurst(0.18, 0.4, 900);
    this.tone(150, 60, 0.2, 0.3, 'sawtooth');
  }

  spawn() {
    if (!this.ctx) return;
    this.tone(300, 900, 0.18, 0.08, 'sine');
  }

  countdown(final = false) {
    if (!this.ctx) return;
    this.tone(final ? 880 : 520, final ? 880 : 520, final ? 0.28 : 0.1, 0.12, 'square');
  }

  victory() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.3, 0.12, 'triangle', i * 0.13));
  }

  defeat() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, f, 0.34, 0.12, 'sawtooth', i * 0.15));
  }
}
