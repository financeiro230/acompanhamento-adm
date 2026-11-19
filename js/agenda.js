/* ===================== AGENDA ===================== */
"use strict";

const A = { mode: (window.innerWidth < 700 ? "dia" : "semana"), cursor: new Date(), filt: { evento:true, missao:true, prazo:true, google:true }, scrollKey: null };
const WD = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const REC = { nenhuma:"Não repete", diaria:"Todo dia", dias_uteis:"Dias úteis (seg a sex)", semanal:"Toda semana", dias_semana:"Escolher dias da semana…", mensal:"Todo mês", anual:"Todo ano", datas:"Escolher datas específicas…" };
const getE = id => S.eventos.find(e => e.id === id) || (S.atribuidas || []).find(e => e.id === id);
const toMin = t => { if (!t) return null; const [h,m] = t.split(":").map(Number); return h*60+m; };
const minToHm = m => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
const showDoneMissions = () => A.filt.concl !== undefined ? A.filt.concl : prefs().agConcluidas !== false;
const defColor = tipo => tipo === "missao" ? prefs().corMissao : tipo === "prazo" ? prefs().corPrazo : prefs().corEvento;

/* ---------- recorrência ---------- */
function occurrences(ev, from, to){
  const res = [];
  if (ev.recorrencia === "nenhuma" || !ev.recorrencia){
    const end = ev.tipo !== "missao" && ev.data_fim && ev.data_fim > ev.data ? ev.data_fim : ev.data;
    let d = parseYmd(ev.data > from ? ev.data : from); const last = end < to ? end : to;
    while (ymd(d) <= last){ res.push(ymd(d)); d = addDays(d, 1); }
    return res;
  }
  if (ev.recorrencia === "datas"){
    return [...new Set([ev.data, ...(ev.rec_datas || [])])].filter(x => x >= from && x <= to).sort();
  }
  const dias = (ev.rec_dias || []).map(Number);
  const d0 = parseYmd(ev.data);
  const until = ev.recorrencia_ate && ev.recorrencia_ate < to ? ev.recorrencia_ate : to;
  let d = parseYmd(ev.data > from ? ev.data : from);
  while (ymd(d) <= until){
    const w = d.getDay();
    const ok = ev.recorrencia === "diaria" ? true
      : ev.recorrencia === "dias_uteis" ? (w >= 1 && w <= 5)
      : ev.recorrencia === "semanal" ? w === d0.getDay()
      : ev.recorrencia === "dias_semana" ? dias.includes(w)
      : ev.recorrencia === "mensal" ? d.getDate() === d0.getDate()
      : ev.recorrencia === "anual" ? (d.getDate() === d0.getDate() && d.getMonth() === d0.getMonth()) : false;
    if (ok) res.push(ymd(d));
    d = addDays(d, 1);
  }
  return res;
}
const isDone = (ev, date) => (ev.recorrencia && ev.recorrencia !== "nenhuma") ? (ev.concluidas||[]).includes(date) : !!ev.concluida;

function instances(from, to){
  const out = [], today = todayYmd(), nowMin = new Date().getHours()*60 + new Date().getMinutes();
  for (const ev of S.eventos){
    if (!A.filt[ev.tipo]) continue;
    const prazoMissao = ev.tipo === "missao" && ev.recorrencia === "nenhuma" && ev.data_fim && ev.data_fim > ev.data ? ev.data_fim : null;
    for (const date of occurrences(ev, from, to)){
      const multi = ev.tipo !== "missao" && ev.recorrencia === "nenhuma" && ev.data_fim && ev.data_fim > ev.data;
      const allDay = !ev.hora_inicio || multi;
      const start = allDay ? null : toMin(ev.hora_inicio);
      let end = allDay ? null : (ev.hora_fim ? toMin(ev.hora_fim) : start + (ev.tipo === "missao" ? 30 : 60));
      if (!allDay && end <= start) end = start + 30;
      const done = ev.tipo === "missao" && isDone(ev, date);
      if (done && !showDoneMissions()) continue;
      const late = ev.tipo === "missao" && !done && (prazoMissao ? prazoMissao < today
        : (date < today || (date === today && !allDay && (end ?? 0) < nowMin)));
      out.push({ key:`e|${ev.id}|${date}`, kind:ev.tipo, id:ev.id, date, allDay, start, end, title:ev.titulo,
        color: ev.cor || defColor(ev.tipo), done, late, rec: ev.recorrencia !== "nenhuma", local: ev.local, prazo: prazoMissao });
    }
    if (prazoMissao && A.filt.missao && prazoMissao >= from && prazoMissao <= to && !ev.concluida){
      out.push({ key:`e|${ev.id}|${ev.data}`, kind:"limite", id:ev.id, date:prazoMissao, allDay:true, start:null, end:null,
        title:ev.titulo, color: ev.cor || defColor("missao"), done:false, late: prazoMissao < today });
    }
  }
  if (A.filt.prazo){
    for (const d of S.demandas){
      if (!d.prazo || d.status === FIN || d.prazo < from || d.prazo > to) continue;
      out.push({ key:`d|${d.id}|${d.prazo}`, kind:"prazo", id:d.id, date:d.prazo, allDay:true, start:null, end:null,
        title:d.titulo, color:defColor("prazo"), done:false, late: d.prazo < today });
    }
  }
  if (A.filt.prazo){
    for (const d of S.demandas){
      if (d.status === FIN) continue;
      for (const c of (d.checklist || [])){
        if (c.feito || !c.prazo || c.prazo < from || c.prazo > to) continue;
        out.push({ key:`d|${d.id}|${c.prazo}`, kind:"passo", id:d.id, date:c.prazo, allDay:true, start:null, end:null,
          title:c.texto, sub:d.titulo, color:defColor("prazo"), done:false, late: c.prazo < today });
      }
    }
  }
  out.push(...gInstances(from, to));
  return out.sort((a,b) => a.date.localeCompare(b.date) || (a.allDay===b.allDay ? 0 : a.allDay ? -1 : 1) || (a.start??0)-(b.start??0) || a.title.localeCompare(b.title));
}
function lateList(){
  const today = todayYmd(), from = ymd(addDays(new Date(), -30)), yest = ymd(addDays(new Date(), -1));
  const seen = new Set();
  const late = instances(from, today).filter(i => i.late && i.kind !== "prazo" && i.kind !== "limite" && !(i.prazo && seen.has(i.id)) && (seen.add(i.id), true));
  const prazos = S.demandas.filter(d => d.prazo && d.status !== FIN && d.prazo < today)
    .map(d => ({ key:`d|${d.id}|${d.prazo}`, kind:"prazo", id:d.id, date:d.prazo, allDay:true, title:d.titulo, color:defColor("prazo"), late:true }));
  const passos = A.filt.prazo ? S.demandas.filter(d => d.status !== FIN).flatMap(d => (d.checklist||[]).filter(c => !c.feito && c.prazo && c.prazo < today)
    .map(c => ({ key:`d|${d.id}|${c.prazo}`, kind:"passo", id:d.id, date:c.prazo, allDay:true, title:c.texto, sub:d.titulo, color:defColor("prazo"), late:true }))) : [];
  return [...late, ...(A.filt.prazo ? prazos : []), ...passos].sort((a,b) => a.date.localeCompare(b.date));
}

/* ---------- ações ---------- */
function toggleDone(id, date){
  const cur = getE(id); if (!cur) return;
  if (cur.grupo && cur.conclusao_conjunta){
    const feito = !isDone(cur, date);
    if (cur.recorrencia !== "nenhuma") cur.concluidas = feito ? [...(cur.concluidas||[]), date] : (cur.concluidas||[]).filter(x => x !== date);
    else { cur.concluida = feito; cur.concluida_em = feito ? Date.now() : null; }
    renderAll(); toast(feito ? "Missão concluída para todos ✓" : "Missão reaberta para todos.");
    return API.rpc("grupo_concluir", { g: cur.grupo, p_data: date, p_feito: feito }).then(() => reloadSpace(false)).catch(e => { toast("Não foi possível concluir: " + errMsg(e), true); reloadSpace(false); });
  }
  const it = clone(cur), now = Date.now();
  it.historico = it.historico || []; it.concluidas = it.concluidas || [];
  let feito;
  if (it.recorrencia !== "nenhuma"){
    feito = !it.concluidas.includes(date);
    it.concluidas = feito ? [...it.concluidas, date] : it.concluidas.filter(x => x !== date);
    if (it.concluidas.length > 400) it.concluidas = it.concluidas.slice(-400);
  } else { feito = !it.concluida; it.concluida = feito; it.concluida_em = feito ? now : null; }
  it.historico.push(actorTag({tipo: feito ? "final" : "status", em:now, texto: (feito ? "Concluída" : "Reaberta") + (it.recorrencia !== "nenhuma" ? ` (ocorrência de ${fmtYmd(date)})` : "")}));
  it.atualizado_em = now;
  Object.assign(cur, it); renderAll();
  toast(feito ? "Missão concluída ✓" : "Missão reaberta.");
  return persist("eventos", it);
}

