/* =============================================================================
   BOLA DEL PILAR — motor del minijuego (física + niveles). Sin React ni DOM,
   para poder probarlo aparte y para que el mismo código decida si un nivel
   tiene solución antes de enseñarlo.

   Funcionamiento (como Tigerball, pero con canasta): la bola sale del suelo;
   arrastras el dedo en la dirección del tiro (más largo = más fuerte) y al
   soltar sale disparada. Hay que encestar (entrar por arriba del aro). Si no,
   pierdes una vida y repites el nivel. 5 vidas. Cada canasta = 1 punto.
   ============================================================================= */

export const W = 360;
export const H = 480;
export const FLOOR = 440;
export const BALL_R = 12;
export const GRAVITY = 1400;
export const DT = 1 / 120;
export const MAX_SPEED = 1300;
export const POWER_PER_PX = 7.5; // velocidad por píxel (mundo) de arrastre
export const MAX_FLIGHT = 8; // segundos
const E_WALL = 0.78, E_OBS = 0.74, E_FLOOR = 0.72, E_RIM = 0.6, E_BOARD = 0.68, ROLL = 0.993, OBS_FRICTION = 0.06;
// Canasta: el aro mide algo más del doble que la bola, como en la realidad
export const RIM_W = 54, RIM_TIP = 3.5, BOARD_H = 70, BOARD_T = 6;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- cuerpos ----------------------------------------------------------------
// Caja orientada: { cx, cy, hw, hh, ang, kind, color, motion?, e? }
// kind: "plank" (barra), "block" (columna), "pad" (trampolín), "board" (tablero)
// motion: { type: "osc", ax, ay, period, phase } | { type: "rot", speed }
export function bodyPose(b, t) {
  if (!b.motion) return { cx: b.cx, cy: b.cy, ang: b.ang || 0, vx: 0, vy: 0, w: 0 };
  const m = b.motion;
  if (m.type === "osc") {
    const k = (2 * Math.PI) / m.period;
    const s = Math.sin(k * t + (m.phase || 0)), c = Math.cos(k * t + (m.phase || 0));
    return { cx: b.cx + m.ax * s, cy: b.cy + m.ay * s, ang: b.ang || 0, vx: m.ax * k * c, vy: m.ay * k * c, w: 0 };
  }
  if (m.type === "rot") {
    return { cx: b.cx, cy: b.cy, ang: (b.ang || 0) + m.speed * t, vx: 0, vy: 0, w: m.speed };
  }
  return { cx: b.cx, cy: b.cy, ang: b.ang || 0, vx: 0, vy: 0, w: 0 };
}

// hoop: { x: centro del aro, y: altura del aro, dir: +1 tablero a la derecha / -1 a la izquierda }
export function hoopParts(hoop) {
  const front = { x: hoop.x - hoop.dir * RIM_W / 2, y: hoop.y };
  const back = { x: hoop.x + hoop.dir * RIM_W / 2, y: hoop.y };
  const board = { cx: back.x + hoop.dir * (BOARD_T / 2 + 2), cy: hoop.y - BOARD_H * 0.62, hw: BOARD_T / 2, hh: BOARD_H / 2, ang: 0, kind: "board", e: E_BOARD };
  return { front, back, board };
}

function collideCircle(ball, cx, cy, r, e) {
  const dx = ball.x - cx, dy = ball.y - cy, d = Math.hypot(dx, dy), min = BALL_R + r;
  if (d >= min || d < 1e-6) return false;
  const nx = dx / d, ny = dy / d;
  ball.x = cx + nx * min; ball.y = cy + ny * min;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx -= (1 + e) * vn * nx; ball.vy -= (1 + e) * vn * ny;
    const vt = ball.vx * -ny + ball.vy * nx;
    ball.vx -= vt * -ny * 0.12; ball.vy -= vt * nx * 0.12;
  }
  ball.hit = Math.max(ball.hit || 0, Math.abs(vn));
  if (ny < -0.5) ball.supported = true;
  return true;
}

