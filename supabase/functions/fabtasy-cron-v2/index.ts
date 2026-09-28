import { createClient } from "npm:@supabase/supabase-js@2";
import { runTick } from "./bundle.js";

const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function bundleSha(): Promise<string> {
  try {
    const txt = await Deno.readTextFile(new URL("./bundle.js", import.meta.url));
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) { return "err:" + String(e); }
}

Deno.serve(async (req) => {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  if (body.checksum === true) return Response.json({ sha256: await bundleSha() });
  const res = await runTick({ client, dry: body.dry === true, clockOffsetMs: Number(body.clockOffsetMs) || 0, source: String(body.source || "?") });
  return Response.json(res);
});
