// Jax's story: five missions that chain one into the next, each with
// steps the HUD and the minimap can point at. A step is a small object:
// { type, x, z, label, timer?, target?, count? }. The beacon is a light
// pillar plus a floating diamond over the current target.
import * as THREE from 'three';

const MISSION_DEFS = [
  {
    id: 1,
    title: 'Borrowed Wheels',
    giver: 'Mara Voss',
    blurb: 'Mara needs wheels for the crew. Take any car on the street and bring it to the garage.',
    reward: 300,
    steps: [
      { type: 'steal', label: 'Steal a car (walk up to one and press E)' },
      { type: 'goto', at: 'garage', label: 'Drive the car to the garage' },
    ],
  },
  {
    id: 2,
    title: 'Three Drops',
    giver: 'Mara Voss',
    blurb: 'Three packages, three corners of Solmar, one very impatient clock. 150 seconds.',
    reward: 500,
    timer: 150,
    steps: [
      { type: 'goto', at: 'tower', label: 'Drop 1: Solmar Tower plaza' },
      { type: 'goto', at: 'beach', label: 'Drop 2: the boardwalk' },
      { type: 'goto', at: 'marina', label: 'Drop 3: the marina docks' },
    ],
  },
  {
    id: 3,
    title: 'Hot Pursuit',
    giver: 'Jax Marlowe',
    blurb: 'The crew needs the cops busy elsewhere. Make some noise, hit three stars, then vanish.',
    reward: 600,
    steps: [
      { type: 'reach', wanted: 3, label: 'Raise your wanted level to 3 stars' },
      { type: 'escape', label: 'Lose the cops — get back to 0 stars' },
    ],
  },
  {
    id: 4,
    title: "Mara's Ride",
    giver: 'Mara Voss',
    blurb: "Rival crew the Tidebreakers are cruising my turf. Wreck all three of their cars.",
    reward: 800,
    steps: [
      { type: 'wreck', count: 3, label: 'Wreck the Tidebreaker cars (ram or shoot them)' },
    ],
  },
  {
    id: 5,
    title: 'The Solmar Job',
    giver: 'Mara Voss',
    blurb: 'The Grand keeps its weekend take in the back room. Grab it, then get to the safehouse alive.',
    reward: 1500,
    steps: [
      { type: 'goto', at: 'casino', label: 'Get to the Solmar Grand casino' },
      { type: 'grab', at: 'casino', hold: 3, label: 'Grab the cash (stay in the marker)' },
      { type: 'escape', at: 'safehouse', wanted: 4, label: 'Escape to the safehouse at 4 stars' },
    ],
  },
];

export class Missions {
  constructor(G) {
    this.G = G;
    this.defs = MISSION_DEFS;
    this.completed = 0; // number of missions finished
    this.active = false;
    this.mission = null;
    this.step = 0;
    this.missionTimer = 0;
    this.grabHold = 0;
    this.nextTimer = 0;
    this.rivals = [];
    this.beacon = this.buildBeacon();
    G.scene.add(this.beacon);
    this.beacon.visible = false;
  }

  get currentStep() {
    if (!this.active || !this.mission) return null;
    const raw = this.mission.steps[this.step];
    if (!raw) return null;
    const step = { ...raw, index: this.step };
    if (raw.at) {
      const lm = this.G.city.approach[raw.at] ?? this.G.city.landmarks[raw.at];
      step.x = lm.x;
      step.z = lm.z;
    }
    if (raw.type === 'wreck') {
      const alive = this.rivals.filter((c) => !c.wrecked);
      if (alive.length) { step.x = alive[0].pos.x; step.z = alive[0].pos.z; }
    }
    return step;
  }

