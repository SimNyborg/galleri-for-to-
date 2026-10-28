// Inventar indenfor: lysekroner, bænke, planter, champagnetårn, sushibar, café og hovedværkets sal.
import * as THREE from 'three';
import { canvas } from './util.js';
import { coupeGeometry, coupeLiquidGeometry, addGlow } from './exterior.js';
import * as TX from './textures.js';

export function chandelier(B, M, scene, x, y, z, ceiling, s = 1) {
  const stemLen = ceiling - (y + 0.4 * s);
  B.geom(M.brass, new THREE.CylinderGeometry(0.018, 0.018, stemLen, 8), [x, y + 0.4 * s + stemLen / 2, z]);
  B.geom(M.brass, new THREE.SphereGeometry(0.1 * s, 14, 10), [x, y, z]);
  B.geom(M.brass, new THREE.CylinderGeometry(0.05 * s, 0.1 * s, 0.4 * s, 12), [x, y + 0.2 * s, z]);
  const candle = new THREE.CylinderGeometry(0.018 * s, 0.018 * s, 0.12 * s, 8);
  const bulb = new THREE.SphereGeometry(0.03 * s, 8, 6);
  const crystal = new THREE.OctahedronGeometry(0.03 * s);
  const arm = new THREE.CylinderGeometry(0.01 * s, 0.01 * s, 1, 6);
  for (const [rr, ry, n] of [[0.62, -0.05, 10], [0.36, 0.32, 6]]) {
    const ring = new THREE.TorusGeometry(rr * s, 0.016 * s, 6, 40);
    ring.rotateX(Math.PI / 2);
    B.geom(M.brass, ring, [x, y + ry * s, z]);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cx = x + Math.cos(a) * rr * s;
      const cz = z + Math.sin(a) * rr * s;
      B.geom(M.linen, candle, [cx, y + (ry + 0.07) * s, cz]);
      B.geom(M.warmLight, bulb, [cx, y + (ry + 0.16) * s, cz]);
      B.geom(M.brass, arm, [(x + cx) / 2, y + ry * s, (z + cz) / 2], [0, -a, Math.PI / 2], [1, rr * s, 1]);
      const ca = a + Math.PI / n;
      B.geom(M.crystal, crystal, [x + Math.cos(ca) * rr * s, y + (ry - 0.12) * s, z + Math.sin(ca) * rr * s], [0, 0, 0], [1, 1.8, 1]);
    }
  }
  B.geom(M.crystal, crystal, [x, y - 0.2 * s, z], [0, 0, 0], [1.6, 3, 1.6]);
  addGlow(scene, M, [x, y + 0.15 * s, z], 2.8 * s, 0.75);
}

export function bench(B, M, x, z, rotY, len = 1.9, top = M.leather) {
  const g = new THREE.BoxGeometry(len, 0.12, 0.46);
  B.geom(top, g, [x, 0.44, z], [0, rotY, 0]);
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  for (const lx of [-len / 2 + 0.1, len / 2 - 0.1]) {
    for (const lz of [-0.16, 0.16]) {
      const px = x + lx * c + lz * s;
      const pz = z - lx * s + lz * c;
      B.box(M.brass, 0.04, 0.38, 0.04, px, 0.19, pz);
    }
  }
  const sh = new THREE.PlaneGeometry(len + 0.6, 0.9);
  sh.rotateX(-Math.PI / 2);
  B.geom(M.shadow, sh, [x, 0.004, z], [0, rotY, 0]);
}

export function plant(B, M, x, z, s = 1) {
  B.geom(M.potBlack, new THREE.CylinderGeometry(0.27 * s, 0.21 * s, 0.55 * s, 18), [x, 0.275 * s, z]);
  const leaf = new THREE.SphereGeometry(0.3 * s, 12, 10);
  const pts = [[0, 0.95, 0, 1.2], [0.18, 1.25, 0.08, 0.9], [-0.16, 1.35, -0.1, 0.95], [0.05, 1.65, 0.12, 0.8], [-0.08, 1.85, -0.05, 0.65], [0.15, 1.05, -0.18, 0.8]];
  for (const [dx, dy, dz, k] of pts) B.geom(k > 0.9 ? M.plantGreen : M.plantDark, leaf, [x + dx * s, dy * s, z + dz * s], [0, dx * 4, 0], [k, k * 1.15, k]);
  B.box(M.walnut, 0.05 * s, 0.6 * s, 0.05 * s, x, 0.75 * s, z);
}

