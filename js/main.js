// Galleri for to: opstart, kode, indlæsning, spillogik og tegnesløjfe.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/addons/RoomEnvironment.js';
import { loadMeta, deriveKey, openManifest, fetchDecrypted } from './crypto.js';
import { createMaterials } from './materials.js';
import { setMaxAnisotropy } from './textures.js';
import { StaticBuilder } from './builder.js';
import { ROOMS, DOORS, Colliders, buildRooms, buildExterior, buildSky, buildDoubleDoor, floorHeight, roomAt, T } from './world.js';
import { layoutPhotos, buildPhotos, buildScreen, plaqueCanvas } from './frames.js';
import { buildArrival } from './exterior.js';
import { buildInterior } from './props.js';
import { Controls } from './controls.js';
import { Hand } from './hand.js';
import { Audio } from './audio.js';
import { Intro, INTRO_END } from './intro.js';
import { isTouch, storageGet, storageSet, sessionGet, sessionSet, wait, nextFrame, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const touch = isTouch();
const PROGRESS_KEY = 'gft-progress-v1';
const CODE_KEY = 'gft-code';

const G = {
  key: null,
  manifest: null,
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  hand: null,
  audio: new Audio(),
  items: [],
  pickables: [],
  staticMeshes: [],
  interactables: [],
  progress: storageGet(PROGRESS_KEY, { champagne: false, sushi: false, coffee: false, seen: [], unlocked: false, finale: false }),
  state: 'lock',
  brewing: 0,
  lightboxIndex: -1,
  fullUrls: new Map(),
  texUrls: new Map(),
};

// ---------------------------------------------------------------- Kodeskærm ---
async function boot() {
  let meta;
  try {
    meta = await loadMeta();
  } catch (e) {
    $('lock-msg').textContent = 'Galleriet kunne ikke indlæses. Prøv at genindlæse siden.';
    return;
  }
  if (!hasWebGL()) {
    $('lock-msg').textContent = 'Din browser understøtter desværre ikke 3D-grafik (WebGL).';
    $('lock-btn').disabled = true;
    return;
  }
  const form = $('lock-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await tryUnlock($('code').value, meta);
  });
  const saved = sessionGet(CODE_KEY);
  if (saved) await tryUnlock(saved, meta, true);
  else setTimeout(() => $('code').focus({ preventScroll: true }), 300);
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function tryUnlock(code, meta, silent = false) {
  const btn = $('lock-btn');
  const msg = $('lock-msg');
  if (!code.trim()) return;
  btn.disabled = true;
  msg.style.color = '';
  msg.textContent = silent ? 'Åbner galleriet …' : 'Tjekker koden …';
  await nextFrame();
  try {
    const key = await deriveKey(code, meta);
    const manifest = await openManifest(key);
    if (!manifest) {
      btn.disabled = false;
      sessionSet(CODE_KEY, null);
      if (silent) {
        msg.textContent = '';
        return;
      }
      msg.textContent = 'Forkert kode. Prøv igen.';
      const card = document.querySelector('#lock .card');
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      $('code').select();
      return;
    }
    sessionSet(CODE_KEY, code);
    G.key = key;
    G.manifest = manifest;
    $('lock').classList.add('hidden');
    $('loading').classList.remove('hidden');
    $('code').value = '';
    await loadGallery();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    msg.textContent = 'Noget gik galt: ' + (err.message || err);
  }
}

// ---------------------------------------------------------------- Indlæsning ---
function setLoad(p, text) {
  $('load-bar').style.width = Math.round(p * 100) + '%';
  if (text) $('load-text').textContent = text;
}

async function loadFonts() {
  if (!document.fonts) return;
  const fonts = [
    'italic 600 46px "Cormorant Garamond"',
    'italic 500 44px "Cormorant Garamond"',
    '500 27px "Cormorant Garamond"',
    '600 92px "Cormorant Garamond"',
    '400 19px Inter',
    '500 19px Inter',
    '600 15px Inter',
    '500 52px Caveat',
  ];
  await Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f, 'ÆØÅæøå'))), wait(5000)]);
}

