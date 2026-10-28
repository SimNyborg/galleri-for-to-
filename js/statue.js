// Romersk marmorstatue: muskuløs helt med sværd, laurbærkrans og besejret drage.
// Ansigtet er et 3D-mesh lavet ud fra et foto (tools/statue_face.py) og indlæses krypteret.
import * as THREE from 'three';
import { inscription as inscriptionCanvas } from './textures.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const STATUE = { x: 0, z: -8, rotY: 0, plinthTop: 1.05 };

export function buildStatue(scene, B, M, colliders, { face = null, faceTexture = null, body = null, info = {} } = {}) {
  const S = STATUE;
  const root = new THREE.Matrix4().compose(V(S.x, 0, S.z), new THREE.Quaternion().setFromAxisAngle(UP, S.rotY), V(1, 1, 1));
  const top = new THREE.Matrix4().multiplyMatrices(root, new THREE.Matrix4().makeTranslation(0, S.plinthTop, 0));
  const mat = M.statueMarble;
  const add = (geom, m, local, base = top) => {
    B.add(geom, m, new THREE.Matrix4().multiplyMatrices(base, local));
    geom.dispose();
  };
  const ell = (c, r, rot = [0, 0, 0], m = mat, seg = 22, base = top) => {
    const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
    const l = new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])), V(r[0], r[1], r[2]));
    add(g, m, l, base);
  };
  // Tilspidset lem mellem to punkter med kugler i leddene.
  const limb = (a, b, ra, rb, m = mat, base = top) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const g = new THREE.CylinderGeometry(rb, ra, len, 18, 3, true);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    add(g, m, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)), base);
    ell(a, [ra, ra, ra], [0, 0, 0], m, 16, base);
    ell(b, [rb, rb, rb], [0, 0, 0], m, 16, base);
  };
  // Muskel langs et lem: ellipsoide orienteret efter lemmet.
  const muscle = (a, b, t, r, off = V(0, 0, 0), m = mat) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const c = a.clone().addScaledVector(d, t).add(off);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
    const g = new THREE.SphereGeometry(1, 18, 12);
    add(g, m, new THREE.Matrix4().compose(c, q, V(r[0], r[1], r[2])));
  };

  // ---------- Sokkel ----------
  const plinth = M.marbleDark;
  B.box(plinth, 1.6, 0.2, 1.6, S.x, 0.1, S.z, { uv: 1 });
  B.box(M.gold, 1.62, 0.03, 1.62, S.x, 0.215, S.z);
  B.box(plinth, 1.32, 0.66, 1.32, S.x, 0.56, S.z, { uv: 1 });
  B.box(M.gold, 1.36, 0.03, 1.36, S.x, 0.905, S.z);
  B.box(plinth, 1.5, 0.13, 1.5, S.x, 0.985, S.z, { uv: 1 });
  colliders.add(S.x - 0.85, S.x + 0.85, S.z - 0.85, S.z + 0.85);
  const ins = new THREE.CanvasTexture(
    inscriptionCanvas(
      [
        [info.latin || 'SIMON · DRACONIS · VICTOR', '600 92px "Cormorant Garamond", Georgia, serif', 92],
        [info.title || 'Simon Dragedræberen', 'italic 500 64px "Cormorant Garamond", Georgia, serif', 182],
      ],
      { w: 1024, h: 256, bg: '#121614' },
    ),
  );
  ins.colorSpace = THREE.SRGBColorSpace;
  ins.anisotropy = 4;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.28), new THREE.MeshBasicMaterial({ map: ins, toneMapped: false, color: '#e8e2d6' }));
  plaque.position.set(S.x, 0.58, S.z + 0.662);
  plaque.userData.statue = true;
  scene.add(plaque);
  // gulvlys omkring soklen
  const ring = new THREE.PlaneGeometry(3.6, 3.6);
  ring.rotateX(-Math.PI / 2);
  B.add(ring, M.glow, new THREE.Matrix4().makeTranslation(S.x, 0.012, S.z));

  // ---------- Krop og drage (glatte meshes fra tools/statue_body.py) ----------
  const meta = body?.meta || {};
  for (const m of body?.meshes || []) {
    const mm = m.name === 'dragon' ? M.dragonMarble : mat;
    const mesh = new THREE.Mesh(m.geometry, mm);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(top);
    mesh.userData.statue = true;
    scene.add(mesh);
  }

  // Sværd (gladius) løftet i højre hånd
  if (meta.wristR) {
    const wr = V(...meta.wristR);
    const el = V(...meta.elbowR);
    const v = new THREE.Vector3().subVectors(wr, el).normalize();
    const hand = wr.clone().addScaledVector(v, 0.06);
    const dir = V(0.03, 1, 0.06).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    const at = (t) => hand.clone().addScaledVector(dir, t);
    add(new THREE.CylinderGeometry(0.019, 0.019, 0.17, 10), M.gold, new THREE.Matrix4().compose(at(0.0), q, V(1, 1, 1)));
    add(new THREE.SphereGeometry(0.032, 12, 10), M.gold, new THREE.Matrix4().compose(at(-0.1), q, V(1, 1, 1)));
    add(new THREE.BoxGeometry(0.2, 0.032, 0.055), M.gold, new THREE.Matrix4().compose(at(0.1), q, V(1, 1, 1)));
    const blade = new THREE.Shape();
    blade.moveTo(-0.034, 0);
    blade.lineTo(0.034, 0);
    blade.lineTo(0.028, 0.56);
    blade.lineTo(0, 0.72);
    blade.lineTo(-0.028, 0.56);
    blade.closePath();
    const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
    bg.translate(0, 0, -0.004);
    add(bg, M.silver, new THREE.Matrix4().compose(at(0.115), q, V(1, 1, 1)));
  }
  // guldspænde på kappen
  ell(V(0.2, 1.76, 0.07), [0.035, 0.035, 0.015], [0, 0, 0], M.gold, 16);

  // ---------- Hoved ----------
  const hp = meta.headPos || [0, 2.04, 0.025];
  const hr = meta.headRot || [-0.12, -0.2, 0.03];
  const headM = new THREE.Matrix4().multiplyMatrices(
    top,
    new THREE.Matrix4().compose(V(...hp), new THREE.Quaternion().setFromEuler(new THREE.Euler(hr[0], hr[1], hr[2], 'YXZ')), V(1, 1, 1)),
  );
  const fd = face || defaultFace();
  const [rx, ry, rz] = fd.head.radii;
  const hc = V(...fd.head.center);
  const k = fd.key;
  if (!body) ell(V(0, 0, 0), [rx, ry, rz], [0, 0, 0], mat, 32, headM);
  const eyeY = (k.rEye[1] + k.lEye[1]) / 2 - hc.y;
  // laurbærkrans
  {
    const yr = (k.forehead[1] - hc.y) - 0.012;
    const f = Math.sqrt(Math.max(0.05, 1 - (yr / ry) ** 2));
    const a = rx * f * 1.14;
    const c = rz * f * 1.12;
    const tilt = new THREE.Matrix4().makeRotationX(-0.3);
    const ringM = new THREE.Matrix4().multiplyMatrices(headM, new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeTranslation(0, yr + 0.002, -0.022), tilt));
    const tor = new THREE.TorusGeometry(1, 0.006, 6, 48);
    tor.rotateX(Math.PI / 2);
    B.add(tor, M.gold, new THREE.Matrix4().multiplyMatrices(ringM, new THREE.Matrix4().makeScale(a, 1, c)));
    tor.dispose();
    const leaf = new THREE.SphereGeometry(1, 8, 6);
    for (let i = 0; i < 52; i++) {
      const t = (i / 52) * Math.PI * 2;
      if (Math.abs(Math.sin(t / 2)) < 0.07) continue; // lille åbning bagtil
      for (const s2 of [-1, 1]) {
        const x = Math.sin(t) * a;
        const z = Math.cos(t) * c;
        const lm = new THREE.Matrix4().compose(
          V(x * (1 + 0.04 * s2), 0.008 * s2, z * (1 + 0.04 * s2)),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(s2 * 0.6, t + Math.PI / 2, 0, 'YXZ')),
          V(0.017, 0.0045, 0.0075),
        );
        B.add(leaf, M.gold, new THREE.Matrix4().multiplyMatrices(ringM, lm));
      }
    }
    leaf.dispose();
  }
  // runde briller i marmor (han går altid med briller)
  {
    const fo = (p) => V(p[0] - hc.x, p[1] - hc.y, p[2] - hc.z);
    const re = fo(k.rEye);
    const le = fo(k.lEye);
    const ipd = re.distanceTo(le);
    const R = ipd * 0.36;
    const zf = Math.max(re.z, le.z) + 0.028;
    const lens = new THREE.TorusGeometry(R, 0.0032, 6, 32);
    for (const e of [re, le]) add(lens.clone(), mat, new THREE.Matrix4().makeTranslation(e.x, e.y, zf), headM);
    const bridge = new THREE.TorusGeometry(ipd * 0.5 - R, 0.0028, 6, 16, Math.PI);
    add(bridge, mat, new THREE.Matrix4().makeTranslation((re.x + le.x) / 2, re.y + 0.004, zf), headM);
    for (const [e, sx] of [[re, -1], [le, 1]]) {
      const a = V(e.x + sx * R, e.y, zf);
      const b = V(sx * (rx + 0.003), eyeY - 0.004, -0.02);
      const d = new THREE.Vector3().subVectors(b, a);
      const g = new THREE.CylinderGeometry(0.0028, 0.0028, d.length(), 6);
      add(g, mat, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), V(1, 1, 1)), headM);
    }
    lens.dispose();
  }
  // Ansigtet (eget mesh og eget materiale med fototeksturen)
  let faceMesh = null;
  if (face && faceTexture) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(face.positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(face.uvs, 2));
    g.setIndex(face.indices);
    g.computeVertexNormals();
    faceTexture.colorSpace = THREE.SRGBColorSpace;
    const fm = new THREE.MeshStandardMaterial({ map: faceTexture, roughness: mat.roughness, envMapIntensity: mat.envMapIntensity, emissive: mat.emissive, emissiveIntensity: mat.emissiveIntensity });
    faceMesh = new THREE.Mesh(g, fm);
    faceMesh.matrixAutoUpdate = false;
    faceMesh.matrix.multiplyMatrices(headM, new THREE.Matrix4().makeTranslation(-hc.x, -hc.y, -hc.z));
    faceMesh.userData.statue = true;
    scene.add(faceMesh);
  }

  return { plaque, faceMesh, position: V(S.x, 0, S.z), info };
}

