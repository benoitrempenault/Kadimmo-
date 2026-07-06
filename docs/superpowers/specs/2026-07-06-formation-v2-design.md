# Spec — Module Formation v2 : contenu enrichi + entraînement vocal IA

**Date** : 6 juillet 2026
**Projet** : Kadimmo — https://benoitrempenault.github.io/Kadimmo-/
**Statut** : validé par Benoît le 6 juillet 2026

## Objectif

Deux évolutions du module Formation, livrées en deux phases indépendantes :

1. **Phase 1 — Contenu enrichi** : mettre à jour les 6 fiches et étendre la banque de quiz à partir des 12 documents de formation Century 21 internes.
2. **Phase 2 — Entraînement vocal IA** : un nouveau sous-onglet où le conseiller s'entraîne à l'oral face à une IA qui joue un client vendeur, avec débriefing final noté.

## Sources de contenu

Documents dans `C:\Users\Utilisateur\KADIMA-TB\Kadima - General\MODELES\FORMATION\` :
ACM.docx, application du conseiller.docx, Bilan de promotion.docx, Close et R2.docx, Crémaillère.docx, Découvert ACQ visite et offre.docx, MAILS TYPES après RDV.docx, Mandat confiance.docx, Process Prospection.docx, Process R1.docx, Taches.docx, Technique de négociation.pptx.

Ces documents sont la référence méthodologique (méthode Century 21 interne). Le contenu produit (fiches, questions de quiz, prompts des scénarios, grille de débriefing) doit en être fidèlement dérivé, sans invention.

## Phase 1 — Contenu enrichi

### Fiches

Les 6 fiches existantes (Prospection, R1, Mandat confiance, Découverte acquéreur, R2 & Close, Bilan de promotion) sont enrichies avec le contenu extrait des documents. Structure HTML et style existants conservés (accordéons/sections du sous-onglet Fiches).

### Quiz

- Banque portée de 35 à environ 60-70 questions.
- Mêmes mécaniques : 3 niveaux (Débutant / Intermédiaire / Avancé) × 6 thèmes filtrables, mélange aléatoire, correction immédiate avec explication, score final.
- Les nouvelles questions sont dérivées des documents sources.

### Livrable Phase 1

Un `index.html` mis à jour, que Benoît uploade sur GitHub via l'interface web (workflow habituel). Aucun serveur requis.

## Phase 2 — Entraînement vocal IA

### Interface (frontend, dans index.html)

- Nouveau sous-onglet **« Entraînement »** dans le module Formation, à côté de Fiches et Quiz (même composant `.ftabs`).
- Écran de configuration de session :
  - **Scénario** : Début de R1 / R2 (avis de valeur + objections) / Close (signature du mandat). Architecture extensible pour en ajouter d'autres.
  - **Difficulté** : client facile / réticent / difficile.
  - **Profil client** : tiré au sort ou choisi — profil SONCAS + contexte de vente (succession, divorce, mutation…).
- Écran de conversation :
  - Bouton micro → reconnaissance vocale navigateur (`webkitSpeechRecognition`, fr-FR) → le texte du conseiller s'affiche dans le fil.
  - Réponse de l'IA affichée dans le fil **et** lue à voix haute (`speechSynthesis`, fr-FR).
  - Champ texte toujours visible en secours (micro indisponible ou refusé).
  - Bouton « Terminer la session » → déclenche le débriefing.
- Débriefing : l'IA sort de son rôle et évalue le conseiller — note globale, 3 points forts, 3 points à travailler, citations des moments clés de la conversation. Grille d'évaluation fondée sur la méthode C21 (CARE, SONCAS, ACM, 5 familles d'objections, entonnoir du close).

### Backend (nouveau service Render)

- Service Node.js/Express **dédié** (séparé du projet Comparaison), plan gratuit Render.
- Routes :
  - `POST /api/roleplay` — reçoit `{scenario, difficulte, profil, messages[]}`, appelle l'API Claude avec le prompt système du scénario, renvoie la réplique du client.
  - `POST /api/debrief` — reçoit la conversation complète, renvoie l'évaluation structurée.
- Clé API Claude en variable d'environnement Render (`ANTHROPIC_API_KEY`). Jamais côté client.
- CORS restreint à `https://benoitrempenault.github.io`.
- Les prompts système (personnages, méthode C21, grille d'évaluation) vivent dans le code du serveur — ce qui respecte aussi la contrainte \uXXXX du frontend (pas de gros texte français accentué dans le `<script>` de la page).

### Gestion des erreurs

- Serveur endormi (plan Render gratuit, ~15 min d'inactivité) : première réponse en 30-50 s → message d'attente « Le client arrive… » + ping de réveil dès l'ouverture du sous-onglet Entraînement.
- Micro refusé ou `webkitSpeechRecognition` indisponible : repli automatique sur le champ texte, sans blocage.
- Erreur API / réseau : message clair dans le fil + bouton réessayer ; la conversation en cours n'est pas perdue (état en mémoire JS).

### Contraintes techniques rappelées

- HTML/CSS/JS vanilla, zéro dépendance frontend, un seul fichier `index.html`.
- Tous les caractères non-ASCII dans les blocs `<script>` encodés en `\uXXXX` (compatibilité Safari/iOS). Le HTML statique peut rester accentué.
- Cible principale : Safari iPhone/iPad + Chrome desktop.

## Hors périmètre (volontairement)

- Comptes utilisateurs, historique des sessions sauvegardé.
- Voix IA premium (type ElevenLabs), quiz vocal.
- Sauvegarde d'état de la checklist Documents vendeur (amélioration connue, traitée séparément plus tard).

## Critères de réussite

- Phase 1 : les fiches reflètent les documents sources ; le quiz propose ~60-70 questions correctes avec explications ; rien d'autre ne casse dans la page.
- Phase 2 : une session complète (config → conversation vocale → débriefing) fonctionne sur Safari iPhone et Chrome desktop ; la clé API n'apparaît nulle part côté client ; un tiers ne peut pas utiliser le backend depuis un autre site.
