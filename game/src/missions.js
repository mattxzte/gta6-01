// missions.js — the story of Dante Cruz and eight jobs across Solmar Bay.
// A small step interpreter drives each mission: go somewhere, steal a car,
// pick up and drop off passengers, survive the police, or clear a room.
// Missions are data plus a few hooks; the manager runs them.
import { dist2 } from './utils.js';

export const MISSIONS = [
  {
    id: 'm1', title: 'Back in the Saddle', reward: 400,
    briefing: 'Mara needs you at the garage. Get in a car and drive over — the city has not changed, but you have.',
    steps: [
      { type: 'enterCar', label: 'Get in a car' },
      { type: 'goto', label: 'Drive to Mara’s Garage', spot: 'garage', radius: 10 },
    ],
  },
  {
    id: 'm2', title: 'Fare Game', reward: 650,
    briefing: 'Drive the taxi. Three fares, three corners of Solmar — and they all tip if you are quick.',
    steps: [
      { type: 'enterCar', label: 'Take the taxi', carType: 'taxi' },
      { type: 'pickup', label: 'Pick up the fare at the Plaza', spot: 'plaza', radius: 8 },
      { type: 'dropoff', label: 'Drop the fare at the Marina', spot: 'marina', radius: 10, time: 75 },
      { type: 'pickup', label: 'Pick up the fare at the Beach', spot: 'beach', radius: 8 },
      { type: 'dropoff', label: 'Drop the fare at the Hills', spot: 'hills', radius: 10, time: 90 },
      { type: 'pickup', label: 'Pick up the fare at the Tower', spot: 'tower', radius: 8 },
      { type: 'dropoff', label: 'Drop the fare at the Diner', spot: 'diner', radius: 10, time: 75 },
    ],
  },
  {
    id: 'm3', title: 'Hot Wheels', reward: 900,
    briefing: 'A Comet GT is parked at the marina, keys in the sun visor. Bring it to the garage — and do not let the cops see you take it.',
    steps: [
      { type: 'stealCar', label: 'Steal the Comet GT at the Marina', spot: 'marina', carType: 'comet', radius: 12 },
      { type: 'goto', label: 'Deliver it to Mara’s Garage', spot: 'garage', radius: 10, time: 100 },
    ],
  },
  {
    id: 'm4', title: 'Package Run', reward: 1200,
    briefing: 'One package, one hour of heat. The cops are already looking — get it to the port gate before the timer runs out.',
    steps: [
      { type: 'enterCar', label: 'Get in a car' },
      { type: 'goto', label: 'Deliver the package to the Port Gate', spot: 'portGate', radius: 10, time: 95, wanted: 2 },
    ],
  },
  {
    id: 'm5', title: 'Loud and Clear', reward: 1600,
    briefing: 'The Harbor Crew took Mara’s cut. Walk into their warehouse and take it back. Bring a gun — you will need it.',
    steps: [
      { type: 'goto', label: 'Reach the warehouse', spot: 'warehouse', radius: 18 },
      { type: 'kill', label: 'Clear the warehouse crew', count: 5, spot: 'warehouse' },
      { type: 'goto', label: 'Get back to the Garage', spot: 'garage', radius: 10 },
    ],
  },
  {
    id: 'm6', title: 'The Getaway', reward: 2000,
    briefing: 'The job went loud. Four stars, a helicopter, roadblocks on every avenue. Lose them — or at least outrun them to the safehouse.',
    steps: [
      { type: 'enterCar', label: 'Get in a car' },
      { type: 'escape', label: 'Escape to the Safehouse', spot: 'safehouse', radius: 12, wanted: 4 },
    ],
  },
  {
    id: 'm7', title: 'Night Shift', reward: 2400,
    briefing: 'A truck full of cargo needs to cross town at dusk. The checkpoint on Harbor Road is not optional — go through it.',
    steps: [
      { type: 'enterCar', label: 'Take the Hauler', carType: 'truck' },
      { type: 'goto', label: 'Drive through the checkpoint', spot: 'portGate', radius: 12, time: 110, wanted: 3 },
      { type: 'goto', label: 'Deliver the cargo to the Hills', spot: 'hills', radius: 12, time: 100 },
    ],
  },
  {
    id: 'm8', title: 'King of Solmar', reward: 5000,
    briefing: 'The mayor’s limo, the plaza at noon, and every cop in the city. Take the limo, survive the plaza, and drive to the beach a free man.',
    steps: [
      { type: 'stealCar', label: 'Steal the Mayor’s Limo', spot: 'plaza', carType: 'limo', radius: 12 },
      { type: 'kill', label: 'Hold the plaza — clear the mayor’s guards', count: 4, spot: 'plaza' },
      { type: 'escape', label: 'Escape to the Beach', spot: 'beach', radius: 14, wanted: 5 },
    ],
  },
];

