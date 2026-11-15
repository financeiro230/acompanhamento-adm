/* ===================== KANBAN ===================== */
"use strict";

const K = { inlineAdd: null, openId: null, dirty: false, editingNote: null };
const getD = id => S.demandas.find(d => d.id === id);

function matchesSearch(it){
  const q = $("#search").value.trim().toLowerCase();
  if (!q) return true;
  const hay = (it.titulo + " " + (it.descricao||"") + " " + (it.historico||[]).filter(h=>h.tipo==="nota").map(h=>h.texto).join(" ") + " " + (it.checklist||[]).map(c=>c.texto).join(" ")).toLowerCase();
  return hay.includes(q);
}

/* ---------- ações ---------- */
function createDemanda({titulo, descricao="", prazo=null, prioridade="normal", status="pendente", dono=S.space}){
  const now = Date.now();
  const it = { id: uuid(), dono, titulo: titulo.trim(), descricao: (descricao||"").trim(), status, prioridade,
    prazo: prazo || null, checklist: [], criado_em: now, atualizado_em: now, finalizado_em: null, criado_por: S.me.id,
    historico: [actorTag({tipo:"criado", em:now, texto:`Cadastrada em "${colLabel(status)}"`})] };
  if (dono === S.space) S.demandas.push(it);
  renderAll();
  return persist("demandas", it);
}
function updateD(id, mutate){
  const cur = getD(id); if (!cur) return;
  const it = clone(cur); it.historico = it.historico || []; it.checklist = it.checklist || [];
  if (mutate(it) === false) return;
  it.atualizado_em = Date.now();
  Object.assign(cur, it); renderAll();
  return persist("demandas", it);
}
function moveD(id, to){
  const cur = getD(id); if (!cur || cur.status === to) return Promise.resolve();
  const from = cur.status;
  return updateD(id, it => {
    const now = Date.now();
    if (to === FIN){ it.finalizado_em = now; it.historico.push(actorTag({tipo:"final", em:now, de:from, para:FIN, texto:`Finalizada (estava em "${colLabel(from)}")`})); }
    else if (from === FIN){ it.finalizado_em = null; it.historico.push(actorTag({tipo:"status", em:now, de:FIN, para:to, texto:`Reaberta em "${colLabel(to)}"`})); }
    else it.historico.push(actorTag({tipo:"status", em:now, de:from, para:to, texto:`${colLabel(from)} → ${colLabel(to)}`}));
    it.status = to;
  });
}
const addNoteD = (id, texto) => texto.trim() && updateD(id, it => { it.historico.push(actorTag({tipo:"nota", em:Date.now(), texto:texto.trim()})); });
function editD(id, changes){
  const cur = getD(id); if (!cur) return;
  const names = {titulo:"título", descricao:"descrição", prazo:"prazo", prioridade:"prioridade"};
  const changed = Object.keys(changes).filter(k => (cur[k]||"") !== (changes[k]||""));
  if (!changed.length) return;
  return updateD(id, it => {
    changed.forEach(k => it[k] = changes[k] || (k==="prazo" ? null : ""));
    it.historico.push(actorTag({tipo:"edicao", em:Date.now(), texto:"Editado: " + changed.map(k=>names[k]).join(", ")}));
  });
}
async function deleteD(id){
  S.demandas = S.demandas.filter(d => d.id !== id); S.selected.delete(id); renderAll();
  await remove("demandas", id);
}
function transferD(id, novoDono){
  const cur = getD(id); if (!cur || cur.dono === novoDono) return;
  const de = perfil(cur.dono), para = perfil(novoDono);
  return updateD(id, it => {
    it.dono = novoDono;
    it.historico.push({tipo:"status", em:Date.now(), texto:`Transferida de ${de?de.nome:"?"} para ${para?para.nome:"?"}`, por:S.me.nome});
  }).then(() => { S.demandas = S.demandas.filter(d => d.id !== id || d.dono === S.space); renderAll(); });
}

