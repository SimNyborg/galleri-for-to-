// Placering af billeder på væggene og de forskellige rammetyper.
import * as THREE from 'three';
import { ROOMS, T } from './world.js';
import { matrixFrom } from './builder.js';
import { canvas, wrapText, rng } from './util.js';

const AUTO_STYLES = ['gold', 'black', 'oak', 'white', 'canvas', 'polaroid'];
const MIN_SPACING = 1.9;

// --- Fordeling ----------------------------------------------------------------
// items: billeder (isVideo=false) og videoer (isVideo=true). Alle har en sal i kataloget.
export function layoutPhotos(photos, videos, slots) {
  const roomById = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
  const fallback = (id) => (roomById[id] ? id : 'hall');
  let autoStyle = 0;
  const assigned = [
    ...photos.map((p, i) => ({ photo: p, index: i, isVideo: false, room: fallback(p.room), place: p.place || null })),
    ...videos.map((v, i) => ({ photo: v, index: i, isVideo: true, room: fallback(v.room), place: null, style: 'screen' })),
  ];
  for (const a of assigned) {
    if (a.isVideo) continue;
    a.style = a.photo.style && a.photo.style !== 'auto' ? a.photo.style : AUTO_STYLES[autoStyle++ % AUTO_STYLES.length];
  }

  const placements = [];
  for (const r of ROOMS) {
    let items = assigned.filter((a) => a.room === r.id);
    if (!items.length) continue;
    if (r.id === 'final') {
      placeFinal(r, items, placements);
      continue;
    }
    if (r.id === 'salon') {
      placeSalonHang(r, items.filter((a) => a.place === 'hang'), placements);
      placeMantel(r, items.filter((a) => a.place === 'mantel'), placements);
      items = items.filter((a) => a.place !== 'hang' && a.place !== 'mantel');
    }
    const floorItems = items.filter((a) => a.style === 'easel');
    const wallItems = items.filter((a) => a.style !== 'easel');
    placeEasels(r, floorItems, placements);
    if (!wallItems.length) continue;
    // Sortér vægstykker rundt i rummet med start ved indgangen.
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const a0 = Math.atan2(r.entry[1] - cz, r.entry[0] - cx);
    const roomSlots = slots
      .filter((s) => s.room === r.id)
      .map((s) => {
        const mu = (s.u0 + s.u1) / 2;
        const mx = s.along === 'x' ? mu : s.face;
        const mz = s.along === 'x' ? s.face : mu;
        let ang = Math.atan2(mz - cz, mx - cx) - a0;
        while (ang < 0) ang += Math.PI * 2;
        return { ...s, ang, len: s.u1 - s.u0 };
      })
      .sort((p, q) => p.ang - q.ang);
    if (!roomSlots.length) {
      console.warn('Ingen vægplads i', r.id);
      continue;
    }
    const total = roomSlots.reduce((s2, x) => s2 + x.len, 0);
    const N = wallItems.length;
    // Fordel med største-rest-metoden.
    const raw = roomSlots.map((s2) => (N * s2.len) / total);
    const k = raw.map(Math.floor);
    let rest = N - k.reduce((a, b) => a + b, 0);
    raw
      .map((v, i) => [v - Math.floor(v), i])
      .sort((a, b) => b[0] - a[0])
      .forEach(([, i]) => {
        if (rest > 0) {
          k[i]++;
          rest--;
        }
      });
    let n = 0;
    roomSlots.forEach((s2, i) => {
      const count = k[i];
      if (!count) return;
      const spacing = s2.len / count;
      for (let j = 0; j < count; j++) {
        const item = wallItems[n++];
        const u = s2.u0 + (j + 0.5) * spacing;
        placements.push(makeWallPlacement(r, s2, u, spacing, item));
      }
    });
  }
  return placements;
}

function frameExtra(style, H) {
  // [vandret kant, lodret kant, ekstra i bunden] i meter
  switch (style) {
    case 'gold': return [0.17, 0.17, 0];
    case 'masterpiece': return [0.34, 0.34, 0];
    case 'black': return [0.16, 0.16, 0];
    case 'oak': return [0.16, 0.16, 0];
    case 'white': return [0.14, 0.14, 0];
    case 'canvas': return [0.01, 0.01, 0];
    case 'oval': return [0.08, 0.08, 0];
    case 'polaroid': return [0.07, 0.07, 0.2 * H];
    case 'lightbox': return [0.04, 0.04, 0];
    case 'phone': return [0.04, 0.06, 0];
    case 'screen': return [0.05, 0.05, 0];
    default: return [0.1, 0.1, 0];
  }
}

