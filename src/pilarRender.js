/* =============================================================================
   BOLA DEL PILAR — dibujo (canvas 2D con aspecto ilustrado/3D).
   Fondos pintados de Zaragoza (se pintan una vez y se guardan), canasta con
   red, columnas y barras con volumen, bola de baloncesto en 3D de verdad
   (costuras sobre una esfera que gira), confeti y "¡CANASTA!".
   ============================================================================= */
import { W, H, FLOOR, BALL_R, RIM_W, BOARD_H, BOARD_T } from "./pilarEngine.js";

export const PAL = { pink: "#FF2D75", orange: "#FF7A00", yellow: "#FFC63D", purple: "#6A1B9A", navy: "#1A1E2E", cream: "#F3E6D2" };
export const GAME_FONT = "'Lilita One', 'Arial Rounded MT Bold', 'Arial Black', sans-serif";

export const SCENES = [
  { name: "Basílica del Pilar", sky: ["#7DB9E8", "#CFE6F5", "#F7E7CF"], tint: 0, basX: 150, bridge: true, bunting: true },
  { name: "Puente de Piedra", sky: ["#86C3EC", "#D8ECF6", "#FBEBD3"], tint: 0, basX: 235, bridge: true, bunting: false },
  { name: "Atardecer en el Ebro", sky: ["#F08A5D", "#F9C784", "#FCE7C8"], tint: 1, basX: 175, bridge: true, bunting: true },
  { name: "La Ofrenda de Flores", sky: ["#8CC8EE", "#DCEFF7", "#FBEFD8"], tint: 0, basX: 205, bridge: false, bunting: true, flowers: true },
  { name: "Noche de fuegos", sky: ["#141033", "#3B1E5E", "#7A3C6E"], tint: 2, basX: 175, bridge: true, bunting: false, night: true },
  { name: "¡Viva el Pilar!", sky: ["#7FBDE9", "#D3EAF6", "#F9E9D0"], tint: 0, basX: 120, bridge: false, bunting: true, confetti: true },
];

// ---------- utilidades ----------
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) * (1 - t)) + ((pb >> 16) * t));
  const g = Math.round((((pa >> 8) & 255) * (1 - t)) + (((pb >> 8) & 255) * t));
  const bl = Math.round(((pa & 255) * (1 - t)) + ((pb & 255) * t));
  return `rgb(${r},${g},${bl})`;
}
function shade(hex, f) { return f < 0 ? mix(hex, "#000000", -f) : mix(hex, "#FFFFFF", f); }
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// ---------- fondo pintado (se cachea por escena) ----------
const BG_CACHE = new Map();
const BG_SCALE = 2;

function lit(scene, light, dark) { return scene.night ? dark : light; }

function tiledDome(ctx, x, y, r, h, scene, rnd) {
  // cúpula de teja vidriada (azul, verde, amarillo y blanco), como las del Pilar
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x - r, y); ctx.bezierCurveTo(x - r, y - h * 0.9, x - r * 0.35, y - h, x, y - h);
  ctx.bezierCurveTo(x + r * 0.35, y - h, x + r, y - h * 0.9, x + r, y); ctx.closePath();
  const base = ctx.createLinearGradient(x - r, 0, x + r, 0);
  base.addColorStop(0, lit(scene, "#2F6E8F", "#1d2a4a")); base.addColorStop(0.45, lit(scene, "#5FA7C2", "#34507a")); base.addColorStop(1, lit(scene, "#1F4C66", "#141c34"));
  ctx.fillStyle = base; ctx.fill(); ctx.clip();
  const cols = scene.night ? ["#3b5d8a", "#2f6d63", "#8a7a3a", "#7d8aa3"] : ["#2D6FB0", "#2E9466", "#E5B83A", "#F4F1E6"];
  const step = Math.max(3, r / 5);
  for (let i = -8; i < 8; i++) {
    for (let j = 0; j < h / step + 2; j++) {
      ctx.fillStyle = cols[(i + j + 40) % 4];
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      const cx = x + i * step * 1.4 + (j % 2) * step * 0.7, cy = y - j * step;
      ctx.moveTo(cx, cy - step * 0.5); ctx.lineTo(cx + step * 0.6, cy); ctx.lineTo(cx, cy + step * 0.5); ctx.lineTo(cx - step * 0.6, cy); ctx.closePath(); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const hl = ctx.createRadialGradient(x - r * 0.4, y - h * 0.7, 1, x - r * 0.3, y - h * 0.6, r);
  hl.addColorStop(0, "rgba(255,255,255,0.45)"); hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hl; ctx.fillRect(x - r, y - h, r * 2, h);
  ctx.restore();
  // linterna
  ctx.fillStyle = lit(scene, "#EAD5B2", "#5a5068"); ctx.fillRect(x - r * 0.12, y - h - r * 0.32, r * 0.24, r * 0.32);
  ctx.fillStyle = lit(scene, "#2E9466", "#2f4d55");
  ctx.beginPath(); ctx.arc(x, y - h - r * 0.32, r * 0.14, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = lit(scene, "#4b3a2a", "#2a2238"); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y - h - r * 0.45); ctx.lineTo(x, y - h - r * 0.7); ctx.stroke();
}

function tower(ctx, x, base, w, h, scene) {
  const wall = lit(scene, "#EBD3AE", "#4a4160"), wallDark = lit(scene, "#C9A97E", "#2e2840");
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, wall); g.addColorStop(0.65, wall); g.addColorStop(1, wallDark);
  // cuerpo en tres pisos que se estrechan
  const tiers = [[w, h * 0.55], [w * 0.82, h * 0.22], [w * 0.64, h * 0.12]];
  let y = base;
  for (const [tw, th] of tiers) {
    ctx.fillStyle = g; ctx.fillRect(x - tw / 2, y - th, tw, th);
    ctx.fillStyle = lit(scene, "rgba(90,60,30,0.35)", "rgba(0,0,0,0.35)");
    ctx.fillRect(x - tw / 2, y - th, tw, 2);
    // ventanas
    ctx.fillStyle = scene.night ? "rgba(255,200,110,0.85)" : "rgba(70,50,35,0.55)";
    const ww = Math.max(2, tw * 0.18);
    rr(ctx, x - ww / 2, y - th * 0.7, ww, th * 0.4, ww / 2); ctx.fill();
    y -= th;
  }
  // chapitel con cupulín
  const top = y;
  ctx.fillStyle = lit(scene, "#2E7D6B", "#24404a");
  ctx.beginPath(); ctx.moveTo(x - w * 0.36, top); ctx.quadraticCurveTo(x - w * 0.36, top - w * 0.55, x, top - w * 0.7); ctx.quadraticCurveTo(x + w * 0.36, top - w * 0.55, x + w * 0.36, top); ctx.fill();
  ctx.fillStyle = lit(scene, "#E5B83A", "#7a6a3a"); ctx.fillRect(x - w * 0.08, top - w * 1.05, w * 0.16, w * 0.35);
  ctx.strokeStyle = lit(scene, "#3d2f22", "#201a2c"); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, top - w * 1.05); ctx.lineTo(x, top - w * 1.45); ctx.stroke();
}

