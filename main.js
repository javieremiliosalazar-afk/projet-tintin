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

// Variables pour l'animation
let mixer = null;
let animationAction = null;
const clock = new THREE.Clock();

// Variables pour la bulle et le widget
let speakBubbleTimer = null;
let modelPlaced = false;

init();
animate();

// ==========================================
// 2. INITIALISATION DE LA SCÈNE ET CAMÉRA
// ==========================================
function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 2);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // ==========================================
    // 3. PARAMÉTRAGE DU RENDU WEBXR
    // ==========================================
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Création du bouton AR
document.body.appendChild(ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: document.body }
}));
    // --- GESTION DE LA LANDING PAGE BD ---
    renderer.xr.addEventListener('sessionstart', () => {
        const landingPage = document.getElementById('landing-page');
        if (landingPage) landingPage.style.display = 'none';
    });

    renderer.xr.addEventListener('sessionend', () => {
        const landingPage = document.getElementById('landing-page');
        if (landingPage) landingPage.style.display = 'flex';

        if (currentModel) {
            scene.remove(currentModel);
            currentModel = null;
        }

        // Réinitialise la bulle et le widget à la fin de la session AR
        hideSpeakBubble();
        hideElevenLabsWidget();
        modelPlaced = false;
        if (speakBubbleTimer) clearTimeout(speakBubbleTimer);
    });

    // ==========================================
    // 4. CHARGEMENT ET RECADRAGE DU MODÈLE 3D
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
                console.log("Animation trouvée et prête !");
            }

            console.log("Modèle chargé, réduit à 25cm et ajusté au sol !");
        },
        undefined,
        function (error) {
            console.error("Erreur, 2.glb introuvable.", error);
        }
    );

    // ==========================================
    // 5. LE CIBLEUR (RETICLE) POUR LE SOL
    // ==========================================
    const ringGeo = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    reticle = new THREE.Mesh(ringGeo, ringMat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // ==========================================
    // 6. INTERACTION (CLIC POUR PLACER)
    // ==========================================
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    window.addEventListener('resize', onWindowResize);

    // ==========================================
    // 7. INITIALISATION DE LA BULLE ET DU WIDGET
    // ==========================================
    setupSpeakBubble();
    setupElevenLabsWidget();
}

// ==========================================
// BULLE "PARLER" — SETUP
// ==========================================
function setupSpeakBubble() {
    // Crée la bulle si elle n'existe pas encore dans le DOM
    if (document.getElementById('speak-bubble')) return;

    const bubble = document.createElement('div');
    bubble.id = 'speak-bubble';
    bubble.innerHTML = `
        <span class="bubble-icon">💬</span>
        <span class="bubble-label">Parler</span>
    `;
    bubble.style.cssText = `
        display: none;
        position: fixed;
        bottom: 120px;
        left: 50%;
        transform: translateX(-50%) scale(0.8);
        background: #ffffff;
        color: #1a1a2e;
        font-family: 'Helvetica Neue', Arial, sans-serif;
        font-weight: 700;
        font-size: 18px;
        padding: 14px 28px;
        border-radius: 50px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2);
        cursor: pointer;
        z-index: 9999;
        align-items: center;
        gap: 10px;
        opacity: 0;
        transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1);
        border: 3px solid #e8e8e8;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        min-width: 140px;
        justify-content: center;
        white-space: nowrap;
    `;

    // Styles pour les enfants inline
    const icon = bubble.querySelector('.bubble-icon');
    icon.style.cssText = 'font-size: 22px; line-height: 1;';

    const label = bubble.querySelector('.bubble-label');
    label.style.cssText = 'letter-spacing: 0.5px;';

    // Effet de pulsation pour attirer l'attention
    const pulseStyle = document.createElement('style');
    pulseStyle.textContent = `
        @keyframes bubblePulse {
            0%, 100% { box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 0 0 0 rgba(255,255,255,0.5); }
            50% { box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 0 0 12px rgba(255,255,255,0); }
        }
        #speak-bubble.visible {
            animation: bubblePulse 2s ease-in-out infinite;
        }
        #speak-bubble:active {
            transform: translateX(-50%) scale(0.93) !important;
        }
    `;
    document.head.appendChild(pulseStyle);

    document.body.appendChild(bubble);

    // Clic sur la bulle → ouvre le widget ElevenLabs
    bubble.addEventListener('click', () => {
        toggleElevenLabsWidget();
    });

    // Fallback tactile (pour certains navigateurs mobile en WebXR)
    bubble.addEventListener('touchend', (e) => {
        e.preventDefault();
        toggleElevenLabsWidget();
    }, { passive: false });
}

