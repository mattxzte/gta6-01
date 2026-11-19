// SOLMAR HEAT — procedural audio: three radio stations and all sound effects,
// synthesized live with WebAudio. No audio files, no network.
(function () {
  var SH = window.SH;
  var ctx = null, master = null, musicBus = null, sfxBus = null;
  var station = 0, seqTimer = null, step = 0, nextStepTime = 0;
  var engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null;
  var muted = false;

  // Station definitions: tempo, waveforms, bass line and lead line (scale degrees).
  var STATIONS = [
    {
      name: 'SOLMAR FM 101.1', tag: 'sunset synth',
      bpm: 96, bassWave: 'sawtooth', leadWave: 'square',
      bass: [0, 0, 7, 0, 5, 0, 3, 7, 0, 0, 7, 10, 5, 3, 2, 0],
      lead: [12, -1, 15, -1, 19, -1, 15, 12, -1, 14, -1, 12, 10, -1, 7, -1],
      root: 55, hats: true
    },
    {
      name: 'VICE 88 — FUNK', tag: 'street funk',
      bpm: 108, bassWave: 'square', leadWave: 'triangle',
      bass: [0, -1, 0, 3, -1, 5, 0, -1, 7, -1, 5, 3, 0, -1, 10, 12],
      lead: [12, 12, -1, 14, 15, -1, 12, -1, 10, -1, 12, 14, -1, 15, 19, -1],
      root: 49, hats: true
    },
    {
      name: 'PALM 76 — CHILL', tag: 'beach chill',
      bpm: 76, bassWave: 'sine', leadWave: 'sine',
      bass: [0, -1, -1, 5, -1, -1, 3, -1, 7, -1, -1, 5, -1, 3, -1, -1],
      lead: [12, -1, -1, 16, -1, 19, -1, -1, 17, -1, 15, -1, 14, -1, 12, -1],
      root: 65.4, hats: false
    }
  ];

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.30; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      // Engine hum
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
      engineGain = ctx.createGain(); engineGain.gain.value = 0.0;
      var engFilter = ctx.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 420;
      engineOsc.connect(engFilter); engFilter.connect(engineGain); engineGain.connect(sfxBus);
      engineOsc.start();
      // Police siren loop
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'sine'; sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0.0;
      sirenOsc.connect(sirenGain); sirenGain.connect(sfxBus);
      sirenOsc.start();
      return true;
    } catch (e) { ctx = null; return false; }
  }

  function noteFreq(root, degree) {
    return root * Math.pow(2, degree / 12);
  }

  function blip(freq, dur, type, vol, when, dest) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    when = when === undefined ? ctx.currentTime : when;
    g.gain.setValueAtTime(vol || 0.2, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(when); o.stop(when + dur + 0.02);
  }

  function noiseBurst(dur, vol, freq, when) {
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    var g = ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(when || ctx.currentTime);
  }

  function scheduleStep() {
    if (!ctx) return;
    var st = STATIONS[station];
    var stepDur = 60 / st.bpm / 4;
    while (nextStepTime < ctx.currentTime + 0.12) {
      var s = step % 16;
      var b = st.bass[s];
      if (b >= 0) blip(noteFreq(st.root, b), stepDur * 1.8, st.bassWave, 0.20, nextStepTime, musicBus);
      var l = st.lead[s];
      if (l >= 0) blip(noteFreq(st.root, l), stepDur * 0.9, st.leadWave, 0.07, nextStepTime, musicBus);
      if (st.hats && s % 4 === 2) noiseBurst(0.03, 0.05, 6000, nextStepTime);
      if (s % 4 === 0) blip(120, 0.08, 'sine', 0.25, nextStepTime, musicBus); // kick
      step++;
      nextStepTime += stepDur;
    }
  }

  SH.audio = {
    stations: STATIONS,
    init: function () {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (!seqTimer) {
        step = 0; nextStepTime = ctx.currentTime + 0.05;
        seqTimer = setInterval(scheduleStep, 40);
      }
    },
    stationName: function () { return STATIONS[station].name; },
    nextStation: function () {
      station = (station + 1) % STATIONS.length;
      step = 0;
      if (ctx) nextStepTime = ctx.currentTime + 0.05;
      return STATIONS[station].name;
    },
    setEngine: function (speed01, on) {
      if (!ctx) return;
      var t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(on ? 0.02 + speed01 * 0.05 : 0.0, t, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, t, 0.1);
    },
    setSiren: function (on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.045 : 0.0, ctx.currentTime, 0.2);
      if (on) {
        var t = ctx.currentTime;
        sirenOsc.frequency.cancelScheduledValues(t);
        sirenOsc.frequency.setValueAtTime(660, t);
        sirenOsc.frequency.linearRampToValueAtTime(880, t + 0.45);
        sirenOsc.frequency.linearRampToValueAtTime(660, t + 0.9);
        sirenOsc.frequency.linearRampToValueAtTime(880, t + 1.35);
        sirenOsc.frequency.linearRampToValueAtTime(660, t + 1.8);
      }
    },
    shot: function () { if (ctx) noiseBurst(0.12, 0.5, 2500); },
    dryClick: function () { if (ctx) blip(1400, 0.03, 'square', 0.12); },
    hit: function () { if (ctx) blip(220, 0.08, 'square', 0.2); },
    crash: function () { if (ctx) noiseBurst(0.25, 0.4, 700); },
    pickup: function () { if (ctx) { blip(660, 0.09, 'sine', 0.25); blip(990, 0.12, 'sine', 0.25, ctx.currentTime + 0.08); } },
    missionOk: function () {
      if (!ctx) return;
      var t = ctx.currentTime;
      [523, 659, 784, 1046].forEach(function (f, i) { blip(f, 0.22, 'triangle', 0.22, t + i * 0.1); });
    },
    missionFail: function () {
      if (!ctx) return;
      var t = ctx.currentTime;
      [392, 330, 262].forEach(function (f, i) { blip(f, 0.3, 'sawtooth', 0.15, t + i * 0.16); });
    },
    horn: function () { if (ctx) { blip(370, 0.18, 'square', 0.12); blip(466, 0.18, 'square', 0.12); } },
    blip: function () { if (ctx) blip(880, 0.06, 'sine', 0.18); },
    cash: function () {
      if (!ctx) return;
      var t = ctx.currentTime;
      [880, 1174, 1318].forEach(function (f, i) { blip(f, 0.12, 'sine', 0.2, t + i * 0.07); });
    },
    toggleMute: function () {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.55;
      return muted;
    }
  };
})();
