// city.js — builds Solmar Bay: a sun-soaked coastal city on a road grid.
// Districts, towers, marina, port, beach, traffic lights, street props and
// the road graph traffic and pedestrians drive on. Everything is generated
// from one fixed seed, so the city is identical on every load.
import * as THREE from 'three';
import { Rng, clamp, canvasTexture } from './utils.js';

export const AVES = [-480, -400, -320, -240, -160, -80, 0, 80, 160, 240, 320, 400, 480];
export const STREETS = [-400, -320, -240, -160, -80, 0, 80, 160, 240, 320, 400];
export const ROAD_W = 16;
export const BLOCK = 80 - ROAD_W;

const DISTRICTS = {
  downtown: { cols: [5, 6, 7, 8], rows: [3, 4, 5, 6], hMin: 45, hMax: 120, palette: ['#7d94a8', '#5d7d94', '#93a8b8', '#4d6a80'], windows: '#ffe9a8' },
  oldtown: { cols: [3, 4, 5], rows: [6, 7, 8], hMin: 12, hMax: 26, palette: ['#d8a05c', '#c97e4a', '#e8c88a', '#b85c48'], windows: '#fff2c0' },
  marina: { cols: [0, 1, 2], rows: [0, 1, 2], hMin: 8, hMax: 16, palette: ['#e8e0cc', '#c8d8d8', '#a8c8c8'], windows: '#fff8d8' },
  port: { cols: [0, 1, 2], rows: [8, 9, 10], hMin: 10, hMax: 15, palette: ['#8a8f96', '#6a7078', '#a8a098'], windows: '#d8e8ff' },
  suburbs: { cols: [9, 10, 11, 12], rows: [3, 4, 5, 6, 7, 8, 9, 10], hMin: 6, hMax: 11, palette: ['#e8c8a0', '#d8b088', '#c8a888', '#e8d8b8'], windows: '#fff2c0' },
  hills: { cols: [9, 10, 11, 12], rows: [0, 1, 2], hMin: 8, hMax: 15, palette: ['#f0e8d8', '#d8c8a8', '#e8d8c8'], windows: '#fff8d8' },
};

function districtAt(col, row) {
  for (const [name, d] of Object.entries(DISTRICTS)) {
    if (d.cols.includes(col) && d.rows.includes(row)) return name;
  }
  return 'midtown';
}

function facadeTexture(base, lit, rng) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2);
    for (let y = 12; y < h - 8; y += 22) {
      for (let x = 10; x < w - 10; x += 20) {
        g.fillStyle = rng.chance(0.55) ? lit : '#2a3542';
        g.fillRect(x, y, 12, 14);
      }
    }
  });
}

function roadTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#33363b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d4046';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    g.fillStyle = '#e8c84a';
    g.fillRect(w / 2 - 2, 8, 4, 34); g.fillRect(w / 2 - 2, 72, 4, 34);
    g.fillStyle = '#d8d8d8'; g.fillRect(4, 0, 2, h); g.fillRect(w - 6, 0, 2, h);
  });
}

function sandTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e0c48f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d4b47e';
    for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 0, 7); g.fill(); }
  });
}

function waterTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#1e7fa8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      const y = 8 + i * 15;
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.3 + i) * 3);
      g.stroke();
    }
  });
}

