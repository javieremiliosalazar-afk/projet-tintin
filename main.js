/**
 * main.js — WebAR + ElevenLabs Conversational AI
 * ─────────────────────────────────────────────────
 * CONFIGURATION REQUISE (lignes ci-dessous) :
 *   1. MODEL_URL              → URL de votre modèle GLTF/GLB
 *   2. ELEVENLABS_AGENT_ID    → ID de votre agent ElevenLabs ConvAI
 *   3. ELEVENLABS_API_KEY     → Votre clé API ElevenLabs
 *   4. ELEVENLABS_VOICE_ID    → ID de la voix ElevenLabs
 *
 * Documentation ElevenLabs ConvAI :
 *   https://elevenlabs.io/docs/conversational-ai/overview
 */
 
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARButton }   from 'three/addons/webxr/ARButton.js';
 
/* ══════════════════════════════════════════════
   ▌ CONFIGURATION — À MODIFIER
   ══════════════════════════════════════════════ */
 
const CONFIG = {
  // Modèle 3D
  MODEL_URL:           './assets/model.glb',   // ✅ FIX 1 — slash corrigé
  MODEL_SCALE:         1.0,
 
  // ElevenLabs
  ELEVENLABS_API_KEY:  "sk_f2a0d378048edc5ceb7108296de4e05a261ca4eb4bff8ed2",        // ← Collez votre nouvelle clé ici
  ELEVENLABS_AGENT_ID: "agent_6201kncf8mfdey5s99wfnbgp952a",       // ← Collez votre Agent ID ici
  ELEVENLABS_VOICE_ID: "1Z9SUkvx5gRIEOA9KIRP",       // ← Collez votre Voice ID ici
 
  // Audio
  AUDIO_SAMPLE_RATE:   16000,
};
 
/* ══════════════════════════════════════════════
   ▌ UI ELEMENTS
   ══════════════════════════════════════════════ */
 
const ui = {
  canvas:              document.getElementById('ar-canvas'),
  btnTalk:             document.getElementById('btn-talk'),
  statusDot:           document.getElementById('status-dot'),
  statusText:          document.getElementById('status-text'),
  transcriptBox:       document.getElementById('transcript-box'),
  transcriptUser:      document.getElementById('transcript-user'),
  transcriptAgent:     document.getElementById('transcript-agent'),
  listeningIndicator:  document.getElementById('listening-indicator'),
  arButtonContainer:   document.getElementById('ar-button-container'),
  placementHint:       document.getElementById('placement-hint'),
};
 
function setStatus(text, state = 'idle') {
  ui.statusText.textContent = text;
  ui.statusDot.className = '';
  if (state !== 'idle') ui.statusDot.classList.add(state);
}
 
/* ══════════════════════════════════════════════
   ▌ THREE.JS — SCENE
   ══════════════════════════════════════════════ */
 
const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
 
const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
 
// Lumières
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
 
const dirLight = new THREE.DirectionalLight(0x00f5ff, 1.2);
dirLight.position.set(1, 3, 2);
scene.add(dirLight);
 
const fillLight = new THREE.DirectionalLight(0xb07dff, 0.4);
fillLight.position.set(-2, 1, -1);
scene.add(fillLight);
 
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
 
/* ══════════════════════════════════════════════
   ▌ GLTF MODEL
   ══════════════════════════════════════════════ */
 
let characterModel = null;
let mixer = null;
const clock = new THREE.Clock();
const loader = new GLTFLoader();
 
function loadModel() {
  setStatus('Chargement modèle...', 'active');
 
  loader.load(
    CONFIG.MODEL_URL,
    (gltf) => {
      characterModel = gltf.scene;
      characterModel.scale.setScalar(CONFIG.MODEL_SCALE);
      characterModel.visible = false;
 
      characterModel.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
 
      if (gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(characterModel);
        const idleClip = gltf.animations.find(a => /idle/i.test(a.name)) || gltf.animations[0];
        mixer.clipAction(idleClip).play();
      }
 
      scene.add(characterModel);
      setStatus('Modèle prêt', 'active');
      console.log('✅ Modèle chargé :', gltf);
    },
    (progress) => {
      const pct = Math.round((progress.loaded / progress.total) * 100);
      setStatus(`Chargement ${pct}%`, 'active');
    },
    (error) => {
      console.error('❌ Erreur chargement modèle :', error);
      setStatus('Erreur modèle — fallback', 'error');
      const geo = new THREE.CapsuleGeometry(0.15, 0.5, 8, 16);
      const mat = new THREE.MeshStandardMaterial({ color: 0x00f5ff, emissive: 0x001a1f });
      characterModel = new THREE.Mesh(geo, mat);
      characterModel.visible = false;
      scene.add(characterModel);
    }
  );
}
 
