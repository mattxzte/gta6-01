// effects.js — particles, explosions, muzzle flashes, the sun-soaked sky and
// the day/night cycle of Solmar Bay. Purely visual; no gameplay state here.
import * as THREE from 'three';
import { clamp, lerp } from './utils.js';

// A small pool of glowing points reused for smoke, sparks, dust and fire.
export class Particles {
  constructor(scene, max = 900) {
    this.scene = scene;
    this.max = max;
    this.items = [];
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.9, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < max; i++) this.items.push({ alive: false, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, grav: 0, r: 1, g: 1, b: 1, size: 1 });
  }

  spawn(x, y, z, opts = {}) {
    const count = opts.count || 1;
    for (let n = 0; n < count; n++) {
      const p = this.items.find((q) => !q.alive);
      if (!p) return;
      p.alive = true;
      p.life = 0;
      p.maxLife = opts.life || 0.7;
      p.vx = (Math.random() - 0.5) * (opts.spread || 6);
      p.vy = (opts.up || 3) + Math.random() * (opts.spread || 6) * 0.5;
      p.vz = (Math.random() - 0.5) * (opts.spread || 6);
      p.grav = opts.grav !== undefined ? opts.grav : -6;
      p.r = opts.r !== undefined ? opts.r : 1;
      p.g = opts.g !== undefined ? opts.g : 0.6;
      p.b = opts.b !== undefined ? opts.b : 0.2;
      p.size = opts.size || 1;
      this.positions[this.items.indexOf(p) * 3] = x;
      this.positions[this.items.indexOf(p) * 3 + 1] = y;
      this.positions[this.items.indexOf(p) * 3 + 2] = z;
    }
  }

  burst(x, y, z, kind) {
    if (kind === 'smoke') this.spawn(x, y, z, { count: 14, life: 1.4, spread: 3, up: 2.5, r: 0.35, g: 0.35, b: 0.38, grav: 1.5 });
    else if (kind === 'fire') this.spawn(x, y, z, { count: 22, life: 0.6, spread: 8, up: 6, r: 1, g: 0.45, b: 0.1 });
    else if (kind === 'sparks') this.spawn(x, y, z, { count: 12, life: 0.5, spread: 10, up: 4, r: 1, g: 0.85, b: 0.3, grav: -14 });
    else if (kind === 'dust') this.spawn(x, y, z, { count: 8, life: 0.9, spread: 4, up: 1, r: 0.7, g: 0.62, b: 0.45, grav: 0.5 });
    else if (kind === 'blood') this.spawn(x, y, z, { count: 10, life: 0.5, spread: 5, up: 2, r: 0.55, g: 0.05, b: 0.05 });
    else this.spawn(x, y, z, { count: 10, life: 0.6, spread: 6, up: 3 });
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.items[i];
      const ix = i * 3;
      if (!p.alive) { this.positions[ix + 1] = -999; continue; }
      p.life += dt;
      if (p.life >= p.maxLife) { p.alive = false; this.positions[ix + 1] = -999; continue; }
      any = true;
      p.vy += p.grav * dt;
      this.positions[ix] += p.vx * dt;
      this.positions[ix + 1] += p.vy * dt;
      this.positions[ix + 2] += p.vz * dt;
      const fade = 1 - p.life / p.maxLife;
      this.colors[ix] = p.r * fade;
      this.colors[ix + 1] = p.g * fade;
      this.colors[ix + 2] = p.b * fade;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.visible = any;
  }
}

// One-shot light flashes (muzzle, explosion) that fade out on their own.
export class FlashLights {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffcc66, 0, 30, 1.8);
      l.visible = false;
      scene.add(l);
      this.pool.push({ light: l, life: 0, max: 0.1 });
    }
  }

  flash(x, y, z, color, intensity, range, dur = 0.09) {
    const f = this.pool.find((q) => q.life <= 0) || this.pool[0];
    f.light.position.set(x, y, z);
    f.light.color.setHex(color);
    f.light.intensity = intensity;
    f.light.distance = range;
    f.light.visible = true;
    f.life = dur; f.max = dur;
  }

  update(dt) {
    for (const f of this.pool) {
      if (f.life <= 0) { f.light.visible = false; continue; }
      f.life -= dt;
      f.light.intensity *= Math.max(0, f.life / f.max);
      if (f.life <= 0) f.light.visible = false;
    }
  }
}

