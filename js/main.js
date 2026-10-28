// Galleri for to: opstart, kode, indlæsning, spillogik og tegnesløjfe.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/addons/RoomEnvironment.js';
import { loadMeta, deriveKey, openManifest, fetchDecrypted } from './crypto.js';
import { createMaterials } from './materials.js';
import { setMaxAnisotropy } from './textures.js';
import { StaticBuilder } from './builder.js';
import { ROOMS, DOORS, Colliders, buildRooms, buildExterior, buildSky, buildDoubleDoor, floorHeight, roomAt } from './world.js';
import { layoutPhotos, buildPhotos } from './frames.js';
import { buildArrival } from './exterior.js';
import { buildInterior } from './props.js';
import { buildSalon, buildSpa } from './wings.js';
import { buildStatue, parseStatueBody, STATUE } from './statue.js';
import { Unveil, Fireworks, Confetti } from './unveil.js';
import { Controls } from './controls.js';
import { Hand } from './hand.js';
import { Audio } from './audio.js';
import { Intro, INTRO_END } from './intro.js';
import { isTouch, wait, nextFrame, clamp, easeInOutCubic } from './util.js';

const $ = (id) => document.getElementById(id);
const touch = isTouch();
const QUESTS = ['champagne', 'sushi', 'coffee', 'spa'];
const freshProgress = () => ({ champagne: false, sushi: false, coffee: false, spa: false, seen: [], unlocked: false, finale: false });

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
  photoItems: [],
  videos: [],
  pickables: [],
  staticMeshes: [],
  interactables: [],
  // Spillet starter altid forfra, når koden tastes. Intet gemmes mellem besøg.
  progress: freshProgress(),
  state: 'lock',
  brewing: 0,
  lightboxIndex: -1,
  fullUrls: new Map(),
  texUrls: new Map(),
  cine: null,
};

