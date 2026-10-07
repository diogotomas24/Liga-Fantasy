/* =============================================================================
   BOLA DEL PILAR — motor del minijuego (física + niveles). Sin React ni DOM,
   para poder probarlo aparte y para que el mismo código decida si un nivel
   tiene solución antes de enseñarlo.

   Funcionamiento (como Tigerball): la bola sale del suelo; arrastras el dedo
   en la dirección del tiro (más largo = más fuerte) y al soltar sale
   disparada. Hay que meterla en el cesto de la Ofrenda. Si no entra, pierdes
   una vida y repites el nivel. 5 vidas. Cada nivel superado = 1 punto.
   ============================================================================= */

export const W = 360;
export const H = 480;
export const FLOOR = 440;
export const BALL_R = 12;
export const GRAVITY = 1400;
export const DT = 1 / 120;
export const MAX_SPEED = 1300;
export const POWER_PER_PX = 5.2; // velocidad por píxel (mundo) de arrastre
export const MAX_FLIGHT = 8; // segundos
const E_WALL = 0.78, E_OBS = 0.74, E_FLOOR = 0.72, ROLL = 0.993, OBS_FRICTION = 0.06; // bola de goma: bota bastante
export const JAR_W = 66, JAR_H = 60, JAR_T = 7;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- cuerpos ----------------------------------------------------------------
// Caja orientada: { cx, cy, hw, hh, ang, kind, color, motion? }
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

export function jarBodies(jar) {
  const { x, y } = jar; // x centro, y = base (donde se apoya)
  const half = JAR_W / 2;
  return [
    { cx: x - half + JAR_T / 2, cy: y - JAR_H / 2, hw: JAR_T / 2, hh: JAR_H / 2, ang: 0, kind: "jar" },
    { cx: x + half - JAR_T / 2, cy: y - JAR_H / 2, hw: JAR_T / 2, hh: JAR_H / 2, ang: 0, kind: "jar" },
    { cx: x, cy: y - JAR_T / 2, hw: half, hh: JAR_T / 2, ang: 0, kind: "jar" },
  ];
}

export function inJar(jar, px, py) {
  const half = JAR_W / 2;
  return px > jar.x - half + JAR_T && px < jar.x + half - JAR_T && py > jar.y - JAR_H + BALL_R * 0.8 && py < jar.y;
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
    // centro dentro de la caja: sale por el lado más cercano
    const px = b.hw - Math.abs(lx), py = b.hh - Math.abs(ly);
    if (px < py) { nx = Math.sign(lx) || 1; ny = 0; pen = px + BALL_R; }
    else { nx = 0; ny = Math.sign(ly) || 1; pen = py + BALL_R; }
  }
  const wnx = nx * ca - ny * sa, wny = nx * sa + ny * ca;
  ball.x += wnx * pen; ball.y += wny * pen;
  // velocidad de la superficie en el punto de contacto
  const cxp = ball.x - wnx * BALL_R - pose.cx, cyp = ball.y - wny * BALL_R - pose.cy;
  const svx = pose.vx - pose.w * cyp, svy = pose.vy + pose.w * cxp;
  let rvx = ball.vx - svx, rvy = ball.vy - svy;
  const vn = rvx * wnx + rvy * wny;
  if (vn < 0) {
    rvx -= (1 + E_OBS) * vn * wnx; rvy -= (1 + E_OBS) * vn * wny;
    const vt = rvx * -wny + rvy * wnx;
    rvx -= vt * -wny * OBS_FRICTION; rvy -= vt * wnx * OBS_FRICTION;
  }
  ball.vx = rvx + svx; ball.vy = rvy + svy;
  if (wny < -0.5) ball.supported = true;
  return true;
}