/* ══════════════════════════════════════════════
   ▌ WEBXR — AR SESSION + HIT TEST
   ══════════════════════════════════════════════ */
 
let hitTestSource = null;
let hitTestSourceRequested = false;
let modelPlaced = false;
 
const reticleGeometry = new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2);
const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0x00f5ff, opacity: 0.8, transparent: true });
const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);
 
const arButton = ARButton.createButton(renderer, {
  requiredFeatures: ['hit-test'],
  optionalFeatures: ['dom-overlay'],
  domOverlay: { root: document.getElementById('overlay') },
});
arButton.id = 'ARButton';
ui.arButtonContainer.appendChild(arButton);
 
renderer.xr.addEventListener('sessionstart', () => {
  setStatus('AR actif', 'active');
  if (!modelPlaced) ui.placementHint.classList.remove('hidden');
  ui.btnTalk.disabled = false;
});
 
renderer.xr.addEventListener('sessionend', () => {
  setStatus('Session terminée');
  hitTestSource = null;
  hitTestSourceRequested = false;
  ui.placementHint.classList.add('hidden');
  ui.btnTalk.disabled = true;
  if (characterModel) characterModel.visible = false;
  modelPlaced = false;
  stopConversation();
});
 
const controller = renderer.xr.getController(0);
controller.addEventListener('select', onSelect);
scene.add(controller);
 
function onSelect() {
  if (reticle.visible && characterModel) {
    characterModel.position.setFromMatrixPosition(reticle.matrix);
    characterModel.visible = true;
    reticle.visible = false;
    modelPlaced = true;
    ui.placementHint.classList.add('hidden');
    setStatus('Personnage placé', 'active');
  }
}
 
/* ══════════════════════════════════════════════
   ▌ BOUCLE DE RENDU
   ══════════════════════════════════════════════ */
 
renderer.setAnimationLoop((timestamp, frame) => {
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);
 
  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();
 
    if (!hitTestSourceRequested) {
      session.requestReferenceSpace('viewer').then((viewerSpace) => {
        session.requestHitTestSource({ space: viewerSpace }).then((source) => {
          hitTestSource = source;
        });
      });
      hitTestSourceRequested = true;
    }
 
    if (hitTestSource && !modelPlaced) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        reticle.visible = true;
        reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
      } else {
        reticle.visible = false;
      }
    }
 
    if (characterModel && characterModel.visible && elevenlabs.agentSpeaking) {
      const t = timestamp / 1000;
      characterModel.position.y += Math.sin(t * 6) * 0.00015;
    }
  }
 
  renderer.render(scene, camera);
});
 
/* ══════════════════════════════════════════════
   ▌ ELEVENLABS CONVERSATIONAL AI
   ══════════════════════════════════════════════ */
 
const elevenlabs = {
  ws:              null,
  isConnected:     false,
  agentSpeaking:   false,
  mediaStream:     null,
  audioContext:    null,
  scriptProcessor: null,
  playbackContext: null,
  nextPlayTime:    0,
};
 
async function toggleConversation() {
  if (elevenlabs.isConnected) {
    stopConversation();
  } else {
    await startConversation();
  }
}
 
