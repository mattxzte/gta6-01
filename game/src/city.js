// SOLMAR HEAT — the city: procedural districts, buildings, props, landmarks,
// collision data and the day/night cycle. All geometry is generated here.
(function () {
  var SH = window.SH;
  var colliders = []; // {minX,maxX,minZ,maxZ}
  var places = {};
  var beacons = {};
  var sunLight = null, hemi = null, stars = null;
  var lampGlows = [];
  var rand = SH.rng(1337);

  var ROAD = 96, ROAD_W = 16, WORLD = 400;
  function roadCenter(i) { return -384 + i * ROAD; }
  function blockCenter(i) { return -336 + i * ROAD; }

  function districtOf(bx, bz) {
    if (bz > 240) return 'beach';
    if (bx > 280 && bz < 150) return 'port';
    if (Math.abs(bx) <= 100 && Math.abs(bz) <= 100) return 'downtown';
    if ((bx === -144 && bz === 144) || (bx === 144 && bz === -144)) return 'park';
    if (Math.abs(bx) > 240 && Math.abs(bz) > 240) return 'suburb';
    return 'oldtown';
  }

  var FACADES = [
    ['#8a7f72', 0.35], ['#6e7d8c', 0.4], ['#7a6a58', 0.3], ['#5d6b7a', 0.45],
    ['#8c6f5d', 0.35], ['#4d5a6e', 0.5], ['#93755a', 0.3], ['#3f5a52', 0.4]
  ];
  var facadeTex = [];
  function facade(i) {
    if (!facadeTex[i]) facadeTex[i] = SH.facadeTexture(FACADES[i][0], FACADES[i][1], SH.rng(100 + i));
    return facadeTex[i];
  }

  function box(w, h, d, color, x, y, z, mat) {
    var geo = new THREE.BoxGeometry(w, h, d);
    var m = mat || new THREE.MeshLambertMaterial({ color: color });
    var mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    return mesh;
  }

  function addCollider(x, z, hw, hd) {
    colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  }

  function makeBuilding(g, bx, bz, district) {
    var r = SH.rng(Math.floor(bx * 13 + bz * 7 + 5));
    var h = 10, w = 22 + r() * 18, d = 22 + r() * 18, fi = Math.floor(r() * FACADES.length);
    var color = 0xffffff;
    if (district === 'downtown') { h = 34 + r() * 56; w = 26 + r() * 14; d = 26 + r() * 14; }
    else if (district === 'oldtown') { h = 10 + r() * 14; }
    else if (district === 'suburb') { h = 6 + r() * 4; w = 14 + r() * 8; d = 14 + r() * 8; }
    else if (district === 'beach') { h = 9 + r() * 8; }
    var x = bx + (r() - 0.5) * (80 - w - 8), z = bz + (r() - 0.5) * (80 - d - 8);
    var mat = new THREE.MeshLambertMaterial({ map: facade(fi), color: district === 'downtown' ? 0xbfd4e6 : color });
    var b = box(w, h, d, 0xffffff, x, h / 2, z, mat);
    g.add(b);
    var roof = box(w + 1, 1, d + 1, 0x2c313a, x, h + 0.5, z);
    g.add(roof);
    addCollider(x, z, w / 2 + 0.5, d / 2 + 0.5);
    // rooftop box / antenna on tall towers
    if (h > 40 && r() < 0.6) {
      var ant = box(1.2, 8 + r() * 10, 1.2, 0x222222, x + (r() - 0.5) * w * 0.5, h + 5, z + (r() - 0.5) * d * 0.5);
      g.add(ant);
    }
    return { x: x, z: z, h: h };
  }

  function makeTree(g, x, z, palm) {
    var trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, palm ? 6 : 3.2, 6),
      new THREE.MeshLambertMaterial({ color: palm ? 0x8a6b45 : 0x5d4630 }));
    trunk.position.set(x, (palm ? 6 : 3.2) / 2, z);
    g.add(trunk);
    var crown;
    if (palm) {
      crown = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.4, 6),
        new THREE.MeshLambertMaterial({ color: 0x2f8a4a }));
      crown.position.set(x, 6.8, z);
    } else {
      crown = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x3a7a34 }));
      crown.position.set(x, 4.6, z);
    }
    g.add(crown);
  }

  function makeLamp(g, x, z) {
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x2a2f38 }));
    pole.position.set(x, 3.5, z);
    g.add(pole);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    head.position.set(x, 7.1, z);
    g.add(head);
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: SH.glowTexture('rgba(255,233,168,0.85)', 'rgba(255,233,168,0)'),
      transparent: true, depthWrite: false, opacity: 0 }));
    glow.scale.set(7, 7, 1);
    glow.position.set(x, 7.1, z);
    g.add(glow);
    lampGlows.push(glow);
  }

  function makeBeacon(g, key, x, z, color) {
    var grp = new THREE.Group();
    var ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.2, 24),
      new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
    grp.add(ring);
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 30;
    grp.add(beam);
    grp.position.set(x, 0, z);
    grp.visible = false;
    g.add(grp);
    beacons[key] = grp;
  }

  function makeLabel(g, text, x, y, z) {
    var c = SH.makeCanvas(256, 64), ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(8,12,24,0.85)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 252, 60);
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    spr.scale.set(18, 4.5, 1);
    spr.position.set(x, y, z);
    g.add(spr);
  }

  SH.city = {
    roadCenter: roadCenter,
    blockCenter: blockCenter,
    places: places,
    beacons: beacons,
    build: function (scene) {
      var g = new THREE.Group();
      scene.add(g);
      // ground
      var ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800),
        new THREE.MeshLambertMaterial({ map: SH.groundTexture() }));
      ground.rotation.x = -Math.PI / 2;
      g.add(ground);
      // sea plane (animated shimmer)
      var sea = new THREE.Mesh(new THREE.PlaneGeometry(800, 130),
        new THREE.MeshLambertMaterial({ color: 0x2f6fb4, transparent: true, opacity: 0.9 }));
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, 0.15, 415);
      g.add(sea);
      SH.city._sea = sea;

      // lights
      hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a4a2a, 0.9);
      scene.add(hemi);
      sunLight = new THREE.DirectionalLight(0xffe6b0, 1.6);
      sunLight.position.set(200, 300, 100);
      scene.add(sunLight);
      scene.add(new THREE.AmbientLight(0x404050, 0.5));
      // stars (visible at night)
      var starGeo = new THREE.BufferGeometry();
      var pos = new Float32Array(300 * 3);
      for (var s = 0; s < 300; s++) {
        var a = rand() * Math.PI * 2, e = 0.25 + rand() * 1.2, r = 700;
        pos[s * 3] = Math.cos(a) * Math.cos(e) * r;
        pos[s * 3 + 1] = Math.sin(e) * r;
        pos[s * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0 }));
      scene.add(stars);
      SH.city._sun = sunLight; SH.city._hemi = hemi; SH.city._stars = stars;

      // blocks
      for (var i = 0; i < 8; i++) {
        for (var j = 0; j < 8; j++) {
          var bx = blockCenter(i), bz = blockCenter(j);
          var d = districtOf(bx, bz);
          if (d === 'beach') {
            // boardwalk hotels + palms, no dense buildings
            if (rand() < 0.7) makeBuilding(g, bx, bz, 'beach');
            for (var p = 0; p < 3; p++) makeTree(g, bx - 30 + rand() * 60, bz - 30 + rand() * 60, true);
            continue;
          }
          if (d === 'port') {
            // shipping containers + a crane
            for (var k = 0; k < 6; k++) {
              var cx = bx - 28 + (k % 3) * 26, cz = bz - 20 + Math.floor(k / 3) * 24;
              var cont = box(20, 5, 8, SH.pick(rand, [0xb8442c, 0x2c6eb8, 0x3f8a44, 0xc2a23a]), cx, 2.5, cz);
              g.add(cont);
              addCollider(cx, cz, 10.5, 4.5);
            }
            var crane = box(3, 42, 3, 0xd8a23a, bx + 28, 21, bz - 28);
            g.add(crane);
            var arm = box(34, 2.5, 2.5, 0xd8a23a, bx + 14, 40, bz - 28);
            g.add(arm);
            continue;
          }
          if (d === 'park') {
            for (var t = 0; t < 8; t++) makeTree(g, bx - 32 + rand() * 64, bz - 32 + rand() * 64, false);
            var pond = new THREE.Mesh(new THREE.CircleGeometry(10, 20),
              new THREE.MeshLambertMaterial({ color: 0x3a7fc4 }));
            pond.rotation.x = -Math.PI / 2; pond.position.set(bx, 0.12, bz);
            g.add(pond);
            continue;
          }
          var n = d === 'downtown' ? 1 : d === 'suburb' ? 3 : 2;
          for (var b = 0; b < n; b++) makeBuilding(g, bx, bz, d);
          if (d === 'suburb') {
            for (var tr = 0; tr < 2; tr++) makeTree(g, bx - 30 + rand() * 60, bz - 30 + rand() * 60, false);
          }
        }
      }

      // Solmar Tower — the landmark, downtown centre
      var tower = box(34, 120, 34, 0xffffff, 0, 60, 0,
        new THREE.MeshLambertMaterial({ map: facade(5), color: 0xdfeaf5 }));
      g.add(tower);
      addCollider(0, 0, 18, 18);
      var crown = box(36, 4, 36, 0xffd23f, 0, 122, 0);
      g.add(crown);
      var beacon = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
      beacon.position.set(0, 126, 0);
      g.add(beacon);
      makeLabel(g, 'SOLMAR TOWER', 0, 134, 0);

      // Stadium (south-west)
      var stad = new THREE.Mesh(new THREE.CylinderGeometry(26, 30, 14, 20),
        new THREE.MeshLambertMaterial({ color: 0xcfd6de }));
      stad.position.set(-240, 7, 240);
      g.add(stad);
      addCollider(-240, 240, 30, 30);
      makeLabel(g, 'SOLMAR STADIUM', -240, 22, 240);

      // Pier (south, into the sea)
      var pier = box(10, 2, 60, 0x8a6b45, 0, 1, 380);
      g.add(pier);
      for (var pl = 0; pl < 4; pl++) makeLamp(g, pl % 2 === 0 ? -4 : 4, 360 + pl * 14);
      makeLabel(g, 'SOLMAR PIER', 0, 10, 385);

      // Street lamps at intersections
      for (var a = 0; a <= 8; a++) {
        for (var b = 0; b <= 8; b++) {
          if ((a + b) % 2 === 0) makeLamp(g, roadCenter(a) + 10, roadCenter(b) + 10);
        }
      }

      // Named places (on roads / sidewalks, clear of buildings)
      places.garage = { x: -120, z: 56, name: 'SOLMAR GARAGE' };
      places.gunShop = { x: 144, z: -56, name: 'LOCK & LOAD' };
      places.safehouseA = { x: -56, z: -144, name: 'DAZ’S APARTMENT' };
      places.safehouseB = { x: 248, z: 288, name: 'BEACH HOUSE' };
      places.mara = { x: 56, z: -240, name: 'MARA’S PLACE' };
      places.port = { x: 336, z: -48, name: 'PORT OF SOLMAR' };
      places.hospital = { x: -240, z: -56, name: 'SOLMAR GENERAL' };
      Object.keys(places).forEach(function (k) {
        var p = places[k];
        makeLabel(g, p.name, p.x, 9, p.z);
        makeBeacon(g, k, p.x, p.z, k === 'garage' ? 0x2fd4ff : 0xffd23f);
      });
      makeBeacon(g, 'mission', 0, 0, 0xffd23f);
      makeBeacon(g, 'target', 0, 0, 0xff5a5a);
      return g;
    },

    // Circle vs building AABBs + world bounds. Returns corrected {x,z,hit}.
    collide: function (x, z, r) {
      var hit = false;
      for (var i = 0; i < colliders.length; i++) {
        var c = colliders[i];
        var cx = SH.clamp(x, c.minX, c.maxX), cz = SH.clamp(z, c.minZ, c.maxZ);
        var dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 < 0.0001) { x = c.maxX + r; hit = true; continue; }
          var d = Math.sqrt(d2), push = (r - d) / d;
          x += dx * push; z += dz * push;
          hit = true;
        }
      }
      if (x < -WORLD + 4) { x = -WORLD + 4; hit = true; }
      if (x > WORLD - 4) { x = WORLD - 4; hit = true; }
      if (z < -WORLD + 4) { z = -WORLD + 4; hit = true; }
      if (z > WORLD + 30) { z = WORLD + 30; hit = true; } // pier extends south
      return { x: x, z: z, hit: hit };
    },

    // Nearest road centreline point (for traffic respawns and police).
    nearestRoadPoint: function (x, z) {
      var bx = Math.round((x + 384) / ROAD) * ROAD - 384;
      var bz = Math.round((z + 384) / ROAD) * ROAD - 384;
      if (Math.abs(x - bx) < Math.abs(z - bz)) return { x: bx, z: z };
      return { x: x, z: bz };
    },

    // A random parked-car spot on a road edge.
    parkingSpot: function (r) {
      var road = roadCenter(Math.floor(r() * 9));
      var along = -360 + r() * 720;
      var side = r() < 0.5 ? -1 : 1;
      if (r() < 0.5) return { x: road + side * 6.5, z: along, alongZ: true };
      return { x: along, z: road + side * 6.5, alongZ: false };
    },

    updateDay: function (t01, scene) {
      // t01: 0..1 over a full day. Sun angle, sky, lamps, stars.
      var ang = t01 * Math.PI * 2 - Math.PI / 2;
      var sunH = Math.sin(ang); // -1..1
      var day = SH.clamp(sunH * 2 + 0.35, 0, 1);
      var dusk = SH.clamp(1 - Math.abs(sunH) * 3, 0, 1) * (sunH > -0.15 ? 1 : 0);
      var sky = new THREE.Color().setHSL(0.58, 0.55, SH.lerp(0.06, 0.62, day));
      if (dusk > 0.25) sky.lerp(new THREE.Color(0xff7a3c), dusk * 0.45);
      scene.background = sky;
      scene.fog = new THREE.Fog(sky, 180, 620);
      sunLight.position.set(Math.cos(ang) * 300, Math.max(30, sunH * 320), 120);
      sunLight.intensity = SH.lerp(0.05, 1.7, day);
      sunLight.color.setHSL(0.1, 0.7, SH.lerp(0.55, 0.85, day));
      hemi.intensity = SH.lerp(0.25, 0.95, day);
      stars.material.opacity = SH.clamp(0.9 - day * 1.4, 0, 0.9);
      var glow = 1 - day;
      for (var i = 0; i < lampGlows.length; i++) lampGlows[i].material.opacity = glow * 0.85;
      if (SH.city._sea) SH.city._sea.material.opacity = SH.lerp(0.75, 0.92, day);
      return { day: day, dusk: dusk };
    }
  };
})();
