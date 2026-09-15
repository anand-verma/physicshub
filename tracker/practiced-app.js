import { loadQuestions, loadSyllabus } from "../assets/js/data.js";
import { initPracticed, getPracticeState } from "../assets/js/practiced.js";

let questions = [];
let syllabus = [];

async function init() {
  try {
    await initPracticed();
    
    // Load syllabus and questions
    const [qData, sData] = await Promise.all([loadQuestions(), loadSyllabus()]);
    questions = qData;
    
    // Flatten both papers into one units array
    syllabus = [
      ...(sData.physics_syllabus_taxonomy?.paper_1?.units || []),
      ...(sData.physics_syllabus_taxonomy?.paper_2?.units || [])
    ];
    
    renderTable();
    updateStats();
    
    document.getElementById("loading").hidden = true;
    document.getElementById("trackerContent").hidden = false;
  } catch (err) {
    document.getElementById("loading").innerHTML = `<div class="prose-error">Error loading statistics: ${err.message}</div>`;
  }
}

function processStats() {
  // Stats by Unit -> Section -> Topic
  const stats = { total: 0, solved: 0, doubt: 0, unsolved: 0, units: {} };
  
  // Initialize from syllabus
  for (const u of syllabus) {
    stats.units[u.unit_name] = { total: 0, solved: 0, doubt: 0, unsolved: 0, sections: {}, code: u.unit_code };
    for (const s of u.sections || []) {
      stats.units[u.unit_name].sections[s.section_name] = { total: 0, solved: 0, doubt: 0, unsolved: 0, topics: {}, code: s.section_code };
      for (const t of s.topics || []) {
        stats.units[u.unit_name].sections[s.section_name].topics[t] = { total: 0, solved: 0, doubt: 0, unsolved: 0 };
      }
    }
  }

  // Calculate from questions
  for (const q of questions) {
    const state = getPracticeState(q.id);
    const isSolved = state === 1;
    const isDoubt = state === 2;
    const isUnsolved = state === 0;

    stats.total++;
    if (isSolved) stats.solved++;
    if (isDoubt) stats.doubt++;
    if (isUnsolved) stats.unsolved++;

    const u = q.unit;
    const s = q.section;
    const topics = q._topics && q._topics.length ? q._topics : ["Untagged"];

    if (u && stats.units[u]) {
      const uStat = stats.units[u];
      uStat.total++;
      if (isSolved) uStat.solved++;
      if (isDoubt) uStat.doubt++;
      if (isUnsolved) uStat.unsolved++;

      if (s && uStat.sections[s]) {
        const sStat = uStat.sections[s];
        sStat.total++;
        if (isSolved) sStat.solved++;
        if (isDoubt) sStat.doubt++;
        if (isUnsolved) sStat.unsolved++;

        for (const t of topics) {
          if (!sStat.topics[t]) sStat.topics[t] = { total: 0, solved: 0, doubt: 0, unsolved: 0 };
          const tStat = sStat.topics[t];
          tStat.total++;
          if (isSolved) tStat.solved++;
          if (isDoubt) tStat.doubt++;
          if (isUnsolved) tStat.unsolved++;
        }
      }
    }
  }
  
  return stats;
}

