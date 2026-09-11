import { loadQuestions, loadSyllabus, buildSyllabusOrder } from "./data.js";
import { createFilterState, buildFilterUI, updateFilterOptions, applyFilters, sortQuestions } from "./filters.js";
import { renderQuestion, markdownToHtml, getPrompt } from "./renderer.js";
import { AnalysisEngine } from "./analysis.js";

const state = {
  questions: [], syllabus: null, syllabusOrder: null, analysis: null,
  filters: createFilterState(), renderToken: 0, currentResults: [],
};

const els = {
  search: document.querySelector("#searchInput"),
  exam: document.querySelector("#examFilter"),
  filters: document.querySelector("#filters"),
  body: document.querySelector("#questionBody"),
  resultCount: document.querySelector("#resultCount"),
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
    // Build the lightweight lexical index up front; the semantic model/index is loaded lazily.
    state.analysis = new AnalysisEngine(state.questions);
    state.analysis.warmSemantic?.();

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
  if (copy) {
    copyRichQuestion(q, copy, false).catch(error => showToast(error.message || "Could not copy question", true));
    return;
  }

  const analysisButton = e.target.closest(".analysis-btn");
  if (analysisButton) toggleAnalysis(tr, q, analysisButton);
});

async function toggleAnalysis(tr, q, button) {
  const existing = tr.nextElementSibling;
  if (existing?.classList.contains("analysis-row")) {
    existing.remove();
    button.setAttribute("aria-expanded", "false");
    return;
  }

  els.body.querySelector(".analysis-row")?.remove();
  els.body.querySelector(".analysis-btn[aria-expanded='true']")?.setAttribute("aria-expanded", "false");

  const cardRow = document.createElement("tr");
  cardRow.className = "analysis-row";
  const cell = document.createElement("td");
  cell.colSpan = 3;
  cell.innerHTML = `
    <div class="analysis-card">
      <div class="analysis-card-head">
        <div>
          <div class="analysis-eyebrow">PYQ ANALYSIS</div>
          <h3>Exact repetitions & conceptually related PYQs</h3>
        </div>
        <div class="analysis-status"><span class="analysis-spinner"></span><span>Searching…</span></div>
      </div>
      <div class="analysis-results">
        <div class="analysis-loading"><strong>Searching the full repository…</strong><span>Exact wording, keywords, formula patterns and conceptual similarity.</span></div>
      </div>
    </div>`;
  cardRow.appendChild(cell);
  tr.after(cardRow);
  button.setAttribute("aria-expanded", "true");

  const status = cardRow.querySelector(".analysis-status span:last-child");
  const results = cardRow.querySelector(".analysis-results");

  try {
    const sourceIndex = state.questions.findIndex(x => x.id === q.id);
    if (sourceIndex < 0 || !state.analysis) throw new Error("Analysis index is unavailable.");

    // Fast path is entirely pre-indexed and does not wait for MiniLM.
    const fast = state.analysis.analyzeFast(sourceIndex);
    if (!tr.isConnected || !cardRow.isConnected) return;
    results.innerHTML = buildAnalysisHtml(q, fast);
    status.textContent = "Fast search complete";
    cardRow.querySelector(".analysis-spinner")?.remove();
    await typesetAnalysis(results);

    // Semantic refinement is optional and runs against precomputed repository vectors.
    const semantic = await state.analysis.analyzeSemantic(sourceIndex);
    if (!tr.isConnected || !cardRow.isConnected) return;
    if (semantic.semanticAvailable) {
      results.innerHTML = buildAnalysisHtml(q, { ...fast, ...semantic });
      status.textContent = "Hybrid analysis complete";
      await typesetAnalysis(results);
    } else if (semantic.semanticError) {
      status.textContent = "Fast search complete";
    }
  } catch (error) {
    console.error(error);
    if (cardRow.isConnected) {
      results.innerHTML = `<div class="analysis-error">Analysis could not be completed. ${escapeHtml(error.message || "Please try again.")}</div>`;
      status.textContent = "Analysis unavailable";
      cardRow.querySelector(".analysis-spinner")?.remove();
    }
  }
}

