/* PhysicsHub Analysis Engine
 * Build-time indexed hybrid retrieval.
 * Runtime never embeds the 2,925-question corpus. It loads precomputed
 * MiniLM vectors and embeds only the clicked question in a Web Worker.
 */

const STOPWORDS = new Set(`a an and are as at be been being by can could did do does for from had has have how i if in into is it its may more most of on or our should than that the their them then there these they this to under was we were what when where which who why will with would you your`.split(/\s+/));

export function normalizeText(s) {
  return String(s ?? "").normalize("NFKC").toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/\\(?:left|right|rm|mathbf|mathrm|text|vec|hat|bar|cdot|times|frac|dfrac|sqrt)\b/g, " ")
    .replace(/\\[a-z]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function tokenize(s) { return normalizeText(s).split(" ").filter(t => t.length > 1 && !STOPWORDS.has(t)); }

function normalizeFormula(s) {
  return String(s ?? "").normalize("NFKC").toLowerCase()
    .replace(/\\(?:left|right|rm|mathrm|mathbf|vec|hat|bar|cdot|times|frac|dfrac|sqrt|text)\b/g, "")
    .replace(/[\s{}$()[\]]+/g, "").replace(/−/g, "-").replace(/·/g, "*").replace(/×/g, "*")
    .replace(/[^a-z0-9=+\-*/^.,_:<>]/g, "");
}

function extractFormulas(s) {
  const out = [];
  const re = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;
  let m; while ((m = re.exec(String(s ?? "")))) { const f = normalizeFormula(m[1]); if (f.length >= 3) out.push(f); }
  return [...new Set(out)];
}

function exactKey(q) {
  return normalizeText(q.question_markdown || "").replace(/\b(?:cse|ifos)\b/g, "").replace(/\b\d{4}\b/g, "").replace(/\b\d+\s*m\b/g, "").replace(/\s+/g, " ").trim();
}

function corpusText(q) { return [q.question_markdown || "", q.unit || "", q.section || "", ...(q.syllabus_topic || [])].join(" "); }

function formulaScore(a, b) {
  if (!a.length || !b.length) return 0;
  const B = new Set(b); let hit = 0; for (const x of new Set(a)) if (B.has(x)) hit++;
  return hit / Math.max(new Set(a).size, B.size);
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0; let hit = 0;
  const small = a.size < b.size ? a : b, large = a.size < b.size ? b : a;
  for (const x of small) if (large.has(x)) hit++;
  return hit / (a.size + b.size - hit);
}

let worker, reqId = 0;
const pending = new Map();

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./analysis-worker.js", import.meta.url), { type: "module" });
  worker.onmessage = e => {
    const { id, type, ...payload } = e.data || {};
    if (id && pending.has(id)) { const r = pending.get(id); pending.delete(id); r({ type, ...payload }); }
  };
  worker.onerror = e => { for (const [id, r] of pending) { pending.delete(id); r({ type:"error", message:e.message || "Semantic worker failed" }); } };
  return worker;
}

function workerCall(type, payload) {
  const id = ++reqId;
  return new Promise(resolve => { pending.set(id, resolve); ensureWorker().postMessage({ type, id, ...payload }); });
}

export class AnalysisEngine {
  constructor(questions) {
    this.questions = questions;
    this.prepared = questions.map(q => ({ text: corpusText(q), tokens: tokenize(corpusText(q)), tokenSet: new Set(tokenize(corpusText(q))), formulas: extractFormulas(q.question_markdown), exactKey: exactKey(q) }));
    this.exactMap = new Map();
    this.prepared.forEach((p, i) => { if (p.exactKey.length >= 18) { if (!this.exactMap.has(p.exactKey)) this.exactMap.set(p.exactKey, []); this.exactMap.get(p.exactKey).push(i); } });
    this.index = null;
    this.indexPromise = this.loadIndex();
  }

  async loadIndex() {
    try {
      const r = await fetch("data/analysis-index.json", { cache: "force-cache" });
      if (!r.ok) throw new Error(`analysis-index.json: HTTP ${r.status}`);
      this.index = await r.json();
    } catch (e) { console.warn("Analysis pre-index unavailable; using runtime lexical fallback.", e); this.index = null; }
    return this.index;
  }

  exact(index) {
    return (this.exactMap.get(this.prepared[index].exactKey) || []).filter(i => i !== index);
  }