// Sun, sky colour, fog and street lighting driven by the in-game clock.
export class Sky {
  constructor(scene, sunLight, hemiLight) {
    this.scene = scene;
    this.sun = sunLight;
    this.hemi = hemiLight;
    this.skyDome = null;
    const geo = new THREE.SphereGeometry(1400, 24, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x87bfe8, side: THREE.BackSide, fog: false });
    this.skyDome = new THREE.Mesh(geo, mat);
    this.skyDome.frustumCulled = false;
    scene.add(this.skyDome);
    scene.fog = new THREE.Fog(0xcfe4f2, 220, 900);
    this.streetLights = [];
  }

  registerStreetLights(lights) { this.streetLights = lights; }

  // hours: 0..24. Returns true when it is night.
  update(hours, playerPos) {
    const t = ((hours % 24) + 24) % 24;
    const sunAngle = ((t - 6) / 12) * Math.PI; // 06:00 sunrise, 18:00 sunset
    const dayness = clamp(Math.sin(sunAngle), 0, 1);
    const dusk = clamp(1 - Math.abs(t - 18.2) / 1.6, 0, 1) + clamp(1 - Math.abs(t - 6.1) / 1.2, 0, 1);
    const night = 1 - clamp(dayness * 1.4 + dusk * 0.4, 0, 1);

    const skyDay = new THREE.Color(0x7fb8e8);
    const skyDusk = new THREE.Color(0xf2a05c);
    const skyNight = new THREE.Color(0x0d1526);
    const sky = skyDay.clone().lerp(skyDusk, clamp(dusk, 0, 1) * 0.8).lerp(skyNight, night);
    this.skyDome.material.color.copy(sky);
    this.scene.fog.color.copy(sky).lerp(new THREE.Color(0xffffff), 0.15 * dayness);
    this.scene.background = null;

    const sunEl = Math.sin(sunAngle);
    const sunAz = Math.cos(sunAngle) * 0.9 + 0.25;
    const sunPos = new THREE.Vector3(sunAz * 300, Math.max(25, sunEl * 320), 180);
    this.sun.position.copy(playerPos).add(sunPos);
    this.sun.target.position.copy(playerPos);
    this.sun.target.updateMatrixWorld();
    const warm = new THREE.Color(0xffd9a0).lerp(new THREE.Color(0xff8f4d), clamp(dusk, 0, 1));
    this.sun.color.copy(warm).lerp(new THREE.Color(0x9db8e8), night);
    this.sun.intensity = 0.25 + dayness * 2.1;
    this.hemi.intensity = 0.35 + dayness * 0.55;
    this.hemi.color.setHex(night > 0.5 ? 0x2a3a5c : 0xbfd9ff);
    this.hemi.groundColor.setHex(night > 0.5 ? 0x1a2028 : 0x8a7a5a);

    const lampsOn = night > 0.35;
    for (const l of this.streetLights) {
      if (l.head) l.head.material.emissiveIntensity = lampsOn ? 2.2 : 0.05;
      if (l.glow) l.glow.visible = lampsOn;
    }
    return night > 0.5;
  }
}

// Camera kick for explosions, crashes and hard landings.
export class Shake {
  constructor() { this.amount = 0; }
  add(a) { this.amount = Math.min(1.4, this.amount + a); }
  update(dt) { this.amount = Math.max(0, this.amount - dt * 1.8); }
  offset(out) {
    if (this.amount <= 0.001) { out.set(0, 0, 0); return out; }
    const a = this.amount;
    out.set((Math.random() - 0.5) * a * 0.5, (Math.random() - 0.5) * a * 0.4, 0);
    return out;
  }
}
