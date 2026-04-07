/* =========================
   CONFIGURATION
========================= */

const checkpoints = [
  {
    name: "Point 1",
    lat: 50.8466,
    lon: 4.3528,
    radius: 100000 // large pour test
  }
];

let currentStep = 0;
let cubeVisible = false;

/* =========================
   DISTANCE GPS
========================= */

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;

  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;

  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/* =========================
   LOGIQUE DU JEU
========================= */

function checkCheckpoint(lat, lon) {

  if (currentStep >= checkpoints.length) {
    document.getElementById("status").innerText = "🎉 Jeu terminé !";
    return;
  }

  const point = checkpoints[currentStep];

  const distance = getDistance(lat, lon, point.lat, point.lon);

  document.getElementById("status").innerText =
    "Distance: " + Math.round(distance) + " m";

  if (distance < point.radius && !cubeVisible) {
    spawnCube(point.name);
  }
}

function spawnCube(name) {

  const cube = document.querySelector('#cube');

  if (!cube) {
    console.error("Cube introuvable");
    return;
  }

  cube.setAttribute('visible', 'true');
  cubeVisible = true;

  document.getElementById("status").innerText =
    "✅ " + name + " trouvé !";

  document.getElementById("ui").classList.add("found");

  setTimeout(() => {
    document.getElementById("ui").classList.remove("found");
  }, 600);

  setTimeout(() => {
    cube.setAttribute('visible', 'false');
    cubeVisible = false;
    currentStep++;

    document.getElementById("step").innerText =
      "Étape: " + currentStep;

  }, 3000);
}

/* =========================
   GPS (BOUTON)
========================= */

function startGPS() {

  document.getElementById("status").innerText = "📡 Activation GPS...";

  if (!navigator.geolocation) {
    alert("GPS non supporté");
    return;
  }

  navigator.geolocation.watchPosition(
    (position) => {

      const lat = position.coords.latitude;
      const lon = position.coords.longitude;

      console.log("Position:", lat, lon);

      checkCheckpoint(lat, lon);
    },

    (error) => {
      console.error(error);

      document.getElementById("status").innerText =
        "❌ GPS refusé ou indisponible";
    },

    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    }
  );
}

/* =========================
   DEBUG
========================= */

window.addEventListener("load", () => {
  console.log("main.js chargé");
});
