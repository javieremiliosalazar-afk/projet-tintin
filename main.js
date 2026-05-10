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
    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

    // --- GESTION DE LA LANDING PAGE BD ---
    renderer.xr.addEventListener('sessionstart', () => {
        // Quand l'AR démarre, on cache la page d'accueil
        const landingPage = document.getElementById('landing-page');
        if(landingPage) landingPage.style.display = 'none';
    });

    renderer.xr.addEventListener('sessionend', () => {
        // Quand on quitte l'AR, on réaffiche la page d'accueil
        const landingPage = document.getElementById('landing-page');
        if(landingPage) landingPage.style.display = 'flex';
        
        // Nettoyage de la scène
        if (currentModel) {
            scene.remove(currentModel);
            currentModel = null;
        }
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

            // 1. MODIFICATION DE LA TAILLE : On passe de 0.8 à 0.5 (50 cm)
            const targetHeight = 0.14; 
            const scaleFactor = targetHeight / size.y;
            rawModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

            const scaledBox = new THREE.Box3().setFromObject(rawModel);
            const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

            // 2. MODIFICATION DU NIVEAU DU SOL
            // Si la géométrie invisible de Tintin le fait flotter, on le descend manuellement.
            // Une valeur négative l'enfonce dans le sol. Ajuste cette valeur (ex: -0.05, -0.1)
            const decalageSol = -0.8; // Commence par -2cm

            rawModel.position.x = -scaledCenter.x;
            rawModel.position.y = -scaledBox.min.y + decalageSol; // Ajout du décalage ici
            rawModel.position.z = -scaledCenter.z;

            modelToPlace = new THREE.Group();
            modelToPlace.add(rawModel);
            
            // Préparation de l'animation
            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(rawModel);
                animationAction = mixer.clipAction(gltf.animations[0]);
                console.log("Animation trouvée et prête !");
            }

            console.log("Modèle chargé, réduit à 50cm et ajusté au sol !");
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
}

// Fonction appelée quand on touche l'écran
function onSelect() {
    if (reticle.visible && modelToPlace) {
        
        // Au tout premier clic
        if (!currentModel) {
            currentModel = modelToPlace; 
            scene.add(currentModel);
            
            // On active l'animation
            if (animationAction) {
                animationAction.play();
            }
        }
        
        // On déplace le modèle sur le cercle vert
        currentModel.position.setFromMatrixPosition(reticle.matrix);
        
        // On le fait regarder vers la caméra
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
// 7. BOUCLE DE RENDU ET CALCUL DU SOL
// ==========================================
function render(timestamp, frame) {
    // Mise à jour de l'animation à chaque image
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
