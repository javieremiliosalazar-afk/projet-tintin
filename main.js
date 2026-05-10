/* ══════════════════════════════════════
   TINTIN AR — main.js
   WebXR Hit-Test · Three.js r128 · GLTFLoader · ElevenLabs
══════════════════════════════════════ */

const GLTF_LOADER_CDN =
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';

/* ─── State ─── */
let xrSession        = null;
let xrRefSpace       = null;
let xrHitTestSource  = null;
let renderer, scene, camera, clock;
let reticle;
let model            = null;   // le groupe Three.js du GLB
let mixer            = null;   // AnimationMixer
let placed           = false;

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  injectScript(GLTF_LOADER_CDN);

  document.getElementById('btn-start')      .addEventListener('click', startAR);
  document.getElementById('btn-parler')     .addEventListener('click', openConv);
  document.getElementById('btn-close-conv') .addEventListener('click', closeConv);
  document.getElementById('btn-back')       .addEventListener('click', showStart);

  /* Désactive le bouton si WebXR indisponible */
  if (!navigator.xr) {
    const b = document.getElementById('btn-start');
    b.textContent = '⚠ Non supporté';
    b.style.background = '#888';
    b.disabled = true;
  }
});

function injectScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const s   = document.createElement('script');
  s.src     = src;
  document.head.appendChild(s);
}

/* ════════════════════════════════════════
   SESSION AR
════════════════════════════════════════ */

async function startAR() {
  if (!navigator.xr) { showNoAR(); return; }

  const ok = await navigator.xr
    .isSessionSupported('immersive-ar')
    .catch(() => false);

  if (!ok) { showNoAR(); return; }

  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: document.getElementById('ar-ui') }
    });
  } catch (e) {
    console.error(e);
    showNoAR();
    return;
  }

  document.getElementById('screen-start').style.display = 'none';
  document.getElementById('ar-ui').style.display        = 'block';

  initThree();
  await initXR();

  xrSession.addEventListener('end', onSessionEnd);
}

function onSessionEnd() {
  placed  = false;
  mixer   = null;
  model   = null;
  renderer.setAnimationLoop(null);
  xrHitTestSource = null;

  document.getElementById('ar-ui')      .style.display  = 'none';
  document.getElementById('btn-parler') .style.display  = 'none';
  document.getElementById('hint')       .style.display  = 'block';
  document.getElementById('conv-panel') .classList.remove('open');
  showStart();
}

/* ════════════════════════════════════════
   THREE.JS
════════════════════════════════════════ */

function initThree() {
  clock = new THREE.Clock();

  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('ar-canvas'),
    alpha: true,
    antialias: true
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  renderer.shadowMap.enabled = true;

  scene  = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.01, 100
  );

  /* Éclairage */
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));

  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(2, 5, 2);
  key.castShadow = true;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xc8e0ff, 0.35);
  fill.position.set(-2, 2, -2);
  scene.add(fill);

  /* Réticule */
  reticle = makeReticle();
  scene.add(reticle);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  /* Charger le GLB immédiatement (en parallèle de l'init XR) */
  loadModel();
}

/* ─── Réticule ─── */
function makeReticle() {
  const g = new THREE.Group();

  const outer = new THREE.Mesh(
    new THREE.RingGeometry(0.072, 0.088, 48),
    new THREE.MeshBasicMaterial({ color: 0x1A1A2E, side: THREE.DoubleSide })
  );
  outer.rotation.x = -Math.PI / 2;

  const inner = new THREE.Mesh(
    new THREE.RingGeometry(0.050, 0.068, 48),
    new THREE.MeshBasicMaterial({ color: 0xF9A825, side: THREE.DoubleSide })
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.001;

  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.012, 24),
    new THREE.MeshBasicMaterial({ color: 0xF9A825, side: THREE.DoubleSide })
  );
  dot.rotation.x = -Math.PI / 2;
  dot.position.y = 0.002;

  g.add(outer, inner, dot);
  g.visible = false;
  return g;
}

