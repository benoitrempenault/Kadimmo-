# Plan d'implémentation — Formation v2, Phase 1 : contenu enrichi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir les 6 fiches du module Formation et porter la banque de quiz de 35 à 60-70 questions, à partir des 12 documents Century 21 sources.

**Architecture:** Tout le travail se fait dans l'unique fichier `C:\Kadimmo\index.html` (963 lignes). Les fiches sont du HTML statique (accents autorisés) dans `#f-fiches` ; le quiz est un tableau JS `allQ` dans le `<script>` (accents INTERDITS — tout non-ASCII en `\uXXXX`). Deux scripts utilitaires Node jetables assurent l'encodage et la vérification.

**Tech Stack:** HTML/CSS/JS vanilla, Node 24 (scripts utilitaires uniquement, jamais déployés), PowerShell (extraction .docx/.pptx).

**Spec:** `docs/superpowers/specs/2026-07-06-formation-v2-design.md`

**Répertoire de travail :** `C:\Kadimmo` (repo git cloné). Les extraits des documents sources vont dans le scratchpad de session, **jamais** dans le repo (repo public — ne pas y committer les documents internes C21).

---

## Structures existantes à respecter

### Fiche (HTML, accents OK)

```html
<div class="fiche" id="mod-<theme>">
  <div class="fh"><div class="ft">Titre</div><div class="fs">Sous-titre</div></div>
  <div class="cc"><h3>Titre de section</h3>
    <div class="kp">Point clé</div>                          <!-- kp kps = vert, kp kpw = orange -->
    <ol class="slist"><li>Étape…</li></ol>                    <!-- liste numérotée -->
    <ul class="blist"><li>Puce…</li></ul>                     <!-- liste à puces -->
    <div class="tags"><span class="tag tagh">X</span></div>   <!-- badges -->
  </div>
</div>
```

Thèmes : `prospection`, `r1`, `mandat`, `acquereur`, `r2`, `bilan`.

### Question de quiz (JS, non-ASCII en \uXXXX)

```js
{q:"Question ?",o:["opt1","opt2","opt3","opt4"],a:1,e:"Explication.",l:'d',t:'r1'},
```

`a` = index (0-3) de la bonne réponse ; `l` = `'d'`(débutant)/`'i'`(intermédiaire)/`'a'`(avancé) ; `t` = un des 6 thèmes.

### Mapping documents sources → thèmes

| Document | Thème(s) |
|---|---|
| Process Prospection..docx | prospection |
| Crémaillère.docx | prospection (farming/crémaillère) |
| Taches.docx | prospection (organisation) |
| Process R1.docx | r1 |
| ACM.docx | r1 |
| MAILS TYPES après RDV.docx | r1 (mail post-R1), r2 |
| Mandat confiance.docx | mandat |
| Découvert ACQ, visite et offre.docx | acquereur |
| Close et R2.docx | r2 |
| Technique de négociation.pptx | r2 |
| Bilan de promotion.docx | bilan |
| application du conseiller.docx | transversal (CenturyNet/outils, à répartir) |

---

### Task 1 : Extraire le texte des 12 documents sources

**Files:**
- Create: `<scratchpad>\extract-docs.ps1`
- Output: `<scratchpad>\extraits\*.txt` (un par document)

- [ ] **Step 1 : Écrire le script d'extraction**

```powershell
# extract-docs.ps1 — extrait le texte brut des .docx/.pptx
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = "C:\Users\Utilisateur\KADIMA-TB\Kadima - General\MODELES\FORMATION"
$out = Join-Path $PSScriptRoot "extraits"
New-Item -ItemType Directory -Force $out | Out-Null

function Extract-Xml([string]$zipPath, [string]$pattern) {
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  $text = ""
  foreach ($entry in $zip.Entries | Where-Object { $_.FullName -match $pattern } | Sort-Object FullName) {
    $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
    $xml = $reader.ReadToEnd(); $reader.Close()
    # fin de paragraphe -> saut de ligne, puis on retire les balises
    $xml = $xml -replace '</w:p>', "`n" -replace '</a:p>', "`n"
    $text += ($xml -replace '<[^>]+>', '') + "`n"
  }
  $zip.Dispose()
  return [System.Net.WebUtility]::HtmlDecode($text)
}

