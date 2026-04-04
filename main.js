// Création de la scène
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);

// Caméra
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 3);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('container').appendChild(renderer.domElement);

// Lumières
const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
light.position.set(0, 20, 0);
scene.add(light);

// GLTF Loader
const loader = new THREE.GLTFLoader();
loader.load('assets/model.glb', function(gltf){
    const model = gltf.scene;
    model.scale.set(1,1,1);
    scene.add(model);
}, undefined, function(error){
    console.error(error);
});

// Contrôles basiques (rotation de la caméra avec la souris)
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

renderer.domElement.addEventListener('mousedown', () => isDragging = true);
renderer.domElement.addEventListener('mouseup', () => isDragging = false);
renderer.domElement.addEventListener('mousemove', (e) => {
    if(!isDragging) return;
    const deltaMove = { x: e.offsetX - previousMousePosition.x, y: e.offsetY - previousMousePosition.y };
    scene.rotation.y += deltaMove.x * 0.005;
    previousMousePosition = { x: e.offsetX, y: e.offsetY };
});

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

// Redimensionnement
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
