import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let camera, scene, renderer;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;

// Variables pour gérer le modèle
let modelToPlace = null; // Le modèle en mémoire (chargé depuis le fichier)
let currentModel = null; // L'instance de Tintin qui est actuellement dans la scène AR

init();
animate();

function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

    // Chargement du Modèle 3D
    const loader = new GLTFLoader();
    loader.load(
        'model.glb', 
        function (gltf) {
            modelToPlace = gltf.scene;
            // On garde la petite taille
            modelToPlace.scale.set(0.0001, 0.0001, 0.0001); 
        },
        undefined,
        function (error) {
            console.warn("Modèle model.glb introuvable. Utilisation d'un cube de remplacement.");
            const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
            const material = new THREE.MeshNormalMaterial();
            modelToPlace = new THREE.Mesh(geometry, material);
            modelToPlace.position.y = 0.1; 
        }
    );

    // Reticle (Le cercle vert pour viser le sol)
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

function onSelect() {
    // Si le cercle vert est visible (une surface est détectée) et que le modèle est chargé
    if (reticle.visible && modelToPlace) {
        
        // Si c'est le TOUT PREMIER clic, on instancie Tintin et on l'ajoute à la scène
        if (!currentModel) {
            currentModel = modelToPlace.clone();
            scene.add(currentModel);
        }
        
        // À CHAQUE CLIC (premier ou suivants), on met à jour la position
        currentModel.position.setFromMatrixPosition(reticle.matrix);
        
        // On l'oriente vers la caméra (pour qu'il te regarde toujours)
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

function render(timestamp, frame) {
    // La modification est ici : on a enlevé la restriction "!modelPlaced".
    // Le code du Hit Test s'exécute maintenant à chaque frame indéfiniment.
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
                // On nettoie la scène si l'utilisateur quitte la vue AR
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
