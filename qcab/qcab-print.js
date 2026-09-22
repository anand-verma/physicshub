import { loadQuestions } from "../assets/js/data.js";
import { markdownToHtml } from "../assets/js/renderer.js";
import { loadSelectionIds, parseMarks } from "./qcab-state.js";

const root = document.getElementById("qcabPrintRoot");
const status = document.getElementById("printStatus");
const backButton = document.getElementById("backToTest");
const printButton = document.getElementById("printBtn");

const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function answerPages(q) {
  const explicit = Number(q.pages);
  if (Number.isFinite(explicit) && explicit > 0) return Math.ceil(explicit);
  return Math.max(1, Math.ceil((parseMarks(q.marks) || 0) / 6));
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

function questionMetaTag(q) {
  const parts = [];
  if (q.exam) parts.push(q.exam);
  if (q.year) parts.push(q.year);
  const m = parseMarks(q.marks);
  if (m) parts.push(`${m} M`);
  return parts.length ? `[${parts.join(" | ")}]` : "";
}

function questionPage(q, number, continuation) {
  const p = page(continuation ? "qcab-answer-page qcab-continuation-page" : "qcab-answer-page");
  addMargins(p);

  // Right margin note on every page
  const note = document.createElement("div");
  note.className = "qcab-margin-note";
  note.textContent = "Candidates must not write on this margin";
  p.appendChild(note);

  if (!continuation) {
    const numberEl = document.createElement("div");
    numberEl.className = "qcab-question-number";
    numberEl.textContent = `Q. ${number}`;
    p.appendChild(numberEl);

    const content = document.createElement("div");
    content.className = "qcab-question-content";
    content.innerHTML = markdownToHtml(q.question_markdown || "", q.images || []);

    const tag = questionMetaTag(q);
    if (tag) {
      const meta = document.createElement("div");
      meta.className = "qcab-question-meta-tag";
      meta.textContent = tag;
      content.appendChild(meta);
    }
    p.appendChild(content);
  }
  return p;
}

function listItem(q, number) {
  const item = document.createElement("article");
  item.className = "qcab-list-item";
  item.innerHTML = `
    <span class="qcab-list-number">${number}.</span>
    <div class="qcab-list-question">${markdownToHtml(q.question_markdown || "", q.images || [])}</div>
    <span class="qcab-list-marks">${parseMarks(q.marks) || "—"} M</span>`;
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
  subtitle.textContent = `UPSC PhysicsHub • PYQ Test • Page ${pageNumber}`;
  p.appendChild(subtitle);
  const box = document.createElement("div");
  box.className = "qcab-list-items";
  p.appendChild(box);
  return p;
}

async function waitForImages(container) {
  const images = [...container.querySelectorAll("img")];
  if (!images.length) return;
  const loaded = Promise.all(images.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
  }));
  // Don't let a stalled image hang the build forever.
  const timeout = new Promise(resolve => setTimeout(resolve, 10_000));
  await Promise.race([loaded, timeout]);
}

async function typeset(container) {
  if (!window.MathJax?.typesetPromise) return;
  try {
    await (window.MathJax.startup?.promise || Promise.resolve());
    const job = window.MathJax.typesetPromise([container]);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("MathJax timeout")), 30_000));
    await Promise.race([job, timeout]);
  } catch (e) {
    console.warn("MathJax typesetting did not complete:", e);
  }
}

function layoutListPages(questions) {
  // Measure overflow in a hidden container to avoid reflow storms on the visible page.
  const measure = document.createElement("div");
  measure.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;width:210mm;height:297mm;";
  document.body.appendChild(measure);

  const pages = [];
  let current = listPage(1);
  measure.appendChild(current);
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
      measure.appendChild(current);
      box = current.querySelector(".qcab-list-items");
      box.appendChild(item);
      if (box.scrollHeight > box.clientHeight) {
        item.classList.add("qcab-list-item-large");
      }
    }
  }
  pages.push(current);
  document.body.removeChild(measure);
  return pages;
}

let currentBuild = null;

async function build() {
  // Cancel any in-flight build to prevent race conditions.
  if (currentBuild) currentBuild.abort();
  const ac = new AbortController();
  currentBuild = ac;
  const signal = ac.signal;

  const ids = loadSelectionIds();
  if (!ids.length) throw new Error("No questions are selected. Return to the test builder and add questions.");

  const questions = await loadQuestions();
  if (signal.aborted) return;

  const byId = new Map(questions.map(q => [String(q.id), q]));
  const selected = ids.map(id => byId.get(String(id))).filter(Boolean);
  if (!selected.length) throw new Error("The selected questions could not be found in the repository.");

  root.replaceChildren();
  root.classList.add("is-building");
  if (printButton) printButton.disabled = true;

  // Build question-list pages (measured off-screen).
  const listPages = layoutListPages(selected);
  if (signal.aborted) return;

  // Build answer pages in a DocumentFragment to avoid per-page reflow.
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < selected.length; i++) {
    const q = selected[i];
    const pages = answerPages(q);
    for (let p = 0; p < pages; p++) fragment.appendChild(questionPage(q, i + 1, p > 0));
  }

  // Single DOM write: list pages + all answer pages.
  root.replaceChildren(...listPages);
  root.appendChild(fragment);

  if (signal.aborted) return;

  await typeset(root);
  if (signal.aborted) return;

  await waitForImages(root);
  if (signal.aborted) return;

  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // Detect obvious overflow before allowing printing.
  const paper = [...root.querySelectorAll(".qcab-paper")];
  const overflowing = paper.filter(p => p.scrollHeight > p.clientHeight + 2);
  if (overflowing.length) console.warn("PYQ Test pages with overflow:", overflowing.length);

  root.classList.remove("is-building");
  status.textContent = `${selected.length} questions • ${selected.reduce((s, q) => s + (parseMarks(q.marks) || 0), 0)} marks • ${paper.length} pages`;
  document.title = `PYQ Test — ${selected.length} Questions`;
  if (printButton) printButton.disabled = false;
}

backButton.addEventListener("click", () => { location.href = "./qcab-test.html"; });
printButton?.addEventListener("click", () => { window.print(); });

document.addEventListener("DOMContentLoaded", () => {
  build().catch(error => {
    console.error("PYQ Test print view failed", error);
    status.textContent = error.message;
    if (printButton) printButton.disabled = true;
  });
});
