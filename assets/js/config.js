/**
 * PhysicsHub Configuration & Versioning
 * 
 * Updating versions here automatically updates asset URLs and cache keys across the entire app.
 * 
 * - version: Master release version.
 * - assets: Individual version tags for each asset and data file.
 * - cachePolicy: Browser fetch cache policy ("default", "no-cache", "reload").
 *     - "no-cache": Browser checks server via ETag/304 (0 bytes if unchanged, immediate update when modified).
 *     - "default": Standard browser HTTP caching (respects server Cache-Control headers).
 */
export const CONFIG = {
  // Master application release version
  version: "1.2.0",

  // Granular version tags for all critical assets and datasets
  assets: {
    styles: "1.2.0",
    app: "1.2.0",
    questions: "2026.1",
    syllabus: "1.0",
    analysisIndex: "1.2.0",
    analysisVectors: "1.2.0",
    analysisWorker: "1.2.0"
  },

  // HTTP cache policy for fetch requests:
  // "default" is the optimal middle path. The browser caches the file locally for high speed,
  // while changing the version in `assets` above automatically forces a fresh download.
  cachePolicy: {
    questions: "default",
    syllabus: "default",
    analysisIndex: "default",
    analysisVectors: "default"
  },

  /**
   * Generates a cache-busted URL with the appropriate version parameter.
   * @param {string} path - URL or file path.
   * @param {string} [assetKey] - Key from CONFIG.assets. Falls back to CONFIG.version.
   * @returns {string} Versioned URL.
   */
  assetUrl(path, assetKey) {
    const v = (assetKey && this.assets[assetKey]) || this.version;
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}v=${encodeURIComponent(v)}`;
  }
};

// Expose on window for easy browser console inspection (type `APP_CONFIG` in DevTools)
if (typeof window !== "undefined") {
  window.APP_CONFIG = CONFIG;
}
