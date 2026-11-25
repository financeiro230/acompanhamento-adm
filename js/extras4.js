/* ===================== ATUALIZAÇÃO 14: histórico detalhado, passos atribuídos, atualizações, chat, tempo real, relatório ===================== */
"use strict";

/* ---------- histórico: o que mudou e quem mudou ---------- */
const fmtCampo = (k, v) => {
  if (v == null || v === "") return "vazio";
  if (["prazo", "data", "data_fim", "recorrencia_ate"].includes(k)) return fmtYmd(v, { day: "2-digit", month: "2-digit", year: "numeric" });
  if (k === "prioridade") return prioKey(v) ? PRIO[prioKey(v)].l : "sem prioridade";
  const t = String(v); return t.length > 50 ? t.slice(0, 50) + "…" : t;
};
function difCampo(k, nome, de, para){
  if (k === "descricao") return "a descrição";
  if (k === "cor") return "a cor";
  return `${nome}: "${fmtCampo(k, de)}" → "${fmtCampo(k, para)}"`;
}
function difChecklist(a, b){
  const ps = [], A = a || [], B = b || [];
  for (const c of B){ const o = A.find(x => x.id === c.id);
    if (!o){ ps.push(`passo adicionado "${c.texto}"`); continue; }
    if (o.texto !== c.texto) ps.push(`passo renomeado "${o.texto}" → "${c.texto}"`);
    if (!!o.feito !== !!c.feito) ps.push(`${c.feito ? "concluiu" : "reabriu"} o passo "${c.texto}"`);
    if ((o.prazo || "") !== (c.prazo || "")) ps.push(`prazo do passo "${c.texto}": ${fmtCampo("prazo", o.prazo)} → ${fmtCampo("prazo", c.prazo)}`);
    const ra = o.resp || [], rb = c.resp || [];
    rb.filter(x => !ra.includes(x)).forEach(x => ps.push(`passo "${c.texto}" atribuído a ${nomeDe(x)}`));
    ra.filter(x => !rb.includes(x)).forEach(x => ps.push(`${nomeDe(x)} saiu do passo "${c.texto}"`));
  }
  for (const o of A) if (!B.find(x => x.id === o.id)) ps.push(`passo excluído "${o.texto}"`);
  return ps;
}
function difEvento(ev, b){
  const ps = [], cmp = (k, l) => { if ((ev[k] || "") !== (b[k] || "")) ps.push(difCampo(k, l, ev[k], b[k])); };
  cmp("titulo", "título"); cmp("data", "data"); cmp("data_fim", "até / prazo final");
  const h1 = `${hm(ev.hora_inicio) || "sem horário"}${ev.hora_fim ? "–" + hm(ev.hora_fim) : ""}`, h2 = `${hm(b.hora_inicio) || "sem horário"}${b.hora_fim ? "–" + hm(b.hora_fim) : ""}`;
  if (h1 !== h2) ps.push(`horário: ${h1} → ${h2}`);
  cmp("local", "local"); cmp("descricao", ""); cmp("prioridade", "prioridade");
  if ((ev.recorrencia || "nenhuma") !== (b.recorrencia || "nenhuma") || (ev.recorrencia_ate || "") !== (b.recorrencia_ate || "")
    || JSON.stringify(ev.rec_dias || []) !== JSON.stringify(b.rec_dias || []) || JSON.stringify(ev.rec_datas || []) !== JSON.stringify(b.rec_datas || [])) ps.push("a repetição");
  if ((ev.cor || "") !== (b.cor || "")) ps.push("a cor");
  ps.push(...difChecklist(ev.checklist, b.checklist));
  return ps.length ? "Alterou " + ps.join("; ") : "Salvou sem mudanças";
}

/* ---------- responsáveis por passo do checklist ---------- */
const RESP = { aberto: null };
const corDe = id => ((S.nomes || []).find(p => p.id === id) || pessoa(id) || {}).cor || "#8a94a6";
function respBtn(c, attr){
  const r = c.resp || [];
  return `<button type="button" class="ckb ckresp ${r.length ? "on" : ""}" ${attr}="${c.id}" title="${r.length ? "Responsável: " + esc(r.map(nomeDe).join(", ")) : "Atribuir este passo a alguém"}">${r.length ? r.slice(0, 3).map(u => `<span class="mini-av" style="background:${corDe(u)}">${esc(initials(nomeDe(u)))}</span>`).join("") : "👤"}</button>`;
}
function respPainel(c, attr){
  if (RESP.aberto !== c.id) return "";
  const r = c.resp || [];
  return `<div class="resppan"><div class="note" style="margin-bottom:4px">Atribuir o passo <b>${esc(c.texto)}</b> a:</div>
    <div class="who">${(S.nomes || []).map(p => `<label><input type="checkbox" ${attr}="${c.id}|${p.id}" ${r.includes(p.id) ? "checked" : ""}><span class="mini-av" style="background:${p.cor}">${esc(initials(p.nome))}</span>${esc(p.nome)}${p.id === S.me.id ? " (eu)" : ""}</label>`).join("")}</div>
    <div class="note" style="margin-top:4px">Quem você marcar recebe este passo como missão na própria agenda (no prazo do passo) e um aviso em 🔔, mesmo sem estar na demanda.</div></div>`;
}

