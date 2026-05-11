// ==========================================
// 1. IMPORTATIONS ET VARIABLES GLOBALES
// ==========================================
import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let camera, scene, renderer;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;

let modelToPlace = null;
let currentModel = null;

let mixer = null;
let animationAction = null;
const clock = new THREE.Clock();

let arOverlay = null;

init();
animate();

// ==========================================
// 2. INITIALISATION
// ==========================================
function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 2);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Overlay dédié pour le dom-overlay WebXR
    arOverlay = document.createElement('div');
    arOverlay.id = 'ar-overlay';
    arOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';
    document.body.appendChild(arOverlay);

    // Bouton AR
const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: arOverlay }
});
arButton.style.zIndex = '99999';
document.body.appendChild(arButton);
    }));

    // Bouton Parler
    const speakBtn = document.createElement('div');
    speakBtn.id = 'speak-btn';
    speakBtn.innerText = '💬 Parler';
    speakBtn.style.cssText = `
        display: none;
        position: fixed;
        top: 24px;
        left: 20px;
        background: #ffffff;
        color: #111111;
        font-family: Arial, sans-serif;
        font-weight: bold;
        font-size: 16px;
        padding: 12px 22px;
        border-radius: 30px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        pointer-events: auto;
        cursor: pointer;
        z-index: 10000;
    `;
    arOverlay.appendChild(speakBtn);

    speakBtn.addEventListener('click', onSpeakClick);
    speakBtn.addEventListener('touchend', (e) => { e.preventDefault(); onSpeakClick(); }, { passive: false });
    speakBtn.addEventListener('beforexrselect', (e) => e.preventDefault());

    // Widget ElevenLabs
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'el-widget';
    widgetContainer.style.cssText = `
        display: none;
        position: fixed;
        bottom: 100px;
        right: 20px;
        pointer-events: auto;
        z-index: 10000;
    `;

    // ⚠️ Remplace YOUR_AGENT_ID par ton vrai Agent ID ElevenLabs
    widgetContainer.innerHTML = `<elevenlabs-convai agent-id="YOUR_AGENT_ID"></elevenlabs-convai>`;
    widgetContainer.addEventListener('beforexrselect', (e) => e.preventDefault());
    arOverlay.appendChild(widgetContainer);

    // Charge le script ElevenLabs
    const script = document.createElement('script');
    script.src = 'https://elevenlabs.io/convai-widget/index.js';
    script.async = true;
    document.head.appendChild(script);

    // Gestion session AR
    renderer.xr.addEventListener('sessionstart', () => {
        const lp = document.getElementById('landing-page');
        if (lp) lp.style.display = 'none';
    });

    renderer.xr.addEventListener('sessionend', () => {
        const lp = document.getElementById('landing-page');
        if (lp) lp.style.display = 'flex';
        if (currentModel) { scene.remove(currentModel); currentModel = null; }
        document.getElementById('speak-btn').style.display = 'none';
        document.getElementById('el-widget').style.display = 'none';
    });

    // ==========================================
    // CHARGEMENT DU MODÈLE 3D
    // ==========================================
    const loader = new GLTFLoader();
    loader.load(
        '2.glb',
        function (gltf) {
            const rawModel = gltf.scene;
            const box = new THREE.Box3().setFromObject(rawModel);
            const size = box.getSize(new THREE.Vector3());

            const targetHeight = 0.25;
            const scaleFactor = targetHeight / size.y;
            rawModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

            const scaledBox = new THREE.Box3().setFromObject(rawModel);
            const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
            const decalageSol = -0.035;

            rawModel.position.x = -scaledCenter.x;
            rawModel.position.y = -scaledBox.min.y + decalageSol;
            rawModel.position.z = -scaledCenter.z;

            modelToPlace = new THREE.Group();
            modelToPlace.add(rawModel);

            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(rawModel);
                animationAction = mixer.clipAction(gltf.animations[0]);
            }
        },
        undefined,
        function (error) { console.error("Erreur, 2.glb introuvable.", error); }
    );

    // ==========================================
    // RETICLE
    // ==========================================
    const ringGeo = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    reticle = new THREE.Mesh(ringGeo, ringMat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    window.addEventListener('resize', onWindowResize);
}

// ==========================================
// CLIC SUR "PARLER"
// ==========================================
function onSpeakClick() {
    document.getElementById('speak-btn').style.display = 'none';
    document.getElementById('el-widget').style.display = 'block';
}

// ==========================================
// PLACEMENT DU MODÈLE
// ==========================================
function onSelect() {
    if (reticle.visible && modelToPlace) {

        if (!currentModel) {
            currentModel = modelToPlace;
            scene.add(currentModel);

            if (animationAction) animationAction.play();

            setTimeout(() => {
                document.getElementById('speak-btn').style.display = 'block';
            }, 2000);
        }

        currentModel.position.setFromMatrixPosition(reticle.matrix);
        const lookPos = new THREE.Vector3(camera.position.x, currentModel.position.y, camera.position.z);
        currentModel.lookAt(lookPos);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    renderer.setAnimationLoop(render);
}

// ==========================================
// BOUCLE DE RENDU
// ==========================================
function render(timestamp, frame) {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then(function (referenceSpace) {
                session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
                    hitTestSource = source;
                });
            });
            session.addEventListener('end', function () {
                hitTestSourceRequested = false;
                hitTestSource = null;
            });
            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
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
}


    renderer.render(scene, camera);
}