Get-ChildItem $src -File | Where-Object { $_.Extension -in '.docx', '.pptx' } | ForEach-Object {
  $pattern = if ($_.Extension -eq '.docx') { 'word/document\.xml$' } else { 'ppt/slides/slide\d+\.xml$' }
  $txt = Extract-Xml $_.FullName $pattern
  $dest = Join-Path $out ($_.BaseName + '.txt')
  [System.IO.File]::WriteAllText($dest, $txt, [System.Text.UTF8Encoding]::new($false))
  Write-Host "$($_.Name) -> $([math]::Round($txt.Length/1000))k chars"
}
```

- [ ] **Step 2 : Lancer et vérifier**

Run: `powershell -File <scratchpad>\extract-docs.ps1`
Expected: 12 lignes `Nom.docx -> Nk chars`, aucune à 0k. Ouvrir 2-3 extraits et vérifier que le texte français est lisible (pas de mojibake).

### Task 2 : Scripts utilitaires encodage + vérification

**Files:**
- Create: `<scratchpad>\encode.js`
- Create: `<scratchpad>\check.js`

- [ ] **Step 1 : Écrire `encode.js`** (convertit tout non-ASCII d'un fichier en `\uXXXX` — à utiliser sur les blocs de questions avant insertion)

```js
// usage: node encode.js fichier.txt  -> écrit fichier.txt.encoded
const fs = require('fs');
const p = process.argv[2];
const s = fs.readFileSync(p, 'utf8');
const out = s.replace(/[-￿]/g, c =>
  '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
fs.writeFileSync(p + '.encoded', out);
console.log('OK ->', p + '.encoded');
```

- [ ] **Step 2 : Écrire `check.js`** (le « test » du projet : ASCII pur dans les scripts, syntaxe JS valide, comptage de la banque)

```js
// usage: node check.js C:\Kadimmo\index.html
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
let fail = 0;

// 1. Aucun caractère non-ASCII dans les blocs <script>
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((s, i) => {
  const bad = s.match(/[-￿]/g);
  if (bad) { fail++; console.log(`FAIL script#${i}: ${bad.length} caractere(s) non-ASCII, ex: ${[...new Set(bad)].slice(0,5).join(' ')}`); }
});

// 2. Syntaxe JS valide (le script utilise le DOM : on vérifie le parsing seulement)
try { new Function(scripts.join('\n')); console.log('OK syntaxe JS'); }
catch (e) { fail++; console.log('FAIL syntaxe JS:', e.message); }

// 3. Banque de quiz : total et répartition
const m = html.match(/var allQ=\[([\s\S]*?)\n\];/);
if (!m) { fail++; console.log('FAIL: allQ introuvable'); }
else {
  const qs = m[1].match(/\{q:/g) || [];
  const count = (re) => (m[1].match(re) || []).length;
  console.log(`Total questions: ${qs.length}`);
  console.log(`  Niveaux  d:${count(/l:'d'/g)} i:${count(/l:'i'/g)} a:${count(/l:'a'/g)}`);
  ['prospection','r1','mandat','acquereur','r2','bilan'].forEach(t =>
    console.log(`  ${t}: ${count(new RegExp("t:'" + t + "'", 'g'))}`));
  if (qs.length < 60) { fail++; console.log('FAIL: moins de 60 questions'); }
}
process.exit(fail ? 1 : 0);
```

- [ ] **Step 3 : Vérifier l'état initial (le check « échoue » sur le comptage, passe sur le reste)**

Run: `node <scratchpad>\check.js C:\Kadimmo\index.html`
Expected: `OK syntaxe JS`, 0 non-ASCII, `Total questions: 35`, `FAIL: moins de 60 questions`, exit 1. C'est notre ligne de base.

### Tasks 3 à 8 : Enrichir les 6 fiches (une task par fiche)

Ordre et sources :

| Task | Fiche (`id`) | Extraits sources |
|---|---|---|
| 3 | `mod-prospection` | Process Prospection, Crémaillère, Taches |
| 4 | `mod-r1` | Process R1, ACM, MAILS TYPES après RDV |
| 5 | `mod-mandat` | Mandat confiance |
| 6 | `mod-acquereur` | Découvert ACQ, visite et offre |
| 7 | `mod-r2` | Close et R2, Technique de négociation, MAILS TYPES après RDV |
| 8 | `mod-bilan` | Bilan de promotion |

Chaque task suit exactement les mêmes steps :

- [ ] **Step 1 : Lire les extraits sources de la fiche** (fichiers `<scratchpad>\extraits\*.txt` de la ligne du tableau) et lister les notions absentes ou trop maigres dans la fiche actuelle.

- [ ] **Step 2 : Enrichir le HTML de la fiche** dans `C:\Kadimmo\index.html` (bloc `<div class="fiche" id="mod-…">`) :
  - Compléter les sections `.cc` existantes et en ajouter de nouvelles (`<div class="cc"><h3>…</h3>…</div>`) selon la structure documentée en tête de plan.
  - **Fidélité stricte aux documents** : ne rien inventer ; chiffres, sigles, scripts de dialogue et étapes repris tels quels. En cas de contradiction entre un doc et la fiche actuelle, le doc fait foi.
  - Accents normaux autorisés (HTML statique). Échapper `&` en `&amp;` et `<` en `&lt;`.
  - Viser une fiche complète mais scannable : sections courtes, listes plutôt que paragraphes, points clés en `.kp`.
  - Ne PAS toucher aux blocs `<script>` dans cette task.

- [ ] **Step 3 : Vérifier**

Run: `node <scratchpad>\check.js C:\Kadimmo\index.html`
Expected: `OK syntaxe JS`, 0 non-ASCII dans les scripts (la fiche est hors script), total encore 35.
Puis contrôle visuel : ouvrir la page (Task 10, Step 1 décrit le serveur local) ou vérifier au minimum que le HTML est équilibré : `node -e "const h=require('fs').readFileSync('C:/Kadimmo/index.html','utf8');console.log((h.match(/<div/g)||[]).length,(h.match(/<\/div>/g)||[]).length)"` — les deux nombres doivent être égaux.

- [ ] **Step 4 : Commit**

```bash
cd /c/Kadimmo && git add index.html && git commit -m "Formation: enrichit la fiche <nom> depuis les docs C21"
```

### Task 9 : Étendre la banque de quiz à 60-70 questions

**Files:**
- Modify: `C:\Kadimmo\index.html` (tableau `var allQ=[…]`)
- Working: `<scratchpad>\nouvelles-questions.js`

- [ ] **Step 1 : Rédiger ~30 nouvelles questions** dans `<scratchpad>\nouvelles-questions.js`, en français normal (accents), même format `{q,o,a,e,l,t}`. Contraintes :
  - Dérivées des extraits uniquement (pas de culture générale immobilière inventée).
  - Ne pas dupliquer les 35 existantes (les relire avant).
  - Répartition cible par thème après ajout : chaque thème ≥ 9 questions.
  - Répartition cible par niveau après ajout : `d` ≥ 18, `i` ≥ 20, `a` ≥ 18 (total 60-70).
  - 4 options par question, distracteurs plausibles, explication `e` qui cite la règle du doc.

- [ ] **Step 2 : Encoder en \uXXXX**

Run: `node <scratchpad>\encode.js <scratchpad>\nouvelles-questions.js`
Expected: `OK -> …\nouvelles-questions.js.encoded`. Vérifier par lecture qu'il ne reste aucun accent.

- [ ] **Step 3 : Insérer** le contenu de `.encoded` dans `index.html`, juste avant la ligne `];` qui ferme `var allQ`.

- [ ] **Step 4 : Vérifier**

Run: `node <scratchpad>\check.js C:\Kadimmo\index.html`
Expected: `OK syntaxe JS`, 0 non-ASCII, `Total questions:` entre 60 et 70, répartitions conformes au Step 1, exit 0.

- [ ] **Step 5 : Commit**

```bash
cd /c/Kadimmo && git add index.html && git commit -m "Formation: banque de quiz etendue a N questions (3 niveaux x 6 themes)"
```

### Task 10 : Vérification fonctionnelle complète

- [ ] **Step 1 : Servir la page en local et la tester dans le navigateur**

Run: `cd /c/Kadimmo && npx --yes serve -l 8321 .` (ou l'outil de preview de la session)
Vérifier dans le navigateur :
  - Onglet Formation → les 6 fiches s'affichent, nouvelles sections visibles, aucune faute d'encodage (é, à, œ…).
  - Quiz : lancer un quiz par niveau et par thème ; les nouvelles questions apparaissent, la correction et le score fonctionnent.
  - Console navigateur : zéro erreur JS.
  - Onglet Documents vendeur : inchangé et fonctionnel (année, type de bien, progression, panneau email).

- [ ] **Step 2 : Revue du diff complet**

Run: `cd /c/Kadimmo && git diff ee1f9cb..HEAD --stat` puis relire `git log --oneline`.
Expected: seuls `index.html` et `docs/superpowers/**` ont changé.

- [ ] **Step 3 : Livraison**

Tenter `cd /c/Kadimmo && git push`. Si l'authentification GitHub échoue : indiquer à Benoît d'uploader `C:\Kadimmo\index.html` via GitHub web (workflow habituel : Add file → Upload files → Commit → attendre 2 min → vider le cache Safari).
