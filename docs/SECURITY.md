# Security and privacy

- Vertex AI, Firebase Admin verification, and Firestore credentials remain server-side and use Application Default Credentials. Firebase Web App configuration is public by design; it does not grant privileged access.
- With `USE_FIRESTORE=true`, all event and AI endpoints require a verified Firebase ID token (including revocation check). Identity comes from `uid` in the verified token. Firestore read, update, and delete operations compare the stored owner; first create writes the verified owner. Unknown and other-user event IDs both return 404.
- Nested budgets, expenses, tasks, vendors, guests, and agenda data are protected as part of the owning event document. There are no direct child record APIs.
- The API applies Helmet CSP, a 256 KB JSON body limit, input bounds/schema checks, 30-second server request timeout, and an in-process 12 requests/minute AI limit keyed by verified UID or, in demo mode, IP. Limits reset on process restart and are not a distributed quota control.
- Demo mode stores event and guest data in browser localStorage. Anyone using the same browser profile can access it; it has no account or encryption protection. The UI states that local demo data is not account-protected.
- Firestore Admin SDK bypasses Firestore Security Rules; the server owner checks and least-privilege Cloud Run IAM are required. Use Vertex AI User and Firestore data access roles only. This repository does not provision roles or resources.
- Logs record error class and service category, not event, guest, model prompt, token, or API key contents. AI input is treated as untrusted, output is schema constrained, and no generated string is executed or inserted as HTML.
- CSV values are quoted and formula-leading values are prefixed to reduce spreadsheet formula injection. Guest dietary/accessibility fields are optional.
- Vendor entries and model suggestions are user-provided planning notes, not verified listings, prices, bookings, or availability.
- No uploads, account recovery, shared event roles, or Scheduler reminders are implemented. No cloud resources or IAM policies are provisioned by this repository. Live authentication, Vertex AI, and Firestore have not been verified against a configured project.
