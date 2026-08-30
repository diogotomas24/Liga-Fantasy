import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Trophy, Users, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Plus, Trash2,
  Check, Loader2, RefreshCw, TrendingUp, TrendingDown, Minus, Star, Clock,
  ShieldCheck, ShieldAlert, Gavel, Wallet, Menu, Coins, Pencil, X, Lock,
  ImageOff, CircleCheck, CircleX, CircleDot, Search, FileSpreadsheet, Upload,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";

/* =============================================================================
   IDENTIDAD VISUAL
   Azul marino (estructura/fondos) · Blanco (contraste/tarjetas) · Azul bebé (acción)
   ========================================================================== */
const C = {
  navy900: "#081226",
  navy800: "#0E2140",
  navy700: "#16305A",
  navy600: "#1E3E70",
  line: "rgba(255,255,255,0.10)",
  lineSoft: "rgba(255,255,255,0.06)",
  white: "#FFFFFF",
  ink: "#0B1B33",
  muted: "rgba(255,255,255,0.56)",
  mutedInk: "rgba(11,27,51,0.55)",
  baby: "#5AC0F2",
  babyDark: "#2E9BD8",
  babySoft: "rgba(90,192,242,0.14)",
  gold: "#D9A93B",
  positive: "#3FCE8E",
  negative: "#FF7A85",
};

/* =============================================================================
   DOMINIO
   ========================================================================== */
const BUDGET_TOTAL = 100; // millones (créditos Fantasy)
const MARKET_ASSET_COUNT = 6;
const MAX_COACHES = 1;
const MAX_SQUAD_JUGADORAS = 11; // plantilla máxima; solo 5 titulares + 3 banquillo son alineables
const INITIAL_SQUAD_VALUE_RANGE = { min: 90, max: 100 }; // valor de equipo del reparto inicial, aparte del presupuesto de mercado

const POSITIONS = [
  { key: "BASE", label: "Base", short: "B", fill: C.baby, textOn: C.ink },
  { key: "ALERO", label: "Alero", short: "A", fill: C.navy600, textOn: C.white },
  { key: "PIVOT", label: "Pívot", short: "P", fill: C.white, textOn: C.ink },
];
const COACH_POS = { key: "DT", label: "Entrenadora/or", short: "DT", fill: C.gold, textOn: C.ink };
const ALL_POSITIONS = [...POSITIONS, COACH_POS];
const POS_BY_KEY = Object.fromEntries(ALL_POSITIONS.map(p => [p.key, p]));

// Las 3 formaciones reparten siempre 5 jugadoras titulares (baloncesto = quinteto)
const FORMATIONS = {
  "2-2-1": { BASE: 2, ALERO: 2, PIVOT: 1 },
  "1-3-1": { BASE: 1, ALERO: 3, PIVOT: 1 },
  "1-2-2": { BASE: 1, ALERO: 2, PIVOT: 2 },
};
const BENCH_CAP_PER_POS = 1; // banquillo: máx. 1 base + 1 alero + 1 pívot

const DEFAULT_MARKET_CONFIG = { openHour: "08:00", closeHour: "20:00" };

/* =============================================================================
   HELPERS PUROS
   ========================================================================== */
const slug = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
// Multiplicador aleatorio e independiente por jugadora para la cláusula inicial (entre 1,45 y 1,66)
const randomClauseMultiplier = () => 1.45 + Math.random() * (1.66 - 1.45);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Interpreta las filas de un Excel de jugadoras/DT (ver plantilla). Columnas esperadas:
// Tipo, Nombre, Equipo, Posición, Valor (M), Foto (URL). Devuelve las filas válidas y
// un listado de errores legibles (fila a fila) para las que no se pudieron interpretar.
function parsePlayerRows(json) {
  const rows = [];
  const errors = [];
  json.forEach((row, i) => {
    const excelRow = i + 2; // fila 1 = cabecera
    const get = (...keys) => { for (const k of keys) if (row[k] !== undefined && row[k] !== null) return String(row[k]).trim(); return ""; };
    const tipoRaw = get("Tipo", "tipo").toLowerCase();
    const isCoach = tipoRaw.startsWith("entren") || tipoRaw === "dt";
    const isPlayer = tipoRaw.startsWith("jugad");
    const name = get("Nombre", "nombre");
    const team = get("Equipo", "equipo");
    const posRaw = get("Posición", "Posicion", "posición", "posicion").toLowerCase();
    const valorRaw = get("Valor (M)", "Valor", "valor (m)", "valor");
    const photo = get("Foto (URL)", "Foto", "foto (url)", "foto");
    if (!name || !team) { errors.push(`Fila ${excelRow}: falta el nombre o el equipo.`); return; }
    if (!isCoach && !isPlayer) { errors.push(`Fila ${excelRow}: la columna "Tipo" debe ser "Jugadora" o "Entrenador".`); return; }
    let position = "DT";
    if (isPlayer) {
      if (posRaw.startsWith("base")) position = "BASE";
      else if (posRaw.startsWith("aler")) position = "ALERO";
      else if (posRaw.startsWith("piv") || posRaw.startsWith("pív")) position = "PIVOT";
      else { errors.push(`Fila ${excelRow}: posición "${posRaw || "(vacía)"}" no reconocida (usa Base, Alero o Pívot).`); return; }
    }
    const basePrice = Math.max(1, Math.round(Number(String(valorRaw).replace(",", ".")) || 1));
    rows.push({ name, team, position, basePrice, photo });
  });
  return { rows, errors };
}

function fmtCredits(n) {
  const v = Math.round((n || 0) * 100) / 100;
  return `${v.toLocaleString("es-ES")} M`;
}

