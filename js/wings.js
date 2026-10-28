// De to nye fløje: Salonen (pejs, flygel, chesterfield) og Spaen (pool, liggestole, sauna).
import * as THREE from 'three';
import { canvas, rng } from './util.js';
import { chandelier, plant, makeSign } from './props.js';
import { addGlow } from './exterior.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function flameTexture() {
  const [c, ctx] = canvas(64, 128);
  const g = ctx.createRadialGradient(32, 92, 2, 32, 80, 60);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.25, 'rgba(255,200,90,0.95)');
  g.addColorStop(0.6, 'rgba(255,110,30,0.55)');
  g.addColorStop(1, 'rgba(255,60,10,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(32, 2);
  ctx.bezierCurveTo(60, 50, 62, 110, 32, 126);
  ctx.bezierCurveTo(2, 110, 4, 50, 32, 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ============================================================ Salonen ===
export function buildSalon(scene, B, M, colliders) {
  const out = { flames: [], update: null };
  const wx = -21.6; // vestvæggens forside
  const cz = 5;
  // --- Pejs i hvid marmor
  B.box(M.marbleWhite, 0.7, 0.06, 2.6, wx + 0.35, 0.03, cz, { uv: 1 });
  for (const s of [-1, 1]) {
    B.box(M.marbleWhite, 0.36, 1.22, 0.32, wx + 0.18, 0.67, cz + s * 0.98, { uv: 0.6 });
    B.box(M.marbleWhite, 0.4, 0.08, 0.38, wx + 0.2, 0.1, cz + s * 0.98);
  }
  B.box(M.marbleWhite, 0.34, 0.24, 1.66, wx + 0.17, 1.13, cz, { uv: 0.6 });
  B.box(M.marbleWhite, 0.48, 0.1, 2.5, wx + 0.24, 1.33, cz, { uv: 0.6 });
  B.box(M.gold, 0.02, 0.06, 1.2, wx + 0.345, 1.13, cz);
  const dark = new THREE.MeshBasicMaterial({ color: '#0b0705' });
  dark.name = 'firebox';
  B.box(dark, 0.02, 1.0, 1.6, wx + 0.01, 0.52, cz);
  B.box(dark, 0.32, 0.02, 1.6, wx + 0.16, 1.0, cz);
  for (const s of [-1, 1]) B.box(dark, 0.32, 1.0, 0.02, wx + 0.16, 0.52, cz + s * 0.8);
  // brændeknude og rist
  for (const [dz, ry] of [[-0.25, 0.2], [0.22, -0.25], [0, 0]]) {
    B.geom(M.walnut, new THREE.CylinderGeometry(0.06, 0.06, 0.62, 10), [wx + 0.2, 0.14 + (dz === 0 ? 0.09 : 0), cz + dz], [Math.PI / 2, ry, 0]);
  }
  B.box(M.lampPost, 0.04, 0.08, 1.0, wx + 0.3, 0.08, cz);
  colliders.add(wx, wx + 0.7, cz - 1.3, cz + 1.3);
  // levende ild
  const ft = flameTexture();
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    sp.position.set(wx + 0.2, 0.32, cz + (i - 3) * 0.12);
    sp.scale.set(0.22, 0.44, 1);
    sp.userData.phase = i * 1.37;
    scene.add(sp);
    out.flames.push(sp);
  }
  out.fireGlow = addGlow(scene, M, [wx + 0.45, 0.45, cz], 2.4, 0.55);
  const floorGlow = new THREE.PlaneGeometry(2.6, 3.2);
  floorGlow.rotateX(-Math.PI / 2);
  const fg = new THREE.MeshBasicMaterial({ map: M.tex.glow, color: '#ff9a4a', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  out.floorGlow = new THREE.Mesh(floorGlow, fg);
  out.floorGlow.position.set(wx + 1.2, 0.014, cz);
  scene.add(out.floorGlow);

  // --- Bogreoler på hver side af pejsen
  for (const [z0, z1] of [[1.0, 3.4], [6.6, 9.0]]) {
    const zc = (z0 + z1) / 2;
    const len = z1 - z0;
    B.box(M.walnut, 0.42, 3.3, 0.06, wx + 0.21, 1.65, z0);
    B.box(M.walnut, 0.42, 3.3, 0.06, wx + 0.21, 1.65, z1);
    B.box(M.walnut, 0.42, 0.12, len, wx + 0.21, 3.3, zc);
    for (let k = 0; k < 6; k++) {
      const y = 0.12 + k * 0.52;
      B.box(M.walnut, 0.42, 0.04, len, wx + 0.21, y, zc);
      if (k < 6) {
        const g = new THREE.PlaneGeometry(len - 0.1, 0.42);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 1.4) + k * 0.37);
        B.geom(M.books, g, [wx + 0.33, y + 0.24, zc], [0, Math.PI / 2, 0]);
      }
    }
    colliders.add(wx, wx + 0.45, z0, z1);
  }

  // --- Persisk tæppe, chesterfieldsofaer og sofabord
  const rug = new THREE.PlaneGeometry(4.6, 3.6);
  rug.rotateX(-Math.PI / 2);
  B.geom(M.rug, rug, [-17.9, 0.008, cz], [0, Math.PI / 2, 0]);
  const sofa = (x, z, rotY) => {
    const m = new THREE.Matrix4().compose(V(x, 0, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rotY), V(1, 1, 1));
    const part = (g, mat, p) => {
      B.add(g, mat, new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(p[0], p[1], p[2])));
      g.dispose();
    };
    part(new THREE.BoxGeometry(2.1, 0.36, 0.9), M.chesterfield, [0, 0.3, 0]);
    part(new THREE.BoxGeometry(2.1, 0.5, 0.22), M.chesterfield, [0, 0.62, -0.36]);
    for (const s of [-1, 1]) {
      part(new THREE.BoxGeometry(0.22, 0.32, 0.9), M.chesterfield, [s * 1.0, 0.6, 0]);
      part(new THREE.CylinderGeometry(0.13, 0.13, 0.9, 16).rotateX(Math.PI / 2), M.chesterfield, [s * 1.0, 0.76, 0]);
      part(new THREE.CylinderGeometry(0.03, 0.025, 0.12, 8), M.brass, [s * 0.95, 0.06, 0.35]);
      part(new THREE.CylinderGeometry(0.03, 0.025, 0.12, 8), M.brass, [s * 0.95, 0.06, -0.35]);
    }
    part(new THREE.BoxGeometry(1.9, 0.1, 0.7), M.chesterfield, [0, 0.52, 0.06]);
  };
  sofa(-18.4, 2.85, 0);
  sofa(-18.4, 7.15, Math.PI);
  colliders.add(-19.55, -17.25, 2.35, 3.35);
  colliders.add(-19.55, -17.25, 6.65, 7.65);
  B.box(M.walnut, 1.3, 0.06, 0.7, -18.4, 0.44, cz);
  for (const [dx, dz] of [[-0.58, -0.28], [0.58, -0.28], [-0.58, 0.28], [0.58, 0.28]]) B.box(M.walnut, 0.06, 0.42, 0.06, -18.4 + dx, 0.21, cz + dz);
  B.box(M.books, 0.32, 0.08, 0.24, -18.7, 0.51, cz + 0.05, { ry: 0.3 });
  B.geom(M.porcelain, new THREE.CylinderGeometry(0.07, 0.05, 0.22, 16), [-18.0, 0.58, cz]);
  for (let i = 0; i < 7; i++) B.geom(M.rose, new THREE.SphereGeometry(0.04, 8, 6), [-18.0 + Math.cos(i) * 0.05, 0.72 + (i % 3) * 0.02, cz + Math.sin(i) * 0.05]);
  colliders.add(-19.1, -17.7, cz - 0.4, cz + 0.4);
  // lænestol med front mod pejsen
  {
    const x = -16.2;
    B.box(M.chesterGreen, 0.85, 0.4, 0.85, x, 0.3, cz);
    B.box(M.chesterGreen, 0.2, 0.6, 0.85, x + 0.33, 0.75, cz);
    for (const s of [-1, 1]) B.box(M.chesterGreen, 0.85, 0.3, 0.16, x, 0.6, cz + s * 0.38);
    colliders.add(x - 0.45, x + 0.45, cz - 0.45, cz + 0.45);
  }

  // --- Flygel ved vinduerne
  {
    const px = -9.6;
    const pz = 7.6;
    const s = new THREE.Shape();
    s.moveTo(-0.72, 0);
    s.lineTo(0.72, 0);
    s.lineTo(0.72, 0.55);
    s.bezierCurveTo(0.72, 1.3, 0.2, 1.1, 0.05, 1.55);
    s.bezierCurveTo(-0.08, 1.85, -0.72, 1.9, -0.72, 1.7);
    s.closePath();
    const body = new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 20 });
    body.rotateX(Math.PI / 2);
    const m = new THREE.Matrix4().compose(V(px, 0.95, pz - 0.85), new THREE.Quaternion(), V(1, 1, 1));
    B.add(body, M.lacquer, m);
    const lid = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false, curveSegments: 20 });
    lid.rotateX(Math.PI / 2);
    const lm = new THREE.Matrix4().compose(V(px - 0.72, 0.97, pz - 0.85), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.62)), V(1, 1, 1));
    lm.multiply(new THREE.Matrix4().makeTranslation(0.72, 0, 0));
    B.add(lid, M.lacquer, lm);
    B.geom(M.brass, new THREE.CylinderGeometry(0.008, 0.008, 0.6, 6), [px + 0.55, 1.22, pz - 0.2], [0, 0, 0.5]);
    // tangenter
    const [kc, kctx] = canvas(512, 64);
    kctx.fillStyle = '#f6f2e8';
    kctx.fillRect(0, 0, 512, 64);
    for (let i = 0; i <= 52; i++) {
      kctx.fillStyle = '#222';
      kctx.fillRect(i * (512 / 52), 0, 1, 64);
      if ([0, 1, 3, 4, 5].includes(i % 7)) kctx.fillRect(i * (512 / 52) + 6, 0, 6, 38);
    }
    const kt = new THREE.CanvasTexture(kc);
    kt.colorSpace = THREE.SRGBColorSpace;
    const keysMat = new THREE.MeshStandardMaterial({ map: kt, roughness: 0.3 });
    keysMat.name = 'pianoKeys';
    const kg = new THREE.PlaneGeometry(1.36, 0.16);
    kg.rotateX(-Math.PI / 2);
    B.geom(keysMat, kg, [px, 0.8, pz - 0.95]);
    B.box(M.lacquer, 1.44, 0.14, 0.22, px, 0.72, pz - 0.95);
    for (const [dx, dz] of [[-0.6, -0.8], [0.6, -0.8], [-0.4, 0.75]]) {
      B.geom(M.lacquer, new THREE.CylinderGeometry(0.05, 0.035, 0.66, 10), [px + dx, 0.33, pz + dz]);
      B.geom(M.brass, new THREE.SphereGeometry(0.035, 8, 6), [px + dx, 0.03, pz + dz]);
    }
    B.box(M.lacquer, 0.9, 0.06, 0.38, px, 0.5, pz - 1.45);
    B.box(M.chesterfield, 0.86, 0.06, 0.34, px, 0.55, pz - 1.45);
    for (const [dx, dz] of [[-0.4, -0.14], [0.4, -0.14], [-0.4, 0.14], [0.4, 0.14]]) B.box(M.lacquer, 0.04, 0.48, 0.04, px + dx, 0.24, pz - 1.45 + dz);
    colliders.add(px - 0.8, px + 0.8, pz - 1.1, pz + 1.05);
    colliders.add(px - 0.48, px + 0.48, pz - 1.65, pz - 1.25);
  }
  // globus og planter
  B.geom(M.walnut, new THREE.CylinderGeometry(0.03, 0.18, 0.75, 12), [-20.4, 0.37, 9.1]);
  const globeMat = new THREE.MeshStandardMaterial({ color: '#c9b27a', roughness: 0.5 });
  globeMat.name = 'globe';
  B.geom(globeMat, new THREE.SphereGeometry(0.26, 24, 16), [-20.4, 1.02, 9.1]);
  B.geom(M.brass, new THREE.TorusGeometry(0.29, 0.01, 6, 32), [-20.4, 1.02, 9.1], [0, 0.5, 0.4]);
  colliders.add(-20.7, -20.1, 8.8, 9.4);
  for (const [x, z] of [[-6.85, 0.85], [-6.85, 9.15]]) {
    plant(B, M, x, z, 1.0);
    colliders.add(x - 0.32, x + 0.32, z - 0.32, z + 0.32);
  }
  chandelier(B, M, scene, -13.9, 3.45, 5, 4.6, 1.15);
  makeSign(scene, 'Salonen', null, { x: -5.78, y: 3.6, z: 5, rotY: Math.PI / 2, w: 1.6 });
  out.update = (dt, time) => {
    for (const f of out.flames) {
      const p = f.userData.phase;
      const k = 0.8 + Math.sin(time * 9 + p) * 0.12 + Math.sin(time * 23 + p * 2) * 0.08 + Math.random() * 0.06;
      f.scale.set(0.2 + 0.05 * Math.sin(time * 5 + p), 0.42 * k, 1);
      f.position.y = 0.3 + 0.05 * k;
    }
    const g = 0.5 + Math.sin(time * 7) * 0.06 + Math.random() * 0.05;
    out.fireGlow.material.opacity = g;
    out.floorGlow.material.opacity = 0.32 + g * 0.15;
  };
  return out;
}

