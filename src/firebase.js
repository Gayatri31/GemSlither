// firebase.js — Google Firebase Realtime Database integration
// Provides leaderboard read/write for GemSlither

import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, get } from "firebase/database";

// Firebase config — values injected from .env
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

// Only initialise if config is present
const isConfigured = !!(firebaseConfig.apiKey && firebaseConfig.databaseURL);

let app = null;
let db  = null;

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db  = getDatabase(app);
  } catch (err) {
    console.warn("GemSlither: Firebase init failed", err.message);
  }
}

// ── Leaderboard ──────────────────────────────────────────────────────────────

export async function saveScore(playerName, score, theme) {
  const entry = {
    name:      (playerName || "Player").trim().slice(0, 20),
    score,
    theme,
    timestamp: Date.now(),
  };

  // Try REST API first — most reliable, no auth issues
  try {
    const url = `${import.meta.env.VITE_FIREBASE_DATABASE_URL}/leaderboard.json`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    if (res.ok) return;
    throw new Error("REST POST failed: " + res.status);
  } catch (restErr) {
    console.warn("GemSlither: REST save failed, trying SDK", restErr.message);
  }

  // SDK fallback
  if (!db) return;
  try {
    await push(ref(db, "leaderboard"), entry);
  } catch (err) {
    console.warn("GemSlither: SDK save also failed", err.message);
  }
}

export async function getTopScores() {
  try {
    // Use REST API directly — bypasses all SDK auth/pagination issues
    const url = `${import.meta.env.VITE_FIREBASE_DATABASE_URL}/leaderboard.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data) return [];

    const all = Object.entries(data).map(([id, val]) => ({ id, ...val }));

    // Best score per player
    const best = {};
    all.forEach(entry => {
      const key = (entry.name || "").toLowerCase().trim();
      if (!best[key] || entry.score > best[key].score) best[key] = entry;
    });

    return Object.values(best)
      .sort((a, b) => b.score - a.score || a.timestamp - b.timestamp)
      .slice(0, 10);

  } catch (err) {
    console.warn("GemSlither: fetch failed", err.message);
    return [];
  }
}

// ── Analytics — GA4 via gtag only (no Firebase Analytics SDK) ────────────────
export function trackEvent(name, params = {}) {
  if (typeof window !== "undefined" && window.gtag) {
    try { window.gtag("event", name, params); } catch { /* silent */ }
  }
}

export { isConfigured };
