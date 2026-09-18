/**
 * Document intelligence that can be used in the browser for the demo and
 * independently exercised by tests. Production AI enrichment is optional;
 * the UI never invents a citation when the source cannot support an answer.
 */

export const DEMO_DOCUMENT = {
  title: "Employment Offer - Northstar Labs",
  text: `EMPLOYMENT OFFER

1. Position and start date. Northstar Labs offers you the position of Product Designer, starting 1 July 2026, subject to acceptance of this offer.

2. Compensation. Your annual base salary is INR 18,00,000, paid monthly in accordance with the Company's payroll practices. You may be eligible for an annual performance bonus of up to 10% of base salary. Any bonus is discretionary and not guaranteed.

3. Probation. Your first six months of employment will be probationary. During probation, either you or the Company may terminate employment by giving 7 days' written notice or payment in lieu of notice.

4. Notice period. After probation, either party may terminate this employment by giving 60 days' written notice. The Company may, at its discretion, make payment in lieu of all or part of the notice period.

5. Confidentiality. You must keep confidential all non-public information relating to the Company, its customers, suppliers, and business affairs, both during and after your employment. This obligation does not apply to information required to be disclosed by law.

6. Intellectual property. All inventions, designs, documents, software, and work product created by you in the course of your employment, or using Company resources, will belong exclusively to the Company. You agree to sign further documents reasonably necessary to confirm that ownership.

7. Non-solicitation. For 12 months after your employment ends, you must not solicit or encourage any employee or contractor of the Company to leave their engagement with the Company.

8. Leave. You will receive 24 working days of paid annual leave in each calendar year, in addition to public holidays. Leave is subject to the Company's leave policy and manager approval.

9. Expenses. The Company will reimburse reasonable business expenses that are pre-approved and supported by receipts, in line with the Company's expense policy.

10. Governing law. This offer and your employment are governed by the laws of India. The courts of Bengaluru will have exclusive jurisdiction over disputes arising from this offer.

11. Entire agreement. This offer and the documents it expressly refers to form the entire agreement between you and the Company about your employment.

12. Acceptance. Please sign and return this offer by 20 June 2026.`,
};

const clauseMetadata = [
  { heading: "Position and start date", plain: "You are being offered a Product Designer role beginning 1 July 2026. The offer only becomes effective once you accept it.", level: "neutral", labels: ["role", "start"], question: "Can the start date be changed if needed?" },
  { heading: "Compensation", plain: "Your fixed salary is INR 18,00,000 a year. A bonus may be paid, but it is discretionary, so this document does not promise it.", level: "attention", labels: ["salary", "compensation", "bonus", "pay"], question: "How is the discretionary bonus assessed, and when is it normally paid?" },
  { heading: "Probation", plain: "For the first six months, either side can end employment with just 7 days' written notice or payment instead of notice.", level: "attention", labels: ["probation", "notice", "termination"], question: "What performance expectations apply during the probation period?" },
  { heading: "Notice period", plain: "After probation, you and the company each owe 60 days' notice. The company can choose to pay instead of having you work all or part of it.", level: "attention", labels: ["notice", "resign", "resignation", "termination", "leave"], question: "Can the 60-day notice period be shortened by mutual agreement?" },
  { heading: "Confidentiality", plain: "You must protect the company's non-public information during and after employment. Information you are legally required to disclose is excluded.", level: "attention", labels: ["confidential", "nda", "information"], question: "Can you provide examples of information considered confidential in this role?" },
  { heading: "Intellectual property", plain: "Work you create for the job or using company resources belongs to the company. This could be worth clarifying for side projects or pre-existing work.", level: "attention", labels: ["intellectual", "ip", "side project", "ownership"], question: "Can we list my pre-existing work and clarify the treatment of personal side projects?" },
  { heading: "Non-solicitation", plain: "For 12 months after leaving, you cannot encourage the company's employees or contractors to leave. It does not state a non-compete restriction.", level: "attention", labels: ["non-solicitation", "restriction", "after leaving", "employee"], question: "How does the company define solicitation for ordinary professional contact?" },
  { heading: "Leave", plain: "You receive 24 working days of paid annual leave plus public holidays, subject to the leave policy and manager approval.", level: "positive", labels: ["leave", "holiday", "vacation"], question: "How does leave accrue, and can unused leave be carried forward?" },
  { heading: "Expenses", plain: "Reasonable business expenses are reimbursed if approved in advance and supported by receipts. Check the separate expense policy for limits.", level: "neutral", labels: ["expense", "reimbursement", "receipt"], question: "What expenses need approval, and what are the approval limits?" },
  { heading: "Governing law", plain: "Indian law governs the offer. Any dispute would be handled exclusively in Bengaluru courts.", level: "neutral", labels: ["law", "court", "dispute", "jurisdiction"], question: "Is there an internal dispute-resolution process before court proceedings?" },
  { heading: "Entire agreement", plain: "Only this offer and the documents it explicitly mentions count as the complete employment agreement. Important verbal promises should be written down.", level: "attention", labels: ["agreement", "promise", "verbal"], question: "Can any agreed verbal commitments be added to the written offer?" },
  { heading: "Acceptance", plain: "You need to sign and return the offer by 20 June 2026. The document does not say what happens after that date.", level: "attention", labels: ["accept", "deadline", "sign"], question: "Can the acceptance deadline be extended if I need time to review the terms?" },
];

