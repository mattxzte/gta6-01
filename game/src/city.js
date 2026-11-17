// Solmar, the coastal city of Solmar Heat: a 9x9 block grid with roads,
// a tower plaza, two parks, a beach and ocean to the south, and a marina
// to the east. Builds all static geometry, keeps the building colliders,
// and answers the questions the other systems ask (is this a road? where
// can a car park? push this circle out of the buildings?).
import * as THREE from 'three';
import { range, pick, chance, intRange } from './rng.js';

export const PITCH = 52;
export const BLOCK = 40;
export const ROAD_W = 12;
export const HALF = 240;

export const ROAD_LINES = [-234, -182, -130, -78, -26, 26, 78, 130, 182, 234];
export const BLOCK_CENTERS = [-208, -156, -104, -52, 0, 52, 104, 156, 208];

const WALL_COLORS = [
  0xe6d3b3, 0xd8b48f, 0xc97b5a, 0x7fb3a8, 0xe8e4d8,
  0xb8574a, 0x5a7d9a, 0xd9c27a, 0xa8b8c8, 0xe0a458,
];
const ROOF_COLORS = [0x8a6f55, 0x6b5a4a, 0x4a5a6a, 0x7a4a3a];

function signTexture(text, fg, bg, sub) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = sub ? 256 : 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.font = 'bold 64px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, sub ? 100 : 64);
  if (sub) {
    g.font = 'bold 40px Arial, sans-serif';
    g.fillText(sub, 256, 190);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class SolmarCity {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = [];
    this.landmarks = {
      plaza: { x: 0, z: 0 },
      tower: { x: 0, z: -8 },
      garage: { x: -208, z: 52 },
      casino: { x: 156, z: -156 },
      hospital: { x: -156, z: 156 },
      safehouse: { x: 208, z: 208 },
      marina: { x: 262, z: 150 },
      beach: { x: -60, z: 285 },
      parkNorth: { x: -104, z: 156 },
      parkSouth: { x: 104, z: -104 },
    };
    // Where a mission marker actually stands: on the street in front of
    // each building, never inside its walls, so a car can reach it.
    this.approach = {
      tower: { x: 0, z: 26 },
      garage: { x: -208, z: 74 },
      casino: { x: 156, z: -132 },
      hospital: { x: -156, z: 178 },
      safehouse: { x: 208, z: 186 },
      marina: { x: 252, z: 150 },
      beach: { x: -60, z: 285 },
    };
    this.spawn = { x: 0, z: 34, heading: Math.PI };
    this.buildGround();
    this.buildBlocks();
    this.buildTower();
    this.buildLandmarks();
    this.buildBeachAndMarina();
    this.buildStreetFurniture();
  }

  addCollider(x0, z0, x1, z1) {
    this.colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
  }

  buildGround() {
    const scene = this.scene;
    // Far ground underneath everything (sand/grass fringe).
    const far = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshLambertMaterial({ color: 0x9a8a68 }),
    );
    far.rotation.x = -Math.PI / 2;
    far.position.y = -0.08;
    scene.add(far);
    // Asphalt city base.
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 24, HALF * 2 + 24),
      new THREE.MeshLambertMaterial({ color: 0x3d4148 }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0;
    scene.add(base);
    // Sidewalk slabs, one per block.
    const slabGeo = new THREE.BoxGeometry(BLOCK, 0.24, BLOCK);
    const slabMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a3 });
    const parkMat = new THREE.MeshLambertMaterial({ color: 0x5d8a4a });
    for (const bx of BLOCK_CENTERS) {
      for (const bz of BLOCK_CENTERS) {
        const isPark =
          (bx === -104 && bz === 156) || (bx === 104 && bz === -104);
        const slab = new THREE.Mesh(slabGeo, isPark ? parkMat : slabMat);
        slab.position.set(bx, 0.12, bz);
        scene.add(slab);
      }
    }
    // Dashed centre lines along every road, instanced.
    const dashGeo = new THREE.BoxGeometry(3, 0.06, 0.35);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f0e0 });
    const spots = [];
    for (const line of ROAD_LINES) {
      for (let d = -232; d <= 232; d += 9) {
        spots.push({ x: line, z: d, rot: 0 });
        spots.push({ x: d, z: line, rot: Math.PI / 2 });
      }
    }
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    spots.forEach((spot, i) => {
      e.set(0, spot.rot, 0);
      q.setFromEuler(e);
      v.set(spot.x, 0.16, spot.z);
      m4.compose(v, q, s);
      dashes.setMatrixAt(i, m4);
    });
    scene.add(dashes);
  }

  buildingAt(cx, cz, w, d, h, color, roofColor) {
    const mat = new THREE.MeshLambertMaterial({ color });
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    box.position.set(cx, h / 2 + 0.24, cz);
    this.scene.add(box);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.92, 1.2, d * 0.92),
      new THREE.MeshLambertMaterial({ color: roofColor }),
    );
    roof.position.set(cx, h + 0.8, cz);
    this.scene.add(roof);
    // A few lit windows as thin emissive strips on the two street faces.
    if (h > 16 && this.rng() < 0.8) {
      const winMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
      const floors = Math.min(6, Math.floor(h / 9));
      for (let f = 0; f < floors; f++) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.5, 0.1), winMat);
        strip.position.set(cx, 4 + f * 8, cz + d / 2 + 0.06);
        this.scene.add(strip);
      }
    }
    this.addCollider(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
    return box;
  }

  buildBlocks() {
    const rng = this.rng;
    const special = new Set([
      '0,0', '-104,156', '104,-104',
      '-208,52', '156,-156', '-156,156', '208,208',
    ]);
    for (const bx of BLOCK_CENTERS) {
      for (const bz of BLOCK_CENTERS) {
        const key = `${bx},${bz}`;
        if (special.has(key)) continue;
        const dist = Math.hypot(bx, bz) / 300;
        const tallBoost = (1 - dist) * 22;
        const n = chance(rng, 0.45) ? 2 : 1;
        if (n === 1) {
          const w = range(rng, 20, 32);
          const d = range(rng, 20, 32);
          const h = range(rng, 10, 26) + tallBoost * rng();
          this.buildingAt(bx, bz, w, d, h, pick(rng, WALL_COLORS), pick(rng, ROOF_COLORS));
        } else {
          for (let k = 0; k < 2; k++) {
            const ox = k === 0 ? -9 : 9;
            const oz = k === 0 ? -9 : 9;
            const w = range(rng, 14, 18);
            const d = range(rng, 14, 18);
            const h = range(rng, 8, 20) + tallBoost * rng() * 0.7;
            this.buildingAt(bx + ox, bz + oz, w, d, h, pick(rng, WALL_COLORS), pick(rng, ROOF_COLORS));
          }
        }
      }
    }
    // Park trees and benches.
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const leafGeo = new THREE.IcosahedronGeometry(2.6, 0);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7a34 });
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
    for (const park of [{ x: -104, z: 156 }, { x: 104, z: -104 }]) {
      for (let i = 0; i < 14; i++) {
        const tx = park.x + range(rng, -17, 17);
        const tz = park.z + range(rng, -17, 17);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(tx, 1.7, tz);
        this.scene.add(trunk);
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(tx, 4.6, tz);
        leaf.scale.setScalar(range(rng, 0.8, 1.3));
        this.scene.add(leaf);
      }
      for (let i = 0; i < 3; i++) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 1), benchMat);
        bench.position.set(park.x + range(rng, -14, 14), 0.6, park.z + range(rng, -14, 14));
        this.scene.add(bench);
      }
    }
  }

  buildTower() {
    const { x, z } = this.landmarks.tower;
    const mat = new THREE.MeshLambertMaterial({ color: 0xcfd8de });
    const tower = new THREE.Mesh(new THREE.BoxGeometry(26, 96, 26), mat);
    tower.position.set(x, 48.2, z);
    this.scene.add(tower);
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(18, 8, 18),
      new THREE.MeshLambertMaterial({ color: 0x2a6a8a }),
    );
    crown.position.set(x, 100, z);
    this.scene.add(crown);
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 1.2, 14, 8),
      new THREE.MeshLambertMaterial({ color: 0x888888 }),
    );
    spire.position.set(x, 111, z);
    this.scene.add(spire);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3344 }),
    );
    beacon.position.set(x, 119, z);
    beacon.name = 'towerBeacon';
    this.scene.add(beacon);
    this.addCollider(x - 13, z - 13, x + 13, z + 13);
  }

  buildLandmarks() {
    // Garage: Jax's workshop, low and wide, with a painted sign.
    const g = this.landmarks.garage;
    const garage = new THREE.Mesh(
      new THREE.BoxGeometry(34, 9, 24),
      new THREE.MeshLambertMaterial({ color: 0xb8574a }),
    );
    garage.position.set(g.x, 4.7, g.z);
    this.scene.add(garage);
    const gSign = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 5),
      new THREE.MeshBasicMaterial({ map: signTexture("JAX'S GARAGE", '#ffe9a8', '#5a2320') }),
    );
    gSign.position.set(g.x, 7.5, g.z + 12.2);
    this.scene.add(gSign);
    this.addCollider(g.x - 17, g.z - 12, g.x + 17, g.z + 12);
    // Casino: Solmar Grand, gold and glass.
    const c = this.landmarks.casino;
    const casino = new THREE.Mesh(
      new THREE.BoxGeometry(36, 16, 28),
      new THREE.MeshLambertMaterial({ color: 0xd9b25a }),
    );
    casino.position.set(c.x, 8.2, c.z);
    this.scene.add(casino);
    const cSign = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 6),
      new THREE.MeshBasicMaterial({ map: signTexture('SOLMAR GRAND', '#fff2b0', '#3a2a10', 'CASINO • HOTEL') }),
    );
    cSign.position.set(c.x, 13, c.z + 14.2);
    this.scene.add(cSign);
    this.addCollider(c.x - 18, c.z - 14, c.x + 18, c.z + 14);
    // Hospital: white block with a red cross sign.
    const h = this.landmarks.hospital;
    const hosp = new THREE.Mesh(
      new THREE.BoxGeometry(30, 14, 24),
      new THREE.MeshLambertMaterial({ color: 0xeef2f0 }),
    );
    hosp.position.set(h.x, 7.2, h.z);
    this.scene.add(hosp);
    const hSign = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 6),
      new THREE.MeshBasicMaterial({ map: signTexture('✚ HOSPITAL', '#d02030', '#f4f4f4') }),
    );
    hSign.position.set(h.x, 11, h.z + 12.2);
    this.scene.add(hSign);
    this.addCollider(h.x - 15, h.z - 12, h.x + 15, h.z + 12);
    // Safehouse: a small beach-side house.
    const s = this.landmarks.safehouse;
    const house = new THREE.Mesh(
      new THREE.BoxGeometry(16, 7, 14),
      new THREE.MeshLambertMaterial({ color: 0x7fb3a8 }),
    );
    house.position.set(s.x, 3.7, s.z);
    this.scene.add(house);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(12, 4, 4),
      new THREE.MeshLambertMaterial({ color: 0x8a4a3a }),
    );
    roof.position.set(s.x, 9, s.z);
    roof.rotation.y = Math.PI / 4;
    this.scene.add(roof);
    this.addCollider(s.x - 8, s.z - 7, s.x + 8, s.z + 7);
  }

  buildBeachAndMarina() {
    // Boardwalk strip, then sand, then the ocean to the south.
    const walk = new THREE.Mesh(
      new THREE.BoxGeometry(HALF * 2 + 24, 0.3, 10),
      new THREE.MeshLambertMaterial({ color: 0x9a7a52 }),
    );
    walk.position.set(0, 0.15, 247);
    this.scene.add(walk);
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 70),
      new THREE.MeshLambertMaterial({ color: 0xe8d9a8 }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.05, 287);
    this.scene.add(sand);
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 600),
      new THREE.MeshLambertMaterial({ color: 0x2f7fb0 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, 0.02, 620);
    ocean.name = 'ocean';
    this.scene.add(ocean);
    // Palm trees along the boardwalk.
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 6, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
    const leafGeo = new THREE.IcosahedronGeometry(2.2, 0);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x4a8a3a });
    for (let x = -220; x <= 220; x += 22) {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x + this.rng() * 4, 3.1, 250);
      trunk.rotation.z = (this.rng() - 0.5) * 0.2;
      this.scene.add(trunk);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(x, 6.8, 250);
      this.scene.add(leaf);
    }
    // Marina docks and boats to the east.
    const dockMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4a });
    for (let i = 0; i < 3; i++) {
      const dock = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 4), dockMat);
      dock.position.set(258, 0.4, 110 + i * 40);
      this.scene.add(dock);
    }
    const hullMat = new THREE.MeshLambertMaterial({ color: 0xf0f0ea });
    const mastMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
    for (let i = 0; i < 5; i++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 12), hullMat);
      hull.position.y = 0.8;
      boat.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 6), mastMat);
      mast.position.y = 6;
      boat.add(mast);
      boat.position.set(252 + (i % 2) * 14, 0, 100 + i * 26);
      boat.rotation.y = (this.rng() - 0.5) * 0.3;
      this.scene.add(boat);
    }
    // A wide water plane east of the marina too.
    const eastSea = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 700),
      new THREE.MeshLambertMaterial({ color: 0x2f7fb0 }),
    );
    eastSea.rotation.x = -Math.PI / 2;
    eastSea.position.set(480, 0.02, 100);
    this.scene.add(eastSea);
  }

  buildStreetFurniture() {
    // Street lamps along the roads, instanced.
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 7, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
    const headGeo = new THREE.BoxGeometry(1.6, 0.3, 0.5);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    const spots = [];
    for (const line of ROAD_LINES) {
      for (let d = -220; d <= 220; d += 44) {
        spots.push({ x: line + 7, z: d });
        spots.push({ x: d, z: line + 7 });
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    spots.forEach((spot, i) => {
      e.set(0, 0, 0);
      q.setFromEuler(e);
      v.set(spot.x, 3.5, spot.z);
      m4.compose(v, q, s);
      poles.setMatrixAt(i, m4);
      v.set(spot.x, 7.1, spot.z);
      m4.compose(v, q, s);
      heads.setMatrixAt(i, m4);
    });
    this.scene.add(poles);
    this.scene.add(heads);
  }

  // Push a circle (x, z, radius) out of every building it overlaps.
  collideCircle(x, z, r) {
    let hit = false;
    for (const c of this.colliders) {
      const nx = Math.max(c.x0, Math.min(x, c.x1));
      const nz = Math.max(c.z0, Math.min(z, c.z1));
      const dx = x - nx;
      const dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest exit.
        const exits = [
          { d: x - c.x0 + r, nx: c.x0 - r, nz: z },
          { d: c.x1 - x + r, nx: c.x1 + r, nz: z },
          { d: z - c.z0 + r, nx: x, nz: c.z0 - r },
          { d: c.z1 - z + r, nx: x, nz: c.z1 + r },
        ];
        exits.sort((a, b) => a.d - b.d);
        x = exits[0].nx;
        z = exits[0].nz;
      }
    }
    return { x, z, hit };
  }

  isOnRoad(x, z) {
    if (Math.abs(x) > HALF + 6 || Math.abs(z) > HALF + 6) return false;
    for (const line of ROAD_LINES) {
      if (Math.abs(x - line) < ROAD_W / 2 + 1) return true;
      if (Math.abs(z - line) < ROAD_W / 2 + 1) return true;
    }
    return false;
  }

  randomRoadPoint(rng) {
    const line = pick(rng, ROAD_LINES);
    const along = range(rng, -228, 228);
    return chance(rng, 0.5) ? { x: line, z: along } : { x: along, z: line };
  }

  // A parking spot hugging a road edge, facing along the road.
  randomParkedSpot(rng) {
    const line = pick(rng, ROAD_LINES);
    const along = range(rng, -220, 220);
    const side = chance(rng, 0.5) ? 1 : -1;
    // Park on the road itself, hugging its edge (half-width 6, car half
    // width ~1): clear of the buildings, clear of the traffic lane.
    const edge = ROAD_W / 2 - 2.2;
    if (chance(rng, 0.5)) {
      // Parked on an x-line road (runs north–south): face along z.
      return { x: line + side * edge, z: along, heading: side > 0 ? Math.PI : 0 };
    }
    // Parked on a z-line road (runs east–west): face along x.
    return { x: along, z: line + side * edge, heading: side > 0 ? -Math.PI / 2 : Math.PI / 2 };
  }

  // A rectangular loop of road centre lines for a traffic car to circle.
  randomLoop(rng) {
    const xs = [...ROAD_LINES];
    const zs = [...ROAD_LINES];
    const x0 = pick(rng, xs);
    let x1 = pick(rng, xs);
    while (Math.abs(x1 - x0) < 104) x1 = pick(rng, xs);
    const z0 = pick(rng, zs);
    let z1 = pick(rng, zs);
    while (Math.abs(z1 - z0) < 104) z1 = pick(rng, zs);
    return [
      { x: Math.min(x0, x1), z: Math.min(z0, z1) },
      { x: Math.max(x0, x1), z: Math.min(z0, z1) },
      { x: Math.max(x0, x1), z: Math.max(z0, z1) },
      { x: Math.min(x0, x1), z: Math.max(z0, z1) },
    ];
  }

  clampToWorld(x, z, margin = 6) {
    return {
      x: Math.max(-HALF - margin, Math.min(HALF + 40, x)),
      z: Math.max(-HALF - margin, Math.min(320, z)),
    };
  }
}
