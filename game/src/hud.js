// The HUD: cash, health, ammo, wanted stars, speed, the mission
// objective with distance and timer, toasts, and a live minimap drawn
// on a small canvas — roads, blocks, ocean, the player arrow, cars,
// police and the mission beacon.
import { ROAD_LINES, BLOCK_CENTERS, HALF } from './city.js';

export class Hud {
  constructor(G) {
    this.G = G;
    this.el = (id) => document.getElementById(id);
    this.cashEl = this.el('hudCash');
    this.healthEl = this.el('hudHealthFill');
    this.healthText = this.el('hudHealthText');
    this.ammoEl = this.el('hudAmmo');
    this.starsEl = this.el('hudStars');
    this.speedEl = this.el('hudSpeed');
    this.objectiveEl = this.el('hudObjective');
    this.objectiveDist = this.el('hudObjectiveDist');
    this.timerEl = this.el('hudTimer');
    this.toastEl = this.el('hudToast');
    this.damageEl = this.el('damageFlash');
    this.minimap = this.el('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.crosshair = this.el('crosshair');
    this.menu = this.el('menu');
    this.deadEl = this.el('deadScreen');
    this.deadText = this.el('deadText');
    this.toasts = [];
    this.shakeAmount = 0;
  }

  toast(text, ms = 4200) {
    if (this.G.quiet) return;
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.toastEl.appendChild(div);
    this.toasts.push(div);
    setTimeout(() => {
      div.classList.add('fade');
      setTimeout(() => div.remove(), 600);
    }, ms);
    while (this.toastEl.children.length > 4) this.toastEl.firstChild.remove();
  }

  flashDamage() {
    this.damageEl.classList.add('hit');
    setTimeout(() => this.damageEl.classList.remove('hit'), 180);
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  showMenu() {
    this.menu.classList.add('show');
  }

  hideMenu() {
    this.menu.classList.remove('show');
  }

  showDead(from) {
    this.deadText.textContent = `WASTED — taken down by ${from || 'the streets of Solmar'}`;
    this.deadEl.classList.add('show');
  }

  hideDead() {
    this.deadEl.classList.remove('show');
  }

  update(dt) {
    const G = this.G;
    this.cashEl.textContent = `$${G.cash.toLocaleString('en-US')}`;
    const hp = Math.max(0, Math.round(G.player.health));
    this.healthEl.style.width = `${hp}%`;
    this.healthEl.style.background = hp > 50 ? '#2ecc40' : hp > 25 ? '#ff9f1a' : '#e63946';
    this.healthText.textContent = `${hp}`;
    this.ammoEl.textContent = G.combat.reloadTimer > 0 ? 'RELOADING…' : `AMMO ${G.combat.ammo} / ${G.combat.magSize}`;
    const stars = '★'.repeat(G.police.wanted) + '☆'.repeat(5 - G.police.wanted);
    this.starsEl.textContent = stars;
    this.starsEl.classList.toggle('hot', G.police.wanted >= 3);
    const speed = G.player.inCar && G.vehicles.playerCar
      ? Math.abs(G.vehicles.playerCar.speed) * 3.6
      : Math.abs(G.player.speed) * 3.6;
    this.speedEl.textContent = `${Math.round(speed)} km/h`;
    this.speedEl.style.display = G.player.inCar ? 'block' : 'none';
    // Objective line.
    const step = G.missions.currentStep;
    if (step) {
      this.objectiveEl.textContent = `${G.missions.mission.title}: ${step.label}`;
      if (step.x !== undefined) {
        const p = G.playerPos();
        const d = Math.hypot(p.x - step.x, p.z - step.z);
        this.objectiveDist.textContent = `${Math.round(d)} m`;
      } else {
        this.objectiveDist.textContent = '';
      }
    } else if (G.missions.completed >= G.missions.defs.length) {
      this.objectiveEl.textContent = 'Solmar is yours — free roam. Press M for the next mission.';
      this.objectiveDist.textContent = '';
    } else {
      this.objectiveEl.textContent = 'Free roam — press M to start the next mission.';
      this.objectiveDist.textContent = '';
    }
    if (G.missions.missionTimer > 0) {
      const t = Math.max(0, Math.ceil(G.missions.missionTimer));
      this.timerEl.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      this.timerEl.style.display = 'block';
    } else {
      this.timerEl.style.display = 'none';
    }
    this.crosshair.style.display = (!G.player.inCar && G.state === 'playing') ? 'block' : 'none';
    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 1.5);
      const s = this.shakeAmount * 8;
      document.getElementById('game').style.transform =
        `translate(${(Math.random() - 0.5) * s}px, ${(Math.random() - 0.5) * s}px)`;
    } else {
      document.getElementById('game').style.transform = '';
    }
    this.drawMinimap();
  }

  drawMinimap() {
    const G = this.G;
    const ctx = this.mapCtx;
    const S = 200;
    const scale = S / (HALF * 2 + 120);
    const toMap = (x, z) => [(x + HALF + 60) * scale, (z + HALF + 60) * scale];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#20262b';
    ctx.fillRect(0, 0, S, S);
    // Ocean to the south and east.
    ctx.fillStyle = '#2f7fb0';
    const [, oceanY] = toMap(0, 252);
    ctx.fillRect(0, oceanY, S, S - oceanY);
    const [eastX] = toMap(252, 0);
    ctx.fillRect(eastX, 0, S - eastX, S);
    // Blocks.
    ctx.fillStyle = '#5a6068';
    for (const bx of BLOCK_CENTERS) {
      for (const bz of BLOCK_CENTERS) {
        const [mx, mz] = toMap(bx - 20, bz - 20);
        ctx.fillRect(mx, mz, 40 * scale, 40 * scale);
      }
    }
    // Roads.
    ctx.strokeStyle = '#8a929a';
    ctx.lineWidth = 1.5;
    for (const line of ROAD_LINES) {
      const [x1, y1] = toMap(line, -HALF);
      const [x2, y2] = toMap(line, HALF);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(-HALF, line);
      const [x4, y4] = toMap(HALF, line);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // Mission beacon.
    const step = G.missions.currentStep;
    if (step && step.x !== undefined) {
      const [mx, mz] = toMap(step.x, step.z);
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(mx, mz, 5 + Math.sin(G.time * 4) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.beginPath(); ctx.arc(mx, mz, 9, 0, Math.PI * 2); ctx.stroke();
    }
    // Traffic cars as pale dots, police as flashing red/blue.
    for (const car of G.vehicles.cars) {
      if (car.driver === 'player') continue;
      const [mx, mz] = toMap(car.pos.x, car.pos.z);
      if (car.isPolice) {
        ctx.fillStyle = Math.sin(G.time * 8) > 0 ? '#ff2222' : '#2244ff';
        ctx.fillRect(mx - 3, mz - 3, 6, 6);
      } else {
        ctx.fillStyle = '#c8ccd0';
        ctx.fillRect(mx - 2, mz - 2, 4, 4);
      }
    }
    // Player arrow.
    const p = G.playerPos();
    const [px, pz] = toMap(p.x, p.z);
    const heading = G.player.inCar && G.vehicles.playerCar
      ? G.vehicles.playerCar.heading
      : G.player.heading;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)) * -1 + Math.PI);
    ctx.fillStyle = '#2ecc40';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
