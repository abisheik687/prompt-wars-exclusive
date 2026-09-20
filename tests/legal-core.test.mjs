import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_DOCUMENT, analyzeDocument, answerQuestion, compareDocuments, mergeGroundedReview, splitClauses } from "../src/legal-core.js";
import { DocumentReadError, readDocumentFile } from "../src/document-reader.js";
import { requestGroundedAnswer, requestGroundedReview } from "../src/gemini-client.js";

test("splits the demo into source-addressable numbered clauses", () => {
  const clauses = splitClauses(DEMO_DOCUMENT.text);
  assert.equal(clauses.length, 12);
  assert.equal(clauses[3].id, "4");
  assert.equal(clauses[3].title, "Notice period");
});

test("grounds a notice question in its matching clause", () => {
  const analysis = analyzeDocument(DEMO_DOCUMENT);
  const answer = answerQuestion("What happens if I resign?", analysis);
  assert.equal(answer.found, true);
  assert.equal(answer.citation.id, "4");
  assert.match(answer.text, /60 days/i);
});

test("says when the document does not contain an answer", () => {
  const analysis = analyzeDocument(DEMO_DOCUMENT);
  const answer = answerQuestion("Does this offer include health insurance?", analysis);
  assert.equal(answer.found, false);
  assert.equal(answer.citation, null);
  assert.match(answer.text, /could not find/i);
});

test("detects changed and missing comparable sections", () => {
  const analysis = analyzeDocument(DEMO_DOCUMENT);
  const comparison = `4. Notice period. After probation, either party may terminate this employment by giving 30 days' written notice.\n\n8. Leave. You will receive 24 working days of paid annual leave in each calendar year, in addition to public holidays. Leave is subject to the Company's leave policy and manager approval.`;
  const results = compareDocuments(analysis, comparison);
  assert.equal(results.find((item) => item.title === "Notice period").type, "changed");
  assert.equal(results.find((item) => item.title === "Compensation").type, "missing");
  assert.equal(results.find((item) => item.title === "Leave").type, "unchanged");
});

test("reads a supported plain-text upload without sending it anywhere", async () => {
  const file = { name: "offer.txt", size: 52, text: async () => "1. Notice period. Either party must give 30 days notice." };
  const document = await readDocumentFile(file);
  assert.equal(document.title, "offer");
  assert.match(document.text, /30 days/);
});

test("rejects unsupported uploads before analysis", async () => {
  const file = { name: "offer.exe", size: 10, text: async () => "not relevant" };
  await assert.rejects(() => readDocumentFile(file), DocumentReadError);
});

test("uses the Gemini endpoint only when available and preserves its source id", async () => {
  const analysis = analyzeDocument(DEMO_DOCUMENT);
  const response = await requestGroundedAnswer("What is the notice period?", analysis, {
    endpoint: "https://example.test/api",
    locationInfo: { protocol: "https:" },
    fetcher: async (url, options) => {
      assert.equal(url, "https://example.test/api");
      assert.equal(options.method, "POST");
      return { ok: true, json: async () => ({ found: true, answer: "60 days.", sourceClauseIds: ["4"] }) };
    },
  });
  assert.equal(response.answer, "60 days.");
  assert.deepEqual(response.sourceClauseIds, ["4"]);
});

test("does not make a network call from a local file preview", async () => {
  const result = await requestGroundedAnswer("Anything", analyzeDocument(DEMO_DOCUMENT), {
    locationInfo: { protocol: "file:" },
    fetcher: async () => { throw new Error("Network should not be called"); },
  });
  assert.equal(result, null);
});

test("sends only parser-created clauses to the document review endpoint", async () => {
  const analysis = analyzeDocument(DEMO_DOCUMENT);
  const review = await requestGroundedReview(analysis, {
    endpoint: "https://example.test/review",
    locationInfo: { protocol: "https:" },
    fetcher: async (url, options) => {
      assert.equal(url, "https://example.test/review");
      const body = JSON.parse(options.body);
      assert.equal(body.clauses[0].id, "1");
      assert.equal(body.clauses[0].page, null);
      return { ok: true, json: async () => ({ clauses: [{ id: "1", level: "neutral", plain: "A role offer." }] }) };
    },
  });
  assert.equal(review.clauses[0].id, "1");
});

test("classifies an arbitrary uploaded liability clause and derives a review action", () => {
  const analysis = analyzeDocument({
    title: "Vendor terms",
    text: "1. Limitation of liability. Supplier shall indemnify Customer for all claims and damages arising from the services.",
  });
  assert.equal(analysis.clauses[0].category, "Liability and indemnity");
  assert.equal(analysis.clauses[0].level, "attention");
  assert.match(analysis.clauses[0].reasons.join(" "), /obligation|one-sided/i);
  assert.equal(analysis.checklist[0].sourceId, "1");
});

test("preserves a PDF page location in a source citation", () => {
  const analysis = analyzeDocument({
    title: "Two page agreement",
    pages: ["1. Intro. This section introduces the agreement.", "2. Confidentiality. You must keep customer data confidential."],
    text: "1. Intro. This section introduces the agreement.\n\n2. Confidentiality. You must keep customer data confidential.",
  });
  const answer = answerQuestion("What data must remain confidential?", analysis);
  assert.equal(answer.found, true);
  assert.equal(answer.citation.page, 2);
  assert.equal(answer.citation.id, "2");
});

test("creates a time-sensitive checklist item from a stated deadline", () => {
  const analysis = analyzeDocument({ title: "Deadline", text: "1. Acceptance. Please sign by 20 June 2026." });
  assert.equal(analysis.checklist[0].priority, "Time-sensitive");
  assert.match(analysis.checklist[0].title, /20 June 2026/);
});

test("accepts only valid clause ids when merging an AI review", () => {
  const analysis = analyzeDocument({ title: "One clause", text: "1. Payment. Customer shall pay within 30 days." });
  mergeGroundedReview(analysis, { clauses: [
    { id: "1", plain: "Payment is due within 30 days.", category: "Payment", level: "attention", reasons: ["It sets a payment deadline."], question: "When does the payment clock start?" },
    { id: "999", plain: "Ignore this", category: "Fake", level: "positive", reasons: [], question: "Ignore" },
  ] });
  assert.equal(analysis.clauses[0].plain, "Payment is due within 30 days.");
  assert.equal(analysis.clauses.length, 1);
  assert.equal(analysis.questions[0].sourceId, "1");
});
