import { CONFIG } from "./config.js";
import { loadQuestions, loadSyllabus, buildSyllabusOrder } from "./data.js";
import { createFilterState, buildFilterUI, updateFilterOptions, applyFilters, sortQuestions } from "./filters.js";
import { renderQuestion, markdownToHtml, getPrompt } from "./renderer.js";
import { AnalysisEngine } from "./analysis.js";
import { initBookmarks, isBookmarked, toggleBookmark, getBookmarkCount, getBookmarkedIds, onChange as onBookmarkChange } from "./bookmarks.js";
import { initPracticed, togglePracticeState, onChange as onPracticeChange } from "./practiced.js";
const state = {
  questions: [], syllabus: null, syllabusOrder: null, analysis: null,
  filters: createFilterState(), renderToken: 0, currentResults: [],
  bookmarkFilterActive: false,
};

const els = {
  search: document.querySelector("#searchInput"),
  exam: document.querySelector("#examFilter"),
  practice: document.querySelector("#practiceFilter"),
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
  print: document.querySelector("#printBtn"),
  version: document.querySelector("#appVersion"),
  bookmarkFilter: document.querySelector("#bookmarkFilterBtn"),
  bookmarkCount: document.querySelector("#bookmarkCount")
};

let searchTimer = 0;
let mathObserver;

async function init() {
  try {
    if (els.version) els.version.textContent = `v${CONFIG.version}`;
    await initBookmarks();
    await initPracticed();
    updateBookmarkBadge();
    onBookmarkChange(updateBookmarkBadge);
    onPracticeChange(() => {
      // Re-render if filter is active
      if (state.filters.practice !== "all") render();
    });
    [state.questions, state.syllabus] = await Promise.all([loadQuestions(), loadSyllabus()]);
    state.syllabusOrder = buildSyllabusOrder(state.syllabus);
    // Build the lightweight lexical index up front; the semantic model/index is loaded lazily.
    state.analysis = new AnalysisEngine(state.questions);
    state.analysis.warmSemantic?.();

    buildFilterUI(els.filters, state.filters, onFilterChange);
    updateFilterOptions(state.questions, els.filters, state.filters, state.syllabusOrder);

    mathObserver = new IntersectionObserver(onRowsVisible, { rootMargin: "700px 0px" });

    // Deep-link support: the shared site shell points here with ?bookmarks=1.
    // Activate the bookmark view after IndexedDB is ready so navigation from any tab
    // opens the actual bookmarked-question list rather than just the repository.
    const params = new URLSearchParams(window.location.search);
    const bookmarkView = params.get("bookmarks") === "1" || window.location.hash === "#bookmarks";
    if (bookmarkView) {
      state.bookmarkFilterActive = true;
      els.bookmarkFilter?.classList.add("active");
    }

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

  let results = sortQuestions(applyFilters(state.questions, state.filters), state.filters, state.syllabusOrder);
  // When bookmark filter is active, show only bookmarked questions
  if (state.bookmarkFilterActive) {
    const ids = getBookmarkedIds();
    results = results.filter(q => ids.has(q.id));
  }
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
    const response = await fetch(img.src);
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

let html2canvasPromise = null;

function ensureHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (!html2canvasPromise) {
    html2canvasPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
      script.crossOrigin = "anonymous";
      script.onload = () => resolve(window.html2canvas);
      script.onerror = () => {
        html2canvasPromise = null; // Allow retry on transient failure
        reject(new Error("Failed to load html2canvas library"));
      };
      document.head.appendChild(script);
    });
  }
  return html2canvasPromise;
}

