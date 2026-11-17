// The Solmar Police Department: a 0–5 star wanted level, pursuing
// cruisers with flashing light bars and sirens, and foot officers who
// chase Jax down once the heat is high enough. Heat fades when Jax lays
// low and no cruiser can see him.
import * as THREE from 'three';
import { range, pick } from './rng.js';

export class Police {
  constructor(G) {
    this.G = G;
    this.wanted = 0;
    this.lastCrimeAt = -999;
    this.cruisers = [];
    this.officers = [];
    this.decayTimer = 0;
    this.sirenOn = false;
  }

  addWanted(n, reason) {
    const before = this.wanted;
    this.wanted = Math.max(0, Math.min(5, this.wanted + n));
    if (this.wanted > before) {
      this.lastCrimeAt = this.G.time;
      this.G.hud.toast(`Wanted level ${'★'.repeat(this.wanted)} — ${reason}`);
      if (this.wanted >= 3) this.G.audio.siren(true);
    }
  }

  clearWanted() {
    this.wanted = 0;
    if (this.G.audio) this.G.audio.siren(false);
  }

  spawnCruiser() {
    const G = this.G;
    const p = G.playerPos();
    const spot = G.city.randomRoadPoint(G.rng);
    // Spawn on a road a little away from the player, never on top of them.
    let x = spot.x;
    let z = spot.z;
    if (Math.hypot(x - p.x, z - p.z) < 40) {
      x = p.x + 60;
      z = p.z + 20;
    }
    const car = G.vehicles.spawnCar(x, z, 0, {
      driver: 'police',
      police: true,
      color: 0xf0f0ea,
      name: 'SPD Cruiser',
      maxSpeed: 30,
      accel: 17,
    });
    this.cruisers.push(car);
    return car;
  }

  spawnOfficer() {
    const G = this.G;
    const p = G.playerPos();
    const a = G.rng() * Math.PI * 2;
    const x = p.x + Math.sin(a) * 26;
    const z = p.z + Math.cos(a) * 26;
    const mesh = this.buildOfficerMesh();
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    const officer = {
      mesh, x, z,
      heading: a,
      speed: 5.2,
      health: 60,
      punchCooldown: 0,
      walkPhase: 0,
    };
    mesh.userData.officer = officer;
    this.officers.push(officer);
    return officer;
  }

  buildOfficerMesh() {
    const g = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.78, 0.36), navy);
    torso.position.y = 1.12;
    g.add(torso);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: 0xffd700 }));
    badge.position.set(-0.15, 1.25, 0.2);
    g.add(badge);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), skin);
    head.position.y = 1.75;
    g.add(head);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.14, 12), navy);
    hat.position.y = 1.95;
    g.add(hat);
    for (const sx of [-0.35, 0.35]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.7, 0.17), navy);
      arm.position.set(sx, 1.1, 0);
      g.add(arm);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.2), navy);
      leg.position.set(sx * 0.7, 0.36, 0);
      leg.name = sx < 0 ? 'legL' : 'legR';
      g.add(leg);
    }
    return g;
  }

  removeCruiser(car) {
    this.G.vehicles.removeCar(car);
    const i = this.cruisers.indexOf(car);
    if (i >= 0) this.cruisers.splice(i, 1);
  }

  removeOfficer(officer) {
    this.G.scene.remove(officer.mesh);
    const i = this.officers.indexOf(officer);
    if (i >= 0) this.officers.splice(i, 1);
  }

  update(dt) {
    const G = this.G;
    const p = G.playerPos();
    const wantCruisers = Math.min(this.wanted, 4);
    // Spawn or retire cruisers to match the wanted level.
    while (this.cruisers.length < wantCruisers) this.spawnCruiser();
    while (this.cruisers.length > wantCruisers) {
      const car = this.cruisers[this.cruisers.length - 1];
      if (Math.hypot(car.pos.x - p.x, car.pos.z - p.z) > 60) this.removeCruiser(car);
      else break;
    }
    // Foot officers at 2 stars and up, at most two.
    const wantOfficers = this.wanted >= 2 ? Math.min(2, this.wanted - 1) : 0;
    while (this.officers.length < wantOfficers) this.spawnOfficer();
    while (this.officers.length > wantOfficers) this.removeOfficer(this.officers[this.officers.length - 1]);
    // Cruisers chase the player's car (or the player on foot) and ram.
    for (const car of this.cruisers) {
      const dx = p.x - car.pos.x;
      const dz = p.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const turn = Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
      car.heading += turn;
      const targetSpeed = dist > 10 ? car.maxSpeed : car.maxSpeed * 0.55;
      car.speed += Math.max(-18 * dt, Math.min(16 * dt, targetSpeed - car.speed));
      G.vehicles.moveCar(car, dt);
      if (dist < 5 && G.player.inCar) {
        // Ram: shove the player's car and shake the camera.
        G.vehicles.playerCar.speed *= 0.92;
        G.hud.shake(0.25);
        if (G.rng() < dt * 0.5) G.audio.crash();
      } else if (dist < 2.2 && !G.player.inCar) {
        G.player.takeDamage(12 * dt * 3, 'police cruiser');
      }
    }
    // Officers run Jax down on foot and swing at him.
    for (const officer of this.officers) {
      officer.punchCooldown -= dt;
      const dx = p.x - officer.x;
      const dz = p.z - officer.z;
      const dist = Math.hypot(dx, dz);
      if (G.player.inCar || dist > 60) {
        // Too far or Jax is in a car: give up and walk off.
        officer.x += Math.sin(officer.heading) * 1.5 * dt;
        officer.z += Math.cos(officer.heading) * 1.5 * dt;
        continue;
      }
      officer.heading = Math.atan2(dx, dz);
      if (dist > 1.4) {
        officer.x += Math.sin(officer.heading) * officer.speed * dt;
        officer.z += Math.cos(officer.heading) * officer.speed * dt;
        officer.walkPhase += dt * 12;
        const legL = officer.mesh.getObjectByName('legL');
        const legR = officer.mesh.getObjectByName('legR');
        if (legL) legL.rotation.x = Math.sin(officer.walkPhase) * 0.6;
        if (legR) legR.rotation.x = -Math.sin(officer.walkPhase) * 0.6;
      } else if (officer.punchCooldown <= 0) {
        officer.punchCooldown = 0.9;
        G.player.takeDamage(8, 'police officer');
        G.audio.punch();
      }
      officer.mesh.position.set(officer.x, 0, officer.z);
      officer.mesh.rotation.y = officer.heading;
    }
    // Heat decay: lay low, out of sight, and a star drops every ~22 s.
    if (this.wanted > 0 && G.time - this.lastCrimeAt > 18) {
      const nearest = this.cruisers.reduce((m, c) => Math.min(m, Math.hypot(c.pos.x - p.x, c.pos.z - p.z)), 999);
      if (nearest > 45) {
        this.decayTimer += dt;
        if (this.decayTimer > 22) {
          this.decayTimer = 0;
          this.wanted -= 1;
          this.G.hud.toast(`Heat cooling off — ${this.wanted} star${this.wanted === 1 ? '' : 's'} left`);
          if (this.wanted < 3) this.G.audio.siren(false);
        }
      } else {
        this.decayTimer = 0;
      }
    }
  }
}
