import { __setClockOffset } from "./tz-shim.js";
import { __configure, __dryLog, __flushPending } from "./server-client.js";
import { __serverTick, readShared, writeShared } from "./core.jsx";

// Una pasada completa. opts: { client, dry, clockOffsetMs, source }
export async function runTick({ client, dry = false, clockOffsetMs = 0, source = "cron" }) {
  __configure(client, { dry });
  __setClockOffset(dry ? clockOffsetMs : 0);
  const log = [];
  try {
    // Candado: evita dos pasadas a la vez (cron + app pidiendo una pasada).
    if (!dry) {
      const lock = Number(await readShared("cronLock", 0)) || 0;
      if (lock && Date.now() - lock < 50000) return { ok: true, skipped: "locked", source };
      await writeShared("cronLock", Date.now());
    }
    const res = await __serverTick(log);
    const pendingPush = await __flushPending();
    return { ok: true, dry, source, ...res, pendingPush, steps: log, writes: dry ? __dryLog() : undefined, now: new Date().toString(), madrid: new Date().toLocaleString("es-ES") };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e), steps: log };
  } finally {
    if (!dry) { try { await writeShared("cronLock", 0); } catch {} }
    __setClockOffset(0);
  }
}
