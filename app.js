import {
  DEMO_DOCUMENT,
  analyzeDocument,
  answerQuestion,
  compareDocuments,
  concernOptions,
  findingsForConcerns,
} from "./src/legal-core.js";
import { requestGroundedAnswer } from "./src/gemini-client.js";
import { DocumentReadError, readDocumentFile } from "./src/document-reader.js";

const $ = (selector) => document.querySelector(selector);
const state = { analysis: null, concerns: [] };

const riskLabel = { attention: "Needs attention", positive: "Favorable", neutral: "For awareness" };

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function renderAnalysis(document) {
  state.analysis = analyzeDocument(document);
  state.concerns = [];
  $("#empty-state").hidden = true;
  $("#analysis-state").hidden = false;
  $("#document-title").textContent = state.analysis.title;
  $("#reading-time").textContent = `${state.analysis.readingMinutes} min`;
  $("#obligation-count").textContent = state.analysis.obligations.length;
  $("#attention-count").textContent = state.analysis.attention.length;
  renderConcerns();
  renderFindings();
  renderQuestions();
  renderClauses();
  renderSuggestions();
  selectTab("overview");
}

function renderConcerns() {
  $("#concerns").innerHTML = concernOptions.map((label) => `<button class="concern ${state.concerns.includes(label) ? "selected" : ""}" data-concern="${label}" type="button" aria-pressed="${state.concerns.includes(label)}">${label}</button>`).join("");
}

function renderFindings() {
  const findings = findingsForConcerns(state.analysis, state.concerns);
  $("#finding-list").innerHTML = findings.map((item) => `
    <article class="finding">
      <span class="risk-tag risk-${item.level}">${riskLabel[item.level]}</span>
      <div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.plain)}</p></div>
      <button class="source-link" data-clause-id="${item.id}" type="button">Clause ${item.id} ↗</button>
    </article>`).join("");
}

function renderQuestions() {
  $("#question-list").innerHTML = state.analysis.questions.map((question) => `<li>${escapeHtml(question)}</li>`).join("");
}

function renderClauses() {
  const filter = $("#risk-filter").value;
  const clauses = state.analysis.clauses.filter((clause) => filter === "all" || (filter === "attention" ? clause.level === "attention" : clause.level === "positive"));
  $("#clause-list").innerHTML = clauses.map((item) => `
    <details class="clause-card" id="clause-${item.id}">
      <summary><span class="risk-tag risk-${item.level}">${riskLabel[item.level]}</span><strong>Clause ${item.id}: ${escapeHtml(item.title)}</strong></summary>
      <div class="clause-content"><p class="plain-language"><strong>In plain language:</strong> ${escapeHtml(item.plain)}</p><p class="source-excerpt"><strong>Source text:</strong> ${escapeHtml(item.text)}</p></div>
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
  box.innerHTML = answer.found ? `<h4>Answer</h4><p>${escapeHtml(answer.text)}</p><button class="source-link" data-clause-id="${answer.citation.id}" type="button">Source: Clause ${answer.citation.id}, ${escapeHtml(answer.citation.title)} ↗</button>` : `<h4>Not found in this document</h4><p class="unanswered">${escapeHtml(answer.text)}</p>`;
}

function toDisplayAnswer(result, analysis) {
  const sourceId = result.sourceClauseIds?.[0];
  const source = analysis.clauses.find((clause) => clause.id === sourceId);
  if (!result.found || !source) return { found: false, text: "I could not find information in this document that answers that question.", citation: null };
  return { found: true, text: result.answer, citation: source };
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
  container.innerHTML = results.length ? results.map((result) => `<article class="change"><strong>${escapeHtml(result.title)}</strong>${escapeHtml(result.summary)}</article>`).join("") : `<article class="change unchanged"><strong>No material differences found</strong>The comparable sections use the same wording.</article>`;
});
$("#reset-button").addEventListener("click", () => { state.analysis = null; $("#analysis-state").hidden = true; $("#empty-state").hidden = false; });
$("#print-questions").addEventListener("click", () => window.print());
$("#privacy-button").addEventListener("click", () => $("#privacy-dialog").showModal());
$("#close-privacy").addEventListener("click", () => $("#privacy-dialog").close());
