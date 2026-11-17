// Combat in Solmar: Jax's pistol (hitscan with a tracer and a muzzle
// flash), rival gunmen who shoot back, melee punches, cash that drops
// from the fallen, and what happens when Jax goes down.
import * as THREE from 'three';
import { range, pick } from './rng.js';

function buildGunmanMesh() {
  const g = new THREE.Group();
  const black = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xb98a5a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.78, 0.36), black);
  torso.position.y = 1.12;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), skin);
  head.position.y = 1.75;
  g.add(head);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.52), new THREE.MeshBasicMaterial({ color: 0xc0392b }));
  band.position.y = 1.92;
  g.add(band);
  for (const sx of [-0.35, 0.35]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.7, 0.17), black);
    arm.position.set(sx, 1.1, 0.15);
    arm.rotation.x = -0.9;
    g.add(arm);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.2), black);
    leg.position.set(sx * 0.7, 0.36, 0);
    leg.name = sx < 0 ? 'legL' : 'legR';
    g.add(leg);
  }
  return g;
}

export class Combat {
  constructor(G) {
    this.G = G;
    this.ammo = 12;
    this.magSize = 12;
    this.reloadTimer = 0;
    this.shootCooldown = 0;
    this.rivals = [];
    this.drops = [];
    this.tracers = [];
    this.raycaster = new THREE.Raycaster();
    this.flash = new THREE.PointLight(0xffcc66, 0, 18);
    G.scene.add(this.flash);
    this.raycaster.far = 120;
  }

  spawnRivalGunman(car) {
    const G = this.G;
    const mesh = buildGunmanMesh();
    mesh.position.set(car.pos.x + 3, 0, car.pos.z + 3);
    G.scene.add(mesh);
    const gunman = {
      mesh,
      car,
      x: mesh.position.x,
      z: mesh.position.z,
      health: 50,
      shootTimer: range(G.rng, 1, 2.5),
      walkPhase: 0,
    };
    mesh.userData.gunman = gunman;
    this.rivals.push(gunman);
    return gunman;
  }

  hittables() {
    const list = [];
    for (const ped of this.G.traffic.peds) list.push(ped.mesh);
    for (const o of this.G.police.officers) list.push(o.mesh);
    for (const r of this.rivals) list.push(r.mesh);
    for (const car of this.G.vehicles.cars) {
      if (!car.wrecked) list.push(car.mesh);
    }
    return list;
  }

  shoot() {
    const G = this.G;
    if (G.state !== 'playing') return false;
    if (G.player.inCar) return false;
    if (this.reloadTimer > 0 || this.shootCooldown > 0) return false;
    if (this.ammo <= 0) {
      G.audio.clickEmpty();
      this.reload();
      return false;
    }
    this.ammo--;
    this.shootCooldown = 0.22;
    G.audio.shot();
    const p = G.player;
    const origin = new THREE.Vector3(p.x, p.y + 1.5, p.z);
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    this.raycaster.set(origin, dir);
    const hits = this.raycaster.intersectObjects(this.hittables(), true);
    const end = origin.clone().add(dir.clone().multiplyScalar(90));
    if (hits.length) {
      const hit = hits[0];
      end.copy(hit.point);
      this.applyHit(hit.object, hit.point);
    }
    this.spawnTracer(origin, end);
    this.flash.position.copy(origin).add(dir.clone().multiplyScalar(2));
    this.flash.intensity = 60;
    G.traffic.scareAt(p.x, p.z, 30);
    G.police.addWanted(1, 'shots fired');
    return true;
  }

  applyHit(object, point) {
    const G = this.G;
    let node = object;
    while (node && !node.userData.ped && !node.userData.officer && !node.userData.gunman && !node.userData.car) {
      node = node.parent;
    }
    if (!node) return;
    this.sparkBurst(point.x, point.y, point.z);
    if (node.userData.ped) {
      const ped = node.userData.ped;
      ped.health -= 34;
      G.traffic.scareAt(ped.x, ped.z, 25);
      if (ped.health <= 0) {
        this.dropCash(ped.x, ped.z, pick(G.rng, [25, 40, 60]));
        G.traffic.removePed(ped);
      }
    } else if (node.userData.officer) {
      const o = node.userData.officer;
      o.health -= 34;
      if (o.health <= 0) {
        this.dropCash(o.x, o.z, 80);
        G.police.removeOfficer(o);
        G.police.addWanted(1, 'officer down');
      }
    } else if (node.userData.gunman) {
      const r = node.userData.gunman;
      r.health -= 34;
      if (r.health <= 0) this.killGunman(r);
    } else if (node.userData.car) {
      const car = node.userData.car;
      car.health -= 20;
      if (car.health <= 0 && !car.wrecked) this.wreckCar(car);
    }
  }

  killGunman(r) {
    const G = this.G;
    this.dropCash(r.x, r.z, pick(G.rng, [60, 100, 150]));
    G.scene.remove(r.mesh);
    const i = this.rivals.indexOf(r);
    if (i >= 0) this.rivals.splice(i, 1);
    if (r.car && !r.car.wrecked) {
      r.car.health -= 40;
      if (r.car.health <= 0) this.wreckCar(r.car);
    }
  }

