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
const MODS = [["agenda","📅 Agenda"],["kanban","📋 Kanban"],["notas","📝 Notas"],["arquivos","📁 Arquivos"],["contatos","📇 Contatos"],["infos","🗂 Informações"],["parados","⏳ Parados"],["finalizadas","✅ Finalizadas"]];
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
  if (demandaDeOutro(it)) return `<div class="section"><h3>👥 Compartilhada</h3><p class="note" style="margin:0">Demanda de <b>${esc(nomeDe(it.dono))}</b>, compartilhada com ${(it.participantes || []).map(nomeDe).join(", ")}. Todos que estão na demanda editam normalmente (prazo, passos, atualizações, anexos) e veem as mesmas atualizações; só quem criou pode excluir a demanda.</p></div>`;
  return `<div class="section"><h3>👥 Compartilhar com</h3>${pessoasChips("data-dshare", it.participantes || [], [it.dono])}
    <p class="note" style="margin:4px 0 0">Quem você marcar vê esta demanda no próprio kanban e edita normalmente (prazo, passos, atualizações, anexos). As atualizações aparecem para todos. Ela também aparece para você quando abrir o espaço dessa pessoa.</p></div>`;
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
    ${notaShareTag(n, true)}
    ${n.texto ? `<div class="nvtext">${linkify(n.texto)}</div>` : ""}
    ${it.length ? `<ul class="nitems nvitems">${pend.map(li).join("")}</ul>${done.length ? `<div class="note" style="margin:8px 0 2px">${done.length} marcado(s)</div><ul class="nitems nvitems">${done.map(li).join("")}</ul>` : ""}` : ""}
    ${(n.marcadores || []).length ? `<div class="nlabels" style="margin-top:12px">${n.marcadores.map(l => `<span class="nlabel">🏷 ${esc(l)}</span>`).join("")}</div>` : ""}
    <div class="nfoot" style="margin-top:14px"><span class="note">Editada ${fmt(n.atualizado_em)}</span><span class="nacts">
      <button type="button" data-nv="pin" title="${n.fixada ? "Desafixar" : "Fixar"}">📌</button>
      <button type="button" data-nv="arq" title="${n.arquivada ? "Desarquivar" : "Arquivar"}">${n.arquivada ? "📤" : "🗄"}</button>
      ${n.dono === S.me.id ? `<button type="button" data-nv="share" title="Compartilhar">👥</button><button type="button" data-nv="del" title="Excluir">🗑</button>` : ""}
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
    if (a === "share"){ closeModal(true); openNotaShare(id); }
  });
}
const labelsAll = () => [...new Set([...(prefs().marcadores || []), ...notaLabels()])].sort((a, z) => a.localeCompare(z, "pt-BR"));
function labelCriar(v){ const p = prefs(); const l = p.marcadores || []; if (!l.some(x => x.toLowerCase() === v.toLowerCase())){ p.marcadores = [...l, v]; savePrefs(p); } }
function labelsEditorHtml(sel, aberto, q){
  const qq = (q || "").trim().toLowerCase(), todas = labelsAll().filter(l => !qq || l.toLowerCase().includes(qq));
  const existe = labelsAll().some(l => l.toLowerCase() === qq);
  return `<div class="nlabedit"><div class="nlabels">${sel.map(l => `<span class="nlabel">🏷 ${esc(l)}<button type="button" data-nlrm="${esc(l)}" title="Tirar">×</button></span>`).join("")}
      <button type="button" class="nlabel ghostl ${aberto ? "on" : ""}" data-nlopen>🏷 ${sel.length ? "Marcadores" : "Adicionar marcador"} ▾</button></div>
    ${aberto ? `<div class="nlpanel"><div class="note" style="margin-bottom:4px">Marcar a nota</div>
      <input class="fld" id="nLabIn" placeholder="Nome do marcador" value="${esc(q || "")}" maxlength="40" autocomplete="off">
      <div class="nlplist">${todas.map(l => `<label><input type="checkbox" data-nlck="${esc(l)}" ${sel.includes(l) ? "checked" : ""}> 🏷 ${esc(l)}</label>`).join("") || (qq ? "" : `<span class="note">Nenhum marcador ainda. Digite um nome para criar.</span>`)}</div>
      ${qq && !existe ? `<button type="button" class="nlnew" data-nlnew>＋ Criar "${esc(q.trim())}"</button>` : ""}</div>` : ""}</div>`;
}
function openMarcadores(){
  const draw = () => `<div class="mhead"><div class="mt">🏷 Editar marcadores</div><button class="x" data-close>×</button></div>
    <div class="mbody"><div class="upd"><input class="fld" id="mkNew" placeholder="Criar novo marcador" maxlength="40"><button class="btn primary sm" id="mkAdd">＋ Criar</button></div>
    <div class="mklist">${labelsAll().map(l => `<div class="mkrow"><span>🏷</span><input class="fld" data-mkren="${esc(l)}" value="${esc(l)}" maxlength="40"><span class="note">${(S.notas || []).filter(n => (n.marcadores || []).includes(l)).length} nota(s)</span><button class="btn ghost sm del" data-mkdel="${esc(l)}" title="Excluir marcador">🗑</button></div>`).join("") || `<p class="note">Nenhum marcador ainda.</p>`}</div>
    <p class="note">Para renomear, altere o nome e clique fora do campo. Excluir o marcador não apaga as notas.</p></div>`;
  const ov = overlay(draw(), "small");
  const re = () => { ov.querySelector(".modal").innerHTML = draw(); bind(); if (S.view === "notas") renderNotas(); };
  const trocar = (de, para) => {
    const p = prefs(); p.marcadores = [...new Set((p.marcadores || []).concat(labelsAll()).map(x => x === de ? para : x).filter(Boolean))]; savePrefs(p);
    (S.notas || []).filter(n => (n.marcadores || []).includes(de)).forEach(n => { const c = clone(n); c.marcadores = [...new Set(c.marcadores.map(x => x === de ? para : x).filter(Boolean))]; saveNota(c); });
    if (N.lab === de) N.lab = para || "";
  };
  function bind(){
    $$("#ov [data-close]").forEach(b => b.onclick = () => closeModal());
    const add = () => { const v = $("#mkNew").value.trim().replace(/\s+/g, " "); if (!v) return; labelCriar(v); setTimeout(re, 0); };
    $("#mkAdd").onclick = add; $("#mkNew").onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); add(); } };
    $$("[data-mkren]").forEach(i => i.onchange = () => { const de = i.dataset.mkren, para = i.value.trim().replace(/\s+/g, " ");
      if (!para || para === de) { i.value = de; return; }
      if (labelsAll().some(x => x !== de && x.toLowerCase() === para.toLowerCase())){ toast("Já existe um marcador com esse nome.", true); i.value = de; return; }
      trocar(de, para); toast("Marcador renomeado."); re(); });
    $$("[data-mkdel]").forEach(b => b.onclick = () => { trocar(b.dataset.mkdel, null); toast("Marcador excluído."); re(); });
  }
  bind();
}