function basilica(ctx, cx, base, s, scene, rnd) {
  const wall = lit(scene, "#EED8B4", "#4b4262"), wallShade = lit(scene, "#D1B48A", "#342d48");
  const bw = 210 * s, bh = 62 * s;
  // cuerpo principal
  const g = ctx.createLinearGradient(0, base - bh, 0, base);
  g.addColorStop(0, wall); g.addColorStop(1, wallShade);
  ctx.fillStyle = g; ctx.fillRect(cx - bw / 2, base - bh, bw, bh);
  ctx.fillStyle = lit(scene, "rgba(120,80,40,0.35)", "rgba(0,0,0,0.4)"); ctx.fillRect(cx - bw / 2, base - bh, bw, 3 * s);
  for (let i = 0; i < 11; i++) {
    const wx = cx - bw / 2 + 12 * s + i * (bw - 24 * s) / 10;
    ctx.fillStyle = scene.night ? "rgba(255,196,110,0.9)" : "rgba(80,55,35,0.5)";
    rr(ctx, wx - 3 * s, base - bh * 0.62, 6 * s, bh * 0.36, 3 * s); ctx.fill();
  }
  // cúpulas
  tiledDome(ctx, cx, base - bh, 30 * s, 42 * s, scene, rnd);
  tiledDome(ctx, cx - 50 * s, base - bh, 16 * s, 22 * s, scene, rnd);
  tiledDome(ctx, cx + 50 * s, base - bh, 16 * s, 22 * s, scene, rnd);
  tiledDome(ctx, cx - 80 * s, base - bh, 11 * s, 15 * s, scene, rnd);
  tiledDome(ctx, cx + 80 * s, base - bh, 11 * s, 15 * s, scene, rnd);
  // las cuatro torres
  tower(ctx, cx - bw / 2 - 2 * s, base, 22 * s, 150 * s, scene);
  tower(ctx, cx + bw / 2 + 2 * s, base, 22 * s, 150 * s, scene);
  tower(ctx, cx - bw / 2 + 26 * s, base - bh + 2, 13 * s, 52 * s, scene);
  tower(ctx, cx + bw / 2 - 26 * s, base - bh + 2, 13 * s, 52 * s, scene);
}

function farCity(ctx, y, scene, rnd) {
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, w = 14 + rnd() * 30, h = 14 + rnd() * 40;
    ctx.fillStyle = scene.night ? `rgba(60,48,90,${0.6 + rnd() * 0.3})` : mix("#E9D3B2", "#CDB08A", rnd());
    ctx.globalAlpha = scene.night ? 1 : 0.55;
    ctx.fillRect(x, y - h, w, h);
    ctx.fillStyle = scene.night ? "rgba(255,200,120,0.7)" : "rgba(120,90,60,0.25)";
    for (let k = 0; k < 3; k++) ctx.fillRect(x + 3 + rnd() * (w - 6), y - h + 4 + rnd() * (h - 8), 2, 3);
    ctx.globalAlpha = 1;
  }
}