function collideBox(ball, b, pose) {
  const dx = ball.x - pose.cx, dy = ball.y - pose.cy;
  const ca = Math.cos(pose.ang), sa = Math.sin(pose.ang);
  const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
  const qx = Math.max(-b.hw, Math.min(b.hw, lx)), qy = Math.max(-b.hh, Math.min(b.hh, ly));
  let nx = lx - qx, ny = ly - qy;
  let dist = Math.hypot(nx, ny), pen;
  if (dist > 1e-6) {
    if (dist >= BALL_R) return false;
    nx /= dist; ny /= dist; pen = BALL_R - dist;
  } else {
    const px = b.hw - Math.abs(lx), py = b.hh - Math.abs(ly);
    if (px < py) { nx = Math.sign(lx) || 1; ny = 0; pen = px + BALL_R; }
    else { nx = 0; ny = Math.sign(ly) || 1; pen = py + BALL_R; }
  }
  const wnx = nx * ca - ny * sa, wny = nx * sa + ny * ca;
  ball.x += wnx * pen; ball.y += wny * pen;
  const cxp = ball.x - wnx * BALL_R - pose.cx, cyp = ball.y - wny * BALL_R - pose.cy;
  const svx = pose.vx - pose.w * cyp, svy = pose.vy + pose.w * cxp;
  let rvx = ball.vx - svx, rvy = ball.vy - svy;
  const vn = rvx * wnx + rvy * wny;
  if (vn < 0) {
    const e = b.e ?? E_OBS;
    rvx -= (1 + e) * vn * wnx; rvy -= (1 + e) * vn * wny;
    // trampolín: siempre devuelve la bola con fuerza
    if (b.kind === "pad") {
      const out = rvx * wnx + rvy * wny;
      if (out < 820) { rvx += (820 - out) * wnx; rvy += (820 - out) * wny; }
      ball.padHit = true;
    }
    const vt = rvx * -wny + rvy * wnx;
    rvx -= vt * -wny * OBS_FRICTION; rvy -= vt * wnx * OBS_FRICTION;
    ball.hit = Math.max(ball.hit || 0, Math.abs(vn));
  }
  ball.vx = rvx + svx; ball.vy = rvy + svy;
  if (wny < -0.5) ball.supported = true;
  return true;
}

// Un paso de física. Devuelve true en el instante en que la bola encesta.
export function stepBall(ball, level, t) {
  ball.supported = false;
  ball.hit = 0;
  const prevY = ball.y;
  ball.vy += GRAVITY * DT;
  ball.x += ball.vx * DT; ball.y += ball.vy * DT;
  if (ball.x < BALL_R) { ball.x = BALL_R; ball.hit = Math.abs(ball.vx); ball.vx = Math.abs(ball.vx) * E_WALL; }
  if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.hit = Math.abs(ball.vx); ball.vx = -Math.abs(ball.vx) * E_WALL; }
  if (ball.y < BALL_R) { ball.y = BALL_R; ball.hit = Math.abs(ball.vy); ball.vy = Math.abs(ball.vy) * E_WALL; }
  if (ball.y > FLOOR - BALL_R) {
    ball.y = FLOOR - BALL_R;
    if (ball.vy > 0) { ball.hit = Math.max(ball.hit, ball.vy); ball.floorHit = ball.vy; ball.vy = -ball.vy * E_FLOOR; }
    if (Math.abs(ball.vy) < 90) ball.vy = 0;
    ball.vx *= ROLL;
    ball.supported = true;
  }
  for (const b of level.bodies) collideBox(ball, b, bodyPose(b, t));
  const hp = level.hoopParts;
  collideBox(ball, hp.board, hp.board);
  collideCircle(ball, hp.front.x, hp.front.y, RIM_TIP, E_RIM);
  collideCircle(ball, hp.back.x, hp.back.y, RIM_TIP, E_RIM);
  if (ball.supported) ball.vx *= 0.997;
  ball.rot += (ball.vx * DT) / BALL_R;
  // ¿ha cruzado el aro de arriba abajo, por dentro?
  const lo = Math.min(hp.front.x, hp.back.x) + RIM_TIP, hi = Math.max(hp.front.x, hp.back.x) - RIM_TIP;
  return !ball.scored && ball.vy > 0 && prevY < level.hoop.y && ball.y >= level.hoop.y && ball.x > lo && ball.x < hi;
}

// Simula un tiro completo (sin dibujar). t0 = tiempo del nivel al soltar.
export function simulateShot(level, vx, vy, t0 = 0) {
  const ball = { x: level.start.x, y: level.start.y, vx, vy, rot: 0 };
  let still = 0;
  for (let i = 0; i < MAX_FLIGHT / DT; i++) {
    if (stepBall(ball, level, t0 + i * DT)) return true;
    if (Math.hypot(ball.vx, ball.vy) < 14) { still += DT; if (still > 0.4) return false; } else still = 0;
  }
  return false;
}

