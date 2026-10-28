// Den filmiske ankomst: limousinen kører op, døren åbner, og man stiger ud på den røde løber.
import * as THREE from 'three';
import { easeOutCubic, easeInOutCubic, smooth, clamp, lerp } from './util.js';

export const INTRO_END = { x: 0, z: 20.25, yaw: 0, pitch: 0.1 };
const LIMO_X = 1.6;

export class Intro {
  constructor({ camera, limo, audio, onEvent }) {
    this.camera = camera;
    this.limo = limo;
    this.audio = audio;
    this.onEvent = onEvent;
    this.t = 0;
    this.done = false;
    this.fired = new Set();
    this.look = new THREE.Vector3();
  }

  fire(name, at) {
    if (this.t >= at && !this.fired.has(name)) {
      this.fired.add(name);
      this.onEvent(name);
    }
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const cam = this.camera;
    // Limousinen
    const drive = clamp(t / 3.4, 0, 1);
    const x = lerp(-38, LIMO_X, easeOutCubic(drive));
    const prevX = this.limo.group.position.x;
    this.limo.group.position.x = x;
    for (const w of this.limo.wheels) w.rotation.z -= (x - prevX) / 0.36;
    const doorOpen = smooth(clamp((t - 3.75) / 0.9, 0, 1));
    this.limo.door.rotation.y = -1.45 * doorOpen;

    this.fire('fadein', 0);
    this.fire('engine', 0.05);
    this.fire('cut', 3.45);
    this.fire('door', 3.75);
    this.fire('flashes', 4.2);
    this.fire('fanfare', 4.5);
    this.fire('title', 4.9);

    if (t < 3.55) {
      // Første indstilling: fra gaden mod galleriet, kameraet følger bilen.
      const k = smooth(clamp((t - 1.6) / 1.9, 0, 1));
      cam.position.set(lerp(6.4, 5.6, k), lerp(0.25, 0.45, k), lerp(28.6, 28.0, k));
      this.look.set(lerp(x + 1.5, 0.4, k), lerp(0.4, 1.9, k), lerp(22.4, 14.5, k));
      cam.lookAt(this.look);
    } else {
      // Inde i bilen, døren går op, og man stiger ud.
      const k = easeInOutCubic(clamp((t - 4.45) / 2.0, 0, 1));
      cam.position.set(lerp(0.0, INTRO_END.x, k), lerp(0.16, 0.9, k), lerp(21.75, INTRO_END.z, k));
      this.look.set(0, lerp(1.2, 2.1, k), 10.6);
      cam.lookAt(this.look);
    }
    if (t >= 6.7) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.limo.group.position.x = LIMO_X;
    this.limo.door.rotation.y = -1.45;
    this.onEvent('end');
  }
}
