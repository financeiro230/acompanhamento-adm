/* ===================== ATUALIZAÇÃO 8 ===================== */
"use strict";

/* ---------- equipe (nomes) ---------- */
const nomeDe = id => { const p = (S.nomes || []).find(x => x.id === id) || pessoa(id); return p ? p.nome : "alguém"; };
async function loadNomes(){ try { S.nomes = await API.rpc("equipe_nomes", {}); } catch { S.nomes = S.perfis.map(p => ({ id: p.id, nome: p.nome, cor: p.cor })); } }
function pessoasChips(attr, sel, excluir){
  const lista = (S.nomes || []).filter(p => !(excluir || []).includes(p.id));
  return `<div class="who">${lista.map(p => `<label><input type="checkbox" ${attr}="${p.id}" ${sel.includes(p.id) ? "checked" : ""}><span class="mini-av" style="background:${p.cor}">${esc(initials(p.nome))}</span>${esc(p.nome)}${p.id === S.me.id ? " (eu)" : ""}</label>`).join("") || `<span class="note">Ninguém para escolher.</span>`}</div>`;
}

/* ===================== MÓDULOS (abas) por pessoa ===================== */
const MODS = [["agenda","📅 Agenda"],["kanban","📋 Kanban"],["notas","📝 Notas"],["arquivos","📁 Arquivos"],["contatos","📇 Contatos"],["parados","⏳ Parados"],["finalizadas","✅ Finalizadas"]];
const podeModulo = m => m === "equipe" ? isAdmin() : (!Array.isArray(S.me.modulos) || S.me.modulos.includes(m));
function aplicarModulos(){
  $$(".tab[data-view]").forEach(t => { const v = t.dataset.view; if (v !== "equipe") t.classList.toggle("hidden", !podeModulo(v)); });
  if (!podeModulo(S.view)){ const f = MODS.find(([k]) => podeModulo(k)); if (f) setView(f[0]); }
}
function modulosHtml(p){
  const m = p && Array.isArray(p.modulos) ? p.modulos : null;
  return `<div class="section"><label class="f">🧩 Abas que ${p ? esc(p.nome) : "a pessoa"} pode usar</label>
    <div class="who modbox">${MODS.map(([k, l]) => `<label><input type="checkbox" data-mod="${k}" ${!m || m.includes(k) ? "checked" : ""}>${l}</label>`).join("")}</div>
    <p class="note" style="margin:4px 0 0">Desmarque o que essa pessoa não precisa ver no menu.</p></div>`;
}
async function salvarModulos(id, p){
  if (!$(".modbox")) return;
  const sel = $$("[data-mod]").filter(c => c.checked).map(c => c.dataset.mod);
  if (!sel.length) throw new Error("Deixe pelo menos uma aba marcada.");
  const val = sel.length === MODS.length ? null : sel;
  const antes = p && Array.isArray(p.modulos) ? [...p.modulos].sort().join() : null;
  if ((val ? [...val].sort().join() : null) === antes) return;
  await API.rpc("admin_definir_modulos", { p_id: id, p_mods: val });
}

/* ===================== AGENDA: pessoas do compromisso (trocar, tirar, incluir) ===================== */
function evPessoasHtml(ev){
  if (!ev || ev.pessoal || !(isAdmin() || canAssign())) return "";
  return `<div class="section" id="evPessoasBox"><label class="f">👥 Pessoas deste compromisso</label>
    <div id="evPessoas"><span class="note">Carregando…</span></div>
    <p class="note" style="margin:4px 0 0">Marque ou desmarque para incluir, tirar ou passar para outra pessoa, sem precisar excluir. Quem sair deixa de ver o compromisso.</p></div>`;
}
async function evPessoasLoad(ev){
  const box = $("#evPessoas"); if (!box) return;
  let atuais = [ev.dono];
  if (ev.grupo){ try { const l = await API.rpc("grupo_participantes", { g: ev.grupo }); if (l && l.length) atuais = l.map(x => x.dono); } catch {} }
  box.dataset.orig = JSON.stringify([...atuais].sort());
  const lista = isAdmin() ? S.perfis.filter(p => p.ativo) : (S.equipe || []);
  box.innerHTML = `<div class="who">${lista.map(p => `<label><input type="checkbox" data-evp="${p.id}" ${atuais.includes(p.id) ? "checked" : ""}><span class="mini-av" style="background:${p.cor}">${esc(initials(p.nome))}</span>${esc(p.nome)}${p.id === S.me.id ? " (eu)" : ""}</label>`).join("")}</div>`;
}
function evPessoasPick(){
  const box = $("#evPessoas"); if (!box || !box.dataset.orig) return null;
  const sel = $$("[data-evp]").filter(c => c.checked).map(c => c.dataset.evp).sort();
  return JSON.stringify(sel) === box.dataset.orig ? null : sel;
}
async function evPessoasAplicar(ev, sel){
  const n = await API.rpc("evento_pessoas", { p_id: ev.id, p_donos: sel });
  toast(n > 1 ? `Compromisso agora com ${n} pessoas.` : `Compromisso agora com ${nomeDe(sel[0])}.`);
  await reloadSpace(false);
}