  wreckCar(car) {
    const G = this.G;
    car.wrecked = true;
    car.speed = 0;
    car.mesh.rotation.z = 0.28;
    car.mesh.position.y = 0.25;
    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55 }),
    );
    smoke.position.set(car.pos.x, 2.2, car.pos.z);
    smoke.name = 'wreckSmoke';
    G.scene.add(smoke);
    G.audio.crash();
    G.hud.toast(`${car.name} wrecked!`);
    if (car.driver === 'player') {
      G.vehicles.exitCar();
      G.player.takeDamage(15, 'crash');
    }
    if (car.driver === 'rival') {
      car.driver = null;
      this.dropCash(car.pos.x, car.pos.z, 120);
    }
    if (car.isPolice) G.police.addWanted(1, 'cruiser wrecked');
  }

  meleeHit(x, z, heading) {
    const G = this.G;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const targets = [];
    for (const ped of G.traffic.peds) targets.push({ kind: 'ped', ref: ped, x: ped.x, z: ped.z });
    for (const o of G.police.officers) targets.push({ kind: 'officer', ref: o, x: o.x, z: o.z });
    for (const r of this.rivals) targets.push({ kind: 'gunman', ref: r, x: r.x, z: r.z });
    for (const t of targets) {
      const dx = t.x - x;
      const dz = t.z - z;
      const d = Math.hypot(dx, dz);
      if (d < 2.2 && dx * fx + dz * fz > 0) {
        if (t.kind === 'ped') {
          t.ref.health -= 20;
          if (t.ref.health <= 0) {
            this.dropCash(t.ref.x, t.ref.z, 25);
            G.traffic.removePed(t.ref);
          }
        } else if (t.kind === 'officer') {
          t.ref.health -= 20;
          if (t.ref.health <= 0) {
            this.dropCash(t.ref.x, t.ref.z, 80);
            G.police.removeOfficer(t.ref);
          }
        } else {
          t.ref.health -= 20;
          if (t.ref.health <= 0) this.killGunman(t.ref);
        }
        G.traffic.scareAt(x, z, 12);
        return true;
      }
    }
    return false;
  }

  dropCash(x, z, amount) {
    const G = this.G;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.12, 0.7),
      new THREE.MeshBasicMaterial({ color: 0x2ecc40 }),
    );
    mesh.position.set(x, 0.6, z);
    G.scene.add(mesh);
    this.drops.push({ mesh, x, z, amount, spin: 0 });
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.G.scene.add(line);
    this.tracers.push({ line, life: 0.12 });
  }

  sparkBurst(x, y, z) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(x + 0.4, y + 0.4, z),
      new THREE.Vector3(x - 0.3, y + 0.5, z + 0.2),
    ]);
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffcc33, size: 0.35 }));
    this.G.scene.add(pts);
    this.tracers.push({ line: pts, life: 0.25 });
  }

  reload() {
    if (this.reloadTimer > 0 || this.ammo === this.magSize) return;
    this.reloadTimer = 1.1;
    this.G.audio.reload();
  }

  onPlayerDown(from) {
    const G = this.G;
    G.state = 'dead';
    G.hud.showDead(from);
    G.audio.siren(false);
    G.audio.deathJingle();
  }

  respawn() {
    const G = this.G;
    const h = G.city.landmarks.hospital;
    G.player.health = 100;
    G.player.setPosition(h.x, h.z + 18, 0);
    if (G.player.inCar) G.vehicles.exitCar();
    G.police.clearWanted();
    G.cash = Math.max(0, G.cash - 150);
    this.ammo = this.magSize;
    G.state = 'playing';
    G.hud.hideDead();
    G.hud.toast('You woke up at Solmar General. -$150 hospital bill.');
    if (G.missions.active) G.missions.failMission('Jax went down');
  }

  update(dt) {
    const G = this.G;
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.ammo = this.magSize;
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 400);
    // Tracers and sparks fade fast.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        G.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    // Cash drops spin and fly to Jax when he is close.
    const p = G.playerPos();
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.spin += dt * 4;
      d.mesh.rotation.y = d.spin;
      const dx = p.x - d.x;
      const dz = p.z - d.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 6) {
        d.x += (dx / dist) * 14 * dt;
        d.z += (dz / dist) * 14 * dt;
        d.mesh.position.set(d.x, 0.6, d.z);
      }
      if (dist < 1.6) {
        G.cash += d.amount;
        G.audio.pickup();
        G.hud.toast(`+$${d.amount}`);
        G.scene.remove(d.mesh);
        this.drops.splice(i, 1);
      }
    }
    // Rival gunmen: follow their car, shoot at Jax when close.
    for (const r of this.rivals) {
      if (r.car && !r.car.wrecked) {
        r.x = r.car.pos.x + 3;
        r.z = r.car.pos.z + 3;
      }
      const dx = p.x - r.x;
      const dz = p.z - r.z;
      const dist = Math.hypot(dx, dz);
      r.mesh.position.set(r.x, 0, r.z);
      r.mesh.rotation.y = Math.atan2(dx, dz);
      r.shootTimer -= dt;
      if (dist < 45 && r.shootTimer <= 0 && G.state === 'playing') {
        r.shootTimer = range(G.rng, 1.6, 2.8);
        G.audio.enemyShot();
        this.spawnTracer(
          new THREE.Vector3(r.x, 1.4, r.z),
          new THREE.Vector3(p.x, 1.2, p.z),
        );
        if (G.rng() < 0.4) {
          if (G.player.inCar) {
            const car = G.vehicles.playerCar;
            car.health -= 8;
            if (car.health <= 0) this.wreckCar(car);
          } else {
            G.player.takeDamage(9, 'Tidebreaker gunman');
          }
        }
      }
    }
  }
}
