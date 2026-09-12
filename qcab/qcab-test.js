import { loadQuestions } from "../assets/js/data.js";
import { markdownToHtml } from "../assets/js/renderer.js";
import { loadSelectionIds, saveSelectionIds, buildComposition, totalMarks, parseMarks } from "./qcab-state.js";

const $ = id => document.getElementById(id);
const els = {
  list: $("selectedQuestions"), count: $("testCount"), marks: $("testMarks"), composition: $("testComposition"),
  empty: $("editorEmpty"), add: $("addMoreBtn"), emptyAdd: $("emptyAddBtn"), print: $("printQcabBtn")
};
let selected = [];

const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function syncState() {
  saveSelectionIds(selected.map(q => q.id));
  els.count.textContent = `${selected.length} question${selected.length === 1 ? "" : "s"}`;
  els.marks.textContent = `${totalMarks(selected)} marks`;
  els.composition.textContent = selected.length ? buildComposition(selected) : "No questions selected";
  els.empty.hidden = selected.length !== 0;
  els.print.disabled = selected.length === 0;
}

function renderEditor() {
  els.list.replaceChildren();
  const fragment = document.createDocumentFragment();
  selected.forEach((q, index) => {
    const card = document.createElement("article");
    card.className = "selected-question-card";
    card.dataset.id = q.id;
    card.draggable = true;
    card.innerHTML = `
      <div class="drag-handle" title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</div>
      <div class="selected-number">${index + 1}</div>
      <div class="selected-body">
        <div class="question-main">${markdownToHtml(q.question_markdown || "", q.images || [])}</div>
        <div class="question-meta">
          <div class="meta-left"><span>${esc(q.unit || "—")}</span><span>${esc(q.section || "—")}</span><span>${esc(q._topics?.join(", ") || "Topic not tagged")}</span></div>
          <div class="meta-right"><span class="exam">${esc(q.exam || "—")} | ${esc(q.year || "—")} | ${parseMarks(q.marks) || "—"} M</span></div>
        </div>
      </div>
      <div class="reorder-buttons">
        <button type="button" data-move="up" ${index === 0 ? "disabled" : ""} aria-label="Move question up">↑</button>
        <button type="button" data-move="down" ${index === selected.length - 1 ? "disabled" : ""} aria-label="Move question down">↓</button>
        <button type="button" class="delete-question" aria-label="Remove question">×</button>
      </div>`;

    card.querySelector('[data-move="up"]').addEventListener("click", () => { [selected[index - 1], selected[index]] = [selected[index], selected[index - 1]]; renderEditor(); });
    card.querySelector('[data-move="down"]').addEventListener("click", () => { [selected[index + 1], selected[index]] = [selected[index], selected[index + 1]]; renderEditor(); });
    card.querySelector(".delete-question").addEventListener("click", () => { selected.splice(index, 1); renderEditor(); });
    card.addEventListener("dragstart", event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", q.id); card.classList.add("dragging"); });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dragover", event => event.preventDefault());
    card.addEventListener("drop", event => {
      event.preventDefault();
      const id = event.dataTransfer.getData("text/plain");
      const from = selected.findIndex(item => String(item.id) === String(id));
      if (from < 0 || from === index) return;
      const [item] = selected.splice(from, 1);
      selected.splice(index, 0, item);
      renderEditor();
    });
    fragment.appendChild(card);
  });
  els.list.appendChild(fragment);
  syncState();
  if (window.MathJax?.typesetPromise) {
    (window.MathJax.startup?.promise || Promise.resolve()).then(() => window.MathJax.typesetPromise([els.list])).catch(() => {});
  }
}

async function init() {
  try {
    const allQuestions = await loadQuestions();
    const ids = loadSelectionIds();
    const byId = new Map(allQuestions.map(q => [String(q.id), q]));
    selected = ids.map(id => byId.get(String(id))).filter(Boolean);
    if (selected.length !== ids.length) saveSelectionIds(selected.map(q => q.id));
    renderEditor();
    els.add.addEventListener("click", () => location.href = "./index.html");
    els.emptyAdd.addEventListener("click", () => location.href = "./index.html");
    els.print.addEventListener("click", () => {
      if (!selected.length) return;
      saveSelectionIds(selected.map(q => q.id));
      location.href = "./print.html";
    });
  } catch (error) {
    console.error("QCAB editor initialization failed", error);
    els.list.innerHTML = `<div class="empty-state"><h2>Unable to load selected questions</h2><p>${esc(error.message)}</p><button class="clear-btn" type="button" onclick="location.href='./index.html'">Return to selection</button></div>`;
    els.empty.hidden = true;
  }
}
init();
