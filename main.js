/* =============================================
   MISSION AR — main.js
   Logique GPS + AR + étapes du jeu de piste
   ============================================= */

// ─── CONFIGURATION DES ÉTAPES ────────────────────────────────────────────────
// 👇 Remplace les coordonnées par tes vrais emplacements GPS !
const STEPS = [
  {
    id: 1,
    label: "01 / 04",
    description: "Trouvez la fontaine dans le parc central",
    lat: 48.8566,   // ← À MODIFIER
    lng: 2.3522,    // ← À MODIFIER
    radius: 20,     // Distance en mètres pour valider
    color: "#00e5ff",
    clue: "Bravo ! Votre prochain objectif se trouve près de l'entrée principale du musée.",
    arLabel: "CIBLE 01"
  },
  {
    id: 2,
    label: "02 / 04",
    description: "Rejoignez l'entrée principale du musée",
    lat: 48.8600,   // ← À MODIFIER
    lng: 2.3550,    // ← À MODIFIER
    radius: 20,
    color: "#ff9f43",
    clue: "Excellent ! Direction maintenant la statue dans la grande allée.",
    arLabel: "CIBLE 02"
  },
  {
    id: 3,
    label: "03 / 04",
    description: "Localisez la statue dans la grande allée",
    lat: 48.8620,   // ← À MODIFIER
    lng: 2.3490,    // ← À MODIFIER
    radius: 20,
    color: "#ff3d71",
    clue: "Presque fini ! La dernière cible est cachée sous le grand escalier.",
    arLabel: "CIBLE 03"
  },
  {
    id: 4,
    label: "04 / 04",
    description: "Trouvez le grand escalier",
    lat: 48.8580,   // ← À MODIFIER
    lng: 2.3510,    // ← À MODIFIER
    radius: 20,
    color: "#00ff9d",
    clue: null,
    arLabel: "CIBLE FINALE"
  }
];

const FINAL_MESSAGE = "🏆 MISSION ACCOMPLIE ! Le code secret est : ALPHA-7734. Montre-le à l'organisateur pour récupérer ta récompense !";

// ─── ÉTAT DU JEU ──────────────────────────────────────────────────────────────
let currentStepIndex = 0;
let watchId = null;
let playerLat = null;
let playerLng = null;
let arEntities = {};
let stepValidated = false;

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────

/** Calcul distance Haversine en mètres */
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Formate une distance lisible */
function formatDistance(meters) {
  if (meters >= 1000) return (meters / 1000).toFixed(1) + " km";
  return Math.round(meters) + " m";
}

/** Affiche une notification flash */
function showNotification(text, duration = 2500) {
  const el = document.getElementById("notification");
  el.textContent = text;
  el.classList.remove("hidden");
  el.classList.add("visible");
  setTimeout(() => {
    el.classList.remove("visible");
    el.classList.add("hidden");
  }, duration);
}

/** Bascule entre les écrans */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ─── INITIALISATION GPS ───────────────────────────────────────────────────────

function initGPS() {
  const warning = document.getElementById("gps-warning");
  warning.textContent = "Demande d'accès GPS en cours...";

  if (!navigator.geolocation) {
    warning.textContent = "⚠ GPS non supporté sur cet appareil.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      playerLat = pos.coords.latitude;
      playerLng = pos.coords.longitude;
      warning.textContent = "✓ GPS actif — " + pos.coords.accuracy.toFixed(0) + "m de précision";
      setTimeout(() => startGame(), 800);
    },
    (err) => {
      warning.textContent = "⚠ Erreur GPS : " + getGPSError(err);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function getGPSError(err) {
  switch (err.code) {
    case 1: return "Permission refusée. Autorise la géolocalisation.";
    case 2: return "Position indisponible.";
    case 3: return "Délai dépassé. Réessaie en extérieur.";
    default: return "Erreur inconnue.";
  }
}

// ─── DÉMARRAGE DU JEU ─────────────────────────────────────────────────────────

function startGame() {
  currentStepIndex = 0;
  stepValidated = false;
  showScreen("screen-game");
  loadStep(currentStepIndex);
  startWatchingGPS();
  injectARObjects();
}

function loadStep(index) {
  const step = STEPS[index];
  stepValidated = false;

  // Mise à jour HUD
  document.getElementById("hud-step").textContent = step.label;
  document.getElementById("mission-description").textContent = step.description;

  // Mise à jour points d'étape (intro)
  document.querySelectorAll(".step-dot").forEach((dot, i) => {
    dot.classList.remove("active", "done");
    if (i < index) dot.classList.add("done");
    else if (i === index) dot.classList.add("active");
  });

  // Active seulement l'entité AR de l'étape courante
  Object.keys(arEntities).forEach(id => {
    const entity = arEntities[id];
    if (entity) entity.setAttribute("visible", parseInt(id) === step.id);
  });
}

// ─── INJECTION DES OBJETS AR GPS ─────────────────────────────────────────────

function injectARObjects() {
  const scene = document.getElementById("ar-scene");

  STEPS.forEach(step => {
    // Créer une entité GPS pour chaque étape
    const entity = document.createElement("a-entity");
    entity.setAttribute("id", "ar-step-" + step.id);
    entity.setAttribute("gps-entity-place", `latitude: ${step.lat}; longitude: ${step.lng}`);
    entity.setAttribute("visible", "false");

    // Boîte principale qui tourne
    const box = document.createElement("a-box");
    box.setAttribute("color", step.color);
    box.setAttribute("width", "2");
    box.setAttribute("height", "2");
    box.setAttribute("depth", "2");
    box.setAttribute("position", "0 1 0");
    box.setAttribute("opacity", "0.85");
    box.setAttribute("animation", "property: rotation; to: 0 360 0; loop: true; dur: 3000; easing: linear");
    box.setAttribute("animation__pulse", "property: scale; to: 1.1 1.1 1.1; dir: alternate; loop: true; dur: 1000");

    // Sphère de halo
    const halo = document.createElement("a-sphere");
    halo.setAttribute("color", step.color);
    halo.setAttribute("radius", "1.5");
    halo.setAttribute("position", "0 1 0");
    halo.setAttribute("opacity", "0.15");
    halo.setAttribute("animation", "property: scale; to: 1.4 1.4 1.4; dir: alternate; loop: true; dur: 1500");

    // Label texte
    const text = document.createElement("a-text");
    text.setAttribute("value", step.arLabel);
    text.setAttribute("color", step.color);
    text.setAttribute("position", "0 3.5 0");
    text.setAttribute("align", "center");
    text.setAttribute("width", "10");
    text.setAttribute("look-at", "[gps-camera]");

    entity.appendChild(halo);
    entity.appendChild(box);
    entity.appendChild(text);
    scene.appendChild(entity);

    arEntities[step.id] = entity;
  });
}

// ─── SUIVI GPS EN TEMPS RÉEL ──────────────────────────────────────────────────

function startWatchingGPS() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);

  watchId = navigator.geolocation.watchPosition(
    onPositionUpdate,
    (err) => console.warn("GPS watch error:", err.message),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
  );
}