  lexicalScores(index) {
    const query = this.prepared[index];
    const scores = new Float32Array(this.questions.length);
    if (this.index?.idf && this.index?.postings) {
      const tf = new Map(); query.tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
      let qnorm = 0; const qw = new Map();
      for (const [t,n] of tf) { const w=(1+Math.log(n))*(this.index.idf[t] || 1); qw.set(t,w); qnorm += w*w; }
      qnorm = Math.sqrt(qnorm)||1;
      for (const [t,wq] of qw) for (const [i,wd] of (this.index.postings[t] || [])) scores[i] += wq*wd;
      // Normalize by precomputed document norm on the fly from postings is expensive;
      // use cosine-like bounded normalization with query norm and a stored docNorm array when available.
      if (this.index.docNorms) for (let i=0;i<scores.length;i++) scores[i] /= qnorm*(this.index.docNorms[i]||1);
      else for (let i=0;i<scores.length;i++) scores[i] = 1-Math.exp(-scores[i]/qnorm);
      return scores;
    }
    // Safe fallback for an older deployment without analysis-index.json.
    const tf = new Map(); query.tokens.forEach(t=>tf.set(t,(tf.get(t)||0)+1));
    for (let i=0;i<this.prepared.length;i++) scores[i]=jaccard(query.tokenSet,this.prepared[i].tokenSet);
    return scores;
  }

  makeRank(index, semanticScores = null) {
    const q = this.questions[index], query = this.prepared[index], lexical = this.lexicalScores(index);
    const candidates = new Set();
    for (let i=0;i<this.questions.length;i++) if (i!==index && lexical[i] > 0) candidates.add(i);
    // Keep semantic/lexical candidate generation bounded for predictable UI cost.
    Array.from({length:this.questions.length},(_,i)=>i).filter(i=>i!==index).sort((a,b)=>lexical[b]-lexical[a]).slice(0,220).forEach(i=>candidates.add(i));
    if (semanticScores) Array.from({length:this.questions.length},(_,i)=>i).filter(i=>i!==index).sort((a,b)=>semanticScores[b]-semanticScores[a]).slice(0,220).forEach(i=>candidates.add(i));
    return [...candidates].map(i=>{
      const lex=Math.max(0,Math.min(1,Number(lexical[i]||0)));
      const formula=formulaScore(query.formulas,this.prepared[i].formulas);
      const token=jaccard(query.tokenSet,this.prepared[i].tokenSet);
      const semantic=semanticScores?Math.max(0,Math.min(1,Number(semanticScores[i]||0))):0;
      const sameUnit=q.unit && q.unit===this.questions[i].unit ? .035 : 0;
      const sameSection=q.section && q.section===this.questions[i].section ? .025 : 0;
      const score=semanticScores ? Math.min(1,.57*semantic+.25*lex+.10*formula+.05*token+sameUnit+sameSection) : Math.min(1,.66*lex+.18*formula+.11*token+sameUnit+sameSection);
      return {index:i,question:this.questions[i],semantic,lexical:lex,formula,score};
    }).sort((a,b)=>b.score-a.score);
  }

  analyzeFast(index) {
    const exact=this.exact(index);
    const ranked=this.makeRank(index).filter(r=>r.score>=.20).slice(0,10);
    return { exact:exact.map(i=>this.questions[i]), related:ranked, semanticAvailable:false, semanticPending:true };
  }

  warmSemantic() {
    const start = () => workerCall("warm", { vectorUrl:"data/analysis-vectors.bin", expectedCount:this.questions.length, model:"Xenova/all-MiniLM-L6-v2" }).catch(()=>null);
    if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 2500 });
    else setTimeout(start, 1200);
  }

  async analyzeSemantic(index) {
    await this.indexPromise;
    const response=await workerCall("query",{ text:this.prepared[index].text, vectorUrl:"data/analysis-vectors.bin", expectedCount:this.questions.length, model:"Xenova/all-MiniLM-L6-v2" });
    if (response.type!=="result" || !response.scores) return {semanticAvailable:false,semanticPending:false,semanticError:response.message||"Precomputed semantic vector index is unavailable."};
    const ranked=this.makeRank(index,response.scores).filter(r=>r.score>=.30).slice(0,7);
    return {related:ranked,semanticAvailable:true,semanticPending:false};
  }
}