/* ===================== KANBAN: ocultar passos concluídos ===================== */
const ckOculto = () => !!prefs().ckOcultar;
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-cktog]"); if (!b) return;
  e.preventDefault(); const p = prefs(); p.ckOcultar = !p.ckOcultar; savePrefs(p);
  const ck = $("#ck"); if (ck && K.openId && getD(K.openId)) ck.innerHTML = checklistHtml(getD(K.openId));
  if (b.dataset.cktog) openDemandaPeek(b.dataset.cktog);
});

/* ---------- notas compartilhadas ---------- */
function notaShareTag(n, longo){
  if (n.dono !== S.me.id) return `<div class="nshare">👥 ${longo ? "Compartilhada por " : "de "}${esc(nomeDe(n.dono))}</div>`;
  const m = n.membros || []; return m.length ? `<div class="nshare">👥 ${longo ? "Compartilhada com " + m.map(nomeDe).join(", ") : m.length + " pessoa(s)"}</div>` : "";
}
function openNotaShare(id){
  const n = S.notas.find(x => x.id === id); if (!n) return;
  overlay(`<div class="mhead"><div class="mt">👥 Compartilhar nota</div><button class="x" data-close>×</button></div>
    <div class="mbody"><p class="note" style="margin-top:0">Quem você marcar vê "${esc(n.titulo || "Sem título")}" nas notas dele e pode editar (texto, lista, cor, marcadores). Só você pode excluir ou mudar com quem está compartilhada.</p>
      ${pessoasChips("data-nsm", n.membros || [], [S.me.id])}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="nsOk">Salvar</button></div></div>`, "small");
  $("#nsOk").onclick = () => { const c = clone(n); c.membros = $$("[data-nsm]").filter(x => x.checked).map(x => x.dataset.nsm); saveNota(c); closeModal(true);
    toast(c.membros.length ? `Nota compartilhada com ${c.membros.map(nomeDe).join(", ")}.` : "A nota não está mais compartilhada."); };
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
// renova no clique (o Google só abre a janela de renovação a partir de um clique) quando faltar menos de 20 min
const gTalvezRenovar = () => { if (!S.me || !(gOn() || driveOnPref())) return; const falta = (G.exp || 0) - Date.now(); if (!G.token || falta < 20 * 60000) gRenew(); };
document.addEventListener("click", gTalvezRenovar, true);
document.addEventListener("keydown", e => { if (e.key === "Enter") gTalvezRenovar(); }, true);
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
const CT = { q: "", loaded: false, aba: "comp" };
async function loadContatos(){ try { S.contatos = await API.list("contatos"); CT.loaded = true; } catch(e){ S.contatos = []; CT.err = errMsg(e); CT.loaded = true; } }
const soDig = s => String(s || "").replace(/\D/g, "");
const waLink = n => { let d = soDig(n); if (!d) return ""; if (d.length <= 11) d = "55" + (d.length <= 9 ? "81" + d : d); return "https://wa.me/" + d; };
const podeEditarContato = c => c.dono === S.me.id || isAdmin();
const ctCompTexto = c => !c.compartilhado ? "🔒 Só quem cadastrou" : (c.membros || []).length ? "👥 " + c.membros.map(nomeDe).join(", ") : "👥 Toda a equipe";
function ctShareHtml(comp, membros){
  const modo = !comp ? "eu" : (membros || []).length ? "alguns" : "todos";
  return `<div class="section"><label class="f">Quem pode ver</label>
    <div class="ctshare">
      <label class="chk"><input type="radio" name="ctsh" value="eu" ${modo === "eu" ? "checked" : ""}> 🔒 Só eu (não compartilhado)</label>
      <label class="chk"><input type="radio" name="ctsh" value="todos" ${modo === "todos" ? "checked" : ""}> 👥 Toda a equipe</label>
      <label class="chk"><input type="radio" name="ctsh" value="alguns" ${modo === "alguns" ? "checked" : ""}> 👤 Só algumas pessoas</label></div>
    <div id="ctShWho" ${modo === "alguns" ? "" : "hidden"} style="margin-top:6px">${pessoasChips("data-ctm", membros || [], [S.me.id])}</div></div>`;
}
function ctShareBind(root){
  root.addEventListener("change", e => { if (e.target.name === "ctsh") $("#ctShWho").hidden = e.target.value !== "alguns"; });
}
function ctShareRead(){
  const m = ($$('[name="ctsh"]').find(r => r.checked) || {}).value || "todos";
  const membros = m === "alguns" ? $$("[data-ctm]").filter(c => c.checked).map(c => c.dataset.ctm) : [];
  if (m === "alguns" && !membros.length) throw new Error("Escolha pelo menos uma pessoa (ou marque Toda a equipe).");
  return { compartilhado: m !== "eu", membros };
}
function renderContatos(){
  const v = $("#v-contatos");
  if (!CT.loaded){ v.innerHTML = `<div class="empty" style="padding:40px"><div class="spinner" style="margin:auto"></div></div>`; loadContatos().then(() => S.view === "contatos" && renderContatos()); return; }
  const q = CT.q.trim().toLowerCase();
  const todos = (S.contatos || []).filter(c => !q || [c.nome, c.empresa, c.cargo, c.telefone, c.whatsapp, c.email, c.obs].join(" ").toLowerCase().includes(q))
    .sort((a, z) => a.nome.localeCompare(z.nome, "pt-BR"));
  const comp = todos.filter(c => c.compartilhado), priv = todos.filter(c => !c.compartilhado);
  const l = CT.aba === "priv" ? priv : comp;
  v.innerHTML = `<div class="ctwrap"><div class="kbar"><div class="ksearch" style="flex:1;min-width:200px"><span>🔎</span><input id="ctQ" placeholder="Procurar por nome, empresa, telefone…" value="${esc(CT.q)}"></div>
      <button class="btn" data-ct="lote">📥 Cadastrar em lote</button><button class="btn primary" data-ct="new">＋ Novo contato</button></div>
    <div class="seg" style="margin:12px 0 0"><button data-ctaba="comp" class="${CT.aba !== "priv" ? "on" : ""}">👥 Compartilhados (${comp.length})</button><button data-ctaba="priv" class="${CT.aba === "priv" ? "on" : ""}">🔒 Não compartilhados (${priv.length})</button></div>
    ${l.length ? `<div class="ctgrid">${l.map(c => `<div class="ctcard" data-ctid="${c.id}">
      <div class="cttop"><span class="avatar" style="background:${(pessoa(c.dono) || (S.nomes || []).find(x => x.id === c.dono) || {}).cor || "#8a94a6"}">${esc(initials(c.nome))}</span>
        <div style="min-width:0;flex:1"><b>${esc(c.nome)}</b>${c.empresa || c.cargo ? `<div class="note">${esc([c.cargo, c.empresa].filter(Boolean).join(" · "))}</div>` : ""}</div></div>
      <div class="ctacts">
        ${c.whatsapp ? `<a class="btn sm" href="${waLink(c.whatsapp)}" target="_blank" rel="noopener" title="WhatsApp ${esc(c.whatsapp)}">💬 WhatsApp</a>` : ""}
        ${c.telefone ? `<a class="btn sm" href="tel:${soDig(c.telefone)}" title="${esc(c.telefone)}">📞 ${esc(c.telefone)}</a>` : ""}
        ${c.email ? `<a class="btn sm" href="mailto:${esc(c.email)}" title="${esc(c.email)}">✉️ E-mail</a>` : ""}
      </div>
      ${c.obs ? `<div class="note ctobs">${esc(c.obs)}</div>` : ""}
      <div class="note" style="margin-top:6px;font-size:11px">${c.dono === S.me.id ? ctCompTexto(c) : "Cadastrado por " + esc(nomeDe(c.dono))}</div></div>`).join("")}</div>`
      : `<div class="nempty">${q ? "Nenhum contato encontrado." : CT.aba === "priv" ? "🔒 Nenhum contato só seu.<br><span class=\"note\">Contatos não compartilhados ficam visíveis só para quem cadastrou.</span>" : "📇 Nenhum contato compartilhado ainda.<br><span class=\"note\">Cadastre fornecedores, transportadoras, assistências… e escolha quem pode ver.</span>"}</div>`}</div>`;
  const qi = $("#ctQ"); qi.oninput = () => { const p = qi.selectionStart; CT.q = qi.value; renderContatos(); const n = $("#ctQ"); n.focus(); n.setSelectionRange(p, p); };
}
function openContato(id){
  const c = id ? S.contatos.find(x => x.id === id) : null;
  const ro = c && !podeEditarContato(c);
  const d = c ? clone(c) : { id: uuid(), dono: S.me.id, nome: "", empresa: "", cargo: "", telefone: "", whatsapp: "", email: "", obs: "", marcadores: [], compartilhado: CT.aba !== "priv", membros: [], criado_em: Date.now(), atualizado_em: Date.now() };
  const f = (k, l, ph, t) => `<div><label class="f">${l}</label><input class="fld" data-ctf="${k}" type="${t || "text"}" value="${esc(d[k] || "")}" placeholder="${ph || ""}" ${ro ? "disabled" : ""}></div>`;
  const ov = overlay(`<div class="mhead"><div class="mt">${c ? (ro ? "📇 Contato" : "Editar contato") : "＋ Novo contato"}</div>${c && !ro ? `<button class="x" data-ctx="del" title="Excluir">🗑</button>` : ""}<button class="x" data-close>×</button></div>
    <form class="mbody" id="ctF">
      ${f("nome", "Nome", "Nome da pessoa ou empresa")}
      <div class="grid2" style="margin-top:10px">${f("empresa", "Empresa")}${f("cargo", "Cargo / setor")}</div>
      <div class="grid2" style="margin-top:10px">${f("whatsapp", "WhatsApp", "(81) 9 9999-9999", "tel")}${f("telefone", "Telefone", "", "tel")}</div>
      <div style="margin-top:10px">${f("email", "E-mail", "", "email")}</div>
      <label class="f" style="margin-top:10px">Observações</label><textarea class="fld" data-ctf="obs" rows="3" ${ro ? "disabled" : ""}>${esc(d.obs || "")}</textarea>
      ${ro ? `<p class="note">Cadastrado por ${esc(nomeDe(d.dono))}. Só essa pessoa (ou um administrador) pode alterar.</p>` : ctShareHtml(d.compartilhado, d.membros)}
      <div class="err" id="ctE"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button type="button" class="btn" data-close>${ro ? "Fechar" : "Cancelar"}</button>${ro ? "" : `<button class="btn primary">Salvar</button>`}</div></form>`, "mid");
  if (!ro) ctShareBind(ov);
  setTimeout(() => { const i = $('[data-ctf="nome"]'); if (i && !ro) i.focus(); }, 30);
  const del = $('[data-ctx="del"]');
  if (del) del.onclick = () => confirmBox(`Excluir ${d.nome}?`, "O contato sai da lista de todos.", "Excluir", async () => {
    closeModal(true); S.contatos = S.contatos.filter(x => x.id !== d.id); renderContatos(); await remove("contatos", d.id); toast("Contato excluído."); });
  $("#ctF").onsubmit = async e => {
    e.preventDefault(); if (ro) return;
    $$("[data-ctf]").forEach(i => { d[i.dataset.ctf] = i.value.trim(); });
    if (!d.nome){ $("#ctE").textContent = "Coloque o nome."; return; }
    try { Object.assign(d, ctShareRead()); } catch(ex){ $("#ctE").textContent = ex.message; return; }
    d.atualizado_em = Date.now();
    const i = S.contatos.findIndex(x => x.id === d.id); if (i >= 0) S.contatos[i] = d; else S.contatos.push(d);
    CT.aba = d.compartilhado ? "comp" : "priv";
    closeModal(true); renderContatos(); await persist("contatos", d); toast("Contato salvo.");
  };
}
/* --- cadastro em lote: colar do Excel/WhatsApp ou enviar .csv --- */
const CT_COLS = [["nome", /^nome|^contato/i], ["whatsapp", /whats|zap|celular/i], ["telefone", /^tel|^fone/i], ["email", /mail/i], ["empresa", /empresa|fornecedor|raz/i], ["cargo", /cargo|setor|fun/i], ["obs", /obs|nota|coment/i]];
const CT_ORDEM = ["nome", "whatsapp", "telefone", "email", "empresa", "cargo", "obs"];
function ctParse(txt){
  const linhas = txt.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  if (!linhas.length) return [];
  const sep = txt.includes("\t") ? "\t" : linhas[0].includes(";") ? ";" : ",";
  const split = l => { const out = []; let cur = "", q = false; for (const ch of l){ if (ch === '"') q = !q; else if (ch === sep && !q){ out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); };
  let ordem = CT_ORDEM, ini = 0;
  const h = split(linhas[0]);
  if (h.some(x => /^nome|whats|telefone|e-?mail|empresa/i.test(x))){ ordem = h.map(x => (CT_COLS.find(([, r]) => r.test(x)) || [null])[0]); ini = 1; }
  return linhas.slice(ini).map(l => { const v = split(l), c = {}; ordem.forEach((k, i) => { if (k && v[i]) c[k] = (c[k] ? c[k] + " " : "") + v[i]; });
    if (!c.nome && v.length === 1 && v[0]) c.nome = v[0];
    if (!c.email){ const m = l.match(/[\w.+-]+@[\w-]+\.[\w.]+/); if (m) c.email = m[0]; }
    return c; }).filter(c => c.nome);
}
function openContatosLote(){
  let lista = [];
  const ov = overlay(`<div class="mhead"><div class="mt">📥 Cadastrar contatos em lote</div><button class="x" data-close>×</button></div>
    <form class="mbody" id="clF">
      <p class="note" style="margin-top:0">Cole abaixo, um contato por linha, na ordem: <b>Nome; WhatsApp; Telefone; E-mail; Empresa; Cargo; Observação</b>. Pode copiar direto de uma planilha do Excel (com ou sem a linha de títulos) ou enviar um arquivo .csv.</p>
      <textarea class="fld" id="clT" rows="7" placeholder="Transportadora Rápida; 81 99999-0000; ; contato@rapida.com; Rápida Log; Comercial&#10;João da Assistência; 81 98888-1111"></textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><label class="btn sm">📄 Enviar arquivo .csv<input type="file" id="clFile" accept=".csv,.txt,text/csv,text/plain" hidden></label><span class="note" id="clN"></span></div>
      <div id="clPrev" class="clprev"></div>
      ${ctShareHtml(CT.aba !== "priv", [])}
      <div class="err" id="clE"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" id="clOk" disabled>Cadastrar</button></div></form>`, "mid");
  ctShareBind(ov);
  const prev = () => {
    lista = ctParse($("#clT").value);
    $("#clN").textContent = lista.length ? `${lista.length} contato(s) reconhecido(s)` : "";
    $("#clOk").disabled = !lista.length; $("#clOk").textContent = lista.length ? `Cadastrar ${lista.length}` : "Cadastrar";
    $("#clPrev").innerHTML = lista.length ? `<table><thead><tr><th>Nome</th><th>WhatsApp</th><th>Telefone</th><th>E-mail</th><th>Empresa</th></tr></thead><tbody>${lista.slice(0, 50).map(c => `<tr><td>${esc(c.nome)}</td><td>${esc(c.whatsapp || "")}</td><td>${esc(c.telefone || "")}</td><td>${esc(c.email || "")}</td><td>${esc(c.empresa || "")}</td></tr>`).join("")}</tbody></table>${lista.length > 50 ? `<p class="note">… e mais ${lista.length - 50}</p>` : ""}` : "";
  };
  $("#clT").oninput = prev;
  $("#clFile").onchange = async e => { const f = e.target.files[0]; if (!f) return; let t = await f.text(); if (t.includes("�")){ try { t = new TextDecoder("windows-1252").decode(await f.arrayBuffer()); } catch {} } $("#clT").value = t; prev(); };
  $("#clF").onsubmit = async e => {
    e.preventDefault(); let sh; try { sh = ctShareRead(); } catch(ex){ $("#clE").textContent = ex.message; return; }
    if (!lista.length) return; $("#clOk").disabled = true;
    const now = Date.now();
    const rows = lista.map((c, i) => ({ id: uuid(), dono: S.me.id, nome: c.nome.slice(0, 120), empresa: c.empresa || "", cargo: c.cargo || "", telefone: c.telefone || "", whatsapp: c.whatsapp || "", email: c.email || "", obs: c.obs || "", marcadores: [], compartilhado: sh.compartilhado, membros: sh.membros, criado_em: now + i, atualizado_em: now + i }));
    try { for (const r of rows) await API.save("contatos", r); }
    catch(ex){ $("#clE").textContent = "Parou no meio: " + errMsg(ex); $("#clOk").disabled = false; CT.loaded = false; return; }
    S.contatos.push(...rows); CT.aba = sh.compartilhado ? "comp" : "priv"; closeModal(true); renderContatos(); toast(`${rows.length} contato(s) cadastrado(s).`);
  };
}
document.addEventListener("click", e => {
  if (S.view !== "contatos" || e.target.closest("#modalRoot")) return;
  if (e.target.closest('[data-ct="new"]')){ openContato(null); return; }
  if (e.target.closest('[data-ct="lote"]')){ openContatosLote(); return; }
  const ab = e.target.closest("[data-ctaba]"); if (ab){ CT.aba = ab.dataset.ctaba; renderContatos(); return; }
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

/* ===================== BACKUP / EXPORTAR DADOS ===================== */
const bkLbl = (dono, k) => { if (k === FIN) return "Finalizado"; const p = S.perfis.find(x => x.id === dono);
  const cols = (p && p.preferencias && Array.isArray(p.preferencias.colunas) && p.preferencias.colunas.length) ? p.preferencias.colunas : (S.globalCols || COLS);
  const c = (cols || []).find(x => x.key === k) || COLS.find(x => x.key === k); return c ? c.label : k; };
const bkDt = ts => ts ? new Date(+ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const bkYmd = s => s ? fmtYmd(s, { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
async function bkColetar(tudo){
  const [dem, evs, notas, cts, pastas, ipastas, infos] = await Promise.all([
    tudo ? API.list("demandas") : API.list("demandas", S.me.id),
    tudo ? API.list("eventos") : API.list("eventos", S.me.id),
    API.list("notas", S.me.id), API.list("contatos").catch(() => []), API.list("pastas_compartilhadas").catch(() => []),
    API.list("info_pastas").catch(() => []), API.list("infos").catch(() => [])]);
  return { app: "acompanhamento-adm", versao: 1, gerado_em: new Date().toISOString(), por: { id: S.me.id, nome: S.me.nome }, escopo: tudo ? "equipe" : "meu",
    pessoas: (S.nomes || []).map(p => ({ id: p.id, nome: p.nome })), preferencias: S.me.preferencias || {},
    tabelas: { demandas: dem, eventos: evs, notas, contatos: cts, pastas_compartilhadas: pastas, info_pastas: ipastas, infos } };
}
function bkXls(b){
  const x = v => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "&#10;");
  const sheet = (nome, cab, linhas) => `<Worksheet ss:Name="${x(nome)}"><Table>${[cab, ...linhas].map((l, i) => `<Row>${l.map(c => `<Cell${i ? "" : ' ss:StyleID="h"'}><Data ss:Type="String">${x(c)}</Data></Cell>`).join("")}</Row>`).join("")}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`;
  const t = b.tabelas, nm = id => nomeDe(id);
  const notasDe = h => (h || []).filter(n => n.tipo === "nota").sort((a, z) => a.em - z.em);
  const dem = t.demandas.slice().sort((a, z) => nm(a.dono).localeCompare(nm(z.dono)) || a.criado_em - z.criado_em).map(d => {
    const ns = notasDe(d.historico), cl = d.checklist || [];
    return [d.titulo, nm(d.dono), bkLbl(d.dono, d.status), prioKey(d.prioridade) ? PRIO[prioKey(d.prioridade)].l : "", bkYmd(d.prazo), d.descricao || "",
      cl.length ? `${cl.filter(c => c.feito).length}/${cl.length}` : "", cl.map(c => (c.feito ? "✓ " : "☐ ") + c.texto).join("\n"),
      ns.length ? bkDt(ns[ns.length - 1].em) : "", ns.map(n => bkDt(n.em) + (n.por ? " · " + n.por : "") + ": " + n.texto).join("\n"),
      (d.participantes || []).map(nm).join(", "), bkDt(d.criado_em), bkDt(d.finalizado_em)]; });
  const evs = t.eventos.slice().sort((a, z) => (a.data || "").localeCompare(z.data || "")).map(e => [e.tipo === "missao" ? "Missão" : "Evento", e.titulo, nm(e.dono), bkYmd(e.data), bkYmd(e.data_fim), hm(e.hora_inicio), hm(e.hora_fim), e.local || "",
    REC[e.recorrencia] || "", prioKey(e.prioridade) ? PRIO[prioKey(e.prioridade)].l : "", (e.recorrencia && e.recorrencia !== "nenhuma") ? `${(e.concluidas || []).length} dia(s) concluído(s)` : e.concluida ? "Concluído" : "Em aberto",
    e.pessoal ? "Sim" : "", e.descricao || "", notasDe(e.historico).map(n => bkDt(n.em) + ": " + n.texto).join("\n")]);
  const nts = t.notas.map(n => [n.titulo, [n.texto, ...(n.itens || []).map(i => (i.feito ? "✓ " : "☐ ") + i.texto)].filter(Boolean).join("\n"), (n.marcadores || []).join(", "), n.fixada ? "Sim" : "", n.arquivada ? "Sim" : "", bkDt(n.atualizado_em)]);
  const cts = t.contatos.slice().sort((a, z) => a.nome.localeCompare(z.nome, "pt-BR")).map(c => [c.nome, c.empresa, c.cargo, c.whatsapp, c.telefone, c.email, c.obs, ctCompTexto(c).replace(/^\S+ /, ""), nm(c.dono)]);
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2F5BEA" ss:Pattern="Solid"/></Style></Styles>`
    + sheet("Demandas", ["Título", "Pessoa", "Quadro", "Prioridade", "Prazo", "Descrição", "Checklist", "Passos", "Última atualização", "Atualizações", "Compartilhada com", "Cadastrada em", "Finalizada em"], dem)
    + sheet("Agenda", ["Tipo", "Título", "Pessoa", "Data", "Até", "Início", "Fim", "Local", "Repetição", "Prioridade", "Situação", "Pessoal", "Descrição", "Atualizações"], evs)
    + sheet("Notas", ["Título", "Conteúdo", "Marcadores", "Fixada", "Arquivada", "Editada em"], nts)
    + sheet("Contatos", ["Nome", "Empresa", "Cargo", "WhatsApp", "Telefone", "E-mail", "Observações", "Quem vê", "Cadastrado por"], cts)
    + sheet("Insumos", ["Pasta", "Seção", "Insumo / produto", "Contato", "Telefone / e-mail / site", "Última compra", "Detalhe", "Link", "Observações"], (t.infos || []).filter(i => ((t.info_pastas || []).find(p => p.id === i.pasta) || {}).tipo === "insumos").map(i => { const d = i.dados, p = t.info_pastas.find(x => x.id === i.pasta); return [p.nome, d.secao, d.produto, d.contato, d.telefone, bkYmd(d.ult_data), d.ult_detalhe, d.link, d.obs]; }))
    + sheet("Acessos", ["Pasta", "Unidade / setor", "Site", "Login", "Senha", "Última alteração", "Observações"], (t.infos || []).filter(i => ((t.info_pastas || []).find(p => p.id === i.pasta) || {}).tipo === "acessos").map(i => { const d = i.dados, p = t.info_pastas.find(x => x.id === i.pasta); return [p.nome, d.unidade, d.site, d.login, d.senha, bkYmd(d.alterado), d.obs]; }))
    + `</Workbook>`;
}
function openBackup(){
  const adm = isAdmin();
  overlay(`<div class="mhead"><div class="mt">💾 Backup e exportar dados</div><button class="x" data-close>×</button></div>
    <div class="mbody">
      ${adm ? `<label class="f">O que incluir</label><div class="ctshare" style="margin-bottom:10px">
        <label class="chk"><input type="radio" name="bkesc" value="meu" checked> 👤 Só os meus dados</label>
        <label class="chk"><input type="radio" name="bkesc" value="tudo"> 👥 Tudo o que eu posso ver (equipe)</label></div>` : ""}
      <div class="bkopts">
        <button class="btn" data-bk="xls"><b>📊 Planilha do Excel</b><span class="note">Demandas, agenda, notas, contatos, insumos e acessos em abas. Atenção: a aba Acessos leva as senhas.</span></button>
        <button class="btn" data-bk="json"><b>💾 Backup completo (.json)</b><span class="note">Cópia de segurança com tudo (histórico, checklists, anexos). Serve para restaurar depois.</span></button>
      </div>
      <h3 style="margin:18px 0 6px;font-size:14px">⬆ Restaurar um backup</h3>
      <p class="note" style="margin:0 0 8px">Escolha um arquivo .json gerado aqui. O que estiver no arquivo volta para o sistema (se ainda existir, é substituído pela versão do backup). Nada que não esteja no arquivo é apagado.</p>
      <label class="btn sm">📂 Escolher arquivo de backup<input type="file" id="bkFile" accept=".json,application/json" hidden></label>
      <div class="note" id="bkMsg" style="margin-top:10px"></div>
      <p class="note" style="margin-top:14px">Dica: faça um backup completo de tempos em tempos e guarde no Google Drive ou no computador. O Excel pode avisar que o formato do arquivo é diferente da extensão — é só clicar em <b>Sim</b> para abrir.</p>
    </div>`, "small");
  const tudo = () => adm && ($$('[name="bkesc"]').find(r => r.checked) || {}).value === "tudo";
  $$("[data-bk]").forEach(b => b.onclick = async () => {
    const tipo = b.dataset.bk; $("#bkMsg").textContent = "Reunindo os dados…"; $$("[data-bk]").forEach(x => x.disabled = true);
    try {
      const bk = await bkColetar(tudo()), dia = todayYmd(), base = `Acompanhamento-ADM-${bk.escopo === "equipe" ? "equipe" : semAcento(S.me.nome).replace(/\s+/g, "-")}-${dia}`;
      if (tipo === "json") download(base + ".json", JSON.stringify(bk, null, 1), "application/json");
      else download(base + ".xls", bkXls(bk), "application/vnd.ms-excel");
      const t = bk.tabelas; $("#bkMsg").textContent = `✓ Arquivo gerado: ${t.demandas.length} demanda(s), ${t.eventos.length} compromisso(s), ${t.notas.length} nota(s), ${t.contatos.length} contato(s).`;
      const p = prefs(); p.ultimoBackup = Date.now(); savePrefs(p);
    } catch(e){ $("#bkMsg").textContent = "Erro: " + errMsg(e); }
    $$("[data-bk]").forEach(x => x.disabled = false);
  });
  $("#bkFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    let bk; try { bk = JSON.parse(await f.text()); } catch { toast("Esse arquivo não é um backup válido.", true); return; }
    if (!bk || bk.app !== "acompanhamento-adm" || !bk.tabelas){ toast("Esse arquivo não é um backup deste sistema.", true); return; }
    const t = bk.tabelas, ord = ["demandas", "eventos", "notas", "contatos", "info_pastas", "infos"], n = ord.reduce((s, k) => s + (t[k] || []).length, 0);
    confirmBox("Restaurar este backup?", `Gerado em ${bkDt(Date.parse(bk.gerado_em))} por ${bk.por ? bk.por.nome : "?"}: ${(t.demandas || []).length} demanda(s), ${(t.eventos || []).length} compromisso(s), ${(t.notas || []).length} nota(s) e ${(t.contatos || []).length} contato(s). Itens que já existem voltam para a versão do backup.`, "Restaurar", async () => {
      let ok = 0, fal = 0; toast(`Restaurando ${n} itens…`);
      for (const k of ord) for (const r of (t[k] || [])){ try { await API.save(k, r); ok++; } catch { fal++; } }
      N.loaded = false; CT.loaded = false; await reloadSpace(false); renderAll();
      toast(fal ? `Restaurados ${ok} itens. ${fal} não puderam ser restaurados (sem permissão).` : `Backup restaurado: ${ok} itens.`, !!fal);
    }, "primary");
  };
}
