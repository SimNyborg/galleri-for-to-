// Galleriets arkitektur: sale, vægge, døre, facade, gade, kollisioner og gulvhøjde.
import * as THREE from 'three';
import { worldUVBox } from './builder.js';

export const T = 0.2; // vægtykkelse

export const ROOMS = [
  { id: 'foyer', name: 'Champagnesalonen', x0: -6, x1: 6, z0: 0, z1: 10, h: 4.6, floor: 'floorMarble', floorUV: 1.4, wall: 'wallFoyer', trim: 'trim', photoH: 1.35, center: 1.65, entry: [0, 9] },
  { id: 'hall', name: 'Rejsesalen', x0: -10, x1: 10, z0: -16, z1: 0, h: 5.6, floor: 'floorParquet', floorUV: 3.2, wall: 'wallHall', trim: 'trim', photoH: 1.75, center: 1.85, wires: true, entry: [0, -1] },
  { id: 'sushi', name: 'Sushibaren', x0: -20, x1: -10, z0: -14, z1: -2, h: 4.2, floor: 'floorDarkWood', floorUV: 4, wall: 'wallSushi', trim: 'trimDark', ceiling: 'ceilingDark', photoH: 1.25, center: 1.62, entry: [-11, -8] },
  { id: 'cafe', name: 'Caféen', x0: 10, x1: 20, z0: -14, z1: -2, h: 4.2, floor: 'floorTerrazzo', floorUV: 2.2, wall: 'wallCafe', trim: 'trim', photoH: 1.15, center: 1.62, entry: [11, -8], reserve: { e: [[-14, -2]] } },
  { id: 'final', name: 'Hovedværket', x0: -5, x1: 5, z0: -26, z1: -16, h: 5.2, floor: 'floorDamask', floorUV: 2.4, wall: 'wallFinal', trim: 'gold', photoH: 1.3, center: 1.75, entry: [0, -17], noAuto: true },
];

export const DOORS = [
  { id: 'entrance', axis: 'z', at: 10, from: -1.3, to: 1.3, h: 3.4, rooms: ['foyer'] },
  { id: 'foyer-hall', axis: 'z', at: 0, from: -1.4, to: 1.4, h: 3.4, rooms: ['foyer', 'hall'] },
  { id: 'hall-sushi', axis: 'x', at: -10, from: -9.3, to: -6.7, h: 3.2, rooms: ['hall', 'sushi'] },
  { id: 'hall-cafe', axis: 'x', at: 10, from: -9.3, to: -6.7, h: 3.2, rooms: ['hall', 'cafe'] },
  { id: 'hall-final', axis: 'z', at: -16, from: -1.4, to: 1.4, h: 3.6, rooms: ['hall', 'final'] },
];

// Udendørs mål
export const EXT = {
  facadeZ: 10.6,
  platformZ: 13.6,
  stepRun: 0.45,
  stepRise: 0.18,
  sidewalkY: -0.72,
  sidewalkZ: 14.95,
  curbZ: 21,
  streetY: -0.87,
  platformHalfW: 12,
};

export function floorHeight(x, z) {
  if (z <= EXT.facadeZ) return 0;
  if (z < EXT.curbZ) {
    if (Math.abs(x) <= EXT.platformHalfW) {
      if (z <= EXT.platformZ) return 0;
      if (z < EXT.sidewalkZ) {
        const i = Math.ceil((z - EXT.platformZ) / EXT.stepRun);
        return -EXT.stepRise * Math.min(3, Math.max(1, i));
      }
    }
    return EXT.sidewalkY;
  }
  return EXT.streetY;
}

export function roomAt(x, z) {
  for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  return null;
}