function fmtHMS(ms) {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

// Sistema de puntuación Fantasy "Puntos SWISH": reglas comunes a las tres
// posiciones (minutos, puntos, asistencias, tiros libres fallados, faltas) y
// reglas que cambian según sea base, alero o pívot (triples, rebotes,
// pérdidas, tapones). Los rebotes puntuables son SIEMPRE los rebotes totales
// (ofensivos + defensivos). La lógica vive aquí, separada de la interfaz,
// para poder ajustar las reglas sin tocar ninguna pantalla.
function calcSwishPoints(stats, position) {
  const s = stats || {};
  const isPivot = position === "PIVOT";
  const minutos = s.minutos || 0;
  const puntos = s.puntos || 0;
  const asist = s.asist || 0;
  const tlibre = s.tlibre || 0;                       // tiros libres FALLADOS
  const t3 = s.t3 || 0;                                // triples anotados
  const rebotes = (s.rebofen || 0) + (s.rebdefe || 0);  // rebotes totales
  const pd = s.pd || 0;                                 // pérdidas
  const tap = s.tap || 0;                               // tapones
  const faltas = s.faltas || 0;
  const valoracion = s.valoracion || 0;

  const pf = {
    minutos: minutos >= 20 ? 2 : 1, // regla literal: <20 = +1 (incluidos 0 minutos), ≥20 = +2
    puntos: Math.floor(puntos / 4),
    asist: Math.floor(asist / 2),
    tlibre: -Math.floor(tlibre / 2),
    t3: isPivot ? t3 * 2 : t3 * 1,
    rebotes: isPivot ? Math.floor(rebotes / 3) : Math.floor(rebotes / 2),
    pd: isPivot ? -Math.floor(pd / 3) : -Math.floor(pd / 2),
    tap: isPivot ? Math.floor(tap / 2) : tap,
    faltas: faltas >= 5 ? -3 : -Math.floor(faltas / 3),
    valoracion: valoracion <= 5 ? 1 : valoracion <= 10 ? 2 : valoracion <= 15 ? 3 : 4,
  };

  const breakdown = [
    { key: "minutos", label: "Minutos jugados", cantidad: minutos, pts: pf.minutos },
    { key: "puntos", label: "Puntos anotados", cantidad: puntos, pts: pf.puntos },
    { key: "asist", label: "Asistencias", cantidad: asist, pts: pf.asist },
    { key: "tlibre", label: "Tiros libres fallados", cantidad: tlibre, pts: pf.tlibre },
    { key: "t3", label: "Triples anotados", cantidad: t3, pts: pf.t3 },
    { key: "rebotes", label: "Rebotes totales", cantidad: rebotes, pts: pf.rebotes },
    { key: "pd", label: "Pérdidas", cantidad: pd, pts: pf.pd },
    { key: "tap", label: "Tapones", cantidad: tap, pts: pf.tap },
    { key: "faltas", label: "Faltas", cantidad: faltas, pts: pf.faltas },
    { key: "valoracion", label: "Puntos SWISH", cantidad: valoracion, pts: pf.valoracion },
  ];
  return { breakdown, total: breakdown.reduce((sum, b) => sum + b.pts, 0) };
}

// Desglose de la puntuación de entrenadoras/es (regla sin cambios: no forma
// parte del nuevo sistema Puntos SWISH, que solo afecta a jugadoras).
function calcCoachPoints(stats) {
  const s = stats || {};
  const breakdown = [
    { key: "jugo", label: "Partido jugado", cantidad: s.jugo ? "Sí" : "No", pts: s.jugo ? 2 : 0 },
    { key: "victoria", label: "Victoria", cantidad: s.victoria ? "Sí" : "No", pts: s.victoria ? 8 : 0 },
    { key: "diferencia", label: "Diferencia de puntos", cantidad: s.diferencia || 0, pts: Math.round((s.diferencia || 0) / 3) },
    { key: "mvp", label: "MVP del partido", cantidad: s.mvp ? "Sí" : "No", pts: s.mvp ? 3 : 0 },
  ];
  return { breakdown, total: breakdown.reduce((sum, b) => sum + b.pts, 0) };
}

// Punto de entrada único: desglose completo de una jugadora/entrenadora en
// una jornada, eligiendo el sistema de puntuación según su posición.
function calcPointsBreakdown(stats, position) {
  return position === "DT" ? calcCoachPoints(stats) : calcSwishPoints(stats, position);
}

function calcPlayerPoints(stats, position) {
  if (!stats) return 0;
  return calcPointsBreakdown(stats, position).total;
}


function computeTeamJornadaPoints(jornada, teamName, currentLineup, players) {
  const lineup = (jornada.lineups && jornada.lineups[teamName]) || currentLineup;
  if (!lineup) return 0;
  const ids = [...(lineup.starters || [])];
  if (lineup.titularCoach) ids.push(lineup.titularCoach);
  return ids.reduce((s, id) => {
    const player = players.find(p => p.id === id);
    if (!player) return s;
    const pts = calcPlayerPoints(jornada.stats?.[id], player.position);
    return s + (id === lineup.captainId ? pts * 2 : pts); // la capitana duplica sus puntos
  }, 0);
}

// Aplica el movimiento de valor de mercado (Valor Fantasy) tras cerrar una jornada
function applyMarketMovement(players, jornada, teams) {
  const totalManagers = Math.max(Object.keys(teams).length, 1);
  const ownersCount = {};
  Object.values(teams).forEach(t => (t.squad || []).forEach(e => {
    ownersCount[e.id] = (ownersCount[e.id] || 0) + 1;
  }));
  return players.map(p => {
    const stats = jornada.stats?.[p.id];
    if (!stats) return p;
    const pts = calcPlayerPoints(stats, p.position);
    const performanceDelta = Math.round(pts / 6);
    const ratio = (ownersCount[p.id] || 0) / totalManagers;
    let demandDelta = 0;
    if (ratio >= 0.66) demandDelta = 1;
    else if (ratio === 0) demandDelta = -1;
    const newValue = Math.min(40, Math.max(1, (p.basePrice || 1) + performanceDelta + demandDelta));
    // Guardamos un snapshot del valor tras cada jornada para poder dibujar el
    // gráfico de "Valor histórico" (nos quedamos con los últimos 30).
    const history = [...(p.priceHistory || []), { jornadaId: jornada.id, label: jornada.name, value: newValue }].slice(-30);
    return { ...p, prevBasePrice: p.basePrice, basePrice: newValue, priceHistory: history };
  });
}

/* =============================================================================
   SERVICIOS (lógica de negocio separada de la UI)
   Pensados para poder moverse a un backend/BD real sin tocar los componentes.
   ========================================================================== */

// --- teamService ---------------------------------------------------------
const teamService = {
  emptyTeam() {
    return {
      budgetTotal: BUDGET_TOTAL,
      budgetSpent: 0,
      squad: [], // [{ id, pricePaid, acquiredAt }]
      // bench: banquillo explícito, máx. 1 jugadora por posición. Todo lo que no sea
      // titular ni banquillo es "reserva": se posee pero no se puede alinear.
      lineup: { formation: "2-2-1", starters: [], bench: { BASE: null, ALERO: null, PIVOT: null }, titularCoach: null, captainId: null },
    };
  },
  squadIds(team) { return (team?.squad || []).map(e => e.id); },
  squadJugadorasCount(team, players) {
    const ids = new Set(teamService.squadIds(team));
    return players.filter(p => ids.has(p.id) && p.position !== "DT").length;
  },
  hasRoomForSquad(team, players) {
    return teamService.squadJugadorasCount(team, players) < MAX_SQUAD_JUGADORAS;
  },
  hasRoomForCoach(team, players) {
    const ids = new Set(teamService.squadIds(team));
    return players.filter(p => ids.has(p.id) && p.position === "DT").length < MAX_COACHES;
  },
  addAsset(team, asset, pricePaid) {
    // Comprado en el mercado general (sin cláusula previa): la cláusula nace siendo
    // exactamente el precio final pagado, sin aplicar el multiplicador aleatorio.
    return { ...team, squad: [...(team.squad || []), { id: asset.id, pricePaid, clause: pricePaid, acquiredAt: Date.now() }], budgetSpent: (team.budgetSpent || 0) + pricePaid };
  },
  // Añade el reparto inicial a la plantilla SIN descontar presupuesto: el valor de equipo del
  // sorteo (90-100 M) es aparte de los 100 M que cada persona tiene disponibles para pujar.
  // Cada jugadora recibe su cláusula inicial: valor de mercado × multiplicador aleatorio (1,45-1,66),
  // calculada una única vez aquí y guardada; nunca se vuelve a recalcular sola.
  addInitialSquad(team, entries) {
    const squadEntries = entries.map(e => ({
      id: e.id, pricePaid: e.price, acquiredAt: Date.now(), initial: true,
      clause: Math.round(e.price * randomClauseMultiplier()),
    }));
    return { ...team, squad: [...(team.squad || []), ...squadEntries] };
  },
  // Transferencia entre plantillas (cláusula pagada a otro usuario): la jugadora entra en la
  // plantilla compradora con una cláusula nueva igual al importe pagado.
  receiveTransfer(team, asset, amountPaid) {
    return { ...team, squad: [...(team.squad || []), { id: asset.id, pricePaid: amountPaid, clause: amountPaid, acquiredAt: Date.now(), transferred: true }], budgetSpent: (team.budgetSpent || 0) + amountPaid };
  },
  // Lado vendedor de una cláusula pagada: se libera la jugadora y se abona el importe recibido
  // (baja su presupuesto gastado, es decir, sube su disponible).
  receiveSaleProceeds(team, assetId, amountReceived) {
    const released = teamService.removeAsset(team, assetId);
    return { ...released, budgetSpent: (released.budgetSpent || 0) - amountReceived };
  },
  getSquadEntry(team, assetId) { return (team?.squad || []).find(e => e.id === assetId) || null; },
  removeAsset(team, assetId) {
    const nextSquad = (team.squad || []).filter(e => e.id !== assetId);
    const bench = team.lineup?.bench ? { ...team.lineup.bench } : { BASE: null, ALERO: null, PIVOT: null };
    Object.keys(bench).forEach(k => { if (bench[k] === assetId) bench[k] = null; });
    const lineup = team.lineup ? {
      ...team.lineup,
      starters: (team.lineup.starters || []).filter(id => id !== assetId),
      bench,
      titularCoach: team.lineup.titularCoach === assetId ? null : team.lineup.titularCoach,
    } : team.lineup;
    // Liberar una jugadora es una herramienta administrativa, no una venta económica: no hay reembolso.
    return { ...team, squad: nextSquad, lineup };
  },
  // Reparto inicial automático: hasta `count` jugadoras al azar con un valor de equipo total
  // dentro del rango [range.min, range.max] (p. ej. 90-100 M). Prueba varias combinaciones
  // aleatorias y se queda con una que cumpla el rango; si no encuentra ninguna, usa la mejor aproximación.
  autoDraftSquad(freeJugadoras, range, count) {
    const { min, max } = range;
    const valid = [];
    let fallback = [];
    let fallbackTotal = -1;
    for (let attempt = 0; attempt < 80; attempt++) {
      const shuffled = shuffle(freeJugadoras);
      const picked = [];
      let total = 0;
      for (const p of shuffled) {
        if (picked.length >= count) break;
        const price = Math.max(1, p.basePrice || 1);
        if (total + price <= max) { picked.push({ id: p.id, price }); total += price; }
      }
      if (picked.length === count && total >= min && total <= max) valid.push(picked);
      if (picked.length > fallback.length || (picked.length === fallback.length && total > fallbackTotal)) {
        fallback = picked; fallbackTotal = total;
      }
    }
    if (valid.length > 0) return valid[Math.floor(Math.random() * valid.length)];
    return fallback;
  },
};


// --- auctionService --------------------------------------------------------
const auctionService = {
  activeBidsForMarket(bids, marketId) { return bids.filter(b => b.marketId === marketId && b.status === "active"); },
  bidsForAsset(bids, marketId, assetId) { return bids.filter(b => b.marketId === marketId && b.assetId === assetId); },
  userBidForAsset(bids, marketId, assetId, userId) {
    return bids.find(b => b.marketId === marketId && b.assetId === assetId && b.userId === userId && b.status === "active") || null;
  },
  committedByUser(bids, marketId, userId, excludeAssetId) {
    return bids
      .filter(b => b.marketId === marketId && b.userId === userId && b.status === "active" && b.assetId !== excludeAssetId)
      .reduce((s, b) => s + b.amount, 0);
  },
  availableBudget(team, bids, marketId, userId, excludeAssetId) {
    const committed = auctionService.committedByUser(bids, marketId, userId, excludeAssetId);
    return (team.budgetTotal || 0) - (team.budgetSpent || 0) - committed;
  },
  validateBid({ team, players, asset, amount, marketOpen, bids, marketId, userId }) {
    if (!marketOpen) return { ok: false, error: "El mercado está cerrado ahora mismo." };
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Introduce un importe válido." };
    if (amount < Math.max(1, asset.basePrice || 1)) return { ok: false, error: `La puja mínima es ${fmtCredits(asset.basePrice || 1)}.` };
    const owned = new Set(teamService.squadIds(team));
    if (owned.has(asset.id)) return { ok: false, error: "Ya la tienes en tu plantilla." };
    if (asset.position === "DT") {
      if (!teamService.hasRoomForCoach(team, players)) return { ok: false, error: "Ya tienes entrenadora/or. Libérala primero para pujar por otra." };
    } else if (!teamService.hasRoomForSquad(team, players)) {
      return { ok: false, error: `Tu plantilla ya tiene el máximo de ${MAX_SQUAD_JUGADORAS} jugadoras. Libera a alguna antes de pujar.` };
    }
    const available = auctionService.availableBudget(team, bids, marketId, userId, asset.id);
    if (amount > available) return { ok: false, error: `Presupuesto insuficiente. Disponible: ${fmtCredits(available)}.` };
    return { ok: true };
  },
  upsertBid(bids, { marketId, assetId, userId, amount }) {
    const existingIdx = bids.findIndex(b => b.marketId === marketId && b.assetId === assetId && b.userId === userId && b.status === "active");
    const now = Date.now();
    if (existingIdx >= 0) {
      const next = [...bids];
      next[existingIdx] = { ...next[existingIdx], amount, createdAt: now };
      return next;
    }
    return [...bids, { id: uid("bid"), marketId, assetId, userId, amount, createdAt: now, status: "active" }];
  },
  // Resuelve un mercado cerrado: gana la puja más alta; empate -> más antigua (createdAt)
  resolveMarket(market, bids, players, teams) {
    const nextTeams = { ...teams };
    const nextBids = [...bids];
    const results = [];
    const activityEntries = [];

    (market.assetIds || []).forEach(assetId => {
      const asset = players.find(p => p.id === assetId);
      const candidates = nextBids.filter(b => b.marketId === market.id && b.assetId === assetId && b.status === "active");
      if (!asset || candidates.length === 0) return;
      const sorted = [...candidates].sort((a, b) => (b.amount - a.amount) || (a.createdAt - b.createdAt));
      const winner = sorted[0];
      sorted.forEach(b => {
        const idx = nextBids.findIndex(x => x.id === b.id);
        if (idx >= 0) nextBids[idx] = { ...nextBids[idx], status: b.id === winner.id ? "won" : "lost" };
      });
      const team = nextTeams[winner.userId] || teamService.emptyTeam();
      nextTeams[winner.userId] = teamService.addAsset(team, asset, winner.amount);
      results.push({ assetId, winnerUserId: winner.userId, amount: winner.amount, bidCount: candidates.length });
      activityEntries.push({ id: uid("act"), ts: Date.now(), type: "fichaje", userId: winner.userId, assetId, amount: winner.amount });
    });

    const historyEntry = { id: market.id, closesAt: market.closesAt, opensAt: market.opensAt, results };
    return { teams: nextTeams, bids: nextBids, historyEntry, activityEntries };
  },
};

// --- clauseService -----------------------------------------------------------
// Compra de una jugadora clausulada a OTRA plantilla: a diferencia del mercado
// general (subasta con plazo y varios postores), esto es una operación directa e
// instantánea: quien iguale o supere la cláusula se lleva a la jugadora en el acto.
const clauseService = {
  validateBuyout({ buyerName, buyerTeam, sellerName, sellerTeam, players, asset, amount, bids, marketId }) {
    if (!buyerTeam || !sellerTeam) return { ok: false, error: "No se pudo leer alguna de las plantillas. Inténtalo de nuevo." };
    if (buyerName === sellerName) return { ok: false, error: "Ya es tuya." };
    const entry = teamService.getSquadEntry(sellerTeam, asset.id);
    if (!entry) return { ok: false, error: "Esta jugadora ya no pertenece a esa plantilla." };
    const clause = entry.clause || 0;
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Introduce un importe válido." };
    if (amount < clause) return { ok: false, error: `Debes igualar o superar la cláusula: ${fmtCredits(clause)}.` };
    if (asset.position === "DT") {
      if (!teamService.hasRoomForCoach(buyerTeam, players)) return { ok: false, error: "Ya tienes entrenadora/or. Libérala primero." };
    } else if (!teamService.hasRoomForSquad(buyerTeam, players)) {
      return { ok: false, error: `Tu plantilla ya tiene el máximo de ${MAX_SQUAD_JUGADORAS} jugadoras.` };
    }
    const available = auctionService.availableBudget(buyerTeam, bids || [], marketId, buyerName);
    if (amount > available) return { ok: false, error: `Presupuesto insuficiente. Disponible: ${fmtCredits(available)}.` };
    return { ok: true, clause };
  },
  execute(buyerTeam, sellerTeam, asset, amount) {
    const nextSeller = teamService.receiveSaleProceeds(sellerTeam, asset.id, amount);
    const nextBuyer = teamService.receiveTransfer(buyerTeam, asset, amount);
    return { buyerTeam: nextBuyer, sellerTeam: nextSeller };
  },
};

// --- marketService -----------------------------------------------------------
const marketService = {
  parseHM(str) {
    const [h, m] = (str || "00:00").split(":").map(Number);
    return { h: h || 0, m: m || 0 };
  },
  atHour(dateBase, hm) {
    const d = new Date(dateBase);
    d.setHours(hm.h, hm.m, 0, 0);
    return d.getTime();
  },
  // Ventana de mercado (apertura/cierre) vigente o próxima, a partir de la hora configurada
  computeWindow(config, now = Date.now()) {
    const open = marketService.parseHM(config.openHour);
    const close = marketService.parseHM(config.closeHour);
    const todayOpen = marketService.atHour(now, open);
    const todayClose = marketService.atHour(now, close);
    if (now < todayOpen) {
      const prevClose = todayOpen; // aún no ha abierto hoy
      return { opensAt: todayOpen, closesAt: todayClose, isOpen: false };
    }
    if (now >= todayOpen && now < todayClose) {
      return { opensAt: todayOpen, closesAt: todayClose, isOpen: true };
    }
    const tomorrowOpen = todayOpen + 24 * 3600 * 1000;
    const tomorrowClose = todayClose + 24 * 3600 * 1000;
    return { opensAt: tomorrowOpen, closesAt: tomorrowClose, isOpen: false };
  },
  buildAssets(players, teams, count, excludeIds = []) {
    const owned = new Set();
    Object.values(teams).forEach(t => teamService.squadIds(t).forEach(id => owned.add(id)));
    excludeIds.forEach(id => owned.add(id));
    const free = players.filter(p => !owned.has(p.id)).map(p => p.id);
    return shuffle(free).slice(0, count);
  },
};

// --- rankingService ------------------------------------------------------
const rankingService = {
  // `filterJornadaId`: null/"total" para el acumulado de toda la temporada (comportamiento
  // de siempre); o el id de una jornada concreta para ver solo los puntos de esa jornada.
  computeStandings(teams, players, jornadas, filterJornadaId = null) {
    const totalUpTo = (teamName, lineup, upToIdx) =>
      jornadas.slice(0, upToIdx).reduce((s, j) => s + computeTeamJornadaPoints(j, teamName, lineup, players), 0);
    const singleJornada = filterJornadaId ? jornadas.find(j => j.id === filterJornadaId) : null;
    const pointsFor = (teamName, lineup) => singleJornada
      ? computeTeamJornadaPoints(singleJornada, teamName, lineup, players)
      : totalUpTo(teamName, lineup, jornadas.length);
    const rows = Object.entries(teams).map(([name, t]) => {
      const squad = t.squad || [];
      const jCount = squad.filter(e => { const pl = players.find(p => p.id === e.id); return pl && pl.position !== "DT"; }).length;
      const cCount = squad.length - jCount;
      const total = pointsFor(name, t.lineup);
      const prevTotal = singleJornada ? total : totalUpTo(name, t.lineup, Math.max(0, jornadas.length - 1));
      return { name, total, prevTotal, jCount, cCount, value: (t.budgetSpent || 0) };
    }).sort((a, b) => b.total - a.total);
    // variación de posición respecto a antes de la última jornada (no aplica al ver una
    // jornada concreta suelta, ahí no mostramos flecha de variación).
    const prevOrder = [...rows].sort((a, b) => b.prevTotal - a.prevTotal).map(r => r.name);
    return rows.map((r, i) => {
      const prevRank = prevOrder.indexOf(r.name);
      const delta = singleJornada ? 0 : (prevRank === -1 ? 0 : prevRank - i);
      return { ...r, rank: i + 1, delta };
    });
  },
};

/* =============================================================================
   ALMACENAMIENTO (Supabase)
   Usamos UNA sola tabla "kv_store" (key text primary key, value jsonb) como
   almacén clave-valor genérico para todo lo COMPARTIDO por la liga (jugadoras,
   jornadas, mercado, pujas, equipos...). Así mantenemos exactamente las mismas
   funciones (readShared/writeShared/readTeam/writeTeam/readAllTeams) que ya
   usa el resto de la app, solo que ahora hablan con Supabase en vez de con el
   almacenamiento de la vista previa de artifacts.
   Lo PERSONAL (perfil del dispositivo, favoritos) todavía no tiene login real
   (eso llega en el siguiente paso), así que de momento vive en localStorage,
   solo en este navegador.
   ========================================================================== */
async function readShared(key, fallback) {
  try {
    const { data, error } = await supabase.from("kv_store").select("value").eq("key", key).maybeSingle();
    if (error) throw error;
    return data ? data.value : fallback;
  } catch { return fallback; }
}
async function writeShared(key, value) {
  try {
    const { error } = await supabase.from("kv_store").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
    return true;
  } catch { return false; }
}
async function readPersonal(key, fallback) {
  try { const raw = localStorage.getItem(`fl_personal_${key}`); return raw != null ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
async function writePersonal(key, value) {
  try { localStorage.setItem(`fl_personal_${key}`, JSON.stringify(value)); return true; }
  catch { return false; }
}

/* -----------------------------------------------------------------------
   Cada equipo vive en SU PROPIA fila ("team_<slug>") en vez de todos
   compartiendo un único blob "teams". Así, guardar una alineación, liberar
   una jugadora o resolver el mercado son lecturas/escrituras que solo tocan
   la fila del equipo afectado, y dos operaciones sobre EQUIPOS DISTINTOS
   ya no pueden pisarse la una a la otra (el read-modify-write de un cliente
   ya no puede sobrescribir el trabajo de otro cliente sobre un equipo distinto).
   ----------------------------------------------------------------------- */
const TEAM_KEY_PREFIX = "team_";
function teamKey(name) { return `${TEAM_KEY_PREFIX}${slug(name) || "x"}`; }

async function readTeam(name) {
  return await readShared(teamKey(name), null);
}
async function writeTeam(name, team) {
  // Guardamos el nombre dentro del propio registro para poder reconstruir
  // el mapa { nombre -> equipo } sin depender de un índice compartido aparte.
  return await writeShared(teamKey(name), { ...team, name });
}
// Lee TODOS los equipos, pero como una sola consulta filtrando por prefijo de
// clave, nunca como un read-modify-write sobre un blob compartido. Se usa solo
// para mostrar datos (clasificación, mercado, ids ocupados, etc.), nunca como
// base para luego escribir de vuelta un blob completo.
//
// IMPORTANTE: si algo falla, esta función devuelve `null`, NUNCA un mapa
// vacío o a medias. Un mapa vacío/parcial es indistinguible de "esta gente no
// tiene equipo" y, si alguien lo usa para decidir qué escribir (p. ej. al
// resolver el mercado), un equipo real que "faltaba" por un fallo de red se
// trataría como un equipo nuevo vacío y se perdería su plantilla y su
// presupuesto gastado. Devolver `null` obliga a quien llama a tratarlo como
// "inténtalo en el siguiente ciclo", no como "no había nada".
async function readAllTeams() {
  try {
    const { data, error } = await supabase.from("kv_store").select("key,value").like("key", `${TEAM_KEY_PREFIX}%`);
    if (error) throw error;
    const map = {};
    (data || []).forEach((row) => {
      const t = row.value;
      const name = t?.name || row.key.slice(TEAM_KEY_PREFIX.length);
      map[name] = t;
    });
    return map;
  } catch {
    return null;
  }
}

/* =============================================================================
   ESTILOS GLOBALES
   ========================================================================== */
function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
      .fl-display { font-family: 'Oswald', sans-serif; letter-spacing: 0.01em; }
      .fl-mono { font-family: 'IBM Plex Mono', monospace; }
      .fl-body { font-family: 'Inter', sans-serif; }
      .fl-row { background: ${C.navy800}; border: 1px solid ${C.line}; border-radius: 12px; }
      .fl-row-flat { border-bottom: 1px solid ${C.lineSoft}; }
      .fl-card { background: ${C.white}; border-radius: 14px; }
      .fl-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; }
      .fl-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 4px; }
      .fl-pop { animation: fl-pop 0.22s ease-out; }
      .fl-pulse { animation: fl-pulse 1.6s ease-in-out infinite; }
      @keyframes fl-pop { from { transform: scale(0.94); opacity: 0.5; } to { transform: scale(1); opacity: 1; } }
      @keyframes fl-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
      .fl-tap { -webkit-tap-highlight-color: transparent; }
      .fl-safe-bottom { padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px)); }
      * { box-sizing: border-box; }
    `}</style>
  );
}

/* =============================================================================
   ÁTOMOS DE UI
   ========================================================================== */
function Loading() {
  return <div className="min-h-screen flex items-center justify-center" style={{ background: C.navy900 }}><Loader2 className="animate-spin" color={C.baby} size={28} /></div>;
}

function PositionBadge({ posKey, size = "sm" }) {
  const p = POS_BY_KEY[posKey] || { short: posKey, fill: C.navy600, textOn: C.white };
  const sizing = size === "sm" ? "text-[10px] w-6 h-6" : "text-xs w-7 h-7";
  return (
    <span className={`fl-mono inline-flex items-center justify-center rounded-full font-semibold ${sizing}`}
      style={{ background: p.fill, color: p.textOn, border: `1px solid ${C.line}` }} title={p.label}>
      {p.short}
    </span>
  );
}

function PlayerPhoto({ url, size = 44, rounded = 12 }) {
  return (
    <div className="flex-shrink-0 flex items-center justify-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: rounded, background: C.navy700, border: `1px solid ${C.line}` }}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <ImageOff size={size * 0.4} color={C.muted} />}
    </div>
  );
}

// Silueta genérica ("sombra") para un hueco de la alineación sin jugadora asignada.
function PlayerSilhouette({ size = 26, color }) {
  const c = color || "rgba(255,255,255,0.30)";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8.2" r="4.1" fill={c} />
      <path d="M3.6 20.4c0-4.6 3.7-7.6 8.4-7.6s8.4 3 8.4 7.6" fill={c} />
    </svg>
  );
}

// Colores estables (derivados del nombre) para los "escudos" de los equipos reales,
// ya que no tenemos imágenes de escudo: es un simple círculo con las iniciales.
const CREST_PALETTE = ["#E7554A", "#3B82F6", "#F2B84B", "#22B07D", "#A855F7", "#EC4899", "#14B8A6", "#F97316"];
function crestColorFor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CREST_PALETTE[h % CREST_PALETTE.length];
}
function TeamCrest({ name, size = 34, photo }) {
  const initials = (name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
  if (photo) {
    return (
      <div className="flex-shrink-0 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size, borderRadius: size * 0.3, background: C.navy700, border: `1px solid ${C.line}` }}>
        <img src={photo} alt="" className="w-full h-full object-contain" />
      </div>
    );
  }
  return (
    <div className="flex-shrink-0 flex items-center justify-center fl-mono font-bold"
      style={{ width: size, height: size, borderRadius: size * 0.3, background: crestColorFor(name), color: "#fff", fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

// Lista de equipos reales conocidos: los que ya tienen jugadoras fichadas en el
// álbum, más los que ya aparecen en algún partido de una jornada (aunque todavía
// no tengan ninguna jugadora dada de alta).
function realTeamsFrom(players, jornadas) {
  const set = new Set();
  (players || []).forEach(p => { if (p.team) set.add(p.team); });
  (jornadas || []).forEach(j => (j.partidos || []).forEach(m => { if (m.local) set.add(m.local); if (m.visitante) set.add(m.visitante); }));
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

// Hueco de la alineación (titular o banquillo): foto + check si hay jugadora,
// silueta ("sombra") en tono apagado si el hueco está vacío. `label` fuerza el
// texto bajo el hueco (p. ej. la posición en el banquillo); si no se indica,
// se usa el nombre de la jugadora o "Vacío".
function CourtSlot({ player, onClick, size = 54, label, isCaptain = false }) {
  const empty = !player;
  const name = player ? (player.name.length > 9 ? player.name.slice(0, 8) + "…" : player.name) : null;
  const text = label || (empty ? "Vacío" : name);
  return (
    <button onClick={onClick} disabled={!onClick} className="fl-tap flex flex-col items-center gap-1 fl-pop" style={{ width: size + 16 }}>
      <div className="relative flex items-center justify-center overflow-hidden"
        style={{
          width: size, height: size, borderRadius: size * 0.28,
          background: empty ? "rgba(255,255,255,0.05)" : C.navy700,
          border: empty ? "1.5px dashed rgba(255,255,255,0.22)" : `1.5px solid ${C.line}`,
        }}>
        {empty ? <PlayerSilhouette size={size * 0.52} />
          : (player.photo ? <img src={player.photo} alt="" className="w-full h-full object-cover" /> : <ImageOff size={size * 0.4} color={C.muted} />)}
        {!empty && (
          <span className="absolute flex items-center justify-center"
            style={{ right: -3, bottom: -3, width: 17, height: 17, borderRadius: 999, background: C.positive, border: `2px solid ${C.navy800}` }}>
            <Check size={9} color={C.navy900} strokeWidth={3.5} />
          </span>
        )}
        {!empty && isCaptain && (
          <span className="absolute flex items-center justify-center fl-mono font-bold"
            style={{ left: -3, bottom: -3, width: 17, height: 17, borderRadius: 999, background: C.gold, border: `2px solid ${C.navy800}`, color: C.ink, fontSize: 9 }}>
            C
          </span>
        )}
      </div>
      <span className="fl-mono text-[9px] px-1.5 py-0.5 rounded truncate"
        style={{ background: empty && !label ? "transparent" : C.navy900, color: empty ? C.muted : C.white, maxWidth: size + 20 }}>
        {text}
      </span>
    </button>
  );
}

// Cancha de baloncesto (media pista) dibujada en SVG: línea de fondo, tablero
// y aro, zona restringida, pintura, círculo de tiros libres y línea de 3.
function BasketballCourt() {
  const line = "rgba(255,255,255,0.24)";
  return (
    <svg viewBox="0 0 320 300" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
      {/* pintura / zona de 3 segundos */}
      <rect x="110" y="4" width="100" height="122" fill="none" stroke={line} strokeWidth="1.5" />
      {/* círculo de tiros libres */}
      <circle cx="160" cy="126" r="42" fill="none" stroke={line} strokeWidth="1.5" strokeDasharray="5 5" />
      {/* zona restringida bajo el aro */}
      <path d="M137 22 A23 23 0 0 0 183 22" fill="none" stroke={line} strokeWidth="1.5" />
      {/* línea de 3 puntos */}
      <path d="M26 4 L26 94 A138 138 0 0 0 294 94 L294 4" fill="none" stroke={line} strokeWidth="1.5" />
      {/* tablero */}
      <rect x="138" y="6" width="44" height="3.5" fill={C.gold} opacity="0.85" />
      {/* aro */}
      <circle cx="160" cy="20" r="6.5" fill="none" stroke={C.gold} strokeWidth="2.5" />
      {/* asomo del círculo central, media pista */}
      <path d="M104 300 A56 56 0 0 1 216 300" fill="none" stroke={line} strokeWidth="1.5" />
      <line x1="0" y1="300" x2="320" y2="300" stroke={line} strokeWidth="1.5" />
    </svg>
  );
}

function BidStatusPill({ status }) {
  const map = {
    none: { label: "Sin puja", color: C.muted, Icon: CircleDot },
    active: { label: "Puja activa", color: C.baby, Icon: CircleDot },
    outbid: { label: "Superada", color: C.negative, Icon: CircleX },
    won: { label: "Ganada", color: C.positive, Icon: CircleCheck },
    lost: { label: "Perdida", color: C.negative, Icon: CircleX },
  };
  const m = map[status] || map.none;
  const { Icon } = m;
  return (
    <span className="fl-mono inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ color: m.color, border: `1px solid ${m.color}55` }}>
      <Icon size={10} /> {m.label}
    </span>
  );
}

function CountdownChip({ closesAt, opensAt, isOpen }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const target = isOpen ? closesAt : opensAt;
  const remaining = target - now;
  const closing = isOpen && remaining < 5 * 60 * 1000;
  return (
    <div className="flex items-center gap-1.5 fl-mono text-xs" style={{ color: closing ? C.negative : C.baby }}>
      <Clock size={13} className={closing ? "fl-pulse" : ""} />
      <span>{isOpen ? "Cierra en" : "Abre en"} {fmtHMS(Math.max(0, remaining))}</span>
    </div>
  );
}

function EmptyState({ title, text, compact }) {
  return (
    <div className={`fl-row text-center ${compact ? "py-4 px-3" : "py-10 px-4"}`}>
      <Users size={compact ? 18 : 24} style={{ color: C.muted, margin: "0 auto 8px" }} />
      <div className="fl-display text-sm uppercase" style={{ color: C.white }}>{title}</div>
      <div className="fl-body text-xs mt-1" style={{ color: C.muted }}>{text}</div>
    </div>
  );
}

function StatChip({ label, value, accent }) {
  return (
    <div className="fl-row p-2.5 text-center">
      <div className="fl-mono text-base font-semibold" style={{ color: accent || C.white }}>{value}</div>
      <div className="fl-mono text-[9px] mt-0.5" style={{ color: C.muted }}>{label.toUpperCase()}</div>
    </div>
  );
}

function SectionTitle({ children, right }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <div className="fl-display text-sm uppercase" style={{ color: C.white }}>{children}</div>
      {right}
    </div>
  );
}

/* =============================================================================
   ONBOARDING
   ========================================================================== */
function Onboarding({ onEnter }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: C.navy900 }}>
      <GlobalStyle />
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="fl-mono text-[11px] tracking-[0.2em]" style={{ color: C.baby }}>TEMPORADA 2025/26 · GRUPO A2 · BALONCESTO</div>
          <h1 className="fl-display text-3xl uppercase mt-1" style={{ color: C.white }}>Fantasy Liga<br />Femenina Aragón</h1>
        </div>
        <div className="fl-card p-5">
          <label className="fl-body text-xs font-medium block mb-1.5" style={{ color: C.ink }}>¿Cómo te llamas en la liga?</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre o apodo"
            className="fl-body w-full rounded-md px-3 py-2 text-sm outline-none" style={{ border: "1.5px solid rgba(11,27,51,0.2)", background: C.white, color: C.ink }} maxLength={24} />
          <p className="fl-body text-[11px] mt-2" style={{ color: C.mutedInk }}>Al entrar recibirás 11 jugadoras al azar con un valor de equipo entre 90 y 100 M, y además tendrás 100 M enteros disponibles para pujar en el mercado desde el primer día. Solo podrás alinear 5 titulares y 3 en el banquillo; el resto queda en reserva. Tus pujas en el mercado son siempre privadas.</p>
          <button disabled={!name.trim() || busy} onClick={async () => { setBusy(true); await onEnter(name.trim()); }}
            className="fl-body w-full mt-3 rounded-md py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: C.baby, color: C.ink }}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : <ChevronRight size={14} />} Entrar en la liga
          </button>
        </div>
      </div>
    </div>
  );
}

/* =============================================================================
   APP PRINCIPAL
   ========================================================================== */
export default function App() {
  const [profile, setProfile] = useState(undefined);
  const [players, setPlayers] = useState([]);
  const [jornadas, setJornadas] = useState([]);
  const [teams, setTeams] = useState({});
  const [marketConfig, setMarketConfig] = useState(DEFAULT_MARKET_CONFIG);
  const [market, setMarket] = useState(null);
  const [bids, setBids] = useState([]);
  const [marketHistory, setMarketHistory] = useState([]);
  const [activity, setActivity] = useState([]);
  const [teamCrests, setTeamCrests] = useState({});
  const [favoritos, setFavoritos] = useState([]);
  const [tab, setTab] = useState("inicio");
  const [saving, setSaving] = useState(false);
  const resolvingRef = useRef(false);
  // Equipo real que el/la admin quiere abrir (p. ej. al tocar un rival en "Partidos de la
  // jornada") para ir directamente a su plantilla dentro de Admin > Equipos reales.
  const [focusRealTeam, setFocusRealTeam] = useState(null);
  const openRealTeam = useCallback((name) => { setFocusRealTeam({ name, key: Date.now() }); setTab("mas"); }, []);
  // Favoritos: se guardan por persona (no compartidos), como una simple lista de ids.
  const toggleFavorito = useCallback((playerId) => {
    setFavoritos(prev => {
      const next = prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId];
      writePersonal("favoritos", next);
      return next;
    });
  }, []);

  // Carga inicial
  useEffect(() => {
    (async () => {
      const p = await readPersonal("profile", null);
      const fav = await readPersonal("favoritos", []);
      const [pl, jo, tm, cfg, mk, bd, hist, act, crests] = await Promise.all([
        readShared("players", []), readShared("jornadas", []), readAllTeams(),
        readShared("marketConfig", null), readShared("currentMarket", null),
        readShared("bids", []), readShared("marketHistory", []), readShared("activity", []),
        readShared("teamCrests", {}),
      ]);
      setPlayers(pl); setJornadas(jo); setTeams(tm || {}); setBids(bd); setMarketHistory(hist); setActivity(act);
      setTeamCrests(crests || {});
      setFavoritos(fav || []);
      const config = cfg || DEFAULT_MARKET_CONFIG;
      setMarketConfig(config);
      if (!cfg) await writeShared("marketConfig", config);
      setMarket(mk);
      setProfile(p);
    })();
  }, []);

  // Sincroniza el mercado: resuelve la ventana cerrada y genera la siguiente.
  // Nota: esta comprobación corre en el cliente a intervalos como sustituto temporal
  // de un job programado en servidor; la resolución de la subasta y el descuento del
  // presupuesto deben ejecutarse como operación atómica en backend cuando haya BD real.
  const syncMarket = useCallback(async () => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    try {
      const [freshPlayers, freshTeamsOrNull, freshConfig, freshMarket, freshBids, freshHistory, freshActivity] = await Promise.all([
        readShared("players", []), readAllTeams(), readShared("marketConfig", DEFAULT_MARKET_CONFIG),
        readShared("currentMarket", null), readShared("bids", []), readShared("marketHistory", []), readShared("activity", []),
      ]);
      if (freshTeamsOrNull === null) {
        // No pudimos leer con garantías TODOS los equipos en este ciclo (p. ej.
        // un fallo de red pasajero). NO seguimos: ni tocamos el estado local
        // "teams", ni -sobre todo- resolvemos el mercado con datos incompletos,
        // porque eso trataría a un equipo real como si no existiera y le
        // borraría la plantilla y el presupuesto gastado. Se reintenta en el
        // siguiente ciclo (15s) sin haber cambiado nada mientras tanto.
        return;
      }
      const freshTeams = freshTeamsOrNull;
      const now = Date.now();
      const window_ = marketService.computeWindow(freshConfig, now);

      let teamsNext = freshTeams, bidsNext = freshBids, playersNext = freshPlayers, historyNext = freshHistory, activityNext = freshActivity;
      let marketNext = freshMarket;

      // Un mercado ya está resuelto si ALGUNA de sus pujas dejó de estar "active"
      // (resolveMarket las marca como "won"/"lost"). No usamos solo `market.resolved`
      // porque, al no haber un servidor único, dos dispositivos pueden detectar el
      // cierre casi a la vez; comprobar el estado real de las pujas hace que resolver
      // dos veces el mismo mercado sea un no-op en vez de sobrescribir plantillas
      // ajenas con una versión desactualizada (que es lo que hacía "desaparecer"
      // fichajes recién hechos).
      const marketAlreadyResolved = (bidsList) => bidsList.some(b => b.marketId === freshMarket?.id && b.status !== "active");
      const needsResolution = freshMarket && !freshMarket.resolved && now >= freshMarket.closesAt && !marketAlreadyResolved(freshBids);
      if (needsResolution) {
        // Segunda comprobación justo antes de escribir: si otro dispositivo ganó la
        // carrera y ya resolvió este mercado en el instante entre nuestra lectura y
        // ahora, abortamos sin tocar nada.
        const confirmBids = await readShared("bids", freshBids);
        if (!marketAlreadyResolved(confirmBids)) {
          const { teams: t2, bids: b2, historyEntry, activityEntries } = auctionService.resolveMarket(freshMarket, confirmBids, freshPlayers, freshTeams);
          teamsNext = t2; bidsNext = b2;
          historyNext = [...freshHistory, historyEntry].slice(-40);
          activityNext = [...activityEntries, ...freshActivity].slice(0, 60);
          // Solo escribimos los equipos que REALMENTE cambiaron (los que ganaron
          // alguna puja), cada uno en su propia clave. Así la resolución del
          // mercado nunca sobrescribe el equipo de alguien que no participó en
          // esta puja, ni siquiera si esa persona guardó su alineación a la vez.
          const changedTeamNames = Object.keys(teamsNext).filter((name) => teamsNext[name] !== freshTeams[name]);
          await Promise.all([
            ...changedTeamNames.map((name) => writeTeam(name, teamsNext[name])),
            writeShared("bids", bidsNext), writeShared("marketHistory", historyNext), writeShared("activity", activityNext),
          ]);
        }
      }

      const staleWindow = !marketNext || marketNext.closesAt !== window_.closesAt || needsResolution;
      if (staleWindow) {
        const assetIds = marketService.buildAssets(playersNext, teamsNext, MARKET_ASSET_COUNT);
        marketNext = { id: uid("mk"), opensAt: window_.opensAt, closesAt: window_.closesAt, assetIds, resolved: false };
        await writeShared("currentMarket", marketNext);
      }

      setPlayers(playersNext); setTeams(teamsNext); setBids(bidsNext); setMarketHistory(historyNext); setActivity(activityNext);
      setMarketConfig(freshConfig); setMarket(marketNext);
    } finally {
      resolvingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (profile === undefined) return;
    syncMarket();
    const t = setInterval(syncMarket, 15000);
    return () => clearInterval(t);
  }, [profile, syncMarket]);

  const enterLeague = useCallback(async (name) => {
    const prof = { name, isAdmin: false };
    await writePersonal("profile", prof);
    // Comprobamos si TU equipo ya existe leyendo DIRECTAMENTE su clave (una
    // sola lectura), no el listado completo de equipos: así un fallo pasajero
    // al listar/leer los equipos de otras personas nunca hace que te demos
    // por "nueva/o" y te recreemos el equipo desde cero, perdiendo tu plantilla.
    const existing = await readTeam(name);
    if (existing) {
      setTeams(t => ({ ...t, [name]: existing }));
      setProfile(prof);
      return;
    }
    const freshPlayers = await readShared("players", []);
    // Para el reparto inicial sí necesitamos ver qué jugadoras están ya
    // ocupadas por otros equipos; esto es solo lectura para no repetir
    // jugadora, así que un fallo aquí (fresh = {}) es un problema menor
    // (podría repetirse alguna jugadora en el reparto), nunca destructivo.
    const fresh = (await readAllTeams()) || {};
    {
      let team = teamService.emptyTeam();
      // Reparto inicial: hasta 11 jugadoras con un valor de equipo entre 90 y 100 M.
      // No descuenta presupuesto: los 100 M para pujar en el mercado quedan intactos y aparte.
      const ownedIds = new Set();
      Object.values(fresh).forEach(t => teamService.squadIds(t).forEach(id => ownedIds.add(id)));
      const freeJugadoras = freshPlayers.filter(p => p.position !== "DT" && !ownedIds.has(p.id));
      const draft = teamService.autoDraftSquad(freeJugadoras, INITIAL_SQUAD_VALUE_RANGE, MAX_SQUAD_JUGADORAS);
      team = teamService.addInitialSquad(team, draft);
      // Crear tu equipo solo escribe TU clave (team_<slug>); nunca toca los
      // equipos de las demás personas, así que no puede pisar su trabajo.
      await writeTeam(name, team);
      setTeams(t => ({ ...t, [name]: team }));
    }
    setProfile(prof);
  }, []);

  const toggleAdmin = useCallback(async () => {
    const next = { ...profile, isAdmin: !profile.isAdmin };
    setProfile(next);
    await writePersonal("profile", next);
  }, [profile]);

  const myTeam = profile ? (teams[profile.name] || teamService.emptyTeam()) : teamService.emptyTeam();
  const mySquadIds = useMemo(() => teamService.squadIds(myTeam), [myTeam]);
  const myPlayers = useMemo(() => mySquadIds.map(id => players.find(p => p.id === id)).filter(Boolean), [mySquadIds, players]);
  const myJugadoras = useMemo(() => myPlayers.filter(p => p.position !== "DT"), [myPlayers]);
  const myCoaches = useMemo(() => myPlayers.filter(p => p.position === "DT"), [myPlayers]);
  const budgetAvailable = profile ? auctionService.availableBudget(myTeam, bids, market?.id, profile.name) : BUDGET_TOTAL;
  const budgetCommitted = profile ? auctionService.committedByUser(bids, market?.id, profile.name) : 0;

  const ownedIds = useMemo(() => {
    const s = new Set();
    Object.values(teams).forEach(t => teamService.squadIds(t).forEach(id => s.add(id)));
    return s;
  }, [teams]);

  const isMarketOpen = market ? (Date.now() >= market.opensAt && Date.now() < market.closesAt) : false;

  const saveLineup = useCallback(async (lineup) => {
    setSaving(true);
    // Lee-modifica-escribe SOLO la clave de tu propio equipo: si el mercado
    // se resuelve (o cualquier otra persona guarda algo) al mismo tiempo,
    // esa operación vive en otra clave y no puede perderse por esta escritura.
    const fresh = await readTeam(profile.name) || teamService.emptyTeam();
    const nextTeam = { ...fresh, lineup };
    await writeTeam(profile.name, nextTeam);
    setTeams(t => ({ ...t, [profile.name]: nextTeam }));
    setSaving(false);
  }, [profile]);

  const releaseFromSquad = useCallback(async (assetId) => {
    setSaving(true);
    const fresh = await readTeam(profile.name) || teamService.emptyTeam();
    const nextTeam = teamService.removeAsset(fresh, assetId);
    await writeTeam(profile.name, nextTeam);
    setTeams(t => ({ ...t, [profile.name]: nextTeam }));
    setSaving(false);
  }, [profile]);

  const placeBid = useCallback(async (asset, amount) => {
    const freshMarket = await readShared("currentMarket", market);
    const freshBids = await readShared("bids", bids);
    const team = (await readTeam(profile.name)) || teamService.emptyTeam();
    const open = freshMarket && Date.now() >= freshMarket.opensAt && Date.now() < freshMarket.closesAt;
    const check = auctionService.validateBid({ team, players, asset, amount, marketOpen: open, bids: freshBids, marketId: freshMarket?.id, userId: profile.name });
    if (!check.ok) return check;
    const nextBids = auctionService.upsertBid(freshBids, { marketId: freshMarket.id, assetId: asset.id, userId: profile.name, amount });
    await writeShared("bids", nextBids);
    setBids(nextBids);
    return { ok: true };
  }, [market, bids, players, profile]);

  const buyClause = useCallback(async (sellerName, asset, amount) => {
    const [buyerTeam, sellerTeam] = await Promise.all([readTeam(profile.name), readTeam(sellerName)]);
    const check = clauseService.validateBuyout({
      buyerName: profile.name, buyerTeam, sellerName, sellerTeam, players, asset, amount, bids, marketId: market?.id,
    });
    if (!check.ok) return check;
    const { buyerTeam: nextBuyer, sellerTeam: nextSeller } = clauseService.execute(buyerTeam, sellerTeam, asset, amount);
    await Promise.all([writeTeam(profile.name, nextBuyer), writeTeam(sellerName, nextSeller)]);
    setTeams(t => ({ ...t, [profile.name]: nextBuyer, [sellerName]: nextSeller }));
    return { ok: true };
  }, [profile, players, bids, market]);

  const addPlayer = useCallback(async (data) => {
    const fresh = await readShared("players", []);
    const next = [...fresh, { id: uid(slug(data.name) || "player"), prevBasePrice: data.basePrice, ...data }];
    await writeShared("players", next);
    setPlayers(next);
  }, []);

  // Alta masiva (importación desde Excel): evita duplicar filas ya existentes
  // (mismo nombre + equipo + posición) para poder reimportar el mismo archivo sin problema.
  const bulkAddPlayers = useCallback(async (rows) => {
    const fresh = await readShared("players", []);
    const existingKeys = new Set(fresh.map(p => `${p.name.trim().toLowerCase()}|${p.team.trim().toLowerCase()}|${p.position}`));
    const toAdd = [];
    rows.forEach(r => {
      const key = `${r.name.trim().toLowerCase()}|${r.team.trim().toLowerCase()}|${r.position}`;
      if (existingKeys.has(key)) return;
      existingKeys.add(key);
      toAdd.push({ id: uid(slug(r.name) || "player"), name: r.name, team: r.team, position: r.position, basePrice: r.basePrice, photo: r.photo || "", prevBasePrice: r.basePrice });
    });
    if (toAdd.length > 0) {
      const next = [...fresh, ...toAdd];
      await writeShared("players", next);
      setPlayers(next);
    }
    return { added: toAdd.length, skipped: rows.length - toAdd.length };
  }, []);

  const updatePlayer = useCallback(async (id, patch) => {
    const fresh = await readShared("players", []);
    const next = fresh.map(p => p.id === id ? { ...p, ...patch } : p);
    await writeShared("players", next);
    setPlayers(next);
  }, []);

  const deletePlayer = useCallback(async (id) => {
    const fresh = await readShared("players", []);
    const next = fresh.filter(p => p.id !== id);
    await writeShared("players", next);
    setPlayers(next);
  }, []);

  const saveMarketConfig = useCallback(async (cfg) => {
    await writeShared("marketConfig", cfg);
    setMarketConfig(cfg);
    await syncMarket();
  }, [syncMarket]);

  const forceResolveMarket = useCallback(async () => {
    const freshMarket = await readShared("currentMarket", market);
    if (!freshMarket) return;
    await writeShared("currentMarket", { ...freshMarket, closesAt: Date.now() - 1000 });
    await syncMarket();
  }, [market, syncMarket]);

  const saveJornada = useCallback(async (jornada) => {
    const freshJ = await readShared("jornadas", []);
    // Solo lectura (para copiar alineaciones y calcular movimiento de mercado);
    // si falla, usamos {} en vez de bloquear — nunca escribimos "teams" aquí.
    const freshT = (await readAllTeams()) || {};
    const idx = freshJ.findIndex(j => j.id === jornada.id);
    const existing = idx >= 0 ? freshJ[idx] : null;
    const lineups = { ...(existing?.lineups || {}) };
    Object.entries(freshT).forEach(([name, t]) => { if (!lineups[name] && t.lineup) lineups[name] = t.lineup; });
    const jornadaToSave = { ...jornada, lineups };
    const nextJ = idx >= 0 ? freshJ.map(j => j.id === jornada.id ? jornadaToSave : j) : [...freshJ, jornadaToSave];
    await writeShared("jornadas", nextJ);
    setJornadas(nextJ);

    const freshP = await readShared("players", []);
    const updatedPlayers = applyMarketMovement(freshP, jornadaToSave, freshT);
    await writeShared("players", updatedPlayers);
    setPlayers(updatedPlayers);
  }, []);

  const deleteJornada = useCallback(async (id) => {
    const fresh = await readShared("jornadas", []);
    const next = fresh.filter(j => j.id !== id);
    await writeShared("jornadas", next);
    setJornadas(next);
  }, []);

  // Escudo de un equipo real: mapa { nombre de equipo -> URL de imagen }, compartido
  // para toda la liga (lo sube quien administra desde Equipos reales).
  const saveTeamCrest = useCallback(async (teamName, url) => {
    const fresh = await readShared("teamCrests", {});
    const next = { ...fresh, [teamName]: url };
    await writeShared("teamCrests", next);
    setTeamCrests(next);
  }, []);

  if (profile === undefined || !market) return <Loading />;
  if (profile === null) return <Onboarding onEnter={enterLeague} />;

  return (
    <div className="min-h-screen fl-body" style={{ background: C.navy900 }}>
      <GlobalStyle />
      <Header profile={profile} saving={saving} onToggleAdmin={toggleAdmin} />
      <main className="px-4 fl-safe-bottom" style={{ minHeight: "70vh" }}>
        <div className="pt-3">
          {tab === "inicio" && (
            <InicioTab profile={profile} teams={teams} players={players} jornadas={jornadas}
              myTeam={myTeam} budgetAvailable={budgetAvailable} budgetCommitted={budgetCommitted}
              market={market} isMarketOpen={isMarketOpen} onGoTo={setTab} onOpenRealTeam={openRealTeam}
              teamCrests={teamCrests} />
          )}
          {tab === "clasificacion" && <ClasificacionTab teams={teams} players={players} jornadas={jornadas} me={profile.name} />}
          {tab === "equipo" && (
            <EquipoTab myJugadoras={myJugadoras} myCoaches={myCoaches} myTeam={myTeam}
              budgetAvailable={budgetAvailable} budgetCommitted={budgetCommitted}
              jornadas={jornadas} players={players} teamName={profile.name} isAdmin={profile.isAdmin}
              favoritos={favoritos} onToggleFavorite={toggleFavorito}
              onSaveLineup={saveLineup} onRelease={releaseFromSquad} />
          )}
          {tab === "mercado" && (
            <MercadoTab market={market} players={players} bids={bids} marketHistory={marketHistory}
              profile={profile} myTeam={myTeam} teams={teams} isMarketOpen={isMarketOpen}
              budgetAvailable={budgetAvailable} onBid={placeBid} onBuyClause={buyClause}
              jornadas={jornadas} isAdmin={profile.isAdmin} onRelease={releaseFromSquad}
              favoritos={favoritos} onToggleFavorite={toggleFavorito} />
          )}
          {tab === "mas" && (
            <MasTab profile={profile} onToggleAdmin={toggleAdmin} activity={activity} teams={teams}
              players={players} jornadas={jornadas} marketConfig={marketConfig} market={market} bids={bids}
              onSaveConfig={saveMarketConfig} onForceResolve={forceResolveMarket}
              onAddPlayer={addPlayer} onUpdatePlayer={updatePlayer} onDeletePlayer={deletePlayer} onBulkAddPlayers={bulkAddPlayers}
              onSaveJornada={saveJornada} onDeleteJornada={deleteJornada}
              focusRealTeam={focusRealTeam} onConsumeFocusRealTeam={() => setFocusRealTeam(null)}
              teamCrests={teamCrests} onSaveTeamCrest={saveTeamCrest} />
          )}
        </div>
      </main>
      <BottomNav tab={tab} setTab={setTab} isAdmin={profile.isAdmin} />
    </div>
  );
}

/* =============================================================================
   NAVEGACIÓN
   ========================================================================== */
function Header({ profile, saving, onToggleAdmin }) {
  return (
    <header className="px-4 pt-5 pb-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.line}` }}>
      <div>
        <div className="fl-mono text-[10px] tracking-[0.2em]" style={{ color: C.baby }}>GRUPO A2 · ARAGÓN · BALONCESTO</div>
        <h1 className="fl-display text-xl uppercase" style={{ color: C.white }}>Fantasy Liga Femenina</h1>
        <div className="mt-0.5 fl-mono text-[11px]" style={{ color: C.muted }}>{profile.name} {saving && "· guardando…"}</div>
      </div>
      <button onClick={onToggleAdmin} className="fl-tap flex items-center justify-center w-9 h-9 rounded-full"
        style={{ background: profile.isAdmin ? C.babySoft : "transparent", border: `1px solid ${profile.isAdmin ? C.baby : C.line}` }}
        title="Solo activa esto si organizas la liga">
        <ShieldAlert size={16} color={profile.isAdmin ? C.baby : C.muted} />
      </button>
    </header>
  );
}

