# Clausewise

Clausewise is a grounded legal-information assistant for people reviewing an agreement without legal training. It turns a document into an understandable, source-linked review, helps someone focus on what matters to them, and prepares questions for a qualified professional. It does not provide legal advice.

## Challenge vertical

**AI for Legal Assistance & Access**. The product is designed around an employment-offer reviewer, a common situation where a person needs to understand compensation, notice, restrictions, and ownership before agreeing.

## Why this is different from a PDF chatbot

The workflow puts legal understanding before chat:

1. Upload a PDF, DOCX, text, Markdown, or HTML document, or explore a complete employment-offer demo.
2. See obligations and items that need attention in plain language.
3. Pick the concern that matters most, such as notice, compensation, restrictions, or work ownership.
4. Open the original clause behind every finding.
5. Ask a question. The system cites the source clause, or explicitly says the document does not contain the answer.
6. Compare a revised version to highlight changed or missing sections.
7. Print a compact, practical question list for a legal professional.

This is intentional product logic: document parsing, citations, filtering, comparison, and accessibility are deterministic software responsibilities; Gemini is reserved for production-quality plain-language answers when an answer must be synthesized from the document.

## Key safeguards

- **Grounding:** The front-end answer engine cites the matched clause. The optional Gemini function accepts citations only from supplied clause IDs and rejects model-created IDs.
- **Unanswerable questions:** No matching source means an explicit "not found" response, not a guess.
- **Legal boundary:** Persistent information-not-advice language and suggested follow-up questions direct users toward professional review for decisions with legal consequences.
- **Privacy:** The demo runs locally in the browser. No document content or API key is stored in the front end.
- **Security:** API keys are configured as Firebase secrets. Inputs have method, type, count, and character-size limits. The deployed endpoint has an explicit allowed origin.

## Google services

The repository is configured for **Firebase Hosting** and a **Firebase Cloud Function (2nd gen)** using the **Gemini API** through `@google/genai`.

The working demo does not require credentials. Once deployed, the Ask view progressively uses Gemini through `/api/grounded-answer`; during local file use or a transient service failure it falls back to the tested source matcher. To deploy Gemini enrichment:

```bash
firebase login
firebase init hosting functions
cd functions && npm install && cd ..
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy
```

Set `ALLOWED_ORIGIN` to the deployed Firebase Hosting URL before production use. Keep `GEMINI_API_KEY` only in Firebase Secret Manager; `.env` is ignored by Git.

## Run locally

No build step is required for the demo. Open `index.html` in a modern browser, or serve the folder using any static file server.

Run the trust-critical unit tests with Node 20+:

```bash
node --test tests/*.test.mjs
```

## Project structure

```text
index.html              Accessible product UI
styles.css              Responsive visual system and print style
app.js                  UI state and interaction wiring
src/legal-core.js       Tested source-grounding and comparison logic
src/gemini-client.js    Timeout-bound Firebase/Gemini enhancement client
functions/index.js      Secure Gemini/Firebase enrichment endpoint
tests/legal-core.test.mjs
```

## Assumptions and limits

- The demo is built for English-language documents. It extracts `.pdf` text through PDF.js and `.docx` text through Mammoth in the browser, while plain-text formats remain dependency-free. Production ingestion should move extraction to a malware-scanned server-side pipeline for larger or sensitive documents.
- Legal terms and enforceability depend on jurisdiction and facts. Clausewise explains the provided document; it does not determine whether a term is valid or enforceable.
- The local comparison aligns sections by their headings. A production comparison engine should additionally use semantic matching and show a human-review confidence level.

## Evaluation checklist

- Clean, dependency-light architecture with clear separation of UI and legal logic
- Automated tests for clause parsing, grounded answers, unanswerable questions, and version comparison
- Keyboard navigation, visible focus states, semantic tabs, labels, responsive layouts, skip link, and print-friendly output
- No committed credentials, constrained API input, and no client-side Gemini secret
- Repository stays lightweight; no generated assets or binary files