async function loadGallery() {
  const M0 = performance.now();
  setLoad(0.03, 'Tænder lysekronerne …');
  await loadFonts();
  await nextFrame();

  const canvasEl = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
  G.basePixelRatio = Math.min(window.devicePixelRatio || 1, touch ? 1.6 : 2);
  renderer.setPixelRatio(G.basePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.autoClear = false;
  setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  G.renderer = renderer;
  canvasEl.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    toast('Grafikken blev afbrudt. Genindlæs siden for at fortsætte.', 8000);
  });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05060d');
  G.scene = scene;
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 400);
  camera.position.set(6, 0.3, 28);
  G.camera = camera;

  setLoad(0.1, 'Polerer marmoret …');
  await nextFrame();
  const M = createMaterials();
  G.M = M;

  setLoad(0.2, 'Bygger salene …');
  await nextFrame();
  const colliders = new Colliders();
  G.colliders = colliders;
  const B = new StaticBuilder();
  const { slots } = buildRooms(B, M, colliders);
  buildExterior(B, M, colliders);
  buildSky(scene);

  setLoad(0.28, 'Ruller den røde løber ud …');
  await nextFrame();
  const arrival = buildArrival(scene, B, M, colliders, G.manifest.title || 'Galleri for to');
  G.arrival = arrival;
  const interior = buildInterior(scene, B, M, colliders, G.manifest);
  G.interior = interior;

  // Døre: indgangen og Hovedværket
  const entranceLeaf = new THREE.MeshStandardMaterial({ color: '#1d2a24', roughness: 0.35, metalness: 0.2 });
  G.entranceDoor = buildDoubleDoor(scene, M, { x: 0, z: 10.3, width: 2.6, height: 3.4, leafMat: entranceLeaf, handleMat: M.brass, inward: -1 });
  G.entranceCollider = colliders.add(-1.3, 1.3, 10.0, 10.6, 'entrance');
  G.finalDoor = buildDoubleDoor(scene, M, { x: 0, z: -16, width: 2.8, height: 3.6, leafMat: M.goldOrnate, handleMat: M.gold, inward: -1 });
  G.finalCollider = colliders.add(-1.4, 1.4, -16.2, -15.8, 'final');

  setLoad(0.36, 'Hænger rammerne op …');
  await nextFrame();
  const placements = layoutPhotos(G.manifest.photos, slots);
  G.items = buildPhotos(scene, B, M, placements);
  G.items.sort((a, b) => a.placement.index - b.placement.index);

  // Videoinstallation i Hovedværket
  if (G.manifest.video) await setupVideo(scene, B, M);

  G.staticMeshes = B.build(scene);

  // Lys og miljø
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  G.env = env;
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) if (m.isMeshStandardMaterial && !m.envMap) m.envMap = env;
  });
  scene.add(new THREE.HemisphereLight('#c9d2ff', '#3b2c22', 0.4));
  const moon = new THREE.DirectionalLight('#9fb3ff', 0.5);
  moon.position.set(-20, 40, 40);
  scene.add(moon);
  const warmHall = new THREE.PointLight('#ffe2b8', 18, 18, 1.6);
  warmHall.position.set(0, 4.2, -8);
  scene.add(warmHall);

  // Hånd og styring
  G.hand = new Hand(M, env);
  G.controls = new Controls(canvasEl, camera, { colliders, floorHeight });
  G.controls.onTap = onTap;
  G.controls.onInteractKey = onInteractKey;

  // Klikbare ting
  for (const it of G.items) {
    G.pickables.push(it.mesh, it.plaque);
  }
  scene.traverse((o) => {
    if (o.userData.photoIndex !== undefined && !G.pickables.includes(o)) G.pickables.push(o);
  });
  G.interactables = [...arrival.interactables, ...interior.interactables];
  for (const ia of G.interactables) {
    for (const m of ia.meshes) {
      m.traverse((o) => {
        o.userData.interact = ia;
        if (o.isMesh || o.isInstancedMesh) G.pickables.push(o);
      });
    }
  }
  if (G.videoScreen) G.pickables.push(G.videoScreen);
  G.raycastList = [...G.pickables, ...G.staticMeshes];

  // Billedteksturer (dekrypteres)
  await loadPhotoTextures();

  setLoad(0.96, 'Sidste hånd på værket …');
  await nextFrame();
  applyProgress();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  camera.position.set(6.4, 0.25, 28.6);
  camera.lookAt(0, 0.6, 22);
  try {
    renderer.compile(scene, camera);
    renderer.compile(G.hand.scene, G.hand.camera);
  } catch {
    /* compile er kun en optimering */
  }
  setupUI();
  setLoad(1, `Klar efter ${((performance.now() - M0) / 1000).toFixed(1)} sekunder.`);
  $('load-title').textContent = 'Godaften, Deres Majestæt';
  $('ready').classList.remove('hidden');
  $('controls-hint').innerHTML = touch
    ? 'Venstre tommelfinger går, højre kigger rundt. Tryk på gulvet for at gå derhen, og tryk på et billede for at se det tæt på.'
    : 'Gå med W A S D eller piletasterne, og kig rundt ved at trække med musen. Klik på gulvet for at gå derhen, og klik på et billede for at se det tæt på.';
  $('enter-btn').focus({ preventScroll: true });
  requestAnimationFrame(loop);
}

async function setupVideo(scene, B, M) {
  const v = G.manifest.video;
  try {
    const [vid, poster] = await Promise.all([fetchDecrypted(G.key, v.file), fetchDecrypted(G.key, v.poster)]);
    const videoUrl = URL.createObjectURL(new Blob([vid], { type: 'video/mp4' }));
    G.videoUrl = videoUrl;
    const posterUrl = URL.createObjectURL(new Blob([poster], { type: 'image/jpeg' }));
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.poster = posterUrl;
    G.video = video;
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    const h = 1.5;
    const w = (h * v.w) / v.h;
    const room = ROOMS.find((r) => r.id === 'final');
    const sx = room.x0 + T;
    const sc = buildScreen(scene, B, M, { x: sx, y: 1.8, z: -21, normal: [1, 0], w, h, texture: tex });
    sc.mesh.userData.video = true;
    G.videoScreen = sc.mesh;
    // skilt
    const pc = plaqueCanvas({ title: v.title, sub: v.sub, desc: v.desc }, G.manifest.photos.length + 1, true);
    const pt = new THREE.CanvasTexture(pc);
    pt.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.3, (0.3 * pc.height) / pc.width), new THREE.MeshBasicMaterial({ map: pt, toneMapped: false }));
    plaque.position.set(sx + 0.012, 1.35, -21 + w / 2 + 0.36);
    plaque.rotation.y = Math.PI / 2;
    plaque.userData.video = true;
    scene.add(plaque);
    G.pickables.push(plaque);
    G.videoPlacement = { pos: new THREE.Vector3(sx, 1.8, -21), normal: new THREE.Vector3(1, 0, 0) };
  } catch (e) {
    console.warn('Video kunne ikke indlæses', e);
  }
}