/* ---------- render quadro ---------- */
function renderKanban(){
  const v = $("#v-kanban");
  const prioRank = p => p === "alta" ? 0 : 1;
  const colHtml = c => {
    const known = new Set([...COLS.map(x => x.key), FIN]);
    const first = (COLS.find(x => x.lado !== "lateral") || COLS[0]).key;
    const list = S.demandas.filter(i => (i.status === c.key || (c.key === first && !known.has(i.status))) && matchesSearch(i))
      .sort((a,z) => prioRank(a.prioridade)-prioRank(z.prioridade) || (a.prazo||"9999").localeCompare(z.prazo||"9999") || a.criado_em-z.criado_em);
    const cards = list.map(cardHtml).join("") || `<div class="empty">Nada aqui.</div>`;
    const ph = c.key==="rascunhos" ? "Anote livremente… (Enter salva, Shift+Enter pula linha)" : c.key==="ideias" ? "Qual a ideia? (Enter para salvar)" : "Título da demanda… (Enter para salvar)";
    const add = K.inlineAdd === c.key
      ? `<div class="addinline"><textarea id="inl" placeholder="${ph}"></textarea>
         <div class="row"><button class="btn primary sm" data-act="inlsave">Adicionar</button><button class="btn ghost sm" data-act="inlcancel">Cancelar</button></div></div>`
      : `<button class="btn ghost sm addbtn" data-act="inl" data-col="${c.key}">＋ Adicionar</button>`;
    return `<section class="col" data-col="${c.key}">
      <div class="colhead"><span class="dot" style="background:${c.color}"></span>${esc(c.label)}<span class="count">${list.length}</span></div>
      <div class="cards">${cards}</div>${add}</section>`;
  };
  const lat = COLS.filter(c => c.lado === "lateral"), pri = COLS.filter(c => c.lado !== "lateral");
  const ncols = pri.length + (lat.length ? 1 : 0);
  v.innerHTML = `<div class="kbar"><button class="btn primary" data-act="newD">＋ Nova demanda</button>
      ${isAdmin() ? `<button class="btn" data-act="cols">⚙ Quadros</button>` : ""}
      <span class="note">Arraste os cartões entre os quadros · marque as caixinhas para ações em lote</span></div>
    <div class="board" style="grid-template-columns:repeat(${ncols},minmax(230px,1fr))">${lat.length ? `<div class="stack">${lat.map(colHtml).join("")}</div>` : ""}
    ${pri.map(colHtml).join("")}</div>`;
  if (K.inlineAdd){ const t = $("#inl"); t && t.focus(); }
}
function cardHtml(it){
  const notes = (it.historico||[]).filter(h => h.tipo === "nota");
  const last = notes[notes.length-1];
  const cl = it.checklist || [];
  return `<article class="card ${S.selected.has(it.id)?"sel":""}" draggable="true" data-id="${it.id}">
    <input type="checkbox" data-sel="${it.id}" ${S.selected.has(it.id)?"checked":""} title="Selecionar">
    <div class="cbody">
      <div class="ctitle">${esc(it.titulo)}</div>
      ${it.descricao ? `<div class="cdesc">${esc(it.descricao)}</div>` : ""}
      <div class="cmeta">
        ${it.prioridade==="alta" ? `<span class="tag high">Alta</span>` : ""}
        ${prazoTag(it.prazo, it.status)}
        ${cl.length ? `<span class="tag ${cl.every(c=>c.feito)?"okt":""}">☑ ${cl.filter(c=>c.feito).length}/${cl.length}</span>` : ""}
        <span title="Cadastrada em ${fmt(it.criado_em)}">📅 ${ago(it.criado_em)}</span>
        ${notes.length ? `<span>💬 ${notes.length}</span>` : ""}
      </div>
      ${last ? `<div class="lastupd"><b>${fmtD(last.em)}:</b> ${esc(last.texto)}</div>` : ""}
    </div></article>`;
}

/* ---------- finalizadas ---------- */
function renderFinalizadas(){
  const v = $("#v-finalizadas");
  const per = v.dataset.per || "30";
  const now = new Date(); let from = 0, to = Infinity;
  if (["7","30","90"].includes(per)) from = Date.now() - (+per)*dayMs;
  else if (per === "month") from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  else if (per === "lastmonth"){ from = new Date(now.getFullYear(), now.getMonth()-1, 1).getTime(); to = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); }
  const list = S.demandas.filter(i => i.status===FIN && matchesSearch(i) && (i.finalizado_em||0)>=from && (i.finalizado_em||0)<to)
    .sort((a,z) => (z.finalizado_em||0)-(a.finalizado_em||0));
  const allOn = list.length>0 && list.every(i => S.selected.has(i.id));
  v.innerHTML = `<div class="hbar">
      <select id="hPeriod">${[["all","Todo o período"],["7","Últimos 7 dias"],["30","Últimos 30 dias"],["90","Últimos 90 dias"],["month","Este mês"],["lastmonth","Mês passado"]].map(([k,l])=>`<option value="${k}" ${k===per?"selected":""}>${l}</option>`).join("")}</select>
      <span class="note">${list.length} demanda(s) finalizada(s)</span></div>
    <div style="overflow-x:auto"><table><thead><tr>
      <th style="width:32px"><input type="checkbox" id="hAll" data-ids="${list.map(i=>i.id).join(",")}" ${allOn?"checked":""}></th>
      <th>Demanda</th><th>Cadastro</th><th>Finalização</th><th class="hide-sm">Duração</th><th class="hide-sm">Atualizações</th></tr></thead>
    <tbody>${list.map(it => `<tr class="click" data-open="${it.id}">
      <td><input type="checkbox" data-sel="${it.id}" ${S.selected.has(it.id)?"checked":""}></td>
      <td class="t">${esc(it.titulo)}${it.descricao?`<div class="sub">${esc(it.descricao.slice(0,120))}${it.descricao.length>120?"…":""}</div>`:""}</td>
      <td>${fmt(it.criado_em)}</td><td>${fmt(it.finalizado_em)}</td>
      <td class="hide-sm">${it.finalizado_em?dur(it.criado_em,it.finalizado_em):"—"}</td>
      <td class="hide-sm">${(it.historico||[]).filter(h=>h.tipo==="nota").length}</td></tr>`).join("")
      || `<tr><td colspan="6" class="empty">Nenhuma demanda finalizada neste período.</td></tr>`}</tbody></table></div>`;
  $("#hPeriod").onchange = e => { v.dataset.per = e.target.value; renderFinalizadas(); };
  $("#hAll").onchange = e => { (e.target.dataset.ids||"").split(",").filter(Boolean).forEach(id => e.target.checked ? S.selected.add(id) : S.selected.delete(id)); renderAll(); };
}

