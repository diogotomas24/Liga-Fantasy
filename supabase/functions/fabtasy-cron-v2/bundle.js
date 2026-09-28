// tz-shim.js
var G0 = globalThis.Date;
var t0 = 0, x$ = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }), j0 = /* @__PURE__ */ new Map;
function m0($) {
let Q = Math.floor($ / 60000), X = j0.get(Q);
if (X !== void 0)
return X;
let Z = {};
for (let G of x$.formatToParts(new G0($)))
Z[G.type] = G.value;
let V = G0.UTC(+Z.year, +Z.month - 1, +Z.day, +Z.hour, +Z.minute, +Z.second) - ($ - ($ % 1000 + 1000) % 1000);
if (j0.size > 5000)
j0.clear();
return j0.set(Q, V), V;
}
function s0($, Q, X, Z, Y, V, G) {
let U = G0.UTC($, Q, X, Z, Y, V, G), W = U - m0(U);
return W = U - m0(W), W;
}
var c$ = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
function K$($) {
let Q = c$.exec(String($).trim());
if (!Q)
return null;
return s0(+Q[1], +Q[2] - 1, +Q[3], +Q[4], +Q[5], +(Q[6] || 0), +(Q[7] || "0").padEnd(3, "0"));
}

class a0 extends G0 {
constructor(...$) {
if ($.length === 0) {
super(G0.now() + t0);
return;
}
if ($.length === 1) {
let W = $[0];
if (typeof W === "string") {
let z = K$(W);
super(z != null ? z : W);
return;
}
super(W instanceof G0 ? W.getTime() : W);
return;
}
let [Q, X, Z = 1, Y = 0, V = 0, G = 0, U = 0] = $;
super(s0(Q, X, Z, Y, V, G, U));
}
static now() {
return G0.now() + t0;
}
static parse($) {
let Q = K$($);
return Q != null ? Q : G0.parse($);
}
static UTC(...$) {
return G0.UTC(...$);
}
}
var $0 = a0.prototype, J0 = ($) => new G0($.getTime() + m0($.getTime()));
$0.getFullYear = function() {
return J0(this).getUTCFullYear();
};
$0.getMonth = function() {
return J0(this).getUTCMonth();
};
$0.getDate = function() {
return J0(this).getUTCDate();
};
$0.getDay = function() {
return J0(this).getUTCDay();
};
$0.getHours = function() {
return J0(this).getUTCHours();
};
$0.getMinutes = function() {
return J0(this).getUTCMinutes();
};
$0.getSeconds = function() {
return J0(this).getUTCSeconds();
};
$0.getMilliseconds = function() {
return J0(this).getUTCMilliseconds();
};
$0.getTimezoneOffset = function() {
return -m0(this.getTime()) / 60000;
};
function E0($, Q) {
let X = J0($);
Q(X);
let Z = s0(X.getUTCFullYear(), X.getUTCMonth(), X.getUTCDate(), X.getUTCHours(), X.getUTCMinutes(), X.getUTCSeconds(), X.getUTCMilliseconds());
return G0.prototype.setTime.call($, Z), Z;
}
$0.setFullYear = function(...$) {
return E0(this, (Q) => Q.setUTCFullYear(...$));
};
$0.setMonth = function(...$) {
return E0(this, (Q) => Q.setUTCMonth(...$));
};
$0.setDate = function(...$) {
return E0(this, (Q) => Q.setUTCDate(...$));
};
$0.setHours = function(...$) {
return E0(this, (Q) => Q.setUTCHours(...$));
};
$0.setMinutes = function(...$) {
return E0(this, (Q) => Q.setUTCMinutes(...$));
};
$0.setSeconds = function(...$) {
return E0(this, (Q) => Q.setUTCSeconds(...$));
};
$0.setMilliseconds = function(...$) {
return E0(this, (Q) => Q.setUTCMilliseconds(...$));
};
var e0 = ($) => ({ timeZone: "Europe/Madrid", ...$ || {} });
$0.toLocaleString = function($, Q) {
return G0.prototype.toLocaleString.call(this, $, e0(Q));
};
$0.toLocaleDateString = function($, Q) {
return G0.prototype.toLocaleDateString.call(this, $, e0(Q));
};
$0.toLocaleTimeString = function($, Q) {
return G0.prototype.toLocaleTimeString.call(this, $, e0(Q));
};
globalThis.Date = a0;
function $$($) {
t0 = Number($) || 0;
}

// server-client.js
var g0 = null, Q$ = !1, n0 = [], p0 = [], y$ = /* @__PURE__ */ new Set(["insert", "update", "upsert", "delete"]);
function u$($, Q, X) {
try {
if ($ === "kv_store" && X && X.key) {
let Y = JSON.stringify(X.value);
return { table: $, op: Q, key: X.key, value: Y && Y.length > 300 ? Y.slice(0, 300) + "\u2026" : Y };
}
let Z = JSON.stringify(X);
return { table: $, op: Q, payload: Z && Z.length > 300 ? Z.slice(0, 300) + "\u2026" : Z };
} catch {
return { table: $, op: Q };
}
}
function j$($) {
let X = new Proxy(function() {}, {
get(Z, Y) {
if (Y === "then")
return (V) => V({ data: null, error: null });
return (...V) => {
return ($.filters ||= []).push(`${String(Y)}(${V.map((G) => JSON.stringify(G)).join(",")})`), X;
};
}
});
return X;
}
function m$($, Q) {
return new Proxy($, {
get(X, Z) {
if (Q$ && y$.has(Z))
return (V) => {
let G = u$(Q, Z, V);
return n0.push(G), j$(G);
};
let Y = X[Z];
return typeof Y === "function" ? Y.bind(X) : Y;
}
});
}
var n = new Proxy({}, {
get($, Q) {
if (Q === "from")
return (Z) => m$(g0.from(Z), Z);
if (Q === "functions")
return {
invoke: (Z, Y) => {
if (Q$)
return n0.push({ invoke: Z, body: Y && Y.body }), Promise.resolve({ data: null, error: null });
let V = g0.functions.invoke(Z, Y).catch(() => ({ data: null, error: "invoke failed" }));
return p0.push(V), V;
}
};
let X = g0[Q];
return typeof X === "function" ? X.bind(g0) : X;
}
});
function _$($, { dry: Q = !1 } = {}) {
g0 = $, Q$ = !!Q, n0 = [], p0 = [];
}
function R$() {
return n0;
}
async function J$($ = 20000) {
let Q = Promise.allSettled(p0);
return await Promise.race([Q, new Promise((X) => setTimeout(X, $))]), p0.length;
}

// react-stub.js
var F$ = () => {};
var D$ = ($) => ({ Provider: F$, Consumer: F$, _v: $ });