// ---------------------------------------------------------------- Kodeskærm ---
async function boot() {
  let meta;
  try {
    meta = await loadMeta();
  } catch {
    $('lock-msg').textContent = 'Galleriet kunne ikke indlæses. Prøv at genindlæse siden.';
    return;
  }
  if (!hasWebGL()) {
    $('lock-msg').textContent = 'Din browser understøtter desværre ikke 3D-grafik (WebGL).';
    $('lock-btn').disabled = true;
    return;
  }
  $('lock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await tryUnlock($('code').value, meta);
  });
  setTimeout(() => $('code').focus({ preventScroll: true }), 300);
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function tryUnlock(code, meta) {
  const btn = $('lock-btn');
  const msg = $('lock-msg');
  if (!code.trim() || btn.disabled) return;
  btn.disabled = true;
  msg.textContent = 'Tjekker koden …';
  await nextFrame();
  try {
    const key = await deriveKey(code, meta);
    const manifest = await openManifest(key);
    if (!manifest) {
      btn.disabled = false;
      msg.textContent = 'Forkert kode. Prøv igen.';
      const card = document.querySelector('#lock .card');
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      $('code').select();
      return;
    }
    G.key = key;
    G.manifest = manifest;
    G.progress = freshProgress();
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

function videosOf(m) {
  return m.videos || (m.video ? [m.video] : []);
}

async function loadImage(bytes, type = 'image/jpeg') {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return { img, url };
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

  setLoad(0.08, 'Polerer marmoret …');
  await nextFrame();
  const M = createMaterials();
  G.M = M;

  setLoad(0.16, 'Bygger salene …');
  await nextFrame();
  const colliders = new Colliders();
  G.colliders = colliders;
  const B = new StaticBuilder();
  const { slots } = buildRooms(B, M, colliders);
  buildExterior(B, M, colliders);
  buildSky(scene);

  setLoad(0.22, 'Ruller den røde løber ud …');
  await nextFrame();
  G.arrival = buildArrival(scene, B, M, colliders, G.manifest.title || 'Galleri for to');
  G.interior = buildInterior(scene, B, M, colliders, G.manifest);
  setLoad(0.26, 'Tænder op i pejsen og varmer poolen …');
  await nextFrame();
  G.salon = buildSalon(scene, B, M, colliders);
  G.spa = buildSpa(scene, B, M, colliders);

  // Statuen (ansigtet er krypteret ligesom billederne)
  setLoad(0.3, 'Hugger statuen i marmor …');
  await nextFrame();
  let face = null;
  let faceTexture = null;
  if (G.manifest.statue) {
    try {
      const [meshBytes, texBytes] = await Promise.all([fetchDecrypted(G.key, G.manifest.statue.mesh), fetchDecrypted(G.key, G.manifest.statue.tex)]);
      face = JSON.parse(new TextDecoder().decode(meshBytes));
      const { img } = await loadImage(texBytes);
      faceTexture = new THREE.Texture(img);
      faceTexture.needsUpdate = true;
    } catch (e) {
      console.warn('Statuens ansigt kunne ikke indlæses', e);
    }
  }
  let body = null;
  try {
    const res = await fetch('assets/statue/body.bin');
    if (res.ok) body = parseStatueBody(await res.arrayBuffer());
  } catch (e) {
    console.warn('Statuens krop kunne ikke indlæses', e);
  }
  G.statue = buildStatue(scene, B, M, colliders, { face, faceTexture, body, info: G.manifest.statue || {} });

  // Døre: indgangen og Hovedværket
  const entranceLeaf = new THREE.MeshStandardMaterial({ color: '#1d2a24', roughness: 0.35, metalness: 0.2 });
  G.entranceDoor = buildDoubleDoor(scene, M, { x: 0, z: 10.3, width: 2.6, height: 3.4, leafMat: entranceLeaf, handleMat: M.brass, inward: -1 });
  G.entranceCollider = colliders.add(-1.3, 1.3, 10.0, 10.6, 'entrance');
  G.finalDoor = buildDoubleDoor(scene, M, { x: 0, z: -16, width: 2.8, height: 3.6, leafMat: M.goldOrnate, handleMat: M.gold, inward: -1 });
  G.finalCollider = colliders.add(-1.4, 1.4, -16.2, -15.8, 'final');

  setLoad(0.36, 'Hænger rammerne op …');
  await nextFrame();
  const placements = layoutPhotos(G.manifest.photos, videosOf(G.manifest), slots);
  G.items = buildPhotos(scene, B, M, placements);
  G.photoItems = G.items.filter((it) => !it.isVideo).sort((a, b) => a.placement.index - b.placement.index);

  // Hovedværket under fløjlstæppet, fyrværkeri og konfetti
  const master = G.items.find((it) => it.placement.master);
  if (master) {
    const pl = master.placement;
    G.unveil = new Unveil(scene, M, { x: pl.pos.x, wallZ: pl.pos.z, top: pl.pos.y + master.outerH / 2, width: master.outerW + 0.34, frameDepth: 0.16 });
  }
  G.fxLight = new THREE.PointLight('#ffffff', 0, 16, 1.4);
  G.fxLight.position.set(0, 4, -22);
  scene.add(G.fxLight);
  G.fireworks = new Fireworks(scene, G.fxLight, G.audio);
  G.confetti = new Confetti(scene, M, { x0: -4.6, x1: 4.6, z0: -25.6, z1: -16.6, y: 4.4 });

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
  const warmHall = new THREE.PointLight('#ffe2b8', 10, 18, 1.5);
  warmHall.position.set(0, 4.6, -3.5);
  scene.add(warmHall);
  // Skulpturlys: en kraftig spot skråt forfra giver musklerne skygger og dybde
  const key = new THREE.SpotLight('#fff1dc', 48, 14, 0.42, 0.55, 1.4);
  key.position.set(STATUE.x - 2.4, 5.3, STATUE.z + 3.4);
  key.target.position.set(STATUE.x, 2.3, STATUE.z);
  scene.add(key, key.target);
  const rim = new THREE.SpotLight('#cfe0ff', 22, 12, 0.5, 0.7, 1.5);
  rim.position.set(STATUE.x + 2.6, 4.8, STATUE.z - 3.0);
  rim.target.position.set(STATUE.x, 2.2, STATUE.z);
  scene.add(rim, rim.target);

  // Hånd og styring
  G.hand = new Hand(M, env);
  G.controls = new Controls(canvasEl, camera, { colliders, floorHeight });
  G.controls.onTap = onTap;
  G.controls.onInteractKey = onInteractKey;

  // Klikbare ting
  scene.traverse((o) => {
    const u = o.userData;
    if (u.photoIndex !== undefined || u.videoIndex !== undefined || u.statue || u.unveil) G.pickables.push(o);
  });
  G.interactables = [...G.arrival.interactables, ...G.interior.interactables, ...G.spa.interactables];
  if (G.unveil) {
    const ia = { id: 'unveil', pos: G.unveil.cordPos, rect: [-2.1, 2.1, -24.6, -23.4], range: 1.5, meshes: [G.unveil.mesh, G.unveil.cord] };
    G.interactables.push(ia);
  }
  for (const ia of G.interactables) {
    for (const m of ia.meshes) {
      m.traverse((o) => {
        o.userData.interact = ia;
        if ((o.isMesh || o.isInstancedMesh) && !G.pickables.includes(o)) G.pickables.push(o);
      });
    }
  }
  G.raycastList = [...G.pickables, ...G.staticMeshes];

  // Billedteksturer og videoer (dekrypteres)
  await loadPhotoTextures();
  // Videoerne hentes i baggrunden, så hun ikke skal vente på dem.
  setupVideos().catch((e) => console.warn('Videoer', e));

  setLoad(0.97, 'Sidste hånd på værket …');
  await nextFrame();
  updateHUD();
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

async function loadPhotoTextures() {
  const items = G.photoItems;
  let done = 0;
  const total = items.length;
  const queue = items.slice();
  const maxSide = touch ? 768 : 1024;
  const worker = async () => {
    while (queue.length) {
      const it = queue.shift();
      const p = it.placement.photo;
      try {
        const bytes = await fetchDecrypted(G.key, p.t);
        const { img, url } = await loadImage(bytes);
        G.texUrls.set(it.placement.index, url);
        let src = img;
        if (Math.max(img.width, img.height) > maxSide) {
          // mindre teksturer på mobil sparer grafikhukommelse
          const k = maxSide / Math.max(img.width, img.height);
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k);
          c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          src = c;
        }
        const tex = new THREE.Texture(src);
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
      setLoad(0.38 + 0.54 * (done / total), `Hænger billederne op … ${done} af ${total}`);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

async function setupVideos() {
  const items = G.items.filter((it) => it.isVideo);
  await Promise.all(
    items.map(async (it) => {
      const v = it.placement.photo;
      try {
        const [vid, poster] = await Promise.all([fetchDecrypted(G.key, v.file), fetchDecrypted(G.key, v.poster)]);
        const url = URL.createObjectURL(new Blob([vid], { type: 'video/mp4' }));
        const { img } = await loadImage(poster);
        const posterTex = new THREE.Texture(img);
        posterTex.colorSpace = THREE.SRGBColorSpace;
        posterTex.needsUpdate = true;
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        video.preload = 'auto';
        const tex = new THREE.VideoTexture(video);
        tex.colorSpace = THREE.SRGBColorSpace;
        it.mesh.material.map = posterTex;
        it.mesh.material.color.set('#ffffff');
        it.mesh.material.needsUpdate = true;
        video.addEventListener('playing', () => {
          if (it.mesh.material.map !== tex) {
            it.mesh.material.map = tex;
            it.mesh.material.needsUpdate = true;
          }
        });
        G.videos[it.placement.index] = { video, url, tex, item: it, room: it.placement.roomDef.id, info: v };
      } catch (e) {
        console.warn('Video kunne ikke indlæses', v.title, e);
      }
    }),
  );
}

// ---------------------------------------------------------------- Fremgang ---
function updateHUD() {
  const p = G.progress;
  for (const q of QUESTS) document.querySelector(`#quest li[data-q="${q}"]`)?.classList.toggle('done', !!p[q]);
  const fin = document.querySelector('#quest li[data-q="final"]');
  fin.classList.toggle('locked', !p.unlocked);
  fin.classList.toggle('done', !!p.finale);
  $('final-label').textContent = p.unlocked ? (p.finale ? 'Hovedværket' : 'Afslør Hovedværket') : 'Hovedværket (låst)';
  $('seen').textContent = `${p.seen.length} af ${G.manifest.photos.length}`;
}

function complete(q) {
  if (G.progress[q]) return false;
  G.progress[q] = true;
  updateHUD();
  const li = document.querySelector(`#quest li[data-q="${q}"]`);
  if (li) {
    li.classList.remove('pulse');
    void li.offsetWidth;
    li.classList.add('pulse');
  }
  if (QUESTS.every((k) => G.progress[k]) && !G.progress.unlocked) setTimeout(unlockFinal, 2600);
  return true;
}

function unlockFinal() {
  if (G.progress.unlocked) return;
  G.progress.unlocked = true;
  G.finalDoor.setOpen(true);
  G.finalCollider.active = false;
  G.interior.signs.final.set('Hovedværket', 'Døren er åben', false);
  updateHUD();
  G.audio.chime();
  G.audio.door();
  toast('Aftenens program er klaret. Døren til Hovedværket er åben!', 5200);
}

function markSeen(index) {
  const p = G.manifest.photos[index];
  if (!p || G.progress.seen.includes(p.id)) return;
  G.progress.seen.push(p.id);
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
  $('help-lock').addEventListener('click', () => location.reload());
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
    // Et tryk på mobilen sender et "spøgelsesklik" bagefter, som ellers ville lukke billedet med det samme.
    if (e.target.id === 'lightbox' && performance.now() - (G.lbOpenedAt || 0) > 600) closeLightbox();
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
  const common = `<p><b>Aftenens program:</b> Et glas champagne, lidt sushi, en kop kaffe og et besøg i spaen. Så åbner Hovedværket, hvor du selv trækker tæppet af.</p>`;
  $('help-body').innerHTML = touch
    ? `<p><b>Gå:</b> Sæt tommelfingeren i venstre side af skærmen, og træk i den retning, du vil gå.</p>
       <p><b>Kig rundt:</b> Stryg med en finger i højre side af skærmen.</p>
       <p><b>Gå hen et sted:</b> Tryk på gulvet.</p>
       <p><b>Se et billede:</b> Tryk på billedet eller skiltet ved siden af.</p>
       <p><b>Champagne, sushi, kaffe og spa:</b> Gå tæt på, og tryk på den gyldne knap.</p>${common}`
    : `<p><b>Gå:</b> W A S D eller piletasterne. Hold Shift nede for at gå hurtigere.</p>
       <p><b>Kig rundt:</b> Hold musen nede og træk.</p>
       <p><b>Gå hen et sted:</b> Klik på gulvet.</p>
       <p><b>Se et billede:</b> Klik på billedet eller skiltet ved siden af.</p>
       <p><b>Champagne, sushi, kaffe og spa:</b> Gå tæt på, og tryk E, mellemrum eller den gyldne knap.</p>${common}`;
}

function openHelp() {
  $('help').classList.remove('hidden');
  G.controls.enabled = false;
}
function closeHelp() {
  $('help').classList.add('hidden');
  if (G.state === 'play' && $('final').classList.contains('hidden')) G.controls.enabled = true;
}

// ---------------------------------------------------------------- Ankomst ---
function enterGallery() {
  G.audio.start();
  G.audio.resume();
  // Lås videoerne op i samme brugerhandling (kræves på iPhone), og sæt dem på pause igen.
  for (const v of G.videos) {
    if (!v) continue;
    v.video
      .play()
      .then(() => v.video.pause())
      .catch(() => {});
  }
  $('loading').classList.add('hidden');
  const fade = document.createElement('div');
  Object.assign(fade.style, { position: 'fixed', inset: '0', background: '#000', zIndex: 25, pointerEvents: 'none', transition: 'opacity 0.9s ease', opacity: '1' });
  document.body.appendChild(fade);
  const vignette = document.createElement('div');
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
  // fjern overgangslagene helt, så de aldrig kan blive hængende over spillet
  setTimeout(() => {
    G.fade?.remove();
    G.vignette?.remove();
  }, 2000);
  G.controls.setPose(INTRO_END.x, INTRO_END.z, INTRO_END.yaw, INTRO_END.pitch);
  G.controls.enabled = true;
  G.controls.applyCamera();
  G.doorCloseT = 1.4;
  $('hud').classList.remove('hidden');
  setTimeout(() => toast('Gå op ad den røde løber. Butleren venter med champagne.', 4600), 900);
}

// ---------------------------------------------------------------- Filmiske kamerabevægelser ---
// Glider kameraet fra den nuværende position til et mål og kalder onDone bagefter.
function glideTo(to, dur, onDone) {
  const c = G.controls;
  G.cine = {
    t: 0,
    dur,
    from: { x: G.camera.position.x, y: G.camera.position.y, z: G.camera.position.z, yaw: c.yaw, pitch: c.pitch },
    to,
    onDone,
  };
}

function updateCine(dt) {
  const k = G.cine;
  if (!k) return;
  k.t += dt;
  const f = easeInOutCubic(clamp(k.t / k.dur, 0, 1));
  let dy = k.to.yaw - k.from.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  G.camera.position.set(k.from.x + (k.to.x - k.from.x) * f, k.from.y + (k.to.y - k.from.y) * f, k.from.z + (k.to.z - k.from.z) * f);
  G.camera.rotation.set(k.from.pitch + (k.to.pitch - k.from.pitch) * f, k.from.yaw + dy * f, 0, 'YXZ');
  if (k.t >= k.dur) {
    G.cine = null;
    k.onDone?.();
  }
}

// Tidslinje for filmiske forløb. Drives af billedløkken, så rækkefølgen holder, også hvis telefonen er langsom.
function runSeq(events) {
  G.seq = { t: 0, events: events.slice().sort((a, b) => a[0] - b[0]), i: 0 };
}

function updateSeq(dt) {
  const q = G.seq;
  if (!q) return;
  q.t += dt;
  while (q.i < q.events.length && q.t >= q.events[q.i][0]) q.events[q.i++][1]();
  if (q.i >= q.events.length && G.seq === q) G.seq = null;
}

function startSpa() {
  const L = G.spa.lounger;
  G.state = 'cinematic';
  G.controls.enabled = false;
  $('action').classList.add('hidden');
  G.audio.ahh();
  G.hand.hide();
  glideTo({ x: L.x, y: 0.98, z: 8.75, yaw: 0, pitch: 0.1 }, 1.8);
  runSeq([
    [1.8, () => toast(G.progress.spa ? 'Ahh. Lige så dejligt som før.' : 'Ahh. Deres Majestæt fortjener en pause.', 3400)],
    [6.0, () => glideTo({ x: L.x, y: 1.62, z: 6.95, yaw: 0, pitch: 0 }, 1.4)],
    [7.5, () => {
      G.controls.setPose(L.x, 6.95, 0, 0);
      G.state = 'play';
      G.controls.enabled = true;
      if (complete('spa')) setTimeout(() => toast('Udhvilet og klar til resten af aftenen.'), 400);
    }],
  ]);
}

function startUnveil() {
  if (!G.unveil || G.unveil.started) return;
  G.state = 'cinematic';
  G.controls.enabled = false;
  $('action').classList.add('hidden');
  $('caption').classList.add('hidden');
  const target = { x: 0, y: 1.62, z: -20.6 };
  const pitch = Math.atan2(2.55 - target.y, target.z - -25.8);
  G.hand.hide();
  glideTo({ ...target, yaw: 0, pitch }, 1.6);
  G.audio.drumroll(1.7);
  runSeq([
    [1.75, () => {
      G.unveil.start();
      G.audio.whoosh();
    }],
    [3.5, () => {
      const A = G.audio;
      A.fanfare();
      A.applause(6, 0.22);
      const fw = G.fireworks;
      fw.fountain(-2.15, 0.1, -25.2, 7.5);
      fw.fountain(2.15, 0.1, -25.2, 7.5);
      const spots = [[-2.4, -23.6, 3.4], [2.3, -23.0, 3.2], [0, -24.4, 3.7], [-1.4, -22.6, 3.0], [1.6, -24.6, 3.5], [-2.9, -22.8, 3.1], [2.9, -24.0, 3.3], [0.6, -22.4, 2.9], [-0.8, -23.4, 3.6], [2.0, -22.4, 3.0], [-2.1, -24.8, 3.4], [0, -23.2, 3.8], [1.2, -23.8, 3.2], [-1.2, -24.2, 3.3]];
      spots.forEach(([x, z, y], i) => fw.rocket(x, z, y, i * 0.55 + Math.random() * 0.2));
      G.confetti.drop();
    }],
    [12.5, () => {
      G.progress.finale = true;
      updateHUD();
      G.audio.finale();
      G.state = 'play';
      G.controls.setPose(target.x, target.z, 0, pitch);
      G.controls.enabled = false;
      const f = G.manifest.final || {};
      $('final-title').textContent = f.title || 'Tak for besøget';
      $('final-text').textContent = f.text || '';
      $('final-sign').textContent = f.signature || '';
      $('final').classList.remove('hidden');
    }],
  ]);
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
    if (ia.id === 'unveil' && (!G.progress.unlocked || G.unveil.started)) continue;
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
  if (ia.id === 'spa') return G.progress.spa ? '🧖 Slap af igen' : '🧖 Læg dig på liggestolen';
  if (ia.id === 'unveil') return '🎀 Træk i den gyldne snor';
  return null;
}

function doAction(ia = nearestInteractable()) {
  if (G.state !== 'play' || !G.controls.enabled) return;
  const A = G.audio;
  A.resume();
  if (!ia) {
    G.hand.sip(() => A.sip());
    return;
  }
  if (ia.id === 'unveil') {
    startUnveil();
    return;
  }
  if (ia.id === 'spa') {
    startSpa();
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
    if (o.userData.videoIndex !== undefined) {
      if (h.distance < 10) openVideo(o.userData.videoIndex);
      return;
    }
    if (o.userData.statue) {
      const s = G.manifest.statue || {};
      if (h.distance < 12) toast(`${s.title || 'Statuen'}: ${s.desc || ''}`, 5200);
      return;
    }
    if (o.userData.interact) {
      const ia = o.userData.interact;
      if (ia.id === 'unveil' && (!G.progress.unlocked || G.unveil.started)) return;
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
  if ($('lightbox').classList.contains('hidden')) G.lbOpenedAt = performance.now();
  $('lightbox').classList.remove('hidden');
  markSeen(index);
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

function openVideo(i) {
  const v = G.videos[i];
  if (!v) return;
  G.lightboxIndex = -2;
  G.controls.enabled = false;
  $('lb-img').classList.add('hidden');
  const vid = $('lb-video');
  vid.classList.remove('hidden');
  if (vid.src !== v.url) vid.src = v.url;
  vid.muted = false;
  vid.play().catch(() => {});
  $('lb-title').textContent = v.info.title;
  $('lb-sub').textContent = v.info.sub || '';
  $('lb-desc').textContent = v.info.desc || '';
  $('lb-count').textContent = 'VIDEOINSTALLATION';
  $('lb-prev').classList.add('hidden');
  $('lb-next').classList.add('hidden');
  G.lbOpenedAt = performance.now();
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
  if (G.fireworks) G.fireworks.points.material.uniforms.scale.value = h * 0.5 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
}

let lastT = performance.now();
let frameAcc = 0;
let frameCount = 0;
let lowPerf = false;
let flashTimer = 0;
let captionT = 0;
let captionKey = null;
let captionHold = 0;
let mapT = 0;
let videoT = 0;
let finalHint = false;
const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();

function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = Math.min(0.25, (now - lastT) / 1000);
  const dt = Math.min(0.05, rawDt);
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
  else if (G.state === 'cinematic') updateCine(Math.min(0.1, rawDt)); // filmiske bevægelser følger uret, også ved lav billedfrekvens
  updateSeq(Math.min(0.1, rawDt));

  updateWorld(dt, time, rawDt);
  if (G.state === 'play') updateGameplay(dt);

  const r = G.renderer;
  const t0 = performance.now();
  r.clear();
  r.render(G.scene, G.camera);
  if (G.state === 'play' || G.state === 'cinematic') {
    G.hand.update(dt, G.state === 'play' && G.controls.moving);
    G.hand.render(r);
  }
  G.frameMs = performance.now() - t0;
}

function updateWorld(dt, time, rawDt = dt) {
  const A = G.arrival;
  const pos = G.controls.pos;
  // projektører
  for (const s of A.searchlights) {
    s.pivot.rotation.z = Math.sin(time * 0.32 + s.phase) * 0.45;
    s.pivot.rotation.x = -0.22 + Math.cos(time * 0.23 + s.phase) * 0.18;
  }
  // paparazzi-blitz når man er udenfor
  const outside = G.state === 'intro' || pos.z > 12;
  G.flashBoost = Math.max(0, (G.flashBoost || 0) - dt);
  flashTimer -= dt;
  if (outside && flashTimer <= 0) {
    const busy = G.flashBoost > 0 || (G.state === 'play' && pos.z > 14.5 && pos.z < 21);
    flashTimer = busy ? 0.12 + Math.random() * 0.45 : 1.5 + Math.random() * 3;
    const p = A.paparazzi[Math.floor(Math.random() * A.paparazzi.length)];
    p.flashT = 0.14;
    const light = A.flashLights[0];
    p.flash.getWorldPosition(light.position);
    light.userData.t = 0.12;
    if (G.audio.started && Math.random() < 0.8) G.audio.shutter();
  }
  for (const p of A.paparazzi) {
    p.flashT = Math.max(0, (p.flashT || 0) - dt);
    p.flash.material.opacity = p.flashT > 0 ? Math.min(1, p.flashT * 9) : 0;
    p.flash.scale.setScalar(0.9 + p.flashT * 6);
    if (G.state === 'play' && outside) {
      const want = Math.atan2(pos.x - p.group.position.x, pos.z - p.group.position.z);
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
    const near = G.state === 'play' && d.group.position.distanceTo(_to.set(pos.x, 0, pos.z)) < 3.2;
    d.upper.rotation.x += ((near ? 0.42 : 0) - d.upper.rotation.x) * Math.min(1, dt * 3);
  }
  G.butlerBow = Math.max(0, (G.butlerBow || 0) - dt);
  A.butler.upper.rotation.x += ((G.butlerBow > 0 ? 0.35 : 0) - A.butler.upper.rotation.x) * Math.min(1, dt * 4);
  if (G.doorCloseT !== undefined && G.doorCloseT > -1) {
    G.doorCloseT -= dt;
    if (G.doorCloseT < 0) A.limo.door.rotation.y += (0 - A.limo.door.rotation.y) * Math.min(1, dt * 3);
  }
  if (G.state === 'play' && !G.entranceDoor.open && Math.abs(pos.x) < 4 && pos.z > 6 && pos.z < 15.5) {
    G.entranceDoor.setOpen(true);
    G.entranceCollider.active = false;
    G.audio.door();
  }
  G.entranceDoor.update(dt);
  G.finalDoor.update(dt);
  G.interior.sushi.update(dt);
  for (const f of G.interior.flames) f.scale.y = 2.2 + Math.sin(time * 13 + f.position.x * 7) * 0.25 + Math.random() * 0.15;
  G.salon.update(dt, time);
  G.spa.update(dt, time);
  G.unveil?.update(Math.min(0.1, rawDt));
  G.fireworks.update(dt);
  G.confetti.update(dt, time);
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
}

function updateGameplay(dt) {
  const pos = G.controls.pos;
  const room = roomAt(pos.x, pos.z);
  G.audio.setZone(pos.z > 10.4 ? 'outside' : 'inside');

  if (room && room.id === 'final' && G.progress.unlocked && !finalHint && pos.z < -17) {
    finalHint = true;
    toast('Træk i den gyldne snor for at afsløre Hovedværket.', 4200);
  }

  // Videoer spiller kun i den sal, man står i (sparer strøm på mobilen).
  videoT -= dt;
  if (videoT <= 0) {
    videoT = 0.5;
    const lbOpen = !$('lightbox').classList.contains('hidden');
    for (const v of G.videos) {
      if (!v) continue;
      const should = !lbOpen && room && room.id === v.room;
      if (should && v.video.paused) v.video.play().catch(() => {});
      else if (!should && !v.video.paused) v.video.pause();
    }
  }

  // Handlingsknap
  const ia = nearestInteractable();
  const label = G.controls.enabled ? labelFor(ia) : null;
  const btn = $('action');
  if (label) {
    const html = label + (touch ? '' : ' <kbd>E</kbd>');
    if (btn.innerHTML !== html) btn.innerHTML = html;
    btn.classList.remove('hidden');
  } else btn.classList.add('hidden');

  // Billedtekst for det værk man kigger på
  captionT -= dt;
  if (captionT <= 0) {
    captionT = 0.12;
    G.camera.getWorldDirection(_dir);
    let best = null;
    let bestA = 0.42;
    const consider = (key, p, normal, maxD) => {
      _to.copy(p).sub(G.camera.position);
      const d = _to.length();
      if (d > maxD || d < 0.3) return;
      if (normal && _to.dot(normal) > 0) return;
      _to.normalize();
      const ang = Math.acos(clamp(_dir.dot(_to), -1, 1));
      if (ang < bestA) {
        bestA = ang;
        best = key;
      }
    };
    for (const it of G.items) {
      const pl = it.placement;
      if (!room || pl.roomDef.id !== room.id) continue;
      consider((it.isVideo ? 'v' : 'p') + pl.index, pl.pos, pl.normal, 5.5);
    }
    if (room && room.id === 'hall') consider('statue', _v.set(STATUE.x, 2.2, STATUE.z), null, 7);
    if (best !== captionKey) {
      captionKey = best;
      captionHold = 0;
      const cap = $('caption');
      let info = null;
      if (best === 'statue') info = G.manifest.statue || { title: 'Statuen', sub: '' };
      else if (best && best[0] === 'v') info = G.videos[+best.slice(1)]?.info;
      else if (best) info = G.manifest.photos[+best.slice(1)];
      if (info && !(best && best[0] === 'p' && G.photoItems[+best.slice(1)]?.placement.master && !G.progress.finale)) {
        cap.querySelector('.ct').textContent = info.title;
        cap.querySelector('.cs').textContent = info.sub || '';
        cap.querySelector('.ch').textContent = best === 'statue' ? 'Tryk på statuen for at læse mere' : 'Tryk på værket for at se det tæt på';
        cap.classList.remove('hidden');
      } else cap.classList.add('hidden');
    }
  }
  if (captionKey && captionKey[0] === 'p') {
    captionHold += dt;
    const idx = +captionKey.slice(1);
    const isMaster = G.photoItems[idx]?.placement.master;
    if (captionHold > 1.0 && (!isMaster || G.progress.finale)) markSeen(idx);
  }

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
  const x0 = -22.5;
  const x1 = 22.5;
  const z0 = -27;
  const z1 = 24;
  const s = Math.min(W / (x1 - x0), W / (z1 - z0)) * 0.96;
  const ox = (W - (x1 - x0) * s) / 2;
  const oz = (W - (z1 - z0) * s) / 2;
  const X = (x) => ox + (x - x0) * s;
  const Z = (z) => oz + (z - z0) * s;
  ctx.clearRect(0, 0, W, W);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(X(-18), Z(10.6), 36 * s, (21 - 10.6) * s);
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
  ctx.fillStyle = 'rgba(14,11,9,1)';
  for (const d of DOORS) {
    if (d.id === 'hall-final' && !G.progress.unlocked) continue;
    if (d.axis === 'z') ctx.fillRect(X(d.from), Z(d.at) - 3, (d.to - d.from) * s, 6);
    else ctx.fillRect(X(d.at) - 3, Z(d.from), 6, (d.to - d.from) * s);
  }
  ctx.fillStyle = 'rgba(240,235,225,0.85)';
  ctx.beginPath();
  ctx.arc(X(STATUE.x), Z(STATUE.z), 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const marks = [];
  if (!G.progress.champagne) marks.push(['🥂', 2, 13.4], ['🥂', 3.3, 7.5]);
  if (!G.progress.spa) marks.push(['🧖', G.spa.lounger.x, 7.4]);
  if (!G.progress.sushi) marks.push(['🍣', -15, -8]);
  if (!G.progress.coffee) marks.push(['☕', 18.4, -8]);
  marks.push([G.progress.unlocked ? '👑' : '🔒', 0, -21]);
  for (const [e, mx, mz] of marks) ctx.fillText(e, X(mx), Z(mz));
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
