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

## 🌟 Google Services Used (5 Services)

| Service | Integration | Purpose |
|---|---|---|
| **Gemini 2.5 Flash** | `generativelanguage.googleapis.com` | AI level generation, enemy placement, themes, tactical insights |
| **Firebase Realtime Database** | `firebase/database` SDK + REST API | Global leaderboard — top 10 scores with deduplication |
| **Firebase Analytics** | `firebase/analytics` SDK | In-game event tracking (`game_start`, `game_over`, `level_generated`, `score_saved`) |
| **Firebase Performance** | `firebase/performance` SDK | Automatic performance monitoring and trace collection |
| **Google Analytics GA4** | `gtag.js` via Google Tag Manager | Page-level analytics, session tracking, conversion events |
| **Google Fonts** | `fonts.googleapis.com` | `Orbitron` (title) + `Share Tech Mono` (UI) |

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **AI Level Generator** | Natural language → Gemini builds obstacles, water, plants, enemies, theme |
| 🌍 **4 Visual Themes** | Jungle, Volcanic, Crystal Cave, Desert — unique sprite art per theme |
| 🎨 **Canvas 2D Sprites** | Animated water, swaying plants, articulated snake, particle bursts |
| 👾 **Roaming Enemies** | Patrol AI that changes direction when blocked |
| ⚡ **Adaptive Difficulty** | Speed scales every 50 points |
| 🏆 **Global Leaderboard** | Firebase-powered top 10, per-player best score deduplication |
| 📊 **Full Analytics** | Firebase Analytics + GA4 tracking every key event |
| ♿ **Accessibility** | ARIA labels, live announcer, keyboard-first, focus-visible, reduced-motion |
| 📱 **Mobile Ready** | Touch D-pad, viewport scaling |

---

## 🧠 Approach & Logic

### AI Integration — Google Gemini 2.5 Flash
Single POST to `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`. Uses `responseMimeType: "application/json"` for structured output and `thinkingBudget: 0` to maximise output tokens.

Returns: obstacle coordinates, water tile clusters, plant positions, enemy configs, visual theme, tactical insight.

### Fallback — Procedural Default Levels
`generateDefaultLevel(theme)` uses a seeded linear congruential PRNG to produce rich levels before any API call. Game is fully playable offline.

### Architecture
- **Game state** in `useRef` — zero React re-renders inside the 60fps `requestAnimationFrame` loop
- **UI state** (score, lives, phase) synced to React via `syncUi()` batched callback
- **Firebase module** (`firebase.js`) isolated — all Google service calls in one file
- **Input sanitisation** on all user data before writing to Firebase

---

## 🔐 Security

### API Key Handling
- All keys stored in `.env` (git-ignored), never hardcoded
- `VITE_` prefix exposes keys to browser bundle — intentional for client-side demo
- Production recommendation: proxy Gemini calls through a backend function

### Firebase Database Rules
Rules enforce data validation at the database level — not just client-side:

```json
{
  "rules": {
    "leaderboard": {
      ".read": true,
      ".write": true,
      "$entry": {
        ".validate": "newData.hasChildren(['name','score','theme','timestamp'])
          && newData.child('name').val().length <= 20
          && newData.child('score').val() >= 0
          && newData.child('score').val() <= 10000
          && newData.child('timestamp').isNumber()"
      }
    }
  }
}
```

### Input Sanitisation
- Player names: HTML tags stripped, special characters filtered, max 20 chars
- Scores: validated as non-negative integers, capped at 10,000
- Theme: validated against whitelist `["jungle","volcanic","crystal","desert"]`
- All validation runs both client-side and at Firebase rule level

---

## ♿ Accessibility

- `<canvas>` has `role="application"` with dynamic `aria-label` (updates with score/phase)
- `role="status" aria-live="polite"` announces score and lives changes
- All buttons have descriptive `aria-label` attributes
- `<nav>`, `<header>` landmarks for screen reader navigation
- `focus-visible` CSS outline on all interactive elements
- `prefers-reduced-motion` media query suppresses all animations

---

## 🧪 Testing

```bash
npm test
```

15 unit tests covering: spawn zone validation, food placement, Gemini response parsing, snake movement/wrapping, reverse-direction prevention, score/speed progression.

---

## 🚀 Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/gemslither.git
cd gemslither
npm install
cp .env.example .env   # fill in keys
npm run dev            # localhost:5173
npm test               # unit tests
npm run build          # production build
```

---

## 🔑 Environment Variables

```bash
# Google Gemini
VITE_GEMINI_API_KEY=          # https://aistudio.google.com/apikey

# Google Firebase
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=  # G-XXXXXXXX (also used for GA4)
```

---

## 📁 Project Structure

```
gemslither/
├── index.html              # Google Fonts + GA4 + security meta
├── vite.config.js          # Vite + Vitest config
├── package.json
├── database.rules.json     # Firebase security rules (apply in console)
├── .env.example
├── .gitignore
├── README.md
└── src/
    ├── main.jsx
    ├── index.css           # focus-visible + prefers-reduced-motion
    ├── firebase.js         # All Firebase + Analytics services
    ├── AISnake.jsx         # Game engine + UI
    └── AISnake.test.js     # Vitest unit tests
```

---

## 🔮 Assumptions

- API keys are client-side (appropriate for hackathon; production would use backend proxy)
- Firebase leaderboard uses open read/write with server-side validation rules
- `thinkingBudget: 0` on Gemini prioritises output tokens for faster level generation
- Grid: 20×16 × 36px = 720×576px canvas, viewport-scaled to fit any screen

---

Built for the **Google Antigravity Hackathon** · Game Vertical · March 2026