function signTexture(text, sub, locked) {
  const [c, ctx] = canvas(1024, 220);
  ctx.fillStyle = '#17120e';
  ctx.fillRect(0, 0, 1024, 220);
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, 1000, 196);
  ctx.fillStyle = '#e8cb85';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 600 92px "Cormorant Garamond", Georgia, serif';
  ctx.fillText(text, 512, sub ? 92 : 112, 940);
  if (sub) {
    ctx.fillStyle = locked ? '#c98f7c' : '#bfae86';
    ctx.font = '500 30px Inter, system-ui, sans-serif';
    ctx.fillText(sub, 512, 168, 940);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function makeSign(scene, text, sub, { x, y, z, rotY, w = 2.0, locked = false }) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * (220 / 1024)), new THREE.MeshBasicMaterial({ map: signTexture(text, sub, locked), toneMapped: false }));
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  scene.add(mesh);
  return {
    mesh,
    set(t, s, l) {
      mesh.material.map.dispose();
      mesh.material.map = signTexture(t, s, l);
      mesh.material.needsUpdate = true;
    },
  };
}

function titleTexture(title, subtitle) {
  const [c, ctx] = canvas(2048, 512);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#b48a3a';
  ctx.font = '600 210px "Cormorant Garamond", Georgia, serif';
  ctx.fillText(title.toUpperCase(), 1024, 220, 1960);
  ctx.fillStyle = '#7d6a4c';
  ctx.font = 'italic 500 84px "Cormorant Garamond", Georgia, serif';
  ctx.fillText(subtitle, 1024, 400, 1900);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Marmorsøjle med forgyldt urne og en buket roser.
export function flowerUrn(B, M, x, z) {
  B.geom(M.marbleWhite, new THREE.CylinderGeometry(0.17, 0.2, 0.85, 20), [x, 0.425, z]);
  B.box(M.marbleWhite, 0.46, 0.06, 0.46, x, 0.03, z);
  B.box(M.marbleWhite, 0.42, 0.05, 0.42, x, 0.87, z);
  const urn = new THREE.LatheGeometry(
    [[0, 0], [0.09, 0], [0.06, 0.05], [0.06, 0.09], [0.15, 0.17], [0.17, 0.27], [0.14, 0.33], [0.16, 0.36], [0, 0.36]].map(([a, b]) => new THREE.Vector2(a, b)),
    20,
  );
  B.geom(M.gold, urn, [x, 0.895, z]);
  const cols = [M.rose, M.porcelain, M.rose, M.ivory];
  const bloom = new THREE.SphereGeometry(0.06, 10, 8);
  for (let i = 0; i < 26; i++) {
    const a = i * 2.399;
    const r = 0.05 + Math.sqrt(i / 26) * 0.2;
    const y = 1.32 + Math.cos((r / 0.25) * 1.3) * 0.16;
    B.geom(cols[i % cols.length], bloom, [x + Math.cos(a) * r, y, z + Math.sin(a) * r]);
  }
  const leaf = new THREE.SphereGeometry(0.07, 8, 6);
  for (let i = 0; i < 12; i++) {
    const a = i * 0.52;
    B.geom(M.plantGreen, leaf, [x + Math.cos(a) * 0.25, 1.24, z + Math.sin(a) * 0.25], [0, a, 0.7], [1.3, 0.35, 0.6]);
  }
}

// --- Rundsti for sushibåndet --------------------------------------------------------
function roundedRectPath(a, b, r) {
  const sx = 2 * (a - r);
  const sz = 2 * (b - r);
  const arc = (Math.PI / 2) * r;
  const segs = [sx, arc, sz, arc, sx, arc, sz, arc];
  const P = segs.reduce((p, q) => p + q, 0);
  return {
    length: P,
    at(d) {
      d = ((d % P) + P) % P;
      // start: øverste side (z = -b), x fra -(a-r) til (a-r)
      if ((d -= 0) < sx) return [-(a - r) + d, -b];
      d -= sx;
      if (d < arc) {
        const t = d / r - Math.PI / 2;
        return [a - r + Math.cos(t) * r, -(b - r) + Math.sin(t) * r];
      }
      d -= arc;
      if (d < sz) return [a, -(b - r) + d];
      d -= sz;
      if (d < arc) {
        const t = d / r;
        return [a - r + Math.cos(t) * r, b - r + Math.sin(t) * r];
      }
      d -= arc;
      if (d < sx) return [a - r - d, b];
      d -= sx;
      if (d < arc) {
        const t = d / r + Math.PI / 2;
        return [-(a - r) + Math.cos(t) * r, b - r + Math.sin(t) * r];
      }
      d -= arc;
      if (d < sz) return [-a, b - r - d];
      d -= sz;
      const t = d / r + Math.PI;
      return [-(a - r) + Math.cos(t) * r, -(b - r) + Math.sin(t) * r];
    },
  };
}

function roundedRectShape(a, b, r) {
  const s = new THREE.Shape();
  s.moveTo(-a + r, -b);
  s.lineTo(a - r, -b);
  s.quadraticCurveTo(a, -b, a, -b + r);
  s.lineTo(a, b - r);
  s.quadraticCurveTo(a, b, a - r, b);
  s.lineTo(-a + r, b);
  s.quadraticCurveTo(-a, b, -a, b - r);
  s.lineTo(-a, -b + r);
  s.quadraticCurveTo(-a, -b, -a + r, -b);
  return s;
}

function sushiPiece(M, kind, fishMats) {
  const g = new THREE.Group();
  if (kind === 'maki') {
    const side = M.nori;
    const top = fishMats.makiTop;
    const geo = new THREE.CylinderGeometry(0.023, 0.023, 0.032, 16);
    for (const [dx, dz] of [[-0.035, 0], [0.012, -0.03], [0.022, 0.03]]) {
      const m = new THREE.Mesh(geo, [side, top, top]);
      m.position.set(dx, 0.03, dz);
      g.add(m);
    }
  } else {
    const rice = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.05, 4, 8), M.rice);
    rice.rotation.z = Math.PI / 2;
    rice.scale.set(1, 1, 1.25);
    const fish = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.013, 0.046), kind === 'tamago' ? M.tamago : fishMats[kind]);
    fish.position.y = 0.022;
    for (const dz of [-0.03, 0.03]) {
      const r1 = rice.clone();
      r1.position.set(0, 0.03, dz);
      const f1 = fish.clone();
      f1.position.set(0, 0.052, dz);
      f1.rotation.z = 0.05;
      g.add(r1, f1);
      if (kind === 'tamago') {
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.05, 0.05), M.nori);
        band.position.set(0, 0.035, dz);
        g.add(band);
      }
    }
  }
  return g;
}

