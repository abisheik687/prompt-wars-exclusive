import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_DOCUMENT, analyzeDocument, answerQuestion, compareDocuments, splitClauses } from "../src/legal-core.js";

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