/* ---------- lote ---------- */
function renderBatch(){
  const bar = $("#batch");
  const ids = [...S.selected].filter(id => getD(id));
  if (!ids.length || !["kanban","finalizadas"].includes(S.view)){ bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  const inHist = S.view === "finalizadas";
  const opts = COLS.map(c => `<option value="${c.key}">${esc(c.label)}</option>`).join("");
  const others = isAdmin() ? S.perfis.filter(p => p.id !== S.space && p.ativo) : [];
  bar.innerHTML = `<b>${ids.length} selecionada(s)</b>
    <select id="bMove"><option value="">${inHist?"Reabrir em…":"Mover para…"}</option>${opts}</select>
    ${inHist ? "" : `<button class="btn sm ok" data-act="bfin">✓ Finalizar</button>`}
    <button class="btn sm" data-act="bnote">💬 Atualização</button>
    ${others.length ? `<select id="bTransf"><option value="">Passar para…</option>${others.map(p=>`<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select>` : ""}
    <button class="btn sm danger" data-act="bdel">Excluir</button>
    <button class="btn sm ghost" data-act="bclear" style="color:#c9cfdb">Limpar</button>`;
  $("#bMove").onchange = async e => {
    const to = e.target.value; if (!to) return;
    const list = [...S.selected]; S.selected.clear();
    for (const id of list) await moveD(id, to);
    toast(`${list.length} movida(s) para "${colLabel(to)}".`); renderAll();
  };
  const tr = $("#bTransf");
  if (tr) tr.onchange = e => {
    const to = e.target.value; if (!to) return;
    const list = [...S.selected], p = perfil(to);
    confirmBox(`Passar ${list.length} demanda(s) para ${p.nome}?`, "Elas saem deste espaço e vão para o kanban dessa pessoa, com o histórico.", "Passar", async () => {
      S.selected.clear(); for (const id of list) await transferD(id, to); toast(`Passada(s) para ${p.nome}.`);
    }, "ok");
    e.target.value = "";
  };
}

/* ---------- eventos do quadro ---------- */
document.addEventListener("click", async e => {
  if (!["kanban","finalizadas"].includes(S.view) && !e.target.closest("#batch")) return;
  const sel = e.target.closest("[data-sel]");
  if (sel){ e.stopPropagation(); const id = sel.dataset.sel; sel.checked ? S.selected.add(id) : S.selected.delete(id); renderAll(); return; }
  const act = e.target.closest("[data-act]");
  if (act){
    const a = act.dataset.act;
    if (a==="inl"){ K.inlineAdd = act.dataset.col; renderKanban(); return; }
    if (a==="inlcancel"){ K.inlineAdd = null; renderKanban(); return; }
    if (a==="inlsave"){ saveInline(); return; }
    if (a==="newD"){ openNewDemanda(); return; }
    if (a==="cols"){ openColsEditor(); return; }
    if (a==="bclear"){ S.selected.clear(); renderAll(); return; }
    if (a==="bfin"){ const list=[...S.selected]; S.selected.clear(); for (const id of list) await moveD(id, FIN); toast(`${list.length} finalizada(s).`); renderAll(); return; }
    if (a==="bdel"){ const list=[...S.selected]; confirmBox(`Excluir ${list.length} demanda(s)?`, "Elas serão apagadas de vez, junto com o histórico.", "Excluir", async () => { for (const id of list) await deleteD(id); toast("Excluída(s)."); }); return; }
    if (a==="bnote"){ batchNote(); return; }
  }
  const card = e.target.closest(".card[data-id]"); if (card){ openDemanda(card.dataset.id); return; }
  const row = e.target.closest("tr[data-open]"); if (row){ openDemanda(row.dataset.open); return; }
});
function saveInline(){
  const t = $("#inl"); if (!t) return;
  const v = t.value.trim(), col = K.inlineAdd; if (!v){ t.focus(); return; }
  const linhas = v.split("\n"), titulo = linhas.shift().trim(), resto = linhas.join("\n").trim();
  createDemanda({titulo, descricao:resto, status:col});
  setTimeout(() => { const n = $("#inl"); if (n){ n.value = ""; n.focus(); } }, 0);
}
document.addEventListener("keydown", e => {
  if (e.target.id === "inl"){
    if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); saveInline(); }
    if (e.key === "Escape"){ K.inlineAdd = null; renderKanban(); }
  }
});
let dragId = null;
document.addEventListener("dragstart", e => {
  const c = e.target.closest && e.target.closest(".card[data-id]"); if (!c) return;
  dragId = c.dataset.id; c.classList.add("dragging");
  try { e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; } catch {}
});
document.addEventListener("dragend", () => { dragId = null; $$(".dragging,.drop").forEach(x => x.classList.remove("dragging","drop")); });
document.addEventListener("dragover", e => {
  const col = e.target.closest && e.target.closest(".col"); if (!col || !dragId) return;
  e.preventDefault(); $$(".col.drop").forEach(x => x !== col && x.classList.remove("drop")); col.classList.add("drop");
});
document.addEventListener("drop", e => {
  const col = e.target.closest && e.target.closest(".col"); if (!col || !dragId) return;
  e.preventDefault();
  const ids = S.selected.has(dragId) ? [...S.selected] : [dragId];
  if (S.selected.has(dragId)) S.selected.clear();
  ids.forEach(id => moveD(id, col.dataset.col));
});

/* ---------- modal: nova demanda ---------- */
function donoSelectHtml(id, sel){
  if (!isAdmin()) return "";
  return `<div class="section"><label class="f">Espaço de</label><select class="fld" id="${id}">${S.perfis.filter(p=>p.ativo||p.id===sel).map(p=>`<option value="${p.id}" ${p.id===sel?"selected":""}>${esc(p.nome)}${p.id===S.me.id?" (eu)":""}</option>`).join("")}</select></div>`;
}
function openNewDemanda(pre = {}){
  const ov = overlay(`<div class="mhead"><div class="mt">Nova demanda</div><button class="x" data-close>×</button></div>
    <form class="mbody" id="newForm">
      <label class="f">Título</label><input class="fld" id="nT" required placeholder="Ex.: Inclusão de dependente na Unimed" value="${esc(pre.titulo||"")}">
      <div class="section"><label class="f">Descrição (opcional)</label><textarea class="fld" id="nD" placeholder="Detalhes, contato, número do pedido…"></textarea></div>
      <div class="grid3 section">
        <div><label class="f">Quadro</label><select class="fld" id="nS">${COLS.map(c=>`<option value="${c.key}" ${c.key===firstMain()?"selected":""}>${esc(c.label)}</option>`).join("")}</select></div>
        <div><label class="f">Prazo</label><input class="fld" type="date" id="nP" value="${esc(pre.prazo||"")}"></div>
        <div><label class="f">Prioridade</label><select class="fld" id="nR"><option value="normal">Normal</option><option value="alta">Alta</option></select></div>
      </div>
      ${donoSelectHtml("nO", S.space)}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Cadastrar</button></div>
    </form>`, "mid");
  $("#nT").focus();
  $("#newForm").addEventListener("submit", e => {
    e.preventDefault();
    const t = $("#nT").value.trim(); if (!t) return;
    const dono = $("#nO") ? $("#nO").value : S.space;
    createDemanda({titulo:t, descricao:$("#nD").value, status:$("#nS").value, prazo:$("#nP").value||null, prioridade:$("#nR").value, dono});
    closeModal(true); toast(dono === S.space ? "Demanda cadastrada." : `Demanda cadastrada no espaço de ${perfil(dono).nome}.`);
  });
}
function batchNote(){
  const list = [...S.selected];
  overlay(`<div class="mhead"><div class="mt">Atualização em ${list.length} demanda(s)</div><button class="x" data-close>×</button></div>
    <div class="mbody"><textarea class="fld" id="bnT" placeholder="Ex.: Cobrei retorno do fornecedor por e-mail." style="min-height:90px"></textarea>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="bnOk">Registrar</button></div></div>`, "small");
  $("#bnT").focus();
  $("#bnOk").onclick = async () => {
    const v = $("#bnT").value.trim(); if (!v) return;
    closeModal(true); S.selected.clear();
    for (const id of list) await addNoteD(id, v);
    toast("Atualização registrada."); renderAll();
  };
}

/* ---------- modal: detalhe ---------- */
function pillsHtml(it){
  return COLS.map(c => `<button class="pill ${it.status===c.key?"on":""}" data-move="${c.key}"><span class="dot" style="background:${c.color}"></span>${esc(c.label)}</button>`).join("")
    + `<button class="pill fin ${it.status===FIN?"on":""}" data-move="${FIN}">✓ Finalizado</button>`;
}
function datesHtml(it){
  return `<div><b>Cadastro</b>${fmt(it.criado_em)}</div><div><b>Última modificação</b>${fmt(it.atualizado_em)}</div>
    <div><b>Finalização</b>${it.finalizado_em?fmt(it.finalizado_em):"—"}</div>
    ${it.finalizado_em?`<div><b>Duração</b>${dur(it.criado_em,it.finalizado_em)}</div>`:`<div><b>Em aberto</b>${dur(it.criado_em,Date.now())}</div>`}`;
}
const TL_TIPO = {criado:"Cadastro",status:"Mudança de status",final:"Finalização",nota:"Atualização",edicao:"Edição",check:"Checklist"};
function timelineHtml(it){
  return [...(it.historico||[])].sort((a,z) => z.em-a.em).map(x => {
    const por = x.por ? ` · por ${esc(x.por)}` : "";
    const editado = x.editadoEm ? ` · <i>editada em ${fmt(x.editadoEm)}</i>` : "";
    if (x.tipo==="nota" && K.editingNote===x.em){
      return `<li class="nota"><div class="tl-when">${fmt(x.em)} · Atualização</div>
        <textarea class="fld" id="neT" style="margin-top:4px">${esc(x.texto)}</textarea>
        <div style="display:flex;gap:6px;margin-top:6px"><button class="btn primary sm" data-nsave="${x.em}">Salvar</button><button class="btn ghost sm" data-ncancel>Cancelar</button></div></li>`;
    }
    const acts = x.tipo==="nota" ? ` <span class="nacts"><button class="lnk" data-nedit="${x.em}">editar</button> · <button class="lnk del" data-ndel="${x.em}">excluir</button></span>` : "";
    return `<li class="${x.tipo}"><div class="tl-when">${fmt(x.em)} · ${TL_TIPO[x.tipo]||""}${por}${editado}${acts}</div><div class="tl-what">${esc(x.texto)}</div></li>`;
  }).join("");
}
function checklistHtml(it){
  const cl = it.checklist||[], done = cl.filter(c=>c.feito).length, pct = cl.length ? Math.round(done*100/cl.length) : 0;
  return `${cl.length?`<div class="ckprog"><div class="ckbar"><span style="width:${pct}%"></span></div><span>${done} de ${cl.length} concluído(s)</span></div>`:""}
    <ul class="cklist">${cl.map((c,i) => `<li class="${c.feito?"done":""}">
      <input type="checkbox" data-ck="${c.id}" ${c.feito?"checked":""}>
      <input class="ckt" data-ckt="${c.id}" value="${esc(c.texto)}" title="${c.feitoEm?"Concluído em "+fmt(c.feitoEm):"Clique para editar"}">
      ${c.feitoEm?`<span class="ckwhen">${fmtD(c.feitoEm)}</span>`:""}
      <button class="ckb" data-ckmv="${c.id}|-1" title="Subir" ${i===0?"disabled":""}>↑</button>
      <button class="ckb" data-ckmv="${c.id}|1" title="Descer" ${i===cl.length-1?"disabled":""}>↓</button>
      <button class="ckb del" data-ckdel="${c.id}" title="Remover passo">×</button></li>`).join("")}</ul>
    <div class="upd" style="margin-top:6px"><input class="fld" id="ckNew" placeholder="Adicionar passo… (Enter)"><button class="btn sm" data-ckadd style="white-space:nowrap">＋ Passo</button></div>`;
}
function footHtml(it){
  const others = isAdmin() ? S.perfis.filter(p => p.id !== it.dono && p.ativo) : [];
  return `<button class="btn danger" data-del>Excluir</button>
    <button class="btn" data-agendar title="Criar uma missão na agenda ligada a esta demanda">📅 Agendar</button>
    ${others.length ? `<select class="fld" id="dTransf" style="width:auto"><option value="">Passar para…</option>${others.map(p=>`<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select>` : ""}
    <div class="spacer"></div>
    <button class="btn" data-close>Fechar</button>
    <button class="btn primary hidden" id="dSave">Salvar alterações</button>
    ${it.status!==FIN?`<button class="btn ok" data-move="${FIN}">✓ Finalizar</button>`:`<button class="btn" data-move="${firstMain()}">↺ Reabrir</button>`}`;
}
function openDemanda(id){
  const it = getD(id); if (!it) return;
  K.openId = id; K.dirty = false; K.editingNote = null;
  const ov = overlay(`<div class="mhead"><input class="title" id="dT" value="${esc(it.titulo)}"><button class="x" data-close>×</button></div>
  <div class="mbody">
    <div class="statuspills" id="pills">${pillsHtml(it)}</div>
    <label class="f">Descrição</label>
    <textarea class="fld" id="dD" placeholder="Sem descrição">${esc(it.descricao||"")}</textarea>
    <div class="grid2" style="margin-top:12px">
      <div><label class="f">Prazo</label><input class="fld" type="date" id="dP" value="${esc(it.prazo||"")}"></div>
      <div><label class="f">Prioridade</label><select class="fld" id="dR"><option value="normal" ${it.prioridade!=="alta"?"selected":""}>Normal</option><option value="alta" ${it.prioridade==="alta"?"selected":""}>Alta</option></select></div>
    </div>
    <div class="dates" id="dates">${datesHtml(it)}</div>
    <div class="section"><h3>✅ Checklist / passo a passo</h3><div id="ck">${checklistHtml(it)}</div></div>
    <div class="section"><h3>💬 Nova atualização / andamento</h3>
      <div class="upd"><textarea class="fld" id="dN" placeholder="O que aconteceu? (Ctrl+Enter para registrar)"></textarea><button class="btn primary" id="dNok">Registrar</button></div></div>
    <div class="section"><h3>🕓 Histórico</h3><ul class="timeline" id="tl">${timelineHtml(it)}</ul></div>
  </div>
  <div class="mfoot" id="mfoot">${footHtml(it)}</div>`, "", {
    dirty: () => K.dirty,
    onClose: () => { K.openId = null; K.dirty = false; K.editingNote = null; },
  });
  wireDemandaFoot();
  const cur = () => getD(K.openId);
  const tl = () => { const t = $("#tl"); if (t && cur()) t.innerHTML = timelineHtml(cur()); };
  const ck = (f) => { const c = $("#ck"); if (c && cur()){ c.innerHTML = checklistHtml(cur()); if (f) $("#ckNew").focus(); } };
  const ckAdd = () => { const v = $("#ckNew").value.trim(); if (!v) return; updateD(K.openId, it => { it.checklist.push({id:uuid(), texto:v, feito:false, em:Date.now(), feitoEm:null}); }); ck(true); };

  ov.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("[data-ckadd]")){ ckAdd(); return; }
    const c1 = t.closest("[data-ck]");
    if (c1){ const cid = c1.dataset.ck, feito = c1.checked, item = (cur().checklist||[]).find(c=>c.id===cid); if (!item) return;
      updateD(K.openId, it => { const c = it.checklist.find(x=>x.id===cid); c.feito = feito; c.feitoEm = feito ? Date.now() : null;
        it.historico.push(actorTag({tipo:"check", em:Date.now(), texto:(feito?"Passo concluído: ":"Passo reaberto: ")+item.texto})); });
      ck(); tl(); return; }
    const c2 = t.closest("[data-ckdel]"); if (c2){ const cid = c2.dataset.ckdel; updateD(K.openId, it => { it.checklist = it.checklist.filter(x=>x.id!==cid); }); ck(); return; }
    const c3 = t.closest("[data-ckmv]"); if (c3){ const [cid,dir] = c3.dataset.ckmv.split("|"); updateD(K.openId, it => { const cl = it.checklist, i = cl.findIndex(x=>x.id===cid), j = i+(+dir); if (i<0||j<0||j>=cl.length) return false; [cl[i],cl[j]] = [cl[j],cl[i]]; }); ck(); return; }
    const ne = t.closest("[data-nedit]"); if (ne){ K.editingNote = +ne.dataset.nedit; tl(); const x = $("#neT"); x.focus(); x.setSelectionRange(x.value.length, x.value.length); return; }
    if (t.closest("[data-ncancel]")){ K.editingNote = null; tl(); return; }
    const ns = t.closest("[data-nsave]");
    if (ns){ const v = $("#neT").value.trim(); if (!v){ toast("A atualização não pode ficar vazia."); return; }
      const em = +ns.dataset.nsave; K.editingNote = null;
      updateD(K.openId, it => { const n = it.historico.find(h=>h.tipo==="nota"&&h.em===em); if (!n || n.texto===v) return false; n.texto = v; n.editadoEm = Date.now(); });
      tl(); toast("Atualização editada."); return; }
    const nd = t.closest("[data-ndel]");
    if (nd){ const em = +nd.dataset.ndel, id = K.openId;
      confirmBox("Excluir esta atualização?", "Ela sai do histórico (fica registrado que foi excluída).", "Excluir", () => {
        updateD(id, it => { const n = it.historico.find(h=>h.tipo==="nota"&&h.em===em); if (!n) return false;
          it.historico = it.historico.filter(h=>h!==n);
          it.historico.push(actorTag({tipo:"edicao", em:Date.now(), texto:`Atualização de ${fmt(em)} excluída: "${n.texto.length>80?n.texto.slice(0,80)+"…":n.texto}"`})); });
        tl(); toast("Atualização excluída."); });
      return; }
    const m = t.closest("[data-move]");
    if (m){ const to = m.dataset.move; if (!cur() || cur().status===to) return;
      moveD(K.openId, to);
      if (to===FIN){ toast("Demanda finalizada — está em Finalizadas."); closeModal(true); }
      else { toast(`Movida para "${colLabel(to)}".`); refreshDemandaModal(); }
    }
  });
  ov.addEventListener("keydown", e => {
    if (e.target.id==="ckNew" && e.key==="Enter"){ e.preventDefault(); ckAdd(); }
    if (e.target.dataset && e.target.dataset.ckt!==undefined && e.key==="Enter"){ e.preventDefault(); e.target.blur(); }
    if (e.target.id==="dT" && e.key==="Enter"){ e.preventDefault(); saveDemandaEdits(); }
    if (e.target.id==="dN" && e.key==="Enter" && (e.ctrlKey||e.metaKey)){ e.preventDefault(); $("#dNok").click(); }
  });
  ov.addEventListener("change", e => {
    const cid = e.target.dataset && e.target.dataset.ckt; if (cid===undefined) return;
    const v = e.target.value.trim(); if (!v){ ck(); return; }
    updateD(K.openId, it => { const c = it.checklist.find(x=>x.id===cid); if (!c || c.texto===v) return false; c.texto = v; });
  });
  ["#dT","#dD","#dP","#dR"].forEach(s => $(s).addEventListener("input", () => { K.dirty = true; $("#dSave").classList.remove("hidden"); }));
  $("#dNok").onclick = () => { const v = $("#dN").value.trim(); if (!v) return; addNoteD(K.openId, v); $("#dN").value = ""; tl(); refreshDemandaModal(); toast("Atualização registrada."); };
}
function wireDemandaFoot(){
  $$("#mfoot [data-close]").forEach(b => b.onclick = () => closeModal());
  const del = $("#mfoot [data-del]");
  if (del) del.onclick = () => { const id = K.openId, it = getD(id);
    confirmBox("Excluir esta demanda?", `"${it.titulo}" será apagada de vez, junto com o histórico.`, "Excluir", async () => { closeModal(true); await deleteD(id); toast("Demanda excluída."); }); };
  const ag = $("#mfoot [data-agendar]");
  if (ag) ag.onclick = () => { const it = getD(K.openId); closeModal(true); openEvento(null, {tipo:"missao", titulo:it.titulo, data:it.prazo||todayYmd(), dono:it.dono}); };
  const tr = $("#dTransf");
  if (tr) tr.onchange = e => { const to = e.target.value; if (!to) return; const id = K.openId, p = perfil(to);
    confirmBox(`Passar para ${p.nome}?`, "A demanda sai deste espaço e vai para o kanban dessa pessoa, com todo o histórico.", "Passar", async () => { closeModal(true); await transferD(id, to); toast(`Passada para ${p.nome}.`); }, "ok");
    e.target.value = ""; };
  const save = $("#dSave"); if (save){ save.classList.toggle("hidden", !K.dirty); save.onclick = saveDemandaEdits; }
}
function saveDemandaEdits(){
  const t = $("#dT").value.trim(); if (!t){ toast("O título não pode ficar vazio."); return; }
  editD(K.openId, {titulo:t, descricao:$("#dD").value.trim(), prazo:$("#dP").value||null, prioridade:$("#dR").value});
  K.dirty = false; $("#dSave").classList.add("hidden"); toast("Alterações salvas.");
}
function refreshDemandaModal(){
  const it = getD(K.openId); if (!it){ closeModal(true); return; }
  const set = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };
  set("#pills", pillsHtml(it)); set("#dates", datesHtml(it));
  if (K.editingNote === null) set("#tl", timelineHtml(it));
  const ck = $("#ck"); if (ck && !ck.contains(document.activeElement)) ck.innerHTML = checklistHtml(it);
  const f = $("#mfoot"); if (f){ f.innerHTML = footHtml(it); wireDemandaFoot(); }
  if (!K.dirty){
    const sv = (s,v) => { const el = $(s); if (el && document.activeElement !== el) el.value = v; };
    sv("#dT", it.titulo); sv("#dD", it.descricao||""); sv("#dP", it.prazo||""); sv("#dR", it.prioridade||"normal");
  }
}

