// Ankomsten: limousine, rød løber, paparazzi, dørmænd, butler med champagne, lys og skilte.
import * as THREE from 'three';
import { EXT } from './world.js';
import { matrixFrom } from './builder.js';
import { canvas } from './util.js';

// --- Stiliserede figurer --------------------------------------------------------
export function makePerson(M, opts = {}) {
  const { body = M.suit, skin = M.skin, hair = M.hair, tux = true, gloves = false, scale = 1 } = opts;
  const g = new THREE.Group();
  const legGeo = new THREE.CapsuleGeometry(0.075, 0.72, 4, 8);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, body);
    leg.position.set(s * 0.1, 0.46, 0);
    g.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.24), M.frameBlack);
    shoe.position.set(s * 0.1, 0.03, 0.04);
    g.add(shoe);
  }
  const upper = new THREE.Group();
  upper.position.y = 0.86;
  g.add(upper);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.66, 14), body);
  torso.scale.z = 0.62;
  torso.position.y = 0.33;
  upper.add(torso);
  if (tux) {
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.02), M.shirt);
    shirt.position.set(0, 0.42, 0.112);
    shirt.rotation.x = -0.08;
    upper.add(shirt);
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.03), M.frameBlack);
    tie.position.set(0, 0.58, 0.122);
    upper.add(tie);
  }
  const armGeo = new THREE.CapsuleGeometry(0.055, 0.5, 4, 8);
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.25, 0.6, 0);
    const arm = new THREE.Mesh(armGeo, body);
    arm.position.y = -0.3;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), gloves ? M.glove : skin);
    hand.position.y = -0.6;
    pivot.add(hand);
    pivot.rotation.z = s * 0.08;
    upper.add(pivot);
    arms.push(pivot);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), skin);
  neck.position.y = 0.7;
  upper.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 14), skin);
  head.scale.set(1, 1.15, 1.05);
  head.position.y = 0.86;
  upper.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.122, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.scale.set(1, 1.1, 1.08);
  hairCap.position.set(0, 0.875, -0.008);
  hairCap.rotation.x = -0.25;
  upper.add(hairCap);
  g.scale.setScalar(scale);
  return { group: g, upper, arms, head };
}

function makePaparazzo(M, i) {
  const p = makePerson(M, { body: i % 2 ? M.coat : M.suit, tux: false, skin: i % 3 ? M.skin : M.skinB, hair: i % 2 ? M.hairB : M.hair });
  // armene løftet med kamera foran ansigtet
  p.arms[0].rotation.set(-2.0, 0, 0.55);
  p.arms[1].rotation.set(-2.0, 0, -0.55);
  const cam = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), M.frameBlack);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.1, 12), M.frameBlack);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.08;
  const flashHead = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05), M.frameBlack);
  flashHead.position.set(0, 0.09, 0.01);
  cam.add(body, lens, flashHead);
  cam.position.set(0, 0.84, 0.2);
  p.upper.add(cam);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.tex.glow, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  flash.scale.setScalar(1.1);
  flash.position.set(0, 0.95, 0.24);
  p.upper.add(flash);
  return { ...p, flash, cam };
}