// core.jsx
var D0 = {
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
baby: "#FF8A00",
babyDark: "#CC6E00",
babySoft: "rgba(255,138,0,0.14)",
principal: "#FF3D7F",
principalSoft: "rgba(255,61,127,0.16)",
gold: "#FFC83D",
positive: "#35E59A",
negative: "#FF5C7A"
}, p$ = 100;
var n$ = 8, d$ = 1, I$ = 12;
var l$ = [
{ key: "BASE", label: "Base", short: "B", fill: D0.baby, textOn: D0.ink },
{ key: "ALERO", label: "Alero", short: "A", fill: D0.navy600, textOn: D0.white },
{ key: "PIVOT", label: "P\u00EDvot", short: "P", fill: D0.white, textOn: D0.ink }
], i$ = { key: "DT", label: "Entrenadora/or", short: "DT", fill: D0.gold, textOn: D0.ink };
var o$ = [...l$, i$], s8 = Object.fromEntries(o$.map(($) => [$.key, $])), b$ = {
"2-2-1": { BASE: 2, ALERO: 2, PIVOT: 1 },
"1-3-1": { BASE: 1, ALERO: 3, PIVOT: 1 },
"1-2-2": { BASE: 1, ALERO: 2, PIVOT: 2 },
"2-1-2": { BASE: 2, ALERO: 1, PIVOT: 2 },
"2-3-0": { BASE: 2, ALERO: 3, PIVOT: 0 }
}, X$ = { y: 2026, m: 8, d: 28 };
function r$($) {
let Q = new Date(X$.y, X$.m, X$.d, 0, 0, 0, 0).getTime();
return ($ ?? H$()) >= Q;
}
function t$($) {
return Object.keys(b$).filter((Q) => Q !== "2-3-0" || r$($));
}
function W$($, Q, X, Z) {
let Y = Array.isArray($) ? [...$] : [];
if (Y.length === 0 && Number.isFinite(Number(Q)) && Number(Q) > 0) {
let V = /* @__PURE__ */ new Date(`${X}T12:00:00`);
V.setDate(V.getDate() - 1);
let G = `${V.getFullYear()}-${String(V.getMonth() + 1).padStart(2, "0")}-${String(V.getDate()).padStart(2, "0")}`;
Y.push({ date: G, value: Number(Q) });
}
return Y.push({ date: X, value: Z }), Y.slice(-60);
}
var s$ = ($) => ($ || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""), P0 = ($) => `${$}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, a$ = () => 1.45 + Math.random() * 0.20999999999999996;
function U$($) {
let Q = [...$];
for (let X = Q.length - 1;X > 0; X--) {
let Z = Math.floor(Math.random() * (X + 1));
[Q[X], Q[Z]] = [Q[Z], Q[X]];
}
return Q;
}
function f0($) {
return `${Math.round(($ || 0) * 1e6).toLocaleString("es-ES")} \u20AC`;
}
var e$ = /* @__PURE__ */ new Set(["j1"]);
function $6($, Q) {
let X = $ || {}, Z = e$.has(X._jornada), Y = X.robos || 0, V = Q === "PIVOT", G = X.minutos || 0, U = X.puntos || 0, W = X.asist || 0, z = X.tlibre || 0, R = X.t3 || 0, H = (X.rebofen || 0) + (X.rebdefe || 0), q = X.pd || 0, D = X.tap || 0, J = X.faltas || 0, B = X.valoracion || 0, L = G <= 0 ? { minutos: 0, puntos: 0, asist: 0, tlibre: 0, t3: 0, rebotes: 0, pd: 0, tap: 0, robos: 0, faltas: 0, valoracion: 0 } : {
minutos: G >= 20 ? 2 : 1,
puntos: Math.floor(U / 4),
asist: Math.floor(W / 2),
tlibre: -Math.floor(z / 2),
t3: V ? R * 2 : R * 1,
rebotes: V ? Math.floor(H / 3) : Math.floor(H / 2),
pd: V ? -Math.floor(q / 3) : -Math.floor(q / 2),
tap: Z ? V ? Math.floor(D / 2) : D : D,
robos: Z ? 0 : Math.floor(Y / 2),
faltas: J >= 5 ? -3 : -Math.floor(J / 3),
valoracion: B <= 0 ? 0 : B <= 5 ? 1 : B <= 10 ? 2 : B <= 15 ? 3 : 4
}, j = [
{ key: "minutos", label: "Minutos jugados", cantidad: G, pts: L.minutos },
{ key: "puntos", label: "Puntos anotados", cantidad: U, pts: L.puntos },
{ key: "asist", label: "Asistencias", cantidad: W, pts: L.asist },
{ key: "tlibre", label: "Tiros libres fallados", cantidad: z, pts: L.tlibre },
{ key: "t3", label: "Triples anotados", cantidad: R, pts: L.t3 },
{ key: "rebotes", label: "Rebotes totales", cantidad: H, pts: L.rebotes },
{ key: "pd", label: "P\u00E9rdidas", cantidad: q, pts: L.pd },
{ key: "tap", label: "Tapones", cantidad: D, pts: L.tap },
...Z ? [] : [{ key: "robos", label: "Robos", cantidad: Y, pts: L.robos }],
{ key: "faltas", label: "Faltas", cantidad: J, pts: L.faltas },
{ key: "valoracion", label: "Puntos SWISH", cantidad: B, pts: L.valoracion }
];
return { breakdown: j, total: j.reduce((Q0, F0) => Q0 + F0.pts, 0) };
}
function q$($, Q) {
if (!$ || !Q)
return null;
for (let X of $.partidos || []) {
if (X.local !== Q && X.visitante !== Q)
continue;
let Z = t.matchWinner(X);
if (!Z)
return null;
return Z === "local" === (X.local === Q);
}
return null;
}
function r0($, Q) {
let X = $ || {}, Z = Q != null ? Q : !!X.victoria;
return { breakdown: [
{ key: "victoria", label: Z ? "Partido ganado" : "Partido no ganado", cantidad: Z ? 1 : 0, pts: Z ? 5 : 0 }
], total: Z ? 5 : 0 };
}
function c0($, Q, X) {
return Q === "DT" ? r0($, X) : $6($, Q);
}
function I0($, Q, X) {
if (Q === "DT")
return r0($, X).total;
if (!$)
return 0;
return c0($, Q).total;
}
function h$($, Q, X, Z) {
let V = $.lineups && $.lineups[Q] || (u0($) ? null : X);
if (!V)
return null;
if (V.debtLocked)
return null;
if ((V.starters || []).length < 5)
return null;
let G = V.bench || {}, U = V.captainId, W = {};
(V.starters || []).forEach((R) => {
let H = Z.find((J) => J.id === R);
if (!H)
return;
let q = I0($.stats?.[R], H.position), D = R === U ? q * 2 : q;
(W[H.position] = W[H.position] || []).push({ id: R, effective: D });
});
let z = /* @__PURE__ */ new Set;
if (Object.entries(W).forEach(([R, H]) => {
let q = G[R];
if ((q ? Z.find((J) => J.id === q) : null) && H.length > 0) {
let J = I0($.stats?.[q], R), B = 0;
if (H.forEach((I, L) => {
if (I.effective < H[B].effective)
B = L;
}), J > H[B].effective)
H[B] = { id: q, effective: J };
}
H.forEach((J) => z.add(J.id));
}), V.titularCoach)
z.add(V.titularCoach);
return z;
}
function O$($, Q, X, Z) {
let Y = h$($, Q, X, Z);
if (!Y)
return 0;
let U = ($.lineups && $.lineups[Q] || (u0($) ? null : X)).captainId, W = 0;
return Y.forEach((z) => {
let R = Z.find((H) => H.id === z);
if (!R)
return;
if (R.position === "DT")
W += I0($.stats?.[z], R.position, q$($, R.team));
else {
let H = I0($.stats?.[z], R.position);
W += z === U ? H * 2 : H;
}
}), W;
}
var Q6 = 14, B$ = Q6 * 24 * 3600 * 1000, a = {
emptyTeam() {
return {
budgetTotal: p$,
budgetSpent: 0,
squad: [],
lineup: { formation: "2-2-1", starters: [], bench: { BASE: null, ALERO: null, PIVOT: null }, titularCoach: null, captainId: null }
};
},
squadIds($) {
return ($?.squad || []).map((Q) => Q.id);
},
currentSquadValue($, Q) {
let X = new Set(a.squadIds($));
return Q.filter((Z) => X.has(Z.id)).reduce((Z, Y) => Z + (Y.basePrice || 0), 0);
},
maxDebt($, Q) {
return a.currentSquadValue($, Q) * 0.2;
},
squadJugadorasCount($, Q) {
let X = new Set(a.squadIds($));
return Q.filter((Z) => X.has(Z.id) && Z.position !== "DT").length;
},
hasRoomForSquad($, Q) {
return a.squadJugadorasCount($, Q) < I$;
},
hasRoomForCoach($, Q) {
let X = new Set(a.squadIds($));
return Q.filter((Z) => X.has(Z.id) && Z.position === "DT").length < d$;
},
clauseAcquiredAt($) {
return Math.min($?.acquiredAt || 0, z0().getTime());
},
isClauseLocked($) {
return z0().getTime() < a.clauseAcquiredAt($) + B$;
},
clauseUnlockAt($) {
return a.clauseAcquiredAt($) + B$;
},
addAsset($, Q, X) {
return { ...$, squad: [...$.squad || [], { id: Q.id, pricePaid: X, clause: X, acquiredAt: z0().getTime() }], budgetSpent: ($.budgetSpent || 0) + X };
},
addInitialSquad($, Q) {
let X = Q.map((Z) => ({
id: Z.id,
pricePaid: Z.price,
acquiredAt: z0().getTime(),
initial: !0,
clause: Math.round(Z.price * a$())
}));
return { ...$, squad: [...$.squad || [], ...X] };
},
receiveTransfer($, Q, X) {
return { ...$, squad: [...$.squad || [], { id: Q.id, pricePaid: X, clause: X, acquiredAt: z0().getTime(), transferred: !0 }], budgetSpent: ($.budgetSpent || 0) + X };
},
receiveSaleProceeds($, Q, X) {
let Z = a.removeAsset($, Q);
return { ...Z, budgetSpent: (Z.budgetSpent || 0) - X };
},
getSquadEntry($, Q) {
return ($?.squad || []).find((X) => X.id === Q) || null;
},
setForSale($, Q, X) {
let Z = ($.squad || []).map((Y) => Y.id === Q ? { ...Y, forSale: X, saleOffer: X ? Y.saleOffer : null } : Y);
return { ...$, squad: Z };
},
setSaleOffer($, Q, X) {
let Z = ($.squad || []).map((Y) => Y.id === Q ? { ...Y, saleOffer: X } : Y);
return { ...$, squad: Z };
},
raiseClause($, Q, X) {
let Z = ($.squad || []).map((Y) => Y.id === Q ? { ...Y, clause: (Y.clause || 0) + X * 2 } : Y);
return { ...$, squad: Z, budgetSpent: ($.budgetSpent || 0) + X };
},
bumpClausesToMarket($, Q) {
let X = !1, Z = ($.squad || []).map((Y) => {
let V = Q.find((U) => U.id === Y.id);
if (!V)
return Y;
let G = V.basePrice || 0;
if (G > (Y.clause || 0))
return X = !0, { ...Y, clause: G };
return Y;
});
return X ? { ...$, squad: Z } : $;
},
removeAsset($, Q) {
let X = ($.squad || []).filter((V) => V.id !== Q), Z = $.lineup?.bench ? { ...$.lineup.bench } : { BASE: null, ALERO: null, PIVOT: null };
Object.keys(Z).forEach((V) => {
if (Z[V] === Q)
Z[V] = null;
});
let Y = $.lineup ? {
...$.lineup,
starters: ($.lineup.starters || []).filter((V) => V !== Q),
bench: Z,
titularCoach: $.lineup.titularCoach === Q ? null : $.lineup.titularCoach
} : $.lineup;
return { ...$, squad: X, lineup: Y };
},
autoDraftSquad($, Q, X) {
let { min: Z, max: Y } = Q, V = { BASE: 2, ALERO: 2, PIVOT: 1 }, G = { BASE: [], ALERO: [], PIVOT: [] };
$.forEach((W) => {
if (G[W.position])
G[W.position].push(W);
});
let U = null;
for (let W = 0;W < 80; W++) {
let z = [], R = 0, H = !0;
for (let q of Object.keys(V)) {
let D = U$(G[q]), J = 0;
for (let B of D) {
if (J >= V[q])
break;
let I = Math.max(1, B.basePrice || 1);
if (R + I > Y)
continue;
z.push({ id: B.id, price: I, position: B.position }), R += I, J++;
}
if (J < V[q])
H = !1;
}
if (H) {
let q = U$($.filter((D) => !z.some((J) => J.id === D.id)));
for (let D of q) {
if (z.length >= X)
break;
let J = Math.max(1, D.basePrice || 1);
if (R + J > Y)
continue;
z.push({ id: D.id, price: J, position: D.position }), R += J;
}
}
if (H && z.length === X && R >= Z && R <= Y)
return z;
if (H && (!U || z.length > U.picked.length || z.length === U.picked.length && R > U.total))
U = { picked: z, total: R };
}
return U ? U.picked : [];
}
}, x0 = {
activeBidsForMarket($, Q) {
return $.filter((X) => X.marketId === Q && X.status === "active");
},
bidsForAsset($, Q, X) {
return $.filter((Z) => Z.marketId === Q && Z.assetId === X);
},
userBidForAsset($, Q, X, Z) {
return $.find((Y) => Y.marketId === Q && Y.assetId === X && Y.userId === Z && Y.status === "active") || null;
},
committedByUser($, Q, X, Z) {
return $.filter((Y) => Y.marketId === Q && Y.userId === X && Y.status === "active" && Y.assetId !== Z).reduce((Y, V) => Y + V.amount, 0);
},
availableBudget($, Q, X, Z, Y) {
let V = x0.committedByUser(Q, X, Z, Y);
return ($.budgetTotal || 0) - ($.budgetSpent || 0) - V;
},
validateBid({ team: $, players: Q, asset: X, amount: Z, marketOpen: Y, bids: V, marketId: G, userId: U }) {
if (!Y)
return { ok: !1, error: "El mercado est\u00E1 cerrado ahora mismo." };
if (!Number.isFinite(Z) || Z <= 0)
return { ok: !1, error: "Introduce un importe v\u00E1lido." };
let W = Math.round((X.basePrice || 0) * 1e6);
if (Math.round(Z * 1e6) < W)
return { ok: !1, error: `La puja m\u00EDnima es ${f0(X.basePrice || 0)}.` };
if (new Set(a.squadIds($)).has(X.id))
return { ok: !1, error: "Ya la tienes en tu plantilla." };
if (X.position === "DT") {
if (!a.hasRoomForCoach($, Q))
return { ok: !1, error: "Ya tienes entrenadora/or. Lib\u00E9rala primero para pujar por otra." };
} else if (!a.hasRoomForSquad($, Q))
return { ok: !1, error: `Tu plantilla ya tiene el m\u00E1ximo de ${I$} jugadoras. Libera a alguna antes de pujar.` };
let R = x0.availableBudget($, V, G, U, X.id);
if (Z > R + a.maxDebt($, Q))
return { ok: !1, error: `Superar\u00EDas tu l\u00EDmite de endeudamiento (20% del valor de tu plantilla). Disponible: ${f0(R)}.` };
return { ok: !0 };
},
upsertBid($, { marketId: Q, assetId: X, userId: Z, amount: Y }) {
let V = $.findIndex((U) => U.marketId === Q && U.assetId === X && U.userId === Z && U.status === "active"), G = K0();
if (V >= 0) {
let U = [...$];
return U[V] = { ...U[V], amount: Y, createdAt: G }, U;
}
return [...$, { id: P0("bid"), marketId: Q, assetId: X, userId: Z, amount: Y, createdAt: G, status: "active" }];
},
withdrawBid($, { marketId: Q, assetId: X, userId: Z }) {
return $.filter((Y) => !(Y.marketId === Q && Y.assetId === X && Y.userId === Z && Y.status === "active"));
},
resolveMarket($, Q, X, Z) {
let Y = { ...Z }, V = [...Q], G = [], U = [], W = x0.ownedIdsOf(Z);
($.assetIds || []).forEach((R) => {
let H = X.find((I) => I.id === R), q = V.filter((I) => I.marketId === $.id && I.assetId === R && I.status === "active");
if (!H || q.length === 0)
return;
if (W.has(R)) {
q.forEach((I) => {
let L = V.findIndex((j) => j.id === I.id);
if (L >= 0)
V[L] = { ...V[L], status: "lost" };
});
return;
}
let D = [...q].sort((I, L) => L.amount - I.amount || I.createdAt - L.createdAt), J = D[0];
D.forEach((I) => {
let L = V.findIndex((j) => j.id === I.id);
if (L >= 0)
V[L] = { ...V[L], status: I.id === J.id ? "won" : "lost" };
});
let B = Y[J.userId] || a.emptyTeam();
Y[J.userId] = a.addAsset(B, H, J.amount), G.push({ assetId: R, winnerUserId: J.userId, amount: J.amount, bidCount: q.length }), U.push({ id: P0("act"), ts: K0(), type: "fichaje", userId: J.userId, assetId: R, amount: J.amount });
});
let z = { id: $.id, closesAt: $.closesAt, opensAt: $.opensAt, results: G };
return { teams: Y, bids: V, historyEntry: z, activityEntries: U };
},
ownedIdsOf($) {
let Q = /* @__PURE__ */ new Set;
return Object.values($ || {}).forEach((X) => a.squadIds(X).forEach((Z) => Q.add(Z))), Q;
}
};
var X6 = { 0: 5, 1: 3.5, 2: 2 }, Z6 = 6, t = {
matchWinner($) {
let { marcadorLocal: Q, marcadorVisitante: X } = $;
if (Q === void 0 || Q === null || Q === "" || X === void 0 || X === null || X === "")
return null;
let Z = Number(Q), Y = Number(X);
if (Z === Y)
return null;
return Z > Y ? "local" : "visitante";
},
byeSide($) {
if (!h0($))
return null;
return $.local === "DESCANSA" ? "visitante" : "local";
},
tripleWinner($) {
return t.byeSide($) || t.matchWinner($);
},
jornadaPointsByPlayer($, Q) {
let X = {};
return Object.entries($.stats || {}).forEach(([Z, Y]) => {
let V = Q.find((G) => G.id === Z);
if (V && V.position !== "DT")
X[Z] = c0(Y, V.position).total;
}), X;
},
seasonPointsByPlayer($, Q) {
let X = {};
return ($ || []).forEach((Z) => {
if (Z.position !== "DT")
X[Z.id] = 0;
}), (Q || []).forEach((Z) => {
Object.entries(Z.stats || {}).forEach(([Y, V]) => {
let G = $.find((U) => U.id === Y);
if (G && G.position !== "DT")
X[Y] = (X[Y] || 0) + c0(V, G.position).total;
});
}), X;
},
computeActualMvp($, Q, X) {
let Z = t.jornadaPointsByPlayer($, Q), Y = Object.entries(Z);
if (Y.length === 0)
return null;
let V = Math.max(...Y.map(([, W]) => W)), G = Y.filter(([, W]) => W === V).map(([W]) => W);
if (G.length === 1)
return G[0];
let U = t.seasonPointsByPlayer(Q, X);
return G.sort((W, z) => (U[z] || 0) - (U[W] || 0) || W.localeCompare(z)), G[0];
},
isJornadaReady($) {
let Q = $?.partidos || [];
if (Q.length === 0 || !$.stats || Object.keys($.stats).length === 0)
return !1;
return Q.every((X) => t.tripleWinner(X) !== null);
},
computeMvpCandidates($, Q) {
let X = t.seasonPointsByPlayer($, Q), Z = Object.values(X).some((Y) => Y > 0);
return Object.entries(X).map(([Y, V]) => ({ player: $.find((G) => G.id === Y), pts: V })).filter((Y) => Y.player).sort((Y, V) => Z ? V.pts - Y.pts : (V.player.basePrice || 0) - (Y.player.basePrice || 0)).slice(0, 7).map((Y) => Y.player);
},
scoreEntry($, Q, X) {
let Z = Q.partidos || [], Y = 0;
Z.forEach((W) => {
let z = t.tripleWinner(W), R = $.picks?.[W.id] || t.byeSide(W);
if (z && R && z === R)
Y++;
});
let V = $.mvpChoice === "otra" ? !($.mvpOptions || []).includes(X) : $.mvpChoice === X, G = Math.max(0, Z.length - Y), U = X6[G] ?? 0;
if (G === 0 && V)
U = Z6;
return { correct: Y, mvpCorrect: V, prize: U, actualMvpId: X };
}
}, Z$ = 0.1, Y6 = {
compute($, Q) {
let X = t.jornadaPointsByPlayer($, Q), Z = { BASE: [], ALERO: [], PIVOT: [] };
Object.entries(X).forEach(([U, W]) => {
let z = Q.find((R) => R.id === U);
if (z && Z[z.position])
Z[z.position].push({ id: U, pts: W });
}), Object.values(Z).forEach((U) => U.sort((W, z) => z.pts - W.pts));
let Y = null, V = o0($), G = new Set(t$(V ? V.getTime() : H$()));
return Object.entries(b$).filter(([U]) => G.has(U)).forEach(([U, W]) => {
let z = [], R = 0, H = !0;
if (Object.entries(W).forEach(([q, D]) => {
let J = Z[q] || [];
if (J.length < D) {
H = !1;
return;
}
for (let B = 0;B < D; B++)
z.push(J[B].id), R += J[B].pts;
}), H && (!Y || R > Y.total))
Y = { formation: U, playerIds: z, total: R };
}), Y;
}
}, E$ = [0.6, 1, 0.85, 0.7, 0.55, 0.45], V6 = 0.3, S0 = 4, C0 = 8, G6 = 0.009, W6 = 0.0032, U6 = -0.01, z6 = 0.0025, q6 = 18, H6 = 0.008, K6 = 0, _6 = -0.005, Y$ = 0.8, R6 = 0.12, J6 = 0.05, F6 = 0.05, D6 = 0.3, O6 = 0.07, B6 = 0.02, E6 = 0.04, M6 = 0.15;
function L6($) {
if ($ >= C0)
return 1;
if ($ <= S0)
return -1;
return 0;
}
var A6 = -0.02, N6 = 1.5, T6 = 0.7, w6 = 0.45, k6 = 0.5, P6 = 0.4, M$ = 2.6, L$ = 0.08;
function A$($, Q) {
if (!Q || !$ || $ <= Q)
return 1;
return 1 + Math.min(0.35, ($ - Q) / Q * 0.3);
}
function I6($, Q) {
let X = /* @__PURE__ */ new Date($ + "T00:00:00"), Z = /* @__PURE__ */ new Date(Q + "T00:00:00");
return Math.round((Z - X) / 86400000);
}
function R0($) {
let Q = $.getFullYear(), X = String($.getMonth() + 1).padStart(2, "0"), Z = String($.getDate()).padStart(2, "0");
return `${Q}-${X}-${Z}`;
}
function b6($) {
return $.getDay() === 1;
}
var b0 = null, y0 = null, v$ = !1;
function h6($, Q) {
if (!v$) {
b0 = null, y0 = null;
return;
}
if (!$) {
b0 = null, y0 = null;
return;
}
v6((/* @__PURE__ */ new Date(`${$}T${Q || "12:00"}:00`)).getTime(), Date.now());
}
function v6($, Q) {
if (!v$) {
b0 = null, y0 = null;
return;
}
b0 = $, y0 = Q;
}
function z0() {
if (b0 != null)
return new Date(b0 + (Date.now() - y0));
return /* @__PURE__ */ new Date;
}
function H$() {
return z0().getTime();
}
function K0() {
return Date.now();
}
var g$ = !1, g6 = !0;
function M0() {
return !g$ && g6;
}
var S6 = {
compute($) {
let Q = {}, X = {}, Z = (V) => {
if (V && V !== "DESCANSA" && !Q[V])
Q[V] = { team: V, wins: 0, losses: 0, pf: 0, pc: 0, played: 0 };
};
($ || []).forEach((V) => {
(V.partidos || []).forEach((G) => {
if (G.local !== "DESCANSA")
Z(G.local);
if (G.visitante !== "DESCANSA")
Z(G.visitante);
let U = t.matchWinner(G);
if (!U)
return;
if (G.local === "DESCANSA" || G.visitante === "DESCANSA")
return;
let W = Number(G.marcadorLocal), z = Number(G.marcadorVisitante);
if (Number.isNaN(W) || Number.isNaN(z))
return;
if (Q[G.local].played++, Q[G.visitante].played++, Q[G.local].pf += W, Q[G.local].pc += z, Q[G.visitante].pf += z, Q[G.visitante].pc += W, U === "local")
Q[G.local].wins++, Q[G.visitante].losses++;
else
Q[G.visitante].wins++, Q[G.local].losses++;
let R = [G.local, G.visitante].sort().join("|");
if (!X[R])
X[R] = { [G.local]: { wins: 0, pts: 0 }, [G.visitante]: { wins: 0, pts: 0 } };
let H = X[R];
if (!H[G.local])
H[G.local] = { wins: 0, pts: 0 };
if (!H[G.visitante])
H[G.visitante] = { wins: 0, pts: 0 };
if (H[G.local].pts += W - z, H[G.visitante].pts += z - W, U === "local")
H[G.local].wins += 1;
else
H[G.visitante].wins += 1;
});
});
let Y = Object.values(Q);
return Y.sort((V, G) => {
if (G.wins !== V.wins)
return G.wins - V.wins;
let U = [V.team, G.team].sort().join("|"), W = X[U];
if (W && W[V.team] && W[G.team]) {
if (W[V.team].wins !== W[G.team].wins)
return W[G.team].wins - W[V.team].wins;
if (W[V.team].pts !== W[G.team].pts)
return W[G.team].pts - W[V.team].pts;
}
return G.pf - G.pc - (V.pf - V.pc);
}), Y.map((V, G) => ({ ...V, rank: G + 1, diff: V.pf - V.pc, pts: V.wins + V.played }));
}
}, N$ = { CUARTOS: 10, SEMIS: 9, FINAL: 9 };
var g = {
emptyState() {
return {
phase: "none",
round: null,
qualifiers: [],
draftDay: 0,
lastAllocationDate: null,
lists: {},
squads: {},
lineups: {},
lockedLineups: {},
log: [],
pointsByRound: {},
champion: null
};
},
jornadaTagsForRound($) {
return $ === "CUARTOS" ? ["CUARTOS_IDA", "CUARTOS_VUELTA"] : [$];
},
isPlayoffJornada($) {
return !!$?.playoffRound;
},
regularJornadas($) {
return ($ || []).filter((Q) => !Q.playoffRound);
},
regularSeasonFinished($) {
let Q = g.regularJornadas($);
if (Q.length === 0)
return !1;
let Z = [...Q].sort((Y, V) => B0(V.name) - B0(Y.name))[0].partidos || [];
return Z.length > 0 && Z.every((Y) => h0(Y) || Y.marcadorLocal !== "" && Y.marcadorLocal != null && Y.marcadorVisitante !== "" && Y.marcadorVisitante != null);
},
regularSeasonDateOver($) {
let Q = g.regularJornadas($);
if (Q.length === 0)
return !1;
let X = [...Q].sort((G, U) => B0(U.name) - B0(G.name))[0], Z = S$(X);
if (!Z)
return !1;
let Y = new Date(Z);
Y.setDate(Y.getDate() + 1), Y.setHours(0, 0, 0, 0);
let V = z0();
return V.setHours(0, 0, 0, 0), V >= Y;
},
findRoundJornadas($, Q) {
return ($ || []).filter((X) => X.playoffRound === Q);
},
visibleJornadas($) {
let Q = $ || [], X = g.regularSeasonDateOver(Q), Z = z$.buildBracket(Q), Y = Z.ready && Z.cuartos.every((G) => !!G.winner), V = Y && Z.semis.every((G) => !!G.winner);
return Q.filter((G) => {
let U = A0(G);
if (U === "regular")
return !0;
if (U === "cuartos")
return X;
if (U === "semis")
return X && Y;
if (U === "final")
return X && V;
return !0;
});
},
jornadasForRound($, Q) {
if (Q === "CUARTOS")
return [...g.findRoundJornadas($, "CUARTOS_IDA"), ...g.findRoundJornadas($, "CUARTOS_VUELTA")];
return g.findRoundJornadas($, Q);
},
aliveRealTeams($, Q) {
let X = z$.buildBracket($);
if (!X.ready)
return /* @__PURE__ */ new Set;
if (Q === "CUARTOS")
return new Set(X.top8.map((Z) => Z.team));
if (Q === "SEMIS")
return new Set(X.cuartos.map((Z) => Z.winner).filter(Boolean));
if (Q === "FINAL")
return new Set(X.semis.map((Z) => Z.winner).filter(Boolean));
return /* @__PURE__ */ new Set;
},
availablePool($, Q, X, Z) {
let Y = g.aliveRealTeams($, X), V = new Set(Z || []);
return Q.filter((G) => Y.has(G.team) && !V.has(G.id));
},
roundHasResults($, Q) {
let X = g.jornadasForRound($, Q);
if (X.length === 0)
return !1;
return X.every((Z) => (Z.partidos || []).length > 0 && (Z.partidos || []).every((Y) => h0(Y) || Y.marcadorLocal !== "" && Y.marcadorLocal != null && Y.marcadorVisitante !== "" && Y.marcadorVisitante != null));
},
runDailyAllocation({ order: $, lists: Q, squadsSoFar: X, availableIds: Z, targetSize: Y }) {
let V = new Set(Z), G = [];
for (let U = 0;U < 2; U++)
for (let W of $) {
if ((X[W] || []).length + G.filter((q) => q.userName === W).length >= Y)
continue;
let H = (Q[W] || []).find((q) => V.has(q));
if (H)
V.delete(H), G.push({ userName: W, playerId: H });
}
return G;
},
catchUpAllocation({ order: $, squadsSoFar: Q, sortedPoolIds: X, targetSize: Z }) {
let Y = [...X], V = [], G = {};
$.forEach((W) => {
G[W] = (Q[W] || []).length;
});
let U = !0;
while (U && Y.length > 0) {
U = !1;
for (let W of $) {
if (G[W] >= Z)
continue;
if (Y.length === 0)
break;
let z = Y.shift();
V.push({ userName: W, playerId: z }), G[W]++, U = !0;
}
}
return V;
},
runFinalAllocation({ order: $, lists: Q, availableIds: X, targetSize: Z }) {
let Y = new Set(X), V = [], G = {};
$.forEach((W) => {
G[W] = 0;
});
let U = Math.max(0, ...$.map((W) => (Q[W] || []).length));
for (let W = 0;W < U && [...Y].length > 0; W++)
for (let z of $) {
if (G[z] >= Z)
continue;
let H = (Q[z] || [])[W], q = H && Y.has(H) ? H : null;
if (q)
Y.delete(q), V.push({ userName: z, playerId: q }), G[z]++;
}
for (let W of $)
while (G[W] < Z && Y.size > 0) {
let z = [...Y][0];
Y.delete(z), V.push({ userName: W, playerId: z }), G[W]++;
}
return V;
},
computeSingleJornadaPoints($, Q, X, Z, Y) {
let G = (Q[$.playoffRound] || {})[X] || (u0($) ? null : Y);
if (!G)
return 0;
let U = [...G.starters || []];
if (G.titularCoach)
U.push(G.titularCoach);
return U.reduce((W, z) => {
let R = Z.find((q) => q.id === z);
if (!R)
return W;
let H = R.position === "DT" ? r0(null, q$($, R.team)).total : I0($.stats?.[z], R.position);
return W + (z === G.captainId ? H * 2 : H);
}, 0);
},
computeRoundPoints($, Q, X, Z, Y, V) {
return g.jornadasForRound($, Q).reduce((U, W) => U + g.computeSingleJornadaPoints(W, X, Z, Y, V), 0);
},
cutTop($, Q, X) {
let Z = $.map((Y, V) => ({ u: Y, pts: Q[Y] || 0, seedIdx: V }));
return Z.sort((Y, V) => V.pts - Y.pts || Y.seedIdx - V.seedIdx), Z.slice(0, X).map((Y) => Y.u);
}
};
function A0($) {
let Q = $?.playoffRound;
if (Q === "CUARTOS_IDA" || Q === "CUARTOS_VUELTA")
return "cuartos";
if (Q === "SEMIS")
return "semis";
if (Q === "FINAL")
return "final";
return "regular";
}
function T$($) {
return $?.playoffRound === "CUARTOS_VUELTA" ? 2 : 1;
}
function h0($) {
return $?.local === "DESCANSA" || $?.visitante === "DESCANSA";
}
var z$ = {
findPartido($, Q, X) {
let Y = ($?.partidos || []).find((W) => W.local === Q && W.visitante === X || W.local === X && W.visitante === Q);
if (!Y)
return null;
if (!(Y.marcadorLocal !== "" && Y.marcadorLocal != null && Y.marcadorVisitante !== "" && Y.marcadorVisitante != null))
return { played: !1 };
let G = Y.local === Q ? Number(Y.marcadorLocal) : Number(Y.marcadorVisitante), U = Y.local === X ? Number(Y.marcadorLocal) : Number(Y.marcadorVisitante);
return { played: !0, aScore: G, bScore: U };
},
seriesResult($, Q, X, Z) {
let Y = $ ? this.findPartido($, X, Z) : null, V = Q ? this.findPartido(Q, X, Z) : null, G = null, U = null, W = null;
if (Y?.played && V?.played) {
if (G = Y.aScore + V.aScore, U = Y.bScore + V.bScore, G !== U)
W = G > U ? X : Z;
}
return { teamA: X, teamB: Z, leg1: Y, leg2: V, aggA: G, aggB: U, winner: W };
},
singleMatch($, Q, X) {
let Z = $ ? this.findPartido($, Q, X) : null;
if (!Z || !Z.played)
return { teamA: Q, teamB: X, played: !1, winner: null };
let Y = Z.aScore === Z.bScore ? null : Z.aScore > Z.bScore ? Q : X;
return { teamA: Q, teamB: X, played: !0, aScore: Z.aScore, bScore: Z.bScore, winner: Y };
},
buildBracket($) {
let Q = ($ || []).filter((B) => A0(B) === "regular"), Z = S6.compute(Q).slice(0, 8);
if (Z.length < 8)
return { ready: !1, top8: Z };
let Y = $.find((B) => A0(B) === "cuartos" && T$(B) === 1), V = $.find((B) => A0(B) === "cuartos" && T$(B) === 2), G = $.find((B) => A0(B) === "semis"), U = $.find((B) => A0(B) === "final"), z = [[0, 7], [1, 6], [2, 5], [3, 4]].map(([B, I]) => {
let L = Z[B].team, j = Z[I].team, Q0 = this.seriesResult(Y, V, L, j);
return { seedA: Z[B].rank, seedB: Z[I].rank, ...Q0 };
}), H = [[0, 3], [1, 2]].map(([B, I]) => {
let L = z[B].winner, j = z[I].winner;
if (!L || !j)
return { teamA: L || null, teamB: j || null, played: !1, winner: null, pending: !0 };
return this.singleMatch(G, L, j);
}), q = H[0]?.winner, D = H[1]?.winner, J = !q || !D ? { teamA: q || null, teamB: D || null, played: !1, winner: null, pending: !0 } : this.singleMatch(U, q, D);
return { ready: !0, top8: Z, cuartos: z, semis: H, final: J };
},
projectedPartidos($, Q) {
let X = Q?.partidos || [], Z = A0(Q);
if (Z === "regular")
return X;
let Y = this.buildBracket($);
if (!Y.ready)
return X;
let V = [];
if (Z === "cuartos")
V = Y.cuartos.map((U) => [U.teamA, U.teamB]);
else if (Z === "semis")
V = Y.semis.map((U) => [U.teamA, U.teamB]);
else if (Z === "final")
V = [[Y.final.teamA, Y.final.teamB]];
let G = (U) => !U || /por determinar/i.test(String(U).trim());
if (X.length === 0 || X.every((U) => G(U.local) && G(U.visitante)))
return V.filter(([U, W]) => U && W).map(([U, W], z) => ({ id: `proj_${Q?.id || Z}_${z}`, local: U, visitante: W, marcadorLocal: "", marcadorVisitante: "", fecha: null, previsto: !0 }));
return X.map((U, W) => {
if (!G(U.local) && !G(U.visitante))
return U;
let z = V[W];
if (!z || !z[0] || !z[1])
return U;
return { ...U, local: G(U.local) ? z[0] : U.local, visitante: G(U.visitante) ? z[1] : U.visitante, previsto: !0 };
});
}
}, W0 = {
computeStandings($) {
let Q = {};
($ || []).forEach((V) => {
(V.partidos || []).forEach((G) => {
let U = t.matchWinner(G);
if (!U)
return;
[G.local, G.visitante].forEach((W) => {
if (!Q[W])
Q[W] = { wins: 0, played: 0 };
Q[W].played += 1;
}), Q[U === "local" ? G.local : G.visitante].wins += 1;
});
});
let X = Object.keys(Q), Z = X.map((V) => ({ team: V, winPct: Q[V].played > 0 ? Q[V].wins / Q[V].played : 0.5 }));
Z.sort((V, G) => G.winPct - V.winPct);
let Y = {};
return Z.forEach((V, G) => {
Y[V.team] = { rank: G + 1, winPct: V.winPct };
}), { standings: Y, totalTeams: X.length || 1 };
},
nextTwoOpponentsAvgWinPct($, Q, X, Z) {
let Y = [];
if ((Q || []).forEach((G) => (G.partidos || []).forEach((U) => {
if (U.local !== $ && U.visitante !== $)
return;
let W = N0(U.fecha);
if (!W || R0(W) <= X)
return;
let z = U.local === $ ? U.visitante : U.local;
Y.push({ date: W, opponent: z });
})), Y.length === 0)
return null;
Y.sort((G, U) => G.date - U.date);
let V = Y.slice(0, 2).map((G) => Z[G.opponent]?.winPct ?? 0.5);
return V.reduce((G, U) => G + U, 0) / V.length;
},
leagueAveragePoints($, Q) {
let X = Object.entries($.stats || {}).map(([Z, Y]) => {
let V = Q.find((G) => G.id === Z);
return V && V.position !== "DT" ? c0(Y, V.position).total : null;
}).filter((Z) => Z !== null);
return X.length > 0 ? X.reduce((Z, Y) => Z + Y, 0) / X.length : 0;
},
findMatchOnDate($, Q, X) {
for (let Z of Q || [])
for (let Y of Z.partidos || []) {
if (Y.local !== $.team && Y.visitante !== $.team)
continue;
let V = N0(Y.fecha);
if (!V || R0(V) !== X)
continue;
let G = t.matchWinner(Y);
if (!G)
continue;
let U = Z.stats?.[$.id];
if (!U)
continue;
return { jornada: Z, partido: Y, stats: U, winner: G };
}
return null;
},
teamScoredMatches($, Q, X) {
let Z = [];
return (Q || []).forEach((Y) => (Y.partidos || []).forEach((V) => {
if (h0(V))
return;
if (V.local !== $.team && V.visitante !== $.team)
return;
let G = N0(V.fecha);
if (!G)
return;
let U = R0(G);
if (X && U > X)
return;
let W = t.matchWinner(V);
if (!W)
return;
Z.push({ key: `${Y.id}:${V.id}`, jornada: Y, partido: V, winner: W, dateStr: U });
})), Z.sort((Y, V) => Y.dateStr < V.dateStr ? -1 : Y.dateStr > V.dateStr ? 1 : 0);
},
findTeamMatchOnDate($, Q, X) {
for (let Z of Q || [])
for (let Y of Z.partidos || []) {
if (h0(Y))
continue;
if (Y.local !== $.team && Y.visitante !== $.team)
continue;
let V = N0(Y.fecha);
if (!V || R0(V) !== X)
continue;
if (!t.matchWinner(Y))
continue;
return { jornada: Z, partido: Y };
}
return null;
},
computeBigPush({ stats: $, leagueAvgPoints: Q, teamRank: X, totalTeams: Z, opponentWinPct: Y, won: V, isMvpPartido: G, minutesJump: U, minutesDrop: W, isConsistentGood: z, isConsistentBad: R }) {
let H = $.puntos || 0, q = 0;
if (H >= C0)
q = G6 + (H - C0) * W6;
else if (H <= S0)
q = U6 - (S0 - H) * z6;
if (H >= q6)
q += H6;
else if (H <= K6)
q += _6;
let D = H >= C0 || H <= S0 ? 1 : 0.5, J = 0;
if (V === !0)
J = 0.0012 * (1 + (Y - 0.5));
else if (V === !1)
J = -0.0012 * (1 + (0.5 - Y));
let B = Z > 0 ? ((Z - X) / Z - 0.5) * 2 * 0.001 : 0, I = G ? 0.0025 : 0, L = U ? 0.0008 : W ? -0.0008 : 0, j = z ? 0.0015 : R ? -0.0015 : 0;
return q + (J + B + I + L + j) * D;
},
streakMultiplier($) {
if (!$ || $ <= 1)
return 1;
return Math.min(1.6, 1 + 0.12 * ($ - 1));
},
weightForDay($) {
if ($ < 0)
return 0;
if ($ < E$.length)
return E$[$];
return V6;
},
computeDailySmallFactors({ bidsForHer: $, totalTeams: Q, opponentsAvgWinPct: X, lowMinutes: Z, favoritesForHer: Y }) {
let G = Math.min(1, $ / Math.max(1, 3 * Q)) * 0.006, U = 0;
if (X != null) {
let H = 0.5 - X;
U = H >= 0 ? H * 0.015 : H * 0.0001;
}
let W = Z ? -0.006 : 0, R = Math.min(1, Y / Math.max(1, 0.5 * Q)) * 0.003;
return G + U + W + R;
},
computeCoachDailyUpdate($, Q) {
let X = $.marketCycle || {};
if (X.lastPricedDate === Q.todayStr)
return null;
let Z = X.coachStreak || 0, Y = $.basePrice || Y$, V = 0, G = X.processedMatches;
if (!Array.isArray(G))
G = W0.teamScoredMatches($, Q.jornadas, X.lastPricedDate || "").filter((q) => X.lastPricedDate && q.dateStr < X.lastPricedDate).map((q) => q.key);
let U = W0.teamScoredMatches($, Q.jornadas, Q.todayStr).filter((q) => !G.includes(q.key));
for (let q of U) {
G = [...G, q.key].slice(-40);
let { partido: D } = q, J = t.matchWinner(D), B = D.local === $.team;
if (J === "local" === B) {
Z = Z > 0 ? Z + 1 : 1;
let L = B ? D.visitante : D.local, j = Q.standings[L]?.winPct ?? 0.5;
V += Math.min(D6, R6 + J6 * (Z - 1) + F6 * j);
} else {
Z = Z < 0 ? Z - 1 : -1;
let L = E6 * Math.min(1, Math.max(0, Y - Y$) / 10);
V += -Math.min(M6, O6 + B6 * (-Z - 1) + L);
}
}
let W = W0.nextTwoOpponentsAvgWinPct($.team, Q.jornadas, Q.todayStr, Q.standings), z = W0.computeDailySmallFactors({
bidsForHer: Q.bidsMap[$.id] || 0,
totalTeams: Q.totalTeams,
opponentsAvgWinPct: W,
lowMinutes: !1,
favoritesForHer: Q.favoritesMap[$.id] || 0
}), R = { ...X, coachStreak: Z, processedMatches: G, lastPricedDate: Q.todayStr }, H = Math.max(Y$, Y * (1 + z) + V);
if (Math.abs(H - Y) < 0.000000001)
return { marketCycle: R };
return {
basePrice: H,
prevBasePrice: $.basePrice,
priceHistory: W$($.priceHistory, Y, Q.todayStr, H),
marketCycle: R
};
},
computeDailyUpdate($, Q) {
if ($.position === "DT")
return W0.computeCoachDailyUpdate($, Q);
let X = $.marketCycle || {};
if (X.lastPricedDate === Q.todayStr)
return null;
let { cycleStartDate: Z = null, cycleBase: Y = 0, streakCount: V = 0, pointsHistory: G = [], minutesHistory: U = [], lastDiff: W = null, trend: z = null } = X;
if (z == null)
z = Math.sign(Y || 0);
let R = (_, T) => {
if (T === 1)
_ = Math.max(_, 0.002);
else if (T === -1)
_ = Math.min(_, -0.002);
let b;
if (T === 0)
b = w6 * Y + _;
else if (z === 0 || T === z)
b = _ + T6 * (Y * T > 0 ? Y : 0);
else
b = k6 * _ + P6 * Y;
if (T === 1)
b = Math.max(b, 0.2 * _);
else if (T === -1)
b = Math.min(b, 0.2 * _);
if (T !== 0)
z = T;
return V = T === 0 ? V : Math.sign(Y) === T ? V + 1 : 1, b;
}, H = $.basePrice || 1, q = X.processedMatches;
if (!Array.isArray(q))
q = W0.teamScoredMatches($, Q.jornadas, Z || "").filter((_) => Z && _.dateStr <= Z).map((_) => _.key);
let D = W0.teamScoredMatches($, Q.jornadas, Q.todayStr).filter((_) => !q.includes(_.key));
for (let _ of D) {
if (!(!!_.jornada.stats && Q.players.some((o) => o.team === $.team && o.position !== "DT" && _.jornada.stats[o.id])))
break;
q = [...q, _.key].slice(-40);
let { jornada: b, partido: K, winner: f } = _, E = b.stats?.[$.id] || null;
if (!E || !E.jugo && !(E.minutos > 0)) {
let o = R(A6 * A$(H, Q.avgPrice), -1);
Z = Q.todayStr, Y = o, W = -1, G = [...G, 0].slice(-5), U = [...U, 0].slice(-4);
continue;
}
let i = K.local === $.team, h = f === "local" === i, F = i ? K.visitante : K.local, w = Q.standings[$.team] || { rank: Q.totalTeams, winPct: 0.5 }, P = Q.standings[F] || { winPct: 0.5 }, c = W0.leagueAveragePoints(b, Q.players), x = c0(E, $.position).total, A = U.length ? U.reduce((o, H0) => o + H0, 0) / U.length : E.minutos || 0, y = (E.minutos || 0) - A >= 8, k = A - (E.minutos || 0) >= 8, N = [...G, x].slice(-4), m = N.reduce((o, H0) => o + H0, 0) / N.length, s = N.reduce((o, H0) => o + Math.pow(H0 - m, 2), 0) / N.length, M = N.length >= 4 && Math.sqrt(s) < 6 && m >= C0, O = N.length >= 4 && Math.sqrt(s) < 6 && m <= S0, V0 = W0.computeBigPush({
stats: { ...E, puntos: x },
leagueAvgPoints: c,
teamRank: w.rank,
totalTeams: Q.totalTeams,
opponentWinPct: P.winPct,
won: h,
isMvpPartido: !!E.mvp,
minutesJump: y,
minutesDrop: k,
isConsistentGood: M,
isConsistentBad: O
});
if (V0 < 0)
V0 *= N6 * A$(H, Q.avgPrice);
let q0 = L6(x);
V0 = R(V0, q0), W = q0, Z = Q.todayStr, Y = V0, G = [...G, x].slice(-5), U = [...U, E.minutos || 0].slice(-4);
}
let J = Z ? I6(Z, Q.todayStr) : -1, B = Z ? Y * W0.weightForDay(J) : 0, I = W0.nextTwoOpponentsAvgWinPct($.team, Q.jornadas, Q.todayStr, Q.standings), L = U.length >= 2 && U.slice(-2).every((_) => _ < 10), j = W0.computeDailySmallFactors({
bidsForHer: Q.bidsMap[$.id] || 0,
totalTeams: Q.totalTeams,
opponentsAvgWinPct: I,
lowMinutes: L,
favoritesForHer: Q.favoritesMap[$.id] || 0
}), Q0 = B + j;
Q0 = Math.max(-L$, Math.min(L$, Q0));
{
let _ = Q0 * H, T = M$ * Math.tanh(_ / M$);
Q0 = H > 0 ? T / H : 0;
}
let F0 = { cycleStartDate: Z, cycleBase: Y, streakCount: V, pointsHistory: G, minutesHistory: U, lastDiff: W, trend: z, processedMatches: q, lastPricedDate: Q.todayStr };
if (Q0 === 0)
return { marketCycle: F0 };
let v0 = Math.max(0.1, ($.basePrice || 1) * (1 + Q0));
return {
basePrice: v0,
prevBasePrice: $.basePrice,
priceHistory: W$($.priceHistory, $.basePrice, Q.todayStr, v0),
marketCycle: F0
};
}
}, O0 = {
hourOf($) {
let Q = new Date($), X = (Z) => String(Z).padStart(2, "0");
return `${X(Q.getHours())}:${X(Q.getMinutes())}:${X(Q.getSeconds())}`;
},
parseHM($) {
let [Q, X, Z] = ($ || "00:00").split(":").map(Number);
return { h: Q || 0, m: X || 0, s: Z || 0 };
},
atHour($, Q) {
let X = new Date($);
return X.setHours(Q.h, Q.m, Q.s || 0, 0), X.getTime();
},
computeWindow($, Q = K0()) {
let X = O0.parseHM($), Z = O0.atHour(Q, X), Y = Q < Z ? Z : Z + 86400000;
return { opensAt: Y - 86400000, closesAt: Y, isOpen: !0 };
},
buildAssets($, Q, X, Z = []) {
let Y = /* @__PURE__ */ new Set;
Object.values(Q).forEach((G) => a.squadIds(G).forEach((U) => Y.add(U))), Z.forEach((G) => Y.add(G));
let V = $.filter((G) => !Y.has(G.id)).map((G) => G.id);
return U$(V).slice(0, X);
},
refreshSaleOffers($, Q, X) {
let Z = {}, Y = !1;
return Object.entries($).forEach(([V, G]) => {
let U = !1, W = (G.squad || []).map((z) => {
if (!z.forSale)
return z;
if (z.saleOffer && z.saleOffer.marketId === X.id)
return z;
let R = Q.find((D) => D.id === z.id);
if (!R)
return z;
let H = 0.9 + Math.random() * 0.2, q = Math.max(0.01, R.basePrice * H);
return U = !0, { ...z, saleOffer: { amount: q, marketId: X.id, expiresAt: X.closesAt } };
});
if (U)
Z[V] = { ...G, squad: W }, Y = !0;
else
Z[V] = G;
}), { teams: Z, changed: Y };
}
}, C6 = {
computeStandings($, Q, X, Z, Y = null) {
let V = (H) => `${Z}::${H}`, G = (H, q, D) => X.slice(0, D).reduce((J, B) => J + O$(B, V(H), q, Q), 0), U = Y ? X.find((H) => H.id === Y) : null, W = (H, q) => U ? O$(U, V(H), q, Q) : G(H, q, X.length), z = Object.entries($).map(([H, q]) => {
let D = q.squad || [], J = D.filter((Q0) => {
let F0 = Q.find((v0) => v0.id === Q0.id);
return F0 && F0.position !== "DT";
}).length, B = D.length - J, I = W(H, q.lineup), L = U ? I : G(H, q.lineup, Math.max(0, X.length - 1)), j = a.currentSquadValue(q, Q);
return { name: H, total: I, prevTotal: L, jCount: J, cCount: B, value: q.budgetSpent || 0, squadValue: j };
}).sort((H, q) => q.total - H.total || q.squadValue - H.squadValue), R = [...z].sort((H, q) => q.prevTotal - H.prevTotal).map((H) => H.name);
return z.map((H, q) => {
let D = R.indexOf(H.name), J = U ? 0 : D === -1 ? 0 : D - q;
return { ...H, rank: q + 1, delta: J };
});
}
};
async function k0() {
try {
let { data: $, error: Q } = await n.from("players").select("*");
if (Q)
throw Q;
return ($ || []).map((X) => ({
id: X.id,
name: X.name,
team: X.team,
position: X.position,
basePrice: Number(X.base_price) || 0,
prevBasePrice: X.prev_base_price != null ? Number(X.prev_base_price) : Number(X.base_price) || 0,
photo: X.photo || "",
priceHistory: X.price_history || [],
marketCycle: X.market_cycle || {}
}));
} catch {
return [];
}
}
async function u($, Q) {
try {
let { data: X, error: Z } = await n.from("kv_store").select("value").eq("key", $).maybeSingle();
if (Z)
throw Z;
return X ? X.value : Q;
} catch {
return Q;
}
}
async function l($, Q) {
try {
let { error: X } = await n.from("kv_store").upsert({ key: $, value: Q, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
if (X)
throw X;
return !0;
} catch {
return !1;
}
}
async function V$($) {
try {
let { error: Q } = await n.from("kv_store").delete().eq("key", $);
if (Q)
throw Q;
return !0;
} catch {
return !1;
}
}
async function d0() {
try {
let { data: $, error: Q } = await n.from("kv_store").select("key,value").like("key", `${i0}%`);
if (Q)
throw Q;
let X = {};
return ($ || []).forEach((Z) => {
let Y = Z.value, V = Z.key.slice(i0.length), G = V.indexOf("::"), U = G >= 0 ? V.slice(0, G) : V, W = Y?.name || (G >= 0 ? V.slice(G + 2) : V);
X[`${U}::${W}`] = { ...Y, name: W, leagueId: U };
}), X;
} catch {
return null;
}
}
async function f6() {
try {
let { data: $, error: Q } = await n.from("kv_store").select("value").like("key", "bids_%");
if (Q)
throw Q;
let X = {};
return ($ || []).forEach((Z) => {
(Z.value || []).forEach((Y) => {
if (Y.status !== "active")
return;
X[Y.assetId] = (X[Y.assetId] || 0) + 1;
});
}), X;
} catch {
return {};
}
}
async function x6() {
try {
let { data: $, error: Q } = await n.from("favorites").select("player_id");
if (Q)
throw Q;
let X = {};
return ($ || []).forEach((Z) => {
X[Z.player_id] = (X[Z.player_id] || 0) + 1;
}), X;
} catch {
return {};
}
}
async function w$() {
try {
let { data: $, error: Q } = await n.from("favorites").select("player_id,user_name");
if (Q)
throw Q;
let X = {};
return ($ || []).forEach((Z) => {
(X[Z.player_id] ||= []).push(Z.user_name);
}), X;
} catch {
return {};
}
}
function c6($) {
if (!$)
return null;
if ($ instanceof Date)
return $;
let Q = String($).trim().replace(" ", "T");
if (!/([zZ]|[+-]\d\d(:?\d\d)?)$/.test(Q))
Q += "Z";
let X = new Date(Q);
return isNaN(X.getTime()) ? null : X;
}
function B0($) {
let Q = /(\d+)/.exec($ || "");
return Q ? Number(Q[1]) : 0;
}
function l0($, Q) {
let X = new Map((Q || []).map((Z) => [Z.id, Z]));
return ($ || []).map((Z) => {
let Y = X.get(Z.id);
if (!Y)
return Z;
let V = { ...Z.lineups || {}, ...Y.lineups || {} };
return { ...Z, lineups: V };
});
}
async function _0() {
try {
let [{ data: $, error: Q }, { data: X, error: Z }, { data: Y, error: V }] = await Promise.all([
n.from("jornadas").select("*").limit(2000),
n.from("partidos").select("*").limit(20000),
n.from("jornada_stats").select("*").limit(50000)
]);
if (Q)
throw Q;
if (Z)
throw Z;
if (V)
throw V;
let G = {};
(X || []).forEach((W) => {
(G[W.jornada_id] || (G[W.jornada_id] = [])).push({
id: W.id,
local: W.local,
visitante: W.visitante,
fecha: W.fecha || "",
hora: W.hora || "",
marcadorLocal: W.marcador_local ?? "",
marcadorVisitante: W.marcador_visitante ?? "",
p1Local: W.marcador_local_p1 ?? "",
p2Local: W.marcador_local_p2 ?? "",
p3Local: W.marcador_local_p3 ?? "",
p4Local: W.marcador_local_p4 ?? "",
p1Visitante: W.marcador_visitante_p1 ?? "",
p2Visitante: W.marcador_visitante_p2 ?? "",
p3Visitante: W.marcador_visitante_p3 ?? "",
p4Visitante: W.marcador_visitante_p4 ?? ""
});
});
let U = {};
return (Y || []).forEach((W) => {
let z = U[W.jornada_id] || (U[W.jornada_id] = {});
z[W.player_id] = {
minutos: W.minutos || 0,
puntos: W.puntos || 0,
t3: W.t3 || 0,
tlibre: W.tlibre || 0,
t2: W.t2 || 0,
t2Intentados: W.t2_intentados || 0,
t3Intentados: W.t3_intentados || 0,
tlibreIntentados: W.tlibre_intentados || 0,
rebofen: W.rebofen || 0,
rebdefe: W.rebdefe || 0,
asist: W.asist || 0,
pd: W.pd || 0,
robos: W.robos || 0,
tap: W.tap || 0,
faltas: W.faltas || 0,
valoracion: W.valoracion || 0,
jugo: !!W.jugo,
victoria: !!W.victoria,
diferencia: W.diferencia || 0,
mvp: !!W.mvp,
_jornada: W.jornada_id
};
}), ($ || []).map((W) => ({
id: W.id,
name: W.name,
partidos: G[W.id] || [],
stats: U[W.id] || {},
lineups: W.lineups || {},
mvpPlayerId: W.mvp_player_id || null,
playoffRound: W.playoff_round || u6(W.id)
})).sort((W, z) => B0(W.name) - B0(z.name));
} catch {
return [];
}
}
var y6 = { j90: "CUARTOS_IDA", j91: "CUARTOS_VUELTA", j92: "SEMIS", j93: "FINAL" };
function u6($) {
return y6[$] || null;
}
async function j6($) {
try {
if (!g.regularSeasonDateOver($))
return !1;
let Q = z$.buildBracket($);
if (!Q.ready)
return !1;
let X = (z) => z.marcadorLocal !== "" && z.marcadorLocal != null && z.marcadorVisitante !== "" && z.marcadorVisitante != null, Z = [], Y = $.find((z) => z.playoffRound === "CUARTOS_IDA"), V = $.find((z) => z.playoffRound === "CUARTOS_VUELTA"), G = $.find((z) => z.playoffRound === "SEMIS"), U = $.find((z) => z.playoffRound === "FINAL");
if (Y)
Z.push([Y, Q.cuartos.map((z) => [z.teamB, z.teamA])]);
if (V)
Z.push([V, Q.cuartos.map((z) => [z.teamA, z.teamB])]);
if (G && Q.semis.every((z) => z.teamA && z.teamB))
Z.push([G, Q.semis.map((z) => [z.teamA, z.teamB])]);
if (U && Q.final.teamA && Q.final.teamB)
Z.push([U, [[Q.final.teamA, Q.final.teamB]]]);
let W = !1;
for (let [z, R] of Z) {
let H = z.partidos || [], q = H.find((J) => J.fecha)?.fecha || null, D = H.find((J) => J.hora)?.hora || null;
for (let J = 0;J < R.length; J++) {
let [B, I] = R[J], L = H[J];
if (L) {
if (X(L))
continue;
if (L.local === B && L.visitante === I)
continue;
let { error: j } = await n.from("partidos").update({ local: B, visitante: I }).eq("id", L.id).eq("jornada_id", z.id);
if (!j)
W = !0;
} else {
let { error: j } = await n.from("partidos").insert({ id: `${z.id}_m${J + 1}`, jornada_id: z.id, local: B, visitante: I, fecha: q, hora: D });
if (!j)
W = !0;
}
}
for (let J of H.slice(R.length)) {
if (X(J))
continue;
let { error: B } = await n.from("partidos").delete().eq("id", J.id).eq("jornada_id", z.id);
if (!B)
W = !0;
}
}
return W;
} catch {
return !1;
}
}
async function k$($) {
try {
let { id: Q, name: X, lineups: Z, partidos: Y, stats: V, mvpPlayerId: G } = $, U = await n.from("jornadas").upsert({ id: Q, name: X, lineups: Z || {}, mvp_player_id: G || null });
if (U.error)
return console.error("writeJornada: error guardando jornadas", U.error), { ok: !1, error: U.error.message };
if (Y && Y.length > 0) {
let z = await n.from("partidos").delete().eq("jornada_id", Q);
if (z.error)
return console.error("writeJornada: error borrando partidos", z.error), { ok: !1, error: z.error.message };
let R = Y.map((q) => ({
id: q.id,
jornada_id: Q,
local: q.local,
visitante: q.visitante,
fecha: q.fecha || null,
hora: q.hora || null,
marcador_local: q.marcadorLocal === "" || q.marcadorLocal == null ? null : Number(q.marcadorLocal),
marcador_visitante: q.marcadorVisitante === "" || q.marcadorVisitante == null ? null : Number(q.marcadorVisitante),
...Object.fromEntries(["1", "2", "3", "4"].flatMap((D) => [
[`marcador_local_p${D}`, q[`p${D}Local`] === "" || q[`p${D}Local`] == null ? null : Number(q[`p${D}Local`])],
[`marcador_visitante_p${D}`, q[`p${D}Visitante`] === "" || q[`p${D}Visitante`] == null ? null : Number(q[`p${D}Visitante`])]
]))
})), H = await n.from("partidos").insert(R);
if (H.error)
return console.error("writeJornada: error insertando partidos", H.error), { ok: !1, error: H.error.message };
}
let W = Object.entries(V || {});
if (W.length > 0) {
let z = W.map(([H, q]) => ({
jornada_id: Q,
player_id: H,
minutos: q.minutos || 0,
puntos: q.puntos || 0,
t3: q.t3 || 0,
tlibre: q.tlibre || 0,
t2: q.t2 || 0,
t2_intentados: q.t2Intentados || 0,
t3_intentados: q.t3Intentados || 0,
tlibre_intentados: q.tlibreIntentados || 0,
rebofen: q.rebofen || 0,
rebdefe: q.rebdefe || 0,
asist: q.asist || 0,
pd: q.pd || 0,
robos: q.robos || 0,
tap: q.tap || 0,
faltas: q.faltas || 0,
valoracion: q.valoracion || 0,
jugo: !!q.jugo,
victoria: !!q.victoria,
diferencia: q.diferencia || 0,
mvp: !!q.mvp
})), R = await n.from("jornada_stats").upsert(z, { onConflict: "jornada_id,player_id" });
if (R.error)
return console.error("writeJornada: error guardando jornada_stats", R.error), { ok: !1, error: R.error.message };
}
return { ok: !0 };
} catch (Q) {
return { ok: !1, error: Q?.message || String(Q) };
}
}
function L0($, Q, X, Z, Y) {
try {
n.functions.invoke("send-push", { body: { leagueId: $, userName: Q, title: X, body: Z, ...Y } }).catch(() => {});
} catch {}
}
var i0 = "team_";
function m6($, Q) {
return `${i0}${$}::${s$(Q) || "x"}`;
}
function v($, Q) {
return `${Q}_${$}`;
}
async function w0($, Q, X) {
return await l(m6($, Q), { ...X, name: Q });
}
async function G$($) {
try {
let Q = `${i0}${$}::`, { data: X, error: Z } = await n.from("kv_store").select("key,value").like("key", `${Q}%`);
if (Z)
throw Z;
let Y = {};
return (X || []).forEach((V) => {
let G = V.value, U = G?.name || V.key.slice(Q.length);
Y[U] = G;
}), Y;
} catch {
return null;
}
}
function N0($) {
if (!$)
return null;
let Q = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec($.trim());
if (!Q)
return null;
let [, X, Z, Y] = Q, V = new Date(Number(Y), Number(Z) - 1, Number(X));
return isNaN(V.getTime()) ? null : V;
}
function p6($) {
let Q = null;
return ($?.partidos || []).forEach((X) => {
let Z = N0(X.fecha);
if (Z && (!Q || Z < Q))
Q = Z;
}), Q;
}
function o0($) {
let Q = null;
return ($?.partidos || []).forEach((X) => {
if (!X.fecha || h0(X))
return;
let Z = N0(X.fecha);
if (!Z)
return;
let Y = /^(\d{1,2})[:.h](\d{2})/.exec(String(X.hora || "").trim()), V = Y ? Math.min(23, Number(Y[1])) : 12, G = Y ? Math.min(59, Number(Y[2])) : 0, U = new Date(Z.getFullYear(), Z.getMonth(), Z.getDate(), V, G, 0, 0);
if (!Q || U < Q)
Q = U;
}), Q;
}
function u0($) {
let Q = o0($);
if (Q && z0().getTime() >= Q.getTime())
return !0;
if (($.partidos || []).some((Y) => Y.marcadorLocal != null && Y.marcadorLocal !== "" && Y.marcadorVisitante != null && Y.marcadorVisitante !== ""))
return !0;
return !!($.stats && Object.keys($.stats).length > 0);
}
function S$($) {
let Q = null;
return ($?.partidos || []).forEach((X) => {
let Z = N0(X.fecha);
if (Z && (!Q || Z > Q))
Q = Z;
}), Q;
}
var a8 = D$({ offers: [], me: null, onEditOffer: null, onCancelOffer: null });
function P$($, Q = []) {
let X = () => {}, Z = X, Y = X, V = X, G = X, U = X, W = X, z = X, R = X, H = X, q = X, D = { current: !1 }, J = async (_) => {
if (M0())
return _;
let T = await _0(), b = await u("pricedJornadas", []), K = T.filter((E) => E.stats && Object.keys(E.stats).length > 0 && !b.includes(E.id));
if (K.length === 0)
return _;
let f = await d0() || {};
for (let E of K) {
let p = { ...E.lineups || {} };
Object.entries(f).forEach(([F, w]) => {
if (!p[F] && w.lineup)
p[F] = w.lineup;
});
let i = { ...E, lineups: p };
await k$(i);
let h = [];
if (Object.entries(f).forEach(([F, w]) => {
let P = a.bumpClausesToMarket(w, _);
if (P !== w)
f[F] = P, h.push(w0(w.leagueId, w.name, P));
}), h.length > 0)
await Promise.all(h);
}
return await l("pricedJornadas", [...b, ...K.map((E) => E.id)]), _;
}, B = async () => {
if (M0())
return;
try {
let _ = await _0(), T = await u("jornadaStartWarned", []), b = H$();
for (let K of _) {
if (T.includes(K.id))
continue;
let f = o0(K);
if (!f)
continue;
let E = f.getTime() - b;
if (E > 0 && E <= 600000) {
let { data: p } = await n.from("push_subscriptions").select("league_id,user_name"), i = /* @__PURE__ */ new Set;
(p || []).forEach((h) => {
let F = `${h.league_id}::${h.user_name}`;
if (i.has(F))
return;
i.add(F), L0(h.league_id, h.user_name, "\uD83C\uDFC0 \u00A1La jornada est\u00E1 a punto de empezar!", `${K.name} arranca en menos de 10 minutos.`);
}), await l("jornadaStartWarned", [...T, K.id]);
}
}
} catch {}
}, I = async () => {
if (M0())
return;
try {
let _ = await _0(), T = await k0(), b = await u("idealFiveAwarded", []);
for (let K of _) {
if (b.includes(K.id))
continue;
if (!K.stats || Object.keys(K.stats).length < 5)
continue;
if (!t.isJornadaReady(K))
continue;
let f = Y6.compute(K, T);
if (!f)
continue;
let E = new Set(f.playerIds), p = await d0() || {}, i = [], h = {};
Object.values(p).forEach((F) => {
let w = h$(K, F.name, F.lineup, T);
if (!w)
return;
let P = [...w].filter((A) => E.has(A));
if (P.length === 0)
return;
let c = { ...F, budgetSpent: (F.budgetSpent || 0) - Z$ };
i.push(w0(F.leagueId, F.name, c)), L0(F.leagueId, F.name, "\u2B50 \u00A1Est\u00E1s en el 5 ideal!", `Una de tus jugadoras ha entrado en el 5 ideal de ${K.name}. Te llevas ${f0(Z$)}.`);
let x = P.map((A) => T.find((y) => y.id === A)?.name).filter(Boolean).join(", ");
(h[F.leagueId] ||= []).push({ type: "ideal_five", userId: F.name, jornadaName: K.name, amount: Z$, playerNames: x });
}), await Promise.all(i), await Promise.all(Object.entries(h).map(async ([F, w]) => {
let P = await u(v(F, "activity"), []), x = [...w.map((A) => ({ id: P0("act"), ts: K0(), ...A })), ...P].slice(0, 60);
if (await l(v(F, "activity"), x), F === $)
V(x);
})), await l("idealFiveAwarded", [...b, K.id]);
}
} catch {}
}, L = async () => {
if (M0()) {
try {
let _ = await _0();
if (_.length)
Z((T) => l0(_, T));
} catch {}
return;
}
try {
let _ = await _0(), T = !1, b = [];
for (let K of _) {
if (!u0(K)) {
b.push(K);
continue;
}
let f = o0(K), E = await d0() || {}, p = { ...K.lineups || {} }, i = !1;
if (Object.values(E).forEach((h) => {
let F = `${h.leagueId}::${h.name}`;
if (p[F] || !h.lineup)
return;
if (h.createdAt && f && h.createdAt > f.getTime())
return;
let w = (h.budgetTotal || 0) - (h.budgetSpent || 0) < 0;
p[F] = w ? { ...h.lineup, debtLocked: !0 } : h.lineup, i = !0;
}), i) {
let h = await k$({ ...K, lineups: p });
if (h.ok)
T = !0, b.push({ ...K, lineups: p });
else
console.error("checkLineupLock: no se pudo guardar la jornada", K.id, h.error), b.push(K);
} else
b.push(K);
}
if (T)
Z(b);
} catch {}
}, j = async () => {
if (M0())
return;
try {
let _ = R0(/* @__PURE__ */ new Date), T = await u("marketSimDate", null);
if (T && T <= _)
await V$("marketSimDate"), await V$("marketSimTime"), await V$("marketSimAnchorRealMs"), h6(null);
let b = R0(z0());
if (await u("marketPricingLastRun", "") === b)
return;
let f = await k0(), E = await _0(), p = await d0() || {}, i = Math.max(Object.keys(p).length, 1), { standings: h } = W0.computeStandings(E), F = await f6(), w = await x6(), P = f.filter((N) => N.position !== "DT").map((N) => N.basePrice || 0).filter((N) => N > 0), c = P.length ? P.reduce((N, m) => N + m, 0) / P.length : 10, x = { todayStr: b, jornadas: E, players: f, standings: h, totalTeams: i, bidsMap: F, favoritesMap: w, avgPrice: c }, A = [];
f.forEach((N) => {
let m = W0.computeDailyUpdate(N, x);
if (m)
A.push({ id: N.id, ...m });
});
let y = await u("jornadaMvpPriced", []), k = [...y];
for (let N of E) {
if (y.includes(N.id))
continue;
if (!t.isJornadaReady(N))
continue;
let m = t.computeActualMvp(N, f, E);
if (m) {
await n.from("jornadas").update({ mvp_player_id: m }).eq("id", N.id);
let s = f.find((M) => M.id === m);
if (s && s.position !== "DT") {
let M = A.find((o) => o.id === m), O = M ? M.basePrice : s.basePrice, V0 = O * 0.007, q0 = O + V0;
if (M) {
M.basePrice = q0;
let o = M.priceHistory.slice();
o[o.length - 1] = { ...o[o.length - 1], value: q0 }, M.priceHistory = o;
} else
A.push({
id: m,
basePrice: q0,
prevBasePrice: s.basePrice,
priceHistory: W$(s.priceHistory, s.basePrice, b, q0),
marketCycle: s.marketCycle || {}
});
}
}
k.push(N.id);
}
if (k.length !== y.length)
await l("jornadaMvpPriced", k);
if (A.length > 0) {
await Promise.all(A.map((M) => n.from("players").update({
base_price: M.basePrice,
prev_base_price: M.prevBasePrice,
price_history: M.priceHistory,
market_cycle: M.marketCycle
}).eq("id", M.id)));
let N = (M, O) => !O ? M : {
...M,
basePrice: O.basePrice !== void 0 ? O.basePrice : M.basePrice,
prevBasePrice: O.prevBasePrice !== void 0 ? O.prevBasePrice : M.prevBasePrice,
priceHistory: O.priceHistory !== void 0 ? O.priceHistory : M.priceHistory,
marketCycle: O.marketCycle
}, m = f.map((M) => N(M, A.find((O) => O.id === M.id)));
Y((M) => M.map((O) => N(O, A.find((V0) => V0.id === O.id))));
let s = [];
if (Object.values(p).forEach((M) => {
let O = a.bumpClausesToMarket(M, m);
if (O !== M)
s.push(w0(M.leagueId, M.name, O));
}), s.length > 0)
await Promise.all(s);
}
await l("marketPricingLastRun", b);
} catch {}
}, Q0 = async (_) => {
let T = await u(v($, "activity"), Q), b = [{ id: P0("act"), ts: K0(), ..._ }, ...T].slice(0, 60);
await l(v($, "activity"), b), V(b);
};
return { settlePlayerPricing: J, checkJornadaStartWarning: B, checkIdealFive: I, checkLineupLock: L, checkDailyMarketPricing: j, logActivity: Q0, checkPlayoffProgress: async () => {
if (!$)
return;
if (M0()) {
try {
G(await u(v($, "playoffState"), g.emptyState()));
} catch {}
return;
}
try {
let [_, T, b] = await Promise.all([_0(), k0(), G$($)]);
if (await j6(_))
_ = await _0(), Z((F) => l0(_, F));
let K = await u(v($, "playoffState"), g.emptyState()), f = R0(z0()), E = !1;
if (K.phase === "none") {
let F = g.regularJornadas(_), w = F.length > 0 ? [...F].sort((x, A) => B0(A.name) - B0(x.name))[0] : null, P = g.regularSeasonFinished(_), c = !1;
if (w) {
let x = S$(w);
if (x) {
let A = new Date(x);
A.setDate(A.getDate() + 1), A.setHours(0, 0, 0, 0);
let y = z0();
y.setHours(0, 0, 0, 0), c = y >= A;
}
}
if (c) {
let A = C6.computeStandings(b || {}, T, g.regularJornadas(_), $).slice(0, 8).map((y) => y.name);
if (A.length > 0)
K = { ...g.emptyState(), phase: "cuartos_draft", round: "CUARTOS", qualifiers: A, draftDay: 0, lastAllocationDate: f }, E = !0, await Q0({ type: "playoff_start", qualifiers: A });
}
}
if (K.phase !== "none" && K.phase !== "finished") {
let F = { formation: "2-2-1", starters: [], bench: { BASE: null, ALERO: null, PIVOT: null }, titularCoach: null, captainId: null };
["CUARTOS_IDA", "CUARTOS_VUELTA", "SEMIS", "FINAL"].forEach((w) => {
let P = g.findRoundJornadas(_, w)[0];
if (!P || !u0(P))
return;
let c = w.startsWith("CUARTOS") ? "CUARTOS" : w, x = K.lockedLineups[w] || {}, A = K.lineups[c] || {}, y = !1, k = { ...x };
if ((K.qualifiers || []).forEach((N) => {
if (k[N])
return;
k[N] = A[N] || F, y = !0;
}), y)
K = { ...K, lockedLineups: { ...K.lockedLineups, [w]: k } }, E = !0;
});
}
if ((K.phase === "cuartos_draft" || K.phase === "semis_draft") && K.lastAllocationDate !== f) {
let F = K.round, w = K.lists && K.lists[F] || {}, P = K.squads && K.squads[F] || {}, c = Object.values(P).flat(), x = g.availablePool(_, T, F, c), A = N$[F], y = g.runDailyAllocation({ order: K.qualifiers, lists: w, squadsSoFar: P, availableIds: x.map((M) => M.id), targetSize: A }), k = { ...P }, N = [...K.log], m = K.draftDay + 1;
if (y.forEach(({ userName: M, playerId: O }) => {
k[M] = [...k[M] || [], O], N.push({ round: F, day: K.draftDay, userName: M, playerId: O, ts: K0() });
}), m >= 5) {
if (K.qualifiers.some((O) => (k[O] || []).length < A)) {
let O = Object.values(k).flat(), V0 = g.availablePool(_, T, F, O), q0 = F === "CUARTOS" ? g.regularJornadas(_) : g.jornadasForRound(_, "CUARTOS"), o = (C) => q0.reduce((d, X0) => d + (C.position === "DT" ? r0(null, q$(X0, C.team)).total : I0(X0.stats?.[C.id], C.position)), 0), H0 = [...V0].sort((C, d) => o(d) - o(C)).map((C) => C.id);
g.catchUpAllocation({ order: K.qualifiers, squadsSoFar: k, sortedPoolIds: H0, targetSize: A }).forEach(({ userName: C, playerId: d }) => {
k[C] = [...k[C] || [], d], N.push({ round: F, day: m, userName: C, playerId: d, ts: K0(), forced: !0 });
});
}
}
let s = { ...w };
K.qualifiers.forEach((M) => {
if ((k[M] || []).length < A)
delete s[M];
}), K = { ...K, squads: { ...K.squads, [F]: k }, lists: { ...K.lists, [F]: s }, log: N, draftDay: m, lastAllocationDate: f }, E = !0;
}
let p = g.findRoundJornadas(_, "SEMIS")[0], i = p ? p6(p) : null, h = !1;
if (i) {
let F = new Date(i);
F.setDate(F.getDate() + 1), F.setHours(0, 0, 0, 0), h = z0() >= F;
}
if (K.phase === "cuartos_draft" && g.roundHasResults(_, "CUARTOS") && b6(z0())) {
let F = {};
K.qualifiers.forEach((P) => {
let c = (K.lineups.CUARTOS || {})[P] || null;
F[P] = g.computeRoundPoints(_, "CUARTOS", K.lockedLineups, P, T, c);
});
let w = g.cutTop(K.qualifiers, F, Math.min(4, K.qualifiers.length));
K = { ...K, phase: "semis_draft", round: "SEMIS", qualifiers: w, draftDay: 0, lastAllocationDate: f, pointsByRound: { ...K.pointsByRound, CUARTOS: F }, prevRoundQualifiers: K.qualifiers }, E = !0, await Q0({ type: "playoff_advance", round: "CUARTOS", advancing: w });
} else if (K.phase === "semis_draft" && g.roundHasResults(_, "SEMIS") && h) {
let F = {};
K.qualifiers.forEach((P) => {
let c = (K.lineups.SEMIS || {})[P] || null;
F[P] = g.computeRoundPoints(_, "SEMIS", K.lockedLineups, P, T, c);
});
let w = g.cutTop(K.qualifiers, F, Math.min(2, K.qualifiers.length));
K = { ...K, phase: "final_draft", round: "FINAL", qualifiers: w, draftDay: 0, lastAllocationDate: f, pointsByRound: { ...K.pointsByRound, SEMIS: F }, prevRoundQualifiers: K.qualifiers }, E = !0, await Q0({ type: "playoff_advance", round: "SEMIS", advancing: w });
} else if (K.phase === "final_draft") {
let F = K.lists.FINAL || {}, w = K.qualifiers.length > 0 && K.qualifiers.every((c) => (F[c] || []).length > 0), P = Object.keys(K.squads.FINAL || {}).length > 0;
if (w && !P) {
let c = g.availablePool(_, T, "FINAL", []), x = g.runFinalAllocation({ order: K.qualifiers, lists: F, availableIds: c.map((k) => k.id), targetSize: N$.FINAL }), A = {}, y = [...K.log];
x.forEach(({ userName: k, playerId: N }) => {
A[k] = [...A[k] || [], N], y.push({ round: "FINAL", day: 0, userName: k, playerId: N, ts: K0() });
}), K = { ...K, squads: { ...K.squads, FINAL: A }, log: y }, E = !0;
}
if (g.roundHasResults(_, "FINAL")) {
let c = {};
K.qualifiers.forEach((A) => {
let y = (K.lineups.FINAL || {})[A] || null;
c[A] = g.computeRoundPoints(_, "FINAL", K.lockedLineups, A, T, y);
});
let x = g.cutTop(K.qualifiers, c, 1)[0] || null;
if (K = { ...K, phase: "finished", champion: x, pointsByRound: { ...K.pointsByRound, FINAL: c } }, E = !0, x)
await Q0({ type: "playoff_champion", champion: x });
}
}
if (E)
await l(v($, "playoffState"), K), G(K);
else
G(K);
} catch {}
}, syncMarket: async (_, T) => {
if (!_ || T == null || D.current)
return;
if (((await u(v(_, "playoffState"), null))?.phase || "none") !== "none")
return;
if (M0()) {
try {
let [K, f, E, p, i, h, F, w, P] = await Promise.all([
k0(),
G$(_),
u(v(_, "currentMarket"), null),
u(v(_, "bids"), []),
u(v(_, "marketHistory"), []),
u(v(_, "activity"), []),
u(v(_, "offers"), []),
u(v(_, "triple"), []),
_0()
]);
if (K && K.length)
Y(K);
if (f)
U(f);
if (W(E), z(p), R(i), V(h), H(F), q(w), P && P.length)
Z((c) => l0(P, c));
} catch {}
return;
}
D.current = !0;
try {
let [K, f, E, p, i, h, F, w, P] = await Promise.all([
k0(),
G$(_),
u(v(_, "currentMarket"), null),
u(v(_, "bids"), []),
u(v(_, "marketHistory"), []),
u(v(_, "activity"), []),
u(v(_, "offers"), []),
u(v(_, "triple"), []),
_0()
]);
if (f === null)
return;
let c = f, x = K0(), A = await u(v(_, "marketHourV3"), null);
if (!A || !/^\d{2}:\d{2}(:\d{2})?$/.test(A))
A = T || O0.hourOf(K0()), await l(v(_, "marketHourV3"), A);
let y = O0.computeWindow(A, x), k = c, N = p, m = K, s = i, M = h, O = E, V0 = (C) => C.some((d) => d.marketId === E?.id && d.status !== "active"), q0 = E && !E.resolved && x >= E.closesAt && !V0(p);
if (q0) {
let C = await u(v(_, "bids"), p);
if (!V0(C)) {
let { teams: d, bids: X0, historyEntry: r, activityEntries: U0 } = x0.resolveMarket(E, C, K, c);
k = d, N = X0, s = [...i, r].slice(-40), M = [...U0, ...h].slice(0, 60);
let Z0 = Object.keys(k).filter((S) => k[S] !== c[S]);
if (await Promise.all([
...Z0.map((S) => w0(_, S, k[S])),
l(v(_, "bids"), N),
l(v(_, "marketHistory"), s),
l(v(_, "activity"), M)
]), (r.results || []).forEach((S) => {
let e = K.find((T0) => T0.id === S.assetId);
if (e)
L0(_, S.winnerUserId, "\u2705 \u00A1Fichaje del mercado!", `Has ganado la puja por ${e.name} por ${f0(S.amount)}.`);
let Y0 = k[S.winnerUserId];
if (Y0 && (Y0.budgetTotal || 0) - (Y0.budgetSpent || 0) < 0)
L0(_, S.winnerUserId, "\u26A0\uFE0F Te has quedado en negativo", "Ese fichaje te ha dejado con el presupuesto en negativo. Recuerda que si sigues endeudada/o cuando empiece la jornada, no puntuar\u00E1s.");
}), (r.results || []).length > 0) {
let S = await w$();
r.results.forEach((e) => {
let Y0 = K.find((T0) => T0.id === e.assetId);
if (!Y0)
return;
(S[e.assetId] || []).forEach((T0) => {
if (T0 === e.winnerUserId)
return;
L0(_, T0, "\u2B50 Una favorita tuya ha cambiado de manos", `${e.winnerUserId} ha fichado a ${Y0.name} por ${f0(e.amount)}.`);
});
});
}
}
}
if (!O || R0(new Date(O.closesAt)) !== R0(new Date(y.closesAt)) || q0) {
let C = O0.buildAssets(m, k, n$);
O = { id: P0("mk"), opensAt: y.opensAt, closesAt: y.closesAt, assetIds: C, resolved: !1 }, await l(v(_, "currentMarket"), O);
let d = await u(v(_, "favMarketNotifiedDate"), null), X0 = R0(new Date(y.closesAt));
if (C.length > 0 && d !== X0) {
await l(v(_, "favMarketNotifiedDate"), X0);
let Z0 = await w$();
C.forEach((S) => {
let e = m.find((Y0) => Y0.id === S);
if (!e)
return;
(Z0[S] || []).forEach((Y0) => {
L0(_, Y0, "\u2B50 \u00A1Una favorita tuya est\u00E1 en el mercado!", `${e.name} ya se puede pujar en el mercado de hoy.`);
});
});
}
let { teams: r, changed: U0 } = O0.refreshSaleOffers(k, m, O);
if (U0) {
k = r;
let Z0 = Object.keys(k).filter((S) => k[S] !== c[S]);
await Promise.all(Z0.map((S) => w0(_, S, k[S])));
}
} else if (O && !O.resolved && x < O.closesAt && Math.abs(O.closesAt - y.closesAt) > 60000)
O = { ...O, opensAt: y.opensAt, closesAt: y.closesAt }, await l(v(_, "currentMarket"), O);
if (O && !O.resolved && x < O.closesAt) {
let C = x0.ownedIdsOf(k), d = (O.assetIds || []).filter((X0) => C.has(X0));
if (d.length > 0) {
let X0 = (O.assetIds || []).filter((S) => !C.has(S)), r = O0.buildAssets(m, k, d.length, X0);
O = { ...O, assetIds: [...X0, ...r] }, await l(v(_, "currentMarket"), O);
let U0 = new Set(d), Z0 = N.filter((S) => !(S.marketId === O.id && U0.has(S.assetId) && S.status === "active"));
if (Z0.length !== N.length)
N = Z0, await l(v(_, "bids"), N);
}
}
let H0 = w;
if (w.filter((C) => !C.settled).length > 0) {
let C = !1, d = {}, X0 = {};
if (H0 = w.map((r) => {
if (r.settled)
return r;
let U0 = P.find((Y0) => Y0.id === r.jornadaId);
if (!U0 || !t.isJornadaReady(U0))
return r;
if (!(r.jornadaId in X0))
X0[r.jornadaId] = t.computeActualMvp(U0, K, P);
let { correct: Z0, mvpCorrect: S, prize: e } = t.scoreEntry(r, U0, X0[r.jornadaId]);
return d[r.userId] = (d[r.userId] || 0) + e, C = !0, { ...r, settled: !0, correct: Z0, mvpCorrect: S, prize: e, actualMvpId: X0[r.jornadaId] };
}), C) {
await l(v(_, "triple"), H0);
let r = Object.entries(d).map(async ([Z0, S]) => {
if (S <= 0)
return;
let e = k[Z0] || a.emptyTeam(), Y0 = { ...e, budgetSpent: (e.budgetSpent || 0) - S };
k[Z0] = Y0, await w0(_, Z0, Y0);
});
await Promise.all(r);
let U0 = Object.entries(d).filter(([, Z0]) => Z0 > 0);
if (U0.length > 0)
M = [...U0.map(([S, e]) => ({ id: P0("act"), ts: K0(), type: "triple", userId: S, amount: e })), ...M].slice(0, 60), await l(v(_, "activity"), M);
}
}
if (O && !O.resolved && !O.closeWarningSent) {
let C = O.closesAt - x;
if (C > 0 && C <= 180000)
Object.keys(k).forEach((d) => {
L0(_, d, "\u23F0 \u00A1El mercado cierra en 3 minutos!", "\u00DAltimas pujas antes de que se cierre.");
}), O = { ...O, closeWarningSent: !0 }, await l(v(_, "currentMarket"), O);
}
Y(m), U(k), z(N), R(s), V(M), W(O), H(F), q(H0), Z((C) => l0(P, C));
} finally {
D.current = !1;
}
} };
}
async function C$($) {
g$ = !0;
let Q = Date.now(), X = P$(null), Z = async (V, G) => {
let U = Date.now();
try {
await G(), $.push({ step: V, ms: Date.now() - U });
} catch (W) {
$.push({ step: V, error: String(W && W.message || W) });
}
};
await Z("settlePlayerPricing", async () => {
let V = await k0();
await X.settlePlayerPricing(V);
}), await Z("checkJornadaStartWarning", () => X.checkJornadaStartWarning()), await Z("checkIdealFive", () => X.checkIdealFive()), await Z("checkLineupLock", () => X.checkLineupLock()), await Z("checkDailyMarketPricing", () => X.checkDailyMarketPricing());
let { data: Y } = await n.from("leagues").select("id,created_at");
for (let V of Y || []) {
let G = c6(V.created_at), U = G ? O0.hourOf(G.getTime()) : "", W = await u(v(V.id, "activity"), []), z = P$(V.id, W);
await Z(`checkPlayoffProgress:${V.id}`, () => z.checkPlayoffProgress()), await Z(`syncMarket:${V.id}`, () => z.syncMarket(V.id, U));
}
return { leagues: (Y || []).length, ms: Date.now() - Q };
}

// entry.js
async function Y1({ client: $, dry: Q = !1, clockOffsetMs: X = 0, source: Z = "cron" }) {
_$($, { dry: Q }), $$(Q ? X : 0);
let Y = [];
try {
if (!Q) {
let U = Number(await u("cronLock", 0)) || 0;
if (U && Date.now() - U < 50000)
return { ok: !0, skipped: "locked", source: Z };
await l("cronLock", Date.now());
}
let V = await C$(Y), G = await J$();
return { ok: !0, dry: Q, source: Z, ...V, pendingPush: G, steps: Y, writes: Q ? R$() : void 0, now: (/* @__PURE__ */ new Date()).toString(), madrid: (/* @__PURE__ */ new Date()).toLocaleString("es-ES") };
} catch (V) {
return { ok: !1, error: String(V && V.message || V), steps: Y };
} finally {
if (!Q)
try {
await l("cronLock", 0);
} catch {}
$$(0);
}
}
export {
Y1 as runTick
};
