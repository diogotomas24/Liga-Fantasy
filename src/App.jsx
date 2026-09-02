import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Trophy, Users, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Plus, Trash2,
  Check, Loader2, RefreshCw, TrendingUp, TrendingDown, Minus, Star, Clock,
  ShieldCheck, Gavel, Wallet, Menu, Coins, Pencil, X, Lock,
  ImageOff, CircleCheck, CircleX, CircleDot, Search, Bell, BellOff,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";

/* =============================================================================
   IDENTIDAD VISUAL
   Azul marino (estructura/fondos) · Blanco (contraste/tarjetas) · Azul bebé (acción)
   ========================================================================== */
const C = {
  navy900: "#0A0F1A",
  navy800: "#141A27",
  navy700: "#1C2333",
  navy600: "#232B3F",
  line: "rgba(255,255,255,0.10)",
  lineSoft: "rgba(255,255,255,0.06)",
  white: "#FFFFFF",
  ink: "#0A0F1A",
  muted: "rgba(168,181,199,0.72)",
  mutedInk: "rgba(10,15,26,0.55)",
  // "baby" = color de acción (botones, pestañas activas, importes) — Secundario naranja
  baby: "#FF8A00",
  babyDark: "#CC6E00",
  babySoft: "rgba(255,138,0,0.14)",
  // "principal" = color de identidad/marca (cabecera, degradados, ranking, cancha) — Principal rosa
  principal: "#FF3D7F",
  principalSoft: "rgba(255,61,127,0.16)",
  gold: "#FFC83D",
  positive: "#35E59A",
  negative: "#FF5C7A",
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
// Multiplicador aleatorio (entre 1,45 y 1,66) para la cláusula del reparto inicial de jugadoras.
const randomClauseMultiplier = () => 1.45 + Math.random() * (1.66 - 1.45);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Los valores internos siguen en "millones" (100 = 100 M), pero se muestran
// como euros completos con separador de miles, p. ej. fmtCredits(2.3) -> "2.300.000 €".
function fmtCredits(n) {
  const euros = Math.round((n || 0) * 1000000);
  return `${euros.toLocaleString("es-ES")} €`;
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
const CLAUSE_LOCK_DAYS = 14;
const CLAUSE_LOCK_MS = CLAUSE_LOCK_DAYS * 24 * 3600 * 1000;
const teamService = {
  emptyTeam() {
    return {
      budgetTotal: BUDGET_TOTAL,
      budgetSpent: 0,
      squad: [], // [{ id, pricePaid, clause, acquiredAt, forSale, saleOffer }]
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
  // Cláusula: durante los primeros 14 días desde que se adquirió, la jugadora está
  // protegida (nadie de fuera puede comprar su cláusula, aunque su propia persona
  // dueña sí puede subirla pagando). Pasado ese plazo, cualquiera puede pagar la
  // cláusula (un importe guardado, no recalculado) y llevársela.
  isClauseLocked(entry) {
    return Date.now() < (entry?.acquiredAt || 0) + CLAUSE_LOCK_MS;
  },
  clauseUnlockAt(entry) {
    return (entry?.acquiredAt || 0) + CLAUSE_LOCK_MS;
  },
  addAsset(team, asset, pricePaid) {
    return { ...team, squad: [...(team.squad || []), { id: asset.id, pricePaid, clause: pricePaid, acquiredAt: Date.now() }], budgetSpent: (team.budgetSpent || 0) + pricePaid };
  },
  // Añade el reparto inicial a la plantilla SIN descontar presupuesto: el valor de equipo del
  // sorteo (90-100 M) es aparte de los 100 M que cada persona tiene disponibles para pujar.
  // Cada jugadora del reparto inicial nace con una cláusula igual a su valor de mercado ×
  // un multiplicador aleatorio entre 1,45 y 1,66 (independiente para cada una).
  addInitialSquad(team, entries) {
    const squadEntries = entries.map(e => ({
      id: e.id, pricePaid: e.price, acquiredAt: Date.now(), initial: true,
      clause: Math.round(e.price * randomClauseMultiplier()),
    }));
    return { ...team, squad: [...(team.squad || []), ...squadEntries] };
  },
  // Transferencia entre plantillas (cláusula pagada a otro usuario, u oferta aceptada): la
  // jugadora entra en la plantilla compradora con la cláusula igual al importe pagado y un
  // nuevo periodo de protección de 14 días.
  receiveTransfer(team, asset, amountPaid) {
    return { ...team, squad: [...(team.squad || []), { id: asset.id, pricePaid: amountPaid, clause: amountPaid, acquiredAt: Date.now(), transferred: true }], budgetSpent: (team.budgetSpent || 0) + amountPaid };
  },
  // Lado vendedor de una cláusula pagada, de una venta directa a la liga, o de una oferta de
  // compra aceptada: se libera la jugadora y se abona el importe recibido (baja su presupuesto
  // gastado, es decir, sube su disponible).
  receiveSaleProceeds(team, assetId, amountReceived) {
    const released = teamService.removeAsset(team, assetId);
    return { ...released, budgetSpent: (released.budgetSpent || 0) - amountReceived };
  },
  getSquadEntry(team, assetId) { return (team?.squad || []).find(e => e.id === assetId) || null; },
  // Marca/desmarca una jugadora "en venta" (visible en el Mercado para el resto de la liga,
  // y recibirá una oferta de la liga al abrirse el siguiente mercado). Al desmarcarla se
  // borra cualquier oferta pendiente que hubiera.
  setForSale(team, assetId, forSale) {
    const squad = (team.squad || []).map(e => e.id === assetId ? { ...e, forSale, saleOffer: forSale ? e.saleOffer : null } : e);
    return { ...team, squad };
  },
  setSaleOffer(team, assetId, offer) {
    const squad = (team.squad || []).map(e => e.id === assetId ? { ...e, saleOffer: offer } : e);
    return { ...team, squad };
  },
  // Sube la cláusula de tu propia jugadora pagando: el importe pagado se descuenta del
  // presupuesto y la cláusula sube el DOBLE de lo pagado (pagar 1 M sube la cláusula 2 M).
  raiseClause(team, assetId, payAmount) {
    const squad = (team.squad || []).map(e => e.id === assetId ? { ...e, clause: (e.clause || 0) + payAmount * 2 } : e);
    return { ...team, squad, budgetSpent: (team.budgetSpent || 0) + payAmount };
  },
  // Si el valor de mercado de una jugadora sube por encima de su cláusula guardada, la
  // cláusula sube para igualarlo (nunca baja sola). Se llama tras cerrar cada jornada.
  bumpClausesToMarket(team, players) {
    let changed = false;
    const squad = (team.squad || []).map(e => {
      const player = players.find(p => p.id === e.id);
      if (!player) return e;
      const marketValue = player.basePrice || 0;
      if (marketValue > (e.clause || 0)) { changed = true; return { ...e, clause: marketValue }; }
      return e;
    });
    return changed ? { ...team, squad } : team;
  },
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
    if (teamService.isClauseLocked(entry)) {
      const d = new Date(teamService.clauseUnlockAt(entry));
      return { ok: false, error: `Cláusula protegida hasta el ${d.toLocaleDateString("es-ES")}.` };
    }
    const clause = entry.clause || asset.basePrice || 1; // valor de cláusula guardado (sube con el mercado y al pagar por subirla)
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

// --- offerService --------------------------------------------------------
// Ofertas de compra directas entre usuarios: a diferencia de la cláusula (que
// exige un mínimo y se ejecuta al instante), aquí el comprador propone
// CUALQUIER importe y es la persona vendedora quien decide aceptar o
// rechazar. Funcionan en cualquier momento, esté el mercado abierto o no, e
// incluso mientras la jugadora sigue protegida por la cláusula de 14 días.
const offerService = {
  pendingForUser(offers, userId) {
    return offers.filter(o => o.status === "pending" && (o.fromUser === userId || o.toUser === userId));
  },
  validateSend({ buyerName, buyerTeam, sellerName, sellerTeam, players, asset, amount, bids, marketId, offers }) {
    if (!buyerTeam || !sellerTeam) return { ok: false, error: "No se pudo leer alguna de las plantillas. Inténtalo de nuevo." };
    if (buyerName === sellerName) return { ok: false, error: "Ya es tuya." };
    const entry = teamService.getSquadEntry(sellerTeam, asset.id);
    if (!entry) return { ok: false, error: "Esta jugadora ya no pertenece a esa plantilla." };
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Introduce un importe válido." };
    if (asset.position === "DT") {
      if (!teamService.hasRoomForCoach(buyerTeam, players)) return { ok: false, error: "Ya tienes entrenadora/or. Libérala primero." };
    } else if (!teamService.hasRoomForSquad(buyerTeam, players)) {
      return { ok: false, error: `Tu plantilla ya tiene el máximo de ${MAX_SQUAD_JUGADORAS} jugadoras.` };
    }
    const available = auctionService.availableBudget(buyerTeam, bids || [], marketId, buyerName);
    if (amount > available) return { ok: false, error: `Presupuesto insuficiente. Disponible: ${fmtCredits(available)}.` };
    const already = offers.find(o => o.status === "pending" && o.fromUser === buyerName && o.assetId === asset.id && o.toUser === sellerName);
    if (already) return { ok: false, error: "Ya tienes una oferta pendiente por esta jugadora." };
    return { ok: true };
  },
  create(offers, { fromUser, toUser, assetId, amount }) {
    return [...offers, { id: uid("of"), fromUser, toUser, assetId, amount, createdAt: Date.now(), status: "pending" }];
  },
  setStatus(offers, offerId, status) {
    return offers.map(o => o.id === offerId ? { ...o, status } : o);
  },
};

// --- tripleFantasyService --------------------------------------------------
// Quiniela semanal: 1 M€ de entrada, acertar el ganador de los 7 partidos de
// la jornada y quién será la MVP. Dinero 100% ficticio del propio juego.
const TRIPLE_ENTRY_FEE = 1; // 1 M€
const TRIPLE_PRIZE_TABLE = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 2, 6: 3.5, 7: 5 };
const TRIPLE_PRIZE_PERFECT_MVP = 6;

const tripleFantasyService = {
  // Ganador de un partido a partir de su marcador ("local" | "visitante" | null si no hay marcador aún).
  matchWinner(partido) {
    const { marcadorLocal: l, marcadorVisitante: v } = partido;
    if (l === undefined || l === null || l === "" || v === undefined || v === null || v === "") return null;
    const ln = Number(l), vn = Number(v);
    if (ln === vn) return null; // empate: no cuenta como partido resuelto (raro en baloncesto)
    return ln > vn ? "local" : "visitante";
  },
  // Puntos Fantasy totales de cada jugadora en UNA jornada concreta.
  jornadaPointsByPlayer(jornada, players) {
    const totals = {};
    Object.entries(jornada.stats || {}).forEach(([pid, s]) => {
      const pl = players.find(x => x.id === pid);
      if (pl && pl.position !== "DT") totals[pid] = calcPointsBreakdown(s, pl.position).total;
    });
    return totals;
  },
  // Puntos Fantasy acumulados de cada jugadora en TODA la temporada hasta la fecha.
  seasonPointsByPlayer(players, jornadas) {
    const totals = {};
    (players || []).forEach(p => { if (p.position !== "DT") totals[p.id] = 0; });
    (jornadas || []).forEach(j => {
      Object.entries(j.stats || {}).forEach(([pid, s]) => {
        const pl = players.find(x => x.id === pid);
        if (pl && pl.position !== "DT") totals[pid] = (totals[pid] || 0) + calcPointsBreakdown(s, pl.position).total;
      });
    });
    return totals;
  },
  // MVP real de la jornada: la que más puntos Fantasy hace ESA jornada. Si hay
  // empate, desempata quien lleve más puntos acumulados en toda la temporada
  // entre las empatadas. Lo decide el juego solo, con las estadísticas ya
  // cargadas — no hace falta indicarlo a mano en ningún sitio.
  computeActualMvp(jornada, players, jornadas) {
    const jornadaPoints = tripleFantasyService.jornadaPointsByPlayer(jornada, players);
    const entries = Object.entries(jornadaPoints);
    if (entries.length === 0) return null;
    const maxPts = Math.max(...entries.map(([, pts]) => pts));
    const tied = entries.filter(([, pts]) => pts === maxPts).map(([id]) => id);
    if (tied.length === 1) return tied[0];
    const seasonPoints = tripleFantasyService.seasonPointsByPlayer(players, jornadas);
    tied.sort((a, b) => (seasonPoints[b] || 0) - (seasonPoints[a] || 0) || a.localeCompare(b));
    return tied[0];
  },
  // La jornada está lista para repartir premios cuando los 7 partidos tienen
  // marcador Y hay estadísticas cargadas (para poder calcular la MVP real).
  isJornadaReady(jornada) {
    const partidos = jornada?.partidos || [];
    if (partidos.length === 0 || !jornada.stats || Object.keys(jornada.stats).length === 0) return false;
    return partidos.every(p => tripleFantasyService.matchWinner(p) !== null);
  },
  // Top 7 candidatas a MVP: por puntos Fantasy acumulados hasta la fecha: si
  // todavía nadie tiene puntos (inicio de temporada), se ordena por valor de
  // mercado en su lugar.
  computeMvpCandidates(players, jornadas) {
    const totals = tripleFantasyService.seasonPointsByPlayer(players, jornadas);
    const hasPoints = Object.values(totals).some(v => v > 0);
    return Object.entries(totals)
      .map(([id, pts]) => ({ player: players.find(p => p.id === id), pts }))
      .filter(x => x.player)
      .sort((a, b) => hasPoints ? (b.pts - a.pts) : ((b.player.basePrice || 0) - (a.player.basePrice || 0)))
      .slice(0, 7)
      .map(x => x.player);
  },
  // Corrige una participación contra el resultado real de la jornada. `actualMvpId`
  // es el id calculado por computeActualMvp para esa jornada.
  scoreEntry(entry, jornada, actualMvpId) {
    const partidos = jornada.partidos || [];
    let correct = 0;
    partidos.forEach(p => {
      const actual = tripleFantasyService.matchWinner(p);
      const pick = entry.picks?.[p.id];
      if (actual && pick && actual === pick) correct++;
    });
    const mvpCorrect = entry.mvpChoice === "otra"
      ? !(entry.mvpOptions || []).includes(actualMvpId)
      : entry.mvpChoice === actualMvpId;
    let prize = TRIPLE_PRIZE_TABLE[correct] ?? 0;
    if (correct === partidos.length && mvpCorrect) prize = TRIPLE_PRIZE_PERFECT_MVP;
    return { correct, mvpCorrect, prize, actualMvpId };
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
  // Al generarse un mercado nuevo, cualquier jugadora marcada "en venta" que no
  // tenga ya una oferta válida para ESTE mercado recibe una oferta nueva de la
  // liga, por un importe aleatorio entre el 90% y el 110% de su valor actual.
  // La oferta es válida solo hasta que se cierre este mercado.
  refreshSaleOffers(teams, players, newMarket) {
    const nextTeams = {};
    let changed = false;
    Object.entries(teams).forEach(([name, team]) => {
      let teamChanged = false;
      const squad = (team.squad || []).map(e => {
        if (!e.forSale) return e;
        if (e.saleOffer && e.saleOffer.marketId === newMarket.id) return e;
        const player = players.find(p => p.id === e.id);
        if (!player) return e;
        const ratio = 0.9 + Math.random() * 0.2; // entre -10% y +10% del valor actual
        const amount = Math.max(0.01, player.basePrice * ratio);
        teamChanged = true;
        return { ...e, saleOffer: { amount, marketId: newMarket.id, expiresAt: newMarket.closesAt } };
      });
      if (teamChanged) { nextTeams[name] = { ...team, squad }; changed = true; }
      else nextTeams[name] = team;
    });
    return { teams: nextTeams, changed };
  },
};

// --- rankingService ------------------------------------------------------
const rankingService = {
  // `filterJornadaId`: null/"total" para el acumulado de toda la temporada (comportamiento
  // de siempre); o el id de una jornada concreta para ver solo los puntos de esa jornada.
  // `leagueId`: las jornadas son compartidas por TODAS las ligas, así que el snapshot de
  // alineaciones de cada jornada se guarda con una clave compuesta "liga::equipo" para que
  // dos ligas distintas con un mismo nombre de equipo nunca se mezclen entre sí.
  computeStandings(teams, players, jornadas, leagueId, filterJornadaId = null) {
    const lineupKey = (teamName) => `${leagueId}::${teamName}`;
    const totalUpTo = (teamName, lineup, upToIdx) =>
      jornadas.slice(0, upToIdx).reduce((s, j) => s + computeTeamJornadaPoints(j, lineupKey(teamName), lineup, players), 0);
    const singleJornada = filterJornadaId ? jornadas.find(j => j.id === filterJornadaId) : null;
    const pointsFor = (teamName, lineup) => singleJornada
      ? computeTeamJornadaPoints(singleJornada, lineupKey(teamName), lineup, players)
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
   Varias tablas reales, cada una gestionable desde el Table Editor de Supabase:
   - "players": jugadoras/entrenadoras (id, name, team, position, base_price,
     photo, prev_base_price, price_history).
   - "jornadas" + "partidos" + "jornada_stats": calendario, marcadores y
     estadísticas de cada jugadora por jornada.
   - "market_config": hora de apertura/cierre del mercado.
   - "team_crests": escudo de cada equipo real.
   Y "kv_store" (key text, value jsonb): almacén clave-valor genérico solo
   para el ESTADO DE JUEGO EN DIRECTO, que genera la propia app (no se edita
   a mano): equipos fantasy de cada persona, mercado actual, pujas, histórico
   de mercado y actividad reciente.
   Lo PERSONAL (perfil del dispositivo, favoritos) todavía no tiene login real
   (eso llega en el siguiente paso), así que de momento vive en localStorage,
   solo en este navegador.
   ========================================================================== */

// Lee TODAS las jugadoras/entrenadoras desde la tabla real "players".
async function readPlayers() {
  try {
    const { data, error } = await supabase.from("players").select("*");
    if (error) throw error;
    return (data || []).map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      position: p.position,
      basePrice: Number(p.base_price) || 0,
      prevBasePrice: p.prev_base_price != null ? Number(p.prev_base_price) : Number(p.base_price) || 0,
      photo: p.photo || "",
      priceHistory: p.price_history || [],
    }));
  } catch {
    return [];
  }
}

// Tras resolver una jornada, actualiza en la tabla real SOLO las jugadoras
// cuyo valor cambió (las que tenían estadísticas en esa jornada).
async function writePlayersAfterJornada(updatedPlayers, jornada) {
  const changed = updatedPlayers.filter((p) => jornada.stats && jornada.stats[p.id]);
  try {
    await Promise.all(changed.map((p) =>
      supabase.from("players").update({
        base_price: p.basePrice,
        prev_base_price: p.prevBasePrice,
        price_history: p.priceHistory,
      }).eq("id", p.id)
    ));
    return true;
  } catch {
    return false;
  }
}

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

// Lee TODOS los equipos de TODAS las ligas a la vez (con clave compuesta
// "liga::nombre"). Se usa solo para cosas que son globales por diseño: el
// snapshot de alineaciones al guardar una jornada, y el cálculo de demanda
// para el movimiento de precios de las jugadoras (que también es global).
async function readAllTeamsGlobal() {
  try {
    const { data, error } = await supabase.from("kv_store").select("key,value").like("key", `${TEAM_KEY_PREFIX}%`);
    if (error) throw error;
    const map = {};
    (data || []).forEach((row) => {
      const t = row.value;
      const rest = row.key.slice(TEAM_KEY_PREFIX.length); // "<leagueId>_<slug>"
      const sep = rest.indexOf("_");
      const leagueId = sep >= 0 ? rest.slice(0, sep) : rest;
      const name = t?.name || (sep >= 0 ? rest.slice(sep + 1) : rest);
      map[`${leagueId}::${name}`] = { ...t, name, leagueId };
    });
    return map;
  } catch {
    return null;
  }
}

/* -----------------------------------------------------------------------
   LIGAS PRIVADAS — tabla real "leagues" (id, name, invite_code, created_by).
   Cada persona puede crear su propia liga (y se convierte automáticamente en
   la primera participante) o unirse a la de otra persona con un código de
   invitación. Todo lo demás de la partida (jugadoras, jornadas, resultados,
   horario del mercado) es compartido por TODAS las ligas; lo único que
   cambia entre ligas es quién participa, su mercado, sus pujas y sus equipos.
   ----------------------------------------------------------------------- */
function generateInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin caracteres ambiguos (0/O, 1/I...)
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function createLeagueRow(name, creatorName) {
  const id = uid("lg");
  const invite_code = generateInviteCode();
  try {
    const { error } = await supabase.from("leagues").insert({ id, name, invite_code, created_by: creatorName });
    if (error) throw error;
    return { id, name, invite_code, created_by: creatorName };
  } catch {
    return null;
  }
}

async function findLeagueByCode(code) {
  try {
    const { data, error } = await supabase.from("leagues").select("*").eq("invite_code", (code || "").trim().toUpperCase()).maybeSingle();
    if (error) throw error;
    return data || null;
  } catch {
    return null;
  }
}

async function readLeaguesByIds(ids) {
  if (!ids || ids.length === 0) return [];
  try {
    const { data, error } = await supabase.from("leagues").select("*").in("id", ids);
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

// Lista local (en este dispositivo) de las ligas en las que participa esta
// persona. Al no haber login real, es lo más simple para poder estar en
// varias ligas a la vez, como pide el diseño de "Mis ligas".
async function readMyLeagueIds() { return await readPersonal("myLeagues", []); }
async function addMyLeagueId(id) {
  const ids = await readMyLeagueIds();
  if (!ids.includes(id)) { const next = [...ids, id]; await writePersonal("myLeagues", next); return next; }
  return ids;
}

/* -----------------------------------------------------------------------
   JORNADAS / PARTIDOS / ESTADÍSTICAS — tablas reales de Supabase.
   Se gestionan por completo desde la propia app (Admin → Jornadas), pero
   viven en tablas "jornadas", "partidos" y "jornada_stats" para que también
   se puedan consultar o corregir a mano desde el Table Editor de Supabase.
   ----------------------------------------------------------------------- */
function jornadaNumberFromName(name) {
  const m = /(\d+)/.exec(name || "");
  return m ? Number(m[1]) : 0;
}

async function readJornadas() {
  try {
    const [{ data: jRows, error: e1 }, { data: pRows, error: e2 }, { data: sRows, error: e3 }] = await Promise.all([
      supabase.from("jornadas").select("*"),
      supabase.from("partidos").select("*"),
      supabase.from("jornada_stats").select("*"),
    ]);
    if (e1) throw e1; if (e2) throw e2; if (e3) throw e3;

    const partidosByJornada = {};
    (pRows || []).forEach((p) => {
      const list = partidosByJornada[p.jornada_id] || (partidosByJornada[p.jornada_id] = []);
      list.push({
        id: p.id, local: p.local, visitante: p.visitante,
        fecha: p.fecha || "", hora: p.hora || "",
        marcadorLocal: p.marcador_local ?? "", marcadorVisitante: p.marcador_visitante ?? "",
      });
    });
    const statsByJornada = {};
    (sRows || []).forEach((s) => {
      const map = statsByJornada[s.jornada_id] || (statsByJornada[s.jornada_id] = {});
      map[s.player_id] = {
        minutos: s.minutos || 0, puntos: s.puntos || 0, t3: s.t3 || 0, tlibre: s.tlibre || 0,
        rebofen: s.rebofen || 0, rebdefe: s.rebdefe || 0, asist: s.asist || 0, pd: s.pd || 0,
        robos: s.robos || 0, tap: s.tap || 0, faltas: s.faltas || 0, valoracion: s.valoracion || 0,
        jugo: !!s.jugo, victoria: !!s.victoria, diferencia: s.diferencia || 0, mvp: !!s.mvp,
      };
    });
    return (jRows || [])
      .map((j) => ({
        id: j.id, name: j.name,
        partidos: partidosByJornada[j.id] || [],
        stats: statsByJornada[j.id] || {},
        lineups: j.lineups || {},
        mvpPlayerId: j.mvp_player_id || null,
      }))
      .sort((a, b) => jornadaNumberFromName(a.name) - jornadaNumberFromName(b.name));
  } catch {
    return [];
  }
}

// Guarda una jornada completa: cabecera + partidos (se reemplazan todos, es
// más simple y fiable que hacer un upsert selectivo) + estadísticas.
async function writeJornada(jornada) {
  try {
    const { id, name, lineups, partidos, stats, mvpPlayerId } = jornada;
    await supabase.from("jornadas").upsert({ id, name, lineups: lineups || {}, mvp_player_id: mvpPlayerId || null });

    await supabase.from("partidos").delete().eq("jornada_id", id);
    if (partidos && partidos.length > 0) {
      const rows = partidos.map((p) => ({
        id: p.id, jornada_id: id, local: p.local, visitante: p.visitante,
        fecha: p.fecha || null, hora: p.hora || null,
        marcador_local: (p.marcadorLocal === "" || p.marcadorLocal == null) ? null : Number(p.marcadorLocal),
        marcador_visitante: (p.marcadorVisitante === "" || p.marcadorVisitante == null) ? null : Number(p.marcadorVisitante),
      }));
      await supabase.from("partidos").insert(rows);
    }

    const statsEntries = Object.entries(stats || {});
    if (statsEntries.length > 0) {
      const rows = statsEntries.map(([playerId, s]) => ({
        jornada_id: id, player_id: playerId,
        minutos: s.minutos || 0, puntos: s.puntos || 0, t3: s.t3 || 0, tlibre: s.tlibre || 0,
        rebofen: s.rebofen || 0, rebdefe: s.rebdefe || 0, asist: s.asist || 0, pd: s.pd || 0,
        robos: s.robos || 0, tap: s.tap || 0, faltas: s.faltas || 0, valoracion: s.valoracion || 0,
        jugo: !!s.jugo, victoria: !!s.victoria, diferencia: s.diferencia || 0, mvp: !!s.mvp,
      }));
      await supabase.from("jornada_stats").upsert(rows, { onConflict: "jornada_id,player_id" });
    }
    return true;
  } catch {
    return false;
  }
}

async function deleteJornadaRow(id) {
  try { await supabase.from("jornadas").delete().eq("id", id); return true; }
  catch { return false; }
}

/* -----------------------------------------------------------------------
   CONFIGURACIÓN DEL MERCADO y ESCUDOS DE EQUIPOS REALES — tablas reales.
   ----------------------------------------------------------------------- */
async function readMarketConfig() {
  try {
    const { data, error } = await supabase.from("market_config").select("*").eq("id", "singleton").maybeSingle();
    if (error) throw error;
    return data ? { openHour: data.open_hour, closeHour: data.close_hour } : null;
  } catch { return null; }
}
async function writeMarketConfig(cfg) {
  try {
    const { error } = await supabase.from("market_config").upsert({ id: "singleton", open_hour: cfg.openHour, close_hour: cfg.closeHour });
    if (error) throw error;
    return true;
  } catch { return false; }
}

async function readTeamCrests() {
  try {
    const { data, error } = await supabase.from("team_crests").select("*");
    if (error) throw error;
    const map = {};
    (data || []).forEach((r) => { map[r.team_name] = r.url; });
    return map;
  } catch { return {}; }
}
async function writeTeamCrestRow(teamName, url) {
  try {
    const { error } = await supabase.from("team_crests").upsert({ team_name: teamName, url });
    if (error) throw error;
    return true;
  } catch { return false; }
}

/* -----------------------------------------------------------------------
   NOTIFICACIONES PUSH — avisos reales al móvil (ofertas recibidas, fichajes
   propios y cláusulas pagadas por otras personas). Requiere que la persona
   dé permiso de notificaciones en su navegador; si lo rechaza o el navegador
   no lo soporta, la app sigue funcionando exactamente igual, solo sin avisos.
   ----------------------------------------------------------------------- */
const VAPID_PUBLIC_KEY = "BEb_YAJUzyeqI2SNI51zv9oilAel3545PYtegrhiCTWm6AwO0JJJDXPIzq81aLVpzcCNwO0oIFQ7cCLd-6pXicI";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

// Pide permiso, se suscribe al push del navegador, y guarda la suscripción en
// Supabase asociada a esta persona + esta liga. Devuelve true si ha quedado activada.
async function enablePushNotifications(leagueId, userName) {
  if (!pushSupported()) return false;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = subscription.toJSON();
    await supabase.from("push_subscriptions").upsert({
      id: uid("push"), league_id: leagueId, user_name: userName,
      endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
    }, { onConflict: "endpoint" });
    return true;
  } catch {
    return false;
  }
}

// Envía un aviso a otra persona (o a ti misma) de esta liga. "Fire and forget":
// si falla (sin conexión, función no desplegada todavía, etc.) no interrumpe
// nada de lo que esté haciendo la app.
function sendPushNotification(leagueId, userName, title, body, extra) {
  try {
    supabase.functions.invoke("send-push", { body: { leagueId, userName, title, body, ...extra } }).catch(() => {});
  } catch {}
}

/* -----------------------------------------------------------------------
   Cada equipo vive en SU PROPIA fila ("team_<liga>_<slug>") en vez de todos
   compartiendo un único blob. Así, guardar una alineación, liberar una
   jugadora o resolver el mercado son lecturas/escrituras que solo tocan la
   fila del equipo afectado, y dos operaciones sobre EQUIPOS DISTINTOS (o de
   LIGAS DISTINTAS) ya no pueden pisarse la una a la otra.
   El resto de datos "en directo" de una liga (mercado actual, pujas,
   histórico de mercado, actividad) usan la misma idea: una clave de
   kv_store por liga, con el id de la liga metido en el nombre de la clave.
   ----------------------------------------------------------------------- */
const TEAM_KEY_PREFIX = "team_";
function teamKey(leagueId, name) { return `${TEAM_KEY_PREFIX}${leagueId}_${slug(name) || "x"}`; }
function leagueKey(leagueId, base) { return `${base}_${leagueId}`; }

async function readTeam(leagueId, name) {
  return await readShared(teamKey(leagueId, name), null);
}
async function writeTeam(leagueId, name, team) {
  // Guardamos el nombre dentro del propio registro para poder reconstruir
  // el mapa { nombre -> equipo } sin depender de un índice compartido aparte.
  return await writeShared(teamKey(leagueId, name), { ...team, name });
}
// Lee TODOS los equipos DE UNA LIGA, pero como una sola consulta filtrando
// por prefijo de clave, nunca como un read-modify-write sobre un blob
// compartido. Se usa solo para mostrar datos (clasificación, mercado, ids
// ocupados, etc.), nunca como base para luego escribir de vuelta un blob
// completo.
//
// IMPORTANTE: si algo falla, esta función devuelve `null`, NUNCA un mapa
// vacío o a medias. Un mapa vacío/parcial es indistinguible de "esta gente no
// tiene equipo" y, si alguien lo usa para decidir qué escribir (p. ej. al
// resolver el mercado), un equipo real que "faltaba" por un fallo de red se
// trataría como un equipo nuevo vacío y se perdería su plantilla y su
// presupuesto gastado. Devolver `null` obliga a quien llama a tratarlo como
// "inténtalo en el siguiente ciclo", no como "no había nada".
async function readAllTeams(leagueId) {
  try {
    const prefix = `${TEAM_KEY_PREFIX}${leagueId}_`;
    const { data, error } = await supabase.from("kv_store").select("key,value").like("key", `${prefix}%`);
    if (error) throw error;
    const map = {};
    (data || []).forEach((row) => {
      const t = row.value;
      const name = t?.name || row.key.slice(prefix.length);
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

// Parsea una fecha en formato "DD/MM/AAAA" (el que usan los partidos). Si el
// texto no tiene ese formato, devuelve null.
function parseFechaDDMMYYYY(str) {
  if (!str) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return isNaN(date.getTime()) ? null : date;
}

// Fecha "de referencia" de una jornada: la de su primer partido (todos los
// partidos de una misma jornada comparten fecha en el calendario oficial).
function jornadaDate(jornada) {
  return parseFechaDDMMYYYY(jornada?.partidos?.[0]?.fecha);
}

// Momento exacto en que arranca una jornada: el partido con fecha+hora más
// temprano de todos los suyos. Si ningún partido tiene fecha Y hora
// rellenadas, devuelve null (no se puede avisar de esa jornada).
function computeJornadaStartTime(jornada) {
  let earliest = null;
  (jornada?.partidos || []).forEach((p) => {
    if (!p.fecha || !p.hora) return;
    const d = parseFechaDDMMYYYY(p.fecha);
    if (!d) return;
    const [hh, mm] = p.hora.split(":").map(Number);
    if (Number.isNaN(hh)) return;
    const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm || 0, 0, 0);
    if (!earliest || dt < earliest) earliest = dt;
  });
  return earliest;
}

// Jornada "vigente" para la portada: la más próxima cuya fecha todavía no ha
// pasado del todo (fecha >= hoy). En cuanto esa fecha queda atrás, al día
// siguiente se pasa automáticamente a la siguiente jornada. Si todas las
// jornadas con fecha ya pasaron, se muestra la última. Si ninguna jornada
// tiene una fecha reconocible, se cae al comportamiento anterior (la última
// creada), para no romper nada si el admin las crea a mano sin fechas.
function findCurrentJornada(jornadas) {
  if (!jornadas || jornadas.length === 0) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dated = jornadas
    .map(j => ({ j, date: jornadaDate(j) }))
    .filter(x => x.date)
    .sort((a, b) => a.date - b.date);
  if (dated.length === 0) return jornadas[jornadas.length - 1];
  const upcoming = dated.find(x => x.date >= today);
  return (upcoming || dated[dated.length - 1]).j;
}

// Estado de la cláusula de una jugadora, visible para toda la liga: en ROJO
// mientras está bloqueada (con los días que faltan, o la cuenta atrás
// HH:MM:SS cuando queda menos de un día), y en VERDE en cuanto se abre.
function ClauseBadge({ entry, size = "sm" }) {
  const [now, setNow] = useState(Date.now());
  const locked = teamService.isClauseLocked(entry);
  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [locked]);
  const textSize = size === "sm" ? "text-[10px]" : "text-[11px]";
  if (!locked) {
    return (
      <span className={`fl-mono ${textSize} font-semibold flex items-center gap-1`} style={{ color: C.positive }}>
        <Lock size={size === "sm" ? 9 : 11} /> Abierta
      </span>
    );
  }
  const remaining = Math.max(0, teamService.clauseUnlockAt(entry) - now);
  const oneDay = 24 * 3600 * 1000;
  const label = remaining > oneDay ? `${Math.ceil(remaining / oneDay)} días` : fmtHMS(remaining);
  return (
    <span className={`fl-mono ${textSize} font-semibold flex items-center gap-1`} style={{ color: C.negative }}>
      <Lock size={size === "sm" ? 9 : 11} /> {label}
    </span>
  );
}

// Hueco de la alineación (titular o banquillo): foto + check si hay jugadora,
// silueta ("sombra") en tono apagado si el hueco está vacío. `label` fuerza el
// texto bajo el hueco (p. ej. la posición en el banquillo); si no se indica,
// se usa el nombre de la jugadora o "Vacío".
function CourtSlot({ player, onClick, size = 78, label, isCaptain = false, teamCrests }) {
  const empty = !player;
  const width = size;
  const height = Math.round(size * 1.28);
  const accent = isCaptain ? C.gold : C.baby;

  if (empty) {
    return (
      <button onClick={onClick} disabled={!onClick} className="fl-tap flex flex-col items-center gap-1 fl-pop" style={{ width: width + 10 }}>
        <div className="relative flex items-center justify-center overflow-hidden rounded-2xl"
          style={{ width, height, background: "rgba(255,61,127,0.06)", border: "2px dashed rgba(255,61,127,0.55)" }}>
          <PlayerSilhouette size={width * 0.42} color="rgba(255,61,127,0.55)" />
          {onClick && (
            <span className="absolute flex items-center justify-center rounded-full"
              style={{ bottom: 6, width: 20, height: 20, background: C.principal, boxShadow: `0 0 8px ${C.principal}99` }}>
              <Plus size={12} color="#fff" strokeWidth={3} />
            </span>
          )}
        </div>
        <span className="fl-mono text-[9px] truncate" style={{ color: C.muted, maxWidth: width + 10 }}>{label || "Vacío"}</span>
      </button>
    );
  }

  return (
    <button onClick={onClick} disabled={!onClick} className="fl-tap flex flex-col items-center fl-pop" style={{ width: width + 6 }}>
      <div className="relative overflow-hidden rounded-2xl"
        style={{
          width, height,
          border: `2px solid ${accent}`,
          boxShadow: `0 0 18px ${accent}77, 0 0 3px ${accent}`,
          background: C.navy700,
        }}>
        {player.photo
          ? <img src={player.photo} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center"><ImageOff size={width * 0.32} color={C.muted} /></div>}
        <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: "58%", background: "linear-gradient(to top, rgba(4,6,12,0.92), transparent)" }} />
        <div className="absolute" style={{ top: 5, right: 5 }}>
          <TeamCrest name={player.team} size={Math.max(16, Math.round(width * 0.26))} photo={teamCrests?.[player.team]} />
        </div>
        <span className="absolute flex items-center justify-center rounded-full"
          style={{ top: 5, left: 5, width: 18, height: 18, background: isCaptain ? C.gold : C.positive, boxShadow: `0 0 6px ${isCaptain ? C.gold : C.positive}99` }}>
          {isCaptain ? <Star size={10} color={C.ink} fill={C.ink} /> : <Check size={10} color={C.navy900} strokeWidth={3.5} />}
        </span>
        <div className="absolute left-1.5 right-1.5" style={{ bottom: 5 }}>
          <div className="fl-body font-bold truncate" style={{ color: C.white, fontSize: Math.max(10, Math.round(width * 0.13)) }}>{player.name}</div>
        </div>
      </div>
      <div className="fl-mono text-[9px] mt-1 flex items-center gap-1" style={{ color: C.muted }}>
        <Coins size={9} color={C.gold} /> {fmtCredits(player.basePrice || 0)}
      </div>
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

function StatChip({ label, value, accent, compact }) {
  return (
    <div className={`fl-row text-center ${compact ? "py-1.5 px-1.5" : "p-2.5"}`}>
      <div className={`fl-mono font-semibold ${compact ? "text-xs" : "text-base"}`} style={{ color: accent || C.white }}>{value}</div>
      <div className={`fl-mono mt-0.5 ${compact ? "text-[7px]" : "text-[9px]"}`} style={{ color: C.muted }}>{label.toUpperCase()}</div>
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
          <div className="fl-mono text-[11px] tracking-[0.2em]" style={{ color: C.principal }}>TEMPORADA 2025/26 · GRUPO A2 · BALONCESTO</div>
          <h1 className="fl-display text-3xl uppercase mt-1" style={{ color: C.white }}>Fantasy Liga<br />Femenina Aragón</h1>
        </div>
        <div className="fl-card p-5">
          <label className="fl-body text-xs font-medium block mb-1.5" style={{ color: C.ink }}>¿Cómo te llamas?</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre o apodo"
            className="fl-body w-full rounded-md px-3 py-2 text-sm outline-none" style={{ border: "1.5px solid rgba(11,27,51,0.2)", background: C.white, color: C.ink }} maxLength={24} />
          <p className="fl-body text-[11px] mt-2" style={{ color: C.mutedInk }}>A continuación podrás crear tu propia liga privada para jugar con tus amigos, o unirte a la de alguien con un código de invitación. Al entrar en una liga recibirás 11 jugadoras al azar con un valor de equipo de entre 90.000.000 € y 100.000.000 €, y 100.000.000 € enteros para pujar en el mercado de esa liga desde el primer día.</p>
          <button disabled={!name.trim() || busy} onClick={async () => { setBusy(true); await onEnter(name.trim()); }}
            className="fl-body w-full mt-3 rounded-md py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: C.baby, color: C.ink }}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : <ChevronRight size={14} />} Continuar
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
  const [marketConfig, setMarketConfig] = useState(DEFAULT_MARKET_CONFIG);
  const [teamCrests, setTeamCrests] = useState({});
  const [favoritos, setFavoritos] = useState([]);

  // Ligas: "Mis ligas" (las que esta persona ha creado o se ha unido, en este
  // dispositivo) y cuál está activa ahora mismo. `undefined` = todavía
  // cargando; `null` = ya cargado pero sin ninguna liga elegida (pantalla
  // "Mis ligas").
  const [myLeagues, setMyLeagues] = useState([]);
  const [activeLeagueId, setActiveLeagueId] = useState(undefined);
  const activeLeague = myLeagues.find(l => l.id === activeLeagueId) || null;

  // Todo esto es SIEMPRE relativo a la liga activa.
  const [teams, setTeams] = useState({});
  const [market, setMarket] = useState(null);
  const [bids, setBids] = useState([]);
  const [offers, setOffers] = useState([]);
  const [tripleEntries, setTripleEntries] = useState([]);
  const [marketHistory, setMarketHistory] = useState([]);
  const [activity, setActivity] = useState([]);

  const [tab, setTab] = useState("inicio");
  const [saving, setSaving] = useState(false);
  const resolvingRef = useRef(false);
  // Favoritos: se guardan por persona (no compartidos), como una simple lista de ids.
  const toggleFavorito = useCallback((playerId) => {
    setFavoritos(prev => {
      const next = prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId];
      writePersonal("favoritos", next);
      return next;
    });
  }, []);

  // Aplica el movimiento de valor de mercado y sube las cláusulas afectadas
  // para cualquier jornada que ya tenga estadísticas cargadas en Supabase y
  // todavía no se haya "procesado" (idempotente: cada jornada se procesa una
  // sola vez, controlado por la lista global "pricedJornadas"). Sustituye al
  // antiguo botón "Guardar jornada" del panel de administración, que ya no existe.
  const settlePlayerPricing = useCallback(async (currentPlayers) => {
    const freshJ = await readJornadas();
    const pricedIds = await readShared("pricedJornadas", []);
    const toPrice = freshJ.filter(j => j.stats && Object.keys(j.stats).length > 0 && !pricedIds.includes(j.id));
    if (toPrice.length === 0) return currentPlayers;
    const freshTGlobal = (await readAllTeamsGlobal()) || {};
    let workingPlayers = currentPlayers;
    for (const jornada of toPrice) {
      const lineups = { ...(jornada.lineups || {}) };
      Object.entries(freshTGlobal).forEach(([key, t]) => { if (!lineups[key] && t.lineup) lineups[key] = t.lineup; });
      const jornadaToSave = { ...jornada, lineups };
      await writeJornada(jornadaToSave);
      workingPlayers = applyMarketMovement(workingPlayers, jornadaToSave, freshTGlobal);
      await writePlayersAfterJornada(workingPlayers, jornadaToSave);
      const bumpWrites = [];
      Object.entries(freshTGlobal).forEach(([key, t]) => {
        const bumped = teamService.bumpClausesToMarket(t, workingPlayers);
        if (bumped !== t) { freshTGlobal[key] = bumped; bumpWrites.push(writeTeam(t.leagueId, t.name, bumped)); }
      });
      if (bumpWrites.length > 0) await Promise.all(bumpWrites);
    }
    await writeShared("pricedJornadas", [...pricedIds, ...toPrice.map(j => j.id)]);
    return workingPlayers;
  }, []);

  // Aviso de "quedan 10 minutos" para el inicio de la jornada (el partido más
  // temprano de todos los suyos). Es GLOBAL: el calendario es el mismo para
  // todas las ligas, así que avisa a TODAS las personas suscritas de TODAS
  // las ligas, no solo a la liga que tengas abierta en este momento. Cada
  // jornada se avisa una sola vez (lista global "jornadaStartWarned").
  const checkJornadaStartWarning = useCallback(async () => {
    try {
      const freshJ = await readJornadas();
      const warned = await readShared("jornadaStartWarned", []);
      const now = Date.now();
      for (const jornada of freshJ) {
        if (warned.includes(jornada.id)) continue;
        const start = computeJornadaStartTime(jornada);
        if (!start) continue;
        const diff = start.getTime() - now;
        if (diff > 0 && diff <= 10 * 60 * 1000) {
          const { data: subs } = await supabase.from("push_subscriptions").select("league_id,user_name");
          const seen = new Set();
          (subs || []).forEach((s) => {
            const key = `${s.league_id}::${s.user_name}`;
            if (seen.has(key)) return;
            seen.add(key);
            sendPushNotification(s.league_id, s.user_name, "🏀 ¡La jornada está a punto de empezar!", `${jornada.name} arranca en menos de 10 minutos.`);
          });
          await writeShared("jornadaStartWarned", [...warned, jornada.id]);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (profile === undefined) return;
    checkJornadaStartWarning();
    const t = setInterval(checkJornadaStartWarning, 60000);
    return () => clearInterval(t);
  }, [profile, checkJornadaStartWarning]);

  // Carga inicial GLOBAL: jugadoras, jornadas, config del mercado y escudos son
  // compartidos por TODAS las ligas, así que se cargan una sola vez, independientemente
  // de qué liga se elija después.
  useEffect(() => {
    (async () => {
      const p = await readPersonal("profile", null);
      const fav = await readPersonal("favoritos", []);
      const [pl, jo, cfg, crests] = await Promise.all([
        readPlayers(), readJornadas(), readMarketConfig(), readTeamCrests(),
      ]);
      setPlayers(pl); setJornadas(jo);
      setTeamCrests(crests || {});
      setFavoritos(fav || []);
      const config = cfg || DEFAULT_MARKET_CONFIG;
      setMarketConfig(config);
      if (!cfg) await writeMarketConfig(config);
      setProfile(p);
      const priced = await settlePlayerPricing(pl);
      if (priced !== pl) setPlayers(priced);
    })();
  }, []);

  // En cuanto hay un nombre elegido, cargamos "Mis ligas" (las que este
  // dispositivo tiene guardadas) y recuperamos cuál era la última liga activa.
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const ids = await readMyLeagueIds();
      const leagues = await readLeaguesByIds(ids);
      setMyLeagues(leagues);
      const savedActive = await readPersonal("activeLeagueId", null);
      setActiveLeagueId(savedActive && leagues.some(l => l.id === savedActive) ? savedActive : null);
    })();
  }, [profile]);

  // Se asegura de que la persona tiene un equipo creado dentro de esa liga
  // (reparto inicial de 11 jugadoras al azar, sin tocar el presupuesto de
  // mercado). Idempotente: si ya existe, no hace nada.
  const ensureTeamInLeague = useCallback(async (leagueId, name) => {
    const existing = await readTeam(leagueId, name);
    if (existing) return existing;
    const freshPlayers = await readPlayers();
    const fresh = (await readAllTeams(leagueId)) || {};
    const ownedIds = new Set();
    Object.values(fresh).forEach(t => teamService.squadIds(t).forEach(id => ownedIds.add(id)));
    const freeJugadoras = freshPlayers.filter(p => p.position !== "DT" && !ownedIds.has(p.id));
    const draft = teamService.autoDraftSquad(freeJugadoras, INITIAL_SQUAD_VALUE_RANGE, MAX_SQUAD_JUGADORAS);
    const team = teamService.addInitialSquad(teamService.emptyTeam(), draft);
    await writeTeam(leagueId, name, team);
    return team;
  }, []);

  const selectLeague = useCallback(async (leagueId) => {
    if (profile) await ensureTeamInLeague(leagueId, profile.name);
    await writePersonal("activeLeagueId", leagueId);
    setActiveLeagueId(leagueId);
    setTab("inicio");
  }, [profile, ensureTeamInLeague]);

  const backToLeagues = useCallback(async () => {
    await writePersonal("activeLeagueId", null);
    setActiveLeagueId(null);
  }, []);

  const createLeague = useCallback(async (name) => {
    const league = await createLeagueRow(name.trim(), profile.name);
    if (!league) return { ok: false, error: "No se pudo crear la liga. Inténtalo de nuevo." };
    await addMyLeagueId(league.id);
    setMyLeagues(prev => [...prev, league]);
    await selectLeague(league.id);
    return { ok: true, league };
  }, [profile, selectLeague]);

  const joinLeagueByCode = useCallback(async (code) => {
    const league = await findLeagueByCode(code);
    if (!league) return { ok: false, error: "Código no encontrado. Revísalo e inténtalo de nuevo." };
    await addMyLeagueId(league.id);
    setMyLeagues(prev => prev.some(l => l.id === league.id) ? prev : [...prev, league]);
    await selectLeague(league.id);
    return { ok: true, league };
  }, [selectLeague]);

  const completeOnboarding = useCallback(async (name) => {
    const prof = { name };
    await writePersonal("profile", prof);
    setProfile(prof);
  }, []);

  // Sincroniza el mercado DE LA LIGA ACTIVA: resuelve la ventana cerrada y genera la
  // siguiente. Cada liga tiene su propio mercado, con jugadoras elegidas al azar de forma
  // independiente (mismo precio de salida y mismo histórico de valor, que son globales).
  // Nota: esta comprobación corre en el cliente a intervalos como sustituto temporal
  // de un job programado en servidor; la resolución de la subasta y el descuento del
  // presupuesto deben ejecutarse como operación atómica en backend cuando haya BD real.
  const syncMarket = useCallback(async (leagueId) => {
    if (!leagueId || resolvingRef.current) return;
    resolvingRef.current = true;
    try {
      const [freshPlayers, freshTeamsOrNull, freshConfig, freshMarket, freshBids, freshHistory, freshActivity, freshOffers, freshTriple, freshJornadas] = await Promise.all([
        readPlayers(), readAllTeams(leagueId), readMarketConfig().then(c => c || DEFAULT_MARKET_CONFIG),
        readShared(leagueKey(leagueId, "currentMarket"), null), readShared(leagueKey(leagueId, "bids"), []),
        readShared(leagueKey(leagueId, "marketHistory"), []), readShared(leagueKey(leagueId, "activity"), []),
        readShared(leagueKey(leagueId, "offers"), []), readShared(leagueKey(leagueId, "triple"), []),
        readJornadas(),
      ]);
      if (freshTeamsOrNull === null) {
        // No pudimos leer con garantías TODOS los equipos de esta liga en este
        // ciclo (p. ej. un fallo de red pasajero). NO seguimos: ni tocamos el
        // estado local "teams", ni -sobre todo- resolvemos el mercado con datos
        // incompletos, porque eso trataría a un equipo real como si no
        // existiera y le borraría la plantilla y el presupuesto gastado. Se
        // reintenta en el siguiente ciclo (15s) sin haber cambiado nada.
        return;
      }
      const freshTeams = freshTeamsOrNull;
      const now = Date.now();
      const window_ = marketService.computeWindow(freshConfig, now);

      let teamsNext = freshTeams, bidsNext = freshBids, playersNext = freshPlayers, historyNext = freshHistory, activityNext = freshActivity;
      let marketNext = freshMarket;

      const marketAlreadyResolved = (bidsList) => bidsList.some(b => b.marketId === freshMarket?.id && b.status !== "active");
      const needsResolution = freshMarket && !freshMarket.resolved && now >= freshMarket.closesAt && !marketAlreadyResolved(freshBids);
      if (needsResolution) {
        const confirmBids = await readShared(leagueKey(leagueId, "bids"), freshBids);
        if (!marketAlreadyResolved(confirmBids)) {
          const { teams: t2, bids: b2, historyEntry, activityEntries } = auctionService.resolveMarket(freshMarket, confirmBids, freshPlayers, freshTeams);
          teamsNext = t2; bidsNext = b2;
          historyNext = [...freshHistory, historyEntry].slice(-40);
          activityNext = [...activityEntries, ...freshActivity].slice(0, 60);
          const changedTeamNames = Object.keys(teamsNext).filter((name) => teamsNext[name] !== freshTeams[name]);
          await Promise.all([
            ...changedTeamNames.map((name) => writeTeam(leagueId, name, teamsNext[name])),
            writeShared(leagueKey(leagueId, "bids"), bidsNext),
            writeShared(leagueKey(leagueId, "marketHistory"), historyNext),
            writeShared(leagueKey(leagueId, "activity"), activityNext),
          ]);
          (historyEntry.results || []).forEach((r) => {
            const asset = freshPlayers.find((p) => p.id === r.assetId);
            if (asset) sendPushNotification(leagueId, r.winnerUserId, "✅ ¡Fichaje del mercado!", `Has ganado la puja por ${asset.name} por ${fmtCredits(r.amount)}.`);
          });
        }
      }

      const staleWindow = !marketNext || marketNext.closesAt !== window_.closesAt || needsResolution;
      if (staleWindow) {
        const assetIds = marketService.buildAssets(playersNext, teamsNext, MARKET_ASSET_COUNT);
        marketNext = { id: uid("mk"), opensAt: window_.opensAt, closesAt: window_.closesAt, assetIds, resolved: false };
        await writeShared(leagueKey(leagueId, "currentMarket"), marketNext);

        // Genera ofertas de la liga por las jugadoras marcadas "en venta" que
        // todavía no tengan una oferta válida para este mercado nuevo.
        const { teams: teamsWithOffers, changed } = marketService.refreshSaleOffers(teamsNext, playersNext, marketNext);
        if (changed) {
          teamsNext = teamsWithOffers;
          const changedNames = Object.keys(teamsNext).filter((name) => teamsNext[name] !== freshTeams[name]);
          await Promise.all(changedNames.map((name) => writeTeam(leagueId, name, teamsNext[name])));
        }
      }

      // Liquida las participaciones de Triple Fantasy cuya jornada ya tiene los 7
      // marcadores y la MVP indicados, y que todavía no han cobrado su premio.
      let tripleNext = freshTriple;
      const pendingSettle = freshTriple.filter(e => !e.settled);
      if (pendingSettle.length > 0) {
        let tripleChanged = false;
        const teamCredits = {}; // { userName: importe total a abonar }
        const actualMvpCache = {}; // { jornadaId: playerId } — se calcula una sola vez por jornada
        tripleNext = freshTriple.map(entry => {
          if (entry.settled) return entry;
          const jornada = freshJornadas.find(j => j.id === entry.jornadaId);
          if (!jornada || !tripleFantasyService.isJornadaReady(jornada)) return entry;
          if (!(entry.jornadaId in actualMvpCache)) {
            actualMvpCache[entry.jornadaId] = tripleFantasyService.computeActualMvp(jornada, freshPlayers, freshJornadas);
          }
          const { correct, mvpCorrect, prize } = tripleFantasyService.scoreEntry(entry, jornada, actualMvpCache[entry.jornadaId]);
          teamCredits[entry.userId] = (teamCredits[entry.userId] || 0) + prize;
          tripleChanged = true;
          return { ...entry, settled: true, correct, mvpCorrect, prize, actualMvpId: actualMvpCache[entry.jornadaId] };
        });
        if (tripleChanged) {
          await writeShared(leagueKey(leagueId, "triple"), tripleNext);
          const creditWrites = Object.entries(teamCredits).map(async ([userName, amount]) => {
            if (amount <= 0) return;
            const t = teamsNext[userName] || teamService.emptyTeam();
            const nextT = { ...t, budgetSpent: (t.budgetSpent || 0) - amount };
            teamsNext[userName] = nextT;
            await writeTeam(leagueId, userName, nextT);
          });
          await Promise.all(creditWrites);
        }
      }

      // Aviso de "quedan 3 minutos" para el cierre del mercado, a todas las personas de la liga.
      // Se manda una sola vez por mercado (marcado con closeWarningSent).
      if (marketNext && !marketNext.resolved && !marketNext.closeWarningSent) {
        const msLeft = marketNext.closesAt - now;
        if (msLeft > 0 && msLeft <= 3 * 60 * 1000) {
          Object.keys(teamsNext).forEach((userName) => {
            sendPushNotification(leagueId, userName, "⏰ ¡El mercado cierra en 3 minutos!", "Últimas pujas antes de que se cierre.");
          });
          marketNext = { ...marketNext, closeWarningSent: true };
          await writeShared(leagueKey(leagueId, "currentMarket"), marketNext);
        }
      }

      setPlayers(playersNext); setTeams(teamsNext); setBids(bidsNext); setMarketHistory(historyNext); setActivity(activityNext);
      setMarketConfig(freshConfig); setMarket(marketNext); setOffers(freshOffers); setTripleEntries(tripleNext);
      setJornadas(freshJornadas);
    } finally {
      resolvingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!activeLeagueId) return;
    setMarket(null); // evita mostrar por un instante el mercado de la liga anterior
    syncMarket(activeLeagueId);
    const t = setInterval(() => syncMarket(activeLeagueId), 15000);
    return () => clearInterval(t);
  }, [activeLeagueId, syncMarket]);

  const myTeam = profile ? (teams[profile.name] || teamService.emptyTeam()) : teamService.emptyTeam();
  const mySquadIds = useMemo(() => teamService.squadIds(myTeam), [myTeam]);
  const myPlayers = useMemo(() => mySquadIds.map(id => players.find(p => p.id === id)).filter(Boolean), [mySquadIds, players]);
  const myJugadoras = useMemo(() => myPlayers.filter(p => p.position !== "DT"), [myPlayers]);
  const myCoaches = useMemo(() => myPlayers.filter(p => p.position === "DT"), [myPlayers]);
  const budgetAvailable = profile ? auctionService.availableBudget(myTeam, bids, market?.id, profile.name) : BUDGET_TOTAL;
  const budgetCommitted = profile ? auctionService.committedByUser(bids, market?.id, profile.name) : 0;

  const isMarketOpen = market ? (Date.now() >= market.opensAt && Date.now() < market.closesAt) : false;

  const saveLineup = useCallback(async (lineup) => {
    setSaving(true);
    // Lee-modifica-escribe SOLO la clave de tu propio equipo EN ESTA LIGA: si el
    // mercado se resuelve (o cualquier otra persona guarda algo) al mismo tiempo,
    // esa operación vive en otra clave y no puede perderse por esta escritura.
    const fresh = await readTeam(activeLeagueId, profile.name) || teamService.emptyTeam();
    const nextTeam = { ...fresh, lineup };
    await writeTeam(activeLeagueId, profile.name, nextTeam);
    setTeams(t => ({ ...t, [profile.name]: nextTeam }));
    setSaving(false);
  }, [profile, activeLeagueId]);

  const releaseFromSquad = useCallback(async (assetId) => {
    setSaving(true);
    const fresh = await readTeam(activeLeagueId, profile.name) || teamService.emptyTeam();
    const nextTeam = teamService.removeAsset(fresh, assetId);
    await writeTeam(activeLeagueId, profile.name, nextTeam);
    setTeams(t => ({ ...t, [profile.name]: nextTeam }));
    setSaving(false);
  }, [profile, activeLeagueId]);

  const placeBid = useCallback(async (asset, amount) => {
    const freshMarket = await readShared(leagueKey(activeLeagueId, "currentMarket"), market);
    const freshBids = await readShared(leagueKey(activeLeagueId, "bids"), bids);
    const team = (await readTeam(activeLeagueId, profile.name)) || teamService.emptyTeam();
    const open = freshMarket && Date.now() >= freshMarket.opensAt && Date.now() < freshMarket.closesAt;
    const check = auctionService.validateBid({ team, players, asset, amount, marketOpen: open, bids: freshBids, marketId: freshMarket?.id, userId: profile.name });
    if (!check.ok) return check;
    const nextBids = auctionService.upsertBid(freshBids, { marketId: freshMarket.id, assetId: asset.id, userId: profile.name, amount });
    await writeShared(leagueKey(activeLeagueId, "bids"), nextBids);
    setBids(nextBids);
    return { ok: true };
  }, [market, bids, players, profile, activeLeagueId]);

  const buyClause = useCallback(async (sellerName, asset, amount) => {
    const [buyerTeam, sellerTeam] = await Promise.all([readTeam(activeLeagueId, profile.name), readTeam(activeLeagueId, sellerName)]);
    const check = clauseService.validateBuyout({
      buyerName: profile.name, buyerTeam, sellerName, sellerTeam, players, asset, amount, bids, marketId: market?.id,
    });
    if (!check.ok) return check;
    const { buyerTeam: nextBuyer, sellerTeam: nextSeller } = clauseService.execute(buyerTeam, sellerTeam, asset, amount);
    await Promise.all([writeTeam(activeLeagueId, profile.name, nextBuyer), writeTeam(activeLeagueId, sellerName, nextSeller)]);
    setTeams(t => ({ ...t, [profile.name]: nextBuyer, [sellerName]: nextSeller }));
    sendPushNotification(activeLeagueId, sellerName, "🔒 ¡Te han clausulado!", `${profile.name} se ha llevado a ${asset.name} por ${fmtCredits(amount)}.`);
    sendPushNotification(activeLeagueId, profile.name, "✅ Fichaje confirmado", `Has fichado a ${asset.name} por ${fmtCredits(amount)}.`);
    return { ok: true };
  }, [profile, players, bids, market, activeLeagueId]);

  // Venta inmediata a la liga: se cobra el 50% del valor de mercado actual, al instante.
  const sellImmediate = useCallback(async (assetId) => {
    const fresh = await readTeam(activeLeagueId, profile.name) || teamService.emptyTeam();
    const player = players.find(p => p.id === assetId);
    if (!player) return { ok: false, error: "Jugadora no encontrada." };
    const amount = Math.max(0.01, (player.basePrice || 0) * 0.5);
    const nextTeam = teamService.receiveSaleProceeds(fresh, assetId, amount);
    await writeTeam(activeLeagueId, profile.name, nextTeam);
    setTeams(t => ({ ...t, [profile.name]: nextTeam }));
    return { ok: true, amount };
  }, [profile, players, activeLeagueId]);

  // Marca/desmarca una jugadora como "en venta" a la liga. La oferta en sí se
  // genera sola la próxima vez que se abra un mercado nuevo (ver syncMarket).
  const toggleForSale = useCallback(async (assetId, forSale) => {
    const fresh = await readTeam(activeLeagueId, profile.name) || teamService.emptyTeam();
    const nextTeam = teamService.setForSale(fresh, assetId, forSale);
    await writeTeam(activeLeagueId, profile.name, nextTeam);
    setTeams(t => ({ ...t, [profile.name]: nextTeam }));
  }, [profile, activeLeagueId]);

  // Acepta la oferta de compra que ha hecho la liga por una jugadora en venta.
  const acceptSaleOffer = useCallback(async (assetId) => {
    const fresh = await readTeam(activeLeagueId, profile.name) || teamService.emptyTeam();
    const entry = teamService.getSquadEntry(fresh, assetId);
    if (!entry?.saleOffer) return { ok: false, error: "Esta jugadora ya no tiene una oferta activa." };
    if (entry.saleOffer.expiresAt && Date.now() > entry.saleOffer.expiresAt) return { ok: false, error: "La oferta ha caducado." };
    const nextTeam = teamService.receiveSaleProceeds(fresh, assetId, entry.saleOffer.amount);
    await writeTeam(activeLeagueId, profile.name, nextTeam);
    setTeams(t => ({ ...t, [profile.name]: nextTeam }));
    return { ok: true };
  }, [profile, activeLeagueId]);

  // Sube la cláusula de tu propia jugadora pagando: el importe se descuenta de tu
  // presupuesto y la cláusula sube el DOBLE de lo pagado.
  const raiseClause = useCallback(async (assetId, payAmount) => {
    if (!Number.isFinite(payAmount) || payAmount <= 0) return { ok: false, error: "Introduce un importe válido." };
    if (payAmount > budgetAvailable) return { ok: false, error: `Presupuesto insuficiente. Disponible: ${fmtCredits(budgetAvailable)}.` };
    const fresh = await readTeam(activeLeagueId, profile.name) || teamService.emptyTeam();
    const entry = teamService.getSquadEntry(fresh, assetId);
    if (!entry) return { ok: false, error: "Ya no tienes esta jugadora." };
    const nextTeam = teamService.raiseClause(fresh, assetId, payAmount);
    await writeTeam(activeLeagueId, profile.name, nextTeam);
    setTeams(t => ({ ...t, [profile.name]: nextTeam }));
    return { ok: true };
  }, [profile, activeLeagueId, budgetAvailable]);

  // Triple Fantasy: pronosticar los 7 partidos + MVP de la jornada, pagando 1 M€ de entrada.
  const joinTriple = useCallback(async (jornadaId, picks, mvpChoice, mvpOptions) => {
    if (TRIPLE_ENTRY_FEE > budgetAvailable) return { ok: false, error: `Presupuesto insuficiente. Disponible: ${fmtCredits(budgetAvailable)}.` };
    const freshEntries = await readShared(leagueKey(activeLeagueId, "triple"), tripleEntries);
    if (freshEntries.some(e => e.jornadaId === jornadaId && e.userId === profile.name)) {
      return { ok: false, error: "Ya has participado en esta jornada." };
    }
    const fresh = await readTeam(activeLeagueId, profile.name) || teamService.emptyTeam();
    const nextTeam = { ...fresh, budgetSpent: (fresh.budgetSpent || 0) + TRIPLE_ENTRY_FEE };
    const nextEntries = [...freshEntries, {
      id: uid("tf"), jornadaId, userId: profile.name, picks, mvpChoice, mvpOptions,
      paidAt: Date.now(), settled: false, correct: null, mvpCorrect: null, prize: null,
    }];
    await Promise.all([
      writeTeam(activeLeagueId, profile.name, nextTeam),
      writeShared(leagueKey(activeLeagueId, "triple"), nextEntries),
    ]);
    setTeams(t => ({ ...t, [profile.name]: nextTeam }));
    setTripleEntries(nextEntries);
    return { ok: true };
  }, [profile, activeLeagueId, budgetAvailable, tripleEntries]);

  // Ofertas de compra directas a otra persona: se pueden enviar en cualquier
  // momento (mercado abierto o cerrado, jugadora protegida por cláusula o no).
  const sendOffer = useCallback(async (sellerName, asset, amount) => {
    const [buyerTeam, sellerTeam] = await Promise.all([readTeam(activeLeagueId, profile.name), readTeam(activeLeagueId, sellerName)]);
    const freshOffers = await readShared(leagueKey(activeLeagueId, "offers"), offers);
    const check = offerService.validateSend({
      buyerName: profile.name, buyerTeam, sellerName, sellerTeam, players, asset, amount, bids, marketId: market?.id, offers: freshOffers,
    });
    if (!check.ok) return check;
    const nextOffers = offerService.create(freshOffers, { fromUser: profile.name, toUser: sellerName, assetId: asset.id, amount });
    await writeShared(leagueKey(activeLeagueId, "offers"), nextOffers);
    setOffers(nextOffers);
    sendPushNotification(activeLeagueId, sellerName, "💰 Nueva oferta recibida", `${profile.name} te ofrece ${fmtCredits(amount)} por ${asset.name}.`);
    return { ok: true };
  }, [profile, players, bids, market, offers, activeLeagueId]);

  // Responde (acepta/rechaza) una oferta recibida, o cancela una enviada.
  const respondOffer = useCallback(async (offerId, action) => {
    const freshOffers = await readShared(leagueKey(activeLeagueId, "offers"), offers);
    const offer = freshOffers.find(o => o.id === offerId && o.status === "pending");
    if (!offer) return { ok: false, error: "Esta oferta ya no está disponible." };
    if (action === "accept") {
      const [buyerTeam, sellerTeam] = await Promise.all([readTeam(activeLeagueId, offer.fromUser), readTeam(activeLeagueId, offer.toUser)]);
      const asset = players.find(p => p.id === offer.assetId);
      if (!asset || !buyerTeam || !sellerTeam) return { ok: false, error: "No se pudo completar la operación." };
      const entry = teamService.getSquadEntry(sellerTeam, asset.id);
      if (!entry) return { ok: false, error: "Ya no tienes esta jugadora." };
      const nextSeller = teamService.receiveSaleProceeds(sellerTeam, asset.id, offer.amount);
      const nextBuyer = teamService.receiveTransfer(buyerTeam, asset, offer.amount);
      await Promise.all([writeTeam(activeLeagueId, offer.fromUser, nextBuyer), writeTeam(activeLeagueId, offer.toUser, nextSeller)]);
      setTeams(t => ({ ...t, [offer.fromUser]: nextBuyer, [offer.toUser]: nextSeller }));
      sendPushNotification(activeLeagueId, offer.fromUser, "✅ ¡Te han aceptado la oferta!", `Has fichado a ${asset.name} por ${fmtCredits(offer.amount)}.`);
    }
    const nextStatus = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "cancelled";
    const nextOffers = offerService.setStatus(freshOffers, offerId, nextStatus);
    await writeShared(leagueKey(activeLeagueId, "offers"), nextOffers);
    setOffers(nextOffers);
    return { ok: true };
  }, [players, offers, activeLeagueId]);

  // El horario del mercado sigue siendo GLOBAL (igual para todas las ligas).
  const saveMarketConfig = useCallback(async (cfg) => {
    await writeMarketConfig(cfg);
    setMarketConfig(cfg);
    await syncMarket(activeLeagueId);
  }, [syncMarket, activeLeagueId]);

  const forceResolveMarket = useCallback(async () => {
    const freshMarket = await readShared(leagueKey(activeLeagueId, "currentMarket"), market);
    if (!freshMarket) return;
    await writeShared(leagueKey(activeLeagueId, "currentMarket"), { ...freshMarket, closesAt: Date.now() - 1000 });
    await syncMarket(activeLeagueId);
  }, [market, syncMarket, activeLeagueId]);

  // Las jornadas son GLOBALES (compartidas por todas las ligas), así que el snapshot de
  // alineaciones que se guarda con cada jornada recoge los equipos de TODAS las ligas a
  // la vez (con clave compuesta "liga::equipo"), y el movimiento de precios de las
  // jugadoras también se calcula con la demanda agregada de todas las ligas juntas.
  const saveJornada = useCallback(async (jornada) => {
    const freshJ = await readJornadas();
    const freshTGlobal = (await readAllTeamsGlobal()) || {};
    const existing = freshJ.find(j => j.id === jornada.id);
    const lineups = { ...(existing?.lineups || {}) };
    Object.entries(freshTGlobal).forEach(([key, t]) => { if (!lineups[key] && t.lineup) lineups[key] = t.lineup; });
    const jornadaToSave = { ...jornada, lineups };
    await writeJornada(jornadaToSave);
    const nextJ = await readJornadas();
    setJornadas(nextJ);

    const freshP = await readPlayers();
    const updatedPlayers = applyMarketMovement(freshP, jornadaToSave, freshTGlobal);
    await writePlayersAfterJornada(updatedPlayers, jornadaToSave);
    setPlayers(updatedPlayers);

    // Si alguna jugadora ha subido de valor, su cláusula sube para igualarlo
    // (nunca baja sola), en TODOS los equipos de TODAS las ligas que la tengan.
    const clauseBumps = [];
    Object.entries(freshTGlobal).forEach(([key, t]) => {
      const bumped = teamService.bumpClausesToMarket(t, updatedPlayers);
      if (bumped !== t) clauseBumps.push(writeTeam(t.leagueId, t.name, bumped));
    });
    if (clauseBumps.length > 0) await Promise.all(clauseBumps);
  }, []);

  const deleteJornada = useCallback(async (id) => {
    await deleteJornadaRow(id);
    const next = await readJornadas();
    setJornadas(next);
  }, []);

  // Escudo de un equipo real: fila en la tabla "team_crests" (equipo -> URL),
  // compartida para toda la liga (lo sube quien administra desde Equipos reales).
  const saveTeamCrest = useCallback(async (teamName, url) => {
    await writeTeamCrestRow(teamName, url);
    setTeamCrests(prev => ({ ...prev, [teamName]: url }));
  }, []);

  // Vuelve a leer la tabla real "players" de Supabase (por si se ha
  // añadido/editado/borrado alguna jugadora directamente desde ahí).
  const refreshPlayers = useCallback(async () => {
    const fresh = await readPlayers();
    setPlayers(fresh);
  }, []);

  if (profile === undefined) return <Loading />;
  if (profile === null) return <Onboarding onEnter={completeOnboarding} />;
  if (activeLeagueId === undefined) return <Loading />;
  if (activeLeagueId === null) {
    return <MisLigasScreen leagues={myLeagues} onSelect={selectLeague} onCreate={createLeague} onJoin={joinLeagueByCode} jornadas={jornadas} teamCrests={teamCrests} />;
  }
  if (!market) return <Loading />;

  return (
    <div className="min-h-screen fl-body" style={{ background: C.navy900 }}>
      <GlobalStyle />
      <Header profile={profile} saving={saving} activeLeague={activeLeague} onBackToLeagues={backToLeagues} activeLeagueId={activeLeagueId} />
      <main className="px-4 fl-safe-bottom" style={{ minHeight: "70vh" }}>
        <div className="pt-3">
          {tab === "inicio" && (
            <InicioTab profile={profile} teams={teams} players={players} jornadas={jornadas} leagueId={activeLeagueId}
              myTeam={myTeam} budgetAvailable={budgetAvailable} budgetCommitted={budgetCommitted}
              market={market} isMarketOpen={isMarketOpen} onGoTo={setTab}
              teamCrests={teamCrests} tripleEntries={tripleEntries} onJoinTriple={joinTriple} />
          )}
          {tab === "clasificacion" && <ClasificacionTab teams={teams} players={players} jornadas={jornadas} me={profile.name} leagueId={activeLeagueId} />}
          {tab === "equipo" && (
            <EquipoTab myJugadoras={myJugadoras} myCoaches={myCoaches} myTeam={myTeam}
              budgetAvailable={budgetAvailable} budgetCommitted={budgetCommitted}
              jornadas={jornadas} players={players} teamName={profile.name} leagueId={activeLeagueId}
              favoritos={favoritos} onToggleFavorite={toggleFavorito}
              onSaveLineup={saveLineup} onSellImmediate={sellImmediate} onToggleForSale={toggleForSale} onAcceptSaleOffer={acceptSaleOffer} onRaiseClause={raiseClause} />
          )}
          {tab === "mercado" && (
            <MercadoTab market={market} players={players} bids={bids} marketHistory={marketHistory}
              profile={profile} myTeam={myTeam} teams={teams} isMarketOpen={isMarketOpen}
              budgetAvailable={budgetAvailable} onBid={placeBid} onBuyClause={buyClause}
              offers={offers} onSendOffer={sendOffer} onRespondOffer={respondOffer}
              jornadas={jornadas}
              favoritos={favoritos} onToggleFavorite={toggleFavorito}
              onSellImmediate={sellImmediate} onToggleForSale={toggleForSale} onAcceptSaleOffer={acceptSaleOffer} onRaiseClause={raiseClause} />
          )}
          {tab === "mas" && (
            <MasTab activity={activity} players={players} />
          )}
        </div>
      </main>
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

/* =============================================================================
   MIS LIGAS
   ========================================================================== */
function MisLigasScreen({ leagues, onSelect, onCreate, onJoin, jornadas, teamCrests }) {
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [justCreated, setJustCreated] = useState(null); // liga recién creada, para mostrar su código
  const [showCalendar, setShowCalendar] = useState(false);

  const currentJornada = useMemo(() => findCurrentJornada(jornadas), [jornadas]);
  const currentJornadaNumber = currentJornada ? jornadas.findIndex(j => j.id === currentJornada.id) + 1 : 0;
  const partidosPreview = (currentJornada?.partidos || []).slice(0, 4);

  const submitCreate = async () => {
    if (!name.trim()) return;
    setBusy(true); setError("");
    const res = await onCreate(name);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setJustCreated(res.league);
  };

  const submitJoin = async () => {
    if (!code.trim()) return;
    setBusy(true); setError("");
    const res = await onJoin(code);
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="min-h-screen fl-body" style={{ background: C.navy900 }}>
      <GlobalStyle />
      <header className="px-4 pt-6 pb-4 text-center" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="fl-mono text-[10px] tracking-[0.2em]" style={{ color: C.principal }}>GRUPO A2 · ARAGÓN · BALONCESTO</div>
        <h1 className="fl-display text-2xl uppercase mt-0.5" style={{ color: C.white }}>Mis Ligas</h1>
      </header>

      <div className="px-4 pt-4 pb-10 max-w-sm mx-auto">
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => { setShowCreate(true); setShowJoin(false); setError(""); }}
            className="fl-tap rounded-md py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: C.baby, color: C.ink }}>
            <Plus size={15} /> Crear liga
          </button>
          <button onClick={() => { setShowJoin(true); setShowCreate(false); setError(""); }}
            className="fl-tap rounded-md py-2.5 text-sm font-semibold" style={{ background: "transparent", border: `1.5px solid ${C.principal}`, color: C.principal }}>
            Unirme con código
          </button>
        </div>

        {showCreate && (
          <div className="fl-row p-3.5 mb-4">
            {justCreated ? (
              <div className="text-center py-2">
                <div className="fl-body text-sm font-medium mb-1" style={{ color: C.white }}>¡Liga "{justCreated.name}" creada!</div>
                <div className="fl-body text-xs mb-2" style={{ color: C.muted }}>Comparte este código con tus amigos para que se unan:</div>
                <div className="fl-mono text-2xl font-bold tracking-[0.3em] py-2" style={{ color: C.principal }}>{justCreated.invite_code}</div>
                <button onClick={() => { setShowCreate(false); setJustCreated(null); setName(""); }}
                  className="fl-tap w-full mt-2 rounded-md py-2 text-sm font-semibold" style={{ background: C.baby, color: C.ink }}>
                  Entendido
                </button>
              </div>
            ) : (
              <>
                <label className="fl-mono text-[10px] block mb-1.5" style={{ color: C.muted }}>NOMBRE DE LA LIGA</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Los Piratas" maxLength={30}
                  className="w-full rounded-md px-3 py-2 text-sm mb-2" style={{ background: C.navy900, border: `1px solid ${C.line}`, color: C.white }} />
                <button disabled={!name.trim() || busy} onClick={submitCreate}
                  className="fl-tap w-full rounded-md py-2.5 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: C.baby, color: C.ink }}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : "Crear y entrar"}
                </button>
              </>
            )}
          </div>
        )}

        {showJoin && (
          <div className="fl-row p-3.5 mb-4">
            <label className="fl-mono text-[10px] block mb-1.5" style={{ color: C.muted }}>CÓDIGO DE INVITACIÓN</label>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Ej. AB3XQZ" maxLength={8}
              className="w-full rounded-md px-3 py-2 text-sm mb-2 fl-mono tracking-widest" style={{ background: C.navy900, border: `1px solid ${C.line}`, color: C.white }} />
            <button disabled={!code.trim() || busy} onClick={submitJoin}
              className="fl-tap w-full rounded-md py-2.5 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: C.baby, color: C.ink }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : "Unirme"}
            </button>
          </div>
        )}

        {error && <div className="fl-mono text-xs mb-4 text-center" style={{ color: C.negative }}>{error}</div>}

        <div className="fl-mono text-[10px] mb-2" style={{ color: C.muted }}>MIS LIGAS</div>
        {leagues.length === 0 ? (
          <EmptyState title="Todavía no estás en ninguna liga" text="Crea la tuya o pide un código de invitación a algún amigo." />
        ) : (
          <div className="space-y-1.5 mb-5">
            {leagues.map(l => (
              <button key={l.id} onClick={() => onSelect(l.id)} className="fl-tap w-full fl-row flex items-center justify-between px-3.5 py-3">
                <div className="text-left">
                  <div className="fl-body text-sm font-medium" style={{ color: C.white }}>{l.name}</div>
                  <div className="fl-mono text-[10px] mt-0.5" style={{ color: C.muted }}>Código {l.invite_code}</div>
                </div>
                <ChevronRight size={16} color={C.muted} />
              </button>
            ))}
          </div>
        )}

        {currentJornada && (
          <div>
            <SectionTitle>Jornada {currentJornadaNumber}</SectionTitle>
            {partidosPreview.length === 0 ? (
              <EmptyState compact title="Sin partidos" text="Todavía no hay partidos añadidos para esta jornada." />
            ) : (
              <div className="fl-row divide-y" style={{ borderColor: C.lineSoft }}>
                {partidosPreview.map(m => <PartidoRow key={m.id} m={m} teamCrests={teamCrests} />)}
              </div>
            )}
            {(currentJornada.partidos || []).length > 0 && (
              <button onClick={() => setShowCalendar(true)}
                className="fl-tap w-full mt-3 rounded-md py-2.5 text-sm font-semibold" style={{ background: C.baby, color: C.ink }}>
                Todos los partidos
              </button>
            )}
          </div>
        )}
      </div>

      {showCalendar && (
        <CalendarioModal jornadas={jornadas} teamCrests={teamCrests}
          initialIndex={Math.max(currentJornadaNumber - 1, 0)} onClose={() => setShowCalendar(false)} />
      )}
    </div>
  );
}

/* =============================================================================
   NAVEGACIÓN
   ========================================================================== */
function Header({ profile, saving, activeLeague, onBackToLeagues, activeLeagueId }) {
  const [notifState, setNotifState] = useState(() => {
    try { return localStorage.getItem(`fl_push_${activeLeagueId}_${profile.name}`) === "1" ? "on" : "off"; }
    catch { return "off"; }
  });
  const [busy, setBusy] = useState(false);

  const toggleNotifications = async () => {
    if (notifState === "on" || busy) return;
    if (!pushSupported()) { setNotifState("unsupported"); return; }
    setBusy(true);
    const ok = await enablePushNotifications(activeLeagueId, profile.name);
    setBusy(false);
    if (ok) {
      setNotifState("on");
      try { localStorage.setItem(`fl_push_${activeLeagueId}_${profile.name}`, "1"); } catch {}
    } else {
      setNotifState("off");
    }
  };

  return (
    <header className="px-4 pt-3 pb-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between">
        <button onClick={onBackToLeagues} className="fl-tap flex items-center gap-1 -ml-0.5">
          <ChevronLeft size={14} color={C.muted} />
          <span className="fl-mono text-[10px]" style={{ color: C.muted }}>Mis ligas</span>
        </button>
        <div className="flex items-center gap-2.5">
          <span className="fl-mono text-[10px]" style={{ color: C.muted }}>{profile.name} {saving && "· guardando…"}</span>
          <button onClick={toggleNotifications} disabled={busy || notifState === "on"} className="fl-tap flex items-center justify-center"
            title={notifState === "on" ? "Notificaciones activadas" : "Activar notificaciones"}>
            {notifState === "on" ? <Bell size={15} color={C.baby} fill={C.baby} /> : <Bell size={15} color={C.muted} />}
          </button>
        </div>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <h1 className="fl-display text-2xl uppercase" style={{ background: `linear-gradient(90deg, ${C.principal}, ${C.baby})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
          Fantasy
        </h1>
        <span className="fl-mono text-[10px] tracking-[0.15em] truncate" style={{ color: C.muted }}>{activeLeague?.name?.toUpperCase() || "GRUPO A2 · ARAGÓN"}</span>
      </div>
    </header>
  );
}

function BottomNav({ tab, setTab }) {
  const items = [
    { key: "inicio", label: "Inicio", icon: Trophy },
    { key: "clasificacion", label: "Ranking", icon: Users },
    { key: "equipo", label: "Equipo", icon: ShieldCheck },
    { key: "mercado", label: "Mercado", icon: Gavel },
    { key: "mas", label: "Más", icon: Menu },
  ];
  const accentFor = (key) => (key === "mercado" ? C.baby : C.principal);
  return (
    <nav className="fixed bottom-0 left-0 right-0 px-2 py-1.5 flex items-stretch justify-between"
      style={{ background: C.navy800, borderTop: `1px solid ${C.line}`, paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))" }}>
      {items.map(it => {
        const Icon = it.icon;
        const active = tab === it.key;
        const accent = accentFor(it.key);
        return (
          <button key={it.key} onClick={() => setTab(it.key)} className="fl-tap flex-1 flex flex-col items-center gap-0.5 py-1.5">
            <Icon size={19} color={active ? accent : C.muted} />
            <span className="fl-mono text-[9px]" style={{ color: active ? accent : C.muted }}>{it.label}</span>
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

// Fila de un partido: escudo+nombre a cada lado, marcador (si ya se jugó) o
// hora/"VS" en el centro.
function PartidoRow({ m, teamCrests }) {
  const played = m.marcadorLocal !== undefined && m.marcadorLocal !== null && m.marcadorLocal !== "" &&
    m.marcadorVisitante !== undefined && m.marcadorVisitante !== null && m.marcadorVisitante !== "";
  return (
    <div className="px-3 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
      <div className="flex-1 flex items-center gap-2 justify-end text-right min-w-0">
        <span className="fl-body text-xs font-medium truncate" style={{ color: C.white }}>{m.local}</span>
        <TeamCrest name={m.local} photo={teamCrests?.[m.local]} size={28} />
      </div>
      <div className="flex flex-col items-center px-1 flex-shrink-0" style={{ minWidth: 52 }}>
        {played ? (
          <span className="fl-mono text-sm font-bold" style={{ color: C.white }}>{m.marcadorLocal} - {m.marcadorVisitante}</span>
        ) : m.hora
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

/* =============================================================================
   TRIPLE FANTASY 🏀 — quiniela semanal con dinero ficticio del juego
   ========================================================================== */
function TripleFantasyScreen({ jornada, jornadaNumber, players, jornadas, myEntry, budgetAvailable, teamCrests, onJoin, onClose }) {
  const [picks, setPicks] = useState({});
  const [mvpChoice, setMvpChoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mvpCandidates = useMemo(() => tripleFantasyService.computeMvpCandidates(players, jornadas), [players, jornadas]);
  const partidos = jornada?.partidos || [];
  const allPicked = partidos.length > 0 && partidos.every(p => picks[p.id]) && !!mvpChoice;

  // Ya has participado en esta jornada: muestra tu quiniela y, si ya hay resultado, el premio.
  if (myEntry) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
        <div className="flex items-center justify-between px-3 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.line}` }}>
          <button onClick={onClose} className="fl-tap p-1.5 -ml-1"><ChevronLeft size={20} color={C.white} /></button>
          <span className="fl-display text-base uppercase" style={{ color: C.white }}>🏀 Triple Fantasy</span>
          <span style={{ width: 28 }} />
        </div>
        <div className="flex-1 overflow-y-auto fl-scrollbar p-4">
          <div className="fl-row p-4 mb-4 text-center" style={{ background: `linear-gradient(135deg, ${C.principal} 0%, #5C0E30 100%)`, border: `1px solid ${C.principal}55`, boxShadow: `0 0 30px ${C.principal}33` }}>
            <div className="fl-mono text-[10px] tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.85)" }}>YA HAS PARTICIPADO</div>
            <div className="fl-display text-lg uppercase mt-1" style={{ color: C.white }}>Jornada {jornadaNumber}</div>
          </div>

          {myEntry.settled ? (
            <div className="fl-row p-4 text-center mb-4">
              <div className="fl-mono text-[10px]" style={{ color: C.muted }}>ACIERTOS: {myEntry.correct}/{partidos.length} {myEntry.mvpCorrect ? "· MVP ✓" : ""}</div>
              <div className="fl-mono text-3xl font-bold mt-2" style={{ color: myEntry.prize > 0 ? C.positive : C.negative }}>{fmtCredits(myEntry.prize || 0)}</div>
              <div className="fl-mono text-[10px] mt-1" style={{ color: C.muted }}>
                {myEntry.prize > TRIPLE_ENTRY_FEE ? `Beneficio: +${fmtCredits(myEntry.prize - TRIPLE_ENTRY_FEE)}` : "Sin premio esta vez"}
              </div>
            </div>
          ) : (
            <div className="mb-4"><EmptyState compact title="Pendiente de resultados" text="En cuanto termine la jornada verás aquí tu premio." /></div>
          )}

          <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>TUS PRONÓSTICOS</div>
          <div className="space-y-1.5">
            {partidos.map(p => {
              const winner = tripleFantasyService.matchWinner(p);
              const pick = myEntry.picks?.[p.id];
              const hit = winner && pick && winner === pick;
              const pickName = pick === "local" ? p.local : pick === "visitante" ? p.visitante : "—";
              return (
                <div key={p.id} className="fl-row flex items-center justify-between px-3 py-2.5">
                  <span className="fl-body text-xs truncate" style={{ color: C.white, maxWidth: "55%" }}>{p.local} vs {p.visitante}</span>
                  <span className="fl-mono text-[10px] flex items-center gap-1" style={{ color: winner ? (hit ? C.positive : C.negative) : C.muted }}>
                    {winner && (hit ? <CircleCheck size={12} /> : <CircleX size={12} />)} {pickName}
                  </span>
                </div>
              );
            })}
          </div>

          {mvpCandidates.length > 0 && (
            <div className="mt-4">
              <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>TU MVP</div>
              <div className="fl-row px-3 py-2.5 flex items-center justify-between">
                <span className="fl-body text-sm flex items-center gap-1.5" style={{ color: C.white }}>
                  {myEntry.settled && (myEntry.mvpCorrect ? <CircleCheck size={14} color={C.positive} /> : <CircleX size={14} color={C.negative} />)}
                  {myEntry.mvpChoice === "otra" ? "Otra jugadora" : (players.find(p => p.id === myEntry.mvpChoice)?.name || "—")}
                </span>
              </div>
              {myEntry.settled && myEntry.actualMvpId && (
                <div className="fl-mono text-[10px] mt-1.5 px-1" style={{ color: C.muted }}>
                  MVP real de la jornada: <span style={{ color: C.gold }}>{players.find(p => p.id === myEntry.actualMvpId)?.name || "—"}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const togglePick = (partidoId, side) => setPicks(prev => ({ ...prev, [partidoId]: side }));

  const submit = async () => {
    setError(""); setBusy(true);
    const res = await onJoin(jornada.id, picks, mvpChoice, mvpCandidates.map(p => p.id));
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex items-center justify-between px-3 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.line}` }}>
        <button onClick={onClose} className="fl-tap p-1.5 -ml-1"><ChevronLeft size={20} color={C.white} /></button>
        <span className="fl-display text-base uppercase" style={{ color: C.white }}>🏀 Triple Fantasy</span>
        <span style={{ width: 28 }} />
      </div>
      <div className="flex-1 overflow-y-auto fl-scrollbar p-4">
        <div className="fl-row p-4 mb-4" style={{ background: `linear-gradient(135deg, ${C.principal} 0%, #5C0E30 100%)`, border: `1px solid ${C.principal}55`, boxShadow: `0 0 30px ${C.principal}33` }}>
          <div className="fl-mono text-[10px] tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.85)" }}>QUINIELA DE LA JORNADA {jornadaNumber}</div>
          <div className="fl-body text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.9)" }}>Acierta los {partidos.length} resultados y quién será la MVP. Entrada: {fmtCredits(TRIPLE_ENTRY_FEE)}.</div>
        </div>

        <div className="grid grid-cols-4 gap-1.5 mb-4">
          {[["5 aciertos", TRIPLE_PRIZE_TABLE[5]], ["6 aciertos", TRIPLE_PRIZE_TABLE[6]], ["7/7", TRIPLE_PRIZE_TABLE[7]], ["7/7 + MVP", TRIPLE_PRIZE_PERFECT_MVP]].map(([label, val]) => (
            <div key={label} className="fl-row py-2 px-1 text-center">
              <div className="fl-mono font-bold" style={{ color: C.gold, fontSize: 12 }}>{fmtCredits(val)}</div>
              <div className="fl-mono text-[8px] mt-0.5" style={{ color: C.muted }}>{label}</div>
            </div>
          ))}
        </div>

        <div className="fl-mono text-[10px] mb-2" style={{ color: C.muted }}>PRONOSTICA LOS {partidos.length} PARTIDOS</div>
        <div className="space-y-2 mb-5">
          {partidos.map(p => (
            <div key={p.id} className="fl-row p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => togglePick(p.id, "local")} className="fl-tap rounded-md py-2.5 px-2 text-xs font-semibold flex items-center gap-1.5 justify-center"
                  style={{ background: picks[p.id] === "local" ? C.baby : C.navy900, color: picks[p.id] === "local" ? C.ink : C.white, border: `1.5px solid ${picks[p.id] === "local" ? C.baby : C.line}` }}>
                  <TeamCrest name={p.local} size={20} photo={teamCrests?.[p.local]} /> <span className="truncate">{p.local}</span>
                </button>
                <button onClick={() => togglePick(p.id, "visitante")} className="fl-tap rounded-md py-2.5 px-2 text-xs font-semibold flex items-center gap-1.5 justify-center"
                  style={{ background: picks[p.id] === "visitante" ? C.baby : C.navy900, color: picks[p.id] === "visitante" ? C.ink : C.white, border: `1.5px solid ${picks[p.id] === "visitante" ? C.baby : C.line}` }}>
                  <TeamCrest name={p.visitante} size={20} photo={teamCrests?.[p.visitante]} /> <span className="truncate">{p.visitante}</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="fl-mono text-[10px] mb-2" style={{ color: C.muted }}>¿QUIÉN SERÁ LA MVP DE LA JORNADA?</div>
        <div className="space-y-1.5 mb-5">
          {mvpCandidates.map(p => (
            <button key={p.id} onClick={() => setMvpChoice(p.id)} className="fl-tap w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-left"
              style={{ background: mvpChoice === p.id ? C.babySoft : C.navy800, border: `1.5px solid ${mvpChoice === p.id ? C.baby : C.line}` }}>
              <PlayerPhoto url={p.photo} size={36} rounded={10} />
              <div className="flex-1 min-w-0">
                <div className="fl-body text-sm font-medium truncate" style={{ color: C.white }}>{p.name}</div>
                <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{p.team}</div>
              </div>
              {mvpChoice === p.id && <Check size={16} color={C.baby} />}
            </button>
          ))}
          <button onClick={() => setMvpChoice("otra")} className="fl-tap w-full flex items-center justify-center gap-2 px-3 py-3 rounded-md text-center"
            style={{ background: mvpChoice === "otra" ? C.babySoft : C.navy800, border: `1.5px solid ${mvpChoice === "otra" ? C.baby : C.line}` }}>
            <span className="fl-body text-sm font-medium" style={{ color: C.white }}>Otra jugadora</span>
            {mvpChoice === "otra" && <Check size={16} color={C.baby} />}
          </button>
        </div>

        {error && <div className="fl-mono text-xs mb-3 text-center" style={{ color: C.negative }}>{error}</div>}
      </div>
      <div className="px-4 pb-4 flex-shrink-0">
        <button disabled={!allPicked || busy} onClick={submit}
          className="fl-tap w-full rounded-md py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: C.principal, color: C.white }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : `Confirmar participación (${fmtCredits(TRIPLE_ENTRY_FEE)})`}
        </button>
        <div className="text-center fl-mono text-[11px] mt-2" style={{ color: C.muted }}>
          Tu saldo: <span style={{ color: C.baby, fontWeight: 600 }}>{fmtCredits(budgetAvailable)}</span>
        </div>
      </div>
    </div>
  );
}

function InicioTab({ profile, teams, players, jornadas, leagueId, myTeam, budgetAvailable, budgetCommitted, market, isMarketOpen, onGoTo, teamCrests, tripleEntries, onJoinTriple }) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTriple, setShowTriple] = useState(false);
  const standings = useMemo(() => rankingService.computeStandings(teams, players, jornadas, leagueId), [teams, players, jornadas, leagueId]);
  const myRow = standings.find(r => r.name === profile.name);
  const marketAssets = (market.assetIds || []).length;
  const lastJornada = findCurrentJornada(jornadas);
  const currentJornadaNumber = lastJornada ? jornadas.findIndex(j => j.id === lastJornada.id) + 1 : jornadas.length + 1;
  const partidos = lastJornada?.partidos || [];
  const myTripleEntry = lastJornada ? (tripleEntries || []).find(e => e.jornadaId === lastJornada.id && e.userId === profile.name) : null;

  return (
    <div className="space-y-4">
      <div className="fl-row p-4" style={{ background: `linear-gradient(135deg, ${C.principal} 0%, #5C0E30 100%)`, border: `1px solid ${C.principal}55`, boxShadow: `0 0 30px ${C.principal}33` }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="fl-mono text-[10px] tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.85)" }}>TU LIGA</div>
            <div className="fl-display text-lg uppercase" style={{ color: C.white }}>{profile.name}</div>
          </div>
          <div className="text-right">
            <div className="fl-mono text-2xl font-semibold" style={{ color: C.white }}>{myRow ? `#${myRow.rank}` : "—"}</div>
            <div className="fl-mono text-[9px]" style={{ color: "rgba(255,255,255,0.75)" }}>POSICIÓN</div>
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
        <SectionTitle>Jornada {currentJornadaNumber}</SectionTitle>
        {jornadas.length === 0 ? (
          <EmptyState title="Temporada por empezar" text="Cuando se registre la primera jornada verás aquí tu puntuación." />
        ) : (
          <div className="fl-row p-3.5 flex items-center justify-between">
            <span className="fl-body text-sm" style={{ color: C.white }}>{lastJornada.name}</span>
            <span className="fl-mono text-sm font-semibold" style={{ color: C.positive }}>
              +{computeTeamJornadaPoints(lastJornada, `${leagueId}::${profile.name}`, myTeam.lineup, players)}
            </span>
          </div>
        )}
      </div>

      {lastJornada && partidos.length > 0 && (
        <button onClick={() => setShowTriple(true)} className="fl-tap w-full fl-row p-3.5 flex items-center justify-between"
          style={{ border: `1.5px solid ${C.principal}`, boxShadow: `0 0 16px ${C.principal}44` }}>
          <div className="flex items-center gap-2.5">
            <span style={{ fontSize: 20, lineHeight: 1 }}>🏀</span>
            <div className="text-left">
              <div className="fl-body text-sm font-semibold" style={{ color: C.white }}>Triple Fantasy</div>
              <div className="fl-mono text-[10px]" style={{ color: C.muted }}>
                {myTripleEntry ? (myTripleEntry.settled ? `Premio: ${fmtCredits(myTripleEntry.prize || 0)}` : "Ya has participado") : `Entrada ${fmtCredits(TRIPLE_ENTRY_FEE)} · hasta ${fmtCredits(TRIPLE_PRIZE_PERFECT_MVP)}`}
              </div>
            </div>
          </div>
          <ChevronRight size={16} color={C.principal} />
        </button>
      )}

      {partidos.length > 0 && (
        <div>
          <SectionTitle>Partidos de la jornada</SectionTitle>
          <div className="fl-row divide-y" style={{ borderColor: C.lineSoft }}>
            {partidos.map(m => (
              <div key={m.id} className="px-3.5 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                <div className="flex-1 flex flex-col items-center gap-1 text-center">
                  <TeamCrest name={m.local} photo={teamCrests?.[m.local]} />
                  <span className="fl-body text-[11px] font-medium leading-tight" style={{ color: C.white }}>{m.local}</span>
                </div>
                <div className="flex flex-col items-center px-1">
                  {(m.marcadorLocal !== undefined && m.marcadorLocal !== null && m.marcadorLocal !== "" && m.marcadorVisitante !== undefined && m.marcadorVisitante !== null && m.marcadorVisitante !== "") ? (
                    <span className="fl-mono text-sm font-bold" style={{ color: C.white }}>{m.marcadorLocal} - {m.marcadorVisitante}</span>
                  ) : (m.fecha || m.hora) ? (
                    <>
                      {m.fecha && <span className="fl-mono text-[9px]" style={{ color: C.muted }}>{m.fecha}</span>}
                      {m.hora && <span className="fl-mono text-xs font-semibold" style={{ color: C.baby }}>{m.hora}</span>}
                    </>
                  ) : <span className="fl-mono text-[10px]" style={{ color: C.muted }}>VS</span>}
                </div>
                <div className="flex-1 flex flex-col items-center gap-1 text-center">
                  <TeamCrest name={m.visitante} photo={teamCrests?.[m.visitante]} />
                  <span className="fl-body text-[11px] font-medium leading-tight" style={{ color: C.white }}>{m.visitante}</span>
                </div>
              </div>
            ))}
          </div>
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

      {showTriple && lastJornada && (
        <TripleFantasyScreen jornada={lastJornada} jornadaNumber={currentJornadaNumber} players={players} jornadas={jornadas}
          myEntry={myTripleEntry} budgetAvailable={budgetAvailable} teamCrests={teamCrests}
          onJoin={onJoinTriple} onClose={() => setShowTriple(false)} />
      )}
    </div>
  );
}

/* =============================================================================
   CLASIFICACIÓN
   ========================================================================== */
function ClasificacionTab({ teams, players, jornadas, me, leagueId }) {
  const [filterJornadaId, setFilterJornadaId] = useState(null); // null = "Total"
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => rankingService.computeStandings(teams, players, jornadas, leagueId, filterJornadaId), [teams, players, jornadas, leagueId, filterJornadaId]);
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
            <div key={r.name} className="fl-row flex items-center justify-between px-3 py-2.5" style={{ outline: r.name === me ? `2px solid ${C.principal}` : "none", boxShadow: r.name === me ? `0 0 18px ${C.principal}44` : "none" }}>
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
// Menú de acciones a modo de hoja inferior (bottom sheet), estilo referencia
// (Blindar jugador / Añadir al mercado / Subir cláusula / Venta inmediata / Cerrar).
function ActionSheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full rounded-t-2xl overflow-hidden fl-pop" style={{ background: C.navy800, border: `1px solid ${C.line}` }} onClick={e => e.stopPropagation()}>
        {title && (
          <div className="px-4 py-3 text-center" style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
            <span className="fl-display text-sm uppercase" style={{ color: C.white }}>{title}</span>
          </div>
        )}
        <div>{children}</div>
        <button onClick={onClose} className="fl-tap w-full py-3.5 text-sm font-semibold" style={{ color: C.muted, borderTop: `1px solid ${C.lineSoft}` }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
function ActionSheetItem({ label, subtitle, onClick, disabled, danger }) {
  return (
    <button onClick={onClick} disabled={disabled} className="fl-tap w-full px-4 py-3.5 text-center disabled:opacity-40"
      style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
      <div className="fl-body text-sm font-medium" style={{ color: danger ? C.negative : C.principal }}>{label}</div>
      {subtitle && <div className="fl-mono text-[10px] mt-0.5" style={{ color: C.muted }}>{subtitle}</div>}
    </button>
  );
}

// Pantalla "Subir cláusula": pagas un importe y la cláusula sube el doble de
// lo pagado (pagar 1 M sube la cláusula 2 M), a pantalla completa.
function RaiseClauseScreen({ player, entry, onBack, onConfirm }) {
  const clause = entry?.clause || player.basePrice || 0;
  const [amount, setAmount] = useState("0");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pay = Number(amount) || 0;
  const previewClause = clause + pay * 2;

  const submit = async () => {
    setError(""); setBusy(true);
    const res = await onConfirm(pay);
    setBusy(false);
    if (!res.ok) setError(res.error); else onBack();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: C.navy900 }}>
      <div className="flex items-center px-4 pt-5 pb-3" style={{ borderBottom: `1px solid ${C.line}` }}>
        <button onClick={onBack} className="fl-tap p-1 -ml-1"><ChevronLeft size={22} color={C.white} /></button>
        <div className="flex-1 text-center fl-display text-sm uppercase pr-6" style={{ color: C.white }}>Subir cláusula a {player.name}</div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex justify-center mb-6">
          <div className="rounded-full p-1" style={{ border: `2px solid ${C.line}` }}>
            <PlayerPhoto url={player.photo} size={92} rounded={999} />
          </div>
        </div>
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 fl-mono text-[11px]" style={{ color: C.muted }}>
              <Coins size={13} color={C.gold} /> VALOR DE MERCADO
            </div>
            <div className="fl-mono text-sm font-semibold" style={{ color: C.white }}>{fmtCredits(player.basePrice || 0)}</div>
          </div>
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 fl-mono text-[11px]" style={{ color: C.muted }}>
              <Coins size={13} color={C.gold} /> VALOR DE CLÁUSULA
            </div>
            <div className="fl-mono text-sm font-semibold" style={{ color: C.gold }}>{fmtCredits(previewClause)}</div>
          </div>
        </div>
        <div className="fl-row flex items-center gap-2.5 px-3 py-2.5 mb-3" style={{ background: C.navy700 }}>
          <div className="flex items-center justify-center rounded-full" style={{ width: 26, height: 26, background: C.gold }}>
            <Coins size={14} color={C.ink} />
          </div>
          <div className="flex-1">
            <div className="fl-mono text-[9px]" style={{ color: C.muted }}>IMPORTE A PAGAR</div>
            {editing ? (
              <input autoFocus type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)}
                onBlur={() => setEditing(false)} className="fl-mono text-sm font-semibold w-full bg-transparent outline-none" style={{ color: C.white }} />
            ) : (
              <div className="fl-mono text-sm font-semibold" style={{ color: C.white }}>{fmtCredits(pay)}</div>
            )}
          </div>
          <button onClick={() => setEditing(e => !e)} className="fl-tap p-1.5 rounded-full" style={{ background: C.navy600 }}><Pencil size={12} color={C.white} /></button>
          <button onClick={() => setAmount("0")} className="fl-tap p-1.5 rounded-full" style={{ background: C.navy600 }}><X size={12} color={C.white} /></button>
        </div>
        <p className="fl-body text-[11px]" style={{ color: C.muted }}>Cada euro que pagues aquí sube la cláusula el doble. Por ejemplo, pagar 1.000.000 € sube la cláusula 2.000.000 €.</p>
        {error && <div className="fl-mono text-[11px] mt-3" style={{ color: C.negative }}>{error}</div>}
      </div>
      <div className="px-5 pb-3">
        <button onClick={submit} disabled={busy || pay <= 0}
          className="fl-tap w-full rounded-md py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: C.positive, color: C.ink }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : "Subir cláusula"}
        </button>
      </div>
    </div>
  );
}

function PlayerDetailScreen({ player, entry, jornadas, isFavorite, onToggleFavorite, isOwned, onSellImmediate, onToggleForSale, onAcceptSaleOffer, onRaiseClause, onClose }) {
  const [showHistorico, setShowHistorico] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showRaiseClause, setShowRaiseClause] = useState(false);
  const [busyAction, setBusyAction] = useState(null); // "sell" | "forsale" | "offer" | null
  const [actionMsg, setActionMsg] = useState("");
  const [confirmSell, setConfirmSell] = useState(false);

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

  if (showRaiseClause) {
    return (
      <RaiseClauseScreen player={player} entry={entry}
        onBack={() => setShowRaiseClause(false)}
        onConfirm={(payAmount) => onRaiseClause(player.id, payAmount)} />
    );
  }

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
            {isOwned && entry && (
              <div className="flex items-center justify-end gap-1.5 mt-1">
                <ClauseBadge entry={entry} />
                <span className="fl-mono text-[10px] font-semibold" style={{ color: C.gold }}>{fmtCredits(entry.clause || player.basePrice || 0)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-2 px-4 pt-3" style={{ gridTemplateColumns: isOwned && entry ? "1fr 1fr" : "1fr" }}>
          <button onClick={() => setShowHistorico(true)} className="fl-tap rounded-md py-2.5 text-xs font-semibold"
            style={{ border: `1px solid ${C.line}`, color: C.white }}>
            Valor histórico
          </button>
          {isOwned && entry && (
            <button onClick={() => setShowActions(true)} className="fl-tap rounded-md py-2.5 text-xs font-semibold" style={{ background: C.principal, color: C.white }}>
              Acciones
            </button>
          )}
        </div>

        {isOwned && entry && entry.forSale && (() => {
          const offer = entry.saleOffer;
          const offerExpired = offer && offer.expiresAt && Date.now() > offer.expiresAt;
          if (!offer || offerExpired) return null;
          return (
            <div className="px-4 pt-3">
              <div className="fl-row p-3">
                <div className="p-2 rounded-md" style={{ background: C.principalSoft }}>
                  <div className="fl-body text-xs" style={{ color: C.white }}>Oferta de la liga: <span className="font-semibold">{fmtCredits(offer.amount)}</span></div>
                  <div className="fl-mono text-[10px] mt-0.5" style={{ color: C.muted }}>Válida hasta que cierre este mercado</div>
                  <button disabled={busyAction === "offer"} onClick={async () => {
                    setBusyAction("offer"); setActionMsg("");
                    const res = await onAcceptSaleOffer(player.id);
                    setBusyAction(null);
                    if (res.ok) onClose(); else setActionMsg(res.error);
                  }} className="fl-tap w-full mt-2 rounded-md py-2 text-xs font-semibold" style={{ background: C.positive, color: C.ink }}>
                    {busyAction === "offer" ? <Loader2 size={13} className="animate-spin mx-auto" /> : "Aceptar oferta"}
                  </button>
                </div>
                {actionMsg && <div className="fl-mono text-[10px] mt-2" style={{ color: C.negative }}>{actionMsg}</div>}
              </div>
            </div>
          );
        })()}

        {showActions && entry && (
          <ActionSheet onClose={() => setShowActions(false)} title={player.name}>
            <ActionSheetItem label="Blindar jugador" disabled subtitle="Próximamente" />
            <ActionSheetItem
              label={entry.forSale ? "Quitar del mercado" : "Añadir al mercado"}
              onClick={async () => {
                setBusyAction("forsale"); setActionMsg(""); setShowActions(false);
                await onToggleForSale(player.id, !entry.forSale);
                setBusyAction(null);
              }} />
            <ActionSheetItem label="Subir cláusula" onClick={() => { setShowActions(false); setShowRaiseClause(true); }} />
            <ActionSheetItem label="Venta inmediata" danger onClick={() => { setShowActions(false); setConfirmSell(true); }} />
          </ActionSheet>
        )}

        {confirmSell && (
          <ActionSheet onClose={() => setConfirmSell(false)} title="Venta inmediata">
            <div className="px-4 pb-3">
              <p className="fl-body text-sm" style={{ color: C.white }}>
                Recibirás <span className="font-semibold">{fmtCredits(Math.max(0.01, (player.basePrice || 0) * 0.5))}</span> (50% del valor de mercado) al instante.
              </p>
            </div>
            <ActionSheetItem
              label={busyAction === "sell" ? "Vendiendo…" : "Confirmar venta"}
              danger
              onClick={async () => {
                setBusyAction("sell"); setActionMsg("");
                const res = await onSellImmediate(player.id);
                setBusyAction(null); setConfirmSell(false);
                if (res.ok) onClose(); else setActionMsg(res.error);
              }} />
          </ActionSheet>
        )}

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

function EquipoTab({ myJugadoras, myCoaches, myTeam, budgetAvailable, budgetCommitted, jornadas, players, teamName, leagueId, favoritos, onToggleFavorite, onSaveLineup, onSellImmediate, onToggleForSale, onAcceptSaleOffer, onRaiseClause }) {
  const [sub, setSub] = useState("alineacion");
  const [detailPlayerId, setDetailPlayerId] = useState(null);
  const lineup = myTeam.lineup || { formation: "2-2-1", starters: [], bench: { BASE: null, ALERO: null, PIVOT: null }, titularCoach: null, captainId: null };
  const allSquad = [...myJugadoras, ...myCoaches];
  const startersSet = new Set(lineup.starters || []);
  const benchIds = new Set(Object.values(lineup.bench || {}).filter(Boolean));
  const reserva = allSquad.filter(p => !startersSet.has(p.id) && !benchIds.has(p.id) && p.id !== lineup.titularCoach);
  const history = jornadas.map(j => ({ id: j.id, name: j.name, pts: computeTeamJornadaPoints(j, `${leagueId}::${teamName}`, lineup, players) }));

  const valorPlantilla = (myTeam.squad || []).reduce((s, e) => s + (e.pricePaid || 0), 0);

  return (
    <div>
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        <StatChip label="Fichas" value={`${myTeam.squad.length}/${MAX_SQUAD_JUGADORAS + MAX_COACHES}`} compact />
        <StatChip label="Valor plantilla" value={fmtCredits(valorPlantilla)} compact />
        <StatChip label="Disponible" value={fmtCredits(budgetAvailable)} accent={C.baby} compact />
        <StatChip label="Comprometido" value={fmtCredits(budgetCommitted)} compact />
      </div>
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
        <div className="space-y-3">
          {allSquad.length === 0 ? (
            <EmptyState title="Aún no tienes plantilla" text="Consigue jugadoras y entrenadora/or pujando en el mercado." />
          ) : allSquad.map(p => {
            const entry = myTeam.squad.find(e => e.id === p.id);
            const role = (startersSet.has(p.id) || lineup.titularCoach === p.id) ? "Titular" : benchIds.has(p.id) ? "Banquillo" : "Reserva";
            return (
              <button key={p.id} onClick={() => setDetailPlayerId(p.id)} className="fl-tap fl-row w-full flex items-center gap-3.5 px-4 py-3.5 text-left">
                <PlayerPhoto url={p.photo} size={68} rounded={16} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <PositionBadge posKey={p.position} size="md" />
                    <span className="fl-display text-base uppercase truncate" style={{ color: C.white }}>{p.name}</span>
                  </div>
                  <div className="fl-mono text-xs mt-0.5" style={{ color: C.muted }}>{p.team} · {role}</div>
                  {entry?.forSale && <span className="fl-mono text-[9px] px-1.5 py-0.5 rounded mt-1 inline-block" style={{ background: C.principalSoft, color: C.principal }}>EN VENTA</span>}
                </div>
                <div className="text-right flex-shrink-0" style={{ minWidth: 84 }}>
                  <div className="fl-mono text-sm font-semibold" style={{ color: C.baby }}>{fmtCredits(p.basePrice || 0)}</div>
                  <div className="flex justify-end mt-1"><ClauseBadge entry={entry || {}} /></div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {sub === "puntos" && (
        <PuntosJornadaView jornadas={jornadas} history={history} leagueId={leagueId} teamName={teamName}
          players={players} lineup={lineup} />
      )}

      {detailPlayerId && (() => {
        const p = allSquad.find(x => x.id === detailPlayerId);
        if (!p) return null;
        const entry = myTeam.squad.find(e => e.id === p.id);
        return (
          <PlayerDetailScreen player={p} entry={entry} jornadas={jornadas} isOwned
            isFavorite={(favoritos || []).includes(p.id)} onToggleFavorite={() => onToggleFavorite(p.id)}
            onSellImmediate={onSellImmediate} onToggleForSale={onToggleForSale} onAcceptSaleOffer={onAcceptSaleOffer} onRaiseClause={onRaiseClause}
            onClose={() => setDetailPlayerId(null)} />
        );
      })()}
    </div>
  );
}

// Vista de "Puntos" por jornada: chips J1, J2... para elegir la jornada, y
// debajo la alineación GUARDADA en esa jornada concreta (titulares, banquillo
// y entrenadora/or), cada una con los puntos que hizo ese día.
function PuntosJornadaView({ jornadas, history, leagueId, teamName, players, lineup }) {
  const [selectedIdx, setSelectedIdx] = useState(() => Math.max(jornadas.length - 1, 0));
  if (jornadas.length === 0) return <EmptyState title="Sin jornadas todavía" text="Los puntos de cada jornada aparecerán aquí." />;

  const jornada = jornadas[selectedIdx];
  const savedLineup = jornada?.lineups?.[`${leagueId}::${teamName}`] || null;
  const usedLineup = savedLineup || lineup; // si no hay snapshot guardado, se cae a la alineación actual (mejor que nada)
  const total = history[selectedIdx]?.pts ?? 0;

  const findPlayer = (id) => players.find(p => p.id === id) || null;
  const pointsFor = (id) => {
    const p = findPlayer(id);
    if (!p) return 0;
    const stats = jornada.stats?.[id];
    if (!stats) return 0;
    const pts = calcPointsBreakdown(stats, p.position).total;
    return id === usedLineup?.captainId ? pts * 2 : pts;
  };

  const req = FORMATIONS[usedLineup?.formation || "2-2-1"];
  const byPos = (posKey) => (usedLineup?.starters || []).filter(id => findPlayer(id)?.position === posKey);
  const rows = [
    { pos: POSITIONS[2], ids: byPos("PIVOT"), need: req.PIVOT },
    { pos: POSITIONS[1], ids: byPos("ALERO"), need: req.ALERO },
    { pos: POSITIONS[0], ids: byPos("BASE"), need: req.BASE },
  ];
  const bench = usedLineup?.bench || { BASE: null, ALERO: null, PIVOT: null };
  const coachId = usedLineup?.titularCoach || null;

  return (
    <div>
      <div className="flex gap-1.5 mb-3 overflow-x-auto fl-scrollbar">
        {jornadas.map((j, i) => (
          <button key={j.id} onClick={() => setSelectedIdx(i)}
            className="fl-tap flex-shrink-0 rounded-full flex flex-col items-center justify-center fl-mono text-[10px] font-semibold"
            style={{
              width: 44, height: 44,
              background: i === selectedIdx ? C.baby : C.navy800,
              color: i === selectedIdx ? C.ink : C.muted,
              border: `1px solid ${i === selectedIdx ? C.baby : C.line}`,
            }}>
            J{i + 1}
            <span style={{ fontSize: 9 }}>{history[i]?.pts ?? "–"}</span>
          </button>
        ))}
      </div>

      {!usedLineup || (usedLineup.starters || []).length === 0 ? (
        <EmptyState compact title="Sin alineación guardada" text="No se guardó una alineación para esta jornada." />
      ) : (
        <>
          <div className="rounded-2xl mb-3 relative overflow-hidden" style={{ background: C.navy700, border: `1px solid ${C.line}`, minHeight: 420 }}>
            <BasketballCourt />
            <div className="relative h-full flex flex-col justify-between py-5 px-1" style={{ minHeight: 420 }}>
              {rows.map(({ pos, ids, need }) => {
                const slots = [...ids, ...Array(Math.max(need - ids.length, 0)).fill(null)];
                const isWing = pos.key === "ALERO";
                return (
                  <div key={pos.key} className={`flex items-start flex-wrap ${isWing ? "justify-between px-1" : "justify-center gap-3"}`}>
                    {slots.map((id, i) => {
                      const p = id ? findPlayer(id) : null;
                      return (
                        <div key={id || `${pos.key}-empty-${i}`} className="flex flex-col items-center">
                          <div className="relative">
                            <CourtSlot player={p} size={84} isCaptain={!!id && usedLineup.captainId === id} />
                            {p && (
                              <span className="absolute -top-1.5 -right-1.5 fl-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: C.navy900, color: pointsFor(id) >= 0 ? C.positive : C.negative, border: `1px solid ${C.line}` }}>
                                {pointsFor(id)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-3">
            <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>BANQUILLO</div>
            <div className="fl-row flex items-center justify-around gap-2 py-4 px-2">
              {POSITIONS.map(pos => {
                const id = bench[pos.key];
                const p = id ? findPlayer(id) : null;
                return (
                  <div key={pos.key} className="relative">
                    <CourtSlot player={p} size={64} label={pos.label} />
                    {p && (
                      <span className="absolute -top-1.5 -right-1.5 fl-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: C.navy900, color: pointsFor(id) >= 0 ? C.positive : C.negative, border: `1px solid ${C.line}` }}>
                        {pointsFor(id)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>ENTRENADORA/OR</div>
            <div className="fl-row flex items-center justify-center py-4 px-2">
              <div className="relative">
                <CourtSlot player={coachId ? findPlayer(coachId) : null} size={70} label={coachId ? undefined : "DT"} />
                {coachId && findPlayer(coachId) && (
                  <span className="absolute -top-1.5 -right-1.5 fl-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: C.navy900, color: pointsFor(coachId) >= 0 ? C.positive : C.negative, border: `1px solid ${C.line}` }}>
                    {pointsFor(coachId)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
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
                return <CourtSlot key={id} player={p} size={78} isCaptain={captainId === id} onClick={() => onSelect(id)} />;
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
      <div className="rounded-2xl mb-3 relative overflow-hidden" style={{ background: C.navy700, border: `1px solid ${C.line}`, minHeight: 420 }}>
        <BasketballCourt />
        <div className="relative h-full flex flex-col justify-between py-5 px-1" style={{ minHeight: 420 }}>
          {rows.map(({ pos, ids, need }) => {
            const slots = [...ids, ...Array(Math.max(need - ids.length, 0)).fill(null)];
            const isWing = pos.key === "ALERO";
            return (
              <div key={pos.key} className={`flex items-start flex-wrap ${isWing ? "justify-between px-1" : "justify-center gap-3"}`}>
                {slots.map((id, i) => {
                  const p = id ? myJugadoras.find(x => x.id === id) : null;
                  return (
                    <CourtSlot key={id || `${pos.key}-empty-${i}`} player={p} size={84} isCaptain={!!id && captainId === id}
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
        <div className="fl-row flex items-center justify-around gap-2 py-4 px-2">
          {POSITIONS.map(pos => {
            const id = bench[pos.key];
            const p = id ? myJugadoras.find(x => x.id === id) : null;
            return (
              <CourtSlot key={pos.key} player={p} size={64} label={pos.label}
                onClick={() => setPicker({ type: "bench", posKey: pos.key, currentId: id || null })} />
            );
          })}
        </div>
      </div>

      {/* Entrenadora/or titular: mismo patrón de hueco + selección. */}
      <div className="mb-3">
        <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>ENTRENADORA/OR TITULAR</div>
        <div className="fl-row flex items-center justify-center py-4 px-2">
          <CourtSlot player={titularCoach ? findPlayer(titularCoach) : null} size={70} label={titularCoach ? undefined : "DT"}
            onClick={() => setPicker({ type: "coach", posKey: "DT", currentId: titularCoach || null })} />
        </div>
      </div>

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
function PlayerSearchScreen({ players, jornadas, teams, myTeam, favoritos, onToggleFavorite, onSellImmediate, onToggleForSale, onAcceptSaleOffer, onRaiseClause, onClose }) {
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
        <PlayerDetailScreen player={detailPlayer} jornadas={jornadas}
          entry={teamService.getSquadEntry(myTeam, detailPlayer.id)} isOwned={teamService.squadIds(myTeam).includes(detailPlayer.id)}
          isFavorite={favSet.has(detailPlayer.id)} onToggleFavorite={() => onToggleFavorite(detailPlayer.id)}
          onSellImmediate={onSellImmediate} onToggleForSale={onToggleForSale} onAcceptSaleOffer={onAcceptSaleOffer} onRaiseClause={onRaiseClause}
          onClose={() => setDetailPlayer(null)} />
      )}
    </div>
  );
}

function MercadoTab({ market, players, bids, marketHistory, profile, myTeam, teams, isMarketOpen, budgetAvailable, onBid, onBuyClause, offers, onSendOffer, onRespondOffer, jornadas, favoritos, onToggleFavorite, onSellImmediate, onToggleForSale, onAcceptSaleOffer, onRaiseClause }) {
  const [sub, setSub] = useState("mercado");
  const [opSub, setOpSub] = useState("venta"); // dentro de "Mis operaciones": compra | venta
  const [clauseTarget, setClauseTarget] = useState(null); // { sellerName, asset }
  const [offerTarget, setOfferTarget] = useState(null); // { sellerName, asset }
  const [detailPlayer, setDetailPlayer] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const assets = (market.assetIds || []).map(id => players.find(p => p.id === id)).filter(Boolean);
  const myActiveBids = bids.filter(b => b.marketId === market.id && b.userId === profile.name && b.status === "active");
  const myPastBids = bids.filter(b => b.userId === profile.name && b.status !== "active" && b.marketId !== market.id);
  const receivedOffersCount = (offers || []).filter(o => o.status === "pending" && o.toUser === profile.name).length;
  const sentOffersCount = (offers || []).filter(o => o.status === "pending" && o.fromUser === profile.name).length;

  if (clauseTarget) {
    return (
      <ClauseOfferScreen target={clauseTarget} budgetAvailable={budgetAvailable}
        onBack={() => setClauseTarget(null)}
        onConfirm={async (amount) => {
          const res = await onBuyClause(clauseTarget.sellerName, clauseTarget.asset, amount);
          if (res.ok) setClauseTarget(null);
          return res;
        }} />
    );
  }

  if (offerTarget) {
    return (
      <OfferScreen target={offerTarget} budgetAvailable={budgetAvailable}
        onBack={() => setOfferTarget(null)}
        onConfirm={(amount) => onSendOffer(offerTarget.sellerName, offerTarget.asset, amount)} />
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
      <div className="flex gap-1.5 mb-3">
        {[["mercado", "Mercado"], ["operaciones", "Mis operaciones"], ["historico", "Histórico"]].map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className="fl-tap flex-1 fl-mono text-[11px] py-2 rounded-lg"
            style={{ background: sub === k ? C.baby : "transparent", color: sub === k ? C.ink : C.muted, border: sub === k ? "none" : `1px solid ${C.line}` }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {sub === "mercado" && (
        <>
          {assets.length === 0 ? <EmptyState title="Sin activos en este mercado" text="El siguiente mercado se generará automáticamente al cerrar este." /> : (
            <div className="space-y-3">
              {assets.map(asset => (
                <AuctionCard key={asset.id} asset={asset} market={market} bids={bids} profile={profile} myTeam={myTeam}
                  isMarketOpen={isMarketOpen} budgetAvailable={budgetAvailable} onBid={onBid} onOpenPlayer={setDetailPlayer} />
              ))}
            </div>
          )}
          <EnVentaSection teams={teams} players={players}
            onSelectClause={(sellerName, asset, entry) => setClauseTarget({ sellerName, asset, entry })}
            onSelectOffer={(sellerName, asset) => setOfferTarget({ sellerName, asset })}
            onOpenPlayer={setDetailPlayer} />
        </>
      )}

      {sub === "operaciones" && (
        <div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button onClick={() => setOpSub("compra")} className="fl-tap rounded-md py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: opSub === "compra" ? C.babySoft : "transparent", border: `1px solid ${opSub === "compra" ? C.baby : C.line}`, color: opSub === "compra" ? C.baby : C.muted }}>
              Compra{sentOffersCount > 0 ? ` (${sentOffersCount})` : ""}
            </button>
            <button onClick={() => setOpSub("venta")} className="fl-tap rounded-md py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: opSub === "venta" ? C.negative + "22" : "transparent", border: `1px solid ${opSub === "venta" ? C.negative : C.line}`, color: opSub === "venta" ? C.negative : C.muted }}>
              Venta{receivedOffersCount > 0 ? ` (${receivedOffersCount})` : ""}
            </button>
          </div>

          {opSub === "compra" && (
            <div className="space-y-4">
              <div>
                <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>MIS PUJAS ACTIVAS</div>
                {myActiveBids.length === 0 ? (
                  <EmptyState compact title="Sin pujas activas" text="Puja por una jugadora desde la pestaña Mercado." />
                ) : (
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
                )}
              </div>
              <OfertasEnviadasList offers={offers || []} players={players} me={profile.name} onRespond={onRespondOffer} />
            </div>
          )}

          {opSub === "venta" && (
            <OfertasRecibidasList offers={offers || []} players={players} me={profile.name} onRespond={onRespondOffer} />
          )}
        </div>
      )}

      {sub === "historico" && (
        <HistoricoTab marketHistory={marketHistory} players={players} bids={bids} profile={profile} myPastBids={myPastBids} />
      )}

      {detailPlayer && (
        <PlayerDetailScreen player={detailPlayer} jornadas={jornadas}
          entry={teamService.getSquadEntry(myTeam, detailPlayer.id)} isOwned={teamService.squadIds(myTeam).includes(detailPlayer.id)}
          isFavorite={(favoritos || []).includes(detailPlayer.id)} onToggleFavorite={() => onToggleFavorite(detailPlayer.id)}
          onSellImmediate={onSellImmediate} onToggleForSale={onToggleForSale} onAcceptSaleOffer={onAcceptSaleOffer} onRaiseClause={onRaiseClause}
          onClose={() => setDetailPlayer(null)} />
      )}

      {showSearch && (
        <PlayerSearchScreen players={players} jornadas={jornadas} teams={teams} myTeam={myTeam}
          favoritos={favoritos} onToggleFavorite={onToggleFavorite}
          onSellImmediate={onSellImmediate} onToggleForSale={onToggleForSale} onAcceptSaleOffer={onAcceptSaleOffer} onRaiseClause={onRaiseClause}
          onClose={() => setShowSearch(false)} />
      )}
    </div>
  );
}

// Plantillas rivales: solo aquí se puede pujar por una jugadora que ya pertenece a otra
// persona, pagando (como mínimo) su cláusula. Los jugadores del mercado general NUNCA
// muestran cláusula porque, mientras están libres, no la tienen.
// Jugadoras marcadas "en venta" por cualquier equipo de la liga, visibles
// directamente en el Mercado (no solo dentro de su ficha).
function EnVentaSection({ teams, players, onSelectClause, onSelectOffer, onOpenPlayer }) {
  const rows = [];
  Object.entries(teams || {}).forEach(([name, team]) => {
    (team.squad || []).forEach(entry => {
      if (!entry.forSale) return;
      const player = players.find(p => p.id === entry.id);
      if (player) rows.push({ owner: name, entry, player });
    });
  });
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <SectionTitle>En venta</SectionTitle>
      <div className="space-y-3">
        {rows.map(({ owner, entry, player }) => {
          const locked = teamService.isClauseLocked(entry);
          return (
            <div key={player.id} className="fl-row p-4 fl-pop">
              <div className="flex items-center gap-3.5">
                <button onClick={() => onOpenPlayer(player)} className="fl-tap flex items-center gap-3.5 flex-1 min-w-0 text-left">
                  <PlayerPhoto url={player.photo} size={68} rounded={16} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <PositionBadge posKey={player.position} size="md" />
                      <span className="fl-display text-base uppercase truncate" style={{ color: C.white }}>{player.name}</span>
                    </div>
                    <div className="fl-mono text-xs mt-0.5" style={{ color: C.muted }}>{player.team}</div>
                    <div className="fl-mono text-[10px] mt-0.5" style={{ color: C.muted }}>De {owner}</div>
                    <div className="mt-1.5"><ClauseBadge entry={entry} /></div>
                  </div>
                </button>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  {!locked && (
                    <button onClick={() => onSelectClause(owner, player, entry)}
                      className="fl-tap fl-mono text-xs font-semibold rounded-md px-3 py-2" style={{ color: C.gold, border: `1px solid ${C.gold}` }}>
                      {fmtCredits(entry.clause || player.basePrice)}
                    </button>
                  )}
                  <button onClick={() => onSelectOffer(owner, player)}
                    className="fl-tap fl-mono text-xs font-semibold rounded-md px-3 py-2" style={{ color: C.principal, border: `1px solid ${C.principal}` }}>
                    Hacer oferta
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RivalRosters({ teams, players, me, onSelectClause, onSelectOffer, onOpenPlayer }) {
  const rivals = Object.entries(teams || {}).filter(([name]) => name !== me);
  if (rivals.length === 0) return <EmptyState title="Todavía no hay otras plantillas" text="En cuanto más gente entre en la liga podrás ver sus jugadoras aquí." />;
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
              {rows.map(({ entry, player }) => {
                const locked = teamService.isClauseLocked(entry);
                return (
                  <div key={player.id} className="fl-row flex items-center gap-2 px-3 py-2.5">
                    <button onClick={() => onOpenPlayer(player)} className="fl-tap flex items-center gap-2.5 flex-1 min-w-0 text-left">
                      <PlayerPhoto url={player.photo} size={40} />
                      <div className="flex-1 min-w-0 text-left">
                        <div className="fl-body text-sm font-medium truncate" style={{ color: C.white }}>{player.name}</div>
                        <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{player.team} · Valor {fmtCredits(player.basePrice)}</div>
                      </div>
                    </button>
                    <PositionBadge posKey={player.position} />
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <ClauseBadge entry={entry} />
                      {!locked && (
                        <button onClick={() => onSelectClause(name, player, entry)}
                          className="fl-tap flex items-center gap-1 fl-mono text-[11px] font-semibold rounded-md px-2 py-1"
                          style={{ color: C.gold, border: `1px solid ${C.gold}` }}>
                          <Lock size={10} /> {fmtCredits(entry.clause || player.basePrice)}
                        </button>
                      )}
                      <button onClick={() => onSelectOffer(name, player)}
                        className="fl-tap fl-mono text-[10px] font-medium rounded-md px-2 py-1" style={{ color: C.principal, border: `1px solid ${C.principal}` }}>
                        Hacer oferta
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Pantalla de oferta de compra directa a otra persona: cualquier importe, la
// otra persona decide si la acepta. Disponible siempre, incluso con la
// jugadora todavía protegida por cláusula.
function OfferScreen({ target, budgetAvailable, onBack, onConfirm }) {
  const { sellerName, asset } = target;
  const [amount, setAmount] = useState(String(Math.round((asset.basePrice || 1) * 0.8)));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError(""); setBusy(true);
    const res = await onConfirm(Number(amount));
    setBusy(false);
    if (!res.ok) setError(res.error); else setSent(true);
  };

  if (sent) {
    return (
      <div className="fixed inset-0 z-20 flex flex-col items-center justify-center px-6" style={{ background: C.navy900 }}>
        <CircleCheck size={40} color={C.positive} />
        <div className="fl-body text-sm mt-3 text-center" style={{ color: C.white }}>Oferta enviada a {sellerName}.</div>
        <button onClick={onBack} className="fl-tap mt-4 rounded-md px-5 py-2.5 text-sm font-semibold" style={{ background: C.baby, color: C.ink }}>Volver</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col" style={{ background: C.navy900 }}>
      <div className="flex items-center px-4 pt-5 pb-3" style={{ borderBottom: `1px solid ${C.line}` }}>
        <button onClick={onBack} className="fl-tap p-1 -ml-1"><ChevronLeft size={22} color={C.white} /></button>
        <div className="flex-1 text-center fl-display text-sm uppercase pr-6" style={{ color: C.white }}>Oferta a {sellerName}</div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex justify-center mb-6">
          <div className="rounded-full p-1" style={{ border: `2px solid ${C.line}` }}>
            <PlayerPhoto url={asset.photo} size={92} rounded={999} />
          </div>
        </div>
        <div className="text-center fl-body text-sm font-medium mb-4" style={{ color: C.white }}>{asset.name}</div>
        <label className="fl-mono text-[10px] block mb-1.5" style={{ color: C.muted }}>TU OFERTA</label>
        <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)}
          className="w-full rounded-md px-3 py-2.5 text-sm fl-mono" style={{ background: C.navy800, border: `1px solid ${C.line}`, color: C.white }} />
        <p className="fl-body text-[11px] mt-2" style={{ color: C.muted }}>{sellerName} decidirá si acepta o rechaza tu oferta. Puedes ofrecer cualquier importe, incluso si la jugadora todavía está protegida por cláusula.</p>
        {error && <div className="fl-mono text-[11px] mt-3" style={{ color: C.negative }}>{error}</div>}
      </div>
      <div className="px-5 pb-3">
        <button onClick={submit} disabled={busy || !Number(amount) || Number(amount) <= 0}
          className="fl-tap w-full rounded-md py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: C.principal, color: C.white }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : "Enviar oferta"}
        </button>
        <div className="text-center fl-mono text-[11px] mt-2.5 pb-2" style={{ color: C.muted }}>
          Tu saldo: <span style={{ color: C.baby, fontWeight: 600 }}>{fmtCredits(budgetAvailable)}</span>
        </div>
      </div>
    </div>
  );
}

// Ofertas de compra: las que has enviado (pendientes de que respondan) y las
// que has recibido por tus jugadoras (para aceptar o rechazar).
function OfertasRecibidasList({ offers, players, me, onRespond }) {
  const [busyId, setBusyId] = useState(null);
  const received = offers.filter(o => o.status === "pending" && o.toUser === me);
  const respond = async (id, action) => { setBusyId(id); await onRespond(id, action); setBusyId(null); };
  return (
    <div>
      <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>OFERTAS RECIBIDAS</div>
      {received.length === 0 ? (
        <EmptyState compact title="Sin ofertas recibidas" text="Aquí verás las ofertas que te hagan por tus jugadoras." />
      ) : (
        <div className="space-y-1.5">
          {received.map(o => {
            const asset = players.find(p => p.id === o.assetId);
            if (!asset) return null;
            return (
              <div key={o.id} className="fl-row px-3 py-2.5">
                <div className="flex items-center gap-2.5 mb-2">
                  <PlayerPhoto url={asset.photo} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="fl-body text-sm font-medium truncate" style={{ color: C.white }}>{asset.name}</div>
                    <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{o.fromUser} ofrece {fmtCredits(o.amount)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={busyId === o.id} onClick={() => respond(o.id, "reject")}
                    className="fl-tap rounded-md py-1.5 text-xs font-semibold" style={{ border: `1px solid ${C.line}`, color: C.white }}>
                    Rechazar
                  </button>
                  <button disabled={busyId === o.id} onClick={() => respond(o.id, "accept")}
                    className="fl-tap rounded-md py-1.5 text-xs font-semibold" style={{ background: C.positive, color: C.ink }}>
                    {busyId === o.id ? <Loader2 size={13} className="animate-spin mx-auto" /> : "Aceptar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OfertasEnviadasList({ offers, players, me, onRespond }) {
  const [busyId, setBusyId] = useState(null);
  const sent = offers.filter(o => o.status === "pending" && o.fromUser === me);
  const respond = async (id, action) => { setBusyId(id); await onRespond(id, action); setBusyId(null); };
  return (
    <div>
      <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>OFERTAS ENVIADAS</div>
      {sent.length === 0 ? (
        <EmptyState compact title="Sin ofertas enviadas" text="Las ofertas que hagas a otras personas aparecerán aquí." />
      ) : (
        <div className="space-y-1.5">
          {sent.map(o => {
            const asset = players.find(p => p.id === o.assetId);
            if (!asset) return null;
            return (
              <div key={o.id} className="fl-row flex items-center gap-2.5 px-3 py-2.5">
                <PlayerPhoto url={asset.photo} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="fl-body text-sm font-medium truncate" style={{ color: C.white }}>{asset.name}</div>
                  <div className="fl-mono text-[10px]" style={{ color: C.muted }}>A {o.toUser} · {fmtCredits(o.amount)}</div>
                </div>
                <button disabled={busyId === o.id} onClick={() => respond(o.id, "cancel")}
                  className="fl-tap fl-mono text-[11px] font-medium rounded-md px-2.5 py-1.5" style={{ color: C.negative, border: `1px solid ${C.negative}` }}>
                  Cancelar
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Pantalla de oferta por cláusula, a pantalla completa (estilo de referencia).
// La cláusula ya no es un importe fijo guardado: una vez abierta (pasados los
// 14 días de protección), es siempre el valor de mercado ACTUAL de la jugadora.
function ClauseOfferScreen({ target, budgetAvailable, onBack, onConfirm }) {
  const { sellerName, asset, entry } = target;
  const clause = (entry && entry.clause) || asset.basePrice || 1;
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
    <div className="fl-row p-4 fl-pop">
      <div className="flex items-center gap-3.5">
        <button onClick={() => onOpenPlayer(asset)} className="fl-tap flex items-center gap-3.5 flex-1 min-w-0 text-left">
          <PlayerPhoto url={asset.photo} size={68} rounded={16} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <PositionBadge posKey={asset.position} size="md" />
              <span className="fl-display text-base uppercase truncate" style={{ color: C.white }}>{asset.name}</span>
            </div>
            <div className="fl-mono text-xs mt-0.5" style={{ color: C.muted }}>{asset.team}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="fl-mono text-sm font-semibold" style={{ color: C.baby }}>Salida {fmtCredits(asset.basePrice || 1)}</span>
              <span className="fl-mono text-[11px]" style={{ color: C.muted }}>· {bidCount} {bidCount === 1 ? "puja" : "pujas"}</span>
            </div>
            <div className="mt-1.5"><BidStatusPill status={status} /></div>
          </div>
        </button>
        <button onClick={() => setOpen(o => !o)} disabled={!isMarketOpen || owned}
          className="fl-tap fl-mono text-xs font-semibold rounded-md px-3.5 py-2.5 disabled:opacity-40 flex-shrink-0"
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
function MasTab({ activity, players }) {
  return (
    <div>
      <ActividadFeed activity={activity} players={players} />
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

function JornadasPanel({ jornadas, players }) {
  const [openId, setOpenId] = useState(null);
  return (
    <div>
      <p className="fl-body text-[11px] mb-3" style={{ color: C.muted }}>
        Las jornadas, los marcadores y las estadísticas se gestionan desde las tablas <span style={{ color: C.white }}>jornadas</span>, <span style={{ color: C.white }}>partidos</span> y <span style={{ color: C.white }}>jornada_stats</span> de Supabase. Esta pantalla es solo de consulta.
      </p>
      {jornadas.length === 0 && <EmptyState title="Sin jornadas todavía" text="Cuando se registre la primera jornada verás aquí los puntos." />}
      <div className="space-y-2">
        {[...jornadas].reverse().map(j => (
          <div key={j.id} className="fl-row overflow-hidden">
            <button onClick={() => setOpenId(openId === j.id ? null : j.id)} className="fl-tap w-full flex items-center justify-between px-3 py-2.5">
              <span className="fl-display text-sm uppercase" style={{ color: C.white }}>{j.name}</span>
              <ChevronRight size={16} color={C.muted} style={{ transform: openId === j.id ? "rotate(90deg)" : "none" }} />
            </button>
            {openId === j.id && <JornadaDetail jornada={j} players={players} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// Vista de solo lectura de una jornada: partidos con su marcador (si ya se
// jugó) y la tabla de estadísticas de cada jugadora. Todo se edita en
// Supabase; aquí solo se consulta.
function JornadaDetail({ jornada, players }) {
  const stats = jornada.stats || {};
  const partidos = jornada.partidos || [];
  const jugadoras = players.filter(p => p.position !== "DT");
  const entrenadoras = players.filter(p => p.position === "DT");
  return (
    <div className="px-3 pb-3" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
      <div className="mt-2">
        <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>PARTIDOS DE LA JORNADA</div>
        {partidos.length === 0 ? (
          <div className="text-xs mb-2" style={{ color: C.muted }}>Todavía no hay partidos añadidos para esta jornada.</div>
        ) : (
          <div className="space-y-1.5 mb-2.5">
            {partidos.map(m => {
              const played = m.marcadorLocal !== undefined && m.marcadorLocal !== null && m.marcadorLocal !== "" && m.marcadorVisitante !== undefined && m.marcadorVisitante !== null && m.marcadorVisitante !== "";
              return (
                <div key={m.id} className="flex items-center gap-2 px-2.5 py-2 rounded-md" style={{ background: C.navy900, border: `1px solid ${C.lineSoft}` }}>
                  <div className="flex-1 min-w-0">
                    <div className="fl-body text-xs truncate" style={{ color: C.white }}>{m.local} <span style={{ color: C.muted }}>vs</span> {m.visitante}</div>
                    {(m.fecha || m.hora) && <div className="fl-mono text-[10px] mt-0.5" style={{ color: C.muted }}>{[m.fecha, m.hora].filter(Boolean).join(" · ")}</div>}
                  </div>
                  {played && <div className="fl-mono text-xs font-bold flex-shrink-0" style={{ color: C.white }}>{m.marcadorLocal} - {m.marcadorVisitante}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {players.length === 0 && <div className="mt-3"><EmptyState title="No hay jugadoras en el álbum" text="Añádelas desde el Table Editor de Supabase (tabla players)." compact /></div>}
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
                const num = (field) => <td className="text-center">{s[field] || 0}</td>;
                return (
                  <tr key={p.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                    <td className="py-1.5 pr-2" style={{ color: C.white }}><div className="font-medium">{p.name}</div><PositionBadge posKey={p.position} /></td>
                    {num("minutos")}{num("puntos")}{num("t3")}{num("tlibre")}{num("rebofen")}{num("rebdefe")}
                    {num("asist")}{num("pd")}{num("robos")}{num("tap")}{num("faltas")}{num("valoracion")}
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
                    <td className="text-center">{s.jugo ? "Sí" : "No"}</td>
                    <td className="text-center">{s.victoria ? "Sí" : "No"}</td>
                    <td className="text-center">{s.diferencia || 0}</td>
                    <td className="text-center">{s.mvp ? "Sí" : "No"}</td>
                    <td className="text-right fl-mono font-semibold" style={{ color: pts >= 0 ? C.positive : C.negative }}>{pts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
