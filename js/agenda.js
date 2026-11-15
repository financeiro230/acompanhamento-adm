/* ===================== AGENDA ===================== */
"use strict";

const A = { mode: (window.innerWidth < 700 ? "dia" : "semana"), cursor: new Date(), filt: { evento:true, missao:true, prazo:true }, scrollKey: null };
const WD = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const REC = { nenhuma:"Não repete", diaria:"Todo dia", dias_uteis:"Dias úteis (seg a sex)", semanal:"Toda semana", mensal:"Todo mês", anual:"Todo ano" };
const getE = id => S.eventos.find(e => e.id === id);
const toMin = t => { if (!t) return null; const [h,m] = t.split(":").map(Number); return h*60+m; };
const minToHm = m => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
const defColor = tipo => tipo === "missao" ? "#1f9d61" : "#2f5bea";

/* ---------- recorrência ---------- */
function occurrences(ev, from, to){
  const res = [];
  if (ev.recorrencia === "nenhuma" || !ev.recorrencia){
    const end = ev.data_fim && ev.data_fim > ev.data ? ev.data_fim : ev.data;
    let d = parseYmd(ev.data > from ? ev.data : from); const last = end < to ? end : to;
    while (ymd(d) <= last){ res.push(ymd(d)); d = addDays(d, 1); }
    return res;
  }
  const d0 = parseYmd(ev.data);
  const until = ev.recorrencia_ate && ev.recorrencia_ate < to ? ev.recorrencia_ate : to;
  let d = parseYmd(ev.data > from ? ev.data : from);
  while (ymd(d) <= until){
    const w = d.getDay();
    const ok = ev.recorrencia === "diaria" ? true
      : ev.recorrencia === "dias_uteis" ? (w >= 1 && w <= 5)
      : ev.recorrencia === "semanal" ? w === d0.getDay()
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
    for (const date of occurrences(ev, from, to)){
      const multi = ev.recorrencia === "nenhuma" && ev.data_fim && ev.data_fim > ev.data;
      const allDay = !ev.hora_inicio || multi;
      const start = allDay ? null : toMin(ev.hora_inicio);
      let end = allDay ? null : (ev.hora_fim ? toMin(ev.hora_fim) : start + (ev.tipo === "missao" ? 30 : 60));
      if (!allDay && end <= start) end = start + 30;
      const done = ev.tipo === "missao" && isDone(ev, date);
      const late = ev.tipo === "missao" && !done && (date < today || (date === today && !allDay && (end ?? 0) < nowMin));
      out.push({ key:`e|${ev.id}|${date}`, kind:ev.tipo, id:ev.id, date, allDay, start, end, title:ev.titulo,
        color: ev.cor || defColor(ev.tipo), done, late, rec: ev.recorrencia !== "nenhuma", local: ev.local });
    }
  }
  if (A.filt.prazo){
    for (const d of S.demandas){
      if (!d.prazo || d.status === FIN || d.prazo < from || d.prazo > to) continue;
      out.push({ key:`d|${d.id}|${d.prazo}`, kind:"prazo", id:d.id, date:d.prazo, allDay:true, start:null, end:null,
        title:d.titulo, color:"#d98a00", done:false, late: d.prazo < today });
    }
  }
  return out.sort((a,b) => a.date.localeCompare(b.date) || (a.allDay===b.allDay ? 0 : a.allDay ? -1 : 1) || (a.start??0)-(b.start??0) || a.title.localeCompare(b.title));
}
function lateList(){
  const today = todayYmd(), from = ymd(addDays(new Date(), -30)), yest = ymd(addDays(new Date(), -1));
  const late = instances(from, today).filter(i => i.late && i.kind !== "prazo");
  const prazos = S.demandas.filter(d => d.prazo && d.status !== FIN && d.prazo < today)
    .map(d => ({ key:`d|${d.id}|${d.prazo}`, kind:"prazo", id:d.id, date:d.prazo, allDay:true, title:d.titulo, color:"#d98a00", late:true }));
  return [...late, ...(A.filt.prazo ? prazos : [])].sort((a,b) => a.date.localeCompare(b.date));
}

