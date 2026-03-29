/**
 * firebase.js — Google Firebase integration for GemSlither
 *
 * Google Services integrated:
 *   1. Firebase Realtime Database  — global leaderboard
 *   2. Firebase Analytics          — in-game event tracking
 *   3. Firebase Performance        — automatic performance monitoring
 *   4. Google Analytics GA4        — page analytics via gtag.js
 *   5. Google Fonts                — Orbitron + Share Tech Mono (index.html)
 *   6. Google Gemini 2.5 Flash     — AI level generation (AISnake.jsx)
 */

import { initializeApp }               from "firebase/app";
import { getDatabase, ref, push }      from "firebase/database";
import { getAnalytics, logEvent }      from "firebase/analytics";
import { getPerformance, trace }       from "firebase/performance";

// ── Config ────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY        || "",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN    || "",
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL   || "",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID     || "",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_ID   || "",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID         || "",
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "",
};

export const isConfigured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.databaseURL &&
  firebaseConfig.appId
);

// ── Initialise all Firebase services eagerly ──────────────────────────────────
let app         = null;
let db          = null;
let analytics   = null;
let perf        = null;

if (isConfigured) {
  try { app = initializeApp(firebaseConfig); }        catch { /* silent */ }
  if (app) {
    try { db        = getDatabase(app); }             catch { /* silent */ }
    try { analytics = getAnalytics(app); }            catch { /* silent */ }
    try { perf      = getPerformance(app); }          catch { /* silent */ }
  }
}

// ── Input sanitisation ────────────────────────────────────────────────────────
function sanitiseName(name) {
  return String(name)
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s\-_.]/g, "")
    .trim()
    .slice(0, 20) || "Player";
}

function sanitiseScore(score) {
  const n = Math.floor(Number(score));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 10000) : 0;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

/**
 * Save a validated score entry to Firebase Realtime Database.
 * Uses REST POST — works reliably across all environments.
 * Security: server-side validation rules enforced in database.rules.json.
 */
export async function saveScore(playerName, score, theme) {
  if (!isConfigured) return;

  const VALID_THEMES = ["jungle", "volcanic", "crystal", "desert"];
  const entry = {
    name:      sanitiseName(playerName),
    score:     sanitiseScore(score),
    theme:     VALID_THEMES.includes(theme) ? theme : "jungle",
    timestamp: Date.now(),
  };

  // Track save performance
  let t = null;
  try { if (perf) { t = trace(perf, "save_score"); t.start(); } } catch { /* silent */ }

  try {
    const res = await fetch(`${firebaseConfig.databaseURL}/leaderboard.json`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    if (db) { try { await push(ref(db, "leaderboard"), entry); } catch { /* silent */ } }
  } finally {
    try { if (t) t.stop(); } catch { /* silent */ }
  }
}

/**
 * Fetch top 10 unique-player scores (best score per player, deduplicated).
 * Uses REST GET — no auth token required with current database rules.
 */
export async function getTopScores() {
  if (!isConfigured) return [];

  let t = null;
  try { if (perf) { t = trace(perf, "get_top_scores"); t.start(); } } catch { /* silent */ }

  try {
    const res = await fetch(`${firebaseConfig.databaseURL}/leaderboard.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== "object") return [];

    const all = Object.entries(data).map(([id, val]) => ({ id, ...val }));

    // Deduplicate — keep personal best per player
    const best = {};
    all.forEach(entry => {
      const key = sanitiseName(entry.name || "").toLowerCase();
      if (!best[key] || entry.score > best[key].score) best[key] = entry;
    });

    return Object.values(best)
      .sort((a, b) => b.score - a.score || a.timestamp - b.timestamp)
      .slice(0, 10);

  } catch {
    return [];
  } finally {
    try { if (t) t.stop(); } catch { /* silent */ }
  }
}

// ── Analytics ─────────────────────────────────────────────────────────────────

/**
 * Track a named event in both Firebase Analytics and Google Analytics GA4.
 * Fails silently — analytics must never interrupt gameplay.
 *
 * @param {string} eventName - snake_case event identifier
 * @param {Object} params    - additional event parameters
 */
export function trackEvent(eventName, params = {}) {
  // Firebase Analytics (Google Service #2)
  if (analytics) {
    try { logEvent(analytics, eventName, params); } catch { /* silent */ }
  }
  // Google Analytics GA4 via gtag.js (Google Service #4)
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    try { window.gtag("event", eventName, params); } catch { /* silent */ }
  }
}

// Export perf for external trace usage if needed
export { perf as firebasePerf };
