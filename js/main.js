/* ===================== INICIALIZAÇÃO ===================== */
"use strict";

function renderAll(){
  $("#finCount").textContent = S.demandas.filter(d => d.status === FIN).length + finMissoes().length;
  $("#search").classList.toggle("hidden", !["finalizadas","parados"].includes(S.view));
  $("#stCount").textContent = staleList(S.demandas, ST.min, ST.extras).length;
  if (S.view === "agenda") renderAgenda();
  else if (S.view === "kanban") renderKanban();
  else if (S.view === "finalizadas") renderFinalizadas();
  else if (S.view === "parados") renderParados();
  else if (S.view === "equipe") renderEquipe();
  else if (S.view === "notas") renderNotas();
  else if (S.view === "arquivos") renderArquivos();
  else if (S.view === "contatos") renderContatos();
  else if (S.view === "infos") renderInfos();
  renderBatch();
  if (K.openId && modalOpen()) refreshDemandaModal();
}
function setView(v){
  if (v === "equipe" && !isAdmin()) v = "agenda";
  if (typeof podeModulo === "function" && S.me && !podeModulo(v)){ const f = MODS.find(([k]) => podeModulo(k)); v = f ? f[0] : "agenda"; }
  S.view = v; S.selected.clear();
  $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.view === v));
  $$(".view").forEach(x => x.classList.toggle("hidden", x.id !== "v-" + v));
  if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
  renderAll();
}
function pedirSenhaEspaco(p){
  return new Promise(res => {
    let ok = false;
    overlay(`<div class="mhead"><div class="mt">🔒 Espaço de ${esc(p.nome)}</div><button class="x" data-close>×</button></div>
      <form class="mbody" id="unF"><p style="margin-top:0">${esc(p.nome)} é administrador(a). Para abrir a agenda e o kanban dessa pessoa, digite a <b>senha dela</b>.</p>
        <input class="fld" type="password" id="unP" placeholder="Senha de ${esc(p.nome)}" autocomplete="off">
        <div class="err" id="unE" style="margin-top:8px"></div>
        <p class="note">O acesso fica liberado por 2 horas (ou até você sair).</p>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" id="unOk">Abrir espaço</button></div></form>`, "small", { onClose: () => res(ok) });
    setTimeout(() => $("#unP").focus(), 30);
    $("#unF").onsubmit = async e => {
      e.preventDefault(); const b = $("#unOk"); b.disabled = true; $("#unE").textContent = "";
      try { ok = await API.rpc("liberar_espaco", { p_alvo: p.id, p_senha: $("#unP").value }); } catch(ex){ $("#unE").textContent = errMsg(ex); }
      if (ok){ closeModal(true); return; }
      if (!$("#unE").textContent) $("#unE").textContent = "Senha incorreta.";
      b.disabled = false; $("#unP").select();
    };
  });
}
async function setSpace(id){
  const alvo = S.perfis.find(x => x.id === id);
  if (alvo && id !== S.me.id && alvo.papel === "admin"){
    let ok = false; try { ok = await API.rpc("espaco_liberado", { p_alvo: id }); } catch {}
    if (!ok && !(await pedirSenhaEspaco(alvo))){ renderHeader(); return false; }
  }
  S.space = id; S.selected.clear();
  try { sessionStorage.setItem("cu_space", id); } catch {}
  renderHeader();
  await reloadSpace(true);
  return true;
}
function renderHeader(){
  document.body.classList.toggle("is-admin", isAdmin());
  const me = $("#meBtn"); me.textContent = initials(S.me.nome); me.style.background = S.me.cor;
  const sel = $("#spaceSel");
  if (isAdmin()){
    sel.innerHTML = S.perfis.filter(p => p.ativo || p.id === S.space).map(p => `<option value="${p.id}" ${p.id===S.space?"selected":""}>${p.id===S.me.id ? "👤 Meu espaço" : "👁 " + esc(p.nome)}</option>`).join("");
  }
  const b = $("#spaceBanner");
  if (!isOwnSpace()){ b.innerHTML = `<span>👁 Você está vendo o espaço de <b>${esc(spaceName())}</b>. O que você criar ou alterar aqui fica no espaço dessa pessoa.</span> <button class="btn sm" id="backMine">Voltar para o meu</button>`; b.classList.remove("hidden"); $("#backMine").onclick = () => setSpace(S.me.id); }
  else b.classList.add("hidden");
}
async function reloadPerfis(){
  const ps = await API.list("perfis");
  S.perfis = ps.sort((a,b) => (a.id===S.me?.id ? -1 : b.id===S.me?.id ? 1 : a.nome.localeCompare(b.nome)));
  S.me = S.perfis.find(p => p.id === S.me.id) || S.me;
  renderHeader();
}
let reloading = false;
async function reloadSpace(showSpin){
  if (reloading) return; reloading = true;
  try {
    if (showSpin) $("#saving").textContent = "Carregando…";
    if (S.view === "parados" && ST.scope === "team") S.all = null;
    let [d, e, cols, atr] = await Promise.all([API.list("demandas", S.space), API.list("eventos", S.space), API.getConfig("colunas").catch(() => null),
      canAssign() ? API.listBy("eventos", "criado_por", S.me.id).catch(() => []) : Promise.resolve([])]);
    { try { const sh = await API.listShared(S.space); const ids = new Set(d.map(x => x.id)); d = d.concat(sh.filter(x => !ids.has(x.id))); } catch {} }
    S.demandas = d; S.eventos = e; S.globalCols = cols; applySpaceCols();
    S.atribuidas = atr.filter(x => x.dono !== S.me.id);
    if (showSpin) $("#saving").textContent = "";
    if (!modalOpen() || K.openId) renderAll();
  } catch(err){
    console.error(err); $("#saving").textContent = "";
    if (/JWT|session|refresh/i.test(errMsg(err))) { toast("Sua sessão expirou. Entre novamente.", true); logout(); }
    else toast("Erro ao carregar: " + errMsg(err), true);
  } finally { reloading = false; }
}