/* ---------- passos atribuídos a mim ---------- */
async function loadMeusPassos(){ try { S.meusPassos = await API.rpc("meus_passos", {}); } catch { S.meusPassos = S.meusPassos || []; } }
function openPassoA(chave){
  const [origem, ref, pid] = chave.split("~");
  const pa = (S.meusPassos || []).find(x => x.origem === origem && x.ref_id === ref && x.passo_id === pid);
  if (!pa){ toast("Esse passo não está mais com você.", true); return; }
  const dt = pa.prazo || pa.data_ref;
  overlay(`<div class="mhead"><div class="mt">🎯 Passo atribuído a você</div><button class="x" data-close>×</button></div>
    <div class="mbody"><div style="font-size:17px;font-weight:600;margin-bottom:6px">${esc(pa.texto)}</div>
      <p class="note" style="margin:0">De <b>${esc(pa.dono_nome)}</b> · ${origem === "demanda" ? "demanda" : "compromisso"} <b>${esc(pa.titulo)}</b>${dt ? ` · prazo ${fmtYmd(dt, { day: "2-digit", month: "2-digit", year: "numeric" })}` : ""}</p>
      <label class="chk" style="margin-top:14px;font-size:15px"><input type="checkbox" id="paOk" ${pa.feito ? "checked" : ""}> Passo concluído</label>
      <p class="note">Ao concluir, ${esc(pa.dono_nome)} vê no histórico que foi você.</p>
      <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn" data-close>Fechar</button></div></div>`, "small");
  $("#paOk").onchange = async e => {
    try { await API.rpc("passo_marcar", { p_origem: origem, p_id: ref, p_passo: pid, p_feito: e.target.checked });
      pa.feito = e.target.checked; toast(pa.feito ? "Passo concluído." : "Passo reaberto."); closeModal(true); await loadMeusPassos(); renderAll(); }
    catch(ex){ toast(errMsg(ex), true); e.target.checked = !e.target.checked; }
  };
}

/* ---------- membro vendo o espaço de outro (só visualizar) ---------- */
const soLeitura = () => S.me && !isAdmin() && S.space && S.space !== S.me.id;
// main.js carrega depois deste arquivo: as trocas abaixo só são feitas quando todos os scripts já rodaram
document.addEventListener("DOMContentLoaded", function(){
  const _persist = window.persist, _remove = window.remove, _reload = window.reloadSpace, _header = window.renderHeader;
  window.persist = function(t, row){
    if (soLeitura() && !(t === "demandas" && (row.participantes || []).includes(S.me.id))){ toast(`Você está só visualizando o espaço de ${spaceName()}. A alteração não foi salva.`, true); setTimeout(() => _reload(false), 300); return Promise.resolve(); }
    RT.meus.set(row.id, Date.now()); return _persist(t, row);
  };
  window.remove = function(t, id){ if (soLeitura()){ toast("Você está só visualizando este espaço.", true); return Promise.resolve(); } RT.meus.set(id, Date.now()); return _remove(t, id); };
  window.reloadSpace = async function(a){ if (S.me && isOwnSpace()) await loadMeusPassos(); return _reload(a); };
  window.renderHeader = function(){
    _header();
    const sel = $("#spaceSel"); if (!sel || !S.me) return;
    if (!isAdmin()){
      const outros = S.perfis.filter(p => p.id !== S.me.id && p.ativo);
      sel.style.display = outros.length ? "" : "none";
      sel.innerHTML = !outros.length ? "" : [S.me, ...outros].map(p => `<option value="${p.id}" ${p.id === S.space ? "selected" : ""}>${p.id === S.me.id ? "👤 Meu espaço" : "👁 " + esc(p.nome)}</option>`).join("");
      const b = $("#spaceBanner"); if (soLeitura() && b) b.querySelector("span").innerHTML = `👁 Você está <b>só visualizando</b> o espaço de <b>${esc(spaceName())}</b>.`;
    } else sel.style.display = "";
  };
});