export function launchFromDrag(dx, dy) {
  let vx = dx * POWER_PER_PX, vy = dy * POWER_PER_PX;
  const s = Math.hypot(vx, vy);
  if (s > MAX_SPEED) { vx *= MAX_SPEED / s; vy *= MAX_SPEED / s; }
  return { vx, vy };
}

// Porcentaje de tiros (rejilla de ángulos y fuerzas) que encestan. Sirve para
// asegurar que cada nivel tiene solución y no es demasiado fácil.
export function solveRate(level) {
  const phases = level.bodies.some((b) => b.motion) ? [0, 0.37, 0.71] : [0];
  let ok = 0, total = 0;
  for (const ph of phases) {
    const t0 = ph * (level.period || 3);
    for (let a = 4; a <= 176; a += 3) {
      const rad = (a * Math.PI) / 180;
      for (let s = 220; s <= MAX_SPEED; s += 45) {
        total++;
        if (simulateShot(level, Math.cos(rad) * s, -Math.sin(rad) * s, t0)) ok++;
      }
    }
  }
  return ok / total;
}

// ---- niveles ----------------------------------------------------------------
// Paleta del evento: rosa, naranja, amarillo, morado, azul noche
export const PALETTE = ["#FF2D75", "#FF7A00", "#FFC63D", "#6A1B9A", "#1A1E2E"];

function plank(cx, cy, len, ang, motion) {
  return { cx, cy, hw: len / 2, hh: 8, ang, kind: "plank", motion };
}
function pillar(cx, cy, w, h, motion) {
  return { cx, cy, hw: w / 2, hh: h / 2, ang: 0, kind: "block", motion };
}
function pad(cx, w = 54) {
  return { cx, cy: FLOOR - 7, hw: w / 2, hh: 7, ang: 0, kind: "pad", e: 1.0 };
}

function buildCandidate(levelNo, rnd) {
  const r = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const flip = levelNo > 3 && rnd() < 0.4;
  const bodies = [];
  const d = levelNo;
  let hoop = { x: r(230, 285), y: r(250, 330), dir: 1 };
  const start = { x: r(45, 100), y: FLOOR - BALL_R };
  const pool = ["open"];
  if (d >= 2) pool.push("wall", "high");
  if (d >= 3) pool.push("roof", "pillars");
  if (d >= 5) pool.push("gap", "pad");
  if (d >= 7) pool.push("moving", "hidden");
  if (d >= 10) pool.push("rotor", "cross");
  const n = d < 6 ? 1 : d < 14 ? (rnd() < 0.5 ? 1 : 2) : 2;
  const used = new Set();
  for (let i = 0; i < n; i++) {
    let tpl = pick(pool);
    if (d >= 3 && tpl === "open") tpl = pick(pool.filter((p) => p !== "open"));
    if (used.has(tpl)) continue;
    used.add(tpl);
    if (tpl === "wall") {
      const h = r(70, 130 + Math.min(d * 6, 110));
      bodies.push(pillar(r(150, 195), FLOOR - h / 2, r(22, 32), h));
    } else if (tpl === "high") {
      hoop = { ...hoop, y: r(130, 210) };
    } else if (tpl === "roof") {
      bodies.push(plank(hoop.x + r(-35, 0), hoop.y - r(70, 105), r(70, 110), r(-0.4, 0.15)));
    } else if (tpl === "pillars") {
      const k = 2 + Math.floor(rnd() * 2);
      for (let j = 0; j < k; j++) { const h = r(50, 150); bodies.push(pillar(130 + j * 34 + r(-6, 6), FLOOR - h / 2, 22, h)); }
    } else if (tpl === "gap") {
      const gx = r(160, 210), gapY = r(170, 290), gap = Math.max(46, 92 - d * 2);
      bodies.push(plank(gx, gapY - gap / 2 - 60, 120, Math.PI / 2 + r(-0.2, 0.2)));
      bodies.push(plank(gx + r(-8, 8), gapY + gap / 2 + 60, 120, Math.PI / 2 + r(-0.2, 0.2)));
    } else if (tpl === "pad") {
      const h = r(150, 230);
      bodies.push(pillar(r(150, 185), FLOOR - h / 2, 24, h));
      bodies.push(pad(r(105, 125)));
      hoop = { ...hoop, y: r(150, 230) };
    } else if (tpl === "moving") {
      const vertical = rnd() < 0.5;
      if (vertical) {
        const bh = r(90, 140), ay = r(40, 75);
        bodies.push(pillar(r(160, 205), r(200, FLOOR - bh / 2 - ay - 6), 24, bh, { type: "osc", ax: 0, ay, period: r(2.2, 3.6), phase: r(0, 6) }));
      } else {
        bodies.push(plank(hoop.x - 10, hoop.y - r(70, 100), r(70, 100), 0, { type: "osc", ax: r(40, 60), ay: 0, period: r(2.2, 3.6), phase: r(0, 6) }));
      }
    } else if (tpl === "hidden") {
      const h = r(140, 210);
      bodies.push(pillar(hoop.x - RIM_W / 2 - 34, FLOOR - h / 2, 22, h));
      hoop = { ...hoop, y: Math.min(hoop.y, FLOOR - h + 40) };
    } else if (tpl === "rotor") {
      bodies.push(plank(r(150, 205), r(190, 290), r(90, 120), 0, { type: "rot", speed: r(1.2, 2.2) * (rnd() < 0.5 ? -1 : 1) }));
    } else if (tpl === "cross") {
      const cx = r(160, 200), cy = r(200, 290), sp = r(1.0, 1.8) * (rnd() < 0.5 ? -1 : 1), len = r(80, 110);
      bodies.push(plank(cx, cy, len, 0, { type: "rot", speed: sp }));
      bodies.push(plank(cx, cy, len, Math.PI / 2, { type: "rot", speed: sp }));
    }
  }
  let level = { levelNo, bodies, hoop, start, period: 3 };
  if (flip) {
    const fb = (b) => ({ ...b, cx: W - b.cx, ang: -(b.ang || 0), motion: b.motion ? (b.motion.type === "rot" ? { ...b.motion, speed: -b.motion.speed } : { ...b.motion, ax: -b.motion.ax }) : undefined });
    level = { ...level, bodies: bodies.map(fb), hoop: { ...hoop, x: W - hoop.x, dir: -1 }, start: { ...start, x: W - start.x } };
  }
  level.hoopParts = hoopParts(level.hoop);
  return level;
}

