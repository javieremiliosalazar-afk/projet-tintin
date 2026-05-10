/* ═══════════════════════════════════════
   TINTIN AR — main.js
   WebXR · Three.js · GLTFLoader · ElevenLabs
═══════════════════════════════════════ */

// ── GLTFLoader CDN (same version as Three.js r128) ──
const GLTF_LOADER_URL =
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';

// ── State ──
let xrSession       = null;
let xrRefSpace      = null;
let xrHitTestSource = null;
let renderer, scene, camera, clock;
let reticle, tintinGroup;
let animMixer       = null;   // AnimationMixer pour les animations GLB
let characterPlaced = false;

// ════════════════════════════════════════
//  ENTRY POINT
// ════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Charger GLTFLoader dynamiquement (Three.js doit être déjà présent)
  loadScript(GLTF_LOADER_URL, () => console.log('GLTFLoader prêt'));
  bindUI();

  if (!navigator.xr) {
    const btn = document.getElementById('btn-start');
    btn.textContent = '⚠ Non supporté';
    btn.style.background = '#888';
    btn.disabled = true;
  }
});

function bindUI() {
  document.getElementById('btn-start')
    .addEventListener('click', startAR);
  document.getElementById('btn-parler')
    .addEventListener('click', openConversation);
  document.getElementById('btn-close-conv')
    .addEventListener('click', closeConversation);
  document.getElementById('btn-back')
    .addEventListener('click', () => {
      document.getElementById('no-ar').style.display = 'none';
      document.getElementById('start-screen').style.display = 'flex';
    });
}

// Injecte un <script> et appelle cb quand il est chargé
function loadScript(src, cb) {
  if (document.querySelector(`script[src="${src}"]`)) { cb(); return; }
  const s = document.createElement('script');
  s.src = src;
  s.onload = cb;
  document.head.appendChild(s);
}

// ════════════════════════════════════════
//  AR SESSION
// ════════════════════════════════════════

async function startAR() {
  if (!navigator.xr) { showNoAR(); return; }

  const supported = await navigator.xr
    .isSessionSupported('immersive-ar')
    .catch(() => false);

  if (!supported) { showNoAR(); return; }

  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.getElementById('ar-ui') }
    });

    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('ar-ui').style.display = 'block';

    initThree();
    await setupXR();

    xrSession.addEventListener('end', onSessionEnd);

  } catch (e) {
    console.error('AR session error:', e);
    showNoAR();
  }
}

function onSessionEnd() {
  characterPlaced = false;
  renderer.setAnimationLoop(null);
  xrHitTestSource = null;
  animMixer = null;

  document.getElementById('start-screen').style.display = 'flex';
  document.getElementById('ar-ui').style.display = 'none';
  document.getElementById('conv-panel').classList.remove('open');
  document.getElementById('btn-parler').style.display = 'none';
  document.getElementById('ar-hint').style.display = 'block';
}

// ════════════════════════════════════════
//  THREE.JS INIT
// ════════════════════════════════════════

function initThree() {
  clock = new THREE.Clock();
  const canvas = document.getElementById('ar-canvas');

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  renderer.shadowMap.enabled = true;

  scene  = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.01, 100
  );

  // Éclairage : ambiance chaude + key light + fill light
  scene.add(new THREE.AmbientLight(0xfff5e0, 0.8));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(2, 4, 2);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xc8e0ff, 0.4);
  fillLight.position.set(-2, 1, -1);
  scene.add(fillLight);

  // Réticule de surface
  reticle = buildReticle();
  scene.add(reticle);

  // Groupe conteneur du personnage
  tintinGroup = new THREE.Group();
  tintinGroup.visible = false;
  scene.add(tintinGroup);

  // Charger le GLB
  loadGLB();

  window.addEventListener('resize', onResize);
}