/* ---------- render ---------- */
function mobAgBar(){
  const c = A.cursor, today = todayYmd();
  if (A.mode === "lista") return `<div class="ag-bar mob"><button class="btn ghost sbtoggle" data-ag="side">☰</button><button class="btn" data-ag="mback">‹ Voltar para o dia</button><h2 class="mtitle">${A.mobLate ? "Atrasadas e próximos dias" : "Próximos dias"}</h2></div>`;
  const ws = weekStart(c), has = new Set(instances(ymd(ws), ymd(addDays(ws, 6))).filter(i => !i.done).map(i => i.date));
  const title = cap(c.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })).replace(/\./g, "");
  return `<div class="ag-bar mob">
      <button class="btn ghost sbtoggle" data-ag="side" title="Menu">☰</button>
      <button class="btn ghost nav" data-ag="prev" title="Dia anterior">‹</button>
      <h2 class="mtitle">${esc(title)}</h2>
      <button class="btn ghost nav" data-ag="next" title="Próximo dia">›</button>
      ${ymd(c) !== today ? `<button class="btn sm" data-ag="today">Hoje</button>` : ""}
      <button class="btn sm ghost" data-ag="concl" title="${showDoneMissions() ? "Ocultar concluídas" : "Mostrar concluídas"}">${showDoneMissions() ? "👁" : "🙈"}</button>
    </div>
    <div class="mstrip">${[...Array(7)].map((_, i) => { const d = addDays(ws, i), k = ymd(d);
      return `<button data-goto="${k}" class="${k === ymd(c) ? "on" : ""} ${k === today ? "today" : ""}"><small>${WD[d.getDay()].slice(0, 3)}</small><b>${d.getDate()}</b><i class="${has.has(k) ? "has" : ""}"></i></button>`; }).join("")}</div>`;
}
const isMob = () => window.matchMedia("(max-width:900px)").matches;
function renderAgenda(){
  const v = $("#v-agenda");
  const mob = isMob();
  if (mob) A.mode = A.mobList ? "lista" : "dia";
  v.classList.toggle("mob", mob);
  if (mob) document.documentElement.style.setProperty("--hdrh", ($("header").offsetHeight + ($("#spaceBanner").offsetHeight || 0)) + "px");
  v.innerHTML = `<aside class="ag-side ${prefs().sidebar===false?"closed":""} ${A.sideOpen?"open":""}" id="agSide"></aside><div class="ag-scrim" data-ag="side"></div>
    <div class="ag-main">
      ${mob ? mobAgBar() : `<div class="ag-bar">
        <button class="btn ghost sbtoggle" data-ag="side" title="Mostrar/esconder menu lateral">☰</button>
        <button class="btn primary" data-ag="new">＋ Criar</button>
        <button class="btn" data-ag="today">Hoje</button>
        <button class="btn ghost" data-ag="prev" title="Anterior">‹</button>
        <button class="btn ghost" data-ag="next" title="Próximo">›</button>
        <h2>${esc(cap(agTitle()))}</h2>
        <div class="spacer"></div>
        <button class="btn ${showDoneMissions() ? "" : "on-off"}" data-ag="concl" title="Mostrar ou esconder as missões já concluídas">${showDoneMissions() ? "👁 Ocultar concluídas" : "🙈 Mostrar concluídas"}</button>
        <button class="btn" data-ag="io" title="Exportar ou importar agenda">⇅ <span class="hide-sm">Exportar / importar</span></button>
        <div class="seg">${[["mes","Mês"],["semana","Semana"],["dia","Dia"],["lista","Lista"]].map(([k,l]) => `<button data-mode="${k}" class="${A.mode===k?"on":""}">${l}</button>`).join("")}</div>
      </div>`}
      <div class="ag-body" id="agBody"></div>
      ${mob ? `<button class="fab" data-ag="new" title="Criar compromisso">＋</button>` : ""}
    </div>`;
  renderSide();
  const body = $("#agBody");
  if (A.mode === "mes") body.innerHTML = monthHtml();
  else if (A.mode === "lista") body.innerHTML = listHtml();
  else {
    body.innerHTML = weekHtml(A.mode === "dia" ? 1 : 7);
    const key = A.mode + ymd(A.cursor);
    const allRow = body.querySelector(".wk-all"); const head = body.querySelector(".wk-head");
    if (allRow && head) allRow.style.top = (mob ? 0 : head.offsetHeight) + "px";
    const H7 = 7 * (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--hour")) || 48);
    if (A.scrollKey !== key){ A.scrollKey = key; A.lastScroll = H7; }
    body.scrollTop = A.lastScroll ?? H7;
  }
  if (mob && A.mode === "dia"){
    let sx = null, sy = 0;
    body.addEventListener("touchstart", e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    body.addEventListener("touchend", e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = null;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45){ A.cursor = addDays(A.cursor, dx < 0 ? 1 : -1); renderAgenda(); } }, { passive: true });
  }
  gEnsure();
  body.onscroll = () => { if (A.mode === "semana" || A.mode === "dia") A.lastScroll = body.scrollTop; };
}
function weekStart(d){ return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -d.getDay()); }
function agTitle(){
  const c = A.cursor;
  if (A.mode === "mes") return c.toLocaleDateString("pt-BR", {month:"long", year:"numeric"});
  if (A.mode === "dia") return c.toLocaleDateString("pt-BR", {weekday:"long", day:"numeric", month:"long"});
  if (A.mode === "lista") return "Programação";
  const s = weekStart(c), e = addDays(s, 6);
  const f = (d, o) => d.toLocaleDateString("pt-BR", o);
  return s.getMonth() === e.getMonth() ? `${s.getDate()} – ${f(e,{day:"numeric",month:"short",year:"numeric"})}` : `${f(s,{day:"numeric",month:"short"})} – ${f(e,{day:"numeric",month:"short",year:"numeric"})}`;
}

