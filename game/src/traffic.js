// Solmar's traffic: cars circling rectangular road loops with a
// stop-behind rule, and pedestrians strolling the sidewalks who run when
// they hear gunfire or a speeding car. Both share the fleet's cars and
// the city's road network.
import * as THREE from 'three';
import { range, pick, chance } from './rng.js';

const SHIRT_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xecf0f1, 0xe67e22, 0x1abc9c];

function buildPedMesh(color) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a06a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x34495e });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), shirt);
  torso.position.y = 1.05;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), skin);
  head.position.y = 1.62;
  g.add(head);
  for (const sx of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.65, 0.16), pants);
    leg.position.set(sx, 0.33, 0);
    leg.name = sx < 0 ? 'legL' : 'legR';
    g.add(leg);
  }
  return g;
}

export class Traffic {
  constructor(G) {
    this.G = G;
    this.peds = [];
    this.trafficCars = [];
    this.spawnTrafficCars(14);
    this.spawnPeds(26);
  }

  spawnTrafficCars(n) {
    const rng = this.G.rng;
    for (let i = 0; i < n; i++) {
      const loop = this.G.city.randomLoop(rng);
      const start = loop[Math.floor(rng() * 4)];
      const car = this.G.vehicles.spawnCar(start.x, start.z, 0, {
        driver: 'traffic',
        loop,
        maxSpeed: range(rng, 9, 13),
      });
      car.loopIndex = Math.floor(rng() * 4);
      this.trafficCars.push(car);
      this.aimAtLoopPoint(car);
    }
  }

  aimAtLoopPoint(car) {
    const target = car.loop[car.loopIndex];
    car.heading = Math.atan2(target.x - car.pos.x, target.z - car.pos.z);
  }

  spawnPeds(n) {
    const rng = this.G.rng;
    for (let i = 0; i < n; i++) {
      const mesh = buildPedMesh(pick(rng, SHIRT_COLORS));
      const bx = pick(rng, [-208, -156, -104, -52, 0, 52, 104, 156, 208]);
      const bz = pick(rng, [-208, -156, -104, -52, 0, 52, 104, 156, 208]);
      const x = bx + range(rng, -16, 16);
      const z = bz + range(rng, -16, 16);
      mesh.position.set(x, 0, z);
      this.G.scene.add(mesh);
      const ped = {
        mesh,
        x, z,
        heading: range(rng, 0, Math.PI * 2),
        speed: range(rng, 1.2, 2.2),
        state: 'walk',
        stateTime: 0,
        target: null,
        health: 30,
        walkPhase: rng() * 10,
      };
      mesh.userData.ped = ped;
      this.peds.push(ped);
      this.pickPedTarget(ped);
    }
  }

  pickPedTarget(ped) {
    const rng = this.G.rng;
    // Walk to a nearby sidewalk corner: a block edge plus a small offset.
    const bx = pick(rng, [-208, -156, -104, -52, 0, 52, 104, 156, 208]);
    const bz = pick(rng, [-208, -156, -104, -52, 0, 52, 104, 156, 208]);
    ped.target = { x: bx + range(rng, -18, 18), z: bz + range(rng, -18, 18) };
  }

  ejectDriver(car) {
    // A jacked driver becomes a pedestrian who runs away.
    const rng = this.G.rng;
    const mesh = buildPedMesh(pick(rng, SHIRT_COLORS));
    const x = car.pos.x + range(rng, -3, 3);
    const z = car.pos.z + range(rng, -3, 3);
    mesh.position.set(x, 0, z);
    this.G.scene.add(mesh);
    const ped = {
      mesh, x, z,
      heading: range(rng, 0, Math.PI * 2),
      speed: 4.5,
      state: 'flee',
      stateTime: 3,
      target: null,
      health: 30,
      walkPhase: 0,
    };
    mesh.userData.ped = ped;
    this.peds.push(ped);
  }

  scareAt(x, z, radius) {
    for (const ped of this.peds) {
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) {
        ped.state = 'flee';
        ped.stateTime = 3 + Math.random() * 2;
        ped.heading = Math.atan2(ped.x - x, ped.z - z);
      }
    }
  }

  update(dt) {
    const G = this.G;
    // --- Traffic cars follow their loop, slowing for the car ahead.
    for (const car of this.trafficCars) {
      if (car.wrecked) continue;
      const target = car.loop[car.loopIndex];
      const dx = target.x - car.pos.x;
      const dz = target.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 6) {
        car.loopIndex = (car.loopIndex + 1) % car.loop.length;
        this.aimAtLoopPoint(car);
        continue;
      }
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, dh));
      // Stop-behind: the car directly ahead in our lane.
      let blocked = false;
      for (const other of G.vehicles.cars) {
        if (other === car || other.wrecked) continue;
        const ox = other.pos.x - car.pos.x;
        const oz = other.pos.z - car.pos.z;
        const along = ox * Math.sin(car.heading) + oz * Math.cos(car.heading);
        const side = Math.abs(ox * Math.cos(car.heading) - oz * Math.sin(car.heading));
        if (along > 0 && along < 11 && side < 2.6) { blocked = true; break; }
      }
      const targetSpeed = blocked ? 0 : car.maxSpeed;
      car.speed += Math.max(-14 * dt, Math.min(10 * dt, targetSpeed - car.speed));
      G.vehicles.moveCar(car, dt);
    }
    // --- Pedestrians stroll, flee, or cower.
    for (const ped of this.peds) {
      ped.stateTime -= dt;
      let speed = 0;
      if (ped.state === 'flee') {
        speed = 5;
        if (ped.stateTime <= 0) { ped.state = 'walk'; this.pickPedTarget(ped); }
      } else if (ped.state === 'walk') {
        speed = ped.speed;
        if (!ped.target) this.pickPedTarget(ped);
        const dx = ped.target.x - ped.x;
        const dz = ped.target.z - ped.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.5) this.pickPedTarget(ped);
        else ped.heading = Math.atan2(dx, dz);
      }
      if (speed > 0) {
        ped.x += Math.sin(ped.heading) * speed * dt;
        ped.z += Math.cos(ped.heading) * speed * dt;
        const clamped = G.city.clampToWorld(ped.x, ped.z);
        ped.x = clamped.x;
        ped.z = clamped.z;
        ped.walkPhase += dt * speed * 3;
        const legL = ped.mesh.getObjectByName('legL');
        const legR = ped.mesh.getObjectByName('legR');
        if (legL) legL.rotation.x = Math.sin(ped.walkPhase) * 0.55;
        if (legR) legR.rotation.x = -Math.sin(ped.walkPhase) * 0.55;
      }
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.heading;
    }
    // Keep the streets full: replace peds that wandered too far away.
    if (this.peds.length < 20 && chance(G.rng, 0.01)) {
      this.spawnPeds(1);
    }
  }

  removePed(ped) {
    this.G.scene.remove(ped.mesh);
    const i = this.peds.indexOf(ped);
    if (i >= 0) this.peds.splice(i, 1);
  }
}
