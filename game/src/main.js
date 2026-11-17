// Solmar Heat — entry point. Wires the city, the player, the cars, the
// traffic, the police, the missions, the combat, the HUD, the audio and
// the save together, runs the game loop, owns the camera and the menus,
// and exposes the playtest handle window.__game.
import * as THREE from 'three';
import { makeRng } from './rng.js';
import { SolmarCity } from './city.js';
import { Player } from './player.js';
import { VehicleFleet } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { SaveGame } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 1) || 1;
const shotMode = params.get('shot') || null;

const G = {
  state: 'menu',
  cash: 150,
  time: 0,
  camYaw: 0,
  camPitch: 0.32,
  camDist: 10,
  shotCamera: null,
  rng: makeRng(seed),
  playerPos() {
    if (this.player.inCar && this.vehicles.playerCar) {
      return { x: this.vehicles.playerCar.pos.x, z: this.vehicles.playerCar.pos.z };
    }
    return { x: this.player.x, z: this.player.z };
  },
};

// --- Renderer, scene, lights -------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d6);
scene.fog = new THREE.Fog(0x9fc3dd, 320, 950);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
G.scene = scene;
G.camera = camera;
G.renderer = renderer;

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d0, 1.7);
sun.position.set(180, 260, 120);
scene.add(sun);

// --- Systems ------------------------------------------------------------
G.city = new SolmarCity(scene, G.rng);
G.player = new Player(G);
G.vehicles = new VehicleFleet(G);
G.traffic = new Traffic(G);
G.police = new Police(G);
G.missions = new Missions(G);
G.combat = new Combat(G);
G.hud = new Hud(G);
G.audio = new AudioEngine();
G.save = new SaveGame(G);
G.vehicles.spawnParked(22);

// --- Input ---------------------------------------------------------------
const input = {
  forward: false, back: false, left: false, right: false,
  sprint: false, jump: false, handbrake: false,
};
const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'jump',
};
let dragging = false;
let dragMoved = 0;
let downAt = 0;
let downX = 0;
let downY = 0;

function enterOrExitCar() {
  if (G.state !== 'playing') return;
  if (G.player.inCar) {
    G.vehicles.exitCar();
    return;
  }
  const car = G.vehicles.nearestCar(G.player.x, G.player.z, 4.5);
  if (car) G.vehicles.enterCar(car);
  else G.hud.toast('No car close enough — walk up to one and press E.');
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  const mapped = KEYMAP[e.code];
  if (mapped) {
    if (e.code === 'Space') input.jump = true;
    else input[mapped] = true;
    return;
  }
  if (e.repeat) return;
  if (e.code === 'KeyE') enterOrExitCar();
  else if (e.code === 'KeyF') G.player.punch();
  else if (e.code === 'KeyR') G.combat.reload();
  else if (e.code === 'KeyM') {
    if (!G.missions.active) G.missions.retry();
  } else if (e.code === 'KeyN') {
    const muted = G.audio.toggleMute();
    G.hud.toast(muted ? 'Sound off' : 'Sound on');
  } else if (e.code === 'Escape' || e.code === 'KeyP') {
    togglePause();
  }
});
window.addEventListener('keyup', (e) => {
  const mapped = KEYMAP[e.code];
  if (mapped && e.code !== 'Space') input[mapped] = false;
});

renderer.domElement.addEventListener('mousedown', (e) => {
  dragging = true;
  dragMoved = 0;
  downAt = performance.now();
  downX = e.clientX;
  downY = e.clientY;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.movementX || 0;
  const dy = e.movementY || 0;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  G.camYaw -= dx * 0.005;
  G.camPitch = Math.max(0.08, Math.min(1.15, G.camPitch + dy * 0.004));
});
window.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  dragging = false;
  const quick = performance.now() - downAt < 350;
  const still = Math.hypot(e.clientX - downX, e.clientY - downY) < 6;
  if (quick && still && dragMoved < 8 && G.state === 'playing') G.combat.shoot();
});
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  G.camDist = Math.max(5, Math.min(24, G.camDist * (1 + e.deltaY * 0.001)));
}, { passive: false });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Menus ---------------------------------------------------------------
function startGame(fromSave) {
  G.audio.ensure();
  G.audio.startMusic();
  if (fromSave) {
    const data = G.save.load();
    if (data) G.save.apply(data);
  }
  G.state = 'playing';
  G.hud.hideMenu();
  document.getElementById('pauseScreen').classList.remove('show');
  if (!G.missions.active && G.missions.completed < G.missions.defs.length) {
    G.missions.startNext();
  }
  G.hud.toast('Welcome to Solmar. Mara is waiting — follow the gold beacon.');
}