// Un paso de física. Devuelve true si la bola ha entrado en el cesto.
export function stepBall(ball, level, t) {
  ball.supported = false;
  ball.vy += GRAVITY * DT;
  ball.x += ball.vx * DT; ball.y += ball.vy * DT;
  if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * E_WALL; }
  if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx) * E_WALL; }
  if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy) * E_WALL; }
  if (ball.y > FLOOR - BALL_R) {
    ball.y = FLOOR - BALL_R;
    if (ball.vy > 0) ball.vy = -ball.vy * E_FLOOR;
    if (Math.abs(ball.vy) < 90) ball.vy = 0;
    ball.vx *= ROLL;
    ball.supported = true;
  }
  for (const b of level.bodies) collideBox(ball, b, bodyPose(b, t));
  for (const b of level.jarBodies) collideBox(ball, b, bodyPose(b, t));
  if (ball.supported) ball.vx *= 0.997;
  ball.rot += (ball.vx * DT) / BALL_R;
  return inJar(level.jar, ball.x, ball.y);
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
  // arrastre en la dirección del tiro (pantalla: y hacia abajo)
  let vx = dx * POWER_PER_PX, vy = dy * POWER_PER_PX;
  const s = Math.hypot(vx, vy);
  if (s > MAX_SPEED) { vx *= MAX_SPEED / s; vy *= MAX_SPEED / s; }
  return { vx, vy };
}

// Porcentaje de tiros (rejilla de ángulos y fuerzas) que entran. Sirve para
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
const COLORS = ["#FFD60A", "#3BD16F", "#22B8CF", "#FF6B6B", "#B197FC", "#FF9F1C"];

function plank(cx, cy, len, ang, color, motion) {
  return { cx, cy, hw: len / 2, hh: 7, ang, kind: "plank", color, motion };
}
function block(cx, cy, w, h, color, motion) {
  return { cx, cy, hw: w / 2, hh: h / 2, ang: 0, kind: "block", color, motion };
}

function buildCandidate(levelNo, rnd) {
  const r = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const color = pick(COLORS);
  const flip = levelNo > 3 && rnd() < 0.4; // cesto a la izquierda y bola a la derecha
  const bodies = [];
  let jar = { x: r(235, 300), y: FLOOR };
  let start = { x: r(45, 105), y: FLOOR - BALL_R };
  const d = levelNo;
  const pool = ["open"];
  if (d >= 2) pool.push("wall");
  if (d >= 3) pool.push("roof", "raised");
  if (d >= 5) pool.push("gap", "ramp");
  if (d >= 7) pool.push("moving", "hidden");
  if (d >= 10) pool.push("rotor", "stairs");
  const n = d < 6 ? 1 : d < 14 ? (rnd() < 0.5 ? 1 : 2) : 2;
  const used = new Set();
  for (let i = 0; i < n; i++) {
    let tpl = pick(pool);
    if (d >= 3 && tpl === "open") tpl = pick(pool.filter((p) => p !== "open")) || "open";
    if (used.has(tpl)) continue;
    used.add(tpl);
    if (tpl === "wall") {
      const h = r(60, 120 + Math.min(d * 6, 120));
      bodies.push(block(r(150, 205), FLOOR - h / 2, r(18, 34), h, color));
    } else if (tpl === "roof") {
      const len = r(80, 130);
      bodies.push(plank(jar.x + r(-30, 10), FLOOR - JAR_H - r(45, 90), len, r(-0.45, 0.2), color));
    } else if (tpl === "raised") {
      const h = r(60, 90 + Math.min(d * 5, 120));
      const px = jar.x;
      bodies.push(block(px, FLOOR - h / 2, JAR_W + 6, h, color));
      jar = { x: px, y: FLOOR - h };
    } else if (tpl === "gap") {
      const gx = r(160, 230), gapY = r(170, 300), gap = Math.max(44, 90 - d * 2);
      bodies.push(plank(gx, gapY - gap / 2 - 60, 120, Math.PI / 2 + r(-0.25, 0.25), color));
      bodies.push(plank(gx + r(-10, 10), gapY + gap / 2 + 60, 120, Math.PI / 2 + r(-0.25, 0.25), color));
    } else if (tpl === "ramp") {
      const len = r(150, 210), ang = -r(0.18, 0.35);
      const cx = jar.x - JAR_W / 2 - Math.cos(ang) * len / 2 - 6;
      bodies.push(plank(cx, FLOOR - 10 + Math.sin(ang) * len / 2, len, ang, color));
      if (rnd() < 0.6) bodies.push(plank(jar.x - 30, r(120, 220), r(100, 160), r(-0.5, -0.15), pick(COLORS)));
    } else if (tpl === "moving") {
      const vertical = rnd() < 0.5;
      const motion = vertical
        ? { type: "osc", ax: 0, ay: r(40, 80), period: r(2.2, 3.6), phase: r(0, 6) }
        : { type: "osc", ax: r(40, 70), ay: 0, period: r(2.2, 3.6), phase: r(0, 6) };
      if (vertical) { const bh = r(90, 140); bodies.push(block(r(160, 210), r(200, FLOOR - bh / 2 - motion.ay - 6), 26, bh, color, motion)); }
      else bodies.push(plank(jar.x, FLOOR - JAR_H - r(50, 90), r(80, 120), 0, color, motion));
    } else if (tpl === "hidden") {
      const h = r(150, 230);
      bodies.push(block(jar.x - JAR_W / 2 - 22, FLOOR - h / 2, 22, h, color));
    } else if (tpl === "rotor") {
      bodies.push(plank(r(150, 230), r(200, 300), r(90, 130), 0, color, { type: "rot", speed: r(1.2, 2.4) * (rnd() < 0.5 ? -1 : 1) }));
    } else if (tpl === "stairs") {
      const steps = 3, sw = 28;
      for (let k = 0; k < steps; k++) {
        const h = 30 + k * 30;
        bodies.push(block(jar.x - JAR_W / 2 - 18 - (steps - 1 - k) * sw, FLOOR - h / 2, sw, h, color));
      }
    }
  }
  let level = { levelNo, bodies, jar, start, period: 3 };
  if (flip) {
    const fb = (b) => ({ ...b, cx: W - b.cx, ang: -(b.ang || 0), motion: b.motion ? (b.motion.type === "rot" ? { ...b.motion, speed: -b.motion.speed } : { ...b.motion, ax: -b.motion.ax }) : undefined });
    level = { ...level, bodies: bodies.map(fb), jar: { ...jar, x: W - jar.x }, start: { ...start, x: W - start.x } };
  }
  level.jarBodies = jarBodies(level.jar);
  return level;
}

