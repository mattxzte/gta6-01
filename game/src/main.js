// main.js — SOLMAR HEAT II bootstrap and game loop.
// Wires every system together: input, camera, driving, crime, missions,
// shops, saves and the four staged screenshot scenes.
import * as THREE from 'three';
import { Rng, clamp, lerp, damp, lerpAngle, dist2, loadSave } from './utils.js';
import { AudioEngine } from './audio.js';
import { Particles, FlashLights, Sky, Shake } from './effects.js';
import { buildCity } from './city.js';
import { DriveCar, TrafficManager, spawnParkedCars, CAR_TYPES } from './vehicles.js';
import { Player, Pedestrians } from './people.js';
import { Wanted, Police } from './police.js';
import { Combat, WEAPONS } from './combat.js';
import { MissionManager, MISSIONS } from './missions.js';
import { Economy } from './economy.js';
import { Hud } from './hud.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SHOW_FPS = params.get('fps') === '1';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2200);

const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0004;
scene.add(sun); scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.8);
scene.add(hemi);

const city = buildCity(scene);
const audio = new AudioEngine();
const fx = new Particles(scene);
const flash = new FlashLights(scene);
const sky = new Sky(scene, sun, hemi);
sky.registerStreetLights(city.streetLights);
const shake = new Shake();

const S = {
  mode: 'menu', time: 9.2, now: 0, night: false,
  money: 500, health: 100, armor: 0,
  weapon: 'pistol',
  owned: { pistol: true, smg: false, shotgun: false },
  ammo: { pistol: 48, smg: 0, shotgun: 0 },
  missionsDone: [], garage: [], upgrades: {},
  stats: { carsStolen: 0, fares: 0, kills: 0, busted: 0, wasted: 0 },
  radioStation: 0, missionEnd: null,
  player: null, car: null, wanted: new Wanted(),
};

const ctx = {
  scene, city, audio, fx, flash, S,
  hud: null, missions: null, economy: null, police: null, combat: null,
  missionCars: [],
  spawnMissionCar(type, x, z) {
    const t = CAR_TYPES[type];
    const car = new DriveCar(scene, type, t.colors[0], x, z, 0);
    car.parked = true; car.missionCar = true;
    parked.push(car);
    ctx.missionCars.push(car);
    return car;
  },
  spawnGarageCar(taken) {
    const g = city.shops.garage;
    const car = new DriveCar(scene, taken.type, taken.color, g.x + 8, g.z + 4, Math.PI / 2);
    car.parked = true;
    car.health = taken.health || 100;
    parked.push(car);
    return car;
  },
};

const player = new Player(scene, city.spots.start.x, city.spots.start.z);
S.player = player;
const traffic = new TrafficManager(scene, city);
const peds = new Pedestrians(scene, city);
const police = new Police(scene, city);
const combat = new Combat(scene, { flash, burst: (x, y, z, k) => fx.burst(x, y, z, k) }, audio);
const missions = new MissionManager(ctx);
const economy = new Economy(ctx);
const hud = new Hud(ctx);
ctx.hud = hud; ctx.missions = missions; ctx.economy = economy; ctx.police = police; ctx.combat = combat;

traffic.spawn(14, player);
peds.spawn(26, player);
let parked = spawnParkedCars(scene, city, 10);