function togglePause() {
  if (G.state === 'playing') {
    G.state = 'paused';
    document.getElementById('pauseScreen').classList.add('show');
  } else if (G.state === 'paused') {
    G.state = 'playing';
    document.getElementById('pauseScreen').classList.remove('show');
  }
}

document.getElementById('btnStart').addEventListener('click', () => startGame(false));
document.getElementById('btnContinue').addEventListener('click', () => startGame(true));
document.getElementById('btnResume').addEventListener('click', togglePause);
document.getElementById('btnSaveQuit').addEventListener('click', () => {
  G.save.save();
  G.state = 'menu';
  document.getElementById('pauseScreen').classList.remove('show');
  G.hud.showMenu();
  refreshMenuButtons();
});
document.getElementById('btnRespawn').addEventListener('click', () => G.combat.respawn());
document.getElementById('btnHow').addEventListener('click', () => {
  document.getElementById('howto').classList.toggle('show');
});

function refreshMenuButtons() {
  const hasSave = !!G.save.load();
  document.getElementById('btnContinue').style.display = hasSave ? 'inline-block' : 'none';
  document.getElementById('saveNote').textContent = hasSave
    ? 'A save was found — Continue picks up where Jax left off.'
    : 'No save yet — Start begins Jax’s first day in Solmar.';
}
refreshMenuButtons();
G.hud.showMenu();

// --- Camera ---------------------------------------------------------------
function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updateCamera(dt) {
  if (G.shotCamera) {
    camera.position.copy(G.shotCamera.pos);
    camera.lookAt(G.shotCamera.lookAt);
    return;
  }
  if (G.state === 'menu') {
    const t = G.time * 0.08;
    camera.position.set(Math.sin(t) * 70, 38, Math.cos(t) * 70);
    camera.lookAt(0, 30, -8);
    return;
  }
  const inCar = G.player.inCar && G.vehicles.playerCar;
  const target = inCar
    ? new THREE.Vector3(G.vehicles.playerCar.pos.x, 2.4, G.vehicles.playerCar.pos.z)
    : new THREE.Vector3(G.player.x, G.player.y + 2.1, G.player.z);
  if (inCar) {
    const car = G.vehicles.playerCar;
    if (Math.abs(car.speed) > 3) {
      G.camYaw = angleLerp(G.camYaw, car.heading + Math.PI, Math.min(1, dt * 2.2));
    }
    G.camDist = Math.max(G.camDist, 12);
  }
  const dist = G.camDist;
  // The chase camera sits a little higher so the car reads in the frame.
  const pitch = inCar ? Math.max(G.camPitch, 0.42) : G.camPitch;
  const cp = Math.cos(pitch);
  let cx = target.x + Math.sin(G.camYaw) * dist * cp;
  let cz = target.z + Math.cos(G.camYaw) * dist * cp;
  let cy = target.y + Math.sin(pitch) * dist;
  // Keep the camera out of the buildings.
  const hit = G.city.collideCircle(cx, cz, 0.6);
  if (hit.hit) { cx = hit.x; cz = hit.z; }
  cy = Math.max(cy, 1.4);
  camera.position.set(cx, cy, cz);
  camera.lookAt(target.x, target.y + 0.4, target.z);
}

// --- Main loop ------------------------------------------------------------
const clock = new THREE.Clock();
let frames = 0;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.1);
  G.time += dt;
  frames++;
  if (G.state === 'playing') {
    G.player.update(dt, input, G.camYaw);
    G.vehicles.update(dt, input);
    G.traffic.update(dt);
    G.police.update(dt);
    G.missions.update(dt);
    G.combat.update(dt);
    G.audio.engineUpdate(G.player.inCar && G.vehicles.playerCar ? G.vehicles.playerCar.speed : 0);
    // Autosave every 30 seconds of play.
    if (Math.floor(G.time) % 30 === 0 && frames % 60 === 0) G.save.save();
  }
  input.jump = false;
  updateCamera(dt);
  if (G.state !== 'dead') G.hud.update(dt);
  renderer.render(scene, camera);
}

// --- Playtest + screenshot handle -----------------------------------------
const gameHandle = {
  get state() { return G.state; },
  set state(v) { G.state = v; },
  get time() { return G.time; },
  get cash() { return G.cash; },
  set cash(v) { G.cash = v; },
  get player() { return G.player; },
  get vehicles() { return G.vehicles; },
  get traffic() { return G.traffic; },
  get police() { return G.police; },
  get missions() { return G.missions; },
  get combat() { return G.combat; },
  get save() { return G.save; },
  get hud() { return G.hud; },
  get city() { return G.city; },
  get audio() { return G.audio; },
};
window.__game = gameHandle;
window.__G = G;

loop();

if (shotMode) {
  stageShot(G, shotMode);
}
