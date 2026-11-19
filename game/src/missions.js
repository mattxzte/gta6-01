// SOLMAR HEAT — story missions, shops, garage and safehouses.
// Dario "Daz" Cole comes home to Solmar City; Mara Voss has work, Sal Kaine has a grudge.
(function () {
  var SH = window.SH;

  // Step targets use `place` (a key of SH.city.places, resolved at run time)
  // or literal x/z coordinates. Never read SH.city.places at load time:
  // the city is built after these files load.
  var LIST = [
    {
      id: 0, name: 'HOMECOMING', giver: 'Mara Voss', reward: 400,
      intro: 'Mara needs her coupe at the garage. Drive it there — and try not to scratch it.',
      steps: [
        { type: 'goto', place: 'mara', label: 'Pick up Mara’s coupe', radius: 7 },
        { type: 'enter', model: 'coupe', x: 96, z: -224, label: 'Get in the coupe', radius: 5 },
        { type: 'goto', place: 'garage', label: 'Deliver the coupe to the garage', radius: 8, inCar: true }
      ],
      unlock: { weapon: 'pistol', ammo: 24 }
    },
    {
      id: 1, name: 'FIRST JOB', giver: 'Mara Voss', reward: 700,
      intro: 'A package is waiting at the port. Pick it up and bring it to Mara. Quick — 150 seconds.',
      steps: [
        { type: 'goto', place: 'port', label: 'Collect the package at the port', radius: 7 },
        { type: 'goto', place: 'mara', label: 'Deliver the package to Mara', radius: 7, time: 150 }
      ]
    },
    {
      id: 2, name: 'GETAWAY DRIVER', giver: 'Mara Voss', reward: 900,
      intro: 'The port job went loud. The cops are on you — lose them. Survive 45 seconds.',
      steps: [
        { type: 'survive', seconds: 45, wanted: 2, label: 'Lose the cops — survive 45 seconds' }
      ],
      unlock: { weapon: 'smg', ammo: 60 }
    },
    {
      id: 3, name: 'REPO MAN', giver: 'Mara Voss', reward: 1400,
      intro: 'Sal’s crew parks a Comet GT by the stadium. Two of his boys guard it. Take the car.',
      steps: [
        { type: 'clear', count: 2, cx: -240, cz: 200, label: 'Deal with Sal’s guards at the stadium', radius: 40 },
        { type: 'enter', model: 'sports', x: -216, z: 216, label: 'Steal the Comet GT', radius: 5 },
        { type: 'goto', place: 'garage', label: 'Bring the Comet GT to the garage', radius: 8, inCar: true }
      ],
      unlock: { car: 'sports' }
    },
    {
      id: 4, name: 'TURBULENCE', giver: 'Mara Voss', reward: 1800,
      intro: 'A helicopter is over the city and every cop in Solmar wants you. Reach the beach house.',
      steps: [
        { type: 'goto', place: 'safehouseB', label: 'Reach the beach house — helicopter overhead', radius: 8, wanted: 3, time: 90 }
      ],
      unlock: { weapon: 'shotgun', ammo: 18 }
    },
    {
      id: 5, name: 'THE DROP', giver: 'Mara Voss', reward: 2400,
      intro: 'Sal’s shipment lands at the port tonight. Clear his crew, grab the briefcase, bring it home.',
      steps: [
        { type: 'clear', count: 6, cx: 336, cz: -48, label: 'Clear Sal’s crew at the port', radius: 45 },
        { type: 'goto', x: 348, z: -36, label: 'Grab the briefcase', radius: 5 },
        { type: 'goto', place: 'mara', label: 'Deliver the briefcase to Mara', radius: 7 }
      ],
      unlock: { weapon: 'rifle', ammo: 40 }
    },
    {
      id: 6, name: 'PAYBACK', giver: 'Mara Voss', reward: 3200,
      intro: 'Time to hit Sal where he lives — his downtown compound. Then get out before the whole force arrives.',
      steps: [
        { type: 'clear', count: 8, cx: 0, cz: -48, label: 'Clear Sal’s compound downtown', radius: 50 },
        { type: 'survive', seconds: 30, wanted: 3, label: 'Escape the police response — survive 30 seconds' }
      ]
    },
    {
      id: 7, name: 'KING OF SOLMAR', giver: 'Mara Voss', reward: 5000,
      intro: 'Sal’s armored limo is at the stadium. Take it, run the roadblocks, shake the helicopter, bring it to Mara. Then the city is yours.',
      steps: [
        { type: 'enter', model: 'sports', x: -216, z: 224, label: 'Steal Sal’s armored limo', radius: 5 },
        { type: 'survive', seconds: 75, wanted: 4, label: 'Escape — 4 stars, roadblocks, helicopter. Survive 75 seconds', inCar: true },
        { type: 'goto', place: 'mara', label: 'Deliver the limo to Mara', radius: 8, inCar: true }
      ]
    }
  ];

  var M = {
    list: LIST,
    active: null, stepIdx: 0, stepT: 0, kills: 0,
    missionCar: null, hostiles: []
  };

  function state() { return SH.game.state; }

  function spawnHostiles(scene, cx, cz, count) {
    M.hostiles = [];
    for (var i = 0; i < count; i++) {
      var a = (i / count) * Math.PI * 2 + Math.random();
      var x = cx + Math.cos(a) * (8 + Math.random() * 14);
      var z = cz + Math.sin(a) * (8 + Math.random() * 14);
      var g = new THREE.Group();
      var dark = new THREE.MeshLambertMaterial({ color: 0x1a1a22 });
      var legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.26), dark);
      legs.position.y = 0.4;
      var torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.3), new THREE.MeshLambertMaterial({ color: 0x3a3a3a }));
      torso.position.y = 1.1;
      var head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), new THREE.MeshLambertMaterial({ color: 0xc98a5a }));
      head.position.y = 1.6;
      var gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      gun.position.set(0.3, 1.15, 0.3);
      g.add(legs); g.add(torso); g.add(head); g.add(gun);
      g.userData.torso = torso;
      g.position.set(x, 0, z);
      scene.add(g);
      var ped = { group: g, heading: 0, speed: 0, flee: 0, fx: 0, fz: 0, hostile: true, hp: 50, shootT: 1 + Math.random() };
      SH.vehicles.peds.push(ped);
      M.hostiles.push(ped);
    }
  }

  function clearHostiles(scene) {
    for (var i = 0; i < M.hostiles.length; i++) {
      var h = M.hostiles[i];
      scene.remove(h.group);
      var idx = SH.vehicles.peds.indexOf(h);
      if (idx >= 0) SH.vehicles.peds.splice(idx, 1);
    }
    M.hostiles = [];
  }

  function removeMissionCar(scene) {
    if (M.missionCar) {
      if (!SH.player.data.inCar || SH.player.data.inCar !== M.missionCar) scene.remove(M.missionCar);
      M.missionCar = null;
    }
  }

  function setBeacon(x, z, visible) {
    var b = SH.city.beacons.mission;
    b.position.set(x, 0, z);
    b.visible = visible;
  }

  function currentStep() {
    return M.active ? M.active.steps[M.stepIdx] : null;
  }

  // Resolve a step's target position: a named place or literal coordinates.
  function posOf(step) {
    if (step.place) {
      var p = SH.city.places[step.place];
      return { x: p.x, z: p.z };
    }
    return { x: step.x, z: step.z };
  }

  function beginStep() {
    var s = currentStep();
    if (!s) return;
    M.stepT = 0; M.kills = 0;
    if (s.type === 'goto' || s.type === 'enter') {
      var tp = posOf(s);
      setBeacon(tp.x, tp.z, true);
    } else if (s.type === 'clear') { setBeacon(s.cx, s.cz, true); spawnHostiles(SH.game.scene, s.cx, s.cz, s.count); }
    else setBeacon(0, 0, false);
    if (s.wanted) SH.game.setWanted(s.wanted);
    SH.game.setObjective(s.label, '');
  }

  function advanceStep() {
    SH.audio.pickup();
    M.stepIdx++;
    if (M.stepIdx >= M.active.steps.length) completeMission();
    else beginStep();
  }

  function completeMission() {
    var m = M.active;
    var st = state();
    st.money += m.reward;
    st.completedMissions.push(m.id);
    st.missionIndex = Math.min(m.id + 1, LIST.length);
    if (m.unlock) {
      if (m.unlock.weapon) {
        SH.player.giveWeapon(m.unlock.weapon, m.unlock.ammo || 0);
        SH.game.banner(m.name + ' COMPLETE', 'Unlocked: ' + m.unlock.weapon.toUpperCase() + '  ·  +$' + m.reward);
      } else if (m.unlock.car) {
        if (st.ownedCars.indexOf(m.unlock.car) < 0) st.ownedCars.push(m.unlock.car);
        SH.game.banner(m.name + ' COMPLETE', 'Unlocked: Comet GT in your garage  ·  +$' + m.reward);
      } else {
        SH.game.banner(m.name + ' COMPLETE', 'Reward: $' + m.reward);
      }
    } else {
      SH.game.banner(m.name + ' COMPLETE', 'Reward: $' + m.reward);
    }
    SH.audio.missionOk();
    SH.audio.cash();
    setBeacon(0, 0, false);
    clearHostiles(SH.game.scene);
    removeMissionCar(SH.game.scene);
    M.active = null;
    SH.game.setObjective('', '');
    SH.game.save();
    if (m.id === LIST.length - 1) SH.game.showEndScreen();
  }

  function failMission(reason) {
    if (!M.active) return;
    SH.game.banner('MISSION FAILED', reason);
    SH.audio.missionFail();
    setBeacon(0, 0, false);
    clearHostiles(SH.game.scene);
    removeMissionCar(SH.game.scene);
    M.active = null;
    SH.game.setObjective('', '');
    SH.game.setWanted(0);
  }

  SH.missions = {
    data: M,
    current: function () { return M.active; },
    nextMission: function () {
      var idx = state().missionIndex;
      return idx < LIST.length ? LIST[idx] : null;
    },
    start: function (idx) {
      var m = LIST[idx];
      if (!m) return false;
      M.active = m; M.stepIdx = 0;
      SH.game.banner(m.name, m.giver + ' — ' + m.intro);
      SH.audio.missionOk();
      beginStep();
      return true;
    },
    abort: function () { failMission('Mission abandoned.'); },
    onHostileDown: function () {
      var s = currentStep();
      if (!s || s.type !== 'clear') return;
      M.kills++;
      if (M.kills >= s.count) {
        clearHostiles(SH.game.scene);
        advanceStep();
      }
    },
    update: function (dt) {
      var s = currentStep();
      if (!s) return;
      var pl = SH.player.pos();
      M.stepT += dt;
      // step timers
      if (s.time && M.stepT > s.time) { failMission('Out of time.'); return; }
      // hostile shooting
      for (var i = 0; i < M.hostiles.length; i++) {
        var h = M.hostiles[i];
        var dx = pl.x - h.group.position.x, dz = pl.z - h.group.position.z;
        var d = Math.hypot(dx, dz);
        h.group.rotation.y = Math.atan2(dx, dz);
        h.shootT -= dt;
        if (d < 32 && h.shootT <= 0) {
          h.shootT = 1.1 + Math.random() * 0.6;
          SH.audio.shot();
          if (Math.random() < SH.clamp(0.6 - d * 0.012, 0.2, 0.6)) SH.player.damage(5);
        }
      }
      if (s.type === 'goto') {
        var tp = posOf(s);
        var gd = SH.dist(pl.x, pl.z, tp.x, tp.z);
        SH.game.setObjective(s.label, Math.round(gd) + 'm');
        if (gd < (s.radius || 6)) advanceStep();
      } else if (s.type === 'enter') {
        var ep = posOf(s);
        var ed = SH.dist(pl.x, pl.z, ep.x, ep.z);
        SH.game.setObjective(s.label, Math.round(ed) + 'm');
        if (SH.player.data.inCar === M.missionCar) advanceStep();
      } else if (s.type === 'survive') {
        var left = Math.ceil(s.seconds - M.stepT);
        SH.game.setObjective(s.label, left + 's left');
        if (M.stepT >= s.seconds) {
          SH.game.setWanted(0);
          advanceStep();
        }
      } else if (s.type === 'clear') {
        SH.game.setObjective(s.label, M.kills + ' / ' + s.count + ' down');
      }
    },
    // The mission's target car, for the interact prompt (null when none).
    missionCar: function () { return M.missionCar; },
    // Spawn the mission's target car when its step begins.
    ensureMissionCar: function () {
      var s = currentStep();
      if (!s || s.type !== 'enter' || M.missionCar) return;
      var tp = posOf(s);
      var car = SH.vehicles.makeCar(s.model, s.model === 'sports' ? 0xd8a23a : 0x8e44ad);
      car.position.set(tp.x, 0, tp.z);
      car.rotation.y = Math.random() * Math.PI * 2;
      car.userData.heading = car.rotation.y;
      SH.game.scene.add(car);
      M.missionCar = car;
    },
    failIfPlayerDown: function () {
      if (M.active) failMission('Wasted — the job is blown.');
    },

    // ---- Shops & garage ----
    openGunShop: function () {
      var rows = SH.el('shop-rows');
      rows.innerHTML = '';
      var st = state();
      var items = [];
      SH.player.WEAPONS.slice(1).forEach(function (w) {
        var owned = SH.player.weaponState(w.key);
        items.push({
          name: w.name + (owned && owned.owned ? ' — owned' : ''),
          sub: 'Damage ' + w.damage + ' · Range ' + w.range + 'm · Mag ' + w.mag,
          price: w.price, owned: !!(owned && owned.owned),
          buy: function () {
            if (st.money < w.price) return;
            st.money -= w.price;
            SH.player.giveWeapon(w.key, w.mag);
            SH.audio.cash();
            SH.missions.openGunShop();
          }
        });
        if (owned && owned.owned) {
          items.push({
            name: w.name + ' ammo ×' + w.mag, sub: 'One full magazine',
            price: 100,
            buy: function () {
              if (st.money < 100) return;
              st.money -= 100;
              SH.player.buyAmmo(w.key, w.mag);
              SH.audio.cash();
              SH.missions.openGunShop();
            }
          });
        }
      });
      items.push({
        name: 'Body Armor', sub: '+50 armor', price: 500,
        buy: function () { if (st.money >= 500) { st.money -= 500; SH.player.addArmor(50); SH.audio.cash(); SH.missions.openGunShop(); } }
      });
      items.push({
        name: 'Medkit', sub: '+50 health', price: 100,
        buy: function () { if (st.money >= 100) { st.money -= 100; SH.player.heal(50); SH.audio.cash(); SH.missions.openGunShop(); } }
      });
      items.forEach(function (it) {
        var row = document.createElement('div');
        row.className = 'shop-row';
        row.innerHTML = '<div class="name">' + it.name + '<small>' + it.sub + '</small></div>' +
          '<div class="price">$' + it.price + '</div>';
        var b = document.createElement('button');
        b.className = 'btn';
        b.textContent = it.owned ? 'OWNED' : 'BUY';
        b.disabled = !!it.owned || st.money < it.price;
        b.onclick = it.buy;
        row.appendChild(b);
        rows.appendChild(row);
      });
      SH.setText('shop-money', SH.fmtMoney(st.money));
      SH.show('shop-modal', true);
      SH.game.modalOpen = true;
    },

    openGarage: function () {
      var rows = SH.el('garage-rows');
      rows.innerHTML = '';
      var st = state();
      Object.keys(SH.vehicles.MODELS).forEach(function (key) {
        if (key === 'police') return;
        var def = SH.vehicles.MODELS[key];
        var owned = st.ownedCars.indexOf(key) >= 0;
        var isCurrent = st.garageCar === key;
        var row = document.createElement('div');
        row.className = 'shop-row';
        row.innerHTML = '<div class="name">' + def.name + (isCurrent ? ' — in garage' : '') +
          '<small>Top speed ' + def.top + ' m/s · 0–60 in ' + (def.accel * 2.4).toFixed(1) + 's</small></div>' +
          '<div class="price">' + (owned ? 'OWNED' : '$' + def.price) + '</div>';
        var b = document.createElement('button');
        b.className = 'btn';
        if (!owned) {
          b.textContent = 'BUY';
          b.disabled = st.money < def.price;
          b.onclick = function () {
            st.money -= def.price;
            st.ownedCars.push(key);
            SH.audio.cash();
            SH.missions.openGarage();
          };
        } else if (!isCurrent) {
          b.textContent = 'TAKE';
          b.onclick = function () {
            st.garageCar = key;
            SH.game.spawnGarageCar();
            SH.missions.closeModals();
          };
        } else {
          b.textContent = 'READY';
          b.disabled = true;
        }
        row.appendChild(b);
        rows.appendChild(row);
      });
      var up = document.createElement('div');
      up.className = 'shop-row';
      up.innerHTML = '<div class="name">Engine tune — ' + SH.vehicles.MODELS[st.garageCar].name +
        '<small>+18% top speed</small></div><div class="price">$1,500</div>';
      var ub = document.createElement('button');
      ub.className = 'btn';
      var hasTune = !!st.upgrades[st.garageCar];
      ub.textContent = hasTune ? 'TUNED' : 'BUY';
      ub.disabled = hasTune || st.money < 1500;
      ub.onclick = function () {
        st.money -= 1500;
        st.upgrades[st.garageCar] = true;
        SH.audio.cash();
        SH.missions.openGarage();
      };
      up.appendChild(ub);
      rows.appendChild(up);
      SH.setText('garage-money', SH.fmtMoney(st.money));
      SH.show('garage-modal', true);
      SH.game.modalOpen = true;
    },

    closeModals: function () {
      SH.show('shop-modal', false);
      SH.show('garage-modal', false);
      SH.game.modalOpen = false;
    },

    sleepAtSafehouse: function () {
      var st = state();
      SH.player.heal(100);
      SH.player.addArmor(0);
      SH.game.setWanted(0);
      SH.game.save();
      SH.game.banner('SAVED', 'Progress saved. You feel rested — health restored, heat gone.');
      SH.audio.missionOk();
    }
  };
})();
