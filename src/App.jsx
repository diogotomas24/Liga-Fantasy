import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Trophy, Users, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Plus, Trash2, Crown, FlaskConical,
  Check, Loader2, RefreshCw, TrendingUp, TrendingDown, Minus, Star, Clock,
  ShieldCheck, Gavel, Wallet, Menu, Coins, Pencil, X, Lock,
  ImageOff, CircleCheck, CircleX, CircleDot, Search, Bell, BellOff, MoreVertical, BarChart3,
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
const MARKET_ASSET_COUNT = 8;
const MAX_COACHES = 1;
const MAX_SQUAD_JUGADORAS = 12; // plantilla máxima; solo 5 titulares + 3 banquillo son alineables
const INITIAL_SQUAD_COUNT = 8; // jugadoras del reparto inicial (el resto de la plantilla se completa luego vía mercado/cláusulas)
const INITIAL_SQUAD_VALUE_RANGE = { min: 80, max: 90 }; // valor de equipo del reparto inicial, aparte del presupuesto de mercado

const POSITIONS = [
  { key: "BASE", label: "Base", short: "B", fill: C.baby, textOn: C.ink },
  { key: "ALERO", label: "Alero", short: "A", fill: C.navy600, textOn: C.white },
  { key: "PIVOT", label: "Pívot", short: "P", fill: C.white, textOn: C.ink },
];
const COACH_POS = { key: "DT", label: "Entrenadora/or", short: "DT", fill: C.gold, textOn: C.ink };

// Color(es) de neón de cada equipo real, para las tarjetas de partido. Los
// equipos con dos colores dados se representan como degradado entre los dos;
// el resto, un único color. Si un equipo no está aquí, se le asigna uno fijo
// (siempre el mismo para ese nombre) de una paleta de respaldo, para que
// nunca se quede sin color aunque no esté en esta lista.
const TEAM_NEON_COLORS = {
  "Alfasa Mamba Team": ["#FFC83D"],
  "Polid. San Agustin": ["#E63946", "#FFFFFF"],
  "Polideportivo San Agustín": ["#E63946", "#FFFFFF"],
  "Basket Aragon": ["#FF7A1A"],
  "Basket Aragón": ["#FF7A1A"],
  "Muerde la Pasta Alierta": ["#1B3A6B", "#2ECC71"],
  "Em El Olivar": ["#3CB371"],
  "El Olivar": ["#3CB371"],
  "Mercado Central OSB": ["#D7263D", "#111111"],
  "Boscos": ["#7A1F3D", "#1B3A6B"],
  "IES-Lycee Français Moliere": ["#1B3A6B"],
  "Basket Lupus SFA": ["#D7263D"],
  "Marianistas": ["#FFFFFF", "#2B6CB0"],
  "Compañía de Maria": ["#C9A227"],
  "Compañía de María": ["#C9A227"],
  "Beral CBF Huesca La Magia": ["#2E8B57"],
  "Cristo Rey A": ["#1E5AA8", "#FF8A00"],
};
const NEON_FALLBACK_PALETTE = ["#7B2FF7", "#00C2A8", "#FF6B9D", "#4D96FF", "#FFB454", "#63E6BE", "#E0507A", "#8DD858"];
function teamNeonColors(name) {
  if (!name) return [C.line];
  if (TEAM_NEON_COLORS[name]) return TEAM_NEON_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return [NEON_FALLBACK_PALETTE[hash % NEON_FALLBACK_PALETTE.length]];
}
// Para donde solo hace falta un color plano (p. ej. el aro del escudo): el primero de la lista.
function teamNeonColor(name) { return teamNeonColors(name)[0]; }
// Para donde se quiera el degradado completo de ese equipo (el foco de luz).
function teamNeonGradient(name, angle = 135) {
  const colors = teamNeonColors(name);
  return colors.length > 1 ? `linear-gradient(${angle}deg, ${colors[0]}, ${colors[1]})` : colors[0];
}

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

// Busca si el equipo REAL de la entrenadora ganó o perdió su partido en esa
// jornada, mirando directamente el marcador ya cargado — sin depender de
// ninguna estadística introducida a mano. null si esa jornada no tiene
// partido de ese equipo, o si el partido todavía no tiene marcador.
function resolveCoachWin(jornada, teamName) {
  if (!jornada || !teamName) return null;
  for (const p of jornada.partidos || []) {
    if (p.local !== teamName && p.visitante !== teamName) continue;
    const winner = tripleFantasyService.matchWinner(p);
    if (!winner) return null;
    return (winner === "local") === (p.local === teamName);
  }
  return null;
}

// Desglose de la puntuación de entrenadoras/es (regla sin cambios: no forma
// parte del nuevo sistema Puntos SWISH, que solo afecta a jugadoras). Directo
// a partir del resultado real del equipo — nunca hace falta rellenar nada a
// mano para la entrenadora. `resolvedWin` es true/false/null (calculado con
// resolveCoachWin); si no se pudo resolver (sin partido o sin marcador
// todavía), se cae a stats.victoria por si acaso viene de datos antiguos.
function calcCoachPoints(stats, resolvedWin) {
  const s = stats || {};
  const win = resolvedWin != null ? resolvedWin : !!s.victoria;
  const breakdown = [
    { key: "victoria", label: win ? "Partido ganado" : "Partido no ganado", cantidad: win ? 1 : 0, pts: win ? 5 : 0 },
  ];
  return { breakdown, total: win ? 5 : 0 };
}

// Punto de entrada único: desglose completo de una jugadora/entrenadora en
// una jornada, eligiendo el sistema de puntuación según su posición.
function calcPointsBreakdown(stats, position, resolvedWin) {
  return position === "DT" ? calcCoachPoints(stats, resolvedWin) : calcSwishPoints(stats, position);
}

function calcPlayerPoints(stats, position, resolvedWin) {
  if (position === "DT") return calcCoachPoints(stats, resolvedWin).total; // no hace falta stats: se resuelve con el marcador real
  if (!stats) return 0;
  return calcPointsBreakdown(stats, position).total;
}


function computeTeamJornadaPoints(jornada, teamName, currentLineup, players) {
  const snapshot = jornada.lineups && jornada.lineups[teamName];
  // Una vez empezada la jornada, SOLO vale la alineación ya bloqueada (o 0 si
  // no hay ninguna, por ejemplo por haberte unido a la liga después de que
  // ya hubiera arrancado) — nunca la alineación actual en vivo, aunque haya
  // cambiado después. Antes de que empiece, sí se usa la actual como
  // previsión de lo que puntuarías si se bloqueara ahora mismo.
  const lineup = snapshot || (hasJornadaEffectivelyStarted(jornada) ? null : currentLineup);
  if (!lineup) return 0;
  if (lineup.debtLocked) return 0; // estaba endeudada cuando empezó la jornada: no puntúa

  const bench = lineup.bench || {};
  const captainId = lineup.captainId;

  // Agrupa a las titulares por posición, con su puntuación "efectiva" (con el
  // x2 de capitana ya aplicado si corresponde) — la comparación contra el
  // banquillo se hace SIEMPRE con ese valor ya doblado, nunca con el bruto.
  const byPos = {};
  (lineup.starters || []).forEach((id) => {
    const player = players.find((p) => p.id === id);
    if (!player) return;
    const raw = calcPlayerPoints(jornada.stats?.[id], player.position);
    const effective = id === captainId ? raw * 2 : raw;
    (byPos[player.position] = byPos[player.position] || []).push({ id, effective });
  });

  let total = 0;
  Object.entries(byPos).forEach(([pos, list]) => {
    const benchId = bench[pos];
    const benchPlayer = benchId ? players.find((p) => p.id === benchId) : null;
    if (benchPlayer && list.length > 0) {
      const benchRaw = calcPlayerPoints(jornada.stats?.[benchId], pos);
      // Localiza a la titular "más floja" de esa posición (por puntuación ya
      // con el x2 aplicado donde toque) — es la única que se puede sustituir.
      let worstIdx = 0;
      list.forEach((s, i) => { if (s.effective < list[worstIdx].effective) worstIdx = i; });
      if (benchRaw > list[worstIdx].effective) {
        // Entra la del banquillo SIN bonus de capitana: ese bonus iba ligado
        // a la jugadora concreta, y se pierde si es precisamente ella la que sale.
        list[worstIdx] = { id: benchId, effective: benchRaw };
      }
    }
    list.forEach((s) => { total += s.effective; });
  });

  if (lineup.titularCoach) {
    const coach = players.find((p) => p.id === lineup.titularCoach);
    if (coach) total += calcPlayerPoints(jornada.stats?.[lineup.titularCoach], coach.position, resolveCoachWin(jornada, coach.team));
  }
  return total;
}

// Igual que computeTeamJornadaPoints, pero en vez de devolver el total,
// devuelve QUÉ cambios automáticos banquillo↔titular se han producido, para
// poder marcarlo visualmente en la pantalla de Puntos.
function computeLineupSwaps(lineup, jornada, players) {
  if (!lineup) return {};
  const bench = lineup.bench || {};
  const captainId = lineup.captainId;
  const byPos = {};
  (lineup.starters || []).forEach((id) => {
    const player = players.find((p) => p.id === id);
    if (!player) return;
    const raw = calcPlayerPoints(jornada.stats?.[id], player.position);
    const effective = id === captainId ? raw * 2 : raw;
    (byPos[player.position] = byPos[player.position] || []).push({ id, effective });
  });
  const swaps = {};
  Object.entries(byPos).forEach(([pos, list]) => {
    const benchId = bench[pos];
    const benchPlayer = benchId ? players.find((p) => p.id === benchId) : null;
    if (benchPlayer && list.length > 0) {
      const benchRaw = calcPlayerPoints(jornada.stats?.[benchId], pos);
      let worstIdx = 0;
      list.forEach((s, i) => { if (s.effective < list[worstIdx].effective) worstIdx = i; });
      if (benchRaw > list[worstIdx].effective) swaps[pos] = { outId: list[worstIdx].id, inId: benchId };
    }
  });
  return swaps;
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
  // Valor de mercado ACTUAL de toda la plantilla (no lo que se pagó, sino lo
  // que valen ahora mismo sus fichajes), usado para calcular hasta cuánto se
  // puede uno endeudar.
  currentSquadValue(team, players) {
    const ids = new Set(teamService.squadIds(team));
    return players.filter(p => ids.has(p.id)).reduce((s, p) => s + (p.basePrice || 0), 0);
  },
  // Máximo que se puede deber: 20% del valor actual de la plantilla.
  maxDebt(team, players) {
    return teamService.currentSquadValue(team, players) * 0.20;
  },
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
    return getEffectiveToday().getTime() < (entry?.acquiredAt || 0) + CLAUSE_LOCK_MS;
  },
  clauseUnlockAt(entry) {
    return (entry?.acquiredAt || 0) + CLAUSE_LOCK_MS;
  },
  addAsset(team, asset, pricePaid) {
    return { ...team, squad: [...(team.squad || []), { id: asset.id, pricePaid, clause: pricePaid, acquiredAt: getEffectiveToday().getTime() }], budgetSpent: (team.budgetSpent || 0) + pricePaid };
  },
  // Añade el reparto inicial a la plantilla SIN descontar presupuesto: el valor de equipo del
  // sorteo (90-100 M) es aparte de los 100 M que cada persona tiene disponibles para pujar.
  // Cada jugadora del reparto inicial nace con una cláusula igual a su valor de mercado ×
  // un multiplicador aleatorio entre 1,45 y 1,66 (independiente para cada una).
  addInitialSquad(team, entries) {
    const squadEntries = entries.map(e => ({
      id: e.id, pricePaid: e.price, acquiredAt: getEffectiveToday().getTime(), initial: true,
      clause: Math.round(e.price * randomClauseMultiplier()),
    }));
    return { ...team, squad: [...(team.squad || []), ...squadEntries] };
  },
  // Transferencia entre plantillas (cláusula pagada a otro usuario, u oferta aceptada): la
  // jugadora entra en la plantilla compradora con la cláusula igual al importe pagado y un
  // nuevo periodo de protección de 14 días.
  receiveTransfer(team, asset, amountPaid) {
    return { ...team, squad: [...(team.squad || []), { id: asset.id, pricePaid: amountPaid, clause: amountPaid, acquiredAt: getEffectiveToday().getTime(), transferred: true }], budgetSpent: (team.budgetSpent || 0) + amountPaid };
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
  // Reparto inicial automático: `count` jugadoras al azar con un valor de equipo total
  // dentro del rango [range.min, range.max], GARANTIZANDO suficientes jugadoras por
  // posición para poder alinear un quinteto "2-2-1" desde el primer día (2 Base, 2 Alero,
  // 1 Pívot como mínimo). El resto de huecos hasta `count` se rellena al azar.
  autoDraftSquad(freeJugadoras, range, count) {
    const { min, max } = range;
    const need = { BASE: 2, ALERO: 2, PIVOT: 1 };
    const byPos = { BASE: [], ALERO: [], PIVOT: [] };
    freeJugadoras.forEach(p => { if (byPos[p.position]) byPos[p.position].push(p); });

    let best = null; // { picked, total } — mejor intento válido (posiciones cubiertas) encontrado hasta ahora
    for (let attempt = 0; attempt < 80; attempt++) {
      const picked = [];
      let total = 0;
      let positionsOk = true;

      for (const posKey of Object.keys(need)) {
        const pool = shuffle(byPos[posKey]);
        let taken = 0;
        for (const p of pool) {
          if (taken >= need[posKey]) break;
          const price = Math.max(1, p.basePrice || 1);
          if (total + price > max) continue;
          picked.push({ id: p.id, price, position: p.position });
          total += price; taken++;
        }
        if (taken < need[posKey]) positionsOk = false;
      }

      if (positionsOk) {
        const remaining = shuffle(freeJugadoras.filter(p => !picked.some(x => x.id === p.id)));
        for (const p of remaining) {
          if (picked.length >= count) break;
          const price = Math.max(1, p.basePrice || 1);
          if (total + price > max) continue;
          picked.push({ id: p.id, price, position: p.position });
          total += price;
        }
      }

      if (positionsOk && picked.length === count && total >= min && total <= max) return picked;
      if (positionsOk && (!best || picked.length > best.picked.length || (picked.length === best.picked.length && total > best.total))) {
        best = { picked, total };
      }
    }
    return best ? best.picked : [];
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
    if (amount > available + teamService.maxDebt(team, players)) return { ok: false, error: `Superarías tu límite de endeudamiento (20% del valor de tu plantilla). Disponible: ${fmtCredits(available)}.` };
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
  // Retira tu propia puja activa antes de que se cierre el mercado.
  withdrawBid(bids, { marketId, assetId, userId }) {
    return bids.filter(b => !(b.marketId === marketId && b.assetId === assetId && b.userId === userId && b.status === "active"));
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
    if (amount < (asset.basePrice || 0)) return { ok: false, error: `La oferta no puede ser menor que su valor actual: ${fmtCredits(asset.basePrice || 0)}.` };
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

// --- idealFiveService ------------------------------------------------------
// "5 ideal" de cada jornada: las 5 jugadoras (nunca entrenadoras/es) que más
// puntos Fantasy hacen esa jornada, cuadrando con alguna de las 3
// alineaciones válidas (2-2-1 / 1-3-1 / 1-2-2). Se prueban las 3 y se elige la
// combinación con más puntos en total. Cada persona de la liga que tenga
// alguna de esas 5 jugadoras en su plantilla recibe 100.000 €.
const IDEAL_FIVE_REWARD = 0.1; // 100.000 €
const idealFiveService = {
  compute(jornada, players) {
    const jornadaPoints = tripleFantasyService.jornadaPointsByPlayer(jornada, players);
    const byPos = { BASE: [], ALERO: [], PIVOT: [] };
    Object.entries(jornadaPoints).forEach(([pid, pts]) => {
      const pl = players.find((p) => p.id === pid);
      if (pl && byPos[pl.position]) byPos[pl.position].push({ id: pid, pts });
    });
    Object.values(byPos).forEach((list) => list.sort((a, b) => b.pts - a.pts));

    let best = null;
    Object.entries(FORMATIONS).forEach(([formation, need]) => {
      const picks = [];
      let total = 0;
      let ok = true;
      Object.entries(need).forEach(([posKey, count]) => {
        const available = byPos[posKey] || [];
        if (available.length < count) { ok = false; return; }
        for (let i = 0; i < count; i++) { picks.push(available[i].id); total += available[i].pts; }
      });
      if (ok && (!best || total > best.total)) best = { formation, playerIds: picks, total };
    });
    return best; // null si no hay suficientes jugadoras con estadísticas esa jornada
  },
};

// --- marketPricingService ----------------------------------------------------
// Motor de precios "estilo bolsa" diseñado a medida (ver conversación de
// diseño): cada jugadora (nunca entrenadoras/es, que siguen con su sistema
// simple aparte) se revaloriza TODOS LOS DÍAS, haya jornada o no.
//
// Cada día que se juega su partido, se calcula un "empuje base" grande (una
// sola vez), que luego se REPARTE a lo largo de la semana con más fuerza el
// día siguiente (el "pico") y decreciendo hasta quedarse plano si todavía no
// ha vuelto a jugar. Encima de eso, cada día se suman empujones pequeños
// (demanda de mercado, dificultad de próximos rivales, inactividad, hype),
// y todo el conjunto se amortigua si la jugadora ya es muy cara (>85M), para
// que las caras no se disparen tanto en euros como las baratas.
const MARKET_BRAKE_THRESHOLD = 85; // millones: a partir de aquí empieza a frenar
const WEEK_WEIGHTS = [1.0, 1.3, 0.9, 0.9, 0.9, 0.7]; // día 0..5 desde su último partido; día 6+ se queda en 0.7

function marketBrakeFactor(priceM) {
  if (!priceM || priceM <= MARKET_BRAKE_THRESHOLD) return 1;
  return Math.min(1, Math.pow(MARKET_BRAKE_THRESHOLD / priceM, 2));
}
function daysBetweenDates(a, b) {
  const da = new Date(a + "T00:00:00"), db = new Date(b + "T00:00:00");
  return Math.round((db - da) / (24 * 3600 * 1000));
}
// Fecha del día EN LOCAL (no en UTC): con toISOString() el cambio de día
// llegaría 1-2 horas tarde para alguien en España (o pronto para quien esté
// más al oeste), según la época del año. Así se ajusta a la medianoche real
// del dispositivo de quien tenga la app abierta.
function toDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "Reloj" del modo pruebas: si hay una fecha simulada activa, TODO el
// sistema de fechas de la app (qué jornada toca, si ya ha empezado, si los
// chips ya se ven...) la usa como si fuera "hoy" de verdad, en vez de la
// fecha real del dispositivo. Sin modo pruebas, funciona exactamente igual
// que siempre (usa la fecha real). Se actualiza desde App() cuando se pulsa
// "Avanzar día" o "Salir" del modo pruebas.
let __simulatedTodayStr = null;
function setSimulatedToday(dateStr) { __simulatedTodayStr = dateStr || null; }
function getEffectiveToday() {
  if (__simulatedTodayStr) return new Date(__simulatedTodayStr + "T12:00:00");
  return new Date();
}

// --- realStandingsService ------------------------------------------------
// Clasificación de los equipos REALES (no de fantasy), con el criterio de
// desempate: 1º más victorias, 2º si hay empate a victorias se mira el
// enfrentamiento directo entre esos equipos (quien ganó ese partido concreto
// va por delante), 3º si el enfrentamiento directo también quedó en empate
// (o no se jugó) se usa la diferencia de puntos SOLO de ese duelo directo,
// y si tampoco eso decide, la diferencia de puntos GLOBAL de toda la
// temporada.
const realStandingsService = {
  compute(jornadas) {
    const table = {}; // team -> { wins, losses, pf, pc, played }
    const headToHead = {}; // "TeamA|TeamB" -> { aWins, bWins, aPts, bPts }
    const ensure = (name) => { if (!table[name]) table[name] = { team: name, wins: 0, losses: 0, pf: 0, pc: 0, played: 0 }; };

    (jornadas || []).forEach((j) => {
      (j.partidos || []).forEach((p) => {
        const winner = tripleFantasyService.matchWinner(p);
        if (!winner) return;
        const lf = Number(p.marcadorLocal), vf = Number(p.marcadorVisitante);
        if (Number.isNaN(lf) || Number.isNaN(vf)) return;
        ensure(p.local); ensure(p.visitante);
        table[p.local].played++; table[p.visitante].played++;
        table[p.local].pf += lf; table[p.local].pc += vf;
        table[p.visitante].pf += vf; table[p.visitante].pc += lf;
        if (winner === "local") { table[p.local].wins++; table[p.visitante].losses++; }
        else { table[p.visitante].wins++; table[p.local].losses++; }

        const key = [p.local, p.visitante].sort().join("|");
        if (!headToHead[key]) headToHead[key] = { [p.local]: { wins: 0, pts: 0 }, [p.visitante]: { wins: 0, pts: 0 } };
        const h = headToHead[key];
        if (!h[p.local]) h[p.local] = { wins: 0, pts: 0 };
        if (!h[p.visitante]) h[p.visitante] = { wins: 0, pts: 0 };
        h[p.local].pts += lf - vf;
        h[p.visitante].pts += vf - lf;
        if (winner === "local") h[p.local].wins += 1; else h[p.visitante].wins += 1;
      });
    });

    const rows = Object.values(table);
    rows.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      // Empate a victorias: duelo directo entre ESTOS DOS equipos.
      const key = [a.team, b.team].sort().join("|");
      const h = headToHead[key];
      if (h && h[a.team] && h[b.team]) {
        if (h[a.team].wins !== h[b.team].wins) return h[b.team].wins - h[a.team].wins;
        if (h[a.team].pts !== h[b.team].pts) return h[b.team].pts - h[a.team].pts;
      }
      // Sin enfrentamiento directo (o también empatado ahí): diferencia global.
      return (b.pf - b.pc) - (a.pf - a.pc);
    });
    return rows.map((r, i) => ({ ...r, rank: i + 1, diff: r.pf - r.pc, pts: r.wins + r.played }));
  },
};

// --- playoffService ----------------------------------------------------
// Motor de reglas de los playoffs (ver conversación de diseño): quién
// entra, el draft (día a día en cuartos/semis, de una sola tacada en la
// final), y quién pasa de ronda. Todo el estado compartido de esta fase
// vive en un único objeto guardado en kv_store ("playoffState" de cada
// liga), para que todo el mundo vea lo mismo en tiempo real.
const PLAYOFF_SQUAD_SIZE = { CUARTOS: 10, SEMIS: 9, FINAL: 9 }; // incluye entrenadora/or
const PLAYOFF_LIST_SIZE = { CUARTOS: 16, SEMIS: 16, FINAL: 20 };

const playoffService = {
  emptyState() {
    return {
      phase: "none", // none | cuartos_draft | cuartos_live | semis_draft | semis_live | final_draft | final_live | finished
      round: null, // "CUARTOS" | "SEMIS" | "FINAL": ronda de draft/juego actual
      qualifiers: [], // [userName,...] en orden (mejor primero) — fijado al empezar cada ronda
      draftDay: 0, // para cuartos/semis: qué día del reparto multi-día vamos
      lastAllocationDate: null, // fecha (YYYY-MM-DD) del último reparto diario ya hecho, para no repetirlo
      lists: {}, // { [round]: { [userName]: [playerId,...] } } — listas YA ENVIADAS (bloqueadas en cuanto se guardan)
      squads: {}, // { [round]: { [userName]: [playerId,...] } } — lo que se ha repartido de verdad
      lineups: {}, // { [round]: { [userName]: lineup } } — alineación de playoffs EN VIVO de cada uno (editable hasta que se congela)
      lockedLineups: {}, // { [jornadaTag]: { [userName]: lineup } } — alineación YA CONGELADA de cada jornada concreta (CUARTOS_IDA, CUARTOS_VUELTA, SEMIS o FINAL), igual que en liga regular
      log: [], // [{ round, day, userName, playerId, ts }] — "diario del draft" para el modo espectador
      pointsByRound: {}, // { [round]: { [userName]: number } }
      champion: null,
    };
  },

  // Etiquetas de jornada concretas que congelan alineación por separado — en
  // cuartos son DOS (ida y vuelta), porque se puede cambiar a la reserva
  // entre un partido y otro; semis y final solo tienen una.
  jornadaTagsForRound(round) {
    return round === "CUARTOS" ? ["CUARTOS_IDA", "CUARTOS_VUELTA"] : [round];
  },

  isPlayoffJornada(j) { return !!j?.playoffRound; },
  // Jornadas que SÍ cuentan para la clasificación de liga regular.
  regularJornadas(jornadas) { return (jornadas || []).filter((j) => !j.playoffRound); },
  // ¿Ha acabado ya la liga regular de verdad? (la última jornada regular
  // tiene TODOS sus partidos con marcador puesto). En cuanto esto es true,
  // se abre el draft de cuartos — aunque el primer partido de playoffs de
  // verdad todavía no haya llegado, dejando así los días de margen para
  // hacer el draft antes de que empiece a jugarse.
  regularSeasonFinished(jornadas) {
    const regular = playoffService.regularJornadas(jornadas);
    if (regular.length === 0) return false;
    const last = [...regular].sort((a, b) => jornadaNumberFromName(b.name) - jornadaNumberFromName(a.name))[0];
    const partidos = last.partidos || [];
    return partidos.length > 0 && partidos.every((p) => p.marcadorLocal !== "" && p.marcadorLocal != null && p.marcadorVisitante !== "" && p.marcadorVisitante != null);
  },
  findRoundJornadas(jornadas, playoffRound) { return (jornadas || []).filter((j) => j.playoffRound === playoffRound); },

  // Jornada(s) que definen una ronda (cuartos son 2, semis y final 1 sola).
  jornadasForRound(jornadas, round) {
    if (round === "CUARTOS") {
      return [...playoffService.findRoundJornadas(jornadas, "CUARTOS_IDA"), ...playoffService.findRoundJornadas(jornadas, "CUARTOS_VUELTA")];
    }
    return playoffService.findRoundJornadas(jornadas, round);
  },

  // Los equipos reales "vivos" en una ronda son los que la clasificación real
  // dice que corresponden a esa ronda del cuadro (mismo cálculo que
  // Clasificación → Playoffs, vía realBracketService): en cuartos, el top 8
  // de la liga regular directamente — no hace falta esperar a que alguien
  // rellene a mano los partidos de esa jornada; en semis/final, quien haya
  // ganado su serie/partido anterior según los marcadores reales ya
  // cargados. Así el fondo de jugadoras del draft nunca se queda vacío por
  // un dato administrativo que todavía no se ha escrito.
  aliveRealTeams(jornadas, round) {
    const bracket = realBracketService.buildBracket(jornadas);
    if (!bracket.ready) return new Set();
    if (round === "CUARTOS") return new Set(bracket.top8.map((r) => r.team));
    if (round === "SEMIS") return new Set(bracket.cuartos.map((m) => m.winner).filter(Boolean));
    if (round === "FINAL") return new Set(bracket.semis.map((m) => m.winner).filter(Boolean));
    return new Set();
  },

  // Fondo de jugadoras disponible para una ronda: todas las de los equipos
  // reales vivos, quitando las que ya se hayan repartido en ESTA ronda.
  availablePool(jornadas, players, round, alreadyDraftedIds) {
    const alive = playoffService.aliveRealTeams(jornadas, round);
    const drafted = new Set(alreadyDraftedIds || []);
    return players.filter((p) => alive.has(p.team) && !drafted.has(p.id));
  },

  // ¿Ya hay resultado completo de la(s) jornada(s) de esta ronda? (todos sus
  // partidos con marcador puesto) — así se sabe cuándo cerrarla y calcular
  // quién pasa.
  roundHasResults(jornadas, round) {
    const js = playoffService.jornadasForRound(jornadas, round);
    if (js.length === 0) return false;
    return js.every((j) => (j.partidos || []).length > 0 && (j.partidos || []).every((p) => p.marcadorLocal !== "" && p.marcadorLocal != null && p.marcadorVisitante !== "" && p.marcadorVisitante != null));
  },

  // Reparto de un día de cuartos/semis: 2 vueltas, en el orden de
  // clasificación de esta ronda; cada uno se lleva, en cada vuelta, su
  // preferencia más alta de su lista que siga libre. Ignora a quien ya haya
  // llegado a su objetivo de plantilla.
  runDailyAllocation({ order, lists, squadsSoFar, availableIds, targetSize }) {
    const remaining = new Set(availableIds);
    const picks = [];
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      for (const userName of order) {
        const already = (squadsSoFar[userName] || []).length + picks.filter((p) => p.userName === userName).length;
        if (already >= targetSize) continue;
        const list = lists[userName] || [];
        const pick = list.find((pid) => remaining.has(pid));
        if (pick) { remaining.delete(pick); picks.push({ userName, playerId: pick }); }
      }
    }
    return picks;
  },

  // Reparto de la final: una sola sesión, recorriendo las listas ronda a
  // ronda (1ª elección de cada uno, luego 2ª...), alternando entre los 2
  // finalistas — el mejor situado en semis elige primero en cada vuelta —
  // hasta que cada uno complete su plantilla.
  runFinalAllocation({ order, lists, availableIds, targetSize }) {
    const remaining = new Set(availableIds);
    const picks = [];
    const counts = {}; order.forEach((u) => { counts[u] = 0; });
    const maxRounds = Math.max(0, ...order.map((u) => (lists[u] || []).length));
    for (let round = 0; round < maxRounds && [...remaining].length > 0; round++) {
      for (const userName of order) {
        if (counts[userName] >= targetSize) continue;
        const list = lists[userName] || [];
        const pid = list[round];
        const chosen = pid && remaining.has(pid) ? pid : null;
        if (chosen) { remaining.delete(chosen); picks.push({ userName, playerId: chosen }); counts[userName]++; }
      }
    }
    // Si a alguien le sigue faltando plantilla al acabar las listas (p. ej.
    // listas más cortas que 20), se completa con lo primero que quede libre.
    for (const userName of order) {
      while (counts[userName] < targetSize && remaining.size > 0) {
        const fallback = [...remaining][0];
        remaining.delete(fallback);
        picks.push({ userName, playerId: fallback });
        counts[userName]++;
      }
    }
    return picks;
  },

  // Puntos de un usuario en una ronda de playoffs. Usa la alineación YA
  // CONGELADA de cada jornada concreta (una para ida, otra para vuelta en
  // cuartos) — igual que en liga regular, una vez empezada esa jornada ya no
  // vale cambiarla. Antes de que empiece, se usa la alineación en vivo como
  // previsión.
  computeRoundPoints(jornadas, round, lockedLineups, userName, players, liveLineup) {
    const js = playoffService.jornadasForRound(jornadas, round);
    return js.reduce((sum, j) => {
      const locked = (lockedLineups[j.playoffRound] || {})[userName];
      const lineup = locked || (hasJornadaEffectivelyStarted(j) ? null : liveLineup);
      if (!lineup) return sum;
      const ids = [...(lineup.starters || [])];
      if (lineup.titularCoach) ids.push(lineup.titularCoach);
      return sum + ids.reduce((s, id) => {
        const player = players.find((p) => p.id === id);
        if (!player) return s;
        const pts = player.position === "DT" ? calcCoachPoints(null, resolveCoachWin(j, player.team)).total : calcPlayerPoints(j.stats?.[id], player.position);
        return s + (id === lineup.captainId ? pts * 2 : pts);
      }, 0);
    }, 0);
  },

  // Corte de una ronda: ordena por puntos (desempate: mejor puesto en la
  // ronda/clasificación anterior, que ya viene dado por el orden en
  // "qualifiers"), y devuelve los "cutSize" primeros.
  cutTop(qualifiersOrder, pointsByUser, cutSize) {
    const withIdx = qualifiersOrder.map((u, i) => ({ u, pts: pointsByUser[u] || 0, seedIdx: i }));
    withIdx.sort((a, b) => (b.pts - a.pts) || (a.seedIdx - b.seedIdx));
    return withIdx.slice(0, cutSize).map((x) => x.u);
  },
};

// --- realBracketService ----------------------------------------------------
// Cuadro de PLAYOFFS DE LOS EQUIPOS REALES (el basket de verdad, ida+vuelta
// en cuartos, partido único en semis/final) — no confundir con el sistema de
// fantasy (draft + corte por puntos). Usa la misma columna "playoff_round"
// de las jornadas que el sistema de fantasy, así solo hay que rellenar un
// dato por jornada, no dos convenciones distintas.
function jornadaFase(j) {
  const r = j?.playoffRound;
  if (r === "CUARTOS_IDA" || r === "CUARTOS_VUELTA") return "cuartos";
  if (r === "SEMIS") return "semis";
  if (r === "FINAL") return "final";
  return "regular";
}
function jornadaLeg(j) {
  return j?.playoffRound === "CUARTOS_VUELTA" ? 2 : 1;
}

const realBracketService = {
  // Busca, dentro de los partidos de una jornada, el que enfrenta a estos dos
  // equipos (sin importar quién fue local o visitante), y devuelve el
  // marcador ya "orientado" a (teamA, teamB) para poder sumar ida+vuelta.
  findPartido(jornada, teamA, teamB) {
    const partidos = jornada?.partidos || [];
    const p = partidos.find((x) => (x.local === teamA && x.visitante === teamB) || (x.local === teamB && x.visitante === teamA));
    if (!p) return null;
    const hasScore = p.marcadorLocal !== "" && p.marcadorLocal != null && p.marcadorVisitante !== "" && p.marcadorVisitante != null;
    if (!hasScore) return { played: false };
    const aScore = p.local === teamA ? Number(p.marcadorLocal) : Number(p.marcadorVisitante);
    const bScore = p.local === teamB ? Number(p.marcadorLocal) : Number(p.marcadorVisitante);
    return { played: true, aScore, bScore };
  },

  // Serie a doble partido (cuartos): gana quien más suma entre ida y vuelta.
  seriesResult(idaJornada, vueltaJornada, teamA, teamB) {
    const leg1 = idaJornada ? this.findPartido(idaJornada, teamA, teamB) : null;
    const leg2 = vueltaJornada ? this.findPartido(vueltaJornada, teamA, teamB) : null;
    let aggA = null, aggB = null, winner = null;
    if (leg1?.played && leg2?.played) {
      aggA = leg1.aScore + leg2.aScore;
      aggB = leg1.bScore + leg2.bScore;
      if (aggA !== aggB) winner = aggA > aggB ? teamA : teamB;
    }
    return { teamA, teamB, leg1, leg2, aggA, aggB, winner };
  },

  // Partido único (semis / final).
  singleMatch(jornada, teamA, teamB) {
    const r = jornada ? this.findPartido(jornada, teamA, teamB) : null;
    if (!r || !r.played) return { teamA, teamB, played: false, winner: null };
    const winner = r.aScore === r.bScore ? null : (r.aScore > r.bScore ? teamA : teamB);
    return { teamA, teamB, played: true, aScore: r.aScore, bScore: r.bScore, winner };
  },

  // Cuadro completo: los 8 primeros de la liga regular (excluyendo cualquier
  // jornada de playoff) emparejados 1-8, 2-7, 3-6, 4-5, y de ahí para arriba.
  // Se recalcula solo con la clasificación actual, así que el emparejamiento
  // "provisional" ya se ve desde antes de que acabe la liga regular y se va
  // actualizando jornada a jornada.
  buildBracket(jornadas) {
    const regularJornadas = (jornadas || []).filter((j) => jornadaFase(j) === "regular");
    const standings = realStandingsService.compute(regularJornadas);
    const top8 = standings.slice(0, 8);
    if (top8.length < 8) return { ready: false, top8 };

    const cuartosIda = jornadas.find((j) => jornadaFase(j) === "cuartos" && jornadaLeg(j) === 1);
    const cuartosVuelta = jornadas.find((j) => jornadaFase(j) === "cuartos" && jornadaLeg(j) === 2);
    const semisJornada = jornadas.find((j) => jornadaFase(j) === "semis");
    const finalJornada = jornadas.find((j) => jornadaFase(j) === "final");

    const pairs = [[0, 7], [1, 6], [2, 5], [3, 4]];
    const cuartos = pairs.map(([hi, lo]) => {
      const teamA = top8[hi].team, teamB = top8[lo].team;
      const res = this.seriesResult(cuartosIda, cuartosVuelta, teamA, teamB);
      return { seedA: top8[hi].rank, seedB: top8[lo].rank, ...res };
    });

    const semiPairs = [[0, 3], [1, 2]]; // ganador QF1 vs ganador QF4, ganador QF2 vs ganador QF3
    const semis = semiPairs.map(([i1, i2]) => {
      const teamA = cuartos[i1].winner, teamB = cuartos[i2].winner;
      if (!teamA || !teamB) return { teamA: teamA || null, teamB: teamB || null, played: false, winner: null, pending: true };
      return this.singleMatch(semisJornada, teamA, teamB);
    });

    const finalTeamA = semis[0]?.winner, finalTeamB = semis[1]?.winner;
    const final = (!finalTeamA || !finalTeamB)
      ? { teamA: finalTeamA || null, teamB: finalTeamB || null, played: false, winner: null, pending: true }
      : this.singleMatch(finalJornada, finalTeamA, finalTeamB);

    return { ready: true, top8, cuartos, semis, final };
  },

  // Partidos "a mostrar" de una jornada de playoffs: los que ya haya
  // cargados de verdad (con o sin marcador todavía) más, para los cruces del
  // cuadro que no tengan partido cargado, uno "previsto" sin marcador con los
  // equipos que le tocan según la clasificación — así el Calendario nunca se
  // queda vacío en cuanto se abre la ronda, y siempre coincide con lo que se
  // ve en Clasificación → Playoffs (es el mismo cálculo).
  projectedPartidos(jornadas, jornada) {
    const real = jornada?.partidos || [];
    const fase = jornadaFase(jornada);
    if (fase === "regular") return real;
    const bracket = this.buildBracket(jornadas);
    if (!bracket.ready) return real;
    let pairs = [];
    if (fase === "cuartos") pairs = bracket.cuartos.map((m) => [m.teamA, m.teamB]);
    else if (fase === "semis") pairs = bracket.semis.map((m) => [m.teamA, m.teamB]);
    else if (fase === "final") pairs = [[bracket.final.teamA, bracket.final.teamB]];
    const merged = [...real];
    pairs.forEach(([teamA, teamB], i) => {
      if (!teamA || !teamB) return;
      const yaExiste = real.some((p) => (p.local === teamA && p.visitante === teamB) || (p.local === teamB && p.visitante === teamA));
      if (!yaExiste) merged.push({ id: `proj_${jornada?.id || fase}_${i}`, local: teamA, visitante: teamB, marcadorLocal: "", marcadorVisitante: "", fecha: null, previsto: true });
    });
    return merged;
  },
};