function renderSide(){
  const c = A.cursor, first = new Date(c.getFullYear(), c.getMonth(), 1), gs = weekStart(first);
  const today = todayYmd();
  const span = instances(ymd(gs), ymd(addDays(gs, 41)));
  const has = new Set(span.map(i => i.date));
  let selFrom = null, selTo = null;
  if (A.mode === "semana"){ selFrom = ymd(weekStart(c)); selTo = ymd(addDays(weekStart(c), 6)); }
  if (A.mode === "dia"){ selFrom = selTo = ymd(c); }
  let g = WD.map(w => `<span>${w[0]}</span>`).join("");
  for (let i = 0; i < 42; i++){
    const d = addDays(gs, i), k = ymd(d);
    const cls = [d.getMonth() !== c.getMonth() ? "out" : "", k === today ? "today" : "", (selFrom && k >= selFrom && k <= selTo && k !== today) ? "selr" : "", has.has(k) ? "has" : ""].join(" ");
    g += `<button class="${cls}" data-goto="${k}">${d.getDate()}</button>`;
  }
  const late = lateList().length;
  const hoje = instances(today, today).filter(i => !i.done).length;
  const sem = instances(ymd(addDays(new Date(),1)), ymd(addDays(new Date(),7))).filter(i => !i.done).length;
  $("#agSide").innerHTML = `
    <button class="btn primary big" data-ag="new" style="width:100%">＋ Criar</button>
    <div class="mini"><div class="mini-h"><button data-ag="mprev">‹</button><span>${cap(c.toLocaleDateString("pt-BR",{month:"long",year:"numeric"}))}</span><button data-ag="mnext">›</button></div>
      <div class="mini-g">${g}</div></div>
    <div class="sumbox"><h4>Resumo</h4>
      <button class="sum ${late?"late":""}" data-ag="golate"><span>⚠ Atrasadas</span><b>${late}</b></button>
      <button class="sum today" data-ag="gotoday"><span>📍 Hoje</span><b>${hoje}</b></button>
      <button class="sum" data-ag="golist"><span>🗓 Próximos 7 dias</span><b>${sem}</b></button>
    </div>
    ${canAssign() ? (() => { const ab = S.atribuidas.filter(e => !(e.recorrencia === "nenhuma" ? e.concluida : false)).length;
      return `<div class="sumbox"><h4>Equipe</h4><button class="sum" data-ag="atrib"><span>📤 Atribuídas por mim</span><b>${ab}</b></button></div>`; })() : ""}
    <div class="filt"><h4>Mostrar</h4>
      <label class="chk"><input type="checkbox" data-filt="evento" ${A.filt.evento?"checked":""}> <span class="dot" style="background:var(--c-evento)"></span> Eventos</label>
      <label class="chk"><input type="checkbox" data-filt="missao" ${A.filt.missao?"checked":""}> <span class="dot" style="background:var(--c-missao)"></span> Missões</label>
      <label class="chk"><input type="checkbox" data-filt="prazo" ${A.filt.prazo?"checked":""}> <span class="dot" style="background:var(--c-prazo)"></span> Prazos do kanban e passos</label>
      <label class="chk"><input type="checkbox" data-filt="concl" ${showDoneMissions()?"checked":""}> <span class="dot" style="background:var(--ok)"></span> Missões concluídas</label>
      ${gOn() && isOwnSpace() ? `<label class="chk"><input type="checkbox" data-filt="google" ${A.filt.google?"checked":""}> <span class="dot" style="background:${prefs().corGoogle||"#4285f4"}"></span> Google Agenda</label>` : ""}
    </div>
    ${gSideHtml()}
    ${isMob() ? `<button class="btn" data-ag="io" style="width:100%">⇅ Exportar / importar agenda</button>
    <p class="note">Dica: arraste a agenda para o lado para trocar de dia, ou toque num horário vazio para criar um compromisso ali.</p>` : `<p class="note">Dica: clique num horário vazio para criar um compromisso ali.</p>`}`;
}

function chipHtml(i){
  const tip = `${i.title}${i.allDay ? "" : " · " + minToHm(i.start)}`;
  const cls = ["chip", i.done ? "done" : "", i.late ? "late" : ""];
  if (i.kind === "google") return `<button class="chip ${i.done?"done":""} ${i.allDay?"solid":""}" data-inst="${i.key}" style="${i.allDay?`background:${i.color}`:"color:var(--ink)"};${i.pend?`outline:1.5px dashed ${i.color};outline-offset:-1.5px;`:""}" title="Google Agenda: ${esc(tip)}${i.pend?" (convite sem resposta)":""}">${i.allDay?"":`<span class="dot" style="background:${i.color}"></span><span class="hr">${minToHm(i.start)}</span>`}<span class="t">${i.pend?"✉ ":""}${esc(i.title)}</span></button>`;
  if (i.kind === "passo") return `<button class="chip prazo ${i.late?"late":""}" data-inst="${i.key}" title="Passo do checklist: ${esc(i.title)} — ${esc(i.sub)}"><span class="t">☑ ${esc(i.title)}</span></button>`;
  if (i.kind === "prazo") return `<button class="chip prazo ${i.late?"late":""}" data-inst="${i.key}" title="Prazo do kanban: ${esc(i.title)}"><span class="t">📌 ${esc(i.title)}</span></button>`;
  if (i.kind === "limite") return `<button class="chip ${i.late?"late":""}" data-inst="${i.key}" style="color:${i.color};background:${i.color}1f;border:1px dashed ${i.color}" title="Prazo final da missão: ${esc(i.title)}"><span class="t">⏰ Prazo: ${esc(i.title)}</span></button>`;
  if (i.kind === "missao"){
    return `<button class="${cls.join(" ")}" data-inst="${i.key}" style="color:color-mix(in srgb,${i.color} 72%,var(--ink));background:color-mix(in srgb,${i.color} 13%,transparent)" title="${esc(tip)}">
      <span class="bx" data-done="${i.key}">${i.done?"✓":""}</span>${i.allDay?"":`<span class="hr">${minToHm(i.start)}</span>`}<span class="t">${esc(i.title)}</span>${i.prazo?`<span class="dl">até ${fmtYmd(i.prazo)}</span>`:""}</button>`;
  }
  if (i.allDay) return `<button class="${cls.join(" ")} solid" data-inst="${i.key}" style="background:${i.color}" title="${esc(tip)}"><span class="t">${i.rec?"↻ ":""}${esc(i.title)}</span></button>`;
  return `<button class="${cls.join(" ")}" data-inst="${i.key}" style="color:var(--ink)" title="${esc(tip)}"><span class="dot" style="background:${i.color}"></span><span class="hr">${minToHm(i.start)}</span><span class="t">${esc(i.title)}</span></button>`;
}

function monthHtml(){
  const c = A.cursor, first = new Date(c.getFullYear(), c.getMonth(), 1), gs = weekStart(first);
  const last = new Date(c.getFullYear(), c.getMonth()+1, 0);
  const weeks = Math.ceil((last.getDate() + first.getDay()) / 7);
  const n = weeks * 7, today = todayYmd();
  const inst = instances(ymd(gs), ymd(addDays(gs, n-1)));
  const by = {}; inst.forEach(i => (by[i.date] = by[i.date] || []).push(i));
  let h = WD.map(w => `<div class="wd">${w}</div>`).join("");
  for (let k = 0; k < n; k++){
    const d = addDays(gs, k), key = ymd(d), list = by[key] || [];
    const max = 4, shown = list.length > max ? list.slice(0, max-1) : list;
    h += `<div class="mcell ${d.getMonth()!==c.getMonth()?"out":""} ${key===today?"today":""} ${[0,6].includes(d.getDay())?"we":""}" data-day="${key}">
      <span class="dn">${d.getDate()}</span>${shown.map(chipHtml).join("")}
      ${list.length > shown.length ? `<button class="more" data-goto="${key}" data-mode-to="dia">+${list.length-shown.length} mais</button>` : ""}</div>`;
  }
  return `<div class="month" style="grid-template-rows:auto repeat(${weeks},minmax(112px,1fr))">${h}</div>`;
}

function layoutDay(list){
  // distribui eventos sobrepostos em colunas
  const ev = list.slice().sort((a,b) => a.start-b.start || b.end-a.end);
  let cluster = [], colsEnd = [], out = [];
  const flush = () => { const n = colsEnd.length; cluster.forEach(x => { x.ncol = n; out.push(x); }); cluster = []; colsEnd = []; };
  let clusterEnd = -1;
  for (const e of ev){
    if (e.start >= clusterEnd && cluster.length) flush();
    let col = colsEnd.findIndex(end => end <= e.start);
    if (col < 0){ col = colsEnd.length; colsEnd.push(e.end); } else colsEnd[col] = e.end;
    e.col = col; cluster.push(e); clusterEnd = Math.max(clusterEnd, e.end);
  }
  flush(); return out;
}
function weekHtml(nDays){
  const H = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--hour")) || 48;
  const start = nDays === 1 ? new Date(A.cursor.getFullYear(), A.cursor.getMonth(), A.cursor.getDate()) : weekStart(A.cursor);
  const days = [...Array(nDays)].map((_, i) => addDays(start, i));
  const from = ymd(days[0]), to = ymd(days[nDays-1]), today = todayYmd();
  const inst = instances(from, to);
  const cols = `${isMob() ? 42 : 56}px repeat(${nDays}, minmax(0,1fr))`;
  const head = `<div class="wk-head" style="grid-template-columns:${cols}"><div class="lbl"></div>${days.map(d => `<div class="hd ${ymd(d)===today?"today":""}" data-goto="${ymd(d)}" data-mode-to="dia"><small>${WD[d.getDay()]}</small><b>${d.getDate()}</b></div>`).join("")}</div>`;
  const allRow = `<div class="wk-all" style="grid-template-columns:${cols}"><div class="lbl">dia todo</div>${days.map(d => { const k = ymd(d);
      return `<div class="ad" data-allday="${k}">${inst.filter(i => i.date===k && i.allDay).map(chipHtml).join("")}</div>`; }).join("")}</div>`;
  const hours = `<div class="hours">${[...Array(24)].map((_, h) => `<div>${h ? pad(h)+":00" : ""}</div>`).join("")}</div>`;
  const now = new Date(), nowMin = now.getHours()*60 + now.getMinutes();
  const dcols = days.map(d => {
    const k = ymd(d);
    const evs = layoutDay(inst.filter(i => i.date === k && !i.allDay));
    const blocks = evs.map(e => {
      const top = e.start / 60 * H, hgt = Math.max((e.end - e.start) / 60 * H - 2, 18);
      const w = 100 / e.ncol, left = e.col * w;
      const bg = e.kind === "missao" ? e.color : e.color;
      return `<div class="ev ${e.done?"done":""}" data-inst="${e.key}" style="top:${top}px;height:${hgt}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px);background:${bg};${e.late?"box-shadow:inset 3px 0 0 #fff,0 0 0 2px var(--danger);":""}${e.pend?"border:2px dashed #fff;opacity:.85;":""}">
        <b>${e.kind==="google"?(e.pend?"✉ ":"G · "):""}${e.kind==="missao"?`<span class="bx" data-done="${e.key}" style="display:inline-flex;width:11px;height:11px;border:1.5px solid #fff;border-radius:3px;margin-right:4px;vertical-align:-1px;font-size:8px;align-items:center;justify-content:center">${e.done?"✓":""}</span>`:""}${e.rec?"↻ ":""}${esc(e.title)}</b>
        <span>${minToHm(e.start)}${e.end?" – "+minToHm(Math.min(e.end,1439)):""}${e.local?" · "+esc(e.local):""}</span></div>`;
    }).join("");
    const nl = k === today ? `<div class="nowline" style="top:${nowMin/60*H}px"></div>` : "";
    return `<div class="daycol ${k===today?"today":""}" data-col-day="${k}" style="height:${24*H}px">${blocks}${nl}</div>`;
  }).join("");
  return `<div class="wk">${head}${allRow}<div class="wk-grid" style="grid-template-columns:${cols}">${hours}${dcols}</div></div>`;
}

function listHtml(){
  const today = todayYmd(), end = ymd(addDays(new Date(), 30));
  const late = lateList();
  const inst = instances(today, end);
  const by = {}; inst.forEach(i => (by[i.date] = by[i.date] || []).push(i));
  const row = i => {
    const tm = i.allDay ? (i.kind==="prazo" || i.kind==="limite" || i.kind==="passo" ? "Prazo" : "Dia todo") : `${minToHm(i.start)}${i.end ? "–"+minToHm(Math.min(i.end,1439)) : ""}`;
    const sub = [i.kind==="missao"?"Missão":i.kind==="prazo"?"Prazo do kanban":i.kind==="limite"?"Prazo final da missão":i.kind==="passo"?`Passo do checklist · ${i.sub}`:i.kind==="google"?(i.pend?"Google Agenda · convite sem resposta":"Google Agenda"):"Evento", i.prazo?`prazo final ${fmtYmd(i.prazo)}`:"", i.rec?"↻ repete":"", i.local||""].filter(Boolean).join(" · ");
    return `<div class="agl-it ${i.done?"done":""}" data-inst="${i.key}"><span class="bar" style="background:${i.color}"></span>
      ${i.kind==="missao" ? `<span class="cbx ${i.done?"on":""}" data-done="${i.key}">${i.done?"✓":""}</span>` : `<span style="width:20px;text-align:center">${i.kind==="prazo"?"📌":i.kind==="passo"?"☑":i.kind==="limite"?"⏰":i.kind==="google"?(i.pend?"✉":"🟦"):"📅"}</span>`}
      <span class="tm">${tm}</span><span class="ti">${esc(i.title)}<small>${esc(sub)}</small></span></div>`;
  };
  let h = "";
  if (late.length) h += `<div class="agl-day" id="agLate"><h3 class="late">⚠ Atrasadas (${late.length})</h3>${late.map(i => row(i).replace('<span class="tm">', `<span class="tm">${fmtYmd(i.date)} · `)).join("")}</div>`;
  const days = Object.keys(by).sort();
  if (!days.length && !late.length) h += `<div class="empty" style="padding:40px">Nada programado para os próximos 30 dias. Clique em <b>＋ Criar</b> para adicionar.</div>`;
  for (const k of days){
    const d = parseYmd(k);
    const label = k === today ? "Hoje · " : k === ymd(addDays(new Date(),1)) ? "Amanhã · " : "";
    h += `<div class="agl-day"><h3 class="${k===today?"today":""}">${label}${(l => label ? l : cap(l))(d.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"}))}</h3>${by[k].map(row).join("")}</div>`;
  }
  return `<div class="agl">${h}</div>`;
}

/* ---------- interação ---------- */
document.addEventListener("change", e => {
  const f = e.target.closest("[data-filt]"); if (!f) return;
  A.filt[f.dataset.filt] = f.checked; renderAgenda();
  if (f.dataset.filt === "concl"){ const p = prefs(); p.agConcluidas = f.checked; savePrefs(p); toast(f.checked ? "Missões concluídas aparecem na agenda." : "Missões concluídas escondidas da agenda."); }
});
document.addEventListener("click", e => {
  if (S.view !== "agenda" || e.target.closest("#modalRoot")) return;
  const t = e.target;
  const dn = t.closest("[data-done]");
  if (dn){ e.stopPropagation(); const [, id, date] = dn.dataset.done.split("|"); toggleDone(id, date); return; }
  const inst = t.closest("[data-inst]");
  if (inst){ e.stopPropagation(); const [k, id, date] = inst.dataset.inst.split("|"); if (k === "d") openDemandaFromAgenda(id); else if (k === "g") gOpenEvent(id, date); else if (k === "t") gOpenEvent(id.split("~")[1], date, decodeURIComponent(id.split("~")[0])); else openEventoPeek(id, date); return; }
  const go = t.closest("[data-goto]");
  if (go){ A.sideOpen = false; A.mobList = false; A.cursor = parseYmd(go.dataset.goto); if (go.dataset.modeTo) A.mode = go.dataset.modeTo; else if (A.mode === "lista") A.mode = "dia"; renderAgenda(); return; }
  const md = t.closest("[data-mode]"); if (md){ A.mode = md.dataset.mode; renderAgenda(); return; }
  const ag = t.closest("[data-ag]");
  if (ag){
    const a = ag.dataset.ag, c = A.cursor;
    if (a === "new") openEvento(null, { data: A.mode === "lista" ? todayYmd() : ymd(A.cursor) });
    if (a === "side" && window.matchMedia("(max-width:900px)").matches){ A.sideOpen = !A.sideOpen; $("#agSide").classList.toggle("open", A.sideOpen); return; }
    if (!["mprev","mnext"].includes(a)) A.sideOpen = false;
    if (a === "side"){ const p = prefs(); p.sidebar = p.sidebar === false; savePrefs(p); $("#agSide").classList.toggle("closed", p.sidebar === false); return; }
    if (a === "io"){ openIO(); return; }
    if (a === "concl"){ const v = !showDoneMissions(); A.filt.concl = v; const p = prefs(); p.agConcluidas = v; savePrefs(p); renderAgenda();
      toast(v ? "Missões concluídas aparecem na agenda." : "Missões concluídas escondidas da agenda."); return; }
    if (a === "atrib"){ openAtribuidas(); return; }
    if (a === "today") A.cursor = new Date();
    if (a === "prev" || a === "next"){ const s = a === "prev" ? -1 : 1;
      if (A.mode === "mes") A.cursor = new Date(c.getFullYear(), c.getMonth()+s, 1);
      else if (A.mode === "semana") A.cursor = addDays(c, 7*s);
      else if (A.mode === "dia") A.cursor = addDays(c, s);
      else A.cursor = addDays(c, 30*s); }
    if (a === "mprev" || a === "mnext") A.cursor = new Date(c.getFullYear(), c.getMonth() + (a==="mprev"?-1:1), 1);
    if (a === "gotoday"){ A.cursor = new Date(); A.mode = "dia"; A.mobList = false; }
    if (a === "golist" || a === "golate"){ A.mode = "lista"; A.mobList = true; A.mobLate = a === "golate"; }
    if (["today","prev","next","mback"].includes(a)){ A.mobList = false; if (a === "mback") A.mode = "dia"; }
    if (a !== "new") renderAgenda();
    if (a === "golate"){ const el = $("#agLate"); el && el.scrollIntoView({behavior:"smooth"}); }
    return;
  }
  const dc = t.closest("[data-col-day]");
  if (dc){
    const H = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--hour")) || 48;
    const y = e.clientY - dc.getBoundingClientRect().top;
    const m = Math.max(0, Math.min(23*60, Math.floor(y / H * 2) * 30));
    openEvento(null, { data: dc.dataset.colDay, hora_inicio: minToHm(m), hora_fim: minToHm(Math.min(m+60, 1439)) });
    return;
  }
  const ad = t.closest("[data-allday]"); if (ad){ openEvento(null, { data: ad.dataset.allday, semHora: true }); return; }
  const cell = t.closest("[data-day]"); if (cell){ openEvento(null, { data: cell.dataset.day }); return; }
});
function openDemandaFromAgenda(id){
  if (getD(id)) openDemandaPeek(id);
}

/* ---------- modal evento / missão ---------- */
const WDL = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"], BYDAY = ["SU","MO","TU","WE","TH","FR","SA"];
function recurrenceLines(e){
  const r = e.recorrencia; if (!r || r === "nenhuma") return [];
  const until = e.recorrencia_ate ? ";UNTIL=" + e.recorrencia_ate.replace(/-/g,"") + "T235959Z" : "";
  if (r === "datas"){
    const ds = [...new Set(e.rec_datas || [])].filter(x => x !== e.data).sort(); if (!ds.length) return [];
    if (!e.hora_inicio) return ["RDATE;VALUE=DATE:" + ds.map(x => x.replace(/-/g,"")).join(",")];
    const t = hm(e.hora_inicio).replace(":","") + "00";
    return ["RDATE;TZID=America/Recife:" + ds.map(x => x.replace(/-/g,"") + "T" + t).join(",")];
  }
  const map = { diaria:"FREQ=DAILY", dias_uteis:"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", semanal:"FREQ=WEEKLY", mensal:"FREQ=MONTHLY", anual:"FREQ=YEARLY",
    dias_semana: "FREQ=WEEKLY;BYDAY=" + ((e.rec_dias||[]).length ? e.rec_dias : [parseYmd(e.data).getDay()]).map(n => BYDAY[n]).join(",") };
  return ["RRULE:" + map[r] + until];
}
function recText(e){
  if (!e.recorrencia || e.recorrencia === "nenhuma") return "";
  if (e.recorrencia === "dias_semana") return "Toda semana: " + (e.rec_dias||[]).map(n => WDL[n]).join(", ");
  if (e.recorrencia === "datas") return "Nas datas: " + [...new Set([e.data, ...(e.rec_datas||[])])].sort().map(x => fmtYmd(x)).join(", ");
  const w = parseYmd(e.data);
  return ({ diaria:"Todo dia", dias_uteis:"Dias úteis", semanal:`Toda ${w.toLocaleDateString("pt-BR",{weekday:"long"})}`, mensal:`Todo dia ${w.getDate()}`, anual:"Todo ano" })[e.recorrencia]
    + (e.recorrencia_ate ? ` até ${fmtYmd(e.recorrencia_ate)}` : "");
}
function whoHtml(sel){
  const lista = isAdmin() ? S.perfis.filter(p => p.ativo) : (S.equipe || []);
  return `<div class="section"><label class="f">Para quem</label><div class="who" id="evWho">${lista.map(p => `<label><input type="checkbox" value="${p.id}" ${p.id===sel?"checked":""}><span class="mini-av" style="background:${p.cor}">${esc(initials(p.nome))}</span>${esc(p.nome)}${p.id===S.me.id?" (eu)":""}</label>`).join("")}</div>
    <div id="evShared" class="hidden" style="margin-top:8px;padding:10px 12px;border:1px solid var(--line);border-radius:10px">
      <b style="font-size:13px">👥 Compromisso compartilhado</b>
      <p class="note" style="margin:2px 0 6px">Cada pessoa recebe o compromisso na própria agenda. Se alguém excluir, some para todos, e mudanças de título, data e horário valem para todos.</p>
      <label class="chk evConjBox"><input type="checkbox" id="evConj"> Conclusão em conjunto: quando uma pessoa concluir, conclui para todos</label>
    </div></div>`;
}
function participantsHtml(list, ctx){
  return `<div class="who" style="gap:6px">${list.map(p => { const feito = (Array.isArray(p.concluidas) && ctx && p.concluidas.includes(ctx)) || p.concluida;
    return `<span class="tag" style="display:inline-flex;align-items:center;gap:5px;padding:4px 8px"><span class="mini-av" style="background:${p.cor}">${esc(initials(p.nome))}</span>${esc(p.nome)} ${feito ? "✅" : "⏳"}</span>`; }).join("")}</div>`;
}
function loadParticipants(ev, ctx, sel){
  if (!ev || !ev.grupo) return;
  API.rpc("grupo_participantes", { g: ev.grupo }).then(list => { const el = $(sel); if (el && list && list.length) el.innerHTML = `<label class="f" style="margin-top:8px">Compartilhada com ${list.length} pessoa(s)${ev.conclusao_conjunta ? " · conclusão em conjunto" : " · cada um conclui a sua"}</label>` + participantsHtml(list, ctx); }).catch(() => {});
}
function evChecklistHtml(cl){
  return `<ul class="cklist">${(cl||[]).map(c => `<li class="${c.feito?"done":""}"><input type="checkbox" data-eck="${c.id}" ${c.feito?"checked":""}><input class="ckt" data-ekt="${c.id}" value="${esc(c.texto)}"><button type="button" class="ckb del" data-ekdel="${c.id}" title="Remover">×</button></li>`).join("")}</ul>
    <div class="upd" style="margin-top:6px"><input class="fld" id="eckNew" placeholder="Adicionar passo… (Enter)"><button type="button" class="btn sm" data-eckadd style="white-space:nowrap">＋ Passo</button></div>`;
}
async function deleteEvento(ev){
  if (ev.google_id && ev.criado_por === S.me.id && gReady()) gDeleteEvent(ev.google_id).catch(() => {});
  if (ev.grupo){
    S.eventos = S.eventos.filter(x => x.grupo !== ev.grupo); S.atribuidas = S.atribuidas.filter(x => x.grupo !== ev.grupo); renderAll();
    try { const n = await API.rpc("grupo_excluir", { g: ev.grupo }); toast(`Excluído para todos (${n}).`); } catch(e){ toast("Não foi possível excluir: " + errMsg(e), true); }
    reloadSpace(false); return;
  }
  S.eventos = S.eventos.filter(x => x.id !== ev.id); S.atribuidas = S.atribuidas.filter(x => x.id !== ev.id); renderAll(); await remove("eventos", ev.id); toast("Excluído.");
}
function confirmDeleteEvento(ev){
  const rec = ev.recorrencia !== "nenhuma";
  confirmBox(ev.grupo ? "Excluir para todos?" : rec ? "Excluir todas as ocorrências?" : "Excluir este compromisso?",
    ev.grupo ? "Este compromisso é compartilhado: ele será apagado da agenda de todas as pessoas." + (ev.google_id ? " O evento no Google Agenda também será cancelado." : "")
      : (rec ? "O compromisso repetido some da agenda em todas as datas." : "Ele será apagado de vez.") + (ev.google_id ? " O evento no Google Agenda também será cancelado." : ""),
    "Excluir", async () => { closeModal(true); await deleteEvento(ev); });
}
function meetBoxHtml(link){
  return link ? `<div class="meetbox"><span>📹</span><a href="${esc(link)}" target="_blank" rel="noopener">${esc(link.replace(/^https?:\/\//,""))}</a>
    <button type="button" class="btn sm" data-copy="${esc(link)}">Copiar</button><a class="btn sm primary" href="${esc(link)}" target="_blank" rel="noopener">Entrar</a></div>` : "";
}
document.addEventListener("click", e => {
  const c = e.target.closest("[data-copy]"); if (!c) return;
  const t = c.dataset.copy;
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast("Link copiado.")).catch(() => toast("Copie: " + t));
});

