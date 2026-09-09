import { loadQuestions, loadSyllabus, buildSyllabusOrder } from "./data.js";
import { createFilterState, buildFilterUI, updateFilterOptions, applyFilters, sortQuestions } from "./filters.js";
import { renderQuestion, markdownToHtml, getPrompt } from "./renderer.js";

const state = {
  questions: [], syllabus: null, syllabusOrder: null,
  filters: createFilterState(), renderToken: 0, currentResults: [],
};

const els = {
  search: document.querySelector("#searchInput"),
  exam: document.querySelector("#examFilter"),
  filters: document.querySelector("#filters"),
  body: document.querySelector("#questionBody"),
  resultCount: document.querySelector("#resultCount"),
  headerCount: document.querySelector("#headerCount"),
  empty: document.querySelector("#emptyState"),
  clear: document.querySelector("#clearBtn"),
  emptyReset: document.querySelector("#emptyReset"),
  modeRadios: [...document.querySelectorAll('input[name="filterMode"]')],
  sort: document.querySelector("#sortSelect"),
  sortLabel: document.querySelector("#sortLabel"),
  toast: document.querySelector("#toast"),
  print: document.querySelector("#printBtn")
};

let searchTimer = 0;
let mathObserver;

async function init() {
  try {
    [state.questions, state.syllabus] = await Promise.all([loadQuestions(), loadSyllabus()]);
    state.syllabusOrder = buildSyllabusOrder(state.syllabus);
    els.headerCount.textContent = state.questions.length.toLocaleString("en-IN");

    buildFilterUI(els.filters, state.filters, onFilterChange);
    updateFilterOptions(state.questions, els.filters, state.filters, state.syllabusOrder);

    mathObserver = new IntersectionObserver(onRowsVisible, { rootMargin: "700px 0px" });
    els.sort.addEventListener("change", () => {
      state.filters.sort = els.sort.value;
      render();
    });
    render();
  } catch (error) {
    els.body.innerHTML = `<tr><td colspan="3"><div class="loading">Could not load repository data.<br><small>${escapeHtml(error.message)}</small></div></td></tr>`;
  }
}

function onFilterChange(patch) {
  Object.assign(state.filters, patch);
  updateFilterOptions(state.questions, els.filters, state.filters, state.syllabusOrder);
  render();
}

function render() {
  const token = ++state.renderToken;
  state.filters.search = els.search.value.trim().toLowerCase();
  state.filters.exam = els.exam.value;
  state.filters.sort = els.sort.value;

  const results = sortQuestions(applyFilters(state.questions, state.filters), state.filters, state.syllabusOrder);
  state.currentResults = results;
  els.resultCount.textContent = results.length.toLocaleString("en-IN");
  els.empty.hidden = results.length !== 0;

  if (mathObserver) mathObserver.disconnect();
  els.body.replaceChildren();

  // Progressive DOM insertion keeps the browser responsive even for 2,900+ results.
  // Only the first chunk blocks the current interaction; the rest is yielded to frames.
  const chunkSize = 60;
  let offset = 0;

  const appendChunk = () => {
    if (token !== state.renderToken) return;
    const fragment = document.createDocumentFragment();
    const end = Math.min(offset + chunkSize, results.length);
    for (; offset < end; offset++) {
      const tr = renderQuestion(results[offset], offset + 1);
      mathObserver?.observe(tr.querySelector(".question-main"));
      fragment.appendChild(tr);
    }
    els.body.appendChild(fragment);
    if (offset < results.length) {
      requestAnimationFrame(appendChunk);
    }
  };
  appendChunk();
}

function onRowsVisible(entries) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const el = entry.target;
    mathObserver.unobserve(el);
    typeset(el);
  }
}

let typesetQueue = Promise.resolve();
function typeset(el) {
  const ready = window.MathJax?.startup?.promise || Promise.resolve();
  typesetQueue = typesetQueue.then(() => ready)
    .then(() => window.MathJax?.typesetPromise ? window.MathJax.typesetPromise([el]) : undefined)
    .catch(() => {});
}