// --- Kollisioner ------------------------------------------------------------
export class Colliders {
  constructor() {
    this.list = [];
  }
  add(minX, maxX, minZ, maxZ, tag = null) {
    const c = { minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX), minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ), active: true, tag };
    this.list.push(c);
    return c;
  }
  // Skub en cirkel (x,z,r) ud af alle aktive kasser.
  resolve(pos, r) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const c of this.list) {
        if (!c.active) continue;
        const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          pos.x += (dx / d) * (r - d);
          pos.z += (dz / d) * (r - d);
        } else {
          // centrum inde i kassen: skub ud ad korteste vej
          const pushes = [
            [c.minX - r - pos.x, 0],
            [c.maxX + r - pos.x, 0],
            [0, c.minZ - r - pos.z],
            [0, c.maxZ + r - pos.z],
          ];
          pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
          pos.x += pushes[0][0];
          pos.z += pushes[0][1];
        }
        moved = true;
      }
      if (!moved) break;
    }
    return pos;
  }
}

// --- Bygning ----------------------------------------------------------------
function doorsOn(room, side) {
  return DOORS.filter((d) => {
    if (!d.rooms.includes(room.id)) return false;
    if (side === 'n') return d.axis === 'z' && d.at === room.z0;
    if (side === 's') return d.axis === 'z' && d.at === room.z1;
    if (side === 'w') return d.axis === 'x' && d.at === room.x0;
    return d.axis === 'x' && d.at === room.x1;
  });
}

// Lav en kasse ud fra et interval langs væggen (u), på tværs (c) og i højden (y).
function wallBox(B, mat, side, u0, u1, c0, c1, y0, y1, opts) {
  const along = side === 'n' || side === 's' ? 'x' : 'z';
  const w = along === 'x' ? u1 - u0 : c1 - c0;
  const d = along === 'x' ? c1 - c0 : u1 - u0;
  const cx = along === 'x' ? (u0 + u1) / 2 : (c0 + c1) / 2;
  const cz = along === 'x' ? (c0 + c1) / 2 : (u0 + u1) / 2;
  return B.box(mat, w, y1 - y0, d, cx, (y0 + y1) / 2, cz, opts);
}

