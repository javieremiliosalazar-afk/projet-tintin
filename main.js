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

// --- NOUVEAU : Variables pour l'animation ---
let mixer = null; // Le lecteur d'animation
let animationAction = null; // L'animation en elle-même
const clock = new THREE.Clock(); // L'horloge pour gérer le temps

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

    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

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

            const targetHeight = 0.8; 
            const scaleFactor = targetHeight / size.y;
            rawModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

            const scaledBox = new THREE.Box3().setFromObject(rawModel);
            const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

            rawModel.position.x = -scaledCenter.x;
            rawModel.position.y = -scaledBox.min.y;
            rawModel.position.z = -scaledCenter.z;

            modelToPlace = new THREE.Group();
            modelToPlace.add(rawModel);
            
            // --- NOUVEAU : Préparation de l'animation ---
            // On vérifie si le fichier contient bien des animations
            if (gltf.animations && gltf.animations.length > 0) {
                // On crée le lecteur lié au modèle
                mixer = new THREE.AnimationMixer(rawModel);
                // On prépare la toute première animation du fichier (l'index 0)
                animationAction = mixer.clipAction(gltf.animations[0]);
                console.log("Animation trouvée et prête !");
            } else {
                console.warn("Aucune animation trouvée dans ce fichier 2.glb.");
            }

            console.log("Modèle chargé, redimensionné et prêt !");
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

// Fonction appelée quand tu touches l'écran
function onSelect() {
    if (reticle.visible && modelToPlace) {
        
        // --- NOUVEAU : On ne clone plus, on place le modèle original ---
        if (!currentModel) {
            currentModel = modelToPlace; // Retrait du .clone()
            scene.add(currentModel);
            
            // On active l'animation au tout premier clic !
            if (animationAction) {
                animationAction.play();
            }
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
// 7. BOUCLE DE RENDU ET CALCUL DU SOL
// ==========================================
function render(timestamp, frame) {
    // --- NOUVEAU : Mise à jour du temps pour l'animation ---
    const delta = clock.getDelta(); // Temps écoulé depuis la dernière image
    if (mixer) {
        mixer.update(delta); // Fait avancer l'animation
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
                if (currentModel) {
                    scene.remove(currentModel);
                    currentModel = null; 
                }
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
