/**
 * notes.js
 * Drives the note viewer page (notes/viewer.html).
 *
 * Flow:
 *  1. Parse ?note=<unit-slug>/<file> from query string
 *  2. Fetch notes-manifest.json to build navigation context
 *  3. Fetch content/<note>.md
 *  4. Parse markdown → HTML via marked.js
 *  5. Post-process GitHub-style alerts (> [!NOTE] etc.)
 *  6. Render equations via KaTeX auto-render
 *  7. Update breadcrumb, title, prev/next nav
 *  8. Wire up Print button (window.print())
 */

const MANIFEST_URL  = "./notes-manifest.json";
const CONTENT_BASE  = "./content/";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function qp(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/**
 * Convert GitHub-style alert blockquotes into styled blockquotes.
 * Matches lines like: > [!NOTE], > [!TIP], etc.
 */
function processAlerts(html) {
  const alertTypes = ["NOTE","TIP","IMPORTANT","WARNING","CAUTION"];
  let result = html;
  alertTypes.forEach(type => {
    const re = new RegExp(
      `<blockquote>\\s*<p>\\[!${type}\\](.*?)</blockquote>`,
      "gs"
    );
    result = result.replace(re, (_, body) => {
      const label = type.charAt(0) + type.slice(1).toLowerCase();
      return `<blockquote class="alert-${type.toLowerCase()}"><p><strong>${label}</strong>${body}</blockquote>`;
    });
  });
  return result;
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function init() {
  const noteParam = qp("note"); // e.g. "u1-mechanics/s1-particles"
  if (!noteParam) {
    showError("No note specified. <a href='index.html'>Browse all notes →</a>");
    return;
  }

  // Split into unit slug + file name
  const parts    = noteParam.split("/");
  const unitSlug = parts[0];
  const fileName = parts.slice(1).join("/");

  // Load manifest for nav context
  let manifest;
  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
  } catch (e) {
    showError(`Could not load manifest: ${escHtml(e.message)}`);
    return;
  }

  // Find current unit and section in manifest
  const unit    = manifest.units.find(u => u.slug === unitSlug);
  const isFormula = unit && unit.formulaSheet && unit.formulaSheet.file === fileName;
  const section = unit && !isFormula
    ? unit.sections.find(s => s.file === fileName)
    : null;

  // Determine friendly label for title/breadcrumb
  const noteLabel = isFormula
    ? `${unit.name} — Formula Sheet`
    : section
      ? section.name
      : fileName;

  // Build print document title
  const printTitle = isFormula
    ? `${unit ? unit.name : unitSlug} — Formula Sheet`
    : `${section ? section.name : fileName} — Short Notes`;
  document.title = `${printTitle} | Physics Notes`;

  // Update breadcrumb
  updateBreadcrumb(unit, section, isFormula);

  // Build flat ordered list of all notes for prev/next
  const ordered = buildOrderedNotes(manifest);
  const currentIndex = ordered.findIndex(n => n.note === noteParam);
  buildPrevNext(ordered, currentIndex);

  // Fetch the markdown file
  const mdUrl = `${CONTENT_BASE}${noteParam}.md`;
  let mdText;
  try {
    const res = await fetch(mdUrl);
    if (!res.ok) throw new Error(`Note file not found (HTTP ${res.status})`);
    mdText = await res.text();
  } catch (e) {
    showError(`Could not load note: ${escHtml(e.message)}`);
    return;
  }

  // Parse markdown → HTML, render math, then reveal content.
  // Wrapped in try/finally so the loading spinner ALWAYS hides.
  const proseEl = document.getElementById("proseContent");
  try {
    const rawHtml = marked.parse(mdText, { breaks: false });
    const processedHtml = processAlerts(rawHtml);
    proseEl.innerHTML = processedHtml;

    // Render math via KaTeX auto-render (own try/catch so a KaTeX error
    // doesn't block showing the rest of the note).
    try {
      if (window.renderMathInElement) {
        renderMathInElement(proseEl, {
          delimiters: [
            { left: "$$",   right: "$$",   display: true  },
            { left: "$",    right: "$",    display: false },
            { left: "\\[",  right: "\\]",  display: true  },
            { left: "\\(",  right: "\\)",  display: false }
          ],
          throwOnError: false,
          strict: false
        });
      }
    } catch (katexErr) {
      console.warn("KaTeX rendering error (equations may be unstyled):", katexErr);
    }
  } catch (renderErr) {
    console.error("Note render error:", renderErr);
    proseEl.innerHTML = `<div class="prose-error">Render error: ${escHtml(renderErr.message)}</div>`;
  } finally {
    // Always reveal content and hide spinner, no matter what
    window.__showProse?.();
  }

  // Wire Print button — sets document title for browser print header, then triggers print dialog
  const printBtn = document.getElementById("printNoteBtn");
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      const prevTitle = document.title;
      document.title = printTitle;
      window.print();
      setTimeout(() => { document.title = prevTitle; }, 500);
    });
  }
}

