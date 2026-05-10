import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let camera, scene, renderer;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;

// Variables pour le modèle
let modelToPlace = null;
let modelPlaced = false;

init();
animate();

function init() {
    // 1. Scène (Sans fond pour voir la caméra)
    scene = new THREE.Scene();

    // 2. Caméra
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // 3. Lumières
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // 4. Renderer (alpha: true est OBLIGATOIRE pour voir la caméra)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // 5. Bouton AR (On demande la fonctionnalité hit-test)
    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

    // 6. Chargement du Modèle 3D
    const loader = new GLTFLoader();
    loader.load(
        'model.glb', 
        function (gltf) {
            modelToPlace = gltf.scene;
            modelToPlace.scale.set(0.5, 0.5, 0.5); // Ajuste la taille si besoin
        },
        undefined,
        function (error) {
            console.warn("Modèle model.glb introuvable. Utilisation d'un cube de remplacement.");
            // Fallback : un cube si le modèle ne charge pas
            const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
            const material = new THREE.MeshNormalMaterial();
            modelToPlace = new THREE.Mesh(geometry, material);
            // On remonte le cube pour qu'il soit posé SUR le sol, pas à moitié enfoncé
            modelToPlace.position.y = 0.1; 
        }
    );

    // 7. Reticle (Le cercle vert pour viser le sol)
    const ringGeo = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    reticle = new THREE.Mesh(ringGeo, ringMat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // 8. Contrôleur (Clic sur l'écran pour placer)
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    window.addEventListener('resize', onWindowResize);
}

function onSelect() {
    // Si le cercle est visible, que le modèle est chargé et qu'il n'est pas encore placé
    if (reticle.visible && modelToPlace && !modelPlaced) {
        
        // On clone le modèle pour ne pas altérer l'original (bonne pratique)
        const newModel = modelToPlace.clone();
        
        // On le place à la position du reticle
        newModel.position.setFromMatrixPosition(reticle.matrix);
        
        // On l'oriente vers la caméra
        const lookPos = new THREE.Vector3(camera.position.x, newModel.position.y, camera.position.z);
        newModel.lookAt(lookPos);
        
        scene.add(newModel);
        
        // On cache le reticle et on empêche d'en placer d'autres
        reticle.visible = false;
        modelPlaced = true; 
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
    // Si on est en AR, qu'on a une frame, et que le modèle n'est pas encore placé
    if (frame && !modelPlaced) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        // Demande d'accès au Hit Test
        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then(function (referenceSpace) {
                session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
                    hitTestSource = source;
                });
            });
            session.addEventListener('end', function () {
                hitTestSourceRequested = false;
                hitTestSource = null;
                modelPlaced = false; // Permet de replacer si on relance la session
            });
            hitTestSourceRequested = true;
        }

        // Calcul de la position du Hit Test
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