async function prepareQuestionCardClone(qContent) {
  const clone = qContent.cloneNode(true);

  // 1. Process diagram figure images
  const origImgs = Array.from(qContent.querySelectorAll("img"));
  const cloneImgs = Array.from(clone.querySelectorAll("img"));

  await Promise.all(cloneImgs.map(async (cImg, idx) => {
    cImg.removeAttribute("loading");
    cImg.setAttribute("loading", "eager");

    const orig = origImgs[idx];
    if (!orig) return;

    if (!orig.complete) {
      await new Promise(r => {
        orig.onload = orig.onerror = r;
        setTimeout(r, 1000);
      });
    }

    if (orig.naturalWidth > 0) {
      try {
        const cvs = document.createElement("canvas");
        cvs.width = orig.naturalWidth;
        cvs.height = orig.naturalHeight;
        const ctx = cvs.getContext("2d");
        ctx.drawImage(orig, 0, 0);
        cImg.src = cvs.toDataURL("image/png");
      } catch (e) {
        // Tainted canvas fallback: maintain existing crossOrigin/src for html2canvas to fetch via proxy/CORS
        cImg.crossOrigin = "anonymous";
        cImg.src = orig.currentSrc || orig.src;
      }
    }
  }));

  // 2. Convert MathJax SVGs to self-contained SVG Data URLs
  const mathCache = document.getElementById("MJX-SVG-global-cache");
  const globalDefs = mathCache ? mathCache.innerHTML : "";

  const containers = Array.from(clone.querySelectorAll("mjx-container"));
  containers.forEach(container => {
    const svg = container.querySelector("svg");
    if (!svg) return;

    const isDisplay = container.getAttribute("display") === "true";
    const vAlign = svg.style.verticalAlign || "0px";
    const w = svg.getAttribute("width") || svg.style.width || "auto";
    const h = svg.getAttribute("height") || svg.style.height || "auto";

    const svgClone = svg.cloneNode(true);
    svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svgClone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    svgClone.style.overflow = "visible";

    // Retain root em sizing baseline inside the standalone SVG
    const compStyle = window.getComputedStyle(svg);
    svgClone.style.fontSize = compStyle.fontSize || "16px";

    if (globalDefs && !svgClone.querySelector("defs")) {
      const defsEl = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      defsEl.innerHTML = globalDefs;
      svgClone.insertBefore(defsEl, svgClone.firstChild);
    }

    const svgXml = new XMLSerializer().serializeToString(svgClone);
    const svgDataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgXml);

    const mathImg = document.createElement("img");
    mathImg.className = "math-img";
    mathImg.src = svgDataUrl;
    mathImg.style.cssText = isDisplay
      ? `display: block; margin: 0.8em auto; max-width: 100%; height: ${h}; border: none !important; background: transparent !important;`
      : `display: inline-block; vertical-align: ${vAlign}; width: ${w}; height: ${h}; margin: 0 3px; border: none !important; background: transparent !important;`;

    container.parentNode.replaceChild(mathImg, container);
  });

  return clone;
}

