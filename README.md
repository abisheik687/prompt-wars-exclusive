# Festivo AI — Challenge 5: Celebration & Event Planner

Festivo helps people plan weddings, birthdays, community events, and custom gatherings. This repository contains a working browser demo and an opt-in server integration for Gemini on Vertex AI, Firestore, and Cloud Run.

## What works

- Event setup with date, location, budget, currency, guest count, venue preference, theme, planning style, and optional access/dietary notes.
- Context-specific planning guide through Vertex AI when configured; clearly labeled deterministic guidance otherwise.
- Editable and addable budget categories, deterministic allocation reconciliation, estimates, committed and actual spending, remaining funds, and overspending indicators.
- Date-aware tasks with editable due dates, priorities, dependencies, blocked/overdue states, cycle prevention, and protected completed/custom tasks when event dates change.
- Vendor records with contact details, quote/cost/deposit/payment status, booking state, follow-up date, contract and comparison notes.
- Guest CRUD, RSVP and meal counts, optional notes, and CSV export with quoting and formula-injection protection.
- Firebase Authentication sign-in, server-verified Firebase ID tokens, and Firestore event ownership when cloud persistence is enabled.
- Browser-local persistence for the no-cloud demo.

Vendor and model suggestions are not verified quotes, bookings, supplier names, prices, or availability. Verify details directly. Model output may be wrong.

## Services and architecture

- **Vertex AI + Gemini:** server-side generation of a structured event planning guide and contextual answers using `@google/genai` and Application Default Credentials.
- **Cloud Firestore:** optional server-side event-document persistence using the Firestore server client and ADC.
- **Cloud Run:** Express API and static Vite build in one container; uses the injected `PORT`.
- **Cloud Scheduler:** not used. There are no reminder workflows.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/TESTING.md](docs/TESTING.md), and [docs/REQUIREMENTS_TRACEABILITY.md](docs/REQUIREMENTS_TRACEABILITY.md).

## Local setup

Requires Node.js 20.12+ and pnpm. Install dependencies and launch the frontend:

```sh
pnpm install
pnpm dev
```

The browser demo can be used without Google Cloud credentials. When Vertex AI is not configured, planning guides and copilot suggestions are generated locally in the browser. To run the API and production app locally:

```sh
pnpm build
pnpm start
```

Set `PORT` if needed; the API defaults to 8080. Browser demo records are stored in localStorage. The API is needed for configured Vertex AI requests and cloud persistence.

## Free public demo on Render

`render.yaml` describes a single Render Web Service on the Free plan in Singapore. It builds the Vite app, starts the Express server, checks `/api/health`, enables browser-demo mode, and disables automatic deployments. The service requires no API keys, Firebase configuration, Google Cloud project, or payment information. Its public URL serves the app and API from the same origin.

To deploy, create a Render account, then create a Blueprint from this public repository or create a Web Service from the public Git URL `https://github.com/abisheik687/prompt-wars-exclusive`. Choose the `main` branch and Free plan. If using the manual Web Service form, use Node runtime, build command `corepack enable && pnpm install --frozen-lockfile && pnpm build`, start command `pnpm start`, and health check path `/api/health`. Do not add a payment method or upgrade the service. Service creation requires your Render account; this repository does not connect an account or create a hosted service automatically.

The app stores events in that browser's localStorage; it does not provide server-side or cross-device event persistence in this configuration. When Vertex AI is unconfigured, planning and copilot responses are deterministic fallback guidance computed in the browser, and event contents are not sent to the API for those requests. The UI labels those responses as local suggestions.

