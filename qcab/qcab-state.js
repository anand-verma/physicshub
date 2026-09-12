const KEY = "physicshub.qcab.selection.v2";

function cleanIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(v => String(v || "").trim()).filter(Boolean))];
}

export function loadSelectionIds() {
  try {
    return cleanIds(JSON.parse(sessionStorage.getItem(KEY) || "[]"));
  } catch {
    return [];
  }
}

export function saveSelectionIds(ids) {
  try { sessionStorage.setItem(KEY, JSON.stringify(cleanIds(ids))); } catch { /* temporary state only */ }
}

export function clearSelection() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function buildComposition(questions) {
  const groups = new Map();
  for (const q of questions) {
    const marks = Number.parseFloat(q.marks) || 0;
    groups.set(marks, (groups.get(marks) || 0) + 1);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([marks, count]) => `${marks}M × ${count}`)
    .join("  ·  ");
}

export function totalMarks(questions) {
  return questions.reduce((sum, q) => sum + (Number.parseFloat(q.marks) || 0), 0);
}
