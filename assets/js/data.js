let questionsCache = null;
let syllabusCache = null;

export async function loadQuestions() {
  if (questionsCache) return questionsCache;
  const response = await fetch("data/questions.json", { cache: "force-cache" });
  if (!response.ok) throw new Error(`questions.json: HTTP ${response.status}`);
  const raw = await response.json();

  questionsCache = raw.map((q, index) => {
    const topics = Array.isArray(q.syllabus_topic) ? q.syllabus_topic.filter(Boolean) : [];
    return {
      ...q,
      _index: index,
      _year: Number(q.year) || 0,
      _examRank: q.exam === "CSE" ? 0 : 1,
      _topics: topics,
      _search: [q.id, q.exam, q.year, q.marks, q.unit, q.section, ...topics, q.question_markdown]
        .join(" ").toLowerCase()
    };
  });
  return questionsCache;
}

export async function loadSyllabus() {
  if (syllabusCache) return syllabusCache;
  const response = await fetch("data/physics-syllabus.json", { cache: "force-cache" });
  if (!response.ok) throw new Error(`physics-syllabus.json: HTTP ${response.status}`);
  syllabusCache = await response.json();
  return syllabusCache;
}

export function buildSyllabusOrder(syllabus) {
  const units = [], sections = [], allTopics = [];
  const sectionsByUnit = new Map(), topicsBySection = new Map();
  const unitRank = new Map(), sectionRank = new Map(), topicRank = new Map();
  const taxonomy = syllabus?.physics_syllabus_taxonomy || {};

  for (const paper of Object.values(taxonomy)) {
    for (const unit of (paper?.units || [])) {
      const u = unit.unit_name;
      if (!unitRank.has(u)) { unitRank.set(u, units.length); units.push(u); }
      const unitSections = [];
      for (const section of (unit.sections || [])) {
        const s = section.section_name;
        if (!sectionRank.has(`${u}\u0000${s}`)) sectionRank.set(`${u}\u0000${s}`, unitSections.length);
        unitSections.push(s);
        if (!sections.includes(s)) sections.push(s);

        const topics = section.topics || [];
        topicsBySection.set(`${u}\u0000${s}`, [...topics]);
        for (let i = 0; i < topics.length; i++) {
          const t = topics[i];
          if (!topicRank.has(`${u}\u0000${s}\u0000${t}`)) topicRank.set(`${u}\u0000${s}\u0000${t}`, i);
          if (!allTopics.includes(t)) allTopics.push(t);
        }
      }
      sectionsByUnit.set(u, unitSections);
    }
  }
  return { units, sections, allTopics, sectionsByUnit, topicsBySection, unitRank, sectionRank, topicRank };
}
