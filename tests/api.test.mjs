import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { after, before, test } from "node:test";

let serverProcess;
let baseUrl;

before(async () => {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ["server/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      GOOGLE_CLOUD_PROJECT: "",
      USE_FIRESTORE: "false",
      AUTH_REQUIRED: "false",
      FIREBASE_WEB_API_KEY: "",
      FIREBASE_AUTH_DOMAIN: "",
      FIREBASE_APP_ID: "",
    },
    stdio: "ignore",
  });

  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.equal(ready, true, "API server should start in local demo mode");
});

after(async () => {
  if (!serverProcess) return;
  const exited = once(serverProcess, "exit");
  serverProcess.kill();
  await exited;
});

const event = {
  id: "12345678-1234-1234-1234-123456789abc",
  name: "Garden birthday",
  type: "Birthday",
  date: "2027-05-10",
  city: "Pune",
  budget: 40000,
  currency: "INR",
  guests: 35,
  expenses: [],
  tasks: [],
  vendors: [],
  guestsList: [],
  schedule: [],
};

test("health reports explicit demo persistence and no Vertex project", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.deepEqual(await response.json(), {
    ok: true,
    aiConfigured: false,
    persistence: "browser-demo",
    authRequired: false,
  });
});

test("readiness and client configuration report configuration without claiming live verification", async () => {
  const ready = await fetch(`${baseUrl}/api/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { ready: true, integrations: { firestoreConfigured: false, vertexConfigured: false, authRequired: false, firebaseClientConfigured: false } });
  const config = await fetch(`${baseUrl}/api/client-config`);
  assert.deepEqual(await config.json(), { apiKey: "", authDomain: "", projectId: "", appId: "" });
});

test("event endpoint validates the record and labels browser-only persistence", async () => {
  const invalid = await fetch(`${baseUrl}/api/events/${event.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...event, budget: -1 }),
  });
  assert.equal(invalid.status, 400);

  const response = await fetch(`${baseUrl}/api/events/${event.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    saved: false,
    mode: "browser-demo",
  });
});

test("plan and copilot endpoints return labeled deterministic fallbacks", async () => {
  const planResponse = await fetch(`${baseUrl}/api/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  const plan = await planResponse.json();
  assert.equal(plan.mode, "demo");
  assert.match(plan.plan.overview, /35 guests/);

  const answerResponse = await fetch(`${baseUrl}/api/copilot`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, question: "What should I ask a caterer?" }),
  });
  const answer = await answerResponse.json();
  assert.equal(answer.mode, "demo");
  assert.match(answer.answer, /itemized price/i);
});