function openEventoPeek(id, date){
  const ev = getE(id); if (!ev) return;
  const ctx = date || ev.data, done = ev.tipo === "missao" && isDone(ev, ctx);
  const col = ev.cor || defColor(ev.tipo);
  const when = (() => { const d = cap(fmtYmd(ctx, {weekday:"long", day:"numeric", month:"long"}));
    if (!ev.hora_inicio) return d + (ev.tipo !== "missao" && ev.data_fim ? ` até ${fmtYmd(ev.data_fim)}` : " · dia todo");
    return `${d} · ${hm(ev.hora_inicio)}${ev.hora_fim ? " – " + hm(ev.hora_fim) : ""}`; })();
  const quem = ev.criado_por && ev.criado_por !== ev.dono ? ((ev.historico||[]).find(h => h.tipo === "criado" && h.por) || {}).por || (pessoa(ev.criado_por) || {}).nome : null;
  const cl = ev.checklist || [];
  const ov = overlay(`<div class="peek-bar" style="background:${col}"></div>
    <div class="mhead" style="align-items:center"><div class="mt">${ev.tipo === "missao" ? "🎯" : "📅"} ${esc(ev.titulo)}</div>
      <button class="x" data-pe="edit" title="Editar">✏️</button><button class="x" data-pe="del" title="Excluir">🗑</button><button class="x" data-close title="Fechar">×</button></div>
    <div class="mbody">
      <div style="margin-bottom:6px">🕒 ${esc(when)}</div>
      ${recText(ev) ? `<div class="note" style="margin-bottom:6px">↻ ${esc(recText(ev))}</div>` : ""}
      ${ev.tipo === "missao" && ev.recorrencia === "nenhuma" && ev.data_fim ? `<div style="margin-bottom:6px">⏰ Prazo final: ${fmtYmd(ev.data_fim,{day:"2-digit",month:"2-digit",year:"numeric"})}</div>` : ""}
      ${ev.local ? `<div style="margin-bottom:6px">📍 ${esc(ev.local)}</div>` : ""}
      ${quem ? `<div class="note" style="margin-bottom:6px">📤 Atribuída por <b>${esc(quem)}</b></div>` : ""}
      ${meetBoxHtml(ev.meet_link)}
      ${ev.tipo === "missao" ? `<div class="dates" style="align-items:center;justify-content:space-between;margin:10px 0"><div><b>Situação</b>${done ? "✅ Concluída" : ((ev.recorrencia === "nenhuma" && ev.data_fim ? ev.data_fim : ctx) < todayYmd() ? "⚠ Atrasada" : "⏳ Em aberto")}</div>
        <button class="btn sm ${done?"":"ok"}" data-pe="done">${done ? "↺ Reabrir" : (ev.grupo && ev.conclusao_conjunta ? "✓ Concluir para todos" : "✓ Concluir")}</button></div>` : ""}
      <div id="peekPart"></div>
      ${cl.length ? `<div class="section"><h3>✅ Checklist · ${cl.filter(c => c.feito).length}/${cl.length}</h3>${cl.map(c => `<label class="chk" style="display:flex;margin:4px 0"><input type="checkbox" data-pck="${c.id}" ${c.feito?"checked":""}> <span style="${c.feito?"text-decoration:line-through;color:var(--muted)":""}">${esc(c.texto)}</span></label>`).join("")}</div>` : ""}
      ${ev.descricao ? `<div class="section"><h3>Descrição</h3><div style="white-space:pre-wrap;line-height:1.5">${esc(ev.descricao)}</div></div>` : ""}
      <div class="section"><h3>💬 Atualizações</h3>${evUpdHtml(id)}</div>
      <div class="section"><h3>📎 Anexos</h3>${anexosHtml("e", id)}</div>
    </div>`, "mid peek");
  loadParticipants(ev, ctx, "#peekPart");
  ov.addEventListener("click", e => {
    const ck = e.target.closest("[data-pck]");
    if (ck){ const cur = getE(id), it = clone(cur); const c = it.checklist.find(x => x.id === ck.dataset.pck); c.feito = ck.checked; c.feitoEm = ck.checked ? Date.now() : null;
      it.atualizado_em = Date.now(); Object.assign(cur, it); persist("eventos", it);
      if (it.grupo) API.rpc("grupo_sync", { g: it.grupo, c: { checklist: it.checklist } }).catch(() => {});
      renderAll(); openEventoPeek(id, date); return; }
    const b = e.target.closest("[data-pe]"); if (!b) return;
    if (b.dataset.pe === "edit"){ closeModal(true); openEvento(id, null, date); }
    if (b.dataset.pe === "del") confirmDeleteEvento(ev);
    if (b.dataset.pe === "done"){ toggleDone(id, ctx); closeModal(true); }
  });
}