function onPositionUpdate(pos) {
  playerLat = pos.coords.latitude;
  playerLng = pos.coords.longitude;
  const accuracy = pos.coords.accuracy;

  const step = STEPS[currentStepIndex];
  const dist = getDistance(playerLat, playerLng, step.lat, step.lng);

  // Mise à jour HUD
  document.getElementById("hud-accuracy").textContent = Math.round(accuracy) + "m";
  document.getElementById("hud-meters").textContent = formatDistance(dist);

  // Couleur distance : rouge > jaune > vert selon proximité
  const distEl = document.getElementById("hud-meters");
  if (dist <= step.radius) {
    distEl.style.color = "var(--success)";
  } else if (dist <= step.radius * 3) {
    distEl.style.color = "var(--gold)";
  } else {
    distEl.style.color = "var(--accent)";
  }

  // Mise à jour boussole approximative
  updateCompass(playerLat, playerLng, step.lat, step.lng);

  // Vérification arrivée
  if (!stepValidated && dist <= step.radius) {
    validateStep();
  }
}

// ─── BOUSSOLE ─────────────────────────────────────────────────────────────────

function updateCompass(fromLat, fromLng, toLat, toLng) {
  const dLng = (toLng - fromLng) * Math.PI / 180;
  const φ1 = fromLat * Math.PI / 180;
  const φ2 = toLat * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

  const needle = document.getElementById("compass-needle");
  needle.style.transform = `rotate(${bearing}deg)`;
}

// ─── VALIDATION D'UNE ÉTAPE ───────────────────────────────────────────────────

function validateStep() {
  stepValidated = true;
  const step = STEPS[currentStepIndex];

  // Vibration si disponible
  if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);

  showNotification("✓ CIBLE LOCALISÉE !", 1500);

  setTimeout(() => {
    if (currentStepIndex >= STEPS.length - 1) {
      // Dernière étape : écran de fin
      document.getElementById("end-final-clue").textContent = FINAL_MESSAGE;
      showScreen("screen-end");
    } else {
      // Affichage de l'indice
      document.getElementById("success-message").textContent =
        `Étape ${step.id} sur ${STEPS.length} complétée !`;
      document.getElementById("clue-text").textContent = step.clue;
      showScreen("screen-success");
    }
  }, 1500);
}

// ─── ÉTAPE SUIVANTE ───────────────────────────────────────────────────────────

function nextStep() {
  currentStepIndex++;
  if (currentStepIndex < STEPS.length) {
    showScreen("screen-game");
    loadStep(currentStepIndex);
  }
}

// ─── REDÉMARRER ───────────────────────────────────────────────────────────────

function restartGame() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  // Nettoyer les entités AR
  Object.values(arEntities).forEach(e => e && e.parentNode && e.parentNode.removeChild(e));
  arEntities = {};
  showScreen("screen-intro");
}

// ─── DEBUG MODE (optionnel) ───────────────────────────────────────────────────
// Décommente pour simuler une position GPS sans se déplacer
/*
function debugSimulatePosition(lat, lng) {
  onPositionUpdate({
    coords: { latitude: lat, longitude: lng, accuracy: 5 }
  });
}
// Exemple: debugSimulatePosition(48.8566, 2.3522);
*/
