// Styring: tastatur + mus på computer, joystick + træk på mobil, tryk for at gå hen et sted.
import * as THREE from 'three';
import { clamp } from './util.js';

const EYE = 1.62;
const RADIUS = 0.28;

export class Controls {
  constructor(dom, camera, { colliders, floorHeight }) {
    this.dom = dom;
    this.camera = camera;
    this.colliders = colliders;
    this.floorHeight = floorHeight;
    this.pos = new THREE.Vector3(0, 0, 20.5);
    this.yaw = 0;
    this.pitch = 0;
    this.eyeY = EYE;
    this.vel = new THREE.Vector2();
    this.keys = new Set();
    this.enabled = false;
    this.walkTarget = null;
    this.onArrive = null;
    this.onTap = null;
    this.onInteractKey = null;
    this.bobT = 0;
    this.moving = false;
    this.joy = null;
    this.look = null;
    this.mouse = null;
    this.stuckT = 0;
    this.lastDist = Infinity;
    this.joyEl = document.getElementById('joy');
    this.joyKnob = document.getElementById('joy-knob');
    this.bind();
  }

  bind() {
    const d = this.dom;
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e), { passive: true });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e, true));
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if ((k === 'e' || k === 'enter' || k === ' ') && !e.repeat) this.onInteractKey?.();
      this.keys.add(k);
      if (this.keys.size) this.walkTarget = null;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  down(e) {
    if (!this.enabled) {
      if (e.pointerType === 'mouse') this.mouse = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
      else this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
      return;
    }
    const info = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 };
    if (e.pointerType === 'mouse') {
      if (e.button !== 0 && e.button !== 2) return;
      this.mouse = info;
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!this.joy && e.clientX < w * 0.42 && e.clientY > h * 0.35) {
      this.joy = { ...info, vx: 0, vy: 0 };
      this.joyEl.style.transform = `translate(${e.clientX - 60}px, ${e.clientY - 60}px)`;
      this.joyEl.classList.add('on');
      this.joyKnob.style.transform = 'translate(0px, 0px)';
    } else if (!this.look) {
      this.look = info;
    }
  }

  move(e) {
    const sens = e.pointerType === 'mouse' ? 0.0034 : 0.0058;
    if (this.mouse && e.pointerId === this.mouse.id) {
      const dx = e.clientX - this.mouse.x;
      const dy = e.clientY - this.mouse.y;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.moved += Math.abs(dx) + Math.abs(dy);
      if (this.enabled && this.mouse.moved > 4) this.rotate(dx * sens, dy * sens);
    } else if (this.look && e.pointerId === this.look.id) {
      const dx = e.clientX - this.look.x;
      const dy = e.clientY - this.look.y;
      this.look.x = e.clientX;
      this.look.y = e.clientY;
      this.look.moved += Math.abs(dx) + Math.abs(dy);
      if (this.enabled && this.look.moved > 6) this.rotate(dx * sens, dy * sens);
    } else if (this.joy && e.pointerId === this.joy.id) {
      let dx = e.clientX - this.joy.sx;
      let dy = e.clientY - this.joy.sy;
      this.joy.moved = Math.max(this.joy.moved, Math.hypot(dx, dy));
      const len = Math.hypot(dx, dy);
      const max = 52;
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      this.joy.vx = dx / max;
      this.joy.vy = dy / max;
      this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      if (len > 8) this.walkTarget = null;
    }
  }

  up(e, cancel = false) {
    const isTap = (p, limit) => !cancel && p.moved < limit && performance.now() - p.t < 450;
    if (this.mouse && e.pointerId === this.mouse.id) {
      if (isTap(this.mouse, 6)) this.onTap?.(e.clientX, e.clientY);
      this.mouse = null;
    } else if (this.look && e.pointerId === this.look.id) {
      if (isTap(this.look, 12)) this.onTap?.(e.clientX, e.clientY);
      this.look = null;
    } else if (this.joy && e.pointerId === this.joy.id) {
      if (isTap(this.joy, 12)) this.onTap?.(e.clientX, e.clientY);
      this.joy = null;
      this.joyEl.classList.remove('on');
    }
  }

  rotate(dx, dy) {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -1.15, 1.15);
  }

  setPose(x, z, yaw, pitch = 0) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.eyeY = this.floorHeight(x, z) + EYE;
    this.vel.set(0, 0);
    this.walkTarget = null;
  }

  walkTo(x, z, onArrive = null) {
    this.walkTarget = new THREE.Vector2(x, z);
    this.onArrive = onArrive;
    this.stuckT = 0;
    this.lastDist = Infinity;
  }

  update(dt) {
    if (!this.enabled) return;
    const k = this.keys;
    let fwd = 0;
    let strafe = 0;
    if (k.has('w') || k.has('arrowup')) fwd += 1;
    if (k.has('s') || k.has('arrowdown')) fwd -= 1;
    if (k.has('d')) strafe += 1;
    if (k.has('a')) strafe -= 1;
    if (k.has('arrowleft') || k.has('q')) this.yaw += dt * 1.9;
    if (k.has('arrowright')) this.yaw -= dt * 1.9;
    if (this.joy) {
      fwd -= this.joy.vy;
      strafe += this.joy.vx;
      // let drejning når man skubber joysticket helt til siden
      if (Math.abs(this.joy.vx) > 0.75) this.yaw -= Math.sign(this.joy.vx) * (Math.abs(this.joy.vx) - 0.75) * dt * 2.4;
    }
    const run = k.has('shift') ? 1.75 : 1;
    let speed = 2.3 * run;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let tx = (-sin * fwd + cos * strafe) * speed;
    let tz = (-cos * fwd - sin * strafe) * speed;
    const manual = Math.hypot(fwd, strafe) > 0.05;
    if (!manual && this.walkTarget) {
      const dx = this.walkTarget.x - this.pos.x;
      const dz = this.walkTarget.y - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.3) {
        this.walkTarget = null;
        const cb = this.onArrive;
        this.onArrive = null;
        cb?.();
      } else {
        const s = Math.min(2.3, dist * 2.2 + 0.4);
        tx = (dx / dist) * s;
        tz = (dz / dist) * s;
        // drej blidt i gangretningen
        const targetYaw = Math.atan2(-dx, -dz);
        let dy = targetYaw - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        if (!this.look && !this.mouse) this.yaw += dy * Math.min(1, dt * 2.5);
        this.stuckT += dt;
        if (this.stuckT > 0.6) {
          if (this.lastDist - dist < 0.05) {
            this.walkTarget = null;
            const cb = this.onArrive;
            this.onArrive = null;
            if (dist < 1.6) cb?.();
          }
          this.lastDist = dist;
          this.stuckT = 0;
        }
      }
    }
    const a = Math.min(1, dt * 9);
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.y += (tz - this.vel.y) * a;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.colliders.resolve(this.pos, RADIUS);
    const spd = this.vel.length();
    this.moving = spd > 0.25;
    if (this.moving) this.bobT += dt * spd * 3.2;
    const targetEye = this.floorHeight(this.pos.x, this.pos.z) + EYE;
    this.eyeY += (targetEye - this.eyeY) * Math.min(1, dt * 10);
    this.applyCamera();
  }

  applyCamera() {
    const bob = this.moving ? Math.sin(this.bobT) * 0.022 : 0;
    this.camera.position.set(this.pos.x, this.eyeY + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
