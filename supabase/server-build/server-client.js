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
function wrapBuilder(qb, table) {
  return new Proxy(qb, {
    get(t, prop) {
      if (DRY && WRITE_OPS.has(prop)) {
        return (payload) => { const e = summarize(table, prop, payload); LOG.push(e); return fakeChain(e); };
      }
      const v = t[prop]; return typeof v === "function" ? v.bind(t) : v;
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
export function __configure(client, { dry = false } = {}) { real = client; DRY = !!dry; LOG = []; PENDING = []; }
export function __dryLog() { return LOG; }
export async function __flushPending(timeoutMs = 20000) {
  const all = Promise.allSettled(PENDING);
  await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
  return PENDING.length;
}