/* ---------- login ---------- */
async function startApp(uid){
  const ps = await API.list("perfis");
  const me = ps.find(p => p.id === uid);
  if (!me){ await API.logout(); showLogin("Seu usuário não tem perfil cadastrado. Fale com o administrador."); return; }
  if (!me.ativo){ await API.logout(); showLogin("Este usuário está desativado."); return; }
  S.me = me; S.perfis = ps.filter(p => me.papel === "admin" || p.id === me.id || (Array.isArray(me.ve) && me.ve.includes(p.id) && p.papel !== "admin"));
  S.notas = []; N.loaded = false; N.q = ""; N.lab = ""; N.arq = false; INF.pasta = null; A.filt.concl = undefined;
  applyTheme(prefs()); gRestore();
  if (me.papel === "admin" || me.pode_atribuir){ try { S.equipe = await API.rpc("equipe_basica"); } catch { S.equipe = []; } }
  loadEquipeGoogle();
  await loadNomes(); loadPastasComp(); CT.loaded = false; INF.loaded = false;
  S.perfis.sort((a,b) => (a.id===me.id ? -1 : b.id===me.id ? 1 : a.nome.localeCompare(b.nome)));
  const [hv, hs] = location.hash.slice(1).split("/");
  let sp = me.id; try { const s = hs || sessionStorage.getItem("cu_space"); const ps = S.perfis.find(p => p.id === s);
    if (ps && (ps.papel !== "admin" || ps.id === me.id || await API.rpc("espaco_liberado", { p_alvo: s }).catch(() => false))) sp = s; } catch {}
  S.space = sp;
  $("#login").classList.add("hidden"); $("#boot").classList.add("hidden"); $("#app").classList.remove("hidden");
  renderHeader(); aplicarModulos(); avIniciar(); gpIniciar(); iniciar14();
  try { sessionStorage.setItem("cu_space", sp); } catch {}
  setView(["agenda","kanban","notas","arquivos","contatos","infos","parados","finalizadas","equipe"].includes(hv) ? hv : "agenda");
  await reloadSpace(true);
  resetIdle();
}
function buildLoginKb(){
  const box = $("#loginKb"); if (!box || box.innerHTML) return;
  const card = n => { const r = (n*7)%5; return `<div class="kc ${r===0?"hl":""}"><div class="l"></div><div class="l s"></div><div class="t">${r===1?'<b class="g"></b>':""}${r===2?'<b class="o"></b>':""}<b></b></div></div>`; };
  let h = ""; for (let c = 0; c < 5; c++){ let cards = ""; for (let i = 0; i < 7; i++) cards += card(c*7+i); h += `<div class="kcol">${cards}${cards}</div>`; }
  box.innerHTML = h;
}
function showLogin(msg){
  buildLoginKb();
  let saved = ""; try { saved = localStorage.getItem("cu_user") || ""; } catch {}
  if (saved && !$("#lgUser").value) $("#lgUser").value = saved;
  const hr = new Date().getHours();
  $("#lgHello").textContent = (hr < 5 ? "Boa madrugada" : hr < 12 ? "Bom dia" : hr < 18 ? "Boa tarde" : "Boa noite") + " 👋";
  $("#boot").classList.add("hidden"); $("#app").classList.add("hidden"); $("#batch").classList.add("hidden");
  $("#login").classList.remove("hidden"); $("#lgErr").textContent = msg || "";
  $("#lgPass").value = ""; setTimeout(() => ($("#lgUser").value ? $("#lgPass") : $("#lgUser")).focus(), 50);
}
async function logout(){
  closeModal(true); clearTimeout(idleT); idleT = null;
  try { if (S.me && S.me.papel === "admin") await API.rpc("travar_espacos", {}); } catch {}
  S.me = null; await API.logout();
  sairLocal();
}
function sairLocal(msg){
  try { if (RT.parar){ RT.parar(); RT.parar = null; } chatToggle(false); NT.lista = []; CH.recentes = []; notifBadge(); chatBadge(); } catch {}
  closeModal(true); clearTimeout(idleT); idleT = null; clearTimeout(GP.timer); GP.perm = false; GP.cfg = null; const gb = $("#gpBar"); if (gb) gb.remove();
  gClear(); S.me = null; S.demandas = []; S.eventos = []; S.all = null; S.perfis = [];
  try { sessionStorage.removeItem("cu_space"); } catch {}
  showLogin(msg);
}
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const u = $("#lgUser").value.trim(), p = $("#lgPass").value;
  if (!u || !p){ $("#lgErr").textContent = "Preencha usuário e senha."; return; }
  $("#lgBtn").disabled = true; $("#lgErr").textContent = "";
  try {
    const uid = await API.login(u, p);
    try { if ($("#lgRemember").checked) localStorage.setItem("cu_user", u.toLowerCase()); else localStorage.removeItem("cu_user"); } catch {}
    await startApp(uid);
  }
  catch(err){ $("#lgErr").textContent = errMsg(err); }
  finally { $("#lgBtn").disabled = false; }
});

