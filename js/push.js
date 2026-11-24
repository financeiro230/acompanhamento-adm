/* ===================== NOTIFICAÇÕES PUSH (celular e computador) ===================== */
"use strict";
const PU = { ativo: false, sub: null, reg: null };
const pushSuportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const deB64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const b64uDe = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function pushReg(){ if (!PU.reg) PU.reg = await navigator.serviceWorker.register("sw.js"); await navigator.serviceWorker.ready; return PU.reg; }
async function pushEstado(){
  PU.ativo = false; PU.sub = null;
  if (!pushSuportado() || Notification.permission !== "granted" || !S.me) return false;
  try { const reg = await pushReg(); PU.sub = await reg.pushManager.getSubscription(); }
  catch { return false; }
  if (!PU.sub) return false;
  // confere se este aparelho está registrado para quem está logado (re-registra se trocou de pessoa)
  try { const minhas = await API.list("push_inscricoes", S.me.id);
    if (!minhas.some(x => x.endpoint === PU.sub.endpoint)) await pushSalvar(PU.sub); } catch {}
  PU.ativo = true; return true;
}
function aparelhoNome(){
  const ua = navigator.userAgent;
  const so = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Outro";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return `${nav} · ${so}`;
}
async function pushSalvar(sub){
  const j = sub.toJSON();
  await API.rpc("push_registrar", { p_endpoint: sub.endpoint, p_p256dh: j.keys && j.keys.p256dh, p_auth: j.keys && j.keys.auth, p_aparelho: aparelhoNome() });
}
async function pushAtivar(){
  if (!pushSuportado()) throw new Error("Este navegador não aceita notificações push.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permissão de notificações não concedida. Clique em Permitir quando o navegador perguntar.");
  const reg = await pushReg();
  const { publica } = await API.fn("push", { acao: "chave" });
  let sub = await reg.pushManager.getSubscription();
  if (sub){ const k = sub.options && sub.options.applicationServerKey; if (k && b64uDe(k) !== publica){ await sub.unsubscribe(); sub = null; } }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64u(publica) });
  await pushSalvar(sub);
  PU.sub = sub; PU.ativo = true;
  const p = prefs(); p.avisos = true; p.push = true; await savePrefs(p);
  clearInterval(AV.timer);
}
async function pushDesativar(){
  try { const reg = await pushReg(); const sub = await reg.pushManager.getSubscription();
    if (sub){ try { const m = (await API.list("push_inscricoes", S.me.id)).find(x => x.endpoint === sub.endpoint); if (m) await API.del("push_inscricoes", m.id); } catch {} await sub.unsubscribe(); } } catch {}
  PU.ativo = false; PU.sub = null;
}
async function pushTeste(){
  const r = await API.fn("push", { acao: "teste", endpoint: PU.sub && PU.sub.endpoint });
  const ok = (r.res || []).filter(x => x === "ok").length;
  return ok ? "Teste enviado. A notificação deve aparecer em alguns segundos." : "O envio não foi aceito: " + (r.res || []).join(", ");
}