async function loadPhotoTextures() {
  const items = G.items;
  let done = 0;
  const total = items.length;
  const queue = items.slice();
  const worker = async () => {
    while (queue.length) {
      const it = queue.shift();
      const p = it.placement.photo;
      try {
        const bytes = await fetchDecrypted(G.key, p.t);
        const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
        G.texUrls.set(it.placement.index, url);
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        await img.decode();
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, G.renderer.capabilities.getMaxAnisotropy());
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.needsUpdate = true;
        it.mesh.material.map = tex;
        it.mesh.material.color.set('#ffffff');
        it.mesh.material.needsUpdate = true;
      } catch (e) {
        console.warn('Billede kunne ikke indlæses', p.title, e);
      }
      done++;
      setLoad(0.38 + 0.56 * (done / total), `Hænger billederne op … ${done} af ${total}`);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

// ---------------------------------------------------------------- Fremgang ---
function saveProgress() {
  storageSet(PROGRESS_KEY, G.progress);
}

function applyProgress() {
  const p = G.progress;
  const validIds = new Set(G.manifest.photos.map((x) => x.id));
  p.seen = (p.seen || []).filter((id) => validIds.has(id));
  if (p.unlocked) unlockFinal(true);
  updateHUD();
}

function updateHUD() {
  const p = G.progress;
  for (const q of ['champagne', 'sushi', 'coffee']) document.querySelector(`#quest li[data-q="${q}"]`).classList.toggle('done', !!p[q]);
  const fin = document.querySelector('#quest li[data-q="final"]');
  fin.classList.toggle('locked', !p.unlocked);
  fin.classList.toggle('done', !!p.finale);
  $('final-label').textContent = p.unlocked ? (p.finale ? 'Hovedværket' : 'Find Hovedværket') : 'Hovedværket (låst)';
  $('seen').textContent = `${p.seen.length} af ${G.manifest.photos.length}`;
}

function complete(q) {
  if (G.progress[q]) return false;
  G.progress[q] = true;
  saveProgress();
  updateHUD();
  const li = document.querySelector(`#quest li[data-q="${q}"]`);
  li.classList.remove('pulse');
  void li.offsetWidth;
  li.classList.add('pulse');
  if (G.progress.champagne && G.progress.sushi && G.progress.coffee && !G.progress.unlocked) {
    setTimeout(() => {
      unlockFinal(false);
    }, 2600);
  }
  return true;
}

function unlockFinal(silent) {
  G.progress.unlocked = true;
  saveProgress();
  G.finalDoor.setOpen(true);
  G.finalCollider.active = false;
  G.interior.signs.final.set('Hovedværket', 'Døren er åben', false);
  updateHUD();
  if (!silent) {
    G.audio.chime();
    G.audio.door();
    toast('Aftenens program er klaret. Døren til Hovedværket er åben!', 5200);
  }
}

function markSeen(index) {
  const p = G.manifest.photos[index];
  if (!p || G.progress.seen.includes(p.id)) return;
  G.progress.seen.push(p.id);
  saveProgress();
  updateHUD();
  if (G.progress.seen.length === G.manifest.photos.length) toast('Du har set alle billederne i samlingen!', 4500);
}

// ---------------------------------------------------------------- UI ---
let toastTimer = null;
const toastQueue = [];
function toast(text, ms = 3400) {
  toastQueue.push([text, ms]);
  if (!toastTimer) nextToast();
}
function nextToast() {
  const el = $('toast');
  const next = toastQueue.shift();
  if (!next) {
    toastTimer = null;
    return;
  }
  el.textContent = next[0];
  el.classList.add('on');
  toastTimer = setTimeout(() => {
    el.classList.remove('on');
    toastTimer = setTimeout(nextToast, 400);
  }, next[1]);
}

function setupUI() {
  $('enter-btn').addEventListener('click', enterGallery);
  $('skip').addEventListener('click', () => G.intro?.finish());
  $('btn-sound').addEventListener('click', () => {
    const m = !G.audio.muted;
    G.audio.setMuted(m);
    $('btn-sound').textContent = m ? '🔇' : '🔊';
    $('btn-sound').setAttribute('aria-label', m ? 'Slå lyd til' : 'Slå lyd fra');
  });
  $('btn-help').addEventListener('click', () => openHelp());
  $('help-close').addEventListener('click', closeHelp);
  $('help-lock').addEventListener('click', () => {
    sessionSet(CODE_KEY, null);
    location.reload();
  });
  $('action').addEventListener('click', (e) => {
    e.stopPropagation();
    doAction();
  });
  $('final-close').addEventListener('click', () => {
    $('final').classList.add('hidden');
    G.controls.enabled = true;
  });
  // Lightbox
  $('lb-close').addEventListener('click', closeLightbox);
  $('lb-prev').addEventListener('click', () => stepLightbox(-1));
  $('lb-next').addEventListener('click', () => stepLightbox(1));
  $('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox();
  });
  let sx = null;
  $('lightbox').addEventListener('touchstart', (e) => (sx = e.touches[0].clientX), { passive: true });
  $('lightbox').addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50 && G.lightboxIndex >= 0) stepLightbox(dx < 0 ? 1 : -1);
    sx = null;
  });
  window.addEventListener('keydown', (e) => {
    if (!$('lightbox').classList.contains('hidden')) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') stepLightbox(1);
      if (e.key === 'ArrowLeft') stepLightbox(-1);
    } else if (!$('help').classList.contains('hidden') && e.key === 'Escape') closeHelp();
  });
  // iOS: undgå at siden zoomer ved knib med to fingre
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (!G.audio.ctx) return;
    if (document.hidden) G.audio.ctx.suspend();
    else G.audio.ctx.resume();
  });
  $('help-body').innerHTML = touch
    ? `<p><b>Gå:</b> Sæt tommelfingeren i venstre side af skærmen og træk i den retning, du vil gå.</p>
       <p><b>Kig rundt:</b> Stryg med en finger i højre side af skærmen.</p>
       <p><b>Gå hen et sted:</b> Tryk på gulvet.</p>
       <p><b>Se et billede:</b> Tryk på billedet eller skiltet ved siden af.</p>
       <p><b>Champagne, sushi og kaffe:</b> Gå tæt på, og tryk på den gyldne knap.</p>`
    : `<p><b>Gå:</b> W A S D eller piletasterne. Hold Shift nede for at gå hurtigere.</p>
       <p><b>Kig rundt:</b> Hold musen nede og træk.</p>
       <p><b>Gå hen et sted:</b> Klik på gulvet.</p>
       <p><b>Se et billede:</b> Klik på billedet eller skiltet ved siden af.</p>
       <p><b>Champagne, sushi og kaffe:</b> Gå tæt på, og tryk E, mellemrum eller den gyldne knap.</p>`;
}

