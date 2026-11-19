// police.js — the wanted system and the Solmar Bay Police Department:
// foot cops, Interceptor cruisers that route through the streets after the
// player, roadblocks at three stars, and the police helicopter at four.
import * as THREE from 'three';
import { Rng, clamp, lerp, lerpAngle, dist2 } from './utils.js';
import { makePersonMesh } from './people.js';
import { DriveCar, makeCarMesh, CAR_TYPES } from './vehicles.js';

const STAR_HEAT = [0, 25, 55, 95, 145, 200];

export class Wanted {
  constructor() {
    this.stars = 0;
    this.heat = 0;
    this.quietTime = 0;
    this.lastCrime = -999;
  }

  addHeat(amount, now) {
    this.heat = clamp(this.heat + amount, 0, 240);
    this.lastCrime = now;
    this.quietTime = 0;
    this.recalc();
  }

  clear() { this.stars = 0; this.heat = 0; this.quietTime = 0; }

  recalc() {
    let s = 0;
    for (let i = 5; i >= 1; i--) if (this.heat >= STAR_HEAT[i]) { s = i; break; }
    this.stars = s;
  }

  update(dt, now, policeNear) {
    if (now - this.lastCrime > 4 && !policeNear) this.quietTime += dt;
    else this.quietTime = 0;
    if (this.quietTime > 7 && this.stars > 0) {
      this.heat = Math.max(0, this.heat - 22 * dt);
      this.recalc();
      if (this.stars === 0) this.quietTime = 0;
    }
  }
}

function makeHeliMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.4, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 6.5), bodyMat);
  body.castShadow = true;
  g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.8), new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.1, metalness: 0.7 }));
  glass.position.set(0, 0.2, 2.6);
  g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 4.5), bodyMat);
  tail.position.set(0, 0.3, -5);
  g.add(tail);
  const rotor = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  rotor.add(blade);
  const blade2 = blade.clone(); blade2.rotation.y = Math.PI / 2; rotor.add(blade2);
  rotor.position.y = 1.5;
  g.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.4), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  tailRotor.position.set(0.5, 0.6, -6.8);
  g.add(tailRotor);
  const spot = new THREE.SpotLight(0xfff2c0, 0, 90, 0.24, 0.5, 1.2);
  spot.position.set(0, -0.8, 1);
  g.add(spot);
  g.userData = { rotor, spot };
  return g;
}

