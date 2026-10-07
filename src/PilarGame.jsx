import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  W, H, FLOOR, BALL_R, DT, MAX_FLIGHT, JAR_W, JAR_H,
  stepBall, bodyPose, launchFromDrag, levelFromData, makeLevel,
} from "./pilarEngine.js";
import LEVELS from "./pilarLevels.json";

/* =============================================================================
   BOLA DEL PILAR — pantalla del minijuego de las Fiestas del Pilar.
   ============================================================================= */

export const PILAR_EVENT = "pilar2026";
export const PILAR_ENDS_AT = new Date("2026-10-12T23:59:59+02:00").getTime();
export const PILAR_PRIZES = [7.5, 5, 2.5];
const START_LIVES = 5;
const MAX_ROCKETS = 3;

const INK = "#1d1d1f";
const ARAGON_RED = "#D7262C";
const ARAGON_YELLOW = "#FCDD09";
const SCENES = [
  { name: "Basílica del Pilar", bg: "#9CF1F2" },
  { name: "El cachirulo", bg: "#8EECC0" },
  { name: "Baturro", bg: "#FFE9A8" },
  { name: "La Ofrenda de Flores", bg: "#FFC9DE" },
  { name: "Gigantes y Cabezudos", bg: "#D6C8FF" },
  { name: "Fuegos del Pilar", bg: "#A7D8FF" },
  { name: "La Jota", bg: "#FFD1B0" },
  { name: "Puente de Piedra", bg: "#B9F0A8" },
  { name: "¡Viva el Pilar!", bg: "#FFF3B0" },
];

function getLevel(n) {
  const d = LEVELS[n - 1];
  return d ? levelFromData(d) : makeLevel(n);
}

