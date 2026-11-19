// economy.js — money, shops, the garage and the safehouse.
// Solmar Bay runs on cash: fares and missions pay, guns and paint cost,
// and the safehouse is where a long day gets saved.
import { loadSave, writeSave, clearSave, formatMoney } from './utils.js';

export const SHOP_ITEMS = {
  gun: [
    { id: 'pistol_ammo', name: 'P9 ammo (24)', price: 120, apply: (S) => { S.ammo.pistol += 24; } },
    { id: 'smg', name: 'VK-9 SMG', price: 900, apply: (S) => { S.owned.smg = true; S.ammo.smg += 64; } },
    { id: 'smg_ammo', name: 'SMG ammo (64)', price: 240, apply: (S) => { S.ammo.smg += 64; } },
    { id: 'shotgun', name: 'S12 Scattergun', price: 1400, apply: (S) => { S.owned.shotgun = true; S.ammo.shotgun += 12; } },
    { id: 'shotgun_ammo', name: 'Shells (12)', price: 160, apply: (S) => { S.ammo.shotgun += 12; } },
    { id: 'armor', name: 'Body armor (50)', price: 350, apply: (S) => { S.armor = Math.min(100, S.armor + 50); } },
  ],
  diner: [
    { id: 'meal', name: 'Full meal — heal to 100', price: 40, apply: (S) => { S.health = 100; } },
    { id: 'coffee', name: 'Coffee — heal 30', price: 12, apply: (S) => { S.health = Math.min(100, S.health + 30); } },
  ],
  spray: [
    { id: 'repaint', name: 'Respray + lose the heat', price: 150, apply: (S) => { S.wanted.clear(); if (S.car) S.car.colorHex = 0x2a6a8a; } },
  ],
};

export class Economy {
  constructor(ctx) {
    this.ctx = ctx;
  }

  newGameState() {
    return {
      money: 500,
      health: 100,
      armor: 0,
      wanted: null, // set by main (Wanted instance)
      weapon: 'pistol',
      owned: { pistol: true, smg: false, shotgun: false },
      ammo: { pistol: 48, smg: 0, shotgun: 0 },
      missionsDone: [],
      garage: [],
      upgrades: {},
      stats: { carsStolen: 0, fares: 0, kills: 0, busted: 0, wasted: 0 },
      radioStation: 0,
      now: 0,
    };
  }

  save(S) {
    const data = {
      money: S.money, health: S.health, armor: S.armor,
      weapon: S.weapon, owned: S.owned, ammo: S.ammo,
      missionsDone: S.missionsDone, garage: S.garage, upgrades: S.upgrades,
      stats: S.stats, radioStation: S.radioStation,
      player: { x: S.player.x, z: S.player.z },
      time: S.time,
    };
    return writeSave(data);
  }

  load(S) {
    const d = loadSave();
    if (!d) return false;
    S.money = d.money ?? 500;
    S.health = d.health ?? 100;
    S.armor = d.armor ?? 0;
    S.weapon = d.weapon || 'pistol';
    S.owned = d.owned || { pistol: true, smg: false, shotgun: false };
    S.ammo = d.ammo || { pistol: 48, smg: 0, shotgun: 0 };
    S.missionsDone = d.missionsDone || [];
    S.garage = d.garage || [];
    S.upgrades = d.upgrades || {};
    S.stats = d.stats || { carsStolen: 0, fares: 0, kills: 0, busted: 0, wasted: 0 };
    S.radioStation = d.radioStation || 0;
    if (d.player) S.player.teleport(d.player.x, d.player.z);
    if (d.time !== undefined) S.time = d.time;
    return true;
  }

  hasSave() { return !!loadSave(); }

  wipe() { clearSave(); }

  buy(S, item) {
    if (S.money < item.price) {
      this.ctx.hud.toast('NOT ENOUGH CASH', 'You need ' + formatMoney(item.price) + '.');
      return false;
    }
    S.money -= item.price;
    item.apply(S);
    this.ctx.audio.pickup();
    this.ctx.hud.toast('BOUGHT', item.name + ' — ' + formatMoney(item.price));
    return true;
  }