// ── Réticule (anneau or + contour encre) ──
function buildReticle() {
  const group = new THREE.Group();

  const inner = new THREE.Mesh(
    new THREE.RingGeometry(0.055, 0.075, 40),
    new THREE.MeshBasicMaterial({ color: 0xF9A825, side: THREE.DoubleSide })
  );
  inner.rotation.x = -Math.PI / 2;
  group.add(inner);

  const outer = new THREE.Mesh(
    new THREE.RingGeometry(0.078, 0.090, 40),
    new THREE.MeshBasicMaterial({ color: 0x1A1A2E, side: THREE.DoubleSide })
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = 0.001;
  group.add(outer);

  group.visible = false;
  return group;
}

// ════════════════════════════════════════
//  CHARGEMENT DU GLB
// ════════════════════════════════════════

function loadGLB() {
  // Attendre que GLTFLoader soit disponible
  if (typeof THREE.GLTFLoader === 'undefined') {
    setTimeout(loadGLB, 100);
    return;
  }

  const loader = new THREE.GLTFLoader();

  loader.load(
    'model.glb',

    // ── Succès ──
    (gltf) => {
      const model = gltf.scene;

      // Auto-scale : hauteur cible = 0.5 m en AR
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scaleFactor = 0.5 / size.y;
      model.scale.setScalar(scaleFactor);

      // Recalculer pour aligner les pieds sur y = 0
      const scaledBox = new THREE.Box3().setFromObject(model);
      model.position.y -= scaledBox.min.y;

      // Ombres sur tous les meshes
      model.traverse(child => {
        if (child.isMesh) {
          child.castShadow    = true;
          child.receiveShadow = true;
        }
      });

      tintinGroup.add(model);

      // ── Animations GLB ──
      if (gltf.animations && gltf.animations.length > 0) {
        animMixer = new THREE.AnimationMixer(model);

        // Log des clips disponibles (utile en dev)
        console.log(
          'Animations disponibles :',
          gltf.animations.map((a, i) => `[${i}] ${a.name}`).join(', ')
        );

        // Jouer le premier clip (idle / walk en général)
        playAnimation(gltf.animations, 0);
      } else {
        console.warn('Aucune animation trouvée dans tintin1.glb');
      }

      console.log('model.glb chargé ✓');
    },

    // ── Progression ──
    (xhr) => {
      if (xhr.total) {
        console.log(`GLB : ${(xhr.loaded / xhr.total * 100).toFixed(0)}%`);
      }
    },

    // ── Erreur → fallback procédural ──
    (err) => {
      console.error('Erreur chargement GLB :', err);
      console.warn('Fallback : personnage procédural activé');
      tintinGroup.add(buildFallbackTintin());
    }
  );
}

// Jouer un clip par index (ou par nom)
function playAnimation(clips, indexOrName) {
  if (!animMixer) return;
  const clip = typeof indexOrName === 'string'
    ? THREE.AnimationClip.findByName(clips, indexOrName)
    : clips[indexOrName];
  if (clip) animMixer.clipAction(clip).play();
}

// ════════════════════════════════════════
//  PERSONNAGE PROCÉDURAL (fallback)
//  Utilisé si tintin1.glb est introuvable
// ════════════════════════════════════════

function buildFallbackTintin() {
  const root = new THREE.Group();
  const SCALE = 0.14;

  const mSkin    = new THREE.MeshLambertMaterial({ color: 0xFFCC80 });
  const mShirt   = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
  const mPants   = new THREE.MeshLambertMaterial({ color: 0x1565C0 });
  const mShoes   = new THREE.MeshLambertMaterial({ color: 0x4E342E });
  const mGold    = new THREE.MeshLambertMaterial({ color: 0xF9A825 });
  const mOutline = new THREE.MeshBasicMaterial({ color: 0x1A1A2E, side: THREE.BackSide });
  const mEye     = new THREE.MeshBasicMaterial({ color: 0x1A1A2E });
  const mPupil   = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

  function mesh(geo, mat, ox=0, oy=0, oz=0, os=1.09) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(ox, oy, oz);
    const o = new THREE.Mesh(geo, mOutline);
    o.scale.setScalar(os);
    m.add(o);
    root.add(m);
    return m;
  }

  mesh(new THREE.BoxGeometry(.1, .05, .13), mShoes,  .055, -.38, .015);
  mesh(new THREE.BoxGeometry(.1, .05, .13), mShoes, -.055, -.38, .015);
  const lLeg = mesh(new THREE.CylinderGeometry(.045, .045, .22, 12), mPants,  .055, -.22, 0);
  const rLeg = mesh(new THREE.CylinderGeometry(.045, .045, .22, 12), mPants, -.055, -.22, 0);
  mesh(new THREE.CylinderGeometry(.093, .093, .055, 20), mGold, 0, -.045, 0);
  mesh(new THREE.CylinderGeometry(.088, .1, .28, 20), mPants, 0, -.065, 0);
  mesh(new THREE.CylinderGeometry(.095, .095, .22, 20), mShirt, 0, .125, 0);
  const lArm = mesh(new THREE.CylinderGeometry(.03, .03, .2, 10), mShirt,  .16, .1, 0);
  const rArm = mesh(new THREE.CylinderGeometry(.03, .03, .2, 10), mShirt, -.16, .1, 0);
  lArm.rotation.z =  0.35;
  rArm.rotation.z = -0.35;
  mesh(new THREE.SphereGeometry(.04, 8, 8), mSkin,  .22, .02, 0);
  mesh(new THREE.SphereGeometry(.04, 8, 8), mSkin, -.22, .02, 0);
  mesh(new THREE.CylinderGeometry(.032, .032, .08, 12), mSkin, 0, .255, 0);
  mesh(new THREE.SphereGeometry(.135, 20, 20), mSkin, 0, .42, 0);

  [-1, 1].forEach(s => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.026, 8, 8), mEye);
    eye.position.set(s * .048, .445, .115);
    root.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(.012, 6, 6), mPupil);
    pupil.position.set(s * .048 + s * .005, .448, .128);
    root.add(pupil);
  });

  const quiff = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 12), mSkin);
  quiff.scale.set(.8, .55, .7);
  quiff.position.set(0, .535, .04);
  const qo = new THREE.Mesh(quiff.geometry, mOutline);
  qo.scale.setScalar(1.12);
  quiff.add(qo);
  root.add(quiff);

  root.scale.setScalar(SCALE);
  root.userData = { lLeg, rLeg, lArm, rArm, isFallback: true };
  return root;
}