/* ---------- ações ---------- */
function toggleDone(id, date){
  const cur = getE(id); if (!cur) return;
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
function renderAgenda(){
  const v = $("#v-agenda");
  v.innerHTML = `<aside class="ag-side" id="agSide"></aside>
    <div class="ag-main">
      <div class="ag-bar">
        <button class="btn primary" data-ag="new">＋ Criar</button>
        <button class="btn" data-ag="today">Hoje</button>
        <button class="btn ghost" data-ag="prev" title="Anterior">‹</button>
        <button class="btn ghost" data-ag="next" title="Próximo">›</button>
        <h2>${esc(cap(agTitle()))}</h2>
        <div class="spacer"></div>
        <div class="seg">${[["mes","Mês"],["semana","Semana"],["dia","Dia"],["lista","Lista"]].map(([k,l]) => `<button data-mode="${k}" class="${A.mode===k?"on":""}">${l}</button>`).join("")}</div>
      </div>
      <div class="ag-body" id="agBody"></div>
    </div>`;
  renderSide();
  const body = $("#agBody");
  if (A.mode === "mes") body.innerHTML = monthHtml();
  else if (A.mode === "lista") body.innerHTML = listHtml();
  else {
    body.innerHTML = weekHtml(A.mode === "dia" ? 1 : 7);
    const key = A.mode + ymd(A.cursor);
    const allRow = body.querySelector(".wk-all"); const head = body.querySelector(".wk-head");
    if (allRow && head) allRow.style.top = head.offsetHeight + "px";
    if (A.scrollKey !== key){ A.scrollKey = key; body.scrollTop = 7 * parseInt(getComputedStyle(document.documentElement).getPropertyValue("--hour")); }
    else body.scrollTop = A.lastScroll || body.scrollTop;
  }
  body.onscroll = () => { A.lastScroll = body.scrollTop; };
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
    <div class="filt"><h4>Mostrar</h4>
      <label class="chk"><input type="checkbox" data-filt="evento" ${A.filt.evento?"checked":""}> <span class="dot" style="background:#2f5bea"></span> Eventos</label>
      <label class="chk"><input type="checkbox" data-filt="missao" ${A.filt.missao?"checked":""}> <span class="dot" style="background:#1f9d61"></span> Missões</label>
      <label class="chk"><input type="checkbox" data-filt="prazo" ${A.filt.prazo?"checked":""}> <span class="dot" style="background:#d98a00"></span> Prazos do kanban</label>
    </div>
    <p class="note">Dica: clique num horário vazio para criar um compromisso ali.</p>`;
}

function chipHtml(i){
  const tip = `${i.title}${i.allDay ? "" : " · " + minToHm(i.start)}`;
  const cls = ["chip", i.done ? "done" : "", i.late ? "late" : ""];
  if (i.kind === "prazo") return `<button class="chip prazo ${i.late?"late":""}" data-inst="${i.key}" title="Prazo: ${esc(i.title)}"><span class="t">📌 ${esc(i.title)}</span></button>`;
  if (i.kind === "missao"){
    return `<button class="${cls.join(" ")}" data-inst="${i.key}" style="color:${i.color};background:${i.color}14" title="${esc(tip)}">
      <span class="bx" data-done="${i.key}">${i.done?"✓":""}</span>${i.allDay?"":`<span class="hr">${minToHm(i.start)}</span>`}<span class="t">${esc(i.title)}</span></button>`;
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
  const cols = `56px repeat(${nDays}, minmax(0,1fr))`;
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
      return `<div class="ev ${e.done?"done":""}" data-inst="${e.key}" style="top:${top}px;height:${hgt}px;left:calc(${left}% + 2px);width:calc(${w}% - 4px);background:${bg};${e.late?"box-shadow:inset 3px 0 0 #fff,0 0 0 2px var(--danger);":""}">
        <b>${e.kind==="missao"?`<span class="bx" data-done="${e.key}" style="display:inline-flex;width:11px;height:11px;border:1.5px solid #fff;border-radius:3px;margin-right:4px;vertical-align:-1px;font-size:8px;align-items:center;justify-content:center">${e.done?"✓":""}</span>`:""}${e.rec?"↻ ":""}${esc(e.title)}</b>
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
    const tm = i.allDay ? (i.kind==="prazo" ? "Prazo" : "Dia todo") : `${minToHm(i.start)}${i.end ? "–"+minToHm(Math.min(i.end,1439)) : ""}`;
    const sub = [i.kind==="missao"?"Missão":i.kind==="prazo"?"Prazo do kanban":"Evento", i.rec?"↻ repete":"", i.local||""].filter(Boolean).join(" · ");
    return `<div class="agl-it ${i.done?"done":""}" data-inst="${i.key}"><span class="bar" style="background:${i.color}"></span>
      ${i.kind==="missao" ? `<span class="cbx ${i.done?"on":""}" data-done="${i.key}">${i.done?"✓":""}</span>` : `<span style="width:20px;text-align:center">${i.kind==="prazo"?"📌":"📅"}</span>`}
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
});
document.addEventListener("click", e => {
  if (S.view !== "agenda" || e.target.closest("#modalRoot")) return;
  const t = e.target;
  const dn = t.closest("[data-done]");
  if (dn){ e.stopPropagation(); const [, id, date] = dn.dataset.done.split("|"); toggleDone(id, date); return; }
  const inst = t.closest("[data-inst]");
  if (inst){ e.stopPropagation(); const [k, id, date] = inst.dataset.inst.split("|"); if (k === "d") openDemandaFromAgenda(id); else openEvento(id, null, date); return; }
  const go = t.closest("[data-goto]");
  if (go){ A.cursor = parseYmd(go.dataset.goto); if (go.dataset.modeTo) A.mode = go.dataset.modeTo; else if (A.mode === "lista") A.mode = "dia"; renderAgenda(); return; }
  const md = t.closest("[data-mode]"); if (md){ A.mode = md.dataset.mode; renderAgenda(); return; }
  const ag = t.closest("[data-ag]");
  if (ag){
    const a = ag.dataset.ag, c = A.cursor;
    if (a === "new") openEvento(null, { data: A.mode === "lista" ? todayYmd() : ymd(A.cursor) });
    if (a === "today") A.cursor = new Date();
    if (a === "prev" || a === "next"){ const s = a === "prev" ? -1 : 1;
      if (A.mode === "mes") A.cursor = new Date(c.getFullYear(), c.getMonth()+s, 1);
      else if (A.mode === "semana") A.cursor = addDays(c, 7*s);
      else if (A.mode === "dia") A.cursor = addDays(c, s);
      else A.cursor = addDays(c, 30*s); }
    if (a === "mprev" || a === "mnext") A.cursor = new Date(c.getFullYear(), c.getMonth() + (a==="mprev"?-1:1), 1);
    if (a === "gotoday"){ A.cursor = new Date(); A.mode = "dia"; }
    if (a === "golist" || a === "golate"){ A.mode = "lista"; }
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
  if (getD(id)) openDemanda(id);
}

/* ---------- modal evento / missão ---------- */
function openEvento(id, pre = {}, dateCtx = null){
  const ev = id ? getE(id) : null;
  if (id && !ev) return;
  pre = pre || {};
  const d = ev ? clone(ev) : {
    tipo: pre.tipo || "evento", titulo: pre.titulo || "", descricao: "", data: pre.data || todayYmd(), data_fim: null,
    hora_inicio: pre.semHora ? null : (pre.hora_inicio || "09:00"), hora_fim: pre.semHora ? null : (pre.hora_fim || "10:00"),
    local: "", cor: null, recorrencia: "nenhuma", recorrencia_ate: null, dono: pre.dono || S.space,
  };
  if (!ev && d.tipo === "missao" && !pre.hora_inicio){ d.hora_inicio = null; d.hora_fim = null; }
  const semHora = !d.hora_inicio;
  const rec = ev && ev.recorrencia !== "nenhuma";
  const ctx = dateCtx || (ev ? ev.data : null);
  let dirty = false;
  const statusBlock = ev && ev.tipo === "missao" ? (() => {
    const done = isDone(ev, ctx);
    return `<div class="dates" style="align-items:center;justify-content:space-between">
      <div><b>Situação ${rec ? "em " + fmtYmd(ctx) : ""}</b>${done ? "✅ Concluída" : (ctx < todayYmd() ? "⚠ Atrasada" : "⏳ Em aberto")}</div>
      <button class="btn ${done?"":"ok"}" id="evDone">${done ? "↺ Reabrir" : "✓ Marcar como concluída"}</button></div>`;
  })() : "";
  const hist = ev && (ev.historico||[]).length ? `<div class="section"><h3>🕓 Histórico</h3><ul class="timeline">${[...ev.historico].sort((a,z)=>z.em-a.em).map(x => `<li class="${x.tipo}"><div class="tl-when">${fmt(x.em)}${x.por?" · por "+esc(x.por):""}</div><div class="tl-what">${esc(x.texto)}</div></li>`).join("")}</ul></div>` : "";
  const w = parseYmd(d.data);
  const recOpt = k => k === "semanal" ? `Toda semana (${w.toLocaleDateString("pt-BR",{weekday:"long"})})` : k === "mensal" ? `Todo mês (dia ${w.getDate()})` : k === "anual" ? `Todo ano (${w.toLocaleDateString("pt-BR",{day:"numeric",month:"long"})})` : REC[k];

  const ov = overlay(`<div class="mhead"><div class="mt">${ev ? (ev.tipo==="missao"?"Missão":"Evento") : "Novo compromisso"}</div><button class="x" data-close>×</button></div>
    <form class="mbody" id="evForm">
      <div class="seg" id="evTipo" style="margin-bottom:14px">
        <button type="button" data-tipo="evento" class="${d.tipo==="evento"?"on":""}">📅 Evento</button>
        <button type="button" data-tipo="missao" class="${d.tipo==="missao"?"on":""}">🎯 Missão</button>
      </div>
      <p class="note" id="evTipoHint" style="margin:-6px 0 12px">${d.tipo==="missao" ? "Missão é algo para fazer: tem prazo e você marca como concluída." : "Evento é um compromisso com dia e horário: reunião, visita, entrega…"}</p>
      ${statusBlock}
      <input class="fld" id="evT" placeholder="${d.tipo==="missao"?"O que precisa ser feito?":"Título do evento"}" value="${esc(d.titulo)}" style="font-size:16px;font-weight:600">
      <div class="grid3 section">
        <div><label class="f" id="evDataLbl">${d.tipo==="missao"?"Prazo":"Data"}</label><input class="fld" type="date" id="evD" value="${esc(d.data)}"></div>
        <div class="evHora ${semHora?"hidden":""}"><label class="f">Início</label><input class="fld" type="time" id="evHi" value="${esc(hm(d.hora_inicio)||"09:00")}"></div>
        <div class="evHora ${semHora?"hidden":""}"><label class="f">Fim</label><input class="fld" type="time" id="evHf" value="${esc(hm(d.hora_fim)||"")}"></div>
      </div>
      <div style="margin-top:8px;display:flex;gap:18px;flex-wrap:wrap">
        <label class="chk"><input type="checkbox" id="evSem" ${semHora?"checked":""}> <span id="evSemLbl">${d.tipo==="missao"?"Sem horário (só o dia)":"Dia inteiro"}</span></label>
        <label class="chk evMulti ${d.tipo==="missao"?"hidden":""}"><input type="checkbox" id="evMultiChk" ${d.data_fim?"checked":""}> Vários dias</label>
      </div>
      <div class="section evMultiBox ${d.data_fim && d.tipo!=="missao"?"":"hidden"}"><label class="f">Até o dia</label><input class="fld" type="date" id="evDf" value="${esc(d.data_fim||"")}"></div>
      <div class="grid2 section">
        <div><label class="f">Repetir</label><select class="fld" id="evR">${Object.keys(REC).map(k => `<option value="${k}" ${d.recorrencia===k?"selected":""}>${esc(recOpt(k))}</option>`).join("")}</select></div>
        <div class="evRAte ${d.recorrencia==="nenhuma"?"hidden":""}"><label class="f">Repetir até (opcional)</label><input class="fld" type="date" id="evRa" value="${esc(d.recorrencia_ate||"")}"></div>
      </div>
      <div class="section"><label class="f">Local</label><input class="fld" id="evL" placeholder="Ex.: Loja Riomar, Google Meet…" value="${esc(d.local||"")}"></div>
      <div class="section"><label class="f">Descrição / observações</label><textarea class="fld" id="evDesc">${esc(d.descricao||"")}</textarea></div>
      <div class="section"><label class="f">Cor</label>${swatchesHtml(d.cor || defColor(d.tipo))}</div>
      ${donoSelectHtml("evO", d.dono)}
      ${hist}
    </form>
    <div class="mfoot">${ev ? `<button class="btn danger" id="evDel">Excluir${rec?" (todas)":""}</button>` : ""}
      <div class="spacer"></div><button class="btn" data-close>Cancelar</button><button class="btn primary" id="evSave">Salvar</button></div>`, "mid", { dirty: () => dirty });
  const f = $("#evForm");
  f.addEventListener("input", () => { dirty = true; });
  ov.addEventListener("click", e => { if (e.target.closest("[data-sw]")) dirty = true; });
  let tipo = d.tipo;
  $$("#evTipo [data-tipo]").forEach(b => b.onclick = () => {
    tipo = b.dataset.tipo; dirty = true;
    $$("#evTipo [data-tipo]").forEach(x => x.classList.toggle("on", x === b));
    $("#evTipoHint").textContent = tipo==="missao" ? "Missão é algo para fazer: tem prazo e você marca como concluída." : "Evento é um compromisso com dia e horário: reunião, visita, entrega…";
    $("#evDataLbl").textContent = tipo==="missao" ? "Prazo" : "Data";
    $("#evSemLbl").textContent = tipo==="missao" ? "Sem horário (só o dia)" : "Dia inteiro";
    $("#evT").placeholder = tipo==="missao" ? "O que precisa ser feito?" : "Título do evento";
    $(".evMulti").classList.toggle("hidden", tipo==="missao");
    if (tipo==="missao"){ $("#evMultiChk").checked = false; $(".evMultiBox").classList.add("hidden"); }
    const box = $(`[data-swname="cor"]`), cur = swValue(ov);
    if (!cur || cur === defColor(tipo==="missao"?"evento":"missao")) box.querySelectorAll(".sw").forEach(s => s.classList.toggle("on", s.dataset.sw === defColor(tipo)));
  });
  $("#evSem").onchange = e => $$(".evHora").forEach(x => x.classList.toggle("hidden", e.target.checked));
  $("#evMultiChk").onchange = e => { $(".evMultiBox").classList.toggle("hidden", !e.target.checked); if (e.target.checked && !$("#evDf").value) $("#evDf").value = ymd(addDays(parseYmd($("#evD").value||todayYmd()),1)); };
  $("#evR").onchange = e => $(".evRAte").classList.toggle("hidden", e.target.value === "nenhuma");
  $("#evD").onchange = () => { const w2 = parseYmd($("#evD").value || todayYmd()); const sel = $("#evR"), v = sel.value;
    sel.innerHTML = Object.keys(REC).map(k => `<option value="${k}" ${v===k?"selected":""}>${esc(k==="semanal"?`Toda semana (${w2.toLocaleDateString("pt-BR",{weekday:"long"})})`:k==="mensal"?`Todo mês (dia ${w2.getDate()})`:k==="anual"?`Todo ano (${w2.toLocaleDateString("pt-BR",{day:"numeric",month:"long"})})`:REC[k])}</option>`).join(""); };
  $("#evHi").onchange = () => { const a = toMin($("#evHi").value), b = toMin($("#evHf").value); if (a !== null && (b === null || b <= a)) $("#evHf").value = minToHm(Math.min(a+60, 1439)); };
  if (!ev) setTimeout(() => $("#evT").focus(), 30);
  const done = $("#evDone"); if (done) done.onclick = () => { toggleDone(ev.id, ctx); closeModal(true); };
  const del = $("#evDel"); if (del) del.onclick = () => confirmBox(rec ? "Excluir todas as ocorrências?" : "Excluir este compromisso?", rec ? "O compromisso repetido some da agenda em todas as datas." : "Ele será apagado de vez.", "Excluir", async () => {
    closeModal(true); S.eventos = S.eventos.filter(x => x.id !== ev.id); renderAll(); await remove("eventos", ev.id); toast("Excluído.");
  });
  $("#evSave").onclick = () => {
    const titulo = $("#evT").value.trim(); if (!titulo){ toast("Dê um título.", true); $("#evT").focus(); return; }
    const data = $("#evD").value; if (!data){ toast("Escolha a data.", true); return; }
    const sem = $("#evSem").checked;
    const hi = sem ? null : ($("#evHi").value || null), hf = sem ? null : ($("#evHf").value || null);
    if (hi && hf && toMin(hf) <= toMin(hi)){ toast("O horário de fim precisa ser depois do início.", true); return; }
    const multi = tipo === "evento" && $("#evMultiChk").checked;
    const df = multi ? $("#evDf").value : null;
    if (df && df <= data){ toast('"Até o dia" precisa ser depois da data inicial.', true); return; }
    const recV = $("#evR").value, ra = recV === "nenhuma" ? null : ($("#evRa").value || null);
    if (ra && ra < data){ toast('"Repetir até" precisa ser depois da data.', true); return; }
    const dono = $("#evO") ? $("#evO").value : (ev ? ev.dono : S.space);
    const now = Date.now();
    const row = Object.assign(ev ? clone(ev) : { id: uuid(), criado_em: now, criado_por: S.me.id, concluida:false, concluida_em:null, concluidas:[], historico:[] }, {
      dono, tipo, titulo, data, data_fim: df || null, hora_inicio: hi, hora_fim: hf, local: $("#evL").value.trim(),
      descricao: $("#evDesc").value.trim(), cor: swValue(ov) || null, recorrencia: recV, recorrencia_ate: ra, atualizado_em: now,
    });
    row.historico = row.historico || [];
    row.historico.push(actorTag(ev ? {tipo:"edicao", em:now, texto:"Editado"} : {tipo:"criado", em:now, texto: tipo==="missao" ? "Missão criada" : "Evento criado"}));
    if (ev){ Object.assign(ev, row); if (row.dono !== S.space) S.eventos = S.eventos.filter(x => x.id !== row.id); }
    else if (row.dono === S.space) S.eventos.push(row);
    dirty = false; closeModal(true); renderAll();
    toast(ev ? "Alterações salvas." : (row.dono === S.space ? (tipo==="missao" ? "Missão criada." : "Evento criado.") : `Criado na agenda de ${perfil(row.dono).nome}.`));
    persist("eventos", row);
  };
}