// --- marketPricingService ----------------------------------------------------
const marketPricingService = {
  // Clasificación real de los equipos (no de fantasy), calculada sola a
  // partir de todos los marcadores ya introducidos en "partidos".
  computeStandings(jornadas) {
    const table = {}; // team -> { wins, played }
    (jornadas || []).forEach((j) => {
      (j.partidos || []).forEach((p) => {
        const winner = tripleFantasyService.matchWinner(p);
        if (!winner) return;
        [p.local, p.visitante].forEach((team) => {
          if (!table[team]) table[team] = { wins: 0, played: 0 };
          table[team].played += 1;
        });
        table[winner === "local" ? p.local : p.visitante].wins += 1;
      });
    });
    const teams = Object.keys(table);
    const withPct = teams.map((t) => ({ team: t, winPct: table[t].played > 0 ? table[t].wins / table[t].played : 0.5 }));
    withPct.sort((a, b) => b.winPct - a.winPct);
    const standings = {};
    withPct.forEach((t, i) => { standings[t.team] = { rank: i + 1, winPct: t.winPct }; });
    return { standings, totalTeams: teams.length || 1 };
  },

  // Media de victorias de los próximos 2 rivales programados de un equipo,
  // buscando en el calendario a partir de "fromDateStr". null si no hay
  // partidos futuros con fecha reconocible.
  nextTwoOpponentsAvgWinPct(teamName, jornadas, fromDateStr, standings) {
    const upcoming = [];
    (jornadas || []).forEach((j) => (j.partidos || []).forEach((p) => {
      if (p.local !== teamName && p.visitante !== teamName) return;
      const d = parseFechaDDMMYYYY(p.fecha);
      if (!d || toDateStr(d) <= fromDateStr) return;
      const opponent = p.local === teamName ? p.visitante : p.local;
      upcoming.push({ date: d, opponent });
    }));
    if (upcoming.length === 0) return null;
    upcoming.sort((a, b) => a.date - b.date);
    const next2 = upcoming.slice(0, 2).map((u) => (standings[u.opponent]?.winPct ?? 0.5));
    return next2.reduce((a, b) => a + b, 0) / next2.length;
  },

  // Media de puntos Fantasy de todas las jugadoras (sin entrenadoras/es) que
  // tienen estadística en esa jornada.
  leagueAveragePoints(jornada, players) {
    const vals = Object.entries(jornada.stats || {})
      .map(([pid, s]) => { const pl = players.find((x) => x.id === pid); return pl && pl.position !== "DT" ? calcPointsBreakdown(s, pl.position).total : null; })
      .filter((v) => v !== null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  },

  // Busca si esta jugadora tiene un partido con marcador ya puesto en la
  // fecha indicada, y devuelve también su jornada y estadística de ese día.
  findMatchOnDate(player, jornadas, dateStr) {
    for (const jornada of jornadas || []) {
      for (const partido of jornada.partidos || []) {
        if (partido.local !== player.team && partido.visitante !== player.team) continue;
        const d = parseFechaDDMMYYYY(partido.fecha);
        if (!d || toDateStr(d) !== dateStr) continue;
        const winner = tripleFantasyService.matchWinner(partido);
        if (!winner) continue; // sin marcador todavía: no cuenta como "jugado" para el precio
        const stats = jornada.stats?.[player.id];
        if (!stats) continue;
        return { jornada, partido, stats, winner };
      }
    }
    return null;
  },

  // El empuje "grande", una sola vez, el día de su partido.
  computeBigPush({ stats, leagueAvgPoints, teamRank, totalTeams, opponentWinPct, won, isMvpPartido, minutesJump, isConsistentGood }) {
    const puntosFactor = ((stats.puntos || 0) - leagueAvgPoints) * 0.0010;
    let resultadoFactor = 0;
    if (won === true) resultadoFactor = 0.0025 * (1 + (opponentWinPct - 0.5));
    else if (won === false) resultadoFactor = -0.0025 * (1 + (0.5 - opponentWinPct));
    const posicionFactor = totalTeams > 0 ? ((totalTeams - teamRank) / totalTeams) * 0.0025 : 0;
    const mvpPartidoFactor = isMvpPartido ? 0.005 : 0;
    const minutosFactor = minutesJump ? 0.0015 : 0;
    const consistenciaFactor = isConsistentGood ? 0.0015 : 0;
    return puntosFactor + resultadoFactor + posicionFactor + mvpPartidoFactor + minutosFactor + consistenciaFactor;
  },

  // Multiplicador de racha (caliente si encadena empujes positivos, fría si
  // encadena negativos). Tope ×1,25 en ambos sentidos.
  streakMultiplier(streakCount) {
    if (!streakCount || streakCount <= 0) return 1;
    return Math.min(1.25, 1 + 0.05 * streakCount);
  },

  // Cuánto pesa hoy el empuje base fijado el día de su último partido.
  weightForDay(daysSinceCycleStart) {
    if (daysSinceCycleStart < 0) return 0;
    const idx = Math.min(daysSinceCycleStart, WEEK_WEIGHTS.length - 1);
    return WEEK_WEIGHTS[idx];
  },

  // Los empujones pequeños que se recalculan todos los días.
  computeDailySmallFactors({ bidsForHer, totalTeams, opponentsAvgWinPct, lowMinutes, favoritesForHer }) {
    const demandConfidence = Math.min(1, bidsForHer / Math.max(1, 3 * totalTeams));
    const demanda = demandConfidence * 0.006;
    let rivales = 0;
    if (opponentsAvgWinPct != null) {
      const diff = 0.5 - opponentsAvgWinPct;
      rivales = diff >= 0 ? diff * 0.0075 : diff * 0.003;
    }
    const inactividad = lowMinutes ? -0.001 : 0;
    const hypeConfidence = Math.min(1, favoritesForHer / Math.max(1, 0.5 * totalTeams));
    const hype = hypeConfidence * 0.003;
    return demanda + rivales + inactividad + hype;
  },

  // Punto de entrada: calcula el precio de HOY para una jugadora, o null si
  // no hay que tocarla (es entrenadora/or, o ya se actualizó hoy).
  computeDailyUpdate(player, ctx) {
    if (player.position === "DT") return null;
    const cycle = player.marketCycle || {};
    if (cycle.lastPricedDate === ctx.todayStr) return null;

    let { cycleStartDate = null, cycleBase = 0, streakCount = 0, pointsHistory = [], minutesHistory = [] } = cycle;

    const played = marketPricingService.findMatchOnDate(player, ctx.jornadas, ctx.todayStr);
    if (played) {
      const { jornada, partido, stats, winner } = played;
      const isLocal = partido.local === player.team;
      const won = (winner === "local") === isLocal;
      const opponent = isLocal ? partido.visitante : partido.local;
      const standing = ctx.standings[player.team] || { rank: ctx.totalTeams, winPct: 0.5 };
      const oppStanding = ctx.standings[opponent] || { winPct: 0.5 };
      const leagueAvg = marketPricingService.leagueAveragePoints(jornada, ctx.players);
      const avgMin = minutesHistory.length ? minutesHistory.reduce((a, b) => a + b, 0) / minutesHistory.length : (stats.minutos || 0);
      const minutesJump = (stats.minutos || 0) - avgMin >= 8;
      const recentPts = [...pointsHistory, stats.puntos || 0].slice(-4);
      const avgRecent = recentPts.reduce((a, b) => a + b, 0) / recentPts.length;
      const variance = recentPts.reduce((a, b) => a + Math.pow(b - avgRecent, 2), 0) / recentPts.length;
      const isConsistentGood = recentPts.length >= 4 && Math.sqrt(variance) < 6 && avgRecent > leagueAvg;

      let base = marketPricingService.computeBigPush({
        stats, leagueAvgPoints: leagueAvg, teamRank: standing.rank, totalTeams: ctx.totalTeams,
        opponentWinPct: oppStanding.winPct, won, isMvpPartido: !!stats.mvp, minutesJump, isConsistentGood,
      });

      const sameSignAsBefore = (base >= 0 && cycleBase >= 0) || (base < 0 && cycleBase < 0);
      streakCount = sameSignAsBefore ? streakCount + 1 : 1;
      base *= marketPricingService.streakMultiplier(streakCount);

      cycleStartDate = ctx.todayStr;
      cycleBase = base;
      pointsHistory = [...pointsHistory, stats.puntos || 0].slice(-5);
      minutesHistory = [...minutesHistory, stats.minutos || 0].slice(-4);
    }

    const daysSince = cycleStartDate ? daysBetweenDates(cycleStartDate, ctx.todayStr) : -1;
    const weeklyPush = cycleStartDate ? cycleBase * marketPricingService.weightForDay(daysSince) : 0;

    const opponentsAvg = marketPricingService.nextTwoOpponentsAvgWinPct(player.team, ctx.jornadas, ctx.todayStr, ctx.standings);
    const lowMinutes = minutesHistory.length >= 2 && minutesHistory.slice(-2).every((m) => m < 10);
    const smallPush = marketPricingService.computeDailySmallFactors({
      bidsForHer: ctx.bidsMap[player.id] || 0, totalTeams: ctx.totalTeams, opponentsAvgWinPct: opponentsAvg,
      lowMinutes, favoritesForHer: ctx.favoritesMap[player.id] || 0,
    });

    let totalPush = weeklyPush + smallPush;
    totalPush *= marketBrakeFactor(player.basePrice || 1);

    const nextCycle = { cycleStartDate, cycleBase, streakCount, pointsHistory, minutesHistory, lastPricedDate: ctx.todayStr };
    // Si hoy no ha pasado nada de verdad (sin jornada, sin demanda, sin nada
    // que empuje el precio), no tocamos basePrice/prevBasePrice/historial —
    // así se conserva el último movimiento real (para el Top subidas/bajadas
    // y el gráfico) en vez de "aplanarlo" a diario con un cambio de 0.
    if (totalPush === 0) {
      return { marketCycle: nextCycle };
    }
    const newPrice = Math.max(0.1, (player.basePrice || 1) * (1 + totalPush));
    return {
      basePrice: newPrice,
      prevBasePrice: player.basePrice,
      priceHistory: [...(player.priceHistory || []), { date: ctx.todayStr, value: newPrice }].slice(-60),
      marketCycle: nextCycle,
    };
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
  // Ventana de mercado del nuevo modelo: el mercado está SIEMPRE abierto (no
  // hay periodo cerrado); cada 24 horas, exactamente a la hora fija de esta
  // liga (la hora a la que se creó), se cierra, se reparten las pujas
  // ganadas, y se abre uno nuevo con jugadoras distintas al instante.
  // "resetHour" es un texto "HH:MM".
  computeWindow(resetHour, now = Date.now()) {
    const reset = marketService.parseHM(resetHour);
    const todayReset = marketService.atHour(now, reset);
    const closesAt = now < todayReset ? todayReset : todayReset + 24 * 3600 * 1000;
    const opensAt = closesAt - 24 * 3600 * 1000;
    return { opensAt, closesAt, isOpen: true };
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
      const squadValue = teamService.currentSquadValue(t, players); // desempate: más valor de plantilla ACTUAL gana
      return { name, total, prevTotal, jCount, cCount, value: (t.budgetSpent || 0), squadValue };
    }).sort((a, b) => (b.total - a.total) || (b.squadValue - a.squadValue));
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
      marketCycle: p.market_cycle || {},
    }));
  } catch {
    return [];
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
async function deleteShared(key) {
  try {
    const { error } = await supabase.from("kv_store").delete().eq("key", key);
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
   CUENTAS REALES (Supabase Auth) — email + contraseña. El nombre que se usa
   en el resto del juego se guarda en la tabla "profiles", vinculado a la
   cuenta, y queda protegido: una vez registrado, nadie más puede volver a
   usarlo. El resto de la app sigue funcionando exactamente igual que antes,
   usando ese nombre — solo cambia CÓMO se consigue de forma segura.
   ----------------------------------------------------------------------- */
async function signUpAccount(email, password, name) {
  try {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) throw error;
    const userId = data.user?.id;
    if (!userId) return { ok: false, error: "No se pudo crear la cuenta." };
    // Supabase no siempre lanza un error cuando el email ya existe (por seguridad, para no
    // revelar qué emails están registrados): en vez de eso, devuelve "éxito" pero con
    // identities vacío. Hay que detectarlo aquí, o si no el fallo real sale luego disfrazado
    // de "nombre en uso" al intentar guardar el perfil sobre una cuenta que ya tenía uno.
    if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
      return { ok: false, error: "Ese email ya tiene una cuenta. Prueba a iniciar sesión." };
    }
    const { error: profErr } = await supabase.from("profiles").insert({ id: userId, name: name.trim() });
    if (profErr) {
      if (profErr.code === "23505") {
        // Distingue SOBRE QUÉ columna ha chocado: si es el id (clave primaria), esta
        // cuenta ya tenía un perfil de antes (email repetido); si no, el nombre es el que
        // ya está cogido por otra persona.
        const onId = /pkey|profiles_pkey/i.test(profErr.message || "");
        return { ok: false, error: onId ? "Ese email ya tiene una cuenta. Prueba a iniciar sesión." : "Ese nombre ya está en uso. Elige otro." };
      }
      return { ok: false, error: "No se pudo guardar tu nombre." };
    }
    // Sin sesión todavía = Supabase exige confirmar el email antes de poder entrar.
    if (!data.session) return { ok: true, needsConfirmation: true, name: name.trim() };
    return { ok: true, needsConfirmation: false, name: name.trim() };
  } catch (e) {
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("already registered") || msg.includes("already exists")) return { ok: false, error: "Ese email ya tiene una cuenta. Prueba a iniciar sesión." };
    if (msg.includes("password")) return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
    return { ok: false, error: "No se pudo crear la cuenta. Revisa el email." };
  }
}
async function signInAccount(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    const userId = data.user?.id;
    const { data: prof } = await supabase.from("profiles").select("name").eq("id", userId).maybeSingle();
    if (!prof?.name) return { ok: false, error: "Tu cuenta no tiene nombre asignado. Contacta para revisarlo." };
    return { ok: true, name: prof.name };
  } catch {
    return { ok: false, error: "Email o contraseña incorrectos." };
  }
}
async function signOutAccount() {
  try { await supabase.auth.signOut(); } catch {}
}
// Abre el flujo de Google (redirige fuera de la app y vuelve solo).
async function signInWithGoogle() {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo abrir el inicio de sesión con Google." };
  }
}
// Al abrir la app: si ya hay una sesión activa (se recuerda sola entre
// visitas, incluida la de Google tras volver de la redirección), recupera el
// nombre vinculado a esa cuenta. Si la sesión es válida pero es la PRIMERA
// vez (típico de Google: nunca se le pidió un nombre), devuelve needsName
// para que la app pida el nombre antes de dejar entrar.
async function getSessionProfile() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { hasSession: false };
    const { data: prof } = await supabase.from("profiles").select("name").eq("id", session.user.id).maybeSingle();
    if (prof?.name) return { hasSession: true, name: prof.name };
    return { hasSession: true, name: null, userId: session.user.id };
  } catch {
    return { hasSession: false };
  }
}
// Completa el perfil de una cuenta que ya tiene sesión pero todavía no tiene
// nombre elegido (primer inicio de sesión con Google).
async function chooseNameForSession(userId, name) {
  try {
    const { error } = await supabase.from("profiles").insert({ id: userId, name: name.trim() });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Ese nombre ya está en uso. Elige otro." };
      return { ok: false, error: "No se pudo guardar tu nombre." };
    }
    return { ok: true, name: name.trim() };
  } catch {
    return { ok: false, error: "No se pudo guardar tu nombre." };
  }
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
      const rest = row.key.slice(TEAM_KEY_PREFIX.length); // "<leagueId>::<slug>"
      const sep = rest.indexOf("::");
      const leagueId = sep >= 0 ? rest.slice(0, sep) : rest;
      const name = t?.name || (sep >= 0 ? rest.slice(sep + 2) : rest);
      map[`${leagueId}::${name}`] = { ...t, name, leagueId };
    });
    return map;
  } catch {
    return null;
  }
}

// Cuántas pujas ACTIVAS tiene cada jugadora ahora mismo, sumando TODAS las
// ligas a la vez. Se usa para el factor de "demanda de mercado" del nuevo
// sistema de precios.
async function readAllBidsGlobal() {
  try {
    const { data, error } = await supabase.from("kv_store").select("value").like("key", "bids_%");
    if (error) throw error;
    const counts = {};
    (data || []).forEach((row) => {
      (row.value || []).forEach((b) => {
        if (b.status !== "active") return;
        counts[b.assetId] = (counts[b.assetId] || 0) + 1;
      });
    });
    return counts;
  } catch {
    return {};
  }
}

