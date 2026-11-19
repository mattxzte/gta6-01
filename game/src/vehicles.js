// SOLMAR HEAT — vehicles: procedural car models, traffic AI, pedestrians,
// police pursuit, the police helicopter and roadblocks.
(function () {
  var SH = window.SH;

  var MODELS = {
    sedan:   { name: 'Vulcar Sedan',   price: 900,  top: 30, accel: 14, len: 4.4, wid: 1.9, h: 0.62, cabin: 0.55 },
    coupe:   { name: 'Vulcar Coupe',   price: 2400, top: 34, accel: 17, len: 4.2, wid: 1.85, h: 0.55, cabin: 0.5 },
    sports:  { name: 'Comet GT',      price: 12000, top: 42, accel: 24, len: 4.5, wid: 2.0, h: 0.5, cabin: 0.48 },
    suv:     { name: 'Rancher SUV',    price: 4200, top: 29, accel: 13, len: 4.8, wid: 2.05, h: 0.8, cabin: 0.7 },
    truck:   { name: 'Benson Truck',   price: 3600, top: 26, accel: 11, len: 5.4, wid: 2.1, h: 0.9, cabin: 0.8 },
    taxi:    { name: 'Solmar Taxi',    price: 1500, top: 31, accel: 15, len: 4.4, wid: 1.9, h: 0.62, cabin: 0.55 },
    police:  { name: 'SCPD Interceptor', price: 0, top: 36, accel: 20, len: 4.5, wid: 2.0, h: 0.6, cabin: 0.55 }
  };
  var COLORS = [0xc0392b, 0x2c6eb8, 0x27ae60, 0xe8e8e8, 0x222222, 0xe67e22, 0x8e44ad, 0xd8c95a, 0x16a085, 0xb03a5b];

  function box(w, h, d, color, x, y, z, opts) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial(Object.assign({ color: color }, opts || {})));
    m.position.set(x, y, z);
    return m;
  }

  function makeCar(modelKey, colorHex) {
    var def = MODELS[modelKey];
    var g = new THREE.Group();
    var color = colorHex !== undefined ? colorHex : SH.pick(SH.rng((Math.random() * 1e9) | 0), COLORS);
    var body = box(def.wid, def.h, def.len, color, 0, 0.55 + def.h / 2 - 0.31, 0);
    g.add(body);
    var cabin = box(def.wid * 0.86, def.cabin, def.len * 0.5, 0x18202c, 0, 0.55 + def.h + def.cabin / 2 - 0.28, -def.len * 0.06);
    g.add(cabin);
    // wheels
    var wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
    var wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
    var wx = def.wid / 2 - 0.05, wz = def.len / 2 - 0.85;
    [[-wx, wz], [wx, wz], [-wx, -wz], [wx, -wz]].forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.36, p[1]);
      g.add(w);
      g.userData['wheel' + p[0] + p[1]] = w;
    });
    // headlights / taillights
    var hl = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
    [-0.6, 0.6].forEach(function (x) {
      var h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.06), hl);
      h.position.set(x * def.wid / 1.9, 0.72, def.len / 2 + 0.01);
      g.add(h);
    });
    var tl = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
    [-0.6, 0.6].forEach(function (x) {
      var t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.06), tl);
      t.position.set(x * def.wid / 1.9, 0.72, -def.len / 2 - 0.01);
      g.add(t);
    });
    if (modelKey === 'sports') {
      g.add(box(def.wid * 0.9, 0.08, 0.4, 0x181818, 0, 0.95, -def.len / 2 + 0.15)); // spoiler
    }
    if (modelKey === 'truck') {
      g.add(box(def.wid * 0.95, 1.1, def.len * 0.42, 0x9aa2ac, 0, 1.15, -def.len * 0.22)); // cargo box
    }
    if (modelKey === 'taxi') {
      var sign = box(0.7, 0.22, 0.4, 0xffd23f, 0, 1.42, 0);
      g.add(sign);
    }
    if (modelKey === 'police') {
      g.add(box(def.wid * 0.92, 0.1, def.len * 0.5, 0xf2f2f2, 0, 0.98, 0)); // white doors band
      var bar = new THREE.Group();
      var red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      red.position.x = -0.35;
      var blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      blue.position.x = 0.35;
      bar.add(red); bar.add(blue);
      bar.position.set(0, 1.45, -0.1);
      g.add(bar);
      g.userData.lightBar = { red: red, blue: blue, t: 0 };
    }
    g.userData.model = modelKey;
    g.userData.def = def;
    g.userData.speed = 0;
    g.userData.heading = 0;
    g.userData.color = color;
    return g;
  }

  var traffic = [], parked = [], peds = [];
  var policeList = [], roadblockList = [];
  var heli = null, heliLight = null;

  function laneOffset(axis, dir) { return dir > 0 ? 3.4 : -3.4; }

  function trafficCar(scene, rand) {
    var axis = rand() < 0.5 ? 'x' : 'z';
    var road = SH.city.roadCenter(Math.floor(rand() * 9));
    var dir = rand() < 0.5 ? 1 : -1;
    var model = SH.pick(rand, ['sedan', 'sedan', 'coupe', 'suv', 'taxi', 'truck']);
    var car = makeCar(model);
    var along = -380 + rand() * 760;
    car.position.set(axis === 'x' ? along : road + laneOffset(axis, dir), 0, axis === 'x' ? road + laneOffset(axis, dir) : along);
    car.rotation.y = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    scene.add(car);
    return { group: car, axis: axis, road: road, dir: dir, speed: 7 + rand() * 5, target: 7 + rand() * 5, wait: 0 };
  }

  function pedMesh(scene, rand) {
    var g = new THREE.Group();
    var shirt = SH.pick(rand, [0xd84a4a, 0x4a7fd8, 0x4ad87a, 0xd8c94a, 0x9a5fd8, 0xe8e8e8]);
    var legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.26), new THREE.MeshLambertMaterial({ color: 0x2a3242 }));
    legs.position.y = 0.4;
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.3), new THREE.MeshLambertMaterial({ color: shirt }));
    torso.position.y = 1.1;
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), new THREE.MeshLambertMaterial({ color: SH.pick(rand, [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0]) }));
    head.position.y = 1.6;
    g.add(legs); g.add(torso); g.add(head);
    g.userData.torso = torso;
    scene.add(g);
    return g;
  }

  function makeHeli(scene) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 4.6), new THREE.MeshLambertMaterial({ color: 0x1c2f4a }));
    body.position.y = 0;
    var tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.4), new THREE.MeshLambertMaterial({ color: 0x1c2f4a }));
    tail.position.set(0, 0.2, -4);
    var rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.7), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    rotor.position.y = 1.0;
    var glass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 1.4), new THREE.MeshLambertMaterial({ color: 0x9fd0ff }));
    glass.position.set(0, 0.25, 1.6);
    g.add(body); g.add(tail); g.add(rotor); g.add(glass);
    g.userData.rotor = rotor;
    var spot = new THREE.SpotLight(0xfff2b0, 3.2, 90, 0.32, 0.5, 1.2);
    spot.position.set(0, -0.6, 0);
    g.add(spot);
    g.add(spot.target);
    g.visible = false;
    scene.add(g);
    return { group: g, spot: spot, angle: 0 };
  }

  SH.vehicles = {
    MODELS: MODELS,
    traffic: traffic, parked: parked, peds: peds,
    police: policeList, roadblocks: roadblockList,
    makeCar: makeCar,

    spawnParked: function (scene, rand, count) {
      for (var i = 0; i < count; i++) {
        var spot = SH.city.parkingSpot(rand);
        var model = SH.pick(rand, ['sedan', 'coupe', 'suv', 'sports', 'taxi', 'truck']);
        var car = makeCar(model);
        car.position.set(spot.x, 0, spot.z);
        car.rotation.y = spot.alongZ ? (rand() < 0.5 ? 0 : Math.PI) : (rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
        car.userData.heading = car.rotation.y;
        scene.add(car);
        parked.push({ group: car, model: model, taken: false });
      }
    },

    spawnTraffic: function (scene, rand, count) {
      for (var i = 0; i < count; i++) traffic.push(trafficCar(scene, rand));
    },

    spawnPeds: function (scene, rand, count) {
      for (var i = 0; i < count; i++) {
        var g = pedMesh(scene, rand);
        var road = SH.city.roadCenter(Math.floor(rand() * 9));
        var along = -380 + rand() * 760;
        var side = rand() < 0.5 ? -11 : 11;
        var axis = rand() < 0.5 ? 'x' : 'z';
        g.position.set(axis === 'x' ? along : road + side, 0, axis === 'x' ? road + side : along);
        var heading = rand() * Math.PI * 2;
        g.rotation.y = heading;
        peds.push({ group: g, heading: heading, speed: 1 + rand() * 0.8, flee: 0, fx: 0, fz: 0 });
      }
    },

    ensureHeli: function (scene) {
      if (!heli) heli = makeHeli(scene);
      return heli;
    },

    // Arcade driving: throttle -1..1, steer -1..1, handbrake bool.
    driveCar: function (car, input, dt) {
      var def = car.userData.def, u = car.userData;
      var top = def.top * (u.upgrade ? 1.18 : 1);
      if (input.throttle > 0) u.speed += def.accel * input.throttle * dt;
      else if (input.throttle < 0) u.speed += def.accel * 1.4 * input.throttle * dt;
      else u.speed -= Math.sign(u.speed) * Math.min(Math.abs(u.speed), 8 * dt);
      if (input.handbrake) u.speed -= Math.sign(u.speed) * Math.min(Math.abs(u.speed), 26 * dt);
      u.speed = SH.clamp(u.speed, -top * 0.45, top);
      var steerAuthority = SH.clamp(Math.abs(u.speed) / 10, 0.15, 1);
      u.heading += input.steer * 1.9 * steerAuthority * Math.sign(u.speed || 1) * dt;
      var nx = car.position.x + Math.sin(u.heading) * u.speed * dt;
      var nz = car.position.z + Math.cos(u.heading) * u.speed * dt;
      var hit = SH.city.collide(nx, nz, 2.1);
      if (hit.hit) {
        if (Math.abs(u.speed) > 8) SH.audio.crash();
        u.speed *= 0.45;
        nx = hit.x; nz = hit.z;
      }
      car.position.x = nx; car.position.z = nz;
      car.rotation.y = u.heading;
      // wheel spin + body roll
      var roll = -input.steer * SH.clamp(Math.abs(u.speed) / 30, 0, 1) * 0.05;
      car.rotation.z = roll;
      return { speed: u.speed, hit: hit.hit };
    },

    // Circle-circle separation between the player's car and other cars.
    resolveCarCollisions: function (car, others) {
      var bumped = false;
      for (var i = 0; i < others.length; i++) {
        var o = others[i].group || others[i];
        if (o === car) continue;
        var dx = car.position.x - o.position.x, dz = car.position.z - o.position.z;
        var d2 = dx * dx + dz * dz, min = 4.4;
        if (d2 < min * min && d2 > 0.001) {
          var d = Math.sqrt(d2), push = (min - d) / 2;
          car.position.x += dx / d * push; car.position.z += dz / d * push;
          o.position.x -= dx / d * push; o.position.z -= dz / d * push;
          var sp = car.userData.speed;
          car.userData.speed *= 0.7;
          if (Math.abs(sp) > 6) { SH.audio.crash(); bumped = true; }
        }
      }
      return bumped;
    },

    updateTraffic: function (dt, playerCar) {
      for (var i = 0; i < traffic.length; i++) {
        var t = traffic[i], c = t.group;
        // brake for the car ahead on the same road
        var want = t.target;
        for (var j = 0; j < traffic.length; j++) {
          if (i === j) continue;
          var o = traffic[j];
          if (o.axis !== t.axis || o.road !== t.road || o.dir !== t.dir) continue;
          var ahead = t.axis === 'x'
            ? (o.group.position.x - c.position.x) * t.dir
            : (o.group.position.z - c.position.z) * t.dir;
          if (ahead > 0 && ahead < 13) { want = 0; break; }
        }
        if (playerCar) {
          var pdx = playerCar.position.x - c.position.x, pdz = playerCar.position.z - c.position.z;
          var pd = Math.sqrt(pdx * pdx + pdz * pdz);
          var pAhead = t.axis === 'x' ? pdx * t.dir : pdz * t.dir;
          if (pd < 12 && pAhead > 0) want = 0;
        }
        t.speed += SH.clamp(want - t.speed, -10 * dt, 6 * dt);
        var move = t.speed * t.dir * dt;
        if (t.axis === 'x') c.position.x += move; else c.position.z += move;
        // at an intersection, sometimes turn
        var along = t.axis === 'x' ? c.position.x : c.position.z;
        var nearest = Math.round((along + 384) / 96) * 96 - 384;
        if (Math.abs(along - nearest) < 1.2 && Math.random() < 0.35) {
          var turn = Math.random();
          if (turn < 0.5) {
            t.axis = t.axis === 'x' ? 'z' : 'x';
            t.road = nearest;
            t.dir = Math.random() < 0.5 ? 1 : -1;
            var off = laneOffset(t.axis, t.dir);
            if (t.axis === 'x') { c.position.z = nearest + off; c.position.x = nearest; }
            else { c.position.x = nearest + off; c.position.z = nearest; }
          }
        }
        // wrap around the world edge
        if (along > 390 || along < -390) {
          var na = along > 390 ? -385 : 385;
          if (t.axis === 'x') c.position.x = na; else c.position.z = na;
        }
        c.rotation.y = t.axis === 'x' ? (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (t.dir > 0 ? 0 : Math.PI);
        c.userData.speed = t.speed;
        if (c.userData.lightBar) {
          c.userData.lightBar.t += dt * 8;
          var on = Math.sin(c.userData.lightBar.t) > 0;
          c.userData.lightBar.red.material.color.setHex(on ? 0xff2222 : 0x550000);
          c.userData.lightBar.blue.material.color.setHex(on ? 0x111144 : 0x2244ff);
        }
      }
    },

    updatePeds: function (dt, danger) {
      for (var i = 0; i < peds.length; i++) {
        var p = peds[i], g = p.group;
        if (danger) {
          var ddx = g.position.x - danger.x, ddz = g.position.z - danger.z;
          var dd = Math.sqrt(ddx * ddx + ddz * ddz);
          if (dd < 26) { p.flee = 2.5; p.fx = ddx / (dd || 1); p.fz = ddz / (dd || 1); }
        }
        var sp = p.speed, hx = Math.sin(p.heading), hz = Math.cos(p.heading);
        if (p.flee > 0) {
          p.flee -= dt; sp = p.speed * 2.6; hx = p.fx; hz = p.fz;
          p.heading = Math.atan2(hx, hz);
        } else if (Math.random() < dt * 0.05) {
          p.heading += (Math.random() - 0.5) * 1.6;
        }
        g.position.x += hx * sp * dt;
        g.position.z += hz * sp * dt;
        var c = SH.city.collide(g.position.x, g.position.z, 0.6);
        g.position.x = c.x; g.position.z = c.z;
        if (g.position.x > 388 || g.position.x < -388 || g.position.z > 388 || g.position.z < -388) {
          p.heading += Math.PI;
        }
        g.rotation.y = p.heading;
        if (g.userData.torso) g.userData.torso.position.y = 1.1 + Math.abs(Math.sin(performance.now() * 0.006 + i)) * 0.05;
      }
    },

    spawnPolice: function (scene, near, count) {
      while (policeList.length < count) {
        var car = makeCar('police', 0x1c2f4a);
        var a = Math.random() * Math.PI * 2, r = 55 + Math.random() * 40;
        var rp = SH.city.nearestRoadPoint(near.x + Math.cos(a) * r, near.z + Math.sin(a) * r);
        car.position.set(rp.x, 0, rp.z);
        car.rotation.y = Math.random() * Math.PI * 2;
        car.userData.heading = car.rotation.y;
        scene.add(car);
        policeList.push({ group: car, speed: 0, siren: true });
      }
    },

    clearPolice: function (scene) {
      for (var i = 0; i < policeList.length; i++) scene.remove(policeList[i].group);
      policeList.length = 0;
    },

    updatePolice: function (dt, target, scene) {
      for (var i = 0; i < policeList.length; i++) {
        var p = policeList[i], car = p.group, u = car.userData;
        var dx = target.x - car.position.x, dz = target.z - car.position.z;
        var dist = Math.sqrt(dx * dx + dz * dz) || 1;
        var wantHeading = Math.atan2(dx, dz);
        var diff = SH.angleDiff(u.heading, wantHeading);
        u.heading += SH.clamp(diff, -2.4 * dt, 2.4 * dt);
        var top = dist > 60 ? 33 : 28;
        u.speed += SH.clamp(top - u.speed, -14 * dt, 10 * dt);
        var nx = car.position.x + Math.sin(u.heading) * u.speed * dt;
        var nz = car.position.z + Math.cos(u.heading) * u.speed * dt;
        var hit = SH.city.collide(nx, nz, 2.1);
        if (hit.hit) { u.speed *= 0.5; u.heading += 0.6 * dt * 10; nx = hit.x; nz = hit.z; }
        car.position.x = nx; car.position.z = nz;
        car.rotation.y = u.heading;
        if (u.lightBar) {
          u.lightBar.t += dt * 9;
          var on = Math.sin(u.lightBar.t) > 0;
          u.lightBar.red.material.color.setHex(on ? 0xff2222 : 0x550000);
          u.lightBar.blue.material.color.setHex(on ? 0x111144 : 0x2244ff);
        }
        if (dist > 190) { // respawn closer if the player outran it
          var a = Math.random() * Math.PI * 2;
          var rp = SH.city.nearestRoadPoint(target.x + Math.cos(a) * 60, target.z + Math.sin(a) * 60);
          car.position.set(rp.x, 0, rp.z);
          u.speed = 10;
        }
      }
      SH.audio.setSiren(policeList.length > 0);
    },

    updateHeli: function (dt, target, active) {
      if (!heli) return;
      heli.group.visible = active;
      if (!active) return;
      heli.angle += dt * 0.45;
      var hx = target.x + Math.cos(heli.angle) * 26;
      var hz = target.z + Math.sin(heli.angle) * 26;
      heli.group.position.set(hx, 46, hz);
      heli.group.lookAt(target.x, 0, target.z);
      heli.group.userData.rotor.rotation.y += dt * 22;
      heli.spot.target.position.set(target.x - hx, -46, target.z - hz);
      heli.spot.target.updateMatrixWorld();
    },

    spawnRoadblocks: function (scene, near) {
      if (roadblockList.length > 0) return;
      for (var i = 0; i < 2; i++) {
        var a = (i * Math.PI) + 0.4;
        var rp = SH.city.nearestRoadPoint(near.x + Math.cos(a) * 42, near.z + Math.sin(a) * 42);
        for (var k = -1; k <= 1; k++) {
          var car = makeCar('police', 0x1c2f4a);
          car.position.set(rp.x + k * 5, 0, rp.z + (k % 2) * 2);
          car.rotation.y = Math.PI / 2 + (k * 0.15);
          car.userData.heading = car.rotation.y;
          scene.add(car);
          roadblockList.push({ group: car });
        }
      }
    },

    clearRoadblocks: function (scene) {
      for (var i = 0; i < roadblockList.length; i++) scene.remove(roadblockList[i].group);
      roadblockList.length = 0;
    },

    // Nearest parked car the player can steal, within range.
    nearestParked: function (x, z, range) {
      var best = null, bd = range * range;
      for (var i = 0; i < parked.length; i++) {
        if (parked[i].taken) continue;
        var p = parked[i].group.position;
        var d = SH.dist2(x, z, p.x, p.z);
        if (d < bd) { bd = d; best = parked[i]; }
      }
      return best;
    }
  };
})();