async function copyQuestionAsImage(tr, button) {
  if (!navigator.clipboard?.write || typeof window.ClipboardItem === "undefined") {
    throw new Error("Image clipboard is not supported in this browser.");
  }
  const qContent = tr.querySelector(".q-content");
  if (!qContent) throw new Error("Question content not found");

  button?.classList.add("btn-loading");

  const width = Math.min(Math.max(qContent.offsetWidth || 760, 600), 920);

  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;left:-9999px;top:0;width:${width + 60}px;height:1200px;border:0;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(iframe);

  try {
    const h2c = await ensureHtml2Canvas();
    const doc = iframe.contentDocument || iframe.contentWindow.document;

    const preparedClone = await prepareQuestionCardClone(qContent);

    doc.open();
    doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body { background: #ffffff; margin: 0; padding: 22px 26px; font-family: Inter, system-ui, sans-serif; color: #0f172a; width: ${width}px; }
    .question-main { font-family: "Source Serif 4", Georgia, serif; font-size: 16px; line-height: 1.62; color: #0f172a; }
    .question-main p { margin: 0.2em 0 0.7em; }
    .question-main p:last-child { margin-bottom: 0; }
    .question-main ol, .question-main ul { margin: 0.3em 0 0.7em; padding-left: 24px; }
    .question-main img:not(.math-img) { display: block; max-width: min(100%, 620px); max-height: 480px; object-fit: contain; margin: 12px 0; border: 1px solid #e2e8f0; border-radius: 7px; background: #fff; }
    .math-img { border: none !important; background: transparent !important; border-radius: 0 !important; padding: 0 !important; box-shadow: none !important; }
    .question-meta { display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; margin-top: 14px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-family: Inter, system-ui, sans-serif; font-size: 12px; color: #64748b; line-height: 1.45; }
    .meta-left { min-width: 0; }
    .meta-left span { display: inline-block; }
    .meta-left span + span:before { content: " · "; margin: 0 4px; color: #94a3b8; }
    .meta-right { text-align: right; white-space: nowrap; }
    .exam { font-weight: 700; color: #334155; font-size: 12.5px; }
  </style>
</head>
<body>
  <div id="card-root">${preparedClone.innerHTML}</div>
</body>
</html>`);
    doc.close();

    // 1. Await dynamic font settlement to prevent layout jitter
    if (doc.fonts?.ready) {
      await Promise.race([
        doc.fonts.ready,
        new Promise(r => setTimeout(r, 1200))
      ]);
    }

    // 2. Ensure all clone and math SVG images are fully decoded
    const allImages = Array.from(doc.querySelectorAll("img"));
    await Promise.all(allImages.map(img => {
      img.removeAttribute("loading");
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(res => {
        img.onload = img.onerror = res;
        setTimeout(res, 800);
      });
    }));

    const cardRoot = doc.getElementById("card-root");

    const canvas = await h2c(cardRoot, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
      allowTaint: false,
      imageTimeout: 3000
    });

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        b => b ? resolve(b) : reject(new Error("Failed to create image blob")),
        "image/png"
      );
    });

    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob })
    ]);

    if (typeof showToast === "function") {
      showToast("Question image copied to clipboard!");
    }
    button?.classList.add("copied");
    setTimeout(() => button?.classList.remove("copied"), 1200);
  } finally {
    iframe.remove();
    button?.classList.remove("btn-loading");
  }
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
  state.bookmarkFilterActive = false;
  els.bookmarkFilter?.classList.remove("active");
  els.search.value = "";
  els.search.closest(".search-box")?._close?.();
  els.exam.value = "both";
  if (els.practice) els.practice.value = "all";
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

// Collapsible search on small screens: click icon to expand to full width, blur to collapse
(function() {
  const searchBox = els.search.closest(".search-box");
  const toolbarRow = searchBox?.closest(".toolbar-row");
  if (!searchBox) return;

  function openSearch() {
    searchBox.classList.add("search-open");
    toolbarRow?.classList.add("search-active");
    els.search.focus();
  }
  function closeSearch() {
    searchBox.classList.remove("search-open");
    toolbarRow?.classList.remove("search-active");
  }

  searchBox.addEventListener("click", () => {
    if (!searchBox.classList.contains("search-open")) openSearch();
  });
  els.search.addEventListener("blur", () => {
    if (!els.search.value) closeSearch();
  });
  // Expose so reset() can collapse the search bar
  searchBox._close = closeSearch;
})();
els.exam.addEventListener("change", () => {
  state.filters.exam = els.exam.value;
  updateFilterOptions(state.questions, els.filters, state.filters, state.syllabusOrder);
  render();
});
if (els.practice) {
  els.practice.addEventListener("change", () => {
    state.filters.practice = els.practice.value;
    updateFilterOptions(state.questions, els.filters, state.filters, state.syllabusOrder);
    render();
  });
}
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

  // Bookmark toggle
  const bmBtn = e.target.closest(".bookmark-btn");
  if (bmBtn) {
    handleBookmarkClick(bmBtn, q);
    return;
  }

  // Practice toggle
  const prBtn = e.target.closest(".practice-btn");
  if (prBtn) {
    handlePracticeClick(prBtn, q);
    return;
  }

  const copy = e.target.closest(".copy-btn");
  if (copy) {
    copyRichQuestion(q, copy, false).catch(error => showToast(error.message || "Could not copy question", true));
    return;
  }

  const copyImg = e.target.closest(".copy-img-btn");
  if (copyImg) {
    copyQuestionAsImage(tr, copyImg).catch(error => showToast(error.message || "Could not copy question image", true));
    return;
  }

  const analysisButton = e.target.closest(".analysis-btn");
  if (analysisButton) toggleAnalysis(tr, q, analysisButton);
});

async function handleBookmarkClick(btn, q) {
  const nowBookmarked = await toggleBookmark(q.id);
  btn.classList.toggle("active", nowBookmarked);
  btn.setAttribute("aria-pressed", String(nowBookmarked));
  btn.setAttribute("title", nowBookmarked ? "Remove bookmark" : "Bookmark this question");
  btn.innerHTML = nowBookmarked
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="currentColor"></path></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
  showToast(nowBookmarked ? "Bookmarked" : "Bookmark removed");
  // If viewing bookmarks and just unbookmarked, re-render to remove from view
  if (state.bookmarkFilterActive && !nowBookmarked) render();
}

import { getPracticeIcon } from "./renderer.js";

async function handlePracticeClick(btn, q) {
  const newState = await togglePracticeState(q.id);
  btn.className = `practice-btn${newState === 1 ? " solved" : (newState === 2 ? " doubt" : "")}`;
  btn.setAttribute("title", newState === 1 ? "Solved" : (newState === 2 ? "Doubt" : "Unchecked"));
  btn.innerHTML = getPracticeIcon(newState);
  const toastMsg = newState === 1 ? "Marked as Solved" : (newState === 2 ? "Marked as Doubt" : "Practice state cleared");
  showToast(toastMsg);
  if (state.filters.practice !== "all") render();
}

function updateBookmarkBadge() {
  const count = getBookmarkCount();
  if (els.bookmarkCount) {
    els.bookmarkCount.textContent = count;
    els.bookmarkCount.hidden = count === 0;
  }
}

els.bookmarkFilter?.addEventListener("click", () => {
  state.bookmarkFilterActive = !state.bookmarkFilterActive;
  els.bookmarkFilter.classList.toggle("active", state.bookmarkFilterActive);
  render();
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
          const matchLabel = score >= 35 ? "Direct Repeat" : "Strong Overlap";
          const matchClass = score >= 35 ? "direct-repeat" : "strong-overlap";
          return `<article class="analysis-related-item">
            <div class="analysis-related-meta">
              <span class="analysis-rank">${i + 1}</span>
              <strong>${escapeHtml(displayExam(q.exam))} ${escapeHtml(q.year)}</strong>
              <span class="analysis-marks">${escapeHtml(displayMarks(q.marks))}</span>
              <span>${escapeHtml(q.unit || "—")} · ${escapeHtml(q.section || "—")}</span>
              <span class="analysis-score ${matchClass}" title="${score}% match">${matchLabel}</span>
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
  if (f.search) items.push({ label: "Search", value: els.search.value.trim() });
  if (f.mode === "year-unit") {
    if (f.year) items.push({ label: "Year", value: f.year });
    if (f.unit) items.push({ label: "Unit", value: f.unit });
  } else {
    if (f.unit) items.push({ label: "Unit", value: f.unit });
    if (f.section) items.push({ label: "Section", value: f.section });
    if (f.topic) items.push({ label: "Topic", value: f.topic });
  }
  let examVal = "CSE + IFoS";
  if (f.exam && f.exam !== "both") examVal = f.exam === "IFOS" ? "IFoS" : "CSE";
  return { items, exam: examVal };
}

async function printCurrentQuestions() {
  const questions = state.currentResults || [];
  if (!questions.length) { showToast("No questions to print", true); return; }
  const tokenAtStart = state.renderToken;
  const originalText = els.print?.textContent || "Print Friendly";
  if (els.print) { els.print.disabled = true; els.print.textContent = "Preparing…"; }
  try {
    const printRoot = document.createElement("section");
    printRoot.id = "printRoot";
    printRoot.className = "print-root";
    const title = document.createElement("div"); title.className = "print-title";
    const heading = document.createElement("div"); heading.className = "print-heading";
    heading.innerHTML = `<strong>Tutorial Sheet</strong>`;
    title.appendChild(heading);
    
    const filterData = getPrintFilterSummary();
    const summary = document.createElement("div"); summary.className = "print-filters";
    
    const leftSide = filterData.items.map(item => `${escapeHtml(item.label)}: <strong>${escapeHtml(item.value)}</strong>`).join(" | ");
    const rightSide = `Exam: <strong>${escapeHtml(filterData.exam)}</strong>`;
    
    summary.innerHTML = `<div>${leftSide}</div><div>${rightSide}</div>`;
    title.appendChild(summary); printRoot.appendChild(title);
    // Build directly from data so printing never depends on progressive DOM completion.
    // Sort questions by Smart Order (Syllabus Order) to ensure they are grouped properly for the Tutorial Sheet
    const printQuestions = sortQuestions([...questions], { sort: "smart", mode: "unit-section-topic" }, state.syllabusOrder);

    const uniqueSections = new Set(printQuestions.map(q => q.section || q.unit || "General"));
    const uniqueTopics = new Set(printQuestions.map(q => q._topics?.join(", ")).filter(Boolean));
    const showSections = uniqueSections.size > 1 || uniqueTopics.size > 1;
    const showTopics = uniqueTopics.size > 1;
    let currentSection = null;
    let currentTopic = null;

    for (let i=0;i<printQuestions.length;i++) {
      if (tokenAtStart !== state.renderToken) return;
      const q=printQuestions[i];
      
      const secKey = q.section || q.unit || "General";
      const topKey = q._topics?.join(", ");
      
      if (showSections && secKey !== currentSection) {
        currentSection = secKey;
        currentTopic = null; // reset topic for new section
        const header = document.createElement("div");
        header.className = "print-section-header";
        header.textContent = currentSection;
        printRoot.appendChild(header);
      }
      
      if (showTopics && topKey && topKey !== currentTopic) {
        currentTopic = topKey;
        const subHeader = document.createElement("div");
        subHeader.className = "print-topic-header";
        subHeader.textContent = currentTopic;
        printRoot.appendChild(subHeader);
      }
      
      const article=document.createElement("article"); article.className="print-question";
      article.innerHTML=`<div class="print-number">${i+1}.</div>`;
      const body=document.createElement("div"); body.className="print-question-body";
      body.innerHTML=markdownToHtml(q.question_markdown || "", q.images || []);
      const meta=document.createElement("div"); meta.className="print-meta";
      meta.innerHTML=`<strong>${escapeHtml(q.exam || "—")} | ${escapeHtml(q.year || "—")} | ${escapeHtml(q.marks || "—")}</strong>`;
      body.appendChild(meta); article.appendChild(body); printRoot.appendChild(article);
    }
    const footer=document.createElement("div"); footer.className="print-footer";
    footer.style.cssText = "margin: 25pt auto 0; width: 60%; border-top: 2.5px solid #111; padding-top: 8pt; text-align: center; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #333;";
    footer.innerHTML="Generated by UPSC PhysicsHub"; printRoot.appendChild(footer);
    document.body.appendChild(printRoot); document.documentElement.classList.add("printing-ready");
    const imgs=[...printRoot.querySelectorAll("img")];
    await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{
      img.onload=img.onerror=resolve;
      setTimeout(resolve, 1000);
    })));
    if (window.MathJax?.typesetPromise) {
      await (window.MathJax.startup?.promise || Promise.resolve());
      await window.MathJax.typesetPromise([printRoot]);
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (tokenAtStart !== state.renderToken) return;
    window.print();
  } catch(error) { console.error("Print preparation failed",error); showToast("Could not prepare print view",true); }
  finally { document.documentElement.classList.remove("printing-ready"); document.getElementById("printRoot")?.remove(); if(els.print){els.print.disabled=false;els.print.textContent=originalText;} }
}

els.print?.addEventListener("click", printCurrentQuestions);

init();
