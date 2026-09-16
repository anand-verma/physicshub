import { isBookmarked } from "./bookmarks.js";
import { getPracticeState } from "./practiced.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

export function renderQuestion(q, number) {
  const tr = document.createElement("tr");
  tr.dataset.id = q.id;
  const prompt = makePrompt(q);
  const fullPrompt = `${prompt}\n\nExam: ${q.exam || "—"} | Year: ${q.year || "—"} | Marks: ${q.marks || "—"}`;
  const encoded = encodeURIComponent(fullPrompt);
  const chatgptTarget = `https://chatgpt.com/?q=${encoded}`;
  const bookmarked = isBookmarked(q.id);
  const practiceState = getPracticeState(q.id);
  const practiceClass = practiceState === 1 ? " solved" : (practiceState === 2 ? " doubt" : "");
  const practiceTitle = practiceState === 1 ? "Solved" : (practiceState === 2 ? "Doubt" : "Unchecked");

  tr.innerHTML = `
    <td class="q-number" aria-label="Question number">
      ${number}
      <button class="bookmark-btn${bookmarked ? " active" : ""}" type="button" data-id="${esc(q.id)}" title="${bookmarked ? "Remove bookmark" : "Bookmark this question"}" aria-label="${bookmarked ? "Remove bookmark" : "Bookmark this question"}" aria-pressed="${bookmarked}">
        ${bookmarked ? bookmarkFilledIcon() : bookmarkOutlineIcon()}
      </button>
      <button class="practice-btn${practiceClass}" type="button" data-id="${esc(q.id)}" title="${practiceTitle}" aria-label="Mark practice state">
        ${getPracticeIcon(practiceState)}
      </button>
    </td>
    <td class="q-content">
      <div class="question-main" data-question-body>${markdownToHtml(q.question_markdown || "", q.images || [])}</div>
      <div class="question-meta">
        <div class="meta-left">
          <span>${esc(q.unit || "—")}</span>
          <span>${esc(q.section || "—")}</span>
          <span>${esc(q._topics.join(", ") || "Topic not tagged")}</span>
        </div>
        <div class="meta-right"><span class="exam">${esc(q.exam)} | ${esc(q.year)} | ${esc(q.marks || "—")}</span></div>
      </div>
    </td>
    <td class="actions-cell">
      <div class="ai-actions">
        <button class="ai-btn copy-btn" type="button" title="Copy question text + figure" aria-label="Copy question text + figure">${copyTextIcon()}</button>
        <button class="ai-btn copy-img-btn" type="button" title="Copy question as image" aria-label="Copy question as image">${copyImageIcon()}</button>
        <a class="ai-btn chatgpt" href="${chatgptTarget}" target="_blank" rel="noopener noreferrer" title="Open ChatGPT with question" aria-label="Open ChatGPT with question">${openAIIcon()}</a>
        <button class="ai-btn analysis-btn" type="button" title="Analyse similar PYQs" aria-label="Analyse similar PYQs">${analysisIcon()}</button>
      </div>
    </td>`;
  tr._question = q;
  return tr;
}

export function renderQuestions(questions) {
  const fragment = document.createDocumentFragment();
  questions.forEach((q, i) => fragment.appendChild(renderQuestion(q, i + 1)));
  return fragment;
}

function makePrompt(q) {
  return `Solve this UPSC Physics Optional previous-year question step-by-step. Explain the physical reasoning, assumptions, relevant equations/derivation, and final answer with physical interpretation. Present the solution in an exam-oriented manner.\n\nQuestion:\n${q.question_markdown || ""}`;
}

export function getPrompt(q) { return makePrompt(q); }

export function markdownToHtml(md, images) {
  let s = esc(md);
  s = s.replace(/&lt;(sup|sub)&gt;([\s\S]*?)&lt;\/\1&gt;/gi, '<$1>$2</$1>');
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const file = src.split("/").pop();
    const actual = images.find(x => x.split("/").pop() === file) || file;
    // Resolve images from this shared module's location so the same renderer
    // works from the repository, Notes, Tracker and QCAB subdirectories.
    const imageUrl = new URL(`../../data/images/${encodeURIComponent(actual)}`, import.meta.url).href;
    return `<img src="${imageUrl}" alt="${esc(alt || "Question figure")}" loading="lazy" decoding="async">`;
  });
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, "\\[$1\\]");
  s = s.replace(/(^|\n)\s*[-*]\s+(.+?)(?=\n|$)/g, "$1• $2");
  s = s.replace(/(^|\n)\s*\((i{1,3}|iv|v|vi{0,3})\)\s+/gi, "$1<strong>($2)</strong> ");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return s.split(/\n{2,}/).map(block =>
    block.includes("<img") || block.startsWith("•") || block.startsWith("<strong>")
      ? block.replace(/\n/g, "<br>")
      : `<p>${block.replace(/\n/g, "<br>")}</p>`
  ).join("");
}

function copyTextIcon(){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`}
function copyImageIcon(){return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`}
function openAIIcon(){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9 6.06 6.06 0 0 0-4.27 2.17 5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9 5.98 5.98 0 0 0 3.74 2 6.06 6.06 0 0 0 5.77-4.2 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.5zm-9.66-4.13a4.47 4.47 0 0 1-.53-3.01l.14.08 4.78 2.76a.77.77 0 0 0 .78 0l5.85-3.37v2.33a.08.08 0 0 1-.03.06L9.74 19.95a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.48 4.48 0 0 1 2.37-1.98v5.68a.77.77 0 0 0 .38.68l5.82 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.87zm16.6 3.85L13.1 8.36l2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.67a.79.79 0 0 0-.4-.67zm2.01-3.02l-.14-.09-4.78-2.78a.78.78 0 0 0-.78 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.79 2.76a.79.79 0 0 0-.39.68zm1.1-2.36l2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z"/></svg>`}
function analysisIcon(){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20h18"></path><path d="M6 18V9m4 9v-5m4 5V4m4 14V8"></path></svg>`}
function bookmarkOutlineIcon(){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`}
function bookmarkFilledIcon(){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="currentColor"></path></svg>`}

export function getPracticeIcon(state) {
  if (state === 1) {
    // Solved (Green tick)
    return `<svg viewBox="0 0 24 24" aria-hidden="true" class="icon-solved"><circle cx="12" cy="12" r="10" fill="currentColor"></circle><path d="M9 12l2 2 4-4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path></svg>`;
  } else if (state === 2) {
    // Doubt (Orange dash)
    return `<svg viewBox="0 0 24 24" aria-hidden="true" class="icon-doubt"><circle cx="12" cy="12" r="10" fill="currentColor"></circle><line x1="8" y1="12" x2="16" y2="12" stroke="white" stroke-width="2" stroke-linecap="round"></line></svg>`;
  } else {
    // Unchecked (empty circle)
    return `<svg viewBox="0 0 24 24" aria-hidden="true" class="icon-unchecked"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"></circle></svg>`;
  }
}
