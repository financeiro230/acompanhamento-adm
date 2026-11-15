/* ===================== INICIALIZAÇÃO ===================== */
"use strict";

function renderAll(){
  $("#finCount").textContent = S.demandas.filter(d => d.status === FIN).length;
  $("#search").classList.toggle("hidden", !["kanban","finalizadas"].includes(S.view));
  if (S.view === "agenda") renderAgenda();
  else if (S.view === "kanban") renderKanban();
  else if (S.view === "finalizadas") renderFinalizadas();
  else if (S.view === "equipe") renderEquipe();
  renderBatch();
  if (K.openId && modalOpen()) refreshDemandaModal();
}
function setView(v){
  if (v === "equipe" && !isAdmin()) v = "agenda";
  S.view = v; S.selected.clear();
  $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.view === v));
  $$(".view").forEach(x => x.classList.toggle("hidden", x.id !== "v-" + v));
  if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v);
  renderAll();
}
async function setSpace(id){
  S.space = id; S.selected.clear();
  try { sessionStorage.setItem("cu_space", id); } catch {}
  renderHeader();
  await reloadSpace(true);
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
    const [d, e] = await Promise.all([API.list("demandas", S.space), API.list("eventos", S.space)]);
    S.demandas = d; S.eventos = e;
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
  S.me = me; S.perfis = ps.filter(p => me.papel === "admin" || p.id === me.id);
  S.perfis.sort((a,b) => (a.id===me.id ? -1 : b.id===me.id ? 1 : a.nome.localeCompare(b.nome)));
  let sp = me.id; try { const s = sessionStorage.getItem("cu_space"); if (s && S.perfis.find(p => p.id === s)) sp = s; } catch {}
  S.space = sp;
  $("#login").classList.add("hidden"); $("#boot").classList.add("hidden"); $("#app").classList.remove("hidden");
  renderHeader();
  const h = location.hash.slice(1);
  setView(["agenda","kanban","finalizadas","equipe"].includes(h) ? h : "agenda");
  await reloadSpace(true);
  resetIdle();
}
function showLogin(msg){
  $("#boot").classList.add("hidden"); $("#app").classList.add("hidden"); $("#batch").classList.add("hidden");
  $("#login").classList.remove("hidden"); $("#lgErr").textContent = msg || "";
  $("#lgPass").value = ""; setTimeout(() => ($("#lgUser").value ? $("#lgPass") : $("#lgUser")).focus(), 50);
}
async function logout(){
  closeModal(true); clearTimeout(idleT); idleT = null;
  await API.logout();
  S.me = null; S.demandas = []; S.eventos = []; S.all = null; S.perfis = [];
  try { sessionStorage.removeItem("cu_space"); } catch {}
  showLogin();
}
$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const u = $("#lgUser").value.trim(), p = $("#lgPass").value;
  if (!u || !p){ $("#lgErr").textContent = "Preencha usuário e senha."; return; }
  $("#lgBtn").disabled = true; $("#lgErr").textContent = "";
  try { const uid = await API.login(u, p); await startApp(uid); }
  catch(err){ $("#lgErr").textContent = errMsg(err); }
  finally { $("#lgBtn").disabled = false; }
});

/* ---------- menu do usuário ---------- */
$("#meBtn").addEventListener("click", () => {
  overlay(`<div class="mhead"><div class="mt">${esc(S.me.nome)}</div><button class="x" data-close>×</button></div>
    <div class="mbody" style="display:flex;flex-direction:column;gap:8px">
      <p class="note" style="margin:0 0 6px">Usuário: <b>@${esc(S.me.usuario)}</b> · ${isAdmin()?"Administrador":"Membro"}</p>
      <button class="btn" id="mePw">🔑 Trocar minha senha</button>
      <button class="btn" id="meOut">🚪 Sair</button>
      <p class="note" style="margin:6px 0 0">Por segurança, o sistema sai sozinho após ${CFG.idleMin} minutos sem uso ou quando você fecha a aba.</p>
    </div>`, "small");
  $("#mePw").onclick = () => { closeModal(true); passModal(S.me); };
  $("#meOut").onclick = () => logout();
});
$$(".tab").forEach(t => t.addEventListener("click", () => setView(t.dataset.view)));
$("#spaceSel").addEventListener("change", e => setSpace(e.target.value));
$("#search").addEventListener("input", () => renderAll());
document.addEventListener("keydown", e => { if (e.key === "Escape" && modalOpen()) closeModal(); });
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (S.me && h !== S.view && ["agenda","kanban","finalizadas","equipe"].includes(h)) setView(h); });

/* ---------- inatividade e atualização ---------- */
let idleT = null;
function resetIdle(){ clearTimeout(idleT); if (!S.me) return; idleT = setTimeout(() => { logout().then(() => { $("#lgErr").textContent = "Você saiu por inatividade."; }); }, CFG.idleMin*60000); }
["click","keydown","pointermove","touchstart"].forEach(ev => document.addEventListener(ev, () => { if (idleT) resetIdle(); }, {passive:true}));
setInterval(() => { if (S.me && !modalOpen() && !document.hidden && savingN === 0 && !K.inlineAdd) reloadSpace(false); }, 60000);
window.addEventListener("focus", () => { if (S.me && !modalOpen() && savingN === 0 && !K.inlineAdd) reloadSpace(false); });

/* ---------- boot ---------- */
(async function boot(){
  try {
    API.init();
    const uid = await API.sessionUserId();
    if (uid) await startApp(uid); else showLogin();
  } catch(e){ console.error(e); showLogin("Não foi possível conectar: " + errMsg(e)); }
})();