function openHelp() {
  $('help').classList.remove('hidden');
  G.controls.enabled = false;
}
function closeHelp() {
  $('help').classList.add('hidden');
  if (G.state === 'play') G.controls.enabled = true;
}

// ---------------------------------------------------------------- Ankomst ---
function enterGallery() {
  G.audio.start();
  G.audio.resume();
  G.video?.play().catch(() => {});
  $('loading').classList.add('hidden');
  const fade = document.createElement('div');
  fade.id = 'fade';
  Object.assign(fade.style, { position: 'fixed', inset: '0', background: '#000', zIndex: 25, pointerEvents: 'none', transition: 'opacity 0.9s ease', opacity: '1' });
  document.body.appendChild(fade);
  const vignette = document.createElement('div');
  vignette.id = 'vignette';
  Object.assign(vignette.style, {
    position: 'fixed', inset: '0', zIndex: 5, pointerEvents: 'none', opacity: '0', transition: 'opacity 0.8s ease',
    background: 'radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.92) 75%)',
  });
  document.body.appendChild(vignette);
  G.fade = fade;
  G.vignette = vignette;
  G.state = 'intro';
  $('skip').classList.remove('hidden');
  G.audio.setZone('outside');
  G.intro = new Intro({ camera: G.camera, limo: G.arrival.limo, audio: G.audio, onEvent: introEvent });
}

function introEvent(name) {
  const A = G.audio;
  switch (name) {
    case 'fadein':
      requestAnimationFrame(() => (G.fade.style.opacity = '0'));
      break;
    case 'engine':
      A.engine(3.4);
      break;
    case 'cut':
      G.vignette.style.transition = 'none';
      G.vignette.style.opacity = '1';
      break;
    case 'door':
      A.door();
      break;
    case 'flashes':
      G.flashBoost = 3.2;
      A.applause(4.5, 0.2);
      break;
    case 'fanfare':
      A.fanfare();
      G.vignette.style.transition = 'opacity 1.8s ease';
      G.vignette.style.opacity = '0';
      break;
    case 'title': {
      const tc = $('titlecard');
      tc.querySelector('.t1').textContent = 'Velkommen, Deres Majestæt';
      tc.querySelector('.t2').textContent = `${G.manifest.title || 'Galleri for to'} · Gallapremiere`;
      tc.classList.remove('hidden');
      tc.style.animation = 'none';
      void tc.offsetWidth;
      tc.style.animation = '';
      setTimeout(() => tc.classList.add('hidden'), 4700);
      break;
    }
    case 'end':
      startPlay();
      break;
  }
}

function startPlay() {
  G.state = 'play';
  $('skip').classList.add('hidden');
  G.fade.style.opacity = '0';
  G.vignette.style.opacity = '0';
  G.controls.setPose(INTRO_END.x, INTRO_END.z, INTRO_END.yaw, INTRO_END.pitch);
  G.controls.enabled = true;
  G.controls.applyCamera();
  G.doorCloseT = 1.4; // limousinens dør lukkes efter et øjeblik
  $('hud').classList.remove('hidden');
  if (!G.progress.champagne) setTimeout(() => toast('Gå op ad den røde løber. Butleren venter med champagne.', 4600), 900);
  else setTimeout(() => toast('Velkommen tilbage, Deres Majestæt.', 3000), 900);
}

// ---------------------------------------------------------------- Handlinger ---
const _v = new THREE.Vector3();
function distToInteractable(ia, pos) {
  if (ia.rect) {
    const [x0, x1, z0, z1] = ia.rect;
    const dx = Math.max(x0 - pos.x, 0, pos.x - x1);
    const dz = Math.max(z0 - pos.z, 0, pos.z - z1);
    return Math.hypot(dx, dz);
  }
  return Math.hypot(ia.pos.x - pos.x, ia.pos.z - pos.z);
}