async function startConversation() {
  // ✅ FIX 2 — Vérification avec des placeholders génériques
  if (
    CONFIG.ELEVENLABS_AGENT_ID === 'VOTRE_AGENT_ID' ||
    CONFIG.ELEVENLABS_API_KEY  === 'VOTRE_CLE_API'  ||
    CONFIG.ELEVENLABS_VOICE_ID === 'VOTRE_VOICE_ID'
  ) {
    alert('⚠️ Veuillez renseigner AGENT_ID, API_KEY et VOICE_ID dans CONFIG (main.js)');
    return;
  }
 
  setStatus('Connexion...', 'active');
 
  // Microphone
  try {
    elevenlabs.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate:       CONFIG.AUDIO_SAMPLE_RATE,
        channelCount:     1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  } catch (err) {
    console.error('❌ Micro refusé :', err);
    setStatus('Micro refusé', 'error');
    return;
  }
 
  // ✅ FIX 3 — Clé API ajoutée dans l'URL WebSocket
  const wsUrl = [
    `wss://api.elevenlabs.io/v1/convai/conversation`,
    `?agent_id=${CONFIG.ELEVENLABS_AGENT_ID}`,
    `&xi-api-key=${CONFIG.ELEVENLABS_API_KEY}`,
  ].join('');
 
  elevenlabs.ws = new WebSocket(wsUrl);
 
  elevenlabs.ws.onopen = () => {
    console.log('✅ ElevenLabs WebSocket connecté');
    elevenlabs.isConnected = true;
 
    elevenlabs.ws.send(JSON.stringify({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        agent: {
          prompt:        { prompt: '' },
          first_message: '',
        },
        tts: {
          voice_id: CONFIG.ELEVENLABS_VOICE_ID,  // ✅ FIX 4 — Voice ID branché
        },
      },
    }));
 
    startMicStream();
    updateTalkButton(true);
    setStatus('Connecté', 'active');
  };
 
  elevenlabs.ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleServerMessage(msg);
  };
 
  elevenlabs.ws.onerror = (err) => {
    console.error('❌ WebSocket error :', err);
    setStatus('Erreur connexion', 'error');
    stopConversation();
  };
 
  elevenlabs.ws.onclose = (event) => {
    console.log('WebSocket fermé — code :', event.code, event.reason);
    if (elevenlabs.isConnected) setStatus('Déconnecté', 'idle');
    elevenlabs.isConnected = false;
    updateTalkButton(false);
    stopMicStream();
  };
}
 
function stopConversation() {
  stopMicStream();
 
  if (elevenlabs.ws) {
    elevenlabs.ws.close();
    elevenlabs.ws = null;
  }
  if (elevenlabs.playbackContext) {
    elevenlabs.playbackContext.close();
    elevenlabs.playbackContext = null;
  }
 
  elevenlabs.isConnected   = false;
  elevenlabs.agentSpeaking = false;
  elevenlabs.nextPlayTime  = 0;
 
  updateTalkButton(false);
  showListening(false);
  ui.transcriptBox.classList.add('hidden');
  setStatus('Prêt', 'idle');
}
 
function handleServerMessage(msg) {
  switch (msg.type) {
 
    case 'conversation_initiation_metadata':
      console.log('📋 Session ID :', msg.conversation_initiation_metadata_event?.conversation_id);
      break;
 
    case 'ping':
      elevenlabs.ws?.send(JSON.stringify({
        type:     'pong',
        event_id: msg.ping_event?.event_id,
      }));
      break;
 
    case 'user_transcript':
      const userText = msg.user_transcription_event?.user_transcript || '';
      if (userText.trim()) {
        ui.transcriptUser.textContent = userText;
        ui.transcriptBox.classList.remove('hidden');
        setStatus('Traitement...', 'active');
      }
      break;
 
    case 'agent_response':
      const agentText = msg.agent_response_event?.agent_response || '';
      if (agentText.trim()) {
        ui.transcriptAgent.textContent = agentText;
        ui.transcriptBox.classList.remove('hidden');
      }
      break;
 
    case 'audio':
      const audioB64 = msg.audio_event?.audio_base_64;
      if (audioB64) {
        elevenlabs.agentSpeaking = true;
        playPCMAudio(audioB64);
        setStatus('Agent parle...', 'active');
        showListening(false);
      }
      break;
 
    case 'interruption':
      elevenlabs.agentSpeaking = false;
      setStatus('Écoute', 'listening');
      showListening(true);
      break;
 
    case 'internal_tentative_agent_response':
      break;
 
    default:
      console.log('📨 Message WS :', msg.type, msg);
  }
}
 
