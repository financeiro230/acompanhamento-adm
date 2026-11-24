/* ===================== GOOGLE: conexão permanente (Agenda + Drive) ===================== */
"use strict";
// Com a função "google-auth" no Supabase, a autorização do Google fica guardada no servidor
// e o site pega um acesso novo sozinho, sem janela e sem clique. Sem a função, segue o modo antigo.

const GP = { cfg: null, perm: false, timer: null, busy: null, email: null };
const GP_SCOPES = () => [GCFG.scope, DRIVE_SCOPE, "openid", "email"].join(" ");

async function gpStatus(){
  if (!API.fn){ GP.cfg = false; return null; }
  try { const s = await API.fn("google-auth", { acao: "status" }); GP.cfg = !!s.configurado; GP.perm = !!s.conectado; GP.email = s.email; return s; }
  catch { GP.cfg = false; GP.perm = false; return null; }
}
function gpAplicar(r){
  G.token = r.access_token; G.exp = Date.now() + (r.expires_in || 3600) * 1000; G.scopes = r.scope || G.scopes || ""; if (r.email) G.email = r.email;
  gStore(); gpAgendar();
}
function gpAgendar(){ clearTimeout(GP.timer); if (!GP.perm || !S.me) return; GP.timer = setTimeout(gpRenovar, Math.max(30000, (G.exp - Date.now()) - 5 * 60000)); }
function gpRenovar(){
  if (!GP.perm || !S.me) return Promise.resolve(false);
  if (GP.busy) return GP.busy;
  GP.busy = (async () => {
    try { const r = await API.fn("google-auth", { acao: "token" }); gpAplicar(r); return true; }
    catch(e){
      if (e.codigo === "reconectar" || e.codigo === "nao_conectado"){ GP.perm = false; gpAviso(); toast("O Google retirou a autorização desta conta. Conecte de novo em: sua bolinha → 🔗 Conexão com o Google.", true); }
      else { clearTimeout(GP.timer); GP.timer = setTimeout(gpRenovar, 60000); }
      return false;
    } finally { GP.busy = null; }
  })();
  return GP.busy;
}
async function gpConectar(){
  try { await loadGis(); } catch(e){ toast(e.message, true); return false; }
  let resp;
  try {
    resp = await new Promise((ok, bad) => {
      const c = google.accounts.oauth2.initCodeClient({
        client_id: GCFG.clientId, scope: GP_SCOPES(), ux_mode: "popup", prompt: "consent", include_granted_scopes: true,
        login_hint: (gPref() && gPref().email) || S.me.google_email || undefined,
        callback: r => r.error ? bad(new Error(r.error === "access_denied" ? "Conexão com o Google cancelada." : "Google: " + r.error)) : ok(r),
        error_callback: e => bad(new Error(e && e.type === "popup_closed" ? "Janela do Google fechada antes de concluir." : "Não foi possível abrir o login do Google (o navegador pode ter bloqueado a janela).")),
      });
      c.requestCode();
    });
  } catch(e){ toast(e.message, true); return false; }
  const sc = resp.scope || "";
  if (!sc.includes("calendar.events") || !sc.includes("drive.file")) toast("Atenção: na tela do Google marque todas as permissões (Agenda e Drive). Algumas funções podem não funcionar.", true);
  let r;
  try { r = await API.fn("google-auth", { acao: "trocar", code: resp.code }); }
  catch(e){ toast("Não foi possível concluir a conexão: " + e.message, true); return false; }
  if (r.erro === "sem_refresh"){
    gpAplicar(r);
    toast("O Google não liberou o acesso permanente. Abra myaccount.google.com/permissions, remova o acesso do 'Acompanhamento ADM' e conecte de novo.", true);
    return false;
  }
  GP.perm = true; gpAplicar(r);
  const p = prefs(); p.google = { ativo: true, email: G.email }; p.driveOn = true; await savePrefs(p);
  if (G.email && S.me.google_email !== G.email){ try { await API.rpc("salvar_google_email", { p: G.email }); S.me.google_email = G.email; loadEquipeGoogle(); } catch {} }
  gpAviso(); G.from = G.to = null; gEnsure(true); renderAll(); refreshAnxAll();
  toast(`Google conectado de forma permanente${G.email ? " (" + G.email + ")" : ""}. Não precisa conectar de novo.`);
  return true;
}
async function gpIniciar(){
  clearTimeout(GP.timer);
  await gpStatus();
  if (GP.perm){
    const p = prefs(); if (!p.google || !p.google.ativo || !p.driveOn){ p.google = { ativo: true, email: GP.email || (p.google || {}).email }; p.driveOn = true; savePrefs(p); }
    if (!gReady()) await gpRenovar(); else gpAgendar();
    G.from = G.to = null; gEnsure(true); if (S.view === "arquivos") renderArquivos();
  }
  gpAviso();
}
function gpAviso(){
  let b = $("#gpBar");
  const mostrar = S.me && GP.cfg && !GP.perm && (gOn() || driveOnPref()) && !sessionStorage.getItem("cu_gpbar_x");
  if (!mostrar){ if (b) b.remove(); return; }
  if (!b){ b = document.createElement("div"); b.id = "gpBar"; b.className = "gpbar"; document.body.appendChild(b); }
  b.innerHTML = `<span>🔗 Torne a conexão com o Google (Agenda e Drive) <b>permanente</b>: conecte uma última vez e ela não cai mais.</span><button class="btn sm primary" id="gpBarOk">Conectar agora</button><button class="x" id="gpBarX" title="Agora não">×</button>`;
  $("#gpBarOk").onclick = () => gpConectar();
  $("#gpBarX").onclick = () => { try { sessionStorage.setItem("cu_gpbar_x", "1"); } catch {} b.remove(); };
}
function openGoogleConexao(){
  const st = !GP.cfg ? "⚙️ A conexão permanente ainda não foi ativada no servidor (falta configurar a chave do Google no Supabase). Enquanto isso, o site renova a conexão no primeiro clique."
    : GP.perm ? `✅ Conectado de forma permanente${GP.email || G.email ? " com <b>" + esc(GP.email || G.email) + "</b>" : ""}. O site renova o acesso sozinho, sem janelas.`
    : "⚠️ Conexão ainda não é permanente. Clique em conectar e autorize Agenda e Drive uma última vez.";
  overlay(`<div class="mhead"><div class="mt">🔗 Conexão com o Google</div><button class="x" data-close>×</button></div>
    <div class="mbody"><p style="margin-top:0">${st}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:12px">
        ${GP.perm ? `<button class="btn" id="gcDes">Desconectar o Google</button>` : ""}
        ${GP.cfg ? `<button class="btn primary" id="gcCon">${GP.perm ? "Trocar de conta / reconectar" : "Conectar de forma permanente"}</button>` : ""}
        <button class="btn" data-close>Fechar</button></div></div>`, "small");
  const c = $("#gcCon"); if (c) c.onclick = async () => { closeModal(true); await gpConectar(); };
  const d = $("#gcDes"); if (d) d.onclick = () => confirmBox("Desconectar o Google?", "A agenda deixa de sincronizar e os anexos do Drive não abrem até conectar de novo.", "Desconectar", async () => { closeModal(true); await gDisconnect(); });
}

