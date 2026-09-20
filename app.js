import {
  DEMO_DOCUMENT,
  analyzeDocument,
  answerQuestion,
  compareDocuments,
  concernOptions,
  findingsForConcerns,
  mergeGroundedReview,
} from "./src/legal-core.js";
import { requestGroundedAnswer, requestGroundedReview } from "./src/gemini-client.js";
import { DocumentReadError, readDocumentFile } from "./src/document-reader.js";

const $ = (selector) => document.querySelector(selector);
const state = { analysis: null, concerns: [], completedChecklist: new Set(), reviewRequestId: 0 };

const riskLabel = { attention: "Needs attention", positive: "Favorable", neutral: "For awareness" };

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function renderAnalysis(document) {
  state.analysis = analyzeDocument(document);
  state.concerns = [];
  state.completedChecklist = new Set();
  const requestId = ++state.reviewRequestId;
  $("#empty-state").hidden = true;
  $("#analysis-state").hidden = false;
  $("#document-title").textContent = state.analysis.title;
  $("#reading-time").textContent = `${state.analysis.readingMinutes} min`;
  $("#obligation-count").textContent = state.analysis.obligations.length;
  $("#attention-count").textContent = state.analysis.attention.length;
  renderConcerns();
  renderFindings();
  renderQuestions();
  renderChecklist();
  renderClauses();
  renderSuggestions();
  selectTab("overview");
  void enrichReview(requestId);
}

async function enrichReview(requestId) {
  const review = await requestGroundedReview(state.analysis);
  if (!review || requestId !== state.reviewRequestId || !state.analysis) {
    if (requestId === state.reviewRequestId) $("#review-status").textContent = "Source-linked review ready.";
    return;
  }
  mergeGroundedReview(state.analysis, review);
  $("#obligation-count").textContent = state.analysis.obligations.length;
  $("#attention-count").textContent = state.analysis.attention.length;
  renderFindings();
  renderQuestions();
  renderChecklist();
  renderClauses();
  renderSuggestions();
  $("#review-status").textContent = "Gemini review added. Every source link remains tied to your document.";
}

function sourceLabel(item) {
  return `${item.page ? `Page ${item.page} · ` : ""}Clause ${item.id}`;
}

function renderConcerns() {
  $("#concerns").innerHTML = concernOptions.map((label) => `<button class="concern ${state.concerns.includes(label) ? "selected" : ""}" data-concern="${label}" type="button" aria-pressed="${state.concerns.includes(label)}">${label}</button>`).join("");
}

function renderFindings() {
  const findings = findingsForConcerns(state.analysis, state.concerns);
  $("#finding-list").innerHTML = findings.map((item) => `
    <article class="finding">
      <span class="risk-tag risk-${item.level}">${riskLabel[item.level]}</span>
      <div><p class="finding-category">${escapeHtml(item.category)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.plain)}</p><p class="finding-reason">${escapeHtml(item.reasons[0])}</p></div>
      <button class="source-link" data-clause-id="${item.id}" type="button">${escapeHtml(sourceLabel(item))} ↗</button>
    </article>`).join("");
}

function renderQuestions() {
  $("#question-list").innerHTML = state.analysis.questions.map((question) => `<li><span>${escapeHtml(question.text)}</span><button class="source-link" data-clause-id="${question.sourceId}" type="button">Source ↗</button></li>`).join("");
}

function renderChecklist() {
  $("#checklist").innerHTML = state.analysis.checklist.map((item) => `
    <li class="checklist-item">
      <label><input data-checklist-id="${item.id}" type="checkbox" ${state.completedChecklist.has(item.id) ? "checked" : ""} /><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span></label>
      <button class="source-link" data-clause-id="${item.sourceId}" type="button">${escapeHtml(item.priority)} ↗</button>
    </li>`).join("");
}

function renderClauses() {
  const filter = $("#risk-filter").value;
  const clauses = state.analysis.clauses.filter((clause) => filter === "all" || (filter === "attention" ? clause.level === "attention" : clause.level === "positive"));
  $("#clause-list").innerHTML = clauses.map((item) => `
    <details class="clause-card" id="clause-${item.id}">
      <summary><span class="risk-tag risk-${item.level}">${riskLabel[item.level]}</span><strong>${escapeHtml(sourceLabel(item))}: ${escapeHtml(item.title)}</strong></summary>
      <div class="clause-content"><p class="plain-language"><strong>In plain language:</strong> ${escapeHtml(item.plain)}</p><p class="risk-explanation"><strong>Why review it:</strong> ${escapeHtml(item.reasons.join(" "))}</p><p class="source-excerpt"><strong>Source text:</strong> ${escapeHtml(item.text)}</p></div>
    </details>`).join("");
}

function renderSuggestions() {
  $("#suggested-questions").innerHTML = state.analysis.clauses.slice(0, 4).map((clause) => `<button class="suggested-question" data-question="${escapeHtml(clause.question)}" type="button">${escapeHtml(clause.question)}</button>`).join("");
}

function selectTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const selected = tab.id === `${name}-tab`;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll(".view").forEach((view) => {
    const selected = view.id === `${name}-view`;
    view.classList.toggle("active", selected);
    view.hidden = !selected;
  });
}

