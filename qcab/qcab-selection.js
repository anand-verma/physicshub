import { loadQuestions, loadSyllabus, buildSyllabusOrder } from "../assets/js/data.js";
import { createFilterState, buildFilterUI, updateFilterOptions, applyFilters, sortQuestions } from "../assets/js/filters.js";
import { markdownToHtml } from "../assets/js/renderer.js";
import { loadSelectionIds, saveSelectionIds, buildComposition, totalMarks, clearSelection } from "./qcab-state.js";

const state = {
  questions: [],
  syllabusOrder: null,
  filters: createFilterState(),
  selectedIds: new Set(loadSelectionIds()),
  renderToken: 0
};

const $ = id => document.getElementById(id);

const els = {
  search: $("searchInput"),
  exam: $("examFilter"),
  filters: $("filters"),
  body: $("questionBody"),
  resultCount: $("resultCount"),
  empty: $("emptyState"),
  clear: $("clearBtn"),
  emptyReset: $("emptyReset"),
  sort: $("sortSelect"),
  generate: $("generateTestBtn"),
  selectedCount: $("selectedCount"),
  composition: $("selectionComposition"),
  selectedMarks: $("selectedMarks"),
  purge: $("purgeSelectionBtn"),
  modeRadios: [...document.querySelectorAll('input[name="filterMode"]')]
};

const esc = value => 
  String(value ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

function selectedQuestions() {
  const byId = new Map(state.questions.map(q => [String(q.id), q]));
  return [...state.selectedIds].map(id => byId.get(String(id))).filter(Boolean);
}

function updateSummary() {
  const selected = selectedQuestions();
  els.selectedCount.textContent = selected.length;
  els.composition.textContent = selected.length ? buildComposition(selected) : "No questions selected";
  els.selectedMarks.textContent = totalMarks(selected);
}

function syncFilterControls() {
  els.search.value = state.filters.search || "";
  els.exam.value = state.filters.exam || "both";
  els.sort.value = state.filters.sort || "smart";
  els.modeRadios.forEach(r => r.checked = (r.value === state.filters.mode));
}

function rowForQuestion(q, visibleNumber) {
  const tr = document.createElement("tr");
  const id = String(q.id);
  const checked = state.selectedIds.has(id);
  
  tr.dataset.id = id;
  tr.innerHTML = `
    <td class="select-cell">
      <label class="question-check" title="${checked ? "Remove from test" : "Add to test"}">
        <input type="checkbox" ${checked ? "checked" : ""} aria-label="Select question ${visibleNumber}">
        <span class="checkmark"></span>
      </label>
    </td>
    <td class="q-content">
      <div class="question-main" data-question-body>
        ${markdownToHtml(q.question_markdown || "", q.images || [])}
      </div>
      <div class="question-meta">
        <div class="meta-left">
          <span>${esc(q.unit || "—")}</span>
          <span>${esc(q.section || "—")}</span>
          <span>${esc(q._topics?.join(", ") || "Topic not tagged")}</span>
        </div>
        <div class="meta-right">
          <span class="exam">${esc(q.exam || "—")} | ${esc(q.year || "—")} | ${esc(q.marks || "—")}</span>
        </div>
      </div>
    </td>
  `;

  const checkbox = tr.querySelector("input");
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) state.selectedIds.add(id);
    else state.selectedIds.delete(id);

    saveSelectionIds([...state.selectedIds]);
    const label = checkbox.closest("label");
    if (label) label.title = checkbox.checked ? "Remove from test" : "Add to test";
    updateSummary();
  });

  return tr;
}

// Matches PYQ Repository implementation. Do not introduce a separate QCAB MathJax queue here.
let mathObserver;

function render() {
  const token = ++state.renderToken;
  const results = sortQuestions(applyFilters(state.questions, state.filters), state.filters, state.syllabusOrder);

  els.resultCount.textContent = results.length.toLocaleString("en-IN");
  els.empty.hidden = results.length !== 0;

  if (mathObserver) mathObserver.disconnect();
  
  els.body.replaceChildren();

  const chunkSize = 60;
  let offset = 0;

  const appendChunk = () => {
    if (token !== state.renderToken) return;

    const fragment = document.createDocumentFragment();
    const end = Math.min(offset + chunkSize, results.length);

    for (; offset < end; offset++) {
      const tr = rowForQuestion(results[offset], offset + 1);
      const questionBody = tr.querySelector(".question-main");
      if (questionBody && mathObserver) mathObserver.observe(questionBody);
      fragment.appendChild(tr);
    }

    els.body.appendChild(fragment);
    if (offset < results.length) requestAnimationFrame(appendChunk);
  };

  appendChunk();
  updateSummary();
}

function onRowsVisible(entries) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    mathObserver.unobserve(entry.target);
    typeset(entry.target);
  }
}

let typesetQueue = Promise.resolve();

function typeset(el) {
  const ready = window.MathJax?.startup?.promise || Promise.resolve();
  typesetQueue = typesetQueue
    .then(() => ready)
    .then(() => window.MathJax?.typesetPromise ? window.MathJax.typesetPromise([el]) : undefined)
    .catch(() => {});
}

function rebuildFilters() {
  updateFilterOptions(state.questions, els.filters, state.filters, state.syllabusOrder);
  render();
}

function onFilterChange(patch) {
  Object.assign(state.filters, patch);
  rebuildFilters();
}

function resetFilters() {
  state.filters = createFilterState();
  syncFilterControls();
  buildFilterUI(els.filters, state.filters, onFilterChange);
  rebuildFilters();
}

function wireControls() {
  let searchTimer;
  els.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      onFilterChange({ search: els.search.value.trim().toLowerCase() });
    }, 100);
  });

  els.exam.addEventListener("change", () => onFilterChange({ exam: els.exam.value }));
  els.sort.addEventListener("change", () => onFilterChange({ sort: els.sort.value }));

  els.modeRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      state.filters.mode = radio.value;
      state.filters.year = "";
      state.filters.unit = "";
      state.filters.section = "";
      state.filters.topic = "";
      buildFilterUI(els.filters, state.filters, onFilterChange);
      rebuildFilters();
    });
  });

  els.clear.addEventListener("click", resetFilters);
  els.emptyReset.addEventListener("click", resetFilters);

  els.purge?.addEventListener("click", () => {
    if (!state.selectedIds.size) return;
    state.selectedIds.clear();
    clearSelection();
    updateSummary();
    render();
  });

  els.generate.addEventListener("click", () => {
    if (!state.selectedIds.size) return alert("Select at least one question first.");
    saveSelectionIds([...state.selectedIds]);
    location.href = "./qcab-test.html";
  });
}

async function init() {
  try {
    const [questions, syllabus] = await Promise.all([loadQuestions(), loadSyllabus()]);
    state.questions = questions;
    state.syllabusOrder = buildSyllabusOrder(syllabus);
    state.selectedIds = new Set(loadSelectionIds());

    buildFilterUI(els.filters, state.filters, onFilterChange);
    updateFilterOptions(state.questions, els.filters, state.filters, state.syllabusOrder);
    syncFilterControls();

    mathObserver = new IntersectionObserver(onRowsVisible, { rootMargin: "700px 0px" });
    
    render();
    wireControls();
  } catch (error) {
    console.error("PYQ Test selection initialization failed", error);
    els.resultCount.textContent = "Error";
    els.body.innerHTML = `<tr><td colspan="2"><div class="loading">Could not load PYQ data.<br><small>${esc(error.message)}</small></div></td></tr>`;
    els.empty.hidden = true;
  }
}

init();