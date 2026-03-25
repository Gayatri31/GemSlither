# 🐍 GemSlither — Slither. Sparkle. Survive

> An AI-powered Snake game enhanced with Gemini, enabling dynamic level generation, adaptive difficulty, and real-time gameplay insights based on user intent.
> The game evolves from a static rule-based system into an intelligent, adaptive experience where AI continuously personalizes environments, strategy, and gameplay in real time.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?logo=vercel)](https://gem-slither.vercel.app/)
[![Built with Gemini](https://img.shields.io/badge/Google-Gemini%202.5%20Flash-blue?logo=google)](https://ai.google.dev)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)](https://vitejs.dev)

---

## 🎯 Chosen Vertical: Game

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **AI Level Generator** | Describe any level in natural language — Gemini 2.5 Flash generates obstacles, water, plants, enemies, and a theme |
| 🌍 **4 Visual Themes** | Jungle (rivers + ferns), Volcanic (lava + boulders), Crystal Cave (shards + pools), Desert (sandstone + cacti) |
| 🎨 **Sprite-style Canvas Art** | Animated water ripples, swaying plants, articulated snake with tongue flick, particle bursts |
| 👾 **Roaming Enemies** | Patrol AI enemies that change direction when blocked |
| ⚡ **Adaptive Difficulty** | Speed increases every 50 points |
| 💡 **Gemini Insight** | AI-generated tactical tip per level |
| 📱 **Mobile Controls** | On-screen D-pad for touch devices |
| 🔑 **Secure API Key** | Loaded from `.env` — never committed to git |

---

## 🧠 Approach & Logic

### AI Integration — Google Gemini 2.5 Flash

The game calls `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` when the player clicks **Generate Level**.

Gemini returns structured JSON with `responseMimeType: "application/json"` containing obstacle positions, water tile clusters, plant positions, enemy configs, a visual theme, and a tactical tip. `thinkingBudget: 0` disables the reasoning chain to maximise output tokens for dense JSON.

### Fallback — Procedural Default Levels

Every theme has a hand-crafted procedural level via `generateDefaultLevel(theme)` using a seeded PRNG. The game is fully playable without an API key.

### Decision Making

- **Spawn zone protection** — a 7×7 zone around the snake spawn is always obstacle-free
- **Enemy AI** — moves every N ticks, randomises direction when blocked
- **Speed scaling** — tick interval decreases 12ms every 50 points (floor: 85ms)
- **AI validation** — all Gemini output is sanitised (coordinate clamping, spawn zone filtering, JSON error handling)

### Architecture

```
AISnake.jsx
├── Sprite library     — drawRock, drawWater, drawPlant, drawSnakeHead, drawEnemy ...
├── Game engine        — requestAnimationFrame loop, collision, scoring
├── Gemini integration — callGemini(), parseGeminiLevel()
├── Procedural gen     — generateDefaultLevel(theme)
└── React UI           — sidebar panels, D-pad, theme switcher
```

Game state lives in `useRef` to avoid React re-renders inside the 60fps loop. Only score/lives/theme/phase sync to React state via `syncUi()`.

---

## 🚀 Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/ai-snake.git
cd ai-snake
npm install
cp .env.example .env   # then add your Gemini API key
npm run dev            # → http://localhost:5173
npm test               # run unit tests
npm run build          # production build
```

Get a free Gemini API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

---

## 🎮 Controls

| Input | Action |
|---|---|
| `↑ ↓ ← →` / `W A S D` | Move |
| `Space` | Start / Pause / Restart |
| On-screen D-pad | Mobile touch |
| Theme buttons | Switch world |

---

## 🔐 Security

- API key in `.env`, excluded from git via `.gitignore`
- All AI responses validated and sanitised before use
- No user data stored, no backend, no auth beyond the Gemini key

---

## ♿ Accessibility

- Keyboard-first (arrows + WASD + Space)
- Touch D-pad for mobile
- High-contrast dark UI
- All interactive elements keyboard-focusable

---

## 🧪 Testing

```bash
npm test
```

Covers: spawn zone validation, food placement, Gemini response parsing, movement wrapping, reverse-direction prevention, score/speed progression.

---

## 🌟 Google Services Used

**Google Gemini 2.5 Flash** (`gemini-2.5-flash`) via the Google Generative Language API — level generation, enemy placement, theme selection, tactical insights, structured JSON output via `responseMimeType: "application/json"`.

---

## 📁 Project Structure

```
ai-snake/
├── index.html
├── vite.config.js
├── package.json
├── .env.example
├── .gitignore
├── README.md
└── src/
    ├── main.jsx
    ├── index.css
    ├── AISnake.jsx
    └── AISnake.test.js
```

---

## 🔮 Assumptions

- API key is client-side (acceptable for hackathon demo; production would proxy via backend)
- Grid: 20×16 cells × 36px = 720×576px canvas
- No score persistence (can extend with localStorage)
- `thinkingBudget: 0` prioritises output tokens for faster level generation

---

Built for the **Google Antigravity Hackathon** · Game Vertical
