# Requirements traceability

| Requirement | Priority | Implementation | Evidence and remaining gap |
|---|---:|---|---|
| Event setup and local demo | P0 | `src/app.js` wizard, localStorage | Manual browser walkthrough; local mode deliberately has no user isolation |
| Context-aware AI plan/copilot | P0 | `server/index.js`, `server/core.js` | API fallback tests; structured schema and response checks; Vertex live call pending |
| Server-side model auth, bounded requests and honest fallback | P0 | `server/core.js`, rate middleware | No paid calls in tests; verify real ADC, region, quotas, and model behavior before production |
| Editable budget allocations and categories | P0 | `src/app.js`, `src/core.js` | Reconciliation, overspend, rounding and invalid-value unit tests; browser category edit/add walkthrough |
| Estimated, committed, actual expenses | P0 | `src/core.js`, budget workspace | Summary tests; client create/status/delete workflow; Firestore nested with event |
| Vendor create/read/edit/delete | P1 | `src/app.js` vendor workspace | Validation in `server/core.js`; UI includes contacts, cost/quote, deposit, statuses, follow-up, notes; no verified marketplace or quote source |
| Guest create/read/edit/delete, RSVP and counts | P1 | `src/app.js` guest workspace | UI paths and input validation; ownership inherited from event document; no separate CRUD integration test |
| Guest CSV with formula injection protection | P1 | `src/core.js` `csvCell`, `guestsCsv` | Unit tests cover commas, quotes, newlines, formulas; no independent spreadsheet-app import test |
| Task create/edit/due date/priority/dependencies | P0 | `src/app.js`, `src/core.js` | Unit tests for graph rules; manual walkthrough verifies blocked prerequisite cannot be completed |
| Cycle, missing reference, and blocked task protection | P0 | `src/core.js` `taskGraphError`, `taskBlocked`; `server/core.js` validation | Unit tests plus server validation; completed task with open prerequisites is rejected |
| Event date changes preserve completed/custom tasks | P1 | `recalculateGeneratedTasks` in `src/core.js` | Unit test covers preservation and regenerated generated deadline |
| Firebase sign-in and token verification | P0 | `src/auth.js`, `server/auth.js`, `firebase-admin` | Unit mock covers verified UID and invalid/missing tokens; live Firebase app configuration and sign-in pending |
| Event ownership and cross-user isolation | P0 | `server/event-store.js`, `/api/events*`, AI event lookup | Mock repository tests for owner scoped create/read/update/list/delete; Firestore emulator/live integration pending |
| Firestore persistence/failure behavior | P0 | `server/index.js`, `server/event-store.js` | Fake repository failure test; ADC, actual Firestore project, emulator and live IAM not verified |
| Cloud Run container, port, readiness, graceful shutdown | P0 | `Dockerfile`, `server/index.js` | Build command and source inspected; local container/image and Cloud Run probe not executed; `/api/ready` checks config, not live dependency health |
| Security and privacy | P0 | `server/index.js`, `server/auth.js`, docs | 256 KB body, validation, server-only ADC, owner checks, no payload logs, per-process AI rate limit, CSP; formal pen test and distributed rate limiting pending |
| Accessibility | P1 | Semantic controls, labels, visible focus, role=status, responsive CSS | Manual accessibility tree spot checks; keyboard-only, screen-reader, viewport/contrast and WCAG 2.2 AA audit pending |
| Cloud Scheduler reminders | P2 | Not implemented | No scheduled workflow or end-to-end reminder delivery |
| Automated tests and dependency audit | P0 | `tests/*.test.mjs`, package scripts | `pnpm test`, `pnpm check`, `pnpm build`, `pnpm audit --prod`; no live Google cloud tests |

## Cloud verification status

| Service | Source integration | Automated test | Live service verification |
|---|---|---|---|
| Gemini on Vertex AI | Implemented via `@google/genai`, ADC, `gemini-3.5-flash-lite`, `global`, JSON schema, 25s timeout | Deterministic fallback, schema/domain validation; no live model call | Pending: credentials, API enablement, quota, region/model request |
| Firebase Authentication | Client Google sign-in plus Firebase Admin ID-token verification | Auth middleware tested with verifier mock | Pending: Firebase Web App, provider, authorized domain, token round trip |
| Cloud Firestore | ADC server client, owner-scoped document CRUD/list | Fake repository isolation and failure tests | Pending: emulator or isolated project, IAM and live persistence |
| Cloud Run | Dockerfile and PORT-aware Express startup | `pnpm build`; source config inspection | Pending: local container run and deployment/probes; no resource created |

Implementation and test evidence does not mean production readiness. No cloud resource was created, deployed, or contacted for this second pass.
