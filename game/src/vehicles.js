// vehicles.js — every car in Solmar Bay: the models, the arcade driving
// physics the player feels, the traffic that fills the roads, and the
// parked cars waiting to be stolen.
import * as THREE from 'three';
import { Rng, clamp, lerp, lerpAngle, circleVsBox, dist2 } from './utils.js';

export const CAR_TYPES = {
  comet: { name: 'Comet GT', top: 46, accel: 26, grip: 2.6, size: 2.0, w: 1.9, len: 4.4, colors: [0xd8202a, 0xf2a007, 0x20a8d8] },
  regal: { name: 'Regal Sedan', top: 34, accel: 17, grip: 2.2, size: 2.0, w: 1.9, len: 4.6, colors: [0x3a4a5a, 0x8a8f96, 0x5a3a6a, 0xc8c8c8] },
  taxi: { name: 'Solmar Taxi', top: 33, accel: 16, grip: 2.2, size: 2.0, w: 1.9, len: 4.6, colors: [0xf2c200] },
  van: { name: 'Vesper Van', top: 29, accel: 13, grip: 1.9, size: 2.2, w: 2.1, len: 5.0, colors: [0xd8d8d8, 0x4a6a8a, 0x8a4a3a] },
  truck: { name: 'Hauler Truck', top: 26, accel: 11, grip: 1.7, size: 2.6, w: 2.4, len: 6.4, colors: [0x7a7f85, 0x3a5a3a] },
  police: { name: 'Interceptor', top: 40, accel: 24, grip: 2.7, size: 2.0, w: 1.9, len: 4.6, colors: [0x1a1a22] },
  limo: { name: 'Mayor’s Limo', top: 36, accel: 15, grip: 2.0, size: 2.1, w: 2.0, len: 6.8, colors: [0x14141c] },
};

const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
const glassMat = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.15, metalness: 0.6 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.25, metalness: 0.8 });
const lightOffMat = new THREE.MeshStandardMaterial({ color: 0x555550, emissive: 0x000000 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x881111, emissive: 0x550000, emissiveIntensity: 0.6 });
const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0.4 });

export function makeCarMesh(typeKey, colorHex) {
  const t = CAR_TYPES[typeKey];
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.55 });
  const L = t.len, W = t.w;
  const lower = new THREE.Mesh(bodyGeo, bodyMat);
  lower.scale.set(W, 0.62, L);
  lower.position.y = 0.55;
  lower.castShadow = true;
  g.add(lower);
  const cabinH = typeKey === 'van' || typeKey === 'truck' ? 1.05 : 0.6;
  const cabin = new THREE.Mesh(bodyGeo, typeKey === 'van' || typeKey === 'truck' ? bodyMat : glassMat);
  cabin.scale.set(W * 0.86, cabinH, L * (typeKey === 'truck' ? 0.32 : 0.48));
  cabin.position.set(0, 0.86 + cabinH / 2 - 0.1, typeKey === 'truck' ? L * 0.28 : -L * 0.06);
  cabin.castShadow = true;
  g.add(cabin);
  if (typeKey === 'truck') {
    const bed = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x5a5f65, roughness: 0.8 }));
    bed.scale.set(W * 0.94, 0.7, L * 0.5);
    bed.position.set(0, 0.95, -L * 0.2);
    g.add(bed);
  }
  const wheels = [];
  const wy = 0.42;
  for (const [wx, wz] of [[-W / 2 + 0.15, L / 2 - 0.85], [W / 2 - 0.15, L / 2 - 0.85], [-W / 2 + 0.15, -L / 2 + 0.85], [W / 2 - 0.15, -L / 2 + 0.85]]) {
    const w = new THREE.Mesh(wheelGeo, tireMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, wy, wz);
    g.add(w);
    wheels.push(w);
  }
  const hl = new THREE.Mesh(bodyGeo, headMat);
  hl.scale.set(0.45, 0.18, 0.1); hl.position.set(-W / 2 + 0.35, 0.62, L / 2 + 0.01);
  g.add(hl);
  const hr = hl.clone(); hr.position.x = W / 2 - 0.35; g.add(hr);
  const tl = new THREE.Mesh(bodyGeo, tailMat);
  tl.scale.set(0.45, 0.16, 0.1); tl.position.set(-W / 2 + 0.35, 0.62, -L / 2 - 0.01);
  g.add(tl);
  const tr = tl.clone(); tr.position.x = W / 2 - 0.35; g.add(tr);
  if (typeKey === 'taxi') {
    const sign = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xf2c200, emissive: 0x8a6d00, emissiveIntensity: 0.7 }));
    sign.scale.set(0.7, 0.28, 0.4); sign.position.set(0, 1.62, -0.2);
    g.add(sign);
  }
  let lightBar = null;
  if (typeKey === 'police') {
    lightBar = new THREE.Group();
    const r = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0xff0000, emissiveIntensity: 2 }));
    r.scale.set(0.55, 0.22, 0.5); r.position.x = -0.35;
    const b = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x0000cc, emissive: 0x2244ff, emissiveIntensity: 2 }));
    b.scale.set(0.55, 0.22, 0.5); b.position.x = 0.35;
    lightBar.add(r); lightBar.add(b);
    lightBar.position.set(0, 1.55, -0.2);
    g.add(lightBar);
    const stripe = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xe8e8e8 }));
    stripe.scale.set(W + 0.02, 0.2, L * 0.5); stripe.position.set(0, 0.62, 0);
    g.add(stripe);
  }
  g.userData = { wheels, lightBar, typeKey };
  return g;
}

