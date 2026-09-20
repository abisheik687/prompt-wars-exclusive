/**
 * Deterministic document intelligence used for the static experience and as a
 * safety fallback. Gemini may improve wording, but it never supplies source
 * locations: every displayed source comes from these parsed clauses.
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

const KNOWN_CLAUSES = [
  { heading: "Position and start date", plain: "You are being offered a Product Designer role beginning 1 July 2026. The offer only becomes effective once you accept it.", category: "Role and start", level: "neutral", labels: ["role", "start"], question: "Can the start date be changed if needed?" },
  { heading: "Compensation", plain: "Your fixed salary is INR 18,00,000 a year. A bonus may be paid, but it is discretionary, so this document does not promise it.", category: "Pay and benefits", level: "attention", labels: ["salary", "compensation", "bonus", "pay"], question: "How is the discretionary bonus assessed, and when is it normally paid?" },
  { heading: "Probation", plain: "For the first six months, either side can end employment with just 7 days' written notice or payment instead of notice.", category: "Notice and exit", level: "attention", labels: ["probation", "notice", "termination"], question: "What performance expectations apply during the probation period?" },
  { heading: "Notice period", plain: "After probation, you and the company each owe 60 days' notice. The company can choose to pay instead of having you work all or part of it.", category: "Notice and exit", level: "attention", labels: ["notice", "resign", "resignation", "termination", "leave"], question: "Can the 60-day notice period be shortened by mutual agreement?" },
  { heading: "Confidentiality", plain: "You must protect the company's non-public information during and after employment. Information you are legally required to disclose is excluded.", category: "Restrictions", level: "attention", labels: ["confidential", "nda", "information"], question: "Can you provide examples of information considered confidential in this role?" },
  { heading: "Intellectual property", plain: "Work you create for the job or using company resources belongs to the company. This could be worth clarifying for side projects or pre-existing work.", category: "Work ownership", level: "attention", labels: ["intellectual", "ip", "side project", "ownership"], question: "Can we list my pre-existing work and clarify the treatment of personal side projects?" },
  { heading: "Non-solicitation", plain: "For 12 months after leaving, you cannot encourage the company's employees or contractors to leave. It does not state a non-compete restriction.", category: "Restrictions", level: "attention", labels: ["non-solicitation", "restriction", "after leaving", "employee"], question: "How does the company define solicitation for ordinary professional contact?" },
  { heading: "Leave", plain: "You receive 24 working days of paid annual leave plus public holidays, subject to the leave policy and manager approval.", category: "Pay and benefits", level: "positive", labels: ["leave", "holiday", "vacation"], question: "How does leave accrue, and can unused leave be carried forward?" },
  { heading: "Expenses", plain: "Reasonable business expenses are reimbursed if approved in advance and supported by receipts. Check the separate expense policy for limits.", category: "Pay and benefits", level: "neutral", labels: ["expense", "reimbursement", "receipt"], question: "What expenses need approval, and what are the approval limits?" },
  { heading: "Governing law", plain: "Indian law governs the offer. Any dispute would be handled exclusively in Bengaluru courts.", category: "Disputes and law", level: "attention", labels: ["law", "court", "dispute", "jurisdiction"], question: "Is there an internal dispute-resolution process before court proceedings?" },
  { heading: "Entire agreement", plain: "Only this offer and the documents it explicitly mentions count as the complete employment agreement. Important verbal promises should be written down.", category: "Document scope", level: "attention", labels: ["agreement", "promise", "verbal"], question: "Can any agreed verbal commitments be added to the written offer?" },
  { heading: "Acceptance", plain: "You need to sign and return the offer by 20 June 2026. The document does not say what happens after that date.", category: "Deadlines", level: "attention", labels: ["accept", "deadline", "sign"], question: "Can the acceptance deadline be extended if I need time to review the terms?" },
];

const TOPICS = [
  { category: "Notice and exit", keywords: ["terminate", "termination", "notice", "resign", "probation", "renewal", "expiry"], question: "What notice, exit, renewal, or early-termination terms apply to me?" },
  { category: "Pay and benefits", keywords: ["salary", "compensation", "payment", "fee", "bonus", "reimburse", "benefit", "leave", "invoice"], question: "When is payment due, and are any amounts discretionary or conditional?" },
  { category: "Restrictions", keywords: ["confidential", "non-compete", "noncompete", "non-solicit", "restriction", "exclusive"], question: "How broad are the post-contract restrictions, and what exceptions apply?" },
  { category: "Work ownership", keywords: ["intellectual property", "copyright", "invention", "work product", "ownership", "assignment"], question: "What work or intellectual property is assigned, and what happens to pre-existing materials?" },
  { category: "Liability and indemnity", keywords: ["indemn", "liability", "damages", "hold harmless", "warranty", "limitation"], question: "What losses could I be responsible for, and is there a liability cap?" },
  { category: "Data and privacy", keywords: ["personal data", "privacy", "data protection", "processor", "security breach"], question: "What personal or confidential data will be handled, and who is responsible for compliance?" },
  { category: "Disputes and law", keywords: ["governing law", "jurisdiction", "court", "arbitration", "dispute"], question: "Which law and forum apply, and is there a required dispute-resolution process?" },
  { category: "Document scope", keywords: ["entire agreement", "amend", "variation", "assignment", "third party"], question: "Which documents form the agreement, and how can the terms be changed?" },
];

const ATTENTION_TERMS = ["sole discretion", "not guaranteed", "may terminate", "payment in lieu", "exclusive", "irrevocable", "indemn", "penalty", "liquidated damages", "automatic renewal", "waive", "survive termination"];
const POSITIVE_TERMS = ["will reimburse", "entitled to", "paid leave", "may cancel", "no penalty", "at no cost"];
const OBLIGATION_TERMS = /\b(must|shall|agree to|required to|subject to|need to|may not|must not)\b/i;

export function splitClauses(text, pages = []) {
  const source = String(text ?? "");
  const pageStarts = pageOffsets(pages);
  const blocks = source.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
  let cursor = 0;
  return blocks.map((raw, index) => {
    const start = source.indexOf(raw, cursor);
    cursor = Math.max(cursor, start + raw.length);
    const numbered = raw.match(/^(\d+(?:\.\d+)?)\s*[.)]\s*([^.]*)\.\s*([\s\S]*)$/);
    const titled = raw.match(/^([A-Z][A-Z &/\-]{3,})\s*\n+([\s\S]+)$/);
    const title = numbered ? numbered[2].trim() : titled ? toTitleCase(titled[1]) : `Section ${index + 1}`;
    const clauseText = numbered ? numbered[3].trim() : titled ? titled[2].trim() : raw;
    return { id: numbered?.[1] ?? String(index + 1), title, text: clauseText, page: pageForOffset(start, pageStarts) };
  }).filter((clause) => clause.text.length > 16);
}

function pageOffsets(pages) {
  if (!Array.isArray(pages) || !pages.length) return [];
  let offset = 0;
  return pages.map((page) => { const result = offset; offset += String(page).length + 2; return result; });
}

function pageForOffset(offset, starts) {
  if (offset < 0 || !starts.length) return null;
  return starts.reduce((page, start, index) => offset >= start ? index + 1 : page, 1);
}

function toTitleCase(value) { return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase()); }

function classifyClause(title, text) {
  const normalized = `${title} ${text}`.toLowerCase();
  const known = KNOWN_CLAUSES.find((item) => item.heading.toLowerCase() === title.toLowerCase());
  if (known) return { ...known, reasons: riskReasons(normalized, known.level) };
  const topic = TOPICS.find((item) => item.keywords.some((keyword) => normalized.includes(keyword))) ?? { category: "General terms", keywords: [], question: `What practical effect does the ${title} section have?` };
  const level = deriveLevel(normalized);
  const labels = [...new Set([...topic.keywords, ...title.toLowerCase().match(/[a-z]{4,}/g) ?? []])];
  return { category: topic.category, labels, level, reasons: riskReasons(normalized, level), plain: generalPlainLanguage(title, topic.category, normalized), question: topic.question };
}

function deriveLevel(text) {
  if (ATTENTION_TERMS.some((term) => text.includes(term)) || OBLIGATION_TERMS.test(text)) return "attention";
  if (POSITIVE_TERMS.some((term) => text.includes(term))) return "positive";
  return "neutral";
}

function riskReasons(text, level) {
  const reasons = [];
  if (OBLIGATION_TERMS.test(text)) reasons.push("It creates a stated obligation or restriction.");
  if (ATTENTION_TERMS.some((term) => text.includes(term))) reasons.push("It includes discretionary, restrictive, or potentially one-sided wording.");
  if (level === "positive") reasons.push("It includes a stated benefit, reimbursement, or entitlement.");
  return reasons.length ? reasons : ["Review the scope, timing, exceptions, and linked policies in the source text."];
}

function generalPlainLanguage(title, category, text) {
  const obligation = OBLIGATION_TERMS.test(text) ? "It appears to place a responsibility or restriction on at least one party. " : "It sets terms that may affect one or both parties. ";
  return `${title} is a ${category.toLowerCase()} clause. ${obligation}Check the original wording for who it applies to, when it takes effect, and any exceptions.`;
}

export function analyzeDocument(document) {
  const clauses = splitClauses(document.text, document.pages).map((clause) => ({ ...clause, ...classifyClause(clause.title, clause.text) }));
  const attention = clauses.filter((clause) => clause.level === "attention");
  const obligations = clauses.filter((clause) => OBLIGATION_TERMS.test(clause.text));
  const deadlines = findDeadlines(clauses);
  return { title: document.title || "Untitled document", clauses, readingMinutes: Math.max(1, Math.ceil(String(document.text).trim().split(/\s+/).length / 200)), attention, obligations, deadlines, questions: attention.slice(0, 4).map((clause) => ({ text: clause.question, sourceId: clause.id })), checklist: buildChecklist(attention, deadlines) };
}

function findDeadlines(clauses) {
  const deadlinePattern = /\b(by\s+\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|within\s+\d+\s+(?:business\s+)?days?|\d{1,2}\s+days['’]?\s+notice|\d{1,2}\s+[A-Z][a-z]+\s+\d{4})\b/gi;
  return clauses.flatMap((clause) => [...clause.text.matchAll(deadlinePattern)].map((match) => ({ id: clause.id, title: clause.title, value: match[0] })));
}

function buildChecklist(attention, deadlines) {
  const items = deadlines.map((deadline) => ({ id: `deadline-${deadline.id}`, sourceId: deadline.id, title: `Confirm timing: ${deadline.value}`, detail: `Check the deadline or notice timing in ${deadline.title}.`, priority: "Time-sensitive" }));
  attention.forEach((clause) => {
    if (items.some((item) => item.sourceId === clause.id)) return;
    items.push({ id: `review-${clause.id}`, sourceId: clause.id, title: `Clarify ${clause.title}`, detail: clause.question, priority: "Review" });
  });
  return items.slice(0, 6);
}

const STOP_WORDS = new Set(["what", "does", "the", "this", "that", "with", "from", "about", "your", "have", "will", "would", "there", "when", "where", "which", "could", "into", "they", "them", "their", "then", "than", "after", "before", "under", "happen", "offer", "include", "document", "agreement", "information", "please", "tell"]);
const SYNONYMS = new Map([["resign", ["notice", "termination"]], ["quit", ["notice", "termination"]], ["pay", ["salary", "compensation", "payment"]], ["money", ["salary", "compensation", "payment"]], ["leave", ["holiday", "vacation"]], ["lawsuit", ["court", "dispute", "jurisdiction"]]]);

function questionTerms(question) { return String(question).toLowerCase().match(/[a-z]{3,}/g)?.flatMap((word) => STOP_WORDS.has(word) ? [] : [word, ...(SYNONYMS.get(word) ?? [])]) ?? []; }

export function answerQuestion(question, analysis) {
  const terms = questionTerms(question);
  const candidates = analysis.clauses.map((clause) => {
    const source = `${clause.title} ${clause.text} ${clause.labels.join(" ")} ${clause.category}`.toLowerCase();
    return { clause, score: terms.reduce((total, term) => total + (source.includes(term) ? 1 : 0), 0) };
  }).sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best || best.score === 0) return { found: false, text: "I could not find information in this document that answers that question. A legal professional or the other party may be able to clarify it.", citation: null };
  return { found: true, text: best.clause.plain, citation: citationFor(best.clause), evidence: sourceSentence(best.clause.text) };
}

export function citationFor(clause) { return { id: clause.id, title: clause.title, page: clause.page ?? null, excerpt: clause.text }; }
function sourceSentence(value) { return value.match(/[^.!?]+[.!?]?/)?.[0]?.trim() ?? value; }

export function compareDocuments(primaryAnalysis, comparisonText) {
  const comparisonClauses = splitClauses(comparisonText);
  return primaryAnalysis.clauses.map((clause) => {
    const other = bestComparableClause(clause, comparisonClauses);
    if (!other) return { type: "missing", severity: "attention", title: clause.title, sourceId: clause.id, summary: "This section is not clearly present in the comparison document." };
    if (normalize(clause.text) === normalize(other.text)) return { type: "unchanged", severity: "neutral", title: clause.title, sourceId: clause.id, summary: "No material wording change detected." };
    return { type: "changed", severity: clause.level === "attention" ? "attention" : "neutral", title: clause.title, sourceId: clause.id, summary: `Original: ${shorten(clause.text)} Revised: ${shorten(other.text)}` };
  });
}

function bestComparableClause(clause, candidates) {
  const exact = candidates.find((candidate) => candidate.title.toLowerCase() === clause.title.toLowerCase());
  if (exact) return exact;
  const titleTerms = new Set(clause.title.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const scored = candidates.map((candidate) => ({ candidate, score: overlap(titleTerms, new Set(candidate.title.toLowerCase().match(/[a-z]{4,}/g) ?? [])) })).sort((left, right) => right.score - left.score);
  return scored[0]?.score >= 0.5 ? scored[0].candidate : null;
}

function overlap(left, right) { const union = new Set([...left, ...right]); return union.size ? [...left].filter((value) => right.has(value)).length / union.size : 0; }
function normalize(value) { return String(value).toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim(); }
function shorten(value) { return value.length > 170 ? `${value.slice(0, 167)}...` : value; }

export const concernOptions = ["Notice & exit", "Pay & benefits", "Restrictions", "Work ownership"];
const CONCERN_CATEGORIES = { "Notice & exit": "Notice and exit", "Pay & benefits": "Pay and benefits", Restrictions: "Restrictions", "Work ownership": "Work ownership" };

export function findingsForConcerns(analysis, concerns) {
  if (!concerns.length) return analysis.attention.slice(0, 4);
  const categories = concerns.map((concern) => CONCERN_CATEGORIES[concern]);
  const matching = analysis.clauses.filter((clause) => categories.includes(clause.category));
  return matching.length ? matching : analysis.attention.slice(0, 4);
}

export function mergeGroundedReview(analysis, review) {
  const byId = new Map(analysis.clauses.map((clause) => [clause.id, clause]));
  for (const item of review?.clauses ?? []) {
    const clause = byId.get(item?.id);
    if (!clause || !["attention", "positive", "neutral"].includes(item.level)) continue;
    if (typeof item.plain === "string" && item.plain.length > 0 && item.plain.length <= 900) clause.plain = item.plain;
    if (typeof item.category === "string" && item.category.length <= 80) clause.category = item.category;
    clause.level = item.level;
    if (Array.isArray(item.reasons)) clause.reasons = item.reasons.filter((reason) => typeof reason === "string").slice(0, 3);
    if (typeof item.question === "string" && item.question.length <= 400) clause.question = item.question;
  }
  analysis.attention = analysis.clauses.filter((clause) => clause.level === "attention");
  analysis.questions = analysis.attention.slice(0, 4).map((clause) => ({ text: clause.question, sourceId: clause.id }));
  analysis.checklist = buildChecklist(analysis.attention, analysis.deadlines);
  return analysis;
}