export function splitClauses(text) {
  return String(text)
    .split(/\n\s*\n/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw, index) => {
      const match = raw.match(/^(\d+)\.\s*([^.]*)\.\s*([\s\S]*)$/);
      const title = match ? match[2].trim() : `Section ${index + 1}`;
      return { id: match?.[1] ?? String(index + 1), title, text: match ? match[3].trim() : raw };
    })
    .filter((clause) => clause.text.length > 16);
}

function getMetadata(title, text) {
  const haystack = `${title} ${text}`.toLowerCase();
  const known = clauseMetadata.find((item) => item.heading.toLowerCase() === title.toLowerCase());
  if (known) return known;
  const titleWords = title.toLowerCase().split(/\W+/).filter((word) => word.length > 3);
  const related = clauseMetadata.find((item) => item.labels.some((label) => titleWords.includes(label) || haystack.includes(label)));
  return related ?? { plain: "This section sets terms that may affect your rights or responsibilities. Read the source wording before relying on it.", level: "neutral", labels: titleWords, question: `What practical effect does the ${title} section have?` };
}

export function analyzeDocument(document) {
  const clauses = splitClauses(document.text).map((clause) => {
    const metadata = getMetadata(clause.title, clause.text);
    return { ...clause, ...metadata };
  });
  const attention = clauses.filter((clause) => clause.level === "attention");
  const obligations = clauses.filter((clause) => /must|agree to|subject to|need to|shall/i.test(clause.text));
  return {
    title: document.title || "Untitled document",
    clauses,
    readingMinutes: Math.max(1, Math.ceil(document.text.trim().split(/\s+/).length / 200)),
    attention,
    obligations,
    questions: attention.slice(0, 4).map((clause) => clause.question),
  };
}

const STOP_WORDS = new Set(["what", "does", "the", "this", "that", "with", "from", "about", "your", "have", "will", "would", "there", "when", "where", "which", "could", "into", "they", "them", "their", "then", "than", "after", "before", "under", "happen", "offer", "include", "document", "agreement", "information"]);

function terms(question) {
  return String(question).toLowerCase().match(/[a-z]{3,}/g)?.filter((word) => !STOP_WORDS.has(word)) ?? [];
}

export function answerQuestion(question, analysis) {
  const queryTerms = terms(question);
  const candidates = analysis.clauses.map((clause) => {
    const source = `${clause.title} ${clause.text} ${clause.labels.join(" ")}`.toLowerCase();
    return { clause, score: queryTerms.reduce((total, term) => total + (source.includes(term) ? 1 : 0), 0) };
  }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score === 0) {
    return { found: false, text: "I could not find information in this document that answers that question. A legal professional or the other party may be able to clarify it.", citation: null };
  }
  return { found: true, text: best.clause.plain, citation: { id: best.clause.id, title: best.clause.title, excerpt: best.clause.text } };
}

export function compareDocuments(primaryAnalysis, comparisonText) {
  const otherClauses = splitClauses(comparisonText);
  return primaryAnalysis.clauses.map((clause) => {
    const normalizedTitle = clause.title.toLowerCase();
    const other = otherClauses.find((candidate) => candidate.title.toLowerCase() === normalizedTitle);
    if (!other) return { type: "missing", title: clause.title, summary: "This section is not clearly present in the comparison document." };
    if (normalize(clause.text) === normalize(other.text)) return { type: "unchanged", title: clause.title, summary: "No material wording change detected." };
    return { type: "changed", title: clause.title, summary: `Original: ${shorten(clause.text)} Revised: ${shorten(other.text)}` };
  });
}

function normalize(value) { return value.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim(); }
function shorten(value) { return value.length > 170 ? `${value.slice(0, 167)}...` : value; }

export const concernOptions = ["Notice & exit", "Pay & benefits", "Restrictions", "Work ownership"];

export function findingsForConcerns(analysis, concerns) {
  if (!concerns.length) return analysis.attention.slice(0, 4);
  const phraseByConcern = {
    "Notice & exit": ["notice", "probation", "solicitation"],
    "Pay & benefits": ["compensation", "leave", "expense"],
    Restrictions: ["confidentiality", "non-solicitation"],
    "Work ownership": ["intellectual property"],
  };
  const wanted = concerns.flatMap((concern) => phraseByConcern[concern] ?? []);
  const matching = analysis.clauses.filter((clause) => wanted.includes(clause.title.toLowerCase()));
  return matching.length ? matching : analysis.attention.slice(0, 4);
}