// --- Limousine ------------------------------------------------------------------
function makeLimo(M) {
  const g = new THREE.Group();
  const L = 4.25;
  const s = new THREE.Shape();
  s.moveTo(-L, 0.32);
  s.lineTo(-L - 0.05, 0.62);
  s.quadraticCurveTo(-L, 0.84, -3.85, 0.86);
  s.lineTo(-3.15, 0.9);
  s.quadraticCurveTo(-2.75, 1.38, -2.35, 1.42);
  s.lineTo(1.95, 1.42);
  s.quadraticCurveTo(2.35, 1.4, 2.95, 0.94);
  s.lineTo(3.95, 0.84);
  s.quadraticCurveTo(L + 0.08, 0.8, L + 0.05, 0.55);
  s.lineTo(L, 0.32);
  s.closePath();
  const W = 1.84;
  const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 3, curveSegments: 16 });
  bodyGeo.translate(0, 0, -W / 2);
  const body = new THREE.Mesh(bodyGeo, M.paint);
  g.add(body);
  // ruder (på begge sider)
  const win = new THREE.Shape();
  win.moveTo(-3.02, 0.95);
  win.quadraticCurveTo(-2.68, 1.33, -2.3, 1.35);
  win.lineTo(1.9, 1.35);
  win.quadraticCurveTo(2.25, 1.33, 2.8, 0.97);
  win.closePath();
  const winGeo = new THREE.ShapeGeometry(win, 12);
  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(winGeo, M.tinted);
    w.position.z = side * (W / 2 + 0.071);
    if (side < 0) w.rotation.y = Math.PI, (w.position.x = 0), w.scale.set(-1, 1, 1);
    g.add(w);
    // stolper (i fortovssiden rammer de bagdøren ind)
    for (const px of side < 0 ? [-2.28, -0.94, 0.3, 1.5] : [-1.6, 0.3, 1.5]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.02), M.frameBlack);
      pillar.position.set(px, 1.15, side * (W / 2 + 0.075));
      g.add(pillar);
    }
    // kromlister; i fortovssiden springes døren over, så listen følger døren
    const spans = side < 0 ? [[-3.9, -2.2], [-1.0, 3.7]] : [[-3.9, 3.7]];
    for (const [a, b] of spans) {
      const chrome = new THREE.Mesh(new THREE.BoxGeometry(b - a, 0.025, 0.02), M.chrome);
      chrome.position.set((a + b) / 2, 0.92, side * (W / 2 + 0.074));
      g.add(chrome);
      const sa = Math.max(a, -3.6);
      const sb = Math.min(b, 3.4);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(sb - sa, 0.04, 0.02), M.chrome);
      sill.position.set((sa + sb) / 2, 0.38, side * (W / 2 + 0.072));
      g.add(sill);
    }
  }
  // forrude og bagrude
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.0, W * 0.92), M.tinted);
  front.position.set(2.47, 1.17, 0);
  front.rotation.set(-Math.PI / 2, 0.86, 0, 'YXZ');
  front.rotation.set(0, Math.PI / 2, 0);
  front.rotateX(-0.75);
  g.add(front);
  // lygter, kofangere, grill
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.32), M.headlight);
    hl.position.set(L + 0.1, 0.66, side * 0.58);
    g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.3), M.taillight);
    tl.position.set(-L - 0.12, 0.7, side * 0.6);
    g.add(tl);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.62), M.chrome);
  grille.position.set(L + 0.11, 0.55, 0);
  g.add(grille);
  for (const x of [L + 0.1, -L - 0.12]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, W + 0.1), M.chrome);
    bumper.position.set(x, 0.38, 0);
    g.add(bumper);
  }
  // hjul
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 24);
  tireGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.27, 16);
  rimGeo.rotateX(Math.PI / 2);
  for (const x of [-3.05, 3.0]) {
    for (const side of [-1, 1]) {
      const wg = new THREE.Group();
      wg.position.set(x, 0.36, side * (W / 2 - 0.05));
      const tire = new THREE.Mesh(tireGeo, M.tire);
      const rim = new THREE.Mesh(rimGeo, M.chrome);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.28), M.chrome);
      wg.add(tire, rim, spoke);
      g.add(wg);
      wheels.push(wg);
    }
  }
  // bagdør i fortovssiden (-z) med lys indenfor
  const doorZ = -(W / 2 + 0.075);
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.98), new THREE.MeshBasicMaterial({ color: '#3a2414', toneMapped: false }));
  inside.position.set(-1.6, 0.86, doorZ + 0.005);
  inside.rotation.y = Math.PI;
  g.add(inside);
  const seat = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ color: '#b08458', toneMapped: false }));
  seat.position.set(-1.6, 0.62, doorZ + 0.004);
  seat.rotation.y = Math.PI;
  g.add(seat);
  const hinge = new THREE.Group();
  hinge.position.set(-1.04, 0, doorZ);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.14, 1.0, 0.05), M.paint);
  door.position.set(-0.57, 0.87, -0.02);
  const doorWin = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.36), M.tinted);
  doorWin.position.set(-0.57, 1.15, -0.047);
  doorWin.rotation.y = Math.PI;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), M.chrome);
  handle.position.set(-0.95, 0.95, -0.05);
  const dChrome = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.025, 0.02), M.chrome);
  dChrome.position.set(-0.57, 0.92, -0.05);
  const dSill = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.04, 0.02), M.chrome);
  dSill.position.set(-0.57, 0.38, -0.05);
  hinge.add(door, doorWin, handle, dChrome, dSill);
  g.add(hinge);
  // skygge
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 2.8), M.shadow);
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.01;
  g.add(sh);
  return { group: g, wheels, door: hinge };
}

// --- Skilte og tekst -------------------------------------------------------------
function textPlane(text, { w, h, font, color = '#e7c77e', bg = null, px = 1024, align = 'center', shadow = true }) {
  const ph = Math.round((px * h) / w);
  const [c, ctx] = canvas(px, ph);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, px, ph);
  }
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
  }
  ctx.fillText(text, align === 'center' ? px / 2 : 20, ph / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: !bg, toneMapped: false }));
}

