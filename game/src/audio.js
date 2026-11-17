// Sound for Solmar, synthesized live with WebAudio: a laid-back bass
// and keys loop, an engine hum that follows the car's speed, a two-tone
// siren, gunshots, crashes and little jingles. No audio files anywhere.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.muted = false;
    this.musicTimer = null;
    this.step = 0;
    // A slow, sunny bassline in A minor with a bright keys riff on top.
    this.bassNotes = [55, 0, 55, 0, 65.41, 0, 49, 0, 55, 0, 55, 0, 82.41, 0, 73.42, 0];
    this.keysNotes = [220, 261.63, 329.63, 440, 329.63, 261.63, 220, 164.81];
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
      return true;
    } catch {
      return false;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  startMusic() {
    if (!this.ensure() || this.musicTimer) return;
    const beatMs = 340;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const bass = this.bassNotes[this.step % this.bassNotes.length];
      if (bass) this.tone(bass, 0.32, 'triangle', 0.5);
      if (this.step % 2 === 0) {
        const key = this.keysNotes[(this.step / 2 | 0) % this.keysNotes.length];
        this.tone(key, 0.5, 'sine', 0.14);
      }
      if (this.step % 4 === 2) this.noise(0.05, 0.12, 6000);
      this.step++;
    }, beatMs);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  engineStart() {
    if (!this.ensure()) return;
    this.engineStop();
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.05;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  engineUpdate(speed) {
    if (!this.engineOsc || !this.ctx) return;
    const s = Math.abs(speed);
    this.engineOsc.frequency.setTargetAtTime(50 + s * 4.5, this.ctx.currentTime, 0.1);
    this.engineGain.gain.setTargetAtTime(0.03 + Math.min(0.06, s * 0.002), this.ctx.currentTime, 0.1);
  }

  engineStop() {
    if (this.engineOsc) {
      try { this.engineOsc.stop(); } catch { /* already stopped */ }
      this.engineOsc = null;
      this.engineGain = null;
    }
  }

  siren(on) {
    if (!this.ensure()) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.type = 'square';
      this.sirenLfo.frequency.value = 0.9;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 260;
      this.sirenLfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenLfo.start();
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null;
      this.sirenLfo = null;
      this.sirenGain = null;
    }
  }

  shot() { this.noise(0.14, 0.5, 2800); this.tone(180, 0.08, 'square', 0.2, 0, 60); }
  enemyShot() { this.noise(0.12, 0.28, 2000); }
  crash() { this.noise(0.3, 0.55, 500); this.tone(70, 0.25, 'sine', 0.4, 0, 35); }
  punch() { this.noise(0.09, 0.35, 900); }
  jump() { this.tone(300, 0.15, 'sine', 0.12, 0, 520); }
  pickup() { this.tone(880, 0.1, 'sine', 0.22); this.tone(1318, 0.14, 'sine', 0.22, 0.08); }
  clickEmpty() { this.tone(1200, 0.05, 'square', 0.12); }
  reload() { this.tone(500, 0.06, 'square', 0.14); this.tone(700, 0.06, 'square', 0.14, 0.12); }
  jingle() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => this.tone(n, 0.22, 'triangle', 0.22, i * 0.11));
  }
  deathJingle() {
    const notes = [392, 311.13, 233.08, 196];
    notes.forEach((n, i) => this.tone(n, 0.4, 'triangle', 0.2, i * 0.22));
  }
}
