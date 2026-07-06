// Backend Kadimmo IA — jeu de role vocal Century 21.
// La cle API Claude reste ici (env var ANTHROPIC_API_KEY), jamais cote navigateur.

const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const {
  buildRoleplaySystem,
  buildDebriefSystem,
  buildDrillSystem,
  buildHintSystem,
  DEBRIEF_SCHEMA,
  DRILL_SCHEMA,
  OBJECTIONS,
} = require("./prompts");

const app = express();
const client = new Anthropic();
const MODEL = "claude-opus-4-8";

const ALLOWED_ORIGINS = [
  "https://benoitrempenault.github.io",
  "http://localhost:8321",
  "http://127.0.0.1:8321",
];

app.use(
  cors({
    origin: (origin, cb) => {
      // Autorise aussi les requetes sans Origin (curl, healthchecks Render)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Origine non autorisee"));
    },
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (req, res) => {
  res.json({ ok: true, tts: !!process.env.ELEVENLABS_API_KEY });
});

// Valide et nettoie le payload commun aux deux routes.
function parsePayload(body) {
  const scenario = ["r1", "r2", "close", "acquereur"].includes(body.scenario) ? body.scenario : null;
  const difficulte = ["facile", "reticent", "difficile"].includes(body.difficulte)
    ? body.difficulte
    : null;
  if (!scenario || !difficulte) return { error: "Scenario ou difficulte invalide." };

  const raw = Array.isArray(body.messages) ? body.messages : [];
  if (raw.length === 0) return { error: "Conversation vide." };
  if (raw.length > 60) return { error: "Conversation trop longue (60 messages max)." };

  const messages = [];
  for (const m of raw) {
    const role = m && (m.role === "user" || m.role === "assistant") ? m.role : null;
    const content = m && typeof m.content === "string" ? m.content.trim() : "";
    if (!role || !content) return { error: "Message mal forme." };
    if (content.length > 2000) return { error: "Message trop long (2000 caracteres max)." };
    messages.push({ role, content });
  }
  if (messages[0].role !== "user") {
    // L'API exige que le premier message soit user : le conseiller ouvre toujours.
    messages.unshift({ role: "user", content: "(Le conseiller arrive au rendez-vous.)" });
  }

  const profil = body.profil && typeof body.profil === "object" ? body.profil : {};
  return { scenario, difficulte, profil, messages };
}

function sendApiError(res, err) {
  console.error(err && err.message ? err.message : err);
  if (err instanceof Anthropic.RateLimitError) {
    return res.status(429).json({ error: "Trop de sessions en meme temps. Reessayez dans une minute." });
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return res.status(500).json({ error: "Cle API invalide cote serveur. Prevenez l'administrateur." });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return res.status(502).json({ error: "Impossible de joindre l'IA. Verifiez la connexion et reessayez." });
  }
  if (err instanceof Anthropic.APIError) {
    return res.status(502).json({ error: "L'IA a renvoye une erreur. Reessayez." });
  }
  return res.status(500).json({ error: "Erreur inattendue du serveur. Reessayez." });
}

app.post("/api/roleplay", async (req, res) => {
  const p = parsePayload(req.body || {});
  if (p.error) return res.status(400).json({ error: p.error });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: buildRoleplaySystem(p.scenario, p.difficulte, p.profil),
      messages: p.messages,
    });
    if (response.stop_reason === "refusal") {
      return res.status(502).json({ error: "L'IA a refuse de repondre. Relancez une session." });
    }
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return res.status(502).json({ error: "Reponse vide de l'IA. Reessayez." });
    res.json({ reply: text });
  } catch (err) {
    sendApiError(res, err);
  }
});

