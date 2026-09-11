/**
 * Bookmark Manager — IndexedDB-backed
 *
 * Uses a dedicated IndexedDB database ("PhysicsHubBookmarks") so bookmarks
 * survive even when other apps on the same domain clear localStorage or cookies.
 *
 * Public API:
 *   await initBookmarks()        — open DB, load set into memory
 *   isBookmarked(id)             — synchronous check (after init)
 *   await toggleBookmark(id)     — add/remove, persist, returns new boolean state
 *   getBookmarkCount()           — synchronous count
 *   getBookmarkedIds()           — returns Set<string>
 *   await clearAllBookmarks()    — remove everything
 *   onChange(callback)           — register listener for any mutation
 */

const DB_NAME = "PhysicsHubBookmarks";
const DB_VERSION = 1;
const STORE_NAME = "ids";

/** @type {IDBDatabase|null} */
let db = null;

/** In-memory mirror for fast synchronous reads */
const bookmarkSet = new Set();

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

export async function initBookmarks() {
  try {
    db = await openDB();
    const store = txStore("readonly");
    const keys = await idbRequest(store.getAllKeys());
    bookmarkSet.clear();
    for (const k of keys) bookmarkSet.add(k);
  } catch (err) {
    console.warn("[Bookmarks] IndexedDB unavailable, running in-memory only:", err);
  }
}

export function isBookmarked(id) {
  return bookmarkSet.has(id);
}

export async function toggleBookmark(id) {
  const wasBookmarked = bookmarkSet.has(id);
  if (wasBookmarked) {
    bookmarkSet.delete(id);
    if (db) {
      try { await idbRequest(txStore("readwrite").delete(id)); }
      catch (_) { /* best-effort persist */ }
    }
  } else {
    bookmarkSet.add(id);
    if (db) {
      try { await idbRequest(txStore("readwrite").put(true, id)); }
      catch (_) { /* best-effort persist */ }
    }
  }
  notify();
  return !wasBookmarked; // new state: bookmarked or not
}

export function getBookmarkCount() {
  return bookmarkSet.size;
}

export function getBookmarkedIds() {
  return new Set(bookmarkSet);
}

export async function clearAllBookmarks() {
  bookmarkSet.clear();
  if (db) {
    try { await idbRequest(txStore("readwrite").clear()); }
    catch (_) { /* best-effort */ }
  }
  notify();
}

export function onChange(callback) {
  if (typeof callback === "function") listeners.push(callback);
}
