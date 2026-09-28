// Servidor antiguo: ahora solo reenvía cada petición al servidor nuevo
// (fabtasy-cron-v2), para que las versiones antiguas de la app, que llaman
// a "fabtasy-cron", usen exactamente la misma lógica.
Deno.serve(async (req) => {
  const body = await req.text().catch(() => "");
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/fabtasy-cron-v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": req.headers.get("Authorization") || `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
    },
    body: body || "{}",
  });
  return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
});
