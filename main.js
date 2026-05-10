// ==========================================
// 1. IMPORTATIONS ET VARIABLES GLOBALES
// ==========================================
import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Les éléments de base de Three.js
let camera, scene, renderer;

// Variables pour la Réalité Augmentée (AR)
let reticle; // Le cercle vert qui vise le sol
let hitTestSource = null; // La source qui calcule les surfaces
let hitTestSourceRequested = false;

// Variables pour notre modèle 3D (Tintin)
let modelToPlace = null; // Le modèle "gabarit" chargé en mémoire
let currentModel = null; // Le modèle physiquement affiché dans ta pièce

// On lance les deux fonctions principales
init();
animate();

// ==========================================
// 2. INITIALISATION DE LA SCÈNE ET CAMÉRA
// ==========================================
function init() {
    // a. Création de la scène vide (sans fond pour voir la caméra)
    scene = new THREE.Scene();

    // b. Création de la caméra
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // c. Ajout d'une lumière (HemisphereLight imite la lumière du ciel et du sol)
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 2); 
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // ==========================================
    // 3. PARAMÉTRAGE DU RENDU WEBXR
    // ==========================================
    // Le "renderer" dessine la 3D. L'option "alpha: true" rend le fond transparent.
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true; // On active la Réalité Virtuelle/Augmentée
    document.body.appendChild(renderer.domElement);

    // Création du bouton "Start AR". On exige la fonctionnalité 'hit-test' (détection du sol)
    document.body.appendChild(ARButton.createButton(renderer, { requiredFeatures: ['hit-test'] }));

    // ==========================================
    // 4. CHARGEMENT ET RECADRAGE DU MODÈLE 3D
    // ==========================================
    const loader = new GLTFLoader();
    loader.load(
        'model.glb', // Ton fichier 3D
        function (gltf) {
            const rawModel = gltf.scene;

            // --- MATHÉMATIQUES DE RECADRAGE ---
            // 1. On mesure le modèle d'origine
            const box = new THREE.Box3().setFromObject(rawModel);
            const size = box.getSize(new THREE.Vector3());

            // 2. On force sa hauteur à exactement 0.2 mètres (20 cm)
            const targetHeight = 0.2; 
            const scaleFactor = targetHeight / size.y;
            rawModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

            // 3. On recalcule sa nouvelle taille
            const scaledBox = new THREE.Box3().setFromObject(rawModel);
            const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

            // 4. On corrige l'origine pour que ses pieds soient à Y = 0 (Le niveau du sol)
            rawModel.position.x = -scaledCenter.x;
            rawModel.position.y = -scaledBox.min.y;
            rawModel.position.z = -scaledCenter.z;

            // 5. On l'emballe dans un groupe propre pour l'utiliser plus tard
            modelToPlace = new THREE.Group();
            modelToPlace.add(rawModel);
            
            console.log("Modèle chargé, redimensionné à 20cm et prêt !");
        },
        undefined,
        function (error) {
            console.error("Erreur, model.glb introuvable.", error);
        }
    );

    // ==========================================
    // 5. LE CIBLEUR (RETICLE) POUR LE SOL
    // ==========================================
    // C'est le cercle vert qui se plaque contre les surfaces détectées
    const ringGeo = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    reticle = new THREE.Mesh(ringGeo, ringMat);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // ==========================================
    // 6. INTERACTION (CLIC POUR PLACER)
    // ==========================================
    // Le "controller" représente ton doigt qui touche l'écran
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', onSelect);
    scene.add(controller);

    window.addEventListener('resize', onWindowResize);
}

// Fonction appelée quand tu touches l'écran
function onSelect() {
    // Si le cercle vert est visible ET que le modèle a fini de charger
    if (reticle.visible && modelToPlace) {
        
        // S'il n'y a pas encore de personnage affiché, on le crée (clone)
        if (!currentModel) {
            currentModel = modelToPlace.clone();
            scene.add(currentModel);
        }
        
        // On téléporte le personnage là où se trouve le cercle vert
        currentModel.position.setFromMatrixPosition(reticle.matrix);
        
        // On force le personnage à regarder vers la caméra (pour te faire face)
        const lookPos = new THREE.Vector3(camera.position.x, currentModel.position.y, camera.position.z);
        currentModel.lookAt(lookPos);
    }
}

// Gère le redimensionnement de la fenêtre
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Lance la boucle d'animation
function animate() {
    renderer.setAnimationLoop(render);
}

// ==========================================
// 7. BOUCLE DE RENDU ET CALCUL DU SOL (HIT TEST)
// ==========================================
// Cette fonction s'exécute environ 60 fois par seconde
function render(timestamp, frame) {
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        // Si on n'a pas encore demandé au téléphone de calculer le sol, on le fait
        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then(function (referenceSpace) {
                session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
                    hitTestSource = source;
                });
            });
            // Nettoyage si on quitte la session AR
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

        // Si la source de calcul est prête, on cherche le sol
        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            // Si le téléphone a trouvé une surface (sol, table...)
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                const pose = hit.getPose(referenceSpace);

                // On affiche le cercle vert et on le colle sur la surface
                reticle.visible = true;
                reticle.matrix.fromArray(pose.transform.matrix);
            } else {
                // Pas de surface trouvée, on cache le cercle
                reticle.visible = false;
            }
        }
    }

    // On dessine l'image finale sur l'écran
    renderer.render(scene, camera);
}
