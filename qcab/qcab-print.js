import { loadQuestions } from "../assets/js/data.js";
import { markdownToHtml } from "../assets/js/renderer.js";
import { loadSelectionIds } from "./qcab-state.js";

const root = document.getElementById("qcabPrintRoot");
const status = document.getElementById("printStatus");
const backButton = document.getElementById("backToTest");

const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function answerPages(q) {
  const explicit = Number(q.pages);
  if (Number.isFinite(explicit) && explicit > 0) return Math.ceil(explicit);
  return Math.max(1, Math.ceil((Number.parseFloat(q.marks) || 0) / 6));
}

function page(className = "") {
  const el = document.createElement("section");
  el.className = `qcab-paper ${className}`.trim();
  return el;
}

function addMargins(target) {
  const left = document.createElement("div");
  left.className = "qcab-margin-line qcab-margin-left";
  const right = document.createElement("div");
  right.className = "qcab-margin-line qcab-margin-right";
  target.append(left, right);
}

function questionPage(q, number, continuation) {
  const p = page(continuation ? "qcab-answer-page qcab-continuation-page" : "qcab-answer-page");
  addMargins(p);

  const numberEl = document.createElement("div");
  numberEl.className = "qcab-question-number";
  numberEl.textContent = `Q. ${number}`;
  p.appendChild(numberEl);

  const marksEl = document.createElement("div");
  marksEl.className = "qcab-question-marks";
  marksEl.textContent = `${q.marks ?? "—"} M`;
  p.appendChild(marksEl);

  if (!continuation) {
    const content = document.createElement("div");
    content.className = "qcab-question-content";
    content.innerHTML = markdownToHtml(q.question_markdown || "", q.images || []);
    p.appendChild(content);
  } else {
    const note = document.createElement("div");
    note.className = "qcab-margin-note";
    note.textContent = "Candidates must not write on this margin";
    p.appendChild(note);
  }
  return p;
}

function listItem(q, number) {
  const item = document.createElement("article");
  item.className = "qcab-list-item";
  item.innerHTML = `
    <span class="qcab-list-number">${number}.</span>
    <div class="qcab-list-question">${markdownToHtml(q.question_markdown || "", q.images || [])}</div>
    <span class="qcab-list-marks">${esc(q.marks ?? "—")} M</span>`;
  return item;
}

function listPage(pageNumber) {
  const p = page("qcab-list-page");
  const title = document.createElement("div");
  title.className = "qcab-list-title";
  title.textContent = "Question List";
  p.appendChild(title);
  const subtitle = document.createElement("div");
  subtitle.className = "qcab-list-subtitle";
  subtitle.textContent = `PhysicsHub • PYQ Test • Page ${pageNumber}`;
  p.appendChild(subtitle);
  const box = document.createElement("div");
  box.className = "qcab-list-items";
  p.appendChild(box);
  return p;
}

async function waitForImages(container) {
  const images = [...container.querySelectorAll("img")];
  await Promise.all(images.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
  }));
}

async function typeset(container) {
  if (!window.MathJax?.typesetPromise) return;
  await (window.MathJax.startup?.promise || Promise.resolve());
  await window.MathJax.typesetPromise([container]);
}

function layoutListPages(questions) {
  const pages = [];
  let current = listPage(1);
  root.appendChild(current);
  let box = current.querySelector(".qcab-list-items");
  let pageNo = 1;

  for (let i = 0; i < questions.length; i++) {
    const item = listItem(questions[i], i + 1);
    box.appendChild(item);
    if (box.scrollHeight > box.clientHeight && box.children.length > 1) {
      box.removeChild(item);
      pages.push(current);
      pageNo += 1;
      current = listPage(pageNo);
      box = current.querySelector(".qcab-list-items");
      box.appendChild(item);
      if (box.scrollHeight > box.clientHeight) {
        // An individual question-list item is unusually large. Keep it on one page
        // rather than silently losing it; its contents remain visible in the print page.
        item.classList.add("qcab-list-item-large");
      }
    }
  }
  pages.push(current);
  return pages;
}

async function build() {
  const ids = loadSelectionIds();
  if (!ids.length) throw new Error("No questions are selected. Return to the test builder and add questions.");

  const questions = await loadQuestions();
  const byId = new Map(questions.map(q => [String(q.id), q]));
  const selected = ids.map(id => byId.get(String(id))).filter(Boolean);
  if (!selected.length) throw new Error("The selected questions could not be found in the repository.");

  root.replaceChildren();
  root.classList.add("is-building");

  // Build a visible, measurable question-list page first.
  const listPages = layoutListPages(selected);
  root.replaceChildren(...listPages);

  // Add the exact answer-page sequence after the list.
  for (let i = 0; i < selected.length; i++) {
    const q = selected[i];
    const pages = answerPages(q);
    for (let p = 0; p < pages; p++) root.appendChild(questionPage(q, i + 1, p > 0));
  }

  await typeset(root);
  await waitForImages(root);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // Detect obvious overflow before allowing printing.
  const paper = [...root.querySelectorAll(".qcab-paper")];
  const overflowing = paper.filter(p => p.scrollHeight > p.clientHeight + 2);
  if (overflowing.length) console.warn("QCAB pages with overflow:", overflowing.length);

  root.classList.remove("is-building");
  status.textContent = `${selected.length} questions • ${selected.reduce((s, q) => s + (Number.parseFloat(q.marks) || 0), 0)} marks • ${paper.length} pages`;
  document.title = `QCAB Test — ${selected.length} Questions`;
}

backButton.addEventListener("click", () => { location.href = "./qcab-test.html"; });

document.addEventListener("DOMContentLoaded", () => {
  build().catch(error => {
    console.error("QCAB print view failed", error);
    status.textContent = error.message;
  });
});