// --- Byg indretningen ------------------------------------------------------------------
export function buildInterior(scene, B, M, colliders, manifest) {
  const out = { interactables: [], animated: [] };

  // ---------- Champagnesalonen ----------
  chandelier(B, M, scene, 0, 3.4, 5, 4.6, 1.1);
  B.box(M.carpetRed, 1.8, 0.01, 9.4, 0, 0.006, 5, { uv: 2 });
  for (const sx of [-0.84, 0.84]) B.box(M.gold, 0.04, 0.012, 9.4, sx, 0.008, 5);
  const title = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshBasicMaterial({ map: titleTexture(manifest.title || 'Galleri for to', manifest.subtitle || ''), transparent: true, toneMapped: false }));
  title.position.set(0, 3.95, 0.215);
  scene.add(title);
  for (const [x, z] of [[-5.25, 0.75], [5.25, 0.75], [-5.25, 9.25], [5.25, 9.25]]) {
    plant(B, M, x, z, 1.05);
    colliders.add(x - 0.32, x + 0.32, z - 0.32, z + 0.32);
  }
  // rund fløjlssofa med palme i midten (væk fra dørene til fløjene)
  const sofaX = -3.3;
  const sofaZ = 2.3;
  B.geom(M.velvet, new THREE.CylinderGeometry(0.85, 0.85, 0.44, 32), [sofaX, 0.22, sofaZ]);
  B.geom(M.velvet, new THREE.CylinderGeometry(0.42, 0.5, 0.75, 24), [sofaX, 0.6, sofaZ]);
  B.geom(M.gold, new THREE.TorusGeometry(0.85, 0.02, 6, 48).rotateX(Math.PI / 2), [sofaX, 0.44, sofaZ]);
  plant(B, M, sofaX, sofaZ, 0.8);
  colliders.add(sofaX - 0.85, sofaX + 0.85, sofaZ - 0.85, sofaZ + 0.85);
  // blomsteropsatser ved indgangen
  for (const x of [-2.05, 2.05]) {
    flowerUrn(B, M, x, 9.3);
    colliders.add(x - 0.3, x + 0.3, 9.0, 9.6);
  }

  // Champagnetårn
  const tx = 3.3;
  const tz = 7.5;
  B.geom(M.marbleWhite, new THREE.CylinderGeometry(0.72, 0.72, 0.05, 40), [tx, 0.95, tz]);
  B.geom(M.gold, new THREE.CylinderGeometry(0.06, 0.06, 0.9, 12), [tx, 0.48, tz]);
  B.geom(M.gold, new THREE.CylinderGeometry(0.36, 0.42, 0.05, 32), [tx, 0.025, tz]);
  B.geom(M.gold, new THREE.TorusGeometry(0.72, 0.015, 6, 48).rotateX(Math.PI / 2), [tx, 0.95, tz]);
  const coupe = coupeGeometry();
  const liquid = coupeLiquidGeometry();
  const positions = [];
  const spacing = 0.122;
  for (let level = 0; level < 4; level++) {
    const n = 4 - level;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        positions.push([tx + (i - (n - 1) / 2) * spacing, 0.975 + level * 0.11, tz + (j - (n - 1) / 2) * spacing]);
      }
    }
  }
  const glassIM = new THREE.InstancedMesh(coupe, M.glass, positions.length);
  const liqIM = new THREE.InstancedMesh(liquid, M.champagne, positions.length);
  const tmp = new THREE.Object3D();
  positions.forEach((p, i) => {
    tmp.position.set(p[0], p[1], p[2]);
    tmp.rotation.y = i * 0.7;
    tmp.updateMatrix();
    glassIM.setMatrixAt(i, tmp.matrix);
    liqIM.setMatrixAt(i, tmp.matrix);
  });
  scene.add(glassIM, liqIM);
  // flaske i isspand
  B.geom(M.silver, new THREE.CylinderGeometry(0.11, 0.09, 0.22, 20), [tx + 0.5, 1.085, tz + 0.25]);
  const bottle = new THREE.LatheGeometry(
    [[0, 0], [0.045, 0], [0.046, 0.2], [0.03, 0.26], [0.016, 0.3], [0.016, 0.34], [0, 0.34]].map(([a, b]) => new THREE.Vector2(a, b)),
    16,
  );
  B.geom(M.leafLacquer, bottle, [tx + 0.5, 1.05, tz + 0.25], [0.25, 0, 0.2]);
  colliders.add(tx - 0.75, tx + 0.75, tz - 0.75, tz + 0.75);
  out.tower = {
    glassIM,
    liqIM,
    take() {
      if (glassIM.count <= 1) return;
      glassIM.count--;
      liqIM.count--;
    },
  };
  out.interactables.push({ id: 'champagne', pos: new THREE.Vector3(tx, 0, tz), range: 1.75, meshes: [glassIM, liqIM] });

  // ---------- Rejsesalen ----------
  chandelier(B, M, scene, 0, 4.3, -4.5, 5.6, 1.2);
  chandelier(B, M, scene, 0, 4.3, -11.5, 5.6, 1.2);
  // bænke i kvadranterne, så gangene mellem dørene er fri
  for (const [bx, bz] of [[-5, -4.2], [5, -4.2], [5, -11.8]]) {
    bench(B, M, bx, bz, 0, 1.9);
    colliders.add(bx - 0.95, bx + 0.95, bz - 0.25, bz + 0.25);
  }
  // rød løber gennem salen fra champagnesalonen til Hovedværket
  B.box(M.carpetRed, 2.0, 0.01, 15.6, 0, 0.006, -8, { uv: 2 });
  for (const sx of [-0.94, 0.94]) B.box(M.gold, 0.04, 0.012, 15.6, sx, 0.008, -8);
  // fløjlsgardiner ved døren til Hovedværket
  for (const sx of [-1, 1]) {
    for (let f = 0; f < 5; f++) {
      const x = sx * (1.62 + f * 0.09);
      B.box(M.velvet, 0.08, 3.85, 0.07, x, 1.92, -15.72 + (f % 2) * 0.05);
    }
    B.box(M.gold, 0.06, 0.06, 0.2, sx * 1.75, 1.2, -15.6);
    B.geom(M.gold, new THREE.ConeGeometry(0.05, 0.18, 12, 1, true), [sx * 1.82, 1.05, -15.55]);
  }
  B.box(M.gold, 4.2, 0.06, 0.06, 0, 3.9, -15.66);
  for (const [x, z] of [[-9.25, -0.75], [9.25, -0.75], [-9.25, -15.25], [9.25, -15.25]]) {
    plant(B, M, x, z, 1.2);
    colliders.add(x - 0.35, x + 0.35, z - 0.35, z + 0.35);
  }
  out.signs = {
    sushi: makeSign(scene, 'Sushibaren', null, { x: -9.78, y: 3.62, z: -8, rotY: Math.PI / 2, w: 1.9 }),
    cafe: makeSign(scene, 'Caféen', null, { x: 9.78, y: 3.62, z: -8, rotY: -Math.PI / 2, w: 1.9 }),
    final: makeSign(scene, 'Hovedværket', 'Åbner, når aftenens program er klaret', { x: 0, y: 4.05, z: -15.78, rotY: 0, w: 2.4, locked: true }),
    foyer: makeSign(scene, 'Champagnesalonen', null, { x: 0, y: 3.85, z: -0.22, rotY: Math.PI, w: 2.3 }),
  };

  // ---------- Sushibaren ----------
  const sx0 = -15;
  const sz0 = -8;
  B.box(M.darkWood, 5.0, 0.9, 2.0, sx0, 0.45, sz0, { uv: 2 });
  B.box(M.hinoki, 5.4, 0.06, 2.4, sx0, 0.93, sz0);
  const beltShape = roundedRectShape(2.28, 0.78, 0.42);
  beltShape.holes.push(roundedRectShape(1.98, 0.48, 0.24));
  const beltGeo = new THREE.ShapeGeometry(beltShape, 12);
  beltGeo.rotateX(-Math.PI / 2);
  B.geom(M.belt, beltGeo, [sx0, 0.965, sz0]);
  B.box(M.darkWood, 3.9, 0.22, 0.9, sx0, 1.07, sz0);
  B.box(M.hinoki, 4.0, 0.03, 1.0, sx0, 1.19, sz0);
  // bonsai og små sager på midterøen
  B.geom(M.potBlack, new THREE.CylinderGeometry(0.16, 0.12, 0.1, 16), [sx0, 1.26, sz0]);
  B.geom(M.walnut, new THREE.CylinderGeometry(0.02, 0.035, 0.3, 8), [sx0, 1.42, sz0], [0, 0, 0.3]);
  for (const [dx, dy, dz, k] of [[0.08, 1.6, 0, 1], [-0.1, 1.55, 0.05, 0.8], [0.02, 1.68, -0.06, 0.7]]) {
    B.geom(M.plantDark, new THREE.SphereGeometry(0.12, 10, 8), [sx0 + dx, dy, sz0 + dz], [0, 0, 0], [k * 1.4, k * 0.7, k]);
  }
  for (const dx of [-1.3, 1.3]) {
    B.geom(M.frameBlack, new THREE.CylinderGeometry(0.03, 0.03, 0.14, 10), [sx0 + dx, 1.27, sz0 - 0.2]);
    B.geom(M.porcelain, new THREE.CylinderGeometry(0.08, 0.06, 0.03, 16), [sx0 + dx, 1.215, sz0 + 0.2]);
  }
  colliders.add(sx0 - 2.7, sx0 + 2.7, sz0 - 1.2, sz0 + 1.2);
  // taburetter
  const stoolPos = [];
  for (const dx of [-1.8, -0.6, 0.6, 1.8]) stoolPos.push([sx0 + dx, sz0 - 1.6], [sx0 + dx, sz0 + 1.6]);
  stoolPos.push([sx0 - 3.1, sz0], [sx0 + 3.1, sz0]);
  for (const [x, z] of stoolPos) {
    B.geom(M.brass, new THREE.CylinderGeometry(0.025, 0.025, 0.68, 8), [x, 0.34, z]);
    B.geom(M.brass, new THREE.CylinderGeometry(0.17, 0.2, 0.02, 18), [x, 0.01, z]);
    B.geom(M.leather, new THREE.CylinderGeometry(0.19, 0.17, 0.07, 20), [x, 0.71, z]);
    colliders.add(x - 0.12, x + 0.12, z - 0.12, z + 0.12);
  }
  // papirlamper
  for (const dx of [-2, -1, 0, 1, 2]) {
    const lx = sx0 + dx;
    B.geom(M.lantern, new THREE.CylinderGeometry(0.22, 0.22, 0.46, 18, 1, true), [lx, 2.9, sz0]);
    B.geom(M.frameBlack, new THREE.CylinderGeometry(0.16, 0.16, 0.04, 18), [lx, 3.15, sz0]);
    B.geom(M.frameBlack, new THREE.CylinderGeometry(0.16, 0.16, 0.04, 18), [lx, 2.65, sz0]);
    B.geom(M.frameBlack, new THREE.CylinderGeometry(0.006, 0.006, 1.0, 4), [lx, 3.67, sz0]);
    addGlow(scene, M, [lx, 2.9, sz0], 1.6, 0.6);
  }
  // noren i døråbningen
  const norenTex = (() => {
    const [c, ctx] = canvas(256, 256);
    ctx.fillStyle = '#1f2d55';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#f0ece2';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(128, 150, 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(84, 150);
    ctx.quadraticCurveTo(128, 110, 172, 150);
    ctx.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const norenMat = new THREE.MeshStandardMaterial({ map: norenTex, side: THREE.DoubleSide, roughness: 0.95 });
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.85), norenMat);
    p.position.set(-10.24, 2.78, -9.3 + 0.43 + i * 0.87);
    p.rotation.y = Math.PI / 2;
    scene.add(p);
  }
  B.box(M.walnut, 0.04, 0.04, 2.7, -10.24, 3.2, -8);

  // Tallerkener på båndet
  const fishMats = {
    salmon: new THREE.MeshStandardMaterial({ map: TX.toTexture(TX.fishStripes('#f08a4b', 'rgba(255,240,225,0.75)'), { wrap: false }), roughness: 0.35 }),
    tuna: new THREE.MeshStandardMaterial({ map: TX.toTexture(TX.fishStripes('#b8263a', 'rgba(255,180,190,0.35)'), { wrap: false }), roughness: 0.35 }),
    makiTop: new THREE.MeshStandardMaterial({ map: TX.toTexture(TX.makiTop('#f07a3a'), { wrap: false }), roughness: 0.6 }),
  };
  const rimColors = ['#c0392b', '#2c5aa0', '#d4af37', '#1d1d1d'];
  const plateGeo = new THREE.CylinderGeometry(0.11, 0.085, 0.022, 24);
  const rimGeo = new THREE.TorusGeometry(0.105, 0.006, 6, 24).rotateX(Math.PI / 2);
  const path = roundedRectPath(2.13, 0.63, 0.33);
  const kinds = ['salmon', 'maki', 'tuna', 'tamago'];
  const plates = [];
  const nPlates = 14;
  for (let i = 0; i < nPlates; i++) {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(plateGeo, M.porcelain);
    plate.position.y = 0.011;
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({ color: rimColors[i % rimColors.length], roughness: 0.4 }));
    rim.position.y = 0.022;
    g.add(plate, rim);
    const food = sushiPiece(M, kinds[i % kinds.length], fishMats);
    food.position.y = 0.02;
    g.add(food);
    scene.add(g);
    plates.push({ group: g, food, d: (i / nPlates) * path.length, eaten: false, refill: 0 });
  }
  out.sushi = {
    plates,
    update(dt) {
      for (const p of plates) {
        p.d += dt * 0.16;
        const [px, pz] = path.at(p.d);
        p.group.position.set(sx0 + px, 0.977, sz0 + pz);
        p.group.rotation.y = p.d * 0.5;
        if (p.eaten) {
          p.refill -= dt;
          if (p.refill <= 0) {
            p.eaten = false;
            p.food.visible = true;
          }
        }
      }
    },
    eatNearest(pos) {
      let best = null;
      let bd = Infinity;
      for (const p of plates) {
        if (p.eaten) continue;
        const d = p.group.position.distanceToSquared(pos);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (!best) return null;
      best.eaten = true;
      best.refill = 25;
      best.food.visible = false;
      return best;
    },
  };
  out.interactables.push({ id: 'sushi', rect: [sx0 - 2.7, sx0 + 2.7, sz0 - 1.2, sz0 + 1.2], range: 1.1, pos: new THREE.Vector3(sx0, 0, sz0), meshes: plates.map((p) => p.group) });

  // ---------- Caféen ----------
  B.box(M.walnut, 1.0, 1.0, 6.8, 19.25, 0.5, -8);
  B.box(M.marbleWhite, 1.25, 0.05, 7.0, 19.15, 1.025, -8, { uv: 1.5 });
  colliders.add(18.5, 19.8, -11.5, -4.5);
  // espressomaskine
  const em = { x: 19.25, y: 1.05, z: -8 };
  B.box(M.chrome, 0.5, 0.44, 0.8, em.x, em.y + 0.22, em.z);
  B.box(M.brass, 0.52, 0.03, 0.82, em.x, em.y + 0.455, em.z);
  for (const dz of [-0.36, 0.36]) B.box(M.brass, 0.03, 0.12, 0.03, em.x - 0.2, em.y + 0.53, em.z + dz);
  B.box(M.brass, 0.03, 0.03, 0.75, em.x - 0.2, em.y + 0.59, em.z);
  B.box(M.frameBlack, 0.16, 0.025, 0.7, em.x - 0.32, em.y + 0.014, em.z);
  const gauge = new THREE.CircleGeometry(0.05, 20);
  gauge.rotateY(-Math.PI / 2);
  B.geom(M.linen, gauge, [em.x - 0.252, em.y + 0.34, em.z]);
  B.geom(M.brass, new THREE.TorusGeometry(0.05, 0.008, 6, 20).rotateY(Math.PI / 2), [em.x - 0.252, em.y + 0.34, em.z]);
  for (const dz of [-0.17, 0.17]) {
    B.geom(M.chrome, new THREE.CylinderGeometry(0.045, 0.05, 0.1, 16), [em.x - 0.27, em.y + 0.2, em.z + dz]);
    B.geom(M.frameBlack, new THREE.CylinderGeometry(0.014, 0.014, 0.18, 8), [em.x - 0.38, em.y + 0.17, em.z + dz], [0, 0, Math.PI / 2 + 0.1]);
  }
  B.geom(M.chrome, new THREE.CylinderGeometry(0.008, 0.008, 0.26, 6), [em.x - 0.27, em.y + 0.18, em.z + 0.36], [0.2, 0, 0.25]);
  // kop under bryggehovedet
  const cup = new THREE.Group();
  cup.position.set(em.x - 0.29, em.y + 0.027, em.z - 0.17);
  const cupGeo = new THREE.LatheGeometry([[0, 0], [0.028, 0], [0.032, 0.01], [0.038, 0.06], [0.04, 0.065], [0.037, 0.066], [0.034, 0.012], [0, 0.012]].map(([a, b]) => new THREE.Vector2(a, b)), 20);
  cup.add(new THREE.Mesh(cupGeo, M.porcelain));
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.01, 22), M.porcelain);
  saucer.position.y = -0.003;
  cup.add(saucer);
  const coffeeSurf = new THREE.Mesh(new THREE.CircleGeometry(0.033, 18), M.crema);
  coffeeSurf.rotation.x = -Math.PI / 2;
  coffeeSurf.position.y = 0.013;
  coffeeSurf.visible = false;
  cup.add(coffeeSurf);
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), M.coffee);
  stream.position.set(0, 0.12, 0);
  stream.visible = false;
  cup.add(stream);
  scene.add(cup);
  out.coffee = { cup, coffeeSurf, stream, machine: em };
  out.interactables.push({ id: 'coffee', pos: new THREE.Vector3(18.4, 0, -8), range: 1.45, meshes: [cup] });
  // kagemontre
  B.box(M.walnut, 0.62, 0.05, 1.2, 19.15, 1.075, -10.4);
  B.box(M.glass, 0.6, 0.42, 1.18, 19.15, 1.31, -10.4);
  const croissant = new THREE.TorusGeometry(0.06, 0.03, 8, 14, Math.PI * 1.25);
  for (let i = 0; i < 4; i++) B.geom(M.pastry, croissant, [19.1, 1.13, -10.8 + i * 0.26], [Math.PI / 2, 0, i], [1, 1, 0.8]);
  // tavle med menu
  const board = (() => {
    const [c, ctx] = canvas(1024, 560);
    ctx.fillStyle = '#1e2421';
    ctx.fillRect(0, 0, 1024, 560);
    ctx.strokeStyle = '#8a6a44';
    ctx.lineWidth = 26;
    ctx.strokeRect(0, 0, 1024, 560);
    ctx.fillStyle = '#efe9da';
    ctx.textAlign = 'center';
    ctx.font = 'italic 600 96px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('Caféen', 512, 130);
    ctx.font = '500 52px Caveat, cursive';
    ['Espresso', 'Cappuccino', 'Varm kakao', 'Croissanter'].forEach((t, i) => ctx.fillText(t, 512, 230 + i * 66));
    ctx.font = '500 26px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#c9bfa6';
    ctx.fillText('HUSET GIVER I AFTEN', 512, 520);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.04), new THREE.MeshStandardMaterial({ map: board, roughness: 0.9 }));
  menu.position.set(19.78, 2.55, -8);
  menu.rotation.y = -Math.PI / 2;
  scene.add(menu);
  // pendler over disken
  for (const z of [-10.2, -8, -5.8]) {
    B.geom(M.frameBlack, new THREE.CylinderGeometry(0.005, 0.005, 1.4, 4), [18.6, 3.5, z]);
    B.geom(M.frameBlack, new THREE.ConeGeometry(0.2, 0.22, 20, 1, true), [18.6, 2.75, z]);
    B.geom(M.warmLight, new THREE.SphereGeometry(0.05, 10, 8), [18.6, 2.66, z]);
    addGlow(scene, M, [18.6, 2.6, z], 1.4, 0.7);
  }
  // cafeborde med stole
  const tables = [[15.0, -4.3], [15.0, -11.7]];
  for (const [x, z] of tables) {
    B.geom(M.marbleWhite, new THREE.CylinderGeometry(0.38, 0.38, 0.03, 28), [x, 0.75, z]);
    B.geom(M.frameBlack, new THREE.CylinderGeometry(0.03, 0.03, 0.73, 8), [x, 0.37, z]);
    B.geom(M.frameBlack, new THREE.CylinderGeometry(0.22, 0.25, 0.03, 20), [x, 0.015, z]);
    colliders.add(x - 0.4, x + 0.4, z - 0.4, z + 0.4);
    for (const s of [-1, 1]) {
      const cx = x + s * 0.68;
      B.geom(M.walnut, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20), [cx, 0.46, z]);
      for (const [lx, lz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) B.box(M.walnut, 0.025, 0.46, 0.025, cx + lx, 0.23, z + lz);
      B.geom(M.walnut, new THREE.TorusGeometry(0.19, 0.015, 6, 20, Math.PI), [cx + s * 0.18, 0.75, z], [0, Math.PI / 2, 0]);
      colliders.add(cx - 0.22, cx + 0.22, z - 0.22, z + 0.22);
    }
  }
  // backgammon på det ene bord
  const bg = (() => {
    const [c, ctx] = canvas(256, 192);
    ctx.fillStyle = '#7a0e1c';
    ctx.fillRect(0, 0, 256, 192);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 12;
    ctx.strokeRect(0, 0, 256, 192);
    ctx.fillRect(124, 0, 8, 192);
    for (let i = 0; i < 12; i++) {
      const x = 10 + i * 20 + (i >= 6 ? 8 : 0);
      ctx.fillStyle = i % 2 ? '#f1ece0' : '#111';
      ctx.beginPath();
      ctx.moveTo(x, 6);
      ctx.lineTo(x + 18, 6);
      ctx.lineTo(x + 9, 80);
      ctx.fill();
      ctx.fillStyle = i % 2 ? '#111' : '#f1ece0';
      ctx.beginPath();
      ctx.moveTo(x, 186);
      ctx.lineTo(x + 18, 186);
      ctx.lineTo(x + 9, 112);
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const bgBoard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.32), [M.frameBlack, M.frameBlack, new THREE.MeshStandardMaterial({ map: bg, roughness: 0.7 }), M.frameBlack, M.frameBlack, M.frameBlack]);
  bgBoard.position.set(15.0, 0.775, -4.3);
  bgBoard.rotation.y = 0.3;
  scene.add(bgBoard);
  for (const [x, z] of [[10.85, -13.3], [10.85, -2.7], [19.25, -13.3], [19.25, -2.7]]) {
    plant(B, M, x, z, 0.95);
    colliders.add(x - 0.32, x + 0.32, z - 0.32, z + 0.32);
  }

  // ---------- Hovedværket ----------
  chandelier(B, M, scene, 0, 3.9, -21, 5.2, 1.3);
  for (const x of [-1.9, 1.9]) {
    B.geom(M.brass, new THREE.CylinderGeometry(0.03, 0.035, 0.95, 10), [x, 0.48, -24.3]);
    B.geom(M.brass, new THREE.SphereGeometry(0.055, 12, 10), [x, 1.0, -24.3]);
    B.geom(M.brass, new THREE.CylinderGeometry(0.17, 0.19, 0.04, 20), [x, 0.02, -24.3]);
  }
  {
    const a = new THREE.Vector3(-1.9, 0.93, -24.3);
    const b = new THREE.Vector3(1.9, 0.93, -24.3);
    const m = new THREE.Vector3(0, 0.66, -24.3);
    const tube = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, m, b), 24, 0.026, 8, false);
    B.add(tube, M.velvet);
  }
  colliders.add(-2.0, 2.0, -24.4, -24.2);
  bench(B, M, 0, -20.1, 0, 2.2, M.velvet);
  colliders.add(-1.15, 1.15, -20.35, -19.85);
  // kandelabre med flakkende lys
  out.flames = [];
  for (const x of [-3.7, 3.7]) {
    B.geom(M.gold, new THREE.CylinderGeometry(0.03, 0.05, 1.6, 10), [x, 0.8, -25.1]);
    B.geom(M.gold, new THREE.CylinderGeometry(0.18, 0.22, 0.05, 20), [x, 0.025, -25.1]);
    B.box(M.gold, 0.6, 0.03, 0.03, x, 1.6, -25.1);
    for (const dx of [-0.28, 0, 0.28]) {
      const h = dx === 0 ? 1.82 : 1.72;
      B.geom(M.linen, new THREE.CylinderGeometry(0.02, 0.02, 0.24, 8), [x + dx, h - 0.1, -25.1]);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), M.flame);
      flame.scale.set(1, 2.2, 1);
      flame.position.set(x + dx, h + 0.06, -25.1);
      scene.add(flame);
      out.flames.push(flame);
      addGlow(scene, M, [x + dx, h + 0.06, -25.1], 0.5, 0.7);
    }
    colliders.add(x - 0.25, x + 0.25, -25.35, -24.85);
  }
  // rosenblade på gulvet
  const petal = new THREE.CircleGeometry(0.03, 6);
  petal.rotateX(-Math.PI / 2);
  const petals = new THREE.InstancedMesh(petal, M.rose, 90);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    tmp.position.set((rnd() - 0.5) * 6, 0.006 + rnd() * 0.002, -24 + (rnd() - 0.5) * 3.2 - (rnd() * 1.2));
    tmp.rotation.set(0, rnd() * 6, 0);
    tmp.scale.set(1 + rnd() * 0.6, 1, 0.7 + rnd() * 0.5);
    tmp.updateMatrix();
    petals.setMatrixAt(i, tmp.matrix);
  }
  scene.add(petals);

  return out;
}
