// Samler statisk geometri pr. materiale og fletter den til få meshes (færre draw calls = hurtigere på mobil).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function matrixFrom(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  _e.set(rot[0], rot[1], rot[2], 'YXZ');
  _q.setFromEuler(_e);
  _p.set(pos[0], pos[1], pos[2]);
  _s.set(scale[0], scale[1], scale[2]);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// Skalerer UV'er på en BoxGeometry, så en gentaget tekstur får samme størrelse på alle flader.
export function worldUVBox(geom, w, h, d, size) {
  const uv = geom.attributes.uv;
  const dims = [
    [d, h], [d, h], // +x, -x
    [w, d], [w, d], // +y, -y
    [w, h], [w, h], // +z, -z
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * su) / size, (uv.getY(i) * sv) / size);
    }
  }
  uv.needsUpdate = true;
  return geom;
}

// Lodret farvegradient (fx mørkere mod gulvet) via vertex colors.
export function verticalGradient(geom, bottom, top, y0, y1) {
  const pos = geom.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - y0) / (y1 - y0 || 1), 0, 1);
    const v = bottom + (top - bottom) * t;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geom;
}

export class StaticBuilder {
  constructor() {
    this.buckets = new Map();
    this.meshes = [];
  }

  add(geom, material, matrix) {
    let g = geom.index ? geom.toNonIndexed() : geom.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(g);
    return g;
  }

  // Kasse med centrum (x,y,z). opts.uv = meter pr. teksturgentagelse. opts.grad = [bund, top].
  box(material, w, h, d, x, y, z, opts = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (opts.uv) worldUVBox(g, w, h, d, opts.uv);
    const m = matrixFrom([x, y, z], [opts.rx || 0, opts.ry || 0, opts.rz || 0]);
    const out = this.add(g, material, m);
    if (opts.grad) verticalGradient(out, opts.grad[0], opts.grad[1], opts.gy0 ?? y - h / 2, opts.gy1 ?? y + h / 2);
    g.dispose();
    return out;
  }

  geom(material, geometry, pos, rot, scale) {
    const out = this.add(geometry, material, matrixFrom(pos, rot, scale));
    return out;
  }

  build(parent) {
    for (const [material, list] of this.buckets) {
      if (material.vertexColors) {
        for (const g of list) {
          if (!g.attributes.color) {
            const c = new Float32Array(g.attributes.position.count * 3).fill(1);
            g.setAttribute('color', new THREE.BufferAttribute(c, 3));
          }
        }
      } else {
        for (const g of list) if (g.attributes.color) g.deleteAttribute('color');
      }
      const merged = mergeGeometries(list, false);
      if (!merged) {
        console.warn('Kunne ikke flette geometri for', material.name);
        continue;
      }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.matrixAutoUpdate = false;
      mesh.userData.static = true;
      parent.add(mesh);
      this.meshes.push(mesh);
      list.forEach((g) => g.dispose());
    }
    this.buckets.clear();
    return this.meshes;
  }
}