/* ---------- dibujos de fondo (estilo boceto, como en Tigerball) ---------- */
function sketchStyle(ctx, w = 2.2) {
  ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.lineJoin = "round"; ctx.lineCap = "round";
}
function dome(ctx, x, y, r, lantern = true) {
  ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x - r, y - r * 1.3, x, y - r * 1.35);
  ctx.quadraticCurveTo(x + r, y - r * 1.3, x + r, y); ctx.stroke();
  // gajos de colores (las cúpulas de teja vidriada)
  ctx.save(); ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#2f8f5b"; ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x - r, y - r * 1.3, x, y - r * 1.35);
  ctx.quadraticCurveTo(x + r, y - r * 1.3, x + r, y); ctx.closePath(); ctx.fill(); ctx.restore();
  for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * r * 0.5, y); ctx.quadraticCurveTo(x + k * r * 0.4, y - r, x, y - r * 1.35); ctx.stroke(); }
  if (lantern) { ctx.strokeRect(x - r * 0.15, y - r * 1.75, r * 0.3, r * 0.4); ctx.beginPath(); ctx.moveTo(x, y - r * 1.75); ctx.lineTo(x, y - r * 2.05); ctx.stroke(); }
}
function tower(ctx, x, y, w, h) {
  ctx.strokeRect(x - w / 2, y - h, w, h);
  for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x - w / 2, y - h + (h / 4) * k); ctx.lineTo(x + w / 2, y - h + (h / 4) * k); ctx.stroke(); }
  ctx.strokeRect(x - w * 0.18, y - h * 0.82, w * 0.36, h * 0.12);
  ctx.beginPath(); ctx.moveTo(x - w / 2, y - h); ctx.lineTo(x, y - h - w * 1.3); ctx.lineTo(x + w / 2, y - h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - h - w * 1.3); ctx.lineTo(x, y - h - w * 1.7); ctx.stroke();
}
function drawPilar(ctx) {
  sketchStyle(ctx);
  const by = 300;
  ctx.strokeRect(70, by - 70, 220, 70);
  for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(88 + i * 23, by - 30, 6, Math.PI, 0); ctx.lineTo(94 + i * 23, by - 14); ctx.lineTo(82 + i * 23, by - 14); ctx.closePath(); ctx.stroke(); }
  tower(ctx, 62, by, 18, 120); tower(ctx, 298, by, 18, 120);
  tower(ctx, 118, by - 70, 12, 40); tower(ctx, 242, by - 70, 12, 40);
  dome(ctx, 180, by - 70, 34); dome(ctx, 135, by - 70, 16); dome(ctx, 225, by - 70, 16);
  dome(ctx, 100, by - 70, 10, false); dome(ctx, 260, by - 70, 10, false);
  ctx.beginPath(); ctx.moveTo(40, by); ctx.lineTo(320, by); ctx.stroke();
}
function checks(ctx, x, y, w, h, n) {
  const cw = w / n, ch = h / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.fillStyle = (i + j) % 2 === 0 ? ARAGON_RED : INK;
    if ((i + j) % 3 === 2) ctx.fillStyle = "#f4f1ea";
    ctx.fillRect(x + i * cw, y + j * ch, cw + 0.5, ch + 0.5);
  }
}
function cachirulo(ctx, cx, cy, size, rot = 0) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size, 0); ctx.lineTo(0, size * 0.9); ctx.closePath();
  ctx.save(); ctx.clip(); checks(ctx, -size, 0, size * 2, size, 10); ctx.restore();
  sketchStyle(ctx); ctx.stroke(); ctx.restore();
}
function drawCachirulo(ctx) {
  cachirulo(ctx, 180, 150, 110, 0);
  sketchStyle(ctx, 1.6);
  ctx.beginPath(); ctx.moveTo(70, 150); ctx.quadraticCurveTo(40, 170, 60, 210); ctx.moveTo(290, 150); ctx.quadraticCurveTo(320, 170, 300, 210); ctx.stroke();
}
function person(ctx, x, y, s, opts = {}) {
  sketchStyle(ctx);
  ctx.beginPath(); ctx.arc(x, y - 92 * s, 15 * s, 0, Math.PI * 2); ctx.stroke(); // cabeza
  if (opts.cachirulo) cachirulo(ctx, x, y - 104 * s, 18 * s, Math.PI);
  ctx.beginPath(); ctx.moveTo(x, y - 77 * s); ctx.lineTo(x, y - 35 * s); ctx.stroke(); // cuerpo
  if (opts.faja) { ctx.fillStyle = ARAGON_RED; ctx.fillRect(x - 12 * s, y - 50 * s, 24 * s, 8 * s); ctx.strokeRect(x - 12 * s, y - 50 * s, 24 * s, 8 * s); }
  if (opts.skirt) { ctx.beginPath(); ctx.moveTo(x - 6 * s, y - 50 * s); ctx.lineTo(x - 26 * s, y - 18 * s); ctx.lineTo(x + 26 * s, y - 18 * s); ctx.lineTo(x + 6 * s, y - 50 * s); ctx.closePath(); ctx.save(); ctx.fillStyle = "rgba(215,38,44,0.35)"; ctx.fill(); ctx.restore(); ctx.stroke(); }
  const up = opts.armsUp;
  ctx.beginPath(); ctx.moveTo(x, y - 68 * s); ctx.lineTo(x - 22 * s, y - (up ? 100 : 48) * s); ctx.moveTo(x, y - 68 * s); ctx.lineTo(x + 22 * s, y - (up ? 100 : 48) * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - 35 * s); ctx.lineTo(x - 14 * s, y); ctx.moveTo(x, y - 35 * s); ctx.lineTo(x + 14 * s, y); ctx.stroke();
}
function drawBaturro(ctx) {
  person(ctx, 180, 320, 2, { cachirulo: true, faja: true });
  sketchStyle(ctx, 1.8);
  // bota de vino
  ctx.beginPath(); ctx.ellipse(250, 150, 16, 24, 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(262, 130); ctx.lineTo(272, 118); ctx.stroke();
}
function flower(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.8, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = ARAGON_YELLOW; ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill();
}
function drawOfrenda(ctx) {
  const cols = ["#ff5d8f", "#ff9f1c", "#e63946", "#f8f9fa", "#c77dff"];
  let k = 0;
  for (let row = 0; row < 9; row++) {
    const y = 310 - row * 22, half = 120 - row * 13;
    for (let x = 180 - half; x <= 180 + half; x += 20) flower(ctx, x + (row % 2) * 8, y, 5, cols[(k++) % cols.length]);
  }
  sketchStyle(ctx);
  ctx.beginPath(); ctx.moveTo(56, 320); ctx.lineTo(180, 110); ctx.lineTo(304, 320); ctx.stroke();
  // la Virgen sobre la columna
  ctx.strokeRect(172, 70, 16, 40);
  ctx.beginPath(); ctx.moveTo(180, 30); ctx.lineTo(168, 70); ctx.lineTo(192, 70); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.arc(180, 30, 6, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(170, 24); ctx.lineTo(180, 14); ctx.lineTo(190, 24); ctx.stroke();
}
function drawCabezudo(ctx) {
  sketchStyle(ctx);
  ctx.beginPath(); ctx.arc(180, 160, 70, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(155, 150, 10, 0, Math.PI * 2); ctx.arc(205, 150, 10, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(180, 175, 12, 20, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(180, 195, 26, 0.2, Math.PI - 0.2); ctx.stroke();
  // sombrero
  ctx.beginPath(); ctx.moveTo(100, 104); ctx.lineTo(260, 104); ctx.moveTo(130, 104); ctx.lineTo(140, 60); ctx.lineTo(220, 60); ctx.lineTo(230, 104); ctx.stroke();
  ctx.fillStyle = ARAGON_RED; ctx.fillRect(138, 86, 86, 10);
  person(ctx, 180, 330, 1.0, {});
}
function drawFuegos(ctx, t) {
  const bursts = [[110, 120, "#e63946"], [240, 90, ARAGON_YELLOW], [190, 210, "#4cc9f0"], [80, 240, "#c77dff"], [280, 220, "#ff9f1c"]];
  bursts.forEach(([x, y, c], i) => {
    const pulse = 0.75 + 0.25 * Math.sin(t * 2 + i);
    ctx.strokeStyle = c; ctx.lineWidth = 2.4;
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10); ctx.lineTo(x + Math.cos(a) * 40 * pulse, y + Math.sin(a) * 40 * pulse); ctx.stroke();
    }
  });
  sketchStyle(ctx, 1.6);
  ctx.beginPath(); ctx.moveTo(40, 330); ctx.lineTo(320, 330); ctx.stroke();
}
function drawJota(ctx) {
  person(ctx, 120, 320, 1.6, { cachirulo: true, faja: true, armsUp: true });
  person(ctx, 240, 320, 1.6, { skirt: true, armsUp: true });
  sketchStyle(ctx, 1.6);
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(180, 80 + i * 26, 6, 0, Math.PI * 2); ctx.moveTo(186, 80 + i * 26); ctx.lineTo(186, 62 + i * 26); ctx.lineTo(196, 66 + i * 26); ctx.stroke(); }
}
function drawPuente(ctx) {
  sketchStyle(ctx);
  ctx.beginPath(); ctx.moveTo(30, 230); ctx.lineTo(330, 230); ctx.stroke();
  for (let i = 0; i < 5; i++) { const x = 60 + i * 60; ctx.beginPath(); ctx.arc(x, 300, 26, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 30, 230); ctx.lineTo(x - 30, 300); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(330, 230); ctx.lineTo(330, 300); ctx.stroke();
  ctx.strokeStyle = "#1b6ca8"; ctx.lineWidth = 2;
  for (let r = 0; r < 3; r++) { ctx.beginPath(); for (let x = 30; x <= 330; x += 10) ctx.lineTo(x, 315 + r * 9 + Math.sin(x / 9) * 3); ctx.stroke(); }
  // león de piedra
  sketchStyle(ctx);
  ctx.beginPath(); ctx.arc(180, 175, 22, 0, Math.PI * 2); ctx.stroke();
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(180 + Math.cos(a) * 22, 175 + Math.sin(a) * 22); ctx.lineTo(180 + Math.cos(a) * 32, 175 + Math.sin(a) * 32); ctx.stroke(); }
  ctx.strokeRect(160, 200, 40, 30);
}
function drawViva(ctx) {
  ctx.save(); ctx.globalAlpha = 0.55;
  ctx.fillStyle = ARAGON_YELLOW; ctx.fillRect(60, 70, 240, 160);
  ctx.fillStyle = ARAGON_RED; for (let i = 0; i < 4; i++) ctx.fillRect(60, 70 + 18 + i * 36, 240, 16);
  ctx.restore();
  sketchStyle(ctx); ctx.strokeRect(60, 70, 240, 160);
  ctx.beginPath(); ctx.moveTo(60, 70); ctx.lineTo(60, 340); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = "bold 28px 'Bebas Neue', Impact, sans-serif"; ctx.textAlign = "center";
  ctx.fillText("¡VIVA EL PILAR!", 190, 290);
}
const SCENE_DRAW = [drawPilar, drawCachirulo, drawBaturro, drawOfrenda, drawCabezudo, drawFuegos, drawJota, drawPuente, drawViva];

/* ---------- escenario, obstáculos, cesto y bola ---------- */
function drawBox(ctx, b, pose) {
  ctx.save(); ctx.translate(pose.cx, pose.cy); ctx.rotate(pose.ang);
  ctx.fillStyle = b.color || "#FFD60A";
  ctx.fillRect(-b.hw, -b.hh, b.hw * 2, b.hh * 2);
  ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.fillRect(-b.hw, -b.hh, b.hw * 2, Math.min(5, b.hh));
  ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(-b.hw, b.hh - Math.min(4, b.hh), b.hw * 2, Math.min(4, b.hh));
  ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.2; ctx.strokeRect(-b.hw, -b.hh, b.hw * 2, b.hh * 2);
  if (b.kind === "block" && b.hw > 10 && b.hh > 10) cachiruloMini(ctx);
  ctx.restore();
}
function cachiruloMini(ctx) {
  ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(6, -3); ctx.lineTo(0, 5); ctx.closePath(); ctx.stroke(); ctx.restore();
}
function drawJar(ctx, jar) {
  const x0 = jar.x - JAR_W / 2, y0 = jar.y - JAR_H;
  // cesto de mimbre
  ctx.fillStyle = "#C98B4B"; ctx.fillRect(x0, y0, JAR_W, JAR_H);
  ctx.strokeStyle = "#7a4b1e"; ctx.lineWidth = 1.4;
  for (let yy = y0 + 8; yy < jar.y; yy += 8) { ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + JAR_W, yy); ctx.stroke(); }
  for (let xx = x0 + 6; xx < x0 + JAR_W; xx += 9) { ctx.beginPath(); ctx.moveTo(xx, y0); ctx.lineTo(xx, jar.y); ctx.stroke(); }
  // hueco interior (oscuro) para que se lea que es un recipiente
  ctx.fillStyle = "rgba(60,30,10,0.55)"; ctx.fillRect(x0 + 7, y0, JAR_W - 14, 10);
  ctx.strokeStyle = "#5a3412"; ctx.lineWidth = 2.5; ctx.strokeRect(x0, y0, JAR_W, JAR_H);
  // flores en el borde
  const cols = ["#ff5d8f", "#e63946", "#f8f9fa", "#ff9f1c"];
  [x0 + 4, x0 + JAR_W - 4].forEach((fx, i) => { flower(ctx, fx, y0 - 2, 3.5, cols[i]); flower(ctx, fx + (i ? -7 : 7), y0 - 6, 3, cols[i + 2]); });
  // cinta de Aragón
  ctx.fillStyle = ARAGON_YELLOW; ctx.fillRect(x0, y0 + JAR_H * 0.55, JAR_W, 9);
  ctx.fillStyle = ARAGON_RED; ctx.fillRect(x0, y0 + JAR_H * 0.55 + 2, JAR_W, 2); ctx.fillRect(x0, y0 + JAR_H * 0.55 + 6, JAR_W, 2);
}
function drawBall(ctx, x, y, rot) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.ellipse(0, FLOOR - y + 2, BALL_R * 1.1, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(rot);
  const g = ctx.createRadialGradient(-4, -4, 2, 0, 0, BALL_R);
  g.addColorStop(0, "#ffb15c"); g.addColorStop(1, "#e2620d");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#3b1d06"; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-BALL_R, 0); ctx.lineTo(BALL_R, 0); ctx.moveTo(0, -BALL_R); ctx.lineTo(0, BALL_R); ctx.stroke();
  ctx.beginPath(); ctx.arc(-BALL_R * 1.25, 0, BALL_R * 0.9, -0.9, 0.9); ctx.stroke();
  ctx.beginPath(); ctx.arc(BALL_R * 1.25, 0, BALL_R * 0.9, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
  ctx.restore();
}
function drawStage(ctx, scene, t) {
  ctx.fillStyle = SCENES[scene].bg; ctx.fillRect(0, 0, W, H);
  // textura de tela
  ctx.save(); ctx.globalAlpha = 0.06; ctx.fillStyle = "#000";
  for (let y = 0; y < FLOOR; y += 4) ctx.fillRect(0, y, W, 1);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = 0.9; SCENE_DRAW[scene](ctx, t); ctx.restore();
  // cristal lateral (la caja de Tigerball)
  ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(0, 0, 14, FLOOR); ctx.fillRect(W - 14, 0, 14, FLOOR);
  ctx.strokeStyle = "rgba(0,0,0,0.12)"; ctx.lineWidth = 1; ctx.strokeRect(14, 0, W - 28, FLOOR);
  // suelo de madera
  const g = ctx.createLinearGradient(0, FLOOR, 0, H);
  g.addColorStop(0, "#F59E2B"); g.addColorStop(0.35, "#E07B14"); g.addColorStop(1, "#8A4A10");
  ctx.fillStyle = g; ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(0, FLOOR, W, 2);
}

/* ---------- componente ---------- */
export default function PilarGame({ me, leagueId, onClose, submitScore, loadRanking, isAdmin }) {
  const [tab, setTab] = useState("jugar");
  const [phase, setPhase] = useState("menu"); // menu | playing | over
  const [hud, setHud] = useState({ lives: START_LIVES, score: 0, rockets: 0, level: 1 });
  const [toast, setToast] = useState(null);
  const [myBest, setMyBest] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [submitMsg, setSubmitMsg] = useState("");
  const [now, setNow] = useState(Date.now());
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const G = useRef(null); // estado del juego (fuera de React para ir fluido)
  const ended = now > PILAR_ENDS_AT;

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const refreshRanking = useCallback(async () => {
    const rows = await loadRanking();
    if (Array.isArray(rows)) {
      setRanking(rows);
      const mine = rows.find((r) => r.user_name === me);
      setMyBest(mine ? mine.best : 0);
    }
  }, [loadRanking, me]);
  useEffect(() => { refreshRanking(); }, [refreshRanking]);

  const flash = (text, color) => { setToast({ text, color, k: Math.random() }); setTimeout(() => setToast(null), 900); };

  const loadLevel = (g, n) => {
    g.level = getLevel(n); g.levelNo = n;
    g.ball = { x: g.level.start.x, y: g.level.start.y, vx: 0, vy: 0, rot: 0 };
    g.state = "aim"; g.flight = 0; g.still = 0; g.trail = []; g.drag = null;
  };

  const startGame = () => {
    const g = { t: 0, lives: START_LIVES, score: 0, rockets: 0, acc: 0, last: performance.now() };
    loadLevel(g, 1);
    G.current = g;
    if (typeof window !== "undefined" && window.__PILAR_DEBUG) window.__pilar = { g, loadLevel };
    setHud({ lives: g.lives, score: 0, rockets: 0, level: 1 });
    setSubmitMsg("");
    setPhase("playing");
  };

  const finishGame = async (g) => {
    g.state = "over";
    setPhase("over");
    if (ended) { setSubmitMsg("El evento ya ha terminado: esta partida no cuenta."); return; }
    setSubmitMsg("Guardando…");
    const res = await submitScore(g.score);
    if (res?.error) setSubmitMsg(res.error);
    else { setSubmitMsg(""); if (res && typeof res.best === "number") setMyBest(res.best); }
    refreshRanking();
  };

  const levelDone = (g, viaRocket = false) => {
    g.score += 1;
    if (g.score % 5 === 0) g.rockets = Math.min(MAX_ROCKETS, g.rockets + 1);
    if (g.score % 10 === 0) g.lives = Math.min(START_LIVES, g.lives + 1);
    flash(viaRocket ? "¡Cohete! 🚀" : ["¡Dentro!", "¡Maño!", "¡Toma ya!", "¡Olé!"][g.score % 4], "#2fbf71");
    g.state = "pause"; g.pauseUntil = g.t + 0.7;
    g.next = () => loadLevel(g, g.levelNo + 1);
    setHud({ lives: g.lives, score: g.score, rockets: g.rockets, level: g.levelNo + 1 });
  };

  const missed = (g) => {
    g.lives -= 1;
    setHud((h) => ({ ...h, lives: g.lives }));
    if (g.lives <= 0) { flash("¡Fin!", "#e63946"); g.state = "pause"; g.pauseUntil = g.t + 0.8; g.next = () => finishGame(g); return; }
    flash("¡Uy!", "#e63946");
    g.state = "pause"; g.pauseUntil = g.t + 0.6;
    g.next = () => { g.ball = { x: g.level.start.x, y: g.level.start.y, vx: 0, vy: 0, rot: 0 }; g.state = "aim"; g.trail = []; };
  };

  const skipWithRocket = () => {
    const g = G.current;
    if (!g || g.state !== "aim" || g.rockets <= 0) return;
    g.rockets -= 1;
    levelDone(g, true);
  };

  // bucle de juego + dibujo
  useEffect(() => {
    if (tab !== "jugar") return;
    let raf;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const resize = () => {
      const wrap = wrapRef.current; if (!wrap) return;
      const cssW = Math.min(wrap.clientWidth, 480);
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = cssW + "px"; canvas.style.height = (cssW * H) / W + "px";
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round((cssW * H / W) * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    let menuT = 0;
    const loop = (ts) => {
      const g = G.current;
      const scale = canvas.width / W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      if (g && phase !== "menu") {
        const real = Math.min(0.05, (ts - g.last) / 1000); g.last = ts;
        g.acc += real;
        while (g.acc >= DT) {
          g.acc -= DT; g.t += DT;
          if (g.state === "flight") {
            const inside = stepBall(g.ball, g.level, g.t);
            g.flight += DT;
            if (g.flight > 0.02) { g.trail.push([g.ball.x, g.ball.y]); if (g.trail.length > 24) g.trail.shift(); }
            if (inside) { levelDone(g); continue; }
            if (Math.hypot(g.ball.vx, g.ball.vy) < 14) g.still += DT; else g.still = 0;
            if (g.still > 0.4 || g.flight > MAX_FLIGHT) missed(g);
          } else if (g.state === "pause" && g.t >= g.pauseUntil) {
            const fn = g.next; g.next = null; g.state = "wait"; if (fn) fn();
          }
        }
        const lv = g.level;
        drawStage(ctx, lv.scene, g.t);
        for (const b of lv.bodies) drawBox(ctx, b, bodyPose(b, g.t));
        drawJar(ctx, lv.jar);
        if (g.trail.length > 1) {
          ctx.strokeStyle = "rgba(255,214,10,0.85)"; ctx.lineWidth = 3; ctx.lineCap = "round";
          ctx.beginPath(); g.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        }
        drawBall(ctx, g.ball.x, g.ball.y, g.ball.rot);
        if (g.state === "aim" && g.drag && g.drag.len > 6) {
          const { dx, dy } = g.drag;
          const { vx, vy } = launchFromDrag(dx, dy);
          const sp = Math.hypot(vx, vy), pct = sp / 1300;
          const ux = vx / sp, uy = vy / sp, L = 26 + 60 * pct;
          ctx.strokeStyle = `rgba(29,29,31,0.75)`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(g.ball.x + ux * 16, g.ball.y + uy * 16); ctx.lineTo(g.ball.x + ux * L, g.ball.y + uy * L); ctx.stroke();
          ctx.beginPath(); ctx.arc(g.ball.x, g.ball.y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); ctx.strokeStyle = pct > 0.85 ? "#e63946" : "#2fbf71"; ctx.stroke();
        }
        if (g.state === "aim" && !g.drag && g.levelNo <= 2 && g.score === 0) {
          ctx.fillStyle = "rgba(29,29,31,0.75)"; ctx.font = "600 13px system-ui, sans-serif"; ctx.textAlign = "center";
          ctx.fillText("Arrastra el dedo hacia donde quieras lanzar y suelta", W / 2, 60);
          ctx.fillText("(más largo = más fuerte)", W / 2, 78);
        }
        ctx.fillStyle = "rgba(29,29,31,0.55)"; ctx.font = "600 11px system-ui, sans-serif"; ctx.textAlign = "left";
        ctx.fillText(`Nivel ${g.levelNo} · ${SCENES[lv.scene].name}`, 20, FLOOR + 24);
      } else {
        menuT += 1 / 60;
        drawStage(ctx, Math.floor(menuT / 3) % SCENES.length, menuT);
        drawBall(ctx, W / 2, FLOOR - BALL_R, menuT);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [tab, phase]);

  const toWorld = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };
  const onDown = (e) => {
    const g = G.current; if (!g || g.state !== "aim") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toWorld(e); g.drag = { x0: p.x, y0: p.y, dx: 0, dy: 0, len: 0 };
  };
  const onMove = (e) => {
    const g = G.current; if (!g || !g.drag) return;
    const p = toWorld(e); g.drag.dx = p.x - g.drag.x0; g.drag.dy = p.y - g.drag.y0; g.drag.len = Math.hypot(g.drag.dx, g.drag.dy);
  };
  const onUp = () => {
    const g = G.current; if (!g || !g.drag) return;
    const d = g.drag; g.drag = null;
    if (g.state !== "aim" || d.len < 8) return;
    const { vx, vy } = launchFromDrag(d.dx, d.dy);
    g.ball.vx = vx; g.ball.vy = vy; g.state = "flight"; g.flight = 0; g.still = 0; g.trail = [];
  };

  const endsLabel = () => {
    const ms = PILAR_ENDS_AT - now;
    if (ms <= 0) return "Evento terminado";
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return `Termina en ${d > 0 ? `${d}d ` : ""}${h}h ${m}m`;
  };
  const fmtPrize = (p) => `${String(p).replace(".", ",")}M`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#0A0F1A" }}>
      <div style={{ height: 6, background: `repeating-linear-gradient(90deg, ${ARAGON_RED} 0 10px, ${INK} 10px 20px, #f4f1ea 20px 30px)` }} />
      <header className="px-4 pt-3 pb-2 flex items-center justify-between" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.2em", color: ARAGON_YELLOW }}>FIESTAS DEL PILAR{isAdmin && now < PILAR_ENDS_AT ? " · PRUEBAS" : ""}</div>
          <div style={{ fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: 26, color: "#fff", lineHeight: 1 }}>BOLA DEL PILAR</div>
          <div style={{ fontSize: 11, color: "rgba(168,181,199,0.85)" }}>{endsLabel()}</div>
        </div>
        <button onClick={onClose} aria-label="Cerrar" style={{ color: "#fff", fontSize: 26, lineHeight: 1, padding: 6 }}>×</button>
      </header>

      <div className="px-4 flex gap-2 mb-3">
        {[["jugar", "Jugar"], ["ranking", "Ranking y premios"]].map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); if (k === "ranking") refreshRanking(); }}
            style={{ flex: 1, padding: "8px 0", borderRadius: 10, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
              background: tab === k ? "linear-gradient(90deg,#FF8A00,#FF3D7F)" : "#141A27", color: tab === k ? "#fff" : "rgba(168,181,199,0.85)" }}>
            {l}
          </button>
        ))}
      </div>

      {tab === "jugar" && (
        <div className="px-3 pb-8 mx-auto" style={{ maxWidth: 500 }} ref={wrapRef}>
          <div className="flex items-center justify-between px-1 mb-2" style={{ color: "#fff" }}>
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 15 }}>❤️ <b>{phase === "menu" ? START_LIVES : hud.lives}</b></span>
              <button onClick={skipWithRocket} disabled={phase !== "playing" || hud.rockets <= 0}
                style={{ fontSize: 13, padding: "3px 8px", borderRadius: 999, background: hud.rockets > 0 && phase === "playing" ? "rgba(252,221,9,0.18)" : "rgba(255,255,255,0.06)", border: `1px solid ${hud.rockets > 0 && phase === "playing" ? ARAGON_YELLOW : "rgba(255,255,255,0.12)"}`, color: "#fff" }}>
                🚀 {hud.rockets} <span style={{ fontSize: 10, opacity: 0.8 }}>saltar nivel</span>
              </button>
            </div>
            <div style={{ fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: 26 }}>{phase === "menu" ? 0 : hud.score}</div>
          </div>
          <div className="relative" style={{ borderRadius: 14, overflow: "hidden", touchAction: "none", boxShadow: "0 8px 30px rgba(0,0,0,0.4)" }}>
            <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              style={{ display: "block", touchAction: "none", width: "100%" }} />
            {toast && (
              <div key={toast.k} style={{ position: "absolute", top: "30%", left: 0, right: 0, textAlign: "center", pointerEvents: "none",
                fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: 44, color: toast.color, textShadow: "0 2px 0 #fff, 0 4px 12px rgba(0,0,0,0.25)" }}>
                {toast.text}
              </div>
            )}
            {phase !== "playing" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: phase === "over" ? "rgba(10,15,26,0.62)" : "rgba(10,15,26,0.35)" }}>
                {phase === "over" && (
                  <div style={{ textAlign: "center", color: "#fff", marginBottom: 12 }}>
                    <div style={{ fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: 40, lineHeight: 1 }}>¡FIN DE LA PARTIDA!</div>
                    <div style={{ fontSize: 15, marginTop: 4 }}>Has llegado a <b>{hud.score}</b> {hud.score === 1 ? "nivel" : "niveles"}</div>
                    {submitMsg && <div style={{ fontSize: 12, marginTop: 6, color: "#ffd1d1" }}>{submitMsg}</div>}
                  </div>
                )}
                <button onClick={startGame} aria-label="Jugar"
                  style={{ width: 96, height: 96, borderRadius: "50%", border: "8px solid #149e3a", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 0, height: 0, borderTop: "22px solid transparent", borderBottom: "22px solid transparent", borderLeft: "34px solid #149e3a", marginLeft: 8 }} />
                </button>
                <div style={{ marginTop: 12, fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: 28, color: "#149e3a", textShadow: "0 1px 0 #fff" }}>
                  RÉCORD: {myBest ?? "—"}
                </div>
              </div>
            )}
          </div>
          <div className="mt-3" style={{ fontSize: 12, color: "rgba(168,181,199,0.9)", lineHeight: 1.5 }}>
            Mete la bola en el cesto de la Ofrenda. Arrastra el dedo en la dirección del tiro: cuanto más largo, más fuerte. Tienes 5 vidas; cada fallo resta una.
            Cada 5 niveles ganas un 🚀 para saltarte uno, y cada 10 recuperas una vida. Cuenta tu mejor partida: el día 12 a las 23:59 los 3 primeros de la liga se llevan
            <b style={{ color: "#fff" }}> 7,5M, 5M y 2,5M</b>.
          </div>
        </div>
      )}

      {tab === "ranking" && (
        <div className="px-4 pb-10 mx-auto" style={{ maxWidth: 500 }}>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {PILAR_PRIZES.map((p, i) => (
              <div key={i} style={{ borderRadius: 12, padding: "10px 6px", textAlign: "center", background: "#141A27", border: `1px solid ${["#FFC83D", "#C0C7D1", "#CD7F32"][i]}` }}>
                <div style={{ fontSize: 18 }}>{["🥇", "🥈", "🥉"][i]}</div>
                <div style={{ fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: 22, color: "#fff" }}>{fmtPrize(p)}</div>
              </div>
            ))}
          </div>
          {!ranking && <div style={{ color: "rgba(168,181,199,0.8)", fontSize: 13 }}>Cargando…</div>}
          {ranking && ranking.length === 0 && <div style={{ color: "rgba(168,181,199,0.8)", fontSize: 13 }}>Todavía no ha jugado nadie. ¡Estrena el ranking!</div>}
          {ranking && ranking.map((r, i) => (
            <div key={r.user_name} className="flex items-center justify-between" style={{ padding: "10px 12px", marginBottom: 6, borderRadius: 12,
              background: r.user_name === me ? "rgba(255,61,127,0.14)" : "#141A27", border: `1px solid ${r.user_name === me ? "#FF3D7F" : "rgba(255,255,255,0.08)"}` }}>
              <div className="flex items-center gap-3">
                <div style={{ width: 26, textAlign: "center", fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: 20, color: i < 3 ? ["#FFC83D", "#C0C7D1", "#CD7F32"][i] : "rgba(168,181,199,0.8)" }}>{i + 1}</div>
                <div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{r.user_name}</div>
                  <div style={{ color: "rgba(168,181,199,0.8)", fontSize: 11 }}>{r.plays} {r.plays === 1 ? "partida" : "partidas"}{i < 3 && r.best > 0 ? ` · premio ${fmtPrize(PILAR_PRIZES[i])}` : ""}</div>
                </div>
              </div>
              <div style={{ fontFamily: "'Bebas Neue', Impact, sans-serif", fontSize: 26, color: "#fff" }}>{r.best}</div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "rgba(168,181,199,0.7)", marginTop: 8 }}>
            Empate: gana quien llegó antes a esa puntuación. Los premios se suman solos a tu dinero al terminar el evento.
          </div>
        </div>
      )}
    </div>
  );
}
