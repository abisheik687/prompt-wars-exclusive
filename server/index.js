import express from "express";
import helmet from "helmet";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAiService,
  aiContext,
  localAnswer,
  makeFallbackPlan,
  planSchema,
  validateEvent,
  validAnswer,
  validPlan,
} from "./core.js";
import { createAuthenticator } from "./auth.js";
import { deleteOwnedEvent, getOwnedEvent, listOwnedEvents, saveOwnedEvent } from "./event-store.js";

const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://www.googleapis.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const config = {
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || "global",
  model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  useFirestore: process.env.USE_FIRESTORE === "true",
  collection: process.env.FIRESTORE_COLLECTION || "festivoEvents",
};
const authEnabled = process.env.AUTH_REQUIRED === "true" || config.useFirestore;
if (process.env.AUTH_REQUIRED === "true" && !config.useFirestore)
  throw new Error("AUTH_REQUIRED=true requires USE_FIRESTORE=true so event ownership can be verified.");
const ai = createAiService(config);
let firestore;
const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
async function db() {
  if (!config.useFirestore) return null;
  if (!firestore) {
    const { Firestore } = await import("@google-cloud/firestore");
    firestore = new Firestore({ projectId: config.project });
  }
  return firestore;
}
async function verifyIdToken(token) {
  const { getApps, initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId: config.project });
  return getAuth(app).verifyIdToken(token, true);
}
const authenticate = createAuthenticator({ enabled: authEnabled, verifyToken: verifyIdToken });
const rate = new Map();
let rateChecks = 0;
function limited(req, res, next) {
  const now = Date.now(),
    ip = req.ip;
  if (++rateChecks % 128 === 0) {
    for (const [key, times] of rate)
      if (!times.some((time) => now - time < 60000)) rate.delete(key);
    while (rate.size > 10000) rate.delete(rate.keys().next().value);
  }
  const key = req.user?.uid || ip;
  const hits = (rate.get(key) || []).filter((t) => now - t < 60000);
  if (hits.length >= 12)
    return res.status(429).json({ error: "Please wait before trying again." });
  hits.push(now);
  rate.set(key, hits);
  next();
}
app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    aiConfigured: Boolean(config.project),
    persistence: config.useFirestore ? "firestore" : "browser-demo",
    authRequired: authEnabled,
  }),
);
app.get("/api/ready", (req, res) => {
  const firebaseClientConfigured = Boolean(process.env.FIREBASE_WEB_API_KEY && process.env.FIREBASE_AUTH_DOMAIN && process.env.FIREBASE_APP_ID);
  const ready = !config.useFirestore || Boolean(config.project && firebaseClientConfigured);
  res.status(ready ? 200 : 503).json({ ready, integrations: {
    firestoreConfigured: config.useFirestore && Boolean(config.project),
    vertexConfigured: Boolean(config.project),
    firebaseClientConfigured,
    authRequired: authEnabled,
  } });
});
app.get("/api/client-config", (req, res) => res.json({
  apiKey: process.env.FIREBASE_WEB_API_KEY || "",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
  projectId: config.project || "",
  appId: process.env.FIREBASE_APP_ID || "",
}));
app.get("/api/events", authenticate, async (req, res) => {
  if (!config.useFirestore) return res.status(404).json({ error: "Cloud persistence is not configured." });
  try {
    return res.json(await listOwnedEvents(await db(), config.collection, req.user.uid));
  } catch (e) {
    console.error("Firestore list failed", { name: e?.name || "Error" });
    return res.status(503).json({ error: "Cloud persistence is unavailable." });
  }
});
app.put("/api/events/:id", authenticate, async (req, res) => {
  if (req.params.id !== req.body?.id)
    return res.status(400).json({ error: "Event ID does not match request." });
  const error = validateEvent(req.body);
  if (error) return res.status(400).json({ error });
  if (!config.useFirestore)
    return res.json({ saved: false, mode: "browser-demo" });
  try {
    const store = await db();
    const saved = await saveOwnedEvent(store, config.collection, req.body, req.user.uid);
    if (!saved) return res.status(404).json({ error: "Event not found." });
    return res.json({ saved: true, mode: "firestore" });
  } catch (e) {
    console.error("Firestore save failed", { name: e?.name || "Error" });
    return res.status(503).json({
      error:
        "Cloud persistence is unavailable. Your browser copy remains available.",
    });
  }
});
app.get("/api/events/:id", authenticate, async (req, res) => {
  if (!/^[\w-]{8,80}$/.test(req.params.id))
    return res.status(400).json({ error: "Invalid event ID." });
  if (!config.useFirestore)
    return res
      .status(404)
      .json({ error: "Cloud persistence is not configured." });
  try {
    const event = await getOwnedEvent(await db(), config.collection, req.params.id, req.user.uid);
    return event
      ? res.json(event)
      : res.status(404).json({ error: "Event not found." });
  } catch (e) {
    console.error("Firestore read failed", { name: e?.name || "Error" });
    return res.status(503).json({ error: "Cloud persistence is unavailable." });
  }
});
app.delete("/api/events/:id", authenticate, async (req, res) => {
  if (!/^[\w-]{8,80}$/.test(req.params.id))
    return res.status(400).json({ error: "Invalid event ID." });
  if (!config.useFirestore)
    return res.json({ deleted: false, mode: "browser-demo" });
  try {
    const store = await db();
    const deleted = await deleteOwnedEvent(store, config.collection, req.params.id, req.user.uid);
    if (!deleted) return res.status(404).json({ error: "Event not found." });
    return res.json({ deleted: true });
  } catch (e) {
    console.error("Firestore delete failed", { name: e?.name || "Error" });
    return res.status(503).json({ error: "Cloud persistence is unavailable." });
  }
});
app.post("/api/plan", authenticate, limited, async (req, res) => {
  const event = authEnabled ? await ownedEvent(req.body?.eventId, req.user.uid, res) : req.body;
  if (!event) return;
  const error = validateEvent(event);
  if (error) return res.status(400).json({ error });
  const result = await ai.generate(
    JSON.stringify(aiContext(event)),
    planSchema,
  );
  if (result && validPlan(result))
    return res.json({ mode: "vertex", plan: result });
  return res.json({ mode: "demo", plan: makeFallbackPlan(event) });
});
app.post("/api/copilot", authenticate, limited, async (req, res) => {
  const e = authEnabled ? await ownedEvent(req.body?.eventId, req.user.uid, res) : req.body?.event,
    q = req.body?.question;
  if (!e) return;
  if (
    validateEvent(e) ||
    typeof q !== "string" ||
    q.length < 1 ||
    q.length > 1200
  )
    return res.status(400).json({
      error: "Provide a valid event and a question up to 1,200 characters.",
    });
  const result = await ai.generate(
    JSON.stringify(aiContext(e, q)),
    {
      type: "OBJECT",
      properties: { answer: { type: "STRING" } },
      required: ["answer"],
    },
  );
  if (
    result && validAnswer(result.answer)
  )
    return res.json({ mode: "vertex", answer: result.answer });
  return res.json({ mode: "demo", answer: localAnswer(e, q) });
});
async function ownedEvent(id, uid, res) {
  if (!config.useFirestore || typeof id !== "string" || !/^[\w-]{8,80}$/.test(id)) {
    res.status(404).json({ error: "Event not found." }); return null;
  }
  try {
    const event = await getOwnedEvent(await db(), config.collection, id, uid);
    if (!event) { res.status(404).json({ error: "Event not found." }); return null; }
    return event;
  } catch (e) {
    console.error("Firestore event lookup failed", { name: e?.name || "Error" });
    res.status(503).json({ error: "Cloud persistence is unavailable." }); return null;
  }
}
app.use(express.static(distDir));
app.get(/^(?!\/api\/).*/, (req, res) =>
  res.sendFile(join(distDir, "index.html")),
);
app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large")
    return res.status(413).json({ error: "Request is too large." });
  if (err instanceof SyntaxError)
    return res.status(400).json({ error: "Request body must be valid JSON." });
  console.error("Request failed", { name: err?.name || "Error" });
  res.status(500).json({ error: "Unexpected server error." });
});
const port = Number(process.env.PORT) || 8080;
const server = app.listen(port, "0.0.0.0", () =>
  console.log(
    JSON.stringify({
      event: "server_started",
      port,
      persistence: config.useFirestore ? "firestore" : "browser-demo",
      vertex: Boolean(config.project),
      authRequired: authEnabled,
    }),
  ),
);
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
let closing = false;
for (const sig of ["SIGTERM", "SIGINT"])
  process.on(sig, () => {
    if (closing) return;
    closing = true;
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
