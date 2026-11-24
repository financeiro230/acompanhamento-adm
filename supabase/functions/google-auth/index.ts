// Acompanhamento ADM — conexão permanente com o Google (Agenda + Drive)
// Guarda a autorização permanente (refresh token) no banco e entrega ao site um acesso novo sempre que precisar.
// Segredos necessários (Supabase → Edge Functions → Secrets): GOOGLE_CLIENT_SECRET (e opcionalmente GOOGLE_CLIENT_ID)
import { createClient } from "jsr:@supabase/supabase-js@2";

const CID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "129647163515-cgeiutvud4rv0ihjulk79mm3i7ppe34h.apps.googleusercontent.com";
const SEC = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) return json({ erro: "login" }, 401);
  const body = await req.json().catch(() => ({}));
  const agora = () => new Date().toISOString();
  const lerLinha = async () => (await admin.from("google_tokens").select("*").eq("dono", user.id).maybeSingle()).data;

  if (body.acao === "status") {
    const d = await lerLinha();
    return json({ configurado: !!SEC, conectado: !!d, email: d?.email ?? null, scopes: d?.scopes ?? null });
  }
  if (!SEC) return json({ erro: "sem_segredo" }, 503);

  const google = async (params: Record<string, string>) => {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CID, client_secret: SEC, ...params }),
    });
    return { ok: r.ok, j: await r.json() };
  };

  if (body.acao === "trocar") {
    const { ok, j } = await google({ code: String(body.code || ""), grant_type: "authorization_code", redirect_uri: "postmessage" });
    if (!ok) return json({ erro: j.error_description || j.error || "falha" }, 400);
    let email: string | null = null;
    try { const u = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + j.access_token } }); if (u.ok) email = (await u.json()).email ?? null; } catch { /* sem e-mail */ }
    if (j.refresh_token) {
      await admin.from("google_tokens").upsert({ dono: user.id, refresh_token: j.refresh_token, email, scopes: j.scope, atualizado_em: agora() });
    } else {
      const d = await lerLinha();
      if (!d) return json({ erro: "sem_refresh", access_token: j.access_token, expires_in: j.expires_in, scope: j.scope, email });
      await admin.from("google_tokens").update({ email, scopes: j.scope, atualizado_em: agora() }).eq("dono", user.id);
    }
    return json({ access_token: j.access_token, expires_in: j.expires_in, scope: j.scope, email });
  }

  if (body.acao === "token") {
    const d = await lerLinha();
    if (!d) return json({ erro: "nao_conectado" }, 404);
    const { ok, j } = await google({ refresh_token: d.refresh_token, grant_type: "refresh_token" });
    if (!ok) {
      if (j.error === "invalid_grant") { await admin.from("google_tokens").delete().eq("dono", user.id); return json({ erro: "reconectar" }, 410); }
      return json({ erro: j.error_description || j.error || "falha" }, 400);
    }
    return json({ access_token: j.access_token, expires_in: j.expires_in, scope: j.scope || d.scopes, email: d.email });
  }

  if (body.acao === "desligar") {
    const d = await lerLinha();
    if (d) {
      try { await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(d.refresh_token), { method: "POST" }); } catch { /* já revogado */ }
      await admin.from("google_tokens").delete().eq("dono", user.id);
    }
    return json({ ok: true });
  }
  return json({ erro: "acao" }, 400);
});