function drawCrown(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-50, 30);
  ctx.lineTo(-56, -18);
  ctx.lineTo(-28, 4);
  ctx.lineTo(0, -34);
  ctx.lineTo(28, 4);
  ctx.lineTo(56, -18);
  ctx.lineTo(50, 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-52, 34, 104, 12);
  for (const [x, y] of [[-56, -24], [0, -40], [56, -24]]) {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function welcomeSign(title) {
  const [c, ctx] = canvas(600, 820);
  ctx.fillStyle = '#121010';
  ctx.fillRect(0, 0, 600, 820);
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 6;
  ctx.strokeRect(22, 22, 556, 776);
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, 528, 748);
  drawCrown(ctx, 300, 170, 1.3, '#e3c271');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8cf8f';
  ctx.font = 'italic 600 64px "Cormorant Garamond", Georgia, serif';
  ctx.fillText('Velkommen,', 300, 330);
  ctx.fillText('Deres Majestæt', 300, 405);
  ctx.fillStyle = '#c7b591';
  ctx.font = '500 24px Inter, system-ui, sans-serif';
  ctx.fillText('GALLAPREMIERE I AFTEN', 300, 500);
  ctx.strokeStyle = '#c9a24a';
  ctx.beginPath();
  ctx.moveTo(200, 540);
  ctx.lineTo(400, 540);
  ctx.stroke();
  ctx.fillStyle = '#e8cf8f';
  ctx.font = 'italic 500 44px "Cormorant Garamond", Georgia, serif';
  ctx.fillText(title, 300, 610);
  ctx.fillStyle = '#9d8b66';
  ctx.font = '500 20px Inter, system-ui, sans-serif';
  ctx.fillText('KUN FOR INDBUDTE GÆSTER', 300, 700);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bannerTexture(word) {
  const [c, ctx] = canvas(256, 1024);
  ctx.fillStyle = '#7a0e1c';
  ctx.fillRect(0, 0, 256, 1024);
  ctx.strokeStyle = '#d6b060';
  ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, 224, 992);
  drawCrown(ctx, 128, 120, 0.9, '#e1c06e');
  ctx.save();
  ctx.translate(128, 590);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#efd38c';
  ctx.font = '600 76px "Cormorant Garamond", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(word, 0, 0, 760);
  ctx.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- Byg ankomsten -----------------------------------------------------------------
export function buildArrival(scene, B, M, colliders, title) {
  const out = { animated: [] };
  const sy = EXT.sidewalkY;

  // Limousinen holder ved kantstenen med bagdøren ud for løberen.
  const limo = makeLimo(M);
  limo.group.position.set(1.6, EXT.streetY, 22.35);
  scene.add(limo.group);
  out.limo = limo;
  out.limoCollider = colliders.add(1.6 - 4.4, 1.6 + 4.4, 22.35 - 1.05, 22.35 + 1.05);

  // Messingstandere og fløjlsreb langs løberen
  const post = new THREE.CylinderGeometry(0.025, 0.03, 0.95, 10);
  const knob = new THREE.SphereGeometry(0.05, 12, 10);
  const foot = new THREE.CylinderGeometry(0.16, 0.18, 0.04, 18);
  const zs = [15.5, 16.8, 18.1, 19.4, 20.6];
  for (const sx of [-1.65, 1.65]) {
    zs.forEach((z) => {
      B.geom(M.brass, post, [sx, sy + 0.5, z]);
      B.geom(M.brass, knob, [sx, sy + 1.0, z]);
      B.geom(M.brass, foot, [sx, sy + 0.02, z]);
    });
    for (let i = 0; i < zs.length - 1; i++) {
      const a = new THREE.Vector3(sx, sy + 0.93, zs[i]);
      const b = new THREE.Vector3(sx, sy + 0.93, zs[i + 1]);
      const m = a.clone().lerp(b, 0.5);
      m.y -= 0.16;
      const tube = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, m, b), 16, 0.022, 8, false);
      B.add(tube, M.velvet);
      tube.dispose();
    }
    colliders.add(sx - 0.06, sx + 0.06, zs[0] - 0.1, zs[zs.length - 1] + 0.1);
  }

  // Paparazzi bag rebene
  const papSpots = [
    [-2.55, 16.3, 0.9], [-3.35, 18.0, 1.15], [-2.5, 19.7, 1.3],
    [2.6, 16.9, -0.95], [3.3, 18.6, -1.2], [2.55, 20.2, -1.35],
  ];
  out.paparazzi = papSpots.map(([x, z, rot], i) => {
    const p = makePaparazzo(M, i);
    p.group.position.set(x, sy, z);
    p.group.rotation.y = rot;
    scene.add(p.group);
    colliders.add(x - 0.3, x + 0.3, z - 0.3, z + 0.3);
    return p;
  });
  out.flashLights = [0, 1].map(() => {
    const l = new THREE.PointLight('#e8f0ff', 0, 9, 1.6);
    scene.add(l);
    return l;
  });

  // Dørmænd i smoking og butleren med champagne
  out.doormen = [-1.95, 1.95].map((x) => {
    const d = makePerson(M, { gloves: true });
    d.group.position.set(x, 0, 11.25);
    d.group.rotation.y = x < 0 ? 0.35 : -0.35;
    d.arms[0].rotation.z = -0.15;
    d.arms[1].rotation.z = 0.15;
    scene.add(d.group);
    colliders.add(x - 0.3, x + 0.3, 10.95, 11.55);
    return d;
  });
  const butler = makePerson(M, { gloves: true, hair: M.hairB });
  butler.group.position.set(2.15, 0, 13.0);
  butler.group.rotation.y = -1.0;
  scene.add(butler.group);
  colliders.add(1.85, 2.45, 12.7, 13.3);
  // højre arm holder bakken frem
  butler.arms[1].rotation.set(-1.35, 0, -0.05);
  const tray = new THREE.Group();
  tray.position.set(0.24, 0.62, 0.52);
  butler.upper.add(tray);
  const trayDisk = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.2, 0.015, 28), M.silver);
  tray.add(trayDisk);
  out.butlerFlutes = [];
  const fluteGeo = fluteGeometry();
  const liquidGeo = fluteLiquidGeometry();
  for (const [fx, fz] of [[-0.08, -0.05], [0.08, -0.05], [0, 0.09]]) {
    const fg = new THREE.Group();
    fg.add(new THREE.Mesh(fluteGeo, M.glass));
    fg.add(new THREE.Mesh(liquidGeo, M.champagne));
    fg.position.set(fx, 0.008, fz);
    tray.add(fg);
    out.butlerFlutes.push(fg);
  }
  out.butler = butler;

  // Velkomstskilt på stander
  const signGroup = new THREE.Group();
  signGroup.position.set(-2.35, 0, 13.0);
  signGroup.rotation.y = 0.75;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.06), new THREE.MeshBasicMaterial({ map: welcomeSign(title), toneMapped: false, color: '#dddddd' }));
  board.position.y = 1.32;
  board.rotation.x = -0.08;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.12, 0.03), M.gold);
  frame.position.set(0, 1.32, -0.02);
  frame.rotation.x = -0.08;
  signGroup.add(board, frame);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 8), M.brass);
    leg.position.set(s * 0.3, 0.8, -0.12);
    leg.rotation.x = 0.12;
    signGroup.add(leg);
  }
  scene.add(signGroup);
  colliders.add(-2.75, -1.95, 12.7, 13.3);

  // Frisetekst på portikoen og bannere
  const frieze = textPlane(title.toUpperCase(), { w: 14, h: 0.9, font: '600 92px "Cormorant Garamond", Georgia, serif', px: 2048, color: '#e2c27a' });
  frieze.position.set(0, 8.15, 13.61);
  scene.add(frieze);
  for (const [x, word] of [[-3.95, 'GALLAPREMIERE'], [3.95, 'I AFTEN']]) {
    const bt = bannerTexture(word);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 3.6), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.3 }));
    banner.position.set(x, 5.65, 12.62);
    scene.add(banner);
    B.box(M.gold, 1.2, 0.05, 0.05, x, 7.47, 12.62);
  }

  // Topiarier i krukker mellem søjlerne
  const ball = new THREE.SphereGeometry(0.42, 16, 12);
  const planter = new THREE.BoxGeometry(0.62, 0.62, 0.62);
  for (const x of [-10.55, -7.25, -3.95, 3.95, 7.25, 10.55]) {
    B.geom(M.potBlack, planter, [x, 0.31, 13.15]);
    B.geom(M.plantDark, ball, [x, 1.05, 13.15]);
    B.geom(M.plantDark, ball, [x, 1.65, 13.15], [0, 0, 0], [0.75, 0.75, 0.75]);
    B.box(M.walnut, 0.05, 0.4, 0.05, x, 0.8, 13.15);
    colliders.add(x - 0.35, x + 0.35, 12.8, 13.5);
  }

  // Lamper ved døren
  for (const x of [-1.95, 1.95]) {
    B.box(M.brass, 0.06, 0.06, 0.3, x, 2.85, EXT.facadeZ + 0.15);
    B.box(M.warmLight, 0.2, 0.32, 0.2, x, 2.95, EXT.facadeZ + 0.33);
    B.box(M.brass, 0.26, 0.04, 0.26, x, 3.13, EXT.facadeZ + 0.33);
    addGlow(scene, M, [x, 2.95, EXT.facadeZ + 0.36], 1.6, 0.8);
  }

  // Gadelamper med lyskegle på jorden
  const pole = new THREE.CylinderGeometry(0.06, 0.09, 4.2, 10);
  const lampHead = new THREE.SphereGeometry(0.2, 14, 10);
  const poolGeo = new THREE.PlaneGeometry(6, 6);
  poolGeo.rotateX(-Math.PI / 2);
  const groundPool = new THREE.MeshBasicMaterial({ map: M.tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35, toneMapped: false });
  for (const [x, z, y] of [[-6.5, 20.5, sy], [6.5, 20.5, sy], [-14, 20.5, sy], [14, 20.5, sy], [-20, 34.6, sy], [-8, 34.6, sy], [4, 34.6, sy], [16, 34.6, sy]]) {
    B.geom(M.lampPost, pole, [x, y + 2.1, z]);
    B.box(M.lampPost, 0.3, 0.12, 0.3, x, y + 4.2, z);
    B.geom(M.warmLight, lampHead, [x, y + 4.42, z]);
    addGlow(scene, M, [x, y + 4.42, z], 2.6, 0.9);
    B.add(poolGeo, groundPool, matrixFrom([x, y + 0.02, z]));
    if (z < 25) colliders.add(x - 0.15, x + 0.15, z - 0.15, z + 0.15);
  }

  // Projektører der fejer over himlen
  out.searchlights = [-9.5, 9.5].map((x, i) => {
    B.box(M.lampPost, 0.7, 0.5, 0.7, x, sy + 0.25, 18.2);
    colliders.add(x - 0.4, x + 0.4, 17.8, 18.6);
    const pivot = new THREE.Group();
    pivot.position.set(x, sy + 0.5, 18.2);
    const beamGeo = new THREE.CylinderGeometry(2.4, 0.18, 70, 24, 1, true);
    beamGeo.translate(0, 35, 0);
    const beam = new THREE.Mesh(beamGeo, beamMaterial());
    pivot.add(beam);
    scene.add(pivot);
    return { pivot, phase: i * 2.1 };
  });

  // Lys: varmt ved indgangen, koldt måneskin
  const entryLight = new THREE.PointLight('#ffd7a0', 26, 16, 1.4);
  entryLight.position.set(0, 4.2, 13.8);
  scene.add(entryLight);
  const carpetLight = new THREE.PointLight('#ffe2b8', 14, 12, 1.5);
  carpetLight.position.set(0, 3.2, 19.5);
  scene.add(carpetLight);

  out.interactables = [
    { id: 'champagne', pos: new THREE.Vector3(2.0, 0, 13.4), range: 2.4, meshes: [trayDisk, ...out.butlerFlutes.flatMap((f) => f.children)] },
  ];
  return out;
}