  // Store the player's current car in the garage (max 4).
  storeCar(S) {
    const car = S.car;
    if (!car) return false;
    if (S.garage.length >= 4) {
      this.ctx.hud.toast('GARAGE FULL', 'Sell or remove a car first.');
      return false;
    }
    S.garage.push({ type: car.typeKey, color: car.colorHex, health: car.health });
    this.ctx.hud.toast('GARAGE', car.type.name + ' stored. (' + S.garage.length + '/4)');
    return true;
  }

  upgradeCost(kind, level) {
    return kind === 'engine' ? 800 * (level + 1) : 600 * (level + 1);
  }

  buyUpgrade(S, kind) {
    if (!S.car) return false;
    const key = S.car.typeKey;
    const lvl = (S.upgrades[key] && S.upgrades[key][kind]) || 0;
    if (lvl >= 3) { this.ctx.hud.toast('MAXED OUT', 'This car is already fully upgraded.'); return false; }
    const cost = this.upgradeCost(kind, lvl);
    if (S.money < cost) { this.ctx.hud.toast('NOT ENOUGH CASH', 'Upgrade costs ' + formatMoney(cost) + '.'); return false; }
    S.money -= cost;
    S.upgrades[key] = S.upgrades[key] || {};
    S.upgrades[key][kind] = lvl + 1;
    if (kind === 'engine') S.car.type = { ...S.car.type, top: S.car.type.top + 5, accel: S.car.type.accel + 3 };
    this.ctx.hud.toast('UPGRADED', kind + ' level ' + (lvl + 1) + ' — ' + formatMoney(cost));
    return true;
  }

  // What the shop menu shows for a kind, given the state.
  shopList(kind, S) {
    if (kind === 'garage') {
      const items = [];
      if (S.car) items.push({ id: 'store', name: 'Store this ' + S.car.type.name + ' in the garage', price: 0, apply: () => this.storeCar(S) });
      if (S.car) {
        items.push({ id: 'eng', name: 'Engine tune-up', price: this.upgradeCost('engine', (S.upgrades[S.car.typeKey] || {}).engine || 0), apply: () => this.buyUpgrade(S, 'engine') });
        items.push({ id: 'arm', name: 'Armor plating', price: this.upgradeCost('armor', (S.upgrades[S.car.typeKey] || {}).armor || 0), apply: () => this.buyUpgrade(S, 'armor') });
      }
      for (let i = 0; i < S.garage.length; i++) {
        const g = S.garage[i];
        items.push({
          id: 'take' + i, name: 'Take out ' + g.type + ' from the garage', price: 0,
          apply: () => {
            const taken = S.garage.splice(i, 1)[0];
            this.ctx.spawnGarageCar(taken);
            this.ctx.hud.toast('GARAGE', 'Your ' + taken.type + ' is waiting outside.');
          },
        });
      }
      if (!items.length) items.push({ id: 'none', name: 'Garage is empty — bring a car', price: 0, apply: () => {} });
      return items;
    }
    if (kind === 'safehouse') {
      return [
        { id: 'save', name: 'Save game', price: 0, apply: () => { this.save(S); S.health = 100; this.ctx.hud.toast('SAVED', 'Progress saved. Health restored.'); } },
        { id: 'sleep', name: 'Sleep until morning', price: 0, apply: () => { S.time = 8; S.health = 100; this.save(S); this.ctx.hud.toast('MORNING', 'A new day in Solmar Bay.'); } },
      ];
    }
    const list = (SHOP_ITEMS[kind] || []).slice();
    if (kind === 'gun') {
      return list.filter((it) => {
        if (it.id === 'smg' && S.owned.smg) return false;
        if (it.id === 'shotgun' && S.owned.shotgun) return false;
        if (it.id === 'smg_ammo' && !S.owned.smg) return false;
        if (it.id === 'shotgun_ammo' && !S.owned.shotgun) return false;
        return true;
      });
    }
    return list;
  }
}