$("#lgEye").addEventListener("click", () => { const i = $("#lgPass"); i.type = i.type === "password" ? "text" : "password"; i.focus(); });
["keyup","keydown"].forEach(ev => $("#lgPass").addEventListener(ev, e => { if (e.getModifierState) $("#lgCaps").classList.toggle("hidden", !e.getModifierState("CapsLock")); }));

/* ---------- preferências ---------- */
async function savePrefs(p){
  S.me.preferencias = p; applyTheme(p);
  const mine = S.perfis.find(x => x.id === S.me.id); if (mine && mine !== S.me) mine.preferencias = p;
  try { await API.rpc("salvar_preferencias", { p }); } catch(e){ console.error(e); toast("Não foi possível salvar suas preferências: " + errMsg(e), true); }
}
const AP_PAL = ["#2f5bea","#7c5cff","#0ea5a4","#1f9d61","#e0457b","#ea7a1a","#d23b3b","#334155","#4285f4","#f59e0b","#0891b2","#8b5cf6"];
const apLinha = (id, k, l, v) => `<div class="colorline appal"><input type="color" id="${id}" value="${v}"><span class="apl">${l}</span><span class="appals">${AP_PAL.map(c => `<button type="button" class="apsw ${c.toLowerCase() === String(v).toLowerCase() ? "on" : ""}" data-appal="${id}|${k}" data-c="${c}" style="background:${c}" title="${c}"></button>`).join("")}</span></div>`;
const apMarca = (id, v) => $$(`[data-appal^="${id}|"]`).forEach(b => b.classList.toggle("on", b.dataset.c.toLowerCase() === String(v).toLowerCase()));
function openAparencia(){
  const orig = prefs(); const p = { ...orig };
  const ACS = ["#2f5bea","#7c5cff","#0ea5a4","#1f9d61","#e0457b","#ea7a1a","#d23b3b","#334155"];
  const ov = overlay(`<div class="mhead"><div class="mt">🎨 Aparência</div><button class="x" data-close>×</button></div>
    <div class="mbody">
      <label class="f">Tema</label>
      <div class="seg" id="apT">${[["claro","☀️ Claro"],["escuro","🌙 Escuro"],["vidro","🫧 Vidro"]].map(([k,l]) => `<button type="button" data-tm="${k}" class="${p.tema===k?"on":""}">${l}</button>`).join("")}</div>
      <div class="section"><label class="f">Cor de destaque</label>
        <div class="swatches" id="apAc">${ACS.map(c => `<span class="sw ${c===p.cor?"on":""}" data-ac="${c}" style="background:${c}"></span>`).join("")}
          <label class="sw" title="Outra cor" style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);position:relative;overflow:hidden"><input type="color" id="apAcPick" value="${p.cor}" style="opacity:0;position:absolute;inset:0;cursor:pointer"></label></div></div>
      <div class="section"><label class="f">Cores padrão da agenda</label>
        ${[["apEv","corEvento","Eventos"],["apMi","corMissao","Missões"],["apPr","corPrazo","Prazos do kanban"],["apGo","corGoogle","Eventos do Google Agenda"]].map(([id,k,l]) => apLinha(id, k, l, p[k] || (k === "corGoogle" ? "#4285f4" : "#2f5bea"))).join("")}
        <div class="colorline apopt"><label class="chk" style="margin:0"><input type="checkbox" id="apCsOn" ${p.corCompart ? "checked" : ""}> Compromissos compartilhados com outras pessoas em uma cor só</label></div>
        <div id="apCsBox" ${p.corCompart ? "" : "hidden"}>${apLinha("apCs", "corCompart", "Compartilhados", p.corCompart || "#e0457b")}</div>
        <p class="note" style="margin:4px 0 0">Clique numa bolinha para usar uma das cores de destaque, ou no quadrado para escolher outra. Compromissos com "cor padrão" mudam junto; os que têm cor própria continuam com a cor escolhida.</p></div>
      <div class="section"><label class="chk"><input type="checkbox" id="apSide" ${p.sidebar!==false?"checked":""}> Mostrar o menu lateral da agenda</label></div>
      <p class="note" style="margin-top:14px">Suas preferências ficam salvas na sua conta e valem em qualquer computador.</p>
    </div>
    <div class="mfoot"><button class="btn ghost" id="apReset">Restaurar padrão</button><div class="spacer"></div><button class="btn" id="apCancel">Cancelar</button><button class="btn primary" id="apSave">Salvar</button></div>`, "mid", { onClose: () => { if (!saved) applyTheme(orig); } });
  let saved = false;
  const live = () => { applyTheme(p); if (S.view === "agenda") renderAgenda(); };
  ov.addEventListener("click", e => {
    const t = e.target.closest("[data-tm]"); if (t){ p.tema = t.dataset.tm; $$("#apT [data-tm]").forEach(x => x.classList.toggle("on", x === t)); live(); }
    const a = e.target.closest("[data-ac]"); if (a){ p.cor = a.dataset.ac; $$("#apAc .sw").forEach(x => x.classList.toggle("on", x === a)); live(); }
  });
  $("#apAcPick").oninput = e => { p.cor = e.target.value; $$("#apAc .sw").forEach(x => x.classList.toggle("on", x === e.target.parentElement)); live(); };
  [["#apEv","corEvento"],["#apMi","corMissao"],["#apPr","corPrazo"],["#apGo","corGoogle"],["#apCs","corCompart"]].forEach(([sel,k]) => $(sel).oninput = e => { p[k] = e.target.value; apMarca(sel.slice(1), p[k]); live(); });
  ov.addEventListener("click", e => { const b = e.target.closest("[data-appal]"); if (!b) return; const [id, k] = b.dataset.appal.split("|"); p[k] = b.dataset.c; $("#" + id).value = b.dataset.c; apMarca(id, p[k]); live(); });
  $("#apCsOn").onchange = e => { $("#apCsBox").hidden = !e.target.checked; p.corCompart = e.target.checked ? ($("#apCs").value || "#e0457b") : null; live(); };
  $("#apSide").onchange = e => { p.sidebar = e.target.checked; };
  $("#apReset").onclick = () => { Object.assign(p, PREF_DEF); closeModal(true); saved = true; savePrefs({...p}); renderAll(); toast("Aparência restaurada."); };
  $("#apCancel").onclick = () => closeModal(true);
  $("#apSave").onclick = () => { saved = true; closeModal(true); savePrefs({...p}); renderAll(); toast("Aparência salva."); };
}

