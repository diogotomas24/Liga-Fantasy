// Fuerza la zona horaria Europe/Madrid para TODO el código del juego en el
// servidor (el runtime de Supabase va en UTC). Además permite un "desfase"
// de reloj solo para simulacros (__setClockOffset).
const OrigDate = globalThis.Date;
const TZ = "Europe/Madrid";
let CLOCK_OFFSET = 0;
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const offCache = new Map();
function offsetAt(ms) { // ms que hay que SUMAR a UTC para tener la hora de Madrid
  const key = Math.floor(ms / 60000);
  const c = offCache.get(key); if (c !== undefined) return c;
  const parts = {}; for (const p of fmt.formatToParts(new OrigDate(ms))) parts[p.type] = p.value;
  const asUTC = OrigDate.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const off = asUTC - (ms - (((ms % 1000) + 1000) % 1000));
  if (offCache.size > 5000) offCache.clear();
  offCache.set(key, off); return off;
}
function localToUtc(y, mo, d, h, mi, s, ms) {
  const guess = OrigDate.UTC(y, mo, d, h, mi, s, ms);
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return t;
}
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
function parseLocal(str) {
  const m = LOCAL_RE.exec(String(str).trim());
  if (!m) return null;
  return localToUtc(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), +((m[7] || "0").padEnd(3, "0")));
}
class MadridDate extends OrigDate {
  constructor(...a) {
    if (a.length === 0) { super(OrigDate.now() + CLOCK_OFFSET); return; }
    if (a.length === 1) {
      const v = a[0];
      if (typeof v === "string") { const t = parseLocal(v); super(t != null ? t : v); return; }
      super(v instanceof OrigDate ? v.getTime() : v); return;
    }
    const [y, mo, d = 1, h = 0, mi = 0, s = 0, ms = 0] = a;
    super(localToUtc(y, mo, d, h, mi, s, ms));
  }
  static now() { return OrigDate.now() + CLOCK_OFFSET; }
  static parse(s) { const t = parseLocal(s); return t != null ? t : OrigDate.parse(s); }
  static UTC(...a) { return OrigDate.UTC(...a); }
}
const P = MadridDate.prototype;
const shifted = (d) => new OrigDate(d.getTime() + offsetAt(d.getTime()));
P.getFullYear = function () { return shifted(this).getUTCFullYear(); };
P.getMonth = function () { return shifted(this).getUTCMonth(); };
P.getDate = function () { return shifted(this).getUTCDate(); };
P.getDay = function () { return shifted(this).getUTCDay(); };
P.getHours = function () { return shifted(this).getUTCHours(); };
P.getMinutes = function () { return shifted(this).getUTCMinutes(); };
P.getSeconds = function () { return shifted(this).getUTCSeconds(); };
P.getMilliseconds = function () { return shifted(this).getUTCMilliseconds(); };
P.getTimezoneOffset = function () { return -offsetAt(this.getTime()) / 60000; };
function setLocal(self, fn) {
  const s = shifted(self); fn(s);
  const t = localToUtc(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), s.getUTCHours(), s.getUTCMinutes(), s.getUTCSeconds(), s.getUTCMilliseconds());
  OrigDate.prototype.setTime.call(self, t); return t;
}
P.setFullYear = function (...a) { return setLocal(this, (s) => s.setUTCFullYear(...a)); };
P.setMonth = function (...a) { return setLocal(this, (s) => s.setUTCMonth(...a)); };
P.setDate = function (...a) { return setLocal(this, (s) => s.setUTCDate(...a)); };
P.setHours = function (...a) { return setLocal(this, (s) => s.setUTCHours(...a)); };
P.setMinutes = function (...a) { return setLocal(this, (s) => s.setUTCMinutes(...a)); };
P.setSeconds = function (...a) { return setLocal(this, (s) => s.setUTCSeconds(...a)); };
P.setMilliseconds = function (...a) { return setLocal(this, (s) => s.setUTCMilliseconds(...a)); };
const withTZ = (o) => ({ timeZone: TZ, ...(o || {}) });
P.toLocaleString = function (l, o) { return OrigDate.prototype.toLocaleString.call(this, l, withTZ(o)); };
P.toLocaleDateString = function (l, o) { return OrigDate.prototype.toLocaleDateString.call(this, l, withTZ(o)); };
P.toLocaleTimeString = function (l, o) { return OrigDate.prototype.toLocaleTimeString.call(this, l, withTZ(o)); };
globalThis.Date = MadridDate;
export function __setClockOffset(ms) { CLOCK_OFFSET = Number(ms) || 0; }
