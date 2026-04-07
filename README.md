# MISSION AR — Jeu de piste GPS

## Structure des fichiers

```
├── index.html    ← Page principale
├── style.css     ← Styles (thème terminal de mission)
├── main.js       ← Logique GPS + AR + étapes
└── README.md     ← Ce fichier
```

---

## 🔧 Configuration rapide

### 1. Définir tes étapes GPS

Ouvre `main.js` et modifie le tableau `STEPS` en haut du fichier :

```javascript
const STEPS = [
  {
    id: 1,
    label: "01 / 04",
    description: "Trouvez la fontaine dans le parc",
    lat: 48.8566,   // ← Ta latitude réelle (ex: récupérée sur Google Maps)
    lng: 2.3522,    // ← Ta longitude réelle
    radius: 20,     // Distance en mètres pour valider (15-25m recommandé)
    color: "#00e5ff",
    clue: "Bravo ! Direction le musée...",
    arLabel: "CIBLE 01"
  },
  // ... autres étapes
];
```

Pour récupérer des coordonnées GPS : clic droit sur Google Maps → "C'est ici".

### 2. Modifier le message final

```javascript
const FINAL_MESSAGE = "🏆 MISSION ACCOMPLIE ! Le code secret est : ...";
```

### 3. Adapter le nombre d'étapes

Le jeu supporte autant d'étapes que tu veux. Ajoute des objets dans `STEPS` et met à jour les `.step-dot` dans le HTML si tu veux plus de 4 indicateurs visuels.

---

## 🚀 Déploiement

> **Important :** AR.js nécessite HTTPS et l'accès à la caméra. Il ne fonctionne **pas** en ouvrant le fichier directement (`file://`).

### Option A — Hébergement gratuit rapide
- [Netlify Drop](https://app.netlify.com/drop) : glisse-dépose le dossier
- [Vercel](https://vercel.com) : `vercel --prod`
- [GitHub Pages](https://pages.github.com) : push + activer Pages

### Option B — Serveur local HTTPS (test)
```bash
# Avec Python + mkcert
mkcert localhost
python3 -m http.server 8443 --certfile=localhost.pem --keyfile=localhost-key.pem
```

---

## 📱 Utilisation sur mobile

1. Ouvre l'URL en HTTPS sur smartphone
2. Autorise la **caméra** et la **géolocalisation**
3. Clique sur **INITIALISER GPS**
4. Suis les indications HUD pour trouver chaque cible
5. Quand tu es à moins de `radius` mètres, la validation est automatique

---

## 🐛 Debug / Test sans se déplacer

Dans `main.js`, décommente la section debug en bas du fichier :

```javascript
debugSimulatePosition(48.8566, 2.3522);
```

---

## ⚙️ Paramètres avancés

| Paramètre | Défaut | Description |
|-----------|--------|-------------|
| `radius`  | `20`   | Mètres pour valider une étape |
| `dur` rotation AR | `3000ms` | Vitesse de rotation de la cible |
| Précision GPS | `enableHighAccuracy: true` | Meilleure précision, plus de batterie |

---

## 🔑 Dépendances

- [A-Frame](https://aframe.io) 1.4.1 — moteur 3D WebXR
- [AR.js](https://ar-js-org.github.io/AR.js-Docs/) — AR basé caméra + GPS
- [Google Fonts](https://fonts.google.com) — Share Tech Mono + Rajdhani