export function buildRooms(B, M, colliders) {
  const slots = [];
  const doorLeaves = {};
  for (const r of ROOMS) {
    const wallMat = M[r.wall];
    const trimMat = M[r.trim];
    const sides = {
      n: { face: r.z0 + T, c0: r.z0, c1: r.z0 + T, u0: r.x0, u1: r.x1, normal: [0, 1] },
      s: { face: r.z1 - T, c0: r.z1 - T, c1: r.z1, u0: r.x0, u1: r.x1, normal: [0, -1] },
      w: { face: r.x0 + T, c0: r.x0, c1: r.x0 + T, u0: r.z0 + T, u1: r.z1 - T, normal: [1, 0] },
      e: { face: r.x1 - T, c0: r.x1 - T, c1: r.x1, u0: r.z0 + T, u1: r.z1 - T, normal: [-1, 0] },
    };
    for (const [side, s] of Object.entries(sides)) {
      const gaps = doorsOn(r, side)
        .map((d) => ({ a: d.from, b: d.to, door: d }))
        .sort((a, b) => a.a - b.a);
      // Massive vægstykker mellem dørene
      const solids = [];
      let cur = s.u0;
      for (const g of gaps) {
        if (g.a > cur) solids.push([cur, g.a]);
        cur = g.b;
      }
      if (cur < s.u1) solids.push([cur, s.u1]);
      const faceIn = s.normal[0] + s.normal[1]; // +1 eller -1 (retning ind i rummet)
      const faceC = s.face;
      for (const [u0, u1] of solids) {
        wallBox(B, wallMat, side, u0, u1, s.c0, s.c1, 0, r.h, { uv: 2.5, grad: [0.8, 1.0] });
        if (side === 'n' || side === 's') colliders.add(u0, u1, s.c0, s.c1);
        else colliders.add(s.c0, s.c1, u0, u1);
        // fodpanel
        const bc0 = faceIn > 0 ? faceC : faceC - 0.03;
        wallBox(B, trimMat, side, u0, u1, bc0, bc0 + 0.03, 0, 0.15);
      }
      // overliggere over døre + dørindfatning
      for (const g of gaps) {
        wallBox(B, wallMat, side, g.a, g.b, s.c0, s.c1, g.door.h, r.h, { uv: 2.5, grad: [0.92, 1.0], gy0: 0, gy1: r.h });
        const t0 = faceIn > 0 ? faceC : faceC - 0.05;
        const cw = 0.16;
        wallBox(B, trimMat, side, g.a - cw, g.a, t0, t0 + 0.05, 0, g.door.h + cw);
        wallBox(B, trimMat, side, g.b, g.b + cw, t0, t0 + 0.05, 0, g.door.h + cw);
        wallBox(B, trimMat, side, g.a - cw, g.b + cw, t0, t0 + 0.05, g.door.h, g.door.h + cw);
        // tærskel
        const th = side === 'n' || side === 's' ? 'z' : 'x';
        const mid = g.door.at;
        if (th === 'z') B.box(M.marbleWhite, g.b - g.a, 0.01, 2 * T + 0.02, (g.a + g.b) / 2, 0.005, mid);
        else B.box(M.marbleWhite, 2 * T + 0.02, 0.01, g.b - g.a, mid, 0.005, (g.a + g.b) / 2);
      }
      // kronelist og billedliste
      const k0 = faceIn > 0 ? faceC : faceC - 0.09;
      wallBox(B, trimMat, side, s.u0, s.u1, k0, k0 + 0.09, r.h - 0.2, r.h);
      if (r.wires) {
        const p0 = faceIn > 0 ? faceC : faceC - 0.035;
        wallBox(B, M.brass, side, s.u0, s.u1, p0, p0 + 0.035, r.h - 0.62, r.h - 0.56);
      }
      // Ledige vægstykker til billeder
      if (!r.noAuto) {
        const reserved = (r.reserve && r.reserve[side]) || [];
        for (const [u0, u1] of solids) {
          const atStartDoor = gaps.some((g) => Math.abs(g.b - u0) < 1e-6);
          const atEndDoor = gaps.some((g) => Math.abs(g.a - u1) < 1e-6);
          let a = u0 + (atStartDoor ? 0.6 : 0.65);
          let b = u1 - (atEndDoor ? 0.6 : 0.65);
          let parts = [[a, b]];
          for (const [ra, rb] of reserved) {
            parts = parts.flatMap(([pa, pb]) => {
              if (rb <= pa || ra >= pb) return [[pa, pb]];
              const out = [];
              if (ra > pa) out.push([pa, ra - 0.4]);
              if (rb < pb) out.push([rb + 0.4, pb]);
              return out;
            });
          }
          for (const [pa, pb] of parts) {
            if (pb - pa > 1.2) slots.push({ room: r.id, side, along: side === 'n' || side === 's' ? 'x' : 'z', face: faceC, normal: s.normal, u0: pa, u1: pb });
          }
        }
      }
    }
    // gulv
    const fw = r.x1 - r.x0;
    const fd = r.z1 - r.z0;
    const fg = new THREE.PlaneGeometry(fw, fd);
    fg.rotateX(-Math.PI / 2);
    const uv = fg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * fw) / r.floorUV, (uv.getY(i) * fd) / r.floorUV);
    B.geom(M[r.floor], fg, [(r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2]);
    // loft med kassetter
    const cg = new THREE.PlaneGeometry(fw, fd);
    cg.rotateX(Math.PI / 2);
    B.geom(M[r.ceiling || 'ceiling'], cg, [(r.x0 + r.x1) / 2, r.h, (r.z0 + r.z1) / 2]);
    const beamMat = r.ceiling === 'ceilingDark' ? M.trimDark : M.trim;
    const step = r.id === 'hall' ? 4 : 2.5;
    for (let x = r.x0 + step; x < r.x1 - 0.5; x += step) B.box(beamMat, 0.16, 0.18, fd - 2 * T, x, r.h - 0.09, (r.z0 + r.z1) / 2);
    for (let z = r.z0 + step; z < r.z1 - 0.5; z += step) B.box(beamMat, fw - 2 * T, 0.18, 0.16, (r.x0 + r.x1) / 2, r.h - 0.09, z);
  }
  return { slots, doorLeaves };
}