export class MissionManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = null; // { def, stepIdx, timer, kills, passenger, targetCar }
    this.beacon = null;
  }

  available(S) {
    return MISSIONS.filter((m) => !S.missionsDone.includes(m.id));
  }

  nextMission(S) {
    return MISSIONS.find((m) => !S.missionsDone.includes(m.id)) || null;
  }

  start(S, def) {
    this.active = {
      def, stepIdx: 0, timer: 0, kills: 0, passenger: false,
      targetCar: null, failed: false, done: false,
    };
    this.ctx.hud.toast('MISSION: ' + def.title, def.briefing);
    this.ctx.audio.jingle(true);
    this.setupStep(S);
  }

  currentStep() {
    if (!this.active) return null;
    return this.active.def.steps[this.active.stepIdx] || null;
  }

  targetPos(S) {
    const step = this.currentStep();
    if (!step) return null;
    if (step.spot) {
      const spot = this.ctx.city.spots[step.spot] || this.ctx.city.shops[step.spot];
      if (spot) return { x: spot.x, z: spot.z };
    }
    if (this.active.targetCar) return { x: this.active.targetCar.x, z: this.active.targetCar.z };
    return null;
  }

  // Pick a point near (cx,cz) that is not inside any building collider,
  // so spawned enemies are always out in the open and shootable.
  findOpenSpot(cx, cz, spread) {
    const colliders = this.ctx.city.colliders;
    for (let tries = 0; tries < 14; tries++) {
      const x = cx + (Math.random() * 2 - 1) * spread;
      const z = cz + (Math.random() * 2 - 1) * spread;
      let inside = false;
      for (const b of colliders) {
        if (x > b.minX - 1.5 && x < b.maxX + 1.5 && z > b.minZ - 1.5 && z < b.maxZ + 1.5) { inside = true; break; }
      }
      if (!inside) return { x, z };
    }
    return { x: cx, z: cz - spread - 6 };
  }

  setupStep(S) {
    const step = this.currentStep();
    if (!step) return;
    const A = this.active;
    A.timer = step.time || 0;
    if (step.wanted !== undefined) {
      S.wanted.heat = Math.max(S.wanted.heat, [0, 25, 55, 95, 145, 200][step.wanted]);
      S.wanted.recalc();
      S.wanted.lastCrime = S.now;
    }
    if (step.type === 'stealCar' && step.spot) {
      const spot = this.ctx.city.spots[step.spot];
      A.targetCar = this.ctx.spawnMissionCar(step.carType, spot.x, spot.z);
    }
    if (step.type === 'kill' && step.spot) {
      const spot = this.ctx.city.spots[step.spot];
      this.ctx.combat.clearEnemies(this.ctx.scene);
      for (let i = 0; i < step.count; i++) {
        const p = this.findOpenSpot(spot.x, spot.z, 18);
        this.ctx.combat.spawnEnemy(this.ctx.scene, p.x, p.z, 'harbor');
      }
      A.kills = 0;
    }
    if (step.type === 'enterCar' && step.carType) {
      const spot = this.ctx.city.spots.start;
      this.ctx.spawnMissionCar(step.carType, spot.x + 12, spot.z + 6);
    }
  }

  advance(S) {
    const A = this.active;
    A.stepIdx++;
    this.ctx.audio.pickup();
    if (A.stepIdx >= A.def.steps.length) this.complete(S);
    else this.setupStep(S);
  }

  complete(S) {
    const A = this.active;
    S.money += A.def.reward;
    S.missionsDone.push(A.def.id);
    this.ctx.hud.toast('MISSION COMPLETE', A.def.title + ' — +' + A.def.reward);
    this.ctx.audio.jingle(true);
    this.ctx.economy.save(S);
    this.active = null;
    this.ctx.combat.clearEnemies(this.ctx.scene);
    S.missionEnd = { win: true, title: A.def.title, reward: A.def.reward };
  }

  fail(S, reason) {
    const A = this.active;
    this.ctx.hud.toast('MISSION FAILED', reason);
    this.ctx.audio.jingle(false);
    this.active = null;
    this.ctx.combat.clearEnemies(this.ctx.scene);
    S.missionEnd = { win: false, title: A ? A.def.title : '', reason };
  }

  abort(S) {
    if (!this.active) return;
    this.ctx.combat.clearEnemies(this.ctx.scene);
    this.active = null;
  }

  update(dt, S) {
    const A = this.active;
    if (!A) return;
    const step = this.currentStep();
    if (!step) return;
    if (A.timer > 0) {
      A.timer -= dt;
      if (A.timer <= 0) { this.fail(S, 'Out of time.'); return; }
    }
    const px = S.player.x, pz = S.player.z;
    const car = S.car;
    switch (step.type) {
      case 'enterCar':
        if (car) {
          if (step.carType && car.typeKey !== step.carType) break;
          this.advance(S);
        }
        break;
      case 'goto': {
        const spot = this.ctx.city.spots[step.spot] || this.ctx.city.shops[step.spot];
        if (spot && dist2(px, pz, spot.x, spot.z) < step.radius) this.advance(S);
        break;
      }
      case 'stealCar':
        if (car && A.targetCar && car === A.targetCar) this.advance(S);
        break;
      case 'pickup': {
        const spot = this.ctx.city.spots[step.spot];
        if (car && spot && dist2(px, pz, spot.x, spot.z) < step.radius) {
          A.passenger = true;
          this.ctx.hud.toast('FARE ABOARD', 'Drive carefully — they tip for speed, not for dents.');
          this.advance(S);
        }
        break;
      }
      case 'dropoff': {
        const spot = this.ctx.city.spots[step.spot];
        if (A.passenger && car && spot && dist2(px, pz, spot.x, spot.z) < step.radius) {
          A.passenger = false;
          S.money += 120;
          this.ctx.hud.toast('FARE PAID', '+$120 tip in the meter.');
          this.advance(S);
        }
        break;
      }
      case 'kill': {
        const dead = this.ctx.combat.enemies.filter((e) => e.dead).length;
        if (dead >= step.count) this.advance(S);
        break;
      }
      case 'escape': {
        const spot = this.ctx.city.spots[step.spot];
        if (spot && dist2(px, pz, spot.x, spot.z) < step.radius) this.advance(S);
        break;
      }
      default:
        break;
    }
  }

  label(S) {
    const step = this.currentStep();
    if (!step) return null;
    let text = step.label;
    if (step.type === 'kill') {
      const dead = this.ctx.combat.enemies.filter((e) => e.dead).length;
      text += '  (' + dead + '/' + step.count + ')';
    }
    if (this.active.timer > 0) text += '  — ' + Math.ceil(this.active.timer) + 's';
    return { title: this.active.def.title, text };
  }
}