function sizeFor(photo, style, targetH, maxW) {
  const a = photo.w / photo.h;
  let h = a > 1.05 ? targetH * 0.86 : targetH;
  if (style === 'polaroid') h *= 0.72;
  if (style === 'phone') h *= 1.05;
  if (style === 'screen') h *= 1.1;
  let w = h * a;
  const [bx] = frameExtra(style, h);
  if (w + 2 * bx > maxW) {
    w = maxW - 2 * bx;
    h = w / a;
  }
  return [w, h];
}

function makeWallPlacement(room, slot, u, spacing, item) {
  const n = slot.normal;
  const maxW = Math.min(spacing - 0.85, 2.6);
  const [w, h] = sizeFor(item.photo, item.style, room.photoH, maxW);
  const x = slot.along === 'x' ? u : slot.face;
  const z = slot.along === 'x' ? slot.face : u;
  return {
    ...item,
    roomDef: room,
    kind: 'wall',
    pos: new THREE.Vector3(x, room.center, z),
    normal: new THREE.Vector3(n[0], 0, n[1]),
    rotY: Math.atan2(n[0], n[1]),
    w,
    h,
  };
}

// Klassisk salonophængning: to rækker tæt ophængte værker på nordvæggen.
function placeSalonHang(room, items, out) {
  if (!items.length) return;
  const face = room.z0 + T;
  const cx = (room.x0 + room.x1) / 2;
  const lowerN = Math.ceil(items.length / 2) + (items.length > 4 ? 0 : 0);
  const rows = [
    { y: 1.62, items: items.slice(0, lowerN), sizes: [1.02, 0.84, 1.1, 0.9, 1.0] },
    { y: 3.0, items: items.slice(lowerN), sizes: [0.82, 0.95, 0.8, 0.9] },
  ];
  const gap = 0.34;
  for (const row of rows) {
    const dims = row.items.map((it, i) => {
      const [w, h] = sizeFor(it.photo, it.style, row.sizes[i % row.sizes.length], 2.0);
      const [bx, by, extra] = frameExtra(it.style, h);
      return { it, w, h, ow: w + 2 * bx, oh: h + 2 * by + extra };
    });
    const total = dims.reduce((a, d) => a + d.ow, 0) + gap * (dims.length - 1);
    let x = cx - total / 2;
    for (const d of dims) {
      const px = x + d.ow / 2;
      out.push({ ...d.it, roomDef: room, kind: 'wall', hang: true, noPlaque: true, pictureLight: true, pos: new THREE.Vector3(px, row.y, face), normal: new THREE.Vector3(0, 0, 1), rotY: 0, w: d.w, h: d.h });
      x += d.ow + gap;
    }
  }
}

// Værket over kaminen på vestvæggen.
function placeMantel(room, items, out) {
  items.slice(0, 1).forEach((it) => {
    const [w, h] = sizeFor(it.photo, it.style, 1.2, 1.6);
    out.push({ ...it, roomDef: room, kind: 'wall', plaqueBelow: true, pictureLight: true, pos: new THREE.Vector3(room.x0 + T, 2.78, (room.z0 + room.z1) / 2), normal: new THREE.Vector3(1, 0, 0), rotY: Math.PI / 2, w, h });
  });
}