// Cuánta gente (en TODAS las ligas, no solo la tuya) tiene marcada como
// favorita a cada jugadora. Se usa para el factor de "hype".
async function readFavoritesGlobalCounts() {
  try {
    const { data, error } = await supabase.from("favorites").select("player_id");
    if (error) throw error;
    const counts = {};
    (data || []).forEach((row) => { counts[row.player_id] = (counts[row.player_id] || 0) + 1; });
    return counts;
  } catch {
    return {};
  }
}
async function addFavoriteGlobal(playerId, userName) {
  try { await supabase.from("favorites").upsert({ player_id: playerId, user_name: userName }); } catch {}
}
async function removeFavoriteGlobal(playerId, userName) {
  try { await supabase.from("favorites").delete().eq("player_id", playerId).eq("user_name", userName); } catch {}
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
  const created_at = new Date().toISOString();
  try {
    const { error } = await supabase.from("leagues").insert({ id, name, invite_code, created_by: creatorName, created_at });
    if (error) throw error;
    return { id, name, invite_code, created_by: creatorName, created_at };
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

async function deleteLeagueRow(id) {
  try {
    const { error } = await supabase.from("leagues").delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}

// Ahora que hay cuentas reales, "mis ligas" ya NO se calcula desde algo
// guardado en el navegador (eso se compartía entre cualquier cuenta que
// entrara desde el mismo dispositivo, lo cual estaba mal). Se calcula de
// verdad mirando en qué ligas esta cuenta tiene un equipo creado — dato que
// vive en el servidor, ligado al nombre de la cuenta, no al dispositivo.
async function readMyLeagueIdsFromAccount(name) {
  try {
    const allTeams = (await readAllTeamsGlobal()) || {};
    const ids = new Set();
    Object.values(allTeams).forEach((t) => { if (t.name === name) ids.add(t.leagueId); });
    return [...ids];
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
async function removeMyLeagueId(id) {
  const ids = await readMyLeagueIds();
  const next = ids.filter((x) => x !== id);
  await writePersonal("myLeagues", next);
  return next;
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

// Combina una lectura fresca de "jornadas" (p. ej. de un poll independiente
// como syncMarket) con el estado que ya había en memoria, SIN perder nunca
// una alineación ya bloqueada localmente. Esto evita que un poll más lento
// (que empezó a leer antes de que otro proceso guardara un bloqueo) pise ese
// bloqueo al terminar más tarde y sobrescribir el estado con datos viejos.
function mergeJornadasPreservingLineups(freshJornadas, prevJornadas) {
  const prevById = new Map((prevJornadas || []).map((j) => [j.id, j]));
  return (freshJornadas || []).map((j) => {
    const prev = prevById.get(j.id);
    if (!prev) return j;
    const mergedLineups = { ...(j.lineups || {}), ...(prev.lineups || {}) };
    return { ...j, lineups: mergedLineups };
  });
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
        p1Local: p.marcador_local_p1 ?? "", p2Local: p.marcador_local_p2 ?? "", p3Local: p.marcador_local_p3 ?? "", p4Local: p.marcador_local_p4 ?? "",
        p1Visitante: p.marcador_visitante_p1 ?? "", p2Visitante: p.marcador_visitante_p2 ?? "", p3Visitante: p.marcador_visitante_p3 ?? "", p4Visitante: p.marcador_visitante_p4 ?? "",
      });
    });
    const statsByJornada = {};
    (sRows || []).forEach((s) => {
      const map = statsByJornada[s.jornada_id] || (statsByJornada[s.jornada_id] = {});
      map[s.player_id] = {
        minutos: s.minutos || 0, puntos: s.puntos || 0, t3: s.t3 || 0, tlibre: s.tlibre || 0,
        t2: s.t2 || 0, t2Intentados: s.t2_intentados || 0, t3Intentados: s.t3_intentados || 0, tlibreIntentados: s.tlibre_intentados || 0,
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
        playoffRound: j.playoff_round || null, // null | CUARTOS_IDA | CUARTOS_VUELTA | SEMIS | FINAL
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
    const r1 = await supabase.from("jornadas").upsert({ id, name, lineups: lineups || {}, mvp_player_id: mvpPlayerId || null });
    if (r1.error) { console.error("writeJornada: error guardando jornadas", r1.error); return { ok: false, error: r1.error.message }; }

    const r2 = await supabase.from("partidos").delete().eq("jornada_id", id);
    if (r2.error) { console.error("writeJornada: error borrando partidos", r2.error); return { ok: false, error: r2.error.message }; }
    if (partidos && partidos.length > 0) {
      const rows = partidos.map((p) => ({
        id: p.id, jornada_id: id, local: p.local, visitante: p.visitante,
        fecha: p.fecha || null, hora: p.hora || null,
        marcador_local: (p.marcadorLocal === "" || p.marcadorLocal == null) ? null : Number(p.marcadorLocal),
        marcador_visitante: (p.marcadorVisitante === "" || p.marcadorVisitante == null) ? null : Number(p.marcadorVisitante),
      }));
      const r3 = await supabase.from("partidos").insert(rows);
      if (r3.error) { console.error("writeJornada: error insertando partidos", r3.error); return { ok: false, error: r3.error.message }; }
    }

    const statsEntries = Object.entries(stats || {});
    if (statsEntries.length > 0) {
      const rows = statsEntries.map(([playerId, s]) => ({
        jornada_id: id, player_id: playerId,
        minutos: s.minutos || 0, puntos: s.puntos || 0, t3: s.t3 || 0, tlibre: s.tlibre || 0,
        t2: s.t2 || 0, t2_intentados: s.t2Intentados || 0, t3_intentados: s.t3Intentados || 0, tlibre_intentados: s.tlibreIntentados || 0,
        rebofen: s.rebofen || 0, rebdefe: s.rebdefe || 0, asist: s.asist || 0, pd: s.pd || 0,
        robos: s.robos || 0, tap: s.tap || 0, faltas: s.faltas || 0, valoracion: s.valoracion || 0,
        jugo: !!s.jugo, victoria: !!s.victoria, diferencia: s.diferencia || 0, mvp: !!s.mvp,
      }));
      const r4 = await supabase.from("jornada_stats").upsert(rows, { onConflict: "jornada_id,player_id" });
      if (r4.error) { console.error("writeJornada: error guardando jornada_stats", r4.error); return { ok: false, error: r4.error.message }; }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
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

// En iOS (iPhone/iPad), da igual el navegador que se use (Chrome, Firefox...):
// por dentro todos usan el motor de Safari, y Apple solo permite las
// notificaciones push si la web está añadida a la pantalla de inicio. Esto
// sirve para explicarlo bien en vez de decir simplemente "no disponible".
function isIOS() {
  return typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent || "");
}
function isStandalonePWA() {
  if (typeof window === "undefined") return false;
  return window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)")?.matches;
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

// Cancela la suscripción push del navegador y borra la fila correspondiente
// en Supabase, para que esta persona deje de recibir avisos en esta liga.
async function disablePushNotifications() {
  try {
    if (pushSupported()) {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        await subscription.unsubscribe();
      }
    }
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
// separador "::" (no "_") entre el id de la liga y el nombre: el propio id de
// liga (uid("lg")) ya lleva guiones bajos por dentro, así que un separador
// que también fuera "_" hacía imposible saber dónde terminaba uno y
// empezaba el otro al leer TODOS los equipos de golpe (readAllTeamsGlobal).
function teamKey(leagueId, name) { return `${TEAM_KEY_PREFIX}${leagueId}::${slug(name) || "x"}`; }
function leagueKey(leagueId, base) { return `${base}_${leagueId}`; }

async function readTeam(leagueId, name) {
  return await readShared(teamKey(leagueId, name), null);
}
async function writeTeam(leagueId, name, team) {
  // Guardamos el nombre dentro del propio registro para poder reconstruir
  // el mapa { nombre -> equipo } sin depender de un índice compartido aparte.
  return await writeShared(teamKey(leagueId, name), { ...team, name });
}
async function deleteTeamRow(leagueId, name) {
  return await deleteShared(teamKey(leagueId, name));
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
    const prefix = `${TEAM_KEY_PREFIX}${leagueId}::`;
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
      html, body { background: ${C.navy900}; overscroll-behavior-y: none; }
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

function PlayerPhoto({ url, size = 44, width, height, rounded = 12, noBorder = false, focusTop = false, baseLine = false }) {
  const w = width || size, h = height || size;
  return (
    <div className="flex-shrink-0 flex items-center justify-center overflow-hidden relative"
      style={{ width: w, height: h, borderRadius: rounded, background: C.navy700, border: noBorder ? "none" : `1px solid ${C.line}` }}>
      {url
        ? <img src={url} alt="" className="w-full h-full object-cover" style={{ objectPosition: focusTop ? "center 15%" : "center" }} />
        : <ImageOff size={Math.min(w, h) * 0.4} color={C.muted} />}
      {baseLine && (
        <div className="absolute inset-x-0 bottom-0" style={{ height: 3, background: C.baby, boxShadow: `0 0 8px 1.5px ${C.baby}` }} />
      )}
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

// Fecha "de referencia" de una jornada: la más temprana entre TODOS sus
// partidos (no solo el primero del array — si a ese en concreto le faltara
// la fecha, antes se perdía la jornada entera aunque los demás sí la tuvieran).
function jornadaDate(jornada) {
  let earliest = null;
  (jornada?.partidos || []).forEach((p) => {
    const d = parseFechaDDMMYYYY(p.fecha);
    if (d && (!earliest || d < earliest)) earliest = d;
  });
  return earliest;
}

// Momento en que se considera que "arranca" una jornada, para bloquear
// alineaciones, cerrar el Triple Fantasy, etc.: las 12:00 del mediodía del
// día de su primer partido — no hace falta saber la hora exacta de cada
// partido (a veces no se sabe), basta con la fecha más temprana de todos.
// Si ningún partido tiene fecha reconocible, devuelve null.
function computeJornadaStartTime(jornada) {
  let earliestDate = null;
  (jornada?.partidos || []).forEach((p) => {
    if (!p.fecha) return;
    const d = parseFechaDDMMYYYY(p.fecha);
    if (d && (!earliestDate || d < earliestDate)) earliestDate = d;
  });
  if (!earliestDate) return null;
  return new Date(earliestDate.getFullYear(), earliestDate.getMonth(), earliestDate.getDate(), 12, 0, 0, 0);
}

// ¿Ha "empezado de verdad" una jornada? Sí en cuanto se cumpla CUALQUIERA de
// estas tres cosas: ha llegado su hora programada, o ya se ha introducido el
// marcador de algún partido suyo, o ya hay alguna estadística de jugadora
// cargada — aunque la hora "oficial" todavía no haya llegado. Se usa tanto
// para congelar alineaciones (checkLineupLock) como para cerrar la entrada al
// Triple Fantasy de esa jornada.
function hasJornadaEffectivelyStarted(jornada) {
  const start = computeJornadaStartTime(jornada);
  if (start && getEffectiveToday().getTime() >= start.getTime()) return true;
  const hasScores = (jornada.partidos || []).some((p) => p.marcadorLocal != null && p.marcadorLocal !== "" && p.marcadorVisitante != null && p.marcadorVisitante !== "");
  if (hasScores) return true;
  const hasStats = jornada.stats && Object.keys(jornada.stats).length > 0;
  return !!hasStats;
}

// Solo las jornadas que ya han empezado (su fecha es hoy o anterior). Así los
// chips J1, J2... van apareciendo solos a medida que avanza el calendario, en
// vez de mostrar de golpe toda la temporada desde el principio.
function startedJornadas(jornadas) {
  const list = jornadas || [];
  const today = getEffectiveToday();
  today.setHours(23, 59, 59, 999); // el día de la jornada cuenta como "ya empezada" desde su fecha
  const filtered = list.filter((j, i) => {
    if (i === 0) return true; // la primera jornada se ve SIEMPRE, pase lo que pase con sus fechas/datos
    const d = jornadaDate(j);
    if (d && d <= today) return true;
    // Aunque la fecha todavía no haya llegado (o no sea válida): si ya se ha
    // introducido el resultado de algún partido suyo, se considera empezada.
    const hasScores = (j.partidos || []).some((p) => p.marcadorLocal != null && p.marcadorLocal !== "" && p.marcadorVisitante != null && p.marcadorVisitante !== "");
    if (hasScores) return true;
    // Sin fecha válida y sin marcadores: si aun así hay estadísticas cargadas, se muestra igual.
    if (!d) {
      const hasStats = j.stats && Object.keys(j.stats).length > 0;
      if (hasStats) return true;
    }
    return false;
  });
  return filtered;
}

// Última fecha de una jornada: la de su partido MÁS TARDÍO (al revés que
// jornadaDate, que coge el más temprano). Sirve para saber cuándo "acaba".
function jornadaEndDate(jornada) {
  let latest = null;
  (jornada?.partidos || []).forEach((p) => {
    const d = parseFechaDDMMYYYY(p.fecha);
    if (d && (!latest || d > latest)) latest = d;
  });
  return latest;
}

// Jornada "vigente" para la portada: la última de las que ya han "empezado"
// (por fecha o porque ya se ha introducido algún resultado suyo) — PERO en
// cuanto pasa el día siguiente a su ÚLTIMO partido, se considera "acabada" y
// la portada pasa sola a la siguiente jornada de la lista, aunque esa
// siguiente todavía no tenga ni fecha ni resultados propios.
function findCurrentJornada(jornadas) {
  if (!jornadas || jornadas.length === 0) return null;
  const started = startedJornadas(jornadas);
  if (started.length === 0) return jornadas[0];
  const lastStarted = started[started.length - 1];
  const lastStartedIdx = jornadas.findIndex((j) => j.id === lastStarted.id);

  const endDate = jornadaEndDate(lastStarted);
  if (endDate && lastStartedIdx + 1 < jornadas.length) {
    const dayAfterEnd = new Date(endDate);
    dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
    dayAfterEnd.setHours(0, 0, 0, 0);
    const today = getEffectiveToday();
    today.setHours(0, 0, 0, 0);
    if (today >= dayAfterEnd) return jornadas[lastStartedIdx + 1];
  }
  return lastStarted;
}

// Estado de la cláusula de una jugadora, visible para toda la liga: en ROJO
// mientras está bloqueada (con los días que faltan, o la cuenta atrás
// HH:MM:SS cuando queda menos de un día), y en VERDE en cuanto se abre.
function ClauseBadge({ entry, size = "sm" }) {
  const [now, setNow] = useState(getEffectiveToday().getTime());
  const locked = teamService.isClauseLocked(entry);
  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(getEffectiveToday().getTime()), 1000);
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
function Onboarding({ onEnter, onGoogle }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmMsg, setConfirmMsg] = useState("");

  const submit = async () => {
    setError(""); setConfirmMsg("");
    if (!email.trim() || !password) { setError("Rellena el email y la contraseña."); return; }
    if (mode === "signup" && !name.trim()) { setError("Elige un nombre de usuaria/o."); return; }
    setBusy(true);
    const res = mode === "signup"
      ? await signUpAccount(email, password, name)
      : await signInAccount(email, password);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    if (res.needsConfirmation) {
      setConfirmMsg("Cuenta creada. Revisa tu correo y pulsa el enlace de confirmación, y después inicia sesión aquí.");
      setMode("login");
      return;
    }
    await onEnter(res.name);
  };

  const submitGoogle = async () => {
    setError(""); setGoogleBusy(true);
    const res = await onGoogle();
    if (!res.ok) { setGoogleBusy(false); setError(res.error); }
    // Si res.ok, la página redirige fuera de la app — no hace falta hacer nada más aquí.
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: C.navy900 }}>
      <GlobalStyle />
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="fl-mono text-sm tracking-[0.2em]" style={{ color: C.white }}>TEMPORADA 2026/2027</div>
          <h1 className="fl-display text-3xl uppercase mt-1" style={{ color: C.white }}>Fantasy Liga<br />Copa Aragón</h1>
        </div>
        <div className="fl-card p-5">
          <button disabled={googleBusy} onClick={submitGoogle}
            className="fl-body w-full mb-4 rounded-md py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: C.white, color: C.ink, border: "1.5px solid rgba(11,27,51,0.2)" }}>
            {googleBusy ? <Loader2 className="animate-spin" size={16} /> : (
              <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.8 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.5 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4c-7.7 0-14.4 4.4-17.7 10.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.4 26.7 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.5 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.2 5.2C40.8 36 44 30.8 44 24c0-1.3-.1-2.7-.4-3.5z" /></svg>
            )} Continuar con Google
          </button>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-px" style={{ background: "rgba(11,27,51,0.15)" }} />
            <span className="fl-mono text-[10px]" style={{ color: C.mutedInk }}>O CON EMAIL</span>
            <div className="flex-1 h-px" style={{ background: "rgba(11,27,51,0.15)" }} />
          </div>

          <div className="flex gap-1.5 mb-4">
            {[["login", "Iniciar sesión"], ["signup", "Crear cuenta"]].map(([k, l]) => (
              <button key={k} onClick={() => { setMode(k); setError(""); setConfirmMsg(""); }}
                className="fl-tap flex-1 fl-mono text-[11px] py-2 rounded-md font-semibold"
                style={{ background: mode === k ? C.baby : "transparent", color: mode === k ? C.ink : C.mutedInk, border: mode === k ? "none" : "1.5px solid rgba(11,27,51,0.2)" }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {mode === "signup" && (
            <div className="mb-3">
              <label className="fl-body text-xs font-medium block mb-1.5" style={{ color: C.ink }}>¿Cómo te llamas?</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre o apodo"
                className="fl-body w-full rounded-md px-3 py-2 text-sm outline-none" style={{ border: "1.5px solid rgba(11,27,51,0.2)", background: C.white, color: C.ink }} maxLength={24} />
              <p className="fl-body text-[10px] mt-1" style={{ color: C.mutedInk }}>Este es el nombre que verán los demás. Una vez registrado, queda protegido: nadie más podrá usarlo.</p>
            </div>
          )}

          <div className="mb-3">
            <label className="fl-body text-xs font-medium block mb-1.5" style={{ color: C.ink }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com"
              className="fl-body w-full rounded-md px-3 py-2 text-sm outline-none" style={{ border: "1.5px solid rgba(11,27,51,0.2)", background: C.white, color: C.ink }} />
          </div>
          <div className="mb-1">
            <label className="fl-body text-xs font-medium block mb-1.5" style={{ color: C.ink }}>Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
              className="fl-body w-full rounded-md px-3 py-2 text-sm outline-none" style={{ border: "1.5px solid rgba(11,27,51,0.2)", background: C.white, color: C.ink }} />
          </div>

          {mode === "login" && (
            <p className="fl-body text-[11px] mt-3" style={{ color: C.mutedInk }}>Al entrar por primera vez podrás crear tu propia liga privada para jugar con tus amigos, o unirte a la de alguien con un código de invitación.</p>
          )}
          {confirmMsg && <p className="fl-body text-xs mt-3 font-medium" style={{ color: C.positive }}>{confirmMsg}</p>}
          {error && <p className="fl-body text-xs mt-3 font-medium" style={{ color: "#C0392B" }}>{error}</p>}

          <button disabled={busy} onClick={submit}
            className="fl-body w-full mt-4 rounded-md py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: C.baby, color: C.ink }}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : <ChevronRight size={14} />} {mode === "signup" ? "Crear cuenta" : "Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Primera vez que alguien entra con Google: ya tiene sesión, pero todavía no
// ha elegido el nombre con el que juega (Google no lo pregunta).
function ChooseNameScreen({ onSubmit, onSignOut }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!name.trim()) { setError("Elige un nombre de usuaria/o."); return; }
    setError(""); setBusy(true);
    const res = await onSubmit(name);
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: C.navy900 }}>
      <GlobalStyle />
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="fl-mono text-[11px] tracking-[0.2em]" style={{ color: C.principal }}>¡YA CASI ESTÁ!</div>
          <h1 className="fl-display text-2xl uppercase mt-1" style={{ color: C.white }}>Elige tu nombre</h1>
        </div>
        <div className="fl-card p-5">
          <label className="fl-body text-xs font-medium block mb-1.5" style={{ color: C.ink }}>¿Cómo te llamas?</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre o apodo" autoFocus
            className="fl-body w-full rounded-md px-3 py-2 text-sm outline-none" style={{ border: "1.5px solid rgba(11,27,51,0.2)", background: C.white, color: C.ink }} maxLength={24} />
          <p className="fl-body text-[11px] mt-2" style={{ color: C.mutedInk }}>Este es el nombre que verán los demás en tus ligas. Una vez elegido, queda protegido: nadie más podrá usarlo.</p>
          {error && <p className="fl-body text-xs mt-3 font-medium" style={{ color: "#C0392B" }}>{error}</p>}
          <button disabled={!name.trim() || busy} onClick={submit}
            className="fl-body w-full mt-4 rounded-md py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: C.baby, color: C.ink }}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : <ChevronRight size={14} />} Continuar
          </button>
          <button onClick={onSignOut} className="fl-tap w-full text-center mt-3 fl-body text-xs" style={{ color: C.mutedInk }}>
            ¿No eres tú? Cerrar sesión
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
  const [pendingUser, setPendingUser] = useState(null); // { userId } cuando hay sesión (típicamente de Google) pero falta elegir nombre
  const [players, setPlayers] = useState([]);
  const [jornadas, setJornadas] = useState([]);
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
  const [playoffState, setPlayoffState] = useState(playoffService.emptyState());

  const [tab, setTab] = useState("inicio");
  const [saving, setSaving] = useState(false);
  const resolvingRef = useRef(false);
  // Favoritos: se guardan por persona (no compartidos), como una simple lista de ids.
  const toggleFavorito = useCallback((playerId) => {
    setFavoritos(prev => {
      const isFav = prev.includes(playerId);
      const next = isFav ? prev.filter(id => id !== playerId) : [...prev, playerId];
      writePersonal("favoritos", next);
      if (profile) { if (isFav) removeFavoriteGlobal(playerId, profile.name); else addFavoriteGlobal(playerId, profile.name); }
      return next;
    });
  }, [profile]);

  // Aplica el movimiento de valor de mercado y sube las cláusulas afectadas
  // para cualquier jornada que ya tenga estadísticas cargadas en Supabase y
  // todavía no se haya "procesado" (idempotente: cada jornada se procesa una
  // sola vez, controlado por la lista global "pricedJornadas"). Sustituye al
  // antiguo botón "Guardar jornada" del panel de administración, que ya no existe.
  // NOTA: esto YA NO toca precios (eso lo hace ahora checkDailyMarketPricing,
  // todos los días). Se queda solo con lo que sigue haciendo falta: rellenar
  // alineaciones que falten y subir cláusulas que se hayan quedado por
  // debajo del valor de mercado actual.
  const settlePlayerPricing = useCallback(async (currentPlayers) => {
    const freshJ = await readJornadas();
    const pricedIds = await readShared("pricedJornadas", []);
    const toPrice = freshJ.filter(j => j.stats && Object.keys(j.stats).length > 0 && !pricedIds.includes(j.id));
    if (toPrice.length === 0) return currentPlayers;
    const freshTGlobal = (await readAllTeamsGlobal()) || {};
    for (const jornada of toPrice) {
      const lineups = { ...(jornada.lineups || {}) };
      Object.entries(freshTGlobal).forEach(([key, t]) => { if (!lineups[key] && t.lineup) lineups[key] = t.lineup; });
      const jornadaToSave = { ...jornada, lineups };
      await writeJornada(jornadaToSave);
      const bumpWrites = [];
      Object.entries(freshTGlobal).forEach(([key, t]) => {
        const bumped = teamService.bumpClausesToMarket(t, currentPlayers);
        if (bumped !== t) { freshTGlobal[key] = bumped; bumpWrites.push(writeTeam(t.leagueId, t.name, bumped)); }
      });
      if (bumpWrites.length > 0) await Promise.all(bumpWrites);
    }
    await writeShared("pricedJornadas", [...pricedIds, ...toPrice.map(j => j.id)]);
    return currentPlayers;
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

  // Liquidación del "5 ideal": una sola vez por jornada (lista global
  // "idealFiveAwarded"), calcula las 5 jugadoras con más puntos de esa
  // jornada cuadrando alguna alineación válida, y abona 100.000 € a
  // CUALQUIER equipo de CUALQUIER liga que tenga alguna de esas 5 en su
  // plantilla (por eso usa readAllTeamsGlobal, no una liga concreta).
  const checkIdealFive = useCallback(async () => {
    try {
      const freshJ = await readJornadas();
      const freshPlayers = await readPlayers();
      const awarded = await readShared("idealFiveAwarded", []);
      for (const jornada of freshJ) {
        if (awarded.includes(jornada.id)) continue;
        if (!jornada.stats || Object.keys(jornada.stats).length < 5) continue;
        const ideal = idealFiveService.compute(jornada, freshPlayers);
        if (!ideal) continue;
        const idealSet = new Set(ideal.playerIds);
        const allTeams = (await readAllTeamsGlobal()) || {};
        const writes = [];
        Object.values(allTeams).forEach((t) => {
          const owns = teamService.squadIds(t).some((id) => idealSet.has(id));
          if (!owns) return;
          const nextT = { ...t, budgetSpent: (t.budgetSpent || 0) - IDEAL_FIVE_REWARD };
          writes.push(writeTeam(t.leagueId, t.name, nextT));
          sendPushNotification(t.leagueId, t.name, "⭐ ¡Estás en el 5 ideal!", `Una de tus jugadoras ha entrado en el 5 ideal de ${jornada.name}. Te llevas ${fmtCredits(IDEAL_FIVE_REWARD)}.`);
        });
        await Promise.all(writes);
        await writeShared("idealFiveAwarded", [...awarded, jornada.id]);
      }
    } catch {}
  }, []);

  // En cuanto empieza el primer partido de una jornada (misma hora que usa el
  // aviso de "quedan 10 minutos"), se congela la alineación de CADA equipo de
  // CADA liga tal y como estaba en ese instante exacto: titulares, banquillo,
  // capitana y entrenadora/or. Esa foto fija es la que se usará SIEMPRE para
  // los puntos de esa jornada, aunque después la persona cambie y guarde otra
  // alineación distinta (esos cambios solo afectarán a la siguiente jornada
  // sin empezar). Se hace una sola vez por jornada (lista global "lineupLocked").
  const checkLineupLock = useCallback(async () => {
    try {
      const freshJ = await readJornadas();
      let anyChanged = false;
      const nextJ = [];
      for (const jornada of freshJ) {
        if (!hasJornadaEffectivelyStarted(jornada)) { nextJ.push(jornada); continue; }
        const jornadaStart = computeJornadaStartTime(jornada);
        const allTeams = (await readAllTeamsGlobal()) || {};
        const lineups = { ...(jornada.lineups || {}) };
        let changed = false;
        Object.values(allTeams).forEach((t) => {
          const key = `${t.leagueId}::${t.name}`;
          if (lineups[key] || !t.lineup) return;
          // El equipo se creó DESPUÉS de que esta jornada ya hubiera empezado
          // (p. ej. alguien que se une a mitad de temporada): no se le mete
          // su alineación actual en una jornada en la que no participaba.
          if (t.createdAt && jornadaStart && t.createdAt > jornadaStart.getTime()) return;
          // Si está endeudada justo cuando empieza la jornada, esa jornada no puntúa.
          const debtLocked = ((t.budgetTotal || 0) - (t.budgetSpent || 0)) < 0;
          lineups[key] = debtLocked ? { ...t.lineup, debtLocked: true } : t.lineup;
          changed = true;
        });
        if (changed) {
          const res = await writeJornada({ ...jornada, lineups });
          if (res.ok) {
            anyChanged = true;
            nextJ.push({ ...jornada, lineups });
          } else {
            console.error("checkLineupLock: no se pudo guardar la jornada", jornada.id, res.error);
            nextJ.push(jornada); // no se guardó de verdad: no lo damos por bloqueado en pantalla
          }
        } else {
          nextJ.push(jornada);
        }
      }
      // Refresca el estado local si se ha bloqueado algo nuevo, para que las
      // pantallas ya abiertas (Equipo/Puntos, Ranking...) lo vean sin esperar
      // a una recarga completa de la app.
      if (anyChanged) setJornadas(nextJ);
    } catch {}
  }, []);

  // MODO PRUEBAS: versión de diagnóstico del bloqueo de alineación, que
  // cuenta paso a paso qué ha pasado (en vez de tragarse los errores en
  // silencio como la versión normal de arriba), para poder ver en pantalla
  // exactamente dónde se para el proceso.
  const debugLineupLock = useCallback(async (jornadaId) => {
    const steps = [];
    try {
      const freshJ = await readJornadas();
      steps.push(`Jornadas leídas: ${freshJ.length}`);
      const jornada = freshJ.find((j) => j.id === jornadaId) || freshJ[0];
      if (!jornada) { steps.push("❌ No hay ninguna jornada con ese id."); return steps; }
      steps.push(`Jornada: ${jornada.id} — "${jornada.name}"`);
      steps.push(`Partidos con marcador: ${(jornada.partidos || []).filter(p => p.marcadorLocal !== "" && p.marcadorLocal != null).length} de ${(jornada.partidos || []).length}`);

      const started = hasJornadaEffectivelyStarted(jornada);
      steps.push(`¿Se considera empezada? ${started ? "SÍ" : "NO"}`);
      if (!started) { steps.push("⛔ Se para aquí: la jornada no cuenta como empezada todavía."); return steps; }

      let allTeams;
      try {
        allTeams = await readAllTeamsGlobal();
      } catch (e) {
        steps.push(`❌ ERROR leyendo los equipos: ${e?.message || e}`);
        return steps;
      }
      if (!allTeams) { steps.push("❌ readAllTeamsGlobal() devolvió null (fallo de lectura)."); return steps; }
      const teamKeys = Object.keys(allTeams);
      steps.push(`Equipos encontrados en total: ${teamKeys.length}`);
      if (teamKeys.length === 0) { steps.push("⛔ Se para aquí: no se ha encontrado ningún equipo."); return steps; }
      teamKeys.forEach((k) => {
        const t = allTeams[k];
        steps.push(`  · "${k}" → titulares guardados: ${t.lineup?.starters?.length || 0}`);
      });

      const jornadaStart = computeJornadaStartTime(jornada);
      const lineups = { ...(jornada.lineups || {}) };
      let changed = false;
      Object.values(allTeams).forEach((t) => {
        const key = `${t.leagueId}::${t.name}`;
        if (lineups[key] || !t.lineup) return;
        if (t.createdAt && jornadaStart && t.createdAt > jornadaStart.getTime()) {
          steps.push(`  · "${key}" se creó DESPUÉS de que empezara esta jornada: se omite (no participaba).`);
          return;
        }
        const debtLocked = ((t.budgetTotal || 0) - (t.budgetSpent || 0)) < 0;
        lineups[key] = debtLocked ? { ...t.lineup, debtLocked: true } : t.lineup;
        changed = true;
      });
      steps.push(`¿Hay algo nuevo que guardar? ${changed ? "SÍ" : "NO (ya estaba todo guardado)"}`);
      if (changed) {
        const res = await writeJornada({ ...jornada, lineups });
        steps.push(res.ok ? "✅ writeJornada() dice que ha ido bien." : `❌ writeJornada() ha fallado: ${res.error}`);
        // No nos fiamos solo del mensaje: releemos de verdad desde Supabase para confirmarlo.
        const reread = await readJornadas();
        const rereadJornada = reread.find((j) => j.id === jornadaId);
        const reallyThere = rereadJornada?.lineups && Object.keys(rereadJornada.lineups).length > 0;
        steps.push(reallyThere
          ? `✅ CONFIRMADO: al releer de Supabase, sí está guardado (${Object.keys(rereadJornada.lineups).length} equipo(s)).`
          : "❌ CONFIRMADO: al releer de Supabase, sigue sin estar guardado de verdad.");
        if (res.ok && reallyThere) {
          setJornadas((prev) => mergeJornadasPreservingLineups(reread, prev)); // refresca el estado en memoria para que Equipo/Puntos vea ya el bloqueo guardado
          steps.push("🔄 Estado local (jornadas) refrescado.");
        }
      }
      steps.push("Terminado.");
      return steps;
    } catch (e) {
      steps.push(`❌ ERROR GENERAL: ${e?.message || e}`);
      return steps;
    }
  }, []);

  // Cada vez que entras en Equipo o Inicio (donde se ve la Jornada/Puntos),
  // se comprueba al momento si hay que congelar alguna alineación — no se
  // depende solo del intervalo de 60s, que puede no llegar a dispararse si
  // la app no ha estado abierta el rato justo.
  useEffect(() => {
    if (tab === "equipo" || tab === "inicio") checkLineupLock();
  }, [tab, checkLineupLock]);

  // Motor de precios diario (ver conversación de diseño): se dispara una vez
  // por día natural (controlado por la marca global "marketPricingLastRun"),
  // recalcula TODAS las jugadoras (nunca entrenadoras/es) con el sistema
  // completo de empujes grandes + reparto semanal + empujes pequeños +
  // freno para las caras, y además reparte, una sola vez por jornada
  // completa, el bono de "MVP de toda la jornada".
  const checkDailyMarketPricing = useCallback(async () => {
    try {
      const realTodayStr = toDateStr(new Date());
      let simDate = await readShared("marketSimDate", null);
      // Si la fecha simulada ya quedó atrás (la real la ha alcanzado o pasado), se
      // desactiva sola el modo pruebas, para no quedarse encallado en el pasado.
      if (simDate && simDate <= realTodayStr) { simDate = null; await deleteShared("marketSimDate"); setSimulatedToday(null); }
      const todayStr = simDate || realTodayStr;
      const lastRun = await readShared("marketPricingLastRun", "");
      if (lastRun === todayStr) return;

      const freshPlayers = await readPlayers();
      const freshJornadas = await readJornadas();
      const allTeams = (await readAllTeamsGlobal()) || {};
      const totalTeams = Math.max(Object.keys(allTeams).length, 1);
      const { standings } = marketPricingService.computeStandings(freshJornadas);
      const bidsMap = await readAllBidsGlobal();
      const favoritesMap = await readFavoritesGlobalCounts();
      const ctx = { todayStr, jornadas: freshJornadas, players: freshPlayers, standings, totalTeams, bidsMap, favoritesMap };

      const updates = [];
      freshPlayers.forEach((p) => {
        const upd = marketPricingService.computeDailyUpdate(p, ctx);
        if (upd) updates.push({ id: p.id, ...upd });
      });

      // Bono de MVP de la jornada entera (se suma al mismo movimiento del día si ya tenía uno).
      const mvpApplied = await readShared("jornadaMvpPriced", []);
      const mvpAppliedNext = [...mvpApplied];
      for (const jornada of freshJornadas) {
        if (mvpApplied.includes(jornada.id)) continue;
        if (!tripleFantasyService.isJornadaReady(jornada)) continue;
        const mvpId = tripleFantasyService.computeActualMvp(jornada, freshPlayers, freshJornadas);
        if (mvpId) {
          // Deja constancia de quién fue, directamente en la columna de la
          // jornada (antes se calculaba solo "al vuelo" y no quedaba guardado en ningún sitio visible).
          await supabase.from("jornadas").update({ mvp_player_id: mvpId }).eq("id", jornada.id);
          const basePlayer = freshPlayers.find((p) => p.id === mvpId);
          if (basePlayer && basePlayer.position !== "DT") {
            const existing = updates.find((u) => u.id === mvpId);
            const currentPrice = existing ? existing.basePrice : basePlayer.basePrice;
            const bump = currentPrice * 0.007 * marketBrakeFactor(currentPrice);
            const newPrice = currentPrice + bump;
            if (existing) {
              existing.basePrice = newPrice;
              const hist = existing.priceHistory.slice();
              hist[hist.length - 1] = { ...hist[hist.length - 1], value: newPrice };
              existing.priceHistory = hist;
            } else {
              updates.push({
                id: mvpId, basePrice: newPrice, prevBasePrice: basePlayer.basePrice,
                priceHistory: [...(basePlayer.priceHistory || []), { date: todayStr, value: newPrice }].slice(-60),
                marketCycle: basePlayer.marketCycle || {},
              });
            }
          }
        }
        mvpAppliedNext.push(jornada.id);
      }
      if (mvpAppliedNext.length !== mvpApplied.length) await writeShared("jornadaMvpPriced", mvpAppliedNext);

      if (updates.length > 0) {
        await Promise.all(updates.map((u) => supabase.from("players").update({
          base_price: u.basePrice, prev_base_price: u.prevBasePrice, price_history: u.priceHistory, market_cycle: u.marketCycle,
        }).eq("id", u.id)));
        const mergePlayer = (p, u) => !u ? p : {
          ...p,
          basePrice: u.basePrice !== undefined ? u.basePrice : p.basePrice,
          prevBasePrice: u.prevBasePrice !== undefined ? u.prevBasePrice : p.prevBasePrice,
          priceHistory: u.priceHistory !== undefined ? u.priceHistory : p.priceHistory,
          marketCycle: u.marketCycle,
        };
        const finalPlayers = freshPlayers.map((p) => mergePlayer(p, updates.find((x) => x.id === p.id)));
        setPlayers((prev) => prev.map((p) => mergePlayer(p, updates.find((x) => x.id === p.id))));
        // La cláusula nunca puede quedar por debajo del valor de mercado actual:
        // se sube sola en TODOS los equipos de TODAS las ligas que la tengan.
        const bumpWrites = [];
        Object.values(allTeams).forEach((t) => {
          const bumped = teamService.bumpClausesToMarket(t, finalPlayers);
          if (bumped !== t) bumpWrites.push(writeTeam(t.leagueId, t.name, bumped));
        });
        if (bumpWrites.length > 0) await Promise.all(bumpWrites);
      }
      await writeShared("marketPricingLastRun", todayStr);
    } catch {}
  }, []);

  // Venta inmediata a la liga: se cobra el 50% del valor de mercado actual, al instante.
  // Añade una entrada al feed de "Actividad" de la liga (ventas a la liga,
  // premios del Triple Fantasy...). Los fichajes del mercado ya se registran
  // aparte, dentro de syncMarket.
  const logActivity = useCallback(async (entry) => {
    const freshActivity = await readShared(leagueKey(activeLeagueId, "activity"), activity);
    const nextActivity = [{ id: uid("act"), ts: Date.now(), ...entry }, ...freshActivity].slice(0, 60);
    await writeShared(leagueKey(activeLeagueId, "activity"), nextActivity);
    setActivity(nextActivity);
  }, [activeLeagueId, activity]);

  // Automatización de playoffs: detecta el arranque, reparte cada día en
  // cuartos/semis, resuelve la final de una tacada en cuanto ambos
  // finalistas hayan enviado su lista, y avanza de ronda sola en cuanto hay
  // resultado real de los partidos de esa ronda.
  const checkPlayoffProgress = useCallback(async () => {
    if (!activeLeagueId) return;
    try {
      const [freshJornadas, freshPlayers, teamsMap] = await Promise.all([readJornadas(), readPlayers(), readAllTeams(activeLeagueId)]);
      let state = await readShared(leagueKey(activeLeagueId, "playoffState"), playoffService.emptyState());
      const todayStr = toDateStr(getEffectiveToday());
      let changed = false;

      // 1) Arranque: en cuanto la LIGA REGULAR haya acabado de verdad (todos
      // los partidos de su última jornada con marcador puesto) se abre el
      // draft — no hace falta esperar a la fecha del primer partido de
      // playoffs, así quedan esos días de margen para hacer el draft antes.
      if (state.phase === "none") {
        const cuartosIda = playoffService.findRoundJornadas(freshJornadas, "CUARTOS_IDA")[0];
        if (cuartosIda && playoffService.regularSeasonFinished(freshJornadas)) {
          const regularStandings = rankingService.computeStandings(teamsMap || {}, freshPlayers, playoffService.regularJornadas(freshJornadas), activeLeagueId);
          const qualifiers = regularStandings.slice(0, 8).map((r) => r.name);
          if (qualifiers.length > 0) {
            state = { ...playoffService.emptyState(), phase: "cuartos_draft", round: "CUARTOS", qualifiers, draftDay: 0 };
            changed = true;
            await logActivity({ type: "playoff_start", qualifiers });
          }
        }
      }

      // 1.5) Bloqueo de alineación: en cuanto una jornada de playoffs "empieza"
      // (mismo criterio que en liga regular), se congela la alineación EN VIVO
      // de ese momento para cada clasificada/o, tal como haya jugado esa
      // jornada concreta (ida y vuelta de cuartos se bloquean por separado).
      if (state.phase !== "none" && state.phase !== "finished") {
        (["CUARTOS_IDA", "CUARTOS_VUELTA", "SEMIS", "FINAL"]).forEach((tag) => {
          const j = playoffService.findRoundJornadas(freshJornadas, tag)[0];
          if (!j || !hasJornadaEffectivelyStarted(j)) return;
          const round = tag.startsWith("CUARTOS") ? "CUARTOS" : tag;
          const already = state.lockedLineups[tag] || {};
          const liveLineups = state.lineups[round] || {};
          let lockChanged = false;
          const nextLocked = { ...already };
          (state.qualifiers || []).forEach((u) => {
            if (nextLocked[u]) return; // ya congelada esta jornada para esta persona
            const live = liveLineups[u];
            if (live) { nextLocked[u] = live; lockChanged = true; }
          });
          if (lockChanged) {
            state = { ...state, lockedLineups: { ...state.lockedLineups, [tag]: nextLocked } };
            changed = true;
          }
        });
      }

      // 2) Reparto diario en cuartos/semis (una vez por día natural).
      if ((state.phase === "cuartos_draft" || state.phase === "semis_draft") && state.lastAllocationDate !== todayStr) {
        const round = state.round;
        const lists = (state.lists && state.lists[round]) || {};
        const squadsSoFar = (state.squads && state.squads[round]) || {};
        const alreadyDrafted = Object.values(squadsSoFar).flat();
        const pool = playoffService.availablePool(freshJornadas, freshPlayers, round, alreadyDrafted);
        const targetSize = PLAYOFF_SQUAD_SIZE[round];
        const picks = playoffService.runDailyAllocation({ order: state.qualifiers, lists, squadsSoFar, availableIds: pool.map((p) => p.id), targetSize });
        const nextSquads = { ...squadsSoFar };
        const nextLog = [...state.log];
        picks.forEach(({ userName, playerId }) => {
          nextSquads[userName] = [...(nextSquads[userName] || []), playerId];
          nextLog.push({ round, day: state.draftDay, userName, playerId, ts: Date.now() });
        });
        state = { ...state, squads: { ...state.squads, [round]: nextSquads }, log: nextLog, draftDay: state.draftDay + 1, lastAllocationDate: todayStr };
        changed = true;
      }

      // 3) Fin de ronda: con resultado real ya cargado, se calcula quién pasa.
      if (state.phase === "cuartos_draft" && playoffService.roundHasResults(freshJornadas, "CUARTOS")) {
        const pointsByUser = {};
        state.qualifiers.forEach((u) => {
          const liveLineup = (state.lineups.CUARTOS || {})[u] || null;
          pointsByUser[u] = playoffService.computeRoundPoints(freshJornadas, "CUARTOS", state.lockedLineups, u, freshPlayers, liveLineup);
        });
        const advancing = playoffService.cutTop(state.qualifiers, pointsByUser, Math.min(4, state.qualifiers.length));
        state = { ...state, phase: "semis_draft", round: "SEMIS", qualifiers: advancing, draftDay: 0, lastAllocationDate: null, pointsByRound: { ...state.pointsByRound, CUARTOS: pointsByUser } };
        changed = true;
        await logActivity({ type: "playoff_advance", round: "CUARTOS", advancing });
      } else if (state.phase === "semis_draft" && playoffService.roundHasResults(freshJornadas, "SEMIS")) {
        const pointsByUser = {};
        state.qualifiers.forEach((u) => {
          const liveLineup = (state.lineups.SEMIS || {})[u] || null;
          pointsByUser[u] = playoffService.computeRoundPoints(freshJornadas, "SEMIS", state.lockedLineups, u, freshPlayers, liveLineup);
        });
        const advancing = playoffService.cutTop(state.qualifiers, pointsByUser, Math.min(2, state.qualifiers.length));
        state = { ...state, phase: "final_draft", round: "FINAL", qualifiers: advancing, draftDay: 0, lastAllocationDate: null, pointsByRound: { ...state.pointsByRound, SEMIS: pointsByUser } };
        changed = true;
        await logActivity({ type: "playoff_advance", round: "SEMIS", advancing });
      } else if (state.phase === "final_draft") {
        // La final se reparte de una sola vez, en cuanto los finalistas hayan enviado su lista de 20.
        const lists = state.lists.FINAL || {};
        const bothSubmitted = state.qualifiers.length > 0 && state.qualifiers.every((u) => (lists[u] || []).length > 0);
        const alreadyDone = Object.keys(state.squads.FINAL || {}).length > 0;
        if (bothSubmitted && !alreadyDone) {
          const pool = playoffService.availablePool(freshJornadas, freshPlayers, "FINAL", []);
          const picks = playoffService.runFinalAllocation({ order: state.qualifiers, lists, availableIds: pool.map((p) => p.id), targetSize: PLAYOFF_SQUAD_SIZE.FINAL });
          const nextSquads = {};
          const nextLog = [...state.log];
          picks.forEach(({ userName, playerId }) => {
            nextSquads[userName] = [...(nextSquads[userName] || []), playerId];
            nextLog.push({ round: "FINAL", day: 0, userName, playerId, ts: Date.now() });
          });
          state = { ...state, squads: { ...state.squads, FINAL: nextSquads }, log: nextLog };
          changed = true;
        }
        if (playoffService.roundHasResults(freshJornadas, "FINAL")) {
          const pointsByUser = {};
          state.qualifiers.forEach((u) => {
            const liveLineup = (state.lineups.FINAL || {})[u] || null;
            pointsByUser[u] = playoffService.computeRoundPoints(freshJornadas, "FINAL", state.lockedLineups, u, freshPlayers, liveLineup);
          });
          const champion = playoffService.cutTop(state.qualifiers, pointsByUser, 1)[0] || null;
          state = { ...state, phase: "finished", champion, pointsByRound: { ...state.pointsByRound, FINAL: pointsByUser } };
          changed = true;
          if (champion) await logActivity({ type: "playoff_champion", champion });
        }
      }

      if (changed) {
        await writeShared(leagueKey(activeLeagueId, "playoffState"), state);
        setPlayoffState(state);
      } else {
        setPlayoffState(state);
      }
    } catch {}
  }, [activeLeagueId, logActivity]);

  // Guarda la lista de preferencias del draft de una ronda — una vez
  // guardada, queda bloqueada para siempre (no se puede reenviar/editar).
  const submitDraftList = useCallback(async (round, orderedPlayerIds) => {
    if (!activeLeagueId || !profile) return { ok: false, error: "Sin sesión." };
    const state = await readShared(leagueKey(activeLeagueId, "playoffState"), playoffService.emptyState());
    if (!state.qualifiers.includes(profile.name)) return { ok: false, error: "No estás clasificada/o para esta ronda." };
    const already = (state.lists[round] || {})[profile.name];
    if (already) return { ok: false, error: "Ya has enviado tu lista para esta ronda; no se puede cambiar." };
    const nextLists = { ...state.lists, [round]: { ...(state.lists[round] || {}), [profile.name]: orderedPlayerIds } };
    const nextState = { ...state, lists: nextLists };
    await writeShared(leagueKey(activeLeagueId, "playoffState"), nextState);
    setPlayoffState(nextState);
    return { ok: true };
  }, [activeLeagueId, profile]);

  // Guarda la alineación de PLAYOFFS de una ronda (independiente de la de temporada).
  const savePlayoffLineup = useCallback(async (round, lineup) => {
    if (!activeLeagueId || !profile) return { ok: false, error: "Sin sesión." };
    const state = await readShared(leagueKey(activeLeagueId, "playoffState"), playoffService.emptyState());
    const nextLineups = { ...state.lineups, [round]: { ...(state.lineups[round] || {}), [profile.name]: lineup } };
    const nextState = { ...state, lineups: nextLineups };
    await writeShared(leagueKey(activeLeagueId, "playoffState"), nextState);
    setPlayoffState(nextState);
    return { ok: true };
  }, [activeLeagueId, profile]);

  useEffect(() => {
    if (profile === undefined) return;
    checkJornadaStartWarning();
    checkIdealFive();
    checkLineupLock();
    checkDailyMarketPricing();
    checkPlayoffProgress();
    const t = setInterval(() => { checkJornadaStartWarning(); checkIdealFive(); checkLineupLock(); checkDailyMarketPricing(); checkPlayoffProgress(); }, 60000);
    return () => clearInterval(t);
  }, [profile, checkJornadaStartWarning, checkIdealFive, checkLineupLock, checkDailyMarketPricing, checkPlayoffProgress]);

  // Carga inicial GLOBAL: jugadoras, jornadas, config del mercado y escudos son
  // compartidos por TODAS las ligas, así que se cargan una sola vez, independientemente
  // de qué liga se elija después. La identidad ya no se lee de localStorage sin más:
  // se comprueba la sesión real de Supabase Auth (si hay una guardada y sigue
  // siendo válida, entra directa; si no, se muestra el login).
  useEffect(() => {
    (async () => {
      const sess = await getSessionProfile();
      const fav = await readPersonal("favoritos", []);
      const [pl, jo, crests, simDate] = await Promise.all([
        readPlayers(), readJornadas(), readTeamCrests(), readShared("marketSimDate", null),
      ]);
      setPlayers(pl); setJornadas(jo);
      setTeamCrests(crests || {});
      setFavoritos(fav || []);
      setSimulatedToday(simDate);
      if (sess.hasSession && sess.name) {
        const prof = { name: sess.name };
        await writePersonal("profile", prof);
        setProfile(prof);
      } else if (sess.hasSession && !sess.name) {
        // Sesión válida (típicamente recién llegada de Google) pero sin nombre todavía.
        setPendingUser({ userId: sess.userId });
        setProfile(null);
      } else {
        setProfile(null);
      }
      const priced = await settlePlayerPricing(pl);
      if (priced !== pl) setPlayers(priced);
    })();
  }, []);

  // En cuanto hay una cuenta activa, cargamos "Mis ligas" DE VERDAD: las
  // ligas donde esa cuenta tiene un equipo creado en el servidor (no las que
  // recordara este navegador, que podían ser las de otra persona en el mismo
  // dispositivo). Y recuperamos cuál era la última liga activa.
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const ids = await readMyLeagueIdsFromAccount(profile.name);
      const leagues = await readLeaguesByIds(ids);
      setMyLeagues(leagues);
      const savedActive = await readPersonal("activeLeagueId", null);
      setActiveLeagueId(savedActive && leagues.some(l => l.id === savedActive) ? savedActive : null);
    })();
  }, [profile]);

  // Se asegura de que la persona tiene un equipo creado dentro de esa liga
  // (reparto inicial de 8 jugadoras al azar, sin tocar el presupuesto de
  // mercado, con un quinteto "2-2-1" ya alineado). Idempotente: si ya existe, no hace nada.
  // Igual que logActivity, pero recibiendo la liga explícita — hace falta para
  // sitios como "unirse a una liga" o "expulsar", que pueden pasar sin que
  // esa liga sea la "activa" en ese momento (p. ej. desde Mis Ligas).
  const logActivityFor = useCallback(async (leagueId, entry) => {
    const freshActivity = await readShared(leagueKey(leagueId, "activity"), []);
    const nextActivity = [{ id: uid("act"), ts: Date.now(), ...entry }, ...freshActivity].slice(0, 60);
    await writeShared(leagueKey(leagueId, "activity"), nextActivity);
    if (leagueId === activeLeagueId) setActivity(nextActivity);
  }, [activeLeagueId]);

  const ensureTeamInLeague = useCallback(async (leagueId, name) => {
    const existing = await readTeam(leagueId, name);
    if (existing) return existing;
    const kicked = await readShared(leagueKey(leagueId, "kicked"), []);
    if (kicked.includes(name)) return null; // expulsada de esta liga: no se le vuelve a crear equipo
    const freshPlayers = await readPlayers();
    const fresh = (await readAllTeams(leagueId)) || {};
    const ownedIds = new Set();
    Object.values(fresh).forEach(t => teamService.squadIds(t).forEach(id => ownedIds.add(id)));
    const freeJugadoras = freshPlayers.filter(p => p.position !== "DT" && !ownedIds.has(p.id));
    const draft = teamService.autoDraftSquad(freeJugadoras, INITIAL_SQUAD_VALUE_RANGE, INITIAL_SQUAD_COUNT);
    let team = teamService.addInitialSquad(teamService.emptyTeam(), draft);
    team = { ...team, createdAt: getEffectiveToday().getTime() };
    // Alinea automáticamente un quinteto "2-2-1" con las jugadoras que el reparto garantiza por posición.
    const byPos = { BASE: [], ALERO: [], PIVOT: [] };
    draft.forEach(d => { if (byPos[d.position]) byPos[d.position].push(d.id); });
    const starters = [...byPos.BASE.slice(0, 2), ...byPos.ALERO.slice(0, 2), ...byPos.PIVOT.slice(0, 1)];
    if (starters.length === 5) team = { ...team, lineup: { ...team.lineup, formation: "2-2-1", starters } };
    await writeTeam(leagueId, name, team);
    await logActivityFor(leagueId, { type: "union", userId: name });
    return team;
  }, [logActivityFor]);

  const selectLeague = useCallback(async (leagueId) => {
    if (profile) {
      const team = await ensureTeamInLeague(leagueId, profile.name);
      if (!team) {
        // Expulsada de esta liga: la quitamos también de "Mis ligas" en este dispositivo.
        await removeMyLeagueId(leagueId);
        setMyLeagues(prev => prev.filter(l => l.id !== leagueId));
        return { ok: false, error: "Has sido expulsada/o de esta liga." };
      }
    }
    await writePersonal("activeLeagueId", leagueId);
    setActiveLeagueId(leagueId);
    setTab("inicio");
    return { ok: true };
  }, [profile, ensureTeamInLeague]);

  // Expulsa a alguien de la liga: borra su equipo y lo añade a la lista de
  // vetados para que no se le vuelva a crear uno si intenta volver a entrar.
  const kickMember = useCallback(async (leagueId, userName) => {
    await deleteTeamRow(leagueId, userName);
    const kicked = await readShared(leagueKey(leagueId, "kicked"), []);
    if (!kicked.includes(userName)) await writeShared(leagueKey(leagueId, "kicked"), [...kicked, userName]);
    await logActivityFor(leagueId, { type: "expulsion", userId: userName });
    return { ok: true };
  }, [logActivityFor]);

  // Borra la liga entera: todos los equipos de esa liga y la propia liga.
  // Solo debe poder llamarlo quien la creó (se comprueba en la UI).
  const deleteLeague = useCallback(async (leagueId) => {
    const teams = (await readAllTeams(leagueId)) || {};
    await Promise.all(Object.keys(teams).map((name) => deleteTeamRow(leagueId, name)));
    await deleteLeagueRow(leagueId);
    await removeMyLeagueId(leagueId);
    setMyLeagues((prev) => prev.filter((l) => l.id !== leagueId));
    if (activeLeagueId === leagueId) {
      await writePersonal("activeLeagueId", null);
      setActiveLeagueId(null);
    }
    return { ok: true };
  }, [activeLeagueId]);

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

  const handleGoogleLogin = useCallback(async () => {
    return await signInWithGoogle(); // si va bien, la página redirige fuera; el resto se resuelve solo al volver.
  }, []);

  const completeGoogleName = useCallback(async (name) => {
    const res = await chooseNameForSession(pendingUser.userId, name);
    if (!res.ok) return res;
    setPendingUser(null);
    await completeOnboarding(res.name);
    return { ok: true };
  }, [pendingUser, completeOnboarding]);

  const signOut = useCallback(async () => {
    await signOutAccount();
    await writePersonal("profile", null);
    setProfile(null);
    setPendingUser(null);
    setActiveLeagueId(null);
    setMyLeagues([]);
  }, []);

  // Sincroniza el mercado DE LA LIGA ACTIVA: resuelve la ventana cerrada y genera la
  // siguiente. Cada liga tiene su propio mercado, con jugadoras elegidas al azar de forma
  // independiente (mismo precio de salida y mismo histórico de valor, que son globales).
  // Nota: esta comprobación corre en el cliente a intervalos como sustituto temporal
  // de un job programado en servidor; la resolución de la subasta y el descuento del
  // presupuesto deben ejecutarse como operación atómica en backend cuando haya BD real.
  const syncMarket = useCallback(async (leagueId, resetHour) => {
    if (!leagueId || resolvingRef.current) return;
    resolvingRef.current = true;
    try {
      const [freshPlayers, freshTeamsOrNull, freshMarket, freshBids, freshHistory, freshActivity, freshOffers, freshTriple, freshJornadas] = await Promise.all([
        readPlayers(), readAllTeams(leagueId),
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
      const window_ = marketService.computeWindow(resetHour, now);

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
            const winnerTeam = teamsNext[r.winnerUserId];
            if (winnerTeam && ((winnerTeam.budgetTotal || 0) - (winnerTeam.budgetSpent || 0)) < 0) {
              sendPushNotification(leagueId, r.winnerUserId, "⚠️ Te has quedado en negativo", "Ese fichaje te ha dejado con el presupuesto en negativo. Recuerda que si sigues endeudada/o cuando empiece la jornada, no puntuarás.");
            }
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
          // Registra en Actividad a quien haya ganado premio (0 € no se registra).
          const wonEntries = Object.entries(teamCredits).filter(([, amount]) => amount > 0);
          if (wonEntries.length > 0) {
            const tripleActivity = wonEntries.map(([userName, amount]) => ({ id: uid("act"), ts: Date.now(), type: "triple", userId: userName, amount }));
            activityNext = [...tripleActivity, ...activityNext].slice(0, 60);
            await writeShared(leagueKey(leagueId, "activity"), activityNext);
          }
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
      setMarket(marketNext); setOffers(freshOffers); setTripleEntries(tripleNext);
      // No pisar a lo bruto: si otro proceso (checkLineupLock, debugLineupLock)
      // bloqueó una alineación mientras esta lectura estaba en marcha, hay que
      // conservarla en vez de sobrescribirla con la foto (más antigua) que
      // traía esta llamada.
      setJornadas((prev) => mergeJornadasPreservingLineups(freshJornadas, prev));
    } finally {
      resolvingRef.current = false;
    }
  }, []);

  // Hora fija diaria del mercado de esta liga: la hora a la que se creó (p. ej.
  // si la liga se creó a las 19:34, el mercado se resuelve y se regenera cada
  // día a esa misma hora). Cada liga tiene la suya propia.
  const marketResetHour = activeLeague?.created_at
    ? new Date(activeLeague.created_at).toTimeString().slice(0, 5)
    : "08:00";

  // MODO PRUEBAS: avanza un día "de mentira" para el motor de precios, sin
  // esperar a la medianoche real, y de paso fuerza a que el mercado de la
  // liga actual se resuelva ya (como si hubiera pasado tiempo de verdad):
  // se entregan las jugadoras a quien más pujó, se abre mercado nuevo, y se
  // regeneran las ofertas de la liga por las que estén puestas en venta.
  // Ojo: como el precio de las jugadoras es global (lo comparten todas las
  // ligas), esto mueve precios de verdad, visibles para cualquier liga.
  const advanceSimDay = useCallback(async () => {
    // Guarda una foto de los precios ANTES del primer avance, para que "Reiniciar prueba" pueda volver aquí.
    const baseline = await readShared("testBaselinePrices", null);
    if (!baseline) {
      const currentPlayers = await readPlayers();
      const snapshot = {};
      currentPlayers.forEach((p) => { snapshot[p.id] = p.basePrice; });
      await writeShared("testBaselinePrices", snapshot);
    }

    const current = await readShared("marketSimDate", null);
    const realToday = new Date();
    realToday.setHours(0, 0, 0, 0);
    const base = current ? new Date(current + "T00:00:00") : realToday;
    if (base < realToday) base.setTime(realToday.getTime()); // por si la simulada se quedó atrás
    base.setDate(base.getDate() + 1);
    const nextDateStr = toDateStr(base);
    await writeShared("marketSimDate", nextDateStr);
    setSimulatedToday(nextDateStr); // pone en hora el "reloj" que usa el resto de la app (qué jornada toca, si ya empezó...)
    await writeShared("marketPricingLastRun", ""); // para que se ejecute ya mismo, sin esperar
    await checkLineupLock(); // congela ya mismo las alineaciones de cualquier jornada que acabe de "empezar", sin esperar al intervalo de 60s
    await checkDailyMarketPricing();

    // Fuerza el cierre del mercado actual de esta liga, si lo hay y sigue sin resolver.
    if (activeLeagueId) {
      const freshMarket = await readShared(leagueKey(activeLeagueId, "currentMarket"), null);
      if (freshMarket && !freshMarket.resolved && Date.now() < freshMarket.closesAt) {
        await writeShared(leagueKey(activeLeagueId, "currentMarket"), { ...freshMarket, closesAt: Date.now() - 1000 });
      }
      await syncMarket(activeLeagueId, marketResetHour);
    }

    const [freshPlayers, freshJornadas] = await Promise.all([readPlayers(), readJornadas()]);
    setPlayers(freshPlayers);
    setJornadas((prev) => mergeJornadasPreservingLineups(freshJornadas, prev));
    return nextDateStr;
  }, [checkDailyMarketPricing, checkLineupLock, activeLeagueId, marketResetHour, syncMarket]);

  const exitSimMode = useCallback(async () => {
    await deleteShared("marketSimDate");
    setSimulatedToday(null); // vuelve a la fecha real para todo el sistema de fechas
    return { ok: true };
  }, []);

  // Reinicia toda la prueba: vuelve los precios a como estaban antes del
  // primer "Avanzar día" de esta ronda, borra estadísticas y resultados de
  // partidos, y limpia todas las marcas de "ya procesado" para que el
  // motor entero arranque de cero. Para poder probar muchas veces seguidas.
  const resetTestMode = useCallback(async () => {
    const baseline = await readShared("testBaselinePrices", null);
    if (baseline) {
      const currentPlayers = await readPlayers();
      await Promise.all(currentPlayers.map((p) => {
        if (!(p.id in baseline)) return null;
        return supabase.from("players").update({ base_price: baseline[p.id], prev_base_price: baseline[p.id], price_history: [], market_cycle: {} }).eq("id", p.id);
      }));
    }
    await supabase.from("jornada_stats").delete().neq("player_id", "__none__");
    await supabase.from("partidos").update({
      marcador_local: null, marcador_visitante: null,
      marcador_local_p1: null, marcador_local_p2: null, marcador_local_p3: null, marcador_local_p4: null,
      marcador_visitante_p1: null, marcador_visitante_p2: null, marcador_visitante_p3: null, marcador_visitante_p4: null,
    }).neq("id", "__none__");
    // Borra también las alineaciones ya "congeladas" de rondas de prueba anteriores —
    // si no, se quedan pegadas para siempre y nunca se vuelven a capturar bien.
    await supabase.from("jornadas").update({ lineups: {} }).neq("id", "__none__");
    await Promise.all([
      deleteShared("marketSimDate"), deleteShared("marketPricingLastRun"), deleteShared("idealFiveAwarded"),
      deleteShared("jornadaMvpPriced"), deleteShared("lineupLocked"), deleteShared("testBaselinePrices"),
    ]);
    setSimulatedToday(null);
    const [freshPlayers, freshJornadas] = await Promise.all([readPlayers(), readJornadas()]);
    setPlayers(freshPlayers);
    setJornadas(freshJornadas);
    return { ok: true };
  }, []);

  useEffect(() => {
    if (!activeLeagueId) return;
    setMarket(null); // evita mostrar por un instante el mercado de la liga anterior
    syncMarket(activeLeagueId, marketResetHour);
    const t = setInterval(() => syncMarket(activeLeagueId, marketResetHour), 15000);
    return () => clearInterval(t);
  }, [activeLeagueId, marketResetHour, syncMarket]);

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

  const withdrawBid = useCallback(async (asset) => {
    const freshMarket = await readShared(leagueKey(activeLeagueId, "currentMarket"), market);
    const freshBids = await readShared(leagueKey(activeLeagueId, "bids"), bids);
    const open = freshMarket && Date.now() >= freshMarket.opensAt && Date.now() < freshMarket.closesAt;
    if (!open) return { ok: false, error: "El mercado está cerrado ahora mismo." };
    const nextBids = auctionService.withdrawBid(freshBids, { marketId: freshMarket.id, assetId: asset.id, userId: profile.name });
    await writeShared(leagueKey(activeLeagueId, "bids"), nextBids);
    setBids(nextBids);
    return { ok: true };
  }, [market, bids, profile, activeLeagueId]);

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
    if (((nextBuyer.budgetTotal || 0) - (nextBuyer.budgetSpent || 0)) < 0) {
      sendPushNotification(activeLeagueId, profile.name, "⚠️ Te has quedado en negativo", "Ese fichaje te ha dejado con el presupuesto en negativo. Recuerda que si sigues endeudada/o cuando empiece la jornada, no puntuarás.");
    }
    await logActivity({ type: "clausula", buyerName: profile.name, sellerName, assetId: asset.id, amount });
    return { ok: true };
  }, [profile, players, bids, market, activeLeagueId, logActivity]);

  const sellImmediate = useCallback(async (assetId) => {
    const fresh = await readTeam(activeLeagueId, profile.name) || teamService.emptyTeam();
    const player = players.find(p => p.id === assetId);
    if (!player) return { ok: false, error: "Jugadora no encontrada." };
    const amount = Math.max(0.01, (player.basePrice || 0) * 0.5);
    const nextTeam = teamService.receiveSaleProceeds(fresh, assetId, amount);
    await writeTeam(activeLeagueId, profile.name, nextTeam);
    setTeams(t => ({ ...t, [profile.name]: nextTeam }));
    await logActivity({ type: "venta", userId: profile.name, assetId, amount });
    return { ok: true, amount };
  }, [profile, players, activeLeagueId, logActivity]);

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
    const amount = entry.saleOffer.amount;
    const nextTeam = teamService.receiveSaleProceeds(fresh, assetId, amount);
    await writeTeam(activeLeagueId, profile.name, nextTeam);
    setTeams(t => ({ ...t, [profile.name]: nextTeam }));
    await logActivity({ type: "venta", userId: profile.name, assetId, amount });
    return { ok: true };
  }, [profile, activeLeagueId, logActivity]);

  // Rechaza la oferta que te ha hecho la liga por una jugadora puesta a la
  // venta: simplemente desaparece esa oferta concreta (sigue puesta en
  // venta, así que en el siguiente mercado puede llegarle una oferta nueva).
  const rejectSaleOffer = useCallback(async (assetId) => {
    const fresh = await readTeam(activeLeagueId, profile.name) || teamService.emptyTeam();
    const entry = teamService.getSquadEntry(fresh, assetId);
    if (!entry?.saleOffer) return { ok: false, error: "Esta jugadora ya no tiene una oferta activa." };
    const squad = (fresh.squad || []).map(e => e.id === assetId ? { ...e, saleOffer: null } : e);
    const nextTeam = { ...fresh, squad };
    await writeTeam(activeLeagueId, profile.name, nextTeam);
    setTeams(t => ({ ...t, [profile.name]: nextTeam }));
    return { ok: true };
  }, [profile, activeLeagueId]);

  // Sube la cláusula de tu propia jugadora pagando: el importe se descuenta de tu
  // presupuesto y la cláusula sube el DOBLE de lo pagado.
  const raiseClause = useCallback(async (assetId, payAmount) => {
    if (!Number.isFinite(payAmount) || payAmount <= 0) return { ok: false, error: "Introduce un importe válido." };
    if (payAmount > budgetAvailable + teamService.maxDebt(myTeam, players)) return { ok: false, error: `Superarías tu límite de endeudamiento (20% del valor de tu plantilla). Disponible: ${fmtCredits(budgetAvailable)}.` };
    const fresh = await readTeam(activeLeagueId, profile.name) || teamService.emptyTeam();
    const entry = teamService.getSquadEntry(fresh, assetId);
    if (!entry) return { ok: false, error: "Ya no tienes esta jugadora." };
    const nextTeam = teamService.raiseClause(fresh, assetId, payAmount);
    await writeTeam(activeLeagueId, profile.name, nextTeam);
    setTeams(t => ({ ...t, [profile.name]: nextTeam }));
    return { ok: true };
  }, [profile, activeLeagueId, budgetAvailable, myTeam, players]);

  // Triple Fantasy: pronosticar los 7 partidos + MVP de la jornada, pagando 1 M€ de entrada.
  const joinTriple = useCallback(async (jornadaId, picks, mvpChoice, mvpOptions) => {
    if (TRIPLE_ENTRY_FEE > budgetAvailable) return { ok: false, error: `Presupuesto insuficiente. Disponible: ${fmtCredits(budgetAvailable)}.` };
    const freshJ = await readJornadas();
    const jornada = freshJ.find(j => j.id === jornadaId);
    if (jornada && hasJornadaEffectivelyStarted(jornada)) {
      return { ok: false, error: "Esta jornada ya ha empezado, no se puede participar." };
    }
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
      if (((nextBuyer.budgetTotal || 0) - (nextBuyer.budgetSpent || 0)) < 0) {
        sendPushNotification(activeLeagueId, offer.fromUser, "⚠️ Te has quedado en negativo", "Ese fichaje te ha dejado con el presupuesto en negativo. Recuerda que si sigues endeudada/o cuando empiece la jornada, no puntuarás.");
      }
      await logActivity({ type: "oferta", buyerName: offer.fromUser, sellerName: offer.toUser, assetId: asset.id, amount: offer.amount });
    } else if (action === "reject") {
      const asset = players.find(p => p.id === offer.assetId);
      sendPushNotification(activeLeagueId, offer.fromUser, "❌ Te han rechazado la oferta", `${offer.toUser} ha rechazado tu oferta de ${fmtCredits(offer.amount)} por ${asset?.name || "esa jugadora"}.`);
    }
    const nextStatus = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "cancelled";
    const nextOffers = offerService.setStatus(freshOffers, offerId, nextStatus);
    await writeShared(leagueKey(activeLeagueId, "offers"), nextOffers);
    setOffers(nextOffers);
    return { ok: true };
  }, [players, offers, activeLeagueId, logActivity]);

  const forceResolveMarket = useCallback(async () => {
    const freshMarket = await readShared(leagueKey(activeLeagueId, "currentMarket"), market);
    if (!freshMarket) return;
    await writeShared(leagueKey(activeLeagueId, "currentMarket"), { ...freshMarket, closesAt: Date.now() - 1000 });
    await syncMarket(activeLeagueId, marketResetHour);
  }, [market, syncMarket, activeLeagueId, marketResetHour]);

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
  if (pendingUser) return <ChooseNameScreen onSubmit={completeGoogleName} onSignOut={signOut} />;
  if (profile === null) return <Onboarding onEnter={completeOnboarding} onGoogle={handleGoogleLogin} />;
  if (activeLeagueId === undefined) return <Loading />;
  if (activeLeagueId === null) {
    return <MisLigasScreen leagues={myLeagues} onSelect={selectLeague} onCreate={createLeague} onJoin={joinLeagueByCode} jornadas={jornadas} teamCrests={teamCrests} profile={profile} onKick={kickMember} onDeleteLeague={deleteLeague} onSignOut={signOut} players={players} />;
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
              teamCrests={teamCrests} tripleEntries={tripleEntries} onJoinTriple={joinTriple}
              favoritos={favoritos} onToggleFavorite={toggleFavorito}
              onSellImmediate={sellImmediate} onToggleForSale={toggleForSale} onAcceptSaleOffer={acceptSaleOffer} onRaiseClause={raiseClause}
              onBuyClause={buyClause} onSendOffer={sendOffer} playoffState={playoffState} />
          )}
          {tab === "clasificacion" && <ClasificacionTab teams={teams} players={players} jornadas={jornadas} me={profile.name} leagueId={activeLeagueId} teamCrests={teamCrests} budgetAvailable={budgetAvailable} onBuyClause={buyClause} onSendOffer={sendOffer} onGoTo={setTab} playoffState={playoffState} />}
          {tab === "equipo" && (
            <EquipoTab myJugadoras={myJugadoras} myCoaches={myCoaches} myTeam={myTeam}
              budgetAvailable={budgetAvailable} budgetCommitted={budgetCommitted}
              jornadas={jornadas} players={players} teamName={profile.name} leagueId={activeLeagueId}
              favoritos={favoritos} onToggleFavorite={toggleFavorito} teamCrests={teamCrests}
              onSaveLineup={saveLineup} onSellImmediate={sellImmediate} onToggleForSale={toggleForSale} onAcceptSaleOffer={acceptSaleOffer} onRaiseClause={raiseClause}
              playoffState={playoffState} onSavePlayoffLineup={savePlayoffLineup} />
          )}
          {tab === "mercado" && (
            playoffState.phase !== "none" ? (
              <PlayoffDraftTab playoffState={playoffState} players={players} teamCrests={teamCrests} profile={profile} jornadas={jornadas}
                onSubmitDraftList={submitDraftList} />
            ) : (
              <MercadoTab market={market} players={players} bids={bids} marketHistory={marketHistory} activity={activity}
                profile={profile} myTeam={myTeam} teams={teams} isMarketOpen={isMarketOpen}
                budgetAvailable={budgetAvailable} onBid={placeBid} onWithdrawBid={withdrawBid} onBuyClause={buyClause}
                offers={offers} onSendOffer={sendOffer} onRespondOffer={respondOffer}
                jornadas={jornadas} teamCrests={teamCrests}
                favoritos={favoritos} onToggleFavorite={toggleFavorito}
                onSellImmediate={sellImmediate} onToggleForSale={toggleForSale} onAcceptSaleOffer={acceptSaleOffer} onRejectSaleOffer={rejectSaleOffer} onRaiseClause={raiseClause} />
            )
          )}
          {tab === "mas" && (
            <MasTab activity={activity} players={players} onAdvanceSimDay={advanceSimDay} onExitSimMode={exitSimMode} onResetTest={resetTestMode} onDebugLineupLock={debugLineupLock} />
          )}
        </div>
      </main>
      <BottomNav tab={tab} setTab={setTab} isPlayoffMode={playoffState.phase !== "none"} />
    </div>
  );
}

/* =============================================================================
   MIS LIGAS
   ========================================================================== */
function MisLigasScreen({ leagues, onSelect, onCreate, onJoin, jornadas, teamCrests, profile, onKick, onDeleteLeague, onSignOut, players }) {
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [justCreated, setJustCreated] = useState(null); // liga recién creada, para mostrar su código
  const [showCalendar, setShowCalendar] = useState(false);
  const [adminLeague, setAdminLeague] = useState(null); // liga cuya administración está abierta

  const currentJornada = useMemo(() => findCurrentJornada(jornadas), [jornadas]);
  const currentJornadaNumber = currentJornada ? jornadas.findIndex(j => j.id === currentJornada.id) + 1 : 0;
  const partidosPreview = useMemo(() => realBracketService.projectedPartidos(jornadas, currentJornada).slice(0, 4), [jornadas, currentJornada]);

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

  const handleSelect = async (leagueId) => {
    setError("");
    const res = await onSelect(leagueId);
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="min-h-screen fl-body" style={{ background: C.navy900 }}>
      <GlobalStyle />
      <header className="px-4 pb-4 text-center relative" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)" }}>
        <div className="fl-mono text-sm tracking-[0.2em]" style={{ color: C.principal }}>COPA ARAGÓN</div>
        <h1 className="fl-display text-2xl uppercase mt-0.5" style={{ color: C.white }}>Mis Ligas</h1>
        <div className="flex items-center justify-center gap-2 mt-1.5">
          <span className="fl-mono text-[10px]" style={{ color: C.muted }}>{profile?.name}</span>
          <button onClick={onSignOut} className="fl-tap fl-mono text-[10px]" style={{ color: C.principal }}>· Cerrar sesión</button>
        </div>
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
              <div key={l.id} className="fl-row flex items-center justify-between px-3.5 py-3">
                <button onClick={() => handleSelect(l.id)} className="fl-tap flex-1 text-left min-w-0">
                  <div className="fl-body text-sm font-medium truncate" style={{ color: C.white }}>{l.name}</div>
                  <div className="fl-mono text-[10px] mt-0.5" style={{ color: C.muted }}>Código {l.invite_code}</div>
                </button>
                {l.created_by === profile?.name && (
                  <button onClick={() => setAdminLeague(l)} className="fl-tap p-1.5 -mr-1" title="Administrar liga">
                    <MoreVertical size={16} color={C.muted} />
                  </button>
                )}
                <button onClick={() => handleSelect(l.id)} className="fl-tap p-1"><ChevronRight size={16} color={C.muted} /></button>
              </div>
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
                {partidosPreview.map(m => <PartidoRow key={m.id} m={m} teamCrests={teamCrests} jornada={currentJornada} players={players} />)}
              </div>
            )}
            {(currentJornada.partidos || []).length > 0 || partidosPreview.length > 0 ? (
              <button onClick={() => setShowCalendar(true)}
                className="fl-tap w-full mt-3 rounded-md py-2.5 text-sm font-semibold" style={{ background: C.baby, color: C.ink }}>
                Todos los partidos
              </button>
            ) : null}
          </div>
        )}
      </div>

      {showCalendar && (
        <CalendarioModal jornadas={jornadas} teamCrests={teamCrests} players={players}
          initialIndex={Math.max(currentJornadaNumber - 1, 0)} onClose={() => setShowCalendar(false)} />
      )}

      {adminLeague && (
        <LeagueAdminScreen league={adminLeague} profile={profile} onKick={onKick} onDeleteLeague={onDeleteLeague}
          onClose={() => setAdminLeague(null)} />
      )}
    </div>
  );
}