/* ---------- editor de quadros (admin) ---------- */
function openColsEditor(){
  let list = COLS.map(c => ({...c}));
  const counts = {};
  const draw = () => {
    $("#colList").innerHTML = list.map((c, i) => `<div class="colrow" data-i="${i}">
      <input type="color" value="${c.color}" data-cf="color" title="Cor do quadro">
      <input class="fld" value="${esc(c.label)}" data-cf="label" placeholder="Nome do quadro">
      <select class="fld" data-cf="lado"><option value="principal" ${c.lado!=="lateral"?"selected":""}>Área principal</option><option value="lateral" ${c.lado==="lateral"?"selected":""}>Coluna lateral</option></select>
      <div class="acts"><button class="ckb" data-cm="-1" ${i===0?"disabled":""} title="Subir">↑</button><button class="ckb" data-cm="1" ${i===list.length-1?"disabled":""} title="Descer">↓</button>
      <button class="ckb del" data-cdel title="Excluir quadro${counts[c.key]?` (tem ${counts[c.key]} demanda(s))`:""}">×</button></div></div>`).join("");
  };
  const ov = overlay(`<div class="mhead"><div class="mt">⚙ Quadros do kanban</div><button class="x" data-close>×</button></div>
    <div class="mbody">
      <p class="note" style="margin:0 0 10px">Os quadros valem para toda a equipe. Renomeie, mude a cor, a ordem e onde aparecem. "Coluna lateral" empilha o quadro na primeira coluna (como Ideias, Rascunhos e Stand by).</p>
      <div id="colList"></div>
      <button class="btn sm" id="colAdd" style="margin-top:10px">＋ Novo quadro</button>
      <div class="err" id="colErr" style="margin-top:10px"></div>
    </div>
    <div class="mfoot"><span class="note">"Finalizado" é fixo e fica na aba Finalizadas.</span><div class="spacer"></div><button class="btn" data-close>Cancelar</button><button class="btn primary" id="colSave">Salvar quadros</button></div>`, "mid", { dirty: () => true });
  draw();
  API.rpc("contar_por_status").then(r => { (r||[]).forEach(x => counts[x.status] = +x.total); draw(); }).catch(() => {});
  ov.addEventListener("input", e => { const f = e.target.dataset.cf; if (!f) return; const i = +e.target.closest("[data-i]").dataset.i; list[i][f] = e.target.value; });
  ov.addEventListener("change", e => { const f = e.target.dataset.cf; if (!f) return; const i = +e.target.closest("[data-i]").dataset.i; list[i][f] = e.target.value; });
  ov.addEventListener("click", e => {
    const row = e.target.closest("[data-i]"); const i = row ? +row.dataset.i : -1;
    const mv = e.target.closest("[data-cm]");
    if (mv){ const j = i + (+mv.dataset.cm); if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; draw(); return; }
    if (e.target.closest("[data-cdel]")){
      const c = list[i], n = counts[c.key] || 0;
      if (n){ $("#colErr").textContent = `"${c.label}" tem ${n} demanda(s) (somando toda a equipe). Mova essas demandas para outro quadro antes de excluir.`; return; }
      if (list.length <= 1){ $("#colErr").textContent = "Precisa existir pelo menos um quadro."; return; }
      list.splice(i, 1); draw(); return;
    }
  });
  $("#colAdd").onclick = () => { list.push({ key: "q_" + Math.random().toString(36).slice(2, 8), label: "Novo quadro", color: CORES[list.length % CORES.length], lado: "principal" }); draw();
    const ins = $$("#colList [data-cf=label]"); const last = ins[ins.length-1]; last.focus(); last.select(); };
  $("#colSave").onclick = async () => {
    const err = $("#colErr"); err.textContent = "";
    list.forEach(c => c.label = (c.label||"").trim());
    if (list.some(c => !c.label)){ err.textContent = "Todo quadro precisa de um nome."; return; }
    if (!list.some(c => c.lado !== "lateral")){ err.textContent = "Deixe pelo menos um quadro na área principal."; return; }
    $("#colSave").disabled = true;
    try { await API.setConfig("colunas", list); setCols(list); closeModal(true); renderAll(); toast("Quadros atualizados para toda a equipe."); }
    catch(ex){ err.textContent = errMsg(ex); $("#colSave").disabled = false; }
  };
}
