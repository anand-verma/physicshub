/**
 * Practiced Question Manager — IndexedDB-backed
 *
 * Uses a dedicated IndexedDB database ("PhysicsHubPracticed") so practice states
 * survive even when other apps on the same domain clear localStorage or cookies.
 *
 * States:
 *   0: Unchecked (not practiced)
 *   1: Solved
 *   2: Doubt
 *
 * Public API:
 *   await initPracticed()        — open DB, load set into memory
 *   getPracticeState(id)         — synchronous check (after init) returns 0, 1, or 2
 *   await setPracticeState(id)   — update state, persist, returns new state
 *   getPracticedCount()          — synchronous count of practiced items
 *   getPracticedData()           — returns Map<string, number>
 *   await clearAllPracticed()    — remove everything
 *   onChange(callback)           — register listener for any mutation
 */

const DB_NAME = "PhysicsHubPracticed";
const DB_VERSION = 1;
const STORE_NAME = "states";

/** @type {IDBDatabase|null} */
let db = null;

/** In-memory mirror for fast synchronous reads (id -> state) */
const practicedMap = new Map();

/** Mutation listeners */
const listeners = [];

/* ── helpers ─────────────────────────────────────────────────── */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txStore(mode) {
  const tx = db.transaction(STORE_NAME, mode);
  return tx.objectStore(STORE_NAME);
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch (_) { /* swallow listener errors */ }
  }
}

/* ── public API ──────────────────────────────────────────────── */

export async function initPracticed() {
  try {
    db = await openDB();
    const store = txStore("readonly");
    const keys = await idbRequest(store.getAllKeys());
    const values = await idbRequest(store.getAll());
    practicedMap.clear();
    for (let i = 0; i < keys.length; i++) {
      practicedMap.set(keys[i], values[i]);
    }
  } catch (err) {
    console.warn("[Practiced] IndexedDB unavailable, running in-memory only:", err);
  }
}

export function getPracticeState(id) {
  return practicedMap.get(id) || 0;
}

export async function togglePracticeState(id) {
  let currentState = practicedMap.get(id) || 0;
  // Cycle state: 0 (Unchecked) -> 1 (Solved) -> 2 (Doubt) -> 0
  let newState = (currentState + 1) % 3;

  if (newState === 0) {
    practicedMap.delete(id);
    if (db) {
      try { await idbRequest(txStore("readwrite").delete(id)); }
      catch (_) { /* best-effort persist */ }
    }
  } else {
    practicedMap.set(id, newState);
    if (db) {
      try { await idbRequest(txStore("readwrite").put(newState, id)); }
      catch (_) { /* best-effort persist */ }
    }
  }
  notify();
  return newState;
}

export function getPracticedCount() {
  return practicedMap.size;
}

export function getPracticedData() {
  return new Map(practicedMap);
}

export async function clearAllPracticed() {
  practicedMap.clear();
  if (db) {
    try { await idbRequest(txStore("readwrite").clear()); }
    catch (_) { /* best-effort */ }
  }
  notify();
}

export function onChange(callback) {
  if (typeof callback === "function") listeners.push(callback);
}