export function buildCity(scene) {
  const rng = new Rng(20261119);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);

  // ---- ground base ----
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1600), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // ---- beach + ocean ----
  const sandTex = sandTexture(); sandTex.repeat.set(6, 14);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(130, 900),
    new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(-585, 0.01, 0);
  sand.receiveShadow = true;
  group.add(sand);
  const waterTex = waterTexture(); waterTex.repeat.set(10, 14);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 1600),
    new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.94 }));
  water.rotation.x = -Math.PI / 2; water.position.set(-1100, -0.4, 0);
  group.add(water);

  // ---- boardwalk ----
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 0.9 });
  const walk = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 860), walkMat);
  walk.position.set(-528, 0.12, 0);
  walk.receiveShadow = true;
  group.add(walk);

  // ---- roads ----
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
  for (const x of AVES) {
    const t = roadTex.clone(); t.needsUpdate = true; t.repeat.set(1, 52);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 880), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI / 2;
    m.position.set(x, 0.02, 0); m.receiveShadow = true;
    group.add(m);
  }
  for (const z of STREETS) {
    const t = roadTex.clone(); t.needsUpdate = true; t.repeat.set(1, 62);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 1040), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.02, z); m.receiveShadow = true;
    group.add(m);
  }

  // ---- district block pads ----
  const padColors = { downtown: 0x9aa0a8, oldtown: 0xcbb89a, marina: 0xbcc8c0, port: 0x8f9296, suburbs: 0xa8c088, hills: 0x98b088, midtown: 0xb0a890 };
  for (let col = 0; col < AVES.length - 1; col++) {
    for (let row = 0; row < STREETS.length - 1; row++) {
      const cx = (AVES[col] + AVES[col + 1]) / 2;
      const cz = (STREETS[row] + STREETS[row + 1]) / 2;
      const d = districtAt(col, row);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(BLOCK + 8, 0.5, BLOCK + 8),
        new THREE.MeshStandardMaterial({ color: padColors[d] || 0xb0a890, roughness: 1 }));
      pad.position.set(cx, 0.0, cz);
      pad.receiveShadow = true;
      group.add(pad);
    }
  }

  // ---- buildings ----
  const facadeMats = {};
  function facadeMat(base, lit) {
    const key = base + lit;
    if (!facadeMats[key]) {
      facadeMats[key] = new THREE.MeshStandardMaterial({ map: facadeTexture(base, lit, new Rng(base.length * 977 + lit.length * 131)), roughness: 0.85 });
    }
    return facadeMats[key];
  }
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1 });
  let towerTop = null;
  for (let col = 0; col < AVES.length - 1; col++) {
    for (let row = 0; row < STREETS.length - 1; row++) {
      if (col === 6 && row === 5) continue; // Grand Plaza stays open
      if (col === 1 && row === 9) continue; // port yard stays open
      const d = districtAt(col, row);
      const spec = DISTRICTS[d] || { hMin: 14, hMax: 30, palette: ['#a8a098', '#b8b0a0'], windows: '#fff2c0' };
      const cx = (AVES[col] + AVES[col + 1]) / 2;
      const cz = (STREETS[row] + STREETS[row + 1]) / 2;
      const count = d === 'downtown' ? rng.int(1, 2) : rng.int(1, 3);
      for (let b = 0; b < count; b++) {
        const w = rng.range(16, 30), dep = rng.range(16, 30);
        const h = rng.range(spec.hMin, spec.hMax);
        const ox = rng.range(-14, 14), oz = rng.range(-14, 14);
        const base = rng.pick(spec.palette);
        const mesh = new THREE.Mesh(boxGeo, facadeMat(base, spec.windows));
        mesh.scale.set(w, h, dep);
        mesh.position.set(cx + ox, h / 2, cz + oz);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 1, 0.8, dep + 1);
        roof.position.set(cx + ox, h + 0.4, cz + oz);
        group.add(roof);
        colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz + oz - dep / 2, maxZ: cz + oz + dep / 2 });
        if (d === 'downtown' && h > 100) towerTop = mesh;
      }
    }
  }
  // Solmar Tower — the tallest landmark, glowing crown.
  const tower = new THREE.Mesh(boxGeo, facadeMat('#5d7d94', '#ffe9a8'));
  tower.scale.set(34, 150, 34);
  tower.position.set(40, 75, -120);
  tower.castShadow = true;
  group.add(tower);
  const crown = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0xffb84d, emissiveIntensity: 1.4 }));
  crown.scale.set(36, 4, 36); crown.position.set(40, 152, -120);
  group.add(crown);
  colliders.push({ minX: 23, maxX: 57, minZ: -137, maxZ: -103 });

  // ---- Grand Plaza fountain ----
  const plazaX = (AVES[6] + AVES[7]) / 2, plazaZ = (STREETS[5] + STREETS[6]) / 2;
  const basin = new THREE.Mesh(cylGeo, new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.6 }));
  basin.scale.set(14, 1.2, 14); basin.position.set(plazaX, 0.6, plazaZ);
  basin.castShadow = true;
  group.add(basin);
  const pool = new THREE.Mesh(cylGeo, new THREE.MeshStandardMaterial({ color: 0x2a9fd8, roughness: 0.15, metalness: 0.4 }));
  pool.scale.set(12, 0.4, 12); pool.position.set(plazaX, 1.1, plazaZ);
  group.add(pool);
  colliders.push({ minX: plazaX - 14, maxX: plazaX + 14, minZ: plazaZ - 14, maxZ: plazaZ + 14 });

  // ---- marina docks + boats ----
  const dockMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(60, 0.6, 6), dockMat);
    dock.position.set(-600, 0.4, -300 + i * 70);
    group.add(dock);
    const hull = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe8e8e8 : 0x2a5a8a, roughness: 0.4 }));
    hull.scale.set(16, 3, 5); hull.position.set(-585, 0.6, -300 + i * 70 + 8);
    group.add(hull);
    const mast = new THREE.Mesh(cylGeo, new THREE.MeshStandardMaterial({ color: 0x888888 }));
    mast.scale.set(0.3, 12, 0.3); mast.position.set(-585, 7, -300 + i * 70 + 8);
    group.add(mast);
  }

  // ---- port containers + cranes ----
  const contColors = [0xc84a3a, 0x3a7ac8, 0x4ac83a, 0xc8a03a, 0x8a4ac8];
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: contColors[i % contColors.length], roughness: 0.7 }));
    const px = -460 + (i % 6) * 16, pz = 300 + Math.floor(i / 6) * 18;
    c.scale.set(12, 3, 3.4); c.position.set(px, 1.5 + (i % 3 === 0 ? 3 : 0), pz);
    c.castShadow = true;
    group.add(c);
    colliders.push({ minX: px - 6, maxX: px + 6, minZ: pz - 1.7, maxZ: pz + 1.7 });
  }
  for (const cz of [280, 360]) {
    const legMat = new THREE.MeshStandardMaterial({ color: 0xc8a03a, roughness: 0.6 });
    const towerM = new THREE.Mesh(boxGeo, legMat);
    towerM.scale.set(4, 42, 4); towerM.position.set(-440, 21, cz);
    group.add(towerM);
    const jib = new THREE.Mesh(boxGeo, legMat);
    jib.scale.set(46, 3, 3); jib.position.set(-420, 40, cz);
    group.add(jib);
    colliders.push({ minX: -442, maxX: -438, minZ: cz - 2, maxZ: cz + 2 });
  }

  // ---- palms along the boardwalk and avenues ----
  const palmTrunk = new THREE.CylinderGeometry(0.35, 0.5, 9, 6);
  const palmTop = new THREE.IcosahedronGeometry(3.2, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const topMat = new THREE.MeshStandardMaterial({ color: 0x2e8b3a, roughness: 1 });
  const palmSpots = [];
  for (let z = -380; z <= 380; z += 40) { palmSpots.push([-536, z]); palmSpots.push([-512, z + 20]); }
  for (let i = 0; i < 40; i++) palmSpots.push([rng.pick(AVES.slice(2)) + 10, rng.range(-380, 380)]);
  const trunks = new THREE.InstancedMesh(palmTrunk, trunkMat, palmSpots.length);
  const tops = new THREE.InstancedMesh(palmTop, topMat, palmSpots.length);
  const m4 = new THREE.Matrix4();
  palmSpots.forEach(([x, z], i) => {
    m4.makeTranslation(x, 4.5, z); trunks.setMatrixAt(i, m4);
    m4.makeTranslation(x, 10.2, z); tops.setMatrixAt(i, m4);
  });
  trunks.castShadow = true;
  group.add(trunks); group.add(tops);

  // ---- streetlights ----
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 8, 6);
  const headGeo = new THREE.BoxGeometry(1.6, 0.5, 0.6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.7 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf8a, emissiveIntensity: 0.05 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.25 });
  const streetLights = [];
  for (const x of AVES) {
    for (let z = -360; z <= 360; z += 160) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x + 9, 4, z);
      group.add(pole);
      const head = new THREE.Mesh(headGeo, headMat.clone());
      head.position.set(x + 9, 8.1, z);
      group.add(head);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), glowMat);
      glow.position.set(x + 9, 7.6, z); glow.visible = false;
      group.add(glow);
      streetLights.push({ head, glow });
    }
  }

  // ---- traffic lights at major intersections ----
  const tlGroup = new THREE.Group();
  group.add(tlGroup);
  const tlMasts = [];
  const tlHeadMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const lampGeo = new THREE.SphereGeometry(0.5, 8, 6);
  for (const ix of [0, 3, 6, 9, 12]) {
    for (const iz of [0, 3, 5, 7, 10]) {
      const x = AVES[ix], z = STREETS[iz];
      const mast = new THREE.Mesh(cylGeo, poleMat);
      mast.scale.set(0.25, 7, 0.25); mast.position.set(x + 9, 3.5, z + 9);
      tlGroup.add(mast);
      const box = new THREE.Mesh(new THREE.BoxGeometry(1, 2.6, 1), tlHeadMat);
      box.position.set(x + 9, 7.4, z + 9);
      tlGroup.add(box);
      const lampR = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      lampR.position.set(x + 9, 8.2, z + 9.6);
      tlGroup.add(lampR);
      const lampG = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x22ff44 }));
      lampG.position.set(x + 9, 6.6, z + 9.6);
      tlGroup.add(lampG);
      tlMasts.push({ x, z, lampR, lampG, offset: (ix * 3 + iz * 5) % 14 });
    }
  }

  // ---- road graph ----
  const NA = AVES.length, NS = STREETS.length;
  const nodeIndex = (ix, iz) => iz * NA + ix;
  const nodes = [];
  for (let iz = 0; iz < NS; iz++) for (let ix = 0; ix < NA; ix++) nodes.push({ x: AVES[ix], z: STREETS[iz], ix, iz });
  function neighbors(n) {
    const out = [];
    if (n.ix > 0) out.push(nodeIndex(n.ix - 1, n.iz));
    if (n.ix < NA - 1) out.push(nodeIndex(n.ix + 1, n.iz));
    if (n.iz > 0) out.push(nodeIndex(n.ix, n.iz - 1));
    if (n.iz < NS - 1) out.push(nodeIndex(n.ix, n.iz + 1));
    return out;
  }
  function nearestNode(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // BFS route through the grid, used by police cruisers.
  function route(fromIdx, toIdx) {
    if (fromIdx === toIdx) return [toIdx];
    const prev = new Array(nodes.length).fill(-1);
    const queue = [fromIdx];
    prev[fromIdx] = fromIdx;
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of neighbors(nodes[cur])) {
        if (prev[nb] === -1) { prev[nb] = cur; if (nb === toIdx) { queue.length = 0; break; } queue.push(nb); }
      }
    }
    if (prev[toIdx] === -1) return [toIdx];
    const path = [toIdx];
    let c = toIdx;
    while (c !== fromIdx) { c = prev[c]; path.unshift(c); }
    return path;
  }

  // ---- traffic light state ----
  const LIGHT_PERIOD = 16;
  function lightStateAt(x, z) {
    const ix = AVES.reduce((best, v, i) => (Math.abs(v - x) < Math.abs(AVES[best] - x) ? i : best), 0);
    const iz = STREETS.reduce((best, v, i) => (Math.abs(v - z) < Math.abs(STREETS[best] - z) ? i : best), 0);
    const off = (ix * 3 + iz * 5) % LIGHT_PERIOD;
    const ph = (performance.now() / 1000 + off) % LIGHT_PERIOD;
    if (ph < 6.5) return 'ns';
    if (ph < 8) return 'nsYellow';
    if (ph < 14.5) return 'ew';
    return 'ewYellow';
  }

  function updateLights() {
    for (const t of tlMasts) {
      const st = lightStateAt(t.x, t.z);
      const nsGreen = st === 'ns';
      t.lampG.material.color.setHex(nsGreen ? 0x22ff44 : 0x113311);
      t.lampR.material.color.setHex(nsGreen ? 0x331111 : 0xff2222);
    }
  }

  return {
    colliders, nodes, neighbors, nearestNode, route, lightStateAt, streetLights,
    update(dt) { updateLights(); water.material.map.offset.y += dt * 0.02; },
    shops: {
      gun: { x: -200, z: 240, name: 'Ironworks Guns', kind: 'gun' },
      diner: { x: 80, z: 80, name: 'Sunset Diner', kind: 'diner' },
      spray: { x: -320, z: 320, name: "Pay 'n Spray", kind: 'spray' },
      garage: { x: -160, z: 240, name: 'Mara’s Garage', kind: 'garage' },
      safehouse: { x: -120, z: 280, name: 'Safehouse', kind: 'safehouse' },
    },
    spots: {
      start: { x: -140, z: 260 },
      marina: { x: -420, z: -280 },
      warehouse: { x: -380, z: 330 },
      plaza: { x: plazaX, z: plazaZ },
      beach: { x: -560, z: 120 },
      tower: { x: 40, z: -120 },
      portGate: { x: -360, z: 360 },
      hills: { x: 400, z: -320 },
    },
    bounds: { minX: -660, maxX: 560, minZ: -440, maxZ: 440 },
  };
}