// ============================================================ Spaen ===
function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, deep: { value: new THREE.Color('#0a5f78') }, shallow: { value: new THREE.Color('#56d0de') } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float time; uniform vec3 deep; uniform vec3 shallow; varying vec2 vUv;
      float wave(vec2 p, float t){
        float c = 0.0;
        for (int i = 0; i < 4; i++){
          float fi = float(i);
          vec2 d = vec2(cos(fi * 1.7 + 0.3), sin(fi * 2.3 + 0.7));
          c += sin(dot(p, d) * (2.2 + fi) + t * (0.8 + fi * 0.3));
        }
        return c / 4.0;
      }
      void main(){
        vec2 p = vUv * vec2(14.0, 6.4);
        float w = wave(p, time);
        float caust = pow(1.0 - abs(wave(p * 1.7 + 3.0, time * 1.3)), 6.0);
        vec3 col = mix(deep, shallow, 0.45 + 0.25 * w);
        col += vec3(0.75, 0.95, 1.0) * caust * 0.35;
        float edge = smoothstep(0.0, 0.06, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        col = mix(col * 0.75, col, edge);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function buildSpa(scene, B, M, colliders) {
  const out = { candles: [], steam: [], update: null, interactables: [] };
  const P = { x0: 10.6, x1: 18.4, z0: 2.6, z1: 6.4, h: 0.5, rim: 0.3 };
  const cx = (P.x0 + P.x1) / 2;
  const cz = (P.z0 + P.z1) / 2;
  // --- Poolkant i hvid marmor og mosaik indvendigt
  B.box(M.marbleWhite, P.x1 - P.x0, P.h, P.rim, cx, P.h / 2, P.z0 + P.rim / 2, { uv: 1 });
  B.box(M.marbleWhite, P.x1 - P.x0, P.h, P.rim, cx, P.h / 2, P.z1 - P.rim / 2, { uv: 1 });
  B.box(M.marbleWhite, P.rim, P.h, P.z1 - P.z0 - 2 * P.rim, P.x0 + P.rim / 2, P.h / 2, cz, { uv: 1 });
  B.box(M.marbleWhite, P.rim, P.h, P.z1 - P.z0 - 2 * P.rim, P.x1 - P.rim / 2, P.h / 2, cz, { uv: 1 });
  B.box(M.mosaicMat, P.x1 - P.x0 - 2 * P.rim, 0.02, P.z1 - P.z0 - 2 * P.rim, cx, 0.01, cz, { uv: 0.6 });
  B.box(M.gold, P.x1 - P.x0 + 0.02, 0.02, 0.02, cx, P.h + 0.005, P.z0 + 0.01);
  B.box(M.gold, P.x1 - P.x0 + 0.02, 0.02, 0.02, cx, P.h + 0.005, P.z1 - 0.01);
  colliders.add(P.x0, P.x1, P.z0, P.z1);
  const water = waterMaterial();
  const wg = new THREE.PlaneGeometry(P.x1 - P.x0 - 2 * P.rim, P.z1 - P.z0 - 2 * P.rim);
  wg.rotateX(-Math.PI / 2);
  const wm = new THREE.Mesh(wg, water);
  wm.position.set(cx, P.h - 0.07, cz);
  scene.add(wm);
  out.water = water;
  for (const x of [12.2, 14.5, 16.8]) addGlow(scene, M, [x, P.h - 0.12, cz], 1.4, 0.35).material.color.set('#9ff4ff');
  // --- Damp over vandet
  const steamMat = new THREE.SpriteMaterial({ map: M.tex.glow, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  const r = rng(5);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(steamMat.clone());
    s.userData = { x: P.x0 + 0.5 + r() * (P.x1 - P.x0 - 1), z: P.z0 + 0.5 + r() * (P.z1 - P.z0 - 1), t: r() };
    scene.add(s);
    out.steam.push(s);
  }
  // --- Stearinlys langs kanten
  const ft = flameTexture();
  const candleGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.1, 12);
  for (let x = P.x0 + 0.5; x < P.x1 - 0.3; x += 0.9) {
    for (const z of [P.z0 + 0.15, P.z1 - 0.15]) {
      B.geom(M.ivory, candleGeo, [x, P.h + 0.05, z]);
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      fl.position.set(x, P.h + 0.13, z);
      fl.scale.set(0.035, 0.07, 1);
      fl.userData.phase = x * 3 + z;
      scene.add(fl);
      out.candles.push(fl);
    }
  }
  // --- Orkidéer på hjørnerne
  for (const [x, z] of [[P.x0 + 0.15, P.z0 + 0.15], [P.x1 - 0.15, P.z0 + 0.15], [P.x0 + 0.15, P.z1 - 0.15], [P.x1 - 0.15, P.z1 - 0.15]]) {
    B.geom(M.porcelain, new THREE.CylinderGeometry(0.09, 0.07, 0.16, 16), [x, P.h + 0.08, z]);
    B.geom(M.plantGreen, new THREE.SphereGeometry(0.08, 8, 6), [x, P.h + 0.18, z], [0, 0, 0], [1.4, 0.4, 0.8]);
    B.geom(M.walnut, new THREE.CylinderGeometry(0.004, 0.004, 0.42, 4), [x, P.h + 0.36, z], [0.2, 0, 0.1]);
    for (let i = 0; i < 6; i++) B.geom(M.porcelain, new THREE.SphereGeometry(0.028, 8, 6), [x + 0.02 + i * 0.012, P.h + 0.42 + i * 0.03, z + Math.sin(i) * 0.03], [0, 0, 0], [1, 0.5, 1]);
  }
  // --- Liggestole i teak med hvide hynder og rullede håndklæder
  const loungerXs = [11.6, 13.9, 16.2, 18.5];
  loungerXs.forEach((x, i) => {
    const z = 8.25;
    B.box(M.teak, 0.72, 0.08, 1.95, x, 0.3, z);
    for (const [dx, dz] of [[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]]) B.box(M.teak, 0.06, 0.28, 0.06, x + dx, 0.14, z + dz);
    B.box(M.towel, 0.66, 0.08, 1.3, x, 0.38, z - 0.3);
    B.box(M.towel, 0.66, 0.08, 0.72, x, 0.58, z + 0.62, { rx: -0.65 });
    B.box(M.teak, 0.7, 0.05, 0.75, x, 0.53, z + 0.68, { rx: -0.65 });
    B.geom(M.towel, new THREE.CylinderGeometry(0.07, 0.07, 0.5, 14), [x, 0.48, z - 0.75], [0, 0, Math.PI / 2]);
    colliders.add(x - 0.38, x + 0.38, z - 1.0, z + 1.0);
    if (i < loungerXs.length - 1) {
      const tx = x + 1.15;
      B.geom(M.teak, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20), [tx, 0.45, z + 0.4]);
      B.geom(M.teak, new THREE.CylinderGeometry(0.03, 0.03, 0.43, 8), [tx, 0.22, z + 0.4]);
      B.geom(M.glass, new THREE.CylinderGeometry(0.035, 0.03, 0.12, 12), [tx - 0.06, 0.53, z + 0.4]);
      B.geom(M.plantGreen, new THREE.CylinderGeometry(0.025, 0.025, 0.006, 12), [tx - 0.06, 0.56, z + 0.4]);
      B.geom(M.ivory, candleGeo, [tx + 0.07, 0.52, z + 0.38]);
    }
  });
  const spot = loungerXs[1];
  out.lounger = { x: spot, z: 8.25 };
  out.interactables.push({ id: 'spa', pos: V(spot, 0, 8.25), rect: [spot - 0.4, spot + 0.4, 7.25, 9.25], range: 1.2, meshes: [] });
  // --- Sauna i østvæggens niche
  {
    const x0 = 19.4;
    const x1 = 21.6;
    const z0 = 3.4;
    const z1 = 6.6;
    const zc = (z0 + z1) / 2;
    B.box(M.teak, x1 - x0, 2.5, 0.08, (x0 + x1) / 2, 1.25, z0, { uv: 1 });
    B.box(M.teak, x1 - x0, 2.5, 0.08, (x0 + x1) / 2, 1.25, z1, { uv: 1 });
    B.box(M.teak, x1 - x0, 0.1, z1 - z0, (x0 + x1) / 2, 2.5, zc);
    B.box(M.teak, 0.08, 2.5, 0.8, x0, 1.25, z0 + 0.4);
    B.box(M.teak, 0.08, 2.5, 0.8, x0, 1.25, z1 - 0.4);
    B.box(M.teak, 0.08, 0.5, z1 - z0, x0, 2.25, zc);
    const glow = new THREE.MeshBasicMaterial({ color: '#ffb46a', toneMapped: false });
    glow.name = 'saunaGlow';
    B.box(glow, 0.02, 1.95, 1.58, x0 + 0.06, 1.0, zc);
    B.box(M.glass, 0.03, 2.0, 1.6, x0 - 0.01, 1.0, zc);
    B.box(M.brass, 0.04, 0.4, 0.03, x0 - 0.04, 1.05, zc + 0.6);
    addGlow(scene, M, [x0 - 0.2, 1.1, zc], 2.4, 0.4).material.color.set('#ffb070');
    colliders.add(x0 - 0.1, x1, z0, z1);
    makeSign(scene, 'Sauna', null, { x: x0 - 0.05, y: 2.25, z: zc, rotY: -Math.PI / 2, w: 0.9 });
  }
  // --- Stenkumme med rindende vand, håndklædereol og planter
  B.geom(M.stoneSmooth, new THREE.CylinderGeometry(0.42, 0.3, 0.75, 24), [7.4, 0.375, 8.7]);
  const bowlWater = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24).rotateX(-Math.PI / 2), water);
  bowlWater.position.set(7.4, 0.73, 8.7);
  scene.add(bowlWater);
  colliders.add(6.95, 7.85, 8.25, 9.15);
  B.box(M.teak, 0.45, 1.5, 0.9, 6.45, 0.75, 1.3);
  for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) B.geom(M.towel, new THREE.CylinderGeometry(0.07, 0.07, 0.4, 12), [6.5, 0.35 + k * 0.45, 0.98 + j * 0.3], [Math.PI / 2, 0, Math.PI / 2]);
  colliders.add(6.2, 6.7, 0.85, 1.75);
  for (const [x, z] of [[21.05, 0.85], [21.05, 9.15], [9.6, 9.2]]) {
    plant(B, M, x, z, 1.15);
    colliders.add(x - 0.35, x + 0.35, z - 0.35, z + 0.35);
  }
  // --- Stjernehimmel i loftet
  const n = 260;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([6.4 + r() * 15.2, 4.58, 0.3 + r() * 9.4], i * 3);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fff3d6', size: 2.2, sizeAttenuation: false, toneMapped: false })));
  makeSign(scene, 'Spaen', null, { x: 5.78, y: 3.6, z: 5, rotY: -Math.PI / 2, w: 1.4 });
  out.update = (dt, time) => {
    water.uniforms.time.value = time;
    for (const c of out.candles) {
      const k = 1 + Math.sin(time * 11 + c.userData.phase) * 0.12 + Math.random() * 0.08;
      c.scale.set(0.035, 0.07 * k, 1);
    }
    for (const s of out.steam) {
      const u = s.userData;
      u.t = (u.t + dt * 0.08) % 1;
      s.position.set(u.x + Math.sin(u.t * 6 + u.z) * 0.2, P.h + u.t * 1.6, u.z);
      s.scale.setScalar(0.5 + u.t * 1.4);
      s.material.opacity = Math.sin(u.t * Math.PI) * 0.07;
    }
  };
  return out;
}