/* ---------- menu do usuário ---------- */
$("#meBtn").addEventListener("click", () => {
  overlay(`<div class="mhead"><div class="mt">${esc(S.me.nome)}</div><button class="x" data-close>×</button></div>
    <div class="mbody" style="display:flex;flex-direction:column;gap:8px">
      <p class="note" style="margin:0 0 6px">Usuário: <b>@${esc(S.me.usuario)}</b> · ${isAdmin()?"Administrador":"Membro"}</p>
      <button class="btn" id="meAp">🎨 Aparência (tema e cores)</button>
      <button class="btn" id="mePw">🔑 Trocar minha senha</button>
      <button class="btn" id="meAv">🔔 Notificações no celular e no computador${typeof PU !== "undefined" && PU.ativo ? " ✅" : ""}</button>
      <button class="btn" id="meRel">📄 Relatório em PDF</button>
      <button class="btn" id="meBk">💾 Backup / exportar dados</button>
      <button class="btn" id="meGc">🔗 Conexão com o Google${GP.cfg && !GP.perm ? " ⚠️" : GP.perm ? " ✅" : ""}</button>
      <button class="btn" id="meOut">🚪 Sair</button>
      <label class="f" style="margin-top:6px">Sair sozinho depois de quanto tempo sem uso</label>
      <select class="fld" id="meIdle">${[[30,"30 minutos"],[60,"1 hora"],[120,"2 horas"],[240,"4 horas"],[480,"8 horas"],[720,"12 horas"],[0,"Não sair (só quando eu clicar em Sair)"]].map(([v,l]) => `<option value="${v}" ${idleMin() === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      
    </div>`, "small");
  $("#mePw").onclick = () => { closeModal(true); passModal(S.me); };
  $("#meAp").onclick = () => { closeModal(true); openAparencia(); };
  $("#meAv").onclick = () => { closeModal(true); openAvisos(); };
  $("#meBk").onclick = () => { closeModal(true); openBackup(); };
  $("#meRel").onclick = () => { closeModal(true); openRelatorio(); };
  $("#meGc").onclick = () => { closeModal(true); openGoogleConexao(); };
  $("#meIdle").onchange = e => { const p = prefs(); p.idleMin = +e.target.value; savePrefs(p); marcaUso(); toast("Tempo de saída automática atualizado."); };
  $("#meOut").onclick = () => logout();
});
$$(".tab").forEach(t => t.addEventListener("click", () => setView(t.dataset.view)));
$("#spaceSel").addEventListener("change", e => setSpace(e.target.value));
$("#search").addEventListener("input", e => { S.q = e.target.value; renderAll(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && modalOpen()) closeModal(); });
window.addEventListener("hashchange", () => { const h = location.hash.slice(1).split("/")[0]; if (S.me && h !== S.view && ["agenda","kanban","notas","arquivos","contatos","infos","parados","finalizadas","equipe"].includes(h)) setView(h); });

/* ---------- inatividade e atualização ---------- */
let idleT = null;
const idleMin = () => { const v = prefs().idleMin, m = v === 0 ? 0 : (+v || 240); try { localStorage.setItem("cu_idlemin", m); } catch {} return m; };
let usoLocal = Date.now();
function marcaUso(){ usoLocal = Date.now(); try { const v = +localStorage.getItem("cu_act") || 0; if (usoLocal - v > 15000) localStorage.setItem("cu_act", usoLocal); } catch {} }
function resetIdle(){ clearInterval(idleT); if (!S.me) return; marcaUso();
  idleT = setInterval(() => {
    if (!S.me) return;
    try { localStorage.setItem("cu_alive", Date.now()); } catch {}
    const m = idleMin(); if (!m) return;
    let ult = usoLocal; try { ult = Math.max(ult, +localStorage.getItem("cu_act") || 0); } catch {}
    if (Date.now() - ult > m * 60000) logout().then(() => { $("#lgErr").textContent = "Você saiu por inatividade."; });
  }, 15000);
  try { localStorage.setItem("cu_alive", Date.now()); } catch {} }
["click","keydown","pointermove","touchstart","scroll"].forEach(ev => document.addEventListener(ev, () => { if (idleT) marcaUso(); }, {passive:true, capture:true}));
setInterval(() => { if (S.me && !modalOpen() && !document.hidden && savingN === 0 && !K.inlineAdd) reloadSpace(false); }, 60000);
window.addEventListener("focus", () => { if (S.me && !modalOpen() && savingN === 0 && !K.inlineAdd) reloadSpace(false); });

/* ---------- boot ---------- */
(async function boot(){
  try {
    API.init();
    // todas as abas ficaram fechadas por mais de 3 minutos: pede o login de novo
    // ficou sem uso (em todas as abas) por mais tempo que o limite escolhido: pede o login de novo
    try { const v = +localStorage.getItem("cu_act") || 0, lim = +(localStorage.getItem("cu_idlemin") || 240);
      if (v && lim > 0 && Date.now() - v > lim * 60000 && API.logoutLocal) await API.logoutLocal(); } catch {}
    if (API.onSignedOut) API.onSignedOut(() => { if (S.me) sairLocal("Você saiu (em outra aba ou por inatividade)."); });
    const uid = await API.sessionUserId();
    if (uid) await startApp(uid); else showLogin();
  } catch(e){ console.error(e); showLogin("Não foi possível conectar: " + errMsg(e)); }
})();
