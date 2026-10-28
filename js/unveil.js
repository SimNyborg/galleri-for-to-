// Afsløringen af Hovedværket: rødt fløjlstæppe med guldsnor, fyrværkeri og konfetti.
import * as THREE from 'three';
import { canvas, clamp, smooth } from './util.js';

function clothTexture() {
  const [c, ctx] = canvas(256, 512);
  ctx.fillStyle = '#8a0c1e';
  ctx.fillRect(0, 0, 256, 512);
  ctx.strokeStyle = 'rgba(255,170,150,0.08)';
  ctx.lineWidth = 3;
  for (let y = 20; y < 470; y += 56) {
    for (let x = 28; x < 256; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 18, y + 22, x, y + 44);
      ctx.quadraticCurveTo(x - 18, y + 22, x, y);
      ctx.stroke();
    }
  }
  // guldbort langs siderne og forneden
  const gold = ctx.createLinearGradient(0, 0, 256, 0);
  gold.addColorStop(0, '#f2d58a');
  gold.addColorStop(0.5, '#b8862e');
  gold.addColorStop(1, '#f2d58a');
  ctx.fillStyle = gold;
  ctx.fillRect(0, 486, 256, 18);
  ctx.fillRect(0, 0, 9, 512);
  ctx.fillRect(247, 0, 9, 512);
  ctx.fillStyle = '#d9b25b';
  for (let x = 4; x < 256; x += 10) ctx.fillRect(x, 504, 4, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Unveil {
  // x, wallZ: værkets centrum og væggens forside. top: rammens overkant. width: tæppets bredde.
  constructor(scene, M, { x, wallZ, top, width, frameDepth = 0.14 }) {
    this.x = x;
    this.wallZ = wallZ;
    this.top = top + 0.04;
    this.width = width;
    this.a = frameDepth + 0.06; // stykket der ligger hen over rammens overkant
    this.L = this.a + this.top + 0.35;
    const cols = 34;
    const rows = 70;
    const g = new THREE.PlaneGeometry(1, 1, cols, rows);
    const uv = g.attributes.uv;
    this.uS = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) {
      this.uS[i * 2] = uv.getX(i);
      this.uS[i * 2 + 1] = (1 - uv.getY(i)) * this.L;
    }
    this.geom = g;
    const mat = new THREE.MeshPhysicalMaterial({
      map: clothTexture(),
      color: '#ffffff',
      roughness: 0.72,
      sheen: 1,
      sheenRoughness: 0.45,
      sheenColor: new THREE.Color('#ff8a96'),
      side: THREE.DoubleSide,
      envMapIntensity: 0.6,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.userData.unveil = true;
    scene.add(this.mesh);
    this.t = -1; // -1 = ikke startet
    this.done = false;
    this.apply(0);

    // Guldsnor med kvast i venstre side
    const sx = x - width / 2 + 0.05;
    const pts = [new THREE.Vector3(sx, this.top - 0.05, wallZ + this.a + 0.04), new THREE.Vector3(sx - 0.12, this.top - 1.2, wallZ + this.a + 0.1), new THREE.Vector3(sx - 0.16, 1.3, wallZ + this.a + 0.16)];
    const rope = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.014, 8, false);
    this.cord = new THREE.Group();
    this.cord.add(new THREE.Mesh(rope, M.gold));
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 16, 1, true), M.gold);
    tassel.position.set(pts[2].x, 1.17, pts[2].z);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), M.gold);
    knob.position.set(pts[2].x, 1.3, pts[2].z);
    this.cord.add(tassel, knob);
    this.cord.traverse((o) => (o.userData.unveil = true));
    scene.add(this.cord);
    this.cordPos = new THREE.Vector3(pts[2].x, 0, pts[2].z);
  }

  // Tæppets form, når det er gledet stykket d ned ad sin bane.
  apply(d) {
    const p = this.geom.attributes.position;
    const { a, top, width, wallZ, x: cx, L } = this;
    const fall = top - 0.02;
    for (let i = 0; i < p.count; i++) {
      const u = this.uS[i * 2];
      const s = this.uS[i * 2 + 1] + d;
      let x = cx + (u - 0.5) * width;
      let y;
      let z;
      const edge = smooth(clamp((Math.abs(u - 0.5) - 0.4) / 0.1, 0, 1));
      if (s < a) {
        y = top;
        z = wallZ + s;
      } else if (s < a + fall) {
        y = top - (s - a);
        const k = 1 - y / top;
        const amp = 0.01 + 0.04 * k;
        z = wallZ + a + 0.02 + Math.sin(u * Math.PI * 11 + s * 1.3) * amp - edge * (0.1 + 0.05 * (1 - k)) + k * 0.06;
        x += Math.sin(u * Math.PI * 11 + s) * 0.012 + (u - 0.5) * k * 0.18;
      } else {
        const e = s - a - fall;
        y = 0.025 + e * 0.012 + Math.abs(Math.sin(e * 7 + u * 13)) * 0.07 * Math.exp(-e * 0.8);
        z = wallZ + a + 0.08 + 0.55 * (1 - Math.exp(-e / 0.6)) + Math.sin(u * 17 + e * 5) * 0.03;
        x += (u - 0.5) * 0.25 + Math.sin(e * 4 + u * 9) * 0.04;
      }
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
    this.geom.computeVertexNormals();
    this.geom.computeBoundingSphere();
  }

  start() {
    if (this.t >= 0) return;
    this.t = 0;
  }

  get started() {
    return this.t >= 0;
  }

  update(dt) {
    if (this.t < 0 || this.done) return;
    this.t += dt;
    // snoren trækkes ned, så glider tæppet af med tyngdekraft
    const pull = clamp(this.t / 0.35, 0, 1);
    this.cord.position.y = -0.18 * Math.sin(pull * Math.PI);
    const tt = Math.max(0, this.t - 0.25);
    const d = 0.5 * 3.4 * tt * tt;
    this.apply(Math.min(d, this.L + 0.2));
    if (this.t > 0.4) this.cord.visible = false;
    if (d >= this.L + 0.2) this.done = true;
  }
}