export function addGlow(scene, M, pos, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.tex.glow, color: '#ffe1b0', transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  s.position.set(pos[0], pos[1], pos[2]);
  s.scale.setScalar(size);
  scene.add(s);
  return s;
}

function beamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {},
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 1.6) * 0.16; float edge = 1.0 - abs(vUv.x * 2.0 - 1.0); gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a, a); }',
  });
}

// --- Glas ---------------------------------------------------------------------------
export function fluteGeometry() {
  const pts = [
    [0.0, 0], [0.032, 0], [0.033, 0.004], [0.006, 0.01], [0.004, 0.09], [0.012, 0.1], [0.024, 0.13], [0.03, 0.18], [0.032, 0.22], [0.031, 0.222],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 20);
}

export function fluteLiquidGeometry(level = 0.19) {
  const pts = [
    [0.0, 0.105], [0.01, 0.105], [0.021, 0.13], [0.027, 0.17], [0.029, level], [0.0, level],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 20);
}

export function coupeGeometry() {
  const pts = [
    [0.0, 0], [0.04, 0], [0.041, 0.004], [0.006, 0.012], [0.005, 0.07], [0.02, 0.078], [0.05, 0.092], [0.062, 0.11], [0.063, 0.112],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 22);
}

export function coupeLiquidGeometry() {
  const pts = [[0, 0.075], [0.02, 0.08], [0.048, 0.094], [0.058, 0.106], [0, 0.106]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 22);
}