/* ===================== AGENDA: editar / excluir atualizações ===================== */
async function editNoteE(id, em, texto){
  const cur = getE(id); if (!cur) return;
  if (cur.grupo){
    try { await API.rpc("grupo_nota_editar", { g: cur.grupo, p_em: em, p_texto: texto }); } catch(e){ toast("Não foi possível alterar: " + errMsg(e), true); return; }
    cur.historico = (cur.historico || []).flatMap(h => h.tipo === "nota" && h.em === em ? (texto == null ? [] : [{ ...h, texto, editadoEm: Date.now() }]) : [h]);
  } else {
    const it = clone(cur);
    const n = (it.historico || []).find(h => h.tipo === "nota" && h.em === em); if (!n) return;
    if (texto == null){ it.historico = it.historico.filter(h => h !== n); it.historico.push(actorTag({ tipo: "edicao", em: Date.now(), texto: `Atualização de ${fmt(em)} excluída` })); }
    else { n.texto = texto; n.editadoEm = Date.now(); }
    it.atualizado_em = Date.now(); Object.assign(cur, it); persist("eventos", it);
  }
  $$(`[data-eupdbox="${id}"]`).forEach(b => { b.outerHTML = evUpdHtml(id); });
  toast(texto == null ? "Atualização excluída." : "Atualização editada.");
}
document.addEventListener("click", e => {
  const ed = e.target.closest && e.target.closest("[data-eupe]");
  if (ed){
    const box = ed.closest("[data-eupdbox]"), id = box.dataset.eupdbox, em = +ed.dataset.eupe;
    const n = ((getE(id) || {}).historico || []).find(h => h.tipo === "nota" && h.em === em); if (!n) return;
    const li = ed.closest("li"); const w = li.querySelector(".tl-what");
    w.innerHTML = `<textarea class="fld" rows="3" data-nodirty>${esc(n.texto)}</textarea><div style="display:flex;gap:6px;margin-top:6px"><button type="button" class="btn sm primary" data-eups="${em}">Salvar</button><button type="button" class="btn sm ghost" data-eupc>Cancelar</button></div>`;
    li.querySelector(".nacts") && li.querySelector(".nacts").remove();
    const ta = w.querySelector("textarea"); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    return;
  }
  const sv = e.target.closest && e.target.closest("[data-eups]");
  if (sv){ const box = sv.closest("[data-eupdbox]"), v = sv.closest(".tl-what").querySelector("textarea").value.trim(); if (!v){ toast("A atualização não pode ficar vazia.", true); return; } editNoteE(box.dataset.eupdbox, +sv.dataset.eups, v); return; }
  if (e.target.closest && e.target.closest("[data-eupc]")){ const box = e.target.closest("[data-eupdbox]"); box.outerHTML = evUpdHtml(box.dataset.eupdbox); return; }
  const dl = e.target.closest && e.target.closest("[data-eupx]");
  if (dl){ const id = dl.closest("[data-eupdbox]").dataset.eupdbox, em = +dl.dataset.eupx;
    confirmBox("Excluir esta atualização?", getE(id) && getE(id).grupo ? "Ela sai para todas as pessoas do compromisso." : "Ela sai do histórico.", "Excluir", () => editNoteE(id, em, null)); }
});