// ============================================================ Fyrværkeri ===
const COLORS = ['#ffd27a', '#ff5a6e', '#ff9ad5', '#9be7ff', '#ffffff', '#b4ff9a', '#ffb347'];

export class Fireworks {
  constructor(scene, light = null, audio = null) {
    this.N = 3000;
    this.light = light;
    this.audio = audio;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.N * 3);
    this.col = new Float32Array(this.N * 3);
    this.size = new Float32Array(this.N);
    this.alpha = new Float32Array(this.N);
    this.vel = new Float32Array(this.N * 3);
    this.life = new Float32Array(this.N);
    this.maxLife = new Float32Array(this.N);
    this.kind = new Uint8Array(this.N); // 0 gnist, 1 glitter
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geom = g;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { scale: { value: window.innerHeight * 0.5 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * (0.6 + a), a * vA); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
    this.next = 0;
    this.fountains = [];
    this.queue = [];
    this.active = 0;
    this._c = new THREE.Color();
  }

  spawn(x, y, z, vx, vy, vz, color, life, size, kind = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.N;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.kind[i] = kind;
    this.points.visible = true;
  }

  burst(x, y, z, hex = null, count = 150) {
    const base = this._c.set(hex || COLORS[Math.floor(Math.random() * COLORS.length)]).clone();
    const second = new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]);
    const sp = 1.5 + Math.random() * 0.8;
    for (let k = 0; k < count; k++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const s = sp * (0.85 + Math.random() * 0.25);
      const c = k % 5 === 0 ? second : base;
      this.spawn(x, y, z, r * Math.cos(th) * s, u * s, r * Math.sin(th) * s, c, 1.3 + Math.random() * 0.7, 0.07 + Math.random() * 0.04, k % 3 === 0 ? 1 : 0);
    }
    if (this.light) {
      this.light.position.set(x, y, z);
      this.light.color.copy(base);
      this.light.userData.t = 0.45;
    }
    this.audio?.boom();
  }

  // Raket der stiger fra (x, z) og springer ud i højden y.
  rocket(x, z, y, delay = 0, hex = null) {
    this.queue.push({ t: -delay, x, z, y, hex, y0: 0.3, launched: false });
  }

  fountain(x, y, z, duration) {
    this.fountains.push({ x, y, z, t: 0, duration, acc: 0 });
  }

  update(dt) {
    // raketter
    for (const r of this.queue) {
      r.t += dt;
      if (r.t < 0 || r.done) continue;
      if (!r.launched) {
        r.launched = true;
        this.audio?.whistle();
      }
      const k = Math.min(1, r.t / 0.7);
      const yy = r.y0 + (r.y - r.y0) * (1 - (1 - k) * (1 - k));
      this.spawn(r.x + (Math.random() - 0.5) * 0.02, yy, r.z, (Math.random() - 0.5) * 0.1, -0.4, 0, this._c.set('#ffe6b0'), 0.35, 0.05);
      if (k >= 1) {
        r.done = true;
        this.burst(r.x, r.y, r.z, r.hex);
      }
    }
    this.queue = this.queue.filter((r) => !r.done);
    // fontæner (gerber)
    for (const f of this.fountains) {
      f.t += dt;
      if (f.t > f.duration) continue;
      f.acc += dt * 120;
      while (f.acc > 1) {
        f.acc -= 1;
        const a = Math.random() * Math.PI * 2;
        const sp = 0.25 * Math.random();
        this.spawn(f.x, f.y, f.z, Math.cos(a) * sp, 2.6 + Math.random() * 1.2, Math.sin(a) * sp, this._c.set(Math.random() < 0.8 ? '#ffd68a' : '#ffffff'), 0.9 + Math.random() * 0.5, 0.045, 1);
      }
    }
    this.fountains = this.fountains.filter((f) => f.t <= f.duration);
    // partikler
    let alive = 0;
    const drag = Math.exp(-dt * 1.4);
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const i3 = i * 3;
      this.vel[i3] *= drag;
      this.vel[i3 + 1] = this.vel[i3 + 1] * drag - 1.6 * dt;
      this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02) {
        this.pos[i3 + 1] = 0.02;
        this.vel[i3 + 1] *= -0.3;
      }
      const f = this.life[i] / this.maxLife[i];
      let a = Math.min(1, f * 1.6);
      if (this.kind[i] === 1) a *= 0.4 + 0.6 * (Math.random() < 0.5 ? 1 : 0.2);
      this.alpha[i] = Math.max(0, a);
    }
    this.active = alive;
    const g = this.geom.attributes;
    g.position.needsUpdate = true;
    g.alpha.needsUpdate = true;
    g.color.needsUpdate = true;
    g.size.needsUpdate = true;
    if (!alive && !this.queue.length && !this.fountains.length) this.points.visible = false;
    if (this.light) {
      this.light.userData.t = Math.max(0, (this.light.userData.t || 0) - dt);
      this.light.intensity = this.light.userData.t > 0 ? 70 * (this.light.userData.t / 0.45) : 0;
    }
  }
}