function nearestInteractable() {
  const pos = G.controls.pos;
  let best = null;
  let bd = Infinity;
  for (const ia of G.interactables) {
    const d = distToInteractable(ia, pos);
    if (d <= ia.range && d < bd) {
      bd = d;
      best = ia;
    }
  }
  return best;
}

function labelFor(ia) {
  if (!ia) {
    const h = G.hand.holding;
    if (h && G.hand.items[h].level > 0.01) {
      if (h === 'champagne') return '🥂 Tag en tår';
      if (h === 'coffee') return '☕ Tag en tår';
    }
    return null;
  }
  if (ia.id === 'champagne') {
    if (G.hand.holding === 'champagne' && G.hand.items.champagne.level > 0.01) return '🥂 Skål!';
    return G.progress.champagne ? '🥂 Tag et glas mere' : '🥂 Tag et glas champagne';
  }
  if (ia.id === 'sushi') return '🍣 Spis et stykke sushi';
  if (ia.id === 'coffee') {
    if (G.brewing > 0) return null;
    if (G.hand.holding === 'coffee' && G.hand.items.coffee.level > 0.01) return '☕ Tag en tår';
    return G.progress.coffee ? '☕ Lav en kop mere' : '☕ Lav en kop kaffe';
  }
  return null;
}

function doAction(ia = nearestInteractable()) {
  if (G.state !== 'play') return;
  const A = G.audio;
  A.resume();
  if (!ia) {
    G.hand.sip(() => A.sip());
    return;
  }
  if (ia.id === 'champagne') {
    if (G.hand.holding === 'champagne' && G.hand.items.champagne.level > 0.01) {
      G.hand.sip(() => {
        A.clink();
        setTimeout(() => A.sip(), 350);
      });
      return;
    }
    // butleren eller tårnet
    const fromButler = ia.pos.z > 10;
    if (fromButler) {
      const flute = G.arrival.butlerFlutes.find((f) => f.visible);
      if (flute) {
        flute.visible = false;
        setTimeout(() => (flute.visible = true), 20000);
      }
      G.butlerBow = 1.2;
    } else {
      G.interior.tower.take();
    }
    G.hand.show('champagne');
    A.clink();
    A.fizz();
    if (complete('champagne')) setTimeout(() => toast(fromButler ? 'Champagne til Deres Majestæt. Skål!' : 'Skål, Deres Majestæt!'), 300);
    else toast('Skål!', 1600);
    return;
  }
  if (ia.id === 'sushi') {
    const plate = G.interior.sushi.eatNearest(G.controls.pos);
    if (!plate) {
      toast('Båndet er tomt lige nu. Kokken fylder op.');
      return;
    }
    G.hand.show('sushi');
    G.hand.sip(() => A.munch());
    if (complete('sushi')) setTimeout(() => toast('Mmm! Næsten lige så god som mesterens egen.'), 1300);
    return;
  }
  if (ia.id === 'coffee') {
    if (G.hand.holding === 'coffee' && G.hand.items.coffee.level > 0.01) {
      G.hand.sip(() => A.sip());
      return;
    }
    if (G.brewing > 0) return;
    G.brewing = 2.8;
    A.espresso(2.4);
    const c = G.interior.coffee;
    c.cup.visible = true;
    c.stream.visible = true;
    c.coffeeSurf.visible = true;
    c.coffeeSurf.position.y = 0.014;
    toast('Kaffen brygges …', 2200);
  }
}

function onInteractKey() {
  if (G.state !== 'play' || !G.controls.enabled) return;
  doAction();
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function onTap(x, y) {
  if (G.state !== 'play' || !G.controls.enabled) return;
  G.audio.resume();
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  G.camera.updateMatrixWorld();
  raycaster.setFromCamera(ndc, G.camera);
  raycaster.far = 40;
  const hits = raycaster.intersectObjects(G.raycastList, false);
  for (const h of hits) {
    const o = h.object;
    if (o.userData.photoIndex !== undefined) {
      if (h.distance < 10) openLightbox(o.userData.photoIndex);
      return;
    }
    if (o.userData.video) {
      if (h.distance < 10) openVideo();
      return;
    }
    if (o.userData.interact) {
      const ia = o.userData.interact;
      if (distToInteractable(ia, G.controls.pos) <= ia.range) doAction(ia);
      else {
        const tgt = approachPoint(ia);
        G.controls.walkTo(tgt.x, tgt.z, () => {
          if (distToInteractable(ia, G.controls.pos) <= ia.range + 0.2) doAction(ia);
        });
      }
      return;
    }
    if (o.material && (o.material.transparent || o.material.blending === THREE.AdditiveBlending)) continue;
    if (h.face) {
      _v.copy(h.face.normal).transformDirection(o.matrixWorld);
      if (_v.y > 0.75 && h.point.y - floorHeight(h.point.x, h.point.z) < 0.25) {
        G.controls.walkTo(h.point.x, h.point.z);
        showTapMarker(h.point);
      }
    }
    return;
  }
}

function approachPoint(ia) {
  const p = G.controls.pos;
  if (ia.rect) {
    const [x0, x1, z0, z1] = ia.rect;
    const cx = clamp(p.x, x0, x1);
    const cz = clamp(p.z, z0, z1);
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d = Math.hypot(dx, dz) || 1;
    return { x: cx + (dx / d) * 0.7, z: cz + (dz / d) * 0.7 };
  }
  const dx = p.x - ia.pos.x;
  const dz = p.z - ia.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const r = Math.max(0.6, ia.range - 0.5);
  return { x: ia.pos.x + (dx / d) * r, z: ia.pos.z + (dz / d) * r };
}

let tapMarker = null;
function showTapMarker(p) {
  if (!tapMarker) {
    tapMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.22, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#f0d590', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
    );
    G.scene.add(tapMarker);
  }
  tapMarker.position.set(p.x, p.y + 0.015, p.z);
  tapMarker.userData.t = 1;
  tapMarker.visible = true;
}

