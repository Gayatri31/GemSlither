/**
 * firebase.js
 * Google Firebase integration for GemSlither
 *
 * Services used:
 *   - Firebase Realtime Database  (leaderboard persistence)
 *   - Firebase Analytics          (in-game event tracking)
 *   - Google Analytics GA4        (page-level analytics via gtag)
 */

import { initializeApp }        from "firebase/app";
import { getDatabase, ref, push } from "firebase/database";
import { getAnalytics, logEvent, isSupported } from "firebase/analytics";
import { getPerformance }        from "firebase/performance";

// ── Config (injected from .env at build time, never hardcoded) ────────────────
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

/** True only when all required config values are present */
export const isConfigured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.databaseURL &&
  firebaseConfig.appId
);

// ── Initialise Firebase services ──────────────────────────────────────────────
let app         = null;
let db          = null;
let analytics   = null;
let performance = null;

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db  = getDatabase(app);

    // Firebase Analytics — initialise only when supported by the browser
    isSupported().then(supported => {
      if (!supported) return;
      try {
        analytics = getAnalytics(app);
      } catch { /* non-critical */ }
    });

    // Firebase Performance Monitoring — Google Service #5
    try {
      performance = getPerformance(app);
    } catch { /* non-critical */ }

  } catch (err) {
    // Fail silently — game works without Firebase
    if (import.meta.env.DEV) console.warn("GemSlither: Firebase init failed", err.message);
  }
}

// ── Input sanitisation helper ────────────────────────────────────────────────
/**
 * Sanitise player name: strip HTML tags, trim, enforce max length.
 * @param {string} name
 * @returns {string}
 */
function sanitiseName(name) {
  return String(name)
    .replace(/<[^>]*>/g, "")   // strip any HTML tags
    .replace(/[^\w\s\-_.]/g, "") // allow only safe characters
    .trim()
    .slice(0, 20) || "Player";
}

/**
 * Validate score is a non-negative integer.
 * @param {number} score
 * @returns {number}
 */
function sanitiseScore(score) {
  const n = Math.floor(Number(score));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

/**
 * Save a player score to Firebase Realtime Database.
 * Uses REST API (POST to .json endpoint) — works with public-read/write rules
 * and does not require authentication for this hackathon demo.
 *
 * Security note: In production, replace ".write": true with authenticated
 * writes using Firebase Auth. The current open rules are intentional for the
 * hackathon demo to allow cross-player leaderboard participation.
 *
 * @param {string} playerName
 * @param {number} score
 * @param {string} theme
 */
export async function saveScore(playerName, score, theme) {
  if (!isConfigured) return;

  const entry = {
    name:      sanitiseName(playerName),
    score:     sanitiseScore(score),
    theme:     ["jungle","volcanic","crystal","desert"].includes(theme) ? theme : "jungle",
    timestamp: Date.now(),
  };

  try {
    const url = `${firebaseConfig.databaseURL}/leaderboard.json`;
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    // SDK fallback
    if (db) {
      try { await push(ref(db, "leaderboard"), entry); } catch { /* silent */ }
    }
  }
}

/**
 * Fetch top 10 unique-player scores from Firebase.
 * Deduplicates by player name (case-insensitive), keeping personal best.
 *
 * @returns {Promise<Array<{id,name,score,theme,timestamp}>>}
 */
export async function getTopScores() {
  if (!isConfigured) return [];

  try {
    const url = `${firebaseConfig.databaseURL}/leaderboard.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== "object") return [];

    const all = Object.entries(data).map(([id, val]) => ({ id, ...val }));

    // Deduplicate — keep each player's best score only
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
  }
}

// ── Analytics ─────────────────────────────────────────────────────────────────

/**
 * Track a named event via Firebase Analytics and GA4.
 * Fails silently — analytics must never break the game.
 *
 * @param {string} eventName  Snake_case event name
 * @param {Object} params     Additional event parameters
 */
export function trackEvent(eventName, params = {}) {
  // Firebase Analytics
  if (analytics) {
    try { logEvent(analytics, eventName, params); } catch { /* silent */ }
  }
  // Google Analytics GA4 (gtag loaded in index.html)
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    try { window.gtag("event", eventName, params); } catch { /* silent */ }
  }
}