/* ---------- 🔔 atualizações para você ---------- */
const NT = { lista: [], aberto: false };
async function loadNotifs(){ try { NT.lista = await API.notifs(S.me.id); } catch { NT.lista = NT.lista || []; } notifBadge(); }
function notifBadge(){
  const n = NT.lista.filter(x => !x.lida_em).length, b = $("#notifBadge");
  if (b){ b.hidden = !n; b.textContent = n > 99 ? "99+" : n; }
  tituloAba();
}
function tituloAba(){ const n = NT.lista.filter(x => !x.lida_em).length + (CH.naoLidas || 0); document.title = (n ? `(${n}) ` : "") + "Acompanhamento ADM"; }
const NT_IC = { demanda: "📋", compartilhada: "👥", agenda: "📅", passo: "☑", atualizacao: "💬" };
function notifQuando(t){ const d = new Date(t), min = Math.round((Date.now() - d) / 60000); if (min < 1) return "agora"; if (min < 60) return `há ${min} min`; if (min < 1440) return `há ${Math.round(min / 60)} h`; return fmt(d.getTime()); }
function openNotifs(){
  const pend = NT.lista.filter(x => !x.lida_em), lidas = NT.lista.filter(x => x.lida_em).slice(0, 30);
  const item = x => `<button class="ntit ${x.lida_em ? "" : "nova"}" data-nt="${x.id}"><span class="ntic">${NT_IC[x.tipo] || "🔔"}</span>
    <span class="ntx"><b>${esc(x.titulo)}</b>${x.corpo ? `<span class="ntc">${esc(x.corpo)}</span>` : ""}<span class="note">${notifQuando(x.criado_em)}</span></span>${x.lida_em ? "" : `<span class="ntdot"></span>`}</button>`;
  overlay(`<div class="mhead"><div class="mt">🔔 Atualizações para você</div><button class="x" data-close>×</button></div>
    <div class="mbody ntbody">${pend.length ? `<div class="nsec">Novas (${pend.length}) — somem daqui quando você abrir</div>${pend.map(item).join("")}` : `<p class="note" style="margin:0 0 8px">Nada novo por enquanto. ✨</p>`}
      ${lidas.length ? `<div class="nsec" style="margin-top:12px">Já vistas</div>${lidas.map(item).join("")}` : ""}</div>`, "mid");
  $(".ntbody").addEventListener("click", async e => {
    const b = e.target.closest("[data-nt]"); if (!b) return;
    const n = NT.lista.find(x => String(x.id) === b.dataset.nt); if (!n) return;
    if (!n.lida_em){ n.lida_em = new Date().toISOString(); notifBadge(); API.notifLer(n.id).catch(() => {}); }
    closeModal(true); abrirRef(n);
  });
}
async function abrirRef(n){
  if (!n.ref_id) return;
  if (n.tipo === "passo"){ await loadMeusPassos(); const pa = (S.meusPassos || []).find(x => x.ref_id === n.ref_id && !x.feito);
    if (pa){ openPassoA(`${pa.origem}~${pa.ref_id}~${pa.passo_id}`); return; } }
  if (!isOwnSpace()){ await setSpace(S.me.id); } else await reloadSpace(false);
  if (n.ref_tipo === "demanda"){ if (getD(n.ref_id)){ setView("kanban"); openDemanda(n.ref_id); } else toast("Essa demanda não está mais com você (pode ter sido excluída ou finalizada).", true); }
  else if (n.ref_tipo === "evento"){ if (getE(n.ref_id)){ setView("agenda"); openEventoPeek(n.ref_id); } else toast("Esse compromisso não está mais na sua agenda.", true); }
}