// ---- input ----
const keys = {};
let camYaw = Math.PI, camPitch = 0.32, camDist = 9;
let dragging = false, lastMX = 0, lastMY = 0, aiming = false;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  audio.ensure();
  if (e.code === 'KeyM' && S.mode === 'playing' && !missions.active) {
    const next = missions.nextMission(S);
    if (next) missions.start(S, next);
    else hud.toast('KING OF SOLMAR', 'Every job is done. The city is yours.');
  }
  if (e.code === 'KeyN' && S.mode === 'playing') hud.toast('RADIO', audio.nextStation());
  if (e.code === 'KeyQ' && S.mode === 'playing') cycleWeapon();
  if (e.code === 'Digit1') setWeapon('pistol');
  if (e.code === 'Digit2' && S.owned.smg) setWeapon('smg');
  if (e.code === 'Digit3' && S.owned.shotgun) setWeapon('shotgun');
  if (e.code === 'KeyH' && S.car) audio.horn();
  if (e.code === 'KeyC') camDist = camDist > 9 ? 7 : 12;
  if ((e.code === 'Escape' || e.code === 'KeyP')) togglePause();
  if (e.code === 'KeyE') onInteract();
  if (e.code === 'KeyF' && S.mode === 'playing' && !S.car) doPunch();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
renderer.domElement.addEventListener('mousedown', (e) => {
  audio.ensure();
  if (e.button === 0) {
    dragging = true; lastMX = e.clientX; lastMY = e.clientY;
    if (S.mode === 'playing') tryShoot();
  }
  if (e.button === 2) aiming = true;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) dragging = false;
  if (e.button === 2) aiming = false;
});
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
  if (S.car) yawOffset = clamp(yawOffset - dx * 0.005, -1.4, 1.4);
  else camYaw -= dx * 0.005;
  camPitch = clamp(camPitch + dy * 0.004, -0.1, 1.1);
  lastMX = e.clientX; lastMY = e.clientY;
});
renderer.domElement.addEventListener('wheel', (e) => {
  camDist = clamp(camDist + Math.sign(e.deltaY) * 1.5, 5, 16);
  e.preventDefault();
}, { passive: false });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function setWeapon(w) {
  if (!S.owned[w] && w !== 'fists') return;
  S.weapon = w;
  audio.click();
}

function cycleWeapon() {
  const order = ['fists', 'pistol', 'smg', 'shotgun'].filter((w) => w === 'fists' || S.owned[w]);
  const i = order.indexOf(S.weapon);
  setWeapon(order[(i + 1) % order.length]);
}

function tryShoot() {
  if (S.mode !== 'playing' || S.car) return;
  const origin = new THREE.Vector3(player.x, 1.55, player.y + 0);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const targets = combat.collectTargets(allCars(), peds);
  const hit = combat.shoot(S, origin, dir, targets);
  if (hit) {
    if (hit.object.userData && hit.object.userData.ped) {
      S.wanted.addHeat(20, S.now);
      S.stats.kills++;
      peds.scare(player.x, player.z, 40);
    }
    if (hit.object.userData && hit.object.userData.enemy) S.stats.kills++;
  }
  if (hit || S.weapon !== 'fists') {
    S.wanted.addHeat(4, S.now);
    peds.scare(player.x, player.z, 45);
  }
}

function doPunch() {
  const origin = new THREE.Vector3(player.x, 1.5, player.y + 0);
  const dir = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  const targets = combat.collectTargets(allCars(), peds);
  combat.punch(S, origin, dir, targets);
}

function allCars() {
  return [...traffic.cars, ...parked, ...police.cruisers, ...police.blocks];
}

