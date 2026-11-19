// SOLMAR HEAT — main: renderer, game loop, input, HUD, minimap, wanted system,
// day cycle, menus, saving and staged screenshot setups.
(function () {
  var SH = window.SH;
  var SAVE_KEY = 'solmar-heat-save-v2';

  var G = {
    renderer: null, scene: null, camera: null,
    mode: 'menu', paused: false, modalOpen: false,
    state: null, keys: {}, input: { f: false, b: false, l: false, r: false, sprint: false, jump: false, handbrake: false, horn: false, lookDX: 0, lookDY: 0 },
    mouseDown: false, lastMX: 0, lastMY: 0,
    wanted: 0, wantedTimer: 0, bustedT: 0, respawnT: 0,
    timeMin: 8 * 60, day: 1,
    bannerT: 0, lastCrimeT: 0, policeShootT: 0,
    garageCarObj: null, shotMode: null, menuOrbit: 0,
    interactTarget: null, promptT: 0
  };

  function defaultState() {
    return {
      money: 500, missionIndex: 0, ownedCars: ['sedan'], garageCar: 'sedan',
      upgrades: {}, completedMissions: []
    };
  }

  function init() {
    var params = new URLSearchParams(location.search);
    G.shotMode = params.get('shot');
    var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    renderer.domElement.id = 'gl';
    SH.el('app').prepend(renderer.domElement);
    G.renderer = renderer;
    G.scene = new THREE.Scene();
    G.scene.background = new THREE.Color(0x87b5d9);
    G.scene.fog = new THREE.Fog(0x87b5d9, 180, 620);
    G.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1500);
    G.camera.position.set(60, 40, 120);
    // The other modules reach the scene/camera through SH.game.
    SH.game.scene = G.scene;
    SH.game.camera = G.camera;
    G.state = defaultState();
    SH.city.build(G.scene);
    var rand = SH.rng(42);
    SH.vehicles.spawnParked(G.scene, rand, 11);
    SH.vehicles.spawnTraffic(G.scene, rand, 14);
    SH.vehicles.spawnPeds(G.scene, rand, 22);
    SH.vehicles.ensureHeli(G.scene);
    SH.player.create(G.scene, 96, -240); // on the road by Mara's place
    window.addEventListener('resize', function () {
      G.camera.aspect = window.innerWidth / window.innerHeight;
      G.camera.updateProjectionMatrix();
      G.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    bindInput();
    bindMenus();
    SH.show('loading', false);
    if (G.shotMode) stageShot(G.shotMode);
    else SH.show('menu', true);
    requestAnimationFrame(loop);
  }

  function bindInput() {
    var keyMap = {
      KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b',
      KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r'
    };
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      // Enter on the title menu starts a new game (the button is clickable too).
      if (e.code === 'Enter' && G.mode === 'menu') { SH.el('btn-new').click(); return; }
      if (keyMap[e.code] !== undefined) { G.input[keyMap[e.code]] = true; e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') G.input.sprint = true;
      if (e.code === 'Space') { G.input.jump = true; G.input.handbrake = true; e.preventDefault(); }
      if (e.code === 'KeyE') onInteract();
      if (e.code === 'KeyF') SH.player.shoot();
      if (e.code === 'KeyR') { SH.setText('radio-name', SH.audio.nextStation()); }
      if (e.code === 'KeyC') { SH.player.data.camMode = (SH.player.data.camMode + 1) % 3; }
      if (e.code === 'KeyH') G.input.horn = true;
      if (e.code === 'KeyM') pingObjective();
      if (e.code === 'Digit1') SH.player.switchWeapon(0);
      if (e.code === 'Digit2') SH.player.switchWeapon(1);
      if (e.code === 'Digit3') SH.player.switchWeapon(2);
      if (e.code === 'Digit4') SH.player.switchWeapon(3);
      if (e.code === 'Digit5') SH.player.switchWeapon(4);
      if (e.code === 'KeyP') togglePause();
      if (e.code === 'Escape') {
        if (G.modalOpen) SH.missions.closeModals();
        else if (G.mode === 'playing') togglePause();
      }
    });
    window.addEventListener('keyup', function (e) {
      if (keyMap[e.code] !== undefined) G.input[keyMap[e.code]] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') G.input.sprint = false;
      if (e.code === 'Space') { G.input.jump = false; G.input.handbrake = false; }
      if (e.code === 'KeyH') G.input.horn = false;
    });
    var cv = G.renderer.domElement;
    cv.addEventListener('mousedown', function (e) {
      G.mouseDown = true; G.lastMX = e.clientX; G.lastMY = e.clientY;
      if (e.button === 0 && G.mode === 'playing') SH.player.shoot();
    });
    window.addEventListener('mouseup', function () { G.mouseDown = false; });
    window.addEventListener('mousemove', function (e) {
      if (!G.mouseDown || G.mode !== 'playing') return;
      G.input.lookDX += e.clientX - G.lastMX;
      G.input.lookDY += e.clientY - G.lastMY;
      G.lastMX = e.clientX; G.lastMY = e.clientY;
    });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function bindMenus() {
    SH.el('btn-new').onclick = function () {
      SH.audio.init();
      G.state = defaultState();
      startPlaying();
      SH.game.banner('SOLMAR HEAT', 'Welcome home, Daz. Mara is waiting — follow the yellow beacon.');
    };
    SH.el('btn-continue').onclick = function () {
      SH.audio.init();
      if (!load()) { SH.game.banner('NO SAVE FOUND', 'Start a new game instead.'); return; }
      startPlaying();
    };
    SH.el('btn-how').onclick = function () { SH.el('controls-list').classList.toggle('hidden'); };
    SH.el('btn-resume').onclick = togglePause;
    SH.el('btn-save-quit').onclick = function () {
      save();
      G.mode = 'menu';
      SH.show('pause-menu', false);
      SH.show('hud', false);
      SH.show('menu', true);
    };
    SH.el('btn-free-roam').onclick = function () {
      SH.show('end-screen', false);
      G.mode = 'playing';
      SH.show('hud', true);
    };
    SH.el('btn-menu2').onclick = function () {
      SH.show('end-screen', false);
      G.mode = 'menu';
      SH.show('hud', false);
      SH.show('menu', true);
    };
  }

  function startPlaying() {
    SH.show('menu', false);
    SH.show('end-screen', false);
    SH.show('hud', true);
    G.mode = 'playing';
    // fresh spawn at Mara's if the player is dead or nowhere
    if (SH.player.data.dead) SH.player.setSpawn(SH.city.places.mara.x, SH.city.places.mara.z);
    updateMissionMarker();
  }

  function updateMissionMarker() {
    var next = SH.missions.nextMission();
    if (next && !SH.missions.current()) {
      var b = SH.city.beacons.mission;
      b.position.set(SH.city.places.mara.x, 0, SH.city.places.mara.z);
      b.visible = true;
    }
  }

  function togglePause() {
    if (G.mode !== 'playing' && G.mode !== 'paused') return;
    if (G.mode === 'playing') {
      G.mode = 'paused';
      var st = G.state;
      SH.setText('pause-stats', 'Money ' + SH.fmtMoney(st.money) + ' · Missions done ' +
        st.completedMissions.length + ' / 8 · Next: ' +
        (SH.missions.nextMission() ? SH.missions.nextMission().name : 'All complete'));
      SH.show('pause-menu', true);
    } else {
      G.mode = 'playing';
      SH.show('pause-menu', false);
    }
  }

  function pingObjective() {
    var m = SH.missions.current();
    if (m) SH.game.banner(m.name, SH.el('objective').textContent);
    else {
      var n = SH.missions.nextMission();
      if (n) SH.game.banner('NEXT JOB: ' + n.name, 'Go to Mara’s place — follow the yellow beacon.');
    }
  }

  function onInteract() {
    if (G.mode !== 'playing' || G.modalOpen) return;
    var t = G.interactTarget;
    if (!t) return;
    if (t.kind === 'car') {
      var parked = SH.vehicles.nearestParked(SH.player.pos().x, SH.player.pos().z, 4);
      if (parked) {
        parked.taken = true;
        SH.player.enterCar(parked.group);
        SH.audio.pickup();
        if (!SH.missions.current()) SH.game.setWanted(Math.min(5, G.wanted + 1)); // stealing is a crime
      }
      return;
    }
    if (t.kind === 'missioncar') {
      var mc = SH.missions.missionCar();
      if (mc) { SH.player.enterCar(mc); SH.audio.pickup(); }
      return;
    }
    if (t.kind === 'mission') { SH.missions.start(G.state.missionIndex); updateMissionMarker(); return; }
    if (t.kind === 'garage') { SH.missions.openGarage(); return; }
    if (t.kind === 'gunshop') { SH.missions.openGunShop(); return; }
    if (t.kind === 'safehouse') { SH.missions.sleepAtSafehouse(); return; }
  }

  function updateInteract() {
    var pl = SH.player.pos();
    var t = null;
    if (!SH.player.data.inCar && !SH.player.data.dead) {
      var parked = SH.vehicles.nearestParked(pl.x, pl.z, 4);
      if (parked) t = { kind: 'car', label: '<b>E</b> Steal ' + SH.vehicles.MODELS[parked.model].name };
      // The mission car is spawned by the mission system, not the parked
      // list, so offer it explicitly while an 'enter' step is active.
      if (!t && SH.missions.current()) {
        var mc = SH.missions.missionCar();
        if (mc && SH.dist(pl.x, pl.z, mc.position.x, mc.position.z) < 5)
          t = { kind: 'missioncar', label: '<b>E</b> ' + (SH.el('objective').textContent || 'Get in the car') };
      }
      var d = function (p) { return SH.dist(pl.x, pl.z, p.x, p.z); };
      if (!t && SH.missions.nextMission() && !SH.missions.current() && d(SH.city.places.mara) < 6)
        t = { kind: 'mission', label: '<b>E</b> Start job: ' + SH.missions.nextMission().name };
      if (!t && d(SH.city.places.garage) < 7) t = { kind: 'garage', label: '<b>E</b> Enter the garage' };
      if (!t && d(SH.city.places.gunShop) < 7) t = { kind: 'gunshop', label: '<b>E</b> Browse Lock & Load' };
      if (!t && (d(SH.city.places.safehouseA) < 7 || d(SH.city.places.safehouseB) < 7))
        t = { kind: 'safehouse', label: '<b>E</b> Sleep — save & heal' };
    } else if (SH.player.data.inCar) {
      t = null;
    }
    G.interactTarget = t;
    if (t) { SH.el('prompt').innerHTML = t.label; SH.show('prompt', true); }
    else SH.show('prompt', false);
  }

  // ---- Crime & wanted ----
  function addWanted(n) {
    var now = performance.now() / 1000;
    if (now - G.lastCrimeT < 2.5 && n > 0) return;
    G.lastCrimeT = now;
    setWanted(SH.clamp(G.wanted + n, 0, 5));
  }

  function setWanted(n) {
    n = SH.clamp(n, 0, 5);
    if (n === G.wanted) return;
    G.wanted = n;
    G.wantedTimer = 0;
    if (n >= 4) SH.vehicles.spawnRoadblocks(G.scene, SH.player.pos());
    else SH.vehicles.clearRoadblocks(G.scene);
    if (n === 0) { SH.vehicles.clearPolice(G.scene); SH.vehicles.updateHeli(0, SH.player.pos(), false); }
  }

  function updateWanted(dt) {
    var pl = SH.player.pos();
    var wantCount = G.wanted === 0 ? 0 : G.wanted <= 1 ? 1 : G.wanted <= 2 ? 2 : G.wanted <= 3 ? 3 : 4;
    if (wantCount > 0) SH.vehicles.spawnPolice(G.scene, pl, wantCount);
    SH.vehicles.updatePolice(dt, pl, G.scene);
    SH.vehicles.updateHeli(dt, pl, G.wanted >= 3);
    // police shoot at the player when close and wanted
    if (G.wanted >= 2) {
      G.policeShootT -= dt;
      var near = SH.vehicles.police.some(function (p) {
        return SH.dist(pl.x, pl.z, p.group.position.x, p.group.position.z) < 26;
      });
      if (near && G.policeShootT <= 0) {
        G.policeShootT = 1.6;
        if (Math.random() < 0.45) SH.player.damage(4);
        SH.audio.shot();
      }
    }
    // busted: on foot, a slow police car on top of you
    if (G.wanted > 0 && !SH.player.data.inCar && !SH.player.data.dead) {
      var touching = SH.vehicles.police.some(function (p) {
        return SH.dist(pl.x, pl.z, p.group.position.x, p.group.position.z) < 3.4 && Math.abs(p.group.userData.speed) < 4;
      });
      if (touching) {
        G.bustedT += dt;
        if (G.bustedT > 2) busted();
      } else G.bustedT = 0;
    } else G.bustedT = 0;
    // decay when the heat dies down
    if (G.wanted > 0) {
      var anyNear = SH.vehicles.police.some(function (p) {
        return SH.dist(pl.x, pl.z, p.group.position.x, p.group.position.z) < 55;
      });
      if (!anyNear) {
        G.wantedTimer += dt;
        if (G.wantedTimer > 14) { setWanted(G.wanted - 1); G.wantedTimer = 0; }
      } else G.wantedTimer = 0;
    }
  }

  function busted() {
    SH.game.banner('BUSTED', 'The SCPD caught up with you. $200 bail, and the job is blown.');
    SH.audio.missionFail();
    G.state.money = Math.max(0, G.state.money - 200);
    setWanted(0);
    if (SH.missions.current()) SH.missions.failIfPlayerDown();
    SH.player.setSpawn(SH.city.places.hospital.x, SH.city.places.hospital.z);
    G.bustedT = 0;
    save();
  }

  function wasted() {
    SH.game.banner('WASTED', 'You went down in Solmar City. $150 hospital bill.');
    SH.audio.missionFail();
    G.state.money = Math.max(0, G.state.money - 150);
    setWanted(0);
    if (SH.missions.current()) SH.missions.failIfPlayerDown();
    SH.player.setSpawn(SH.city.places.hospital.x, SH.city.places.hospital.z);
    save();
  }

  // ---- HUD ----
  function updateHUD(dt) {
    var P = SH.player.data;
    SH.setText('money', SH.fmtMoney(G.state.money));
    SH.setText('clock', 'DAY ' + G.day + ' · ' + SH.fmtTime(G.timeMin));
    SH.setText('radio-name', SH.audio.stationName());
    var stars = '';
    for (var i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '<span class="off">★</span>';
    SH.el('stars').innerHTML = stars;
    SH.el('health-fill').style.width = P.health + '%';
    SH.el('armor-fill').style.width = P.armor + '%';
    var w = SH.player.currentWeapon();
    var st = P.weapons[w.key];
    SH.setText('weapon', w.name + (P.reloading > 0 ? ' — reloading…' : ''));
    SH.setText('ammo', w.mag === 0 ? '—' : (st ? st.ammo + ' / ' + st.reserve : '0'));
    SH.setText('speed-line', P.inCar
      ? 'Driving ' + SH.vehicles.MODELS[P.inCar.userData.model].name + ' · ' + Math.round(Math.abs(P.inCar.userData.speed) * 3.6) + ' km/h'
      : 'On foot · ' + (P.speed > 0 ? 'moving' : 'standing'));
    SH.show('crosshair', G.mode === 'playing' && !P.inCar && P.cur > 0);
    drawMinimap();
    if (G.bannerUntil && performance.now() / 1000 > G.bannerUntil) {
      SH.show('banner', false);
      G.bannerUntil = 0;
    }
  }

  function drawMinimap() {
    var cv = SH.el('minimap'), ctx = cv.getContext('2d');
    var S = 200, scale = S / 800;
    var pl = SH.player.pos();
    ctx.fillStyle = '#0c1420';
    ctx.fillRect(0, 0, S, S);
    function X(x) { return (x + 400) * scale; }
    function Z(z) { return (z + 400) * scale; }
    // roads
    ctx.strokeStyle = '#4a5568'; ctx.lineWidth = 4;
    for (var i = 0; i <= 8; i++) {
      var r = SH.city.roadCenter(i);
      ctx.beginPath(); ctx.moveTo(X(r), 0); ctx.lineTo(X(r), S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, Z(r)); ctx.lineTo(S, Z(r)); ctx.stroke();
    }
    // beach + sea
    ctx.fillStyle = '#d9c08a'; ctx.fillRect(0, Z(250), S, S - Z(250));
    ctx.fillStyle = '#2f6fb4'; ctx.fillRect(0, Z(352), S, S - Z(352));
    // places
    ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
    Object.keys(SH.city.places).forEach(function (k) {
      var p = SH.city.places[k];
      ctx.fillStyle = k === 'garage' ? '#2fd4ff' : '#ffd23f';
      ctx.fillRect(X(p.x) - 3, Z(p.z) - 3, 6, 6);
    });
    // mission beacon
    var b = SH.city.beacons.mission;
    if (b.visible) {
      var pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(X(b.position.x), Z(b.position.z), pulse, 0, Math.PI * 2); ctx.fill();
    }
    // hostiles
    ctx.fillStyle = '#ff3b30';
    SH.missions.data.hostiles.forEach(function (h) {
      ctx.fillRect(X(h.group.position.x) - 2, Z(h.group.position.z) - 2, 4, 4);
    });
    // police
    ctx.fillStyle = '#3a86ff';
    SH.vehicles.police.forEach(function (p) {
      ctx.beginPath(); ctx.arc(X(p.group.position.x), Z(p.group.position.z), 3.5, 0, Math.PI * 2); ctx.fill();
    });
    // player arrow
    ctx.save();
    ctx.translate(X(pl.x), Z(pl.z));
    ctx.rotate(-SH.player.data.heading + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---- Save / load ----
  function save() {
    try {
      var s = {
        money: G.state.money, missionIndex: G.state.missionIndex,
        ownedCars: G.state.ownedCars, garageCar: G.state.garageCar,
        upgrades: G.state.upgrades, completedMissions: G.state.completedMissions,
        weapons: SH.player.data.weapons, day: G.day, timeMin: G.timeMin
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch (e) { /* storage unavailable */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var s = JSON.parse(raw);
      G.state.money = s.money; G.state.missionIndex = s.missionIndex;
      G.state.ownedCars = s.ownedCars; G.state.garageCar = s.garageCar;
      G.state.upgrades = s.upgrades || {};
      G.state.completedMissions = s.completedMissions || [];
      G.day = s.day || 1; G.timeMin = s.timeMin || 480;
      if (s.weapons) {
        Object.keys(s.weapons).forEach(function (k) { SH.player.data.weapons[k] = s.weapons[k]; });
      }
      return true;
    } catch (e) { return false; }
  }

  // ---- Staged screenshots (?shot=...) ----
  function stageShot(mode) {
    SH.show('menu', false);
    SH.show('hud', true);
    G.mode = 'playing';
    SH.audio.init();
    var pl = SH.city.places;
    if (mode === 'cover') {
      // Dusk chase on the main avenue: gold sports car, 3-star wanted with the
      // helicopter overhead, two police cars flanking ahead of the player.
      G.timeMin = 18 * 60 + 40;
      var coverCar = giveCar('sports', 0, -96, 0, 0xd8a23a);
      coverCar.userData.speed = 16;
      // Two police cars flanking ahead of the player so the chase reads in frame.
      [[12, -50], [-14, -70]].forEach(function (p) {
        var pc = SH.vehicles.makeCar('police', 0x1c2f4a);
        pc.position.set(p[0], 0, p[1]);
        pc.rotation.y = Math.PI;
        pc.userData.heading = Math.PI;
        G.scene.add(pc);
        SH.vehicles.police.push({ group: pc, speed: 12, siren: true });
      });
      SH.missions.start(2);
      // The mission's survive step sets wanted 2; the cover wants the full
      // 3-star chase with the helicopter, so raise it after the mission starts.
      setWanted(3);
      SH.game.banner('SOLMAR HEAT', 'Eight jobs. One city. Take it all back.', 6);
    } else if (mode === 'drive') {
      G.timeMin = 10 * 60 + 15;
      giveCar('sedan', -96, -288, 0, 0xc0392b);
      SH.game.banner('', '');
    } else if (mode === 'mission') {
      // Port shootout in progress: mission 5, hostiles up, player armed and
      // facing the crew.
      G.timeMin = 15 * 60 + 30;
      SH.player.giveWeapon('rifle', 60);
      SH.player.switchWeapon(4);
      SH.player.setSpawn(322, -28);
      // Face the port crew: heading points at them, camYaw sits behind.
      SH.player.data.heading = 2.55;
      SH.player.data.camYaw = 2.55 - Math.PI;
      SH.missions.start(5);
    } else if (mode === 'city') {
      G.timeMin = 17 * 60 + 50;
      G.shotMode = 'city';
    }
    updateHUD();
  }

  function giveCar(model, x, z, heading, color) {
    var car = SH.vehicles.makeCar(model, color);
    car.position.set(x, 0, z);
    car.rotation.y = heading;
    car.userData.heading = heading;
    G.scene.add(car);
    SH.player.enterCar(car);
    SH.player.data.camMode = 0;
    return car;
  }

  // ---- Main loop ----
  var lastT = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    // day cycle always advances while playing
    if (G.mode === 'playing') {
      G.timeMin += dt * 3;
      if (G.timeMin >= 1440) { G.timeMin -= 1440; G.day++; }
      var t01 = G.timeMin / 1440;
      SH.city.updateDay(t01, G.scene);
    }
    if (G.mode === 'menu') {
      G.menuOrbit += dt * 0.05;
      var ox = Math.cos(G.menuOrbit) * 190, oz = Math.sin(G.menuOrbit) * 190;
      G.camera.position.set(ox, 75, oz);
      G.camera.lookAt(0, 20, 0);
      SH.city.updateDay(0.42, G.scene);
    } else if (G.mode === 'playing' && !G.modalOpen) {
      SH.player.update(dt, G.input);
      SH.player.updateCamera(dt);
      SH.vehicles.updateTraffic(dt, SH.player.data.inCar);
      SH.vehicles.updatePeds(dt, SH.player.data.inCar ? { x: SH.player.pos().x, z: SH.player.pos().z } : null);
      SH.missions.ensureMissionCar();
      SH.missions.update(dt);
      updateWanted(dt);
      updateInteract();
      if (SH.player.data.dead) {
        G.respawnT += dt;
        if (G.respawnT > 2.5) { G.respawnT = 0; wasted(); }
      }
      // shot-mode camera override for the aerial city shot
      if (G.shotMode === 'city') {
        G.camera.position.set(170, 190, 170);
        G.camera.lookAt(0, 0, 40);
      }
    }
    updateHUD(dt);
    G.renderer.render(G.scene, G.camera);
  }

  SH.game = {
    scene: null, camera: null,
    get state() { return G.state; },
    get modalOpen() { return G.modalOpen; },
    set modalOpen(v) { G.modalOpen = v; },
    init: init,
    save: save,
    setWanted: setWanted,
    setObjective: function (text, dist) {
      if (!text) { SH.show('objective-box', false); return; }
      SH.setText('objective', text);
      SH.setText('objective-dist', dist || '');
      SH.show('objective-box', true);
    },
    banner: function (title, sub, dur) {
      SH.setText('banner-title', title);
      SH.setText('banner-sub', sub || '');
      SH.show('banner', true);
      // Wall-clock expiry: the game loop runs slower than real time on a
      // software renderer, so a frame-counted banner would linger.
      G.bannerUntil = performance.now() / 1000 + (dur || 3.5);
    },
    flashDamage: function () {
      var d = SH.el('damage');
      d.style.opacity = '1';
      setTimeout(function () { d.style.opacity = '0'; }, 130);
    },
    noiseCrime: function (x, z, radius) {
      var near = SH.vehicles.police.some(function (p) {
        return SH.dist(x, z, p.group.position.x, p.group.position.z) < radius;
      });
      if (near) addWanted(1);
    },
    onPedShot: function (ped, damage) {
      if (ped.hostile) {
        ped.hp -= damage;
        if (ped.hp <= 0) {
          var idx = SH.vehicles.peds.indexOf(ped);
          if (idx >= 0) SH.vehicles.peds.splice(idx, 1);
          var hi = SH.missions.data.hostiles.indexOf(ped);
          if (hi >= 0) SH.missions.data.hostiles.splice(hi, 1);
          G.scene.remove(ped.group);
          SH.missions.onHostileDown();
        }
        return;
      }
      addWanted(1);
    },
    onPedRunOver: function (ped) {
      if (ped.hostile) return;
      addWanted(1);
    },
    onPoliceCarShot: function (policeCar, damage) {
      policeCar.group.userData.hp = (policeCar.group.userData.hp || 120) - damage;
      if (policeCar.group.userData.hp <= 0) {
        var idx = SH.vehicles.police.indexOf(policeCar);
        if (idx >= 0) SH.vehicles.police.splice(idx, 1);
        G.scene.remove(policeCar.group);
        addWanted(1);
        SH.audio.crash();
      }
    },
    showEndScreen: function () {
      SH.setText('end-text', 'Sal Kaine is finished, the limo is Mara’s, and Solmar City knows your name. ' +
        'You completed all 8 jobs. Free roam is open — the city is yours, Daz.');
      SH.show('end-screen', true);
      G.mode = 'end';
    },
    spawnGarageCar: function () {
      var st = G.state;
      if (G.garageCarObj) { G.scene.remove(G.garageCarObj); G.garageCarObj = null; }
      var car = SH.vehicles.makeCar(st.garageCar);
      var p = SH.city.places.garage;
      car.position.set(p.x + 10, 0, p.z + 6);
      car.rotation.y = Math.PI / 2;
      car.userData.heading = Math.PI / 2;
      car.userData.upgrade = !!st.upgrades[st.garageCar];
      G.scene.add(car);
      G.garageCarObj = car;
      SH.player.enterCar(car);
      SH.game.banner('GARAGE', SH.vehicles.MODELS[st.garageCar].name + ' is ready — take it for a spin.');
    }
  };

  // Boot once the DOM and scripts are ready.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
