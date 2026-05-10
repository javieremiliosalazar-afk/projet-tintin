import * as THREE      from 'three';
import { GLTFLoader }  from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* ─────────────────────────────────────────────────────
   RENDERER
───────────────────────────────────────────────────── */
const canvas   = document.getElementById('ar-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled        = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;

/* ─────────────────────────────────────────────────────
   SCENE / CAMERA / CLOCK
───────────────────────────────────────────────────── */
const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
const clock  = new THREE.Clock();

/* ─────────────────────────────────────────────────────
   LIGHTING
───────────────────────────────────────────────────── */
scene.add(new THREE.AmbientLight(0xffeedd, 1.8));

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(2, 5, 3);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(1024);
scene.add(sun);

/* ─────────────────────────────────────────────────────
   RETICLE (cercle de placement)
───────────────────────────────────────────────────── */
const reticleGroup = new THREE.Group();
reticleGroup.matrixAutoUpdate = false;
reticleGroup.visible = false;
scene.add(reticleGroup);

const reticleMat = new THREE.MeshBasicMaterial({
  color: 0xf5c400,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.9,
});

// Outer ring
const rOuter = new THREE.RingGeometry(0.11, 0.135, 48);
rOuter.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
reticleGroup.add(new THREE.Mesh(rOuter, reticleMat));

// Inner dot
const rInner = new THREE.CircleGeometry(0.025, 32);
rInner.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
reticleGroup.add(new THREE.Mesh(rInner, reticleMat));

// 4 tick marks
const tickPositions = [
  [0, 0, -0.17, 0],
  [0, 0,  0.17, Math.PI],
  [-0.17, 0, 0,  Math.PI / 2],
  [ 0.17, 0, 0, -Math.PI / 2],
];
tickPositions.forEach(([x, y, z, ry]) => {
  const geo = new THREE.PlaneGeometry(0.008, 0.03);
  geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  const tick = new THREE.Mesh(geo, reticleMat);
  tick.position.set(x, y, z);
  tick.rotation.y = ry;
  reticleGroup.add(tick);
});

let reticlePulse = 0;

/* ─────────────────────────────────────────────────────
   SHADOW PLANE
───────────────────────────────────────────────────── */
const shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShadowMaterial({ opacity: 0.3, transparent: true })
);
shadowPlane.rotation.x  = -Math.PI / 2;
shadowPlane.receiveShadow = true;
shadowPlane.visible     = false;
scene.add(shadowPlane);

/* ─────────────────────────────────────────────────────
   MODEL LOADER
───────────────────────────────────────────────────── */
let model       = null;
let mixer       = null;
let modelPlaced = false;
let placedOnce  = false;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

function loadModel() {
  return new Promise((resolve) => {
    gltfLoader.load(
      './tintin.glb',            // ← nom de ton fichier GLB
      (gltf) => {
        const m = gltf.scene;
        m.visible = false;

        // Auto-scale → hauteur cible ~55 cm
        const box       = new THREE.Box3().setFromObject(m);
        const size      = box.getSize(new THREE.Vector3());
        const maxDim    = Math.max(size.x, size.y, size.z);
        const scale     = 0.55 / maxDim;
        m.scale.setScalar(scale);

        // Centre le pivot à la base
        box.setFromObject(m);
        const center = box.getCenter(new THREE.Vector3());
        m.position.x -= center.x;
        m.position.z -= center.z;
        m.position.y -= box.min.y;

        m.traverse((node) => {
          if (node.isMesh) {
            node.castShadow    = true;
            node.receiveShadow = true;
          }
        });

        // Lance la première animation si disponible
        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(m);
          mixer.clipAction(gltf.animations[0]).play();
        }

        scene.add(m);
        model = m;
        resolve();
      },
      undefined,
      (err) => {
        // Fallback : silhouette bleue + tête jaune
        console.warn('GLB introuvable, placeholder utilisé :', err);
        const g = new THREE.Group();

        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.08, 0.3, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0x1a3a7c })
        );
        body.position.y = 0.25;
        body.castShadow = true;

        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 16, 16),
          new THREE.MeshStandardMaterial({ color: 0xf5c400 })
        );
        head.position.y = 0.52;
        head.castShadow = true;

        g.add(body, head);
        g.visible = false;
        scene.add(g);
        model = g;
        resolve();
      }
    );
  });
}

/* ─────────────────────────────────────────────────────
   EASING
───────────────────────────────────────────────────── */
function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/* ─────────────────────────────────────────────────────
   XR STATE
───────────────────────────────────────────────────── */
let xrSession       = null;
let xrRefSpace      = null;
let xrHitTestSource = null;

/* ─────────────────────────────────────────────────────
   START AR
───────────────────────────────────────────────────── */
document.getElementById('start-btn').addEventListener('click', async () => {

  if (!navigator.xr) {
    showNotSupported('WebXR non disponible sur ce navigateur.');
    return;
  }

  const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  if (!supported) {
    showNotSupported('AR non supportée sur cet appareil.');
    return;
  }

  document.getElementById('loading').style.display = 'flex';

  await loadModel();

  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'light-estimation'],
      domOverlay: { root: document.body },
    });

    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(xrSession);

    xrRefSpace      = await xrSession.requestReferenceSpace('local');
    const viewer    = await xrSession.requestReferenceSpace('viewer');
    xrHitTestSource = await xrSession.requestHitTestSource({ space: viewer });

    xrSession.addEventListener('end', onSessionEnd);

    document.getElementById('loading').style.display    = 'none';
    document.getElementById('landing').style.display    = 'none';
    document.getElementById('ui-overlay').style.display = 'flex';

    renderer.setAnimationLoop(render);

  } catch (err) {
    document.getElementById('loading').style.display = 'none';
    showNotSupported('Erreur : ' + err.message);
  }
});