// ---------------------------------------------------------------- Lightbox ---
async function openLightbox(index) {
  const p = G.manifest.photos[index];
  if (!p) return;
  G.lightboxIndex = index;
  G.controls.enabled = false;
  G.audio.whoosh();
  $('lb-video').pause();
  $('lb-video').classList.add('hidden');
  const img = $('lb-img');
  img.classList.remove('hidden');
  img.src = G.texUrls.get(index) || '';
  img.alt = p.title;
  $('lb-title').textContent = p.title;
  $('lb-sub').textContent = p.sub || '';
  $('lb-desc').textContent = p.desc || '';
  $('lb-count').textContent = `NR. ${index + 1} AF ${G.manifest.photos.length}`;
  $('lb-prev').classList.remove('hidden');
  $('lb-next').classList.remove('hidden');
  $('lightbox').classList.remove('hidden');
  markSeen(index);
  // fuld opløsning
  let url = G.fullUrls.get(index);
  if (!url) {
    try {
      const bytes = await fetchDecrypted(G.key, p.f);
      url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
      G.fullUrls.set(index, url);
    } catch {
      return;
    }
  }
  if (G.lightboxIndex === index) img.src = url;
}

function openVideo() {
  const v = G.manifest.video;
  if (!v || !G.videoUrl) return;
  G.lightboxIndex = -2;
  G.controls.enabled = false;
  $('lb-img').classList.add('hidden');
  const vid = $('lb-video');
  vid.classList.remove('hidden');
  if (vid.src !== G.videoUrl) vid.src = G.videoUrl;
  vid.muted = false;
  vid.play().catch(() => {});
  $('lb-title').textContent = v.title;
  $('lb-sub').textContent = v.sub || '';
  $('lb-desc').textContent = v.desc || '';
  $('lb-count').textContent = 'VIDEOINSTALLATION';
  $('lb-prev').classList.add('hidden');
  $('lb-next').classList.add('hidden');
  $('lightbox').classList.remove('hidden');
}

function stepLightbox(d) {
  if (G.lightboxIndex < 0) return;
  const n = G.manifest.photos.length;
  openLightbox((G.lightboxIndex + d + n) % n);
}

function closeLightbox() {
  $('lightbox').classList.add('hidden');
  $('lb-video').pause();
  G.lightboxIndex = -1;
  if (G.state === 'play' && $('help').classList.contains('hidden') && $('final').classList.contains('hidden')) G.controls.enabled = true;
}

// ---------------------------------------------------------------- Finale ---
function startFinale() {
  G.progress.finale = true;
  saveProgress();
  updateHUD();
  G.audio.finale();
  G.petalRain = 7;
  setTimeout(() => {
    const f = G.manifest.final || {};
    $('final-title').textContent = f.title || 'Tak for besøget';
    $('final-text').textContent = f.text || '';
    $('final-sign').textContent = f.signature || '';
    $('final').classList.remove('hidden');
    G.controls.enabled = false;
  }, 3800);
}

let petals = null;
function updatePetals(dt) {
  if (!G.petalRain && !petals) return;
  if (!petals) {
    const n = 160;
    const geo = new THREE.PlaneGeometry(0.035, 0.028);
    petals = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#b3122d', side: THREE.DoubleSide, roughness: 0.7, envMap: G.env }), n);
    petals.userData.p = Array.from({ length: n }, () => ({
      x: (Math.random() - 0.5) * 8,
      y: 3 + Math.random() * 3,
      z: -21 + (Math.random() - 0.5) * 8,
      vy: 0.35 + Math.random() * 0.4,
      r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 4,
    }));
    G.scene.add(petals);
  }
  G.petalRain = Math.max(0, (G.petalRain || 0) - dt);
  const m = new THREE.Object3D();
  petals.userData.p.forEach((p, i) => {
    if (p.y > 0.01) {
      p.y -= p.vy * dt;
      p.x += Math.sin(p.r) * dt * 0.3;
      p.r += p.vr * dt;
      if (p.y <= 0.01) p.y = 0.01;
    }
    m.position.set(p.x, p.y, p.z);
    m.rotation.set(p.y > 0.02 ? p.r : -Math.PI / 2, p.r * 0.7, 0);
    m.updateMatrix();
    petals.setMatrixAt(i, m.matrix);
  });
  petals.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- Opdatering ---
function resize() {
  if (!G.renderer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  G.renderer.setSize(w, h);
  const a = w / h;
  let fov = 62;
  if (a < 1) fov = Math.min(84, (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(29)) / a) * 180) / Math.PI);
  G.camera.fov = fov;
  G.camera.aspect = a;
  G.camera.updateProjectionMatrix();
  G.hand?.resize(a, Math.min(fov, 70));
}

