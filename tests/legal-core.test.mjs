import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_DOCUMENT, analyzeDocument, answerQuestion, compareDocuments, splitClauses } from "../src/legal-core.js";
import { DocumentReadError, readDocumentFile } from "../src/document-reader.js";
import { requestGroundedAnswer } from "../src/gemini-client.js";

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