async function typesetAnalysis(el) {
  if (!window.MathJax?.typesetPromise) return;
  await (window.MathJax.startup?.promise || Promise.resolve());
  await window.MathJax.typesetPromise([el]);
}

function displayExam(exam) { return exam === "IFOS" ? "IFoS" : (exam || "—"); }
function displayMarks(marks) { return marks ? String(marks) : "—"; }

function buildAnalysisHtml(current, result) {
  const exact = result.exact || [];
  const related = result.related || [];
  const currentQuestionHtml = markdownToHtml(current.question_markdown || "", current.images || []);

  const exactOccurrences = [current, ...exact].reduce((acc, q) => {
    const key = `${displayExam(q.exam)}|${q.year}`;
    if (!acc.some(x => x.key === key)) acc.push({ key, exam: displayExam(q.exam), year: q.year, marks: displayMarks(q.marks) });
    return acc;
  }, []).sort((a,b) => Number(a.year) - Number(b.year) || a.exam.localeCompare(b.exam));

  const examGroups = ["CSE", "IFoS"].map(exam => ({
    exam,
    items: exactOccurrences.filter(x => x.exam === exam)
  })).filter(x => x.items.length);

  const exactBlock = exact.length ? `
    <section class="analysis-section exact-section">
      <div class="analysis-section-title">
        <span class="analysis-badge exact">EXACT REPETITION</span>
        <span>Same question · ${exactOccurrences.length} appearances</span>
      </div>
      <div class="analysis-exact-question question-main">${currentQuestionHtml}</div>
      <div class="analysis-repeat-line">
        ${examGroups.map(g => `<span><strong>${g.exam}:</strong> ${g.items.map(x => `${escapeHtml(x.year)} (${escapeHtml(x.marks)})`).join(", ")}</span>`).join("")}
      </div>
    </section>` : "";

  const relatedBlock = related.length ? `
    <section class="analysis-section">
      <div class="analysis-section-title">
        <span class="analysis-badge related">RELATED PYQs</span>
        <span>${related.length} strongest conceptual matches</span>
      </div>
      <div class="analysis-related-list">
        ${related.map((item, i) => {
          const q = item.question;
          const score = Math.round(Math.max(0, Math.min(1, item.score)) * 100);
          const signals = [];
          if (item.semantic >= 0.45) signals.push("Concept");
          if (item.formula >= 0.35) signals.push("Formula");
          if (item.lexical >= 0.25) signals.push("Keywords");
          return `<article class="analysis-related-item">
            <div class="analysis-related-meta">
              <span class="analysis-rank">${i + 1}</span>
              <strong>${escapeHtml(displayExam(q.exam))} ${escapeHtml(q.year)}</strong>
              <span class="analysis-marks">${escapeHtml(displayMarks(q.marks))}</span>
              <span>${escapeHtml(q.unit || "—")} · ${escapeHtml(q.section || "—")}</span>
              <span class="analysis-score">${score}% match</span>
              ${signals.map(s => `<span class="analysis-signal">${s}</span>`).join("")}
            </div>
            <div class="analysis-related-question question-main">${markdownToHtml(q.question_markdown || "", q.images || [])}</div>
          </article>`;
        }).join("")}
      </div>
    </section>` : `<div class="analysis-no-related">No sufficiently strong related PYQs were found.</div>`;

  const intro = exact.length
    ? `<div class="analysis-summary">This is an exact repetition. The question is shown once; all CSE/IFoS appearances and their marks are grouped below. Other questions are listed only when conceptually related.</div>`
    : `<div class="analysis-summary">No exact repetition found. Related PYQs are ranked from the <strong>entire repository</strong> using lexical, formula, syllabus and semantic signals.</div>`;

  return intro + exactBlock + relatedBlock;
}

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

  if (f.exam && f.exam !== "both") items.push(f.exam === "IFOS" ? "Exam: IFoS" : "Exam: CSE");
  else items.push("Exam: CSE + IFoS");
  
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
