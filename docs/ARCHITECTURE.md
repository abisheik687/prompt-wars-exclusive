# Architecture

```text
React + Vite browser app
  ├─ deterministic budget, CSV, and task graph logic (src/core.js)
  ├─ browser-local event data for no-cloud demos
  └─ same-origin JSON API (server/index.js)
       ├─ Firebase client sign-in (@firebase/auth)
       ├─ verified Firebase ID token middleware (Firebase Admin)
       ├─ owner-scoped event repository (server/event-store.js)
       ├─ Gemini via @google/genai on Vertex AI (ADC; optional)
       └─ Firestore server client (ADC; optional)
```

The browser owns interactions; deterministic money, CSV, date, and dependency rules live in `src/core.js`. Local mode stores event data in browser localStorage and intentionally has no account isolation. When Firestore is enabled, the API requires a Firebase ID token verified by Firebase Admin with revocation checking. It derives the UID from that token, stores it as `ownerId`, and scopes list/read/update/delete and AI plan/copilot reads to that owner. Budgets, expenses, tasks, vendors, guests, and schedule entries are nested in that event document and inherit its ownership boundary. Server Firestore access uses ADC and IAM; client code has no Firestore SDK or privileged credential. Cloud Run serves the Vite build and API from one origin; a small public config endpoint supplies only Firebase Web App public values at runtime.

Vertex AI requests use a structured response schema, bounded output, a 25-second timeout, and schema validation; any absent credentials, quota/service error, invalid response, or timeout returns a labeled deterministic fallback. There are no automatic retries. `/api/health` reports configured source mode and `/api/ready` checks configuration only; neither proves a live service call. Cloud Scheduler and reminder delivery are not implemented.