/* ===================== KANBAN: editar / excluir atualização na visualização rápida ===================== */
document.addEventListener("click", e => {
  const ed = e.target.closest && e.target.closest("[data-pkne]");
  if (ed){
    const id = ed.dataset.pkid, em = +ed.dataset.pkne, it = getD(id); const n = it && it.historico.find(h => h.tipo === "nota" && h.em === em); if (!n) return;
    const row = ed.closest(".lastupd");
    row.outerHTML = `<div class="pkedit"><textarea class="fld" rows="3">${esc(n.texto)}</textarea><div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm primary" data-pkns="${em}" data-pkid="${id}">Salvar</button><button class="btn sm ghost" data-pknc="${id}">Cancelar</button></div></div>`;
    return;
  }
  const sv = e.target.closest && e.target.closest("[data-pkns]");
  if (sv){ const id = sv.dataset.pkid, em = +sv.dataset.pkns, v = sv.closest(".pkedit").querySelector("textarea").value.trim();
    if (!v){ toast("A atualização não pode ficar vazia.", true); return; }
    updateD(id, it => { const n = it.historico.find(h => h.tipo === "nota" && h.em === em); if (!n || n.texto === v) return false; n.texto = v; n.editadoEm = Date.now(); });
    toast("Atualização editada."); openDemandaPeek(id); return; }
  const cc = e.target.closest && e.target.closest("[data-pknc]"); if (cc){ openDemandaPeek(cc.dataset.pknc); return; }
  const dl = e.target.closest && e.target.closest("[data-pknx]");
  if (dl){ const id = dl.dataset.pkid, em = +dl.dataset.pknx;
    confirmBox("Excluir esta atualização?", "Ela sai do histórico (fica registrado que foi excluída).", "Excluir", () => {
      updateD(id, it => { const n = it.historico.find(h => h.tipo === "nota" && h.em === em); if (!n) return false;
        it.historico = it.historico.filter(h => h !== n); it.historico.push(actorTag({ tipo: "edicao", em: Date.now(), texto: `Atualização de ${fmt(em)} excluída` })); });
      toast("Atualização excluída."); openDemandaPeek(id); }); }
});

/* ===================== KANBAN: demandas compartilhadas ===================== */
const demandaDeOutro = it => it.dono !== S.space;
function compartBadge(it){
  if (demandaDeOutro(it)) return `<span class="tag share" title="Compartilhada com você">👥 de ${esc(nomeDe(it.dono))}</span>`;
  const n = (it.participantes || []).length; return n ? `<span class="tag share" title="Compartilhada com ${n} pessoa(s)">👥 ${n}</span>` : "";
}
function compartDHtml(it){
  if (demandaDeOutro(it)) return `<div class="section"><h3>👥 Compartilhada</h3><p class="note" style="margin:0">Demanda de <b>${esc(nomeDe(it.dono))}</b>, compartilhada com você${(it.participantes||[]).length > 1 ? ` e mais ${(it.participantes.length - 1)} pessoa(s)` : ""}. Você pode atualizar, mover e anexar; só a dona pode excluir.</p></div>`;
  return `<div class="section"><h3>👥 Compartilhar com</h3>${pessoasChips("data-dshare", it.participantes || [], [it.dono])}
    <p class="note" style="margin:4px 0 0">Quem você marcar vê esta demanda no próprio kanban e pode atualizar, mover e anexar.</p></div>`;
}
document.addEventListener("change", e => {
  const c = e.target.closest && e.target.closest("[data-dshare]"); if (!c || !K.openId) return;
  const id = K.openId, sel = $$("[data-dshare]").filter(x => x.checked).map(x => x.dataset.dshare);
  updateD(id, it => { it.participantes = sel; it.historico.push(actorTag({ tipo: "edicao", em: Date.now(), texto: sel.length ? "Compartilhada com: " + sel.map(nomeDe).join(", ") : "Deixou de ser compartilhada" })); });
  toast(sel.length ? `Compartilhada com ${sel.length} pessoa(s).` : "Não está mais compartilhada.");
});