function openEvento(id, pre = {}, dateCtx = null){
  const ev = id ? getE(id) : null;
  if (id && !ev) return;
  pre = pre || {};
  const d = ev ? clone(ev) : {
    tipo: pre.tipo || "evento", titulo: pre.titulo || "", descricao: "", data: pre.data || todayYmd(), data_fim: null,
    hora_inicio: pre.semHora ? null : (pre.hora_inicio || "09:00"), hora_fim: pre.semHora ? null : (pre.hora_fim || "10:00"),
    local: "", cor: null, recorrencia: "nenhuma", recorrencia_ate: null, rec_dias: [], rec_datas: [], checklist: [], conclusao_conjunta: false,
    meet_link: null, google_id: null, grupo: null, dono: pre.dono || S.space,
  };
  d.rec_dias = d.rec_dias || []; d.rec_datas = d.rec_datas || []; d.checklist = clone(d.checklist || []);
  if (!ev && d.tipo === "missao" && !pre.hora_inicio){ d.hora_inicio = null; d.hora_fim = null; }
  const semHora = !d.hora_inicio;
  const rec = ev && ev.recorrencia !== "nenhuma";
  const ctx = dateCtx || (ev ? ev.data : null);
  let dirty = false;
  const statusBlock = ev && ev.tipo === "missao" ? (() => {
    const done = isDone(ev, ctx);
    const lim = ev.recorrencia === "nenhuma" && ev.data_fim ? ev.data_fim : ctx;
    return `<div class="dates" style="align-items:center;justify-content:space-between">
      <div><b>Situação ${rec ? "em " + fmtYmd(ctx) : ""}</b>${done ? "✅ Concluída" : (lim < todayYmd() ? "⚠ Atrasada" : "⏳ Em aberto")}${!rec && ev.data_fim ? ` · prazo final ${fmtYmd(ev.data_fim)}` : ""}</div>
      <button class="btn ${done?"":"ok"}" id="evDone">${done ? "↺ Reabrir" : (ev.grupo && ev.conclusao_conjunta ? "✓ Concluir para todos" : "✓ Marcar como concluída")}</button></div>`;
  })() : "";
  const quem = ev && ev.criado_por && ev.criado_por !== ev.dono ? ((ev.historico||[]).find(h => h.tipo === "criado" && h.por) || {}).por || (pessoa(ev.criado_por) || {}).nome : null;
  const atribBox = ev && (quem || ev.dono !== S.me.id) ? `<p class="note" style="margin:-4px 0 12px">${quem ? `📤 Atribuída por <b>${esc(quem)}</b>` : ""}${ev.dono !== S.me.id && pessoa(ev.dono) ? `${quem ? " · " : ""}Para <b>${esc(pessoa(ev.dono).nome)}</b>` : ""}</p>` : "";
  const hist = ev && (ev.historico||[]).length ? `<div class="section"><h3>🕓 Histórico</h3><ul class="timeline">${[...ev.historico].sort((a,z)=>z.em-a.em).map(x => `<li class="${x.tipo}"><div class="tl-when">${fmt(x.em)}${x.por?" · por "+esc(x.por):""}</div><div class="tl-what">${esc(x.texto)}</div></li>`).join("")}</ul></div>` : "";
  const recLabel = (k, w) => k === "semanal" ? `Toda semana (${w.toLocaleDateString("pt-BR",{weekday:"long"})})` : k === "mensal" ? `Todo mês (dia ${w.getDate()})` : k === "anual" ? `Todo ano (${w.toLocaleDateString("pt-BR",{day:"numeric",month:"long"})})` : REC[k];
  const recOpts = (w, v) => Object.keys(REC).map(k => `<option value="${k}" ${v===k?"selected":""}>${esc(recLabel(k, w))}</option>`).join("");
  const hasFim = !!d.data_fim;
  const hint = t => t==="missao" ? "Missão é algo para fazer: você marca como concluída. Pode ter um prazo final." : "Evento é um compromisso com dia e horário: reunião, visita, entrega…";
  let recDias = d.rec_dias.length ? [...d.rec_dias] : [parseYmd(d.data).getDay()];
  let recDatas = [...d.rec_datas];
  const datasHtml = () => [...new Set([$("#evD") ? $("#evD").value : d.data, ...recDatas])].filter(Boolean).sort().map(x => `<span class="tag" style="display:inline-flex;gap:4px;align-items:center">${fmtYmd(x,{weekday:"short",day:"2-digit",month:"2-digit"})}${x !== ($("#evD") ? $("#evD").value : d.data) ? `<button type="button" class="ckb del" data-rmd="${x}" style="padding:0 3px">×</button>` : ""}</span>`).join(" ");
  const canMeet = gOn();

  const ov = overlay(`<div class="mhead"><div class="mt">${ev ? (ev.tipo==="missao"?"Editar missão":"Editar evento") : "Novo compromisso"}</div><button class="x" data-close>×</button></div>
    <form class="mbody" id="evForm">
      <div class="seg" id="evTipo" style="margin-bottom:14px">
        <button type="button" data-tipo="evento" class="${d.tipo==="evento"?"on":""}">📅 Evento</button>
        <button type="button" data-tipo="missao" class="${d.tipo==="missao"?"on":""}">🎯 Missão</button>
      </div>
      <p class="note" id="evTipoHint" style="margin:-6px 0 12px">${hint(d.tipo)}</p>
      ${atribBox}${statusBlock}
      <div id="evPart"></div>
      <input class="fld" id="evT" placeholder="${d.tipo==="missao"?"O que precisa ser feito?":"Título do evento"}" value="${esc(d.titulo)}" style="font-size:16px;font-weight:600">
      <div class="grid3 section">
        <div><label class="f" id="evDataLbl">${d.tipo==="missao"?"Fazer em":"Data"}</label><input class="fld" type="date" id="evD" value="${esc(d.data)}"></div>
        <div class="evHora ${semHora?"hidden":""}"><label class="f">Início</label><input class="fld" type="time" id="evHi" value="${esc(hm(d.hora_inicio)||"09:00")}"></div>
        <div class="evHora ${semHora?"hidden":""}"><label class="f">Fim</label><input class="fld" type="time" id="evHf" value="${esc(hm(d.hora_fim)||"")}"></div>
      </div>
      <div style="margin-top:8px;display:flex;gap:18px;flex-wrap:wrap">
        <label class="chk"><input type="checkbox" id="evSem" ${semHora?"checked":""}> <span id="evSemLbl">${d.tipo==="missao"?"Sem horário (só o dia)":"Dia inteiro"}</span></label>
        <label class="chk"><input type="checkbox" id="evFimChk" ${hasFim?"checked":""}> <span id="evFimLbl">${d.tipo==="missao"?"Tem prazo final":"Vários dias"}</span></label>
      </div>
      <div class="section evFimBox ${hasFim?"":"hidden"}"><label class="f" id="evFimLbl2">${d.tipo==="missao"?"Prazo final":"Até o dia"}</label><input class="fld" type="date" id="evDf" value="${esc(d.data_fim||"")}" style="max-width:220px">
        <p class="note" id="evFimHint" style="margin:6px 0 0">${d.tipo==="missao"?"A missão aparece no dia de fazer e o prazo final fica marcado com ⏰. Só fica atrasada depois do prazo final.":""}</p></div>
      <div class="grid2 section">
        <div><label class="f">Repetir</label><select class="fld" id="evR">${recOpts(parseYmd(d.data), d.recorrencia)}</select></div>
        <div class="evRAte ${["nenhuma","datas"].includes(d.recorrencia)?"hidden":""}"><label class="f">Repetir até (opcional)</label><input class="fld" type="date" id="evRa" value="${esc(d.recorrencia_ate||"")}"></div>
      </div>
      <div class="section evRDias ${d.recorrencia==="dias_semana"?"":"hidden"}"><label class="f">Em quais dias da semana</label>
        <div class="wdpick" id="evWd">${WDL.map((w,n) => `<button type="button" data-wd="${n}" class="${recDias.includes(n)?"on":""}">${w}</button>`).join("")}</div></div>
      <div class="section evRDatas ${d.recorrencia==="datas"?"":"hidden"}"><label class="f">Datas em que se repete</label>
        <div class="upd" style="max-width:340px"><input class="fld" type="date" id="evRdNew"><button type="button" class="btn sm" id="evRdAdd">＋ Adicionar data</button></div>
        <div id="evRdList" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${datasHtml()}</div></div>
      <div class="section"><label class="f">Local</label><input class="fld" id="evL" placeholder="Ex.: Loja Riomar, Google Meet…" value="${esc(d.local||"")}"></div>
      <div class="section"><label class="f">Videochamada</label>
        ${d.meet_link ? meetBoxHtml(d.meet_link) : canMeet ? `<label class="chk"><input type="checkbox" id="evMeet"> 📹 Gerar link do Google Meet</label>
          <p class="note" style="margin:4px 0 0">O compromisso também é criado no seu Google Agenda, com o link do Meet, e as pessoas de "Para quem" que tiverem e-mail Google recebem o convite.</p>`
          : `<p class="note" style="margin:0">Para gerar link do Google Meet, conecte seu Google Agenda no menu lateral da agenda.</p>`}</div>
      <div class="section"><label class="f">Descrição / observações</label><textarea class="fld" id="evDesc">${esc(d.descricao||"")}</textarea></div>
      <div class="section"><label class="f">✅ Checklist / passo a passo</label><div id="evCk">${evChecklistHtml(d.checklist)}</div></div>
      ${ev ? `<div class="section"><label class="f">💬 Atualizações / andamento</label>${evUpdHtml(ev.id)}</div>
      <div class="section"><label class="f">📎 Anexos</label>${anexosHtml("e", ev.id)}</div>`
        : `<p class="note section">💬 Atualizações e 📎 anexos ficam disponíveis depois de salvar o compromisso.</p>`}
      <div class="section"><label class="f">Cor</label><div id="evCorBox">${swatchesHtml(d.cor, "cor", defColor(d.tipo))}</div>
        <p class="note" style="margin:6px 0 0">A primeira opção (quadriculada) segue a cor padrão, que você muda em 🎨 Aparência. As outras deixam a cor fixa.</p></div>
      ${ev ? (isAdmin() && !ev.grupo ? donoSelectHtml("evO", d.dono) : "") : (canAssign() ? whoHtml(d.dono) : "")}
      ${ev && ev.grupo && ev.tipo === "missao" ? `<div class="section"><label class="chk"><input type="checkbox" id="evConjEdit" ${ev.conclusao_conjunta?"checked":""}> Conclusão em conjunto: quando uma pessoa concluir, conclui para todos</label></div>` : ""}
      ${hist}
    </form>
    <div class="mfoot">${ev ? `<button class="btn danger" id="evDel">${ev.grupo ? "Excluir para todos" : "Excluir" + (rec ? " (todas)" : "")}</button>` : ""}
      <div class="spacer"></div><button class="btn" data-close>Cancelar</button><button class="btn primary" id="evSave">Salvar</button></div>`, "mid", { dirty: () => dirty });
  loadParticipants(ev, ctx, "#evPart");
  const f = $("#evForm");
  f.addEventListener("input", e => { if (!e.target.closest("[data-nodirty],[data-anx]")) dirty = true; });
  let tipo = d.tipo;
  const syncFim = () => {
    const rOn = $("#evR").value !== "nenhuma";
    const chk = $("#evFimChk").closest("label");
    chk.classList.toggle("hidden", tipo === "missao" && rOn);
    if (tipo === "missao" && rOn){ $("#evFimChk").checked = false; $(".evFimBox").classList.add("hidden"); }
  };
  const syncShared = () => {
    const box = $("#evShared"); if (!box) return;
    const n = $$("#evWho input:checked").length; box.classList.toggle("hidden", n < 2);
    const cj = $(".evConjBox"); if (cj) cj.classList.toggle("hidden", tipo !== "missao");
  };
  const drawCk = () => { $("#evCk").innerHTML = evChecklistHtml(d.checklist); };
  const addCk = () => { const v = $("#eckNew").value.trim(); if (!v) return; d.checklist.push({ id: uuid(), texto: v, feito: false, em: Date.now(), feitoEm: null }); dirty = true; drawCk(); $("#eckNew").focus(); };
  ov.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("[data-sw]")) dirty = true;
    const wd = t.closest("[data-wd]"); if (wd){ const n = +wd.dataset.wd; recDias = recDias.includes(n) ? recDias.filter(x => x !== n) : [...recDias, n].sort(); wd.classList.toggle("on"); dirty = true; return; }
    const rm = t.closest("[data-rmd]"); if (rm){ recDatas = recDatas.filter(x => x !== rm.dataset.rmd); $("#evRdList").innerHTML = datasHtml(); dirty = true; return; }
    if (t.closest("[data-eckadd]")){ addCk(); return; }
    const ck = t.closest("[data-eck]"); if (ck){ const c = d.checklist.find(x => x.id === ck.dataset.eck); c.feito = ck.checked; c.feitoEm = ck.checked ? Date.now() : null; dirty = true; drawCk(); return; }
    const kd = t.closest("[data-ekdel]"); if (kd){ d.checklist = d.checklist.filter(x => x.id !== kd.dataset.ekdel); dirty = true; drawCk(); return; }
  });
  ov.addEventListener("keydown", e => { if (e.target.id === "eckNew" && e.key === "Enter"){ e.preventDefault(); addCk(); } if (e.target.id === "evRdNew" && e.key === "Enter"){ e.preventDefault(); $("#evRdAdd").click(); } });
  ov.addEventListener("change", e => {
    const k = e.target.dataset && e.target.dataset.ekt; if (k !== undefined){ const c = d.checklist.find(x => x.id === k); if (c && e.target.value.trim()) c.texto = e.target.value.trim(); }
    if (e.target.closest("#evWho")) syncShared();
  });
  $("#evRdAdd").onclick = () => { const v = $("#evRdNew").value; if (!v) return; if (!recDatas.includes(v)) recDatas.push(v); $("#evRdNew").value = ""; $("#evRdList").innerHTML = datasHtml(); dirty = true; };
  $$("#evTipo [data-tipo]").forEach(b => b.onclick = () => {
    tipo = b.dataset.tipo; dirty = true;
    $$("#evTipo [data-tipo]").forEach(x => x.classList.toggle("on", x === b));
    $("#evTipoHint").textContent = hint(tipo);
    $("#evDataLbl").textContent = tipo==="missao" ? "Fazer em" : "Data";
    $("#evSemLbl").textContent = tipo==="missao" ? "Sem horário (só o dia)" : "Dia inteiro";
    $("#evFimLbl").textContent = tipo==="missao" ? "Tem prazo final" : "Vários dias";
    $("#evFimLbl2").textContent = tipo==="missao" ? "Prazo final" : "Até o dia";
    $("#evFimHint").textContent = tipo==="missao" ? "A missão aparece no dia de fazer e o prazo final fica marcado com ⏰. Só fica atrasada depois do prazo final." : "";
    $("#evT").placeholder = tipo==="missao" ? "O que precisa ser feito?" : "Título do evento";
    $("#evCorBox").innerHTML = swatchesHtml(swValue(ov), "cor", defColor(tipo));
    syncFim(); syncShared();
  });
  $("#evSem").onchange = e => $$(".evHora").forEach(x => x.classList.toggle("hidden", e.target.checked));
  $("#evFimChk").onchange = e => { $(".evFimBox").classList.toggle("hidden", !e.target.checked);
    if (e.target.checked && !$("#evDf").value) $("#evDf").value = ymd(addDays(parseYmd($("#evD").value||todayYmd()), tipo==="missao" ? 3 : 1)); };
  $("#evR").onchange = e => { const v = e.target.value;
    $(".evRAte").classList.toggle("hidden", ["nenhuma","datas"].includes(v)); $(".evRDias").classList.toggle("hidden", v !== "dias_semana"); $(".evRDatas").classList.toggle("hidden", v !== "datas");
    if (v === "datas") $("#evRdList").innerHTML = datasHtml(); syncFim(); };
  $("#evD").onchange = () => { const sel = $("#evR"), v = sel.value; sel.innerHTML = recOpts(parseYmd($("#evD").value || todayYmd()), v); if (v === "datas") $("#evRdList").innerHTML = datasHtml(); };
  $("#evHi").onchange = () => { const a = toMin($("#evHi").value), b = toMin($("#evHf").value); if (a !== null && (b === null || b <= a)) $("#evHf").value = minToHm(Math.min(a+60, 1439)); };
  syncFim(); syncShared();
  if (!ev) setTimeout(() => $("#evT").focus(), 30);
  const done = $("#evDone"); if (done) done.onclick = () => { toggleDone(ev.id, ctx); closeModal(true); };
  const del = $("#evDel"); if (del) del.onclick = () => confirmDeleteEvento(ev);
  $("#evSave").onclick = async () => {
    const titulo = $("#evT").value.trim(); if (!titulo){ toast("Dê um título.", true); $("#evT").focus(); return; }
    const data = $("#evD").value; if (!data){ toast("Escolha a data.", true); return; }
    const sem = $("#evSem").checked;
    const hi = sem ? null : ($("#evHi").value || null), hf = sem ? null : ($("#evHf").value || null);
    if (hi && hf && toMin(hf) <= toMin(hi)){ toast("O horário de fim precisa ser depois do início.", true); return; }
    const recV = $("#evR").value;
    if (recV === "dias_semana" && !recDias.length){ toast("Escolha pelo menos um dia da semana.", true); return; }
    if (recV === "datas" && !recDatas.filter(x => x !== data).length){ toast("Adicione pelo menos uma data além da data inicial.", true); return; }
    const usaFim = $("#evFimChk").checked && !(tipo === "missao" && recV !== "nenhuma");
    const df = usaFim ? $("#evDf").value : null;
    if (usaFim && !df){ toast(tipo==="missao" ? "Escolha a data do prazo final." : 'Escolha "até o dia".', true); return; }
    if (df && df < data){ toast(tipo==="missao" ? "O prazo final não pode ser antes do dia de fazer." : '"Até o dia" precisa ser depois da data inicial.', true); return; }
    const ra = ["nenhuma","datas"].includes(recV) ? null : ($("#evRa").value || null);
    if (ra && ra < data){ toast('"Repetir até" precisa ser depois da data.', true); return; }
    const wantMeet = !!($("#evMeet") && $("#evMeet").checked);
    if (wantMeet && !gReady()){ toast("Para gerar o Meet, clique antes em \"Reconectar Google\" no menu lateral da agenda.", true); return; }
    let donos;
    if (ev) donos = [$("#evO") ? $("#evO").value : ev.dono];
    else if ($("#evWho")) { donos = $$("#evWho input:checked").map(x => x.value); if (!donos.length){ toast("Escolha para quem é.", true); return; } }
    else donos = [S.space];
    const now = Date.now();
    const base = { tipo, titulo, data, data_fim: df && df !== data ? df : null, hora_inicio: hi, hora_fim: hf, local: $("#evL").value.trim(),
      descricao: $("#evDesc").value.trim(), cor: swValue(ov), recorrencia: recV, recorrencia_ate: ra,
      rec_dias: recV === "dias_semana" ? recDias : [], rec_datas: recV === "datas" ? [...new Set(recDatas)].filter(x => x !== data).sort() : [],
      checklist: d.checklist, atualizado_em: now };
    if (ev && $("#evConjEdit")) base.conclusao_conjunta = $("#evConjEdit").checked;
    const grupo = !ev && donos.length > 1 ? uuid() : (ev ? ev.grupo || null : null);
    if (!ev && grupo) base.conclusao_conjunta = tipo === "missao" && !!($("#evConj") && $("#evConj").checked);
    const rows = donos.map(dono => {
      const row = Object.assign(ev ? clone(getE(ev.id) || ev) : { id: uuid(), criado_em: now, criado_por: S.me.id, concluida:false, concluida_em:null, concluidas:[], historico:[], meet_link:null, google_id:null }, base, { dono, grupo });
      if (!ev && !grupo) row.conclusao_conjunta = false;
      row.historico = row.historico || [];
      const h = ev ? {tipo:"edicao", em:now, texto:"Editado"} : {tipo:"criado", em:now, texto: tipo==="missao" ? "Missão criada" : "Evento criado"};
      if (S.me.id !== dono) h.por = S.me.nome;
      if (!ev && donos.length > 1) h.texto += ` (compartilhada com ${donos.length} pessoas)`;
      row.historico.push(h);
      return row;
    });
    dirty = false; closeModal(true);
    // Google Meet / Google Agenda
    if (wantMeet || (ev && ev.google_id && ev.criado_por === S.me.id && gReady())){
      try {
        const emails = donos.filter(x => x !== S.me.id).map(x => (S.equipeGoogle || []).find(p => p.id === x)).filter(p => p && p.google_email).map(p => p.google_email);
        if (wantMeet){ toast("Criando o link do Google Meet…"); const g = await gCreateEvent(rows[0], emails); rows.forEach(r => { r.meet_link = g.meet; r.google_id = g.id; }); }
        else await gPatchEvent(ev.google_id, rows[0]);
      } catch(ex){ toast("Google: " + errMsg(ex) + " — o compromisso foi salvo sem o link.", true); }
    }
    for (const row of rows){
      if (ev){ Object.assign(getE(ev.id) || ev, row); if (row.dono !== S.space) S.eventos = S.eventos.filter(x => x.id !== row.id); }
      else if (row.dono === S.space) S.eventos.push(row);
      if (row.dono !== S.me.id && row.criado_por === S.me.id){ const i = S.atribuidas.findIndex(x => x.id === row.id); if (i >= 0) S.atribuidas[i] = row; else S.atribuidas.push(row); }
    }
    renderAll();
    const nomes = donos.filter(x => x !== S.space).map(x => pessoa(x)?.nome).filter(Boolean);
    toast(ev ? (ev.grupo ? "Alterações salvas para todos." : "Alterações salvas.") : donos.length > 1 ? `Criado e compartilhado com ${donos.length} pessoas.` : (nomes.length ? `Criado na agenda de ${nomes[0]}.` : (tipo==="missao" ? "Missão criada." : "Evento criado.")) + (rows[0].meet_link ? " Link do Meet gerado." : ""));
    await Promise.all(rows.map(r => persist("eventos", r)));
    if (ev && ev.grupo){
      const c = { titulo, descricao: base.descricao, tipo, data, data_fim: base.data_fim, hora_inicio: hi, hora_fim: hf, local: base.local, recorrencia: recV, recorrencia_ate: ra,
        rec_dias: base.rec_dias, rec_datas: base.rec_datas, checklist: base.checklist, meet_link: rows[0].meet_link, google_id: rows[0].google_id, nota: "Editado" };
      if ("conclusao_conjunta" in base) c.conclusao_conjunta = base.conclusao_conjunta;
      API.rpc("grupo_sync", { g: ev.grupo, c }).catch(e => toast("Não foi possível atualizar para todos: " + errMsg(e), true));
    }
  };
}