// Bruges hvis ansigtsdata mangler: et neutralt hoved.
function defaultFace() {
  return {
    head: { center: [0, 0.04, -0.15], radii: [0.115, 0.155, 0.146] },
    key: { forehead: [0, 0.125, 0], rEye: [-0.043, 0.04, -0.005], lEye: [0.043, 0.04, -0.005] },
  };
}

// Læs body.bin (format fra tools/statue_body.py) til BufferGeometries.
export function parseStatueBody(buf) {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'GFTS') throw new Error('Ukendt statueformat');
  const n = dv.getUint32(4, true);
  const hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, n)));
  const base = 8 + n;
  const meshes = hdr.meshes.map((m) => {
    const q = new Uint16Array(buf, base + m.posOffset, m.vertices * 3);
    const pos = new Float32Array(m.vertices * 3);
    const uv = new Float32Array(m.vertices * 2);
    for (let i = 0; i < m.vertices; i++) {
      for (let a = 0; a < 3; a++) pos[i * 3 + a] = m.lo[a] + (q[i * 3 + a] / 65535) * (m.hi[a] - m.lo[a]);
      // marmorårer: skrå projektion, så årerne løber diagonalt over figuren
      uv[i * 2] = pos[i * 3] * 1.1 + pos[i * 3 + 2] * 0.8;
      uv[i * 2 + 1] = pos[i * 3 + 1] * 0.7 + pos[i * 3] * 0.2;
    }
    const Idx = m.indexType === 'u2' ? Uint16Array : Uint32Array;
    const idx = new Idx(buf, base + m.indexOffset, m.indexCount);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return { name: m.name, geometry: g };
  });
  return { meta: hdr.meta, meshes };
}