/* ===================== NOTAS: ver sem editar + marcadores ===================== */
const notaLabels = () => [...new Set((S.notas || []).flatMap(n => n.marcadores || []))].sort((a, z) => a.localeCompare(z, "pt-BR"));
const linkify = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
function openNotaView(id){
  const n = S.notas.find(x => x.id === id); if (!n) return;
  const it = n.itens || [], pend = it.filter(i => !i.feito), done = it.filter(i => i.feito);
  const li = i => `<li class="${i.feito ? "done" : ""}"><label><input type="checkbox" data-nvk="${i.id}" ${i.feito ? "checked" : ""}> <span>${esc(i.texto)}</span></label></li>`;
  const ov = overlay(`<div class="nedit nview" ${n.cor ? `style="--nc:${n.cor}"` : ""}>
    <div class="nedhead"><div class="ntitle" style="padding:4px 0">${esc(n.titulo) || `<span class="note">Sem título</span>`}</div>
      <button type="button" class="x" data-nv="edit" title="Editar">✏️</button><button type="button" class="x" data-close title="Fechar">×</button></div>
    ${n.texto ? `<div class="nvtext">${linkify(n.texto)}</div>` : ""}
    ${it.length ? `<ul class="nitems nvitems">${pend.map(li).join("")}</ul>${done.length ? `<div class="note" style="margin:8px 0 2px">${done.length} marcado(s)</div><ul class="nitems nvitems">${done.map(li).join("")}</ul>` : ""}` : ""}
    ${(n.marcadores || []).length ? `<div class="nlabels" style="margin-top:12px">${n.marcadores.map(l => `<span class="nlabel">🏷 ${esc(l)}</span>`).join("")}</div>` : ""}
    <div class="nfoot" style="margin-top:14px"><span class="note">Editada ${fmt(n.atualizado_em)}</span><span class="nacts">
      <button type="button" data-nv="pin" title="${n.fixada ? "Desafixar" : "Fixar"}">📌</button>
      <button type="button" data-nv="arq" title="${n.arquivada ? "Desarquivar" : "Arquivar"}">${n.arquivada ? "📤" : "🗄"}</button>
      <button type="button" data-nv="del" title="Excluir">🗑</button>
      <button type="button" class="btn sm primary" data-nv="edit">✏️ Editar</button></span></div></div>`, "mid nmodal");
  ov.addEventListener("click", e => {
    const k = e.target.closest("[data-nvk]");
    if (k){ const c = clone(n); const i = c.itens.find(x => x.id === k.dataset.nvk); i.feito = k.checked; saveNota(c); closeModal(true); openNotaView(id); return; }
    const b = e.target.closest("[data-nv]"); if (!b) return;
    const a = b.dataset.nv, c = clone(n);
    if (a === "edit"){ closeModal(true); openNota(id); }
    if (a === "pin"){ c.fixada = !c.fixada; if (c.fixada) c.arquivada = false; saveNota(c); closeModal(true); openNotaView(id); }
    if (a === "arq"){ c.arquivada = !c.arquivada; if (c.arquivada) c.fixada = false; saveNota(c); closeModal(true); toast(c.arquivada ? "Nota arquivada." : "Nota de volta às notas."); }
    if (a === "del") delNota(id);
  });
}
function labelsEditorHtml(sel){
  const todas = notaLabels();
  return `<div class="nlabedit"><div class="nlabels" id="nLabs">${sel.map(l => `<span class="nlabel">🏷 ${esc(l)}<button type="button" data-nlrm="${esc(l)}" title="Tirar">×</button></span>`).join("")}</div>
    <div class="nlabadd"><input class="fld" id="nLabIn" list="nLabList" placeholder="🏷 Adicionar marcador (Enter)" maxlength="40"><datalist id="nLabList">${todas.map(l => `<option value="${esc(l)}">`).join("")}</datalist></div></div>`;
}

/* ===================== GOOGLE: conexão mais estável ===================== */
// guarda a conexão entre abas e renova sozinha no próximo clique quando estiver perto de vencer (o Google dá 1 hora por vez)
(function(){
  const k = () => gKey();
  window.gRestore = function(){
    try { const raw = localStorage.getItem(k()) || sessionStorage.getItem(k()); const t = JSON.parse(raw || "null");
      if (t && t.exp > Date.now() + 60000){ G.token = t.token; G.exp = t.exp; G.email = t.email; G.scopes = t.scopes || ""; } } catch {}
  };
  window.gStore = function(){ try { localStorage.setItem(k(), JSON.stringify({ token: G.token, exp: G.exp, email: G.email, scopes: G.scopes || "" })); } catch {} };
  const oldClear = window.gClear;
  window.gClear = function(){ oldClear(); try { localStorage.removeItem(k()); } catch {} };
})();
const RENEW = { busy: false, last: 0 };
const driveOnPref = () => !!prefs().driveOn;
function gRenew(){
  if (RENEW.busy || Date.now() - RENEW.last < 90000) return Promise.resolve(false);
  if (!(gOn() || driveOnPref())) return Promise.resolve(false);
  RENEW.busy = true; RENEW.last = Date.now();
  return loadGis().then(() => new Promise(ok => {
    const scope = [gOn() ? GCFG.scope : "", driveOnPref() ? DRIVE_SCOPE : ""].filter(Boolean).join(" ");
    const c = google.accounts.oauth2.initTokenClient({ client_id: GCFG.clientId, scope, include_granted_scopes: true,
      hint: (gPref() && gPref().email) || G.email || S.me.google_email || undefined,
      callback: resp => { RENEW.busy = false; if (resp.error){ ok(false); return; }
        G.token = resp.access_token; G.exp = Date.now() + (resp.expires_in || 3600) * 1000; G.scopes = resp.scope || scope; gStore();
        if (S.view === "arquivos") renderArquivos(); refreshAnxAll(); ok(true); },
      error_callback: () => { RENEW.busy = false; ok(false); } });
    c.requestAccessToken({ prompt: "" });
  })).catch(() => { RENEW.busy = false; return false; });
}
function refreshAnxAll(){ $$("[data-anx]").forEach(b => { const [k, id] = b.dataset.anx.split("|"); b.outerHTML = anexosHtml(k, id); }); }
document.addEventListener("click", () => {
  if (!S.me || !(gOn() || driveOnPref())) return;
  const falta = (G.exp || 0) - Date.now();
  if (!G.token || falta < 8 * 60000) gRenew();
}, true);
// lembra que a pessoa usa o Drive
const _driveConnect = driveConnect;
window.driveConnect = async function(){ await _driveConnect(); const p = prefs(); if (!p.driveOn){ p.driveOn = true; savePrefs(p); } };

