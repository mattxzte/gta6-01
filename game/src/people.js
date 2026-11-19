// people.js — Dante Cruz on foot, and the citizens of Solmar Bay walking
// its sidewalks, panicking at gunfire and scattering from speeding cars.
import * as THREE from 'three';
import { Rng, clamp, lerp, lerpAngle, circleVsBox, dist2 } from './utils.js';

const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a34, 0xf0c8a0, 0x6a4028];
const SHIRTS = [0xd83a3a, 0x3a7ad8, 0x3ad86a, 0xe8d83a, 0x8a3ad8, 0xe8e8e8, 0x2a2a2a, 0xd86a3a];
const PANTS = [0x2a3a5a, 0x3a3a3a, 0x5a4a3a, 0x7a8a9a];

const limbGeo = new THREE.BoxGeometry(0.34, 0.85, 0.34);
const torsoGeo = new THREE.BoxGeometry(0.95, 1.05, 0.5);
const headGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);

export function makePersonMesh(shirt, pants, skin, scale = 1) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const torso = new THREE.Mesh(torsoGeo, shirtMat);
  torso.position.y = 1.32;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 2.12;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.22, 0.58), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 }));
  hair.position.y = 2.42;
  g.add(hair);
  const legL = new THREE.Mesh(limbGeo, pantsMat);
  legL.position.set(-0.24, 0.55, 0);
  legL.geometry = limbGeo;
  const legR = new THREE.Mesh(limbGeo, pantsMat);
  legR.position.set(0.24, 0.55, 0);
  const armL = new THREE.Mesh(limbGeo, shirtMat);
  armL.scale.set(0.8, 0.9, 0.8);
  armL.position.set(-0.62, 1.35, 0);
  const armR = new THREE.Mesh(limbGeo, shirtMat);
  armR.scale.set(0.8, 0.9, 0.8);
  armR.position.set(0.62, 1.35, 0);
  // Pivot limbs at the top so the walk swing looks right.
  for (const l of [legL, legR, armL, armR]) {
    l.geometry = limbGeo;
    l.position.y -= 0.0;
  }
  g.add(legL); g.add(legR); g.add(armL); g.add(armR);
  g.scale.setScalar(scale);
  g.userData = { legL, legR, armL, armR, torso, head };
  return g;
}

function swingLimbs(mesh, phase, amp) {
  const u = mesh.userData;
  const s = Math.sin(phase);
  u.legL.rotation.x = s * amp;
  u.legR.rotation.x = -s * amp;
  u.armL.rotation.x = -s * amp * 0.8;
  u.armR.rotation.x = s * amp * 0.8;
}

export class Player {
  constructor(scene, x, z) {
    this.mesh = makePersonMesh(0x2a6a8a, 0x2a2a2a, SKINS[0], 1.05);
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.y = 0; this.vy = 0;
    this.heading = Math.PI;
    this.speed = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.health = 100;
  }

  // input: {f,b,l,r,run,jump} relative to camYaw. Returns distance moved.
  update(dt, input, camYaw, colliders, cars) {
    let mx = 0, mz = 0;
    if (input.f) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
    if (input.b) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
    if (input.l) { mx -= Math.cos(camYaw); mz += Math.sin(camYaw); }
    if (input.r) { mx += Math.cos(camYaw); mz -= Math.sin(camYaw); }
    const len = Math.hypot(mx, mz);
    const targetSpeed = len > 0 ? (input.run ? 9.5 : 5.2) : 0;
    this.speed = lerp(this.speed, targetSpeed, 1 - Math.exp(-10 * dt));
    if (len > 0) {
      mx /= len; mz /= len;
      this.heading = lerpAngle(this.heading, Math.atan2(mx, mz), 1 - Math.exp(-12 * dt));
      const nx = this.x + mx * this.speed * dt;
      const nz = this.z + mz * this.speed * dt;
      let bx = nx, bz = nz;
      for (const c of colliders) {
        const res = circleVsBox(bx, bz, 0.6, c);
        if (res) { bx += res.nx * res.depth; bz += res.nz * res.depth; }
      }
      this.x = bx; this.z = bz;
      this.walkPhase += dt * this.speed * 1.6;
    }
    // Jump / gravity.
    if (input.jump && this.onGround) { this.vy = 6.5; this.onGround = false; }
    if (!this.onGround) {
      this.vy -= 18 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.onGround = true; }
    }
    // Gentle push from cars.
    if (cars) {
      for (const c of cars) {
        const d = dist2(this.x, this.z, c.x, c.z);
        if (d < 2.2 && Math.abs(c.speed) > 2) {
          const push = (2.2 - d);
          this.x += ((this.x - c.x) / (d || 1)) * push;
          this.z += ((this.z - c.z) / (d || 1)) * push;
        }
      }
    }
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
    swingLimbs(this.mesh, this.walkPhase, clamp(this.speed / 9.5, 0, 1) * 0.7);
    return this.speed;
  }

  teleport(x, z, heading = null) {
    this.x = x; this.z = z; this.y = 0; this.vy = 0;
    if (heading !== null) this.heading = heading;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = this.heading;
  }
}