/* ─── Chargement model.glb ─── */
function loadModel() {
  waitForLoader(() => {
    const loader = new THREE.GLTFLoader();

    loader.load(
      'model.glb',

      (gltf) => {
        const root = gltf.scene;

        /* Auto-scale → 0.5 m de hauteur */
        const box  = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        root.scale.setScalar(0.5 / size.y);

        /* Aligner les pieds sur y = 0 */
        const box2 = new THREE.Box3().setFromObject(root);
        root.position.y -= box2.min.y;

        /* Ombres */
        root.traverse(n => {
          if (n.isMesh) {
            n.castShadow    = true;
            n.receiveShadow = true;
          }
        });

        model = new THREE.Group();
        model.add(root);
        model.visible = false;
        scene.add(model);

        /* Animations */
        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(root);
          const action = mixer.clipAction(gltf.animations[0]);
          action.play();
          console.log('Clips:', gltf.animations.map((a,i) => `[${i}] ${a.name}`).join(', '));
        }

        console.log('model.glb chargé ✓');
      },

      (xhr) => {
        if (xhr.total)
          console.log(`GLB ${(xhr.loaded / xhr.total * 100).toFixed(0)}%`);
      },

      (err) => console.error('Erreur GLB :', err)
    );
  });
}

function waitForLoader(cb) {
  if (typeof THREE.GLTFLoader !== 'undefined') { cb(); return; }
  setTimeout(() => waitForLoader(cb), 80);
}

/* ════════════════════════════════════════
   XR
════════════════════════════════════════ */

async function initXR() {
  renderer.xr.setSession(xrSession);
  xrSession.addEventListener('selectstart', onTap);

  const viewer    = await xrSession.requestReferenceSpace('viewer');
  xrHitTestSource = await xrSession.requestHitTestSource({ space: viewer });
  xrRefSpace      = await xrSession.requestReferenceSpace('local');

  renderer.setAnimationLoop(renderLoop);
}

/* ════════════════════════════════════════
   BOUCLE DE RENDU
════════════════════════════════════════ */

function renderLoop(_, frame) {
  if (!frame) return;

  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);

  /* Hit-test → déplacer le réticule */
  if (xrHitTestSource && !placed) {
    const hits = frame.getHitTestResults(xrHitTestSource);
    if (hits.length) {
      const pose = hits[0].getPose(xrRefSpace);
      if (pose) {
        reticle.visible = true;
        reticle.position.set(
          pose.transform.position.x,
          pose.transform.position.y,
          pose.transform.position.z
        );
        reticle.quaternion.set(
          pose.transform.orientation.x,
          pose.transform.orientation.y,
          pose.transform.orientation.z,
          pose.transform.orientation.w
        );
      }
    } else {
      reticle.visible = false;
    }
  }

  renderer.render(scene, camera);
}

/* ════════════════════════════════════════
   TAP → PLACER LE MODÈLE
════════════════════════════════════════ */

function onTap() {
  if (!reticle.visible || placed) return;
  if (!model) return; /* GLB pas encore chargé */

  placed = true;

  model.position.copy(reticle.position);
  model.visible = true;
  reticle.visible = false;

  /* UI */
  document.getElementById('hint').style.display      = 'none';
  document.getElementById('btn-parler').style.display = 'flex';

  const tag = document.getElementById('placed-tag');
  tag.style.display = 'block';
  setTimeout(() => { tag.style.display = 'none'; }, 2500);

  flash();
}

function flash() {
  const el = document.getElementById('flash');
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'flash .3s ease-out forwards';
}

/* ════════════════════════════════════════
   PANEL ELEVENLABS
════════════════════════════════════════ */

function openConv()  { document.getElementById('conv-panel').classList.add('open'); }
function closeConv() { document.getElementById('conv-panel').classList.remove('open'); }

/* ════════════════════════════════════════
   NAVIGATION ÉCRANS
════════════════════════════════════════ */

function showStart() {
  document.getElementById('screen-start').style.display = 'flex';
  document.getElementById('screen-noar') .style.display = 'none';
}

function showNoAR() {
  document.getElementById('screen-start').style.display = 'none';
  document.getElementById('screen-noar') .style.display = 'flex';
}