function blocked(level) {
  // ningún cuerpo tapando la bola, el aro o el tablero
  const hp = level.hoopParts;
  const pts = [[level.start.x, level.start.y], [level.hoop.x, level.hoop.y - 14], [level.hoop.x, level.hoop.y + 16], [hp.front.x, hp.front.y], [hp.board.cx, hp.board.cy]];
  return level.bodies.some((b) => pts.some(([px, py]) => {
    const p = bodyPose(b, 0);
    const reach = Math.hypot(b.hw, b.hh) + 16 + (b.motion ? Math.hypot(b.motion.ax || 0, b.motion.ay || 0) + (b.motion.type === "rot" ? b.hw : 0) : 0);
    if (b.motion) return Math.hypot(px - p.cx, py - p.cy) < reach;
    const ball = { x: px, y: py, vx: 0, vy: 0 };
    return collideBox(ball, { ...b, hw: b.hw + 12, hh: b.hh + 12 }, p);
  }));
}

export function minRateFor(levelNo) {
  if (levelNo <= 2) return 0.06;
  if (levelNo <= 6) return 0.03;
  if (levelNo <= 15) return 0.015;
  return 0.01;
}

const levelCache = new Map();
export function makeLevel(levelNo, eventSeed = 20261012) {
  const k = `${eventSeed}:${levelNo}`;
  if (levelCache.has(k)) return levelCache.get(k);
  const rnd = mulberry32(eventSeed + levelNo * 7919);
  let fallback = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    const lv = buildCandidate(levelNo, rnd);
    if (blocked(lv)) continue;
    const rate = solveRate(lv);
    if (!fallback || rate > fallback.rate) fallback = { lv, rate };
    if (rate >= minRateFor(levelNo) && (levelNo <= 2 || rate <= 0.4)) {
      lv.rate = rate; lv.scene = (levelNo - 1) % 6;
      levelCache.set(k, lv);
      return lv;
    }
  }
  const lv = fallback && fallback.rate > 0 ? fallback.lv : buildCandidate(1, mulberry32(levelNo));
  lv.rate = fallback ? fallback.rate : 0; lv.scene = (levelNo - 1) % 6;
  levelCache.set(k, lv);
  return lv;
}

// Niveles ya calculados (pilarLevels.json): se cargan al instante en el móvil.
export function levelFromData(d) {
  const lv = { levelNo: d.n, scene: d.scene, rate: d.rate / 100, start: { ...d.start }, hoop: { ...d.hoop }, bodies: d.bodies.map((b) => ({ ...b })), period: 3 };
  lv.hoopParts = hoopParts(lv.hoop);
  return lv;
}