// Pedestrians: they stroll the sidewalks, chat in place sometimes, and run
// from gunfire, speeding cars and the player waving a weapon around.
export class Pedestrians {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rng = new Rng(31337);
    this.list = [];
  }

  spawn(count, playerPos) {
    for (let i = 0; i < count; i++) this.addPed(playerPos);
  }

  addPed(playerPos, near = null) {
    const shirt = this.rng.pick(SHIRTS);
    const pants = this.rng.pick(PANTS);
    const skin = this.rng.pick(SKINS);
    const mesh = makePersonMesh(shirt, pants, skin, this.rng.range(0.94, 1.06));
    this.scene.add(mesh);
    let x, z;
    if (near) { x = near.x + this.rng.range(-30, 30); z = near.z + this.rng.range(-30, 30); }
    else {
      const node = this.rng.pick(this.city.nodes);
      x = node.x + this.rng.range(-8, 8);
      z = node.z + this.rng.range(-8, 8);
    }
    const ped = {
      mesh, x, z, heading: this.rng.range(0, Math.PI * 2),
      speed: this.rng.range(1.2, 2.2), phase: this.rng.range(0, 6),
      state: 'walk', target: null, panic: 0, fallen: 0, idle: this.rng.range(0, 4),
    };
    ped.target = this.pickTarget(ped);
    mesh.position.set(x, 0, z);
    this.list.push(ped);
    return ped;
  }

  pickTarget(ped) {
    const n = this.city.nodes[this.rng.int(0, this.city.nodes.length - 1)];
    return { x: n.x + this.rng.range(-10, 10), z: n.z + this.rng.range(-10, 10) };
  }

  scare(x, z, radius) {
    for (const p of this.list) {
      if (p.fallen > 0) continue;
      if (dist2(p.x, p.z, x, z) < radius) {
        p.state = 'flee';
        p.panic = 3 + Math.random() * 2;
        const away = Math.atan2(p.x - x, p.z - z);
        p.target = { x: p.x + Math.sin(away) * 40, z: p.z + Math.cos(away) * 40 };
      }
    }
  }

  knockDown(x, z, radius) {
    let hit = 0;
    for (const p of this.list) {
      if (p.fallen > 0) continue;
      if (dist2(p.x, p.z, x, z) < radius) {
        p.fallen = 2.5;
        p.mesh.rotation.x = -Math.PI / 2;
        p.mesh.position.y = 0.4;
        hit++;
      }
    }
    return hit;
  }

  nearest(x, z, maxD) {
    let best = null, bd = maxD;
    for (const p of this.list) {
      if (p.fallen > 0) continue;
      const d = dist2(x, z, p.x, p.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  update(dt, danger) {
    for (const p of this.list) {
      if (p.fallen > 0) {
        p.fallen -= dt;
        if (p.fallen <= 0) {
          p.mesh.rotation.x = 0;
          p.mesh.position.y = 0;
          p.state = 'flee'; p.panic = 2;
          p.target = this.pickTarget(p);
        }
        continue;
      }
      if (danger && dist2(p.x, p.z, danger.x, danger.z) < danger.r) {
        p.state = 'flee'; p.panic = 2.5;
        const away = Math.atan2(p.x - danger.x, p.z - danger.z);
        p.target = { x: p.x + Math.sin(away) * 35, z: p.z + Math.cos(away) * 35 };
      }
      if (p.panic > 0) p.panic -= dt;
      if (p.panic <= 0 && p.state === 'flee') p.state = 'walk';
      const speed = p.state === 'flee' ? 6.5 : p.speed;
      const dx = p.target.x - p.x, dz = p.target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 3) {
        if (p.idle > 0) { p.idle -= dt; swingLimbs(p.mesh, p.phase, 0); }
        else { p.target = this.pickTarget(p); p.idle = this.rng.chance(0.3) ? this.rng.range(2, 6) : 0; }
      } else {
        p.heading = lerpAngle(p.heading, Math.atan2(dx, dz), 1 - Math.exp(-5 * dt));
        p.x += Math.sin(p.heading) * speed * dt;
        p.z += Math.cos(p.heading) * speed * dt;
        p.phase += dt * speed * 1.8;
        swingLimbs(p.mesh, p.phase, p.state === 'flee' ? 0.9 : 0.55);
      }
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }
}
