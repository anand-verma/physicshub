/**
 * notes-index.js
 * Drives the Notes hub page (notes/index.html).
 * Reads notes-manifest.json, builds unit cards with section links.
 * Links are enabled/disabled based on the `available` flag.
 */

const MANIFEST_URL = "./notes-manifest.json";

async function init() {
  const container = document.getElementById("notesGrid");
  if (!container) return;

  let manifest;
  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
  } catch (e) {
    container.innerHTML = `<p style="color:#a33b3b;padding:24px">Failed to load notes manifest: ${e.message}</p>`;
    return;
  }

  // Group by paper
  const paper1 = manifest.units.filter(u => u.paper === 1);
  const paper2 = manifest.units.filter(u => u.paper === 2);

  container.innerHTML = "";

  renderPaperGroup(container, "Paper I", paper1);
  renderPaperGroup(container, "Paper II", paper2);
}

function renderPaperGroup(container, label, units) {
  const labelEl = document.createElement("div");
  labelEl.className = "paper-label";
  labelEl.textContent = label;
  container.appendChild(labelEl);

  units.forEach(unit => {
    container.appendChild(buildUnitCard(unit));
  });
}

function buildUnitCard(unit) {
  const card = document.createElement("div");
  card.className = "unit-card";

  // ── Header ──────────────────────────────────────────
  const head = document.createElement("div");
  head.className = "unit-card-head";

  const badge = document.createElement("div");
  badge.className = "unit-badge";
  badge.textContent = unit.code;

  const title = document.createElement("h2");
  title.textContent = unit.name;

  // Formula sheet link
  const fsLink = document.createElement("a");
  fsLink.className = "unit-formula-link" + (unit.formulaSheet.available ? "" : " disabled");
  if (unit.formulaSheet.available) {
    fsLink.href = `viewer.html?note=${unit.slug}/${unit.formulaSheet.file}`;
  } else {
    fsLink.setAttribute("aria-disabled", "true");
  }
  fsLink.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><path d="M9 12h6M9 16h4"/></svg>
    Formula Sheet`;
  if (!unit.formulaSheet.available) fsLink.title = "Coming soon";

  head.append(badge, title, fsLink);

  // ── Section rows ────────────────────────────────────
  const sectionsEl = document.createElement("div");
  sectionsEl.className = "unit-sections";

  unit.sections.forEach(sec => {
    const row = document.createElement("div");
    row.className = "section-row";

    const codeBadge = document.createElement("span");
    codeBadge.className = "section-code-badge";
    codeBadge.textContent = sec.code;

    const link = document.createElement("a");
    link.className = "section-link" + (sec.available ? "" : " disabled-link");
    link.textContent = sec.name;

    if (sec.available) {
      link.href = `viewer.html?note=${unit.slug}/${sec.file}`;
    } else {
      link.setAttribute("aria-disabled", "true");
      link.removeAttribute("href");
    }

    row.append(codeBadge, link);

    if (!sec.available) {
      const chip = document.createElement("span");
      chip.className = "coming-soon-chip";
      chip.textContent = "Coming soon";
      row.appendChild(chip);
    }

    sectionsEl.appendChild(row);
  });

  card.append(head, sectionsEl);
  return card;
}

document.addEventListener("DOMContentLoaded", init);