// ─────────────────────────────────────────────
// Breadcrumb
// ─────────────────────────────────────────────

function updateBreadcrumb(unit, section, isFormula) {
  const bc = document.getElementById("breadcrumb");
  if (!bc) return;

  let html = `<a href="index.html">Notes</a>`;

  if (unit) {
    html += `<span class="breadcrumb-sep">›</span>`;
    html += `<span>${escHtml(unit.name)}</span>`;
  }

  if (section || isFormula) {
    html += `<span class="breadcrumb-sep">›</span>`;
    if (isFormula) {
      html += `<span>Formula Sheet</span>`;
    } else {
      html += `<span>${escHtml(section.code + ": " + section.name)}</span>`;
    }
  }

  bc.innerHTML = html;
}

// ─────────────────────────────────────────────
// Prev / Next navigation
// ─────────────────────────────────────────────

function buildOrderedNotes(manifest) {
  const list = [];
  manifest.units.forEach(unit => {
    unit.sections.forEach(sec => {
      list.push({
        note:      `${unit.slug}/${sec.file}`,
        label:     sec.name,
        available: sec.available
      });
    });
    if (unit.formulaSheet) {
      list.push({
        note:      `${unit.slug}/${unit.formulaSheet.file}`,
        label:     `${unit.name} — Formula Sheet`,
        available: unit.formulaSheet.available
      });
    }
  });
  return list;
}

function buildPrevNext(ordered, currentIndex) {
  const prevBtn  = document.getElementById("prevNoteBtn");
  const nextBtn  = document.getElementById("nextNoteBtn");
  const prevLabel = document.getElementById("prevNoteLabel");
  const nextLabel = document.getElementById("nextNoteLabel");

  const prev = currentIndex > 0 ? ordered[currentIndex - 1] : null;
  const next = currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : null;

  if (prevBtn) {
    if (prev && prev.available) {
      prevBtn.href = `viewer.html?note=${prev.note}`;
      if (prevLabel) prevLabel.textContent = prev.label;
    } else {
      prevBtn.classList.add("disabled");
      if (prevLabel) prevLabel.textContent = "No previous";
    }
  }

  if (nextBtn) {
    if (next && next.available) {
      nextBtn.href = `viewer.html?note=${next.note}`;
      if (nextLabel) nextLabel.textContent = next.label;
    } else {
      nextBtn.classList.add("disabled");
      if (nextLabel) nextLabel.textContent = "No next";
    }
  }
}

// ─────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────

function showError(msg) {
  const proseEl = document.getElementById("proseContent");
  if (proseEl) {
    proseEl.innerHTML = `<div class="prose-error">${msg}</div>`;
    proseEl.hidden = false;
  }
  const loadEl = document.getElementById("proseLoading");
  if (loadEl) loadEl.hidden = true;
}

document.addEventListener("DOMContentLoaded", init);
