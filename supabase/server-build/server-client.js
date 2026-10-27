// Cliente de Supabase del servidor. Envuelve el cliente real para:
//  - modo SIMULACRO (dry): lee de verdad pero NO escribe nada (lo apunta en un log)
//  - esperar a los avisos push pendientes antes de terminar la pasada
let real = null, DRY = false, LOG = [], PENDING = [];
const WRITE_OPS = new Set(["insert", "update", "upsert", "delete"]);
function summarize(table, op, payload) {
  try {
    if (table === "kv_store" && payload && payload.key) {
      const v = JSON.stringify(payload.value); return { table, op, key: payload.key, value: v && v.length > 300 ? v.slice(0, 300) + "…" : v };
    }
    const s = JSON.stringify(payload); return { table, op, payload: s && s.length > 300 ? s.slice(0, 300) + "…" : s };
  } catch { return { table, op }; }
}
function fakeChain(entry) {
  const f = function () {};
  const p = new Proxy(f, {
    get(_, prop) {
      if (prop === "then") return (res) => res({ data: null, error: null });
      return (...args) => { (entry.filters ||= []).push(`${String(prop)}(${args.map((a) => JSON.stringify(a)).join(",")})`); return p; };
    },
  });
  return p;
}
// CACHÉ DE LECTURAS POR PASADA: dentro de una misma pasada del servidor, la
// misma consulta (misma tabla + mismos filtros) solo se pide UNA vez a
// Supabase; las siguientes devuelven una copia de la respuesta guardada.
// Cualquier escritura en una tabla borra la caché de esa tabla, así que lo
// que se lee después de escribir siempre está al día. Antes cada pasada
// (cada minuto) pedía jugadoras/jornadas/estadísticas 6-8 veces seguidas y
// eso era casi todo el consumo de datos del proyecto.
let CACHE = new Map();
let STATS = { reads: 0, cached: 0, writes: 0 };
function invalidate(table) {
  for (const k of [...CACHE.keys()]) if (k.startsWith(table + "|")) CACHE.delete(k);
}
const clone = (v) => { try { return structuredClone(v); } catch { return v; } };
function wrapBuilder(qb, table, ops = [], isWrite = false) {
  return new Proxy(qb, {
    get(t, prop) {
      if (DRY && WRITE_OPS.has(prop)) {
        return (payload) => { const e = summarize(table, prop, payload); LOG.push(e); return fakeChain(e); };
      }
      if (prop === "then") {
        return (res, rej) => {
          if (isWrite) {
            invalidate(table); STATS.writes++;
            return t.then((r) => { invalidate(table); return r; }).then(res, rej);
          }
          let key;
          try { key = table + "|" + JSON.stringify(ops); } catch { key = null; }
          if (key && CACHE.has(key)) {
            STATS.cached++;
            return CACHE.get(key).then((r) => clone(r)).then(res, rej);
          }
          STATS.reads++;
          const pr = Promise.resolve(t.then((r) => r));
          if (key) {
            CACHE.set(key, pr);
            // Si la lectura falla o devuelve error, no se guarda en caché.
            pr.then((r) => { if (r && r.error) CACHE.delete(key); }, () => CACHE.delete(key));
          }
          return pr.then((r) => clone(r)).then(res, rej);
        };
      }
      const v = t[prop];
      if (typeof v !== "function") return v;
      return (...args) => {
        const out = v.apply(t, args);
        if (out && typeof out === "object" && typeof out.then === "function") {
          let argsKey; try { argsKey = JSON.parse(JSON.stringify(args)); } catch { argsKey = String(args); }
          return wrapBuilder(out, table, [...ops, [String(prop), argsKey]], isWrite || WRITE_OPS.has(prop));
        }
        return out;
      };
    },
  });
}
export const supabase = new Proxy({}, {
  get(_, prop) {
    if (prop === "from") return (table) => wrapBuilder(real.from(table), table);
    if (prop === "functions") return {
      invoke: (name, opts) => {
        if (DRY) { LOG.push({ invoke: name, body: opts && opts.body }); return Promise.resolve({ data: null, error: null }); }
        const pr = real.functions.invoke(name, opts).catch(() => ({ data: null, error: "invoke failed" }));
        PENDING.push(pr); return pr;
      },
    };
    const v = real[prop]; return typeof v === "function" ? v.bind(real) : v;
  },
});
export function __configure(client, { dry = false } = {}) { real = client; DRY = !!dry; LOG = []; PENDING = []; CACHE = new Map(); STATS = { reads: 0, cached: 0, writes: 0 }; }
export function __readStats() { return { ...STATS }; }
export function __dryLog() { return LOG; }
export async function __flushPending(timeoutMs = 20000) {
  const all = Promise.allSettled(PENDING);
  await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
  return PENDING.length;
}
