// combat.js — guns, fists and the rival gangs of Solmar Bay.
// Raycast shooting with tracers, muzzle flashes and damage, plus enemy
// shooters who fight back during the story missions.
import * as THREE from 'three';
import { Rng, clamp, lerpAngle, dist2 } from './utils.js';
import { makePersonMesh } from './people.js';

export const WEAPONS = {
  fists: { name: 'Fists', damage: 25, rate: 0.45, range: 2.4, auto: false, spread: 0, pellets: 1, mag: Infinity },
  pistol: { name: 'P9 Pistol', damage: 34, rate: 0.28, range: 70, auto: false, spread: 0.012, pellets: 1, mag: 12 },
  smg: { name: 'VK-9 SMG', damage: 17, rate: 0.085, range: 55, auto: true, spread: 0.045, pellets: 1, mag: 32 },
  shotgun: { name: 'S12 Scattergun', damage: 13, rate: 0.95, range: 30, auto: false, spread: 0.09, pellets: 8, mag: 6 },
};

export class Combat {
  constructor(scene, fx, audio) {
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.ray = new THREE.Raycaster();
    this.enemies = [];
    this.tracers = [];
    this.cooldown = 0;
    this.reloadTimer = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 10; i++) {
      const line = new THREE.Line(geo.clone(), this.tracerMat.clone());
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
  }

  // Fire the player's current weapon. Returns a hit report or null.
  shoot(S, origin, dir, targets) {
    const w = WEAPONS[S.weapon];
    if (this.cooldown > 0 || this.reloadTimer > 0) return null;
    const ammo = S.ammo[S.weapon];
    if (w.mag !== Infinity && ammo <= 0) {
      this.reloadTimer = 1.1;
      return { dry: true };
    }
    this.cooldown = w.rate;
    if (w.mag !== Infinity) S.ammo[S.weapon] = Math.max(0, ammo - 1);
    this.audio.shot(S.weapon === 'fists' ? 'pistol' : S.weapon);
    if (S.weapon === 'fists') return null;
    let firstHit = null;
    for (let p = 0; p < w.pellets; p++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * w.spread * 2;
      d.y += (Math.random() - 0.5) * w.spread * 2;
      d.z += (Math.random() - 0.5) * w.spread * 2;
      d.normalize();
      this.ray.set(origin, d);
      this.ray.far = w.range;
      const hits = this.ray.intersectObjects(targets, false);
      const muzzle = origin.clone().add(d.clone().multiplyScalar(1.2));
      this.fx.flash.flash(muzzle.x, muzzle.y, muzzle.z, 0xffc860, 14, 14, 0.07);
      let end = origin.clone().add(d.clone().multiplyScalar(w.range));
      if (hits.length) {
        const h = hits[0];
        end = h.point.clone();
        const dmg = w.damage * (h.object.userData.enemy ? 1 : 0.6);
        if (!firstHit) firstHit = { point: h.point.clone(), object: h.object, damage: dmg };
        if (h.object.userData.enemy) this.damageEnemy(h.object.userData.enemy, dmg, h.point);
        else if (h.object.userData.ped) this.hitPed(h.object.userData.ped, h.point);
        else if (h.object.userData.carBody) this.hitCar(h.object.userData.carBody, dmg, h.point);
        else this.fx.burst(h.point.x, h.point.y, h.point.z, 'sparks');
      }
      this.showTracer(muzzle, end);
    }
    return firstHit;
  }

  showTracer(a, b) {
    const t = this.tracers.find((q) => q.life <= 0) || this.tracers[0];
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.06;
  }

  punch(S, origin, dir, targets) {
    if (this.cooldown > 0) return null;
    this.cooldown = WEAPONS.fists.rate;
    this.audio.punch();
    this.ray.set(origin, dir);
    this.ray.far = WEAPONS.fists.range;
    const hits = this.ray.intersectObjects(targets, false);
    if (!hits.length) return null;
    const h = hits[0];
    if (h.object.userData.enemy) this.damageEnemy(h.object.userData.enemy, WEAPONS.fists.damage, h.point);
    else if (h.object.userData.ped) this.hitPed(h.object.userData.ped, h.point);
    return { point: h.point.clone(), object: h.object, damage: WEAPONS.fists.damage };
  }

  damageEnemy(e, dmg, point) {
    e.health -= dmg;
    this.fx.burst(point.x, point.y, point.z, 'blood');
    if (e.health <= 0 && !e.dead) {
      e.dead = true;
      e.mesh.rotation.x = -Math.PI / 2;
      e.mesh.position.y = 0.35;
      e.dropTimer = 0;
    }
  }

