// hud.js — everything the player reads: health, wanted stars, cash, the
// minimap, mission text, toasts, and every menu from the title screen to
// the gun shop. All DOM; the 3D world never touches it directly.
import { formatMoney, formatClock, clamp } from './utils.js';

export class Hud {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = {};
    for (const id of ['hud', 'healthFill', 'armorFill', 'healthNum', 'money', 'stars', 'weapon', 'ammo',
      'speed', 'clock', 'radio', 'objective', 'objTitle', 'objText', 'toast', 'toastTitle', 'toastText',
      'minimap', 'crosshair', 'interact', 'menu', 'menuTitle', 'menuBody', 'menuList',
      'damage', 'center', 'centerTitle', 'centerText', 'centerHint', 'help', 'fps']) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.damageFlash = 0;
    this.onMenuAction = null;
    this.el.menuList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-idx]');
      if (btn && this.onMenuAction) this.onMenuAction(Number(btn.dataset.idx));
    });
  }

  showHud(on) { this.el.hud.style.display = on ? 'block' : 'none'; }

  toast(title, text, dur = 4) {
    this.el.toastTitle.textContent = title;
    this.el.toastText.textContent = text || '';
    this.el.toast.style.opacity = '1';
    this.toastTimer = dur;
  }

  center(title, text, hint) {
    this.el.centerTitle.textContent = title;
    this.el.centerText.textContent = text || '';
    this.el.centerHint.textContent = hint || '';
    this.el.center.style.display = 'flex';
  }

  hideCenter() { this.el.center.style.display = 'none'; }

  showMenu(title, bodyHtml, items, onAction) {
    this.el.menuTitle.textContent = title;
    this.el.menuBody.innerHTML = bodyHtml || '';
    this.el.menuList.innerHTML = items.map((it, i) =>
      '<button data-idx="' + i + '">' + it + '</button>').join('');
    this.el.menu.style.display = 'flex';
    this.onMenuAction = onAction;
  }

  hideMenu() { this.el.menu.style.display = 'none'; this.onMenuAction = null; }

  showHelp(on) { this.el.help.style.display = on ? 'block' : 'none'; }

  interact(text) {
    if (!text) { this.el.interact.style.display = 'none'; return; }
    this.el.interact.textContent = text;
    this.el.interact.style.display = 'block';
  }

  damage() { this.damageFlash = 0.55; }

  update(dt, S) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.opacity = '0';
    }
    if (this.damageFlash > 0) {
      this.damageFlash -= dt;
      this.el.damage.style.opacity = String(clamp(this.damageFlash, 0, 0.55));
    } else this.el.damage.style.opacity = '0';
    this.el.healthFill.style.width = clamp(S.health, 0, 100) + '%';
    this.el.armorFill.style.width = clamp(S.armor, 0, 100) + '%';
    this.el.healthNum.textContent = Math.ceil(S.health);
    this.el.money.textContent = formatMoney(S.money);
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < S.wanted.stars ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.className = S.wanted.stars > 0 ? 'hot' : '';
    const wname = { fists: 'Fists', pistol: 'P9 Pistol', smg: 'VK-9 SMG', shotgun: 'S12 Scattergun' }[S.weapon] || S.weapon;
    this.el.weapon.textContent = wname;
    this.el.ammo.textContent = S.weapon === 'fists' ? '—' : (S.ammo[S.weapon] + ' / ∞');
    const kmh = S.car ? Math.round(Math.abs(S.car.speed) * 3.6) : Math.round(S.player.speed * 3.6);
    this.el.speed.textContent = kmh + ' km/h';
    this.el.clock.textContent = formatClock(S.time);
    this.el.radio.textContent = this.ctx.audio.stationName();
    this.el.crosshair.style.display = (S.mode === 'playing' && S.weapon !== 'fists') ? 'block' : 'none';
    const label = this.ctx.missions.label(S);
    if (label) {
      this.el.objective.style.display = 'block';
      this.el.objTitle.textContent = label.title;
      this.el.objText.textContent = label.text;
    } else if (this.ctx.missions.nextMission(S)) {
      this.el.objective.style.display = 'block';
      this.el.objTitle.textContent = 'Free Roam';
      this.el.objText.textContent = 'Press M for the next job: ' + this.ctx.missions.nextMission(S).title + ' — or explore Solmar Bay.';
    } else {
      this.el.objective.style.display = 'block';
      this.el.objTitle.textContent = 'King of Solmar';
      this.el.objText.textContent = 'Every job is done. The city is yours, Dante.';
    }
  }

  // Top-down map: roads, water, districts, and every blip that matters.
  drawMinimap(S, city) {
    const c = this.mapCtx;
    const W = 220, H = 220;
    const b = city.bounds;
    const sx = (x) => ((x - b.minX) / (b.maxX - b.minX)) * W;
    const sy = (z) => ((z - b.minZ) / (b.maxZ - b.minZ)) * H;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#0e1a24';
    c.fillRect(0, 0, W, H);
    // Ocean + beach.
    c.fillStyle = '#1e7fa8';
    c.fillRect(0, 0, sx(-640), H);
    c.fillStyle = '#e0c48f';
    c.fillRect(sx(-640), 0, sx(-520) - sx(-640), H);
    // Blocks.
    c.fillStyle = '#2a323c';
    for (let col = 0; col < 12; col++) {
      for (let row = 0; row < 10; row++) {
        const x0 = sx(-480 + col * 80 + 8), z0 = sy(-400 + row * 80 + 8);
        c.fillRect(x0, z0, sx(80) - sx(0) - 4, sy(80) - sy(0) - 4);
      }
    }
    // Roads.
    c.strokeStyle = '#5a636e';
    c.lineWidth = 2;
    for (const x of [-480, -400, -320, -240, -160, -80, 0, 80, 160, 240, 320, 400, 480]) {
      c.beginPath(); c.moveTo(sx(x), 0); c.lineTo(sx(x), H); c.stroke();
    }
    for (const z of [-400, -320, -240, -160, -80, 0, 80, 160, 240, 320, 400]) {
      c.beginPath(); c.moveTo(0, sy(z)); c.lineTo(W, sy(z)); c.stroke();
    }
    const blip = (x, z, color, r = 4) => {
      c.fillStyle = color;
      c.beginPath(); c.arc(sx(x), sy(z), r, 0, 7); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke();
    };
    // Shops.
    for (const s of Object.values(city.shops)) {
      const col = s.kind === 'gun' ? '#ff8844' : s.kind === 'diner' ? '#44dd88' : s.kind === 'spray' ? '#ff44aa' : s.kind === 'garage' ? '#ffcc00' : '#aa66ff';
      blip(s.x, s.z, col, 3.5);
    }
    // Mission target.
    const tp = this.ctx.missions.targetPos(S);
    if (tp) {
      const pulse = 5 + Math.sin(performance.now() / 180) * 2;
      blip(tp.x, tp.z, '#ffe14d', pulse);
    }
    // Police.
    for (const cr of this.ctx.police.cruisers) blip(cr.x, cr.z, '#4488ff', 3);
    for (const cp of this.ctx.police.cops) blip(cp.x, cp.z, '#88bbff', 2.5);
    if (this.ctx.police.heli) blip(this.ctx.police.heli.x, this.ctx.police.heli.z, '#ff4444', 5);
    // Player arrow.
    const px = sx(S.player.x), pz = sy(S.player.z);
    c.save();
    c.translate(px, pz);
    c.rotate(Math.atan2(Math.sin(S.player.heading), Math.cos(S.player.heading)) * -1 + Math.PI);
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath(); c.fill();
    c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke();
    c.restore();
    // North tick.
    c.fillStyle = '#fff';
    c.font = 'bold 11px sans-serif';
    c.fillText('N', W - 14, 14);
  }
}