function placeEasels(room, items, out) {
  // Staffelier står frit på gulvet og vender mod rummets midte/indgang.
  const spots = {
    hall: [[-5.2, -11.6], [5.2, -11.6]],
    foyer: [[-3.6, 3.2], [3.6, 7.6]],
    sushi: [[-18.6, -3.6], [-11.6, -12.6]],
    cafe: [[12.2, -12.4], [12.2, -3.4]],
  }[room.id] || [[(room.x0 + room.x1) / 2, (room.z0 + room.z1) / 2]];
  items.forEach((item, i) => {
    const [x, z] = spots[i % spots.length];
    const tx = room.entry[0];
    const tz = room.entry[1];
    const cx = (room.x0 + room.x1) / 2;
    const cz = (room.z0 + room.z1) / 2;
    // vend mod et punkt mellem indgang og midte
    const fx = (tx + cx) / 2 - x;
    const fz = (tz + cz) / 2 - z;
    const rotY = Math.atan2(fx, fz);
    const [w, h] = sizeFor(item.photo, 'canvas', 1.0, 1.3);
    out.push({ ...item, roomDef: room, kind: 'easel', pos: new THREE.Vector3(x, 1.42, z), normal: new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)), rotY, w, h });
  });
}

export const MASTER_SPOT = { x: 0, y: 2.45, z: -26 + T };

function placeFinal(room, items, out) {
  const photos = items.filter((a) => !a.isVideo);
  const vids = items.filter((a) => a.isVideo);
  const master = photos.find((a) => a.style === 'masterpiece') || photos[0];
  const others = photos.filter((a) => a !== master);
  if (master) {
    const a = master.photo.w / master.photo.h;
    const h = a > 1 ? 2.2 : 2.55;
    out.push({ ...master, style: 'masterpiece', roomDef: room, kind: 'wall', master: true, pos: new THREE.Vector3(MASTER_SPOT.x, MASTER_SPOT.y, MASTER_SPOT.z), normal: new THREE.Vector3(0, 0, 1), rotY: 0, w: h * a, h });
  }
  // Øvrige billeder på øst-, syd- og vestvæggen.
  const spots = [
    [room.x1 - T, -21, [-1, 0], 2.2],
    [-3.1, room.z1 - T, [0, -1], 1.5],
    [3.1, room.z1 - T, [0, -1], 1.5],
    [room.x0 + T, -23.5, [1, 0], 1.4],
    [room.x1 - T, -24.0, [-1, 0], 1.3],
    [room.x0 + T, -18.5, [1, 0], 1.3],
  ];
  others.forEach((item, i) => {
    const [x, z, n, maxW] = spots[i % spots.length];
    const style = item.style === 'masterpiece' ? 'gold' : item.style;
    const [w, h] = sizeFor(item.photo, style, 1.35, maxW);
    out.push({ ...item, style, roomDef: room, kind: 'wall', pos: new THREE.Vector3(x, 1.8, z), normal: new THREE.Vector3(n[0], 0, n[1]), rotY: Math.atan2(n[0], n[1]), w, h });
  });
  vids.forEach((item, i) => {
    const [w, h] = sizeFor(item.photo, 'screen', 1.45, 1.4);
    const z = -21 + i * 2.6;
    out.push({ ...item, style: 'screen', roomDef: room, kind: 'wall', pos: new THREE.Vector3(room.x0 + T, 1.85, z), normal: new THREE.Vector3(1, 0, 0), rotY: Math.PI / 2, w, h });
  });
}

// --- Geometri-hjælpere --------------------------------------------------------
function bar(len, bw, d, vertical, uvLen = 0.26) {
  const g = new THREE.BoxGeometry(vertical ? bw : len, vertical ? len : bw, d);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const along = vertical ? pos.getY(i) : pos.getX(i);
    const across = vertical ? pos.getX(i) : pos.getY(i);
    uv.setXY(i, along / uvLen, across / bw + 0.5);
  }
  return g;
}

// Fire lister rundt om en åbning W x H. z0 = bagkant.
function rectFrame(parts, mat, W, H, bw, d, z0, uvLen) {
  const zc = z0 + d / 2;
  parts.push({ g: bar(W + 2 * bw, bw, d, false, uvLen), m: mat, p: [0, H / 2 + bw / 2, zc] });
  parts.push({ g: bar(W + 2 * bw, bw, d, false, uvLen), m: mat, p: [0, -H / 2 - bw / 2, zc] });
  parts.push({ g: bar(H, bw, d, true, uvLen), m: mat, p: [-W / 2 - bw / 2, 0, zc] });
  parts.push({ g: bar(H, bw, d, true, uvLen), m: mat, p: [W / 2 + bw / 2, 0, zc] });
}