app.post("/api/debrief", async (req, res) => {
  const p = parsePayload(req.body || {});
  if (p.error) return res.status(400).json({ error: p.error });

  const hints = Number.isInteger(req.body.hints) && req.body.hints > 0 ? Math.min(req.body.hints, 20) : 0;
  let system = buildDebriefSystem(p.scenario);
  if (hints > 0) {
    system +=
      "\n\nIMPORTANT : le conseiller a demandé " +
      hints +
      " indice(s) au formateur pendant la session. Retire " +
      hints +
      " point(s) de la note finale et mentionne-le dans le résumé.";
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: DEBRIEF_SCHEMA },
      },
      system: system,
      messages: p.messages.concat([
        {
          role: "user",
          content:
            "FIN DU JEU DE ROLE. Sors de ton role de formateur observateur et rends ton debriefing du conseiller au format demande.",
        },
      ]),
    });
    if (response.stop_reason === "refusal") {
      return res.status(502).json({ error: "L'IA a refuse d'evaluer. Reessayez." });
    }
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const debrief = JSON.parse(text);
    res.json({ debrief });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: "Debriefing illisible. Reessayez." });
    }
    sendApiError(res, err);
  }
});

// ===== Drill objections =====
app.get("/api/objections", (req, res) => {
  const pool = OBJECTIONS.slice().sort(() => Math.random() - 0.5);
  res.json({ objections: pool.slice(0, 5).map((o) => ({ text: o.text })) });
});

app.post("/api/drill", async (req, res) => {
  const b = req.body || {};
  const objection = typeof b.objection === "string" ? b.objection.trim().slice(0, 300) : "";
  const reponse = typeof b.reponse === "string" ? b.reponse.trim().slice(0, 2000) : "";
  if (!objection || !reponse) return res.status(400).json({ error: "Objection ou reponse manquante." });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: DRILL_SCHEMA },
      },
      system: buildDrillSystem(objection),
      messages: [{ role: "user", content: reponse }],
    });
    if (response.stop_reason === "refusal") {
      return res.status(502).json({ error: "L'IA a refuse d'evaluer. Passez a la suivante." });
    }
    const text = response.content
      .filter((x) => x.type === "text")
      .map((x) => x.text)
      .join("")
      .trim();
    const evalR = JSON.parse(text);
    evalR.score = Math.max(0, Math.min(4, evalR.score | 0));
    res.json({ eval: evalR });
  } catch (err) {
    if (err instanceof SyntaxError) return res.status(502).json({ error: "Evaluation illisible. Reessayez." });
    sendApiError(res, err);
  }
});

// ===== Indice du formateur =====
app.post("/api/hint", async (req, res) => {
  const p = parsePayload(req.body || {});
  if (p.error) return res.status(400).json({ error: p.error });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      output_config: { effort: "low" },
      system: buildHintSystem(p.scenario),
      messages: p.messages.concat([
        { role: "user", content: "INDICE DEMANDE : quelle est ma prochaine action selon la methode ?" },
      ]),
    });
    const text = response.content
      .filter((x) => x.type === "text")
      .map((x) => x.text)
      .join("")
      .trim();
    if (!text) return res.status(502).json({ error: "Pas d'indice disponible. Reessayez." });
    res.json({ hint: text });
  } catch (err) {
    sendApiError(res, err);
  }
});

// ===== Voix premium optionnelle (ElevenLabs, activee par ELEVENLABS_API_KEY) =====
app.post("/api/tts", async (req, res) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(404).json({ error: "Voix premium non configuree." });
  const text = req.body && typeof req.body.text === "string" ? req.body.text.trim().slice(0, 1000) : "";
  if (!text) return res.status(400).json({ error: "Texte manquant." });

  try {
    const voice = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
    const r = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + voice, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, model_id: "eleven_multilingual_v2" }),
    });
    if (!r.ok) {
      console.error("ElevenLabs " + r.status);
      return res.status(502).json({ error: "Voix premium indisponible." });
    }
    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    res.status(502).json({ error: "Voix premium indisponible." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Kadimmo IA demarre sur le port " + PORT);
});