// ============================================================ Konfetti ===
export class Confetti {
  constructor(scene, M, area) {
    this.n = 300;
    this.area = area;
    const geo = new THREE.PlaneGeometry(0.03, 0.045);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.4, metalness: 0.5, envMapIntensity: 1.2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.n);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const cols = ['#e7c36a', '#f5e2a8', '#c0182f', '#ffffff', '#f2a0b8'];
    const c = new THREE.Color();
    this.p = [];
    for (let i = 0; i < this.n; i++) {
      this.mesh.setColorAt(i, c.set(cols[i % cols.length]));
      this.p.push({ x: 0, y: -1, z: 0, vy: 0, r: 0, vr: 0, sway: 0 });
    }
    this.mesh.instanceColor.needsUpdate = true;
    scene.add(this.mesh);
    this.tmp = new THREE.Object3D();
  }

  drop() {
    const a = this.area;
    for (const p of this.p) {
      p.x = a.x0 + Math.random() * (a.x1 - a.x0);
      p.z = a.z0 + Math.random() * (a.z1 - a.z0);
      p.y = a.y + Math.random() * 1.8;
      p.vy = 0.45 + Math.random() * 0.45;
      p.r = Math.random() * 6;
      p.vr = (Math.random() - 0.5) * 7;
      p.sway = Math.random() * 6;
    }
    this.mesh.visible = true;
  }

  update(dt, time) {
    if (!this.mesh.visible) return;
    const m = this.tmp;
    this.p.forEach((p, i) => {
      if (p.y > 0.012) {
        p.y -= p.vy * dt;
        p.x += Math.sin(time * 2 + p.sway) * dt * 0.25;
        p.r += p.vr * dt;
        if (p.y <= 0.012) p.y = 0.012;
      }
      m.position.set(p.x, p.y, p.z);
      if (p.y > 0.013) m.rotation.set(p.r, p.r * 0.7, p.r * 0.3);
      else m.rotation.set(-Math.PI / 2, 0, p.r);
      m.updateMatrix();
      this.mesh.setMatrixAt(i, m.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
