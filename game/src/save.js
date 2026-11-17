// Saving Solmar Heat: one localStorage slot holding cash, mission
// progress, Jax's position and health. The menu offers Continue when a
// save exists.
const KEY = 'solmar-heat-save-v1';

export class SaveGame {
  constructor(G) {
    this.G = G;
  }

  save() {
    const G = this.G;
    try {
      const data = {
        cash: G.cash,
        completed: G.missions.completed,
        x: G.player.x,
        z: G.player.z,
        heading: G.player.heading,
        health: G.player.health,
        ammo: G.combat.ammo,
        time: Date.now(),
      };
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.cash !== 'number' || typeof data.completed !== 'number') return null;
      return data;
    } catch {
      return null;
    }
  }

  apply(data) {
    const G = this.G;
    G.cash = data.cash;
    G.missions.completed = data.completed;
    G.player.health = data.health ?? 100;
    G.combat.ammo = data.ammo ?? 12;
    G.player.setPosition(data.x, data.z, data.heading ?? 0);
    G.missions.startNext();
  }

  clear() {
    try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  }
}