function trees(ctx, y, scene, rnd, from = 0, to = W) {
  for (let i = 0; i < 14; i++) {
    const x = from + rnd() * (to - from), r = 9 + rnd() * 10;
    const c = scene.night ? "#1f3a3a" : mix("#4F8A3C", "#7DB35A", rnd());
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = k === 3 ? (scene.night ? "#2b4f4a" : "rgba(255,255,220,0.25)") : c;
      ctx.beginPath(); ctx.arc(x + (k - 1.5) * r * 0.5, y - r * (k === 3 ? 1.1 : 0.7) - (k % 2) * r * 0.3, r * (k === 3 ? 0.5 : 0.85), 0, Math.PI * 2); ctx.fill();
    }
  }
}

function river(ctx, y0, y1, scene) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  if (scene.night) { g.addColorStop(0, "#2a2350"); g.addColorStop(1, "#171334"); }
  else { g.addColorStop(0, "#9CCFE0"); g.addColorStop(1, "#6FAFC6"); }
  ctx.fillStyle = g; ctx.fillRect(0, y0, W, y1 - y0);
  ctx.strokeStyle = scene.night ? "rgba(255,190,120,0.35)" : "rgba(255,255,255,0.55)"; ctx.lineWidth = 1;
  for (let k = 0; k < 18; k++) {
    const y = y0 + 3 + (k * 7.3) % (y1 - y0 - 4), x = (k * 53) % W;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 + (k % 4) * 6, y); ctx.stroke();
  }
}

function bridge(ctx, y, scene) {
  const stone = lit(scene, "#D9BC92", "#4a3f5c"), dark = lit(scene, "#A98A62", "#2c2540");
  ctx.fillStyle = stone; ctx.fillRect(0, y - 18, W, 14);
  ctx.fillStyle = dark; ctx.fillRect(0, y - 6, W, 3);
  for (let i = 0; i < 6; i++) {
    const x = 30 + i * 62;
    ctx.fillStyle = stone; ctx.fillRect(x - 31, y - 6, 10, 22);
    ctx.fillStyle = lit(scene, "rgba(70,110,130,0.55)", "rgba(10,8,30,0.7)");
    ctx.beginPath(); ctx.moveTo(x - 21, y + 16); ctx.lineTo(x - 21, y - 2); ctx.quadraticCurveTo(x, y - 18, x + 21, y - 2); ctx.lineTo(x + 21, y + 16); ctx.fill();
  }
  ctx.fillStyle = lit(scene, "rgba(255,255,255,0.35)", "rgba(255,200,140,0.2)"); ctx.fillRect(0, y - 18, W, 1.5);
}

function bunting(ctx, x0, y0, x1, y1, sag, rnd) {
  const cols = [PAL.pink, PAL.orange, PAL.yellow, PAL.purple, "#2ED1C4"];
  ctx.strokeStyle = "rgba(60,40,40,0.6)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag, x1, y1); ctx.stroke();
  const n = 12;
  for (let i = 1; i < n; i++) {
    const t = i / n, x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * (x0 + x1) / 2 + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * ((y0 + y1) / 2 + sag) + t * t * y1;
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x, y); ctx.lineTo(x, y + 15); ctx.closePath(); ctx.fill();
  }
}

function flowerMound(ctx, x, y, w, h, rnd) {
  const cols = ["#FF2D75", "#FF7A00", "#FFC63D", "#FFFFFF", "#E83F6F", "#B04FD0"];
  ctx.fillStyle = "#3e7a35"; ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x, y - h * 1.6, x + w / 2, y); ctx.fill();
  for (let i = 0; i < 160; i++) {
    const t = rnd(), u = rnd();
    const px = x - w / 2 + t * w, maxH = h * 1.55 * (1 - Math.pow(2 * t - 1, 2)) * 0.5;
    const py = y - u * maxH;
    ctx.fillStyle = cols[Math.floor(rnd() * cols.length)];
    ctx.beginPath(); ctx.arc(px, py, 2 + rnd() * 2.4, 0, Math.PI * 2); ctx.fill();
  }
}