// Dobbeltdøre. Returnerer pivots, som animeres når døren åbnes.
export function buildDoubleDoor(scene, M, { x, z, width, height, axis = 'z', leafMat, handleMat, inward = -1 }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  if (axis === 'x') group.rotation.y = Math.PI / 2;
  const leaves = [];
  const lw = width / 2;
  for (const sgn of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sgn * lw, 0, 0);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(lw, height, 0.07), leafMat);
    leaf.position.set(-sgn * lw / 2, height / 2, 0);
    pivot.add(leaf);
    // fyldinger og håndtag
    for (const [py, ph] of [[height * 0.72, height * 0.36], [height * 0.25, height * 0.3]]) {
      for (const side of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(lw * 0.68, ph, 0.02), handleMat);
        panel.scale.set(1, 1, 0.5);
        panel.position.set(-sgn * lw / 2, py, side * 0.04);
        const inner = new THREE.Mesh(new THREE.BoxGeometry(lw * 0.62, ph * 0.94, 0.022), leafMat);
        inner.position.copy(panel.position);
        inner.position.z += side * 0.002;
        pivot.add(panel, inner);
      }
    }
    for (const side of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 10), handleMat);
      handle.position.set(-sgn * (lw - 0.12), height * 0.5, side * 0.07);
      pivot.add(handle);
    }
    group.add(pivot);
    leaves.push({ pivot, sgn });
  }
  scene.add(group);
  let t = 0;
  let target = 0;
  return {
    group,
    get open() {
      return target === 1;
    },
    setOpen(v) {
      target = v ? 1 : 0;
    },
    update(dt) {
      t += (target - t) * Math.min(1, dt * 2.2);
      for (const { pivot, sgn } of leaves) pivot.rotation.y = sgn * inward * t * Math.PI * 0.5;
    },
  };
}