async function copyRichQuestion(q, button, includePrompt = false) {
  const markdown = q.question_markdown || "";
  const prompt = getPrompt(q);
  const plain = `${includePrompt ? prompt + "\n\n" : ""}${markdown}\n\n${q.exam} | ${q.year} | ${q.marks || "—"}`;
  const holder = document.createElement("div");
  holder.innerHTML = `${includePrompt ? `<p><strong>UPSC Physics Optional solution request</strong></p><p>${escapeHtml(prompt).replace(/\n/g,"<br>")}</p>` : ""}<div>${markdownToHtml(markdown, q.images || [])}</div><p><strong>${escapeHtml(q.exam)} | ${escapeHtml(q.year)} | ${escapeHtml(q.marks || "—")}</strong></p>`;

  // Convert local figures to embedded data URLs so rich clipboard carries the actual pixels.
  const images = [...holder.querySelectorAll("img")];
  await Promise.all(images.map(async img => {
    const response = await fetch(img.src, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Could not load image: ${img.src}`);
    const blob = await response.blob();
    img.removeAttribute("loading");
    img.src = await blobToDataURL(blob);
  }));
  const html = holder.innerHTML;

  if (!navigator.clipboard?.write || !window.ClipboardItem) throw new Error("Rich clipboard is not supported in this browser.");
  const item = new ClipboardItem({
    "text/plain": new Blob([plain], { type: "text/plain" }),
    "text/html": new Blob([html], { type: "text/html" })
  });
  await navigator.clipboard.write([item]);
  showToast(includePrompt ? "Question + prompt + figure copied" : "Question + figure copied");
  button?.classList.add("copied");
  setTimeout(() => button?.classList.remove("copied"), 1000);
  return { plain, html };
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function reset() {
  state.filters = createFilterState();
  els.search.value = "";
  els.exam.value = "both";
  els.sort.value = "smart";
  els.modeRadios.forEach(r => r.checked = r.value === "unit-section-topic");
  buildFilterUI(els.filters, state.filters, onFilterChange);
  updateFilterOptions(state.questions, els.filters, state.filters, state.syllabusOrder);
  render();
}

els.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(render, 100);
});
els.exam.addEventListener("change", () => {
  state.filters.exam = els.exam.value;
  updateFilterOptions(state.questions, els.filters, state.filters, state.syllabusOrder);
  render();
});
els.modeRadios.forEach(r => r.addEventListener("change", () => {
  if (!r.checked) return;
  state.filters.mode = r.value;
  state.filters.year = state.filters.unit = state.filters.section = state.filters.topic = "";
  buildFilterUI(els.filters, state.filters, onFilterChange);
  updateFilterOptions(state.questions, els.filters, state.filters, state.syllabusOrder);
  render();
}));
els.clear.addEventListener("click", reset);
els.emptyReset.addEventListener("click", reset);

els.body.addEventListener("click", e => {
  const tr = e.target.closest("tr");
  const q = tr?._question;
  if (!q) return;
  const copy = e.target.closest(".copy-btn");
  if (copy) copyRichQuestion(q, copy, false);
});

document.addEventListener("keydown", e => {
  if (e.key === "/" && !["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName)) {
    e.preventDefault(); els.search.focus();
  }
});

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

let toastTimer = 0;
function showToast(message, error = false) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.toggle("error", error);
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1800);
}


let printReadyPromise = null;

function getPrintFilterSummary() {
  const f = state.filters;
  const items = [];

  if (f.search) items.push(`Search: ${els.search.value.trim()}`);

  if (f.mode === "year-unit") {
    if (f.year) items.push(`Year: ${f.year}`);
    if (f.unit) items.push(`Unit: ${f.unit}`);
  } else {
    if (f.unit) items.push(`Unit: ${f.unit}`);
    if (f.section) items.push(`Section: ${f.section}`);
    if (f.topic) items.push(`Topic: ${f.topic}`);
  }
  return items;
}

async function printCurrentQuestions() {
  const questions = state.currentResults || [];
  if (!questions.length) {
    showToast("No questions to print", true);
    return;
  }

  const tokenAtStart = state.renderToken;
  const originalText = els.print?.textContent || "Print";
  if (els.print) {
    els.print.disabled = true;
    els.print.textContent = "Preparing…";
  }

  try {
    // Wait until the progressive on-screen renderer has finished its current batch.
    await new Promise(resolve => {
      const check = () => {
        if (tokenAtStart !== state.renderToken || els.body.querySelectorAll("tr").length >= questions.length) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
    if (tokenAtStart !== state.renderToken) return;

    const printRoot = document.createElement("section");
    printRoot.id = "printRoot";
    printRoot.className = "print-root";
    const title = document.createElement("div");
    title.className = "print-title";

    const heading = document.createElement("div");
    heading.className = "print-heading";
    heading.innerHTML = `<strong>Physics PYQ Repository</strong><span>${questions.length.toLocaleString("en-IN")} questions</span>`;
    title.appendChild(heading);

    const filterSummary = getPrintFilterSummary();
    if (filterSummary.length) {
      const summary = document.createElement("div");
      summary.className = "print-filters";
      summary.innerHTML = filterSummary.map(item => `<span class="print-filter-chip">${escapeHtml(item)}</span>`).join("");
      title.appendChild(summary);
    }
    printRoot.appendChild(title);

    const sourceRows = [...els.body.querySelectorAll("tr")];
    const sourceById = new Map(sourceRows.map(row => [row.dataset.id, row]));
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const source = sourceById.get(q.id);
      const article = document.createElement("article");
      article.className = "print-question";
      const content = source?.querySelector(".question-main")?.cloneNode(true);
      const meta = source?.querySelector(".meta-right")?.cloneNode(true);
      article.innerHTML = `<div class="print-number">${i + 1}.</div>`;
      const body = document.createElement("div");
      body.className = "print-question-body";
      if (content) body.appendChild(content);
      else body.innerHTML = markdownToHtml(q.question_markdown || "", q.images || []);
      const metaWrap = document.createElement("div");
      metaWrap.className = "print-meta";
      metaWrap.innerHTML = `<strong>${escapeHtml(q.exam || "—")} | ${escapeHtml(q.year || "—")} | ${escapeHtml(q.marks || "—")}</strong>`;
      body.appendChild(metaWrap);
      article.appendChild(body);
      printRoot.appendChild(article);
    }

    const printFooter = document.createElement("div");
    printFooter.className = "print-footer";
    printFooter.style.marginTop = "20pt";
    printFooter.style.paddingTop = "10pt";
    printFooter.style.borderTop = "1px solid #ddd";
    printFooter.style.textAlign = "center";
    printFooter.style.fontSize = "8.5pt";
    printFooter.style.color = "#666";
    printFooter.innerHTML = "Special thanks to AbhiPhysics Telegram channel for sourcing PYQs.";
    printRoot.appendChild(printFooter);

    document.body.appendChild(printRoot);
    document.documentElement.classList.add("printing-ready");

    // Ensure images are available before opening the browser print preview.
    const imgs = [...printRoot.querySelectorAll("img")];
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = img.onerror = resolve; })));

    // Re-typeset only the print container. This keeps the normal browsing view untouched.
    if (window.MathJax?.typesetPromise) {
      await (window.MathJax.startup?.promise || Promise.resolve());
      await window.MathJax.typesetPromise([printRoot]);
    }

    // Give layout a frame to settle before invoking the native print dialog.
    await new Promise(requestAnimationFrame);
    window.print();
  } catch (error) {
    console.error(error);
    showToast("Could not prepare print view", true);
  } finally {
    document.documentElement.classList.remove("printing-ready");
    document.getElementById("printRoot")?.remove();
    if (els.print) {
      els.print.disabled = false;
      els.print.textContent = originalText;
    }
  }
}

els.print?.addEventListener("click", printCurrentQuestions);

init();