function overlapsStartOrJar(level) {
  // ningún cuerpo tapando la bola ni dentro del cesto
  const pts = [[level.start.x, level.start.y], [level.jar.x, level.jar.y - JAR_H / 2], [level.jar.x, level.jar.y - JAR_H - 12]];
  return level.bodies.some((b) => pts.some(([px, py]) => {
    const p = bodyPose(b, 0);
    const reach = Math.hypot(b.hw, b.hh) + 14;
    if (Math.hypot(px - p.cx, py - p.cy) > reach + (b.motion ? 80 : 0)) return false;
    const ball = { x: px, y: py, vx: 0, vy: 0 };
    const hit = collideBox(ball, { ...b, hw: b.hw + 12, hh: b.hh + 12 }, p);
    return hit;
  }));
}

export function minRateFor(levelNo) {
  if (levelNo <= 2) return 0.08;
  if (levelNo <= 6) return 0.04;
  if (levelNo <= 15) return 0.02;
  return 0.012;
}

// Nivel n (1, 2, 3...). Igual para todo el mundo: misma semilla por nivel.
const levelCache = new Map();
export function makeLevel(levelNo, eventSeed = 20261012) {
  const k = `${eventSeed}:${levelNo}`;
  if (levelCache.has(k)) return levelCache.get(k);
  const rnd = mulberry32(eventSeed + levelNo * 7919);
  let fallback = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const lv = buildCandidate(levelNo, rnd);
    if (overlapsStartOrJar(lv)) continue;
    const rate = solveRate(lv);
    if (!fallback || rate > fallback.rate) fallback = { lv, rate };
    if (rate >= minRateFor(levelNo) && (levelNo <= 2 || rate <= 0.45)) {
      lv.rate = rate;
      lv.scene = (levelNo - 1) % 9;
      levelCache.set(k, lv);
      return lv;
    }
  }
  const lv = fallback && fallback.rate > 0 ? fallback.lv : buildCandidate(1, mulberry32(levelNo));
  lv.rate = fallback ? fallback.rate : 0;
  lv.scene = (levelNo - 1) % 9;
  levelCache.set(k, lv);
  return lv;
}

// Niveles ya calculados (pilarLevels.json): se cargan al instante en el móvil.
export function levelFromData(d) {
  const lv = { levelNo: d.n, scene: d.scene, rate: d.rate / 100, start: { ...d.start }, jar: { ...d.jar }, bodies: d.bodies.map((b) => ({ ...b })), period: 3 };
  lv.jarBodies = jarBodies(lv.jar);
  return lv;
}
