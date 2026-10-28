// Det man holder i hånden (champagne, kaffe, sushi). Tegnes i sin egen lille scene oven på galleriet.
import * as THREE from 'three';
import { fluteGeometry, fluteLiquidGeometry } from './exterior.js';

export class Hand {
  constructor(M, envMap) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 5);
    this.scene.add(new THREE.HemisphereLight('#fff6e6', '#3a2c20', 1.6));
    const key = new THREE.DirectionalLight('#ffffff', 1.2);
    key.position.set(-1, 2, 1);
    this.scene.add(key);
    this.envMap = envMap;
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.items = {
      champagne: this.makeChampagne(M),
      coffee: this.makeCoffee(M),
      sushi: this.makeSushi(M),
    };
    for (const it of Object.values(this.items)) {
      it.group.visible = false;
      this.holder.add(it.group);
      it.group.traverse((o) => {
        if (o.material && o.material.isMeshStandardMaterial && !o.material.envMap) o.material.envMap = envMap;
      });
    }
    this.current = null;
    this.show_t = 0; // 0 = nede, 1 = i hånden
    this.sipT = -1;
    this.bob = 0;
    this.time = 0;
    this.pending = null;
  }

  makeChampagne(M) {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(fluteGeometry(), M.glass.clone());
    glass.material.opacity = 0.32;
    const liquid = new THREE.Mesh(fluteLiquidGeometry(), M.champagne);
    g.add(glass, liquid);
    // bobler
    const n = 24;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 0.03, 0.11 + Math.random() * 0.08, (Math.random() - 0.5) * 0.03], i * 3);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ color: '#fffbe8', size: 0.0035, transparent: true, opacity: 0.9, depthWrite: false }));
    g.add(bubbles);
    g.scale.setScalar(1.25);
    return { group: g, liquid, bubbles, level: 1, rest: new THREE.Vector3(0.2, -0.28, -0.52), restRot: new THREE.Euler(0.08, -0.25, 0.05) };
  }

  makeCoffee(M) {
    const g = new THREE.Group();
    const cupGeo = new THREE.LatheGeometry(
      [[0, 0], [0.028, 0], [0.032, 0.01], [0.038, 0.06], [0.04, 0.065], [0.037, 0.066], [0.034, 0.012], [0, 0.012]].map(([a, b]) => new THREE.Vector2(a, b)),
      24,
    );
    g.add(new THREE.Mesh(cupGeo, M.porcelain));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.005, 8, 16), M.porcelain);
    handle.position.set(0.043, 0.038, 0);
    g.add(handle);
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.01, 24), M.porcelain);
    saucer.position.y = -0.004;
    g.add(saucer);
    const surf = new THREE.Mesh(new THREE.CircleGeometry(0.036, 20), M.crema);
    surf.rotation.x = -Math.PI / 2;
    surf.position.y = 0.055;
    g.add(surf);
    // damp
    const steam = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.tex.glow, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      s.scale.setScalar(0.05);
      g.add(s);
      steam.push({ s, t: i / 6 });
    }
    g.scale.setScalar(1.2);
    return { group: g, liquid: surf, steam, level: 1, rest: new THREE.Vector3(0.2, -0.27, -0.52), restRot: new THREE.Euler(0.35, -0.3, 0) };
  }

  makeSushi(M) {
    const g = new THREE.Group();
    const stick = new THREE.CylinderGeometry(0.003, 0.0045, 0.22, 6);
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(stick, M.hinoki);
      c.rotation.z = Math.PI / 2 - 0.25;
      c.rotation.y = s * 0.05;
      c.position.set(0.06, 0.02 + s * 0.006, s * 0.006);
      g.add(c);
    }
    const piece = new THREE.Group();
    const rice = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.045, 4, 8), M.rice);
    rice.rotation.z = Math.PI / 2;
    const fish = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.012, 0.04), new THREE.MeshStandardMaterial({ color: '#f08a4b', roughness: 0.35 }));
    fish.position.y = 0.02;
    piece.add(rice, fish);
    piece.position.set(-0.03, 0.0, 0);
    g.add(piece);
    g.scale.setScalar(1.4);
    return { group: g, piece, liquid: null, level: 1, rest: new THREE.Vector3(0.14, -0.2, -0.45), restRot: new THREE.Euler(0.2, -0.4, 0.15) };
  }

  resize(aspect, fov) {
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  get holding() {
    return this.current;
  }

  show(name) {
    if (this.current === name) {
      this.refill(name);
      return;
    }
    this.pending = name;
    if (!this.current) this.swap();
  }

  refill(name) {
    const it = this.items[name];
    it.level = 1;
    if (it.liquid && name === 'champagne') it.liquid.scale.y = 1;
    if (name === 'sushi') it.piece.visible = true;
  }

  swap() {
    if (this.current) this.items[this.current].group.visible = false;
    this.current = this.pending;
    this.pending = null;
    if (this.current) {
      this.refill(this.current);
      this.items[this.current].group.visible = true;
      this.show_t = 0;
    }
  }

  hide() {
    this.pending = null;
    this.lowering = true;
  }

  // Tag en tår/bid. Returnerer true hvis der var noget at tage af.
  // Tag en tår/bid. Hvis hånden ikke er klar endnu, sættes tåren i kø. cb kaldes, når den starter.
  sip(cb = null) {
    if (this.pending) {
      this.queuedSip = cb || (() => {});
      return true;
    }
    if (!this.current || this.sipT >= 0 || this.lowering) return false;
    const it = this.items[this.current];
    if (it.level <= 0.01) return false;
    if (this.show_t < 0.9) {
      this.queuedSip = cb || (() => {});
      return true;
    }
    this.sipT = 0;
    cb?.();
    return true;
  }

  update(dt, moving) {
    this.time += dt;
    if (this.pending && this.current) {
      this.show_t -= dt * 3;
      if (this.show_t <= 0) this.swap();
    } else if (this.lowering) {
      this.show_t -= dt * 2.5;
      if (this.show_t <= 0) {
        this.lowering = false;
        if (this.current) this.items[this.current].group.visible = false;
        this.current = null;
      }
    } else if (this.current) {
      this.show_t = Math.min(1, this.show_t + dt * 2.2);
    }
    if (!this.current) return;
    const it = this.items[this.current];
    if (this.queuedSip && !this.pending && this.show_t >= 0.9 && this.sipT < 0) {
      const cb = this.queuedSip;
      this.queuedSip = null;
      this.sipT = 0;
      cb();
    }
    this.bob += dt * (moving ? 7 : 1.4);
    const amp = moving ? 0.008 : 0.003;
    const ease = 1 - Math.pow(1 - Math.max(0, this.show_t), 3);
    const g = it.group;
    g.position.copy(it.rest);
    g.position.y += (1 - ease) * -0.35 + Math.sin(this.bob) * amp;
    g.position.x += Math.cos(this.bob * 0.5) * amp * 0.6;
    g.rotation.copy(it.restRot);
    if (this.sipT >= 0) {
      this.sipT += dt / 1.1;
      const k = Math.sin(Math.min(1, this.sipT) * Math.PI);
      g.position.x -= k * 0.17;
      g.position.y += k * 0.16;
      g.position.z += k * 0.18;
      g.rotation.x += k * (this.current === 'coffee' ? 0.5 : 0.75);
      g.rotation.z += k * 0.25;
      if (this.sipT >= 0.5 && !it._sipped) {
        it._sipped = true;
        it.level = Math.max(0, it.level - (this.current === 'sushi' ? 1 : 0.34));
        if (this.current === 'champagne') it.liquid.scale.y = 0.55 + it.level * 0.45;
        if (this.current === 'coffee') it.liquid.position.y = 0.025 + it.level * 0.03;
        if (this.current === 'sushi') it.piece.visible = false;
      }
      if (this.sipT >= 1) {
        this.sipT = -1;
        it._sipped = false;
        if (it.level <= 0.01) setTimeout(() => this.hide(), 450);
      }
    }
    if (this.current === 'champagne') {
      const p = it.bubbles.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + dt * (0.02 + (i % 5) * 0.006);
        if (y > 0.105 + 0.085 * (0.55 + it.level * 0.45)) y = 0.11;
        p.setY(i, y);
      }
      p.needsUpdate = true;
      it.bubbles.visible = it.level > 0.01;
    }
    if (this.current === 'coffee') {
      for (const st of it.steam) {
        st.t = (st.t + dt * 0.35) % 1;
        st.s.position.set(Math.sin(st.t * 6 + st.s.id) * 0.01, 0.07 + st.t * 0.12, 0);
        st.s.material.opacity = it.level > 0 ? Math.sin(st.t * Math.PI) * 0.18 : 0;
        st.s.scale.setScalar(0.03 + st.t * 0.06);
      }
    }
  }

  render(renderer) {
    if (!this.current) return;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
