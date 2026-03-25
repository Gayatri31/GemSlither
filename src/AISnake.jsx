import { useState, useEffect, useRef, useCallback } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────
const COLS = 20, ROWS = 16, CELL = 36;
const W = COLS * CELL, H = ROWS * CELL;
const DIR  = { UP:[0,-1], DOWN:[0,1], LEFT:[-1,0], RIGHT:[1,0] };
const KMAP = {
  ArrowUp:"UP", ArrowDown:"DOWN", ArrowLeft:"LEFT", ArrowRight:"RIGHT",
  w:"UP", s:"DOWN", a:"LEFT", d:"RIGHT",
};
const rnd  = n => Math.floor(Math.random() * n);
const pkey = (x, y) => `${x},${y}`;

// ── Spawn zone (never place obstacles here) ───────────────────────────────────
const SPAWN = [[10,8],[9,8],[8,8]];
function inSpawnZone(x, y) {
  return x >= 7 && x <= 13 && y >= 5 && y <= 11;
}

function placeFood(snake, obs) {
  const blocked = new Set([...snake.map(s=>pkey(s[0],s[1])), ...obs.map(o=>pkey(o[0],o[1]))]);
  for (let i=0; i<500; i++) { const x=rnd(COLS),y=rnd(ROWS); if(!blocked.has(pkey(x,y))) return [x,y]; }
  return [1,1];
}

// ── Generate default rich level (always has content even without AI) ───────────
function generateDefaultLevel(theme) {
  const obstacles = [], waterTiles = [], plantTiles = [], enemies = [];
  const themeSeeds = { jungle:42, volcanic:13, crystal:77, desert:29 };
  let s = themeSeeds[theme] || 42;
  const pr = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return Math.abs(s) / 0x7fffffff; };

  if (theme === "jungle") {
    // River cluster on left side
    for (let y=2; y<14; y++) { if(!inSpawnZone(1,y)&&!inSpawnZone(2,y)) { waterTiles.push([1,y]); if(pr()<0.6) waterTiles.push([2,y]); } }
    for (let y=3; y<10; y++) { if(!inSpawnZone(3,y)) waterTiles.push([3,y]); }
    // Rock clusters
    [[5,2],[5,3],[6,2],[15,1],[16,1],[15,2],[17,5],[18,5],[17,6],
     [8,13],[9,13],[8,14],[15,10],[16,10],[15,11],[18,12],[19,12]].forEach(([x,y])=>{
      if(!inSpawnZone(x,y)) obstacles.push([x,y]);
    });
    // Plants scattered
    for (let i=0;i<12;i++) {
      const x=Math.floor(pr()*18)+1, y=Math.floor(pr()*14)+1;
      if(!inSpawnZone(x,y)&&!waterTiles.some(w=>w[0]===x&&w[1]===y)&&!obstacles.some(o=>o[0]===x&&o[1]===y))
        plantTiles.push([x,y]);
    }
    // Enemies
    enemies.push({pos:[4,4],dir:"RIGHT",moveEvery:3},{pos:[17,12],dir:"LEFT",moveEvery:4});
  } else if (theme === "volcanic") {
    // Lava flows
    for (let x=0;x<5;x++) { if(!inSpawnZone(x,0)) waterTiles.push([x,0]); }
    for (let y=0;y<4;y++) { if(!inSpawnZone(0,y)) waterTiles.push([0,y]); }
    for (let x=16;x<20;x++) { if(!inSpawnZone(x,15)) waterTiles.push([x,15]); }
    for (let y=12;y<16;y++) { if(!inSpawnZone(19,y)) waterTiles.push([19,y]); }
    // Rock obstacles
    [[3,2],[4,2],[3,3],[7,1],[8,1],[6,5],[7,5],[6,6],
     [14,3],[15,3],[14,4],[17,7],[18,7],[16,11],[17,11],[15,14],[16,14]].forEach(([x,y])=>{
      if(!inSpawnZone(x,y)) obstacles.push([x,y]);
    });
    enemies.push({pos:[5,5],dir:"DOWN",moveEvery:2},{pos:[16,10],dir:"UP",moveEvery:3});
  } else if (theme === "crystal") {
    // Crystal pools (water-like)
    [[1,1],[2,1],[1,2],[18,1],[19,1],[19,2],[1,14],[2,14],[1,15],[18,14],[19,14],[18,15]].forEach(([x,y])=>{
      if(!inSpawnZone(x,y)) waterTiles.push([x,y]);
    });
    // Crystal shards
    [[4,3],[5,3],[4,4],[6,1],[15,2],[16,2],[15,3],[14,7],[15,7],
     [5,11],[6,11],[5,12],[17,10],[18,10],[16,13],[17,13]].forEach(([x,y])=>{
      if(!inSpawnZone(x,y)) obstacles.push([x,y]);
    });
    enemies.push({pos:[3,8],dir:"RIGHT",moveEvery:4},{pos:[17,5],dir:"DOWN",moveEvery:3});
  } else { // desert
    // Oasis water
    [[9,2],[10,2],[11,2],[9,3],[10,3],[11,3]].forEach(([x,y])=>{
      if(!inSpawnZone(x,y)) waterTiles.push([x,y]);
    });
    // Desert rocks + cacti
    [[2,1],[3,1],[2,2],[17,1],[18,1],[17,2],[1,8],[2,8],[1,9],
     [18,7],[19,7],[18,8],[4,13],[5,13],[4,14],[16,12],[17,12],[15,14]].forEach(([x,y])=>{
      if(!inSpawnZone(x,y)) obstacles.push([x,y]);
    });
    // Sparse plants
    [[6,5],[13,4],[7,11],[14,10],[3,7],[17,14]].forEach(([x,y])=>{
      if(!inSpawnZone(x,y)) plantTiles.push([x,y]);
    });
    enemies.push({pos:[6,6],dir:"RIGHT",moveEvery:3});
  }
  const insights = {
    jungle:"Stay near the river and avoid the enemies!",
    volcanic:"Hug the walls — lava flows cut through the middle!",
    crystal:"Crystal shards block corners — spiral inward!",
    desert:"Head to the oasis, but watch for desert raiders!",
  };
  return { obstacles, waterTiles, plantTiles, enemies, insight: insights[theme]||"Navigate carefully!" };
}

// ── Gemini API key — read from Vite env, fallback to runtime input ────────────
const ENV_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

