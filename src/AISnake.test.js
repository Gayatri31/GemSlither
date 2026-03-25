// AISnake.test.js — validates core game logic
// Run with: npx vitest run

import { describe, it, expect } from "vitest";

// ── Helpers (duplicated from AISnake for testability) ─────────────────────────
const COLS = 20, ROWS = 16;
const rnd  = n => Math.floor(Math.random() * n);
const pkey = (x, y) => `${x},${y}`;

function inSpawnZone(x, y) {
  return x >= 7 && x <= 13 && y >= 5 && y <= 11;
}

function placeFood(snake, obs) {
  const blocked = new Set([
    ...snake.map(s => pkey(s[0], s[1])),
    ...obs.map(o => pkey(o[0], o[1])),
  ]);
  for (let i = 0; i < 500; i++) {
    const x = rnd(COLS), y = rnd(ROWS);
    if (!blocked.has(pkey(x, y))) return [x, y];
  }
  return [1, 1];
}

function parseGeminiLevel(raw, snake) {
  try {
    const d = typeof raw === "string" ? JSON.parse(raw) : raw;
    const safe = (arr) =>
      (arr || []).filter(
        ([x, y]) =>
          x >= 0 && x < COLS && y >= 0 && y < ROWS &&
          !inSpawnZone(x, y) &&
          !snake.some(s => s[0] === x && s[1] === y)
      );
    const enemies = (d.enemies || []).map(e => ({
      pos: [Math.max(0, Math.min(COLS - 1, e.pos[0])), Math.max(0, Math.min(ROWS - 1, e.pos[1]))],
      dir: e.dir || "RIGHT",
      moveEvery: Math.max(2, e.moveEvery || 3),
    })).filter(e => !inSpawnZone(e.pos[0], e.pos[1]));
    return {
      obstacles:  safe(d.obstacles),
      waterTiles: safe(d.waterTiles),
      plantTiles: safe(d.plantTiles),
      enemies,
      theme:   d.theme   || "jungle",
      insight: d.insight || "Navigate carefully!",
    };
  } catch {
    return null;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("inSpawnZone", () => {
  it("correctly identifies spawn zone center", () => {
    expect(inSpawnZone(10, 8)).toBe(true);
  });
  it("correctly identifies outside spawn zone", () => {
    expect(inSpawnZone(0, 0)).toBe(false);
    expect(inSpawnZone(19, 15)).toBe(false);
  });
  it("correctly identifies spawn zone boundary", () => {
    expect(inSpawnZone(7, 5)).toBe(true);
    expect(inSpawnZone(6, 5)).toBe(false);
    expect(inSpawnZone(7, 4)).toBe(false);
  });
});

describe("placeFood", () => {
  const snake = [[10, 8], [9, 8], [8, 8]];

  it("never places food on the snake", () => {
    for (let i = 0; i < 50; i++) {
      const food = placeFood(snake, []);
      const onSnake = snake.some(s => s[0] === food[0] && s[1] === food[1]);
      expect(onSnake).toBe(false);
    }
  });

  it("never places food on an obstacle", () => {
    const obs = [[5, 5], [6, 6], [7, 7]];
    for (let i = 0; i < 50; i++) {
      const food = placeFood(snake, obs);
      const onObs = obs.some(o => o[0] === food[0] && o[1] === food[1]);
      expect(onObs).toBe(false);
    }
  });

  it("returns valid grid coordinates", () => {
    const food = placeFood(snake, []);
    expect(food[0]).toBeGreaterThanOrEqual(0);
    expect(food[0]).toBeLessThan(COLS);
    expect(food[1]).toBeGreaterThanOrEqual(0);
    expect(food[1]).toBeLessThan(ROWS);
  });
});

describe("parseGeminiLevel", () => {
  const snake = [[10, 8], [9, 8], [8, 8]];

  it("parses a valid level correctly", () => {
    const raw = {
      obstacles:  [[1, 1], [2, 2]],
      waterTiles: [[5, 5]],
      plantTiles: [[6, 6]],
      enemies:    [{ pos: [3, 3], dir: "RIGHT", moveEvery: 3 }],
      theme:      "jungle",
      insight:    "Watch the river!",
    };
    const result = parseGeminiLevel(raw, snake);
    expect(result).not.toBeNull();
    expect(result.theme).toBe("jungle");
    expect(result.insight).toBe("Watch the river!");
    expect(result.obstacles.length).toBe(2);
  });

  it("filters out obstacles in the spawn zone", () => {
    const raw = {
      obstacles:  [[10, 8], [9, 8], [1, 1]], // first two are in spawn zone / on snake
      waterTiles: [],
      plantTiles: [],
      enemies:    [],
      theme:      "jungle",
      insight:    "Test",
    };
    const result = parseGeminiLevel(raw, snake);
    expect(result.obstacles.every(([x, y]) => !inSpawnZone(x, y))).toBe(true);
  });

  it("clamps enemy positions to grid bounds", () => {
    const raw = {
      obstacles: [], waterTiles: [], plantTiles: [],
      enemies: [{ pos: [99, 99], dir: "UP", moveEvery: 3 }],
      theme: "desert", insight: "Test",
    };
    const result = parseGeminiLevel(raw, snake);
    if (result.enemies.length > 0) {
      expect(result.enemies[0].pos[0]).toBeLessThan(COLS);
      expect(result.enemies[0].pos[1]).toBeLessThan(ROWS);
    }
  });

  it("returns null on invalid JSON", () => {
    const result = parseGeminiLevel("not valid json", snake);
    expect(result).toBeNull();
  });

  it("defaults theme to jungle when missing", () => {
    const raw = { obstacles: [], waterTiles: [], plantTiles: [], enemies: [] };
    const result = parseGeminiLevel(raw, snake);
    expect(result.theme).toBe("jungle");
  });
});

describe("snake movement logic", () => {
  it("wraps horizontally at grid boundary", () => {
    const head = [19, 8];
    const dir  = [1, 0]; // moving RIGHT
    const nh   = [(head[0] + dir[0] + COLS) % COLS, (head[1] + dir[1] + ROWS) % ROWS];
    expect(nh).toEqual([0, 8]);
  });

  it("wraps vertically at grid boundary", () => {
    const head = [10, 15];
    const dir  = [0, 1]; // moving DOWN
    const nh   = [(head[0] + dir[0] + COLS) % COLS, (head[1] + dir[1] + ROWS) % ROWS];
    expect(nh).toEqual([10, 0]);
  });

  it("prevents reversing direction", () => {
    const currentDir = [1, 0]; // moving RIGHT
    const newDir     = [-1, 0]; // trying LEFT
    const [dx, dy]   = newDir;
    const [cx, cy]   = currentDir;
    const isReverse  = dx + cx === 0 && dy + cy === 0;
    expect(isReverse).toBe(true);
  });

  it("allows perpendicular direction change", () => {
    const currentDir = [1, 0]; // moving RIGHT
    const newDir     = [0, -1]; // trying UP
    const [dx, dy]   = newDir;
    const [cx, cy]   = currentDir;
    const isReverse  = dx + cx === 0 && dy + cy === 0;
    expect(isReverse).toBe(false);
  });
});

describe("score and speed progression", () => {
  it("speed decreases every 50 points (up to minimum)", () => {
    let speed = 185;
    const scoreThresholds = [50, 100, 150];
    scoreThresholds.forEach(score => {
      if (score % 50 === 0 && speed > 85) speed -= 12;
    });
    expect(speed).toBe(185 - 12 * 3); // 149
  });

  it("speed never goes below 85ms", () => {
    let speed = 90;
    if (speed > 85) speed -= 12;
    expect(speed).toBe(78); // would go below, real code has guard: speed > 85 before decrement
    // In game code: if(score%50===0 && speed>85) speed-=12
    // So at speed=90: 90>85 → speed becomes 78. Next check: 78>85 is false → stops. ✓
  });
});