/* ---------- 💬 chat ---------- */
const CH = { aberto: false, conv: "geral", msgs: [], recentes: [], lidos: {}, naoLidas: 0 };
const convDe = outro => outro ? "dm:" + [S.me.id, outro].sort().join(":") : "geral";
const convNome = c => { if (c === "geral") return "👥 Equipe (todos)"; const ids = c.slice(3).split(":"); const o = ids.filter(x => x !== S.me.id); return o.length === 1 ? nomeDe(o[0]) : ids.map(nomeDe).join(" ↔ "); };
const souParte = c => c === "geral" || c.includes(S.me.id);
async function loadChat(){
  try { const [r, l] = await Promise.all([API.chatRecentes(), API.chatLidos()]); CH.recentes = r; CH.lidos = {}; l.forEach(x => CH.lidos[x.conversa] = x.ate); } catch { CH.recentes = CH.recentes || []; }
  chatBadge();
}
const naoLidasDe = c => CH.recentes.filter(m => m.conversa === c && m.de !== S.me.id && (!CH.lidos[c] || m.criado_em > CH.lidos[c])).length;
function chatBadge(){
  const convs = [...new Set(CH.recentes.map(m => m.conversa))].filter(souParte);
  CH.naoLidas = convs.reduce((s, c) => s + naoLidasDe(c), 0);
  const b = $("#chatBadge"); if (b){ b.hidden = !CH.naoLidas; b.textContent = CH.naoLidas > 99 ? "99+" : CH.naoLidas; }
  tituloAba();
}
function chatListaHtml(){
  const ult = c => CH.recentes.find(m => m.conversa === c);
  const pessoas = (S.nomes || []).filter(p => p.id !== S.me.id);
  const linha = (c, nome, cor) => { const u = ult(c), n = naoLidasDe(c);
    return `<button class="chc ${CH.conv === c ? "on" : ""}" data-chc="${c}"><span class="avatar" style="background:${cor}">${c === "geral" ? "👥" : esc(initials(nome))}</span>
      <span class="chcx"><b>${esc(nome)}</b><span class="note">${u ? esc((u.de === S.me.id ? "Você: " : "") + u.texto).slice(0, 60) : "Nenhuma mensagem"}</span></span>${n ? `<b class="hbadge st">${n}</b>` : ""}</button>`; };
  const ordem = pessoas.map(p => ({ p, c: convDe(p.id) })).sort((a, z) => ((ult(z.c) || {}).criado_em || "").localeCompare((ult(a.c) || {}).criado_em || "") || a.p.nome.localeCompare(z.p.nome));
  const sup = adminTotal() ? [...new Set(CH.recentes.map(m => m.conversa))].filter(c => !souParte(c)) : [];
  return linha("geral", "Equipe (todos)", "var(--accent)") + ordem.map(x => linha(x.c, x.p.nome, x.p.cor)).join("")
    + (sup.length ? `<div class="nsec" style="padding:10px 10px 4px">👁 Conversas entre membros</div>` + sup.map(c => linha(c, convNome(c), "#8a94a6")).join("") : "");
}
function chatMsgsHtml(){
  let dia = "";
  return CH.msgs.map(m => { const d = m.criado_em.slice(0, 10), eu = m.de === S.me.id; let sep = "";
    if (d !== dia){ dia = d; sep = `<div class="chdia">${new Date(m.criado_em).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</div>`; }
    return sep + `<div class="chm ${eu ? "eu" : ""}" data-chm="${m.id}">${!eu ? `<div class="chq" style="color:${corDe(m.de)}">${esc(nomeDe(m.de))}</div>` : ""}<div class="cht">${linkify(m.texto)}</div>
      <div class="chh">${new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${eu ? ` <button class="chdel" data-chdel="${m.id}" title="Apagar">🗑</button>` : ""}</div></div>`; }).join("")
    || `<p class="note" style="text-align:center;margin-top:30px">Nenhuma mensagem ainda. Diga oi! 👋</p>`;
}
function chatRender(){
  const p = $("#chatPan"); if (!p) return;
  const so = !souParte(CH.conv);
  p.innerHTML = `<div class="chhead"><b>💬 Chat</b><button class="x" data-chx title="Fechar">×</button></div>
    <div class="chwrap ${CH.mob ? "mob" : ""}"><div class="chlist">${chatListaHtml()}</div>
      <div class="chconv"><div class="chtop"><button class="btn ghost sm chback" data-chback>‹</button><b>${esc(convNome(CH.conv))}</b>${so ? `<span class="note"> · só leitura</span>` : ""}</div>
        <div class="chmsgs" id="chMsgs">${chatMsgsHtml()}</div>
        ${so ? `<p class="note" style="padding:8px 12px;margin:0">Você está acompanhando esta conversa como ADM master.</p>` : `<div class="chsend"><textarea class="fld" id="chIn" rows="1" placeholder="Escreva… (Enter envia, Shift+Enter quebra linha)"></textarea><button class="btn primary" data-chsend>Enviar</button></div>`}</div></div>`;
  const box = $("#chMsgs"); box.scrollTop = box.scrollHeight;
  const i = $("#chIn"); if (i && !matchMedia("(max-width:700px)").matches) i.focus();
}
async function chatAbrirConv(c, mostrar = true){
  CH.conv = c; CH.mob = mostrar; CH.msgs = [];
  chatRender();
  try { CH.msgs = await API.chatConversa(c); } catch(e){ toast(errMsg(e), true); }
  chatRender(); chatMarcar();
}
function chatMarcar(){ if (!CH.aberto || !souParte(CH.conv)) return; CH.lidos[CH.conv] = new Date().toISOString(); chatBadge(); API.chatMarcar(S.me.id, CH.conv).catch(() => {}); }
function chatToggle(abrir){
  CH.aberto = abrir == null ? !CH.aberto : abrir;
  let p = $("#chatPan");
  if (!CH.aberto){ if (p) p.remove(); return; }
  if (!p){ p = document.createElement("aside"); p.id = "chatPan"; p.className = "chatpan"; document.body.appendChild(p); }
  chatAbrirConv(CH.conv, false);
}
async function chatEnviar(){
  const i = $("#chIn"); const v = (i.value || "").trim(); if (!v) return;
  const para = CH.conv === "geral" ? null : CH.conv.slice(3).split(":").find(x => x !== S.me.id);
  i.value = ""; i.style.height = "";
  try { const m = await API.chatEnviar({ conversa: CH.conv, de: S.me.id, para, texto: v });
    if (!CH.msgs.find(x => x.id === m.id)){ CH.msgs.push(m); CH.recentes.unshift(m); } chatRender(); chatMarcar(); }
  catch(e){ toast("Não foi possível enviar: " + errMsg(e), true); i.value = v; }
}
document.addEventListener("click", e => {
  const t = e.target;
  if (t.closest("#chatBtn")){ chatToggle(); return; }
  if (t.closest("#notifBtn")){ openNotifs(); return; }
  if (!t.closest("#chatPan")) return;
  if (t.closest("[data-chx]")){ chatToggle(false); return; }
  if (t.closest("[data-chback]")){ CH.mob = false; chatRender(); return; }
  const c = t.closest("[data-chc]"); if (c){ chatAbrirConv(c.dataset.chc); return; }
  if (t.closest("[data-chsend]")){ chatEnviar(); return; }
  const d = t.closest("[data-chdel]"); if (d){ const id = d.dataset.chdel; confirmBox("Apagar esta mensagem?", "Ela some para todos.", "Apagar", async () => {
    try { await API.chatApagar(id); CH.msgs = CH.msgs.filter(m => m.id !== id); CH.recentes = CH.recentes.filter(m => m.id !== id); chatRender(); } catch(ex){ toast(errMsg(ex), true); } }); }
});
document.addEventListener("keydown", e => {
  if (e.target.id === "chIn" && e.key === "Enter" && !e.shiftKey){ e.preventDefault(); chatEnviar(); }
});
document.addEventListener("input", e => { if (e.target.id === "chIn"){ e.target.style.height = "auto"; e.target.style.height = Math.min(140, e.target.scrollHeight) + "px"; } });

