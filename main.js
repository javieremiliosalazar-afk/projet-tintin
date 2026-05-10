import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let camera, scene, renderer;
let reticle, model, mixer;
let hitTestSource = null;
let hitTestSourceRequested = false;
let modelPlaced = false;

const clock = new THREE.Clock();

init();
animate();

function init() {
    // 1. Setup de la scène et de la caméra
    scene = new THREE.Scene();
    // CRUCIAL : Ne PAS définir de couleur de fond pour la scène, 
    // sinon ça masque le flux de la caméra en AR.
    // scene.background = new THREE.Color(0x000000); // <- Ne pas faire ça !

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // 2. Lumières
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // 3. Setup du Renderer avec WebXR
    // CRUCIAL : alpha: true est indispensable pour voir le flux vidéo derrière le canvas WebGL
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    
    // S'assurer que le clear color est transparent
    renderer.setClearColor(0x000000, 0); 
    document.body.appendChild(renderer.domElement);

    // 4. Bouton AR avec DOM Overlay
    const arOverlay = document.getElementById('ar-overlay');
    const arButtonContainer = document.getElementById('ar-button-container');
    
    const arButton = ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: arOverlay }
    });
    arButton.textContent = "Start AR";
    arButtonContainer.appendChild(arButton);

    renderer.xr.addEventListener('sessionstart', () => {
        document.getElementById('landing-page').style.display = 'none';
        arOverlay.style.display = 'block';
    });
    renderer.xr.addEventListener('sessionend', () => {
        document.getElementById('landing-page').style.display = 'flex';
        arOverlay.style.display = 'none';
        modelPlaced = false;
        if (model) scene.remove(model);
        document.getElementById('talk-btn').style.display = 'none';
        document.getElementById('eleven-widget-container').classList.add('hidden');
    });

    // 5. Chargement du Modèle 3D avec Fallback
    const loader = new GLTFLoader();
    
    // Fonction pour créer un cylindre rouge de secours
    function createFallbackCylinder() {
        console.warn("Utilisation du cylindre de secours.");
        const geometry = new THREE.CylinderGeometry(0.2, 0.2, 1, 32);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const cylinder = new THREE.Mesh(geometry, material);
        // Ajuster la position pour que la base soit sur le sol (hit test)
        cylinder.position.y = 0.5; 
        
        // Créer un groupe pour l'utiliser comme "modèle" principal
        model = new THREE.Group();
        model.add(cylinder);
    }

    loader.load('model.glb', function (gltf) {
        model = gltf.scene;
        model.scale.set(0.5, 0.5, 0.5); 
        
        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            const idleAction = mixer.clipAction(gltf.animations[0]);
            idleAction.play();
        }
    }, undefined, function (error) {
        console.error("Erreur lors du chargement de model.glb. Création du fallback...", error);
        createFallbackCylinder();
    });

    // 6. Reticle (Cercle de Hit Test)
    const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    reticle = new THREE.Mesh(geometry, material);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // 7. Interaction : Placer le modèle
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    setupUI();
    window.addEventListener('resize', onWindowResize);
}

function onSelect() {
    if (reticle.visible && model && !modelPlaced) {
        // Dans le cas du cylindre, on place le groupe principal
        model.position.setFromMatrixPosition(reticle.matrix);
        
        // Orienter le modèle vers la caméra (axe Y)
        const lookPos = new THREE.Vector3(camera.position.x, model.position.y, camera.position.z);
        model.lookAt(lookPos);
        
        scene.add(model);
        modelPlaced = true;
        reticle.visible = false;

        document.getElementById('talk-btn').style.display = 'block';
    }
}

function setupUI() {
    const talkBtn = document.getElementById('talk-btn');
    const widgetContainer = document.getElementById('eleven-widget-container');

    talkBtn.addEventListener('click', () => {
        widgetContainer.classList.toggle('hidden');
        if(widgetContainer.classList.contains('hidden')) {
            talkBtn.textContent = "Parler à Tintin";
            talkBtn.style.backgroundColor = "#e74c3c";
        } else {
            talkBtn.textContent = "Fermer le chat";
            talkBtn.style.backgroundColor = "#7f8c8d";
        }
    });
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
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    if (frame && !modelPlaced) {
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