function slab(parts, mat, w, h, d, z0, x = 0, y = 0) {
  parts.push({ g: new THREE.BoxGeometry(w, h, d), m: mat, p: [x, y, z0 + d / 2] });
}

function ellipseShape(rx, ry, segments = 64) {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
  s.autoClose = true;
  return s;
}

// Bygger en ramme. Returnerer statiske dele, fotoets geometri og hvor langt fremme fotoet sidder.
function buildFrameParts(style, w, h, M, seedRot) {
  const parts = [];
  let photoGeom = new THREE.PlaneGeometry(w, h);
  let photoZ = 0.02;
  let photoOffset = [0, 0];
  let outerW = w;
  let outerH = h;
  let localRot = 0;
  switch (style) {
    case 'gold':
    case 'masterpiece': {
      const k = style === 'masterpiece' ? 2 : 1;
      const slip = 0.014 * k;
      const lip = 0.022 * k;
      const band = 0.1 * k;
      const bead = 0.025 * k;
      rectFrame(parts, M.slip, w, h, slip, 0.05, 0);
      rectFrame(parts, M.gold, w + 2 * slip, h + 2 * slip, lip, 0.075 * (k > 1 ? 1.3 : 1), 0);
      const w2 = w + 2 * (slip + lip);
      const h2 = h + 2 * (slip + lip);
      rectFrame(parts, M.goldOrnate, w2, h2, band, 0.06 * (k > 1 ? 1.3 : 1), 0, 0.26 * k);
      const w3 = w2 + 2 * band;
      const h3 = h2 + 2 * band;
      rectFrame(parts, M.gold, w3, h3, bead, 0.09 * (k > 1 ? 1.3 : 1), 0);
      if (k > 1) rectFrame(parts, M.goldOrnate, w3 + 2 * bead, h3 + 2 * bead, 0.07, 0.07, 0, 0.3);
      outerW = w3 + 2 * bead + (k > 1 ? 0.14 : 0);
      outerH = h3 + 2 * bead + (k > 1 ? 0.14 : 0);
      photoZ = 0.03;
      break;
    }
    case 'black':
    case 'oak':
    case 'white': {
      const frameMat = style === 'black' ? M.frameBlack : style === 'oak' ? M.frameOak : M.frameWhite;
      const matMat = style === 'oak' ? M.matCream : M.mat;
      const bw = style === 'oak' ? 0.05 : style === 'white' ? 0.034 : 0.03;
      const mat = style === 'white' ? 0.1 : 0.12;
      slab(parts, matMat, w + 2 * mat, h + 2 * mat, 0.016, 0);
      // indre skrå kant på passepartoutet
      rectFrame(parts, M.linen, w, h, 0.008, 0.019, 0);
      rectFrame(parts, frameMat, w + 2 * mat, h + 2 * mat, bw, 0.042, 0);
      outerW = w + 2 * (mat + bw);
      outerH = h + 2 * (mat + bw);
      photoZ = 0.0175;
      break;
    }
    case 'canvas': {
      slab(parts, M.canvasSide, w, h, 0.045, 0.02);
      const sh = new THREE.PlaneGeometry(w * 1.25, h * 1.2);
      parts.push({ g: sh, m: M.shadow, p: [0.03, -0.04, 0.003] });
      photoZ = 0.0655;
      break;
    }
    case 'oval': {
      const rx = w / 2;
      const ry = h / 2;
      const shape = ellipseShape(rx, ry);
      photoGeom = new THREE.ShapeGeometry(shape, 64);
      const uv = photoGeom.attributes.uv;
      const pos = photoGeom.attributes.position;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
      const ring = ellipseShape(rx + 0.075, ry + 0.075);
      ring.holes.push(ellipseShape(rx - 0.004, ry - 0.004));
      const rg = new THREE.ExtrudeGeometry(ring, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.014, bevelSegments: 2, curveSegments: 64 });
      parts.push({ g: rg, m: M.gold, p: [0, 0, 0.004] });
      const back = new THREE.ShapeGeometry(ellipseShape(rx + 0.02, ry + 0.02), 48);
      parts.push({ g: back, m: M.slip, p: [0, 0, 0.012] });
      outerW = w + 0.18;
      outerH = h + 0.18;
      photoZ = 0.02;
      break;
    }
    case 'polaroid': {
      const side = 0.06 * Math.max(w, 0.6);
      const bottom = 0.22 * Math.max(w, 0.6);
      const cw = w + 2 * side;
      const ch = h + side + bottom;
      const yOff = (bottom - side) / 2; // fotoet sidder højere end kortets midte
      slab(parts, M.polaroid, cw, ch, 0.006, 0.006, 0, -yOff);
      photoOffset = [0, 0];
      outerW = cw;
      outerH = ch;
      photoZ = 0.0125;
      localRot = (seedRot - 0.5) * 0.09;
      // tape øverst
      const tape = new THREE.PlaneGeometry(0.16, 0.05);
      parts.push({ g: tape, m: M.tape, p: [0, h / 2 + side * 0.4, 0.0135], r: [0, 0, (seedRot - 0.5) * 0.3] });
      break;
    }
    case 'lightbox': {
      rectFrame(parts, M.frameAlu, w, h, 0.03, 0.09, 0);
      slab(parts, M.warmLight, w + 0.004, h + 0.004, 0.06, 0.02);
      const halo = new THREE.PlaneGeometry(w * 1.7 + 0.6, h * 1.5 + 0.6);
      parts.push({ g: halo, m: M.glow, p: [0, 0, 0.004] });
      photoZ = 0.0815;
      outerW = w + 0.06;
      outerH = h + 0.06;
      break;
    }
    case 'screen': {
      slab(parts, M.frameBlack, w + 0.08, h + 0.08, 0.05, 0);
      rectFrame(parts, M.brass, w + 0.08, h + 0.08, 0.018, 0.056, 0);
      photoZ = 0.051;
      outerW = w + 0.116;
      outerH = h + 0.116;
      break;
    }
    case 'phone': {
      // smartphone med sort kant, kameraø og knapper
      slab(parts, M.frameBlack, w + 0.07, h + 0.12, 0.022, 0.004);
      rectFrame(parts, M.chrome, w + 0.07, h + 0.12, 0.008, 0.024, 0.003);
      slab(parts, M.chrome, 0.006, 0.12, 0.012, 0.008, (w + 0.07) / 2 + 0.01, 0.12);
      slab(parts, M.chrome, 0.006, 0.06, 0.012, 0.008, (w + 0.07) / 2 + 0.01, -0.04);
      parts.push({ g: new THREE.CircleGeometry(0.009, 12), m: M.frameBlack, p: [0, h / 2 + 0.03, 0.0275] });
      const sh = new THREE.PlaneGeometry((w + 0.07) * 1.3, (h + 0.12) * 1.15);
      parts.push({ g: sh, m: M.shadow, p: [0.02, -0.03, 0.002] });
      photoZ = 0.0265;
      outerW = w + 0.086;
      outerH = h + 0.136;
      break;
    }
    default:
      break;
  }
  return { parts, photoGeom, photoZ, photoOffset, outerW, outerH, localRot };
}