export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rng = new Rng(90210);
    this.cops = [];      // on-foot officers
    this.cruisers = [];  // police DriveCars
    this.blocks = [];    // roadblock cars (parked cruisers)
    this.heli = null;
    this.heliMesh = null;
    this.spawnTimer = 0;
    this.bustedTimer = 0;
  }

  desiredCounts(stars) {
    return {
      cops: stars >= 1 ? Math.min(2 + stars, 8) : 0,
      cruisers: stars >= 2 ? Math.min(stars - 1, 4) : 0,
      blocks: stars >= 3 ? 1 : 0,
      heli: stars >= 4,
    };
  }

  spawnCop(px, pz) {
    const mesh = makePersonMesh(0x1a2a4a, 0x1a1a22, 0xe8b88a, 1.05);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.6), new THREE.MeshStandardMaterial({ color: 0x101828 }));
    cap.position.y = 2.48;
    mesh.add(cap);
    this.scene.add(mesh);
    const a = this.rng.range(0, Math.PI * 2);
    const cop = {
      mesh, x: px + Math.sin(a) * 45, z: pz + Math.cos(a) * 45,
      heading: a, speed: 0, phase: 0, siren: this.rng.range(0, 1),
    };
    mesh.position.set(cop.x, 0, cop.z);
    this.cops.push(cop);
    return cop;
  }

  spawnCruiser(px, pz, playerNode) {
    const node = this.city.nodes[this.rng.int(0, this.city.nodes.length - 1)];
    const car = new DriveCar(this.scene, 'police', 0x1a1a22, node.x, node.z, 0);
    car.traffic = null;
    car.route = [this.city.nearestNode(node.x, node.z)];
    car.routeIdx = 0;
    car.sirenPhase = this.rng.range(0, 1);
    this.cruisers.push(car);
    return car;
  }

  spawnBlock(px, pz, heading) {
    const aheadX = px + Math.sin(heading) * 55;
    const aheadZ = pz + Math.cos(heading) * 55;
    const perp = heading + Math.PI / 2;
    for (let i = -1; i <= 1; i++) {
      const car = new DriveCar(this.scene, 'police', 0x1a1a22,
        aheadX + Math.sin(perp) * i * 4.5, aheadZ + Math.cos(perp) * i * 4.5, perp);
      car.parked = true;
      car.blockCar = true;
      this.blocks.push(car);
    }
  }

  clearBlocks() {
    for (const c of this.blocks) c.dispose(this.scene);
    this.blocks = [];
  }

  clearAll() {
    for (const c of this.cops) this.scene.remove(c.mesh);
    this.cops = [];
    for (const c of this.cruisers) c.dispose(this.scene);
    this.cruisers = [];
    this.clearBlocks();
    if (this.heliMesh) { this.scene.remove(this.heliMesh); this.heliMesh = null; this.heli = null; }
  }

  update(dt, S, playerCar, colliders) {
    const stars = S.wanted.stars;
    const want = this.desiredCounts(stars);
    const px = S.player.x, pz = S.player.z;
    this.spawnTimer -= dt;

    // Foot cops.
    while (this.cops.length < want.cops && this.spawnTimer <= 0) { this.spawnCop(px, pz); this.spawnTimer = 0.4; }
    while (this.cops.length > want.cops) {
      const c = this.cops.pop();
      this.scene.remove(c.mesh);
    }
    for (const c of this.cops) {
      const d = dist2(c.x, c.z, px, pz);
      const speed = stars >= 1 ? 6.2 : 2;
      const targetHeading = Math.atan2(px - c.x, pz - c.z);
      c.heading = lerpAngle(c.heading, targetHeading, 1 - Math.exp(-4 * dt));
      c.x += Math.sin(c.heading) * speed * dt;
      c.z += Math.cos(c.heading) * speed * dt;
      c.phase += dt * speed * 1.7;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      const u = c.mesh.userData;
      const s = Math.sin(c.phase);
      u.legL.rotation.x = s * 0.7; u.legR.rotation.x = -s * 0.7;
      u.armL.rotation.x = -s * 0.5; u.armR.rotation.x = s * 0.5;
    }

    // Cruisers: route along the grid toward the player's node, then ram.
    while (this.cruisers.length < want.cruisers && this.spawnTimer <= 0) { this.spawnCruiser(px, pz); this.spawnTimer = 0.5; }
    while (this.cruisers.length > want.cruisers) {
      const c = this.cruisers.pop();
      c.dispose(this.scene);
    }
    const playerNode = this.city.nearestNode(px, pz);
    for (const c of this.cruisers) {
      const myNode = this.city.nearestNode(c.x, c.z);
      if (!c.route || c.routeIdx >= c.route.length || myNode === playerNode) {
        c.route = this.city.route(myNode, playerNode);
        c.routeIdx = 0;
      }
      const target = this.city.nodes[c.route[Math.min(c.routeIdx, c.route.length - 1)]];
      const dx = target.x - c.x, dz = target.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 6 && c.routeIdx < c.route.length - 1) c.routeIdx++;
      const wantHeading = Math.atan2(dx, dz);
      const close = dist2(c.x, c.z, px, pz) < 14;
      const driveHeading = close ? Math.atan2(px - c.x, pz - c.z) : wantHeading;
      const diff = Math.abs(((driveHeading - c.heading) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      const input = {
        fwd: true, back: false, brake: false,
        left: diff > 0.12 && (((driveHeading - c.heading) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI) > 0,
        right: diff > 0.12 && (((driveHeading - c.heading) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI) < 0,
      };
      const others = [...this.cruisers, playerCar].filter(Boolean);
      c.update(dt, input, colliders, others);
      c.sirenPhase += dt * 2;
      if (c.mesh.userData.lightBar) {
        const on = Math.sin(c.sirenPhase * Math.PI * 2) > 0;
        c.mesh.userData.lightBar.children[0].material.emissiveIntensity = on ? 3 : 0.2;
        c.mesh.userData.lightBar.children[1].material.emissiveIntensity = on ? 0.2 : 3;
      }
    }

    // Roadblocks.
    if (want.blocks > 0 && this.blocks.length === 0 && this.spawnTimer <= 0) {
      this.spawnBlock(px, pz, playerCar ? playerCar.heading : S.player.heading);
      this.spawnTimer = 1;
    }
    if (want.blocks === 0 && this.blocks.length > 0) this.clearBlocks();

    // Helicopter.
    if (want.heli && !this.heliMesh) {
      this.heliMesh = makeHeliMesh();
      this.scene.add(this.heliMesh);
      this.heli = { x: px, z: pz, y: 55, angle: 0 };
    }
    if (!want.heli && this.heliMesh) {
      this.scene.remove(this.heliMesh);
      this.heliMesh = null; this.heli = null;
    }
    if (this.heliMesh && this.heli) {
      this.heli.angle += dt * 0.5;
      this.heli.x = lerp(this.heli.x, px + Math.sin(this.heli.angle) * 18, 1 - Math.exp(-1.2 * dt));
      this.heli.z = lerp(this.heli.z, pz + Math.cos(this.heli.angle) * 18, 1 - Math.exp(-1.2 * dt));
      this.heli.y = lerp(this.heli.y, 52, 1 - Math.exp(-dt));
      this.heliMesh.position.set(this.heli.x, this.heli.y, this.heli.z);
      this.heliMesh.rotation.y = Math.atan2(px - this.heli.x, pz - this.heli.z);
      this.heliMesh.userData.rotor.rotation.y += dt * 22;
      const spot = this.heliMesh.userData.spot;
      spot.intensity = S.night ? 420 : 130;
      spot.target.position.set(px - this.heli.x, -this.heli.y, pz - this.heli.z);
      this.heliMesh.add(spot.target);
    }
  }

  // Returns 'busted' when a cop catches the player on foot.
  bustedCheck(S, playerCar) {
    if (S.wanted.stars < 1 || playerCar) return false;
    for (const c of this.cops) {
      if (dist2(c.x, c.z, S.player.x, S.player.z) < 1.7 && S.player.speed < 1.5) return true;
    }
    return false;
  }

  policeNear(S, playerCar) {
    for (const c of this.cops) if (dist2(c.x, c.z, S.player.x, S.player.z) < 30) return true;
    for (const c of this.cruisers) if (dist2(c.x, c.z, S.player.x, S.player.z) < 35) return true;
    return false;
  }
}
