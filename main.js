/**
 * main.js — WebAR
 * ─────────────────────────────────────────────────
 * La conversation ElevenLabs est gérée par le widget
 * intégré dans index.html. Ce fichier gère uniquement
 * la scène Three.js et la session WebXR.
 *
 * CONFIGURATION :
 *   MODEL_URL    → chemin vers votre modèle GLB
 *   MODEL_SCALE  → taille du personnage
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARButton }   from 'three/addons/webxr/ARButton.js';

/* ══════════════════════════════════════════════
   ▌ CONFIGURATION — À MODIFIER
   ══════════════════════════════════════════════ */

const CONFIG = {
  MODEL_URL:   './model.glb', // ← Chemin vers votre fichier GLB
  MODEL_SCALE: 1.0,                  // ← Taille du personnage
};

/* ══════════════════════════════════════════════
   ▌ UI ELEMENTS
   ══════════════════════════════════════════════ */

const ui = {
  canvas:            document.getElementById('ar-canvas'),
  statusDot:         document.getElementById('status-dot'),
  statusText:        document.getElementById('status-text'),
  arButtonContainer: document.getElementById('ar-button-container'),
  placementHint:     document.getElementById('placement-hint'),
};

function setStatus(text, state = 'idle') {
  ui.statusText.textContent = text;
  ui.statusDot.className = '';
  if (state !== 'idle') ui.statusDot.classList.add(state);
}

/* ══════════════════════════════════════════════
   ▌ THREE.JS — SCENE
   ══════════════════════════════════════════════ */

const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

// Lumières
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0x00f5ff, 1.2);
dirLight.position.set(1, 3, 2);
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xb07dff, 0.4);
fillLight.position.set(-2, 1, -1);
scene.add(fillLight);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ══════════════════════════════════════════════
   ▌ GLTF MODEL
   ══════════════════════════════════════════════ */

let characterModel = null;
let mixer = null;
const clock = new THREE.Clock();
const loader = new GLTFLoader();

function loadModel() {
  setStatus('Chargement modèle...', 'active');

  loader.load(
    CONFIG.MODEL_URL,
    (gltf) => {
      characterModel = gltf.scene;
      characterModel.scale.setScalar(CONFIG.MODEL_SCALE);
      characterModel.visible = false;

      characterModel.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });

      if (gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(characterModel);
        const idleClip = gltf.animations.find(a => /idle/i.test(a.name)) || gltf.animations[0];
        mixer.clipAction(idleClip).play();
      }

      scene.add(characterModel);
      setStatus('Modèle prêt', 'active');
      console.log('✅ Modèle chargé :', gltf);
    },
    (progress) => {
      const pct = Math.round((progress.loaded / progress.total) * 100);
      setStatus(`Chargement ${pct}%`, 'active');
    },
    (error) => {
      console.error('❌ Erreur chargement modèle :', error);
      setStatus('Erreur modèle — fallback', 'error');
      const geo = new THREE.CapsuleGeometry(0.15, 0.5, 8, 16);
      const mat = new THREE.MeshStandardMaterial({ color: 0x00f5ff, emissive: 0x001a1f });
      characterModel = new THREE.Mesh(geo, mat);
      characterModel.visible = false;
      scene.add(characterModel);
    }
  );
}

/* ══════════════════════════════════════════════
   ▌ WEBXR — AR SESSION + HIT TEST
   ══════════════════════════════════════════════ */

let hitTestSource = null;
let hitTestSourceRequested = false;
let modelPlaced = false;

// Réticule de placement
const reticleGeometry = new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2);
const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0x00f5ff, opacity: 0.8, transparent: true });
const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

// Bouton AR
const arButton = ARButton.createButton(renderer, {
  requiredFeatures: ['hit-test'],
  optionalFeatures: ['dom-overlay'],
  domOverlay: { root: document.getElementById('overlay') },
});
arButton.id = 'ARButton';
ui.arButtonContainer.appendChild(arButton);

// Événements session XR
renderer.xr.addEventListener('sessionstart', () => {
  setStatus('AR actif', 'active');
  if (!modelPlaced) ui.placementHint.classList.remove('hidden');
});

renderer.xr.addEventListener('sessionend', () => {
  setStatus('Prêt');
  hitTestSource = null;
  hitTestSourceRequested = false;
  ui.placementHint.classList.add('hidden');
  if (characterModel) characterModel.visible = false;
  modelPlaced = false;
});

// Touch → placement
const controller = renderer.xr.getController(0);
controller.addEventListener('select', onSelect);
scene.add(controller);

function onSelect() {
  if (reticle.visible && characterModel) {
    characterModel.position.setFromMatrixPosition(reticle.matrix);
    characterModel.visible = true;
    reticle.visible = false;
    modelPlaced = true;
    ui.placementHint.classList.add('hidden');
    setStatus('Personnage placé', 'active');
  }
}

/* ══════════════════════════════════════════════
   ▌ BOUCLE DE RENDU
   ══════════════════════════════════════════════ */

renderer.setAnimationLoop((timestamp, frame) => {
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (!hitTestSourceRequested) {
      session.requestReferenceSpace('viewer').then((viewerSpace) => {
        session.requestHitTestSource({ space: viewerSpace }).then((source) => {
          hitTestSource = source;
        });
      });
      hitTestSourceRequested = true;
    }

    if (hitTestSource && !modelPlaced) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        reticle.visible = true;
        reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
      } else {
        reticle.visible = false;
      }
    }
  }

  renderer.render(scene, camera);
});

/* ══════════════════════════════════════════════
   ▌ INIT
   ══════════════════════════════════════════════ */

loadModel();
setStatus('Prêt', 'idle');