function showSpeakBubble() {
    const bubble = document.getElementById('speak-bubble');
    if (!bubble) return;
    bubble.style.display = 'flex';
    // Déclenche la transition après affichage
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            bubble.style.opacity = '1';
            bubble.style.transform = 'translateX(-50%) scale(1)';
            bubble.classList.add('visible');
        });
    });
}

function hideSpeakBubble() {
    const bubble = document.getElementById('speak-bubble');
    if (!bubble) return;
    bubble.style.opacity = '0';
    bubble.style.transform = 'translateX(-50%) scale(0.8)';
    bubble.classList.remove('visible');
    setTimeout(() => { bubble.style.display = 'none'; }, 400);
}

// ==========================================
// WIDGET ELEVENLABS — SETUP
// ==========================================
function setupElevenLabsWidget() {
    if (document.getElementById('el-widget-container')) return;

    // Charge le script ElevenLabs une seule fois
    if (!document.getElementById('elevenlabs-script')) {
        const script = document.createElement('script');
        script.id = 'elevenlabs-script';
        script.src = 'https://elevenlabs.io/convai-widget/index.js';
        script.async = true;
        document.head.appendChild(script);
    }

    // Conteneur du widget
    const container = document.createElement('div');
    container.id = 'el-widget-container';
    container.style.cssText = `
        display: none;
        position: fixed;
        bottom: 100px;
        right: 20px;
        z-index: 10000;
        opacity: 0;
        transform: translateY(20px) scale(0.95);
        transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1);
    `;

    // ⚠️ REMPLACE "YOUR_AGENT_ID" par ton vrai Agent ID ElevenLabs
    const widget = document.createElement('elevenlabs-convai');
    widget.setAttribute('agent-id', "agent_6201kncf8mfdey5s99wfnbgp952a");
    container.appendChild(widget);

    document.body.appendChild(container);
}

function showElevenLabsWidget() {
    const container = document.getElementById('el-widget-container');
    if (!container) return;
    container.style.display = 'block';
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            container.style.opacity = '1';
            container.style.transform = 'translateY(0) scale(1)';
        });
    });
}

function hideElevenLabsWidget() {
    const container = document.getElementById('el-widget-container');
    if (!container) return;
    container.style.opacity = '0';
    container.style.transform = 'translateY(20px) scale(0.95)';
    setTimeout(() => { container.style.display = 'none'; }, 350);
}

function toggleElevenLabsWidget() {
    const container = document.getElementById('el-widget-container');
    if (!container) return;
    if (container.style.display === 'none' || container.style.display === '') {
        showElevenLabsWidget();
    } else {
        hideElevenLabsWidget();
    }
}

// ==========================================
// FONCTION APPELÉE QUAND ON TOUCHE L'ÉCRAN
// ==========================================
function onSelect() {
    if (reticle.visible && modelToPlace) {

        // Au tout premier clic
        if (!currentModel) {
            currentModel = modelToPlace;
            scene.add(currentModel);

            if (animationAction) {
                animationAction.play();
            }

            // Affiche la bulle 2 secondes après l'apparition du modèle
            if (!modelPlaced) {
                modelPlaced = true;
                if (speakBubbleTimer) clearTimeout(speakBubbleTimer);
                speakBubbleTimer = setTimeout(() => {
                    showSpeakBubble();
                }, 2000);
            }
        }

        // Déplace le modèle sur le cercle vert
        currentModel.position.setFromMatrixPosition(reticle.matrix);

        // Le fait regarder vers la caméra
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
// BOUCLE DE RENDU ET CALCUL DU SOL
// ==========================================
function render(timestamp, frame) {
    const delta = clock.getDelta();
    if (mixer) {
        mixer.update(delta);
    }

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
                const pose = hit.getPose(referenceSpace);

                reticle.visible = true;
                reticle.matrix.fromArray(pose.transform.matrix);
            } else {
                reticle.visible = false;
            }
        }
    }

    renderer.render(scene, camera);
}