let lastT = performance.now();
let frameAcc = 0;
let frameCount = 0;
let lowPerf = false;
let flashTimer = 0;
let captionT = 0;
let captionIdx = -1;
let captionHold = 0;
let mapT = 0;
const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const time = now / 1000;
  if (!G.renderer) return;

  // Ydelse: sænk opløsningen hvis det går for langsomt.
  if (G.state === 'play' && !lowPerf) {
    frameAcc += dt;
    frameCount++;
    if (frameAcc > 3) {
      if (frameAcc / frameCount > 1 / 32) {
        lowPerf = true;
        G.renderer.setPixelRatio(Math.max(1, G.basePixelRatio * 0.65));
      }
      frameAcc = 0;
      frameCount = 0;
    }
  }

  if (G.state === 'intro') G.intro.update(dt);
  else if (G.state === 'play') G.controls.update(dt);

  updateWorld(dt, time);
  if (G.state === 'play') updateGameplay(dt);

  const r = G.renderer;
  const t0 = performance.now();
  r.clear();
  r.render(G.scene, G.camera);
  if (G.state === 'play') {
    G.hand.update(dt, G.controls.moving);
    G.hand.render(r);
  }
  G.frameMs = performance.now() - t0;
}

function updateWorld(dt, time) {
  const A = G.arrival;
  // projektører
  for (const s of A.searchlights) {
    s.pivot.rotation.z = Math.sin(time * 0.32 + s.phase) * 0.45;
    s.pivot.rotation.x = -0.22 + Math.cos(time * 0.23 + s.phase) * 0.18;
  }
  // paparazzi-blitz når man er udenfor
  const outside = G.state === 'intro' || G.controls.pos.z > 12;
  G.flashBoost = Math.max(0, (G.flashBoost || 0) - dt);
  flashTimer -= dt;
  if (outside && flashTimer <= 0) {
    const busy = G.flashBoost > 0 || (G.state === 'play' && G.controls.pos.z > 14.5 && G.controls.pos.z < 21);
    flashTimer = busy ? 0.12 + Math.random() * 0.45 : 1.5 + Math.random() * 3;
    const p = A.paparazzi[Math.floor(Math.random() * A.paparazzi.length)];
    p.flashT = 0.14;
    const light = A.flashLights[Math.floor(Math.random() * A.flashLights.length)];
    p.flash.getWorldPosition(light.position);
    light.userData.t = 0.12;
    if (G.audio.started && Math.random() < 0.8) G.audio.shutter();
  }
  for (const p of A.paparazzi) {
    p.flashT = Math.max(0, (p.flashT || 0) - dt);
    p.flash.material.opacity = p.flashT > 0 ? Math.min(1, p.flashT * 9) : 0;
    p.flash.scale.setScalar(0.9 + p.flashT * 6);
    // følg gæsten med blikket
    if (G.state === 'play') {
      const tx = G.controls.pos.x - p.group.position.x;
      const tz = G.controls.pos.z - p.group.position.z;
      const want = Math.atan2(tx, tz);
      let d = want - p.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.group.rotation.y += d * Math.min(1, dt * 2);
    }
  }
  for (const l of A.flashLights) {
    l.userData.t = Math.max(0, (l.userData.t || 0) - dt);
    l.intensity = l.userData.t > 0 ? 60 * (l.userData.t / 0.12) : 0;
  }
  // dørmænd bukker, når gæsten nærmer sig
  for (const d of A.doormen) {
    const near = G.state === 'play' && d.group.position.distanceTo(_to.set(G.controls.pos.x, 0, G.controls.pos.z)) < 3.2;
    const target = near ? 0.42 : 0;
    d.upper.rotation.x += (target - d.upper.rotation.x) * Math.min(1, dt * 3);
  }
  G.butlerBow = Math.max(0, (G.butlerBow || 0) - dt);
  A.butler.upper.rotation.x += ((G.butlerBow > 0 ? 0.35 : 0) - A.butler.upper.rotation.x) * Math.min(1, dt * 4);
  // limousinens dør lukker
  if (G.doorCloseT !== undefined && G.doorCloseT > -1) {
    G.doorCloseT -= dt;
    if (G.doorCloseT < 0) A.limo.door.rotation.y += (0 - A.limo.door.rotation.y) * Math.min(1, dt * 3);
  }
  // indgangsdøren åbner, når man nærmer sig
  if (G.state === 'play') {
    const p = G.controls.pos;
    if (!G.entranceDoor.open && Math.abs(p.x) < 4 && p.z > 6 && p.z < 15.5) {
      G.entranceDoor.setOpen(true);
      G.entranceCollider.active = false;
      G.audio.door();
    }
  }
  G.entranceDoor.update(dt);
  G.finalDoor.update(dt);
  // sushi, flammer
  G.interior.sushi.update(dt);
  for (const f of G.interior.flames) f.scale.y = 2.2 + Math.sin(time * 13 + f.position.x * 7) * 0.25 + Math.random() * 0.15;
  // kaffe
  if (G.brewing > 0) {
    G.brewing -= dt;
    const c = G.interior.coffee;
    c.coffeeSurf.position.y = 0.014 + (1 - Math.max(0, G.brewing) / 2.8) * 0.045;
    if (G.brewing <= 0) {
      c.stream.visible = false;
      c.cup.visible = false;
      G.hand.show('coffee');
      G.audio.clink();
      if (complete('coffee')) setTimeout(() => toast('Huset giver. Velbekomme, Deres Majestæt.'), 200);
      setTimeout(() => {
        c.cup.visible = true;
        c.coffeeSurf.visible = false;
      }, 1500);
    }
  }
  if (tapMarker && tapMarker.visible) {
    tapMarker.userData.t -= dt * 1.4;
    tapMarker.material.opacity = Math.max(0, tapMarker.userData.t);
    tapMarker.scale.setScalar(1 + (1 - tapMarker.userData.t) * 0.6);
    if (tapMarker.userData.t <= 0) tapMarker.visible = false;
  }
  updatePetals(dt);
}

