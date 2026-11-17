// Jax Marlowe on foot: third-person walking, sprinting, jumping and
// punching. The camera itself lives in main.js; the player only reports
// where it is and which way it faces, and asks the fleet when it wants
// to get into a car.
import * as THREE from 'three';

export class Player {
  constructor(G) {
    this.G = G;
    this.x = G.city.spawn.x;
    this.z = G.city.spawn.z;
    this.y = 0;
    this.vy = 0;
    this.heading = G.city.spawn.heading;
    this.speed = 0;
    this.health = 100;
    this.inCar = false;
    this.car = null;
    this.punchCooldown = 0;
    this.mesh = this.buildMesh();
    this.mesh.position.set(this.x, 0, this.z);
    G.scene.add(this.mesh);
  }

  buildMesh() {
    const g = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0x2a6a8a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.36), jacket);
    torso.position.y = 1.15;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
    head.position.y = 1.78;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0xd4ac0d }));
    cap.position.y = 1.98;
    g.add(cap);
    for (const sx of [-0.36, 0.36]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.18), jacket);
      arm.position.set(sx, 1.12, 0);
      arm.name = sx < 0 ? 'armL' : 'armR';
      g.add(arm);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), pants);
      leg.position.set(sx * 0.7, 0.38, 0);
      leg.name = sx < 0 ? 'legL' : 'legR';
      g.add(leg);
    }
    return g;
  }

  setPosition(x, z, heading) {
    const clamped = this.G.city.clampToWorld(x, z);
    this.x = clamped.x;
    this.z = clamped.z;
    if (heading !== undefined) this.heading = heading;
    this.y = 0;
    this.vy = 0;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  takeDamage(amount, from) {
    if (this.G.state !== 'playing' || this.inCar) return;
    this.health = Math.max(0, this.health - amount);
    this.G.hud.flashDamage();
    if (this.health <= 0) this.G.combat.onPlayerDown(from);
  }

  update(dt, input, camYaw) {
    if (this.inCar) return;
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    const sprint = input.sprint ? 1.6 : 1;
    const walkSpeed = 6 * sprint;
    let mx = 0;
    let mz = 0;
    if (input.forward) mz += 1;
    if (input.back) mz -= 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      // Movement is relative to the camera yaw.
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      const wx = mx * cos - mz * sin;
      const wz = mx * sin + mz * cos;
      this.speed = walkSpeed;
      let nx = this.x + wx * walkSpeed * dt;
      let nz = this.z + wz * walkSpeed * dt;
      const clamped = this.G.city.clampToWorld(nx, nz);
      nx = clamped.x;
      nz = clamped.z;
      const hit = this.G.city.collideCircle(nx, nz, 0.55);
      this.x = hit.x;
      this.z = hit.z;
      this.heading = Math.atan2(wx, wz);
      this.mesh.rotation.y = this.heading;
      // Walk-cycle swing.
      const t = this.G.time * (sprint > 1 ? 14 : 10);
      const legL = this.mesh.getObjectByName('legL');
      const legR = this.mesh.getObjectByName('legR');
      const armL = this.mesh.getObjectByName('armL');
      const armR = this.mesh.getObjectByName('armR');
      if (legL) legL.rotation.x = Math.sin(t) * 0.6;
      if (legR) legR.rotation.x = -Math.sin(t) * 0.6;
      if (armL) armL.rotation.x = -Math.sin(t) * 0.5;
      if (armR) armR.rotation.x = Math.sin(t) * 0.5;
    } else {
      this.speed = 0;
      const legL = this.mesh.getObjectByName('legL');
      const legR = this.mesh.getObjectByName('legR');
      const armL = this.mesh.getObjectByName('armL');
      const armR = this.mesh.getObjectByName('armR');
      if (legL) legL.rotation.x = 0;
      if (legR) legR.rotation.x = 0;
      if (armL) armL.rotation.x = 0;
      if (armR) armR.rotation.x = 0;
    }
    // Jump + gravity.
    if (input.jump && this.y === 0) {
      this.vy = 7.5;
      this.G.audio.jump();
    }
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; }
    }
    this.mesh.position.set(this.x, this.y, this.z);
  }

  punch() {
    if (this.inCar || this.punchCooldown > 0) return false;
    this.punchCooldown = 0.45;
    const armR = this.mesh.getObjectByName('armR');
    if (armR) armR.rotation.x = -1.4;
    this.G.combat.meleeHit(this.x, this.z, this.heading);
    this.G.audio.punch();
    return true;
  }
}