/* ---------- exportar / importar ---------- */
const icsEsc = t => String(t||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
const icsDate = s => s.replace(/-/g,"");
function icsFold(line){ const out = []; while (line.length > 73){ out.push(line.slice(0,73)); line = " " + line.slice(73); } out.push(line); return out.join("\r\n"); }
function buildIcs(evs){
  const L = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Acompanhamento ADM//PT-BR","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:Acompanhamento ADM","X-WR-TIMEZONE:America/Recife",
    "BEGIN:VTIMEZONE","TZID:America/Recife","BEGIN:STANDARD","DTSTART:19700101T000000","TZOFFSETFROM:-0300","TZOFFSETTO:-0300","TZNAME:-03","END:STANDARD","END:VTIMEZONE"];
  const stamp = new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
  const RR = { diaria:"FREQ=DAILY", dias_uteis:"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", semanal:"FREQ=WEEKLY", mensal:"FREQ=MONTHLY", anual:"FREQ=YEARLY" };
  for (const e of evs){
    L.push("BEGIN:VEVENT", `UID:${e.id}@acompanhamento-adm`, `DTSTAMP:${stamp}`);
    const missao = e.tipo === "missao";
    L.push(icsFold("SUMMARY:" + icsEsc((missao ? "[Missão] " : "") + e.titulo)));
    const fim = !missao && e.data_fim && e.data_fim > e.data ? e.data_fim : e.data;
    if (!e.hora_inicio){
      L.push(`DTSTART;VALUE=DATE:${icsDate(e.data)}`, `DTEND;VALUE=DATE:${icsDate(ymd(addDays(parseYmd(fim),1)))}`);
    } else {
      const ini = toMin(e.hora_inicio); let end = e.hora_fim ? toMin(e.hora_fim) : ini + (missao ? 30 : 60); if (end <= ini) end = ini + 30; end = Math.min(end, 1439);
      const t = m => `${pad(Math.floor(m/60))}${pad(m%60)}00`;
      L.push(`DTSTART;TZID=America/Recife:${icsDate(e.data)}T${t(ini)}`, `DTEND;TZID=America/Recife:${icsDate(fim)}T${t(end)}`);
    }
    recurrenceLines(e).forEach(x => L.push(x));
    const desc = [e.descricao, missao && e.data_fim ? `Prazo final: ${fmtYmd(e.data_fim,{day:"2-digit",month:"2-digit",year:"numeric"})}` : ""].filter(Boolean).join("\n");
    if (desc) L.push(icsFold("DESCRIPTION:" + icsEsc(desc)));
    if (e.local) L.push(icsFold("LOCATION:" + icsEsc(e.local)));
    if (missao) L.push("CATEGORIES:Missão");
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n");
}
function parseIcs(text){
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out = []; let cur = null;
  const unesc = v => v.replace(/\\n/gi,"\n").replace(/\\,/g,",").replace(/\;/g,";").replace(/\\\\/g,"\\");
  const parseDT = (params, v) => {
    if (/VALUE=DATE(?!-)/i.test(params) || /^\d{8}$/.test(v)) return { date: `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`, time: null };
    const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/); if (!m) return null;
    let d = m[7] ? new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5])) : new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
    return { date: ymd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  };
  for (const raw of lines){
    if (raw === "BEGIN:VEVENT"){ cur = {}; continue; }
    if (raw === "END:VEVENT"){ if (cur) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = raw.indexOf(":"); if (i < 0) continue;
    const head = raw.slice(0, i), val = raw.slice(i+1);
    const [name, ...ps] = head.split(";"); const params = ps.join(";");
    const N = name.toUpperCase();
    if (N === "SUMMARY") cur.summary = unesc(val);
    else if (N === "DESCRIPTION") cur.desc = unesc(val);
    else if (N === "LOCATION") cur.loc = unesc(val);
    else if (N === "DTSTART") cur.start = parseDT(params, val);
    else if (N === "DTEND") cur.end = parseDT(params, val);
    else if (N === "RRULE") cur.rrule = val.toUpperCase();
    else if (N === "RDATE") cur.rdates = (cur.rdates || []).concat(val.split(",").map(v => (v.match(/^(\d{4})(\d{2})(\d{2})/) || []).slice(1).join("-")).filter(Boolean));
    else if (N === "STATUS") cur.status = val.toUpperCase();
    else if (N === "CATEGORIES") cur.cat = unesc(val);
  }
  const now = Date.now();
  return out.filter(x => x.start && x.summary && x.status !== "CANCELLED").map(x => {
    let titulo = x.summary.trim(), tipo = "evento";
    if (/^\[miss[aã]o\]\s*/i.test(titulo) || /miss[aã]o/i.test(x.cat||"")){ tipo = "missao"; titulo = titulo.replace(/^\[miss[aã]o\]\s*/i, ""); }
    let data = x.start.date, data_fim = null, hi = x.start.time, hf = null;
    if (x.end){
      if (!hi){ const last = ymd(addDays(parseYmd(x.end.date), -1)); if (last > data) data_fim = last; }
      else { if (x.end.date === data) hf = x.end.time; else if (x.end.date > data) data_fim = x.end.date; }
    }
    let recorrencia = "nenhuma", recorrencia_ate = null;
    if (x.rrule){
      const g = k => (x.rrule.match(new RegExp(k + "=([^;]+)")) || [])[1];
      const fq = g("FREQ"), by = g("BYDAY") || "", un = g("UNTIL");
      const dias = by ? by.split(",").map(x => BYDAY.indexOf(x.replace(/^[-+\d]+/, ""))).filter(n => n >= 0) : [];
      recorrencia = fq === "DAILY" ? "diaria" : fq === "WEEKLY" ? (dias.length === 5 && [1,2,3,4,5].every(n => dias.includes(n)) ? "dias_uteis" : (dias.length > 1 || (dias.length === 1 && dias[0] !== parseYmd(data).getDay())) ? "dias_semana" : "semanal") : fq === "MONTHLY" ? "mensal" : fq === "YEARLY" ? "anual" : "nenhuma";
      if (recorrencia === "dias_semana") x.recDias = dias.sort();
      if (un) recorrencia_ate = `${un.slice(0,4)}-${un.slice(4,6)}-${un.slice(6,8)}`;
      if (recorrencia !== "nenhuma") data_fim = null;
    }
    let rec_dias = x.recDias || [], rec_datas = [];
    if (recorrencia === "nenhuma" && x.rdates && x.rdates.length){ recorrencia = "datas"; rec_datas = [...new Set(x.rdates)].filter(v => v !== data).sort(); data_fim = null; }
    let descricao = x.desc || "";
    if (tipo === "missao"){ const m = descricao.match(/Prazo final: (\d{2})\/(\d{2})\/(\d{4})/); if (m){ data_fim = `${m[3]}-${m[2]}-${m[1]}`; descricao = descricao.replace(/\n?Prazo final: .*$/, "").trim(); } }
    return { tipo, titulo, descricao, data, data_fim, hora_inicio: hi, hora_fim: hf, local: x.loc || "", cor: null, recorrencia, recorrencia_ate, rec_dias, rec_datas, checklist: [],
      concluida:false, concluida_em:null, concluidas:[], criado_em: now, atualizado_em: now };
  });
}
function download(name, text, type){
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function openIO(){
  const nome = isOwnSpace() ? "sua agenda" : `a agenda de ${spaceName()}`;
  const slug = semAcento(spaceName()).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const ov = overlay(`<div class="mhead"><div class="mt">⇅ Exportar / importar agenda</div><button class="x" data-close>×</button></div>
    <div class="mbody">
      <div class="ioopt"><span class="ic">📤</span><div style="flex:1"><b>Exportar para Google Agenda / Outlook (.ics)</b><p>Gera um arquivo com ${esc(nome)} (${S.eventos.length} compromisso(s)). No Google Agenda: Configurações → Importar e exportar → Importar.</p>
        <button class="btn sm" id="ioIcs">Baixar .ics</button></div></div>
      <div class="ioopt"><span class="ic">💾</span><div style="flex:1"><b>Backup completo (.json)</b><p>Cópia exata, com conclusões e histórico, para guardar ou restaurar aqui no sistema.</p>
        <button class="btn sm" id="ioJson">Baixar backup</button></div></div>
      <div class="ioopt"><span class="ic">📥</span><div style="flex:1"><b>Importar (.ics ou .json)</b><p>Traga eventos exportados do Google Agenda, do Outlook ou um backup deste sistema para ${esc(nome)}.</p>
        <input type="file" id="ioFile" accept=".ics,.json,text/calendar,application/json" class="fld">
        <div id="ioPrev" style="margin-top:10px"></div></div></div>
    </div>`, "mid");
  $("#ioIcs").onclick = () => { download(`agenda-${slug}-${todayYmd()}.ics`, buildIcs(S.eventos), "text/calendar;charset=utf-8"); toast("Arquivo .ics baixado."); };
  $("#ioJson").onclick = () => { download(`backup-agenda-${slug}-${todayYmd()}.json`, JSON.stringify({ tipo:"acompanhamento-adm/agenda", versao:1, exportado_em:new Date().toISOString(), eventos:S.eventos }, null, 2), "application/json"); toast("Backup baixado."); };
  $("#ioFile").onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const prev = $("#ioPrev"); prev.innerHTML = "";
    let rows = [];
    try {
      const txt = await file.text();
      if (/\.json$/i.test(file.name) || txt.trim().startsWith("{") || txt.trim().startsWith("[")){
        const j = JSON.parse(txt); const arr = Array.isArray(j) ? j : (j.eventos || []);
        rows = arr.filter(x => x && x.titulo && x.data).map(x => ({ ...x }));
      } else rows = parseIcs(txt);
    } catch(ex){ prev.innerHTML = `<div class="err">Não consegui ler esse arquivo: ${esc(errMsg(ex))}</div>`; return; }
    const key = x => `${x.titulo}|${x.data}|${hm(x.hora_inicio)||""}`;
    const have = new Set(S.eventos.map(key));
    const novos = rows.filter(x => !have.has(key(x)));
    if (!rows.length){ prev.innerHTML = `<div class="err">Nenhum compromisso encontrado no arquivo.</div>`; return; }
    prev.innerHTML = `<p style="margin:0 0 8px">Encontrei <b>${rows.length}</b> compromisso(s)${rows.length !== novos.length ? `, sendo <b>${rows.length - novos.length}</b> repetido(s) que já existem e serão ignorados` : ""}.</p>
      ${novos.length ? `<button class="btn primary sm" id="ioGo">Importar ${novos.length} para ${esc(nome)}</button>` : ""}`;
    const go = $("#ioGo");
    if (go) go.onclick = async () => {
      go.disabled = true; const now = Date.now();
      for (const r of novos){
        const COLS_EV = ["tipo","titulo","descricao","data","data_fim","hora_inicio","hora_fim","local","cor","recorrencia","recorrencia_ate","rec_dias","rec_datas","checklist","concluida","concluida_em","concluidas","historico","criado_em","meet_link"];
        const row = Object.fromEntries(COLS_EV.map(k => [k, r[k] ?? null]));
        Object.assign(row, { id: uuid(), dono: S.space, criado_por: S.me.id, criado_em: r.criado_em || now, atualizado_em: now,
          tipo: r.tipo === "missao" ? "missao" : "evento", descricao: r.descricao || "", local: r.local || "", recorrencia: REC[r.recorrencia] ? r.recorrencia : "nenhuma",
          concluida: !!r.concluida, concluidas: r.concluidas || [], rec_dias: r.rec_dias || [], rec_datas: r.rec_datas || [], checklist: r.checklist || [], historico: [...(r.historico || []), actorTag({tipo:"criado", em:now, texto:`Importado de ${file.name}`})] });
        ["hora_inicio","hora_fim"].forEach(k => { if (row[k]) row[k] = hm(row[k]); });
        S.eventos.push(row); persist("eventos", row);
      }
      closeModal(true); renderAll(); toast(`${novos.length} compromisso(s) importado(s).`);
    };
  };
}