function renderTable() {
  const tbody = document.getElementById("trackerBody");
  const stats = processStats();
  let html = "";
  
  for (const [uName, uStat] of Object.entries(stats.units)) {
    if (uStat.total === 0) continue; // Skip empty units

    // Unit Header Row
    html += `
      <tr class="unit-row" data-unit="${uStat.code}" onclick="toggleUnit('${uStat.code}')">
        <td class="col-name">
          <div class="unit-title-cell">
            <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
            <span class="unit-code">${uStat.code}</span>
            <span>${uName}</span>
          </div>
        </td>
        <td><strong>${uStat.total}</strong></td>
        <td><span class="stats-badge badge-solved">${uStat.solved}</span></td>
        <td><span class="stats-badge badge-doubt">${uStat.doubt}</span></td>
        <td><span class="stats-badge badge-unsolved">${uStat.unsolved}</span></td>
      </tr>
    `;
    
    // Section Rows
    for (const [sName, sStat] of Object.entries(uStat.sections)) {
      if (sStat.total === 0) continue;
      
      html += `
        <tr class="section-row unit-${uStat.code}" data-section="${uStat.code}-${sStat.code}" onclick="toggleSectionRow('${uStat.code}-${sStat.code}')">
          <td class="col-name">
            <div class="section-title-cell" style="cursor: pointer;">
              <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              <span class="section-code">${sStat.code}</span>
              <span>${sName}</span>
            </div>
          </td>
          <td>${sStat.total}</td>
          <td><span class="stats-badge badge-solved">${sStat.solved}</span></td>
          <td><span class="stats-badge badge-doubt">${sStat.doubt}</span></td>
          <td><span class="stats-badge badge-unsolved">${sStat.unsolved}</span></td>
        </tr>
      `;

      // Topic Rows
      for (const [tName, tStat] of Object.entries(sStat.topics)) {
        if (tStat.total === 0) continue;
        
        html += `
          <tr class="topic-row section-${uStat.code}-${sStat.code} hidden">
            <td class="col-name" style="padding-left: 50px; font-size: 11.5px; color: #475569;">
              ${tName}
            </td>
            <td style="font-size:11.5px;">${tStat.total}</td>
            <td><span class="stats-badge badge-solved" style="transform: scale(0.85);">${tStat.solved}</span></td>
            <td><span class="stats-badge badge-doubt" style="transform: scale(0.85);">${tStat.doubt}</span></td>
            <td><span class="stats-badge badge-unsolved" style="transform: scale(0.85);">${tStat.unsolved}</span></td>
          </tr>
        `;
      }
    }
  }
  
  tbody.innerHTML = html;
}

window.toggleUnit = (uCode) => {
  const row = document.querySelector(`tr[data-unit="${uCode}"]`);
  row.classList.toggle("collapsed");
  const isCollapsed = row.classList.contains("collapsed");
  
  // Toggle sections
  const sections = document.querySelectorAll(`.section-row.unit-${uCode}`);
  sections.forEach(s => {
    s.classList.toggle("hidden", isCollapsed);
    if (isCollapsed) {
      // Force collapse topics if unit collapses
      s.classList.add("collapsed");
      const sectionCode = s.dataset.section;
      document.querySelectorAll(`.topic-row.section-${sectionCode}`).forEach(t => t.classList.add("hidden"));
    }
  });
};

window.toggleSectionRow = (sectionCode) => {
  const row = document.querySelector(`tr[data-section="${sectionCode}"]`);
  // Prevent click propagation if we click elsewhere? Not needed if on cell
  row.classList.toggle("collapsed");
  const topics = document.querySelectorAll(`.topic-row.section-${sectionCode}`);
  const isCollapsed = row.classList.contains("collapsed");
  topics.forEach(t => t.classList.toggle("hidden", isCollapsed));
};

function updateStats() {
  const stats = processStats();
  
  const pctSolved = stats.total === 0 ? 0 : (stats.solved / stats.total) * 100;
  const pctDoubt = stats.total === 0 ? 0 : (stats.doubt / stats.total) * 100;
  
  document.getElementById("progressFill").style.width = `${pctSolved}%`;
  // Doubt bar floats next to solved using CSS floats or flex, wait, I can just set its width
  // progress-bar-bg is position relative, I'll set left to offset solved
  const doubtFill = document.getElementById("progressFillDoubt");
  doubtFill.style.width = `${pctDoubt}%`;
  doubtFill.style.left = `${pctSolved}%`;

  document.getElementById("progressText").textContent = `${Math.round(pctSolved)}% Solved`;
  document.getElementById("statsSummary").textContent = 
    `Solved: ${stats.solved} · Doubt: ${stats.doubt} · Unsolved: ${stats.unsolved}`;
}

// Quick CSS fix for progress bar positioning
const style = document.createElement('style');
style.textContent = `
  .progress-bar-fill { position: absolute; top: 0; bottom: 0; left: 0; }
  .section-row.hidden, .topic-row.hidden { display: none; }
  .topic-row td { border-bottom-color: #f1f5f9; }
  .section-title-cell { display: flex; align-items: center; gap: 8px; }
  .section-title-cell .collapse-icon { width: 14px; height: 14px; transition: transform 0.2s; opacity: 0.6; }
  .section-row.collapsed .collapse-icon { transform: rotate(-90deg); }
`;
document.head.appendChild(style);

document.addEventListener("DOMContentLoaded", init);
