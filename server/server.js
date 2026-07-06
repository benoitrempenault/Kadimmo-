// Backend Kadimmo IA — jeu de role vocal Century 21.
// La cle API Claude reste ici (env var ANTHROPIC_API_KEY), jamais cote navigateur.

const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const { buildRoleplaySystem, buildDebriefSystem, DEBRIEF_SCHEMA } = require("./prompts");

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
  res.json({ ok: true });
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

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: DEBRIEF_SCHEMA },
      },
      system: buildDebriefSystem(p.scenario),
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Kadimmo IA demarre sur le port " + PORT);
});