// ════════════════════════════════════════
//  XR SETUP
// ════════════════════════════════════════

async function setupXR() {
  renderer.xr.setSession(xrSession);
  xrSession.addEventListener('selectstart', onSelect);

  const viewerSpace = await xrSession.requestReferenceSpace('viewer');
  xrHitTestSource   = await xrSession.requestHitTestSource({ space: viewerSpace });
  xrRefSpace        = await xrSession.requestReferenceSpace('local');

  renderer.setAnimationLoop(renderFrame);
}

// ════════════════════════════════════════
//  RENDER LOOP
// ════════════════════════════════════════

function renderFrame(timestamp, frame) {
  if (!frame) return;

  const delta = clock.getDelta();

  // Avancer le mixer GLB
  if (animMixer) animMixer.update(delta);

  // Réticule → surface détectée
  if (xrHitTestSource && !characterPlaced) {
    const hits = frame.getHitTestResults(xrHitTestSource);
    if (hits.length) {
      const pose = hits[0].getPose(xrRefSpace);
      if (pose) {
        reticle.visible = true;
        const { x, y, z } = pose.transform.position;
        reticle.position.set(x, y, z);
      }
    } else {
      reticle.visible = false;
    }
  }

  // Animation procédurale (fallback uniquement)
  const child = tintinGroup.children[0];
  if (tintinGroup.visible && child?.userData?.isFallback) {
    animateFallback(timestamp * 0.001, child.userData);
  }

  renderer.render(scene, camera);
}

function animateFallback(t, ud) {
  const swing = Math.sin(t * 2.5) * 0.18;
  if (ud.lLeg) ud.lLeg.rotation.x =  swing;
  if (ud.rLeg) ud.rLeg.rotation.x = -swing;
  if (ud.lArm) ud.lArm.rotation.x = -swing * 0.7;
  if (ud.rArm) ud.rArm.rotation.x =  swing * 0.7;
  tintinGroup.position.y += Math.sin(t * 5) * 0.00015;
  tintinGroup.rotation.y  = Math.sin(t * 0.4) * 0.12;
}

// ════════════════════════════════════════
//  INTERACTIONS
// ════════════════════════════════════════

function onSelect() {
  if (!reticle.visible || characterPlaced) return;

  characterPlaced = true;
  tintinGroup.position.copy(reticle.position);
  tintinGroup.visible = true;
  reticle.visible = false;

  document.getElementById('btn-parler').style.display = 'flex';
  document.getElementById('ar-hint').style.display = 'none';

  const tag = document.getElementById('placed-tag');
  tag.style.display = 'block';
  setTimeout(() => { tag.style.display = 'none'; }, 2500);

  triggerFlash();
}

function triggerFlash() {
  const el = document.getElementById('flash');
  el.style.animation = 'none';
  el.offsetHeight; // force reflow
  el.style.animation = 'flash .35s ease-out forwards';
}

function openConversation()  { document.getElementById('conv-panel').classList.add('open'); }
function closeConversation() { document.getElementById('conv-panel').classList.remove('open'); }

function showNoAR() {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('no-ar').style.display = 'flex';
}

function onResize() {
  if (!renderer || !camera) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

