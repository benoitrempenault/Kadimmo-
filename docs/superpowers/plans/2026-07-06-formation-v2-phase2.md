# Plan d'implémentation — Formation v2, Phase 2 : entraînement vocal IA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sous-onglet « Entraînement » dans le module Formation : jeu de rôle vocal conseiller ↔ IA (qui joue le vendeur), avec débriefing noté, adossé à un backend Node/Express sur Render qui garde la clé API Claude.

**Architecture:** Le backend vit dans `server/` du même repo (Render : root directory = `server`). Deux routes JSON : `POST /api/roleplay` (la réplique du client joué par Claude) et `POST /api/debrief` (l'évaluation), plus `GET /healthz` (ping de réveil). Les prompts système — personnages, méthode C21 extraite des 12 documents, grille d'évaluation — vivent côté serveur dans `prompts.js`, ce qui préserve la contrainte \uXXXX du frontend. Le frontend (dans `index.html`) gère micro (`webkitSpeechRecognition` fr-FR), synthèse vocale (`speechSynthesis`), repli clavier, état de conversation en mémoire JS.

**Tech Stack:** Node 20+, Express, `@anthropic-ai/sdk`, modèle `claude-opus-4-8` (pas de `temperature` — retiré sur ce modèle ; `output_config.effort` : `low` pour les répliques courtes et rapides, `high` pour le débriefing). Clé en env var `ANTHROPIC_API_KEY`. CORS restreint à `https://benoitrempenault.github.io` + localhost (dev).

**Spec:** `docs/superpowers/specs/2026-07-06-formation-v2-design.md`

---

### Task 12 : Backend

**Files:** Create `server/package.json`, `server/prompts.js`, `server/server.js`, `server/.gitignore`

- [ ] `package.json` : deps `express`, `cors`, `@anthropic-ai/sdk` ; `"start": "node server.js"` ; `"type": "commonjs"`.
- [ ] `prompts.js` : exporte `buildRoleplaySystem(scenario, difficulte, profil)` et `buildDebriefSystem(scenario)`. Contenu dérivé fidèlement des documents C21 : scénarios `r1` / `r2` / `close`, difficultés `facile` / `reticent` / `difficile`, profils SONCAS + contextes de vente. Grille de débriefing : CARE, SONCAS, Passé/Présent/Futur (R1) ; entonnoir, 5 familles d'objections, pré-closes (R2/close). Sortie débriefing en JSON strict (note /20, 3 points forts, 3 axes, moments clés cités).
- [ ] `server.js` :
  - CORS : origines `https://benoitrempenault.github.io`, `http://localhost:8321` ; JSON body limit 1 Mo.
  - `GET /healthz` → `{ok:true}` (réveil Render).
  - `POST /api/roleplay` : `{scenario, difficulte, profil, messages:[{role,content}]}` → validation (scenario/difficulte connus, messages ≤ 60, contenu ≤ 2000 chars chacun) → `client.messages.create` modèle `claude-opus-4-8`, system = prompt du scénario, `max_tokens: 1024`, `output_config:{effort:'low'}` → renvoie `{reply}`.
  - `POST /api/debrief` : même payload → system = grille d'évaluation, `output_config:{effort:'high'}`, `max_tokens: 4000`, format JSON via instruction système + parse robuste → renvoie `{debrief}`.
  - Erreurs typées (`RateLimitError`, `APIError`…) → messages français clairs + status appropriés.
- [ ] Vérification : `node --check server.js` + `node --check prompts.js`.

### Task 13 : Test local backend

- [ ] `cd server && npm install`.
- [ ] Démarrer avec la clé locale (fichier `.env` non commité ou env var de session).
- [ ] `curl POST /api/roleplay` (scénario r1, message d'ouverture du conseiller) → réplique en français, dans le rôle.
- [ ] Conversation de 3-4 échanges puis `curl POST /api/debrief` → JSON valide avec note, points forts, axes.

### Task 14 : Frontend

**Files:** Modify `index.html`

- [ ] 3ᵉ bouton `.ftab` « Entraînement » + `showFTab` étendu.
- [ ] `#f-train` : écran config (boutons scénario / difficulté / profil aléatoire ou choisi) → écran conversation (fil de messages, bouton micro, champ texte de secours, bouton Terminer) → écran débriefing (note, points, bouton Nouvelle session). CSS aligné sur l'existant.
- [ ] JS : état `trainState` (scenario, difficulte, profil, messages[]), fetch vers `API_BASE` (const en tête de script, prod = `https://kadimmo-ia.onrender.com`, remplacée par localhost si `location.hostname` est local), `webkitSpeechRecognition` fr-FR (repli : masquer le micro si absent), `speechSynthesis` fr-FR, ping `/healthz` à l'ouverture de l'onglet + message « Le client arrive… » si première réponse lente. Tout texte JS en \uXXXX (workflow encode.js).
- [ ] Vérification : `check.js` (ASCII + syntaxe + 67 questions inchangées), divs équilibrés.

### Task 15 : Test bout en bout

- [ ] Backend local + page servie en preview : session complète en mode texte (config → 3 échanges → débriefing affiché).
- [ ] Console navigateur : zéro erreur. Modules Documents/Fiches/Quiz intacts.

### Task 16 : Livraison

- [ ] Commits + push GitHub (frontend + backend).
- [ ] Instructions Render pour Benoît : New Web Service → repo Kadimmo- → Root Directory `server` → Build `npm install` → Start `npm start` → env var `ANTHROPIC_API_KEY` → nom du service `kadimmo-ia` (pour que l'URL corresponde au frontend).