function showNotSupported(msg) {
  const el = document.getElementById('not-supported');
  el.innerHTML = '⚠️ ' + msg;
  el.style.display = 'block';
}

/* ─────────────────────────────────────────────────────
   PLACEMENT AU TAP
───────────────────────────────────────────────────── */
canvas.addEventListener('click', () => {
  if (!reticleGroup.visible || !model) return;

  const pos  = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl  = new THREE.Vector3();
  reticleGroup.matrix.decompose(pos, quat, scl);

  model.position.copy(pos);
  model.quaternion.copy(quat);
  model.visible = true;
  modelPlaced   = true;
  reticleGroup.visible = false;

  shadowPlane.position.copy(pos);
  shadowPlane.visible = true;

  // Animation pop-in
  const baseScale = model.scale.x;
  model.scale.setScalar(0);
  let t = 0;
  const pop = setInterval(() => {
    t += 0.07;
    model.scale.setScalar(Math.min(easeOutBack(t), 1.0) * baseScale);
    if (t >= 1) clearInterval(pop);
  }, 16);

  if (!placedOnce) {
    placedOnce = true;
    const instr = document.getElementById('instructions');
    instr.textContent = '✅ Approchez-vous de Tintin !';
    setTimeout(() => { instr.style.opacity = '0'; }, 3000);
    setTimeout(() => { instr.style.display = 'none'; }, 3500);
  }
});

/* ─────────────────────────────────────────────────────
   BOUTON PARLER (ElevenLabs)
───────────────────────────────────────────────────── */
const talkBtn   = document.getElementById('talk-btn');
const talkIcon  = document.getElementById('talk-icon');
const talkLabel = document.getElementById('talk-label');
const elWrap    = document.getElementById('el-wrap');
const bubble    = document.getElementById('speech-bubble');
let talkActive  = false;

talkBtn.addEventListener('click', () => {
  talkActive = !talkActive;

  if (talkActive) {
    elWrap.style.display = 'block';
    talkBtn.classList.add('active');
    talkIcon.textContent  = '🔴';
    talkLabel.textContent = 'EN COURS';
    bubble.style.display  = 'block';

    // Ouvre automatiquement le widget ElevenLabs
    setTimeout(() => {
      const widget = document.querySelector('elevenlabs-convai');
      if (!widget) return;
      const btn = widget.shadowRoot?.querySelector('button');
      if (btn) btn.click();
      else widget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, 600);

  } else {
    elWrap.style.display  = 'none';
    talkBtn.classList.remove('active');
    talkIcon.textContent  = '🎙';
    talkLabel.textContent = 'PARLER';
    bubble.style.display  = 'none';
  }
});

/* ─────────────────────────────────────────────────────
   BOUTON STOP
───────────────────────────────────────────────────── */
document.getElementById('stop-btn').addEventListener('click', () => {
  xrSession?.end();
});

/* ─────────────────────────────────────────────────────
   FIN DE SESSION XR
───────────────────────────────────────────────────── */
function onSessionEnd() {
  xrSession = xrHitTestSource = null;
  renderer.setAnimationLoop(null);

  // UI reset
  document.getElementById('ui-overlay').style.display   = 'none';
  document.getElementById('landing').style.display      = 'flex';
  document.getElementById('instructions').style.opacity = '1';
  document.getElementById('instructions').style.display = 'block';
  document.getElementById('instructions').textContent   =
    '👆 Pointez une surface et touchez pour placer Tintin';

  elWrap.style.display  = 'none';
  bubble.style.display  = 'none';
  talkActive = false;
  talkBtn.classList.remove('active');
  talkIcon.textContent  = '🎙';
  talkLabel.textContent = 'PARLER';

  if (model) model.visible = false;
  shadowPlane.visible  = false;
  modelPlaced = placedOnce = false;
  reticleGroup.visible = false;
}

/* ─────────────────────────────────────────────────────
   BOUCLE DE RENDU
───────────────────────────────────────────────────── */
function render(_ts, frame) {
  if (frame && xrHitTestSource) {
    const hits = frame.getHitTestResults(xrHitTestSource);

    if (hits.length && !modelPlaced) {
      const pose = hits[0].getPose(xrRefSpace);
      if (pose) {
        reticleGroup.visible = true;
        reticleGroup.matrix.fromArray(pose.transform.matrix);

        // Pulsation du reticle
        reticlePulse += 0.06;
        const s = 1 + Math.sin(reticlePulse) * 0.12;
        reticleGroup.children.forEach((c) => c.scale.setScalar(s));
      }
    } else if (!modelPlaced) {
      reticleGroup.visible = false;
    }
  }

  if (mixer) mixer.update(clock.getDelta());
  renderer.render(scene, camera);
}

/* ─────────────────────────────────────────────────────
   RESIZE
───────────────────────────────────────────────────── */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