/* ── Capture microphone ───────────────────────── */
 
function startMicStream() {
  if (!elevenlabs.mediaStream) return;
 
  elevenlabs.audioContext = new AudioContext({ sampleRate: CONFIG.AUDIO_SAMPLE_RATE });
  const source = elevenlabs.audioContext.createMediaStreamSource(elevenlabs.mediaStream);
  elevenlabs.scriptProcessor = elevenlabs.audioContext.createScriptProcessor(4096, 1, 1);
 
  elevenlabs.scriptProcessor.onaudioprocess = (e) => {
    if (!elevenlabs.isConnected || elevenlabs.ws?.readyState !== WebSocket.OPEN) return;
    const float32 = e.inputBuffer.getChannelData(0);
    const int16   = float32ToInt16(float32);
    const base64  = arrayBufferToBase64(int16.buffer);
    elevenlabs.ws.send(JSON.stringify({
      type:        'audio',
      audio_event: { audio_base_64: base64 },
    }));
  };
 
  source.connect(elevenlabs.scriptProcessor);
  elevenlabs.scriptProcessor.connect(elevenlabs.audioContext.destination);
 
  showListening(true);
  setStatus('Écoute', 'listening');
}
 
function stopMicStream() {
  elevenlabs.scriptProcessor?.disconnect();
  elevenlabs.scriptProcessor = null;
 
  elevenlabs.audioContext?.close();
  elevenlabs.audioContext = null;
 
  elevenlabs.mediaStream?.getTracks().forEach(t => t.stop());
  elevenlabs.mediaStream = null;
 
  showListening(false);
}
 
/* ── Lecture audio PCM ────────────────────────── */
 
async function playPCMAudio(base64) {
  try {
    if (!elevenlabs.playbackContext || elevenlabs.playbackContext.state === 'closed') {
      elevenlabs.playbackContext = new AudioContext({ sampleRate: CONFIG.AUDIO_SAMPLE_RATE });
      elevenlabs.nextPlayTime = 0;
    }
 
    const ctx    = elevenlabs.playbackContext;
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
 
    const int16   = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
 
    const audioBuffer = ctx.createBuffer(1, float32.length, CONFIG.AUDIO_SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(float32);
 
    const source  = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
 
    const startTime = Math.max(elevenlabs.nextPlayTime, ctx.currentTime + 0.02);
    source.start(startTime);
    elevenlabs.nextPlayTime = startTime + audioBuffer.duration;
 
    source.onended = () => {
      if (elevenlabs.nextPlayTime <= ctx.currentTime + 0.1) {
        elevenlabs.agentSpeaking = false;
        setStatus('Écoute', 'listening');
        showListening(true);
      }
    };
  } catch (err) {
    console.error('❌ Erreur lecture audio :', err);
  }
}
 
/* ── Utilitaires ──────────────────────────────── */
 
function float32ToInt16(float32) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}
 
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
 
function updateTalkButton(connected) {
  if (connected) {
    ui.btnTalk.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
        <path d="M17 16.95A7 7 0 0 1 5 12v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
      <span>Couper</span>`;
    ui.btnTalk.classList.add('listening');
  } else {
    ui.btnTalk.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
      <span>Parler</span>`;
    ui.btnTalk.classList.remove('listening');
  }
}
 
function showListening(show) {
  ui.listeningIndicator.classList.toggle('hidden', !show);
}
 
/* ══════════════════════════════════════════════
   ▌ EVENTS & INIT
   ══════════════════════════════════════════════ */
 
ui.btnTalk.addEventListener('click', toggleConversation);
 
loadModel();
setStatus('Prêt', 'idle');
 
console.log(`
╔══════════════════════════════════════╗
║  WebAR + ElevenLabs ConvAI           ║
║  Modèle   : ${CONFIG.MODEL_URL}
║  Agent ID : ${CONFIG.ELEVENLABS_AGENT_ID}
║  Voice ID : ${CONFIG.ELEVENLABS_VOICE_ID}
╚══════════════════════════════════════╝
`);

