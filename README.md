# 🐍 GemSlither — Slither. Sparkle. Survive.

> An AI-powered Snake game where **Google Gemini 2.5 Flash** acts as a live game master — generating dynamic levels, enemies, themes, and tactical insights from natural language prompts.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?logo=vercel)](https://your-vercel-url.vercel.app)
[![Gemini](https://img.shields.io/badge/Google-Gemini%202.5%20Flash-blue?logo=google)](https://ai.google.dev)
[![Firebase](https://img.shields.io/badge/Google-Firebase-orange?logo=firebase)](https://firebase.google.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)](https://vitejs.dev)

---

## 🎯 Chosen Vertical: Game

---

## 🌟 Google Services Used

| Service | How It's Used |
|---|---|
| **Gemini 2.5 Flash** | Level generation — obstacles, rivers, enemies, theme, tactical insight from natural language |
| **Firebase Realtime Database** | Global leaderboard — save and display top 10 scores across all players |
| **Firebase Analytics** | In-game event tracking — game_start, game_over, level_generated, score_saved |
| **Google Analytics GA4** | Page-level analytics via gtag.js in index.html |
| **Google Fonts** | `Orbitron` (title) + `Share Tech Mono` (UI panels) — loaded via Google Fonts CDN |

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **AI Level Generator** | Describe any world in natural language — Gemini builds it in ~2 seconds |
| 🌍 **4 Visual Themes** | Jungle, Volcanic, Crystal Cave, Desert — each with unique sprite art |
| 🎨 **Canvas 2D Sprites** | Animated water ripples, swaying plants, articulated snake with tongue flick |
| 👾 **Roaming Enemies** | Patrol AI that changes direction when blocked |
| ⚡ **Adaptive Difficulty** | Speed increases every 50 points |
| 🏆 **Global Leaderboard** | Firebase-powered top 10 scores with player names |
| 📊 **Analytics** | GA4 + Firebase Analytics tracking every key game event |
| ♿ **Accessibility** | ARIA labels, live score announcer, keyboard-first, focus-visible rings |
| 📱 **Mobile Ready** | Touch D-pad, viewport scaling |

---

## 🧠 Approach & Logic

### AI Integration — Google Gemini 2.5 Flash
One POST to `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` returns structured JSON with `responseMimeType: "application/json"`. `thinkingBudget: 0` disables reasoning mode so all tokens go directly to output.

### Firebase Leaderboard
After game over, players enter their name and save their score to Firebase Realtime Database. The leaderboard modal fetches and displays the top 10 scores globally, ordered by score descending.

### Analytics Events Tracked
`game_start`, `game_over` (with score + theme), `generate_level`, `level_generated`, `theme_switch`, `score_saved`

### Architecture
- Game state in `useRef` — zero React re-renders inside the 60fps `requestAnimationFrame` loop
- Only sidebar values (score, lives, phase) sync to React state via `syncUi()`
- `generateDefaultLevel(theme)` — seeded PRNG procedural fallback so the game is rich before any API call

---

## 🚀 Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/gemslither.git
cd gemslither
npm install
cp .env.example .env   # add your Gemini + Firebase keys
npm run dev            # → http://localhost:5173
npm test               # run unit tests
npm run build          # production build
```

---

## 🔑 Environment Variables

Copy `.env.example` → `.env` and fill in:

```
VITE_GEMINI_API_KEY        — https://aistudio.google.com/apikey
VITE_FIREBASE_API_KEY      — Firebase Console → Project Settings
VITE_FIREBASE_DATABASE_URL — Firebase Console → Realtime Database
VITE_FIREBASE_APP_ID       — Firebase Console → Project Settings
VITE_FIREBASE_MEASUREMENT_ID — Firebase Console → Analytics
```

> `.env` is in `.gitignore` — never committed to git.

---

## 🎮 Controls

| Input | Action |
|---|---|
| `WASD` / `↑↓←→` | Move snake |
| `Space` | Start / Pause / Restart |
| Theme buttons | Switch world |
| On-screen D-pad | Mobile touch |

---

## ♿ Accessibility

- Canvas has `role="application"` with dynamic `aria-label` (updates with score/phase)
- `role="status" aria-live="polite"` announces score and lives changes to screen readers
- All buttons have descriptive `aria-label` attributes
- `nav` and `header` landmarks for screen reader navigation
- `focus-visible` outline on all interactive elements
- `prefers-reduced-motion` support via CSS media query

---

## 🔐 Security

- All API keys in `.env`, excluded from git via `.gitignore`
- AI responses validated and sanitised (coordinate clamping, spawn zone filtering, JSON error handling)
- Firebase Database Rules should restrict writes to leaderboard path only (see Firebase Console)

---

## 🧪 Testing

```bash
npm test
```

Covers: spawn zone validation, food placement, Gemini response parsing, movement wrapping, reverse-direction prevention, score/speed progression.

---

## 📁 Project Structure

```
gemslither/
├── index.html              # Google Fonts + GA4 + meta
├── vite.config.js
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── src/
    ├── main.jsx
    ├── index.css           # focus-visible + prefers-reduced-motion
    ├── firebase.js         # Firebase Realtime DB + Analytics
    ├── AISnake.jsx         # Full game — sprites, logic, UI
    └── AISnake.test.js     # Vitest unit tests
```

---

## 🔮 Assumptions

- API keys are client-side (appropriate for hackathon demo; production would proxy via backend)
- Grid: 20×16 × 36px = 720×576px canvas
- Firebase leaderboard is open-read / open-write (acceptable for hackathon; production needs auth rules)
- `thinkingBudget: 0` is set on Gemini to maximise output tokens for level generation speed

---

Built for the **Google Antigravity Hackathon** · Game Vertical