// Panel de administración de una liga: solo lo ve quien la creó. Permite
// expulsar a cualquier persona (menos a una misma) y borrar la liga entera.
function LeagueAdminScreen({ league, profile, onKick, onDeleteLeague, onClose }) {
  const [members, setMembers] = useState(null); // null = cargando
  const [busyName, setBusyName] = useState(null);
  const [confirmKick, setConfirmKick] = useState(null); // nombre pendiente de confirmar
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const teams = await readAllTeams(league.id);
      if (!cancelled) setMembers(Object.keys(teams || {}).sort());
    })();
    return () => { cancelled = true; };
  }, [league.id]);

  const doKick = async (name) => {
    setBusyName(name);
    await onKick(league.id, name);
    setMembers((prev) => (prev || []).filter((n) => n !== name));
    setBusyName(null);
    setConfirmKick(null);
  };

  const doDelete = async () => {
    setDeleting(true);
    await onDeleteLeague(league.id);
    setDeleting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex items-center px-4 pb-3" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}>
        <button onClick={onClose} className="fl-tap p-1 -ml-1"><ChevronLeft size={22} color={C.white} /></button>
        <div className="flex-1 text-center fl-display text-sm uppercase pr-6 truncate" style={{ color: C.white }}>{league.name}</div>
      </div>
      <div className="flex-1 overflow-y-auto fl-scrollbar px-4 py-4">
        <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>MIEMBROS</div>
        {members === null ? (
          <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin" color={C.muted} /></div>
        ) : members.length === 0 ? (
          <EmptyState compact title="Todavía no hay nadie" text="En cuanto alguien se una con el código, aparecerá aquí." />
        ) : (
          <div className="space-y-1.5 mb-6">
            {members.map((name) => {
              const isCreator = name === league.created_by;
              const isMe = name === profile?.name;
              return (
                <div key={name} className="fl-row flex items-center justify-between px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="fl-body text-sm" style={{ color: C.white }}>{name}</span>
                    {isCreator && <span className="fl-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: C.babySoft, color: C.baby }}>ADMIN</span>}
                    {isMe && <span className="fl-mono text-[9px]" style={{ color: C.muted }}>(tú)</span>}
                  </div>
                  {!isCreator && !isMe && (
                    confirmKick === name ? (
                      <div className="flex items-center gap-1.5">
                        <button disabled={busyName === name} onClick={() => doKick(name)}
                          className="fl-tap fl-mono text-[11px] font-semibold rounded-md px-2.5 py-1.5" style={{ background: C.negative, color: C.white }}>
                          {busyName === name ? <Loader2 size={12} className="animate-spin" /> : "Confirmar"}
                        </button>
                        <button onClick={() => setConfirmKick(null)} className="fl-tap fl-mono text-[11px] rounded-md px-2.5 py-1.5" style={{ border: `1px solid ${C.line}`, color: C.muted }}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmKick(name)} className="fl-tap fl-mono text-[11px] font-medium rounded-md px-2.5 py-1.5" style={{ color: C.negative, border: `1px solid ${C.negative}` }}>
                        Expulsar
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>ZONA DE PELIGRO</div>
        {confirmDelete ? (
          <div className="fl-row p-3.5" style={{ border: `1px solid ${C.negative}` }}>
            <p className="fl-body text-sm mb-3" style={{ color: C.white }}>
              ¿Seguro que quieres borrar "{league.name}"? Se eliminará para todo el mundo y no se puede deshacer.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmDelete(false)} className="fl-tap rounded-md py-2.5 text-sm font-semibold" style={{ border: `1px solid ${C.line}`, color: C.white }}>
                Cancelar
              </button>
              <button disabled={deleting} onClick={doDelete} className="fl-tap rounded-md py-2.5 text-sm font-semibold flex items-center justify-center gap-2" style={{ background: C.negative, color: C.white }}>
                {deleting ? <Loader2 size={14} className="animate-spin" /> : "Sí, borrar"}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="fl-tap w-full rounded-md py-3 text-sm font-semibold" style={{ border: `1px solid ${C.negative}`, color: C.negative }}>
            Borrar liga
          </button>
        )}
      </div>
    </div>
  );
}

/* =============================================================================
   NAVEGACIÓN
   ========================================================================== */
function Header({ profile, saving, activeLeague, onBackToLeagues, activeLeagueId }) {
  // "checking" evita parpadear al estado equivocado mientras se comprueba el permiso real.
  const [notifState, setNotifState] = useState("checking");
  const [busy, setBusy] = useState(false);

  // Comprueba el estado REAL del navegador (no solo lo que guardamos en
  // localStorage), por si el permiso se revocó desde los ajustes del móvil
  // o la suscripción se perdió por cualquier motivo.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // En iPhone/iPad, Apple solo permite las notificaciones push si la web está
      // añadida a la pantalla de inicio (da igual qué navegador se use para verla:
      // todos usan el motor de Safari por dentro). Se detecta antes que nada,
      // porque en ese caso "PushManager" puede ni existir todavía.
      if (isIOS() && !isStandalonePWA()) { if (!cancelled) setNotifState("ios-add-to-home"); return; }
      if (!pushSupported()) { if (!cancelled) setNotifState("unsupported"); return; }
      if (typeof Notification === "undefined") { if (!cancelled) setNotifState("unsupported"); return; }
      if (Notification.permission === "denied") { if (!cancelled) setNotifState("denied"); return; }
      if (Notification.permission !== "granted") { if (!cancelled) setNotifState("off"); return; }
      try {
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        if (!cancelled) setNotifState(subscription ? "on" : "off");
      } catch {
        if (!cancelled) setNotifState("off");
      }
    })();
    return () => { cancelled = true; };
  }, [activeLeagueId, profile.name]);

  const toggleNotifications = async () => {
    if (busy || ["checking", "unsupported", "denied", "ios-add-to-home"].includes(notifState)) return;
    setBusy(true);
    if (notifState === "on") {
      await disablePushNotifications();
      setBusy(false);
      setNotifState("off");
      return;
    }
    const ok = await enablePushNotifications(activeLeagueId, profile.name);
    setBusy(false);
    setNotifState(ok ? "on" : (Notification.permission === "denied" ? "denied" : "off"));
  };

  const notifLabel = {
    checking: "Comprobando…",
    unsupported: "No disponible en este navegador",
    denied: "Bloqueadas — actívalas en Ajustes del navegador",
    "ios-add-to-home": "En iPhone: añade la web a inicio desde Safari",
    on: "Notificaciones activadas",
    off: "Activar notificaciones",
  }[notifState];
  const notifDisabled = busy || ["checking", "unsupported", "denied", "ios-add-to-home"].includes(notifState);

  return (
    <header className="px-4 pb-2.5 sticky z-30" style={{ top: 0, background: C.navy900, borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
      <div className="flex items-center justify-between">
        <button onClick={onBackToLeagues} className="fl-tap flex items-center gap-1 -ml-0.5">
          <ChevronLeft size={14} color={C.muted} />
          <span className="fl-mono text-[10px]" style={{ color: C.muted }}>Mis ligas</span>
        </button>
        <span className="fl-mono text-[10px]" style={{ color: C.muted }}>{profile.name} {saving && "· guardando…"}</span>
      </div>
      <div className="flex items-end justify-between mt-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="fl-display text-2xl uppercase flex-shrink-0" style={{ background: `linear-gradient(90deg, ${C.principal}, ${C.baby})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            Fantasy
          </h1>
          <span className="fl-mono text-[10px] tracking-[0.15em] truncate" style={{ color: C.muted }}>{activeLeague?.name?.toUpperCase() || "GRUPO A2 · ARAGÓN"}</span>
        </div>
        <button onClick={toggleNotifications} disabled={notifDisabled} title={notifLabel}
          className="fl-tap flex items-center justify-center flex-shrink-0 disabled:opacity-50"
          style={{
            width: 40, height: 40, borderRadius: 10,
            background: notifState === "on" ? C.babySoft : C.navy600,
            border: `1.5px solid ${notifState === "on" ? C.baby : "rgba(255,255,255,0.28)"}`,
          }}>
          {busy ? <Loader2 size={19} className="animate-spin" color={C.muted} />
            : notifState === "on" ? <Bell size={19} color={C.baby} fill={C.baby} />
            : <BellOff size={19} color={C.white} />}
        </button>
      </div>
      {notifState === "ios-add-to-home" && (
        <p className="fl-body text-[10px] mt-1.5" style={{ color: C.muted }}>
          🔔 Para activar avisos en iPhone: Safari → Compartir → "Añadir a pantalla de inicio", y abre la app desde ese icono.
        </p>
      )}
    </header>
  );
}

// Icono a medida para la pestaña de Draft (sustituye al martillo del Mercado
// durante toda la fase de playoffs): unas "líneas de lista" + una estrella,
// en el mismo lenguaje visual (stroke fino, estilo lucide) que el resto de
// iconos de la barra. En estado activo, las líneas llevan el degradado de
// marca rosa→naranja y la estrella se rellena en dorado, como pide la
// referencia de diseño.
function DraftNavIcon({ size = 19, active }) {
  const lineColor = active ? "url(#draftNavGradient)" : C.muted;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {active && (
        <defs>
          <linearGradient id="draftNavGradient" x1="2" y1="4" x2="22" y2="20" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={C.principal} />
            <stop offset="100%" stopColor={C.baby} />
          </linearGradient>
        </defs>
      )}
      <path d="M2.5 6h8.5" stroke={lineColor} strokeWidth="2" strokeLinecap="round" />
      <path d="M2.5 12h6" stroke={lineColor} strokeWidth="2" strokeLinecap="round" />
      <path d="M2.5 18h3.5" stroke={lineColor} strokeWidth="2" strokeLinecap="round" />
      <path d="M18 3.8l1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5z"
        fill={active ? C.gold : "none"} stroke={active ? C.gold : C.muted} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function BottomNav({ tab, setTab, isPlayoffMode }) {
  const items = [
    { key: "inicio", label: "Inicio", icon: Trophy },
    { key: "clasificacion", label: "Ranking", icon: Users },
    { key: "equipo", label: "Equipo", icon: ShieldCheck },
    { key: "mercado", label: isPlayoffMode ? "Draft" : "Mercado", icon: Gavel },
    { key: "mas", label: "Más", icon: Menu },
  ];
  const accentFor = (key) => (key === "mercado" ? C.baby : C.principal);
  return (
    <nav className="fixed bottom-0 left-0 right-0 px-2 py-1.5 flex items-stretch justify-between"
      style={{ background: C.navy800, borderTop: `1px solid ${C.line}`, paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))" }}>
      {items.map(it => {
        const Icon = it.icon;
        const active = tab === it.key;
        const isDraft = it.key === "mercado" && isPlayoffMode;
        const accent = accentFor(it.key);
        return (
          <button key={it.key} onClick={() => setTab(it.key)} className="fl-tap flex-1 flex flex-col items-center gap-0.5 py-1.5 relative">
            {isDraft
              ? <DraftNavIcon size={19} active={active} />
              : <Icon size={19} color={active ? accent : C.muted} />}
            <span className="fl-mono text-[9px] font-semibold"
              style={active && isDraft
                ? { background: `linear-gradient(90deg, ${C.principal}, ${C.baby})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }
                : { color: active ? accent : C.muted }}>
              {it.label}
            </span>
            {active && isDraft && (
              <span className="absolute -bottom-0.5 rounded-full" style={{ width: 26, height: 3, background: `linear-gradient(90deg, ${C.principal}, ${C.baby})`, boxShadow: `0 0 8px ${C.principal}aa` }} />
            )}
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
function PartidoRow({ m, teamCrests, jornada, players }) {
  const [showDetail, setShowDetail] = useState(false);
  const played = m.marcadorLocal !== undefined && m.marcadorLocal !== null && m.marcadorLocal !== "" &&
    m.marcadorVisitante !== undefined && m.marcadorVisitante !== null && m.marcadorVisitante !== "";
  return (
    <>
      <button onClick={() => setShowDetail(true)} className="fl-tap w-full text-left px-3 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
        <div className="flex-1 flex items-center gap-2 justify-end text-right min-w-0">
          <span className="fl-body text-xs font-medium truncate" style={{ color: C.white }}>{m.local}</span>
          <TeamCrest name={m.local} photo={teamCrests?.[m.local]} size={28} />
        </div>
        <div className="flex flex-col items-center px-1 flex-shrink-0" style={{ minWidth: 64 }}>
          {played ? (
            <>
              <span className="fl-mono text-sm font-bold" style={{ color: C.white }}>{m.marcadorLocal} - {m.marcadorVisitante}</span>
              <span className="fl-mono text-[9px] font-semibold flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full" style={{ color: C.principal, border: `1px solid ${C.principal}` }}>
                <CircleCheck size={10} /> FINALIZADO
              </span>
            </>
          ) : m.hora
            ? <span className="fl-mono text-xs font-semibold" style={{ color: C.baby }}>{m.hora}</span>
            : <span className="fl-mono text-[10px]" style={{ color: C.muted }}>VS</span>}
        </div>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <TeamCrest name={m.visitante} photo={teamCrests?.[m.visitante]} size={28} />
          <span className="fl-body text-xs font-medium truncate" style={{ color: C.white }}>{m.visitante}</span>
        </div>
      </button>
      {showDetail && jornada && (
        <PartidoDetailScreen partido={m} jornada={jornada} players={players || []} teamCrests={teamCrests} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}

// Aggregado de estadísticas de TODO un equipo real (no de tu plantilla) en una
// jornada concreta, sumando a todas las jugadoras cuyo "team" coincide.
function aggregateTeamStats(teamName, jornada, players) {
  const totals = { reb: 0, ast: 0, fp: 0, pd: 0, tap: 0 };
  Object.entries(jornada?.stats || {}).forEach(([pid, s]) => {
    const p = players.find((x) => x.id === pid);
    if (!p || p.team !== teamName) return;
    totals.reb += (s.rebofen || 0) + (s.rebdefe || 0);
    totals.ast += s.asist || 0;
    totals.fp += s.faltas || 0;
    totals.pd += s.pd || 0;
    totals.tap += s.tap || 0;
  });
  return totals;
}
// Tiros metidos/intentados de TODO un equipo real, sumando a sus jugadoras esa jornada.
function aggregateTeamShooting(teamName, jornada, players) {
  const totals = { t2m: 0, t2a: 0, t3m: 0, t3a: 0, tlm: 0, tla: 0 };
  Object.entries(jornada?.stats || {}).forEach(([pid, s]) => {
    const p = players.find((x) => x.id === pid);
    if (!p || p.team !== teamName) return;
    totals.t2m += s.t2 || 0; totals.t2a += s.t2Intentados || 0;
    totals.t3m += s.t3 || 0; totals.t3a += s.t3Intentados || 0;
    totals.tlm += s.tlibre || 0; totals.tla += s.tlibreIntentados || 0;
  });
  return totals;
}

// Barra horizontal a prueba de fallos: el relleno usa position:absolute con un
// ancho en % SOBRE UN CONTENEDOR CON POSITION:RELATIVE, así que su tamaño
// nunca depende de c\u00e1lculos de flexbox (que pod\u00edan hacer que dos valores muy
// distintos, p. ej. 1 y 9, se vieran con la barra pr\u00e1cticamente igual).
function StatBar({ pct, color, align = "left" }) {
  return (
    <div style={{ position: "relative", width: "100%", height: 10, borderRadius: 999, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, [align === "left" ? "right" : "left"]: 0, width: `${pct}%`, background: color, borderRadius: 999 }} />
    </div>
  );
}

// Anillo de porcentaje (círculo con un arco de color proporcional al %).
function PercentRing({ pct, color, size = 60, strokeWidth = 6 }) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.26} fontWeight="700" fill={color} fontFamily="monospace">{pct}%</text>
    </svg>
  );
}

// Ficha de un partido: marcador (con cuartos si están rellenados en
// Supabase) y comparativa de estadísticas de equipo, sumando las
// estadísticas de todas las jugadoras de cada equipo real esa jornada.
function PartidoDetailScreen({ partido: m, jornada, players, teamCrests, onClose }) {
  const played = m.marcadorLocal !== "" && m.marcadorLocal != null && m.marcadorVisitante !== "" && m.marcadorVisitante != null;
  const quarters = [
    [m.p1Local, m.p1Visitante], [m.p2Local, m.p2Visitante], [m.p3Local, m.p3Visitante], [m.p4Local, m.p4Visitante],
  ];
  const hasQuarters = quarters.some(([a, b]) => (a !== "" && a != null) || (b !== "" && b != null));

  const localStats = useMemo(() => aggregateTeamStats(m.local, jornada, players), [m.local, jornada, players]);
  const visitStats = useMemo(() => aggregateTeamStats(m.visitante, jornada, players), [m.visitante, jornada, players]);
  const localShoot = useMemo(() => aggregateTeamShooting(m.local, jornada, players), [m.local, jornada, players]);
  const visitShoot = useMemo(() => aggregateTeamShooting(m.visitante, jornada, players), [m.visitante, jornada, players]);
  const hasStats = Object.keys(jornada?.stats || {}).length > 0;
  const hasShooting = (localShoot.t2a + localShoot.t3a + localShoot.tla + visitShoot.t2a + visitShoot.t3a + visitShoot.tla) > 0;
  const rows = [
    { key: "reb", label: "REB" }, { key: "ast", label: "AST" }, { key: "fp", label: "FP" },
    { key: "pd", label: "PD" }, { key: "tap", label: "TAP" },
  ];
  const maxOf = (key) => Math.max(localStats[key], visitStats[key], 1);
  const pct = (made, att) => (att > 0 ? Math.round((made / att) * 100) : 0);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex items-center px-4 pb-3" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}>
        <button onClick={onClose} className="fl-tap p-1 -ml-1"><ChevronLeft size={22} color={C.white} /></button>
        <div className="flex-1 text-center fl-display text-sm uppercase pr-6" style={{ color: C.white }}>Partido</div>
      </div>
      <div className="flex-1 overflow-y-auto fl-scrollbar px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <span className="fl-mono text-[11px]" style={{ color: C.muted }}>{[m.fecha, m.hora].filter(Boolean).join(" · ") || "Fecha por confirmar"}</span>
          <span className="fl-mono text-[10px] px-2 py-1 rounded-full font-semibold" style={{ background: played ? C.babySoft : C.navy800, color: played ? C.baby : C.muted }}>
            {played ? "Finalizado" : "Pendiente"}
          </span>
        </div>

        <div className="fl-row p-4 mb-5">
          {hasQuarters && (
            <div className="flex items-center justify-end gap-2 mb-1.5 pr-0.5">
              {["P1", "P2", "P3", "P4"].map((q) => <span key={q} className="fl-mono text-[9px] text-center" style={{ color: C.muted, width: 22 }}>{q}</span>)}
              <span style={{ width: 34 }} />
            </div>
          )}
          {[
            { name: m.local, score: m.marcadorLocal, p: quarters.map((q) => q[0]), color: C.baby },
            { name: m.visitante, score: m.marcadorVisitante, p: quarters.map((q) => q[1]), color: C.principal },
          ].map((team, i) => (
            <div key={i} className="flex items-center gap-2.5 py-2">
              <TeamCrest name={team.name} photo={teamCrests?.[team.name]} size={32} />
              <span className="fl-body text-sm font-medium flex-1 truncate" style={{ color: C.white }}>{team.name}</span>
              {hasQuarters && team.p.map((v, qi) => (
                <span key={qi} className="fl-mono text-xs text-center" style={{ color: C.muted, width: 22 }}>{v !== "" && v != null ? v : "–"}</span>
              ))}
              <span className="fl-mono text-xl font-bold text-right" style={{ color: team.color, width: 34 }}>{played ? team.score : "–"}</span>
            </div>
          ))}
        </div>

        {!hasStats ? (
          <EmptyState compact title="Sin estadísticas todavía" text="En cuanto se carguen las estadísticas de esta jornada, verás aquí la comparativa del partido." />
        ) : (
          <div className="mb-6">
            <div className="fl-mono text-xs font-semibold mb-3" style={{ color: C.muted }}>COMPARATIVA DEL EQUIPO</div>
            <div className="space-y-4">
              {rows.map((r) => {
                const lv = localStats[r.key], vv = visitStats[r.key], mx = maxOf(r.key);
                return (
                  <div key={r.key} className="flex items-center gap-3">
                    <span className="fl-mono text-sm font-bold text-right" style={{ color: C.white, width: 30 }}>{lv}</span>
                    <div className="flex-1"><StatBar pct={(lv / mx) * 100} color={C.baby} align="left" /></div>
                    <span className="fl-mono text-[10px] font-bold text-center flex-shrink-0" style={{ color: C.muted, width: 34 }}>{r.label}</span>
                    <div className="flex-1"><StatBar pct={(vv / mx) * 100} color={C.principal} align="right" /></div>
                    <span className="fl-mono text-sm font-bold" style={{ color: C.white, width: 30 }}>{vv}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {hasShooting && (
          <div>
            <div className="fl-mono text-xs font-semibold mb-3" style={{ color: C.muted }}>PORCENTAJES DE TIRO</div>
            <div className="fl-row divide-y" style={{ borderColor: C.lineSoft }}>
              {[
                { label: "TL", lm: localShoot.tlm, la: localShoot.tla, vm: visitShoot.tlm, va: visitShoot.tla },
                { label: "T2", lm: localShoot.t2m, la: localShoot.t2a, vm: visitShoot.t2m, va: visitShoot.t2a },
                { label: "T3", lm: localShoot.t3m, la: localShoot.t3a, vm: visitShoot.t3m, va: visitShoot.t3a },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between px-3 py-4" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                  <div className="flex flex-col items-center" style={{ width: 76 }}>
                    <PercentRing pct={pct(row.lm, row.la)} color={C.baby} />
                    <span className="fl-mono text-[11px] mt-1.5" style={{ color: C.muted }}>{row.lm}/{row.la}</span>
                  </div>
                  <span className="fl-body text-sm font-semibold" style={{ color: C.white }}>{row.label}</span>
                  <div className="flex flex-col items-center" style={{ width: 76 }}>
                    <PercentRing pct={pct(row.vm, row.va)} color={C.principal} />
                    <span className="fl-mono text-[11px] mt-1.5" style={{ color: C.muted }}>{row.vm}/{row.va}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Calendario completo: pantalla a pantalla completa con una jornada por pestaña
// (J1, J2…) y sus partidos agrupados por fecha, al estilo del calendario oficial.
function CalendarioModal({ jornadas, teamCrests, initialIndex, onClose, players }) {
  const [idx, setIdx] = useState(initialIndex ?? Math.max(jornadas.length - 1, 0));
  const jornada = jornadas[idx];
  const partidos = useMemo(() => realBracketService.projectedPartidos(jornadas, jornada), [jornadas, jornada]);
  const grouped = useMemo(() => groupPartidosByFecha(partidos), [partidos]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex items-center justify-between px-3 pb-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
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
        {!jornada || partidos.length === 0 ? (
          <EmptyState title="Sin partidos" text="Todavía no hay partidos añadidos para esta jornada." />
        ) : (
          <div className="space-y-4">
            {grouped.map((g, gi) => (
              <div key={gi}>
                {g.fecha && <div className="fl-mono text-[10px] mb-1.5 uppercase" style={{ color: C.muted }}>{g.fecha}</div>}
                <div className="fl-row divide-y" style={{ borderColor: C.lineSoft }}>
                  {g.partidos.map(m => <PartidoRow key={m.id} m={m} teamCrests={teamCrests} jornada={jornada} players={players} />)}
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
function TripleFantasyScreen({ jornada, jornadaNumber, players, jornadas, myEntry, budgetAvailable, teamCrests, profile, allEntries, onJoin, onClose }) {
  const [picks, setPicks] = useState({});
  const [mvpChoice, setMvpChoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const mvpCandidates = useMemo(() => tripleFantasyService.computeMvpCandidates(players, jornadas), [players, jornadas]);
  const partidos = jornada?.partidos || [];
  const allPicked = partidos.length > 0 && partidos.every(p => picks[p.id]) && !!mvpChoice;

  // Historial: tus participaciones de OTRAS jornadas (no la que se ve ahora mismo).
  const pastEntries = useMemo(() => {
    if (!profile) return [];
    return (allEntries || [])
      .filter(e => e.userId === profile.name && e.jornadaId !== jornada?.id)
      .map(e => ({ entry: e, jornada: jornadas.find(j => j.id === e.jornadaId) }))
      .filter(x => x.jornada)
      .sort((a, b) => jornadas.indexOf(b.jornada) - jornadas.indexOf(a.jornada));
  }, [allEntries, profile, jornada, jornadas]);

  if (showHistory) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
        <div className="flex items-center justify-between px-3 pb-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
          <button onClick={() => setShowHistory(false)} className="fl-tap p-1.5 -ml-1"><ChevronLeft size={20} color={C.white} /></button>
          <span className="fl-display text-base uppercase" style={{ color: C.white }}>Historial Triple Fantasy</span>
          <span style={{ width: 28 }} />
        </div>
        <div className="flex-1 overflow-y-auto fl-scrollbar p-4">
          {pastEntries.length === 0 ? (
            <EmptyState title="Sin jornadas anteriores" text="Aquí verás tus quinielas y aciertos de jornadas pasadas en las que hayas participado." />
          ) : (
            <div className="space-y-3">
              {pastEntries.map(({ entry, jornada: j }) => {
                const jNum = jornadas.findIndex(x => x.id === j.id) + 1;
                const jPartidos = j.partidos || [];
                return (
                  <div key={entry.id} className="fl-row p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="fl-display text-sm uppercase" style={{ color: C.white }}>Jornada {jNum}</span>
                      {entry.settled ? (
                        <span className="fl-mono text-sm font-bold" style={{ color: entry.prize > 0 ? C.positive : C.negative }}>{fmtCredits(entry.prize || 0)}</span>
                      ) : (
                        <span className="fl-mono text-[10px]" style={{ color: C.muted }}>Pendiente</span>
                      )}
                    </div>
                    {entry.settled && (
                      <div className="fl-mono text-[10px] mb-2" style={{ color: C.muted }}>ACIERTOS: {entry.correct}/{jPartidos.length} {entry.mvpCorrect ? "· MVP ✓" : ""}</div>
                    )}
                    <div className="space-y-1">
                      {jPartidos.map(p => {
                        const winner = tripleFantasyService.matchWinner(p);
                        const pick = entry.picks?.[p.id];
                        const hit = winner && pick && winner === pick;
                        const pickName = pick === "local" ? p.local : pick === "visitante" ? p.visitante : "—";
                        return (
                          <div key={p.id} className="flex items-center justify-between">
                            <span className="fl-body text-[11px] truncate" style={{ color: C.white, maxWidth: "60%" }}>{p.local} vs {p.visitante}</span>
                            <span className="fl-mono text-[10px] flex items-center gap-1" style={{ color: winner ? (hit ? C.positive : C.negative) : C.muted }}>
                              {winner && (hit ? <CircleCheck size={11} /> : <CircleX size={11} />)} {pickName}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Ya has participado en esta jornada: muestra tu quiniela y, si ya hay resultado, el premio.
  if (myEntry) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
        <div className="flex items-center justify-between px-3 pb-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
          <button onClick={onClose} className="fl-tap p-1.5 -ml-1"><ChevronLeft size={20} color={C.white} /></button>
          <span className="fl-display text-base uppercase" style={{ color: C.white }}>🏀 Triple Fantasy</span>
          <button onClick={() => setShowHistory(true)} className="fl-tap p-1.5 -mr-1"><Clock size={20} color={C.muted} /></button>
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
      <div className="flex items-center justify-between px-3 pb-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
        <button onClick={onClose} className="fl-tap p-1.5 -ml-1"><ChevronLeft size={20} color={C.white} /></button>
        <span className="fl-display text-base uppercase" style={{ color: C.white }}>🏀 Triple Fantasy</span>
        <button onClick={() => setShowHistory(true)} className="fl-tap p-1.5 -mr-1"><Clock size={20} color={C.muted} /></button>
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

// Pantalla "5 ideal": muestra, jornada a jornada, las 5 jugadoras con más
// puntos que cuadraban una alineación válida ese día. Se recalcula al vuelo
// (es una función pura sobre las estadísticas ya cargadas), aunque el premio
// de 100.000 € solo se abona una vez por jornada (ver checkIdealFive en App).
function IdealFiveScreen({ jornadas, players, teamCrests, onClose }) {
  const [selectedIdx, setSelectedIdx] = useState(Math.max(jornadas.length - 1, 0));
  const jornada = jornadas[selectedIdx];
  const ideal = useMemo(() => jornada ? idealFiveService.compute(jornada, players) : null, [jornada, players]);

  const findPlayer = (id) => players.find(p => p.id === id) || null;
  const pointsFor = (id) => {
    const p = findPlayer(id);
    if (!p || !jornada) return 0;
    const stats = jornada.stats?.[id];
    return stats ? calcPointsBreakdown(stats, p.position).total : 0;
  };
  const byPos = (posKey) => (ideal?.playerIds || []).filter(id => findPlayer(id)?.position === posKey);
  const rows = [
    { pos: POSITIONS[2], ids: byPos("PIVOT") },
    { pos: POSITIONS[1], ids: byPos("ALERO") },
    { pos: POSITIONS[0], ids: byPos("BASE") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex items-center px-4 pb-3" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}>
        <button onClick={onClose} className="fl-tap p-1 -ml-1"><ChevronLeft size={22} color={C.white} /></button>
        <div className="flex-1 text-center fl-display text-sm uppercase pr-6 flex items-center justify-center gap-1.5" style={{ color: C.white }}>
          <Star size={15} fill={C.gold} color={C.gold} /> 5 ideal
        </div>
      </div>
      <div className="flex-1 overflow-y-auto fl-scrollbar px-4 py-4">
        <div className="flex gap-1.5 mb-4 overflow-x-auto fl-scrollbar">
          {jornadas.map((j, i) => (
            <button key={j.id} onClick={() => setSelectedIdx(i)}
              className="fl-tap flex-shrink-0 rounded-full flex items-center justify-center fl-mono text-[11px] font-semibold"
              style={{ width: 38, height: 38, background: i === selectedIdx ? C.gold : C.navy800, color: i === selectedIdx ? C.ink : C.muted, border: `1px solid ${i === selectedIdx ? C.gold : C.line}` }}>
              J{i + 1}
            </button>
          ))}
        </div>

        <div className="fl-row p-3.5 mb-4 text-center" style={{ border: `1px solid ${C.gold}55` }}>
          <p className="fl-body text-xs" style={{ color: C.muted }}>
            Cada jornada, quien tenga alguna de estas 5 jugadoras en su plantilla recibe <span style={{ color: C.gold, fontWeight: 600 }}>{fmtCredits(IDEAL_FIVE_REWARD)}</span> automáticamente.
          </p>
        </div>

        {!ideal ? (
          <EmptyState compact title="Todavía sin datos suficientes" text="En cuanto haya suficientes estadísticas cargadas de esta jornada, aparecerá aquí el 5 ideal." />
        ) : (
          <>
            <div className="rounded-2xl relative overflow-hidden" style={{ background: C.navy700, border: `2px solid ${C.gold}55`, boxShadow: `0 0 24px ${C.gold}22`, minHeight: 420 }}>
              <BasketballCourt />
              <div className="relative h-full flex flex-col justify-between py-5 px-1" style={{ minHeight: 420 }}>
                {rows.map(({ pos, ids }) => (
                  <div key={pos.key} className={`flex items-start flex-wrap ${pos.key === "ALERO" ? "justify-between px-1" : "justify-center gap-3"}`}>
                    {ids.map((id) => {
                      const p = findPlayer(id);
                      return (
                        <div key={id} className="flex flex-col items-center">
                          <div className="relative">
                            <CourtSlot player={p} size={70} teamCrests={teamCrests} />
                            <span className="absolute -top-1.5 -right-1.5 fl-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: C.navy900, color: C.gold, border: `1px solid ${C.gold}` }}>
                              {pointsFor(id)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="fl-mono text-[10px] text-center mt-2.5" style={{ color: C.muted }}>Alineación: {ideal.formation} · {ideal.total} puntos en total</div>
          </>
        )}
      </div>
    </div>
  );
}

function InicioTab({ profile, teams, players, jornadas, leagueId, myTeam, budgetAvailable, budgetCommitted, market, isMarketOpen, onGoTo, teamCrests, tripleEntries, onJoinTriple, favoritos, onToggleFavorite, onSellImmediate, onToggleForSale, onAcceptSaleOffer, onRaiseClause, onBuyClause, onSendOffer, playoffState }) {
  const [detailPlayer, setDetailPlayer] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTriple, setShowTriple] = useState(false);
  const [showValorChart, setShowValorChart] = useState(false);
  const [showAllMovers, setShowAllMovers] = useState(false);
  const [showClasificacion, setShowClasificacion] = useState(false);
  const [showPlayoffIntro, setShowPlayoffIntro] = useState(false);
  const standings = useMemo(() => rankingService.computeStandings(teams, players, playoffService.regularJornadas(jornadas), leagueId), [teams, players, jornadas, leagueId]);
  const myRow = standings.find(r => r.name === profile.name);
  const lastJornada = findCurrentJornada(jornadas);
  const currentJornadaNumber = lastJornada ? jornadas.findIndex(j => j.id === lastJornada.id) + 1 : jornadas.length + 1;
  const partidos = useMemo(() => realBracketService.projectedPartidos(jornadas, lastJornada), [jornadas, lastJornada]);
  const myTripleEntry = lastJornada ? (tripleEntries || []).find(e => e.jornadaId === lastJornada.id && e.userId === profile.name) : null;
  const isPlayoffMode = playoffState && playoffState.phase !== "none";

  // La primera vez que se detectan playoffs activos en este dispositivo, se
  // enseña la animación + hoja explicativa, una única vez.
  useEffect(() => {
    if (!isPlayoffMode || !leagueId) return;
    (async () => {
      const seenKey = `playoffIntroSeen_${leagueId}`;
      const seen = await readPersonal(seenKey, false);
      if (!seen) { setShowPlayoffIntro(true); await writePersonal(seenKey, true); }
    })();
  }, [isPlayoffMode, leagueId]);

  // Top 5 jugadoras/entrenadoras con más puntos en la ronda de playoffs
  // actual, de los 8 equipos reales que siguen vivos (no de tu plantilla:
  // esto es rendimiento real, sirve para decidir a quién fichar en el draft).
  const playoffTops = useMemo(() => {
    if (!isPlayoffMode || !playoffState.round) return { jugadoras: [], entrenadores: [] };
    const aliveTeams = playoffService.aliveRealTeams(jornadas, playoffState.round);
    const roundJornadas = playoffService.jornadasForRound(jornadas, playoffState.round);
    const scoreFor = (p) => roundJornadas.reduce((s, j) => s + (p.position === "DT"
      ? calcCoachPoints(null, resolveCoachWin(j, p.team)).total
      : calcPlayerPoints(j.stats?.[p.id], p.position)), 0);
    const pool = players.filter(p => aliveTeams.has(p.team));
    const jugadoras = pool.filter(p => p.position !== "DT").map(p => ({ player: p, pts: scoreFor(p) })).sort((a, b) => b.pts - a.pts).slice(0, 5);
    const entrenadores = pool.filter(p => p.position === "DT").map(p => ({ player: p, pts: scoreFor(p) })).sort((a, b) => b.pts - a.pts).slice(0, 5);
    return { jugadoras, entrenadores };
  }, [isPlayoffMode, playoffState?.round, jornadas, players]);

  // Valor de plantilla hoy, y cuánto ha cambiado hoy (basePrice de hoy vs
  // prevBasePrice, que el motor de precios diario deja siempre como "el
  // valor de justo antes del último movimiento").
  const valorHoy = (myTeam.squad || []).reduce((s, e) => { const p = players.find(x => x.id === e.id); return s + (p?.basePrice || 0); }, 0);
  const valorAyer = (myTeam.squad || []).reduce((s, e) => { const p = players.find(x => x.id === e.id); return s + (p?.prevBasePrice ?? p?.basePrice ?? 0); }, 0);
  const cambioValor = valorHoy - valorAyer;
  const cambioPct = valorAyer > 0 ? (cambioValor / valorAyer) * 100 : 0;

  // Top subidas/bajadas de TODA la competición (cualquier jugadora exista o no en tu plantilla).
  const movers = useMemo(() => {
    const changes = players
      .filter(p => p.position !== "DT")
      .map(p => ({ player: p, delta: (p.basePrice || 0) - (p.prevBasePrice ?? p.basePrice ?? 0) }))
      .map(c => ({ ...c, pct: (c.player.prevBasePrice || 0) > 0 ? (c.delta / c.player.prevBasePrice) * 100 : 0 }));
    const gainers = changes.filter(c => c.delta > 0).sort((a, b) => b.delta - a.delta);
    const losers = changes.filter(c => c.delta < 0).sort((a, b) => a.delta - b.delta);
    return { gainers, losers };
  }, [players]);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${C.principal} 0%, ${C.baby} 100%)`, boxShadow: isPlayoffMode ? `0 0 46px ${C.principal}88, 0 0 70px ${C.gold}44` : `0 0 30px ${C.principal}44` }}>
        <span style={{ position: "absolute", right: -22, bottom: -30, fontSize: 130, opacity: 0.14, lineHeight: 1 }}>🏀</span>
        <div className="flex items-center justify-between relative z-10">
          <div>
            <div className="flex items-center gap-1.5 fl-mono text-[10px] tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.85)" }}>
              <Trophy size={12} /> TU LIGA
            </div>
            <div className="fl-display text-2xl uppercase" style={{ color: C.white }}>{profile.name}</div>
          </div>
          <div className="text-right">
            <Crown size={16} color={C.white} style={{ marginLeft: "auto" }} />
            <div className="fl-mono text-3xl font-bold" style={{ color: C.white }}>{myRow ? `#${myRow.rank}` : "—"}</div>
            <div className="fl-mono text-[9px]" style={{ color: "rgba(255,255,255,0.75)" }}>POSICIÓN</div>
          </div>
        </div>
      </div>

      {isPlayoffMode ? (
        <div className="relative overflow-hidden rounded-2xl px-3 py-2.5" style={{ background: C.navy800, border: `2px solid ${C.principal}`, boxShadow: `0 0 14px ${C.principal}55` }}>
          <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{ position: "absolute", right: 0, bottom: 0, width: "40%", height: "80%", opacity: 0.16 }}>
            <rect x="4" y="34" width="10" height="26" fill={C.principal} /><rect x="20" y="24" width="10" height="36" fill={C.principal} />
            <rect x="36" y="30" width="10" height="30" fill={C.principal} /><rect x="52" y="14" width="10" height="46" fill={C.principal} />
            <rect x="68" y="20" width="10" height="40" fill={C.principal} /><rect x="84" y="4" width="10" height="56" fill={C.principal} />
          </svg>
          <div className="relative z-10">
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="rounded-full flex items-center justify-center" style={{ width: 20, height: 20, background: `${C.principal}22` }}>
                <TrendingUp size={11} color={C.principal} />
              </div>
              <span className="fl-mono text-[9px] font-bold tracking-wide" style={{ color: C.muted }}>VALOR DE PLANTILLA</span>
            </div>
            <div className="fl-mono text-lg font-bold" style={{ color: C.white }}>{fmtCredits(valorHoy)}</div>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-2 gap-2.5">
        <div className="relative overflow-hidden rounded-2xl px-3 py-2" style={{ background: C.navy800, border: `2px solid #FF8A00`, boxShadow: `0 0 8px #FF8A0033` }}>
          {/* Billetes translúcidos de fondo */}
          <svg viewBox="0 0 100 60" style={{ position: "absolute", right: -10, bottom: -8, width: 92, height: 56, opacity: 0.14 }}>
            <rect x="10" y="18" width="52" height="30" rx="3" fill="none" stroke="#FF8A00" strokeWidth="2" transform="rotate(-8 36 33)" />
            <circle cx="36" cy="33" r="9" fill="none" stroke="#FF8A00" strokeWidth="1.5" transform="rotate(-8 36 33)" />
            <rect x="28" y="6" width="52" height="30" rx="3" fill="none" stroke="#FF8A00" strokeWidth="2" transform="rotate(6 54 21)" />
            <circle cx="54" cy="21" r="9" fill="none" stroke="#FF8A00" strokeWidth="1.5" transform="rotate(6 54 21)" />
          </svg>
          <div className="relative z-10">
            <div className="flex items-center gap-2">
              <div className="relative flex-shrink-0" style={{ width: 24, height: 19 }}>
                <div style={{ position: "absolute", left: 0, bottom: 0, width: 17, height: 10, borderRadius: "50%", background: "linear-gradient(180deg, #FFC83D, #E67300)", border: "1.5px solid #FFE0A0" }} />
                <div style={{ position: "absolute", left: 5, bottom: 3, width: 17, height: 10, borderRadius: "50%", background: "linear-gradient(180deg, #FFDD66, #FF8A00)", border: "1.5px solid #FFECC0" }} />
              </div>
              <div>
                <div className="fl-mono text-[8px] font-bold tracking-wide" style={{ color: C.white }}>DINERO DISPONIBLE</div>
                <div className="fl-mono text-base font-bold mt-0.5" style={{ color: "#FF8A00" }}>{fmtCredits(budgetAvailable)}</div>
              </div>
            </div>
          </div>
        </div>
        <button onClick={() => setShowValorChart(true)} className="fl-tap relative overflow-hidden rounded-2xl px-3 py-2 text-left" style={{ background: C.navy800, border: `2px solid ${C.principal}`, boxShadow: `0 0 8px ${C.principal}33` }}>
          {/* Diagrama de barras translúcido de fondo, en el mismo color que el borde */}
          <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{ position: "absolute", right: 0, bottom: 0, width: "70%", height: "80%", opacity: 0.16 }}>
            <rect x="4" y="34" width="10" height="26" fill={C.principal} />
            <rect x="20" y="24" width="10" height="36" fill={C.principal} />
            <rect x="36" y="30" width="10" height="30" fill={C.principal} />
            <rect x="52" y="14" width="10" height="46" fill={C.principal} />
            <rect x="68" y="20" width="10" height="40" fill={C.principal} />
            <rect x="84" y="4" width="10" height="56" fill={C.principal} />
          </svg>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-0.5">
              <div className="rounded-full flex items-center justify-center" style={{ width: 20, height: 20, background: `${C.principal}22` }}>
                <TrendingUp size={11} color={C.principal} />
              </div>
              <ChevronRight size={14} color={C.muted} />
            </div>
            <div className="fl-mono text-[8px] font-bold tracking-wide" style={{ color: C.muted }}>VALOR DE PLANTILLA</div>
            <div className="fl-mono text-base font-bold mt-0.5" style={{ color: C.white }}>{fmtCredits(valorHoy)}</div>
            {cambioValor !== 0 && (
              <div className="flex items-center gap-1 mt-0.5">
                {cambioValor > 0 ? <TrendingUp size={10} color={C.positive} /> : <TrendingDown size={10} color={C.negative} />}
                <span className="fl-mono text-[9px] font-semibold" style={{ color: cambioValor > 0 ? C.positive : C.negative }}>
                  {cambioValor > 0 ? "+" : ""}{fmtCredits(cambioValor)} ({cambioValor > 0 ? "+" : ""}{cambioPct.toFixed(1)}%)
                </span>
              </div>
            )}
          </div>
        </button>
      </div>
      )}

      {isPlayoffMode ? (
        (playoffTops.jugadoras.length > 0 || playoffTops.entrenadores.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Trophy size={14} color={C.gold} />
              <span className="fl-display text-sm uppercase" style={{ color: C.white }}>Top {showAllMovers ? 5 : 3} puntos — ronda actual</span>
            </div>
            <button onClick={() => setShowAllMovers(v => !v)} className="fl-tap fl-mono text-[10px] flex items-center gap-0.5" style={{ color: C.muted }}>
              {showAllMovers ? "Ver menos" : "Ver top 5"} <ChevronRight size={11} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="fl-row p-3">
              <div className="flex items-center gap-1 mb-2"><Users size={12} color={C.baby} /><span className="fl-mono text-[10px] font-semibold" style={{ color: C.baby }}>JUGADORAS</span></div>
              <div>
                {playoffTops.jugadoras.slice(0, showAllMovers ? 5 : 3).map(({ player, pts }, i) => (
                  <button key={player.id} onClick={() => setDetailPlayer(player)} className="fl-tap w-full flex items-center gap-2 py-2 text-left" style={{ borderTop: i > 0 ? `1px solid ${C.lineSoft}` : "none" }}>
                    <div style={{ borderRadius: 999, border: `1.5px solid ${C.baby}` }}><PlayerPhoto url={player.photo} size={30} rounded={999} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="fl-body text-[11px] font-medium truncate" style={{ color: C.white }}>{player.name}</div>
                      <div className="fl-mono text-[9px] truncate" style={{ color: C.muted }}>{POSITIONS.find(p => p.key === player.position)?.label} · {player.team}</div>
                    </div>
                    <div className="fl-mono text-[11px] font-bold flex-shrink-0" style={{ color: C.gold }}>{pts}</div>
                  </button>
                ))}
                {playoffTops.jugadoras.length === 0 && <div className="fl-mono text-[10px]" style={{ color: C.muted }}>Sin datos todavía</div>}
              </div>
            </div>
            <div className="fl-row p-3">
              <div className="flex items-center gap-1 mb-2"><ShieldCheck size={12} color={C.principal} /><span className="fl-mono text-[10px] font-semibold" style={{ color: C.principal }}>ENTRENADORAS/ES</span></div>
              <div>
                {playoffTops.entrenadores.slice(0, showAllMovers ? 5 : 3).map(({ player, pts }, i) => (
                  <button key={player.id} onClick={() => setDetailPlayer(player)} className="fl-tap w-full flex items-center gap-2 py-2 text-left" style={{ borderTop: i > 0 ? `1px solid ${C.lineSoft}` : "none" }}>
                    <div style={{ borderRadius: 999, border: `1.5px solid ${C.principal}` }}><PlayerPhoto url={player.photo} size={30} rounded={999} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="fl-body text-[11px] font-medium truncate" style={{ color: C.white }}>{player.name}</div>
                      <div className="fl-mono text-[9px] truncate" style={{ color: C.muted }}>{player.team}</div>
                    </div>
                    <div className="fl-mono text-[11px] font-bold flex-shrink-0" style={{ color: C.gold }}>{pts}</div>
                  </button>
                ))}
                {playoffTops.entrenadores.length === 0 && <div className="fl-mono text-[10px]" style={{ color: C.muted }}>Sin datos todavía</div>}
              </div>
            </div>
          </div>
        </div>
        )
      ) : (movers.gainers.length > 0 || movers.losers.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <TrendingUp size={14} color={C.principal} />
              <span className="fl-display text-sm uppercase" style={{ color: C.white }}>Top {showAllMovers ? 10 : 3} subidas / bajadas</span>
            </div>
            <button onClick={() => setShowAllMovers(v => !v)} className="fl-tap fl-mono text-[10px] flex items-center gap-0.5" style={{ color: C.muted }}>
              {showAllMovers ? "Ver menos" : "Ver todas"} <ChevronRight size={11} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="fl-row p-3">
              <div className="flex items-center gap-1 mb-2"><TrendingUp size={12} color={C.positive} /><span className="fl-mono text-[10px] font-semibold" style={{ color: C.positive }}>MÁS HAN SUBIDO</span></div>
              <div>
                {movers.gainers.slice(0, showAllMovers ? 10 : 3).map(({ player, delta, pct }, i) => (
                  <button key={player.id} onClick={() => setDetailPlayer(player)} className="fl-tap w-full flex items-center gap-2 py-2 text-left" style={{ borderTop: i > 0 ? `1px solid ${C.lineSoft}` : "none" }}>
                    <div style={{ borderRadius: 999, border: `1.5px solid ${C.positive}` }}><PlayerPhoto url={player.photo} size={30} rounded={999} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="fl-body text-[11px] font-medium truncate" style={{ color: C.white }}>{player.name}</div>
                      <div className="fl-mono text-[9px] truncate" style={{ color: C.muted }}>{POSITIONS.find(p => p.key === player.position)?.label} · {player.team}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="fl-mono text-[10px] font-bold" style={{ color: C.positive }}>+{fmtCredits(delta)}</div>
                      <div className="fl-mono text-[9px]" style={{ color: C.positive }}>(+{pct.toFixed(1)}%)</div>
                    </div>
                  </button>
                ))}
                {movers.gainers.length === 0 && <div className="fl-mono text-[10px]" style={{ color: C.muted }}>Sin movimiento hoy</div>}
              </div>
            </div>
            <div className="fl-row p-3">
              <div className="flex items-center gap-1 mb-2"><TrendingDown size={12} color={C.negative} /><span className="fl-mono text-[10px] font-semibold" style={{ color: C.negative }}>MÁS HAN BAJADO</span></div>
              <div>
                {movers.losers.slice(0, showAllMovers ? 10 : 3).map(({ player, delta, pct }, i) => (
                  <button key={player.id} onClick={() => setDetailPlayer(player)} className="fl-tap w-full flex items-center gap-2 py-2 text-left" style={{ borderTop: i > 0 ? `1px solid ${C.lineSoft}` : "none" }}>
                    <div style={{ borderRadius: 999, border: `1.5px solid ${C.negative}` }}><PlayerPhoto url={player.photo} size={30} rounded={999} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="fl-body text-[11px] font-medium truncate" style={{ color: C.white }}>{player.name}</div>
                      <div className="fl-mono text-[9px] truncate" style={{ color: C.muted }}>{POSITIONS.find(p => p.key === player.position)?.label} · {player.team}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="fl-mono text-[10px] font-bold" style={{ color: C.negative }}>{fmtCredits(delta)}</div>
                      <div className="fl-mono text-[9px]" style={{ color: C.negative }}>({pct.toFixed(1)}%)</div>
                    </div>
                  </button>
                ))}
                {movers.losers.length === 0 && <div className="fl-mono text-[10px]" style={{ color: C.muted }}>Sin movimiento hoy</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <SectionTitle>Jornada {currentJornadaNumber}</SectionTitle>
        {jornadas.length === 0 && (
          <EmptyState title="Temporada por empezar" text="Cuando se registre la primera jornada verás aquí tu puntuación." />
        )}
      </div>

      {!isPlayoffMode && lastJornada && partidos.length > 0 && (
        <button onClick={() => setShowTriple(true)} className="fl-tap w-full relative overflow-hidden rounded-2xl p-4 flex items-center gap-3"
          style={{
            background: `linear-gradient(120deg, #2A0E1E 0%, #4A1224 55%, #5C2A0E 100%)`,
            border: `1.5px solid transparent`,
            backgroundImage: `linear-gradient(#2A0E1E, #4A1224), linear-gradient(120deg, ${C.principal}, ${C.gold}, ${C.baby})`,
            backgroundOrigin: "border-box", backgroundClip: "padding-box, border-box",
            boxShadow: `0 0 22px ${C.principal}40, 0 0 34px ${C.baby}30`,
          }}>
          <span style={{ position: "absolute", right: -18, top: "50%", transform: "translateY(-50%) rotate(12deg)", fontSize: 92, opacity: 0.16, lineHeight: 1 }}>🏀</span>
          <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: 42, height: 42, background: "rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>🏀</span>
          </div>
          <div className="text-left flex-1 relative z-10">
            <div className="fl-display text-base uppercase" style={{ color: C.white }}>Triple Fantasy</div>
            <div className="fl-mono text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.75)" }}>
              {myTripleEntry ? (myTripleEntry.settled ? `Premio: ${fmtCredits(myTripleEntry.prize || 0)}` : "Ya has participado") : (
                <>Entrada <span style={{ color: C.principal, fontWeight: 700 }}>{fmtCredits(TRIPLE_ENTRY_FEE)}</span> · hasta {fmtCredits(TRIPLE_PRIZE_PERFECT_MVP)}</>
              )}
            </div>
          </div>
          <ChevronRight size={18} color="rgba(255,255,255,0.6)" className="relative z-10" />
        </button>
      )}

      {partidos.length > 0 && (
        <div>
          <SectionTitle>Partidos de la jornada</SectionTitle>
          <div className="fl-row divide-y" style={{ borderColor: C.lineSoft }}>
            {partidos.map(m => (
              <PartidoRow key={m.id} m={m} teamCrests={teamCrests} jornada={lastJornada} players={players} />
            ))}
          </div>
        </div>
      )}

      {jornadas.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={() => setShowCalendar(true)}
            className="fl-tap w-full rounded-md py-2.5 text-sm font-semibold" style={{ background: C.baby, color: C.ink }}>
            Todos los partidos
          </button>
          <button onClick={() => setShowClasificacion(true)}
            className="fl-tap w-full rounded-md py-2.5 text-sm font-semibold" style={{ border: `1px solid ${C.baby}`, color: C.baby }}>
            Clasificación
          </button>
        </div>
      )}

      {showCalendar && (
        <CalendarioModal jornadas={jornadas} teamCrests={teamCrests} players={players}
          initialIndex={Math.max(jornadas.length - 1, 0)} onClose={() => setShowCalendar(false)} />
      )}

      {showTriple && lastJornada && (
        <TripleFantasyScreen jornada={lastJornada} jornadaNumber={currentJornadaNumber} players={players} jornadas={jornadas}
          myEntry={myTripleEntry} budgetAvailable={budgetAvailable} teamCrests={teamCrests} profile={profile} allEntries={tripleEntries}
          onJoin={onJoinTriple} onClose={() => setShowTriple(false)} />
      )}

      {showValorChart && (
        <ValorPlantillaChartModal myTeam={myTeam} players={players} onClose={() => setShowValorChart(false)} />
      )}

      {detailPlayer && (
        <PlayerDetailScreen player={detailPlayer} entry={(myTeam.squad || []).find(e => e.id === detailPlayer.id)}
          jornadas={jornadas} isFavorite={(favoritos || []).includes(detailPlayer.id)} onToggleFavorite={() => onToggleFavorite(detailPlayer.id)}
          isOwned={teamService.squadIds(myTeam).includes(detailPlayer.id)}
          onSellImmediate={onSellImmediate} onToggleForSale={onToggleForSale} onAcceptSaleOffer={onAcceptSaleOffer} onRaiseClause={onRaiseClause}
          teams={teams} me={profile.name} budgetAvailable={budgetAvailable} onBuyClause={onBuyClause} onSendOffer={onSendOffer}
          onClose={() => setDetailPlayer(null)} />
      )}

      {showClasificacion && (
        <ClasificacionRealScreen jornadas={jornadas} teamCrests={teamCrests} onClose={() => setShowClasificacion(false)} />
      )}

      {showPlayoffIntro && (
        <PlayoffIntroScreen
          qualified={!!playoffState?.qualifiers?.includes(profile.name)}
          onClose={() => setShowPlayoffIntro(false)}
        />
      )}
    </div>
  );
}

// Animación + hoja explicativa que se ve una única vez, el primer día que se
// detectan playoffs activos en este dispositivo.
function PlayoffIntroScreen({ qualified, onClose }) {
  const [phase, setPhase] = useState("anim"); // "anim" -> "sheet"
  useEffect(() => {
    const t = setTimeout(() => setPhase("sheet"), 1800);
    return () => clearTimeout(t);
  }, []);

  if (phase === "anim") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: `radial-gradient(circle at 50% 40%, ${C.principal} 0%, #1a0510 70%)` }}>
        <div style={{ fontSize: 90, animation: "fl-playoff-pop 0.9s ease-out" }}>🏆</div>
        <div className="fl-display text-2xl uppercase mt-3 text-center px-6" style={{ color: C.white, animation: "fl-playoff-fadein 1.2s ease-out" }}>
          ¡Empiezan los Playoffs!
        </div>
        <style>{`
          @keyframes fl-playoff-pop { 0% { transform: scale(0.2); opacity: 0; } 60% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); } }
          @keyframes fl-playoff-fadein { 0% { opacity: 0; transform: translateY(10px); } 40% { opacity: 0; } 100% { opacity: 1; transform: translateY(0); } }
        `}</style>
      </div>
    );
  }

  // Segunda pantalla: si te has clasificado, cómo funciona la fase; si no,
  // un mensaje de despedida de temporada con la misma estética del juego.
  if (!qualified) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <span style={{ fontSize: 56 }}>👋</span>
          <div className="fl-display text-xl uppercase mt-4 mb-2" style={{ color: C.white }}>Se acaba tu temporada aquí</div>
          <div className="fl-body text-sm mb-1" style={{ color: C.muted, maxWidth: 280 }}>
            Sorry, no ha sido posible clasificar — tu equipo ha llegado hasta aquí.
          </div>
          <div className="fl-body text-sm" style={{ color: C.muted, maxWidth: 280 }}>
            El año que viene seguro que vas a más. 💪
          </div>
        </div>
        <div className="p-4">
          <button onClick={onClose} className="fl-tap w-full rounded-md py-3 text-sm font-semibold" style={{ background: C.gold, color: C.ink }}>
            Entendido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex-1 overflow-y-auto fl-scrollbar p-5" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)" }}>
        <div className="text-center mb-5"><span style={{ fontSize: 56 }}>🏆</span></div>
        <div className="fl-display text-xl uppercase text-center mb-1" style={{ color: C.white }}>¡Te has clasificado!</div>
        <div className="fl-body text-sm text-center mb-6" style={{ color: C.muted }}>Ahora empiezan los playoffs — así funcionan:</div>
        <div className="space-y-4">
          {[
            ["🎯", "8 clasificados", "Los mejores de la liga regular compiten por el título. El resto pasa a ser espectador."],
            ["🃏", "Draft nuevo, cero dinero", "Se olvida el mercado: cada ronda eliges una lista de preferencias, y cada día se reparten jugadoras de los equipos reales que sigan vivos — gratis, sin presupuesto."],
            ["✂️", "Cuartos → Semis → Final", "Cuartos se juega a doble jornada y pasan los 4 mejores. Semis a una jornada, pasan 2. La final, a una jornada, decide a la campeona/ón."],
            ["🚫", "Sin mercado ni ofertas", "Durante toda la fase, nada de subastas, cláusulas ni ofertas entre usuarios — el equipo que sale del draft es el que hay."],
          ].map(([emoji, title, text], i) => (
            <div key={i} className="fl-row p-3.5 flex items-start gap-3">
              <span style={{ fontSize: 24 }}>{emoji}</span>
              <div>
                <div className="fl-body text-sm font-semibold mb-0.5" style={{ color: C.white }}>{title}</div>
                <div className="fl-body text-xs" style={{ color: C.muted }}>{text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="p-4">
        <button onClick={onClose} className="fl-tap w-full rounded-md py-3 text-sm font-semibold" style={{ background: C.gold, color: C.ink }}>
          ¡Vamos allá!
        </button>
      </div>
    </div>
  );
}

// Clasificación de los equipos REALES de la competición (no de fantasy):
// victorias, derrotas, y +/- (diferencia total de puntos anotados/recibidos).
// Desempate: 1º más victorias, 2º enfrentamiento directo, 3º diferencia global.
// Dos pestañas: GENERAL (liga regular, con los 8 primeros marcados como
// puesto de playoffs) y PLAYOFFS (cuadro de cuartos a doble partido,
// semifinales y final a partido único, que se arma solo a partir de la
// clasificación y de las jornadas "Playoff …" que haya en Supabase).
function ClasificacionRealScreen({ jornadas, teamCrests, onClose }) {
  const [subtab, setSubtab] = useState("general"); // "general" | "playoffs"
  const regularJornadas = useMemo(() => (jornadas || []).filter((j) => jornadaFase(j) === "regular"), [jornadas]);
  const rows = useMemo(() => realStandingsService.compute(regularJornadas), [regularJornadas]);
  const bracket = useMemo(() => realBracketService.buildBracket(jornadas), [jornadas]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex items-center px-4 pb-3" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}>
        <button onClick={onClose} className="fl-tap p-1 -ml-1"><ChevronLeft size={22} color={C.white} /></button>
        <div className="flex-1 text-center fl-display text-sm uppercase pr-6" style={{ color: C.white }}>Clasificación</div>
      </div>

      {/* Segmented control GENERAL / PLAYOFFS, mismo lenguaje visual que el resto de la app */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center rounded-2xl p-1" style={{ background: C.navy800, border: `1px solid ${C.line}` }}>
          <button onClick={() => setSubtab("general")} className="fl-tap flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition-all"
            style={subtab === "general"
              ? { background: `linear-gradient(135deg, ${C.principal}, ${C.baby})`, boxShadow: `0 4px 14px ${C.principalSoft}` }
              : { background: "transparent" }}>
            <Trophy size={14} color={subtab === "general" ? C.white : C.muted} />
            <span className="fl-display text-[11px] uppercase tracking-wide" style={{ color: subtab === "general" ? C.white : C.muted }}>General</span>
          </button>
          <div style={{ width: 1, height: 18, background: C.line }} />
          <button onClick={() => setSubtab("playoffs")} className="fl-tap flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition-all"
            style={subtab === "playoffs"
              ? { background: `linear-gradient(135deg, ${C.principal}, ${C.baby})`, boxShadow: `0 4px 14px ${C.principalSoft}` }
              : { background: "transparent" }}>
            <Crown size={14} color={subtab === "playoffs" ? C.white : C.muted} />
            <span className="fl-display text-[11px] uppercase tracking-wide" style={{ color: subtab === "playoffs" ? C.white : C.muted }}>Playoffs</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto fl-scrollbar">
        {subtab === "general" ? (
          <ClasificacionGeneralTable rows={rows} teamCrests={teamCrests} />
        ) : (
          <PlayoffsBracketView bracket={bracket} teamCrests={teamCrests} />
        )}
      </div>
    </div>
  );
}

// Tabla GENERAL: igual estructura de siempre (#, equipo, PJ, V, D, +/-, PTS)
// más el raíl de playoffs a la izquierda de los 8 primeros puestos, con
// insignias en degradado (principal→baby) para esos 8 y planas para el resto.
// Los PTS van en texto normal (sin insignia), tal y como se pidió.
function ClasificacionGeneralTable({ rows, teamCrests }) {
  if (rows.length === 0) {
    return <div className="p-4"><EmptyState title="Sin resultados todavía" text="En cuanto se carguen marcadores de partidos, aquí verás la clasificación real de la competición." /></div>;
  }
  const playoffRows = rows.filter((r) => r.rank <= 8);
  const restRows = rows.filter((r) => r.rank > 8);
  return (
    <div>
      <div className="flex items-center px-3 py-2 fl-mono text-[10px]" style={{ color: C.muted, borderBottom: `1px solid ${C.lineSoft}` }}>
        <span style={{ width: 24 }} />
        <span style={{ width: 24 }}>#</span>
        <span className="flex-1">Equipo</span>
        <span style={{ width: 28 }} className="text-center">PJ</span>
        <span style={{ width: 24 }} className="text-center">V</span>
        <span style={{ width: 24 }} className="text-center">D</span>
        <span style={{ width: 40 }} className="text-right">+/-</span>
      </div>

      {/* Bloque de los 8 puestos de playoffs, con el raíl decorativo a la izquierda */}
      <div className="relative">
        <div className="absolute top-0 bottom-0 flex flex-col items-center" style={{ left: 8, width: 24 }}>
          <Crown size={12} color={C.principal} style={{ flexShrink: 0, marginTop: 6 }} />
          <div className="flex-1 my-1" style={{ width: 2, borderRadius: 2, background: `linear-gradient(${C.principal}, ${C.baby})` }} />
          <span className="fl-display text-[9px] tracking-widest" style={{
            color: C.principal, writingMode: "vertical-rl", transform: "rotate(180deg)", flexShrink: 0, marginBottom: 6,
          }}>PLAYOFFS</span>
        </div>
        {playoffRows.map((r) => <ClasificacionRow key={r.team} r={r} teamCrests={teamCrests} inPlayoffs />)}
      </div>

      {restRows.map((r) => <ClasificacionRow key={r.team} r={r} teamCrests={teamCrests} />)}
    </div>
  );
}

function ClasificacionRow({ r, teamCrests, inPlayoffs }) {
  return (
    <div className="flex items-center pr-3 py-2.5" style={{ paddingLeft: inPlayoffs ? 40 : 12, borderBottom: `1px solid ${C.lineSoft}` }}>
      <span className="flex items-center justify-center fl-mono text-[11px] font-bold flex-shrink-0" style={{
        width: 24, height: 24, borderRadius: 8, marginRight: 10,
        background: inPlayoffs ? `linear-gradient(135deg, ${C.principal}, ${C.baby})` : C.navy700,
        color: inPlayoffs ? C.white : C.muted,
        boxShadow: inPlayoffs ? `0 2px 8px ${C.principalSoft}` : "none",
      }}>{r.rank}</span>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <TeamCrest name={r.team} photo={teamCrests?.[r.team]} size={24} />
        <span className="fl-body text-xs font-medium truncate" style={{ color: C.white }}>{r.team}</span>
      </div>
      <span className="fl-mono text-[11px]" style={{ width: 28, color: C.muted }}>{r.played}</span>
      <span className="fl-mono text-[11px] font-semibold text-center" style={{ width: 24, color: C.positive }}>{r.wins}</span>
      <span className="fl-mono text-[11px] font-semibold text-center" style={{ width: 24, color: C.negative }}>{r.losses}</span>
      <span className="fl-mono text-[11px] font-bold text-right" style={{ width: 40, color: r.diff > 0 ? C.positive : r.diff < 0 ? C.negative : C.muted }}>
        {r.diff > 0 ? "+" : ""}{r.diff}
      </span>
    </div>
  );
}

// Cuadro de PLAYOFFS: cuartos a doble partido (ida + vuelta, agregado decide)
// y semifinales/final a partido único. Se arma solo con la clasificación
// (1-8, 2-7, 3-6, 4-5) y busca los resultados reales en las jornadas
// "Playoff Cuartos Ida/Vuelta", "Playoff Semifinal" y "Playoff Final" si ya
// existen; si no, deja el cruce "por jugar".
function PlayoffsBracketView({ bracket, teamCrests }) {
  if (!bracket.ready) {
    return <div className="p-4"><EmptyState title="Cuadro todavía no disponible" text="En cuanto haya al menos 8 equipos con partidos jugados en liga regular, aquí se verá el cuadro de playoffs." /></div>;
  }
  return (
    <div className="px-3 py-4 space-y-6">
      <PlayoffSection title="Cuartos de final" subtitle="Ida y vuelta · gana el agregado">
        {bracket.cuartos.map((m, i) => <SeriesCard key={i} m={m} teamCrests={teamCrests} />)}
      </PlayoffSection>
      <PlayoffSection title="Semifinales" subtitle="Partido único">
        {bracket.semis.map((m, i) => <SingleMatchCard key={i} m={m} teamCrests={teamCrests} />)}
      </PlayoffSection>
      <PlayoffSection title="Final" subtitle="Partido único">
        <SingleMatchCard m={bracket.final} teamCrests={teamCrests} isFinal />
      </PlayoffSection>
    </div>
  );
}

function PlayoffSection({ title, subtitle, children }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2 px-1">
        <span className="fl-display text-xs uppercase tracking-wide" style={{ color: C.white }}>{title}</span>
        <span className="fl-mono text-[10px]" style={{ color: C.muted }}>{subtitle}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SeriesCard({ m, teamCrests }) {
  const decided = !!m.winner;
  return (
    <div className="rounded-2xl p-3" style={{ background: C.navy800, border: `1px solid ${decided ? C.principal + "55" : C.line}` }}>
      <SeriesTeamRow team={m.teamA} seed={m.seedA} leg1={m.leg1?.played ? m.leg1.aScore : null} leg2={m.leg2?.played ? m.leg2.aScore : null}
        agg={m.aggA} isWinner={m.winner === m.teamA} teamCrests={teamCrests} />
      <div className="my-1" style={{ height: 1, background: C.lineSoft }} />
      <SeriesTeamRow team={m.teamB} seed={m.seedB} leg1={m.leg1?.played ? m.leg1.bScore : null} leg2={m.leg2?.played ? m.leg2.bScore : null}
        agg={m.aggB} isWinner={m.winner === m.teamB} teamCrests={teamCrests} />
      <div className="flex justify-end gap-4 mt-2 pt-2 fl-mono text-[9px] uppercase tracking-wide" style={{ borderTop: `1px solid ${C.lineSoft}`, color: C.muted }}>
        <span style={{ width: 34 }} className="text-center">Ida</span>
        <span style={{ width: 34 }} className="text-center">Vta</span>
        <span style={{ width: 34 }} className="text-center">Agg</span>
      </div>
    </div>
  );
}

function SeriesTeamRow({ team, seed, leg1, leg2, agg, isWinner, teamCrests }) {
  return (
    <div className="flex items-center gap-2">
      <span className="fl-mono text-[10px] font-bold flex items-center justify-center flex-shrink-0" style={{ width: 18, height: 18, borderRadius: 6, background: C.navy700, color: C.muted }}>{seed}</span>
      <TeamCrest name={team} photo={teamCrests?.[team]} size={22} />
      <span className="fl-body text-xs truncate flex-1" style={{ color: isWinner ? C.white : "rgba(255,255,255,0.55)", fontWeight: isWinner ? 700 : 500 }}>{team}</span>
      <span className="fl-mono text-xs text-center" style={{ width: 34, color: C.muted }}>{leg1 ?? "–"}</span>
      <span className="fl-mono text-xs text-center" style={{ width: 34, color: C.muted }}>{leg2 ?? "–"}</span>
      <span className="fl-mono text-sm font-bold text-center" style={{ width: 34, color: isWinner ? C.positive : C.muted }}>{agg ?? "–"}</span>
      {isWinner && <CircleCheck size={13} color={C.positive} style={{ flexShrink: 0 }} />}
    </div>
  );
}

function SingleMatchCard({ m, teamCrests, isFinal }) {
  const decided = !!m.winner;
  return (
    <div className="rounded-2xl p-3" style={{
      background: isFinal ? `linear-gradient(160deg, ${C.principalSoft}, ${C.navy800})` : C.navy800,
      border: `1px solid ${decided ? C.principal + "55" : C.line}`,
    }}>
      {isFinal && decided && (
        <div className="flex items-center gap-1.5 mb-2">
          <Trophy size={13} color={C.gold} />
          <span className="fl-display text-[10px] uppercase tracking-wide" style={{ color: C.gold }}>Campeón</span>
        </div>
      )}
      <SingleTeamRow team={m.teamA} score={m.played ? m.aScore : null} isWinner={m.winner === m.teamA} pending={!m.teamA} teamCrests={teamCrests} />
      <div className="my-1" style={{ height: 1, background: C.lineSoft }} />
      <SingleTeamRow team={m.teamB} score={m.played ? m.bScore : null} isWinner={m.winner === m.teamB} pending={!m.teamB} teamCrests={teamCrests} />
    </div>
  );
}

function SingleTeamRow({ team, score, isWinner, pending, teamCrests }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <TeamCrest name={team || "?"} photo={team ? teamCrests?.[team] : null} size={22} />
      <span className="fl-body text-xs truncate flex-1" style={{
        color: pending ? C.muted : (isWinner ? C.white : "rgba(255,255,255,0.55)"),
        fontWeight: isWinner ? 700 : 500,
        fontStyle: pending ? "italic" : "normal",
      }}>{team || "Por determinar"}</span>
      {score != null && <span className="fl-mono text-sm font-bold" style={{ color: isWinner ? C.positive : C.muted }}>{score}</span>}
      {isWinner && <CircleCheck size={14} color={C.positive} style={{ flexShrink: 0 }} />}
    </div>
  );
}

// Gráfico de la evolución del valor total de la plantilla, día a día, sumando
// el valor histórico de cada jugadora que tienes en cada fecha (se apoya en
// el price_history de cada una, que ya guarda el motor de precios diario).
function ValorPlantillaChartModal({ myTeam, players, onClose }) {
  const squadPlayers = (myTeam.squad || []).map(e => players.find(p => p.id === e.id)).filter(Boolean);
  const points = useMemo(() => {
    const allDates = new Set();
    squadPlayers.forEach(p => (p.priceHistory || []).forEach(h => h?.date && allDates.add(h.date)));
    let dates = [...allDates].sort();
    // Si hay poco (o ningún) histórico real todavía, se arma un mínimo de 2
    // puntos con "ayer" (prevBasePrice) y "hoy" (basePrice), para que el
    // gráfico pueda dibujar algo en vez de quedarse vacío sin necesidad.
    if (dates.length < 2) {
      const today = toDateStr(getEffectiveToday());
      const totalPrev = squadPlayers.reduce((s, p) => s + (p.prevBasePrice ?? p.basePrice ?? 0), 0);
      const totalNow = squadPlayers.reduce((s, p) => s + (p.basePrice || 0), 0);
      if (totalPrev !== totalNow) return [{ date: "Antes", value: totalPrev }, { date: today, value: totalNow }];
      if (totalNow > 0) return [{ date: today, value: totalNow }];
      return [];
    }
    return dates.map(date => {
      const total = squadPlayers.reduce((s, p) => {
        const hist = (p.priceHistory || []).filter(h => h.date <= date);
        const value = hist.length > 0 ? hist[hist.length - 1].value : p.basePrice;
        return s + (value || 0);
      }, 0);
      return { date, value: total };
    });
  }, [squadPlayers]);

  const values = points.map(p => p.value);
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const w = 300, h = 120;
  const pathD = points.length > 0 ? points.map((p, i) => {
    const x = points.length > 1 ? (i / (points.length - 1)) * w : w / 2;
    const y = h - ((p.value - min) / range) * h;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") : "";

  return (
    <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex items-center px-4 pb-3" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}>
        <button onClick={onClose} className="fl-tap p-1 -ml-1"><ChevronLeft size={22} color={C.white} /></button>
        <div className="flex-1 text-center fl-display text-sm uppercase pr-6" style={{ color: C.white }}>Valor de plantilla</div>
      </div>
      <div className="flex-1 overflow-y-auto fl-scrollbar px-4 py-4">
        {points.length === 0 ? (
          <EmptyState compact title="Todavía no hay histórico suficiente" text="En cuanto pasen unos días con el mercado en marcha, verás aquí la evolución de tu plantilla." />
        ) : (
          <>
            <div className="fl-mono text-2xl font-bold mb-1" style={{ color: C.white }}>{fmtCredits(values[values.length - 1])}</div>
            <div className="fl-row p-4">
              <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
                <path d={pathD} fill="none" stroke={C.principal} strokeWidth={2} />
              </svg>
              <div className="flex items-center justify-between mt-2">
                <span className="fl-mono text-[9px]" style={{ color: C.muted }}>{points[0]?.date}</span>
                <span className="fl-mono text-[9px]" style={{ color: C.muted }}>{points[points.length - 1]?.date}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* =============================================================================
   CLASIFICACIÓN
   ========================================================================== */
function ClasificacionTab({ teams, players, jornadas, me, leagueId, teamCrests, budgetAvailable, onBuyClause, onSendOffer, onGoTo, playoffState }) {
  const [filterJornadaId, setFilterJornadaId] = useState(null); // null = "Total"
  const [open, setOpen] = useState(false);
  const [viewingTeam, setViewingTeam] = useState(null); // nombre del usuario que se está mirando
  const isPlayoffMode = playoffState && playoffState.phase !== "none";
  const jornadasIniciadas = startedJornadas(playoffService.regularJornadas(jornadas));
  const rows = useMemo(() => rankingService.computeStandings(teams, players, jornadasIniciadas, leagueId, filterJornadaId), [teams, players, jornadasIniciadas, leagueId, filterJornadaId]);
  const options = [{ id: null, label: "Total" }, ...[...jornadasIniciadas].reverse().map(j => ({ id: j.id, label: j.name }))];
  const currentLabel = options.find(o => o.id === filterJornadaId)?.label || "Total";

  // Filas de la clasificación de PLAYOFFS: activos en la ronda actual (con
  // puntos en vivo) + eliminados de rondas anteriores (transparentes, con el
  // puesto congelado en el momento en que quedaron fuera).
  const playoffRows = useMemo(() => {
    if (!isPlayoffMode) return [];
    const pastRounds = ["CUARTOS", "SEMIS", "FINAL"].filter((r) => playoffState.pointsByRound[r]);
    const activeSet = new Set(playoffState.qualifiers);
    const seen = new Set();
    const out = [];
    // Activos: ordenados por puntos en vivo de la ronda actual.
    playoffState.qualifiers.forEach((u) => {
      const liveLineup = (playoffState.lineups[playoffState.round] || {})[u] || null;
      const pts = playoffService.computeRoundPoints(jornadas, playoffState.round, playoffState.lockedLineups, u, players, liveLineup);
      out.push({ name: u, pts, active: true });
      seen.add(u);
    });
    out.sort((a, b) => b.pts - a.pts);
    out.forEach((r, i) => { r.rank = i + 1; });
    // Eliminados: por cada ronda ya cerrada, quien jugó ahí y no siga activo.
    pastRounds.forEach((round) => {
      const pointsByUser = playoffState.pointsByRound[round];
      const roundRows = Object.entries(pointsByUser).sort((a, b) => b[1] - a[1]);
      roundRows.forEach(([u, pts], i) => {
        if (seen.has(u) || activeSet.has(u)) return;
        out.push({ name: u, pts, active: false, rank: i + 1, eliminatedIn: round });
        seen.add(u);
      });
    });
    return out;
  }, [isPlayoffMode, playoffState, jornadas, players]);

  if (isPlayoffMode) {
    const roundLabel = { CUARTOS: "Cuartos", SEMIS: "Semis", FINAL: "Final" }[playoffState.round] || "";
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <Trophy size={14} color={C.gold} />
          <span className="fl-display text-sm uppercase" style={{ color: C.white }}>Playoffs — {roundLabel}</span>
        </div>
        {playoffState.phase === "finished" && playoffState.champion && (
          <div className="fl-row p-4 mb-3 text-center" style={{ border: `1.5px solid ${C.gold}`, boxShadow: `0 0 20px ${C.gold}44` }}>
            <div style={{ fontSize: 32 }}>🏆</div>
            <div className="fl-display text-base uppercase mt-1" style={{ color: C.gold }}>{playoffState.champion}</div>
            <div className="fl-mono text-[10px]" style={{ color: C.muted }}>Campeona/ón de los Playoffs</div>
          </div>
        )}
        {playoffRows.length === 0 ? <EmptyState title="Generando el cuadro..." text="En cuanto se confirme la clasificación de liga regular, aparecerán aquí los clasificados." /> : (
          <div className="space-y-1.5">
            {playoffRows.map((r) => (
              <div key={r.name} className="fl-row flex items-center justify-between px-3 py-2.5" style={{
                opacity: r.active ? 1 : 0.35,
                outline: r.name === me && r.active ? `2px solid ${C.principal}` : "none",
                boxShadow: r.name === me && r.active ? `0 0 18px ${C.principal}44` : "none",
              }}>
                <div className="flex items-center gap-2.5">
                  <span className="fl-mono text-xs w-5 text-center" style={{ color: C.muted }}>{r.rank}</span>
                  <div>
                    <div className="text-sm font-medium" style={{ color: C.white }}>{r.name}{r.name === me ? " (tú)" : ""}</div>
                    <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{r.active ? roundLabel : `Eliminada/o en ${{ CUARTOS: "Cuartos", SEMIS: "Semis", FINAL: "Final" }[r.eliminatedIn]}`}</div>
                  </div>
                </div>
                <span className="fl-mono text-base font-semibold" style={{ color: r.active ? C.gold : C.muted }}>{r.pts}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {jornadasIniciadas.length > 0 && (
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
            <button key={r.name} onClick={() => r.name === me ? onGoTo("equipo") : setViewingTeam(r.name)} className="fl-tap w-full fl-row flex items-center justify-between px-3 py-2.5 text-left" style={{ outline: r.name === me ? `2px solid ${C.principal}` : "none", boxShadow: r.name === me ? `0 0 18px ${C.principal}44` : "none" }}>
              <div className="flex items-center gap-2.5">
                <span className="fl-mono text-xs w-5 text-center" style={{ color: C.muted }}>{r.rank}</span>
                <DeltaArrow delta={r.delta} />
                <div>
                  <div className="text-sm font-medium" style={{ color: C.white }}>{r.name}{r.name === me ? " (tú)" : ""}</div>
                  <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{r.jCount} jugadoras · {r.cCount} DT</div>
                </div>
              </div>
              <span className="fl-mono text-base font-semibold" style={{ color: C.baby }}>{r.total}</span>
            </button>
          ))}
        </div>
      )}

      {viewingTeam && (
        <RivalTeamScreen ownerName={viewingTeam} team={teams[viewingTeam]} players={players} jornadas={jornadas}
          leagueId={leagueId} teamCrests={teamCrests} teams={teams} me={me} budgetAvailable={budgetAvailable} onBuyClause={onBuyClause} onSendOffer={onSendOffer}
          onClose={() => setViewingTeam(null)} />
      )}
    </div>
  );
}

// Ficha de solo lectura de la plantilla y los puntos de OTRO usuario de la
// liga: se abre al tocar su fila en Clasificación. Reutiliza el mismo
// PuntosJornadaView que usa cada uno para su propio equipo, pasándole el
// nombre y la alineación de la persona que se está mirando.
function RivalTeamScreen({ ownerName, team, players, jornadas, leagueId, teamCrests, teams, me, budgetAvailable, onBuyClause, onSendOffer, onClose }) {
  const [sub, setSub] = useState("plantilla");
  const [detailPlayerId, setDetailPlayerId] = useState(null);
  const lineup = team?.lineup || { formation: "2-2-1", starters: [], bench: { BASE: null, ALERO: null, PIVOT: null }, titularCoach: null, captainId: null };
  const squadEntries = team?.squad || [];
  const squadPlayers = squadEntries.map(e => players.find(p => p.id === e.id)).filter(Boolean);
  const jugadoras = squadPlayers.filter(p => p.position !== "DT");
  const coaches = squadPlayers.filter(p => p.position === "DT");
  const allSquad = [...jugadoras, ...coaches];
  const startersSet = new Set(lineup.starters || []);
  const benchIds = new Set(Object.values(lineup.bench || {}).filter(Boolean));
  const jornadasIniciadas = startedJornadas(jornadas);
  const history = jornadasIniciadas.map(j => ({ id: j.id, name: j.name, pts: computeTeamJornadaPoints(j, `${leagueId}::${ownerName}`, lineup, players) }));
  const totalPts = history.reduce((s, h) => s + h.pts, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex items-center px-4 pb-3" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}>
        <button onClick={onClose} className="fl-tap p-1 -ml-1"><ChevronLeft size={22} color={C.white} /></button>
        <div className="flex-1 text-center">
          <div className="fl-display text-sm uppercase" style={{ color: C.white }}>{ownerName}</div>
          <div className="fl-mono text-[10px]" style={{ color: C.muted }}>{totalPts} puntos totales</div>
        </div>
        <span style={{ width: 22 }} />
      </div>
      <div className="flex-1 overflow-y-auto fl-scrollbar p-4">
        <div className="flex gap-2 mb-4">
          {[["plantilla", "Plantilla"], ["puntos", "Puntos"]].map(([k, l]) => (
            <button key={k} onClick={() => setSub(k)} className="fl-tap flex-1 rounded-md py-2 fl-mono text-xs font-semibold"
              style={{ background: sub === k ? C.baby : "transparent", color: sub === k ? C.ink : C.muted, border: sub === k ? "none" : `1px solid ${C.line}` }}>
              {l}
            </button>
          ))}
        </div>

        {sub === "plantilla" && (
          <div className="space-y-3">
            {allSquad.length === 0 ? (
              <EmptyState title="Plantilla vacía" text="Este equipo todavía no tiene jugadoras." />
            ) : allSquad.map(p => {
              const entry = squadEntries.find(e => e.id === p.id);
              const role = (startersSet.has(p.id) || lineup.titularCoach === p.id) ? "Titular" : benchIds.has(p.id) ? "Banquillo" : "Reserva";
              return (
                <button key={p.id} onClick={() => setDetailPlayerId(p.id)} className="fl-tap fl-row w-full flex items-center gap-3.5 px-4 py-3.5 text-left">
                  <div className="relative flex-shrink-0" style={{ width: 76 }}>
                    <PlayerPhoto url={p.photo} width={76} height={96} rounded={14} focusTop />
                    <div className="absolute" style={{ top: -6, right: -6 }}><TeamCrest name={p.team} photo={teamCrests?.[p.team]} size={26} /></div>
                    <div className="absolute bottom-0" style={{ left: -6, right: -6, height: 3, borderRadius: 2, background: C.baby, boxShadow: `0 0 8px 1.5px ${C.baby}` }} />
                  </div>
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
          <PuntosJornadaView jornadas={jornadasIniciadas} history={history} leagueId={leagueId} teamName={ownerName}
            players={players} lineup={lineup} teamCrests={teamCrests} onOpenPlayer={(p) => setDetailPlayerId(p.id)} />
        )}
      </div>

      {detailPlayerId && (() => {
        const p = players.find(x => x.id === detailPlayerId);
        if (!p) return null;
        return (
          <PlayerDetailScreen player={p} entry={squadEntries.find(e => e.id === p.id)} jornadas={jornadas} isOwned={false}
            isFavorite={false} onToggleFavorite={() => {}}
            teams={teams} me={me} budgetAvailable={budgetAvailable} onBuyClause={onBuyClause} onSendOffer={onSendOffer}
            onClose={() => setDetailPlayerId(null)} />
        );
      })()}
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
            <span className="fl-mono text-[9px]" style={{ color: C.muted }}>{points[0]?.label || points[0]?.date}</span>
            {points.length > 1 && <span className="fl-mono text-[9px]" style={{ color: C.muted }}>{points[points.length - 1]?.label || points[points.length - 1]?.date}</span>}
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
// Teclado numérico propio de la app (no el del móvil): traslúcido y a juego
// con el resto del diseño. Trabaja siempre en EUROS exactos (no en "millones"
// redondos), así que se puede pujar/ofertar/subir cláusula por cualquier
// importe, incluido 1 € de diferencia. `valueEuros` es un string de dígitos
// (sin separadores); `minEuros`, si se indica, bloquea "Confirmar" por debajo
// de ese importe.
function AmountKeypadSheet({ title, subtitle, valueEuros, onChange, onConfirm, onClose, confirmLabel, minEuros }) {
  const handleKey = (k) => {
    if (k === "back") { onChange(valueEuros.length > 1 ? valueEuros.slice(0, -1) : "0"); return; }
    const next = (valueEuros === "0" ? "" : valueEuros) + k;
    if (next.replace(/^0+/, "").length > 12) return; // límite razonable de dígitos
    onChange(next.replace(/^0+(?=\d)/, ""));
  };
  const numericValue = Number(valueEuros || 0);
  const belowMin = minEuros != null && numericValue < minEuros;
  const displayFormatted = numericValue.toLocaleString("es-ES");

  return (
    <div className="fixed inset-0 z-[80] flex items-end" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div className="w-full rounded-t-2xl overflow-hidden fl-pop"
        style={{ background: "rgba(20,26,39,0.88)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", border: `1px solid ${C.lineSoft}` }}
        onClick={(e) => e.stopPropagation()}>
        {title && <div className="px-4 pt-4 text-center fl-display text-sm uppercase" style={{ color: C.white }}>{title}</div>}
        {subtitle && <div className="px-4 pt-1 text-center fl-mono text-[10px]" style={{ color: C.muted }}>{subtitle}</div>}
        <div className="px-6 py-4 text-center">
          <div className="fl-mono font-bold" style={{ color: belowMin ? C.negative : C.white, fontSize: 30 }}>{displayFormatted} €</div>
          {belowMin && <div className="fl-mono text-[10px] mt-1" style={{ color: C.negative }}>Mínimo {minEuros.toLocaleString("es-ES")} €</div>}
        </div>
        <div className="px-4 pb-3">
          <button onClick={() => !belowMin && onConfirm()} disabled={belowMin}
            className="fl-tap w-full rounded-md py-3 text-sm font-semibold disabled:opacity-40"
            style={{ background: C.positive, color: C.ink }}>
            {confirmLabel || "Confirmar importe"}
          </button>
        </div>
        <div className="grid grid-cols-3" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "back"].map((k, i) => (
            <button key={i} onClick={() => handleKey(k)}
              className="fl-tap py-4 flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.02)", borderRight: (i % 3 !== 2) ? `1px solid ${C.lineSoft}` : "none", borderTop: i >= 3 ? `1px solid ${C.lineSoft}` : "none" }}>
              {k === "back" ? <span className="fl-mono text-lg" style={{ color: C.muted }}>⌫</span> : <span className="fl-mono text-xl font-medium" style={{ color: C.white }}>{k}</span>}
            </button>
          ))}
        </div>
        <div style={{ height: "env(safe-area-inset-bottom, 10px)" }} />
      </div>
    </div>
  );
}

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
  const [payEuros, setPayEuros] = useState("0");
  const [showKeypad, setShowKeypad] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pay = Number(payEuros) / 1000000;
  const previewClause = clause + pay * 2;

  const submit = async () => {
    setError(""); setBusy(true);
    const res = await onConfirm(pay);
    setBusy(false);
    if (!res.ok) setError(res.error); else onBack();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: C.navy900 }}>
      <div className="flex items-center px-4 pb-3" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}>
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
        <button onClick={() => setShowKeypad(true)} className="fl-tap w-full flex items-center gap-2.5 px-3 py-2.5 mb-3" style={{ background: C.navy700, borderRadius: 12 }}>
          <div className="flex items-center justify-center rounded-full" style={{ width: 26, height: 26, background: C.gold }}>
            <Coins size={14} color={C.ink} />
          </div>
          <div className="flex-1 text-left">
            <div className="fl-mono text-[9px]" style={{ color: C.muted }}>IMPORTE A PAGAR</div>
            <div className="fl-mono text-sm font-semibold" style={{ color: C.white }}>{fmtCredits(pay)}</div>
          </div>
          <Pencil size={14} color={C.muted} />
        </button>
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
      {showKeypad && (
        <AmountKeypadSheet title="Importe a pagar" subtitle="Cada euro pagado sube la cláusula el doble"
          valueEuros={payEuros} onChange={setPayEuros} minEuros={0}
          confirmLabel="Fijar importe" onConfirm={() => setShowKeypad(false)} onClose={() => setShowKeypad(false)} />
      )}
    </div>
  );
}

function PlayerDetailScreen({ player, entry, jornadas, isFavorite, onToggleFavorite, isOwned, onSellImmediate, onToggleForSale, onAcceptSaleOffer, onRaiseClause, onClose, teams, me, budgetAvailable, onBuyClause, onSendOffer }) {
  const [showHistorico, setShowHistorico] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showRaiseClause, setShowRaiseClause] = useState(false);
  const [busyAction, setBusyAction] = useState(null); // "sell" | "forsale" | "offer" | null
  const [actionMsg, setActionMsg] = useState("");
  const [confirmSell, setConfirmSell] = useState(false);
  const [showThirdPartyClause, setShowThirdPartyClause] = useState(false);
  const [showThirdPartyOffer, setShowThirdPartyOffer] = useState(false);

  // Si no es mía, ¿es de otra persona de la liga? (para poder ofertar o pagar cláusula)
  const ownerInfo = useMemo(() => {
    if (isOwned || !teams) return null;
    for (const [name, t] of Object.entries(teams)) {
      if (me && name === me) continue;
      const e = (t.squad || []).find(x => x.id === player.id);
      if (e) return { ownerName: name, ownerEntry: e };
    }
    return null;
  }, [isOwned, teams, player.id, me]);

  const seasonRows = useMemo(() => startedJornadas(jornadas).map((j, i) => {
    if (player.position === "DT") {
      const win = resolveCoachWin(j, player.team);
      const played = win != null;
      const total = played ? calcCoachPoints(null, win).total : 0;
      return { idx: i, jornada: j, played, total };
    }
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
  const { breakdown } = selected?.played
    ? (player.position === "DT" ? calcCoachPoints(null, resolveCoachWin(selected.jornada, player.team)) : calcPointsBreakdown(selected.jornada.stats[player.id], player.position))
    : { breakdown: [] };

  if (showRaiseClause) {
    return (
      <RaiseClauseScreen player={player} entry={entry}
        onBack={() => setShowRaiseClause(false)}
        onConfirm={(payAmount) => onRaiseClause(player.id, payAmount)} />
    );
  }

  if (showThirdPartyClause && ownerInfo) {
    return (
      <ClauseOfferScreen target={{ sellerName: ownerInfo.ownerName, asset: player, entry: ownerInfo.ownerEntry }} budgetAvailable={budgetAvailable}
        onBack={() => setShowThirdPartyClause(false)}
        onConfirm={async (amount) => {
          const res = await onBuyClause(ownerInfo.ownerName, player, amount);
          if (res.ok) onClose(); else return res;
        }} />
    );
  }

  if (showThirdPartyOffer && ownerInfo) {
    return (
      <OfferScreen target={{ sellerName: ownerInfo.ownerName, asset: player }} budgetAvailable={budgetAvailable}
        onBack={() => setShowThirdPartyOffer(false)}
        onConfirm={async (amount) => {
          const res = await onSendOffer(ownerInfo.ownerName, player, amount);
          if (res.ok) onClose(); else return res;
        }} />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex items-center justify-between px-3 pb-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
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
            {ownerInfo && (
              <div className="mt-1">
                <div className="fl-mono text-[9px]" style={{ color: C.muted }}>De {ownerInfo.ownerName}</div>
                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                  <ClauseBadge entry={ownerInfo.ownerEntry} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-2 px-4 pt-3" style={{ gridTemplateColumns: (isOwned && entry) || ownerInfo ? "1fr 1fr" : "1fr" }}>
          <button onClick={() => setShowHistorico(true)} className="fl-tap rounded-md py-2.5 text-xs font-semibold"
            style={{ border: `1px solid ${C.line}`, color: C.white }}>
            Valor histórico
          </button>
          {isOwned && entry && (
            <button onClick={() => setShowActions(true)} className="fl-tap rounded-md py-2.5 text-xs font-semibold" style={{ background: C.principal, color: C.white }}>
              Acciones
            </button>
          )}
          {ownerInfo && (
            <button onClick={() => setShowActions(true)} className="fl-tap rounded-md py-2.5 text-xs font-semibold" style={{ background: C.principal, color: C.white }}>
              Fichar
            </button>
          )}
        </div>

        {showActions && ownerInfo && (
          <ActionSheet onClose={() => setShowActions(false)} title={player.name}>
            <ActionSheetItem label="Hacer oferta" onClick={() => { setShowActions(false); setShowThirdPartyOffer(true); }} />
            <ActionSheetItem
              label={teamService.isClauseLocked(ownerInfo.ownerEntry) ? "Pagar cláusula (bloqueada)" : "Pagar cláusula"}
              disabled={teamService.isClauseLocked(ownerInfo.ownerEntry)}
              subtitle={teamService.isClauseLocked(ownerInfo.ownerEntry) ? "Todavía no se puede pagar" : fmtCredits(ownerInfo.ownerEntry.clause || player.basePrice || 0)}
              onClick={() => { setShowActions(false); setShowThirdPartyClause(true); }} />
          </ActionSheet>
        )}

        {showActions && isOwned && entry && (
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
                    <div className="absolute left-0 right-0 bottom-0 rounded-sm" style={{ height: barFillHeight(r), background: !r.played ? C.gold : r.total < 0 ? C.negative : r.total === 0 ? C.gold : C.positive }} />
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

function EquipoTab({ myJugadoras, myCoaches, myTeam, budgetAvailable, budgetCommitted, jornadas, players, teamName, leagueId, favoritos, onToggleFavorite, onSaveLineup, onSellImmediate, onToggleForSale, onAcceptSaleOffer, onRaiseClause, teamCrests, playoffState, onSavePlayoffLineup }) {
  const [sub, setSub] = useState("alineacion");
  const [detailPlayerId, setDetailPlayerId] = useState(null);
  const isPlayoffMode = playoffState && playoffState.phase !== "none";
  const isPlayoffParticipant = isPlayoffMode && (playoffState.qualifiers || []).includes(teamName);

  // En playoffs, toda la pestaña Equipo trabaja sobre la plantilla y la
  // alineación DE PLAYOFFS de la ronda actual — no la de temporada.
  const playoffSquadIds = isPlayoffMode ? ((playoffState.squads[playoffState.round] || {})[teamName] || []) : [];
  const playoffSquadPlayers = playoffSquadIds.map((id) => players.find((p) => p.id === id)).filter(Boolean);
  const emptyLineupShape = { formation: "2-2-1", starters: [], bench: { BASE: null, ALERO: null, PIVOT: null }, titularCoach: null, captainId: null };

  const effJugadoras = isPlayoffMode ? playoffSquadPlayers.filter((p) => p.position !== "DT") : myJugadoras;
  const effCoaches = isPlayoffMode ? playoffSquadPlayers.filter((p) => p.position === "DT") : myCoaches;
  const lineup = isPlayoffMode ? ((playoffState.lineups[playoffState.round] || {})[teamName] || emptyLineupShape) : (myTeam.lineup || emptyLineupShape);
  const allSquad = [...effJugadoras, ...effCoaches];
  const startersSet = new Set(lineup.starters || []);
  const benchIds = new Set(Object.values(lineup.bench || {}).filter(Boolean));
  const reserva = allSquad.filter(p => !startersSet.has(p.id) && !benchIds.has(p.id) && p.id !== lineup.titularCoach);
  const jornadasIniciadas = isPlayoffMode ? playoffService.jornadasForRound(jornadas, playoffState.round) : startedJornadas(jornadas);
  const history = isPlayoffMode
    ? jornadasIniciadas.map((j) => ({ id: j.id, name: j.name, pts: playoffService.computeRoundPoints(jornadas, playoffState.round, playoffState.lockedLineups, teamName, players, lineup) }))
    : jornadasIniciadas.map(j => ({ id: j.id, name: j.name, pts: computeTeamJornadaPoints(j, `${leagueId}::${teamName}`, lineup, players) }));

  const valorPlantilla = isPlayoffMode
    ? playoffSquadPlayers.reduce((s, p) => s + (p.basePrice || 0), 0)
    : (myTeam.squad || []).reduce((s, e) => s + (e.pricePaid || 0), 0);
  const targetSquadSize = isPlayoffMode ? PLAYOFF_SQUAD_SIZE[playoffState.round] : (MAX_SQUAD_JUGADORAS + MAX_COACHES);
  const fichasLabel = isPlayoffMode ? `${playoffSquadPlayers.length}/${targetSquadSize}` : `${myTeam.squad.length}/${MAX_SQUAD_JUGADORAS + MAX_COACHES}`;

  const saveLineupHandler = isPlayoffMode ? (nextLineup) => onSavePlayoffLineup(playoffState.round, nextLineup) : onSaveLineup;

  if (isPlayoffMode && !isPlayoffParticipant) {
    return <EmptyState title="No estás en playoffs" text="Tu equipo no se clasificó para esta fase — puedes seguir el draft de tus compañeros desde Mercado, y ver la clasificación en vivo en Ranking." />;
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        <StatChip label="Fichas" value={fichasLabel} compact />
        <StatChip label="Valor plantilla" value={fmtCredits(valorPlantilla)} compact />
        {!isPlayoffMode && (<>
          <StatChip label="Disponible" value={fmtCredits(budgetAvailable)} accent={C.baby} compact />
          <StatChip label="Comprometido" value={fmtCredits(budgetCommitted)} compact />
        </>)}
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
        <LineupEditor myJugadoras={effJugadoras} myCoaches={effCoaches} lineup={lineup} onSave={saveLineupHandler} teamCrests={teamCrests} />
      )}

      {sub === "plantilla" && (
        <div className="space-y-3">
          {allSquad.length === 0 ? (
            <EmptyState title={isPlayoffMode ? "Todavía sin plantilla de playoffs" : "Aún no tienes plantilla"} text={isPlayoffMode ? "Se irá completando según avance el draft de esta ronda." : "Consigue jugadoras y entrenadora/or pujando en el mercado."} />
          ) : allSquad.map(p => {
            const entry = isPlayoffMode ? null : myTeam.squad.find(e => e.id === p.id);
            const role = (startersSet.has(p.id) || lineup.titularCoach === p.id) ? "Titular" : benchIds.has(p.id) ? "Banquillo" : "Reserva";
            return (
              <button key={p.id} onClick={() => setDetailPlayerId(p.id)} className="fl-tap fl-row w-full flex items-center gap-3.5 px-4 py-3.5 text-left">
                <div className="relative flex-shrink-0" style={{ width: 76 }}>
                  <PlayerPhoto url={p.photo} width={76} height={96} rounded={14} focusTop />
                  <div className="absolute" style={{ top: -6, right: -6 }}><TeamCrest name={p.team} photo={teamCrests?.[p.team]} size={26} /></div>
                  <div className="absolute bottom-0" style={{ left: -6, right: -6, height: 3, borderRadius: 2, background: C.baby, boxShadow: `0 0 8px 1.5px ${C.baby}` }} />
                </div>
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
                  {!isPlayoffMode && <div className="flex justify-end mt-1"><ClauseBadge entry={entry || {}} /></div>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {sub === "puntos" && (
        <PuntosJornadaView jornadas={jornadasIniciadas} history={history} leagueId={leagueId} teamName={teamName}
          players={players} lineup={lineup} teamCrests={teamCrests} onOpenPlayer={(p) => setDetailPlayerId(p.id)} playoffLockedLineups={isPlayoffMode ? playoffState.lockedLineups : null} />
      )}

      {detailPlayerId && (() => {
        const p = players.find(x => x.id === detailPlayerId);
        if (!p) return null;
        const entry = myTeam.squad.find(e => e.id === p.id);
        const isMine = !!entry;
        return (
          <PlayerDetailScreen player={p} entry={entry} jornadas={jornadas} isOwned={isMine}
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
function PuntosJornadaView({ jornadas, history, leagueId, teamName, players, lineup, teamCrests, onOpenPlayer, playoffLockedLineups }) {
  const [selectedIdx, setSelectedIdx] = useState(() => Math.max(jornadas.length - 1, 0));
  const [showIdealFive, setShowIdealFive] = useState(false);
  if (jornadas.length === 0) return <EmptyState title="Sin jornadas todavía" text="Los puntos de cada jornada aparecerán aquí." />;

  const jornada = jornadas[selectedIdx];
  // Igual que en liga regular: una vez empezada la jornada, solo vale la
  // alineación ya congelada de ESA jornada concreta (en playoffs, cada
  // jornada -incluida ida/vuelta de cuartos por separado- tiene su propio
  // bloqueo, guardado en playoffLockedLineups). Antes de empezar, se usa la
  // alineación en vivo como previsión.
  const savedLineup = jornada.playoffRound
    ? (playoffLockedLineups && (playoffLockedLineups[jornada.playoffRound] || {})[teamName]) || null
    : (jornada?.lineups?.[`${leagueId}::${teamName}`] || null);
  const usedLineup = savedLineup || (hasJornadaEffectivelyStarted(jornada) ? null : lineup);
  const total = history[selectedIdx]?.pts ?? 0;

  const findPlayer = (id) => players.find(p => p.id === id) || null;
  const pointsFor = (id) => {
    const p = findPlayer(id);
    if (!p) return 0;
    if (p.position === "DT") return calcCoachPoints(null, resolveCoachWin(jornada, p.team)).total;
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
  const swaps = useMemo(() => computeLineupSwaps(usedLineup, jornada, players), [usedLineup, jornada, players]);
  const swappedOutIds = new Set(Object.values(swaps).map(s => s.outId));
  const swappedInIds = new Set(Object.values(swaps).map(s => s.inId));

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

      {Object.keys(swaps).length > 0 && (
        <div className="fl-row p-3 mb-3 flex items-center gap-2" style={{ border: `1px solid ${C.gold}55` }}>
          <RefreshCw size={14} color={C.gold} />
          <p className="fl-body text-xs" style={{ color: C.muted }}>
            Cambio automático: la del banquillo puntuó más que su titular en la misma posición, así que cuenta ella. Mira las flechas <span style={{ color: C.negative }}>↓</span>/<span style={{ color: C.positive }}>↑</span> en la pista.
          </p>
        </div>
      )}

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
                      const isOut = id && swappedOutIds.has(id);
                      return (
                        <div key={id || `${pos.key}-empty-${i}`} className="flex flex-col items-center">
                          <div className="relative" style={{ opacity: isOut ? 0.45 : 1 }}>
                            <CourtSlot player={p} size={70} isCaptain={!!id && usedLineup.captainId === id} teamCrests={teamCrests} onClick={p ? () => onOpenPlayer(p) : undefined} />
                            {p && (
                              <span className="absolute -top-1.5 -right-1.5 fl-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full pointer-events-none"
                                style={{ background: C.navy900, color: isOut ? C.muted : (pointsFor(id) >= 0 ? C.positive : C.negative), border: `1px solid ${isOut ? C.negative : C.line}`, textDecoration: isOut ? "line-through" : "none" }}>
                                {pointsFor(id)}
                              </span>
                            )}
                            {isOut && (
                              <span className="absolute -bottom-1.5 -left-1.5 rounded-full flex items-center justify-center fl-mono text-[10px] font-bold pointer-events-none"
                                style={{ width: 18, height: 18, background: C.negative, color: C.white }}>↓</span>
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
                const isIn = id && swappedInIds.has(id);
                return (
                  <div key={pos.key} className="relative">
                    <CourtSlot player={p} size={54} label={pos.label} teamCrests={teamCrests} onClick={p ? () => onOpenPlayer(p) : undefined} />
                    {p && (
                      <span className="absolute -top-1.5 -right-1.5 fl-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full pointer-events-none"
                        style={{ background: C.navy900, color: isIn ? C.gold : (pointsFor(id) >= 0 ? C.positive : C.negative), border: `1px solid ${isIn ? C.gold : C.line}` }}>
                        {pointsFor(id)}
                      </span>
                    )}
                    {isIn && (
                      <span className="absolute -bottom-1.5 -left-1.5 rounded-full flex items-center justify-center fl-mono text-[10px] font-bold pointer-events-none"
                        style={{ width: 18, height: 18, background: C.positive, color: C.white }}>↑</span>
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
                <CourtSlot player={coachId ? findPlayer(coachId) : null} size={58} label={coachId ? undefined : "DT"} teamCrests={teamCrests} onClick={coachId && findPlayer(coachId) ? () => onOpenPlayer(findPlayer(coachId)) : undefined} />
                {coachId && findPlayer(coachId) && (
                  <span className="absolute -top-1.5 -right-1.5 fl-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full pointer-events-none"
                    style={{ background: C.navy900, color: pointsFor(coachId) >= 0 ? C.positive : C.negative, border: `1px solid ${C.line}` }}>
                    {pointsFor(coachId)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <button onClick={() => setShowIdealFive(true)}
        className="fl-tap w-full mt-3 rounded-md py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
        style={{ border: `1.5px solid ${C.gold}`, color: C.gold }}>
        <Star size={15} fill={C.gold} /> Ver 5 ideal
      </button>

      {showIdealFive && (
        <IdealFiveScreen jornadas={jornadas} players={players} teamCrests={teamCrests}
          onClose={() => setShowIdealFive(false)} />
      )}
    </div>
  );
}

// Fila de jugadora candidata dentro de la pantalla "Cambiar jugador".
function PickerPlayerRow({ p, selected, onSelect }) {
  const pos = POS_BY_KEY[p.position] || COACH_POS;
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
function CaptainPickerScreen({ rows, myJugadoras, captainId, onSelect, onBack, teamCrests }) {
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
                return <CourtSlot key={id} player={p} size={66} isCaptain={captainId === id} onClick={() => onSelect(id)} teamCrests={teamCrests} />;
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

function LineupEditor({ myJugadoras, myCoaches, lineup, onSave, teamCrests }) {
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
        teamCrests={teamCrests}
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
                    <CourtSlot key={id || `${pos.key}-empty-${i}`} player={p} size={70} isCaptain={!!id && captainId === id}
                      onClick={() => setPicker({ type: "starter", posKey: pos.key, currentId: id || null })} teamCrests={teamCrests} />
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
              <CourtSlot key={pos.key} player={p} size={54} label={pos.label}
                onClick={() => setPicker({ type: "bench", posKey: pos.key, currentId: id || null })} teamCrests={teamCrests} />
            );
          })}
        </div>
      </div>

      {/* Entrenadora/or titular: mismo patrón de hueco + selección. */}
      <div className="mb-3">
        <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>ENTRENADORA/OR TITULAR</div>
        <div className="fl-row flex items-center justify-center py-4 px-2">
          <CourtSlot player={titularCoach ? findPlayer(titularCoach) : null} size={58} label={titularCoach ? undefined : "DT"}
            onClick={() => setPicker({ type: "coach", posKey: "DT", currentId: titularCoach || null })} teamCrests={teamCrests} />
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
// desplegable "Nombre" del buscador (Nombre, Puntos, Equipo, Precio). Se
// quitaron "Posición", "Estado" y "Propietario" de aquí porque ya se pueden
// filtrar directamente con sus propios filtros (Posición) o se ven en la
// propia fila (Estado/Propietario), así que sobraban como criterio de orden.
function sortPlayersBy(list, sortKey, ownerByPlayerId, pfsyByPlayerId) {
  const arr = [...list];
  switch (sortKey) {
    case "puntos": return arr.sort((a, b) => (pfsyByPlayerId[b.id] || 0) - (pfsyByPlayerId[a.id] || 0));
    case "equipo": return arr.sort((a, b) => (a.team || "").localeCompare(b.team || ""));
    case "precio": return arr.sort((a, b) => (b.basePrice || 0) - (a.basePrice || 0));
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
function PlayerSearchScreen({ players, jornadas, teams, myTeam, me, budgetAvailable, onBuyClause, onSendOffer, favoritos, onToggleFavorite, onSellImmediate, onToggleForSale, onAcceptSaleOffer, onRaiseClause, onClose }) {
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
      jornadas.forEach(j => {
        if (p.position === "DT") { const win = resolveCoachWin(j, p.team); if (win != null) total += calcCoachPoints(null, win).total; return; }
        const s = j.stats?.[p.id]; if (s) total += calcPointsBreakdown(s, p.position).total;
      });
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
  const sortOptions = [["nombre", "Nombre"], ["puntos", "Puntos"], ["equipo", "Equipo"], ["precio", "Precio"]];

  // Los botones de filtro muestran la opción elegida en vez del rótulo
  // genérico (p. ej. "Boscos" en vez de "Equipo") una vez hay algo
  // seleccionado; si no, se quedan con el rótulo de siempre.
  const posSelectedLabel = posOptions.find(([k]) => k === posFilter)?.[1];
  const teamLabel = teamFilter || "Equipo";
  const posLabel = posFilter ? posSelectedLabel : "Posición";
  const sortLabel = sortOptions.find(([k]) => k === sortKey)?.[1] || "Nombre";

  return (
    <div className="fixed inset-0 z-50 flex flex-col fl-body" style={{ background: C.navy900 }}>
      <div className="flex items-center gap-2 px-3 pb-3 flex-shrink-0" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
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
          <FilterDropdown label={teamLabel} open={openDropdown === "equipo"} onToggle={() => setOpenDropdown(d => d === "equipo" ? null : "equipo")}>
            <DropdownItem active={!teamFilter} onClick={() => { setTeamFilter(""); setOpenDropdown(null); }}>Todos</DropdownItem>
            {realTeams.map(t => <DropdownItem key={t} active={teamFilter === t} onClick={() => { setTeamFilter(t); setOpenDropdown(null); }}>{t}</DropdownItem>)}
          </FilterDropdown>
          <FilterDropdown label={posLabel} open={openDropdown === "posicion"} onToggle={() => setOpenDropdown(d => d === "posicion" ? null : "posicion")}>
            {posOptions.map(([k, l]) => <DropdownItem key={k || "todos"} active={posFilter === k} onClick={() => { setPosFilter(k); setOpenDropdown(null); }}>{l}</DropdownItem>)}
          </FilterDropdown>
          <FilterDropdown label={sortLabel} open={openDropdown === "orden"} onToggle={() => setOpenDropdown(d => d === "orden" ? null : "orden")}>
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
          teams={teams} me={me} budgetAvailable={budgetAvailable} onBuyClause={onBuyClause} onSendOffer={onSendOffer}
          onClose={() => setDetailPlayer(null)} />
      )}
    </div>
  );
}

// Pestaña de la cabecera del draft (segmented pill, degradado rosa→naranja
// cuando está activa) — mismo lenguaje visual que el resto de segmented
// controls de la app (ver ClasificacionRealScreen).
function DraftTabPill({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} className="fl-tap flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full fl-display text-[10px] uppercase tracking-wide whitespace-nowrap transition-all"
      style={active
        ? { background: `linear-gradient(135deg, ${C.principal}, ${C.baby})`, color: C.white, boxShadow: `0 0 14px ${C.principal}66` }
        : { background: "transparent", border: `1px solid ${C.principal}44`, color: C.muted }}>
      {Icon && <Icon size={12} />}
      {label}
    </button>
  );
}

// Tarjeta de jugadora del draft: escudo + posición arriba, foto (o hueco
// vacío si no hay imagen — no fingimos camisetas ilustradas) y nombre debajo.
// Al seleccionarla aparece la insignia con el número de orden en la lista.
function DraftPlayerCard({ p, teamCrests, pickNumber, selected, gotIt, onClick, disabled }) {
  const Wrapper = onClick ? "button" : "div";
  const wrapperProps = onClick ? { onClick, disabled } : {};
  return (
    <Wrapper {...wrapperProps} className="fl-tap relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl text-center w-full"
      style={{
        background: selected ? `linear-gradient(160deg, ${C.principalSoft}, ${C.navy800})` : C.navy800,
        border: selected ? `1.5px solid ${C.principal}` : `1px solid ${C.line}`,
        boxShadow: selected ? `0 0 16px ${C.principal}55` : "none",
        opacity: disabled && !selected ? 0.4 : 1,
      }}>
      <div className="w-full flex items-center justify-between">
        <PositionBadge posKey={p.position} size="sm" />
        <TeamCrest name={p.team} photo={teamCrests?.[p.team]} size={18} />
      </div>
      <PlayerPhoto url={p.photo} size={54} rounded={10} />
      <span className="fl-body text-[11px] font-medium leading-tight truncate w-full" style={{ color: C.white }}>{p.name}</span>
      {pickNumber != null && (
        <span className="absolute -top-1.5 -left-1.5 flex items-center justify-center fl-mono text-[10px] font-bold rounded-full"
          style={{ width: 20, height: 20, background: `linear-gradient(135deg, ${C.principal}, ${C.baby})`, color: C.white, boxShadow: `0 0 8px ${C.principal}77` }}>
          {pickNumber}
        </span>
      )}
      {gotIt && (
        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full" style={{ background: C.navy900, width: 18, height: 18 }}>
          <CircleCheck size={16} color={C.positive} />
        </span>
      )}
    </Wrapper>
  );
}

// Sustituye al Mercado durante toda la fase de playoffs: pantalla de draft
// para quien siga clasificada/o (construir tu lista, verla bloqueada tras
// enviarla, ver tu plantilla de playoffs crecer día a día), y modo
// espectador para el resto (el "diario" de quién se lleva a quién).
function PlayoffDraftTab({ playoffState, players, teamCrests, profile, jornadas, onSubmitDraftList }) {
  const [draft, setDraft] = useState([]); // lista que se está construyendo, antes de enviar
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("lista"); // "lista" | "picks_<inicioDeRango>"
  const [search, setSearch] = useState("");
  const round = playoffState.round;
  const isParticipant = (playoffState.qualifiers || []).includes(profile.name);
  const myList = (playoffState.lists[round] || {})[profile.name] || null;
  const mySquadIds = (playoffState.squads[round] || {})[profile.name] || [];
  const targetSize = PLAYOFF_SQUAD_SIZE[round] || 9;
  const listSize = PLAYOFF_LIST_SIZE[round] || 16;

  const draftedIds = new Set(Object.values(playoffState.squads[round] || {}).flat());
  const pool = useMemo(() => playoffService.availablePool(jornadas, players, round, [...draftedIds]), [jornadas, players, round, playoffState.squads]);
  const filteredPool = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? pool.filter((p) => p.name.toLowerCase().includes(q)) : pool;
  }, [pool, search]);

  const roundLabel = { CUARTOS: "Cuartos", SEMIS: "Semis", FINAL: "Final" }[round] || "";

  // Pestañas "PICKS 1-2", "PICKS 3-4"... agrupando la lista de preferencia de
  // dos en dos — solo hasta completar plantilla (targetSize): a partir de ahí
  // ya no hace falta pestaña propia, porque esos puestos de la lista son solo
  // reserva por si algo se lo lleva otra persona antes.
  const pickGroups = useMemo(() => {
    const groups = [];
    for (let start = 0; start < targetSize; start += 2) {
      const end = Math.min(start + 1, targetSize - 1);
      groups.push({ key: `picks_${start}`, label: end > start ? `PICKS ${start + 1}-${end + 1}` : `PICK ${start + 1}`, indices: end > start ? [start, end] : [start] });
    }
    return groups;
  }, [targetSize]);
  const canSeeOtherLists = !!myList || !isParticipant;
  const activeGroup = pickGroups.find((g) => g.key === view);

  const toggleDraftPick = (playerId) => {
    setDraft((prev) => prev.includes(playerId) ? prev.filter((id) => id !== playerId) : (prev.length < listSize ? [...prev, playerId] : prev));
  };
  const moveUp = (idx) => {
    if (idx === 0) return;
    setDraft((prev) => { const next = [...prev]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; return next; });
  };
  const submit = async () => {
    if (draft.length === 0) { setError("Añade al menos una jugadora a tu lista."); return; }
    setBusy(true); setError("");
    const res = await onSubmitDraftList(round, draft);
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  if (playoffState.phase === "finished") {
    return (
      <div className="fl-row p-6 text-center">
        <div style={{ fontSize: 40 }}>🏆</div>
        <div className="fl-display text-lg uppercase mt-2" style={{ color: C.gold }}>{playoffState.champion}</div>
        <div className="fl-mono text-xs mt-1" style={{ color: C.muted }}>Es la campeona/ón de los playoffs</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <FlaskConical size={14} color={C.gold} />
        <span className="fl-display text-sm uppercase" style={{ color: C.white }}>Draft — {roundLabel}</span>
      </div>

      {/* Cabecera de pestañas: LISTA DEL DRAFT + PICKS 1-2 / 3-4 / ... */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto fl-scrollbar pb-1">
        <DraftTabPill active={view === "lista"} onClick={() => setView("lista")} icon={Users} label="Lista del draft" />
        {pickGroups.map((g) => (
          <DraftTabPill key={g.key} active={view === g.key} onClick={() => setView(g.key)} label={g.label} />
        ))}
      </div>

      {/* Cabecera de contenido: título de la vista + contador/buscador (solo en la lista) */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {view === "lista" ? <Users size={14} color={C.principal} /> : <Star size={14} color={C.principal} />}
          <span className="fl-display text-xs uppercase truncate" style={{ color: C.white }}>{view === "lista" ? "Lista del draft" : activeGroup?.label}</span>
        </div>
        {view === "lista" && (
          <span className="fl-mono text-[10px] flex-shrink-0" style={{ color: C.muted }}>{(isParticipant && myList ? myList.length : filteredPool.length)} JUGADORAS</span>
        )}
      </div>

      {view === "lista" && (isParticipant && !myList) && (
        <div className="relative mb-3">
          <Search size={13} color={C.muted} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar jugadora..."
            className="w-full fl-body text-xs rounded-lg py-2 pl-7 pr-3 outline-none" style={{ background: C.navy800, border: `1px solid ${C.line}`, color: C.white }} />
        </div>
      )}

      {view === "lista" && (
        <>
          {isParticipant && !myList && (
            <div className="mb-3">
              {draft.length > 0 && (
                <div className="flex gap-1.5 mb-3 overflow-x-auto fl-scrollbar pb-1">
                  {draft.map((id, i) => {
                    const p = players.find((x) => x.id === id);
                    if (!p) return null;
                    return (
                      <div key={id} className="flex-shrink-0 flex items-center gap-1 rounded-full pl-1 pr-2 py-1"
                        style={{ background: `${C.principal}18`, border: `1px solid ${C.principal}55` }}>
                        <span className="fl-mono text-[10px] font-bold flex items-center justify-center rounded-full flex-shrink-0"
                          style={{ width: 16, height: 16, background: `linear-gradient(135deg, ${C.principal}, ${C.baby})`, color: C.white }}>{i + 1}</span>
                        <span className="fl-body text-[11px] whitespace-nowrap" style={{ color: C.white }}>{p.name}</span>
                        <button onClick={() => moveUp(i)} disabled={i === 0} className="fl-tap disabled:opacity-20"><ChevronUp size={11} color={C.muted} /></button>
                        <button onClick={() => toggleDraftPick(id)} className="fl-tap"><X size={11} color={C.negative} /></button>
                      </div>
                    );
                  })}
                </div>
              )}

              {error && <div className="fl-mono text-[10px] mb-2" style={{ color: C.negative }}>{error}</div>}

              <div className="grid grid-cols-3 gap-2 max-h-[26rem] overflow-y-auto fl-scrollbar pb-1">
                {filteredPool.map((p) => {
                  const picked = draft.includes(p.id);
                  return (
                    <DraftPlayerCard key={p.id} p={p} teamCrests={teamCrests} selected={picked}
                      pickNumber={picked ? draft.indexOf(p.id) + 1 : null} onClick={() => toggleDraftPick(p.id)} />
                  );
                })}
                {filteredPool.length === 0 && (
                  <div className="col-span-3 fl-mono text-[11px] py-4 text-center" style={{ color: C.muted }}>
                    {pool.length === 0 ? "Ya no quedan jugadoras libres para esta ronda." : "Ninguna jugadora coincide con la búsqueda."}
                  </div>
                )}
              </div>

              <button onClick={submit} disabled={busy || draft.length === 0} className="fl-tap w-full rounded-full py-3 mt-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 fl-display uppercase tracking-wide"
                style={{ background: `linear-gradient(135deg, ${C.principal}, ${C.baby})`, color: C.white, boxShadow: `0 4px 18px ${C.principalSoft}` }}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <>Confirmar draft <ChevronRight size={15} /></>}
              </button>
            </div>
          )}

          {isParticipant && myList && (
            <div className="mb-3">
              <div className="fl-mono text-[10px] font-bold mb-2 flex items-center gap-1.5" style={{ color: C.positive }}><CircleCheck size={12} /> LISTA ENVIADA (bloqueada)</div>
              <div className="grid grid-cols-3 gap-2">
                {myList.map((id, i) => {
                  const p = players.find((x) => x.id === id);
                  if (!p) return null;
                  return <DraftPlayerCard key={id} p={p} teamCrests={teamCrests} pickNumber={i + 1} gotIt={mySquadIds.includes(id)} disabled />;
                })}
              </div>
            </div>
          )}

          {!isParticipant && (
            <div className="grid grid-cols-3 gap-2 max-h-[26rem] overflow-y-auto fl-scrollbar pb-1 mb-3">
              {filteredPool.map((p) => <DraftPlayerCard key={p.id} p={p} teamCrests={teamCrests} disabled />)}
              {filteredPool.length === 0 && <div className="col-span-3 fl-mono text-[11px] py-4 text-center" style={{ color: C.muted }}>Ya no quedan jugadoras libres para esta ronda.</div>}
            </div>
          )}
        </>
      )}

      {/* Pestañas PICKS N-M: para cada participante, quién marcó a quién en esos puestos de la lista.
          Solo visibles si tú ya has enviado la tuya (o si no participas, siempre visibles como espectador). */}
      {activeGroup && (
        canSeeOtherLists ? (
          <div className="space-y-2 mb-3">
            {playoffState.qualifiers.map((u) => {
              const isMe = u === profile.name;
              const list = (playoffState.lists[round] || {})[u];
              return (
                <div key={u} className="fl-row flex items-center gap-3 p-2.5" style={{ border: `1px solid ${C.principal}22` }}>
                  <div className="flex items-center justify-center fl-mono text-xs font-bold flex-shrink-0 rounded-full"
                    style={{ width: 32, height: 32, background: isMe ? `linear-gradient(135deg, ${C.principal}, ${C.baby})` : C.navy700, color: isMe ? C.white : C.muted }}>
                    {(u || "?")[0].toUpperCase()}
                  </div>
                  <span className="fl-body text-xs font-semibold flex-1 truncate" style={{ color: isMe ? C.baby : C.white }}>{u}{isMe ? " (tú)" : ""}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!list ? (
                      <span className="fl-mono text-[10px]" style={{ color: C.muted }}>Sin enviar</span>
                    ) : activeGroup.indices.map((idx) => {
                      const pid = list[idx];
                      const p = pid ? players.find((x) => x.id === pid) : null;
                      return (
                        <div key={idx} className="relative" style={{ width: 40, height: 40 }}>
                          <span className="absolute -top-1.5 -left-1.5 z-10 flex items-center justify-center fl-mono text-[9px] font-bold rounded-full"
                            style={{ width: 16, height: 16, background: `linear-gradient(135deg, ${C.principal}, ${C.baby})`, color: C.white }}>{idx + 1}</span>
                          {p ? <PlayerPhoto url={p.photo} size={40} rounded={8} /> : <div style={{ width: 40, height: 40, borderRadius: 8, background: C.navy700, border: `1px dashed ${C.line}` }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="fl-row p-4 text-center mb-3">
            <span className="fl-body text-xs" style={{ color: C.muted }}>Envía tu lista para poder ver la de los demás.</span>
          </div>
        )
      )}
    </div>
  );
}

function MercadoTab({ market, players, bids, marketHistory, activity, profile, myTeam, teams, isMarketOpen, budgetAvailable, onBid, onWithdrawBid, onBuyClause, offers, onSendOffer, onRespondOffer, jornadas, favoritos, onToggleFavorite, onSellImmediate, onToggleForSale, onAcceptSaleOffer, onRejectSaleOffer, onRaiseClause, teamCrests }) {
  const [sub, setSub] = useState("mercado");
  const [opSub, setOpSub] = useState("venta"); // dentro de "Mis operaciones": compra | venta
  const [clauseTarget, setClauseTarget] = useState(null); // { sellerName, asset }
  const [offerTarget, setOfferTarget] = useState(null); // { sellerName, asset }
  const [detailPlayer, setDetailPlayer] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const assets = (market.assetIds || []).map(id => players.find(p => p.id === id)).filter(Boolean);
  const myActiveBids = bids.filter(b => b.marketId === market.id && b.userId === profile.name && b.status === "active");
  const myPastBids = bids.filter(b => b.userId === profile.name && b.status !== "active" && b.marketId !== market.id);
  const receivedOffersCount = (offers || []).filter(o => o.status === "pending" && o.toUser === profile.name).length
    + (myTeam.squad || []).filter(e => e.forSale && e.saleOffer && (!e.saleOffer.expiresAt || Date.now() <= e.saleOffer.expiresAt)).length;
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
      <div className="sticky z-20 -mx-4 px-4 pb-2" style={{ top: "calc(env(safe-area-inset-top, 0px) + 78px)", background: C.navy900, paddingTop: 10 }}>
        <div className="flex items-center justify-between mb-3">
          <CountdownChip closesAt={market.closesAt} opensAt={market.opensAt} isOpen={isMarketOpen} />
          <div className="flex items-center gap-2">
            <div className="fl-mono text-xs flex items-center gap-1" style={{ color: C.baby }}><Wallet size={13} /> {fmtCredits(budgetAvailable)}</div>
            <button onClick={() => setShowSearch(true)} className="fl-tap p-2 rounded-md" style={{ border: `1px solid ${C.line}` }} title="Buscar jugadora o entrenadora/or">
              <Search size={19} color={C.white} />
            </button>
          </div>
        </div>
        <div className="flex gap-1.5">
          {[["mercado", "Mercado"], ["operaciones", "Mis operaciones"], ["historico", "Histórico"]].map(([k, l]) => (
            <button key={k} onClick={() => setSub(k)} className="fl-tap flex-1 fl-mono text-[11px] py-2 rounded-lg"
              style={{ background: sub === k ? C.baby : "transparent", color: sub === k ? C.ink : C.muted, border: sub === k ? "none" : `1px solid ${C.line}` }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">

      {sub === "mercado" && (
        <>
          {assets.length === 0 ? <EmptyState title="Sin activos en este mercado" text="El siguiente mercado se generará automáticamente al cerrar este." /> : (
            <div className="space-y-3">
              {assets.map(asset => (
                <AuctionCard key={asset.id} asset={asset} market={market} bids={bids} profile={profile} myTeam={myTeam}
                  isMarketOpen={isMarketOpen} budgetAvailable={budgetAvailable} onBid={onBid} onWithdrawBid={onWithdrawBid} onOpenPlayer={setDetailPlayer} teamCrests={teamCrests} />
              ))}
            </div>
          )}
          <EnVentaSection teams={teams} players={players} teamCrests={teamCrests} me={profile.name}
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
            <div className="space-y-4">
              <div>
                <div className="fl-mono text-[10px] mb-1.5" style={{ color: C.muted }}>OFERTAS DE LA LIGA</div>
                {(() => {
                  const misOfertasLiga = (myTeam.squad || []).filter(e => e.forSale && e.saleOffer && (!e.saleOffer.expiresAt || Date.now() <= e.saleOffer.expiresAt));
                  if (misOfertasLiga.length === 0) {
                    return <EmptyState compact title="Sin ofertas de la liga" text="Cuando pongas una jugadora en venta, la oferta que te haga la liga aparecerá aquí." />;
                  }
                  return (
                    <div className="space-y-1.5">
                      {misOfertasLiga.map(entry => {
                        const asset = players.find(p => p.id === entry.id);
                        if (!asset) return null;
                        return (
                          <div key={entry.id} className="fl-row flex items-center gap-2.5 px-3 py-2.5">
                            <button onClick={() => setDetailPlayer(asset)} className="fl-tap flex items-center gap-2.5 flex-1 min-w-0 text-left">
                              <PlayerPhoto url={asset.photo} size={38} />
                              <div className="flex-1 min-w-0">
                                <div className="fl-body text-sm font-medium truncate" style={{ color: C.white }}>{asset.name}</div>
                                <div className="fl-mono text-[10px]" style={{ color: C.muted }}>Oferta: {fmtCredits(entry.saleOffer.amount)}</div>
                              </div>
                            </button>
                            <div className="flex flex-col gap-1.5 flex-shrink-0">
                              <button onClick={() => onAcceptSaleOffer(asset.id)} className="fl-tap fl-mono text-[11px] font-semibold rounded-md px-2.5 py-1.5" style={{ background: C.positive, color: C.ink }}>
                                Aceptar
                              </button>
                              <button onClick={() => onRejectSaleOffer(asset.id)} className="fl-tap fl-mono text-[11px] font-semibold rounded-md px-2.5 py-1.5" style={{ border: `1px solid ${C.negative}`, color: C.negative }}>
                                Rechazar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <OfertasRecibidasList offers={offers || []} players={players} me={profile.name} onRespond={onRespondOffer} />
            </div>
          )}
        </div>
      )}

      {sub === "historico" && (
        <HistoricoTab marketHistory={marketHistory} players={players} bids={bids} profile={profile} myPastBids={myPastBids} activity={activity} />
      )}

      {detailPlayer && (
        <PlayerDetailScreen player={detailPlayer} jornadas={jornadas}
          entry={teamService.getSquadEntry(myTeam, detailPlayer.id)} isOwned={teamService.squadIds(myTeam).includes(detailPlayer.id)}
          isFavorite={(favoritos || []).includes(detailPlayer.id)} onToggleFavorite={() => onToggleFavorite(detailPlayer.id)}
          onSellImmediate={onSellImmediate} onToggleForSale={onToggleForSale} onAcceptSaleOffer={onAcceptSaleOffer} onRaiseClause={onRaiseClause}
          teams={teams} me={profile.name} budgetAvailable={budgetAvailable} onBuyClause={onBuyClause} onSendOffer={onSendOffer}
          onClose={() => setDetailPlayer(null)} />
      )}

      </div>

      {showSearch && (
        <PlayerSearchScreen players={players} jornadas={jornadas} teams={teams} myTeam={myTeam} me={profile.name} budgetAvailable={budgetAvailable} onBuyClause={onBuyClause} onSendOffer={onSendOffer}
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
function EnVentaSection({ teams, players, onSelectClause, onSelectOffer, onOpenPlayer, teamCrests, me }) {
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
          const isMine = owner === me;
          return (
            <div key={player.id} className="fl-row p-4 fl-pop">
              <div className="flex items-center gap-3.5">
                <button onClick={() => onOpenPlayer(player)} className="fl-tap flex items-center gap-3.5 flex-1 min-w-0 text-left">
                  <div className="relative flex-shrink-0" style={{ width: 76 }}>
                    <PlayerPhoto url={player.photo} width={76} height={96} rounded={14} focusTop />
                    <div className="absolute" style={{ top: -6, right: -6 }}><TeamCrest name={player.team} photo={teamCrests?.[player.team]} size={26} /></div>
                    <div className="absolute bottom-0" style={{ left: -6, right: -6, height: 3, borderRadius: 2, background: C.baby, boxShadow: `0 0 8px 1.5px ${C.baby}` }} />
                  </div>
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
                {isMine ? (
                  <span className="fl-mono text-[10px] flex-shrink-0" style={{ color: C.muted }}>En propiedad</span>
                ) : (
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
                )}
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
  const minEuros = Math.round((asset.basePrice || 1) * 1000000);
  const [amountEuros, setAmountEuros] = useState(String(minEuros));
  const [showKeypad, setShowKeypad] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError(""); setBusy(true);
    const res = await onConfirm(Number(amountEuros) / 1000000);
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
      <div className="flex items-center px-4 pb-3" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}>
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
        <button onClick={() => setShowKeypad(true)} className="w-full rounded-md px-3 py-2.5 text-sm fl-mono flex items-center justify-between"
          style={{ background: C.navy800, border: `1px solid ${C.line}`, color: C.white }}>
          <span>{fmtCredits(Number(amountEuros) / 1000000)}</span>
          <Pencil size={14} color={C.muted} />
        </button>
        <p className="fl-body text-[11px] mt-2" style={{ color: C.muted }}>{sellerName} decidirá si acepta o rechaza tu oferta. Nunca puede ser menor que su valor actual ({fmtCredits(asset.basePrice || 0)}), aunque la jugadora esté protegida por cláusula.</p>
        {error && <div className="fl-mono text-[11px] mt-3" style={{ color: C.negative }}>{error}</div>}
      </div>
      <div className="px-5 pb-3">
        <button onClick={submit} disabled={busy || !Number(amountEuros) || Number(amountEuros) < minEuros}
          className="fl-tap w-full rounded-md py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: C.principal, color: C.white }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : "Enviar oferta"}
        </button>
        <div className="text-center fl-mono text-[11px] mt-2.5 pb-2" style={{ color: C.muted }}>
          Tu saldo: <span style={{ color: C.baby, fontWeight: 600 }}>{fmtCredits(budgetAvailable)}</span>
        </div>
      </div>
      {showKeypad && (
        <AmountKeypadSheet title={`Oferta por ${asset.name}`} subtitle={`Tu saldo: ${fmtCredits(budgetAvailable)}`}
          valueEuros={amountEuros} onChange={setAmountEuros} minEuros={1}
          confirmLabel="Fijar importe" onConfirm={() => setShowKeypad(false)} onClose={() => setShowKeypad(false)} />
      )}
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
  const clauseEuros = Math.round(clause * 1000000);
  const [amountEuros, setAmountEuros] = useState(String(clauseEuros));
  const [showKeypad, setShowKeypad] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(""); setBusy(true);
    const res = await onConfirm(Number(amountEuros) / 1000000);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setShowKeypad(false);
  };

  return (
    <div className="fixed inset-0 z-20 flex flex-col" style={{ background: C.navy900 }}>
      <div className="flex items-center px-4 pb-3" style={{ borderBottom: `1px solid ${C.line}`, paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}>
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

        <button onClick={() => setShowKeypad(true)} className="fl-tap w-full flex items-center gap-2.5 px-3 py-2.5 mb-3" style={{ background: C.navy700, borderRadius: 12 }}>
          <div className="flex items-center justify-center rounded-full" style={{ width: 26, height: 26, background: C.gold }}>
            <Coins size={14} color={C.ink} />
          </div>
          <div className="flex-1 text-left">
            <div className="fl-mono text-[9px]" style={{ color: C.muted }}>IMPORTE</div>
            <div className="fl-mono text-sm font-semibold" style={{ color: C.white }}>{fmtCredits(Number(amountEuros) / 1000000)}</div>
          </div>
          <Pencil size={14} color={C.muted} />
        </button>
        <p className="fl-body text-[11px]" style={{ color: C.muted }}>Debes igualar o superar la cláusula ({fmtCredits(clause)}) para llevártela. La compra es inmediata: no hace falta esperar al cierre del mercado.</p>
        {error && <div className="fl-mono text-[11px] mt-3" style={{ color: C.negative }}>{error}</div>}
      </div>

      <div className="px-5 pb-3">
        <button onClick={submit} disabled={busy || Number(amountEuros) < clauseEuros}
          className="fl-tap w-full rounded-md py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: C.positive, color: C.ink }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : "Hacer oferta de compra"}
        </button>
        <div className="text-center fl-mono text-[11px] mt-2.5 pb-2" style={{ color: C.muted }}>
          Tu saldo: <span style={{ color: C.baby, fontWeight: 600 }}>{fmtCredits(budgetAvailable)}</span>
        </div>
      </div>

      {showKeypad && (
        <AmountKeypadSheet title={`Oferta por ${asset.name}`} subtitle={`Cláusula ${fmtCredits(clause)} · Tu saldo: ${fmtCredits(budgetAvailable)}`}
          valueEuros={amountEuros} onChange={setAmountEuros} minEuros={clauseEuros}
          confirmLabel="Fijar importe" onConfirm={() => setShowKeypad(false)} onClose={() => setShowKeypad(false)} />
      )}
    </div>
  );
}

function AuctionCard({ asset, market, bids, profile, myTeam, isMarketOpen, budgetAvailable, onBid, onWithdrawBid, onOpenPlayer, teamCrests }) {
  const [showKeypad, setShowKeypad] = useState(false);
  const minEuros = Math.round((asset.basePrice || 1) * 1000000);
  const [amountEuros, setAmountEuros] = useState(String(minEuros));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const bidCount = auctionService.bidsForAsset(bids, market.id, asset.id).filter(b => b.status === "active").length;
  const myBid = auctionService.userBidForAsset(bids, market.id, asset.id, profile.name);
  const owned = teamService.squadIds(myTeam).includes(asset.id);
  const status = owned ? "won" : myBid ? "active" : "none";

  const openKeypad = () => {
    setAmountEuros(String(myBid ? Math.round(myBid.amount * 1000000) : minEuros));
    setError("");
    setShowKeypad(true);
  };

  const submit = async () => {
    setError(""); setBusy(true);
    const val = Number(amountEuros) / 1000000; // de euros exactos a "millones" (unidad interna)
    const res = await onBid(asset, val);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setShowKeypad(false);
  };

  const withdraw = async () => {
    setWithdrawing(true);
    await onWithdrawBid(asset);
    setWithdrawing(false);
  };

  return (
    <div className="fl-row p-4 fl-pop">
      <div className="flex items-center gap-3.5">
        <button onClick={() => onOpenPlayer(asset)} className="fl-tap flex items-center gap-3.5 flex-1 min-w-0 text-left">
          <div className="relative flex-shrink-0" style={{ width: 76 }}>
            <PlayerPhoto url={asset.photo} width={76} height={96} rounded={14} focusTop />
            <div className="absolute" style={{ top: -6, right: -6 }}><TeamCrest name={asset.team} photo={teamCrests?.[asset.team]} size={26} /></div>
            <div className="absolute bottom-0" style={{ left: -6, right: -6, height: 3, borderRadius: 2, background: C.baby, boxShadow: `0 0 8px 1.5px ${C.baby}` }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <PositionBadge posKey={asset.position} size="md" />
              <span className="fl-display text-base uppercase truncate" style={{ color: C.white }}>{asset.name}</span>
            </div>
            <div className="fl-mono text-xs mt-0.5" style={{ color: C.muted }}>{asset.team}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="fl-mono text-sm font-semibold" style={{ color: C.baby }}>{fmtCredits(asset.basePrice || 1)}</span>
              <span className="fl-mono text-[11px]" style={{ color: C.muted }}>· {bidCount} {bidCount === 1 ? "puja" : "pujas"}</span>
            </div>
            <div className="mt-1.5"><BidStatusPill status={status} /></div>
          </div>
        </button>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <button onClick={openKeypad} disabled={!isMarketOpen || owned}
            className="fl-tap fl-mono text-xs font-semibold rounded-md px-3.5 py-2.5 disabled:opacity-40"
            style={{ background: owned ? "transparent" : C.baby, color: owned ? C.muted : C.ink, border: owned ? `1px solid ${C.line}` : "none" }}>
            {owned ? "Tuya" : myBid ? "Editar" : "Pujar"}
          </button>
          {myBid && !owned && (
            <button onClick={withdraw} disabled={!isMarketOpen || withdrawing}
              className="fl-tap fl-mono text-[11px] font-semibold rounded-md px-3.5 py-1.5 disabled:opacity-40"
              style={{ color: C.negative, border: `1px solid ${C.negative}` }}>
              {withdrawing ? <Loader2 size={12} className="animate-spin mx-auto" /> : "Retirar"}
            </button>
          )}
        </div>
      </div>
      {error && <div className="fl-mono text-[10px] mt-2" style={{ color: C.negative }}>{error}</div>}
      {showKeypad && (
        <AmountKeypadSheet title={`Puja por ${asset.name}`} subtitle={`Mínimo ${fmtCredits(asset.basePrice || 1)} · Tu saldo: ${fmtCredits(budgetAvailable)}`}
          valueEuros={amountEuros} onChange={setAmountEuros} minEuros={minEuros}
          confirmLabel={busy ? "Confirmando…" : "Confirmar puja"}
          onConfirm={submit} onClose={() => setShowKeypad(false)} />
      )}
    </div>
  );
}

function HistoricoTab({ marketHistory, players, bids, profile, myPastBids, activity }) {
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
  (activity || []).filter(a => a.userId === profile.name && a.type === "venta").forEach(a => {
    const asset = players.find(p => p.id === a.assetId);
    rows.push({ id: a.id, ts: a.ts, text: `Has vendido a ${asset?.name || "una jugadora"} por ${fmtCredits(a.amount)}`, positive: true });
  });
  (activity || []).filter(a => a.type === "clausula" && (a.buyerName === profile.name || a.sellerName === profile.name)).forEach(a => {
    const asset = players.find(p => p.id === a.assetId);
    if (a.buyerName === profile.name) {
      rows.push({ id: a.id, ts: a.ts, text: `Has pagado la cláusula de ${asset?.name || "una jugadora"} por ${fmtCredits(a.amount)}`, positive: true });
    } else {
      rows.push({ id: a.id, ts: a.ts, text: `Te han clausulado a ${asset?.name || "una jugadora"} por ${fmtCredits(a.amount)}`, positive: false });
    }
  });
  (activity || []).filter(a => a.type === "oferta" && (a.buyerName === profile.name || a.sellerName === profile.name)).forEach(a => {
    const asset = players.find(p => p.id === a.assetId);
    if (a.buyerName === profile.name) {
      rows.push({ id: a.id, ts: a.ts, text: `Te han aceptado tu oferta por ${asset?.name || "una jugadora"}, ${fmtCredits(a.amount)}`, positive: true });
    } else {
      rows.push({ id: a.id, ts: a.ts, text: `Has vendido a ${asset?.name || "una jugadora"} por ${fmtCredits(a.amount)} (oferta aceptada)`, positive: true });
    }
  });
  rows.sort((a, b) => b.ts - a.ts);
  if (rows.length === 0) return <EmptyState title="Sin operaciones todavía" text="Cuando se resuelva un mercado o hagas una venta, aquí verás tus fichajes, ventas y pujas perdidas." />;
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
function MasTab({ activity, players, onAdvanceSimDay, onExitSimMode, onResetTest, onDebugLineupLock }) {
  const [simDate, setSimDate] = useState(undefined); // undefined = cargando, null = sin simular
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [debugJornadaId, setDebugJornadaId] = useState("j1");
  const [debugSteps, setDebugSteps] = useState(null);
  const [debugBusy, setDebugBusy] = useState(false);

  useEffect(() => {
    (async () => { setSimDate(await readShared("marketSimDate", null)); })();
  }, []);

  const advance = async () => {
    setBusy(true);
    const next = await onAdvanceSimDay();
    setSimDate(next);
    setBusy(false);
  };
  const exit = async () => {
    setBusy(true);
    await onExitSimMode();
    setSimDate(null);
    setBusy(false);
  };
  const doReset = async () => {
    setBusy(true);
    await onResetTest();
    setSimDate(null);
    setBusy(false);
    setConfirmReset(false);
  };
  const runDebug = async () => {
    setDebugBusy(true);
    setDebugSteps(null);
    const steps = await onDebugLineupLock(debugJornadaId.trim() || "j1");
    setDebugSteps(steps);
    setDebugBusy(false);
  };

  return (
    <div>
      <div className="fl-row p-3.5 mb-4" style={{ border: `1px solid ${C.gold}55` }}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <FlaskConical size={14} color={C.gold} />
          <span className="fl-mono text-[10px] font-bold tracking-wide" style={{ color: C.gold }}>MODO PRUEBAS — MERCADO</span>
        </div>
        <p className="fl-body text-xs mb-2.5" style={{ color: C.muted }}>
          Adelanta un día "de mentira" para ver cómo se mueve el mercado sin esperar a la medianoche real: mueve precios y también resuelve el mercado de tu liga actual (entrega jugadoras a quien más pujó). Como el precio es global, esto se ve en cualquier liga.
        </p>
        <div className="fl-mono text-[11px] mb-2.5" style={{ color: C.white }}>
          {simDate === undefined ? "Cargando…" : simDate ? <>Simulando: <span style={{ color: C.gold, fontWeight: 700 }}>{simDate}</span></> : "Sin simular (fecha real)"}
        </div>
        <div className="flex gap-2 mb-2">
          <button disabled={busy} onClick={advance} className="fl-tap flex-1 rounded-md py-2 text-xs font-semibold disabled:opacity-50" style={{ background: C.gold, color: C.ink }}>
            {busy ? <Loader2 size={13} className="animate-spin mx-auto" /> : "Avanzar 1 día"}
          </button>
          {simDate && (
            <button disabled={busy} onClick={exit} className="fl-tap rounded-md py-2 px-3 text-xs font-semibold disabled:opacity-50" style={{ border: `1px solid ${C.line}`, color: C.muted }}>
              Salir
            </button>
          )}
        </div>

        {confirmReset ? (
          <div className="rounded-md p-2.5 mb-2.5" style={{ background: `${C.negative}15`, border: `1px solid ${C.negative}` }}>
            <p className="fl-body text-[11px] mb-2" style={{ color: C.white }}>
              Esto borra estadísticas y resultados de partidos, y devuelve los precios a como estaban antes de empezar esta ronda de pruebas. No se puede deshacer. ¿Seguro?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => setConfirmReset(false)} className="fl-tap rounded-md py-1.5 text-[11px] font-semibold" style={{ border: `1px solid ${C.line}`, color: C.white }}>
                Cancelar
              </button>
              <button disabled={busy} onClick={doReset} className="fl-tap rounded-md py-1.5 text-[11px] font-semibold flex items-center justify-center gap-1.5" style={{ background: C.negative, color: C.white }}>
                {busy ? <Loader2 size={12} className="animate-spin" /> : "Sí, reiniciar"}
              </button>
            </div>
          </div>
        ) : (
          <button disabled={busy} onClick={() => setConfirmReset(true)} className="fl-tap w-full rounded-md py-2 text-xs font-semibold mb-2.5" style={{ border: `1px solid ${C.negative}`, color: C.negative }}>
            Reiniciar prueba
          </button>
        )}

        <div className="pt-2.5" style={{ borderTop: `1px solid ${C.line}` }}>
          <div className="fl-mono text-[10px] font-bold tracking-wide mb-1.5" style={{ color: C.gold }}>DIAGNÓSTICO: BLOQUEO DE ALINEACIÓN</div>
          <div className="flex gap-2 mb-2">
            <input value={debugJornadaId} onChange={(e) => setDebugJornadaId(e.target.value)} placeholder="id de jornada (ej. j1)"
              className="flex-1 rounded-md px-2.5 py-1.5 fl-mono text-xs" style={{ background: C.navy900, border: `1px solid ${C.line}`, color: C.white }} />
            <button disabled={debugBusy} onClick={runDebug} className="fl-tap rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ border: `1px solid ${C.gold}`, color: C.gold }}>
              {debugBusy ? <Loader2 size={13} className="animate-spin" /> : "Probar"}
            </button>
          </div>
          {debugSteps && (
            <div className="rounded-md p-2.5 space-y-1" style={{ background: C.navy900 }}>
              {debugSteps.map((s, i) => (
                <div key={i} className="fl-mono text-[10px]" style={{ color: s.startsWith("❌") ? C.negative : s.startsWith("⛔") ? C.gold : s.startsWith("✅") ? C.positive : C.muted }}>
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ActividadFeed activity={activity} players={players} />
    </div>
  );
}

function ActividadFeed({ activity, players }) {
  if (activity.length === 0) return <EmptyState title="Sin actividad todavía" text="Los fichajes, ventas y premios de la liga aparecerán aquí." />;
  return (
    <div className="space-y-1.5">
      {activity.map(a => {
        const asset = players.find(p => p.id === a.assetId);
        let text;
        if (a.type === "venta") {
          text = <>
            <span style={{ color: C.baby }}>{a.userId}</span> ha vendido a <span className="font-medium">{asset?.name || "una jugadora"}</span> a la liga por {fmtCredits(a.amount)}
          </>;
        } else if (a.type === "triple") {
          text = <>
            <span style={{ color: C.baby }}>{a.userId}</span> ha ganado <span className="font-medium">{fmtCredits(a.amount)}</span> en el 🏀 Triple Fantasy
          </>;
        } else if (a.type === "union") {
          text = <>
            <span style={{ color: C.positive }}>{a.userId}</span> se ha unido a la liga 🎉
          </>;
        } else if (a.type === "expulsion") {
          text = <>
            <span style={{ color: C.negative }}>{a.userId}</span> ha sido expulsada/o de la liga
          </>;
        } else if (a.type === "clausula") {
          text = <>
            <span style={{ color: C.baby }}>{a.buyerName}</span> le ha pagado la cláusula a <span style={{ color: C.baby }}>{a.sellerName}</span> por <span className="font-medium">{asset?.name || "una jugadora"}</span>, {fmtCredits(a.amount)}
          </>;
        } else if (a.type === "oferta") {
          text = <>
            <span style={{ color: C.baby }}>{a.sellerName}</span> le ha vendido a <span style={{ color: C.baby }}>{a.buyerName}</span> <span className="font-medium">{asset?.name || "una jugadora"}</span> por {fmtCredits(a.amount)} (oferta aceptada)
          </>;
        } else if (a.type === "playoff_start") {
          text = <>🏆 ¡Empiezan los <span style={{ color: C.gold, fontWeight: 700 }}>playoffs</span>! Clasificados: {(a.qualifiers || []).join(", ")}</>;
        } else if (a.type === "playoff_advance") {
          text = <>🔥 Fin de <span style={{ color: C.gold }}>{a.round === "CUARTOS" ? "Cuartos" : "Semis"}</span>. Pasan: {(a.advancing || []).join(", ")}</>;
        } else if (a.type === "playoff_champion") {
          text = <>🏆🏀 <span style={{ color: C.gold, fontWeight: 700 }}>{a.champion}</span> es la campeona/ón de los playoffs</>;
        } else {
          text = <>
            <span style={{ color: C.baby }}>{a.userId}</span> ha fichado a <span className="font-medium">{asset?.name || "una jugadora"}</span> por {fmtCredits(a.amount)}
          </>;
        }
        return (
          <div key={a.id} className="fl-row px-3 py-2.5">
            <div className="fl-body text-sm" style={{ color: C.white }}>{text}</div>
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
                const s = stats[p.id] || {}; const pts = calcPlayerPoints(s, p.position, resolveCoachWin(jornada, p.team));
                return (
                  <tr key={p.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                    <td className="py-1.5 pr-2" style={{ color: C.white }}><div className="font-medium">{p.name}</div><PositionBadge posKey={p.position} /></td>
                    <td className="text-center">{resolveCoachWin(jornada, p.team) != null ? "Sí" : "No"}</td>
                    <td className="text-center">{resolveCoachWin(jornada, p.team) === true ? "Sí" : resolveCoachWin(jornada, p.team) === false ? "No" : "—"}</td>
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
