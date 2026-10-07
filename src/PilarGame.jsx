import React, { useState, useEffect, useRef, useCallback } from "react";
import { W, H, FLOOR, BALL_R, DT, MAX_FLIGHT, MAX_SPEED, RIM_W, stepBall, bodyPose, launchFromDrag, levelFromData, makeLevel } from "./pilarEngine.js";
import {
  PAL, GAME_FONT, SCENES, drawBackground, drawBody, drawBodyShadow, drawHoopBack, drawHoopFront, drawBall, drawBallShadow,
  drawTrail, spawnConfetti, stepConfetti, drawConfetti, drawPopup, drawHud, drawLevelTag, drawAim,
} from "./pilarRender.js";
import LEVELS from "./pilarLevels.json";

/* =============================================================================
   BOLA DEL PILAR — pantalla del minijuego de las Fiestas del Pilar.
   ============================================================================= */

export const PILAR_EVENT = "pilar2026";
export const PILAR_ENDS_AT = new Date("2026-10-12T23:59:59+02:00").getTime();
export const PILAR_PRIZES = [7.5, 5, 2.5];
const START_LIVES = 5;
const MAX_ROCKETS = 3;
const CHEERS = ["¡CANASTA!", "¡MAÑO!", "¡TOMA YA!", "¡OLÉ!", "¡VIVA EL PILAR!"];

function getLevel(n) {
  const d = LEVELS[n - 1];
  return d ? levelFromData(d) : makeLevel(n);
}

function useGameFont() {
  useEffect(() => {
    if (document.getElementById("pilar-font")) return;
    const l = document.createElement("link");
    l.id = "pilar-font"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Lilita+One&display=swap";
    document.head.appendChild(l);
  }, []);
}