function BottomNav({ tab, setTab, isAdmin }) {
  const items = [
    { key: "inicio", label: "Inicio", icon: Trophy },
    { key: "clasificacion", label: "Ranking", icon: Users },
    { key: "equipo", label: "Equipo", icon: ShieldCheck },
    { key: "mercado", label: "Mercado", icon: Gavel },
    { key: "mas", label: "Más", icon: Menu },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 px-2 py-1.5 flex items-stretch justify-between"
      style={{ background: C.navy800, borderTop: `1px solid ${C.line}`, paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))" }}>
      {items.map(it => {
        const Icon = it.icon;
        const active = tab === it.key;
        return (
          <button key={it.key} onClick={() => setTab(it.key)} className="fl-tap flex-1 flex flex-col items-center gap-0.5 py-1.5">
            <Icon size={19} color={active ? C.baby : C.muted} />
            <span className="fl-mono text-[9px]" style={{ color: active ? C.baby : C.muted }}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* Icono de camiseta simple (lucide no trae "Shirt" en todas las versiones) */
function Shirt(props) {
  const { size = 16, color = "currentColor" } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3l5 3-2.5 4L17 9v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9l-1.5 1L3 6l5-3 1 2h6l1-2z" />
    </svg>
  );
}

/* =============================================================================
   INICIO
   ========================================================================== */
// Agrupa los partidos de una jornada por su campo "fecha" (texto libre que
// pone el admin), conservando el orden en que aparecen — igual que las
// cabeceras "viernes, 28 agosto" del calendario oficial.
function groupPartidosByFecha(partidos) {
  const order = [];
  const map = new Map();
  (partidos || []).forEach(m => {
    const key = m.fecha || "";
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key).push(m);
  });
  return order.map(key => ({ fecha: key, partidos: map.get(key) }));
}

// Fila de un partido: escudo+nombre a cada lado, hora/"VS" en el centro.
function PartidoRow({ m, teamCrests }) {
  return (
    <div className="px-3 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
      <div className="flex-1 flex items-center gap-2 justify-end text-right min-w-0">
        <span className="fl-body text-xs font-medium truncate" style={{ color: C.white }}>{m.local}</span>
        <TeamCrest name={m.local} photo={teamCrests?.[m.local]} size={28} />
      </div>
      <div className="flex flex-col items-center px-1 flex-shrink-0" style={{ minWidth: 52 }}>
        {m.hora
          ? <span className="fl-mono text-xs font-semibold" style={{ color: C.baby }}>{m.hora}</span>
          : <span className="fl-mono text-[10px]" style={{ color: C.muted }}>VS</span>}
      </div>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <TeamCrest name={m.visitante} photo={teamCrests?.[m.visitante]} size={28} />
        <span className="fl-body text-xs font-medium truncate" style={{ color: C.white }}>{m.visitante}</span>
      </div>
    </div>
  );
}

// Calendario completo: pantalla a pantalla completa con una jornada por pestaña
// (J1, J2…) y sus partidos agrupados por fecha, al estilo del calendario oficial.
function CalendarioModal({ jornadas, teamCrests, initialIndex, onClose }) {
  const [idx, setIdx] = useState(initialIndex ?? Math.max(jornadas.length - 1, 0));
  const jornada = jornadas[idx];
  const grouped = useMemo(() => groupPartidosByFecha(jornada?.partidos), [jornada]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex items-center justify-between px-3 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.line}` }}>
        <button onClick={onClose} className="fl-tap p-1.5 -ml-1"><ChevronLeft size={20} color={C.white} /></button>
        <span className="fl-display text-base uppercase" style={{ color: C.white }}>Calendario</span>
        <span style={{ width: 28 }} />
      </div>

      <div className="flex gap-2 px-3 py-3 overflow-x-auto fl-scrollbar flex-shrink-0" style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
        {jornadas.map((j, i) => (
          <button key={j.id} onClick={() => setIdx(i)}
            className="fl-tap flex-shrink-0 rounded-full flex items-center justify-center fl-mono text-xs font-semibold"
            style={{
              width: 42, height: 42,
              background: i === idx ? C.positive : C.navy700,
              color: i === idx ? C.navy900 : C.muted,
              border: `1px solid ${i === idx ? C.positive : C.line}`,
            }}>
            J{i + 1}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto fl-scrollbar px-3 py-4">
        {!jornada || (jornada.partidos || []).length === 0 ? (
          <EmptyState title="Sin partidos" text="Todavía no hay partidos añadidos para esta jornada." />
        ) : (
          <div className="space-y-4">
            {grouped.map((g, gi) => (
              <div key={gi}>
                {g.fecha && <div className="fl-mono text-[10px] mb-1.5 uppercase" style={{ color: C.muted }}>{g.fecha}</div>}
                <div className="fl-row divide-y" style={{ borderColor: C.lineSoft }}>
                  {g.partidos.map(m => <PartidoRow key={m.id} m={m} teamCrests={teamCrests} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InicioTab({ profile, teams, players, jornadas, myTeam, budgetAvailable, budgetCommitted, market, isMarketOpen, onGoTo, onOpenRealTeam, teamCrests }) {
  const [showCalendar, setShowCalendar] = useState(false);
  const standings = useMemo(() => rankingService.computeStandings(teams, players, jornadas), [teams, players, jornadas]);
  const myRow = standings.find(r => r.name === profile.name);
  const nextJornada = jornadas.length + 1;
  const marketAssets = (market.assetIds || []).length;
  const lastJornada = jornadas.length > 0 ? jornadas[jornadas.length - 1] : null;
  const partidos = lastJornada?.partidos || [];

  return (
    <div className="space-y-4">
      <div className="fl-row p-4" style={{ background: `linear-gradient(135deg, ${C.navy700}, ${C.navy800})` }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="fl-mono text-[10px] tracking-[0.15em]" style={{ color: C.baby }}>TU LIGA</div>
            <div className="fl-display text-lg uppercase" style={{ color: C.white }}>{profile.name}</div>
          </div>
          <div className="text-right">
            <div className="fl-mono text-2xl font-semibold" style={{ color: C.baby }}>{myRow ? `#${myRow.rank}` : "—"}</div>
            <div className="fl-mono text-[9px]" style={{ color: C.muted }}>POSICIÓN</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatChip label="Disponible" value={fmtCredits(budgetAvailable)} accent={C.baby} />
        <StatChip label="Comprometido" value={fmtCredits(budgetCommitted)} accent={C.white} />
        <StatChip label="Puntos" value={myRow?.total ?? 0} accent={C.positive} />
      </div>

      <button onClick={() => onGoTo("mercado")} className="fl-tap w-full fl-row p-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Gavel size={18} color={C.baby} />
          <div className="text-left">
            <div className="fl-body text-sm font-medium" style={{ color: C.white }}>Mercado de subastas</div>
            <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{marketAssets} activos en juego</div>
          </div>
        </div>
        <div className="text-right flex items-center gap-2">
          <CountdownChip closesAt={market.closesAt} opensAt={market.opensAt} isOpen={isMarketOpen} />
          <ChevronRight size={16} color={C.muted} />
        </div>
      </button>

      <button onClick={() => onGoTo("equipo")} className="fl-tap w-full fl-row p-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ShieldCheck size={18} color={C.baby} />
          <div className="text-left">
            <div className="fl-body text-sm font-medium" style={{ color: C.white }}>Mi equipo</div>
            <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{myTeam.squad.length} fichajes en plantilla</div>
          </div>
        </div>
        <ChevronRight size={16} color={C.muted} />
      </button>

      <div>
        <SectionTitle>Jornada {jornadas.length > 0 ? jornadas.length : nextJornada}</SectionTitle>
        {jornadas.length === 0 ? (
          <EmptyState title="Temporada por empezar" text="Cuando se registre la primera jornada verás aquí tu puntuación." />
        ) : (
          <div className="fl-row p-3.5 flex items-center justify-between">
            <span className="fl-body text-sm" style={{ color: C.white }}>{lastJornada.name}</span>
            <span className="fl-mono text-sm font-semibold" style={{ color: C.positive }}>
              +{computeTeamJornadaPoints(lastJornada, profile.name, myTeam.lineup, players)}
            </span>
          </div>
        )}
      </div>

      {partidos.length > 0 && (
        <div>
          <SectionTitle>Partidos de la jornada</SectionTitle>
          <div className="fl-row divide-y" style={{ borderColor: C.lineSoft }}>
            {partidos.map(m => (
              <div key={m.id} className="px-3.5 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                <button onClick={() => profile.isAdmin && onOpenRealTeam(m.local)} disabled={!profile.isAdmin}
                  className="fl-tap flex-1 flex flex-col items-center gap-1 text-center">
                  <TeamCrest name={m.local} photo={teamCrests?.[m.local]} />
                  <span className="fl-body text-[11px] font-medium leading-tight" style={{ color: C.white }}>{m.local}</span>
                </button>
                <div className="flex flex-col items-center px-1">
                  {(m.fecha || m.hora) ? (
                    <>
                      {m.fecha && <span className="fl-mono text-[9px]" style={{ color: C.muted }}>{m.fecha}</span>}
                      {m.hora && <span className="fl-mono text-xs font-semibold" style={{ color: C.baby }}>{m.hora}</span>}
                    </>
                  ) : <span className="fl-mono text-[10px]" style={{ color: C.muted }}>VS</span>}
                </div>
                <button onClick={() => profile.isAdmin && onOpenRealTeam(m.visitante)} disabled={!profile.isAdmin}
                  className="fl-tap flex-1 flex flex-col items-center gap-1 text-center">
                  <TeamCrest name={m.visitante} photo={teamCrests?.[m.visitante]} />
                  <span className="fl-body text-[11px] font-medium leading-tight" style={{ color: C.white }}>{m.visitante}</span>
                </button>
              </div>
            ))}
          </div>
          {profile.isAdmin && <p className="fl-body text-[10px] mt-1.5" style={{ color: C.muted }}>Toca un equipo para entrar y añadir jugadoras.</p>}
        </div>
      )}

      {jornadas.length > 0 && (
        <button onClick={() => setShowCalendar(true)}
          className="fl-tap w-full rounded-md py-2.5 text-sm font-semibold" style={{ background: C.baby, color: C.ink }}>
          Todos los partidos
        </button>
      )}

      {showCalendar && (
        <CalendarioModal jornadas={jornadas} teamCrests={teamCrests}
          initialIndex={Math.max(jornadas.length - 1, 0)} onClose={() => setShowCalendar(false)} />
      )}
    </div>
  );
}

/* =============================================================================
   CLASIFICACIÓN
   ========================================================================== */
function ClasificacionTab({ teams, players, jornadas, me }) {
  const [filterJornadaId, setFilterJornadaId] = useState(null); // null = "Total"
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => rankingService.computeStandings(teams, players, jornadas, filterJornadaId), [teams, players, jornadas, filterJornadaId]);
  const options = [{ id: null, label: "Total" }, ...[...jornadas].reverse().map(j => ({ id: j.id, label: j.name }))];
  const currentLabel = options.find(o => o.id === filterJornadaId)?.label || "Total";

  return (
    <div>
      {jornadas.length > 0 && (
        <div className="relative mb-3" style={{ width: 150 }}>
          <button onClick={() => setOpen(o => !o)}
            className="fl-tap w-full flex items-center justify-between gap-1.5 fl-body text-sm font-semibold rounded-md px-3 py-2"
            style={{ background: C.baby, color: C.ink }}>
            {currentLabel}
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {open && (
            <div className="absolute z-10 top-full left-0 mt-1 rounded-md overflow-hidden fl-pop" style={{ background: C.white, border: `1px solid ${C.line}`, minWidth: 150 }}>
              {options.map(o => (
                <button key={o.id ?? "total"} onClick={() => { setFilterJornadaId(o.id); setOpen(false); }}
                  className="fl-tap w-full text-left px-3 py-2 fl-body text-sm"
                  style={{ color: C.ink, background: o.id === filterJornadaId ? C.babySoft : "transparent" }}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {rows.length === 0 ? <EmptyState title="Todavía no hay participantes" text="En cuanto alguien entre en la liga aparecerá aquí." /> : (
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.name} className="fl-row flex items-center justify-between px-3 py-2.5" style={{ outline: r.name === me ? `2px solid ${C.baby}` : "none" }}>
              <div className="flex items-center gap-2.5">
                <span className="fl-mono text-xs w-5 text-center" style={{ color: C.muted }}>{r.rank}</span>
                <DeltaArrow delta={r.delta} />
                <div>
                  <div className="text-sm font-medium" style={{ color: C.white }}>{r.name}{r.name === me ? " (tú)" : ""}</div>
                  <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{r.jCount} jugadoras · {r.cCount} DT</div>
                </div>
              </div>
              <div className="fl-mono text-base font-semibold" style={{ color: C.baby }}>{r.total}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeltaArrow({ delta }) {
  if (!delta) return <Minus size={13} color={C.muted} />;
  return delta > 0 ? <TrendingUp size={13} color={C.positive} /> : <TrendingDown size={13} color={C.negative} />;
}

// Ventana "Marco de tiempo" del gráfico de Valor histórico.
const VALOR_TIMEFRAMES = [
  { key: "temporada", label: "Temporada" },
  { key: "u5", label: "Últimas 5" },
  { key: "u3", label: "Últimas 3" },
];

// Modal "Valor histórico": foto+nombre del jugador, valor actual y variación,
// selector de marco de tiempo, y un gráfico de área dibujado en SVG con la
// evolución real de su valor (un punto por cada jornada resuelta).
function ValorHistoricoModal({ player, onClose }) {
  const [timeframe, setTimeframe] = useState("temporada");
  const fullHistory = player.priceHistory && player.priceHistory.length > 0
    ? player.priceHistory
    : [{ label: "Actual", value: player.basePrice || 0 }]; // sin histórico todavía: un único punto plano

  const windowSize = timeframe === "u3" ? 3 : timeframe === "u5" ? 5 : fullHistory.length;
  const points = fullHistory.slice(-windowSize);
  const first = points[0].value;
  const last = points[points.length - 1].value;
  const pct = first > 0 ? ((last - first) / first) * 100 : 0;
  const positive = pct >= 0;
  const accent = positive ? C.positive : C.negative;

  // Construye el path del área a partir de los valores, normalizados al viewBox.
  const W = 320, H = 170, PAD = 8;
  const values = points.map(p => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(max - min, 0.0001);
  const coords = points.map((p, i) => {
    const x = points.length === 1 ? W / 2 : PAD + (i / (points.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((p.value - min) / span) * (H - PAD * 2);
    return [x, y];
  });
  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(1)},${H} L${coords[0][0].toFixed(1)},${H} Z`;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" style={{ background: C.navy900 }} onClick={onClose}>
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl overflow-hidden" style={{ background: C.navy800, border: `1px solid ${C.line}` }} onClick={e => e.stopPropagation()}>
        <div className="p-4">
          <div className="fl-mono text-[10px] tracking-wide" style={{ color: C.muted }}>VALOR HISTÓRICO</div>
          <div className="flex items-center gap-2 mt-2">
            <span className="fl-display text-lg" style={{ color: C.white }}>{player.name}</span>
            <PositionBadge posKey={player.position} />
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <Coins size={15} color={C.gold} />
            <span className="fl-mono text-base font-semibold" style={{ color: C.white }}>{fmtCredits(last)}</span>
            <span className="fl-mono text-xs font-semibold" style={{ color: accent }}>({pct >= 0 ? "+" : ""}{pct.toFixed(2)} %)</span>
          </div>
        </div>

        <div className="px-4">
          <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>Marco de tiempo</div>
          <div className="flex gap-2 mb-3">
            {VALOR_TIMEFRAMES.map(tf => (
              <button key={tf.key} onClick={() => setTimeframe(tf.key)} className="fl-tap flex-1 rounded-md py-1.5 fl-mono text-[11px] font-semibold"
                style={{ border: `1px solid ${timeframe === tf.key ? C.positive : C.line}`, color: timeframe === tf.key ? C.positive : C.muted }}>
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pb-1">
          {points.length <= 1 ? (
            <div className="py-6 text-center fl-body text-xs" style={{ color: C.muted }}>
              Todavía no hay suficiente historial de jornadas para dibujar la evolución.
            </div>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 170 }}>
              <defs>
                <linearGradient id="valorFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
                  <stop offset="100%" stopColor={accent} stopOpacity="0.03" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#valorFill)" />
              <path d={linePath} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          )}
          <div className="flex justify-between mt-1 mb-3">
            <span className="fl-mono text-[9px]" style={{ color: C.muted }}>{points[0]?.label}</span>
            {points.length > 1 && <span className="fl-mono text-[9px]" style={{ color: C.muted }}>{points[points.length - 1]?.label}</span>}
          </div>
        </div>

        <div className="p-4 pt-0">
          <button onClick={onClose} className="fl-tap w-full rounded-md py-3 text-sm font-bold" style={{ background: C.baby, color: C.ink }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/* =============================================================================
   EQUIPO: Alineación (pista) · Plantilla · Puntos
   ========================================================================== */
// Ficha de una jugadora/entrenadora: cabecera con foto, posición, PFSY y
// media de la temporada, chips de jornadas (J1, J2…) y, debajo, el desglose
// estadística a estadística de la jornada seleccionada con el sistema de
// Puntos SWISH, igual que el modelo de referencia.
function PlayerDetailScreen({ player, entry, jornadas, isAdmin, isOwned, isFavorite, onToggleFavorite, onRelease, onClose }) {
  const [showHistorico, setShowHistorico] = useState(false);

  const seasonRows = useMemo(() => jornadas.map((j, i) => {
    const stats = j.stats?.[player.id];
    const played = !!stats;
    const total = played ? calcPointsBreakdown(stats, player.position).total : 0;
    return { idx: i, jornada: j, played, total };
  }), [jornadas, player]);

  const [selectedIdx, setSelectedIdx] = useState(() => {
    for (let i = seasonRows.length - 1; i >= 0; i--) if (seasonRows[i].played) return i;
    return Math.max(seasonRows.length - 1, 0);
  });

  const totalSeason = seasonRows.reduce((s, r) => s + (r.played ? r.total : 0), 0);
  const playedCount = seasonRows.filter(r => r.played).length;
  const media = playedCount > 0 ? totalSeason / playedCount : 0;
  // Barra de cada jornada: caja de altura fija que representa una escala de
  // 0 a 20 puntos. El relleno es directamente proporcional (18 pts = 90% de
  // la caja llena, sin "suelo" añadido que lo falsee), y si alguna jugadora
  // supera los 20 puntos la barra se sale por arriba de la caja sin cortarse.
  const BAR_SCALE_MAX = 20;
  const BAR_BOX_HEIGHT = 32;
  const barFillHeight = (r) => {
    if (!r.played) return 3; // jornada aún no jugada: solo un hilo simbólico
    if (r.total <= 0) return 2;
    return Math.round((r.total / BAR_SCALE_MAX) * BAR_BOX_HEIGHT); // puede superar BAR_BOX_HEIGHT
  };

  const selected = seasonRows[selectedIdx];
  const { breakdown } = selected?.played ? calcPointsBreakdown(selected.jornada.stats[player.id], player.position) : { breakdown: [] };

  return (
    <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex items-center justify-between px-3 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.line}` }}>
        <button onClick={onClose} className="fl-tap p-1.5 -ml-1"><ChevronLeft size={20} color={C.white} /></button>
        <button onClick={onToggleFavorite} className="fl-tap flex items-center gap-1.5">
          <span className="fl-body text-sm" style={{ color: C.white }}>{isFavorite ? "En favoritos" : "Añadir a favoritos"}</span>
          <Star size={16} color={isFavorite ? C.gold : C.muted} fill={isFavorite ? C.gold : "none"} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto fl-scrollbar">
        <div className="flex items-start gap-3 p-4" style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
          <PlayerPhoto url={player.photo} size={76} rounded={14} />
          <div className="flex-1 min-w-0">
            <PositionBadge posKey={player.position} />
            <div className="fl-display text-xl mt-1 truncate" style={{ color: C.white }}>{player.name}</div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <CircleCheck size={15} color={C.positive} />
              <span className="fl-mono text-[11px]" style={{ color: C.positive }}>Alineable</span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Coins size={13} color={C.gold} />
              <span className="fl-mono text-xs" style={{ color: C.muted }}>{fmtCredits(player.basePrice || 0)}</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="fl-mono text-[9px]" style={{ color: C.muted }}>PFSY</div>
            <div className="fl-mono text-3xl font-bold" style={{ color: C.baby }}>{totalSeason}</div>
            <div className="fl-mono text-[10px] mt-1" style={{ color: C.muted }}>MEDIA: {media.toFixed(1)}</div>
          </div>
        </div>

        <div className="grid gap-2 px-4 pt-3" style={{ gridTemplateColumns: (isOwned && isAdmin) ? "1fr 1fr" : "1fr" }}>
          <button onClick={() => setShowHistorico(true)} className="fl-tap rounded-md py-2.5 text-xs font-semibold"
            style={{ border: `1px solid ${C.line}`, color: C.white }}>
            Valor histórico
          </button>
          {isOwned && isAdmin && (
            <button onClick={() => { onRelease(player.id); onClose(); }} className="fl-tap rounded-md py-2.5 text-xs font-semibold"
              style={{ background: C.negative, color: C.white }}>
              Quitar
            </button>
          )}
        </div>

        {showHistorico && <ValorHistoricoModal player={player} onClose={() => setShowHistorico(false)} />}

        {seasonRows.length === 0 ? (
          <div className="px-4 pt-4"><EmptyState compact title="Sin jornadas todavía" text="Cuando se registre la primera jornada verás aquí su puntuación." /></div>
        ) : (
          <>
            {!showHistorico && (
            <div className="flex gap-1.5 px-4 pt-4 overflow-x-auto overflow-y-visible fl-scrollbar">
              {seasonRows.map(r => (
                <button key={r.jornada.id} onClick={() => setSelectedIdx(r.idx)}
                  className="fl-tap flex-shrink-0 relative flex flex-col items-center justify-end rounded-lg overflow-hidden"
                  style={{ width: 60, height: 90, background: r.idx === selectedIdx ? C.white : "transparent" }}>
                  {/* Caja de escala fija (0-20 pts): el relleno crece desde abajo y puede
                      sobresalir por arriba si la jugadora supera los 20 puntos, pero nunca
                      por encima de la propia ficha (se recorta a la altura de la tarjeta
                      gracias al overflow-hidden del botón) para no tapar el número. */}
                  <div className="absolute left-1/2 bottom-0 w-4/5 rounded-sm" style={{ transform: "translateX(-50%)", height: BAR_BOX_HEIGHT, zIndex: 1 }}>
                    <div className="absolute inset-0 rounded-sm" style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${C.line}` }} />
                    <div className="absolute left-0 right-0 bottom-0 rounded-sm" style={{ height: barFillHeight(r), background: r.played ? C.positive : C.gold }} />
                  </div>
                  {/* Número y jornada: siempre por delante de la barra, con fondo propio
                      para que se lean incluso cuando la barra sobresale por detrás. */}
                  <div className="relative flex flex-col items-center rounded-md px-1.5" style={{ zIndex: 2, marginBottom: "auto", background: r.idx === selectedIdx ? C.white : C.navy800 }}>
                    <span className="fl-mono text-[10px] pt-1.5" style={{ color: r.idx === selectedIdx ? C.ink : C.muted }}>J{r.idx + 1}</span>
                    <span className="fl-mono text-lg font-bold py-1" style={{ color: r.idx === selectedIdx ? C.ink : C.white }}>
                      {r.played ? r.total : "–"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            )}

            <div className="px-4 pt-4 pb-2">
              <div className="fl-display text-base text-center" style={{ color: C.white }}>{selected.jornada.name}</div>
            </div>

            {!selected.played ? (
              <div className="px-4 pb-6"><EmptyState compact title="Sin datos" text="Todavía no se han registrado estadísticas para esta jornada." /></div>
            ) : (
              <div className="px-4 pb-6">
                <div className="fl-row overflow-hidden">
                  <div className="grid grid-cols-3 px-3 py-2" style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                    <span className="fl-mono text-[10px]" style={{ color: C.muted }}>Cantidad</span>
                    <span className="fl-mono text-[10px] text-center" style={{ color: C.muted }}>Estadísticas</span>
                    <span className="fl-mono text-[10px] text-right" style={{ color: C.muted }}>Puntos</span>
                  </div>
                  {breakdown.map(b => (
                    <div key={b.key} className="grid grid-cols-3 items-center px-3 py-3" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                      <span className="fl-mono text-sm" style={{ color: C.white }}>{b.cantidad}</span>
                      <span className="fl-body text-sm text-center" style={{ color: C.white }}>{b.label}</span>
                      <span className="fl-mono text-sm font-semibold text-right" style={{ color: b.pts > 0 ? C.positive : b.pts < 0 ? C.negative : C.gold }}>{b.pts}</span>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 items-center px-3 py-3" style={{ borderTop: `1px solid ${C.lineSoft}`, background: C.babySoft }}>
                    <span className="fl-mono text-xs font-bold uppercase" style={{ color: C.baby }}>Total {selected.jornada.name}</span>
                    <span className="fl-mono text-base font-bold text-right" style={{ color: C.baby }}>{selected.total}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EquipoTab({ myJugadoras, myCoaches, myTeam, budgetAvailable, budgetCommitted, jornadas, players, teamName, isAdmin, favoritos, onToggleFavorite, onSaveLineup, onRelease }) {
  const [sub, setSub] = useState("alineacion");
  const [detailPlayerId, setDetailPlayerId] = useState(null);
  const lineup = myTeam.lineup || { formation: "2-2-1", starters: [], bench: { BASE: null, ALERO: null, PIVOT: null }, titularCoach: null, captainId: null };
  const allSquad = [...myJugadoras, ...myCoaches];
  const startersSet = new Set(lineup.starters || []);
  const benchIds = new Set(Object.values(lineup.bench || {}).filter(Boolean));
  const reserva = allSquad.filter(p => !startersSet.has(p.id) && !benchIds.has(p.id) && p.id !== lineup.titularCoach);
  const history = jornadas.map(j => ({ id: j.id, name: j.name, pts: computeTeamJornadaPoints(j, teamName, lineup, players) }));

  const valorPlantilla = (myTeam.squad || []).reduce((s, e) => s + (e.pricePaid || 0), 0);

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <StatChip label="Fichas" value={`${myTeam.squad.length}/${MAX_SQUAD_JUGADORAS + MAX_COACHES}`} />
        <StatChip label="Valor plantilla" value={fmtCredits(valorPlantilla)} />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatChip label="Disponible mercado" value={fmtCredits(budgetAvailable)} accent={C.baby} />
        <StatChip label="Comprometido" value={fmtCredits(budgetCommitted)} />
      </div>
      <p className="fl-body text-[10px] mb-3" style={{ color: C.muted }}>El valor de plantilla y el presupuesto de mercado son independientes.</p>
      <div className="flex gap-1.5 mb-3">
        {[["alineacion", "Alineación"], ["plantilla", "Plantilla"], ["puntos", "Puntos"]].map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className="fl-tap flex-1 fl-mono text-[11px] py-2 rounded-lg"
            style={{ background: sub === k ? C.baby : "transparent", color: sub === k ? C.ink : C.muted, border: sub === k ? "none" : `1px solid ${C.line}` }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {sub === "alineacion" && (
        <LineupEditor myJugadoras={myJugadoras} myCoaches={myCoaches} lineup={lineup} onSave={onSaveLineup} />
      )}

      {sub === "plantilla" && (
        <div className="space-y-1.5">
          {allSquad.length === 0 ? (
            <EmptyState title="Aún no tienes plantilla" text="Consigue jugadoras y entrenadora/or pujando en el mercado." />
          ) : allSquad.map(p => {
            const entry = myTeam.squad.find(e => e.id === p.id);
            const role = (startersSet.has(p.id) || lineup.titularCoach === p.id) ? "Titular" : benchIds.has(p.id) ? "Banquillo" : "Reserva";
            return (
              <button key={p.id} onClick={() => setDetailPlayerId(p.id)} className="fl-tap fl-row w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
                <PlayerPhoto url={p.photo} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="fl-body text-sm font-medium truncate" style={{ color: C.white }}>{p.name}</div>
                  <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{p.team} · {role}</div>
                </div>
                <PositionBadge posKey={p.position} />
                <div className="text-right" style={{ minWidth: 62 }}>
                  <div className="fl-mono text-[9px]" style={{ color: C.muted }}>VALOR</div>
                  <div className="fl-mono text-xs" style={{ color: C.baby }}>{fmtCredits(p.basePrice || 0)}</div>
                  <div className="fl-mono text-[9px] mt-0.5" style={{ color: C.muted }}>CLÁUSULA</div>
                  <div className="fl-mono text-xs font-semibold flex items-center gap-0.5 justify-end" style={{ color: C.gold }}><Lock size={9} /> {fmtCredits(entry?.clause || 0)}</div>
                </div>
                {isAdmin && (
                  <span onClick={(e) => { e.stopPropagation(); onRelease(p.id); }} className="p-1.5 rounded-md" title="Liberar (herramienta admin)"><Trash2 size={14} color={C.negative} /></span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {sub === "puntos" && (
        jornadas.length === 0 ? <EmptyState title="Sin jornadas todavía" text="Los puntos de cada jornada aparecerán aquí." /> : (
          <div className="space-y-1.5">
            {history.map(h => (
              <div key={h.id} className="fl-row flex items-center justify-between px-3 py-2.5">
                <span className="text-sm" style={{ color: C.white }}>{h.name}</span>
                <span className="fl-mono text-sm font-semibold" style={{ color: h.pts >= 0 ? C.positive : C.negative }}>{h.pts > 0 ? `+${h.pts}` : h.pts}</span>
              </div>
            ))}
          </div>
        )
      )}

      {detailPlayerId && (() => {
        const p = allSquad.find(x => x.id === detailPlayerId);
        if (!p) return null;
        const entry = myTeam.squad.find(e => e.id === p.id);
        return (
          <PlayerDetailScreen player={p} entry={entry} jornadas={jornadas} isAdmin={isAdmin} isOwned={true}
            isFavorite={(favoritos || []).includes(p.id)} onToggleFavorite={() => onToggleFavorite(p.id)}
            onRelease={onRelease} onClose={() => setDetailPlayerId(null)} />
        );
      })()}
    </div>
  );
}

// Fila de jugadora candidata dentro de la pantalla "Cambiar jugador".
function PickerPlayerRow({ p, selected, onSelect }) {
  const pos = POS_BY_KEY[p.position] || COACH_POS;
  const trend = (p.basePrice || 0) - (p.prevBasePrice ?? p.basePrice ?? 0);
  return (
    <button onClick={() => onSelect(p.id)} className="fl-tap w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
      style={{ background: selected ? C.babySoft : C.navy800, border: `1.5px solid ${selected ? C.baby : C.line}`, borderRadius: 14, marginBottom: 8 }}>
      <div className="relative flex-shrink-0">
        <PlayerPhoto url={p.photo} size={46} rounded={12} />
        <span className="fl-mono absolute -top-1.5 -left-1.5 text-[8px] font-bold px-1 py-0.5 rounded"
          style={{ background: pos.fill, color: pos.textOn }}>{pos.short}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="fl-body text-sm font-medium truncate flex items-center gap-1" style={{ color: C.white }}>
          {p.name}
          {selected && <Check size={13} color={C.baby} />}
        </div>
        <div className="fl-mono text-[10px] truncate" style={{ color: C.muted }}>{p.team}</div>
        <div className="flex items-center gap-1 mt-1">
          <CircleCheck size={11} color={C.positive} />
          <span className="fl-mono text-[10px]" style={{ color: C.positive }}>Alineable</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="fl-mono text-sm font-semibold" style={{ color: C.baby }}>{fmtCredits(p.basePrice || 0)}</div>
        {trend !== 0 && (
          <div className="flex items-center justify-end gap-0.5 mt-0.5">
            {trend > 0 ? <TrendingUp size={11} color={C.positive} /> : <TrendingDown size={11} color={C.negative} />}
            <span className="fl-mono text-[9px]" style={{ color: trend > 0 ? C.positive : C.negative }}>{trend > 0 ? "+" : ""}{trend}</span>
          </div>
        )}
      </div>
    </button>
  );
}

// Pantalla "Cambiar jugador": se abre al pulsar cualquier hueco (vacío u ocupado)
// de la cancha, del banquillo o de la entrenadora/or titular, y lista las
// jugadoras/DT que se pueden colocar ahí.
function PlayerPickerScreen({ picker, current, candidates, onSelect, onClear, onBack }) {
  const posInfo = picker.type === "coach" ? COACH_POS : POS_BY_KEY[picker.posKey];
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="fl-tap flex items-center gap-1 -ml-1.5 px-1.5 py-1" style={{ color: C.white }}>
          <ChevronLeft size={20} />
        </button>
        <div className="fl-display text-sm uppercase" style={{ color: C.white }}>Cambiar jugador</div>
        <button onClick={onClear} disabled={!current} className="fl-tap fl-mono text-[11px] font-medium disabled:opacity-30" style={{ color: C.negative }}>
          Vaciar
        </button>
      </div>

      <div className="rounded-2xl mb-4 p-4 flex flex-col items-center" style={{ background: C.navy800, border: `2px solid ${C.baby}` }}>
        <div className="relative">
          <PlayerPhoto url={current?.photo} size={72} rounded={16} />
          {current && (
            <span className="fl-mono absolute -top-1.5 -left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: posInfo.fill, color: posInfo.textOn }}>
              {posInfo.short}
            </span>
          )}
        </div>
        <div className="fl-body text-sm font-semibold mt-2" style={{ color: C.white }}>{current ? current.name : "Vacío"}</div>
        <div className="fl-mono text-[10px]" style={{ color: C.muted }}>
          {current ? current.team : `${posInfo.label} · elige una jugadora`}
        </div>
      </div>

      {candidates.length === 0 ? (
        <EmptyState compact title="Sin candidatas" text={`No tienes más ${posInfo.label.toLowerCase()}s disponibles para este hueco.`} />
      ) : (
        <div>
          {candidates.map(p => (
            <PickerPlayerRow key={p.id} p={p} selected={current?.id === p.id} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

// Pantalla "Seleccionar como capitán": muestra las 5 titulares sobre la misma
// disposición que la cancha; al tocar una se marca al instante con la "C" dorada.
function CaptainPickerScreen({ rows, myJugadoras, captainId, onSelect, onBack }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={onBack} className="fl-tap -ml-1.5 px-1.5 py-1" style={{ color: C.white }}>
          <ChevronLeft size={20} />
        </button>
        <div className="fl-display text-sm uppercase" style={{ color: C.white }}>Seleccionar como capitán</div>
      </div>
      <p className="fl-body text-[11px] mb-3" style={{ color: C.muted }}>La capitana duplica (x2) los puntos que consiga en la jornada.</p>
      <div className="rounded-2xl mb-4 p-4" style={{ background: C.navy700, border: `1px solid ${C.line}` }}>
        <div className="flex flex-col gap-4">
          {rows.map(({ pos, ids }) => (
            <div key={pos.key} className="flex items-start justify-center gap-3 flex-wrap">
              {ids.map(id => {
                const p = myJugadoras.find(x => x.id === id);
                if (!p) return null;
                return <CourtSlot key={id} player={p} size={54} isCaptain={captainId === id} onClick={() => onSelect(id)} />;
              })}
            </div>
          ))}
        </div>
      </div>
      <button onClick={onBack} className="fl-tap w-full rounded-md py-2.5 text-sm font-semibold" style={{ background: C.baby, color: C.ink }}>
        Cerrar
      </button>
    </div>
  );
}

function LineupEditor({ myJugadoras, myCoaches, lineup, onSave }) {
  const [formationKey, setFormationKey] = useState(lineup?.formation || "2-2-1");
  const [starters, setStarters] = useState(lineup?.starters || []);
  const [bench, setBench] = useState(lineup?.bench || { BASE: null, ALERO: null, PIVOT: null });
  const [titularCoach, setTitularCoach] = useState(lineup?.titularCoach || (myCoaches[0]?.id ?? null));
  const [captainId, setCaptainId] = useState(lineup?.captainId || null);
  const [savedFlash, setSavedFlash] = useState(false);
  // picker: { type: 'starter' | 'bench' | 'coach', posKey, currentId }
  const [picker, setPicker] = useState(null);
  const [formationOpen, setFormationOpen] = useState(false);
  const [showCaptainPicker, setShowCaptainPicker] = useState(false);

  // Si la capitana deja de ser titular (se cambia o se quita), se pierde el brazalete.
  useEffect(() => {
    if (captainId && !starters.includes(captainId)) setCaptainId(null);
  }, [starters, captainId]);

  const req = FORMATIONS[formationKey];
  const byPos = (posKey) => myJugadoras.filter(p => p.position === posKey);
  const findPlayer = (id) => myJugadoras.find(p => p.id === id) || myCoaches.find(p => p.id === id) || null;

  const changeFormation = (key) => { setFormationKey(key); setStarters([]); setBench({ BASE: null, ALERO: null, PIVOT: null }); setFormationOpen(false); };

  // Asigna (o vacía, si newId es null) el hueco titular abierto en el picker.
  const assignStarter = (posKey, oldId, newId) => {
    setStarters(prev => {
      let next = oldId ? prev.filter(id => id !== oldId) : [...prev];
      if (newId) next = [...next, newId];
      return next;
    });
    if (newId) setBench(b => { const nb = { ...b }; Object.keys(nb).forEach(k => { if (nb[k] === newId) nb[k] = null; }); return nb; });
    setPicker(null);
  };
  const assignBench = (posKey, newId) => {
    setBench(b => ({ ...b, [posKey]: newId }));
    if (newId) setStarters(prev => prev.filter(id => id !== newId));
    setPicker(null);
  };
  const assignCoach = (newId) => { setTitularCoach(newId); setPicker(null); };

  const totalNeeded = req.BASE + req.ALERO + req.PIVOT;
  const canSave = starters.length === totalNeeded;
  const reserva = myJugadoras.filter(p => !starters.includes(p.id) && bench[p.position] !== p.id);

  const rows = [
    { pos: POSITIONS[2], ids: starters.filter(id => byPos("PIVOT").some(p => p.id === id)), need: req.PIVOT }, // Pívot arriba (cerca de canasta)
    { pos: POSITIONS[1], ids: starters.filter(id => byPos("ALERO").some(p => p.id === id)), need: req.ALERO },
    { pos: POSITIONS[0], ids: starters.filter(id => byPos("BASE").some(p => p.id === id)), need: req.BASE },
  ];

  // Pantalla "Cambiar jugador" abierta: sustituye todo el editor mientras se elige.
  if (picker) {
    const current = picker.currentId ? findPlayer(picker.currentId) : null;
    let candidates = [];
    if (picker.type === "coach") {
      candidates = myCoaches;
    } else if (picker.type === "starter") {
      const startersOtherSlots = starters.filter(id => id !== picker.currentId);
      candidates = byPos(picker.posKey).filter(p => !startersOtherSlots.includes(p.id));
    } else if (picker.type === "bench") {
      candidates = byPos(picker.posKey).filter(p => !starters.includes(p.id) || p.id === picker.currentId);
    }
    return (
      <PlayerPickerScreen
        picker={picker}
        current={current}
        candidates={candidates}
        onBack={() => setPicker(null)}
        onClear={() => {
          if (picker.type === "coach") assignCoach(null);
          else if (picker.type === "starter") assignStarter(picker.posKey, picker.currentId, null);
          else assignBench(picker.posKey, null);
        }}
        onSelect={(id) => {
          if (picker.type === "coach") assignCoach(id);
          else if (picker.type === "starter") assignStarter(picker.posKey, picker.currentId, id);
          else assignBench(picker.posKey, id);
        }}
      />
    );
  }

  // Pantalla "Seleccionar como capitán" abierta: sustituye todo el editor mientras se elige.
  if (showCaptainPicker) {
    return (
      <CaptainPickerScreen
        rows={rows}
        myJugadoras={myJugadoras}
        captainId={captainId}
        onSelect={(id) => setCaptainId(prev => (prev === id ? null : id))}
        onBack={() => setShowCaptainPicker(false)}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <button onClick={() => setFormationOpen(o => !o)}
            className="fl-tap w-full flex items-center justify-center gap-1.5 fl-mono text-xs font-bold rounded-md py-2"
            style={{ background: C.baby, color: C.ink }}>
            {formationKey.split("-").join(" · ")}
            {formationOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {formationOpen && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-md overflow-hidden fl-pop" style={{ background: C.white, border: `1px solid ${C.line}` }}>
              {Object.keys(FORMATIONS).map(key => (
                <button key={key} onClick={() => changeFormation(key)}
                  className="fl-tap w-full text-left px-3 py-2 fl-mono text-xs"
                  style={{ color: C.ink, background: key === formationKey ? C.babySoft : "transparent" }}>
                  {key.split("-").join(" · ")}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setShowCaptainPicker(true)}
          className="fl-tap flex-1 flex items-center justify-center gap-1.5 fl-mono text-xs font-medium rounded-md py-2"
          style={{ background: C.navy700, border: `1px solid ${C.line}`, color: C.white }}>
          <Star size={13} color={C.gold} /> Asignar capitán
        </button>
      </div>

      {/* Cancha: 5 huecos fijos (titulares). Foto+check si hay jugadora, silueta si está vacío.
          Cualquier hueco (vacío u ocupado) abre la pantalla de selección al pulsarlo. Los aleros
          (posición de ala/wing) se separan hacia los laterales de la pista, cerca de la línea de
          3 puntos, en vez de agruparse en el centro; bases y pívots quedan centrados. */}
      <div className="rounded-2xl mb-3 relative overflow-hidden" style={{ background: C.navy700, border: `1px solid ${C.line}`, aspectRatio: "320 / 300" }}>
        <BasketballCourt />
        <div className="relative h-full flex flex-col justify-between py-4 px-1">
          {rows.map(({ pos, ids, need }) => {
            const slots = [...ids, ...Array(Math.max(need - ids.length, 0)).fill(null)];
            const isWing = pos.key === "ALERO";
            return (
              <div key={pos.key} className={`flex items-start flex-wrap ${isWing ? "justify-between px-1" : "justify-center gap-4"}`}>
                {slots.map((id, i) => {
                  const p = id ? myJugadoras.find(x => x.id === id) : null;
                  return (
                    <CourtSlot key={id || `${pos.key}-empty-${i}`} player={p} size={58} isCaptain={!!id && captainId === id}
                      onClick={() => setPicker({ type: "starter", posKey: pos.key, currentId: id || null })} />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Banquillo: 3 huecos fijos (1 base + 1 alero + 1 pívot). Se abren igual que la cancha. */}
      <div className="mb-3">
        <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>BANQUILLO</div>
        <div className="fl-row flex items-center justify-around gap-2 py-3 px-2">
          {POSITIONS.map(pos => {
            const id = bench[pos.key];
            const p = id ? myJugadoras.find(x => x.id === id) : null;
            return (
              <CourtSlot key={pos.key} player={p} size={46} label={pos.label}
                onClick={() => setPicker({ type: "bench", posKey: pos.key, currentId: id || null })} />
            );
          })}
        </div>
      </div>

      {/* Entrenadora/or titular: mismo patrón de hueco + selección. */}
      <div className="mb-3">
        <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>ENTRENADORA/OR TITULAR</div>
        <div className="fl-row flex items-center justify-center py-3 px-2">
          <CourtSlot player={titularCoach ? findPlayer(titularCoach) : null} size={50} label={titularCoach ? undefined : "DT"}
            onClick={() => setPicker({ type: "coach", posKey: "DT", currentId: titularCoach || null })} />
        </div>
      </div>

      {reserva.length > 0 && (
        <div className="mb-3">
          <div className="fl-mono text-[10px] mb-1" style={{ color: C.muted }}>RESERVA (NO ALINEABLES ESTA JORNADA)</div>
          <div className="flex gap-1.5 flex-wrap">
            {reserva.map(p => (
              <div key={p.id} className="fl-row px-2.5 py-1.5 flex items-center gap-1.5" style={{ opacity: 0.6 }}>
                <PositionBadge posKey={p.position} />
                <span className="fl-body text-xs font-medium" style={{ color: C.white }}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button disabled={!canSave} onClick={async () => { await onSave({ formation: formationKey, starters, bench, titularCoach, captainId }); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500); }}
        className="fl-tap w-full rounded-md py-2.5 text-sm font-semibold disabled:opacity-40" style={{ background: C.baby, color: C.ink }}>
        {savedFlash ? "Alineación guardada ✓" : "Guardar alineación"}
      </button>
    </div>
  );
}

/* =============================================================================
   MERCADO (SUBASTAS)
   ========================================================================== */
// Ordena una lista de jugadoras/entrenadores según el criterio elegido en el
// desplegable "Nombre" del buscador (Nombre, Puntos, Equipo, Precio, Posición,
// Estado, Propietario).
function sortPlayersBy(list, sortKey, ownerByPlayerId, pfsyByPlayerId) {
  const arr = [...list];
  switch (sortKey) {
    case "puntos": return arr.sort((a, b) => (pfsyByPlayerId[b.id] || 0) - (pfsyByPlayerId[a.id] || 0));
    case "equipo": return arr.sort((a, b) => (a.team || "").localeCompare(b.team || ""));
    case "precio": return arr.sort((a, b) => (b.basePrice || 0) - (a.basePrice || 0));
    case "posicion": return arr.sort((a, b) => (a.position || "").localeCompare(b.position || ""));
    case "estado": return arr.sort((a, b) => {
      const ea = ownerByPlayerId[a.id] ? 1 : 0, eb = ownerByPlayerId[b.id] ? 1 : 0;
      return ea - eb || a.name.localeCompare(b.name);
    });
    case "propietario": return arr.sort((a, b) => (ownerByPlayerId[a.id] || "").localeCompare(ownerByPlayerId[b.id] || ""));
    default: return arr.sort((a, b) => a.name.localeCompare(b.name));
  }
}

// Botón de filtro con menú desplegable (Equipo, Posición, Nombre/orden).
function FilterDropdown({ label, open, onToggle, children }) {
  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <button onClick={onToggle} className="fl-tap w-full rounded-md py-2.5 px-3 text-xs font-semibold flex items-center justify-between"
        style={{ background: open ? C.baby : C.navy800, color: open ? C.ink : C.white, border: `1px solid ${open ? C.baby : C.line}` }}>
        <span className="truncate">{label}</span>
        <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-1 rounded-md overflow-hidden z-10 max-h-56 overflow-y-auto fl-scrollbar"
          style={{ background: C.white, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
function DropdownItem({ active, onClick, children }) {
  return (
    <button onClick={onClick} className="fl-tap w-full text-left px-3 py-2.5 text-sm font-medium"
      style={{ color: active ? C.babyDark : C.ink, background: active ? C.babySoft : "transparent" }}>
      {children}
    </button>
  );
}

// Buscador global de jugadoras y entrenadoras/es: nombre, favoritos, equipo
// real, posición y orden — igual estructura que el buscador de referencia.
function PlayerSearchScreen({ players, jornadas, teams, myTeam, isAdmin, favoritos, onToggleFavorite, onRelease, onClose }) {
  const [query, setQuery] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [teamFilter, setTeamFilter] = useState("");
  const [posFilter, setPosFilter] = useState("");
  const [sortKey, setSortKey] = useState("nombre");
  const [openDropdown, setOpenDropdown] = useState(null); // "equipo" | "posicion" | "orden" | null
  const [detailPlayer, setDetailPlayer] = useState(null);

  const ownerByPlayerId = useMemo(() => {
    const m = {};
    Object.entries(teams || {}).forEach(([name, t]) => (t.squad || []).forEach(e => { m[e.id] = name; }));
    return m;
  }, [teams]);

  const pfsyByPlayerId = useMemo(() => {
    const m = {};
    players.forEach(p => {
      let total = 0;
      jornadas.forEach(j => { const s = j.stats?.[p.id]; if (s) total += calcPointsBreakdown(s, p.position).total; });
      m[p.id] = total;
    });
    return m;
  }, [players, jornadas]);

  const realTeams = useMemo(() => Array.from(new Set(players.map(p => p.team).filter(Boolean))).sort(), [players]);
  const favSet = new Set(favoritos || []);

  let list = players.filter(p => {
    if (query.trim() && !p.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (onlyFav && !favSet.has(p.id)) return false;
    if (teamFilter && p.team !== teamFilter) return false;
    if (posFilter && p.position !== posFilter) return false;
    return true;
  });
  list = sortPlayersBy(list, sortKey, ownerByPlayerId, pfsyByPlayerId);

  const posOptions = [["", "Todos"], ["BASE", "Base"], ["ALERO", "Alero"], ["PIVOT", "Pívot"], ["DT", "ENT"]];
  const sortOptions = [["nombre", "Nombre"], ["puntos", "Puntos"], ["equipo", "Equipo"], ["precio", "Precio"], ["posicion", "Posición"], ["estado", "Estado"], ["propietario", "Propietario"]];

  return (
    <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex items-center gap-2 px-3 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.line}` }}>
        <button onClick={onClose} className="fl-tap p-1.5 -ml-1"><ChevronLeft size={20} color={C.white} /></button>
        <span className="fl-display text-base uppercase flex-1 text-center" style={{ color: C.white }}>Buscar</span>
        <span style={{ width: 28 }} />
      </div>

      <div className="px-3 pt-3 flex-shrink-0">
        <div className="flex items-center gap-2 rounded-md px-3 py-2.5" style={{ background: C.navy800, border: `1px solid ${C.line}` }}>
          <Search size={16} color={C.muted} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar jugadora o entrenadora/or"
            className="flex-1 bg-transparent outline-none fl-body text-sm" style={{ color: C.white }} />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <button onClick={() => setOnlyFav(v => !v)} className="fl-tap rounded-md py-2.5 px-3 text-xs font-semibold"
            style={{ background: onlyFav ? C.baby : C.navy800, color: onlyFav ? C.ink : C.white, border: `1px solid ${onlyFav ? C.baby : C.line}` }}>
            Favoritos
          </button>
          <FilterDropdown label="Equipo" open={openDropdown === "equipo"} onToggle={() => setOpenDropdown(d => d === "equipo" ? null : "equipo")}>
            <DropdownItem active={!teamFilter} onClick={() => { setTeamFilter(""); setOpenDropdown(null); }}>Todos</DropdownItem>
            {realTeams.map(t => <DropdownItem key={t} active={teamFilter === t} onClick={() => { setTeamFilter(t); setOpenDropdown(null); }}>{t}</DropdownItem>)}
          </FilterDropdown>
          <FilterDropdown label="Posición" open={openDropdown === "posicion"} onToggle={() => setOpenDropdown(d => d === "posicion" ? null : "posicion")}>
            {posOptions.map(([k, l]) => <DropdownItem key={k || "todos"} active={posFilter === k} onClick={() => { setPosFilter(k); setOpenDropdown(null); }}>{l}</DropdownItem>)}
          </FilterDropdown>
          <FilterDropdown label="Nombre" open={openDropdown === "orden"} onToggle={() => setOpenDropdown(d => d === "orden" ? null : "orden")}>
            {sortOptions.map(([k, l]) => <DropdownItem key={k} active={sortKey === k} onClick={() => { setSortKey(k); setOpenDropdown(null); }}>{l}</DropdownItem>)}
          </FilterDropdown>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto fl-scrollbar px-3 pt-3 pb-6 mt-1" onClick={() => setOpenDropdown(null)}>
        {list.length === 0 ? (
          <EmptyState compact title="Sin resultados" text="Prueba a cambiar la búsqueda o los filtros." />
        ) : (
          <div className="space-y-1.5">
            {list.map(p => {
              const owner = ownerByPlayerId[p.id];
              const isFav = favSet.has(p.id);
              return (
                <button key={p.id} onClick={() => setDetailPlayer(p)} className="fl-tap w-full fl-row flex items-center gap-2.5 px-3 py-2.5 text-left">
                  <PlayerPhoto url={p.photo} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <CircleCheck size={13} color={C.positive} className="flex-shrink-0" />
                      <span className="fl-body text-sm font-medium truncate" style={{ color: C.white }}>{p.name}</span>
                      {isFav && <Star size={12} color={C.gold} fill={C.gold} className="flex-shrink-0" />}
                      {owner && <span className="fl-mono text-[9px] truncate flex-shrink-0" style={{ color: C.muted, maxWidth: 64 }}>{owner}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="fl-mono text-[10px]" style={{ color: C.muted }}>{p.team}</span>
                      <PositionBadge posKey={p.position} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="fl-mono text-[9px]" style={{ color: C.muted }}>PFSY {pfsyByPlayerId[p.id] || 0}</div>
                    <div className="fl-mono text-xs" style={{ color: C.baby }}>{fmtCredits(p.basePrice || 0)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {detailPlayer && (
        <PlayerDetailScreen player={detailPlayer} jornadas={jornadas} isAdmin={isAdmin}
          isOwned={teamService.squadIds(myTeam).includes(detailPlayer.id)}
          isFavorite={favSet.has(detailPlayer.id)} onToggleFavorite={() => onToggleFavorite(detailPlayer.id)}
          onRelease={onRelease} onClose={() => setDetailPlayer(null)} />
      )}
    </div>
  );
}

function MercadoTab({ market, players, bids, marketHistory, profile, myTeam, teams, isMarketOpen, budgetAvailable, onBid, onBuyClause, jornadas, isAdmin, onRelease, favoritos, onToggleFavorite }) {
  const [sub, setSub] = useState("mercado");
  const [offerTarget, setOfferTarget] = useState(null); // { sellerName, asset, clause }
  const [detailPlayer, setDetailPlayer] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const assets = (market.assetIds || []).map(id => players.find(p => p.id === id)).filter(Boolean);
  const myActiveBids = bids.filter(b => b.marketId === market.id && b.userId === profile.name && b.status === "active");
  const myPastBids = bids.filter(b => b.userId === profile.name && b.status !== "active" && b.marketId !== market.id);

  if (offerTarget) {
    return (
      <ClauseOfferScreen target={offerTarget} budgetAvailable={budgetAvailable}
        onBack={() => setOfferTarget(null)}
        onConfirm={async (amount) => {
          const res = await onBuyClause(offerTarget.sellerName, offerTarget.asset, amount);
          if (res.ok) setOfferTarget(null);
          return res;
        }} />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <CountdownChip closesAt={market.closesAt} opensAt={market.opensAt} isOpen={isMarketOpen} />
        <div className="flex items-center gap-2">
          <div className="fl-mono text-xs flex items-center gap-1" style={{ color: C.baby }}><Wallet size={13} /> {fmtCredits(budgetAvailable)} disp.</div>
          <button onClick={() => setShowSearch(true)} className="fl-tap p-1.5 rounded-md" style={{ border: `1px solid ${C.line}` }} title="Buscar jugadora o entrenadora/or">
            <Search size={15} color={C.white} />
          </button>
        </div>
      </div>
      <div className="flex gap-1.5 mb-3 overflow-x-auto fl-scrollbar">
        {[["mercado", "Mercado"], ["plantillas", "Plantillas"], ["operaciones", "Mis pujas"], ["historico", "Histórico"]].map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className="fl-tap whitespace-nowrap fl-mono text-[11px] px-3 py-2 rounded-lg"
            style={{ background: sub === k ? C.baby : "transparent", color: sub === k ? C.ink : C.muted, border: sub === k ? "none" : `1px solid ${C.line}` }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {sub === "mercado" && (
        assets.length === 0 ? <EmptyState title="Sin activos en este mercado" text="El siguiente mercado se generará automáticamente al cerrar este." /> : (
          <div className="space-y-2.5">
            {assets.map(asset => (
              <AuctionCard key={asset.id} asset={asset} market={market} bids={bids} profile={profile} myTeam={myTeam}
                isMarketOpen={isMarketOpen} budgetAvailable={budgetAvailable} onBid={onBid} onOpenPlayer={setDetailPlayer} />
            ))}
          </div>
        )
      )}

      {sub === "plantillas" && (
        <RivalRosters teams={teams} players={players} me={profile.name} onSelect={(sellerName, asset, clause) => setOfferTarget({ sellerName, asset, clause })}
          onOpenPlayer={setDetailPlayer} />
      )}

      {sub === "operaciones" && (
        myActiveBids.length === 0 ? <EmptyState title="No tienes pujas activas" text="Puja por una jugadora o entrenadora/or desde la pestaña Mercado." /> : (
          <div className="space-y-1.5">
            {myActiveBids.map(b => {
              const asset = players.find(p => p.id === b.assetId);
              if (!asset) return null;
              return (
                <button key={b.id} onClick={() => setDetailPlayer(asset)} className="fl-tap w-full fl-row flex items-center gap-2.5 px-3 py-2.5 text-left">
                  <PlayerPhoto url={asset.photo} size={38} />
                  <div className="flex-1 min-w-0">
                    <div className="fl-body text-sm font-medium truncate" style={{ color: C.white }}>{asset.name}</div>
                    <div className="fl-mono text-[10px]" style={{ color: C.muted }}>Tu puja: {fmtCredits(b.amount)}</div>
                  </div>
                  <BidStatusPill status="active" />
                </button>
              );
            })}
          </div>
        )
      )}

      {sub === "historico" && (
        <HistoricoTab marketHistory={marketHistory} players={players} bids={bids} profile={profile} myPastBids={myPastBids} />
      )}

      {detailPlayer && (
        <PlayerDetailScreen player={detailPlayer} jornadas={jornadas} isAdmin={isAdmin}
          isOwned={teamService.squadIds(myTeam).includes(detailPlayer.id)}
          isFavorite={(favoritos || []).includes(detailPlayer.id)} onToggleFavorite={() => onToggleFavorite(detailPlayer.id)}
          onRelease={onRelease} onClose={() => setDetailPlayer(null)} />
      )}

      {showSearch && (
        <PlayerSearchScreen players={players} jornadas={jornadas} teams={teams} myTeam={myTeam} isAdmin={isAdmin}
          favoritos={favoritos} onToggleFavorite={onToggleFavorite} onRelease={onRelease} onClose={() => setShowSearch(false)} />
      )}
    </div>
  );
}

// Plantillas rivales: solo aquí se puede pujar por una jugadora que ya pertenece a otra
// persona, pagando (como mínimo) su cláusula. Los jugadores del mercado general NUNCA
// muestran cláusula porque, mientras están libres, no la tienen.
function RivalRosters({ teams, players, me, onSelect, onOpenPlayer }) {
  const rivals = Object.entries(teams || {}).filter(([name]) => name !== me);
  if (rivals.length === 0) return <EmptyState title="Todavía no hay otras plantillas" text="En cuanto más gente entre en la liga podrás ver sus jugadoras clausuladas aquí." />;
  return (
    <div className="space-y-4">
      {rivals.map(([name, team]) => {
        const rows = (team.squad || [])
          .map(entry => ({ entry, player: players.find(p => p.id === entry.id) }))
          .filter(r => r.player);
        if (rows.length === 0) return null;
        return (
          <div key={name}>
            <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>{name.toUpperCase()}</div>
            <div className="space-y-1.5">
              {rows.map(({ entry, player }) => (
                <div key={player.id} className="fl-row flex items-center gap-2.5 px-3 py-2.5">
                  <button onClick={() => onOpenPlayer(player)} className="fl-tap flex items-center gap-2.5 flex-1 min-w-0 text-left">
                    <PlayerPhoto url={player.photo} size={40} />
                    <div className="flex-1 min-w-0 text-left">
                      <div className="fl-body text-sm font-medium truncate" style={{ color: C.white }}>{player.name}</div>
                      <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{player.team} · Valor {fmtCredits(player.basePrice)}</div>
                    </div>
                  </button>
                  <PositionBadge posKey={player.position} />
                  <button onClick={() => onSelect(name, player, entry.clause || 0)}
                    className="fl-tap flex items-center gap-1 fl-mono text-xs font-semibold rounded-md px-2 py-1.5 flex-shrink-0"
                    style={{ color: C.gold, border: `1px solid ${C.gold}` }}>
                    <Lock size={11} /> {fmtCredits(entry.clause || 0)}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Pantalla de oferta por cláusula, a pantalla completa (estilo de referencia).
function ClauseOfferScreen({ target, budgetAvailable, onBack, onConfirm }) {
  const { sellerName, asset, clause } = target;
  const [amount, setAmount] = useState(String(clause));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(""); setBusy(true);
    const res = await onConfirm(Number(amount));
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="fixed inset-0 z-20 flex flex-col" style={{ background: C.navy900 }}>
      <div className="flex items-center px-4 pt-5 pb-3" style={{ borderBottom: `1px solid ${C.line}` }}>
        <button onClick={onBack} className="fl-tap p-1 -ml-1"><ChevronLeft size={22} color={C.white} /></button>
        <div className="flex-1 text-center fl-display text-sm uppercase pr-6" style={{ color: C.white }}>Oferta por {asset.name}</div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex justify-center mb-6">
          <div className="rounded-full p-1" style={{ border: `2px solid ${C.line}` }}>
            <PlayerPhoto url={asset.photo} size={92} rounded={999} />
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 fl-mono text-[11px]" style={{ color: C.muted }}>
              <Coins size={13} color={C.gold} /> VALOR DE MERCADO
            </div>
            <div className="fl-mono text-sm font-semibold" style={{ color: C.white }}>{fmtCredits(asset.basePrice || 0)}</div>
          </div>
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 fl-mono text-[11px]" style={{ color: C.muted }}>
              <Coins size={13} color={C.gold} /> VALOR DE CLAUSULA
            </div>
            <div className="fl-mono text-sm font-semibold" style={{ color: C.gold }}>{fmtCredits(clause)}</div>
          </div>
        </div>

        <div className="fl-row flex items-center gap-2.5 px-3 py-2.5 mb-3" style={{ background: C.navy700 }}>
          <div className="flex items-center justify-center rounded-full" style={{ width: 26, height: 26, background: C.gold }}>
            <Coins size={14} color={C.ink} />
          </div>
          <div className="flex-1">
            <div className="fl-mono text-[9px]" style={{ color: C.muted }}>IMPORTE</div>
            {editing ? (
              <input autoFocus type="number" min={clause} value={amount} onChange={e => setAmount(e.target.value)}
                onBlur={() => setEditing(false)} className="fl-mono text-sm font-semibold w-full bg-transparent outline-none" style={{ color: C.white }} />
            ) : (
              <div className="fl-mono text-sm font-semibold" style={{ color: C.white }}>{fmtCredits(Number(amount) || 0)}</div>
            )}
          </div>
          <button onClick={() => setEditing(e => !e)} className="fl-tap p-1.5 rounded-full" style={{ background: C.navy600 }}><Pencil size={12} color={C.white} /></button>
          <button onClick={() => setAmount(String(clause))} className="fl-tap p-1.5 rounded-full" style={{ background: C.navy600 }}><X size={12} color={C.white} /></button>
        </div>
        <p className="fl-body text-[11px]" style={{ color: C.muted }}>Debes igualar o superar la cláusula ({fmtCredits(clause)}) para llevártela. La compra es inmediata: no hace falta esperar al cierre del mercado.</p>
        {error && <div className="fl-mono text-[11px] mt-3" style={{ color: C.negative }}>{error}</div>}
      </div>

      <div className="px-5 pb-3">
        <button onClick={submit} disabled={busy || Number(amount) < clause}
          className="fl-tap w-full rounded-md py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: C.positive, color: C.ink }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : "Hacer oferta de compra"}
        </button>
        <div className="text-center fl-mono text-[11px] mt-2.5 pb-2" style={{ color: C.muted }}>
          Tu saldo: <span style={{ color: C.baby, fontWeight: 600 }}>{fmtCredits(budgetAvailable)}</span>
        </div>
      </div>
    </div>
  );
}

function AuctionCard({ asset, market, bids, profile, myTeam, isMarketOpen, budgetAvailable, onBid, onOpenPlayer }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const bidCount = auctionService.bidsForAsset(bids, market.id, asset.id).filter(b => b.status === "active").length;
  const myBid = auctionService.userBidForAsset(bids, market.id, asset.id, profile.name);
  const owned = teamService.squadIds(myTeam).includes(asset.id);
  const status = owned ? "won" : myBid ? "active" : "none";

  const submit = async () => {
    setError(""); setBusy(true);
    const val = Number(amount);
    const res = await onBid(asset, val);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setOpen(false);
  };

  return (
    <div className="fl-row p-3 fl-pop">
      <div className="flex items-center gap-3">
        <button onClick={() => onOpenPlayer(asset)} className="fl-tap flex items-center gap-3 flex-1 min-w-0 text-left">
          <PlayerPhoto url={asset.photo} size={52} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <PositionBadge posKey={asset.position} />
              <span className="fl-display text-sm uppercase truncate" style={{ color: C.white }}>{asset.name}</span>
            </div>
            <div className="fl-mono text-[10px] mt-0.5" style={{ color: C.muted }}>{asset.team}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="fl-mono text-[11px]" style={{ color: C.baby }}>Salida {fmtCredits(asset.basePrice || 1)}</span>
              <span className="fl-mono text-[10px]" style={{ color: C.muted }}>· {bidCount} {bidCount === 1 ? "puja" : "pujas"}</span>
            </div>
            <div className="mt-1"><BidStatusPill status={status} /></div>
          </div>
        </button>
        <button onClick={() => setOpen(o => !o)} disabled={!isMarketOpen || owned}
          className="fl-tap fl-mono text-[11px] font-semibold rounded-md px-3 py-2 disabled:opacity-40 flex-shrink-0"
          style={{ background: owned ? "transparent" : C.baby, color: owned ? C.muted : C.ink, border: owned ? `1px solid ${C.line}` : "none" }}>
          {owned ? "Tuya" : myBid ? "Editar" : "Pujar"}
        </button>
      </div>
      {open && (
        <div className="mt-3 pt-3 flex items-center gap-2" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
          <input type="number" min={asset.basePrice || 1} value={amount} onChange={e => setAmount(e.target.value)}
            placeholder={`Mín. ${asset.basePrice || 1}`} className="flex-1 fl-mono text-sm rounded-md px-2.5 py-2"
            style={{ background: C.navy900, border: `1px solid ${C.line}`, color: C.white }} />
          <button onClick={submit} disabled={busy} className="fl-tap fl-mono text-xs font-semibold rounded-md px-3 py-2" style={{ background: C.baby, color: C.ink }}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : "Confirmar"}
          </button>
        </div>
      )}
      {error && <div className="fl-mono text-[10px] mt-2" style={{ color: C.negative }}>{error}</div>}
    </div>
  );
}

function HistoricoTab({ marketHistory, players, bids, profile, myPastBids }) {
  const rows = [];
  [...marketHistory].reverse().forEach(h => {
    h.results.forEach(r => {
      const asset = players.find(p => p.id === r.assetId);
      if (!asset) return;
      if (r.winnerUserId === profile.name) {
        rows.push({ id: `${h.id}_${r.assetId}`, ts: h.closesAt, text: `Has fichado a ${asset.name} por ${fmtCredits(r.amount)}`, positive: true });
      } else {
        const lostBid = myPastBids.find(b => b.assetId === r.assetId && b.status === "lost");
        if (lostBid) rows.push({ id: `${h.id}_${r.assetId}_l`, ts: h.closesAt, text: `Has perdido la puja por ${asset.name}`, positive: false });
      }
    });
  });
  if (rows.length === 0) return <EmptyState title="Sin operaciones todavía" text="Cuando se resuelva un mercado, aquí verás tus fichajes y pujas perdidas." />;
  return (
    <div className="space-y-1.5">
      {rows.map(r => (
        <div key={r.id} className="fl-row px-3 py-2.5">
          <div className="fl-body text-sm" style={{ color: r.positive ? C.positive : C.negative }}>{r.text}</div>
          <div className="fl-mono text-[10px] mt-0.5" style={{ color: C.muted }}>{new Date(r.ts).toLocaleString("es-ES")}</div>
        </div>
      ))}
    </div>
  );
}

/* =============================================================================
   MÁS: Actividad · Jornadas · Administración
   ========================================================================== */
function MasTab({ profile, onToggleAdmin, activity, teams, players, jornadas, marketConfig, market, bids,
  onSaveConfig, onForceResolve, onAddPlayer, onUpdatePlayer, onDeletePlayer, onBulkAddPlayers, onSaveJornada, onDeleteJornada,
  focusRealTeam, onConsumeFocusRealTeam, teamCrests, onSaveTeamCrest }) {
  const [sub, setSub] = useState("actividad");
  const tabs = [["actividad", "Actividad"], ["jornadas", "Jornadas"]];
  if (profile.isAdmin) tabs.push(["admin", "Admin"]);

  // Si venimos de tocar un equipo en "Partidos de la jornada" (Inicio), saltamos
  // directamente a la pestaña Admin para abrir ese equipo real.
  useEffect(() => { if (focusRealTeam) setSub("admin"); }, [focusRealTeam]);

  return (
    <div>
      <div className="flex gap-1.5 mb-3 overflow-x-auto fl-scrollbar">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className="fl-tap whitespace-nowrap fl-mono text-[11px] px-3 py-2 rounded-lg"
            style={{ background: sub === k ? C.baby : "transparent", color: sub === k ? C.ink : C.muted, border: sub === k ? "none" : `1px solid ${C.line}` }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {sub === "actividad" && <ActividadFeed activity={activity} players={players} />}
      {sub === "jornadas" && <JornadasPanel jornadas={jornadas} players={players} isAdmin={profile.isAdmin} onSave={onSaveJornada} onDelete={onDeleteJornada} />}
      {sub === "admin" && profile.isAdmin && (
        <AdminPanel teams={teams} players={players} jornadas={jornadas} marketConfig={marketConfig} market={market} bids={bids}
          onSaveConfig={onSaveConfig} onForceResolve={onForceResolve}
          onAddPlayer={onAddPlayer} onUpdatePlayer={onUpdatePlayer} onDeletePlayer={onDeletePlayer} onBulkAddPlayers={onBulkAddPlayers}
          focusRealTeam={focusRealTeam} onConsumeFocusRealTeam={onConsumeFocusRealTeam}
          teamCrests={teamCrests} onSaveTeamCrest={onSaveTeamCrest} />
      )}
    </div>
  );
}

function ActividadFeed({ activity, players }) {
  if (activity.length === 0) return <EmptyState title="Sin actividad todavía" text="Los fichajes resueltos en el mercado aparecerán aquí." />;
  return (
    <div className="space-y-1.5">
      {activity.map(a => {
        const asset = players.find(p => p.id === a.assetId);
        return (
          <div key={a.id} className="fl-row px-3 py-2.5">
            <div className="fl-body text-sm" style={{ color: C.white }}>
              <span style={{ color: C.baby }}>{a.userId}</span> ha fichado a <span className="font-medium">{asset?.name || "una jugadora"}</span> por {fmtCredits(a.amount)}
            </div>
            <div className="fl-mono text-[10px] mt-0.5" style={{ color: C.muted }}>{new Date(a.ts).toLocaleString("es-ES")}</div>
          </div>
        );
      })}
    </div>
  );
}

function JornadasPanel({ jornadas, players, isAdmin, onSave, onDelete }) {
  const [openId, setOpenId] = useState(null);
  const [draftName, setDraftName] = useState("");
  const realTeams = useMemo(() => realTeamsFrom(players, jornadas), [players, jornadas]);
  const createJornada = async () => {
    const id = uid("j");
    const name = draftName.trim() || `Jornada ${jornadas.length + 1}`;
    await onSave({ id, name, stats: {}, partidos: [] });
    setDraftName(""); setOpenId(id);
  };
  return (
    <div>
      {isAdmin && (
        <div className="flex gap-2 mb-3">
          <input placeholder={`Jornada ${jornadas.length + 1}`} value={draftName} onChange={e => setDraftName(e.target.value)}
            className="flex-1 rounded-md px-2.5 py-1.5 text-sm" style={{ background: C.navy900, border: `1px solid ${C.line}`, color: C.white }} />
          <button onClick={createJornada} className="fl-tap flex items-center gap-1 text-xs font-medium rounded-md px-3 py-1.5" style={{ background: C.baby, color: C.ink }}>
            <Plus size={13} /> Nueva jornada
          </button>
        </div>
      )}
      {jornadas.length === 0 && <EmptyState title="Sin jornadas todavía" text={isAdmin ? "Crea la primera jornada y registra los datos." : "Cuando se registre la primera jornada verás aquí los puntos."} />}
      <div className="space-y-2">
        {[...jornadas].reverse().map(j => (
          <div key={j.id} className="fl-row overflow-hidden">
            <button onClick={() => setOpenId(openId === j.id ? null : j.id)} className="fl-tap w-full flex items-center justify-between px-3 py-2.5">
              <span className="fl-display text-sm uppercase" style={{ color: C.white }}>{j.name}</span>
              <ChevronRight size={16} color={C.muted} style={{ transform: openId === j.id ? "rotate(90deg)" : "none" }} />
            </button>
            {openId === j.id && <JornadaEditor jornada={j} players={players} realTeams={realTeams} isAdmin={isAdmin} onSave={onSave} onDelete={onDelete} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function JornadaEditor({ jornada, players, realTeams, isAdmin, onSave, onDelete }) {
  const [stats, setStats] = useState(jornada.stats || {});
  const [partidos, setPartidos] = useState(jornada.partidos || []);
  const [draftMatch, setDraftMatch] = useState({ local: "", visitante: "", fecha: "", hora: "" });
  const [dirty, setDirty] = useState(false);
  const setField = (playerId, field, value) => { setStats(s => ({ ...s, [playerId]: { ...s[playerId], [field]: value } })); setDirty(true); };
  const addPartido = () => {
    if (!draftMatch.local.trim() || !draftMatch.visitante.trim()) return;
    setPartidos(ms => [...ms, { id: uid("m"), ...draftMatch, local: draftMatch.local.trim(), visitante: draftMatch.visitante.trim() }]);
    setDraftMatch({ local: "", visitante: "", fecha: "", hora: "" });
    setDirty(true);
  };
  const removePartido = (id) => { setPartidos(ms => ms.filter(m => m.id !== id)); setDirty(true); };
  const jugadoras = players.filter(p => p.position !== "DT");
  const entrenadoras = players.filter(p => p.position === "DT");
  const inputStyle = { background: C.navy900, border: `1px solid ${C.line}`, color: C.white };
  return (
    <div className="px-3 pb-3" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
      <div className="mt-2">
        <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>PARTIDOS DE LA JORNADA (EQUIPOS REALES)</div>
        {partidos.length === 0 && <div className="text-xs mb-2" style={{ color: C.muted }}>Todavía no hay partidos añadidos para esta jornada.</div>}
        {partidos.length > 0 && (
          <div className="space-y-1.5 mb-2.5">
            {partidos.map(m => (
              <div key={m.id} className="flex items-center gap-2 px-2.5 py-2 rounded-md" style={{ background: C.navy900, border: `1px solid ${C.lineSoft}` }}>
                <span className="fl-body text-xs flex-1 truncate" style={{ color: C.white }}>{m.local} <span style={{ color: C.muted }}>vs</span> {m.visitante}</span>
                {(m.fecha || m.hora) && <span className="fl-mono text-[10px]" style={{ color: C.muted }}>{[m.fecha, m.hora].filter(Boolean).join(" · ")}</span>}
                {isAdmin && <button onClick={() => removePartido(m.id)} className="p-1 rounded-md"><Trash2 size={13} color={C.negative} /></button>}
              </div>
            ))}
          </div>
        )}
        {isAdmin && (
          <div className="grid grid-cols-2 gap-1.5 mb-1">
            <input list="fl-real-teams" placeholder="Equipo local" value={draftMatch.local} onChange={e => setDraftMatch({ ...draftMatch, local: e.target.value })} className="rounded-md px-2.5 py-1.5 text-xs" style={inputStyle} />
            <input list="fl-real-teams" placeholder="Equipo visitante" value={draftMatch.visitante} onChange={e => setDraftMatch({ ...draftMatch, visitante: e.target.value })} className="rounded-md px-2.5 py-1.5 text-xs" style={inputStyle} />
            <input placeholder="Fecha (opcional)" value={draftMatch.fecha} onChange={e => setDraftMatch({ ...draftMatch, fecha: e.target.value })} className="rounded-md px-2.5 py-1.5 text-xs" style={inputStyle} />
            <input placeholder="Hora (opcional)" value={draftMatch.hora} onChange={e => setDraftMatch({ ...draftMatch, hora: e.target.value })} className="rounded-md px-2.5 py-1.5 text-xs" style={inputStyle} />
            <datalist id="fl-real-teams">{realTeams.map(t => <option key={t} value={t} />)}</datalist>
            <button onClick={addPartido} disabled={!draftMatch.local.trim() || !draftMatch.visitante.trim()}
              className="col-span-2 fl-tap flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium disabled:opacity-40" style={{ background: C.baby, color: C.ink }}>
              <Plus size={13} /> Añadir partido
            </button>
          </div>
        )}
      </div>

      {players.length === 0 && <div className="mt-3"><EmptyState title="No hay jugadoras en el álbum" text="Añade jugadoras primero desde Admin." compact /></div>}
      {jugadoras.length > 0 && (
        <div className="overflow-x-auto fl-scrollbar mt-2">
          <table className="w-full text-xs" style={{ minWidth: 980 }}>
            <thead><tr className="text-left" style={{ color: C.muted }}>
              <th className="py-1.5 pr-2">Jugadora</th><th className="px-1 text-center">Min.</th><th className="px-1 text-center">Pts</th>
              <th className="px-1 text-center">T3</th><th className="px-1 text-center">TL fall.</th>
              <th className="px-1 text-center">Reb.of.</th><th className="px-1 text-center">Reb.def.</th>
              <th className="px-1 text-center">Asist.</th><th className="px-1 text-center">Pérd.</th>
              <th className="px-1 text-center">Robos</th><th className="px-1 text-center">Tap.</th>
              <th className="px-1 text-center">Faltas</th><th className="px-1 text-center">Valor.</th>
              <th className="px-1 text-right">SWISH</th>
            </tr></thead>
            <tbody>
              {jugadoras.map(p => {
                const s = stats[p.id] || {}; const pts = calcPlayerPoints(s, p.position);
                const num = (field, width = "w-9") => (
                  <td className="text-center"><input disabled={!isAdmin} type="number" min={0} className={`${width} text-center rounded`} style={inputStyle}
                    value={s[field] || 0} onChange={e => setField(p.id, field, Number(e.target.value))} /></td>
                );
                return (
                  <tr key={p.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                    <td className="py-1.5 pr-2" style={{ color: C.white }}><div className="font-medium">{p.name}</div><PositionBadge posKey={p.position} /></td>
                    {num("minutos", "w-10")}
                    {num("puntos", "w-10")}
                    {num("t3")}
                    {num("tlibre")}
                    {num("rebofen")}
                    {num("rebdefe")}
                    {num("asist")}
                    {num("pd")}
                    {num("robos")}
                    {num("tap")}
                    {num("faltas")}
                    {num("valoracion", "w-10")}
                    <td className="text-right fl-mono font-semibold" style={{ color: pts >= 0 ? C.positive : C.negative }}>{pts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {entrenadoras.length > 0 && (
        <div className="overflow-x-auto fl-scrollbar mt-4">
          <div className="fl-mono text-[10px] mb-1" style={{ color: C.muted }}>ENTRENADORAS/ES</div>
          <table className="w-full text-xs" style={{ minWidth: 420 }}>
            <thead><tr className="text-left" style={{ color: C.muted }}>
              <th className="py-1.5 pr-2">Nombre</th><th className="px-1 text-center">Jugó</th><th className="px-1 text-center">Victoria</th>
              <th className="px-1 text-center">Diferencia</th><th className="px-1 text-center">MVP</th><th className="px-1 text-right">Fantasy</th>
            </tr></thead>
            <tbody>
              {entrenadoras.map(p => {
                const s = stats[p.id] || {}; const pts = calcPlayerPoints(s, p.position);
                return (
                  <tr key={p.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                    <td className="py-1.5 pr-2" style={{ color: C.white }}><div className="font-medium">{p.name}</div><PositionBadge posKey={p.position} /></td>
                    <td className="text-center"><input disabled={!isAdmin} type="checkbox" checked={!!s.jugo} onChange={e => setField(p.id, "jugo", e.target.checked)} /></td>
                    <td className="text-center"><input disabled={!isAdmin} type="checkbox" checked={!!s.victoria} onChange={e => setField(p.id, "victoria", e.target.checked)} /></td>
                    <td className="text-center"><input disabled={!isAdmin} type="number" className="w-14 text-center rounded" style={inputStyle} value={s.diferencia || 0} onChange={e => setField(p.id, "diferencia", Number(e.target.value))} /></td>
                    <td className="text-center"><input disabled={!isAdmin} type="checkbox" checked={!!s.mvp} onChange={e => setField(p.id, "mvp", e.target.checked)} /></td>
                    <td className="text-right fl-mono font-semibold" style={{ color: pts >= 0 ? C.positive : C.negative }}>{pts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {isAdmin && (
        <div className="flex justify-between items-center mt-3">
          <button onClick={() => onDelete(jornada.id)} className="fl-tap flex items-center gap-1 text-xs" style={{ color: C.negative }}><Trash2 size={13} /> Eliminar jornada</button>
          <button onClick={async () => { await onSave({ ...jornada, stats, partidos }); setDirty(false); }} disabled={!dirty}
            className="fl-tap flex items-center gap-1 text-xs font-medium rounded-md px-3 py-1.5 disabled:opacity-40" style={{ background: C.baby, color: C.ink }}>
            <Check size={13} /> Guardar jornada
          </button>
        </div>
      )}
    </div>
  );
}

/* =============================================================================
   ADMINISTRACIÓN
   ========================================================================== */
function AdminPanel({ teams, players, jornadas, marketConfig, market, bids, onSaveConfig, onForceResolve, onAddPlayer, onUpdatePlayer, onDeletePlayer, onBulkAddPlayers,
  focusRealTeam, onConsumeFocusRealTeam, teamCrests, onSaveTeamCrest }) {
  const [asub, setAsub] = useState("mercado");

  // Si venimos de "Partidos de la jornada" (Inicio), abrimos directamente
  // la pestaña de equipos reales en el equipo tocado.
  useEffect(() => { if (focusRealTeam) setAsub("equiposreales"); }, [focusRealTeam]);

  return (
    <div>
      <div className="flex gap-1.5 mb-3 overflow-x-auto fl-scrollbar">
        {[["mercado", "Mercado"], ["jugadoras", "Jugadoras/DT"], ["equiposreales", "Equipos reales"], ["pujas", "Pujas"], ["equipos", "Equipos fantasy"]].map(([k, l]) => (
          <button key={k} onClick={() => setAsub(k)} className="fl-tap whitespace-nowrap fl-mono text-[11px] px-3 py-2 rounded-lg"
            style={{ background: asub === k ? C.baby : "transparent", color: asub === k ? C.ink : C.muted, border: asub === k ? "none" : `1px solid ${C.line}` }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      {asub === "mercado" && <AdminMercado marketConfig={marketConfig} market={market} onSaveConfig={onSaveConfig} onForceResolve={onForceResolve} />}
      {asub === "jugadoras" && <AdminJugadoras players={players} onAdd={onAddPlayer} onUpdate={onUpdatePlayer} onDelete={onDeletePlayer} onBulkAdd={onBulkAddPlayers} />}
      {asub === "equiposreales" && (
        <RealTeamsPanel players={players} jornadas={jornadas} onAdd={onAddPlayer} onUpdate={onUpdatePlayer} onDelete={onDeletePlayer}
          focusRealTeam={focusRealTeam} onConsumeFocusRealTeam={onConsumeFocusRealTeam}
          teamCrests={teamCrests} onSaveTeamCrest={onSaveTeamCrest} />
      )}
      {asub === "pujas" && <AdminPujas market={market} bids={bids} players={players} />}
      {asub === "equipos" && <AdminEquipos teams={teams} players={players} />}
    </div>
  );
}

// Equipos reales (los clubes a los que pertenecen las jugadoras en la vida real, no los
// equipos fantasy). Lista cada equipo real con su plantilla y permite entrar en uno para
// ir añadiendo jugadoras directamente con ese equipo ya seleccionado.
function RealTeamsPanel({ players, jornadas, onAdd, onUpdate, onDelete, focusRealTeam, onConsumeFocusRealTeam, teamCrests, onSaveTeamCrest }) {
  const teamsList = useMemo(() => realTeamsFrom(players, jornadas), [players, jornadas]);
  const [selected, setSelected] = useState(null);
  const [newTeamName, setNewTeamName] = useState("");

  useEffect(() => {
    if (focusRealTeam?.name) {
      setSelected(focusRealTeam.name);
      onConsumeFocusRealTeam && onConsumeFocusRealTeam();
    }
  }, [focusRealTeam, onConsumeFocusRealTeam]);

  if (selected) {
    return <RealTeamRoster teamName={selected} players={players.filter(p => p.team === selected)}
      crestUrl={teamCrests?.[selected] || ""} onSaveCrest={(url) => onSaveTeamCrest(selected, url)}
      onAdd={onAdd} onUpdate={onUpdate} onDelete={onDelete} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input placeholder="Nombre de un equipo real nuevo" value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
          className="flex-1 rounded-md px-2.5 py-1.5 text-sm" style={{ background: C.navy900, border: `1px solid ${C.line}`, color: C.white }} />
        <button onClick={() => { const n = newTeamName.trim(); if (n) { setSelected(n); setNewTeamName(""); } }} disabled={!newTeamName.trim()}
          className="fl-tap flex items-center gap-1 text-xs font-medium rounded-md px-3 py-1.5 disabled:opacity-40" style={{ background: C.baby, color: C.ink }}>
          <Plus size={13} /> Crear
        </button>
      </div>
      {teamsList.length === 0 ? (
        <EmptyState title="Sin equipos reales todavía" text="Créalos aquí arriba, o añade una jugadora indicando su equipo desde Jugadoras/DT." />
      ) : (
        <div className="space-y-1.5">
          {teamsList.map(name => {
            const count = players.filter(p => p.team === name).length;
            return (
              <button key={name} onClick={() => setSelected(name)} className="fl-tap w-full fl-row flex items-center gap-2.5 px-3 py-2.5">
                <TeamCrest name={name} size={36} photo={teamCrests?.[name]} />
                <div className="flex-1 min-w-0 text-left">
                  <div className="fl-body text-sm font-medium truncate" style={{ color: C.white }}>{name}</div>
                  <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{count} jugadora{count === 1 ? "" : "s"}/DT dada{count === 1 ? "" : "s"} de alta</div>
                </div>
                <ChevronRight size={16} color={C.muted} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Plantilla de un equipo real concreto: escudo (URL editable) + listado de jugadoras/DT
// + alta rápida con el equipo ya preseleccionado.
function RealTeamRoster({ teamName, players, crestUrl, onSaveCrest, onAdd, onUpdate, onDelete, onBack }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", team: teamName, position: "BASE", basePrice: 5, photo: "" });
  const [crestDraft, setCrestDraft] = useState(crestUrl || "");
  const [crestDirty, setCrestDirty] = useState(false);
  const inputStyle = { background: C.navy900, border: `1px solid ${C.line}`, color: C.white };
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={onBack} className="fl-tap -ml-1.5 px-1.5 py-1" style={{ color: C.white }}><ChevronLeft size={20} /></button>
        <TeamCrest name={teamName} size={30} photo={crestUrl} />
        <div className="fl-display text-sm uppercase flex-1 truncate" style={{ color: C.white }}>{teamName}</div>
        <button onClick={() => setShowForm(s => !s)} className="fl-tap flex items-center gap-1 text-xs font-medium rounded-md px-2.5 py-1.5" style={{ background: C.baby, color: C.ink }}>
          <Plus size={13} /> Jugadora/DT
        </button>
      </div>

      <div className="fl-row p-3 mb-3 flex items-center gap-2.5">
        <TeamCrest name={teamName} size={44} photo={crestDirty ? crestDraft : crestUrl} />
        <div className="flex-1 min-w-0">
          <div className="fl-mono text-[10px] mb-1" style={{ color: C.muted }}>ESCUDO DEL EQUIPO (URL DE IMAGEN)</div>
          <input placeholder="https://…" value={crestDraft} onChange={e => { setCrestDraft(e.target.value); setCrestDirty(true); }}
            className="w-full rounded-md px-2.5 py-1.5 text-xs" style={inputStyle} />
        </div>
        <button onClick={async () => { await onSaveCrest(crestDraft.trim()); setCrestDirty(false); }} disabled={!crestDirty}
          className="fl-tap rounded-md px-2.5 py-1.5 text-xs font-medium disabled:opacity-40" style={{ background: C.baby, color: C.ink }}>
          Guardar
        </button>
      </div>

      {showForm && (
        <div className="fl-row p-3 mb-3 grid grid-cols-2 gap-2">
          <input placeholder="Nombre" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="col-span-2 rounded-md px-2.5 py-1.5 text-sm" style={inputStyle} />
          <input placeholder="URL de fotografía (opcional)" value={form.photo} onChange={e => setForm({ ...form, photo: e.target.value })} className="col-span-2 rounded-md px-2.5 py-1.5 text-sm" style={inputStyle} />
          <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="col-span-2 rounded-md px-2.5 py-1.5 text-sm" style={inputStyle}>
            {ALL_POSITIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <input type="number" min={1} max={40} placeholder="Valor inicial" value={form.basePrice} onChange={e => setForm({ ...form, basePrice: Number(e.target.value) })} className="col-span-2 rounded-md px-2.5 py-1.5 text-sm" style={inputStyle} />
          <button disabled={!form.name.trim()} onClick={async () => { await onAdd({ ...form, team: teamName }); setForm({ name: "", team: teamName, position: "BASE", basePrice: 5, photo: "" }); setShowForm(false); }}
            className="col-span-2 fl-tap rounded-md px-2.5 py-1.5 text-sm font-medium disabled:opacity-40" style={{ background: C.baby, color: C.ink }}>
            Añadir a {teamName}
          </button>
        </div>
      )}
      {players.length === 0 ? (
        <EmptyState title="Este equipo todavía no tiene jugadoras" text="Añade la primera con el botón de arriba." />
      ) : (
        <div className="space-y-1.5">
          {players.map(p => (
            <div key={p.id} className="fl-row flex items-center gap-2.5 px-3 py-2.5">
              <PlayerPhoto url={p.photo} size={38} />
              <div className="flex-1 min-w-0">
                <div className="fl-body text-sm font-medium truncate" style={{ color: C.white }}>{p.name}</div>
                <div className="fl-mono text-[10px]" style={{ color: C.muted }}>Valor {fmtCredits(p.basePrice)}</div>
              </div>
              <PositionBadge posKey={p.position} />
              <button onClick={() => onDelete(p.id)} className="p-1.5 rounded-md"><Trash2 size={14} color={C.negative} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminMercado({ marketConfig, market, onSaveConfig, onForceResolve }) {
  const [openHour, setOpenHour] = useState(marketConfig.openHour);
  const [closeHour, setCloseHour] = useState(marketConfig.closeHour);
  const [busy, setBusy] = useState(false);
  const inputStyle = { background: C.navy900, border: `1px solid ${C.line}`, color: C.white };
  return (
    <div className="space-y-3">
      <div className="fl-row p-3.5">
        <div className="fl-display text-sm uppercase mb-2" style={{ color: C.white }}>Horario del mercado</div>
        <p className="fl-body text-[11px] mb-2.5" style={{ color: C.muted }}>Todos los mercados abren y cierran siempre a esta hora, configurada aquí.</p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="fl-mono text-[10px] block mb-1" style={{ color: C.muted }}>APERTURA</label>
            <input type="time" value={openHour} onChange={e => setOpenHour(e.target.value)} className="w-full rounded-md px-2.5 py-1.5 text-sm" style={inputStyle} />
          </div>
          <div className="flex-1">
            <label className="fl-mono text-[10px] block mb-1" style={{ color: C.muted }}>CIERRE</label>
            <input type="time" value={closeHour} onChange={e => setCloseHour(e.target.value)} className="w-full rounded-md px-2.5 py-1.5 text-sm" style={inputStyle} />
          </div>
          <button onClick={async () => { setBusy(true); await onSaveConfig({ openHour, closeHour }); setBusy(false); }} disabled={busy}
            className="fl-tap rounded-md px-3 py-1.5 text-sm font-medium" style={{ background: C.baby, color: C.ink }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : "Guardar"}
          </button>
        </div>
      </div>
      <div className="fl-row p-3.5 flex items-center justify-between">
        <div>
          <div className="fl-body text-sm font-medium" style={{ color: C.white }}>Mercado actual</div>
          <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{market.assetIds.length} activos · cierra {new Date(market.closesAt).toLocaleString("es-ES")}</div>
        </div>
        <button onClick={onForceResolve} className="fl-tap flex items-center gap-1 fl-mono text-[11px] font-medium rounded-md px-3 py-1.5" style={{ background: "transparent", border: `1px solid ${C.baby}`, color: C.baby }}>
          <RefreshCw size={13} /> Cerrar y resolver ahora
        </button>
      </div>
    </div>
  );
}

function AdminJugadoras({ players, onAdd, onUpdate, onDelete, onBulkAdd }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", team: "", position: "BASE", basePrice: 5, photo: "" });
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState(null); // { added, skipped, errors }
  const fileInputRef = useRef(null);
  const inputStyle = { background: C.navy900, border: `1px solid ${C.line}`, color: C.white };

  const handleFile = async (file) => {
    if (!file) return;
    setImportBusy(true); setImportResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const { rows, errors } = parsePlayerRows(json);
      const { added, skipped } = rows.length > 0 ? await onBulkAdd(rows) : { added: 0, skipped: 0 };
      setImportResult({ added, skipped: skipped + errors.length, errors });
    } catch (e) {
      setImportResult({ added: 0, skipped: 0, errors: ["No se pudo leer el archivo. Comprueba que sea un .xlsx válido."] });
    } finally {
      setImportBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="fl-mono text-[11px]" style={{ color: C.muted }}>{players.length} en el álbum</div>
        <div className="flex gap-1.5">
          <button onClick={() => fileInputRef.current?.click()} disabled={importBusy}
            className="fl-tap flex items-center gap-1 text-xs font-medium rounded-md px-2.5 py-1.5 disabled:opacity-50" style={{ background: "transparent", border: `1px solid ${C.baby}`, color: C.baby }}>
            {importBusy ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Importar Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
          <button onClick={() => setShowForm(s => !s)} className="fl-tap flex items-center gap-1 text-xs font-medium rounded-md px-2.5 py-1.5" style={{ background: C.baby, color: C.ink }}>
            <Plus size={13} /> Jugadora/DT
          </button>
        </div>
      </div>

      <p className="fl-body text-[11px] mb-3" style={{ color: C.muted }}>
        El Excel debe tener las columnas: <span style={{ color: C.white }}>Tipo</span> (Jugadora/Entrenador), <span style={{ color: C.white }}>Nombre</span>, <span style={{ color: C.white }}>Equipo</span>, <span style={{ color: C.white }}>Posición</span> (Base/Alero/Pívot), <span style={{ color: C.white }}>Valor (M)</span> y <span style={{ color: C.white }}>Foto (URL)</span> opcional. Reimportar el mismo archivo no duplica filas ya existentes.
      </p>

      {importResult && (
        <div className="fl-row p-3 mb-3">
          <div className="fl-body text-sm font-medium" style={{ color: C.white }}>
            {importResult.added} {importResult.added === 1 ? "añadida" : "añadidas"}
            {importResult.skipped > 0 && <span style={{ color: C.muted }}> · {importResult.skipped} omitida{importResult.skipped === 1 ? "" : "s"}</span>}
          </div>
          {importResult.errors && importResult.errors.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {importResult.errors.slice(0, 8).map((e, i) => (
                <li key={i} className="fl-mono text-[10px]" style={{ color: C.negative }}>{e}</li>
              ))}
              {importResult.errors.length > 8 && <li className="fl-mono text-[10px]" style={{ color: C.muted }}>… y {importResult.errors.length - 8} más.</li>}
            </ul>
          )}
        </div>
      )}

      {showForm && (
        <div className="fl-row p-3 mb-3 grid grid-cols-2 gap-2">
          <input placeholder="Nombre" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="col-span-2 rounded-md px-2.5 py-1.5 text-sm" style={inputStyle} />
          <input placeholder="URL de fotografía (opcional)" value={form.photo} onChange={e => setForm({ ...form, photo: e.target.value })} className="col-span-2 rounded-md px-2.5 py-1.5 text-sm" style={inputStyle} />
          <input placeholder="Equipo real" value={form.team} onChange={e => setForm({ ...form, team: e.target.value })} className="rounded-md px-2.5 py-1.5 text-sm" style={inputStyle} />
          <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="rounded-md px-2.5 py-1.5 text-sm" style={inputStyle}>
            {ALL_POSITIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <input type="number" min={1} max={40} placeholder="Valor inicial" value={form.basePrice} onChange={e => setForm({ ...form, basePrice: Number(e.target.value) })} className="rounded-md px-2.5 py-1.5 text-sm" style={inputStyle} />
          <button disabled={!form.name.trim() || !form.team.trim()} onClick={async () => { await onAdd(form); setForm({ name: "", team: "", position: "BASE", basePrice: 5, photo: "" }); setShowForm(false); }}
            className="fl-tap rounded-md px-2.5 py-1.5 text-sm font-medium disabled:opacity-40" style={{ background: C.baby, color: C.ink }}>
            Añadir al álbum
          </button>
        </div>
      )}
      {players.length === 0 ? (
        <EmptyState title="El álbum está vacío" text="Añade jugadoras y entrenadoras/es; saldrán al mercado por rondas." />
      ) : (
        <div className="space-y-1.5">
          {players.map(p => (
            <div key={p.id} className="fl-row flex items-center gap-2.5 px-3 py-2.5">
              <PlayerPhoto url={p.photo} size={38} />
              <div className="flex-1 min-w-0">
                <div className="fl-body text-sm font-medium truncate" style={{ color: C.white }}>{p.name}</div>
                <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{p.team} · Valor {fmtCredits(p.basePrice)}</div>
              </div>
              <PositionBadge posKey={p.position} />
              <button onClick={() => onDelete(p.id)} className="p-1.5 rounded-md"><Trash2 size={14} color={C.negative} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminPujas({ market, bids, players }) {
  const rows = auctionService.activeBidsForMarket(bids, market.id).sort((a, b) => b.amount - a.amount);
  if (rows.length === 0) return <EmptyState title="Sin pujas activas" text="Aquí verás, como administración, todas las pujas con su usuario." />;
  return (
    <div className="space-y-1.5">
      <p className="fl-body text-[11px] mb-1" style={{ color: C.muted }}>Visible solo para administración. Los usuarios nunca ven esta información.</p>
      {rows.map(b => {
        const asset = players.find(p => p.id === b.assetId);
        return (
          <div key={b.id} className="fl-row flex items-center justify-between px-3 py-2.5">
            <div>
              <div className="fl-body text-sm font-medium" style={{ color: C.white }}>{asset?.name || b.assetId}</div>
              <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{b.userId} · {new Date(b.createdAt).toLocaleTimeString("es-ES")}</div>
            </div>
            <div className="fl-mono text-sm font-semibold" style={{ color: C.baby }}>{fmtCredits(b.amount)}</div>
          </div>
        );
      })}
    </div>
  );
}

function AdminEquipos({ teams, players }) {
  const entries = Object.entries(teams);
  if (entries.length === 0) return <EmptyState title="Sin equipos todavía" text="Aparecerán cuando alguien entre en la liga." />;
  return (
    <div className="space-y-1.5">
      {entries.map(([name, t]) => {
        const available = (t.budgetTotal || 0) - (t.budgetSpent || 0);
        return (
          <div key={name} className="fl-row px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="fl-body text-sm font-medium" style={{ color: C.white }}>{name}</span>
              <span className="fl-mono text-xs" style={{ color: C.baby }}>{fmtCredits(available)} disp.</span>
            </div>
            <div className="fl-mono text-[10px] mt-0.5" style={{ color: C.muted }}>{(t.squad || []).length} fichajes · gastado {fmtCredits(t.budgetSpent || 0)}</div>
          </div>
        );
      })}
    </div>
  );
}
