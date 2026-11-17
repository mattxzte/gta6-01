// Cars of Solmar: the meshes, the arcade driving model, and getting in
// and out of them. The fleet owns every car — parked, traffic, police and
// the player's — so traffic and police can steer the same objects.
import * as THREE from 'three';
import { range, pick } from './rng.js';

const CAR_NAMES = [
  'Comet', 'Vagabond', 'Sunrunner', 'Palm GT', 'Coastline', 'Marlin',
  'Dune Buggy', 'Harbor', 'Coral', 'Jetstream', 'Tide', 'Solstice',
];
const CAR_COLORS = [
  0xc0392b, 0x2471a3, 0x1e8449, 0xd4ac0d, 0x7d3c98, 0xe67e22,
  0x2c3e50, 0xeaecee, 0x922b21, 0x117a65, 0x6c3483, 0xb9770e,
];

function buildCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fc4d4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.05, -0.2);
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    g.add(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const wx of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    lamp.position.set(wx, 0.62, 2.22);
    g.add(lamp);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const wx of [-0.7, 0.7]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
    tail.position.set(wx, 0.62, -2.22);
    g.add(tail);
  }
  if (isPolice) {
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), barMat);
    bar.position.set(0, 1.42, -0.2);
    bar.name = 'lightbar';
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.3, 1.42, -0.2);
    red.name = 'beaconRed';
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(0.3, 1.42, -0.2);
    blue.name = 'beaconBlue';
    g.add(blue);
  }
  return g;
}

export class VehicleFleet {
  constructor(G) {
    this.G = G;
    this.cars = [];
    this.playerCar = null;
    this.nextId = 1;
  }

  get player() { return this.G.player; }

  spawnCar(x, z, heading, opts = {}) {
    const color = opts.color ?? pick(this.G.rng, CAR_COLORS);
    const mesh = buildCarMesh(color, !!opts.police);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    this.G.scene.add(mesh);
    const car = {
      id: this.nextId++,
      mesh,
      pos: mesh.position,
      heading,
      speed: 0,
      steer: 0,
      color,
      name: opts.name ?? pick(this.G.rng, CAR_NAMES),
      driver: opts.driver ?? null, // null = parked, 'player', 'traffic', 'police', 'rival'
      health: opts.health ?? 100,
      wrecked: false,
      isPolice: !!opts.police,
      isRival: !!opts.rival,
      maxSpeed: opts.maxSpeed ?? 26,
      accel: opts.accel ?? 14,
      loop: opts.loop ?? null,
      loopIndex: 0,
      stuckTime: 0,
    };
    mesh.userData.car = car;
    this.cars.push(car);
    return car;
  }

  spawnParked(count) {
    const rng = this.G.rng;
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < count * 40) {
      const spot = this.G.city.randomParkedSpot(rng);
      if (this.nearestCar(spot.x, spot.z, 9)) continue;
      this.spawnCar(spot.x, spot.z, spot.heading, { driver: null });
      placed++;
    }
    return placed;
  }

  nearestCar(x, z, maxDist, parkedOnly = false) {
    let best = null;
    let bd = maxDist;
    for (const car of this.cars) {
      if (car.wrecked) continue;
      if (parkedOnly && car.driver !== null) continue;
      const d = Math.hypot(car.pos.x - x, car.pos.z - z);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  enterCar(car) {
    const G = this.G;
    const hadDriver = car.driver !== null && car.driver !== 'player';
    if (hadDriver) {
      // Yank the driver out onto the sidewalk.
      G.traffic.ejectDriver(car);
      G.police.addWanted(1, 'carjacking');
      G.hud.toast(`You jacked the ${car.name}!`);
    } else {
      G.hud.toast(`You took the ${car.name}`);
    }
    if (this.playerCar && this.playerCar !== car) this.playerCar.driver = null;
    car.driver = 'player';
    this.playerCar = car;
    G.player.inCar = true;
    G.player.car = car;
    G.player.mesh.visible = false;
    G.audio.engineStart();
    if (G.missions.onEnterCar) G.missions.onEnterCar(car);
    return true;
  }

  exitCar() {
    const G = this.G;
    const car = this.playerCar;
    if (!car) return false;
    const side = Math.cos(car.heading) > 0 ? 1 : -1;
    const px = car.pos.x + Math.cos(car.heading + Math.PI / 2) * 2.6 * side;
    const pz = car.pos.z - Math.sin(car.heading + Math.PI / 2) * 2.6 * side;
    G.player.setPosition(px, pz, car.heading);
    car.driver = null;
    car.speed *= 0.4;
    this.playerCar = null;
    G.player.inCar = false;
    G.player.car = null;
    G.player.mesh.visible = true;
    G.audio.engineStop();
    return true;
  }

  removeCar(car) {
    this.G.scene.remove(car.mesh);
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    if (this.playerCar === car) this.playerCar = null;
  }

  // Arcade driving for the player's car only; traffic and police steer
  // their own cars through the same collision step below.
  updatePlayerCar(dt, input) {
    const car = this.playerCar;
    if (!car || car.wrecked) return;
    const forward = input.forward ? 1 : 0;
    const back = input.back ? 1 : 0;
    if (forward) car.speed += car.accel * dt;
    else if (back) car.speed -= car.speed > 0.5 ? car.accel * 1.6 * dt : car.accel * 0.7 * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
    if (input.handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
    car.speed = Math.max(-9, Math.min(car.maxSpeed, car.speed));
    const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerAuthority = Math.min(1, Math.abs(car.speed) / 7);
    car.heading += steerInput * 1.9 * steerAuthority * Math.sign(car.speed || 1) * dt;
    car.steer = steerInput;
    this.moveCar(car, dt);
  }

  moveCar(car, dt) {
    const G = this.G;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let nx = car.pos.x + fx * car.speed * dt;
    let nz = car.pos.z + fz * car.speed * dt;
    const clamped = G.city.clampToWorld(nx, nz);
    nx = clamped.x;
    nz = clamped.z;
    const hit = G.city.collideCircle(nx, nz, 2.3);
    if (hit.hit && car.driver === 'player' && Math.abs(car.speed) > 8) {
      G.audio.crash();
      G.combat.sparkBurst(car.pos.x, 1, car.pos.z);
      car.speed *= 0.35;
    } else if (hit.hit) {
      car.speed *= 0.6;
    }
    car.pos.x = hit.x;
    car.pos.z = hit.z;
    car.mesh.rotation.y = car.heading;
    // Car-to-car bumps.
    for (const other of this.cars) {
      if (other === car || other.wrecked) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.4 && d > 0.01) {
        const push = (4.4 - d) / 2;
        const ux = dx / d;
        const uz = dz / d;
        car.pos.x -= ux * push;
        car.pos.z -= uz * push;
        other.pos.x += ux * push;
        other.pos.z += uz * push;
        if (car.driver === 'player' && Math.abs(car.speed) > 6) {
          G.audio.crash();
          car.speed *= 0.5;
          other.speed *= 0.5;
          if (other.driver === 'traffic') G.traffic.scareAt(car.pos.x, car.pos.z, 18);
        }
      }
    }
  }

  update(dt, input) {
    this.updatePlayerCar(dt, input);
    // Police light bars flash.
    const t = this.G.time * 8;
    for (const car of this.cars) {
      if (!car.isPolice) continue;
      const red = car.mesh.getObjectByName('beaconRed');
      const blue = car.mesh.getObjectByName('beaconBlue');
      if (red) red.visible = Math.sin(t) > 0;
      if (blue) blue.visible = Math.sin(t) <= 0;
    }
  }
}
