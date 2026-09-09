export function createFilterState() {
  return { mode: "unit-section-topic", year: "", unit: "", section: "", topic: "", search: "", exam: "both", sort: "smart" };
}

export function buildFilterUI(container, state, onChange) {
  container.replaceChildren();
  const groups = state.mode === "year-unit"
    ? [["year", "Year"], ["unit", "Unit"]]
    : [["unit", "Unit"], ["section", "Section"], ["topic", "Topic"]];

  const fragment = document.createDocumentFragment();
  for (const [key, label] of groups) {
    const wrap = document.createElement("div");
    wrap.className = "filter-group";
    const lab = document.createElement("label");
    lab.htmlFor = `filter-${key}`;
    lab.textContent = label;
    const select = document.createElement("select");
    select.id = `filter-${key}`;
    select.dataset.filter = key;
    select.addEventListener("change", e => onChange({ [key]: e.target.value }));
    wrap.append(lab, select);
    fragment.appendChild(wrap);
  }
  container.appendChild(fragment);
}

export function updateFilterOptions(questions, container, filters, order) {
  // Options are derived only from the currently relevant branch.
  const eligible = [];
  for (const q of questions) if (filters.exam === "both" || q.exam === filters.exam) eligible.push(q);

  const byUnit = filters.unit ? eligible.filter(q => q.unit === filters.unit) : eligible;
  const bySection = filters.section ? byUnit.filter(q => q.section === filters.section) : byUnit;

  const values = {
    year: unique(eligible.map(q => String(q._year))).sort((a, b) => Number(b) - Number(a)),
    unit: orderedUnique(eligible.map(q => q.unit), order?.units),
    section: orderedUnique(byUnit.map(q => q.section), order ? (filters.unit ? order.sectionsByUnit.get(filters.unit) : order.sections) : null),
    topic: orderedTopics(bySection, filters, order)
  };

  container.querySelectorAll("select").forEach(select => {
    const key = select.dataset.filter;
    const current = filters[key] || "";
    const options = values[key] || [];
    const label = key === "year" ? "years" : `${key}s`;
    const signature = options.join("\u0001");
    if (select.dataset.signature !== signature) {
      const fragment = document.createDocumentFragment();
      fragment.appendChild(new Option(`All ${label}`, ""));
      for (const value of options) fragment.appendChild(new Option(value, value));
      select.replaceChildren(fragment);
      select.dataset.signature = signature;
    }
    const next = options.includes(current) ? current : "";
    filters[key] = next;
    if (select.value !== next) select.value = next;
  });
}

export function applyFilters(questions, filters) {
  const out = [];
  const search = filters.search;
  for (const q of questions) {
    if (filters.exam !== "both" && q.exam !== filters.exam) continue;
    if (filters.year && String(q._year) !== filters.year) continue;
    if (filters.unit && q.unit !== filters.unit) continue;
    if (filters.section && q.section !== filters.section) continue;
    if (filters.topic && !q._topics.includes(filters.topic)) continue;
    if (search && !q._search.includes(search)) continue;
    out.push(q);
  }
  return out;
}

export function sortQuestions(questions, filters, order) {
  const out = questions.slice();
  const cmpText = (a,b) => String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric:true, sensitivity:"base" });
  if (filters.sort !== "smart") {
    const [field, dir] = filters.sort.split(":");
    const mul = dir === "asc" ? 1 : -1;
    out.sort((a,b) => {
      let av, bv;
      if (field === "year") return (a._year-b._year)*mul || (a._examRank-b._examRank);
      if (field === "unit") { av=order?.unitRank.get(a.unit) ?? 9999; bv=order?.unitRank.get(b.unit) ?? 9999; }
      if (field === "section") { av=order?.sectionRank.get(`${a.unit}\u0000${a.section}`) ?? 9999; bv=order?.sectionRank.get(`${b.unit}\u0000${b.section}`) ?? 9999; }
      if (field === "topic") { av=topicKeyRank(a,order); bv=topicKeyRank(b,order); }
      return (av-bv)*mul || (b._year-a._year) || (a._examRank-b._examRank) || (a._index-b._index);
    });
    return out;
  }

  out.sort((a,b) => {
    if (filters.mode === "year-unit") {
      return unitRank(a,order)-unitRank(b,order)
        || sectionRank(a,order)-sectionRank(b,order)
        || topicKeyRank(a,order)-topicKeyRank(b,order)
        || b._year-a._year || a._examRank-b._examRank || a._index-b._index;
    }
    // Unit + Section + Topic mode: syllabus taxonomy first; within the
    // selected topic/leaf, newest year first, with CSE before IFoS.
    return unitRank(a,order)-unitRank(b,order)
      || sectionRank(a,order)-sectionRank(b,order)
      || topicKeyRank(a,order)-topicKeyRank(b,order)
      || b._year-a._year || a._examRank-b._examRank || a._index-b._index;
  });
  return out;
}

function unitRank(q,o){ return o?.unitRank.get(q.unit) ?? 9999; }
function sectionRank(q,o){ return o?.sectionRank.get(`${q.unit}\u0000${q.section}`) ?? 9999; }
function topicKeyRank(q,o){
  if (!q._topics.length) return 9999;
  let best = 9999;
  for (const t of q._topics) best = Math.min(best, o?.topicRank.get(`${q.unit}\u0000${q.section}\u0000${t}`) ?? 9999);
  return best;
}
function unique(values){ return [...new Set(values.filter(v => v !== undefined && v !== null && v !== ""))]; }
function orderedUnique(values, preferred=[]){
  const present = new Set(unique(values)), result=[];
  for(const v of preferred || []) if(present.has(v)){result.push(v);present.delete(v);}
  return result.concat([...present].sort(localeSort));
}
function orderedTopics(questions, filters, order){
  const values = unique(questions.flatMap(q=>q._topics));
  if(!order) return values.sort(localeSort);
  const preferred=[];
  if(filters.unit && filters.section) preferred.push(...(order.topicsBySection.get(`${filters.unit}\u0000${filters.section}`)||[]));
  else if(filters.unit) for(const s of (order.sectionsByUnit.get(filters.unit)||[])) preferred.push(...(order.topicsBySection.get(`${filters.unit}\u0000${s}`)||[]));
  else preferred.push(...order.allTopics);
  return orderedUnique(values, preferred);
}
function localeSort(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"});}