export class DriveCar {
  constructor(scene, typeKey, colorHex, x, z, heading) {
    this.typeKey = typeKey;
    this.type = CAR_TYPES[typeKey];
    this.mesh = makeCarMesh(typeKey, colorHex);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.colorHex = colorHex;
    this.smoking = false;
  }

  // Arcade step. input: {fwd, back, left, right, brake} in -1..1.
  update(dt, input, colliders, others) {
    const t = this.type;
    const fwd = input.fwd ? 1 : 0;
    const back = input.back ? 1 : 0;
    if (fwd) this.speed += t.accel * dt * (this.speed < 0 ? 2.2 : 1);
    if (back) this.speed -= (this.speed > 0.5 ? t.accel * 1.6 : t.accel * 0.7) * dt;
    if (!fwd && !back) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 9 * dt);
    if (input.brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 26 * dt);
    this.speed = clamp(this.speed, -t.top * 0.45, t.top);
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer = lerp(this.steer, steerTarget, 1 - Math.exp(-8 * dt));
    const spd = this.speed;
    const turnRate = this.steer * t.grip * clamp(Math.abs(spd) / 12, 0, 1) * (spd >= 0 ? 1 : -1);
    this.heading += turnRate * dt * (input.brake ? 1.35 : 1);
    const nx = this.x + Math.sin(this.heading) * spd * dt;
    const nz = this.z + Math.cos(this.heading) * spd * dt;
    // Building collision: slide along the wall, lose a little speed.
    let hit = false;
    const r = t.size;
    for (const c of colliders) {
      const res = circleVsBox(nx, nz, r, c);
      if (res) {
        hit = true;
        this.x = nx + res.nx * res.depth;
        this.z = nz + res.nz * res.depth;
        this.speed *= 0.55;
        break;
      }
    }
    if (!hit) { this.x = nx; this.z = nz; }
    // Other cars: soft push apart.
    if (others) {
      for (const o of others) {
        if (o === this) continue;
        const d = dist2(this.x, this.z, o.x, o.z);
        const min = (t.size + o.type.size) * 0.9;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2;
          const px = (this.x - o.x) / d, pz = (this.z - o.z) / d;
          this.x += px * push; this.z += pz * push;
          this.speed *= 0.9;
        }
      }
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const tilt = -this.steer * clamp(Math.abs(this.speed) / t.top, 0, 1) * 0.06;
    this.mesh.rotation.z = tilt;
    this.mesh.rotation.x = clamp(-(this.speed - (this.prevSpeed || 0)) * 0.02, -0.05, 0.05);
    this.prevSpeed = this.speed;
    for (const w of this.mesh.userData.wheels) w.rotation.x += this.speed * dt * 2.4;
    if (this.health < 45 && !this.smoking) this.smoking = true;
    return hit;
  }

  damage(amount) {
    this.health -= amount;
    return this.health <= 0;
  }

  dispose(scene) { scene.remove(this.mesh); }
}

