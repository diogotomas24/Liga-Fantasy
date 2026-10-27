import { createClient } from "npm:@supabase/supabase-js@2";
// bundle.js se carga fijado a un commit concreto del repositorio (ver supabase/server-build/README.md).
import { runTick } from "https://cdn.jsdelivr.net/gh/diogotomas24/liga-fantasy@66d335614608aa31edd0c9b8959e996c46f6c014/supabase/functions/fabtasy-cron-v2/bundle.js";

const BUNDLE_COMMIT = "66d335614608aa31edd0c9b8959e996c46f6c014";
const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  if (body.checksum === true) return Response.json({ commit: BUNDLE_COMMIT });
  const res = await runTick({ client, dry: body.dry === true, clockOffsetMs: Number(body.clockOffsetMs) || 0, source: String(body.source || "?") });
  return Response.json(res);
});
