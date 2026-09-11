import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/+esm";

env.useBrowserCache = true;
env.allowLocalModels = false;
env.allowRemoteModels = true;

let extractor = null;
let vectors = null;
let dimension = 0;
let count = 0;
let modelName = "";

async function ensureModel(model) {
  if (!extractor || modelName !== model) {
    modelName = model;
    extractor = await pipeline("feature-extraction", modelName, { dtype:"q8", device:"wasm" });
  }
}

async function loadVectors(url, expectedCount, cachePolicy = "no-cache") {
  if (vectors && count===expectedCount) return true;
  const r=await fetch(url,{cache:cachePolicy});
  if (!r.ok) throw new Error(`Precomputed semantic index missing (HTTP ${r.status}). Run build_search_index.py.`);
  const buf=await r.arrayBuffer();
  const header=new DataView(buf,0,16);
  const magic=header.getUint32(0,true), version=header.getUint32(4,true), rows=header.getUint32(8,true), dim=header.getUint32(12,true);
  if (magic!==0x50585631 || version!==1 || rows!==expectedCount) throw new Error("Semantic vector index is incompatible with this questions.json.");
  vectors=new Float32Array(buf,16);
  count=rows; dimension=dim;
  return true;
}

function cosineQuery(q) {
  const scores=new Float32Array(count);
  for(let i=0;i<count;i++){
    let dot=0; const off=i*dimension;
    for(let j=0;j<dimension;j++) dot += q[j]*vectors[off+j];
    scores[i]=dot;
  }
  return scores;
}

self.onmessage=async e=>{
  const {type,id,text,vectorUrl,cachePolicy,expectedCount,model}=e.data||{};
  try{
    if(type!=="query" && type!=="warm") return;
    await loadVectors(vectorUrl,expectedCount,cachePolicy);
    await ensureModel(model);
    if(type==="warm"){ self.postMessage({type:"result",id,warmed:true}); return; }
    const out=await extractor([text],{pooling:"mean",normalize:true});
    const q=out.data;
    const scores=cosineQuery(q);
    self.postMessage({type:"result",id,scores},[scores.buffer]);
  }catch(err){self.postMessage({type:"error",id,message:err?.message||String(err)});}
};
