import { runTick } from "./dist/bundle.js";
const tables = {
  leagues: [{ id: "lg_test", created_at: "2026-09-24 14:45:24.351+00" }],
  players: [{ id: "p1", name: "A", team: "T1", position: "BASE", base_price: 10, prev_base_price: 9, price_history: [], market_cycle: {} },
            { id: "p2", name: "B", team: "T2", position: "PIVOT", base_price: 20, prev_base_price: 20, price_history: [], market_cycle: {} }],
  jornadas: [{ id: "j1", name: "Jornada 1", lineups: {}, mvp_player_id: null }, { id: "j2", name: "Jornada 2", lineups: {}, mvp_player_id: null }],
  partidos: [{ id: "j1_m1", jornada_id: "j1", local: "T1", visitante: "T2", fecha: "26/09/2026", hora: "12:00", marcador_local: 50, marcador_visitante: 40 },
             { id: "j2_m1", jornada_id: "j2", local: "T2", visitante: "T1", fecha: "04/10/2026", hora: "12:00", marcador_local: null, marcador_visitante: null }],
  jornada_stats: [{ jornada_id: "j1", player_id: "p1", minutos: 20, puntos: 10, tap: 2, robos: 4, jugo: true }],
  kv_store: [{ key: "marketHourV3_lg_test", value: "22:00:00" }, { key: "team_lg_test::ana", value: { name: "ana", squad: [{ id: "p1", clause: 12, pricePaid: 10 }], lineup: null, budgetTotal: 100, budgetSpent: 10 } }],
  favorites: [], push_subscriptions: [],
};
const writes = [];
function builder(table) {
  let rows = () => tables[table] || [];
  const filters = []; let op = "select", payload = null, single = false;
  const apply = () => rows().filter((r) => filters.every((f) => f(r)));
  const b = {
    select() { return b; }, limit() { return b; }, order() { return b; },
    eq(c, v) { filters.push((r) => r[c] === v); return b; }, neq(c, v) { filters.push((r) => r[c] !== v); return b; },
    like(c, pat) { const re = new RegExp("^" + pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$"); filters.push((r) => re.test(r[c])); return b; },
    in(c, vs) { filters.push((r) => vs.includes(r[c])); return b; },
    maybeSingle() { single = true; return b; }, single() { single = true; return b; },
    update(p) { op = "update"; payload = p; return b; }, upsert(p) { op = "upsert"; payload = p; return b; },
    insert(p) { op = "insert"; payload = p; return b; }, delete() { op = "delete"; return b; },
    then(res, rej) {
      try {
        if (op === "select") { const d = apply(); return res({ data: single ? (d[0] || null) : d, error: null }); }
        writes.push({ table, op, payload: JSON.stringify(payload)?.slice(0, 160) });
        if (op === "upsert" && table === "kv_store") { const arr = Array.isArray(payload) ? payload : [payload]; arr.forEach((p) => { const i = tables.kv_store.findIndex((r) => r.key === p.key); if (i >= 0) tables.kv_store[i] = { ...tables.kv_store[i], ...p }; else tables.kv_store.push(p); }); }
        return res({ data: null, error: null });
      } catch (e) { rej(e); }
    },
  };
  return b;
}
const client = { from: builder, functions: { invoke: async (n, o) => { writes.push({ invoke: n, title: o.body.title }); return { data: null }; } } };
const offs = [0, (Date.parse("2026-09-28T20:00:30Z") - Date.now()), (Date.parse("2026-09-28T22:00:30Z") - Date.now())];
for (const off of offs) {
  const r = await runTick({ client, dry: true, clockOffsetMs: off });
  console.log(JSON.stringify({ ok: r.ok, err: r.error, madrid: r.madrid, steps: r.steps, writes: r.writes }, null, 0).slice(0, 2500));
}