// Traffic: cars that follow the road graph, obey lights and queue behind
// each other. They never leave the roads.
export class TrafficManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rng = new Rng(777);
    this.cars = [];
    this.typeKeys = ['regal', 'regal', 'taxi', 'van', 'sedan', 'regal'];
    const keys = Object.keys(CAR_TYPES).filter((k) => ['regal', 'taxi', 'van', 'truck'].includes(k));
    this.typeKeys = keys;
  }

  spawn(count, playerPos) {
    for (let i = 0; i < count; i++) this.addCar(playerPos);
  }

  addCar(playerPos) {
    const key = this.rng.pick(this.typeKeys);
    const t = CAR_TYPES[key];
    const color = this.rng.pick(t.colors);
    const node = this.rng.int(0, this.city.nodes.length - 1);
    const n = this.city.nodes[node];
    const nexts = this.city.neighbors(n);
    const to = this.rng.pick(nexts);
    const m = this.city.nodes[to];
    const heading = Math.atan2(m.x - n.x, m.z - n.z);
    const car = new DriveCar(this.scene, key, color, n.x + this.rng.range(-3, 3), n.z + this.rng.range(-3, 3), heading);
    car.traffic = { node, to, speed: this.rng.range(9, 15), wait: 0 };
    this.cars.push(car);
    return car;
  }

  update(dt, colliders, playerCar, peds) {
    for (const car of this.cars) {
      const tr = car.traffic;
      const target = this.city.nodes[tr.to];
      const dx = target.x - car.x, dz = target.z - car.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const wantHeading = Math.atan2(dx, dz);
      car.heading = lerpAngle(car.heading, wantHeading, 1 - Math.exp(-3.5 * dt));
      let speed = tr.speed;
      // Red light: stop before the intersection.
      const st = this.city.lightStateAt(target.x, target.z);
      const nsRoad = Math.abs(dx) < 1;
      if (d < 14 && ((nsRoad && (st === 'ew' || st === 'ewYellow')) || (!nsRoad && (st === 'ns' || st === 'nsYellow')))) speed = 0;
      // Car ahead: queue.
      for (const o of this.cars) {
        if (o === car) continue;
        const od = dist2(car.x, car.z, o.x, o.z);
        if (od < 9) {
          const ahead = (o.x - car.x) * Math.sin(car.heading) + (o.z - car.z) * Math.cos(car.heading);
          if (ahead > 0 && od < 8) speed = Math.min(speed, 0);
        }
      }
      if (playerCar && dist2(car.x, car.z, playerCar.x, playerCar.z) < 9) {
        const ahead = (playerCar.x - car.x) * Math.sin(car.heading) + (playerCar.z - car.z) * Math.cos(car.heading);
        if (ahead > 0) speed = 0;
      }
      car.speed = lerp(car.speed, speed, 1 - Math.exp(-2.5 * dt));
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
      if (d < 4) {
        const from = tr.to;
        const nexts = this.city.neighbors(this.city.nodes[from]).filter((n) => n !== tr.node);
        tr.node = from;
        tr.to = nexts.length ? this.rng.pick(nexts) : tr.node;
      }
    }
  }

  nearest(x, z, maxD) {
    let best = null, bd = maxD;
    for (const c of this.cars) {
      const d = dist2(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
}

// Parked cars the player can steal, lined along curbs.
export function spawnParkedCars(scene, city, count) {
  const rng = new Rng(4242);
  const out = [];
  const keys = ['comet', 'regal', 'regal', 'van', 'taxi'];
  for (let i = 0; i < count; i++) {
    const key = rng.pick(keys);
    const t = CAR_TYPES[key];
    const ave = rng.pick(city.nodes.map((n) => n.x));
    const z = rng.range(-380, 380);
    const heading = rng.chance(0.5) ? 0 : Math.PI;
    const car = new DriveCar(scene, key, rng.pick(t.colors), ave + 6.5, z, heading);
    car.parked = true;
    out.push(car);
  }
  return out;
}