  buildBeacon() {
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    pillar.position.y = 30;
    g.add(pillar);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshBasicMaterial({ color: 0xffd700 }),
    );
    diamond.position.y = 12;
    diamond.name = 'diamond';
    g.add(diamond);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    g.add(ring);
    return g;
  }

  startMission(index) {
    const G = this.G;
    const def = this.defs[index];
    if (!def) return false;
    this.mission = def;
    this.step = 0;
    this.active = true;
    this.missionTimer = def.timer ?? 0;
    this.grabHold = 0;
    this.rivals = [];
    if (def.id === 4) this.spawnRivals();
    G.hud.toast(`Mission: ${def.title} — ${def.giver}`);
    G.hud.toast(def.blurb);
    G.audio.jingle();
    return true;
  }

  startNext() {
    if (this.completed >= this.defs.length) {
      this.G.hud.toast('Every mission complete — Solmar is yours, Jax.');
      return false;
    }
    return this.startMission(this.completed);
  }

  spawnRivals() {
    const G = this.G;
    const p = G.playerPos();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const x = p.x + Math.sin(a) * 34;
      const z = p.z + Math.cos(a) * 34;
      const car = G.vehicles.spawnCar(x, z, a, {
        driver: 'rival',
        rival: true,
        color: 0x1a1a1a,
        name: 'Tidebreaker',
        health: 120,
        maxSpeed: 24,
      });
      this.rivals.push(car);
      G.combat.spawnRivalGunman(car);
    }
    G.hud.toast('Tidebreaker cars incoming — wreck them all!');
  }

  onEnterCar(car) {
    if (!this.active) return;
    const step = this.currentStep;
    if (step && step.type === 'steal') this.completeStep();
  }

  completeStep() {
    const G = this.G;
    this.step++;
    this.grabHold = 0;
    G.audio.pickup();
    if (this.step >= this.mission.steps.length) this.completeMission();
    else G.hud.toast(this.currentStep.label);
  }

  completeMission() {
    const G = this.G;
    const reward = this.mission.reward;
    G.cash += reward;
    G.hud.toast(`Mission complete: ${this.mission.title} — +$${reward}`);
    G.audio.jingle();
    this.completed++;
    this.active = false;
    this.mission = null;
    this.beacon.visible = false;
    if (this.completed < this.defs.length) {
      G.hud.toast('Next mission starting soon — press M to skip the wait.');
      this.nextTimer = 6;
    }
    if (G.save) G.save.save();
  }

  failMission(reason) {
    const G = this.G;
    G.hud.toast(`Mission failed: ${reason} — press M to retry.`);
    this.active = false;
    this.mission = null;
    this.beacon.visible = false;
    for (const car of this.rivals) {
      if (!car.wrecked) G.vehicles.removeCar(car);
    }
    this.rivals = [];
  }

  retry() {
    if (this.active) return;
    if (this.completed < this.defs.length) this.startMission(this.completed);
  }

  update(dt) {
    const G = this.G;
    if (!this.active && this.completed < this.defs.length && this.nextTimer > 0) {
      this.nextTimer -= dt;
      if (this.nextTimer <= 0) this.startNext();
    }
    if (!this.active || !this.mission) {
      this.beacon.visible = false;
      return;
    }
    // Mission clock.
    if (this.missionTimer > 0) {
      this.missionTimer -= dt;
      if (this.missionTimer <= 0) {
        this.failMission('Out of time');
        return;
      }
    }
    const step = this.currentStep;
    if (!step) return;
    const p = G.playerPos();
    // Beacon follows the current target.
    if (step.x !== undefined) {
      this.beacon.visible = true;
      this.beacon.position.set(step.x, 0, step.z);
      const diamond = this.beacon.getObjectByName('diamond');
      if (diamond) {
        diamond.rotation.y += dt * 2;
        diamond.position.y = 12 + Math.sin(G.time * 2) * 0.8;
      }
    } else {
      this.beacon.visible = false;
    }
    const dist = step.x !== undefined ? Math.hypot(p.x - step.x, p.z - step.z) : 999;
    if (step.type === 'goto' && dist < 8) {
      this.completeStep();
    } else if (step.type === 'reach') {
      if (G.police.wanted >= step.wanted) this.completeStep();
    } else if (step.type === 'escape') {
      if (step.at) {
        // Reaching the safehouse shakes the heat off entirely.
        if (dist < 8) {
          if (G.police.wanted > 0) G.police.clearWanted();
          this.completeStep();
        }
      } else if (G.police.wanted === 0) {
        this.completeStep();
      }
    } else if (step.type === 'grab') {
      if (dist < 8) {
        this.grabHold += dt;
        if (this.grabHold >= (step.hold ?? 3)) {
          G.cash += 400;
          G.police.addWanted(4, 'casino robbery');
          this.completeStep();
        }
      } else {
        this.grabHold = Math.max(0, this.grabHold - dt * 2);
      }
    } else if (step.type === 'wreck') {
      const alive = this.rivals.filter((c) => !c.wrecked);
      if (alive.length === 0) this.completeStep();
      else if (step.x !== undefined) {
        // Rivals flee from the player; the beacon tracks the nearest one.
        for (const car of alive) this.fleeRival(car, dt, p);
      }
    }
  }

  fleeRival(car, dt, p) {
    const G = this.G;
    const dx = car.pos.x - p.x;
    const dz = car.pos.z - p.z;
    const dist = Math.hypot(dx, dz) || 1;
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += Math.max(-2 * dt, Math.min(2 * dt, dh));
    car.speed += Math.max(-14 * dt, Math.min(12 * dt, (dist < 25 ? car.maxSpeed : 8) - car.speed));
    G.vehicles.moveCar(car, dt);
  }
}