// --- Skilte -------------------------------------------------------------------
function plaqueCanvas(photo, label, dark) {
  const W = 512;
  const pad = 30;
  const [mc, mctx] = canvas(8, 8);
  mctx.font = 'italic 600 46px "Cormorant Garamond", Georgia, serif';
  const titleLines = wrapText(mctx, photo.title || 'Uden titel', W - 2 * pad);
  mctx.font = '500 19px Inter, system-ui, sans-serif';
  const subLines = photo.sub ? wrapText(mctx, photo.sub.toUpperCase(), W - 2 * pad) : [];
  mctx.font = '500 27px "Cormorant Garamond", Georgia, serif';
  const descLines = photo.desc ? wrapText(mctx, photo.desc, W - 2 * pad) : [];
  const H = Math.ceil(pad + titleLines.length * 48 + 8 + subLines.length * 26 + (descLines.length ? 14 : 0) + descLines.length * 31 + 40 + pad * 0.6);
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = dark ? '#16110d' : '#f8f5ef';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = dark ? 'rgba(214,176,98,0.7)' : 'rgba(0,0,0,0.08)';
  ctx.lineWidth = dark ? 4 : 2;
  ctx.strokeRect(dark ? 10 : 1, dark ? 10 : 1, W - (dark ? 20 : 2), H - (dark ? 20 : 2));
  let y = pad + 38;
  ctx.fillStyle = dark ? '#e7c77e' : '#161412';
  ctx.font = 'italic 600 46px "Cormorant Garamond", Georgia, serif';
  for (const l of titleLines) {
    ctx.fillText(l, pad, y);
    y += 48;
  }
  y -= 14;
  ctx.fillStyle = dark ? '#c9b48a' : '#7a7266';
  ctx.font = '500 19px Inter, system-ui, sans-serif';
  for (const l of subLines) {
    y += 26;
    ctx.fillText(l, pad, y);
  }
  y += descLines.length ? 14 : 0;
  ctx.fillStyle = dark ? '#efe3c8' : '#2d2a26';
  ctx.font = '500 27px "Cormorant Garamond", Georgia, serif';
  for (const l of descLines) {
    y += 31;
    ctx.fillText(l, pad, y);
  }
  ctx.fillStyle = dark ? '#a8925f' : '#a49b8d';
  ctx.font = '500 16px Inter, system-ui, sans-serif';
  ctx.fillText(typeof label === 'number' ? `NR. ${String(label).padStart(2, '0')}` : String(label), pad, H - pad * 0.7);
  return c;
}