function updateGameplay(dt) {
  const pos = G.controls.pos;
  const room = roomAt(pos.x, pos.z);
  G.audio.setZone(pos.z > 10.4 ? 'outside' : 'inside');

  // Finale ved første besøg i Hovedværket
  if (room && room.id === 'final' && G.progress.unlocked && !G.progress.finale && pos.z < -17.2) startFinale();

  // Handlingsknap
  const ia = nearestInteractable();
  const label = G.controls.enabled ? labelFor(ia) : null;
  const btn = $('action');
  if (label) {
    const html = label + (touch ? '' : ' <kbd>E</kbd>');
    if (btn.innerHTML !== html) btn.innerHTML = html;
    btn.classList.remove('hidden');
  } else btn.classList.add('hidden');

  // Billedtekst for det billede man kigger på
  captionT -= dt;
  if (captionT <= 0) {
    captionT = 0.12;
    G.camera.getWorldDirection(_dir);
    let best = -1;
    let bestA = 0.42;
    for (const it of G.items) {
      const pl = it.placement;
      if (!room || pl.roomDef.id !== room.id) continue;
      _to.copy(pl.pos).sub(G.camera.position);
      const d = _to.length();
      if (d > 5.5 || d < 0.3) continue;
      if (_to.dot(pl.normal) > 0) continue; // man står bag billedet
      _to.normalize();
      const ang = Math.acos(clamp(_dir.dot(_to), -1, 1));
      if (ang < bestA) {
        bestA = ang;
        best = pl.index;
      }
    }
    if (best !== captionIdx) {
      captionIdx = best;
      captionHold = 0;
      const cap = $('caption');
      if (best >= 0) {
        const p = G.manifest.photos[best];
        cap.querySelector('.ct').textContent = p.title;
        cap.querySelector('.cs').textContent = p.sub || '';
        cap.classList.remove('hidden');
      } else cap.classList.add('hidden');
    }
  }
  if (captionIdx >= 0) {
    captionHold += dt;
    if (captionHold > 1.0) markSeen(captionIdx);
  }

  // Minikort
  mapT -= dt;
  if (mapT <= 0) {
    mapT = 0.1;
    drawMinimap();
  }
}

// ---------------------------------------------------------------- Minikort ---
function drawMinimap() {
  const c = $('minimap');
  const ctx = c.getContext('2d');
  const W = c.width;
  const pos = G.controls.pos;
  const x0 = -21;
  const x1 = 21;
  const z0 = -27;
  const z1 = 25;
  const s = Math.min(W / (x1 - x0), W / (z1 - z0)) * 0.96;
  const ox = (W - (x1 - x0) * s) / 2;
  const oz = (W - (z1 - z0) * s) / 2;
  const X = (x) => ox + (x - x0) * s;
  const Z = (z) => oz + (z - z0) * s;
  ctx.clearRect(0, 0, W, W);
  // fortov og løber
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(X(-18), Z(10.6), (36) * s, (21 - 10.6) * s);
  ctx.fillStyle = 'rgba(160,20,30,0.75)';
  ctx.fillRect(X(-1.2), Z(10), 2.4 * s, 11 * s);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(X(-2.8), Z(21.4), 8.8 * s, 2 * s);
  const cur = roomAt(pos.x, pos.z);
  for (const r of ROOMS) {
    const locked = r.id === 'final' && !G.progress.unlocked;
    ctx.fillStyle = cur && cur.id === r.id ? 'rgba(217,178,91,0.28)' : locked ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.09)';
    ctx.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
    ctx.strokeStyle = 'rgba(217,178,91,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
  }
  // døråbninger
  ctx.fillStyle = 'rgba(14,11,9,1)';
  for (const d of DOORS) {
    if (d.id === 'hall-final' && !G.progress.unlocked) continue;
    if (d.axis === 'z') ctx.fillRect(X(d.from), Z(d.at) - 3, (d.to - d.from) * s, 6);
    else ctx.fillRect(X(d.at) - 3, Z(d.from), 6, (d.to - d.from) * s);
  }
  // mål
  ctx.font = '22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const marks = [];
  if (!G.progress.champagne) marks.push(['🥂', 2, 13.4], ['🥂', 3.3, 4.8]);
  if (!G.progress.sushi) marks.push(['🍣', -15, -8]);
  if (!G.progress.coffee) marks.push(['☕', 18.4, -8]);
  marks.push([G.progress.unlocked ? '👑' : '🔒', 0, -21]);
  for (const [e, mx, mz] of marks) ctx.fillText(e, X(mx), Z(mz));
  // spilleren
  ctx.save();
  ctx.translate(X(pos.x), Z(pos.z));
  ctx.rotate(-G.controls.yaw);
  ctx.fillStyle = '#f0d590';
  ctx.strokeStyle = '#1a1209';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(7, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Til automatiske tests: ?debug giver adgang til tilstanden fra konsollen.
if (new URLSearchParams(location.search).has('debug')) window.__gft = G;

boot();