// ── Gemini 2.5 Flash ──────────────────────────────────────────────────────────
async function callGemini(apiKey, userPrompt) {
  const SYSTEM = `You are a Snake game level designer. Return ONLY a raw JSON object.
No markdown. No code fences. No explanation. Just the JSON.
Required fields:
{
  "obstacles":  [[x,y],...],
  "waterTiles": [[x,y],...],
  "plantTiles": [[x,y],...],
  "enemies":    [{"pos":[x,y],"dir":"RIGHT","moveEvery":3},...],
  "theme":      "jungle" or "volcanic" or "crystal" or "desert",
  "insight":    "one short tactical sentence"
}
Rules: x 0-19, y 0-15. obstacles 8-14 pairs. waterTiles 6-12 pairs in clusters. plantTiles 4-8 pairs. enemies 1-3.
CRITICAL: Never use coordinates where x is 7-13 AND y is 5-11. That is the snake spawn zone.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      system_instruction: { parts:[{ text: SYSTEM }] },
      contents: [{ role:"user", parts:[{ text: userPrompt }] }],
      generationConfig: {
        temperature: 1.0,
        maxOutputTokens: 800,
        responseMimeType: "application/json",
        // Disable thinking to get faster, denser output
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e?.error?.message||`HTTP ${res.status}`); }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const clean = text.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : {};
}

function parseGeminiLevel(raw, snake) {
  try {
    const d = typeof raw==="string" ? JSON.parse(raw) : raw;
    const safe = (arr) => (arr||[]).filter(([x,y])=>
      x>=0&&x<COLS&&y>=0&&y<ROWS&&!inSpawnZone(x,y)&&!snake.some(s=>s[0]===x&&s[1]===y)
    );
    const enemies = (d.enemies||[]).map(e=>({
      pos:[Math.max(0,Math.min(COLS-1,e.pos[0])),Math.max(0,Math.min(ROWS-1,e.pos[1]))],
      dir:e.dir||"RIGHT", moveEvery:Math.max(2,e.moveEvery||3),
    })).filter(e=>!inSpawnZone(e.pos[0],e.pos[1]));
    return {
      obstacles: safe(d.obstacles),
      waterTiles: safe(d.waterTiles),
      plantTiles: safe(d.plantTiles),
      enemies, theme:d.theme||"jungle", insight:d.insight||"Navigate carefully!",
    };
  } catch { return null; }
}

// ── THEMES ────────────────────────────────────────────────────────────────────
const THEMES = {
  jungle:   { bgTop:"#061404", bgBot:"#0a1e06", grid:"rgba(15,45,8,0.55)",  bdr:"#1a6a1a", title:"Jungle"      },
  volcanic: { bgTop:"#150400", bgBot:"#1c0600", grid:"rgba(45,12,0,0.55)",  bdr:"#8a2200", title:"Volcanic"    },
  crystal:  { bgTop:"#000510", bgBot:"#00091c", grid:"rgba(0,20,65,0.55)",  bdr:"#0055aa", title:"Crystal Cave" },
  desert:   { bgTop:"#120e00", bgBot:"#181300", grid:"rgba(65,50,0,0.55)",  bdr:"#997700", title:"Desert"      },
};

// ════════════════════════════════════════════════════════════════════════════
// SPRITE DRAWING — each function is self-contained, saves/restores ctx
// ════════════════════════════════════════════════════════════════════════════

function drawGroundTile(ctx, x, y, theme) {
  const px=x*CELL, py=y*CELL;
  const even=(x+y)%2===0;
  const c = {
    jungle:   even?["#0c2208","#0e2a09"]:["#0e2a09","#0c2208"],
    volcanic: even?["#190600","#1e0800"]:["#1e0800","#190600"],
    crystal:  even?["#000918","#000c20"]:["#000c20","#000918"],
    desert:   even?["#151100","#1a1500"]:["#1a1500","#151100"],
  }[theme]||["#0c2208","#0e2a09"];
  const g=ctx.createLinearGradient(px,py,px+CELL,py+CELL);
  g.addColorStop(0,c[0]); g.addColorStop(1,c[1]);
  ctx.fillStyle=g; ctx.fillRect(px,py,CELL,CELL);
  // Subtle texture flecks
  ctx.fillStyle= theme==="jungle"?"rgba(20,60,10,0.18)":
                 theme==="volcanic"?"rgba(60,15,0,0.18)":
                 theme==="crystal"?"rgba(0,30,80,0.18)":"rgba(80,65,0,0.18)";
  const fx=px+((x*7+y*3)%CELL), fy=py+((x*3+y*11)%CELL);
  ctx.fillRect(fx,fy,2,2);
  ctx.strokeStyle=THEMES[theme]?.grid||"rgba(15,45,8,0.5)";
  ctx.lineWidth=0.4; ctx.strokeRect(px,py,CELL,CELL);
}

// ── WATER / RIVER TILE ────────────────────────────────────────────────────────
function drawWater(ctx, x, y, frame, theme) {
  const px=x*CELL, py=y*CELL, t=frame*0.03;
  ctx.save(); ctx.beginPath(); ctx.rect(px,py,CELL,CELL); ctx.clip();
  // Base
  if(theme==="volcanic"){
    // Lava
    const lg=ctx.createRadialGradient(px+CELL/2,py+CELL/2,1,px+CELL/2,py+CELL/2,CELL*0.7);
    const p=0.5+0.5*Math.sin(t*1.8+x*0.9+y*0.7);
    lg.addColorStop(0,`rgb(255,${55+p*90|0},0)`);
    lg.addColorStop(0.55,"#cc1a00"); lg.addColorStop(1,"#550800");
    ctx.fillStyle=lg; ctx.fillRect(px,py,CELL,CELL);
    // Crust lines
    ctx.strokeStyle="rgba(20,0,0,0.55)"; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(px+3,py+CELL*0.5); ctx.lineTo(px+CELL*0.4,py+CELL*0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px+CELL*0.5,py+3); ctx.lineTo(px+CELL*0.75,py+CELL*0.6); ctx.stroke();
    // Bright glow fleck
    if(p>0.8){ ctx.fillStyle=`rgba(255,${160+p*80|0},0,${(p-0.8)*0.8})`; ctx.beginPath(); ctx.arc(px+8+((x*5+y)%20),py+8+((x+y*7)%20),3,0,Math.PI*2); ctx.fill(); }
  } else {
    // Water
    const wg=ctx.createLinearGradient(px,py,px+CELL,py+CELL);
    wg.addColorStop(0,"#072840"); wg.addColorStop(0.5,"#0a3d60"); wg.addColorStop(1,"#072840");
    ctx.fillStyle=wg; ctx.fillRect(px,py,CELL,CELL);
    // Shimmer overlay
    const sa=0.07+0.05*Math.sin(t+x*0.45+y*0.35);
    ctx.fillStyle=`rgba(80,170,255,${sa})`; ctx.fillRect(px,py,CELL,CELL);
    // Wave lines
    ctx.strokeStyle="rgba(110,195,255,0.38)"; ctx.lineWidth=1.3; ctx.lineCap="round";
    for(let i=0;i<3;i++){
      const wy=py+5+i*9+Math.sin(t*1.2+x*0.55+i*1.6)*3.5;
      ctx.beginPath(); ctx.moveTo(px+1,wy);
      ctx.bezierCurveTo(px+CELL*0.28,wy-3.5,px+CELL*0.68,wy+3.5,px+CELL-1,wy); ctx.stroke();
    }
    // Sparkle
    const sp=Math.sin(t*1.9+x*1.3+y*0.85);
    if(sp>0.76){ ctx.fillStyle=`rgba(200,240,255,${(sp-0.76)*0.75})`; ctx.beginPath(); ctx.arc(px+5+((x*9+y*3)%24),py+4+((x*3+y*7)%24),2.2,0,Math.PI*2); ctx.fill(); }
  }
  ctx.restore();
}

// ── ROCK SPRITE ───────────────────────────────────────────────────────────────
function drawRock(ctx, x, y, seed) {
  const px=x*CELL, py=y*CELL;
  ctx.save();
  // Drop shadow
  ctx.fillStyle="rgba(0,0,0,0.45)";
  ctx.beginPath(); ctx.ellipse(px+CELL/2+3,py+CELL-3,CELL/2-5,5,0,0,Math.PI*2); ctx.fill();
  const P=[
    {base:"#5e5450",mid:"#786e68",hi:"#948880",dk:"#44382e"},
    {base:"#504c48",mid:"#686058",hi:"#807870",dk:"#383430"},
    {base:"#524640",mid:"#6c5e54",hi:"#847468",dk:"#3a2e28"},
    {base:"#584e46",mid:"#726658",hi:"#8a7a6e",dk:"#403428"},
  ][seed%4];
  // Main mass
  ctx.fillStyle=P.mid;
  ctx.beginPath();
  ctx.moveTo(px+7,   py+CELL-4);
  ctx.lineTo(px+3,   py+CELL*0.5);
  ctx.lineTo(px+CELL*0.24,py+5);
  ctx.lineTo(px+CELL*0.55,py+3);
  ctx.lineTo(px+CELL-5,py+CELL*0.28);
  ctx.lineTo(px+CELL-3,py+CELL-4);
  ctx.closePath(); ctx.fill();
  // Shadow face (left)
  ctx.fillStyle=P.dk;
  ctx.beginPath();
  ctx.moveTo(px+7,py+CELL-4); ctx.lineTo(px+3,py+CELL*0.5);
  ctx.lineTo(px+CELL*0.38,py+CELL*0.52); ctx.lineTo(px+CELL*0.44,py+CELL-4);
  ctx.closePath(); ctx.fill();
  // Highlight top
  ctx.fillStyle=P.hi;
  ctx.beginPath();
  ctx.moveTo(px+CELL*0.24,py+5); ctx.lineTo(px+CELL*0.55,py+3);
  ctx.lineTo(px+CELL-5,py+CELL*0.28); ctx.lineTo(px+CELL*0.62,py+CELL*0.38);
  ctx.lineTo(px+CELL*0.34,py+CELL*0.34); ctx.closePath(); ctx.fill();
  // Cracks
  ctx.strokeStyle=P.dk; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(px+CELL*0.46,py+CELL*0.32); ctx.lineTo(px+CELL*0.54,py+CELL*0.63); ctx.lineTo(px+CELL*0.65,py+CELL*0.7); ctx.stroke();
  // Moss
  ctx.fillStyle="rgba(30,95,12,0.55)";
  ctx.beginPath(); ctx.ellipse(px+CELL*0.48,py+CELL*0.16,CELL*0.17,CELL*0.09,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="rgba(50,130,18,0.35)";
  ctx.beginPath(); ctx.ellipse(px+CELL*0.36,py+CELL*0.22,CELL*0.1,CELL*0.07,-0.5,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ── CRYSTAL SHARD ─────────────────────────────────────────────────────────────
function drawCrystalShard(ctx, x, y, seed, frame) {
  const px=x*CELL, py=y*CELL;
  const p=0.6+0.4*Math.sin(frame*0.055+seed*0.85);
  const cols=["#1166ee","#0088ff","#2244ff","#00aaee","#4466ff"][seed%5];
  ctx.save();
  ctx.shadowColor=cols; ctx.shadowBlur=16*p;
  ctx.fillStyle=cols;
  ctx.beginPath();
  ctx.moveTo(px+CELL/2, py+4);
  ctx.lineTo(px+CELL-4, py+CELL*0.46);
  ctx.lineTo(px+CELL*0.66, py+CELL-4);
  ctx.lineTo(px+CELL*0.34, py+CELL-4);
  ctx.lineTo(px+4, py+CELL*0.46);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur=0;
  // Facet highlight
  ctx.fillStyle="rgba(190,230,255,0.38)";
  ctx.beginPath(); ctx.moveTo(px+CELL/2,py+7); ctx.lineTo(px+CELL*0.65,py+CELL*0.38); ctx.lineTo(px+CELL/2,py+CELL*0.3); ctx.closePath(); ctx.fill();
  ctx.fillStyle=`rgba(230,248,255,${p*0.7})`;
  ctx.beginPath(); ctx.arc(px+CELL/2,py+6,3,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ── DESERT SANDSTONE ──────────────────────────────────────────────────────────
function drawSandstone(ctx, x, y, seed) {
  const px=x*CELL, py=y*CELL;
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,0.42)";
  ctx.beginPath(); ctx.ellipse(px+CELL/2+2,py+CELL-3,CELL/2-5,5,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#8a7238";
  ctx.beginPath();
  ctx.moveTo(px+7,py+CELL-4); ctx.lineTo(px+4,py+CELL*0.44);
  ctx.lineTo(px+CELL*0.3,py+5); ctx.lineTo(px+CELL*0.7,py+5);
  ctx.lineTo(px+CELL-4,py+CELL*0.44); ctx.lineTo(px+CELL-7,py+CELL-4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle="#b09448";
  ctx.beginPath(); ctx.moveTo(px+CELL*0.3,py+5); ctx.lineTo(px+CELL*0.7,py+5);
  ctx.lineTo(px+CELL*0.62,py+CELL*0.38); ctx.lineTo(px+CELL*0.38,py+CELL*0.38); ctx.closePath(); ctx.fill();
  ctx.strokeStyle="#6a5020"; ctx.lineWidth=0.9;
  [0.44,0.62].forEach(f=>{ctx.beginPath();ctx.moveTo(px+7,py+CELL*f);ctx.lineTo(px+CELL-7,py+CELL*f);ctx.stroke();});
  // Sun-crack
  ctx.strokeStyle="#544018"; ctx.lineWidth=0.8;
  ctx.beginPath(); ctx.moveTo(px+CELL*0.5,py+CELL*0.28); ctx.lineTo(px+CELL*0.58,py+CELL*0.72); ctx.stroke();
  ctx.restore();
}

// ── VOLCANIC BOULDER ──────────────────────────────────────────────────────────
function drawVolcanicRock(ctx, x, y, seed, frame) {
  const px=x*CELL, py=y*CELL;
  const glow=0.4+0.35*Math.sin(frame*0.04+seed*0.7);
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,0.4)";
  ctx.beginPath(); ctx.ellipse(px+CELL/2+3,py+CELL-3,CELL/2-5,5,0,0,Math.PI*2); ctx.fill();
  // Main body
  ctx.fillStyle="#3a2418";
  ctx.beginPath();
  ctx.moveTo(px+6,py+CELL-4); ctx.lineTo(px+3,py+CELL*0.5);
  ctx.lineTo(px+CELL*0.25,py+5); ctx.lineTo(px+CELL*0.6,py+3);
  ctx.lineTo(px+CELL-4,py+CELL*0.28); ctx.lineTo(px+CELL-3,py+CELL-4);
  ctx.closePath(); ctx.fill();
  // Lava veins glowing
  ctx.strokeStyle=`rgba(255,${80+glow*120|0},0,${0.5+glow*0.4})`;
  ctx.lineWidth=1.5; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(px+CELL*0.35,py+CELL*0.4); ctx.lineTo(px+CELL*0.55,py+CELL*0.7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px+CELL*0.6,py+CELL*0.25); ctx.lineTo(px+CELL*0.45,py+CELL*0.5); ctx.stroke();
  // Top highlight
  ctx.fillStyle="#5a3828";
  ctx.beginPath(); ctx.moveTo(px+CELL*0.25,py+5); ctx.lineTo(px+CELL*0.6,py+3);
  ctx.lineTo(px+CELL-4,py+CELL*0.28); ctx.lineTo(px+CELL*0.6,py+CELL*0.38); ctx.lineTo(px+CELL*0.32,py+CELL*0.35); ctx.closePath(); ctx.fill();
  // Glow halo at lava crack
  if(glow>0.55){
    ctx.fillStyle=`rgba(255,100,0,${(glow-0.55)*0.3})`;
    ctx.beginPath(); ctx.arc(px+CELL*0.5,py+CELL*0.55,7,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

// ── JUNGLE PLANT / FERN ───────────────────────────────────────────────────────
function drawPlant(ctx, x, y, seed, frame) {
  const cx=x*CELL+CELL/2, by=y*CELL+CELL-2;
  const sway=Math.sin(frame*0.027+seed*1.5)*2.4;
  ctx.save();
  const lc=["#1e6a08","#288c10","#32aa18","#185808","#3abb20","#226010"];
  // 3 stems
  for(let i=0;i<3;i++){
    const ox=(i-1)*5;
    ctx.strokeStyle="#175006"; ctx.lineWidth=1.4; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(cx+ox,by);
    ctx.quadraticCurveTo(cx+ox+sway*0.6+ox*0.2,by-9,cx+ox+sway+ox*0.4,by-16-i*2.5); ctx.stroke();
  }
  // Fan leaves
  for(let i=0;i<7;i++){
    const a=(i/7)*Math.PI-0.15+sway*0.055;
    const lr=8+(seed+i)%5;
    const lx=cx+Math.cos(a)*lr+sway*0.35, ly=by-7-Math.sin(a)*lr*0.6;
    ctx.fillStyle=lc[(seed*3+i)%lc.length];
    ctx.beginPath(); ctx.ellipse(lx,ly,lr*0.78,lr*0.27,a,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="rgba(0,30,0,0.35)"; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.moveTo(cx+sway*0.15,by-5); ctx.lineTo(lx,ly); ctx.stroke();
  }
  // Top bud
  ctx.fillStyle="#55dd20"; ctx.beginPath(); ctx.arc(cx+sway,by-19,5,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#88ff44"; ctx.beginPath(); ctx.arc(cx+sway,by-19,2.8,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ── DESERT CACTUS / PLANT ─────────────────────────────────────────────────────
function drawDesertPlant(ctx, x, y, seed, frame) {
  const cx=x*CELL+CELL/2, by=y*CELL+CELL-2;
  const sway=Math.sin(frame*0.02+seed)*0.8;
  ctx.save();
  ctx.strokeStyle="#4a7820"; ctx.lineWidth=3.5; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(cx,by); ctx.lineTo(cx+sway,by-18); ctx.stroke();
  // Arms
  ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(cx+sway,by-10); ctx.lineTo(cx+sway-8,by-10); ctx.lineTo(cx+sway-8,by-6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+sway,by-13); ctx.lineTo(cx+sway+7,by-13); ctx.lineTo(cx+sway+7,by-9); ctx.stroke();
  // Spines
  ctx.strokeStyle="#2a5010"; ctx.lineWidth=0.8;
  [by-5,by-10,by-15].forEach(sy=>{ [cx-6+sway,cx+6+sway].forEach(sx=>{ ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx+(sx<cx?-3:3),sy-2); ctx.stroke(); }); });
  // Top flower
  ctx.fillStyle="#ffcc00"; ctx.beginPath(); ctx.arc(cx+sway,by-20,3.5,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ── CRYSTAL PLANT ─────────────────────────────────────────────────────────────
function drawCrystalPlant(ctx, x, y, seed, frame) {
  const cx=x*CELL+CELL/2, by=y*CELL+CELL-2;
  const p=0.5+0.5*Math.sin(frame*0.06+seed);
  ctx.save();
  ctx.shadowColor="#44aaff"; ctx.shadowBlur=8*p;
  // Mini crystal spires
  [[0,-16],[-6,-11],[6,-10]].forEach(([ox,h])=>{
    ctx.fillStyle=`rgba(0,${130+p*80|0},255,0.8)`;
    ctx.beginPath(); ctx.moveTo(cx+ox,by+h); ctx.lineTo(cx+ox-3,by); ctx.lineTo(cx+ox+3,by); ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(180,230,255,0.4)"; ctx.beginPath(); ctx.moveTo(cx+ox,by+h); ctx.lineTo(cx+ox+1,by+h/2); ctx.lineTo(cx+ox-1,by+h/2); ctx.closePath(); ctx.fill();
  });
  ctx.restore();
}

// ── FOOD ──────────────────────────────────────────────────────────────────────
function drawFood(ctx, [x,y], frame) {
  const px=x*CELL+CELL/2, py=y*CELL+CELL/2;
  const bob=Math.sin(frame*0.07)*3.5, glow=0.5+0.5*Math.sin(frame*0.09);
  ctx.save(); ctx.translate(px,py+bob);
  // Shadow
  ctx.fillStyle="rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(2,CELL/2-5,CELL/2-5,4,0,0,Math.PI*2); ctx.fill();
  // Soft outer glow ring
  const rg=ctx.createRadialGradient(0,0,3,0,0,CELL/2+6);
  rg.addColorStop(0,"rgba(255,30,60,0)"); rg.addColorStop(0.65,`rgba(255,30,60,${0.15*glow})`); rg.addColorStop(1,"rgba(255,30,60,0)");
  ctx.fillStyle=rg; ctx.beginPath(); ctx.arc(0,0,CELL/2+6,0,Math.PI*2); ctx.fill();
  // Main orb
  ctx.shadowColor="#ff1a44"; ctx.shadowBlur=18*glow;
  const og=ctx.createRadialGradient(-4,-5,1,0,0,CELL/2-2);
  og.addColorStop(0,"#ff9aaa"); og.addColorStop(0.4,"#ff1a44"); og.addColorStop(1,"#880018");
  ctx.fillStyle=og; ctx.beginPath(); ctx.arc(0,0,CELL/2-2,0,Math.PI*2); ctx.fill();
  ctx.shadowBlur=0;
  // Specular
  ctx.fillStyle="rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.ellipse(-4.5,-5.5,5.5,3.5,Math.PI*0.28,0,Math.PI*2); ctx.fill();
  // Sparkle rays
  if(glow>0.76){const a2=(glow-0.76)*5.5; ctx.strokeStyle=`rgba(255,150,165,${a2})`; ctx.lineWidth=0.9; for(let i=0;i<4;i++){const a=i*Math.PI/2+frame*0.03,r=CELL/2+3; ctx.beginPath(); ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r); ctx.lineTo(Math.cos(a)*(r+6),Math.sin(a)*(r+6)); ctx.stroke();}}
  ctx.restore();
}

// ── SNAKE — fully articulated ─────────────────────────────────────────────────
function drawSnake(ctx, snake, frame) {
  if(!snake.length) return;
  // Body from tail to neck
  for(let i=snake.length-1;i>=1;i--) drawBodySeg(ctx,snake[i],snake[i-1],i,snake.length,frame);
  // Head always on top
  drawHead(ctx, snake[0], snake[1]||null, frame);
}

function drawBodySeg(ctx, seg, prev, idx, len, frame) {
  const px=seg[0]*CELL, py=seg[1]*CELL;
  const frac=idx/Math.max(len-1,1);
  const gv=Math.floor(188-frac*60), gv2=Math.floor(150-frac*50);
  ctx.save(); ctx.translate(px+CELL/2,py+CELL/2);
  if(frac<0.3){ ctx.shadowColor=`rgba(0,255,80,${0.18*(1-frac/0.3)})`; ctx.shadowBlur=9; }
  const sg=ctx.createLinearGradient(-CELL/2,-CELL/2,CELL/2,CELL/2);
  sg.addColorStop(0,`rgb(26,${gv},22)`); sg.addColorStop(1,`rgb(16,${gv2},14)`);
  ctx.fillStyle=sg;
  ctx.beginPath(); ctx.roundRect(-CELL/2+3,-CELL/2+3,CELL-6,CELL-6,idx===len-1?8:4); ctx.fill();
  ctx.shadowBlur=0;
  // Scale oval
  ctx.fillStyle=`rgba(45,${gv+22},30,0.25)`;
  ctx.beginPath(); ctx.ellipse(0,0,CELL/3.2,CELL/4.8,0,0,Math.PI*2); ctx.fill();
  // Underbelly stripe (direction-aware)
  const dx=seg[0]-prev[0], dy=seg[1]-prev[1];
  ctx.fillStyle=`rgba(65,${gv+32},42,0.22)`;
  if(Math.abs(dx)>Math.abs(dy)){ ctx.beginPath(); ctx.roundRect(-CELL/2+3,-3.5,CELL-6,7,3.5); ctx.fill(); }
  else { ctx.beginPath(); ctx.roundRect(-3.5,-CELL/2+3,7,CELL-6,3.5); ctx.fill(); }
  // Tail tip
  if(idx===len-1){ ctx.fillStyle=`rgb(14,${gv2-28},12)`; ctx.beginPath(); ctx.ellipse(0,0,CELL/4.8,CELL/4.8,0,0,Math.PI*2); ctx.fill(); }
  ctx.restore();
}

function drawHead(ctx, head, neck, frame) {
  const px=head[0]*CELL, py=head[1]*CELL;
  // Direction from neck→head
  let dx=1,dy=0;
  if(neck){ dx=head[0]-neck[0]; dy=head[1]-neck[1]; }
  const mag=Math.sqrt(dx*dx+dy*dy)||1; dx/=mag; dy/=mag;
  const angle=Math.atan2(dy,dx);
  ctx.save(); ctx.translate(px+CELL/2,py+CELL/2); ctx.rotate(angle);
  // Glow
  ctx.shadowColor="#00ff66"; ctx.shadowBlur=18*(0.82+0.18*Math.sin(frame*0.09));
  // Head shape (elongated forward)
  const hg=ctx.createLinearGradient(-CELL/2,-CELL/2,CELL*0.6,CELL/2);
  hg.addColorStop(0,"#00ee66"); hg.addColorStop(0.5,"#00cc44"); hg.addColorStop(1,"#008833");
  ctx.fillStyle=hg; ctx.beginPath(); ctx.roundRect(-CELL/2+2,-CELL/2+2,CELL-4,CELL-4,8); ctx.fill();
  ctx.shadowBlur=0;
  // Face plate (lighter top half)
  const fp=ctx.createLinearGradient(0,-CELL/2,0,0);
  fp.addColorStop(0,"#00ff88"); fp.addColorStop(1,"#00dd55");
  ctx.fillStyle=fp; ctx.beginPath(); ctx.roundRect(-CELL/2+4,-CELL/2+4,CELL-8,CELL/2-1,6); ctx.fill();
  // Scale diamond
  ctx.fillStyle="rgba(0,155,50,0.38)"; ctx.beginPath(); ctx.arc(0,-1,CELL/5.5,0,Math.PI*2); ctx.fill();
  // Eyes — perpendicular to travel direction
  [[-1,1],[1,1]].forEach(([s2])=>{
    const ex=s2*(CELL*0.21), ey=-(CELL*0.16);
    ctx.fillStyle="#001800"; ctx.beginPath(); ctx.arc(ex,ey,4.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#00ff88"; ctx.beginPath(); ctx.arc(ex,ey,2.4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#001200"; ctx.beginPath(); ctx.arc(ex,ey,1.3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.arc(ex+0.8,ey-0.9,1,0,Math.PI*2); ctx.fill();
  });
  // Nostrils
  ctx.fillStyle="rgba(0,55,15,0.75)";
  [[-3,-(CELL/2-7)],[3,-(CELL/2-7)]].forEach(([nx,ny])=>{ ctx.beginPath(); ctx.arc(nx,ny,1.4,0,Math.PI*2); ctx.fill(); });
  // Tongue (flicks forward = negative Y after rotation)
  const tp=Math.sin(frame*0.13);
  if(tp>0.42){
    const ext=(tp-0.42)*2.9;
    ctx.strokeStyle="#ff1155"; ctx.lineWidth=2; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(0,-(CELL/2-5)); ctx.lineTo(0,-(CELL/2-5)-12*ext); ctx.stroke();
    ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(0,-(CELL/2-5)-12*ext); ctx.lineTo(-5*ext,-(CELL/2-5)-17*ext);
    ctx.moveTo(0,-(CELL/2-5)-12*ext); ctx.lineTo(5*ext,-(CELL/2-5)-17*ext);
    ctx.stroke();
  }
  ctx.restore();
}

// ── ENEMY SPRITE ──────────────────────────────────────────────────────────────
function drawEnemy(ctx, enemy, frame) {
  const [x,y]=enemy.pos;
  const px=x*CELL+CELL/2, py=y*CELL+CELL/2;
  const bounce=Math.sin(frame*0.13)*3;
  const sq=1+Math.sin(frame*0.13)*0.07;
  ctx.save(); ctx.translate(px,py+bounce); ctx.scale(sq,2-sq);
  // Shadow
  ctx.fillStyle="rgba(0,0,0,0.32)"; ctx.beginPath(); ctx.ellipse(0,CELL/2-4,CELL/3,4,0,0,Math.PI*2); ctx.fill();
  ctx.scale(1/sq,1/(2-sq));
  // Star body
  ctx.shadowColor="rgba(255,165,0,0.7)"; ctx.shadowBlur=14;
  const bg2=ctx.createRadialGradient(-2,-3,2,0,0,CELL/2-2);
  bg2.addColorStop(0,"#ffe055"); bg2.addColorStop(0.55,"#ffaa00"); bg2.addColorStop(1,"#cc5500");
  ctx.fillStyle=bg2;
  ctx.beginPath();
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6-Math.PI/12, r=i%2===0?CELL/2-3:CELL/2-9;
    i===0?ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r):ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);
  }
  ctx.closePath(); ctx.fill(); ctx.shadowBlur=0;
  // Inner ring
  ctx.fillStyle="#ffee88";
  ctx.beginPath();
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6-Math.PI/12, r=i%2===0?CELL/2-9:CELL/2-13;
    i===0?ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r):ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);
  }
  ctx.closePath(); ctx.fill();
  // Angry eyes
  [[-5,-4],[5,-4]].forEach(([ex,ey])=>{
    ctx.fillStyle="#1a0000"; ctx.beginPath(); ctx.arc(ex,ey,3.8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="#ff2200"; ctx.beginPath(); ctx.arc(ex+0.4,ey-0.4,1.7,0,Math.PI*2); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(ex+1,ey-1,0.9,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="#2a0000"; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.moveTo(ex-4,ey-5.5); ctx.lineTo(ex+4,ey-3.5); ctx.stroke();
  });
  ctx.strokeStyle="#aa2200"; ctx.lineWidth=1.7;
  ctx.beginPath(); ctx.arc(0,3.5,4.5,Math.PI*0.12,Math.PI*0.88); ctx.stroke();
  // Glint
  if(Math.sin(frame*0.11+x*0.7+y*1.3)>0.78){ ctx.fillStyle="rgba(255,240,120,0.95)"; ctx.beginPath(); ctx.arc(CELL/2-5,-CELL/2+6,2.8,0,Math.PI*2); ctx.fill(); }
  ctx.restore();
}

// ── Particle System ───────────────────────────────────────────────────────────
class PS {
  constructor(){ this.p=[]; }
  emit(x,y,color,n=8){ for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,sp=1.5+Math.random()*4; this.p.push({x:x*CELL+CELL/2,y:y*CELL+CELL/2,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,decay:0.024+Math.random()*0.022,sz:2+Math.random()*4.5,color});} }
  update(){ this.p=this.p.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.vy+=0.07;p.vx*=0.97;p.life-=p.decay;return p.life>0;}); }
  draw(ctx){ this.p.forEach(p=>{ctx.save();ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=5;ctx.beginPath();ctx.arc(p.x,p.y,p.sz*p.life,0,Math.PI*2);ctx.fill();ctx.restore();}); }
}

// ── Full scene render ─────────────────────────────────────────────────────────
function renderScene(ctx, s, frame) {
  const th=THEMES[s.theme]||THEMES.jungle;
  const bg=ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,th.bgTop); bg.addColorStop(1,th.bgBot);
  ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
  // Ground tiles
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) drawGroundTile(ctx,x,y,s.theme);
  // Water/lava
  (s.waterTiles||[]).forEach(([x,y])=>drawWater(ctx,x,y,frame,s.theme));
  // Plants (behind rocks)
  (s.plantTiles||[]).forEach(([x,y],i)=>{
    const seed=(x*7+y*11+i)%10;
    if(s.theme==="desert") drawDesertPlant(ctx,x,y,seed,frame);
    else if(s.theme==="crystal") drawCrystalPlant(ctx,x,y,seed,frame);
    else drawPlant(ctx,x,y,seed,frame);
  });
  // Obstacles
  s.obstacles.forEach(([x,y])=>{
    const seed=(x*31+y*17)%4;
    if(s.theme==="crystal") drawCrystalShard(ctx,x,y,seed,frame);
    else if(s.theme==="volcanic") drawVolcanicRock(ctx,x,y,seed,frame);
    else if(s.theme==="desert") drawSandstone(ctx,x,y,seed);
    else drawRock(ctx,x,y,seed);
  });
  // Game objects
  drawFood(ctx,s.food,frame);
  s.enemies.forEach(e=>drawEnemy(ctx,e,frame));
  drawSnake(ctx,s.snake,frame);
}

// ── State factory ─────────────────────────────────────────────────────────────
function makeState(theme="jungle", overrides={}) {
  const snake=SPAWN.map(s=>[...s]);
  const lvl = overrides.obstacles ? overrides : generateDefaultLevel(theme);
  return {
    snake, dir:[1,0], nextDir:[1,0],
    food: placeFood(snake, lvl.obstacles),
    obstacles: lvl.obstacles||[],
    waterTiles: lvl.waterTiles||[],
    plantTiles: lvl.plantTiles||[],
    enemies: (lvl.enemies||[]).map(e=>({...e,pos:[...e.pos]})),
    score:0, lives:3, speed:185, theme,
    insight: lvl.insight||"Navigate carefully!",
    over:false, paused:false, started:false, ps:new PS(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function AISnake() {
  const canvasRef=useRef(null), stateRef=useRef(makeState("jungle"));
  const frameRef=useRef(0), lastMoveRef=useRef(0), tickRef=useRef(0), rafRef=useRef(null);

  const [ui,setUi]=useState({
    score:0,lives:3,speed:"Normal",theme:"jungle",insight:"Navigate carefully!",
    phase:"idle",
    apiKey: ENV_API_KEY,          // pre-filled from .env if available
    showKey: !ENV_API_KEY,        // only show input if env key is missing
    levelPrompt:"Create a jungle with rivers and roaming enemies.",
    generating:false,genError:"",
  });

  const syncUi=useCallback((extra={})=>{
    const s=stateRef.current;
    setUi(u=>({...u,score:s.score,lives:s.lives,
      speed:s.speed<=100?"Fast":s.speed<=150?"Medium":"Normal",
      theme:s.theme,insight:s.insight,...extra}));
  },[]);

  const doReset=useCallback((keepLevel=false)=>{
    const p=stateRef.current;
    stateRef.current = keepLevel
      ? makeState(p.theme, {obstacles:p.obstacles,waterTiles:p.waterTiles,plantTiles:p.plantTiles,enemies:p.enemies,insight:p.insight})
      : makeState(p.theme);
    frameRef.current=0; lastMoveRef.current=0; tickRef.current=0;
    syncUi({phase:"idle"});
  },[syncUi]);

  const setTheme=useCallback(t=>{
    stateRef.current=makeState(t);
    frameRef.current=0; lastMoveRef.current=0; tickRef.current=0;
    syncUi({theme:t,phase:"idle"});
  },[syncUi]);

  const doGenerate=useCallback(async()=>{
    const{apiKey,levelPrompt,theme}=ui;
    if(!apiKey.trim()){setUi(u=>({...u,showKey:true,genError:"Enter your Gemini API key first."}));return;}
    setUi(u=>({...u,generating:true,genError:""}));
    try{
      const raw=await callGemini(apiKey.trim(),levelPrompt);
      const snake=SPAWN.map(s=>[...s]);
      const lvl=parseGeminiLevel(raw,snake);
      if(!lvl||!lvl.obstacles||lvl.obstacles.length<3) throw new Error("AI returned an empty level — try rephrasing.");
      stateRef.current=makeState(lvl.theme||theme,lvl);
      frameRef.current=0; lastMoveRef.current=0; tickRef.current=0;
      syncUi({phase:"idle",generating:false,insight:lvl.insight,theme:lvl.theme||theme});
    }catch(e){
      setUi(u=>({...u,generating:false,genError:e.message||"Generation failed."}));
    }
  },[ui,syncUi]);

  // ── Game loop ───────────────────────────────────────────────────────────────
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas)return;
    const ctx=canvas.getContext("2d");
    const loop=(ts)=>{
      rafRef.current=requestAnimationFrame(loop);
      frameRef.current++;
      const s=stateRef.current, f=frameRef.current;
      // Always render scene
      renderScene(ctx,s,f);
      s.ps.update(); s.ps.draw(ctx);
      if(!s.started){
        ctx.fillStyle="rgba(0,0,0,0.46)"; ctx.fillRect(0,0,W,H);
        ctx.textAlign="center"; ctx.fillStyle="#00ff88"; ctx.font="bold 14px 'Courier New',monospace";
        ctx.globalAlpha=0.55+0.45*Math.sin(f*0.07); ctx.fillText("PRESS SPACE TO START",W/2,H/2+6); ctx.globalAlpha=1;
        return;
      }
      if(s.paused){
        ctx.fillStyle="rgba(0,0,0,0.48)"; ctx.fillRect(0,0,W,H);
        ctx.textAlign="center"; ctx.fillStyle="#00aaff"; ctx.font="bold 20px 'Courier New',monospace"; ctx.fillText("PAUSED",W/2,H/2+7);
        return;
      }
      if(s.over){
        ctx.fillStyle="rgba(0,0,0,0.65)"; ctx.fillRect(0,0,W,H);
        ctx.textAlign="center";
        ctx.fillStyle="#ff4444"; ctx.font="bold 30px 'Courier New',monospace"; ctx.fillText("GAME OVER",W/2,H/2-16);
        ctx.fillStyle="#ccc"; ctx.font="16px 'Courier New',monospace"; ctx.fillText("Score: "+s.score,W/2,H/2+14);
        ctx.fillStyle="#888"; ctx.font="12px 'Courier New',monospace"; ctx.fillText("Press SPACE to restart",W/2,H/2+42);
        return;
      }
      if(ts-lastMoveRef.current>s.speed){
        lastMoveRef.current=ts; tickRef.current++;
        s.dir=[...s.nextDir];
        const h=s.snake[0], nh=[(h[0]+s.dir[0]+COLS)%COLS,(h[1]+s.dir[1]+ROWS)%ROWS];
        const hit=s.snake.some(([x,y])=>x===nh[0]&&y===nh[1])
          ||s.obstacles.some(([x,y])=>x===nh[0]&&y===nh[1])
          ||s.enemies.some(e=>e.pos[0]===nh[0]&&e.pos[1]===nh[1]);
        if(hit){
          s.ps.emit(h[0],h[1],"#ff4444",16); s.lives--;
          if(s.lives<=0){s.over=true;syncUi({phase:"over"});}
          else{s.snake=SPAWN.map(p=>[...p]);s.dir=[1,0];s.nextDir=[1,0];s.food=placeFood(s.snake,s.obstacles);syncUi();}
          return;
        }
        const ate=nh[0]===s.food[0]&&nh[1]===s.food[1];
        s.snake=[nh,...s.snake]; if(!ate)s.snake.pop();
        else{s.score+=10;s.ps.emit(s.food[0],s.food[1],"#ff8888",11);s.food=placeFood(s.snake,s.obstacles);if(s.score%50===0&&s.speed>85)s.speed-=12;syncUi();}
        s.enemies.forEach(e=>{
          if(tickRef.current%e.moveEvery!==0)return;
          const dm={UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0]};
          const[dx,dy]=dm[e.dir]||[1,0];
          const nx=(e.pos[0]+dx+COLS)%COLS, ny=(e.pos[1]+dy+ROWS)%ROWS;
          if(s.obstacles.some(([ox,oy])=>ox===nx&&oy===ny)||s.snake.some(([sx,sy])=>sx===nx&&sy===ny)){
            const alts=["UP","DOWN","LEFT","RIGHT"].filter(d=>d!==e.dir); e.dir=alts[rnd(alts.length)];
          } else e.pos=[nx,ny];
          if(e.pos[0]===s.snake[0][0]&&e.pos[1]===s.snake[0][1]){
            s.ps.emit(e.pos[0],e.pos[1],"#ffcc00",12); s.lives--;
            if(s.lives<=0){s.over=true;syncUi({phase:"over"});}else syncUi();
          }
        });
      }
    };
    rafRef.current=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(rafRef.current);
  },[syncUi]);

  useEffect(()=>{
    const onKey=e=>{
      const s=stateRef.current;
      if(e.key===" "||e.key==="Enter"){
        e.preventDefault();
        if(!s.started){s.started=true;syncUi({phase:"playing"});}
        else if(s.over)doReset(false);
        else s.paused=!s.paused;
        return;
      }
      const nd=KMAP[e.key]; if(!nd)return; e.preventDefault();
      if(!s.started){s.started=true;syncUi({phase:"playing"});}
      const[dx,dy]=DIR[nd],[cx,cy]=s.dir;
      if(dx+cx===0&&dy+cy===0)return;
      s.nextDir=[dx,dy];
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[syncUi,doReset]);

  const handleDpad=useCallback(d=>{
    const s=stateRef.current;
    if(!s.started){s.started=true;syncUi({phase:"playing"});}
    const[dx,dy]=DIR[d],[cx,cy]=s.dir;
    if(dx+cx===0&&dy+cy===0)return;
    s.nextDir=[dx,dy];
  },[syncUi]);

  const th = THEMES[ui.theme] || THEMES.jungle;

  const panelStyle = {
    width: 205,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "rgba(3,10,20,0.97)",
    border: `1px solid ${th.bdr}`,
    borderRadius: 10,
    padding: "14px 12px",
    boxShadow: `0 0 0 1px rgba(0,0,0,0.9), 0 8px 32px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.03)`,
    alignSelf: "stretch",
  };

  const panelLabel = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 2,
    color: "#00ccff",
    marginBottom: 2,
    textTransform: "uppercase",
  };

  const divider = { borderTop: "1px solid rgba(0,170,255,0.08)", marginTop: 4, paddingTop: 10 };

  return (
    <div style={{
      minHeight: "100vh",
      width: "100vw",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#02080c",
      fontFamily: "'Courier New', monospace",
      padding: "12px 16px",
      userSelect: "none",
      gap: 10,
      overflowX: "hidden",
    }}>

      {/* ── TITLE BAR ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "8px 32px",
        background: "rgba(3,12,22,0.98)",
        border: "1px solid rgba(0,170,255,0.35)",
        borderRadius: 10,
        boxShadow: "0 0 32px rgba(0,170,255,0.18), 0 0 0 1px rgba(0,0,0,0.8), inset 0 1px 0 rgba(0,170,255,0.12)",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: 28, fontWeight: 900, letterSpacing: 8,
            color: "#ffffff",
            textShadow: "0 0 20px #00aaff, 0 0 50px rgba(0,150,255,0.3)",
          }}>GemSlither</div>
          <div style={{
            fontSize: 8, letterSpacing: 4, color: "#1a6688",
            marginTop: -2, textTransform: "uppercase",
          }}>Slither. Sparkle. Survive</div>
        </div>
      </div>

      {/* ── THREE COLUMNS ── */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>

        {/* LEFT PANEL */}
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#00aaff",
              boxShadow: "0 0 10px #00aaff, 0 0 20px rgba(0,170,255,0.4)",
              flexShrink: 0,
            }}/>
            <span style={panelLabel}>AI Level Generator</span>
          </div>

          {/* Prompt textarea */}
          <textarea
            value={ui.levelPrompt}
            onChange={e => setUi(u => ({ ...u, levelPrompt: e.target.value }))}
            rows={3}
            style={{
              width: "100%", background: "rgba(0,8,18,0.9)", color: "#88bbdd",
              border: "1px solid rgba(0,100,180,0.3)", borderRadius: 6,
              padding: "8px", fontSize: 11, resize: "none",
              fontFamily: "inherit", outline: "none", lineHeight: 1.5,
              boxSizing: "border-box",
            }}
            placeholder="Describe your level…"
          />

          {/* API key — only show input if no env key, no badge when env key is set */}
          {!ENV_API_KEY && (
            !ui.showKey ? (
              <button onClick={() => setUi(u => ({ ...u, showKey: true }))} style={S.subtle}>
                Set Gemini API Key
              </button>
            ) : (
              <input
                type="password"
                placeholder="AIza… (Gemini API key)"
                value={ui.apiKey}
                onChange={e => setUi(u => ({ ...u, apiKey: e.target.value, genError: "" }))}
                style={{
                  width: "100%", background: "rgba(0,8,18,0.9)", color: "#88bbdd",
                  border: "1px solid rgba(0,100,180,0.3)", borderRadius: 6,
                  padding: "8px", fontSize: 11, fontFamily: "inherit",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            )
          )}

          {/* Error */}
          {ui.genError && (
            <div style={{
              color: "#ff7755", fontSize: 10, lineHeight: 1.5,
              wordBreak: "break-word",
              background: "rgba(40,0,0,0.5)",
              border: "1px solid rgba(200,50,0,0.3)",
              borderRadius: 5, padding: "6px 8px",
            }}>
              ⚠ {ui.genError}
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={doGenerate}
            disabled={ui.generating}
            style={ui.generating ? S.disabled : S.primary}
          >
            {ui.generating ? "⏳  GENERATING…" : "⚡  GENERATE LEVEL"}
          </button>

          {/* Theme switcher */}
          <div style={divider}>
            <div style={{ ...panelLabel, color: "#2a6080", marginBottom: 8 }}>Quick Themes</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {Object.entries(THEMES).map(([k, v]) => {
                const active = ui.theme === k;
                return (
                  <button key={k} onClick={() => setTheme(k)} style={{
                    background: active ? "rgba(0,60,100,0.6)" : "rgba(0,15,30,0.6)",
                    border: `1px solid ${active ? th.bdr : "rgba(0,80,130,0.2)"}`,
                    color: active ? "#44ddff" : "#3a6688",
                    borderRadius: 5, padding: "5px 9px",
                    fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                    boxShadow: active ? `0 0 10px ${th.bdr}60` : "none",
                    transition: "all 0.15s", fontWeight: active ? 700 : 400,
                  }}>
                    {v.title}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── CANVAS ── */}
        <div style={{
          border: `2px solid ${th.bdr}`,
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: `0 0 40px ${th.bdr}44, 0 0 0 1px rgba(0,0,0,0.8), inset 0 0 80px rgba(0,0,0,0.3)`,
          position: "relative",
        }}>
          {/* Corner bracket accents */}
          {[
            { top:0,left:0,borderTop:`2px solid ${th.bdr}`,borderLeft:`2px solid ${th.bdr}` },
            { top:0,right:0,borderTop:`2px solid ${th.bdr}`,borderRight:`2px solid ${th.bdr}` },
            { bottom:0,left:0,borderBottom:`2px solid ${th.bdr}`,borderLeft:`2px solid ${th.bdr}` },
            { bottom:0,right:0,borderBottom:`2px solid ${th.bdr}`,borderRight:`2px solid ${th.bdr}` },
          ].map((s2,i)=>(
            <div key={i} style={{position:"absolute",width:14,height:14,zIndex:2,...s2}}/>
          ))}
          <canvas ref={canvasRef} width={W} height={H} style={{ display: "block" }} />
        </div>

        {/* RIGHT PANEL */}
        <div style={panelStyle}>
          <div style={panelLabel}>Adaptive Game State</div>

          {/* Stats */}
          {[
            ["Score", ui.score],
            ["Speed", ui.speed],
            ["Difficulty", "Adaptive"],
            ["Theme", THEMES[ui.theme]?.title || ui.theme],
          ].map(([label, val]) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              borderBottom: "1px solid rgba(0,100,160,0.1)", paddingBottom: 7,
            }}>
              <span style={{ color: "#3a6880", fontSize: 12 }}>{label}</span>
              <span style={{ color: "#c8e4ff", fontWeight: 700, fontSize: 12 }}>{val}</span>
            </div>
          ))}

          {/* Lives */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            borderBottom: "1px solid rgba(0,100,160,0.1)", paddingBottom: 7,
          }}>
            <span style={{ color: "#3a6880", fontSize: 12 }}>Lives</span>
            <div style={{ display: "flex", gap: 5 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 14, height: 14, borderRadius: "50%",
                  background: i < ui.lives
                    ? "radial-gradient(circle at 35% 35%, #ff6677, #cc0022)"
                    : "rgba(40,8,8,0.8)",
                  boxShadow: i < ui.lives ? "0 0 10px #ff2244, 0 0 20px rgba(255,0,50,0.3)" : "none",
                  border: i < ui.lives ? "1px solid rgba(255,100,100,0.4)" : "1px solid rgba(80,20,20,0.4)",
                  transition: "all 0.35s",
                }} />
              ))}
            </div>
          </div>

          {/* Gemini insight box */}
          <div style={{
            background: "rgba(0,20,40,0.7)",
            border: "1px solid rgba(0,120,200,0.25)",
            borderRadius: 8, padding: "10px 12px",
            marginTop: 2,
            boxShadow: "inset 0 1px 0 rgba(0,150,255,0.08)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6, marginBottom: 7,
            }}>
              <div style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "#00aaff", boxShadow: "0 0 8px #00aaff",
              }}/>
              <span style={{ color: "#00aaff", fontWeight: 700, fontSize: 10, letterSpacing: 1.5 }}>
                GEMINI INSIGHT
              </span>
            </div>
            <div style={{
              color: "#88bbdd", fontSize: 11, lineHeight: 1.7,
              fontStyle: "italic",
            }}>
              {ui.insight}
            </div>
          </div>

          {/* Controls */}
          <div style={{ ...divider, marginTop: "auto" }}>
            <div style={{ ...panelLabel, color: "#3a8aaa", marginBottom: 8 }}>Controls</div>
            {[
              ["WASD / ↑↓←→", "Move"],
              ["SPACE", "Start / Pause"],
              ["SPACE (dead)", "Restart"],
              ["Theme buttons", "Switch world"],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: "flex", justifyContent: "space-between",
                marginBottom: 6, alignItems: "center", gap: 6,
              }}>
                <span style={{
                  color: "#aaddff",
                  fontSize: 10,
                  background: "rgba(0,60,110,0.45)",
                  padding: "3px 7px", borderRadius: 4,
                  border: "1px solid rgba(0,130,200,0.35)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  fontWeight: 700,
                }}>{k}</span>
                <span style={{ color: "#88aacc", fontSize: 10, textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── D-PAD + CONTROLS ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        marginTop: 4,
        padding: "10px 20px",
        background: "rgba(4,12,22,0.8)",
        border: "1px solid rgba(0,100,160,0.2)",
        borderRadius: 12,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}>
        {/* D-PAD */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <DBtn label="↑" onClick={() => handleDpad("UP")} />
          <div style={{ display: "flex", gap: 4 }}>
            <DBtn label="←" onClick={() => handleDpad("LEFT")} />
            <DBtn label="↓" onClick={() => handleDpad("DOWN")} />
            <DBtn label="→" onClick={() => handleDpad("RIGHT")} />
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 80, background: "rgba(0,100,160,0.2)" }} />

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            onClick={() => {
              const s = stateRef.current;
              if (s.over || !s.started) doReset(false);
              else { s.started = true; s.paused = !s.paused; syncUi(); }
            }}
            style={S.action}
          >
            ↺  RESTART
          </button>
          <button
            onClick={() => {
              const s = stateRef.current;
              if (!s.started) { s.started = true; syncUi({ phase: "playing" }); }
              else s.paused = !s.paused;
            }}
            style={S.pause}
          >
            {ui.phase === "playing" && !stateRef.current?.paused ? "⏸  PAUSE" : "▶  RESUME"}
          </button>
        </div>
      </div>

    </div>
  );
}

function DBtn({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      onMouseDown={e => e.currentTarget.style.transform = "scale(0.88)"}
      onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
      onTouchStart={e => { e.preventDefault(); e.currentTarget.style.transform = "scale(0.88)"; onClick(); }}
      onTouchEnd={e => e.currentTarget.style.transform = "scale(1)"}
      style={{
        width: 46, height: 46,
        background: "linear-gradient(180deg, rgba(10,30,60,0.95), rgba(4,12,28,0.95))",
        color: "#55aadd",
        border: "1px solid rgba(0,120,200,0.35)",
        borderRadius: 8,
        fontSize: 18,
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 2px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
        transition: "transform 0.08s",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

const S = {
  primary: {
    width: "100%", background: "linear-gradient(180deg, #0055cc, #003388)",
    color: "#55ddff", border: "1px solid rgba(0,140,255,0.5)",
    borderRadius: 6, padding: "9px 0", fontSize: 11, fontWeight: 700,
    cursor: "pointer", letterSpacing: 1.5, fontFamily: "'Courier New',monospace",
    boxShadow: "0 0 16px rgba(0,100,220,0.3), inset 0 1px 0 rgba(255,255,255,0.08)",
    transition: "all 0.15s",
  },
  action: {
    background: "linear-gradient(180deg, rgba(10,30,55,0.95), rgba(4,14,28,0.95))",
    color: "#44bbff", border: "1px solid rgba(0,120,200,0.4)",
    borderRadius: 7, padding: "9px 22px",
    fontSize: 11, fontWeight: 700, cursor: "pointer",
    letterSpacing: 1, fontFamily: "'Courier New',monospace",
    boxShadow: "0 2px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
    transition: "all 0.15s",
  },
  pause: {
    background: "linear-gradient(180deg, rgba(0,40,20,0.95), rgba(0,20,10,0.95))",
    color: "#44ddaa", border: "1px solid rgba(0,160,100,0.35)",
    borderRadius: 7, padding: "9px 22px",
    fontSize: 11, fontWeight: 700, cursor: "pointer",
    letterSpacing: 1, fontFamily: "'Courier New',monospace",
    boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
    transition: "all 0.15s",
  },
  subtle: {
    width: "100%", background: "rgba(0,15,30,0.7)",
    color: "#2a6688", border: "1px solid rgba(0,80,130,0.25)",
    borderRadius: 6, padding: "8px 0", fontSize: 11, fontWeight: 700,
    cursor: "pointer", letterSpacing: 1, fontFamily: "'Courier New',monospace",
  },
  disabled: {
    width: "100%", background: "rgba(4,10,18,0.7)",
    color: "#2a3a44", border: "1px solid rgba(0,50,80,0.2)",
    borderRadius: 6, padding: "9px 0", fontSize: 11, fontWeight: 700,
    cursor: "not-allowed", letterSpacing: 1.5, fontFamily: "'Courier New',monospace",
  },
};