Render's Free web services sleep after 15 minutes without traffic and may take about a minute to wake. Free services have a shared 750 instance-hour monthly allowance per workspace and limited shared bandwidth/build minutes. The filesystem is ephemeral. If usage caps are exceeded without a payment method, Render suspends the affected service/builds until the allowance resets; adding a payment method can permit metered overage charges. See Render's [Free instance limitations](https://render.com/docs/free) and [Blueprint specification](https://render.com/docs/blueprint-spec).

## Google Cloud configuration

Copy `.env.example` to `.env` and supply your own values. Never commit credentials. Authenticate locally using ADC:

```sh
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

Enable Vertex AI and Firestore APIs as needed. Configure `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, and optionally `GEMINI_MODEL`. The defaults use the `global` Vertex AI location and `gemini-3.5-flash-lite`, a GA model that supports structured output. The current model documentation lists global, US, and EU locations; choose a supported location for the configured model. The Cloud Run deployment region is configured separately. The service identity needs `Vertex AI User` for model calls. Set `USE_FIRESTORE=true` to enable event writes and reads; grant the service identity Firestore access (typically `Cloud Datastore User`). Set `FIRESTORE_COLLECTION` if the default collection name does not suit your deployment. Check Google's [model lifecycle and regional availability](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite) before deployment because model support changes.

For authenticated cloud mode, add a Firebase Web App to the same project, enable Google sign-in in Firebase Authentication, and set `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, and `FIREBASE_APP_ID`. These are public Firebase client configuration values; Firebase Admin credentials remain server-side through ADC. Setting `USE_FIRESTORE=true` automatically requires Firebase ID-token verification on event and AI endpoints. Firestore documents store `ownerId` from the verified token; the server ignores client-supplied identity. The runtime service account needs Vertex AI User and Firestore data access (typically Cloud Datastore User). Firestore server access uses Admin/IAM and bypasses Firestore Security Rules, so keep the HTTP API's ownership checks in place.

## Cloud Run deployment

From the project folder, set up a Google Cloud project, billing, Artifact Registry/Cloud Build, and APIs, then deploy from source:

```sh
gcloud config set project YOUR_PROJECT_ID
gcloud run deploy festivo-ai --source . --region asia-south1 --allow-unauthenticated --set-env-vars GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID,GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=gemini-3.5-flash-lite,FIREBASE_WEB_API_KEY=YOUR_FIREBASE_WEB_API_KEY,FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com,FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID,USE_FIRESTORE=true
```

Cloud Run serves the public web shell; Firebase ID tokens gate cloud event data and AI operations. Attach a least-privilege runtime service account with Vertex AI and Firestore permissions. Configure the deployed Cloud Run hostname as an authorized Firebase Authentication domain. This source configuration has not been deployed or live-tested. No Google Cloud resources are created by these instructions in this repository.

## Tests and checks

```sh
pnpm test
pnpm check
pnpm build
```

Unit and local API integration tests cover budget reconciliation, CSV safety, task graph rules, token verification and ownership repository logic, event payload validation, browser-demo API behavior, and deterministic plan/copilot fallback. They do not call live Google APIs or Firestore. See [docs/TESTING.md](docs/TESTING.md) for gaps.

## Evaluation walkthrough

1. Create a wedding, birthday, or community event.
2. Inspect its personalized plan and budget allocations.
3. Edit/add a budget category and total; check allocation math and overspending feedback.
4. Add/edit a vendor and guest; change an RSVP and try the guest CSV export.
5. Add a task with a prerequisite and verify blocked tasks cannot be completed early.
6. Ask the copilot for budget or schedule advice.
7. Reload to verify local browser persistence.

## Current limitations

Cloud authentication and owner enforcement are implemented but require Firebase project configuration; only their local unit/mock behavior is tested. Vertex AI and Firestore source clients are implemented but neither has been live-connected. Firestore persistence uses a single owner-scoped event document (including nested child records), not separate collections. The app has no account recovery/management UI, multi-provider auth, invitations, or shared-event roles. Local browser storage remains unencrypted and available to other users of the same browser profile. Vendor details are user-entered and unverified; there is no marketplace. Cloud Scheduler, production Firestore emulator tests, automated browser E2E, keyboard-only walkthrough evidence, and formal WCAG 2.2 AA audit remain outstanding. Do not treat source integration or readiness configuration status as live service verification.

## Submission demo

The [browser demo recording](submission/festivo-ai-demo.webm) was recorded in local browser-demo mode. The visible plan and copilot replies are deterministic fallback output; they are not Vertex AI responses. Live Firebase, Firestore, Vertex AI, and Cloud Run behavior has not been verified.
