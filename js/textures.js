// Procedurelle teksturer tegnet på canvas, så galleriet ikke behøver billedfiler.
import * as THREE from 'three';
import { canvas, rng } from './util.js';

let maxAniso = 4;
export function setMaxAnisotropy(v) {
  maxAniso = v;
}

export function toTexture(c, { repeat = [1, 1], srgb = true, wrap = true, aniso = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  if (aniso) t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

// --- Tileable value noise -------------------------------------------------
const LATTICE = 256;
const grid = (() => {
  const r = rng(1234);
  const g = new Float32Array(LATTICE * LATTICE);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return g;
})();

function noise(x, y, period) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = grid[y0 * LATTICE + x0];
  const b = grid[y0 * LATTICE + x1];
  const c = grid[y1 * LATTICE + x0];
  const d = grid[y1 * LATTICE + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// u, v i [0,1). freq = antal celler over teksturen (heltal => tileable).
function fbm(u, v, freq, oct = 5) {
  let sum = 0;
  let amp = 0.5;
  let f = freq;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise(u * f, v * f, Math.min(f, LATTICE));
    f *= 2;
    amp *= 0.5;
  }
  return sum;
}

function pixels(size, fn) {
  const [c, ctx] = canvas(size, size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const [r, g, b] = fn(x / size, y / size);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function marbleCanvas(size, base, vein, { seed = 0, veinK = 3, sharp = 6, turb = 5 } = {}) {
  return pixels(size, (u, v) => {
    const n = fbm(u + seed * 0.37, v + seed * 0.11, 4, 5);
    const s = Math.abs(Math.sin(Math.PI * 2 * (veinK * u + 2 * v) + turb * n));
    const veinAmt = Math.pow(1 - s, sharp) * 0.85 + Math.pow(1 - s, 2) * 0.12;
    const cloud = (fbm(u, v, 8, 4) - 0.5) * 0.12;
    const t = Math.min(1, veinAmt);
    return [0, 1, 2].map((k) => Math.max(0, Math.min(255, base[k] * (1 + cloud) * (1 - t) + vein[k] * t)));
  });
}

// --- Materialeteksturer ----------------------------------------------------
export function checkerMarble() {
  const white = marbleCanvas(256, [236, 233, 226], [150, 146, 140], { seed: 1 });
  const black = marbleCanvas(256, [28, 27, 30], [120, 112, 100], { seed: 2, sharp: 9 });
  const [c, ctx] = canvas(512, 512);
  ctx.drawImage(white, 0, 0);
  ctx.drawImage(black, 256, 0);
  ctx.drawImage(black, 0, 256);
  ctx.drawImage(white, 256, 256);
  ctx.strokeStyle = 'rgba(40,36,30,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 256, 0);
    ctx.lineTo(i * 256, 512);
    ctx.moveTo(0, i * 256);
    ctx.lineTo(512, i * 256);
    ctx.stroke();
  }
  return c;
}

export function whiteMarble() {
  return marbleCanvas(512, [240, 237, 232], [168, 160, 150], { seed: 5, veinK: 2 });
}

export function darkMarble() {
  return marbleCanvas(512, [36, 40, 44], [160, 150, 130], { seed: 7, sharp: 10 });
}

function woodGrain(ctx, x, y, w, h, base, r, vertical) {
  const k = 0.86 + r() * 0.24;
  ctx.fillStyle = `rgb(${base.map((b) => Math.round(b * k)).join(',')})`;
  ctx.fillRect(x, y, w, h);
  const lines = 10 + Math.floor(r() * 8);
  for (let i = 0; i < lines; i++) {
    ctx.strokeStyle = `rgba(60,35,15,${0.05 + r() * 0.12})`;
    ctx.lineWidth = 0.6 + r() * 1.6;
    ctx.beginPath();
    if (vertical) {
      const px = x + r() * w;
      ctx.moveTo(px, y);
      ctx.bezierCurveTo(px + (r() - 0.5) * 6, y + h * 0.3, px + (r() - 0.5) * 6, y + h * 0.7, px + (r() - 0.5) * 4, y + h);
    } else {
      const py = y + r() * h;
      ctx.moveTo(x, py);
      ctx.bezierCurveTo(x + w * 0.3, py + (r() - 0.5) * 6, x + w * 0.7, py + (r() - 0.5) * 6, x + w, py + (r() - 0.5) * 4);
    }
    ctx.stroke();
  }
}

export function herringbone(base = [132, 86, 50]) {
  // Ægte sildeben: vandrette planker H_k = [k,k+R]x[k,k+1] og lodrette V_k = [k,k+1]x[k+1,k+1+R],
  // gentaget med forskydning (R,-R). Mønsteret har periode 2R, så teksturen kan gentages sømløst.
  const S = 1024;
  const R = 4;
  const W = 32; // 2*R*W = 256 går op i 1024
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#4a2f18';
  ctx.fillRect(0, 0, S, S);
  const r = rng(42);
  const cells = S / W;
  const N = cells + 2 * R;
  for (let n = -N; n <= N; n++) {
    for (let k = -N; k <= N; k++) {
      const x = k + R * n;
      const y = k - R * n;
      if (x < -R - 1 || x > cells + 1 || y < -R - 2 || y > cells + 1) continue;
      woodGrain(ctx, x * W + 1, y * W + 1, R * W - 2, W - 2, base, r, false);
      woodGrain(ctx, x * W + 1, (y + 1) * W + 1, W - 2, R * W - 2, base, r, true);
    }
  }
  // varm lak-glans
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, 'rgba(255,220,170,0.06)');
  g.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return c;
}

export function planks(base = [72, 44, 28], seed = 3) {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const r = rng(seed);
  const h = 64;
  for (let row = 0; row < S / h; row++) {
    const off = r() * S;
    let x = -off;
    while (x < S) {
      const len = 180 + r() * 220;
      woodGrain(ctx, x, row * h, len - 2, h - 2, base, r, false);
      x += len;
    }
  }
  return c;
}

export function oakWood() {
  const [c, ctx] = canvas(256, 256);
  woodGrain(ctx, 0, 0, 256, 256, [176, 128, 78], rng(9), false);
  const r = rng(10);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(90,55,25,${0.05 + r() * 0.1})`;
    ctx.beginPath();
    const y = r() * 256;
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + (r() - 0.5) * 10);
    ctx.stroke();
  }
  return c;
}

export function terrazzo() {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#e9e2d6';
  ctx.fillRect(0, 0, S, S);
  const r = rng(77);
  const cols = ['#b9a68c', '#7d8a78', '#c97c5d', '#3f3f3f', '#d8cbb5', '#9aa7a0'];
  for (let i = 0; i < 1400; i++) {
    const x = r() * S;
    const y = r() * S;
    const s = 1.5 + r() * r() * 9;
    ctx.fillStyle = cols[Math.floor(r() * cols.length)];
    ctx.beginPath();
    const n = 5 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = s * (0.6 + r() * 0.5);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    // wrap ved kanter
    if (x < 12 || y < 12) {
      ctx.save();
      ctx.translate(x < 12 ? S : 0, y < 12 ? S : 0);
      ctx.fill();
      ctx.restore();
    }
  }
  return c;
}

export function plaster(tint = [255, 255, 255]) {
  return pixels(256, (u, v) => {
    const n = 0.93 + (fbm(u, v, 8, 5) - 0.5) * 0.1;
    return tint.map((t) => t * n);
  });
}

export function carpet(base = [128, 14, 24]) {
  return pixels(256, (u, v) => {
    const n = fbm(u, v, 32, 3);
    const fiber = noise(u * 256, v * 256, 256) * 0.18;
    const k = 0.82 + n * 0.25 + fiber;
    return base.map((b) => b * k);
  });
}

export function damask() {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  ctx.drawImage(carpet([110, 16, 28]), 0, 0, S, S);
  ctx.strokeStyle = 'rgba(214,170,90,0.35)';
  ctx.lineWidth = 3;
  const n = 4;
  const cell = S / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cx = i * cell + cell / 2;
      const cy = j * cell + cell / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - cell * 0.42);
      ctx.quadraticCurveTo(cx + cell * 0.3, cy - cell * 0.1, cx, cy + cell * 0.42);
      ctx.quadraticCurveTo(cx - cell * 0.3, cy - cell * 0.1, cx, cy - cell * 0.42);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.08, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return c;
}

export function stoneBlocks() {
  const S = 1024;
  const c = pixels(S, (u, v) => {
    const n = fbm(u, v, 16, 5);
    const k = 0.78 + n * 0.32;
    return [214 * k, 204 * k, 186 * k];
  });
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(70,60,50,0.45)';
  ctx.lineWidth = 3;
  const bh = S / 8;
  for (let row = 0; row < 8; row++) {
    const y = row * bh;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(S, y);
    ctx.stroke();
    const bw = S / 4;
    const off = row % 2 ? bw / 2 : 0;
    for (let x = off; x <= S; x += bw) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + bh);
      ctx.stroke();
    }
  }
  return c;
}

export function pavers() {
  const S = 512;
  const c = pixels(S, (u, v) => {
    const n = fbm(u, v, 16, 4);
    const k = 0.7 + n * 0.35;
    return [150 * k, 146 * k, 140 * k];
  });
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(40,38,36,0.6)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 128, 0);
    ctx.lineTo(i * 128, S);
    ctx.moveTo(0, i * 128);
    ctx.lineTo(S, i * 128);
    ctx.stroke();
  }
  return c;
}

export function asphalt() {
  return pixels(512, (u, v) => {
    const n = fbm(u, v, 32, 4);
    const grain = noise(u * 256, v * 256, 256);
    const k = 0.55 + n * 0.3 + grain * 0.25;
    return [44 * k, 45 * k, 50 * k];
  });
}

export function radial(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

// Lyskegle på væggen: blødt oval lys, kraftigst lidt over midten.
export function lightPool() {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S * 0.38, 0, S / 2, S * 0.45, S * 0.5);
  g.addColorStop(0, 'rgba(255,236,200,0.55)');
  g.addColorStop(0.45, 'rgba(255,226,180,0.22)');
  g.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return c;
}

// Ornament til forgyldte rammer (bruges som bump map).
export function ornament() {
  const W = 256;
  const H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const cx = i * 64 + 32;
    ctx.beginPath();
    ctx.moveTo(cx - 28, H / 2);
    ctx.bezierCurveTo(cx - 14, 6, cx + 14, 6, cx + 28, H / 2);
    ctx.bezierCurveTo(cx + 14, H - 6, cx - 14, H - 6, cx - 28, H / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, H / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#202020';
  ctx.fillRect(0, 0, W, 4);
  ctx.fillRect(0, H - 4, W, 4);
  for (let x = 0; x < W; x += 8) {
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.arc(x + 4, 8, 2.4, 0, Math.PI * 2);
    ctx.arc(x + 4, H - 8, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

export function cityWindows(seed = 1) {
  const W = 512;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#1b1d26';
  ctx.fillRect(0, 0, W, H);
  const r = rng(seed);
  const cols = 8;
  const rows = 8;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lit = r() < 0.45;
      const warm = r();
      ctx.fillStyle = lit
        ? `rgb(${230 + warm * 25},${170 + warm * 50},${90 + warm * 60})`
        : `rgb(${30 + r() * 15},${34 + r() * 15},${48 + r() * 15})`;
      ctx.fillRect(i * (W / cols) + 14, j * (H / rows) + 12, W / cols - 28, H / rows - 22);
    }
  }
  return c;
}

export function paper() {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#f3dcb0';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(120,70,30,0.35)';
  ctx.lineWidth = 2;
  for (let y = 8; y < 128; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
  }
  return c;
}

export function fishStripes(base, stripe) {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = stripe;
  ctx.lineWidth = 5;
  for (let i = -128; i < 256; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 70, 128);
    ctx.stroke();
  }
  return c;
}

export function makiTop(center) {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = '#16211a';
  ctx.beginPath();
  ctx.arc(64, 64, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4f1ea';
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();
  const r = rng(5);
  ctx.fillStyle = '#e2ddd2';
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2;
    const d = 18 + r() * 36;
    ctx.fillRect(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 4, 2);
  }
  ctx.fillStyle = center;
  ctx.beginPath();
  ctx.arc(64, 64, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6fae5a';
  ctx.fillRect(56, 60, 10, 8);
  return c;
}

// --- Nye teksturer til salon, spa og statue ----------------------------------
export function travertine() {
  const S = 512;
  const c = pixels(S, (u, v) => {
    const n = fbm(u * 1.0, v * 4.0, 4, 5);
    const k = 0.86 + (n - 0.5) * 0.18 + Math.sin(v * 60 + n * 8) * 0.012;
    return [232 * k, 219 * k, 196 * k];
  });
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(120,100,80,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 256);
    ctx.lineTo(S, i * 256);
    ctx.moveTo(i * 256, 0);
    ctx.lineTo(i * 256, S);
    ctx.stroke();
  }
  return c;
}

export function mosaic(base = [32, 120, 150]) {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#e8eef0';
  ctx.fillRect(0, 0, S, S);
  const r = rng(31);
  const n = 16;
  const cell = S / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const k = 0.75 + r() * 0.45;
      ctx.fillStyle = `rgb(${base.map((b) => Math.min(255, Math.round(b * k))).join(',')})`;
      ctx.fillRect(i * cell + 1, j * cell + 1, cell - 2, cell - 2);
    }
  return c;
}

export function woodSlats() {
  const S = 512;
  const [c, ctx] = canvas(S, S);
  const r = rng(12);
  const n = 16;
  for (let i = 0; i < n; i++) {
    woodGrain(ctx, 0, i * (S / n), S, S / n - 3, [150, 104, 66], r, false);
    ctx.fillStyle = '#2a1b10';
    ctx.fillRect(0, (i + 1) * (S / n) - 3, S, 3);
  }
  return c;
}

export function nightWindow() {
  const [c, ctx] = canvas(128, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#060a1c');
  g.addColorStop(0.7, '#1a1d3a');
  g.addColorStop(1, '#3a2a3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 256);
  const r = rng(8);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,214,150,0.9)' : 'rgba(255,240,210,0.6)';
    ctx.fillRect(r() * 128, 150 + r() * 100, 2 + r() * 3, 2 + r() * 4);
  }
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(r() * 128, r() * 120, 1, 1);
  }
  return c;
}

export function bookSpines() {
  const W = 512;
  const H = 128;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#20140c';
  ctx.fillRect(0, 0, W, H);
  const r = rng(77);
  const cols = ['#5b1a1a', '#1d3b2a', '#1b2a4a', '#6b4a1e', '#3d2a4a', '#7a6a4a', '#2a2a2a', '#8a2a1a'];
  let x = 0;
  while (x < W) {
    const w = 8 + r() * 14;
    const h = H * (0.72 + r() * 0.26);
    ctx.fillStyle = cols[Math.floor(r() * cols.length)];
    ctx.fillRect(x, H - h, w - 1, h);
    ctx.fillStyle = 'rgba(214,176,98,0.8)';
    ctx.fillRect(x + 1, H - h + 8, w - 3, 2);
    ctx.fillRect(x + 1, H - 14, w - 3, 2);
    x += w;
  }
  return c;
}

export function persianRug() {
  const S = 512;
  const [c, ctx] = canvas(S, S * 0.66);
  const H = S * 0.66;
  ctx.fillStyle = '#7a1420';
  ctx.fillRect(0, 0, S, H);
  ctx.strokeStyle = '#d9b46a';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, S - 28, H - 28);
  ctx.fillStyle = '#16263e';
  ctx.fillRect(28, 28, S - 56, 22);
  ctx.fillRect(28, H - 50, S - 56, 22);
  ctx.fillRect(28, 28, 22, H - 56);
  ctx.fillRect(S - 50, 28, 22, H - 56);
  ctx.fillStyle = '#d9b46a';
  for (let x = 40; x < S - 40; x += 16) {
    ctx.fillRect(x, 36, 6, 6);
    ctx.fillRect(x, H - 42, 6, 6);
  }
  // medaljon
  ctx.save();
  ctx.translate(S / 2, H / 2);
  for (const [r0, col] of [[120, '#16263e'], [96, '#d9b46a'], [80, '#a8323a'], [50, '#16263e'], [26, '#e9d3a0']]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const rr = r0 * (k % 2 ? 0.78 : 1);
      ctx.lineTo(Math.cos(a) * rr * 1.4, Math.sin(a) * rr * 0.8);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  return c;
}

export function tufted(base = '#3a1d14') {
  const [c, ctx] = canvas(128, 128);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const x = i * 32 + (j % 2) * 16 + 8;
      const y = j * 32 + 16;
      const g = ctx.createRadialGradient(x, y, 1, x, y, 16);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.25, 'rgba(0,0,0,0.1)');
      g.addColorStop(1, 'rgba(255,255,255,0.06)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 16, y - 16, 32, 32);
    }
  return c;
}

export function statueMarble() {
  return marbleCanvas(512, [234, 230, 222], [196, 188, 178], { seed: 11, veinK: 2, sharp: 14, turb: 6 });
}

export function hairStrands() {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(4);
  for (let i = 0; i < 700; i++) {
    const x = r() * 256;
    const y = r() * 256;
    ctx.strokeStyle = r() < 0.5 ? '#b0b0b0' : '#505050';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 4, y + 6, x + (r() - 0.5) * 6, y + 12);
    ctx.stroke();
  }
  return c;
}

export function inscription(lines, { w = 1024, h = 256, bg = '#1c1a17', color = '#d9b25b' } = {}) {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach(([text, font, y]) => {
    ctx.font = font;
    ctx.fillText(text, w / 2, y, w - 60);
  });
  return c;
}