function paintBackground(sceneIdx) {
  const scene = SCENES[sceneIdx];
  const c = document.createElement("canvas"); c.width = W * BG_SCALE; c.height = H * BG_SCALE;
  const ctx = c.getContext("2d"); ctx.scale(BG_SCALE, BG_SCALE);
  const rnd = seeded(101 + sceneIdx * 77);
  // cielo
  const sky = ctx.createLinearGradient(0, 0, 0, FLOOR);
  sky.addColorStop(0, scene.sky[0]); sky.addColorStop(0.55, scene.sky[1]); sky.addColorStop(1, scene.sky[2]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, FLOOR);
  // sol / luna
  const sx = scene.night ? 290 : 60, sy = scene.night ? 70 : 60;
  const sun = ctx.createRadialGradient(sx, sy, 2, sx, sy, scene.night ? 40 : 120);
  sun.addColorStop(0, scene.night ? "rgba(255,245,220,0.9)" : "rgba(255,248,225,0.95)"); sun.addColorStop(1, "rgba(255,248,225,0)");
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, FLOOR);
  if (scene.night) { for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`; ctx.fillRect(rnd() * W, rnd() * 200, 1.2, 1.2); } }
  // nubes
  if (!scene.night) {
    for (let i = 0; i < 6; i++) {
      const cx = rnd() * W, cy = 40 + rnd() * 110, s = 14 + rnd() * 18;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(cx + (k - 2) * s * 0.9, cy - (k % 2) * s * 0.4, s, s * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  const horizon = 330;
  // ciudad lejana con bruma
  farCity(ctx, horizon - 4, scene, rnd);
  ctx.fillStyle = scene.night ? "rgba(40,25,70,0.25)" : "rgba(255,245,230,0.35)"; ctx.fillRect(0, 200, W, horizon - 200);
  // la Seo (torre lejana)
  tower(ctx, scene.basX > 180 ? 52 : 312, horizon - 8, 12, 95, scene);
  // Basílica
  basilica(ctx, scene.basX, horizon - 6, 0.95, scene, rnd);
  ctx.fillStyle = scene.night ? "rgba(30,20,60,0.12)" : "rgba(255,250,240,0.12)"; ctx.fillRect(0, 150, W, horizon - 150);
  // río y puente / árboles
  river(ctx, horizon - 6, FLOOR - 50, scene);
  if (scene.bridge) bridge(ctx, horizon + 22, scene);
  trees(ctx, FLOOR - 44, scene, rnd);
  if (scene.flowers) flowerMound(ctx, 70, FLOOR - 40, 120, 60, rnd);
  // muro bajo del paseo
  const wall = ctx.createLinearGradient(0, FLOOR - 46, 0, FLOOR);
  wall.addColorStop(0, scene.night ? "#3a3150" : "#E3C79E"); wall.addColorStop(1, scene.night ? "#2a2340" : "#C9A779");
  ctx.fillStyle = wall; ctx.fillRect(0, FLOOR - 30, W, 30);
  ctx.fillStyle = scene.night ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"; ctx.fillRect(0, FLOOR - 30, W, 2);
  ctx.strokeStyle = scene.night ? "rgba(0,0,0,0.3)" : "rgba(120,85,50,0.25)"; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 36) { ctx.beginPath(); ctx.moveTo(x, FLOOR - 28); ctx.lineTo(x, FLOOR); ctx.stroke(); }
  // banderines
  if (scene.bunting) { bunting(ctx, -10, 18, 200, 36, 30, rnd); bunting(ctx, 170, 30, W + 10, 12, 26, rnd); }
  if (scene.confetti) {
    for (let i = 0; i < 40; i++) { ctx.save(); ctx.translate(rnd() * W, rnd() * 260); ctx.rotate(rnd() * 6); ctx.fillStyle = [PAL.pink, PAL.orange, PAL.yellow, PAL.purple][i % 4]; ctx.fillRect(-3, -1.5, 6, 3); ctx.restore(); }
  }
  // suelo: pista (cara de arriba) con línea blanca y cara delantera
  const top = ctx.createLinearGradient(0, FLOOR, 0, FLOOR + 16);
  top.addColorStop(0, scene.night ? "#7c5a4a" : "#F0D3A6"); top.addColorStop(1, scene.night ? "#5c4136" : "#DDB683");
  ctx.fillStyle = top; ctx.fillRect(0, FLOOR, W, 16);
  ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(W / 2, FLOOR + 9, 70, 5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, FLOOR + 3); ctx.lineTo(W, FLOOR + 3); ctx.stroke();
  const front = ctx.createLinearGradient(0, FLOOR + 16, 0, H);
  front.addColorStop(0, scene.night ? "#4a2f26" : "#C88A55"); front.addColorStop(1, scene.night ? "#2a1a15" : "#8A5530");
  ctx.fillStyle = front; ctx.fillRect(0, FLOOR + 16, W, H - FLOOR - 16);
  ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(0, FLOOR + 16, W, 2);
  return c;
}

export function drawBackground(ctx, sceneIdx, t) {
  if (!BG_CACHE.has(sceneIdx)) BG_CACHE.set(sceneIdx, paintBackground(sceneIdx));
  ctx.drawImage(BG_CACHE.get(sceneIdx), 0, 0, W, H);
  const scene = SCENES[sceneIdx];
  if (scene.night) drawFireworks(ctx, t);
}

function drawFireworks(ctx, t) {
  const bursts = [[90, 90, PAL.pink, 0], [250, 70, PAL.yellow, 1.3], [180, 140, "#4CC9F0", 2.1], [300, 150, PAL.orange, 0.7]];
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (const [x, y, c, off] of bursts) {
    const ph = ((t + off) % 2.6) / 2.6; if (ph > 0.75) continue;
    const r = 8 + ph * 46, a = 1 - ph / 0.75;
    ctx.strokeStyle = c; ctx.globalAlpha = a; ctx.lineWidth = 2;
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * r * 0.6, y + Math.sin(ang) * r * 0.6 + ph * 8); ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r + ph * 12); ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------- obstáculos ----------
function capsulePath(ctx, hw, hh) {
  const r = Math.min(hh, hw);
  rr(ctx, -hw, -hh, hw * 2, hh * 2, r);
}
export function drawBody(ctx, b, pose) {
  ctx.save(); ctx.translate(pose.cx, pose.cy); ctx.rotate(pose.ang);
  if (b.kind === "block") {
    // columna oscura cilíndrica con tapa rosa (como en la referencia)
    const g = ctx.createLinearGradient(-b.hw, 0, b.hw, 0);
    g.addColorStop(0, "#0E1120"); g.addColorStop(0.3, "#3A4060"); g.addColorStop(0.55, "#232842"); g.addColorStop(1, "#090B15");
    ctx.fillStyle = g; ctx.fillRect(-b.hw, -b.hh + 5, b.hw * 2, b.hh * 2 - 5);
    ctx.beginPath(); ctx.ellipse(0, b.hh, b.hw, 4, 0, 0, Math.PI); ctx.fill();
    // tapa
    const cap = ctx.createLinearGradient(-b.hw, 0, b.hw, 0);
    cap.addColorStop(0, "#B3124C"); cap.addColorStop(0.35, "#FF5C93"); cap.addColorStop(1, "#9E0F42");
    ctx.fillStyle = cap; ctx.fillRect(-b.hw - 1, -b.hh, b.hw * 2 + 2, 9);
    ctx.beginPath(); ctx.ellipse(0, -b.hh, b.hw + 1, 4, 0, 0, Math.PI * 2); ctx.fillStyle = "#FF8AB3"; ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(-b.hw * 0.45, -b.hh + 10, b.hw * 0.22, b.hh * 2 - 14);
  } else if (b.kind === "pad") {
    // trampolín: plato morado con flechas que brillan
    ctx.fillStyle = "#2A2F45"; ctx.beginPath(); ctx.ellipse(0, 4, b.hw, 6, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(0, -b.hh, 0, b.hh);
    g.addColorStop(0, "#C77DFF"); g.addColorStop(1, PAL.purple);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -2, b.hw, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PAL.orange; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, -2, b.hw - 2, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(255,240,200,0.9)"; ctx.lineWidth = 3; ctx.lineCap = "round";
    for (const yy of [-14, -24]) { ctx.beginPath(); ctx.moveTo(-8, yy + 6); ctx.lineTo(0, yy); ctx.lineTo(8, yy + 6); ctx.stroke(); }
  } else {
    // barra: cápsula naranja-rosa brillante
    ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 4;
    capsulePath(ctx, b.hw, b.hh);
    const g = ctx.createLinearGradient(0, -b.hh, 0, b.hh);
    g.addColorStop(0, "#FFB066"); g.addColorStop(0.45, PAL.orange); g.addColorStop(1, "#D9204F");
    ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "rgba(255,255,255,0.45)"; rr(ctx, -b.hw + b.hh, -b.hh + 2.5, b.hw * 2 - b.hh * 2, 3, 1.5); ctx.fill();
    // remates morados
    ctx.fillStyle = PAL.purple;
    rr(ctx, -b.hw, -b.hh, 10, b.hh * 2, Math.min(b.hh, 5)); ctx.fill();
    rr(ctx, b.hw - 10, -b.hh, 10, b.hh * 2, Math.min(b.hh, 5)); ctx.fill();
    if (b.motion && b.motion.type === "rot") {
      ctx.fillStyle = PAL.purple; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#E0B3FF"; ctx.beginPath(); ctx.arc(-2, -2, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}
export function drawBodyShadow(ctx, b, pose) {
  if (b.kind !== "block" && b.kind !== "pad") return;
  if (pose.cy + b.hh < FLOOR - 6) return;
  ctx.fillStyle = "rgba(40,20,10,0.28)";
  ctx.beginPath(); ctx.ellipse(pose.cx + 6, FLOOR + 4, b.hw + 10, 5, 0, 0, Math.PI * 2); ctx.fill();
}

// ---------- canasta ----------
export function drawHoopBack(ctx, level, t, net) {
  const { hoop } = level, hp = level.hoopParts, d = hoop.dir;
  const bx = hp.board.cx, by = hp.board.cy;
  // poste (detrás del tablero)
  const poleX = hoop.x + d * 22;
  ctx.fillStyle = "rgba(40,20,10,0.25)"; ctx.beginPath(); ctx.ellipse(poleX + 4, FLOOR + 4, 16, 4, 0, 0, Math.PI * 2); ctx.fill();
  const pg = ctx.createLinearGradient(poleX - 5, 0, poleX + 5, 0);
  pg.addColorStop(0, "#1B1F2E"); pg.addColorStop(0.4, "#555C78"); pg.addColorStop(1, "#11131D");
  ctx.fillStyle = pg; ctx.fillRect(poleX - 5, by, 10, FLOOR - by);
  // tablero de frente, detrás del aro
  const bw = 96, bh = BOARD_H + 6, x0 = hoop.x - bw / 2 + d * 14, y0 = by - bh / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  rr(ctx, x0, y0, bw, bh, 7); ctx.fillStyle = "#F4F1EC"; ctx.fill();
  ctx.restore();
  const gl = ctx.createLinearGradient(x0, y0, x0 + bw, y0 + bh);
  gl.addColorStop(0, "rgba(255,255,255,0.7)"); gl.addColorStop(0.5, "rgba(255,255,255,0)"); gl.addColorStop(1, "rgba(0,0,0,0.06)");
  rr(ctx, x0, y0, bw, bh, 7); ctx.fillStyle = gl; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = "#E8344E"; rr(ctx, x0 + 2, y0 + 2, bw - 4, bh - 4, 6); ctx.stroke();
  ctx.lineWidth = 3; ctx.strokeRect(hoop.x - 17, hoop.y - 34, 34, 26);
  // aro: mitad de atrás
  ctx.lineWidth = 3.5; ctx.strokeStyle = "#B5232F";
  ctx.beginPath(); ctx.ellipse(hoop.x, hoop.y, RIM_W / 2, 6, 0, Math.PI, Math.PI * 2); ctx.stroke();
}
export function drawHoopFront(ctx, level, t, net) {
  const { hoop } = level;
  const swing = net ? net.swing : 0, stretch = net ? net.stretch : 0;
  // red: hilos blancos que se estrechan, se mueve cuando pasa la bola
  const top = hoop.y, depth = 40 + stretch * 14, botW = RIM_W * 0.62;
  ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = 1.3;
  const cols = 8;
  const pt = (i, row) => {
    const f = row / 4, wv = RIM_W / 2 * (1 - f) + botW / 2 * f;
    const x = hoop.x + (i / cols * 2 - 1) * wv + Math.sin(t * 9 + row) * swing * f * 4;
    const y = top + f * depth + Math.cos((i / cols) * Math.PI) * 2 * (1 - f);
    return [x, y];
  };
  for (let i = 0; i < cols; i++) {
    ctx.beginPath();
    for (let row = 0; row <= 4; row++) { const [x1, y1] = pt(i, row), [x2, y2] = pt(i + 1, row + 1 > 4 ? 4 : row + 1); row ? ctx.lineTo(x1, y1) : ctx.moveTo(x1, y1); }
    ctx.stroke();
    ctx.beginPath();
    for (let row = 0; row <= 4; row++) { const [x1, y1] = pt(i + 1, row); row ? ctx.lineTo(x1, y1) : ctx.moveTo(x1, y1); }
    ctx.stroke();
    for (let row = 0; row < 4; row++) { const [x1, y1] = pt(i, row), [x2, y2] = pt(i + 1, row + 1); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); const [x3, y3] = pt(i + 1, row), [x4, y4] = pt(i, row + 1); ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke(); }
  }
  ctx.restore();
  // aro: mitad delantera (por delante de la bola)
  ctx.lineWidth = 4; ctx.strokeStyle = "#E8344E";
  ctx.beginPath(); ctx.ellipse(hoop.x, hoop.y, RIM_W / 2, 6, 0, 0, Math.PI); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(hoop.x, hoop.y - 0.5, RIM_W / 2 - 1, 5, 0, 0.2, Math.PI - 0.2); ctx.stroke();
}

// ---------- bola de baloncesto 3D ----------
const AXIS = (() => { const v = [-0.32, 0.42, 0.85], n = Math.hypot(...v); return v.map((x) => x / n); })();
const SEAMS = (() => {
  const s = [], N = 48;
  const ring = (f) => { const pts = []; for (let i = 0; i <= N; i++) { const t = (i / N) * Math.PI * 2; pts.push(f(t)); } return pts; };
  s.push(ring((t) => [Math.cos(t), Math.sin(t), 0]));
  s.push(ring((t) => [0, Math.cos(t), Math.sin(t)]));
  const k = 0.68, rr2 = Math.sqrt(1 - k * k);
  s.push(ring((t) => [k + 0.12 * Math.cos(2 * t), rr2 * Math.cos(t), rr2 * Math.sin(t)]));
  s.push(ring((t) => [-k - 0.12 * Math.cos(2 * t), rr2 * Math.cos(t), rr2 * Math.sin(t)]));
  return s.map((ring) => ring.map((p) => { const n = Math.hypot(...p); return p.map((x) => x / n); }));
})();
function rotMat(angle) {
  const [x, y, z] = AXIS, c = Math.cos(angle), s = Math.sin(angle), C = 1 - c;
  return [
    [c + x * x * C, x * y * C - z * s, x * z * C + y * s],
    [y * x * C + z * s, c + y * y * C, y * z * C - x * s],
    [z * x * C - y * s, z * y * C + x * s, c + z * z * C],
  ];
}
export function drawBallShadow(ctx, x, y) {
  const h = Math.max(0, FLOOR - BALL_R - y), k = Math.max(0.3, 1 - h / 300);
  ctx.fillStyle = `rgba(40,20,10,${0.35 * k})`;
  ctx.beginPath(); ctx.ellipse(x + 4, FLOOR + 4, BALL_R * 1.25 * k, 4 * k, 0, 0, Math.PI * 2); ctx.fill();
}
export function drawBall(ctx, x, y, rot, squash = 0) {
  const R = BALL_R;
  ctx.save(); ctx.translate(x, y + squash * R);
  ctx.scale(1 + squash, 1 - squash);
  // esfera
  const g = ctx.createRadialGradient(-R * 0.38, -R * 0.42, R * 0.1, 0, 0, R * 1.02);
  g.addColorStop(0, "#FFC07A"); g.addColorStop(0.35, "#F4862A"); g.addColorStop(0.8, "#C9520F"); g.addColorStop(1, "#7E2F05");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  // granulado sutil
  ctx.save(); ctx.clip();
  // costuras proyectadas desde la esfera 3D (solo la parte de delante)
  const M = rotMat(rot);
  ctx.strokeStyle = "#2B1205"; ctx.lineCap = "round";
  for (const ring of SEAMS) {
    let prev = null;
    for (const p of ring) {
      const q = [M[0][0] * p[0] + M[0][1] * p[1] + M[0][2] * p[2], M[1][0] * p[0] + M[1][1] * p[1] + M[1][2] * p[2], M[2][0] * p[0] + M[2][1] * p[1] + M[2][2] * p[2]];
      if (prev && q[2] > 0 && prev[2] > 0) {
        ctx.lineWidth = 0.6 + 1.3 * q[2];
        ctx.globalAlpha = 0.35 + 0.65 * q[2];
        ctx.beginPath(); ctx.moveTo(prev[0] * R, prev[1] * R); ctx.lineTo(q[0] * R, q[1] * R); ctx.stroke();
      }
      prev = q;
    }
  }
  ctx.globalAlpha = 1;
  // oclusión en el borde y luz de rebote abajo
  const ao = ctx.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
  ao.addColorStop(0, "rgba(0,0,0,0)"); ao.addColorStop(1, "rgba(40,10,0,0.45)");
  ctx.fillStyle = ao; ctx.fillRect(-R, -R, R * 2, R * 2);
  const bounce = ctx.createRadialGradient(R * 0.4, R * 0.75, 1, R * 0.4, R * 0.75, R * 0.7);
  bounce.addColorStop(0, "rgba(255,200,140,0.35)"); bounce.addColorStop(1, "rgba(255,200,140,0)");
  ctx.fillStyle = bounce; ctx.fillRect(-R, -R, R * 2, R * 2);
  ctx.restore();
  // brillo especular
  const sp = ctx.createRadialGradient(-R * 0.42, -R * 0.48, 0, -R * 0.42, -R * 0.48, R * 0.45);
  sp.addColorStop(0, "rgba(255,255,255,0.85)"); sp.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sp; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawTrail(ctx, trail) {
  if (trail.length < 2) return;
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < trail.length; i++) {
    const [x, y] = trail[i], f = i / trail.length;
    const r = BALL_R * (0.25 + 0.75 * f);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,220,120,${0.45 * f})`); g.addColorStop(1, "rgba(255,140,30,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- efectos ----------
export function spawnConfetti(list, x, y, n = 60) {
  const cols = [PAL.pink, PAL.orange, PAL.yellow, PAL.purple, "#2ED1C4", "#FFFFFF"];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, s = 180 + Math.random() * 380;
    list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, c: cols[i % cols.length], life: 1.6 + Math.random() * 0.8, w: 4 + Math.random() * 4 });
  }
}
export function stepConfetti(list, dt) {
  for (const p of list) { p.vy += 520 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt; }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].life <= 0 || list[i].y > H) list.splice(i, 1);
}
export function drawConfetti(ctx, list) {
  for (const p of list) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, p.life * 1.5);
    ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2 * (0.4 + Math.abs(Math.sin(p.rot * 2)) * 0.6));
    ctx.restore();
  }
}
export function drawPopup(ctx, text, age, color, baseY = 170) {
  if (age < 0 || age > 1.3) return;
  const pop = age < 0.18 ? 0.4 + (age / 0.18) * 0.75 : age < 0.3 ? 1.15 - ((age - 0.18) / 0.12) * 0.15 : 1;
  const alpha = age > 1.0 ? 1 - (age - 1.0) / 0.3 : 1;
  ctx.save(); ctx.translate(W / 2, baseY - Math.max(0, age - 0.3) * 20); ctx.rotate(-0.08); ctx.scale(pop, pop); ctx.globalAlpha = alpha;
  ctx.font = `42px ${GAME_FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineJoin = "round"; ctx.lineWidth = 8; ctx.strokeStyle = "#FFFFFF"; ctx.strokeText(text, 0, 0);
  const g = ctx.createLinearGradient(-110, 0, 110, 0);
  if (color === "miss") { g.addColorStop(0, "#5B5F75"); g.addColorStop(1, "#2B2F45"); }
  else { g.addColorStop(0, PAL.pink); g.addColorStop(0.5, PAL.purple); g.addColorStop(1, PAL.orange); }
  ctx.fillStyle = g; ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ---------- HUD (corazón y bocadillo, como en la referencia) ----------
export function drawHud(ctx, lives, score, bump = 0) {
  // corazón rosa con vidas
  ctx.save(); ctx.translate(36, 34);
  ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.beginPath(); ctx.moveTo(0, 13); ctx.bezierCurveTo(-27, -5, -15, -27, 0, -12); ctx.bezierCurveTo(15, -27, 27, -5, 0, 13);
  const hg = ctx.createLinearGradient(0, -24, 0, 14); hg.addColorStop(0, "#FF6FA0"); hg.addColorStop(1, PAL.pink);
  ctx.fillStyle = hg; ctx.fill(); ctx.shadowColor = "transparent";
  ctx.lineWidth = 2.5; ctx.strokeStyle = "#FFFFFF"; ctx.stroke();
  ctx.fillStyle = "#FFFFFF"; ctx.font = `17px ${GAME_FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(lives), 0, -3);
  ctx.restore();
  // bocadillo explosión con la puntuación
  const s = 1 + bump * 0.25;
  ctx.save(); ctx.translate(W - 62, 38); ctx.scale(s * 0.92, s * 0.92);
  const spikes = 12;
  const burst = () => { ctx.beginPath(); for (let i = 0; i <= spikes * 2; i++) { const a = (i / (spikes * 2)) * Math.PI * 2 - 0.2, r = i % 2 ? 21 : 30 + ((i * 7) % 5); const px = Math.cos(a) * r * 1.15, py = Math.sin(a) * r * 0.82; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); };
  ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
  burst(); const bg = ctx.createLinearGradient(-30, -30, 30, 30); bg.addColorStop(0, PAL.yellow); bg.addColorStop(1, PAL.orange);
  ctx.fillStyle = bg; ctx.fill(); ctx.shadowColor = "transparent";
  ctx.lineWidth = 3; ctx.strokeStyle = PAL.pink; ctx.stroke();
  ctx.scale(0.8, 0.8); burst(); ctx.fillStyle = "#FFF8EC"; ctx.fill();
  ctx.scale(1.25, 1.25);
  ctx.fillStyle = "#2B1055"; ctx.font = `26px ${GAME_FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(String(score), 0, 2);
  ctx.restore();
}

export function drawLevelTag(ctx, levelNo, sceneIdx) {
  const txt = `NIVEL ${levelNo} · ${SCENES[sceneIdx].name.toUpperCase()}`;
  ctx.save(); ctx.font = `12px ${GAME_FONT}`; ctx.textBaseline = "middle";
  const w = ctx.measureText(txt).width + 18;
  rr(ctx, 12, FLOOR + 20, w, 18, 9); ctx.fillStyle = "rgba(26,30,46,0.55)"; ctx.fill();
  ctx.fillStyle = "#FFF3DF"; ctx.fillText(txt, 21, FLOOR + 29.5);
  ctx.restore();
}

export function drawAim(ctx, bx, by, vx, vy, maxSpeed) {
  const sp = Math.hypot(vx, vy); if (sp < 1) return;
  const pct = Math.min(1, sp / maxSpeed), ux = vx / sp, uy = vy / sp;
  // flecha de dirección con fuerza (sin trayectoria, como en Tigerball)
  const L = 30 + 60 * pct;
  ctx.save(); ctx.lineCap = "round";
  const g = ctx.createLinearGradient(bx, by, bx + ux * L, by + uy * L);
  g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, pct > 0.85 ? PAL.pink : PAL.yellow);
  ctx.strokeStyle = g; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(bx + ux * 16, by + uy * 16); ctx.lineTo(bx + ux * L, by + uy * L); ctx.stroke();
  const tx = bx + ux * (L + 6), ty = by + uy * (L + 6);
  ctx.fillStyle = pct > 0.85 ? PAL.pink : PAL.yellow;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - ux * 11 - uy * 7, ty - uy * 11 + ux * 7); ctx.lineTo(tx - ux * 11 + uy * 7, ty - uy * 11 - ux * 7); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.arc(bx, by, 20, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = pct > 0.85 ? PAL.pink : PAL.yellow; ctx.beginPath(); ctx.arc(bx, by, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); ctx.stroke();
  ctx.restore();
}
