// SOLMAR HEAT — shared helpers: seeded random, math, procedural textures.
// Everything here is written for this game; no code is borrowed.
(function () {
  var SH = (window.SH = window.SH || {});

  SH.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  SH.lerp = function (a, b, t) { return a + (b - a) * t; };
  SH.dist2 = function (ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
  };
  SH.dist = function (ax, az, bx, bz) { return Math.sqrt(SH.dist2(ax, az, bx, bz)); };
  SH.angleLerp = function (a, b, t) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  SH.angleDiff = function (a, b) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  // Deterministic RNG (mulberry32) so staged screenshots and the city are stable.
  SH.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), s | 1);
      t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  SH.pick = function (rand, arr) { return arr[Math.floor(rand() * arr.length)]; };

  // Canvas texture helpers -------------------------------------------------
  SH.makeCanvas = function (w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };

  // A building facade: lit windows on a tinted wall, with a darker ground floor.
  SH.facadeTexture = function (baseColor, litRatio, rand) {
    var c = SH.makeCanvas(128, 256);
    var g = c.getContext('2d');
    g.fillStyle = baseColor;
    g.fillRect(0, 0, 128, 256);
    var cols = 6, rows = 14, ww = 14, wh = 10, gx = 8, gy = 8;
    for (var r = 0; r < rows; r++) {
      for (var col = 0; col < cols; col++) {
        var lit = rand() < litRatio;
        g.fillStyle = lit ? SH.pick(rand, ['#ffe9a8', '#fff3c4', '#ffd27a', '#cfe6ff']) : '#1b2436';
        g.fillRect(gx + col * (ww + 6), gy + r * (wh + 8), ww, wh);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 226, 128, 30);
    g.fillStyle = '#0e1420';
    g.fillRect(54, 232, 20, 24);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  // The ground: roads, lane dashes, crosswalks, blocks, beach and park, painted once.
  SH.groundTexture = function () {
    var S = 1024, c = SH.makeCanvas(S, S), g = c.getContext('2d');
    var world = 800, toPx = S / world; // world spans -400..400
    function X(x) { return (x + 400) * toPx; }
    function Z(z) { return (z + 400) * toPx; }
    g.fillStyle = '#3f6b3a'; // base grass
    g.fillRect(0, 0, S, S);
    // beach strip at the south edge (z > 250)
    g.fillStyle = '#d9c08a';
    g.fillRect(0, Z(250), S, S - Z(250));
    g.fillStyle = '#2f6fb4'; // sea beyond the beach
    g.fillRect(0, Z(352), S, S - Z(352));
    // park block
    g.fillStyle = '#4c8a44';
    g.fillRect(X(-48), Z(-48), 96 * toPx, 96 * toPx);
    // city blocks (concrete) and roads (asphalt)
    g.fillStyle = '#5a5f66';
    for (var i = 0; i < 8; i++) {
      for (var j = 0; j < 8; j++) {
        var bx = -336 + i * 96, bz = -336 + j * 96;
        if (bz > 240) continue; // beach blocks are sand
        g.fillRect(X(bx), Z(bz), 80 * toPx, 80 * toPx);
      }
    }
    // road dashes
    g.fillStyle = '#d8c95a';
    for (var r = 0; r <= 8; r++) {
      var p = -384 + r * 96;
      for (var d = -380; d < 380; d += 24) {
        g.fillRect(X(p) - 1.5, Z(d), 3, 12);
        g.fillRect(X(d), Z(p) - 1.5, 12, 3);
      }
    }
    // crosswalks at intersections
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (var a = 0; a <= 8; a++) {
      for (var b = 0; b <= 8; b++) {
        var ix = -384 + a * 96, iz = -384 + b * 96;
        for (var k = -2; k <= 2; k++) {
          g.fillRect(X(ix - 8 + k * 3.4), Z(iz - 12), 2, 6);
          g.fillRect(X(ix - 8 + k * 3.4), Z(iz + 6), 2, 6);
          g.fillRect(X(ix - 12), Z(iz - 8 + k * 3.4), 6, 2);
          g.fillRect(X(ix + 6), Z(iz - 8 + k * 3.4), 6, 2);
        }
      }
    }
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };

  // Simple radial glow sprite for lights, beacons and muzzle flashes.
  SH.glowTexture = function (inner, outer) {
    var c = SH.makeCanvas(64, 64), g = c.getContext('2d');
    var grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  SH.el = function (id) { return document.getElementById(id); };
  SH.show = function (id, on) { SH.el(id).classList.toggle('hidden', !on); };
  SH.setText = function (id, t) { var e = SH.el(id); if (e.textContent !== t) e.textContent = t; };
  SH.fmtMoney = function (n) { return '$' + Math.floor(n).toLocaleString('en-US'); };
  SH.fmtTime = function (mins) {
    var h = Math.floor(mins / 60) % 24, m = Math.floor(mins % 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  };
})();