function polaroidCaption(text) {
  const [c, ctx] = canvas(512, 96);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.clearRect(0, 0, 512, 96);
  ctx.fillStyle = '#2b3a67';
  ctx.font = '500 52px Caveat, "Comic Sans MS", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 52, 490);
  return c;
}

// --- Byg alle billeder --------------------------------------------------------
export function buildPhotos(scene, B, M, placements, ceilingFixtures = true) {
  M.tape = M.tape || new THREE.MeshStandardMaterial({ color: '#e8d9b5', transparent: true, opacity: 0.8, roughness: 0.9 });
  const items = [];
  const r = rng(99);
  const fixtureCan = new THREE.CylinderGeometry(0.05, 0.065, 0.18, 14);
  const fixtureStem = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6);
  const wire = new THREE.CylinderGeometry(0.0022, 0.0022, 1, 4);
  const easelLeg = new THREE.BoxGeometry(0.045, 2.0, 0.045);

  placements.forEach((pl, idx) => {
    const style = pl.style;
    const seedRot = r();
    const fp = buildFrameParts(style, pl.w, pl.h, M, seedRot);
    const base = new THREE.Matrix4().compose(
      pl.pos.clone(),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(pl.kind === 'easel' ? -0.12 : 0, pl.rotY, 0, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    if (pl.kind === 'easel') {
      // staffeliet: lærredet står lidt fremme fra benene
      base.multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.12));
    }
    const local = new THREE.Matrix4().makeRotationZ(fp.localRot);
    const frameMatrix = base.clone().multiply(local);
    for (const part of fp.parts) {
      const m = frameMatrix.clone().multiply(matrixFrom(part.p, part.r || [0, 0, 0]));
      B.add(part.g, part.m, m);
      part.g.dispose();
    }
    // Fotoet
    const photoMat = new THREE.MeshBasicMaterial({ color: pl.isVideo ? '#151515' : pl.photo.color || '#777777', toneMapped: false });
    const mesh = new THREE.Mesh(fp.photoGeom, photoMat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(frameMatrix).multiply(new THREE.Matrix4().makeTranslation(fp.photoOffset[0], fp.photoOffset[1], fp.photoZ));
    mesh.matrixWorldNeedsUpdate = true;
    const tag = pl.isVideo ? { videoIndex: pl.index } : { photoIndex: pl.index };
    Object.assign(mesh.userData, tag);
    scene.add(mesh);

    const n = pl.normal;
    const right = new THREE.Vector3(n.z, 0, -n.x);
    // Håndskrevet tekst på polaroid
    if (style === 'polaroid') {
      const ct = new THREE.CanvasTexture(polaroidCaption(pl.photo.title));
      ct.colorSpace = THREE.SRGBColorSpace;
      const cm = new THREE.Mesh(new THREE.PlaneGeometry(pl.w * 0.95, pl.w * 0.95 * (96 / 512)), new THREE.MeshBasicMaterial({ map: ct, transparent: true, toneMapped: false }));
      const side = 0.06 * Math.max(pl.w, 0.6);
      const bottom = 0.22 * Math.max(pl.w, 0.6);
      cm.matrixAutoUpdate = false;
      cm.matrix.copy(frameMatrix).multiply(new THREE.Matrix4().makeTranslation(0, -pl.h / 2 - bottom / 2 + side * 0.15, 0.0135));
      Object.assign(cm.userData, tag);
      scene.add(cm);
    }

    // Museumsskilt
    const dark = pl.roomDef.id === 'final' || pl.roomDef.id === 'sushi' || pl.roomDef.id === 'salon';
    let plaque = null;
    const pc = pl.noPlaque ? null : plaqueCanvas(pl.photo, pl.isVideo ? 'VIDEOINSTALLATION' : pl.index + 1, dark);
    if (pc) {
    const pt = new THREE.CanvasTexture(pc);
    pt.colorSpace = THREE.SRGBColorSpace;
    pt.anisotropy = 4;
    const pw = 0.3;
    const ph = pw * (pc.height / pc.width);
    plaque = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: pt, toneMapped: false, color: dark ? '#ffffff' : '#f2efe8' }));
    let plaquePos;
    if (pl.kind === 'easel') {
      // lille skilt på en stander ved siden af staffeliet
      plaquePos = pl.pos.clone().addScaledVector(right, 0.85).addScaledVector(n, 0.35);
      plaquePos.y = 1.02;
      B.box(M.brass, 0.03, 0.95, 0.03, plaquePos.x - n.x * 0.03, 0.48, plaquePos.z - n.z * 0.03);
      B.box(M.brass, 0.26, 0.02, 0.26, plaquePos.x - n.x * 0.03, 0.01, plaquePos.z - n.z * 0.03);
      B.box(M.frameBlack, pw + 0.02, ph + 0.02, 0.012, plaquePos.x - n.x * 0.008, plaquePos.y, plaquePos.z - n.z * 0.008, { ry: pl.rotY, rx: 0 });
    } else if (pl.plaqueBelow) {
      plaquePos = pl.pos.clone().addScaledVector(n, 0.012);
      plaquePos.y = pl.pos.y - fp.outerH / 2 - ph / 2 - 0.1;
      B.box(M.gold, pw + 0.014, ph + 0.014, 0.01, plaquePos.x - n.x * 0.006, plaquePos.y, plaquePos.z - n.z * 0.006, { ry: pl.rotY });
    } else {
      const off = fp.outerW / 2 + 0.14 + pw / 2;
      plaquePos = pl.pos.clone().addScaledVector(right, off).addScaledVector(n, 0.012);
      plaquePos.y = Math.min(1.38, pl.pos.y - 0.12);
      B.box(dark ? M.gold : M.frameWhite, pw + 0.014, ph + 0.014, 0.01, plaquePos.x - n.x * 0.006, plaquePos.y, plaquePos.z - n.z * 0.006, { ry: pl.rotY });
    }
    plaque.position.copy(plaquePos);
    plaque.rotation.y = pl.rotY;
    Object.assign(plaque.userData, tag);
    scene.add(plaque);
    }

    // Lys: kegle på væggen + spot i loftet
    if (pl.kind === 'wall') {
      const pool = new THREE.PlaneGeometry(fp.outerW * 1.45 + 0.7, fp.outerH * 1.45 + 0.8);
      const pm = base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.2, 0.004));
      B.add(pool, M.pool, pm);
      pool.dispose();
      if (pl.pictureLight) {
        // billedlampe i messing over rammen
        const top = pl.pos.y + fp.outerH / 2 + 0.06;
        const lw = Math.min(0.7, fp.outerW * 0.6);
        B.box(M.brass, lw, 0.05, 0.05, pl.pos.x + n.x * 0.16, top + 0.04, pl.pos.z + n.z * 0.16, { ry: pl.rotY });
        B.box(M.brass, 0.025, 0.025, 0.16, pl.pos.x + n.x * 0.08, top, pl.pos.z + n.z * 0.08, { ry: pl.rotY });
        B.box(M.warmLight, lw - 0.04, 0.012, 0.03, pl.pos.x + n.x * 0.16, top + 0.012, pl.pos.z + n.z * 0.16, { ry: pl.rotY });
      } else if (ceilingFixtures) {
        const hRoom = pl.roomDef.h;
        const out = 1.25;
        const fx = pl.pos.x + n.x * out;
        const fz = pl.pos.z + n.z * out;
        const fy = hRoom - 0.33;
        B.geom(M.frameBlack, fixtureStem, [fx, hRoom - 0.12, fz]);
        // peg mod billedet
        const dir = new THREE.Vector3(pl.pos.x - fx, pl.pos.y - fy, pl.pos.z - fz).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
        const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
        B.geom(M.frameBlack, fixtureCan, [fx, fy, fz], [e.x, e.y, e.z]);
        const lens = new THREE.CircleGeometry(0.045, 12);
        const lq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        const le = new THREE.Euler().setFromQuaternion(lq, 'YXZ');
        B.geom(M.warmLight, lens, [fx + dir.x * 0.095, fy + dir.y * 0.095, fz + dir.z * 0.095], [le.x, le.y, le.z]);
        lens.dispose();
      }
      // Ophængningssnore i salen med billedliste
      if (pl.roomDef.wires && style !== 'polaroid') {
        const top = pl.pos.y + fp.outerH / 2;
        const railY = pl.roomDef.h - 0.59;
        const len = railY - top;
        for (const s of [-1, 1]) {
          const off = s * (fp.outerW / 2 - 0.12);
          const wx = pl.pos.x + right.x * off + n.x * 0.01;
          const wz = pl.pos.z + right.z * off + n.z * 0.01;
          B.geom(M.silver, wire, [wx, top + len / 2, wz], [0, 0, 0], [1, len, 1]);
          B.box(M.brass, 0.03, 0.05, 0.04, wx + n.x * 0.01, railY - 0.02, wz + n.z * 0.01);
        }
      }
    }
    if (pl.kind === 'easel') {
      // staffeliets ben og hylde
      const legs = [
        [-0.42, 0.95, 0.12, 0.07, 0, 0.18],
        [0.42, 0.95, 0.12, 0.07, 0, -0.18],
        [0, 0.95, -0.38, -0.32, 0, 0],
      ];
      const em = new THREE.Matrix4().compose(new THREE.Vector3(pl.pos.x, 0, pl.pos.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pl.rotY, 0)), new THREE.Vector3(1, 1, 1));
      for (const [lx, ly, lz, rx, , rz] of legs) {
        B.add(easelLeg, M.oak, em.clone().multiply(matrixFrom([lx, ly, lz], [rx, 0, rz])));
      }
      B.add(new THREE.BoxGeometry(1.1, 0.05, 0.12), M.oak, em.clone().multiply(matrixFrom([0, pl.pos.y - pl.h / 2 - 0.05, 0.16])));
      B.add(new THREE.BoxGeometry(0.06, 0.06, 0.08), M.oak, em.clone().multiply(matrixFrom([0, pl.pos.y + pl.h / 2 + 0.03, 0.1])));
      const sh = new THREE.PlaneGeometry(1.6, 1.1);
      sh.rotateX(-Math.PI / 2);
      B.add(sh, M.shadow, em.clone().multiply(matrixFrom([0, 0.004, 0])));
    }
    items.push({ placement: pl, mesh, plaque, outerW: fp.outerW, outerH: fp.outerH, isVideo: !!pl.isVideo });
  });
  return items;
}

// Videoskærm på en væg.
export function buildScreen(scene, B, M, { x, y, z, normal, w, h, texture }) {
  const rotY = Math.atan2(normal[0], normal[1]);
  const fp = buildFrameParts('screen', w, h, M, 0.5);
  const base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(1, 1, 1));
  for (const part of fp.parts) B.add(part.g, part.m, base.clone().multiply(matrixFrom(part.p)));
  const mesh = new THREE.Mesh(fp.photoGeom, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(base).multiply(new THREE.Matrix4().makeTranslation(0, 0, fp.photoZ));
  scene.add(mesh);
  const pool = new THREE.PlaneGeometry(w * 1.8 + 0.6, h * 1.4 + 0.6);
  B.add(pool, M.pool, base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.15, 0.004)));
  return { mesh, rotY, plaqueAnchor: new THREE.Vector3(x, y, z) };
}

export { plaqueCanvas };
