import * as THREE from "three";

import { ARButton } from "three/addons/webxr/ARButton.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

let camera;
let scene;
let renderer;

let controller;

let reticle;

let hitTestSource = null;
let hitTestSourceRequested = false;

let avatarModel = null;
let mixer = null;

let modelPlaced = false;

const clock = new THREE.Clock();

init();

function init() {

  // SCENE
  scene = new THREE.Scene();

  // CAMERA
  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    20
  );

  // RENDERER
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });

  renderer.setPixelRatio(window.devicePixelRatio);

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );

  renderer.xr.enabled = true;

  document.body.appendChild(renderer.domElement);

  // LIGHTS
  const hemiLight = new THREE.HemisphereLight(
    0xffffff,
    0xbbbbff,
    2
  );

  scene.add(hemiLight);

  const directionalLight = new THREE.DirectionalLight(
    0xffffff,
    2
  );

  directionalLight.position.set(1, 3, 2);

  scene.add(directionalLight);

  // RETICLE
  const geometry = new THREE.RingGeometry(
    0.08,
    0.12,
    32
  ).rotateX(-Math.PI / 2);

  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff
  });

  reticle = new THREE.Mesh(
    geometry,
    material
  );

  reticle.matrixAutoUpdate = false;
  reticle.visible = false;

  scene.add(reticle);

  // CONTROLLER
  controller = renderer.xr.getController(0);

  controller.addEventListener(
    "select",
    onSelect
  );

  scene.add(controller);

  // ENTER EXPERIENCE
  document
    .getElementById("enterButton")
    .addEventListener("click", startAR);

  // TALK BUTTON
  document
    .getElementById("talkButton")
    .addEventListener("click", startConversation);

  window.addEventListener(
    "resize",
    onWindowResize
  );

  renderer.setAnimationLoop(render);
}

function startAR() {

  document
    .getElementById("landing")
    .style.display = "none";

  document
    .getElementById("scanText")
    .style.display = "block";

  document.body.appendChild(

    ARButton.createButton(renderer, {
      requiredFeatures: ["hit-test"]
    })

  );
}

function onSelect() {

  if (!reticle.visible || modelPlaced) return;

  const loader = new GLTFLoader();

  loader.load(

    "./model.glb",

    (gltf) => {

      avatarModel = gltf.scene;

      avatarModel.position.setFromMatrixPosition(
        reticle.matrix
      );

      avatarModel.scale.set(
        0.5,
        0.5,
        0.5
      );

      scene.add(avatarModel);

      // ANIMATION
      if (gltf.animations.length > 0) {

        mixer = new THREE.AnimationMixer(
          avatarModel
        );

        const action = mixer.clipAction(
          gltf.animations[0]
        );

        action.play();
      }

      modelPlaced = true;

      // SHOW UI
      document
        .getElementById("talkButton")
        .style.display = "block";

      document
        .getElementById("scanText")
        .style.display = "none";

    },

    undefined,

    (error) => {
      console.error(error);
    }

  );
}

async function startConversation() {

  const agentId = "agent_6201kncf8mfdey5s99wfnbgp952a";

  try {

    if (!window.Conversation) {

      const script = document.createElement("script");

      script.src =
        "https://unpkg.com/@11labs/client/dist/index.js";

      script.onload = async () => {

        await window.Conversation.startSession({
          agentId: agentId
        });

      };

      document.body.appendChild(script);

    } else {

      await window.Conversation.startSession({
        agentId: agentId
      });

    }

  } catch (err) {

    console.error(err);

  }
}

function render(timestamp, frame) {

  if (mixer) {

    mixer.update(clock.getDelta());

  }

  if (frame) {

    const referenceSpace =
      renderer.xr.getReferenceSpace();

    const session =
      renderer.xr.getSession();

    if (!hitTestSourceRequested) {

      session
        .requestReferenceSpace("viewer")
        .then((referenceSpace) => {

          session
            .requestHitTestSource({
              space: referenceSpace
            })

            .then((source) => {

              hitTestSource = source;

            });

        });

      session.addEventListener("end", () => {

        hitTestSourceRequested = false;
        hitTestSource = null;

      });

      hitTestSourceRequested = true;
    }

    if (hitTestSource) {

      const hitTestResults =
        frame.getHitTestResults(hitTestSource);

      if (hitTestResults.length > 0) {

        const hit = hitTestResults[0];

        reticle.visible = true;

        reticle.matrix.fromArray(
          hit.getPose(referenceSpace)
            .transform.matrix
        );

      } else {

        reticle.visible = false;

      }
    }
  }

  renderer.render(scene, camera);
}

function onWindowResize() {

  camera.aspect =
    window.innerWidth / window.innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );
}
