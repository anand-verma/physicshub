const DB_NAME = "PhysicsHubTracker";
const DB_VERSION = 1;
const STORE_NAME = "progress";

let db = null;
let syllabus = null;
const state = new Map(); // In-memory cache

// ─── IndexedDB Setup ────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txStore(mode) {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function initDB() {
  try {
    db = await openDB();
    const store = txStore("readonly");
    const keys = await idbRequest(store.getAllKeys());
    const values = await idbRequest(store.getAll());
    for (let i = 0; i < keys.length; i++) {
      state.set(keys[i], values[i]);
    }
  } catch (err) {
    console.warn("IndexedDB unavailable. Using memory only:", err);
  }
}

async function saveState(key, value) {
  state.set(key, value);
  if (db) {
    try {
      await idbRequest(txStore("readwrite").put(value, key));
    } catch (_) { /* ignore */ }
  }
  updateStats();
  updateUnitAggregates();
}

// ─── Data Loading ───────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch("../data/syllabus.json");
    if (!res.ok) throw new Error("Failed to load syllabus");
    const data = await res.json();
    
    // Flatten both papers into one units array
    syllabus = [
      ...data.physics_syllabus_taxonomy.paper_1.units,
      ...data.physics_syllabus_taxonomy.paper_2.units
    ];
    
    await initDB();
    renderTable();
    updateStats();
    
    // Hide loading
    document.getElementById("loading").hidden = true;
    document.getElementById("trackerContent").hidden = false;
  } catch (err) {
    document.getElementById("loading").innerHTML = `<div class="prose-error">Error loading tracker: ${err.message}</div>`;
  }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function getVal(key, defaultVal) {
  return state.has(key) ? state.get(key) : defaultVal;
}

function renderTable() {
  const tbody = document.getElementById("trackerBody");
  let html = "";
  
  for (const unit of syllabus) {
    const uCode = unit.unit_code;
    const formulaKey = `${uCode}.formulas`;
    const fChecked = getVal(formulaKey, false) ? "checked" : "";
    
    // Unit Header Row
    html += `
      <tr class="unit-row" data-unit="${uCode}" onclick="toggleUnit('${uCode}')">
        <td class="col-name">
          <div class="unit-title-cell">
            <svg class="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
            <span class="unit-code">${uCode}</span>
            <span>${unit.unit_name}</span>
          </div>
        </td>
        <td><span class="aggregate-text" id="agg-notes-${uCode}">0/${unit.sections.length}</span></td>
        <td onclick="event.stopPropagation()">
          <label class="custom-checkbox" title="Formula Sheet">
            <input type="checkbox" onchange="toggleFormula('${uCode}', this.checked)" ${fChecked}>
            <span class="checkmark"></span>
          </label>
        </td>
        <td><span class="aggregate-text" id="agg-cse-${uCode}">0/${unit.sections.length}</span></td>
        <td><span class="aggregate-text" id="agg-ifos-${uCode}">0/${unit.sections.length}</span></td>
        <td><span class="aggregate-text" id="agg-rev-${uCode}">Avg: 0</span></td>
      </tr>
    `;
    
    // Section Rows
    for (const sec of unit.sections) {
      const sCode = sec.section_code;
      const keyPrefix = `${uCode}.${sCode}`;
      
      const nChecked = getVal(`${keyPrefix}.notes`, false) ? "checked" : "";
      const cChecked = getVal(`${keyPrefix}.cse`, false) ? "checked" : "";
      const iChecked = getVal(`${keyPrefix}.ifos`, false) ? "checked" : "";
      const revCount = getVal(`${keyPrefix}.rev`, 0);
      const revClass = revCount >= 4 ? "rev-4" : `rev-${revCount}`;
      
      html += `
        <tr class="section-row unit-${uCode}">
          <td class="col-name">
            <div class="section-title-cell">
              <span class="section-code">${sCode}</span>
              <span>${sec.section_name}</span>
            </div>
          </td>
          <td>
            <label class="custom-checkbox">
              <input type="checkbox" onchange="toggleSection('${keyPrefix}', 'notes', this.checked)" ${nChecked}>
              <span class="checkmark"></span>
            </label>
          </td>
          <td><span class="aggregate-text">—</span></td>
          <td>
            <label class="custom-checkbox">
              <input type="checkbox" onchange="toggleSection('${keyPrefix}', 'cse', this.checked)" ${cChecked}>
              <span class="checkmark"></span>
            </label>
          </td>
          <td>
            <label class="custom-checkbox">
              <input type="checkbox" onchange="toggleSection('${keyPrefix}', 'ifos', this.checked)" ${iChecked}>
              <span class="checkmark"></span>
            </label>
          </td>
          <td>
            <div class="rev-counter ${revClass}" id="rev-${keyPrefix}">
              <button class="rev-btn" onclick="changeRev('${keyPrefix}', -1)">-</button>
              <span class="rev-count" id="rev-count-${keyPrefix}">${revCount}</span>
              <button class="rev-btn" onclick="changeRev('${keyPrefix}', 1)">+</button>
            </div>
          </td>
        </tr>
      `;
    }
  }
  
  tbody.innerHTML = html;
  updateUnitAggregates();
}