/* ---------- liga a conexão permanente nas funções que já existiam ---------- */
(function(){
  const oldConnect = window.gConnect;
  window.gConnect = async function(){ if (GP.cfg === null) await gpStatus(); return GP.cfg ? gpConectar() : oldConnect(); };
  const oldDrive = window.driveConnect;
  window.driveConnect = async function(){
    if (GP.cfg === null) await gpStatus();
    if (GP.cfg){ if (GP.perm && (await gpRenovar()) && driveReady()) return; if (!(await gpConectar())) throw new Error("Conexão com o Google não concluída."); return; }
    return oldDrive();
  };
  const oldRenew = window.gRenew;
  window.gRenew = function(){ return GP.perm ? gpRenovar() : GP.cfg ? Promise.resolve(false) : oldRenew(); };
  const oldDisc = window.gDisconnect;
  window.gDisconnect = async function(){ if (GP.perm){ try { await API.fn("google-auth", { acao: "desligar" }); } catch {} GP.perm = false; clearTimeout(GP.timer); } const p = prefs(); p.driveOn = false; await savePrefs(p); return oldDisc(); };
  const oldG = window.gFetch;
  window.gFetch = async function(path, opts){
    if (GP.perm && !gReady()) await gpRenovar();
    try { return await oldG(path, opts); }
    catch(e){ if (GP.perm && /expirou/i.test(e.message) && (await gpRenovar())) return oldG(path, opts); throw e; }
  };
  const oldD = window.dFetch;
  window.dFetch = async function(url, opts){
    if (GP.perm && !driveReady()) await gpRenovar();
    try { return await oldD(url, opts); }
    catch(e){ if (GP.perm && /expirou/i.test(e.message) && (await gpRenovar())) return oldD(url, opts); throw e; }
  };
  const oldArq = window.renderArquivos;
  window.renderArquivos = function(){ if (GP.perm && !driveReady() && !GP.busy) gpRenovar().then(ok => { if (ok && S.view === "arquivos") oldArq(); }); return oldArq(); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden && GP.perm && S.me && (G.exp - Date.now()) < 10 * 60000) gpRenovar(); });
})();
