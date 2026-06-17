// Semantic + graph-aware retrieval.
//
// Goal: when you Ask, send Gemini ONLY the handful of memories that are
// actually relevant — never your whole brain.
//
// How it works (classic RAG, all on-device):
//   1. Each memory is embedded once into a vector (Gemini embeddings) and the
//      vector is cached in localStorage. We never re-embed a memory.
//   2. At query time we embed the question, then rank memories by COSINE
//      SIMILARITY against the cached vectors (exact brute-force).
//   3. A graph-style boost lifts memories that mention an entity (person /
//      company / place) named in the question — so "what does Riya do" pulls
//      Riya's connected memories even if the wording differs.
//   4. Only the top-K go to the model.
//
// Brute-force cosine is exact and plenty fast for a personal brain (tens of
// thousands of vectors score in a few ms). An ANN index like HNSW only earns
// its complexity at millions of vectors; this module is the clean place to
// swap one in later if that ever happens.

import { getKey, getModel, hasKey } from "./understand.js";

const VKEY = "arya:vectors:v2"; // bumped: re-embed with the new model
const EMBED_MODEL = "gemini-embedding-001"; // "Gemini Embedding 1" (text-embedding-004 is no longer available)
const DIM = 256;            // reduced dimension keeps the local cache small
const BOOST = 0.15;         // graph bonus for entity-linked memories

function loadVecs() { if (typeof window === "undefined") return {}; try { return JSON.parse(localStorage.getItem(VKEY)) || {}; } catch { return {}; } }
function saveVecs(v) { if (typeof window !== "undefined") localStorage.setItem(VKEY, JSON.stringify(v)); }

async function embedBatch(texts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${encodeURIComponent(getKey())}`;
  const body = { requests: texts.map((t) => ({ model: `models/${EMBED_MODEL}`, content: { parts: [{ text: t }] }, outputDimensionality: DIM })) };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`embed ${res.status}`);
  const data = await res.json();
  // round to shrink storage; cosine is unaffected at this precision
  return (data.embeddings || []).map((e) => (e.values || []).map((x) => Math.round(x * 1e5) / 1e5));
}

function magnitude(v) { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s) || 1; }
function cosine(a, b) { if (!a || !b || a.length !== b.length) return -1; let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d / (magnitude(a) * magnitude(b)); }

async function ensureVectors(memories) {
  const vecs = loadVecs();
  const missing = memories.filter((m) => !vecs[m.id]);
  for (let i = 0; i < missing.length; i += 50) {            // batch to keep requests small
    const chunk = missing.slice(i, i + 50);
    const out = await embedBatch(chunk.map((m) => m.text));
    chunk.forEach((m, j) => { if (out[j] && out[j].length) vecs[m.id] = out[j]; });
  }
  if (missing.length) saveVecs(vecs);
  return vecs;
}

// entity names (from each memory's understanding) that the question mentions
function entitiesInQuestion(question, memories) {
  const q = question.toLowerCase();
  const set = new Set();
  memories.forEach((m) => {
    const u = m.understanding || {};
    [...(u.people || []).map((p) => p.name), ...(u.companies || []), ...(u.places || [])]
      .forEach((n) => { if (n && q.includes(String(n).toLowerCase())) set.add(String(n).toLowerCase()); });
  });
  return set;
}
function memoryRefs(m) {
  const u = m.understanding || {};
  return [...(u.people || []).map((p) => p.name), ...(u.companies || []), ...(u.places || [])].map((x) => String(x).toLowerCase());
}

export async function retrieve(question, memories, k = 10) {
  if (hasKey() && memories.length) {
    try {
      const vecs = await ensureVectors(memories);
      const [qv] = await embedBatch([question]);
      const boost = entitiesInQuestion(question, memories);
      const scored = memories.map((m) => {
        let s = cosine(qv, vecs[m.id]);
        if (boost.size && memoryRefs(m).some((r) => boost.has(r))) s += BOOST;
        return { m, s };
      });
      scored.sort((a, b) => b.s - a.s);
      return scored.slice(0, k).map((x) => x.m);
    } catch (e) {
      console.warn("[retriever] semantic failed, using keyword:", e.message);
    }
  }
  return keyword(question, memories, k);
}

// no-key fallback: simple keyword overlap (still bounded — never sends everything)
function keyword(question, memories, k) {
  const terms = [...new Set(question.toLowerCase().split(/\W+/).filter((w) => w.length > 2))];
  const scored = memories.map((m) => {
    const t = m.text.toLowerCase(); let s = 0;
    terms.forEach((w) => { if (t.includes(w)) s++; });
    return { m, s };
  });
  scored.sort((a, b) => b.s - a.s || b.m.id - a.m.id);
  const top = scored.filter((x) => x.s > 0).slice(0, k).map((x) => x.m);
  return top.length ? top : memories.slice().sort((a, b) => b.id - a.id).slice(0, k);
}

// called after a dump so the new memory is indexed in the background
export async function indexNew(memory) {
  if (!hasKey()) return;
  try {
    const vecs = loadVecs();
    if (vecs[memory.id]) return;
    const [v] = await embedBatch([memory.text]);
    if (v && v.length) { vecs[memory.id] = v; saveVecs(vecs); }
  } catch { /* best effort */ }
}