  hitPed(ped, point) {
    this.fx.burst(point.x, point.y, point.z, 'blood');
    if (ped.fallen <= 0) {
      ped.fallen = 2.5;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.4;
    }
  }

  hitCar(car, dmg, point) {
    this.fx.burst(point.x, point.y, point.z, 'sparks');
    if (car.damage(dmg * 0.5)) {
      this.fx.burst(car.x, 1.2, car.z, 'fire');
      this.audio.explosion();
      car.health = 100;
      car.x = car.x; // wreck stays where it is; the driver bails in main
    }
  }

  spawnEnemy(scene, x, z, kind) {
    const shirt = kind === 'harbor' ? 0x3a5a2a : 0x8a2a3a;
    const mesh = makePersonMesh(shirt, 0x2a2a2a, 0xc98a5a, 1.06);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    gun.position.set(0.62, 1.45, 0.5);
    mesh.add(gun);
    scene.add(mesh);
    mesh.position.set(x, 0, z);
    mesh.traverse((o) => { o.userData.enemyRef = null; });
    const e = { mesh, x, z, heading: 0, health: 100, dead: false, shootTimer: 1 + Math.random(), kind, phase: Math.random() * 6 };
    mesh.traverse((o) => { o.userData.enemy = e; });
    this.enemies.push(e);
    return e;
  }

  clearEnemies(scene) {
    for (const e of this.enemies) scene.remove(e.mesh);
    this.enemies = [];
  }

  // Enemies strafe, close distance and shoot at the player with poor aim.
  updateEnemies(dt, S, playerPos, fx, audio, onPlayerHit) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist2(e.x, e.z, playerPos.x, playerPos.z);
      e.shootTimer -= dt;
      const wantHeading = Math.atan2(playerPos.x - e.x, playerPos.z - e.z);
      e.heading = lerpAngle(e.heading, wantHeading, 1 - Math.exp(-5 * dt));
      if (d > 26) {
        e.x += Math.sin(e.heading) * 4.5 * dt;
        e.z += Math.cos(e.heading) * 4.5 * dt;
        e.phase += dt * 8;
      } else if (d < 10) {
        e.x -= Math.sin(e.heading) * 2 * dt;
        e.z -= Math.cos(e.heading) * 2 * dt;
      } else {
        const strafe = Math.sin(e.phase * 0.7) > 0 ? 1 : -1;
        e.x += Math.cos(e.heading) * strafe * 2.2 * dt;
        e.z -= Math.sin(e.heading) * strafe * 2.2 * dt;
        e.phase += dt * 3;
      }
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = e.heading;
      const u = e.mesh.userData;
      const s = Math.sin(e.phase);
      u.legL.rotation.x = s * 0.5; u.legR.rotation.x = -s * 0.5;
      if (e.shootTimer <= 0 && d < 45) {
        e.shootTimer = 0.9 + Math.random() * 0.9;
        const aimErr = 2.5;
        const muzzle = new THREE.Vector3(e.x, 1.5, e.z);
        const dir = new THREE.Vector3(playerPos.x - e.x + (Math.random() - 0.5) * aimErr * 2, 1.2 - 1.5, playerPos.z - e.z + (Math.random() - 0.5) * aimErr * 2).normalize();
        const end = muzzle.clone().add(dir.clone().multiplyScalar(40));
        this.showTracer(muzzle, end);
        this.fx.flash.flash(muzzle.x, muzzle.y, muzzle.z, 0xffc860, 8, 10, 0.06);
        audio.shot('smg');
        if (Math.random() < 0.3) onPlayerHit(6 + Math.random() * 8, e);
      }
    }
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        // Auto-reload from reserve.
      }
    }
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.line.visible = false;
      }
    }
  }

  // Raycast targets: every mesh that can be shot. Built fresh each shot.
  collectTargets(cars, peds) {
    const out = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.mesh.traverse((o) => { if (o.isMesh) out.push(o); });
    }
    for (const p of peds.list) {
      if (p.fallen > 0) continue;
      p.mesh.traverse((o) => { if (o.isMesh) { o.userData.ped = p; out.push(o); } });
    }
    for (const c of cars) {
      c.mesh.traverse((o) => { if (o.isMesh) { o.userData.carBody = c; out.push(o); } });
    }
    return out;
  }
}