async function showAnswer(question) {
  const localAnswer = answerQuestion(question, state.analysis);
  const box = $("#answer-box");
  box.hidden = false;
  box.innerHTML = `<h4>Checking document sources...</h4><p>Finding the relevant clause and preparing a clear answer.</p>`;
  const enriched = await requestGroundedAnswer(question, state.analysis);
  const answer = enriched ? toDisplayAnswer(enriched, state.analysis) : localAnswer;
  box.innerHTML = answer.found ? `<h4>Answer</h4><p>${escapeHtml(answer.text)}</p><p class="answer-evidence"><strong>Source evidence:</strong> ${escapeHtml(answer.evidence ?? answer.citation.excerpt)}</p><button class="source-link" data-clause-id="${answer.citation.id}" type="button">Source: ${escapeHtml(sourceLabel(answer.citation))}, ${escapeHtml(answer.citation.title)} ↗</button>${answer.followUp ? `<p class="follow-up"><strong>Ask a professional:</strong> ${escapeHtml(answer.followUp)}</p>` : ""}` : `<h4>Not found in this document</h4><p class="unanswered">${escapeHtml(answer.text)}</p>`;
}

function toDisplayAnswer(result, analysis) {
  const sourceId = result.sourceClauseIds?.[0];
  const source = analysis.clauses.find((clause) => clause.id === sourceId);
  if (!result.found || !source) return { found: false, text: "I could not find information in this document that answers that question.", citation: null };
  return { found: true, text: result.answer, citation: source, evidence: source.text, followUp: result.followUpQuestion };
}

$("#load-demo").addEventListener("click", () => renderAnalysis(DEMO_DOCUMENT));
$("#upload-button").addEventListener("click", () => $("#file-input").click());
$("#upload-zone").addEventListener("dragover", (event) => { event.preventDefault(); $("#upload-zone").classList.add("dragging"); });
$("#upload-zone").addEventListener("dragleave", () => $("#upload-zone").classList.remove("dragging"));
$("#upload-zone").addEventListener("drop", (event) => { event.preventDefault(); $("#upload-zone").classList.remove("dragging"); loadFile(event.dataTransfer.files[0]); });
$("#file-input").addEventListener("change", (event) => loadFile(event.target.files[0]));

async function loadFile(file) {
  if (!file) return;
  const uploadButton = $("#upload-button");
  uploadButton.disabled = true;
  uploadButton.textContent = "Reading document...";
  try {
    const document = await readDocumentFile(file);
    if (document.text.trim().length < 20) throw new DocumentReadError("No readable text was found in this document.");
    renderAnalysis(document);
  } catch (error) {
    window.alert(error instanceof DocumentReadError ? error.message : "This document could not be read. Please try another file.");
  } finally {
    uploadButton.disabled = false;
    uploadButton.textContent = "Choose file";
  }
}

document.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-tab-target]");
  if (tab) selectTab(tab.dataset.tabTarget);
  const concern = event.target.closest("[data-concern]");
  if (concern) { const label = concern.dataset.concern; state.concerns = state.concerns.includes(label) ? state.concerns.filter((item) => item !== label) : [...state.concerns, label]; renderConcerns(); renderFindings(); }
  const source = event.target.closest("[data-clause-id]");
  if (source) { selectTab("clauses"); requestAnimationFrame(() => { const target = document.querySelector(`#clause-${source.dataset.clauseId}`); if (target) { target.open = true; target.scrollIntoView({ behavior: "smooth", block: "center" }); } }); }
  const suggested = event.target.closest("[data-question]");
  if (suggested) { $("#question-input").value = suggested.dataset.question; void showAnswer(suggested.dataset.question); }
  const checklist = event.target.closest("[data-checklist-id]");
  if (checklist) { checklist.checked ? state.completedChecklist.add(checklist.dataset.checklistId) : state.completedChecklist.delete(checklist.dataset.checklistId); }
});

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => selectTab(tab.id.replace("-tab", ""))));
$("#risk-filter").addEventListener("change", renderClauses);
$("#question-form").addEventListener("submit", (event) => { event.preventDefault(); const question = $("#question-input").value.trim(); if (question) void showAnswer(question); });
$("#compare-button").addEventListener("click", () => {
  const text = $("#comparison-text").value.trim();
  if (!text) { window.alert("Paste a second document to compare."); return; }
  const results = compareDocuments(state.analysis, text).filter((result) => result.type !== "unchanged");
  const container = $("#comparison-results");
  container.hidden = false;
  container.innerHTML = results.length ? results.map((result) => `<article class="change ${result.severity === "attention" ? "change-attention" : ""}"><strong>${escapeHtml(result.title)}</strong><p>${escapeHtml(result.summary)}</p><button class="source-link" data-clause-id="${result.sourceId}" type="button">Open original source ↗</button></article>`).join("") : `<article class="change unchanged"><strong>No material differences found</strong>The comparable sections use the same wording.</article>`;
});
$("#reset-button").addEventListener("click", () => { state.analysis = null; state.reviewRequestId += 1; $("#analysis-state").hidden = true; $("#empty-state").hidden = false; });
$("#print-questions").addEventListener("click", () => window.print());
$("#privacy-button").addEventListener("click", () => $("#privacy-dialog").showModal());
$("#close-privacy").addEventListener("click", () => $("#privacy-dialog").close());
