Ton code contient encore des erreurs de syntaxe critiques (du code "en vrac" qui traîne à l'extérieur des fonctions). Quand le navigateur rencontre une erreur de syntaxe dans un fichier .js, il arrête de lire tout le fichier. C'est pour ça que ton bouton ne réagit pas.

Voici la version nettoyée et complète de ton fichier main.js.
Ce que j'ai corrigé :

    Suppression des doublons : Tu avais deux fonctions initGPS et du code qui traînait au milieu.

    Fermeture des balises : J'ai remis les accolades { } là où elles manquaient.

    Logique de démarrage : J'ai lié initGPS à startGame proprement.

Copie-colle ce code dans ton main.js :
JavaScript

/* =============================================
   MISSION AR — main.js (Version Corrigée)
   ============================================= */

// ─── CONFIGURATION DES ÉTAPES ────────────────────────────────────────────────
const STEPS = [
  {
    id: 1,
    label: "01 / 04",
    description: "Trouvez la fontaine dans le parc central",
    lat: 50.87708482698384,
    lng: 4.378923178722083,
    radius: 5,
    color: "#00e5ff",
    clue: "Bravo ! Votre prochain objectif se trouve près de l'entrée principale du musée.",
    arLabel: "CIBLE 01"
  },
  {
    id: 2,
    label: "02 / 04",
    description: "Rejoignez l'entrée principale du musée",
    lat: 48.8600,
    lng: 2.3550,
    radius: 20,
    color: "#ff9f43",
    clue: "Excellent ! Direction maintenant la statue dans la grande allée.",
    arLabel: "CIBLE 02"
  },
  {
    id: 3,
    label: "03 / 04",
    description: "Localisez la statue dans la grande allée",
    lat: 48.8620,
    lng: 2.3490,
    radius: 20,
    color: "#ff3d71",
    clue: "Presque fini ! La dernière cible est cachée sous le grand escalier.",
    arLabel: "CIBLE 03"
  },
  {
    id: 4,
    label: "04 / 04",
    description: "Trouvez le grand escalier",
    lat: 48.8580,
    lng: 2.3510,
    radius: 20,
    color: "#00ff9d",
    clue: null,
    arLabel: "CIBLE FINALE"
  }
];

const FINAL_MESSAGE = "🏆 MISSION ACCOMPLIE ! Le code secret est : ALPHA-7734.";

// ─── ÉTAT DU JEU ──────────────────────────────────────────────────────────────
let currentStepIndex = 0;
let watchId = null;
let playerLat = null;
let playerLng = null;
let arEntities = {};
let stepValidated = false;

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {
  if (meters >= 1000) return (meters / 1000).toFixed(1) + " km";
  return Math.round(meters) + " m";
}

function showNotification(text, duration = 2500) {
  const el = document.getElementById("notification");
  el.textContent = text;
  el.classList.replace("hidden", "visible");
  setTimeout(() => el.classList.replace("visible", "hidden"), duration);
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ─── INITIALISATION GPS ───────────────────────────────────────────────────────

function initGPS() {
    const warning = document.getElementById('gps-warning');
    if (!navigator.geolocation) {
        warning.textContent = "⚠ GPS non supporté.";
        return;
    }

    warning.textContent = "Initialisation du protocole...";

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            playerLat = pos.coords.latitude;
            playerLng = pos.coords.longitude;
            startGame();
            // Force AR.js à démarrer la vidéo proprement
            window.dispatchEvent(new Event('resize'));
        },
        (err) => {
            warning.textContent = "⚠ Erreur : " + getGPSError(err);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

function getGPSError(err) {
    switch (err.code) {
        case 1: return "Permission refusée.";
        case 2: return "Position indisponible.";
        case 3: return "Délai dépassé.";
        default: return "Erreur inconnue.";
    }
}

// ─── DÉMARRAGE DU JEU ─────────────────────────────────────────────────────────

function startGame() {
  currentStepIndex = 0;
  stepValidated = false;
  showScreen("screen-game");
  injectARObjects(); // On injecte les objets en premier
  loadStep(currentStepIndex);
  startWatchingGPS();
}

function loadStep(index) {
  const step = STEPS[index];
  stepValidated = false;

  document.getElementById("hud-step").textContent = step.label;
  document.getElementById("mission-description").textContent = step.description;

  // Active seulement l'entité AR correspondante
  Object.keys(arEntities).forEach(id => {
    arEntities[id].setAttribute("visible", parseInt(id) === step.id);
  });
}

function injectARObjects() {
  const scene = document.getElementById("ar-scene");
  STEPS.forEach(step => {
    const entity = document.createElement("a-entity");
    entity.setAttribute("id", "ar-step-" + step.id);
    entity.setAttribute("gps-entity-place", `latitude: ${step.lat}; longitude: ${step.lng}`);
    entity.setAttribute("visible", "false");

    const box = document.createElement("a-box");
    box.setAttribute("color", step.color);
    box.setAttribute("scale", "2 2 2");
    box.setAttribute("animation", "property: rotation; to: 0 360 0; loop: true; dur: 3000; easing: linear");

    const text = document.createElement("a-text");
    text.setAttribute("value", step.arLabel);
    text.setAttribute("align", "center");
    text.setAttribute("position", "0 3 0");
    text.setAttribute("scale", "5 5 5");
    text.setAttribute("look-at", "[gps-camera]");

    entity.appendChild(box);
    entity.appendChild(text);
    scene.appendChild(entity);
    arEntities[step.id] = entity;
  });
}

function startWatchingGPS() {
  watchId = navigator.geolocation.watchPosition(onPositionUpdate, null, { 
    enableHighAccuracy: true, 
    maximumAge: 1000 
  });
}

function onPositionUpdate(pos) {
  playerLat = pos.coords.latitude;
  playerLng = pos.coords.longitude;
  
  const step = STEPS[currentStepIndex];
  const dist = getDistance(playerLat, playerLng, step.lat, step.lng);

  document.getElementById("hud-accuracy").textContent = Math.round(pos.coords.accuracy) + "m";
  document.getElementById("hud-meters").textContent = formatDistance(dist);

  updateCompass(playerLat, playerLng, step.lat, step.lng);

  if (!stepValidated && dist <= step.radius) {
    validateStep();
  }
}

function updateCompass(fLat, fLng, tLat, tLng) {
  const dLng = (tLng - fLng) * Math.PI / 180;
  const φ1 = fLat * Math.PI / 180;
  const φ2 = tLat * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  document.getElementById("compass-needle").style.transform = `rotate(${bearing}deg)`;
}

function validateStep() {
  stepValidated = true;
  const step = STEPS[currentStepIndex];
  showNotification("✓ CIBLE LOCALISÉE !");

  setTimeout(() => {
    if (currentStepIndex >= STEPS.length - 1) {
      document.getElementById("end-final-clue").textContent = FINAL_MESSAGE;
      showScreen("screen-end");
    } else {
      document.getElementById("success-message").textContent = `Étape terminée !`;
      document.getElementById("clue-text").textContent = step.clue;
      showScreen("screen-success");
    }
  }, 2000);
}

function nextStep() {
  currentStepIndex++;
  showScreen("screen-game");
  loadStep(currentStepIndex);
}

function restartGame() {
  location.reload(); // Plus propre pour tout réinitialiser
}