// --- Facade, trappe, gade og by ----------------------------------------------
export function buildExterior(B, M, colliders) {
  const fz0 = 10;
  const fz1 = EXT.facadeZ;
  // Facade med døråbning
  B.box(M.stone, 22 - 1.3, 9.9, fz1 - fz0, -(1.3 + 22) / 2, 4.05, (fz0 + fz1) / 2, { uv: 6 });
  B.box(M.stone, 22 - 1.3, 9.9, fz1 - fz0, (1.3 + 22) / 2, 4.05, (fz0 + fz1) / 2, { uv: 6 });
  B.box(M.stone, 2.6, 9 - 3.4, fz1 - fz0, 0, (9 + 3.4) / 2, (fz0 + fz1) / 2, { uv: 6 });
  colliders.add(-22, -1.3, fz0, fz1);
  colliders.add(1.3, 22, fz0, fz1);
  // Bygningens krop bag facaden (kun ydersider)
  B.box(M.building, 0.4, 10, 40, -22.2, 4, -10);
  B.box(M.building, 0.4, 10, 40, 22.2, 4, -10);
  B.box(M.building, 44.8, 0.4, 41, 0, 9.2, -9.5);
  B.box(M.building, 44.8, 10, 0.4, 0, 4, -30.2);
  // Gesims øverst
  B.box(M.stoneSmooth, 45, 0.45, 1.1, 0, 9.25, fz1 - 0.1);
  B.box(M.stoneSmooth, 45, 0.18, 1.3, 0, 9.55, fz1 - 0.05);
  // Dørindfatning på facaden og overvindue
  B.box(M.stoneSmooth, 0.35, 3.9, 0.15, -1.48, 1.95, fz1 + 0.07);
  B.box(M.stoneSmooth, 0.35, 3.9, 0.15, 1.48, 1.95, fz1 + 0.07);
  B.box(M.stoneSmooth, 3.3, 0.4, 0.2, 0, 3.6, fz1 + 0.08);
  const fan = new THREE.CircleGeometry(1.15, 32, 0, Math.PI);
  B.geom(M.windowGlow, fan, [0, 3.85, fz1 + 0.01]);
  B.box(M.stoneSmooth, 2.6, 0.12, 0.12, 0, 3.86, fz1 + 0.04);
  // Høje vinduer med lys bag
  const winX = [-20, -17, -14.4, -10.55, -7.25, -3.95, 3.95, 7.25, 10.55, 14.4, 17, 20];
  for (const wx of winX) {
    for (const [wy, wh] of [[2.6, 3.0], [6.5, 2.4]]) {
      if (Math.abs(wx) < 12 && wy > 5) continue; // portikoen dækker øverste række i midten
      B.box(M.windowGlow, 1.25, wh, 0.02, wx, wy, fz1 + 0.01);
      B.box(M.stoneSmooth, 1.55, 0.16, 0.22, wx, wy - wh / 2 - 0.08, fz1 + 0.1);
      B.box(M.stoneSmooth, 1.55, 0.22, 0.18, wx, wy + wh / 2 + 0.11, fz1 + 0.08);
      B.box(M.trimDark, 0.05, wh, 0.05, wx, wy, fz1 + 0.04);
      for (let k = 1; k < 4; k++) B.box(M.trimDark, 1.25, 0.04, 0.05, wx, wy - wh / 2 + (wh * k) / 4, fz1 + 0.04);
    }
  }
  // Portiko: platform, trin, søjler, bjælke og gavl
  const P = EXT.platformHalfW;
  B.box(M.stoneSmooth, 2 * P, 0.9, EXT.platformZ - fz1, 0, -0.45, (fz1 + EXT.platformZ) / 2, { uv: 3 });
  for (let i = 1; i <= 3; i++) {
    const z0 = EXT.platformZ + EXT.stepRun * (i - 1);
    const z1 = z0 + EXT.stepRun;
    const top = -EXT.stepRise * i;
    B.box(M.stoneSmooth, 2 * P, top + 0.9, z1 - z0, 0, (top - 0.9) / 2, (z0 + z1) / 2, { uv: 3 });
  }
  // lave brystværn langs platformens sider
  colliders.add(-P, -P + 0.5, fz1, EXT.sidewalkZ);
  colliders.add(P - 0.5, P, fz1, EXT.sidewalkZ);
  B.box(M.stoneSmooth, 0.5, 1.9, EXT.sidewalkZ - fz1, -P + 0.25, 0.05, (fz1 + EXT.sidewalkZ) / 2);
  B.box(M.stoneSmooth, 0.5, 1.9, EXT.sidewalkZ - fz1, P - 0.25, 0.05, (fz1 + EXT.sidewalkZ) / 2);
  B.box(M.stoneSmooth, 2.6, 0.9, 0.62, 0, -0.45, 10.3); // gulv under døråbningen
  const colX = [-8.9, -5.6, -2.3, 2.3, 5.6, 8.9];
  const shaft = new THREE.CylinderGeometry(0.38, 0.44, 7.0, 24, 1);
  for (const cx of colX) {
    B.geom(M.stoneSmooth, shaft, [cx, 0.3 + 3.5, 12.6]);
    B.box(M.stoneSmooth, 1.1, 0.3, 1.1, cx, 0.15, 12.6);
    B.box(M.stoneSmooth, 1.05, 0.3, 1.05, cx, 7.45, 12.6);
    colliders.add(cx - 0.5, cx + 0.5, 12.1, 13.1);
  }
  B.box(M.stoneSmooth, 2 * P, 1.1, 3.0, 0, 8.15, 12.1);
  const tri = new THREE.Shape();
  tri.moveTo(-P, 0);
  tri.lineTo(P, 0);
  tri.lineTo(0, 2.3);
  tri.closePath();
  const ped = new THREE.ExtrudeGeometry(tri, { depth: 2.8, bevelEnabled: false });
  B.geom(M.stoneSmooth, ped, [0, 8.7, 10.5]);
  // Rød løber: platform, trin og fortov
  const carpetW = 2.4;
  B.box(M.carpetRed, carpetW, 0.012, EXT.platformZ - 9.9 + 0.01, 0, 0.007, (9.9 + EXT.platformZ) / 2, { uv: 2 });
  for (let i = 1; i <= 3; i++) {
    const z0 = EXT.platformZ + EXT.stepRun * (i - 1);
    const top = -EXT.stepRise * i;
    B.box(M.carpetRed, carpetW, 0.012, EXT.stepRun + 0.01, 0, top + 0.006, z0 + EXT.stepRun / 2, { uv: 2 });
    B.box(M.carpetRed, carpetW, EXT.stepRise, 0.012, 0, top + EXT.stepRise / 2, z0 + 0.006, { uv: 2 });
  }
  B.box(M.carpetRed, carpetW, EXT.stepRise, 0.012, 0, EXT.sidewalkY + EXT.stepRise / 2, EXT.sidewalkZ + 0.006, { uv: 2 });
  B.box(M.carpetRed, carpetW, 0.012, EXT.curbZ - EXT.sidewalkZ, 0, EXT.sidewalkY + 0.006, (EXT.sidewalkZ + EXT.curbZ) / 2, { uv: 2 });
  for (const sx of [-1, 1]) {
    B.box(M.gold, 0.05, 0.014, EXT.curbZ - EXT.sidewalkZ, sx * (carpetW / 2 - 0.08), EXT.sidewalkY + 0.008, (EXT.sidewalkZ + EXT.curbZ) / 2);
    B.box(M.gold, 0.05, 0.014, EXT.platformZ - fz1, sx * (carpetW / 2 - 0.08), 0.008, (fz1 + EXT.platformZ) / 2);
  }
  // Fortov, kantsten, gade
  B.box(M.pavers, 80, 0.2, EXT.curbZ - fz1, 0, EXT.sidewalkY - 0.1, (fz1 + EXT.curbZ) / 2, { uv: 2 });
  B.box(M.curb, 80, 0.16, 0.25, 0, EXT.sidewalkY - 0.08 + 0.001, EXT.curbZ - 0.125);
  const road = new THREE.PlaneGeometry(120, 13);
  road.rotateX(-Math.PI / 2);
  const ruv = road.attributes.uv;
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * 20, ruv.getY(i) * 2.2);
  B.geom(M.asphalt, road, [0, EXT.streetY, 27.5]);
  for (let x = -58; x < 60; x += 6) B.box(M.linen, 3, 0.01, 0.14, x, EXT.streetY + 0.005, 27.5);
  B.box(M.pavers, 120, 0.2, 6, 0, EXT.sidewalkY - 0.1, 37, { uv: 2 });
  const ground = new THREE.PlaneGeometry(400, 400);
  ground.rotateX(-Math.PI / 2);
  B.geom(M.building, ground, [0, -0.95, 0]);
  // Bygninger over for galleriet og naboer
  const across = [
    [-46, 14, 13, 'cityA'], [-31, 12, 17, 'cityB'], [-18, 10, 12, 'cityA'], [-6, 13, 15, 'cityB'],
    [8, 12, 11, 'cityA'], [21, 11, 16, 'cityB'], [34, 13, 13, 'cityA'], [48, 12, 18, 'cityB'],
  ];
  for (const [bx, bw, bh, mat] of across) B.box(M[mat], bw, bh, 9, bx, bh / 2 - 0.9, 44.5, { uv: 8 });
  B.box(M.cityB, 16, 13, 30, -31, 5.6, -5, { uv: 8 });
  B.box(M.cityA, 16, 11, 30, 31, 4.6, -5, { uv: 8 });
  // Grænser for hvor man kan gå udenfor
  colliders.add(-18.5, -18, fz1, 31);
  colliders.add(18, 18.5, fz1, 31);
  colliders.add(-18.5, 18.5, 30.5, 31);
}

export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(300, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = clamp(vP.y, -0.2, 1.0);
        vec3 zenith = vec3(0.012, 0.016, 0.045);
        vec3 mid = vec3(0.06, 0.05, 0.14);
        vec3 horizon = vec3(0.34, 0.2, 0.22);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        c = mix(c, zenith, smoothstep(0.18, 0.8, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -10;
  scene.add(sky);
  // stjerner
  const n = 900;
  const pos = new Float32Array(n * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const th = rnd() * Math.PI * 2;
    const y = 0.12 + rnd() * 0.88;
    const rr = Math.sqrt(1 - y * y);
    pos.set([Math.cos(th) * rr * 280, y * 280, Math.sin(th) * rr * 280], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fff8ea', size: 1.6, sizeAttenuation: false, depthWrite: false, toneMapped: false }));
  stars.renderOrder = -9;
  scene.add(stars);
  return { sky, stars };
}