// ─── Interaction & Logic ────────────────────────────────────────────────────

window.toggleUnit = (uCode) => {
  const row = document.querySelector(`tr[data-unit="${uCode}"]`);
  row.classList.toggle("collapsed");
  const sections = document.querySelectorAll(`.section-row.unit-${uCode}`);
  const isCollapsed = row.classList.contains("collapsed");
  sections.forEach(s => s.classList.toggle("hidden", isCollapsed));
};

window.toggleFormula = (uCode, isChecked) => {
  saveState(`${uCode}.formulas`, isChecked);
};

window.toggleSection = (prefix, type, isChecked) => {
  saveState(`${prefix}.${type}`, isChecked);
};

window.changeRev = (prefix, delta) => {
  let val = getVal(`${prefix}.rev`, 0) + delta;
  if (val < 0) val = 0;
  
  saveState(`${prefix}.rev`, val);
  
  const span = document.getElementById(`rev-count-${prefix}`);
  const container = document.getElementById(`rev-${prefix}`);
  if (span && container) {
    span.textContent = val;
    container.className = `rev-counter ${val >= 4 ? "rev-4" : `rev-${val}`}`;
  }
};

function updateUnitAggregates() {
  for (const unit of syllabus) {
    const uCode = unit.unit_code;
    let n = 0, c = 0, i = 0, rTotal = 0;
    
    for (const sec of unit.sections) {
      const p = `${uCode}.${sec.section_code}`;
      if (getVal(`${p}.notes`, false)) n++;
      if (getVal(`${p}.cse`, false)) c++;
      if (getVal(`${p}.ifos`, false)) i++;
      rTotal += getVal(`${p}.rev`, 0);
    }
    
    const total = unit.sections.length;
    const rAvg = (rTotal / total).toFixed(1);
    
    document.getElementById(`agg-notes-${uCode}`).textContent = `${n}/${total}`;
    document.getElementById(`agg-cse-${uCode}`).textContent = `${c}/${total}`;
    document.getElementById(`agg-ifos-${uCode}`).textContent = `${i}/${total}`;
    document.getElementById(`agg-rev-${uCode}`).textContent = `Avg: ${rAvg}`;
  }
}

function updateStats() {
  let totalCheckboxes = 0;
  let checkedCount = 0;
  
  let notesChecked = 0;
  let cseChecked = 0;
  let ifosChecked = 0;
  let totalSections = 0;
  
  for (const unit of syllabus) {
    totalCheckboxes++; // Formula sheet
    if (getVal(`${unit.unit_code}.formulas`, false)) checkedCount++;
    
    for (const sec of unit.sections) {
      totalSections++;
      totalCheckboxes += 3; // notes, cse, ifos
      
      const p = `${unit.unit_code}.${sec.section_code}`;
      if (getVal(`${p}.notes`, false)) { checkedCount++; notesChecked++; }
      if (getVal(`${p}.cse`, false)) { checkedCount++; cseChecked++; }
      if (getVal(`${p}.ifos`, false)) { checkedCount++; ifosChecked++; }
    }
  }
  
  const pct = totalCheckboxes === 0 ? 0 : Math.round((checkedCount / totalCheckboxes) * 100);
  
  document.getElementById("progressFill").style.width = `${pct}%`;
  document.getElementById("progressText").textContent = `${pct}% Overall Setup`;
  document.getElementById("statsSummary").textContent = 
    `Notes: ${notesChecked}/${totalSections} · CSE PYQs: ${cseChecked}/${totalSections} · IFoS PYQs: ${ifosChecked}/${totalSections}`;
}

document.addEventListener("DOMContentLoaded", () => {
  init();
});
