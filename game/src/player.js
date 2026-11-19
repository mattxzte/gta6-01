// SOLMAR HEAT — the player: on-foot character, third-person camera,
// weapons and combat, entering and exiting cars.
(function () {
  var SH = window.SH;

  var WEAPONS = [
    { key: 'fists',   name: 'Fists',   price: 0,    damage: 14, range: 2.6, rate: 2.4, mag: 0,  auto: false },
    { key: 'pistol',  name: 'Pistol',  price: 300,  damage: 26, range: 60, rate: 3.2, mag: 12, auto: false },
    { key: 'smg',     name: 'SMG',     price: 1200, damage: 16, range: 48, rate: 9,   mag: 30, auto: true },
    { key: 'shotgun', name: 'Shotgun', price: 900,  damage: 15, range: 24, rate: 1.1, mag: 6,  auto: false, pellets: 6 },
    { key: 'rifle',   name: 'Rifle',   price: 2500, damage: 55, range: 95, rate: 2.2, mag: 20, auto: false }
  ];

  var P = {
    group: null, legL: null, legR: null, armL: null, armR: null, torso: null,
    x: 0, z: 0, y: 0, vy: 0, heading: 0, speed: 0,
    health: 100, armor: 0, dead: false,
    inCar: null, camYaw: 0, camPitch: 0.32, camDist: 6.5, camMode: 0,
    weapons: { fists: { owned: true, ammo: 0, reserve: 0 }, pistol: { owned: false, ammo: 0, reserve: 0 } },
    cur: 0, lastShot: 0, reloading: 0, walkPhase: 0,
    muzzle: null, muzzleLight: null, tracers: []
  };

  function buildCharacter(scene) {
    var g = new THREE.Group();
    var skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
    var jacket = new THREE.MeshLambertMaterial({ color: 0x2e4a6b });
    var pants = new THREE.MeshLambertMaterial({ color: 0x23272f });
    P.legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.85, 0.24), pants);
    P.legL.position.set(-0.13, 0.43, 0);
    P.legR = P.legL.clone(); P.legR.position.x = 0.13;
    P.torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.66, 0.32), jacket);
    P.torso.position.y = 1.18;
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin);
    head.position.y = 1.72;
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), new THREE.MeshLambertMaterial({ color: 0xd8a23a }));
    cap.position.y = 1.92;
    P.armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), jacket);
    P.armL.position.set(-0.42, 1.2, 0);
    P.armR = P.armL.clone(); P.armR.position.x = 0.42;
    g.add(P.legL); g.add(P.legR); g.add(P.torso); g.add(head); g.add(cap); g.add(P.armL); g.add(P.armR);
    // gun in right hand when armed
    var gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x181818 }));
    gun.position.set(0.42, 0.95, 0.25);
    gun.name = 'gun';
    g.add(gun);
    P.gun = gun;
    // muzzle flash sprite
    P.muzzle = new THREE.Sprite(new THREE.SpriteMaterial({
      map: SH.glowTexture('rgba(255,240,180,1)', 'rgba(255,150,0,0)'), transparent: true, depthWrite: false, opacity: 0 }));
    P.muzzle.scale.set(1.6, 1.6, 1);
    P.muzzle.position.set(0.42, 1.1, 0.9);
    g.add(P.muzzle);
    P.muzzleLight = new THREE.PointLight(0xffc860, 0, 9);
    P.muzzleLight.position.set(0.42, 1.2, 0.9);
    g.add(P.muzzleLight);
    scene.add(g);
    P.group = g;
  }

  function gunTipWorld() {
    var v = new THREE.Vector3(0.42, 1.15, 1.1);
    return P.group.localToWorld(v);
  }

  function addTracer(from, to) {
    var geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    SH.game.scene.add(line);
    P.tracers.push({ line: line, t: 0.09 });
  }

  function burstParticles(pos, color) {
    var g = SH.game.scene;
    for (var i = 0; i < 8; i++) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14),
        new THREE.MeshBasicMaterial({ color: color }));
      m.position.copy(pos);
      g.add(m);
      P.tracers.push({ line: m, t: 0.5, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4 + 2, vz: (Math.random() - 0.5) * 6, particle: true });
    }
  }

  // Hit test: nearest ped or police car inside a small cone from the camera.
  function findTarget(origin, dir, range) {
    var best = null, bestD = range;
    var v = SH.vehicles;
    for (var i = 0; i < v.peds.length; i++) {
      var p = v.peds[i].group.position;
      var dx = p.x - origin.x, dz = p.z - origin.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d > range || d < 0.5) continue;
      var dot = (dx * dir.x + dz * dir.z) / d;
      if (dot > 0.995 && d < bestD) { bestD = d; best = { kind: 'ped', obj: v.peds[i], d: d }; }
    }
    for (var j = 0; j < v.police.length; j++) {
      var c = v.police[j].group.position;
      var cdx = c.x - origin.x, cdz = c.z - origin.z;
      var cd = Math.sqrt(cdx * cdx + cdz * cdz);
      if (cd > range || cd < 1) continue;
      var cdot = (cdx * dir.x + cdz * dir.z) / cd;
      if (cdot > 0.99 && cd < bestD) { bestD = cd; best = { kind: 'police', obj: v.police[j], d: cd }; }
    }
    return best;
  }

  SH.player = {
    WEAPONS: WEAPONS,
    data: P,
    create: function (scene, x, z) {
      buildCharacter(scene);
      P.x = x; P.z = z; P.heading = 0;
      P.group.position.set(x, 0, z);
      P.group.rotation.y = P.heading;
      P.camYaw = Math.PI;
    },
    pos: function () { return { x: P.x, z: P.z }; },
    setSpawn: function (x, z) {
      P.x = x; P.z = z; P.group.position.set(x, 0, z);
      P.group.visible = true; P.inCar = null; P.dead = false;
      P.health = 100; P.armor = 0;
    },
    currentWeapon: function () { return WEAPONS[P.cur]; },
    weaponState: function (key) { return P.weapons[key]; },
    giveWeapon: function (key, reserveAmmo) {
      P.weapons[key] = P.weapons[key] || { owned: true, ammo: 0, reserve: 0 };
      P.weapons[key].owned = true;
      P.weapons[key].reserve += reserveAmmo || 0;
      if (P.weapons[key].ammo === 0) {
        var w = WEAPONS.find(function (x) { return x.key === key; });
        var take = Math.min(w.mag, P.weapons[key].reserve);
        P.weapons[key].ammo = take; P.weapons[key].reserve -= take;
      }
    },
    buyAmmo: function (key, amount) {
      if (!P.weapons[key] || !P.weapons[key].owned) return false;
      P.weapons[key].reserve += amount;
      return true;
    },
    switchWeapon: function (i) {
      if (i < 0 || i >= WEAPONS.length) return;
      var w = WEAPONS[i];
      if (!P.weapons[w.key] || !P.weapons[w.key].owned) return;
      P.cur = i;
      SH.audio.blip();
    },
    damage: function (n) {
      if (P.dead) return;
      var absorbed = Math.min(P.armor, n);
      P.armor -= absorbed;
      P.health -= (n - absorbed);
      SH.game.flashDamage();
      if (P.health <= 0) { P.health = 0; P.dead = true; }
    },
    heal: function (n) { P.health = SH.clamp(P.health + n, 0, 100); },
    addArmor: function (n) { P.armor = SH.clamp(P.armor + n, 0, 100); },

    enterCar: function (car) {
      P.inCar = car;
      P.group.visible = false;
      car.userData.driver = 'player';
      SH.audio.setEngine(0, true);
    },
    exitCar: function () {
      if (!P.inCar) return;
      var car = P.inCar;
      car.userData.driver = null;
      var side = car.rotation.y + Math.PI / 2;
      P.x = car.position.x + Math.sin(side) * 2.4;
      P.z = car.position.z + Math.cos(side) * 2.4;
      var c = SH.city.collide(P.x, P.z, 0.7);
      P.x = c.x; P.z = c.z;
      P.group.position.set(P.x, 0, P.z);
      P.group.visible = true;
      P.inCar = null;
      SH.audio.setEngine(0, false);
    },

    shoot: function () {
      if (P.dead || P.inCar) return;
      var w = WEAPONS[P.cur];
      var now = performance.now() / 1000;
      if (now - P.lastShot < 1 / w.rate) return;
      if (P.reloading > 0) return;
      var st = P.weapons[w.key];
      if (w.mag > 0) {
        if (st.ammo <= 0) {
          if (st.reserve > 0) {
            P.reloading = 0.9;
            SH.audio.blip();
          } else { SH.audio.dryClick(); }
          return;
        }
        st.ammo--;
      }
      P.lastShot = now;
      SH.audio.shot();
      P.muzzle.material.opacity = 1;
      P.muzzleLight.intensity = 2.2;
      var cam = SH.game.camera;
      var origin = cam.position.clone();
      var dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      dir.y = 0; dir.normalize();
      var pellets = w.pellets || 1;
      for (var k = 0; k < pellets; k++) {
        var spread = w.pellets ? 0.06 : 0.012;
        var d2 = dir.clone();
        d2.x += (Math.random() - 0.5) * spread;
        d2.z += (Math.random() - 0.5) * spread;
        d2.normalize();
        var target = findTarget({ x: origin.x, z: origin.z }, { x: d2.x, z: d2.z }, w.range);
        var end;
        if (target) {
          end = new THREE.Vector3(target.obj.group.position.x, 1.2, target.obj.group.position.z);
          if (target.kind === 'ped') {
            target.obj.flee = 3; target.obj.fx = target.obj.group.position.x - P.x; target.obj.fz = target.obj.group.position.z - P.z;
            var l = Math.hypot(target.obj.fx, target.obj.fz) || 1;
            target.obj.fx /= l; target.obj.fz /= l;
            SH.game.onPedShot(target.obj, w.damage);
            burstParticles(end, 0xff5040);
          } else {
            SH.game.onPoliceCarShot(target.obj, w.damage);
            burstParticles(end, 0xffa040);
          }
          SH.audio.hit();
        } else {
          end = origin.clone().add(d2.clone().multiplyScalar(w.range));
          end.y = 1.1;
        }
        addTracer(gunTipWorld(), end);
      }
      // every shot is a crime if police are near
      SH.game.noiseCrime(P.x, P.z, 30);
    },

    update: function (dt, input) {
      if (P.dead) return;
      // reload timer
      if (P.reloading > 0) {
        P.reloading -= dt;
        if (P.reloading <= 0) {
          var w = WEAPONS[P.cur], st = P.weapons[w.key];
          var take = Math.min(w.mag, st.reserve);
          st.ammo = take; st.reserve -= take;
          SH.audio.blip();
        }
      }
      P.muzzle.material.opacity = Math.max(0, P.muzzle.material.opacity - dt * 14);
      P.muzzleLight.intensity = Math.max(0, P.muzzleLight.intensity - dt * 30);
      for (var i = P.tracers.length - 1; i >= 0; i--) {
        var tr = P.tracers[i];
        tr.t -= dt;
        if (tr.particle) {
          tr.line.position.x += tr.vx * dt;
          tr.line.position.y += tr.vy * dt;
          tr.line.position.z += tr.vz * dt;
          tr.vy -= 14 * dt;
        }
        if (tr.t <= 0) {
          SH.game.scene.remove(tr.line);
          if (tr.line.geometry) tr.line.geometry.dispose();
          P.tracers.splice(i, 1);
        }
      }
      // camera orbit from mouse drag
      P.camYaw += (input.lookDX || 0) * 0.0032;
      P.camPitch = SH.clamp(P.camPitch + (input.lookDY || 0) * 0.0026, 0.08, 1.1);
      input.lookDX = 0; input.lookDY = 0;

      if (P.inCar) {
        var car = P.inCar, u = car.userData;
        var throttle = (input.f ? 1 : 0) - (input.b ? 0.8 : 0);
        var steer = (input.l ? 1 : 0) - (input.r ? 1 : 0);
        var res = SH.vehicles.driveCar(car, { throttle: throttle, steer: steer, handbrake: !!input.handbrake }, dt);
        SH.vehicles.resolveCarCollisions(car, SH.vehicles.traffic.concat(SH.vehicles.parked).concat(SH.vehicles.police.map(function (p) { return p.group; })));
        SH.audio.setEngine(Math.abs(u.speed) / u.def.top, true);
        if (input.horn) SH.audio.horn();
        // run over pedestrians (dark, but it is a crime game)
        for (var pi = 0; pi < SH.vehicles.peds.length; pi++) {
          var ped = SH.vehicles.peds[pi];
          var dx = ped.group.position.x - car.position.x, dz = ped.group.position.z - car.position.z;
          if (dx * dx + dz * dz < 4.4 && Math.abs(u.speed) > 4) {
            ped.flee = 3; ped.fx = dx / (Math.hypot(dx, dz) || 1); ped.fz = dz / (Math.hypot(dx, dz) || 1);
            SH.game.onPedRunOver(ped);
          }
        }
        P.x = car.position.x; P.z = car.position.z;
        P.heading = u.heading;
        return;
      }

      // on foot
      var sprint = input.sprint ? 1.55 : 1;
      var speed = 5.2 * sprint;
      var f = (input.f ? 1 : 0) - (input.b ? 1 : 0);
      var s = (input.r ? 1 : 0) - (input.l ? 1 : 0);
      var mx = 0, mz = 0;
      if (f || s) {
        var sy = Math.sin(P.camYaw), cy = Math.cos(P.camYaw);
        // camera looks along -Z of its yaw; forward = (-sin, -cos) in xz
        var fx = -Math.sin(P.camYaw), fz = -Math.cos(P.camYaw);
        var rx = -fz, rz = fx;
        mx = fx * f + rx * s; mz = fz * f + rz * s;
        var ml = Math.hypot(mx, mz) || 1;
        mx /= ml; mz /= ml;
        P.heading = Math.atan2(mx, mz);
        P.speed = speed;
        P.walkPhase += dt * speed * 1.6;
      } else {
        P.speed = 0;
      }
      var nx = P.x + mx * P.speed * dt;
      var nz = P.z + mz * P.speed * dt;
      // push out of cars
      var cars = SH.vehicles.traffic.concat(SH.vehicles.parked).concat(SH.vehicles.police.map(function (p) { return p.group; }));
      for (var ci = 0; ci < cars.length; ci++) {
        var cg = cars[ci].group || cars[ci];
        var cdx = nx - cg.position.x, cdz = nz - cg.position.z;
        var cd2 = cdx * cdx + cdz * cdz;
        if (cd2 < 5.3 && cd2 > 0.001) {
          var cd = Math.sqrt(cd2);
          nx = cg.position.x + cdx / cd * 2.3;
          nz = cg.position.z + cdz / cd * 2.3;
          var cSpeed = Math.abs((cg.userData && cg.userData.speed) || 0);
          if (cSpeed > 6) { P.damage(12); P.x = nx; P.z = nz; }
        }
      }
      var hit = SH.city.collide(nx, nz, 0.7);
      P.x = hit.x; P.z = hit.z;
      // jump / gravity
      if (input.jump && P.y === 0) P.vy = 8;
      P.vy -= 22 * dt;
      P.y = Math.max(0, P.y + P.vy * dt);
      if (P.y === 0) P.vy = 0;
      P.group.position.set(P.x, P.y, P.z);
      P.group.rotation.y = P.heading;
      // walk animation
      var sw = P.speed > 0 ? Math.sin(P.walkPhase) * 0.55 : 0;
      P.legL.rotation.x = sw; P.legR.rotation.x = -sw;
      P.armL.rotation.x = -sw * 0.8; P.armR.rotation.x = sw * 0.8;
      var armed = P.cur > 0;
      P.gun.visible = armed;
      if (armed) P.armR.rotation.x = -1.2;
      SH.audio.setEngine(0, false);
    },

    updateCamera: function (dt) {
      var cam = SH.game.camera;
      var target, dist, height;
      if (P.inCar) {
        var car = P.inCar, u = car.userData;
        var back = 9 + Math.abs(u.speed) * 0.06 + P.camMode * 3;
        var cx = car.position.x - Math.sin(u.heading) * back;
        var cz = car.position.z - Math.cos(u.heading) * back;
        var ch = 3.2 + P.camMode * 1.2;
        cam.position.x = SH.lerp(cam.position.x, cx, 1 - Math.pow(0.001, dt));
        cam.position.y = SH.lerp(cam.position.y, ch, 1 - Math.pow(0.001, dt));
        cam.position.z = SH.lerp(cam.position.z, cz, 1 - Math.pow(0.001, dt));
        cam.lookAt(car.position.x + Math.sin(u.heading) * 6, 1.6, car.position.z + Math.cos(u.heading) * 6);
        return;
      }
      dist = P.camDist + P.camMode * 2.5;
      height = 2.2 + Math.sin(P.camPitch) * dist * 0.9;
      var cx2 = P.x + Math.sin(P.camYaw) * Math.cos(P.camPitch) * dist;
      var cz2 = P.z + Math.cos(P.camYaw) * Math.cos(P.camPitch) * dist;
      cam.position.x = SH.lerp(cam.position.x, cx2, 1 - Math.pow(0.0005, dt));
      cam.position.y = SH.lerp(cam.position.y, height, 1 - Math.pow(0.0005, dt));
      cam.position.z = SH.lerp(cam.position.z, cz2, 1 - Math.pow(0.0005, dt));
      cam.lookAt(P.x, 1.5, P.z);
    }
  };
})();