/* ===================== ARQUIVOS: pastas compartilhadas com a equipe ===================== */
async function loadPastasComp(){ try { S.pastasComp = await API.list("pastas_compartilhadas"); } catch { S.pastasComp = []; } }
async function fxShareFolder(f){
  let equipe = []; try { equipe = await API.rpc("equipe_google", {}); } catch {}
  const reg = (S.pastasComp || []).find(x => x.id === f.id);
  const atuais = reg ? reg.membros : [];
  const semEmail = (S.nomes || []).filter(p => p.id !== S.me.id && !equipe.find(x => x.id === p.id));
  overlay(`<div class="mhead"><div class="mt">👥 Compartilhar a pasta "${esc(f.name)}"</div><button class="x" data-close>×</button></div>
    <form class="mbody" id="shF"><p class="note" style="margin-top:0">Quem você marcar recebe acesso de edição à pasta no Google Drive (e um e-mail do Google) e passa a ver a pasta em "Compartilhadas comigo", na aba Arquivos.</p>
      <div class="who">${equipe.filter(p => p.id !== S.me.id).map(p => `<label><input type="checkbox" data-shp="${p.id}" data-em="${esc(p.google_email)}" ${atuais.includes(p.id) ? "checked" : ""}><span class="mini-av" style="background:${p.cor}">${esc(initials(p.nome))}</span>${esc(p.nome)} <span class="note">${esc(p.google_email)}</span></label>`).join("") || `<span class="note">Ninguém da equipe conectou o Google ainda.</span>`}</div>
      ${semEmail.length ? `<p class="note">Sem e-mail Google cadastrado (não dá para compartilhar ainda): ${semEmail.map(p => esc(p.nome)).join(", ")}. O administrador pode cadastrar o e-mail em Equipe → Editar.</p>` : ""}
      <div class="err" id="shE"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" id="shOk">Salvar</button></div></form>`, "small");
  $("#shF").onsubmit = async ev => {
    ev.preventDefault(); const b = $("#shOk"); b.disabled = true;
    const sel = $$("[data-shp]").filter(c => c.checked).map(c => ({ id: c.dataset.shp, email: c.dataset.em }));
    try {
      const perms = (await dFetch(`https://www.googleapis.com/drive/v3/files/${f.id}/permissions?fields=permissions(id,emailAddress,role)`)).permissions || [];
      for (const s of sel) if (!perms.find(p => (p.emailAddress || "").toLowerCase() === s.email.toLowerCase()))
        await dFetch(`https://www.googleapis.com/drive/v3/files/${f.id}/permissions?sendNotificationEmail=true&emailMessage=${encodeURIComponent("Pasta compartilhada pelo Acompanhamento ADM")}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "writer", type: "user", emailAddress: s.email }) });
      const tirar = equipe.filter(p => atuais.includes(p.id) && !sel.find(s => s.id === p.id));
      for (const t of tirar){ const p = perms.find(x => (x.emailAddress || "").toLowerCase() === (t.google_email || "").toLowerCase() && x.role !== "owner"); if (p) await dFetch(`https://www.googleapis.com/drive/v3/files/${f.id}/permissions/${p.id}`, { method: "DELETE" }); }
      const now = Date.now();
      if (sel.length) await API.save("pastas_compartilhadas", { id: f.id, dono: S.me.id, nome: f.name, link: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`, membros: sel.map(s => s.id), criado_em: reg ? reg.criado_em : now, atualizado_em: now });
      else if (reg) await API.del("pastas_compartilhadas", f.id);
      await loadPastasComp(); closeModal(true); renderArquivos();
      toast(sel.length ? `Pasta compartilhada com ${sel.length} pessoa(s).` : "Pasta não está mais compartilhada.");
    } catch(ex){ $("#shE").textContent = errMsg(ex); b.disabled = false; }
  };
}
function pastasComigoHtml(){
  const l = (S.pastasComp || []).filter(x => x.dono !== S.me.id && (x.membros || []).includes(S.me.id));
  if (!l.length) return "";
  return `<h5 class="nsec" style="margin-top:18px">👥 Compartilhadas comigo</h5><div class="fxlist">${l.map(x => `<a class="fxrow" href="${esc(x.link)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">
    <span class="fxic">📁</span><div class="fxname"><b>${esc(x.nome)}</b><span class="note">De ${esc(nomeDe(x.dono))} · abre no Google Drive</span></div><span class="btn ghost sm">↗</span></a>`).join("")}</div>`;
}

/* ===================== CONTATOS ===================== */
const CT = { q: "", loaded: false };
async function loadContatos(){ try { S.contatos = await API.list("contatos"); CT.loaded = true; } catch(e){ S.contatos = []; CT.err = errMsg(e); CT.loaded = true; } }
const soDig = s => String(s || "").replace(/\D/g, "");
const waLink = n => { let d = soDig(n); if (!d) return ""; if (d.length <= 11) d = "55" + (d.length <= 9 ? "81" + d : d); return "https://wa.me/" + d; };
const podeEditarContato = c => c.dono === S.me.id || isAdmin();
function renderContatos(){
  const v = $("#v-contatos");
  if (!CT.loaded){ v.innerHTML = `<div class="empty" style="padding:40px"><div class="spinner" style="margin:auto"></div></div>`; loadContatos().then(() => S.view === "contatos" && renderContatos()); return; }
  const q = CT.q.trim().toLowerCase();
  const l = (S.contatos || []).filter(c => !q || [c.nome, c.empresa, c.cargo, c.telefone, c.whatsapp, c.email, c.obs].join(" ").toLowerCase().includes(q))
    .sort((a, z) => a.nome.localeCompare(z.nome, "pt-BR"));
  v.innerHTML = `<div class="ctwrap"><div class="kbar"><div class="ksearch" style="flex:1"><span>🔎</span><input id="ctQ" placeholder="Procurar por nome, empresa, telefone…" value="${esc(CT.q)}"></div>
      <button class="btn primary" data-ct="new">＋ Novo contato</button></div>
    ${l.length ? `<div class="ctgrid">${l.map(c => `<div class="ctcard" data-ctid="${c.id}">
      <div class="cttop"><span class="avatar" style="background:${(pessoa(c.dono) || {}).cor || "#8a94a6"}">${esc(initials(c.nome))}</span>
        <div style="min-width:0;flex:1"><b>${esc(c.nome)}</b>${c.empresa || c.cargo ? `<div class="note">${esc([c.cargo, c.empresa].filter(Boolean).join(" · "))}</div>` : ""}</div>
        ${!c.compartilhado ? `<span class="tag" title="Só você vê">🔒</span>` : ""}</div>
      <div class="ctacts">
        ${c.whatsapp ? `<a class="btn sm" href="${waLink(c.whatsapp)}" target="_blank" rel="noopener" title="WhatsApp ${esc(c.whatsapp)}">💬 WhatsApp</a>` : ""}
        ${c.telefone ? `<a class="btn sm" href="tel:${soDig(c.telefone)}" title="${esc(c.telefone)}">📞 ${esc(c.telefone)}</a>` : ""}
        ${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}" title="${esc(c.email)}">✉️ E-mail</a>` : ""}
      </div>
      ${c.obs ? `<div class="note ctobs">${esc(c.obs)}</div>` : ""}
      <div class="note" style="margin-top:6px;font-size:11px">Cadastrado por ${esc(nomeDe(c.dono))}</div></div>`).join("")}</div>`
      : `<div class="nempty">${q ? "Nenhum contato encontrado." : "📇 Nenhum contato ainda.<br><span class=\"note\">Cadastre fornecedores, transportadoras, assistências… Toda a equipe pode consultar.</span>"}</div>`}</div>`;
  const qi = $("#ctQ"); qi.oninput = () => { const p = qi.selectionStart; CT.q = qi.value; renderContatos(); const n = $("#ctQ"); n.focus(); n.setSelectionRange(p, p); };
}
function openContato(id){
  const c = id ? S.contatos.find(x => x.id === id) : null;
  const ro = c && !podeEditarContato(c);
  const d = c ? clone(c) : { id: uuid(), dono: S.me.id, nome: "", empresa: "", cargo: "", telefone: "", whatsapp: "", email: "", obs: "", marcadores: [], compartilhado: true, criado_em: Date.now(), atualizado_em: Date.now() };
  const f = (k, l, ph, t) => `<div><label class="f">${l}</label><input class="fld" data-ctf="${k}" type="${t || "text"}" value="${esc(d[k] || "")}" placeholder="${ph || ""}" ${ro ? "disabled" : ""}></div>`;
  overlay(`<div class="mhead"><div class="mt">${c ? (ro ? "📇 Contato" : "Editar contato") : "＋ Novo contato"}</div>${c && !ro ? `<button class="x" data-ctx="del" title="Excluir">🗑</button>` : ""}<button class="x" data-close>×</button></div>
    <form class="mbody" id="ctF">
      ${f("nome", "Nome", "Nome da pessoa ou empresa")}
      <div class="grid2" style="margin-top:10px">${f("empresa", "Empresa")}${f("cargo", "Cargo / setor")}</div>
      <div class="grid2" style="margin-top:10px">${f("whatsapp", "WhatsApp", "(81) 9 9999-9999", "tel")}${f("telefone", "Telefone", "", "tel")}</div>
      <div style="margin-top:10px">${f("email", "E-mail", "", "email")}</div>
      <label class="f" style="margin-top:10px">Observações</label><textarea class="fld" data-ctf="obs" rows="3" ${ro ? "disabled" : ""}>${esc(d.obs || "")}</textarea>
      ${ro ? `<p class="note">Cadastrado por ${esc(nomeDe(d.dono))}. Só essa pessoa (ou um administrador) pode alterar.</p>` :
        `<label class="chk" style="margin-top:10px"><input type="checkbox" id="ctComp" ${d.compartilhado ? "checked" : ""}> Toda a equipe pode ver este contato</label>`}
      <div class="err" id="ctE"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button type="button" class="btn" data-close>${ro ? "Fechar" : "Cancelar"}</button>${ro ? "" : `<button class="btn primary">Salvar</button>`}</div></form>`, "mid");
  setTimeout(() => { const i = $('[data-ctf="nome"]'); if (i && !ro) i.focus(); }, 30);
  const del = $('[data-ctx="del"]');
  if (del) del.onclick = () => confirmBox(`Excluir ${d.nome}?`, "O contato sai da lista de todos.", "Excluir", async () => {
    closeModal(true); S.contatos = S.contatos.filter(x => x.id !== d.id); renderContatos(); await remove("contatos", d.id); toast("Contato excluído."); });
  $("#ctF").onsubmit = async e => {
    e.preventDefault(); if (ro) return;
    $$("[data-ctf]").forEach(i => { d[i.dataset.ctf] = i.value.trim(); });
    if (!d.nome){ $("#ctE").textContent = "Coloque o nome."; return; }
    d.compartilhado = $("#ctComp").checked; d.atualizado_em = Date.now();
    const i = S.contatos.findIndex(x => x.id === d.id); if (i >= 0) S.contatos[i] = d; else S.contatos.push(d);
    closeModal(true); renderContatos(); await persist("contatos", d); toast("Contato salvo.");
  };
}
document.addEventListener("click", e => {
  if (S.view !== "contatos" || e.target.closest("#modalRoot")) return;
  if (e.target.closest('[data-ct="new"]')){ openContato(null); return; }
  if (e.target.closest("a")) return;
  const c = e.target.closest("[data-ctid]"); if (c) openContato(c.dataset.ctid);
});

/* ===================== AVISOS (notificações) ===================== */
const AV = { timer: null, sw: null, mine: { ev: [], dem: [], at: 0 } };
const avOn = () => !!prefs().avisos && "Notification" in window && Notification.permission === "granted";
const avMin = () => +(prefs().avisosMin || 15);
async function avRegistrar(){ if ("serviceWorker" in navigator && !AV.sw){ try { AV.sw = await navigator.serviceWorker.register("sw.js"); } catch {} } }
async function avNotificar(titulo, corpo, tag){
  const opts = { body: corpo, tag, icon: "icons/icon-192.png", badge: "icons/favicon-64.png", renotify: false, data: { url: location.href.split("#")[0] } };
  try { if (AV.sw){ const r = await navigator.serviceWorker.ready; await r.showNotification(titulo, opts); return; } } catch {}
  try { new Notification(titulo, opts); } catch {}
}
const avJa = k => { try { const s = JSON.parse(localStorage.getItem("cu_av") || "{}"); return !!s[k]; } catch { return false; } };
const avMarca = k => { try { const s = JSON.parse(localStorage.getItem("cu_av") || "{}"); s[k] = Date.now(); for (const x in s) if (Date.now() - s[x] > 3 * 864e5) delete s[x]; localStorage.setItem("cu_av", JSON.stringify(s)); } catch {} };
async function avCarregar(){
  if (Date.now() - AV.mine.at < 5 * 60000) return;
  try { const [ev, dem] = await Promise.all([API.list("eventos", S.me.id), API.list("demandas", S.me.id)]); AV.mine = { ev, dem, at: Date.now() }; } catch {}
}
async function avChecar(){
  if (!S.me || !avOn()) return;
  await avCarregar();
  const hoje = todayYmd(), agora = new Date(), minAgora = agora.getHours() * 60 + agora.getMinutes(), antes = avMin();
  const evs = AV.mine.ev.map(e => ({ ...e })); // inclui recorrências de hoje via occurrences()
  for (const ev of evs){
    if (!ev.hora_inicio) continue;
    let ocorreHoje = false; try { ocorreHoje = occurrences(ev, hoje, hoje).includes(hoje); } catch { ocorreHoje = ev.data === hoje; }
    if (!ocorreHoje || isDone(ev, hoje)) continue;
    const ini = toMin(ev.hora_inicio), falta = ini - minAgora;
    if (falta <= antes && falta >= -1){
      const k = `e|${ev.id}|${hoje}|${ev.hora_inicio}`; if (avJa(k)) continue; avMarca(k);
      avNotificar(`${ev.tipo === "missao" ? "🎯" : "📅"} ${ev.titulo}`, falta > 0 ? `Começa em ${falta} min (${hm(ev.hora_inicio)})${ev.local ? " · " + ev.local : ""}` : `Começando agora (${hm(ev.hora_inicio)})`, k);
    }
  }
  if (agora.getHours() >= 8){
    const k = `d|${hoje}`;
    if (!avJa(k)){
      const pr = AV.mine.dem.filter(d => d.status !== FIN && d.prazo === hoje);
      const ps = AV.mine.dem.filter(d => d.status !== FIN).flatMap(d => (d.checklist || []).filter(c => !c.feito && c.prazo === hoje));
      if (pr.length || ps.length){ avMarca(k);
        avNotificar("📌 Prazos de hoje", [...pr.map(d => "• " + d.titulo), ...ps.map(c => "☑ " + c.texto)].slice(0, 6).join("\n"), k); }
    }
  }
}
function avIniciar(){ clearInterval(AV.timer); if (avOn()){ avRegistrar(); avChecar(); AV.timer = setInterval(avChecar, 30000); } }
function openAvisos(){
  const sup = "Notification" in window;
  const perm = sup ? Notification.permission : "unsupported";
  const p = prefs();
  overlay(`<div class="mhead"><div class="mt">🔔 Avisos</div><button class="x" data-close>×</button></div>
    <div class="mbody">
      ${!sup ? `<p>Este navegador não mostra avisos. No celular, use o Chrome (Android) ou adicione o site à Tela de Início (iPhone).</p>` : `
      <label class="chk"><input type="checkbox" id="avOn" ${p.avisos && perm === "granted" ? "checked" : ""}> Avisar quando um compromisso da agenda estiver chegando e dos prazos do dia</label>
      <label class="f" style="margin-top:10px">Avisar com antecedência de</label>
      <select class="fld" id="avMin" style="max-width:200px">${[5,10,15,30,60].map(m => `<option value="${m}" ${avMin() === m ? "selected" : ""}>${m} minutos</option>`).join("")}</select>
      ${perm === "denied" ? `<p class="err">O navegador está bloqueando os avisos deste site. Libere em: cadeado ao lado do endereço → Notificações → Permitir.</p>` : ""}
      <p class="note" style="margin-top:12px">Os avisos aparecem no computador e no celular enquanto o site estiver aberto (mesmo em outra aba ou minimizado). Com o site totalmente fechado, o navegador não consegue avisar: para isso, conecte o Google Agenda — os compromissos vão para ele e o próprio Google avisa no celular.</p>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" id="avTeste">Enviar aviso de teste</button><button class="btn primary" data-close>Pronto</button></div>`}
    </div>`, "small");
  if (!sup) return;
  $("#avOn").onchange = async e => {
    const q = prefs();
    if (e.target.checked){ const r = await Notification.requestPermission(); if (r !== "granted"){ e.target.checked = false; toast("Permissão de avisos não concedida.", true); return; } }
    q.avisos = e.target.checked; await savePrefs(q); avIniciar(); toast(q.avisos ? "Avisos ligados." : "Avisos desligados.");
  };
  $("#avMin").onchange = e => { const q = prefs(); q.avisosMin = +e.target.value; savePrefs(q); };
  $("#avTeste").onclick = async () => { if (Notification.permission !== "granted"){ const r = await Notification.requestPermission(); if (r !== "granted") return; } await avRegistrar(); avNotificar("🔔 Acompanhamento ADM", "Os avisos estão funcionando.", "teste" + Date.now()); };
}
