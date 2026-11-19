// audio.js — every sound in SOLMAR HEAT II is synthesized live with WebAudio.
// Engine hum, sirens, gunfire, and four radio stations built from step
// sequencers. Nothing is loaded from a file; nothing leaves the browser.
import { clamp } from './utils.js';

const STATIONS = [
  {
    name: 'SOL FM 88.1 — Sunset Drive',
    bpm: 96, root: 45,
    bass: [0, -1, 0, -1, 3, -1, 5, -1, 0, -1, 7, -1, 5, 3, -1, -1],
    lead: [12, -1, 15, 12, -1, 19, 17, 15, 12, -1, 15, -1, 19, 22, 19, 15],
    wave: 'sawtooth', bright: 0.5,
  },
  {
    name: 'PALMA 101.5 — Island Breeze',
    bpm: 78, root: 41,
    bass: [-1, 0, -1, 0, -1, 0, -1, 5, -1, 0, -1, 0, -1, 7, -1, 5],
    lead: [-1, 12, -1, 15, -1, 12, -1, 10, -1, 12, -1, 17, -1, 15, -1, 12],
    wave: 'triangle', bright: 0.9,
  },
  {
    name: 'NEON 104.9 — Night Pulse',
    bpm: 122, root: 38,
    bass: [0, 0, 12, 0, 0, 10, 0, 12, 0, 0, 12, 0, 15, 0, 13, 12],
    lead: [24, -1, 24, -1, 27, -1, 24, -1, 22, -1, 24, -1, 29, 27, 24, -1],
    wave: 'square', bright: 0.35,
  },
  {
    name: 'TALK SOLMAR 1290 — City Voices',
    bpm: 100, root: 50,
    bass: [0, -1, -1, 0, -1, -1, 5, -1, -1, 0, -1, -1, 7, -1, 5, -1],
    lead: [12, 14, 12, -1, 10, 12, -1, -1, 15, 14, 12, -1, 10, -1, -1, -1],
    wave: 'sine', bright: 0.7,
  },
];

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.station = 0;
    this.radioOn = true;
    this.step = 0;
    this.nextStepTime = 0;
    this.timer = null;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.noiseBuf = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.32;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startRadioScheduler();
      return true;
    } catch (e) { return false; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // ---- tiny synth helpers ----
  tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.15, vol = 0.5, at = 0, dest = null, attack = 0.005 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.5, at = 0, filterFreq = 1200, type = 'lowpass', dest = null }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  // ---- SFX ----
  click() { this.tone({ freq: 660, dur: 0.05, vol: 0.25, type: 'square' }); }
  pickup() {
    this.tone({ freq: 523, dur: 0.09, vol: 0.4 });
    this.tone({ freq: 784, dur: 0.14, vol: 0.4, at: 0.08 });
  }
  punch() { this.noise({ dur: 0.1, vol: 0.5, filterFreq: 300 }); this.tone({ freq: 120, freqEnd: 60, dur: 0.12, vol: 0.5 }); }
  shot(kind) {
    if (kind === 'shotgun') { this.noise({ dur: 0.28, vol: 0.9, filterFreq: 900 }); this.tone({ freq: 160, freqEnd: 50, dur: 0.2, vol: 0.6 }); }
    else if (kind === 'smg') { this.noise({ dur: 0.09, vol: 0.55, filterFreq: 2400, type: 'highpass' }); this.tone({ freq: 220, freqEnd: 90, dur: 0.08, vol: 0.35 }); }
    else { this.noise({ dur: 0.14, vol: 0.7, filterFreq: 1800 }); this.tone({ freq: 190, freqEnd: 70, dur: 0.12, vol: 0.45 }); }
  }
  explosion() {
    this.noise({ dur: 0.9, vol: 1.0, filterFreq: 500 });
    this.tone({ freq: 90, freqEnd: 28, dur: 0.8, vol: 0.9 });
    this.noise({ dur: 0.4, vol: 0.5, filterFreq: 3000, type: 'highpass', at: 0.05 });
  }
  horn() { this.tone({ freq: 370, dur: 0.35, vol: 0.3, type: 'square' }); this.tone({ freq: 466, dur: 0.35, vol: 0.25, type: 'square' }); }
  jingle(win) {
    const notes = win ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((f, i) => this.tone({ freq: f, dur: 0.22, vol: 0.4, at: i * 0.11 }));
  }
  crash() { this.noise({ dur: 0.3, vol: 0.6, filterFreq: 700 }); this.tone({ freq: 70, freqEnd: 40, dur: 0.25, vol: 0.5 }); }
  skid() { this.noise({ dur: 0.25, vol: 0.22, filterFreq: 1400, type: 'bandpass' }); }

  // ---- engine loop ----
  startEngine() {
    if (!this.ctx || this.engineNodes) return;
    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 28;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = this.ctx.createGain(); g.gain.value = 0.0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfxGain);
    o1.start(); o2.start();
    this.engineNodes = { o1, o2, f, g };
  }

  setEngine(rpm01, on) {
    if (!this.engineNodes || !this.ctx) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + rpm01 * 0.11 : 0.0;
    this.engineNodes.g.gain.setTargetAtTime(target, t, 0.08);
    this.engineNodes.o1.frequency.setTargetAtTime(48 + rpm01 * 165, t, 0.06);
    this.engineNodes.o2.frequency.setTargetAtTime(24 + rpm01 * 82, t, 0.06);
    this.engineNodes.f.frequency.setTargetAtTime(320 + rpm01 * 1500, t, 0.1);
  }

  stopEngine() {
    if (!this.engineNodes) return;
    try { this.engineNodes.o1.stop(); this.engineNodes.o2.stop(); } catch (e) { /* ignore */ }
    this.engineNodes = null;
  }

  // ---- siren ----
  startSiren() {
    if (!this.ctx || this.sirenNodes) return;
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 700;
    const lfo = this.ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.55;
    const lg = this.ctx.createGain(); lg.gain.value = 320;
    const g = this.ctx.createGain(); g.gain.value = 0.045;
    lfo.connect(lg); lg.connect(o.frequency);
    o.connect(g); g.connect(this.sfxGain);
    o.start(); lfo.start();
    this.sirenNodes = { o, lfo, g };
  }

  stopSiren() {
    if (!this.sirenNodes) return;
    try { this.sirenNodes.o.stop(); this.sirenNodes.lfo.stop(); } catch (e) { /* ignore */ }
    this.sirenNodes = null;
  }

  // ---- radio ----
  stationName() { return STATIONS[this.station].name; }

  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    return this.stationName();
  }

  setRadio(on) { this.radioOn = on; }

  startRadioScheduler() {
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.scheduleRadio(), 40);
  }

  scheduleRadio() {
    if (!this.ctx || !this.radioOn || this.muted) {
      if (this.ctx) this.nextStepTime = Math.max(this.nextStepTime, this.ctx.currentTime + 0.05);
      return;
    }
    const st = STATIONS[this.station];
    const stepDur = 60 / st.bpm / 2;
    while (this.nextStepTime < this.ctx.currentTime + 0.18) {
      const s = this.step % 16;
      const at = this.nextStepTime - this.ctx.currentTime;
      const bass = st.bass[s];
      if (bass >= 0) {
        this.tone({ freq: midiToFreq(st.root + bass), type: 'triangle', dur: stepDur * 0.9, vol: 0.5, at, dest: this.musicGain });
      }
      const lead = st.lead[s];
      if (lead >= 0) {
        this.tone({ freq: midiToFreq(st.root + lead), type: st.wave, dur: stepDur * 0.7, vol: 0.16 * st.bright + 0.08, at, dest: this.musicGain });
      }
      if (s % 4 === 0) this.tone({ freq: 150, freqEnd: 45, type: 'sine', dur: 0.14, vol: 0.55, at, dest: this.musicGain });
      if (s % 2 === 1) this.noise({ dur: 0.04, vol: 0.1, filterFreq: 7000, type: 'highpass', at, dest: this.musicGain });
      this.step++;
      this.nextStepTime += stepDur;
    }
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.stopEngine(); this.stopSiren();
    if (this.ctx) this.ctx.close().catch(() => {});
  }
}

// Small helper used by the HUD to show a volume-safe number.
export function clamp01(v) { return clamp(v, 0, 1); }
