const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));

export function renderQuestion(q, number) {
  const tr = document.createElement("tr");
  tr.dataset.id = q.id;
  const prompt = makePrompt(q);
  tr.innerHTML = `
    <td class="q-number" aria-label="Question number">${number}</td>
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
        <button class="ai-btn copy-btn" type="button" title="Copy question + figure" aria-label="Copy question + figure">${copyIcon()}</button>
        <button class="ai-btn chatgpt" type="button" title="Open ChatGPT with question" aria-label="Open ChatGPT with question">${openAIIcon()}</button>
        <button class="ai-btn gemini" type="button" title="Open Gemini with question" aria-label="Open Gemini with question">${geminiIcon()}</button>
      </div>
    </td>`;
  tr._question = q;
  tr.querySelector(".copy-btn")._question = q;
  tr.querySelector(".chatgpt")._question = q;
  tr.querySelector(".gemini")._question = q;
  return tr;
}

export function renderQuestions(questions) {
  const fragment = document.createDocumentFragment();
  questions.forEach((q, i) => fragment.appendChild(renderQuestion(q, i + 1)));
  return fragment;
}

function makePrompt(q) {
  return `Solve this UPSC Physics Optional previous-year question step-by-step. Explain the physical reasoning, assumptions, relevant equations/derivation, and final answer. Present the solution in an exam-oriented manner.\n\nQuestion:\n${q.question_markdown || ""}`;
}

export function getPrompt(q) { return makePrompt(q); }

export function markdownToHtml(md, images) {
  let s = esc(md);
  s = s.replace(/&lt;(sup|sub)&gt;([\s\S]*?)&lt;\/\1&gt;/gi, '<$1>$2</$1>');
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const file = src.split("/").pop();
    const actual = images.find(x => x.split("/").pop() === file) || file;
    return `<img src="data/images/${encodeURIComponent(actual)}" alt="${esc(alt || "Question figure")}" loading="lazy" decoding="async">`;
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

function copyIcon(){return `<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"></path></svg>`}
function openAIIcon(){return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.4 8.1a5.1 5.1 0 0 0-8.8-1.7 5.1 5.1 0 0 0-4.1 7.3 5.1 5.1 0 0 0 4.9 7.1 5.1 5.1 0 0 0 6.1-3.8 5.1 5.1 0 0 0 1.9-8.9Z" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.6 6.4 14.8 10m-10 3.8 6.2 3.6m-.1-11.1v7.2m6.4-3.3-6.3 3.6m6.3-3.6v7.2" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/></svg>`}
function geminiIcon(){return `<svg viewBox="0 0 24 24"><path d="M12 2c.8 5.3 3.7 8.2 9 9-5.3.8-8.2 3.7-9 9-.8-5.3-3.7-8.2-9-9 5.3-.8 8.2-3.7 9-9Z"/></svg>`}