/* ---------- tempo real ---------- */
const RT = { parar: null, meus: new Map(), pend: false, timer: null };
function rtIniciar(){
  if (RT.parar) RT.parar();
  if (!API.canal || !S.me) return;
  RT.parar = API.canal("rt-" + S.me.id + "-" + Date.now(), [
    { table: "demandas" }, { table: "eventos" }, { table: "notas" },
    { table: "notificacoes", filter: `para=eq.${S.me.id}` }, { table: "chat_mensagens" },
  ], rtEvento);
}
function rtEvento(tab, p){
  const row = p.new && Object.keys(p.new).length ? p.new : p.old || {};
  if (tab === "notificacoes"){
    if (p.eventType === "INSERT"){ NT.lista.unshift(p.new); notifBadge(); toast(`${NT_IC[p.new.tipo] || "🔔"} ${p.new.titulo}`); }
    return;
  }
  if (tab === "chat_mensagens"){
    if (p.eventType === "INSERT"){
      const m = p.new; if (CH.recentes.find(x => x.id === m.id)) return;
      CH.recentes.unshift(m);
      if (CH.aberto && CH.conv === m.conversa){ CH.msgs.push(m); chatRender(); chatMarcar(); }
      else { chatBadge(); if (m.de !== S.me.id && souParte(m.conversa)) toast(`💬 ${nomeDe(m.de)}: ${m.texto.slice(0, 80)}`); if (CH.aberto) chatRender(); }
    } else if (p.eventType === "DELETE"){ CH.recentes = CH.recentes.filter(x => x.id !== row.id); CH.msgs = CH.msgs.filter(x => x.id !== row.id); if (CH.aberto) chatRender(); chatBadge(); }
    return;
  }
  // dados: recarrega só se não fui eu que acabei de salvar
  const t0 = RT.meus.get(row.id); if (t0 && Date.now() - t0 < 5000) return;
  const meu = tab === "notas" ? (row.dono === S.me.id || (row.membros || []).includes(S.me.id) || (S.notas || []).some(n => n.id === row.id))
    : (row.dono === S.space || (row.participantes || []).includes(S.space) || (tab === "demandas" ? !!getD(row.id) : !!getE(row.id)));
  if (!meu && !(tab !== "notas" && isOwnSpace())) return;
  if (tab === "notas"){ N.loaded = false; if (S.view === "notas" && !modalOpen()) renderNotas(); return; }
  clearTimeout(RT.timer); RT.timer = setTimeout(rtAplicar, 700);
}
function rtAplicar(){ if (modalOpen() || document.querySelector(".kcard.dragging")){ RT.pend = true; return; } RT.pend = false; reloadSpace(false); }
setInterval(() => { if (RT.pend && S.me && !modalOpen()) rtAplicar(); }, 2000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.me){ loadNotifs(); loadChat(); } });
async function iniciar14(){ await Promise.all([loadNotifs(), loadChat(), loadMeusPassos()]); rtIniciar(); }