/* ---------- atribuídas por mim ---------- */
function openAtribuidas(){
  const today = todayYmd();
  const st = e => {
    if (e.tipo !== "missao") return { t: "📅 Evento", c: "" };
    if (e.recorrencia !== "nenhuma") return { t: `↻ Repete · ${(e.concluidas||[]).length} conclusão(ões)`, c: "" };
    if (e.concluida) return { t: `✅ Concluída ${e.concluida_em ? "em " + fmtD(e.concluida_em) : ""}`, c: "okt" };
    const lim = e.data_fim || e.data;
    return lim < today ? { t: "⚠ Atrasada", c: "late" } : { t: "⏳ Em aberto", c: "blue" };
  };
  const draw = filtro => {
    const list = S.atribuidas.filter(e => filtro === "todas" || (filtro === "abertas" ? !(e.tipo === "missao" && e.recorrencia === "nenhuma" && e.concluida) : (e.tipo === "missao" && e.recorrencia === "nenhuma" && e.concluida)))
      .sort((a,b) => (a.data_fim||a.data).localeCompare(b.data_fim||b.data));
    const by = {}; list.forEach(e => (by[e.dono] = by[e.dono] || []).push(e));
    $("#atrList").innerHTML = Object.keys(by).length ? Object.entries(by).map(([dono, evs]) => { const p = pessoa(dono) || { nome: "?", cor: "#8a94a6" };
      return `<div class="section"><h3><span class="mini-av" style="background:${p.cor};width:22px;height:22px;border-radius:50%;color:#fff;font-size:10px;display:inline-flex;align-items:center;justify-content:center">${esc(initials(p.nome))}</span>${esc(p.nome)} <span class="count">${evs.length}</span></h3>
        ${evs.map(e => { const s2 = st(e); return `<div class="agl-it" data-atr="${e.id}"><span class="bar" style="background:${e.cor || defColor(e.tipo)}"></span>
          <span class="ti">${esc(e.titulo)}<small>${e.tipo === "missao" ? "Missão" : "Evento"} · ${fmtYmd(e.data,{day:"2-digit",month:"2-digit"})}${e.hora_inicio ? " " + hm(e.hora_inicio) : ""}${e.data_fim && e.tipo === "missao" ? " · prazo final " + fmtYmd(e.data_fim) : ""}</small></span>
          <span class="tag ${s2.c}">${s2.t}</span></div>`; }).join("")}</div>`; }).join("")
      : `<div class="empty" style="padding:30px">Nada por aqui. Para atribuir, clique em <b>＋ Criar</b> e marque as pessoas em "Para quem".</div>`;
  };
  const ov = overlay(`<div class="mhead"><div class="mt">📤 Atribuídas por mim</div><button class="x" data-close>×</button></div>
    <div class="mbody"><div class="seg" id="atrF"><button data-f="abertas" class="on">Em aberto</button><button data-f="concluidas">Concluídas</button><button data-f="todas">Todas</button></div>
    <p class="note" style="margin:8px 0 0">Missões e eventos que você criou na agenda de outras pessoas. Você acompanha a situação e pode editar ou cancelar.</p>
    <div id="atrList"></div></div>`, "mid");
  draw("abertas");
  ov.addEventListener("click", e => {
    const f = e.target.closest("[data-f]"); if (f){ $$("#atrF [data-f]").forEach(x => x.classList.toggle("on", x === f)); draw(f.dataset.f); return; }
    const it = e.target.closest("[data-atr]"); if (it){ closeModal(true); openEvento(it.dataset.atr); }
  });
}

/* ao girar o celular / redimensionar entre celular e computador */
window.matchMedia("(max-width:900px)").addEventListener("change", () => { if (S.me && ["agenda","kanban"].includes(S.view) && !modalOpen()) renderAll(); });