export default function PilarGame({ me, leagueId, onClose, submitScore, loadRanking, isAdmin }) {
  useGameFont();
  const [tab, setTab] = useState("jugar");
  const [phase, setPhase] = useState("menu"); // menu | playing | over
  const [hud, setHud] = useState({ lives: START_LIVES, score: 0, rockets: 0, level: 1 });
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

  const popup = (g, text, kind) => { g.popup = { text, kind, t0: g.t }; };

  const resetBall = (g) => {
    g.ball = { x: g.level.start.x, y: g.level.start.y, vx: 0, vy: 0, rot: 0 };
    g.state = "aim"; g.flight = 0; g.still = 0; g.trail = []; g.drag = null; g.squash = 0;
  };
  const loadLevel = (g, n) => {
    g.level = getLevel(n); g.levelNo = n;
    g.net = { swing: 0, stretch: 0 };
    resetBall(g);
  };

  const startGame = () => {
    const g = { t: 0, lives: START_LIVES, score: 0, rockets: 0, acc: 0, last: performance.now(), confetti: [], bump: 0 };
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

  const scored = (g, viaRocket = false) => {
    g.score += 1; g.bump = 1;
    if (g.score % 5 === 0) g.rockets = Math.min(MAX_ROCKETS, g.rockets + 1);
    if (g.score % 10 === 0) g.lives = Math.min(START_LIVES, g.lives + 1);
    popup(g, viaRocket ? "¡COHETE!" : CHEERS[(g.score - 1) % CHEERS.length], "ok");
    spawnConfetti(g.confetti, g.level.hoop.x, g.level.hoop.y - 40, viaRocket ? 30 : 45);
    g.net.swing = 1; g.net.stretch = 1;
    g.state = "celebrate"; g.until = g.t + (viaRocket ? 0.9 : 1.35);
    g.next = () => loadLevel(g, g.levelNo + 1);
    setHud({ lives: g.lives, score: g.score, rockets: g.rockets, level: g.levelNo + 1 });
  };

  const missed = (g) => {
    g.lives -= 1;
    setHud((h) => ({ ...h, lives: g.lives }));
    if (g.lives <= 0) { popup(g, "¡FIN!", "miss"); g.state = "pause"; g.until = g.t + 1.0; g.next = () => finishGame(g); return; }
    popup(g, "¡UY!", "miss");
    g.state = "pause"; g.until = g.t + 0.7;
    g.next = () => resetBall(g);
  };

  const skipWithRocket = () => {
    const g = G.current;
    if (!g || g.state !== "aim" || g.rockets <= 0) return;
    g.rockets -= 1;
    scored(g, true);
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
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      canvas.style.width = cssW + "px"; canvas.style.height = (cssW * H) / W + "px";
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round((cssW * H / W) * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    let menuT = 0, menuBall = { x: W * 0.32, y: 200, vx: 140, vy: 0, rot: 0 };
    const loop = (ts) => {
      const g = G.current;
      const scale = canvas.width / W;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingQuality = "high";
      if (g && phase !== "menu") {
        const real = Math.min(0.05, (ts - g.last) / 1000); g.last = ts;
        g.acc += real;
        while (g.acc >= DT) {
          g.acc -= DT; g.t += DT;
          const flying = g.state === "flight" || g.state === "celebrate" || (g.state === "pause" && g.ball.vx * g.ball.vx + g.ball.vy * g.ball.vy > 1);
          if (flying) {
            const wasScored = g.ball.scored;
            const hit = stepBall(g.ball, g.level, g.t);
            if (g.ball.floorHit > 260) g.squash = Math.min(0.28, g.ball.floorHit / 2600);
            g.ball.floorHit = 0;
            // al pasar por la red, la red frena un poco la bola
            const hoop = g.level.hoop;
            if (wasScored && g.ball.y > hoop.y && g.ball.y < hoop.y + 44 && Math.abs(g.ball.x - hoop.x) < RIM_W / 2) { g.ball.vx *= 0.94; if (g.ball.vy > 380) g.ball.vy *= 0.96; }
            g.flight += DT;
            if (g.flight > 0.02) { g.trail.push([g.ball.x, g.ball.y]); if (g.trail.length > 16) g.trail.shift(); }
            if (g.state === "flight") {
              if (hit) { g.ball.scored = true; scored(g); continue; }
              if (Math.hypot(g.ball.vx, g.ball.vy) < 14) g.still += DT; else g.still = 0;
              if (g.still > 0.4 || g.flight > MAX_FLIGHT) missed(g);
            }
          }
          if ((g.state === "celebrate" || g.state === "pause") && g.t >= g.until) {
            const fn = g.next; g.next = null; g.state = "wait"; if (fn) fn();
          }
          g.squash *= 0.86;
          g.net.swing *= 0.985; g.net.stretch *= 0.94;
          g.bump *= 0.9;
          stepConfetti(g.confetti, DT);
        }
        const lv = g.level;
        drawBackground(ctx, lv.scene, g.t);
        for (const b of lv.bodies) drawBodyShadow(ctx, b, bodyPose(b, g.t));
        drawHoopBack(ctx, lv, g.t, g.net);
        for (const b of lv.bodies) drawBody(ctx, b, bodyPose(b, g.t));
        drawBallShadow(ctx, g.ball.x, g.ball.y);
        drawTrail(ctx, g.trail);
        drawBall(ctx, g.ball.x, g.ball.y, g.ball.rot, g.squash);
        drawConfetti(ctx, g.confetti);
        drawHoopFront(ctx, lv, g.t, g.net);
        if (g.state === "aim" && g.drag && g.drag.len > 6) {
          const { vx, vy } = launchFromDrag(g.drag.dx, g.drag.dy);
          drawAim(ctx, g.ball.x, g.ball.y, vx, vy, MAX_SPEED);
        }
        if (g.state === "aim" && !g.drag && g.levelNo <= 2 && g.score === 0) {
          ctx.save(); ctx.font = `15px ${GAME_FONT}`; ctx.textAlign = "center"; ctx.lineJoin = "round";
          ctx.lineWidth = 5; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.fillStyle = PAL.navy;
          for (const [txt, y] of [["Arrastra el dedo hacia donde quieras lanzar", 92], ["y suelta. ¡Más largo = más fuerte!", 112]]) { ctx.strokeText(txt, W / 2, y); ctx.fillText(txt, W / 2, y); }
          ctx.restore();
        }
        if (g.popup) {
          // el texto nunca tapa la canasta: si el aro está arriba, sale abajo (y al revés)
          const hy = lv.hoop.y;
          const py = hy < 250 ? Math.min(FLOOR - 70, hy + 150) : Math.max(110, hy - 150);
          drawPopup(ctx, g.popup.text, g.t - g.popup.t0, g.popup.kind, py);
        }
        drawHud(ctx, g.lives, g.score, g.bump);
        drawLevelTag(ctx, g.levelNo, lv.scene);
      } else {
        // menú: la bola bota sola sobre el escenario
        menuT += 1 / 60;
        const sc = Math.floor(menuT / 4) % SCENES.length;
        drawBackground(ctx, sc, menuT);
        menuBall.vy += 1400 / 60; menuBall.x += menuBall.vx / 60; menuBall.y += menuBall.vy / 60; menuBall.rot += menuBall.vx / 60 / BALL_R;
        if (menuBall.y > FLOOR - BALL_R) { menuBall.y = FLOOR - BALL_R; menuBall.vy = -Math.max(620, Math.abs(menuBall.vy) * 0.8); }
        if (menuBall.x < 40 || menuBall.x > W - 40) menuBall.vx *= -1;
        drawBallShadow(ctx, menuBall.x, menuBall.y);
        drawBall(ctx, menuBall.x, menuBall.y, menuBall.rot);
        drawHud(ctx, START_LIVES, 0, 0);
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
    g.ball.vx = vx; g.ball.vy = vy; g.ball.scored = false; g.state = "flight"; g.flight = 0; g.still = 0; g.trail = []; g.popup = null;
  };

  const endsLabel = () => {
    const ms = PILAR_ENDS_AT - now;
    if (ms <= 0) return "Evento terminado";
    const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return `Termina en ${d > 0 ? `${d}d ` : ""}${h}h ${m}m`;
  };
  const fmtPrize = (p) => `${String(p).replace(".", ",")}M`;
  const title = { fontFamily: GAME_FONT, letterSpacing: "0.01em" };
  const gradText = { background: `linear-gradient(90deg, ${PAL.pink}, ${PAL.orange})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "radial-gradient(120% 60% at 50% 0%, #2B1A4A 0%, #141626 55%, #0B0D18 100%)" }}>
      <header className="px-4 pb-2 flex items-center justify-between" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.22em", color: PAL.yellow }}>FIESTAS DEL PILAR · ZARAGOZA{isAdmin ? " · PRUEBAS" : ""}</div>
          <div style={{ ...title, fontSize: 30, lineHeight: 1.05 }}><span style={gradText}>BOLA DEL PILAR</span> <span style={{ fontSize: 24 }}>🏀</span></div>
          <div style={{ fontSize: 11, color: "rgba(243,230,210,0.75)" }}>{endsLabel()}</div>
        </div>
        <button onClick={onClose} aria-label="Cerrar" style={{ color: "#fff", fontSize: 22, lineHeight: 1, width: 38, height: 38, borderRadius: 19, background: "rgba(255,255,255,0.08)" }}>✕</button>
      </header>

      <div className="px-4 flex gap-2 mb-3">
        {[["jugar", "Jugar"], ["ranking", "Ranking y premios"]].map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); if (k === "ranking") refreshRanking(); }}
            style={{ ...title, flex: 1, padding: "9px 0", borderRadius: 12, fontSize: 15,
              background: tab === k ? `linear-gradient(90deg, ${PAL.pink}, ${PAL.orange})` : "rgba(255,255,255,0.06)", color: tab === k ? "#fff" : "rgba(243,230,210,0.7)",
              boxShadow: tab === k ? "0 4px 16px rgba(255,45,117,0.35)" : "none" }}>
            {l}
          </button>
        ))}
      </div>

      {tab === "jugar" && (
        <div className="px-3 pb-8 mx-auto" style={{ maxWidth: 500 }} ref={wrapRef}>
          <div className="relative" style={{ borderRadius: 18, overflow: "hidden", touchAction: "none", boxShadow: "0 12px 40px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.08)" }}>
            <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              style={{ display: "block", touchAction: "none", width: "100%" }} />
            {phase !== "playing" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                background: phase === "over" ? "rgba(20,14,40,0.62)" : "linear-gradient(180deg, rgba(20,14,40,0.05), rgba(20,14,40,0.35))" }}>
                {phase === "menu" && (
                  <div style={{ textAlign: "center", marginBottom: 14, transform: "rotate(-4deg)" }}>
                    <div style={{ ...title, fontSize: 44, lineHeight: 0.95, ...gradText, WebkitTextStroke: "0px", filter: "drop-shadow(0 3px 0 #fff) drop-shadow(0 6px 14px rgba(0,0,0,0.35))" }}>¡VIVA<br />EL PILAR!</div>
                    <div style={{ ...title, fontSize: 18, color: PAL.orange, filter: "drop-shadow(0 2px 0 #fff)" }}>ZARAGOZA · FIESTAS DEL PILAR</div>
                  </div>
                )}
                {phase === "over" && (
                  <div style={{ textAlign: "center", color: "#fff", marginBottom: 14 }}>
                    <div style={{ ...title, fontSize: 40, lineHeight: 1 }}>¡FIN DE LA PARTIDA!</div>
                    <div style={{ fontSize: 15, marginTop: 6 }}>Has encestado <b style={{ ...title, fontSize: 22, color: PAL.yellow }}>{hud.score}</b> {hud.score === 1 ? "canasta" : "canastas"}</div>
                    {submitMsg && <div style={{ fontSize: 12, marginTop: 6, color: "#ffd1d1" }}>{submitMsg}</div>}
                  </div>
                )}
                <button onClick={startGame} aria-label="Jugar"
                  style={{ width: 96, height: 96, borderRadius: "50%", background: `linear-gradient(135deg, ${PAL.pink}, ${PAL.orange})`, boxShadow: "0 8px 24px rgba(255,45,117,0.5), inset 0 3px 0 rgba(255,255,255,0.35)", border: "4px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 0, height: 0, borderTop: "20px solid transparent", borderBottom: "20px solid transparent", borderLeft: "32px solid #fff", marginLeft: 8 }} />
                </button>
                <div style={{ ...title, marginTop: 12, fontSize: 24, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.45)" }}>
                  {phase === "over" ? "JUGAR OTRA" : "JUGAR"} · RÉCORD {myBest ?? "—"}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-3">
            <button onClick={skipWithRocket} disabled={phase !== "playing" || hud.rockets <= 0}
              style={{ ...title, fontSize: 15, padding: "8px 14px", borderRadius: 999, color: "#fff",
                background: hud.rockets > 0 && phase === "playing" ? `linear-gradient(90deg, ${PAL.purple}, ${PAL.pink})` : "rgba(255,255,255,0.06)",
                opacity: hud.rockets > 0 && phase === "playing" ? 1 : 0.6 }}>
              🚀 Saltar nivel · {hud.rockets}
            </button>
            <div style={{ ...title, fontSize: 15, color: "rgba(243,230,210,0.85)" }}>Nivel {phase === "menu" ? 1 : hud.level}</div>
          </div>
          <div className="mt-3" style={{ fontSize: 12, color: "rgba(243,230,210,0.75)", lineHeight: 1.5 }}>
            Encesta en la canasta. Arrastra el dedo en la dirección del tiro: cuanto más largo, más fuerte. Tienes 5 vidas; cada fallo resta una.
            Cada 5 canastas ganas un 🚀 para saltarte un nivel, y cada 10 recuperas una vida. Cuenta tu mejor partida: el día 12 a las 23:59 los 3 primeros de la liga se llevan
            <b style={{ color: "#fff" }}> 7,5M, 5M y 2,5M</b>.
          </div>
        </div>
      )}

      {tab === "ranking" && (
        <div className="px-4 pb-10 mx-auto" style={{ maxWidth: 500 }}>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {PILAR_PRIZES.map((p, i) => (
              <div key={i} style={{ borderRadius: 14, padding: "10px 6px", textAlign: "center", background: "rgba(255,255,255,0.05)", border: `1.5px solid ${["#FFC63D", "#C0C7D1", "#CD7F32"][i]}` }}>
                <div style={{ fontSize: 20 }}>{["🥇", "🥈", "🥉"][i]}</div>
                <div style={{ ...title, fontSize: 24, color: "#fff" }}>{fmtPrize(p)}</div>
              </div>
            ))}
          </div>
          {!ranking && <div style={{ color: "rgba(243,230,210,0.7)", fontSize: 13 }}>Cargando…</div>}
          {ranking && ranking.length === 0 && <div style={{ color: "rgba(243,230,210,0.7)", fontSize: 13 }}>Todavía no ha jugado nadie. ¡Estrena el ranking!</div>}
          {ranking && ranking.map((r, i) => (
            <div key={r.user_name} className="flex items-center justify-between" style={{ padding: "10px 12px", marginBottom: 6, borderRadius: 14,
              background: r.user_name === me ? "rgba(255,45,117,0.16)" : "rgba(255,255,255,0.05)", border: `1px solid ${r.user_name === me ? PAL.pink : "rgba(255,255,255,0.08)"}` }}>
              <div className="flex items-center gap-3">
                <div style={{ ...title, width: 26, textAlign: "center", fontSize: 22, color: i < 3 ? ["#FFC63D", "#C0C7D1", "#CD7F32"][i] : "rgba(243,230,210,0.6)" }}>{i + 1}</div>
                <div>
                  <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{r.user_name}</div>
                  <div style={{ color: "rgba(243,230,210,0.65)", fontSize: 11 }}>{r.plays} {r.plays === 1 ? "partida" : "partidas"}{i < 3 && r.best > 0 ? ` · premio ${fmtPrize(PILAR_PRIZES[i])}` : ""}</div>
                </div>
              </div>
              <div style={{ ...title, fontSize: 28, color: "#fff" }}>{r.best}</div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "rgba(243,230,210,0.6)", marginTop: 8 }}>
            Empate: gana quien llegó antes a esa puntuación. Los premios se suman solos a tu dinero al terminar el evento.
          </div>
        </div>
      )}
    </div>
  );
}
