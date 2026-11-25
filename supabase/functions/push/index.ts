// Acompanhamento ADM — notificações push (celular e computador)
// Envia um "toque" vazio (Web Push com VAPID). O aparelho então busca aqui o texto das notificações pendentes.
// As chaves VAPID são geradas aqui mesmo na primeira vez e ficam guardadas no banco (ninguém precisa copiar chave).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SITE = "https://financeiro230.github.io/acompanhamento-adm/";
const b64u = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

function adminClient() {
  let chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!chave) { try { const k = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); chave = k.default ?? Object.values(k)[0] ?? ""; } catch { /* */ } }
  return createClient(Deno.env.get("SUPABASE_URL")!, chave as string, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ---------- chaves VAPID ----------
async function config(admin: ReturnType<typeof adminClient>) {
  let { data } = await admin.from("push_config").select("*").eq("id", 1).maybeSingle();
  if (!data) { await admin.from("push_config").insert({ id: 1 }); data = (await admin.from("push_config").select("*").eq("id", 1).single()).data; }
  if (!data.publica || !data.privada) {
    const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
    const pub = new Uint8Array(65); pub[0] = 4; pub.set(deB64u(jwk.x!), 1); pub.set(deB64u(jwk.y!), 33);
    const publica = b64u(pub);
    const { data: up } = await admin.from("push_config").update({ publica, privada: jwk }).eq("id", 1).is("publica", null).select().maybeSingle();
    data = up ?? (await admin.from("push_config").select("*").eq("id", 1).single()).data;
  }
  return data as { publica: string; privada: JsonWebKey; cron_token: string };
}
async function vapidJwt(cfg: { privada: JsonWebKey }, endpoint: string) {
  const key = await crypto.subtle.importKey("jwk", { ...cfg.privada, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = (o: unknown) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const corpo = enc({ typ: "JWT", alg: "ES256" }) + "." + enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:financeiro@unigameslojas.com" });
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(corpo));
  return corpo + "." + b64u(sig);
}
async function tocar(admin: ReturnType<typeof adminClient>, cfg: { publica: string; privada: JsonWebKey }, sub: { id: string; endpoint: string }) {
  try {
    const r = await fetch(sub.endpoint, { method: "POST", headers: { TTL: "86400", Urgency: "high", Authorization: `vapid t=${await vapidJwt(cfg, sub.endpoint)}, k=${cfg.publica}` } });
    if (r.status === 404 || r.status === 410) { await admin.from("push_inscricoes").delete().eq("id", sub.id); return "removida"; }
    if (r.ok) { await admin.from("push_inscricoes").update({ ultimo_ok: new Date().toISOString() }).eq("id", sub.id); return "ok"; }
    return "erro " + r.status + " " + (await r.text()).slice(0, 200);
  } catch (e) { return "falha " + String(e).slice(0, 200); }
}
type Aviso = { titulo: string; corpo: string; url?: string; tag?: string };
async function enfileirar(admin: ReturnType<typeof adminClient>, dono: string, av: Aviso, subs: { id: string; dono: string; endpoint: string }[]) {
  const minhas = subs.filter((s) => s.dono === dono);
  if (!minhas.length) return [];
  await admin.from("push_fila").insert(minhas.map((s) => ({ inscricao: s.id, titulo: av.titulo, corpo: av.corpo, url: av.url ?? SITE, tag: av.tag ?? null })));
  return minhas;
}
// marca como avisado; devolve true só na primeira vez
async function primeiraVez(admin: ReturnType<typeof adminClient>, chave: string, dono: string) {
  const { data } = await admin.from("push_enviados").upsert({ chave, dono }, { onConflict: "chave,dono", ignoreDuplicates: true }).select("chave");
  return !!(data && data.length);
}

// ---------- agenda: acontece hoje? ----------
const ymdDe = (d: Date) => d.toISOString().slice(0, 10);
function ocorreEm(ev: Record<string, any>, dia: string) {
  const rec = ev.recorrencia || "nenhuma";
  if (rec === "nenhuma") { const fim = ev.tipo !== "missao" && ev.data_fim && ev.data_fim > ev.data ? ev.data_fim : ev.data; return ev.data <= dia && dia <= fim; }
  if (rec === "datas") return ev.data === dia || (ev.rec_datas || []).includes(dia);
  if (ev.data > dia || (ev.recorrencia_ate && ev.recorrencia_ate < dia)) return false;
  const d = new Date(dia + "T12:00:00Z"), d0 = new Date(ev.data + "T12:00:00Z"), w = d.getUTCDay();
  if (rec === "diaria") return true;
  if (rec === "dias_uteis") return w >= 1 && w <= 5;
  if (rec === "semanal") return w === d0.getUTCDay();
  if (rec === "dias_semana") return (ev.rec_dias || []).map(Number).includes(w);
  if (rec === "mensal") return d.getUTCDate() === d0.getUTCDate();
  if (rec === "anual") return d.getUTCDate() === d0.getUTCDate() && d.getUTCMonth() === d0.getUTCMonth();
  return false;
}
const feito = (ev: Record<string, any>, dia: string) => (ev.recorrencia && ev.recorrencia !== "nenhuma") ? (ev.concluidas || []).includes(dia) : !!ev.concluida;
const hm = (t: string) => t ? t.slice(0, 5) : "";

async function varrer(admin: ReturnType<typeof adminClient>, cfg: any) {
  const { data: subs } = await admin.from("push_inscricoes").select("id,dono,endpoint");
  if (!subs || !subs.length) return { enviados: 0 };
  const donos = [...new Set(subs.map((s) => s.dono))];
  const { data: perfis } = await admin.from("perfis").select("id,nome,ativo,preferencias").in("id", donos);
  const ativos = (perfis || []).filter((p) => p.ativo && (p.preferencias?.push ?? true) !== false);
  const nomes: Record<string, string> = {}; (await admin.from("perfis").select("id,nome")).data?.forEach((p) => nomes[p.id] = p.nome);
  const local = new Date(Date.now() - 3 * 3600000); // Recife (UTC-3)
  const hoje = ymdDe(local), agoraMin = local.getUTCHours() * 60 + local.getUTCMinutes();
  const tocadas = new Map<string, { id: string; endpoint: string }>();
  const avisar = async (dono: string, chave: string, av: Aviso) => {
    if (!(await primeiraVez(admin, chave, dono))) return;
    for (const s of await enfileirar(admin, dono, av, subs)) tocadas.set(s.id, s);
  };
  const ids = ativos.map((p) => p.id);
  if (!ids.length) return { enviados: 0 };
  const [{ data: evs }, { data: dems }] = await Promise.all([
    admin.from("eventos").select("id,dono,tipo,titulo,local,data,data_fim,hora_inicio,recorrencia,recorrencia_ate,rec_dias,rec_datas,concluida,concluidas,criado_por,criado_em").in("dono", ids).lte("data", hoje),
    admin.from("demandas").select("id,dono,titulo,status,prazo,checklist,participantes,criado_por,criado_em,atualizado_em").neq("status", "finalizado"),
  ]);
  const recente = Date.now() - 15 * 60000;
  for (const p of ativos) {
    const antes = Number(p.preferencias?.avisosMin ?? 15) || 15;
    // compromissos chegando
    for (const ev of (evs || []).filter((e) => e.dono === p.id)) {
      if (!ev.hora_inicio || !ocorreEm(ev, hoje) || feito(ev, hoje)) continue;
      const [h, m] = ev.hora_inicio.split(":").map(Number), falta = h * 60 + m - agoraMin;
      if (falta <= antes && falta >= -1)
        await avisar(p.id, `e|${ev.id}|${hoje}|${hm(ev.hora_inicio)}`, { titulo: `${ev.tipo === "missao" ? "🎯" : "📅"} ${ev.titulo}`, corpo: falta > 0 ? `Começa em ${falta} min (${hm(ev.hora_inicio)})${ev.local ? " · " + ev.local : ""}` : `Começando agora (${hm(ev.hora_inicio)})${ev.local ? " · " + ev.local : ""}`, tag: `e|${ev.id}|${hoje}`, url: SITE + "#agenda" });
    }
    const minhas = (dems || []).filter((d) => d.dono === p.id || (d.participantes || []).includes(p.id));
    // prazos do dia (a partir das 8h)
    if (agoraMin >= 8 * 60) {
      const pr = minhas.filter((d) => d.prazo === hoje).map((d) => "• " + d.titulo);
      const ps = minhas.flatMap((d) => (d.checklist || []).filter((c: any) => !c.feito && c.prazo === hoje).map((c: any) => "☑ " + c.texto));
      if (pr.length || ps.length) await avisar(p.id, "d|" + hoje, { titulo: `📌 Prazos de hoje (${pr.length + ps.length})`, corpo: [...pr, ...ps].slice(0, 6).join("\n"), tag: "d|" + hoje, url: SITE + "#kanban" });
    }
  }
  // central de atualizações (missões, demandas e passos para você, compartilhamentos, atualizações)
  const { data: nts } = await admin.from("notificacoes").select("id,para,titulo,corpo,ref_tipo").is("push_em", null)
    .gt("criado_em", new Date(Date.now() - 30 * 60000).toISOString()).in("para", ids).limit(200);
  for (const n of nts ?? []) {
    for (const s of await enfileirar(admin, n.para, { titulo: n.titulo, corpo: n.corpo ?? "", tag: "n" + n.id, url: SITE + (n.ref_tipo === "evento" ? "#agenda" : "#kanban") }, subs)) tocadas.set(s.id, s);
  }
  if (nts && nts.length) await admin.from("notificacoes").update({ push_em: new Date().toISOString() }).in("id", nts.map((n) => n.id));
  // chat: mensagens novas ainda não lidas
  const { data: msgs } = await admin.from("chat_mensagens").select("id,conversa,de,para,texto,criado_em").gt("criado_em", new Date(Date.now() - 3 * 60000).toISOString()).limit(100);
  if (msgs && msgs.length) {
    const { data: lidos } = await admin.from("chat_lidos").select("dono,conversa,ate").in("dono", ids);
    for (const m of msgs) {
      const alvos = m.para ? [m.para] : ids.filter((x) => x !== m.de);
      for (const a of alvos) {
        if (!ids.includes(a)) continue;
        const l = (lidos ?? []).find((x) => x.dono === a && x.conversa === m.conversa);
        if (l && l.ate >= m.criado_em) continue;
        await avisar(a, "chat|" + m.id, { titulo: `💬 ${nomes[m.de] ?? "Mensagem"}${m.para ? "" : " · Equipe"}`, corpo: String(m.texto).slice(0, 180), tag: "chat|" + m.conversa, url: SITE });
      }
    }
  }
  const res: string[] = [];
  for (const s of tocadas.values()) res.push(await tocar(admin, cfg, s));
  // limpeza
  await admin.from("push_fila").delete().lt("criado_em", new Date(Date.now() - 3 * 86400000).toISOString());
  await admin.from("push_enviados").delete().lt("em", new Date(Date.now() - 40 * 86400000).toISOString());
  return { enviados: res.length, res };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = adminClient();
  const body = await req.json().catch(() => ({}));
  const cfg = await config(admin);

  if (body.acao === "chave") return json({ publica: cfg.publica });

  if (body.acao === "pendentes") {
    const endpoint = String(body.endpoint || "");
    const { data: sub } = endpoint ? await admin.from("push_inscricoes").select("id").eq("endpoint", endpoint).maybeSingle() : { data: null };
    if (!sub) return json({ itens: [] });
    const { data: itens } = await admin.from("push_fila").select("id,titulo,corpo,url,tag").eq("inscricao", sub.id).is("entregue_em", null).order("id").limit(10);
    if (itens && itens.length) await admin.from("push_fila").update({ entregue_em: new Date().toISOString() }).in("id", itens.map((i) => i.id));
    return json({ itens: itens ?? [] });
  }

  if (body.acao === "varrer") {
    if (req.headers.get("x-cron") !== cfg.cron_token) return json({ erro: "proibido" }, 403);
    return json(await varrer(admin, cfg));
  }

  // daqui para baixo: precisa estar logado no sistema
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ erro: "login" }, 401);

  if (body.acao === "teste") {
    const { data: subs } = await admin.from("push_inscricoes").select("id,dono,endpoint").eq("dono", user.id);
    if (!subs || !subs.length) return json({ erro: "sem_aparelho" }, 404);
    const alvo = body.endpoint ? subs.filter((s) => s.endpoint === body.endpoint) : subs;
    await enfileirar(admin, user.id, { titulo: "🔔 Teste de notificação", corpo: "As notificações do Acompanhamento ADM estão funcionando neste aparelho.", tag: "teste" + Date.now() }, alvo.length ? alvo : subs);
    const res = []; for (const s of (alvo.length ? alvo : subs)) res.push(await tocar(admin, cfg, s));
    return json({ aparelhos: res.length, res });
  }
  return json({ erro: "acao" }, 400);
});