function nearestEnterableCar() {
  let best = null, bd = 4.5;
  for (const c of [...parked, ...traffic.cars]) {
    if (c.blockCar) continue;
    const d = dist2(player.x, player.z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function enterCar(car) {
  const wasTraffic = traffic.cars.includes(car);
  if (wasTraffic) traffic.cars.splice(traffic.cars.indexOf(car), 1);
  const pi = parked.indexOf(car);
  if (pi >= 0) parked.splice(pi, 1);
  S.car = car;
  car.parked = false;
  player.mesh.visible = false;
  audio.startEngine();
  if (!car.missionCar) {
    S.wanted.addHeat(25, S.now);
    S.stats.carsStolen++;
    hud.toast('CAR STOLEN', car.type.name + ' — the law noticed.');
  }
}

function exitCar() {
  const car = S.car;
  if (!car) return;
  S.car = null;
  car.parked = true;
  car.speed = 0;
  parked.push(car);
  const side = Math.PI / 2;
  player.teleport(car.x + Math.sin(car.heading + side) * 2.4, car.z + Math.cos(car.heading + side) * 2.4, car.heading);
  player.mesh.visible = true;
  audio.stopEngine();
  audio.setEngine(0, false);
}

function onInteract() {
  if (S.mode !== 'playing') return;
  if (S.car) { exitCar(); return; }
  const car = nearestEnterableCar();
  if (car) { enterCar(car); return; }
  const shop = nearestShop();
  if (shop) openShop(shop);
}

function nearestShop() {
  let best = null, bd = 7;
  for (const s of Object.values(city.shops)) {
    const d = dist2(player.x, player.z, s.x, s.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function openShop(shop) {
  S.mode = 'shop';
  const items = economy.shopList(shop.kind, S);
  hud.showMenu(shop.name, shop.kind === 'safehouse' ? 'Your place in Solmar Bay. Save, heal, sleep.' : 'Cash: ' + S.money,
    [...items.map((it) => it.name + (it.price ? ' — $' + it.price : '')), 'Leave'],
    (idx) => {
      if (idx >= items.length) { hud.hideMenu(); S.mode = 'playing'; return; }
      const it = items[idx];
      if (economy.buy(S, it)) {
        hud.hideMenu();
        S.mode = 'playing';
        if (shop.kind === 'safehouse') economy.save(S);
      }
    });
}

function togglePause() {
  if (S.mode === 'playing') {
    S.mode = 'paused';
    hud.showMenu('PAUSED', 'Dante Cruz — Solmar Bay',
      ['Resume', 'Save game', 'How to play', 'Quit to title'],
      (idx) => {
        if (idx === 0) { hud.hideMenu(); S.mode = 'playing'; }
        if (idx === 1) { economy.save(S); hud.toast('SAVED', 'Progress saved.'); }
        if (idx === 2) hud.showHelp(true);
        if (idx === 3) { hud.hideMenu(); hud.showHelp(false); showTitle(); }
      });
  } else if (S.mode === 'paused') {
    hud.hideMenu(); hud.showHelp(false); S.mode = 'playing';
  }
}

function damagePlayer(amount, from) {
  if (S.mode !== 'playing') return;
  let rest = amount;
  if (S.armor > 0) {
    const absorbed = Math.min(S.armor, rest * 0.6);
    S.armor -= absorbed;
    rest -= absorbed;
  }
  S.health -= rest;
  hud.damage();
  if (S.health <= 0) {
    S.health = 0;
    wasted();
  }
}

function wasted() {
  S.stats.wasted++;
  const lost = Math.floor(S.money * 0.15);
  S.money -= lost;
  S.wanted.clear();
  police.clearAll();
  missions.abort(S);
  if (S.car) { S.car = null; }
  player.mesh.visible = true;
  player.teleport(city.spots.start.x, city.spots.start.z);
  player.health = 100;
  S.health = 100;
  S.mode = 'wasted';
  audio.stopEngine(); audio.stopSiren();
  hud.center('WASTED', 'Dante wakes up at the clinic, $' + lost + ' lighter.', 'Click to continue');
  economy.save(S);
}

function busted() {
  S.stats.busted++;
  const lost = Math.floor(S.money * 0.2);
  S.money -= lost;
  S.wanted.clear();
  police.clearAll();
  missions.abort(S);
  if (S.car) { exitCar(); }
  player.teleport(city.shops.safehouse.x, city.shops.safehouse.z);
  S.health = 100;
  S.mode = 'busted';
  audio.stopEngine(); audio.stopSiren();
  hud.center('BUSTED', 'The cops let you go — minus $' + lost + ' in fines.', 'Click to continue');
  economy.save(S);
}

function showTitle() {
  S.mode = 'menu';
  hud.showHud(false);
  hud.showMenu('SOLMAR HEAT II',
    'Dante Cruz is back in Solmar Bay. Eight jobs stand between him and the top of the city. Drive, fight, and do not get caught.',
    economy.hasSave() ? ['Continue', 'New game', 'How to play'] : ['New game', 'How to play'],
    (idx) => {
      const items = economy.hasSave() ? ['continue', 'new', 'help'] : ['new', 'help'];
      const pick = items[idx];
      if (pick === 'help') { hud.showHelp(true); return; }
      hud.hideMenu(); hud.showHelp(false);
      if (pick === 'continue') {
        economy.load(S);
        hud.toast('WELCOME BACK', 'Missions done: ' + S.missionsDone.length + '/8 — cash ' + S.money);
      } else {
        economy.wipe();
        Object.assign(S, economy.newGameState());
        S.wanted = new Wanted();
        S.player = player;
        player.teleport(city.spots.start.x, city.spots.start.z);
        hud.toast('NEW GAME', 'Mara is waiting at the garage. Press M to start the first job.');
      }
      S.mode = 'playing';
      hud.showHud(true);
      audio.ensure();
    });
}

// ---- camera ----
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const shakeVec = new THREE.Vector3();

function updateCamera(dt) {
  const target = S.car ? S.car.mesh.position : player.mesh.position;
  camTarget.set(target.x, target.y + 1.7, target.z);
  const yaw = S.car ? S.car.heading + camYawOffset() : camYaw;
  const pitch = camPitch;
  const dist = S.car ? camDist + 2.5 : camDist;
  const cx = camTarget.x - Math.sin(yaw) * Math.cos(pitch) * dist;
  const cz = camTarget.z - Math.cos(yaw) * Math.cos(pitch) * dist;
  const cy = camTarget.y + Math.sin(pitch) * dist + 1.2;
  camPos.set(cx, Math.max(cy, 1.1), cz);
  camera.position.lerp(camPos, 1 - Math.exp(-8 * dt));
  camera.lookAt(camTarget);
  shake.offset(shakeVec);
  camera.position.add(shakeVec);
  const targetFov = aiming ? 50 : (S.car ? 62 + clamp(Math.abs(S.car.speed) / 46, 0, 1) * 9 : 62);
  camera.fov = damp(camera.fov, targetFov, 5, dt);
  camera.updateProjectionMatrix();
}

let yawOffset = 0;
function camYawOffset() {
  // While driving, the camera rests behind the car unless the player drags.
  return yawOffset;
}

// ---- crime detection: car vs pedestrian ----
function checkCarPedCrime(dt) {
  if (!S.car) return;
  const car = S.car;
  if (Math.abs(car.speed) < 6) return;
  const hit = peds.knockDown(car.x, car.z, 2.4);
  if (hit > 0) {
    S.wanted.addHeat(35 * hit, S.now);
    S.stats.kills += hit;
    hud.toast('PEDESTRIAN DOWN', 'The city saw that. Wanted level up.');
    peds.scare(car.x, car.z, 50);
    audio.crash();
    shake.add(0.5);
  }
}

// ---- main loop ----
const clock = new THREE.Clock();
let fpsFrames = 0, fpsTime = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (S.mode === 'playing' || S.mode === 'shop') {
    const playDt = S.mode === 'playing' ? dt : 0;
    S.now += playDt;
    S.time += playDt * 0.05;
    if (S.time >= 24) S.time -= 24;
    const input = {
      f: keys.KeyW || keys.ArrowUp, b: keys.KeyS || keys.ArrowDown,
      l: keys.KeyA || keys.ArrowLeft, r: keys.KeyD || keys.ArrowRight,
      run: keys.ShiftLeft || keys.ShiftRight, jump: keys.Space,
    };
    if (S.mode === 'playing') {
      if (S.car) {
        const hit = S.car.update(playDt, {
          fwd: input.f, back: input.b, left: input.l, right: input.r, brake: input.jump,
        }, city.colliders, allCars());
        // Keep the player's logical position on the car: missions, police
        // and the minimap all read S.player.x/z.
        player.x = S.car.x; player.z = S.car.z; player.heading = S.car.heading;
        if (hit && Math.abs(S.car.speed) > 18) {
          S.car.damage(8);
          audio.crash();
          shake.add(0.4);
        }
        if (S.car.health <= 0) {
          const cx = S.car.x, cz = S.car.z;
          fx.burst(cx, 1.5, cz, 'fire');
          flash.flash(cx, 2, cz, 0xff8844, 40, 40, 0.4);
          audio.explosion();
          shake.add(1.2);
          const wasMission = S.car.missionCar;
          S.car.dispose(scene);
          const idx = parked.indexOf(S.car);
          if (idx >= 0) parked.splice(idx, 1);
          S.car = null;
          player.mesh.visible = true;
          player.teleport(cx + 4, cz + 4);
          damagePlayer(35);
          if (wasMission) missions.fail(S, 'The car was destroyed.');
          audio.stopEngine();
        }
        audio.setEngine(clamp(Math.abs(S.car ? S.car.speed : 0) / 46, 0, 1), true);
        checkCarPedCrime(playDt);
      } else {
        player.update(playDt, input, camYaw, city.colliders, allCars());
        audio.setEngine(0, false);
      }
      traffic.update(playDt, city.colliders, S.car, peds);
      peds.update(playDt, S.car && Math.abs(S.car.speed) > 10 ? { x: S.car.x, z: S.car.z, r: 12 } : null);
      S.wanted.update(playDt, S.now, police.policeNear(S, S.car));
      police.update(playDt, S, S.car, city.colliders);
      if (S.wanted.stars >= 2) audio.startSiren(); else audio.stopSiren();
      if (police.bustedCheck(S, S.car)) busted();
      combat.update(playDt);
      combat.updateEnemies(playDt, S, { x: player.x, z: player.z }, fx, audio, (dmg) => damagePlayer(dmg));
      missions.update(playDt, S);
      city.update(playDt);
      fx.update(playDt);
      flash.update(playDt);
      S.night = sky.update(S.time, player.mesh.position);
      shake.update(playDt);
      // Shop prompt.
      const shop = !S.car ? nearestShop() : null;
      hud.interact(shop ? 'E — ' + shop.name : (!S.car && nearestEnterableCar() ? 'E — Get in the car' : null));
      hud.update(playDt, S);
      hud.drawMinimap(S, city);
    }
    if (!dragging) yawOffset = damp(yawOffset, 0, 0.6, dt);
    updateCamera(dt);
  } else if (S.mode === 'menu') {
    // Slow cinematic orbit over the city behind the title screen.
    S.time += dt * 0.01;
    const t = performance.now() / 1000;
    camera.position.set(Math.sin(t * 0.05) * 260, 130, Math.cos(t * 0.05) * 260);
    camera.lookAt(0, 20, -40);
    sky.update(S.time, camera.position);
    city.update(dt);
    fx.update(dt);
  }
  if (S.mode === 'busted' || S.mode === 'wasted') {
    // Wait for a click to dismiss the center card.
  }
  renderer.render(scene, camera);
  if (SHOW_FPS) {
    fpsFrames++; fpsTime += dt;
    if (fpsTime >= 1) {
      hud.el.fps.textContent = Math.round(fpsFrames / fpsTime) + ' fps';
      hud.el.fps.style.display = 'block';
      fpsFrames = 0; fpsTime = 0;
    }
  }
}

// Dismiss center cards (busted / wasted / mission end) on click.
renderer.domElement.addEventListener('click', () => {
  if (S.mode === 'busted' || S.mode === 'wasted') {
    hud.hideCenter();
    S.mode = 'playing';
  }
  if (S.missionEnd) {
    hud.hideCenter();
    S.missionEnd = null;
  }
});

// Mission end card watcher.
setInterval(() => {
  if (S.missionEnd && S.mode === 'playing') {
    const m = S.missionEnd;
    if (m.win) hud.center('MISSION COMPLETE', m.title + ' — $' + m.reward, 'Click to continue');
    else hud.center('MISSION FAILED', m.title + ' — ' + m.reason, 'Click to retry from the Jobs menu (M)');
  }
}, 400);

// ---- staged screenshot scenes (?shot=...) ----
// Find an open staging point near (x,z) whose camera (camDist to the north)
// is also clear, so a screenshot is never taken from inside a container.
function openSpotNear(x, z, spread, camDist) {
  const clear = (cx, cz) => !city.colliders.some((b) => cx > b.minX - 1.5 && cx < b.maxX + 1.5 && cz > b.minZ - 1.5 && cz < b.maxZ + 1.5);
  for (let i = 0; i < 24; i++) {
    const px = x + (Math.random() * 2 - 1) * spread;
    const pz = z + (Math.random() * 2 - 1) * spread;
    if (clear(px, pz) && clear(px, pz - camDist * 0.9) && clear(px, pz - camDist * 0.45)) return { x: px, z: pz };
  }
  return { x, z };
}

function applyShot(name) {
  hud.hideMenu(); hud.showHelp(false); hud.showHud(true);
  S.mode = 'playing';
  audio.ensure();
  if (name === 'cover') {
    S.time = 16.0;
    const car = ctx.spawnMissionCar('comet', 0, 200);
    player.teleport(0, 200);
    enterCar(car);
    S.car.heading = Math.PI;
    S.car.mesh.rotation.y = Math.PI;
    S.car.speed = 25;
    camYaw = Math.PI; camPitch = 0.22; camDist = 9;
    missions.start(S, MISSIONS[5]);
    S.wanted.heat = 95; S.wanted.recalc(); S.wanted.lastCrime = S.now;
    // A roadblock ahead on the avenue, so the chase reads in one frame.
    police.spawnBlock(0, 200, Math.PI);
    hud.toast('MISSION: The Getaway', 'Lose the helicopter. Reach the Safehouse.');
  } else if (name === 'street') {
    S.time = 10.0;
    player.teleport(-540, 120, Math.PI / 2);
    camYaw = Math.PI * 0.75; camPitch = 0.3; camDist = 8;
    for (let i = 0; i < 6; i++) peds.addPed(player, { x: -530 + i * 6, z: 100 + i * 12 });
    hud.toast('SOLMAR BAY', 'The boardwalk, the beach, the city behind you.');
  } else if (name === 'mission') {
    S.time = 15.0;
    S.owned.smg = true; S.ammo.smg = 120; S.weapon = 'smg';
    missions.start(S, MISSIONS[4]);
    missions.active.stepIdx = 1;
    missions.setupStep(S);
    const pp = openSpotNear(-380, 300, 12, 11);
    player.teleport(pp.x, pp.z, 0);
    camYaw = 0; camPitch = 0.5; camDist = 11;
    hud.toast('MISSION: Loud and Clear', 'Clear the warehouse crew (0/5).');
  } else if (name === 'city') {
    S.time = 10.5;
    const car = ctx.spawnMissionCar('regal', 0, 120);
    player.teleport(0, 120);
    enterCar(car);
    S.car.heading = Math.PI;
    S.car.mesh.rotation.y = Math.PI;
    S.car.speed = 15;
    camYaw = Math.PI; camPitch = 0.18; camDist = 12;
    hud.toast('SOLMAR BAY', 'Downtown, the marina, the tower — one city, every job.');
  }
  updateCamera(0.1);
}

// ---- boot ----
if (SHOT) {
  applyShot(SHOT);
} else {
  showTitle();
}
window.__SOLMAR = { S, city, parked, traffic, economy, missions, police, combat, version: 2 };
animate();