/* ---------- 📄 relatório em PDF ---------- */
function openRelatorio(){
  const hoje = todayYmd(), ini = hoje.slice(0, 8) + "01", adm = isAdmin();
  overlay(`<div class="mhead"><div class="mt">📄 Relatório em PDF</div><button class="x" data-close>×</button></div>
    <div class="mbody">
      <div class="grid2"><div><label class="f">De</label><input class="fld" type="date" id="rlDe" value="${ini}"></div><div><label class="f">Até</label><input class="fld" type="date" id="rlAte" value="${hoje}"></div></div>
      <div class="rlrap">${[["mes","Este mês"],["sem","Últimos 7 dias"],["30","Últimos 30 dias"],["ant","Mês passado"]].map(([k,l]) => `<button type="button" class="nlabel" data-rlr="${k}">${l}</button>`).join("")}</div>
      <label class="f" style="margin-top:10px">De quem</label>
      <select class="fld" id="rlEsc"><option value="${S.me.id}">👤 Só eu</option>${!isOwnSpace() ? `<option value="${S.space}" selected>👁 ${esc(spaceName())}</option>` : ""}${adm ? `<option value="todos">👥 Equipe toda</option>` : ""}</select>
      <label class="f" style="margin-top:10px">O que entra</label>
      <div class="ctshare">
        <label class="chk"><input type="checkbox" data-rls="pend" checked> ⏳ Tudo que está pendente</label>
        <label class="chk"><input type="checkbox" data-rls="fin" checked> ✅ Tudo que foi finalizado no período</label>
        <label class="chk"><input type="checkbox" data-rls="novo" checked> 🆕 Tudo que foi adicionado no período</label>
        <label class="chk"><input type="checkbox" data-rls="atu" checked> 💬 Tudo que foi atualizado no período (inclusive demandas mais antigas)</label>
        <label class="chk"><input type="checkbox" id="rlAg" checked> 🎯 Incluir as missões da agenda</label>
      </div>
      <p class="note">O relatório abre numa nova aba pronto para imprimir. Na janela de impressão escolha <b>Salvar como PDF</b>.</p>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="rlOk">Gerar relatório</button></div>
    </div>`, "small");
  $(".mbody .rlrap").addEventListener("click", e => { const b = e.target.closest("[data-rlr]"); if (!b) return; const d = new Date(); let a, z = todayYmd();
    if (b.dataset.rlr === "mes") a = z.slice(0, 8) + "01";
    if (b.dataset.rlr === "sem") a = ymd(addDays(d, -6));
    if (b.dataset.rlr === "30") a = ymd(addDays(d, -29));
    if (b.dataset.rlr === "ant"){ const p = new Date(d.getFullYear(), d.getMonth() - 1, 1); a = ymd(p); z = ymd(new Date(d.getFullYear(), d.getMonth(), 0)); }
    $("#rlDe").value = a; $("#rlAte").value = z; });
  $("#rlOk").onclick = async () => {
    const de = $("#rlDe").value, ate = $("#rlAte").value; if (!de || !ate || ate < de){ toast("Confira as datas.", true); return; }
    const sec = $$("[data-rls]").filter(c => c.checked).map(c => c.dataset.rls); if (!sec.length){ toast("Marque pelo menos uma parte.", true); return; }
    const esc_ = $("#rlEsc").value, ag = $("#rlAg").checked;
    const w = window.open("", "_blank"); if (!w){ toast("O navegador bloqueou a nova aba. Libere pop-ups para este site.", true); return; }
    w.document.write("<p style='font-family:sans-serif;padding:20px'>Gerando relatório…</p>");
    $("#rlOk").disabled = true;
    try {
      const [dem, evs] = await Promise.all([esc_ === "todos" ? API.list("demandas") : API.list("demandas", esc_), ag ? (esc_ === "todos" ? API.list("eventos") : API.list("eventos", esc_)) : []]);
      const html = relHtml({ de, ate, sec, escopo: esc_ === "todos" ? "Equipe toda" : nomeDe(esc_), equipe: esc_ === "todos", dem, evs: evs.filter(e => e.tipo === "missao") });
      w.document.open(); w.document.write(html); w.document.close(); closeModal(true);
      setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 600);
    } catch(e){ w.close(); toast("Não foi possível gerar: " + errMsg(e), true); $("#rlOk").disabled = false; }
  };
}
function relHtml(o){
  const t0 = parseYmd(o.de).getTime(), t1 = addDays(parseYmd(o.ate), 1).getTime(), noP = ms => ms >= t0 && ms < t1;
  const x = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dBR = s => s ? fmtYmd(s, { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
  const msBR = ms => ms ? new Date(+ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const lbl = (dono, k) => k === FIN ? "Finalizada" : (typeof bkLbl === "function" ? bkLbl(dono, k) : k);
  const upds = h => (h || []).filter(u => u.tipo !== "criado" && noP(+u.em)).sort((a, z) => a.em - z.em);
  const linhaD = (d, comUpd) => { const us = comUpd ? upds(d.historico) : [], ck = d.checklist || [];
    return `<tr><td class="ti"><b>${x(d.titulo)}</b>${d.descricao ? `<div class="ds">${x(d.descricao.slice(0, 220))}${d.descricao.length > 220 ? "…" : ""}</div>` : ""}${(d.participantes || []).length ? `<div class="ds">👥 com ${x(d.participantes.map(nomeDe).join(", "))}</div>` : ""}</td>
      ${o.equipe ? `<td>${x(nomeDe(d.dono))}</td>` : ""}<td>${x(lbl(d.dono, d.status))}</td><td>${prioKey(d.prioridade) ? PRIO[prioKey(d.prioridade)].l : "—"}</td>
      <td class="${d.prazo && d.prazo < todayYmd() && d.status !== FIN ? "late" : ""}">${dBR(d.prazo)}</td><td>${msBR(d.criado_em)}</td><td>${d.finalizado_em ? msBR(d.finalizado_em) : "—"}</td>
      <td>${ck.length ? `${ck.filter(c => c.feito).length}/${ck.length}` : "—"}</td></tr>
      ${us.length ? `<tr class="up"><td colspan="${o.equipe ? 8 : 7}"><ul>${us.map(u => `<li><span class="uw">${msBR(u.em)}${u.por ? " · " + x(u.por) : ""}</span> ${u.tipo === "nota" ? "💬 " : ""}${x(u.texto)}</li>`).join("")}</ul></td></tr>` : ""}`; };
  const tabD = (titulo, ic, lista, comUpd, nota) => lista.length ? `<h2>${ic} ${titulo} <span>${lista.length}</span></h2>${nota ? `<p class="nt">${nota}</p>` : ""}
    <table><thead><tr><th>Demanda</th>${o.equipe ? "<th>Pessoa</th>" : ""}<th>Quadro</th><th>Prior.</th><th>Prazo</th><th>Criada</th><th>Finalizada</th><th>Passos</th></tr></thead>
    <tbody>${lista.sort((a, z) => (o.equipe ? nomeDe(a.dono).localeCompare(nomeDe(z.dono)) : 0) || String(a.prazo || "9").localeCompare(String(z.prazo || "9"))).map(d => linhaD(d, comUpd)).join("")}</tbody></table>` : `<h2>${ic} ${titulo} <span>0</span></h2><p class="nt">Nada neste período.</p>`;
  const pend = o.dem.filter(d => d.status !== FIN), fin = o.dem.filter(d => d.finalizado_em && noP(+d.finalizado_em)),
    novo = o.dem.filter(d => noP(+d.criado_em)), atu = o.dem.filter(d => +d.criado_em < t0 && upds(d.historico).length);
  const ev = o.evs, evPend = ev.filter(e => (!e.recorrencia || e.recorrencia === "nenhuma") && !e.concluida && e.data <= o.ate),
    evFin = ev.filter(e => e.concluida_em && noP(+e.concluida_em)), evNovo = ev.filter(e => noP(+e.criado_em));
  const tabE = (titulo, lista) => lista.length ? `<h3>${titulo} <span>${lista.length}</span></h3><table><thead><tr><th>Missão</th>${o.equipe ? "<th>Pessoa</th>" : ""}<th>Dia</th><th>Prazo final</th><th>Situação</th></tr></thead><tbody>${lista.sort((a, z) => a.data.localeCompare(z.data)).map(e => `<tr><td class="ti"><b>${x(e.titulo)}</b>${e.grupo ? ` <span class="ds">(compartilhada)</span>` : ""}</td>${o.equipe ? `<td>${x(nomeDe(e.dono))}</td>` : ""}<td>${dBR(e.data)}</td><td>${dBR(e.data_fim)}</td><td>${e.concluida ? "✓ Concluída " + msBR(e.concluida_em) : (e.data < todayYmd() ? '<span class="late">Atrasada</span>' : "Pendente")}</td></tr>`).join("")}</tbody></table>` : "";
  const card = (n, l) => `<div class="cd"><b>${n}</b><span>${l}</span></div>`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório ${dBR(o.de)} a ${dBR(o.ate)} — ${x(o.escopo)}</title><style>
    @page{size:A4;margin:11mm 10mm}*{box-sizing:border-box}body{font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif;color:#1f2430;font-size:9.6pt;margin:0;line-height:1.35}
    header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #2f5bea;padding-bottom:6px;margin-bottom:8px}
    h1{font-size:15pt;margin:0;color:#1d3fb8}header .m{font-size:8.5pt;color:#5b6475;text-align:right}
    .cds{display:flex;gap:6px;margin:6px 0 4px}.cd{flex:1;border:1px solid #dfe3ec;border-radius:6px;padding:5px 8px;background:#f6f8fc}.cd b{display:block;font-size:14pt;color:#1d3fb8}.cd span{font-size:8pt;color:#5b6475}
    h2{font-size:11pt;margin:12px 0 4px;padding:3px 6px;background:#eef2fd;border-left:3px solid #2f5bea;border-radius:3px;page-break-after:avoid}h2 span,h3 span{font-weight:600;color:#5b6475;font-size:9pt;margin-left:4px}
    h3{font-size:10pt;margin:8px 0 3px}.nt{margin:2px 0 4px;color:#5b6475;font-size:8.5pt}
    table{width:100%;border-collapse:collapse;margin-bottom:4px}th{background:#f1f3f8;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.02em;color:#4a5264;padding:3px 5px;border-bottom:1px solid #d5dae5}
    td{padding:3px 5px;border-bottom:1px solid #eceff5;vertical-align:top;font-size:9pt}tr{page-break-inside:avoid}td.ti{width:38%}.ds{color:#5b6475;font-size:8.3pt;margin-top:1px}
    tr.up td{background:#fafbfe;border-bottom:1px solid #e3e7f0;padding:2px 5px 4px 14px}tr.up ul{margin:0;padding-left:12px}tr.up li{font-size:8.4pt;margin:1px 0}.uw{color:#2f5bea;font-weight:600;font-size:8pt}
    .late{color:#c62828;font-weight:600}footer{margin-top:10px;font-size:7.8pt;color:#8a93a5;text-align:center}
    @media screen{body{max-width:900px;margin:20px auto;padding:0 16px}}
  </style></head><body>
    <header><div><h1>Relatório de demandas</h1><div style="font-size:10pt;margin-top:2px"><b>${dBR(o.de)} a ${dBR(o.ate)}</b> · ${x(o.escopo)}</div></div>
      <div class="m">Acompanhamento ADM · Unigames<br>Gerado por ${x(S.me.nome)} em ${new Date().toLocaleString("pt-BR")}</div></header>
    <div class="cds">${o.sec.includes("pend") ? card(pend.length, "pendentes") : ""}${o.sec.includes("fin") ? card(fin.length, "finalizadas no período") : ""}${o.sec.includes("novo") ? card(novo.length, "adicionadas no período") : ""}${o.sec.includes("atu") ? card(atu.length, "antigas com atualização no período") : ""}${o.evs.length ? card(evFin.length + "/" + (evPend.length + evFin.length), "missões concluídas") : ""}</div>
    ${o.sec.includes("pend") ? tabD("Pendentes", "⏳", pend, true, "Situação atual. Abaixo de cada uma, o que foi registrado no período.") : ""}
    ${o.sec.includes("fin") ? tabD("Finalizadas no período", "✅", fin, true) : ""}
    ${o.sec.includes("novo") ? tabD("Adicionadas no período", "🆕", novo, false) : ""}
    ${o.sec.includes("atu") ? tabD("Demandas anteriores ao período com atualizações", "💬", atu, true, "Criadas antes de " + dBR(o.de) + "; abaixo, as atualizações feitas dentro do período.") : ""}
    ${o.evs.length ? `<h2>🎯 Missões da agenda</h2>${o.sec.includes("pend") ? tabE("Pendentes", evPend) : ""}${o.sec.includes("fin") ? tabE("Concluídas no período", evFin) : ""}${o.sec.includes("novo") ? tabE("Criadas no período", evNovo) : ""}` : ""}
    <footer>Acompanhamento ADM — relatório gerado automaticamente</footer></body></html>`;
}

/* ===== atualização 15: rolagem lateral (direita/esquerda) também no computador =====
   Setas ‹ › aparecem sobre qualquer faixa que não cabe na tela (abas do topo, colunas do kanban,
   finalizadas…). Também: roda do mouse rola as abas para o lado e dá para "arrastar" o quadro do kanban. */
const HS = { itens: new Map() };
function hsAlvos(){
  return [...document.querySelectorAll("header .tabs, .board:not(.mob), .hscroll")].filter(e => e.offsetParent !== null);
}
function hsSetas(el){
  let o = HS.itens.get(el);
  if (o) return o;
  const mk = (lado, txt) => { const b = document.createElement("button"); b.type = "button"; b.className = "hsarr " + lado; b.textContent = txt;
    b.title = lado === "l" ? "Rolar para a esquerda" : "Rolar para a direita";
    b.addEventListener("click", e => { e.stopPropagation(); const passo = Math.max(160, el.clientWidth * 0.7);
      el.scrollBy({ left: lado === "l" ? -passo : passo, behavior: "smooth" }); });
    document.body.appendChild(b); return b; };
  o = { l: mk("l", "‹"), r: mk("r", "›") };
  HS.itens.set(el, o);
  el.addEventListener("scroll", hsAgendar, { passive: true });
  if (el.matches("header .tabs")) el.addEventListener("wheel", e => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth){ el.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  if (el.matches(".board")) hsArrastar(el);
  return o;
}
function hsArrastar(el){
  let ini = null;
  el.addEventListener("mousedown", e => {
    if (e.button !== 0 || el.scrollWidth <= el.clientWidth + 2) return;
    if (e.target.closest(".card,button,input,textarea,select,a,label,[draggable=true],[contenteditable]")) return;
    ini = { x: e.clientX, s: el.scrollLeft, mov: false };
  });
  window.addEventListener("mousemove", e => {
    if (!ini) return; const dx = e.clientX - ini.x;
    if (!ini.mov && Math.abs(dx) < 6) return;
    ini.mov = true; el.classList.add("hs-grab"); el.scrollLeft = ini.s - dx;
  });
  window.addEventListener("mouseup", () => { if (ini){ el.classList.remove("hs-grab"); ini = null; } });
}
function hsAtualizar(){
  HS.raf = 0;
  for (const [el, o] of HS.itens){
    if (!el.isConnected || el.offsetParent === null){ o.l.classList.remove("on"); o.r.classList.remove("on");
      if (!el.isConnected){ o.l.remove(); o.r.remove(); HS.itens.delete(el); } continue; }
    const r = el.getBoundingClientRect(), vh = window.innerHeight;
    const top = Math.max(r.top, el.matches("header .tabs") ? r.top : 60), bot = Math.min(r.bottom, vh);
    const sobra = el.scrollWidth - el.clientWidth;
    const visivel = bot - top > 24 && !document.querySelector("#modalRoot .overlay");
    const cy = el.matches("header .tabs") ? r.top + r.height / 2 : top + (bot - top) / 2;
    const tam = el.matches("header .tabs") ? 26 : 34;
    for (const [b, lado] of [[o.l, "l"], [o.r, "r"]]){
      const mostra = visivel && sobra > 4 && (lado === "l" ? el.scrollLeft > 4 : el.scrollLeft < sobra - 4);
      b.classList.toggle("on", mostra);
      if (!mostra) continue;
      b.style.position = "fixed"; b.style.zIndex = el.matches("header .tabs") ? 25 : 15; b.style.width = b.style.height = tam + "px";
      b.style.top = cy + "px"; b.style.left = lado === "l" ? (r.left + 2) + "px" : (r.right - tam - 2) + "px"; b.style.right = "auto";
    }
  }
}
function hsAgendar(){ if (!HS.raf) HS.raf = requestAnimationFrame(hsAtualizar); }
function hsVarrer(){
  hsAlvos().forEach(hsSetas);
  const tabs = document.querySelector("header .tabs"), on = tabs && tabs.querySelector(".tab.on");
  if (on && on !== HS.ultimaAba){ HS.ultimaAba = on;
    const r = on.getBoundingClientRect(), t = tabs.getBoundingClientRect();
    if (r.left < t.left || r.right > t.right) tabs.scrollLeft += (r.left - t.left) - (t.width - r.width) / 2; }
  hsAgendar();
}
document.addEventListener("DOMContentLoaded", () => {
  window.addEventListener("resize", hsAgendar); window.addEventListener("scroll", hsAgendar, true);
  new MutationObserver(() => { clearTimeout(HS.mt); HS.mt = setTimeout(hsVarrer, 120); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  setTimeout(hsVarrer, 500);
});
