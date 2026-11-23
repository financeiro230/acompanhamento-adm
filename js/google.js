/* ===================== GOOGLE AGENDA (cada pessoa conecta a sua conta) ===================== */
"use strict";

const GCFG = {
  clientId: "129647163515-cgeiutvud4rv0ihjulk79mm3i7ppe34h.apps.googleusercontent.com",
  scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
  api: "https://www.googleapis.com/calendar/v3",
};
const G = { token: null, exp: 0, email: null, events: [], from: null, to: null, loading: false, err: null, client: null, team: {} };
const gPref = () => prefs().google || null;               // {ativo:true, email}
const gOn = () => !!(gPref() && gPref().ativo);
const gReady = () => G.token && Date.now() < G.exp - 60000;
const gKey = () => "cu_g_" + (S.me ? S.me.id : "");

function gRestore(){
  try { const t = JSON.parse(sessionStorage.getItem(gKey()) || "null"); if (t && t.exp > Date.now() + 60000){ G.token = t.token; G.exp = t.exp; G.email = t.email; G.scopes = t.scopes || ""; } } catch {}
}
function gStore(){ try { sessionStorage.setItem(gKey(), JSON.stringify({ token: G.token, exp: G.exp, email: G.email, scopes: G.scopes || "" })); } catch {} }
function gClear(){ G.token = null; G.exp = 0; G.scopes = ""; G.events = []; G.from = G.to = null; G.team = {}; try { sessionStorage.removeItem(gKey()); } catch {} }

function loadGis(){
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  return new Promise((ok, bad) => {
    const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => ok(); s.onerror = () => bad(new Error("Não foi possível carregar o login do Google."));
    document.head.appendChild(s);
  });
}
async function gConnect(){
  try { await loadGis(); } catch(e){ toast(e.message, true); return; }
  const first = !gOn();
  return new Promise(resolve => {
    G.client = google.accounts.oauth2.initTokenClient({
      client_id: GCFG.clientId, scope: GCFG.scope + (prefs().driveOn ? " " + DRIVE_SCOPE : ""), include_granted_scopes: true, hint: (gPref() && gPref().email) || undefined,
      callback: async resp => {
        if (resp.error){ toast(resp.error === "access_denied" ? "Conexão com o Google cancelada." : "Google: " + resp.error, true); resolve(false); return; }
        G.token = resp.access_token; G.exp = Date.now() + (resp.expires_in || 3600) * 1000; G.scopes = resp.scope || "";
        try { const cal = await gFetch("/calendars/primary"); G.email = cal.id; } catch {}
        gStore();
        if (first || !gPref() || gPref().email !== G.email){ const p = prefs(); p.google = { ativo: true, email: G.email }; await savePrefs(p); }
        if (G.email && S.me.google_email !== G.email){ try { await API.rpc("salvar_google_email", { p: G.email }); S.me.google_email = G.email; loadEquipeGoogle(); } catch {} }
        toast(`Google Agenda conectado${G.email ? " (" + G.email + ")" : ""}.`);
        G.from = G.to = null; await gEnsure(true); resolve(true);
      },
      error_callback: e => { toast(e && e.type === "popup_closed" ? "Janela do Google fechada antes de concluir." : "Não foi possível abrir o login do Google (verifique se o navegador bloqueou a janela).", true); resolve(false); },
    });
    G.client.requestAccessToken({ prompt: first ? "consent" : "" });
  });
}
async function gDisconnect(){
  const t = G.token;
  if (t && window.google && google.accounts) try { google.accounts.oauth2.revoke(t, () => {}); } catch {}
  gClear(); const p = prefs(); delete p.google; await savePrefs(p);
  renderAll(); toast("Google Agenda desconectado.");
}
async function gFetch(path, opts = {}){
  const r = await fetch(GCFG.api + path, { ...opts, headers: { Authorization: "Bearer " + G.token, "Content-Type": "application/json", ...(opts.headers || {}) } });
  if (r.status === 401){ gClear(); renderAll(); throw new Error("Sua conexão com o Google expirou. Clique em Reconectar."); }
  if (!r.ok){ let m = r.statusText; try { m = (await r.json()).error.message; } catch {} throw new Error(m); }
  return r.status === 204 ? null : r.json();
}

/* ---------- busca de eventos ---------- */
function agRange(){
  const c = A.cursor;
  return { from: ymd(addDays(new Date(c.getFullYear(), c.getMonth(), 1), -45)), to: ymd(addDays(new Date(c.getFullYear(), c.getMonth() + 1, 0), 75)) };
}
async function gEnsure(force){
  if (!gOn() || !gReady() || G.loading) return;
  if (!isOwnSpace()){ const r = agRange(); await gTeamEnsure(r.from, r.to, force); if (S.view === "agenda" && !modalOpen()) renderAgenda(); return; }
  const need = agRange(), today = todayYmd();
  const from = need.from < ymd(addDays(new Date(), -35)) ? need.from : ymd(addDays(new Date(), -35));
  const to = need.to > ymd(addDays(new Date(), 45)) ? need.to : ymd(addDays(new Date(), 45));
  if (!force && G.from && G.from <= from && G.to >= to) return;
  G.loading = true; G.err = null;
  try {
    const q = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", maxResults: "2500",
      timeMin: parseYmd(from).toISOString(), timeMax: addDays(parseYmd(to), 1).toISOString() });
    let items = [], page = null;
    do {
      if (page) q.set("pageToken", page);
      const r = await gFetch("/calendars/primary/events?" + q.toString());
      items = items.concat(r.items || []); page = r.nextPageToken;
    } while (page && items.length < 5000);
    G.events = items.filter(e => e.status !== "cancelled"); G.from = from; G.to = to;
  } catch(e){ G.err = errMsg(e); console.error(e); }
  finally { G.loading = false; }
  await gTeamEnsure(from, to, force);
  if (S.view === "agenda" && !modalOpen()) renderAgenda();
}
const gMe = e => (e.attendees || []).find(a => a.self);
const gPending = e => { const m = gMe(e); return !!(m && m.responseStatus === "needsAction" && !(e.organizer && e.organizer.self)); };
const gStatus = e => { const m = gMe(e); return m ? m.responseStatus : null; };
function gParse(e){
  if (e.start && e.start.date){
    const end = e.end && e.end.date ? ymd(addDays(parseYmd(e.end.date), -1)) : e.start.date;
    return { allDay: true, date: e.start.date, last: end < e.start.date ? e.start.date : end };
  }
  const s = new Date(e.start.dateTime), f = new Date((e.end && e.end.dateTime) || e.start.dateTime);
  const sm = s.getHours()*60 + s.getMinutes();
  let em = ymd(f) === ymd(s) ? f.getHours()*60 + f.getMinutes() : 1439; if (em <= sm) em = Math.min(sm + 30, 1439);
  return { allDay: false, date: ymd(s), last: ymd(s), start: sm, end: em };
}
function gInstances(from, to){
  if (!A.filt.google || !gOn()) return [];
  const out = [], col = prefs().corGoogle || "#4285f4";
  const mine = new Set(S.eventos.map(x => x.google_id).filter(Boolean));
  for (const em of teamEmails()){
    const t = G.team[em]; if (!t || !t.events) continue;
    const p = (S.equipeGoogle || []).find(x => x.google_email === em) || { nome: em, cor: "#8a94a6" };
    for (const e of t.events){
      if (mine.has(e.id)) continue;
      const g = gParse(e); let d = parseYmd(g.date > from ? g.date : from); const last = g.last < to ? g.last : to;
      while (ymd(d) <= last){
        out.push({ key: `t|${encodeURIComponent(em)}~${e.id}|${ymd(d)}`, kind: "google", id: e.id, date: ymd(d), allDay: g.allDay, start: g.allDay ? null : g.start, end: g.allDay ? null : g.end,
          title: (isOwnSpace() ? initials(p.nome) + " · " : "") + (e.summary || (e.visibility === "private" || !e.summary ? "Ocupado" : "(sem título)")), color: p.cor, done: false, late: false, pend: false, local: e.location || "" });
        d = addDays(d, 1);
      }
    }
  }
  if (!isOwnSpace()) return out;
  for (const e of G.events){
    if (mine.has(e.id)) continue;
    const p = gParse(e); const pend = gPending(e), st = gStatus(e);
    let d = parseYmd(p.date > from ? p.date : from); const last = p.last < to ? p.last : to;
    while (ymd(d) <= last){
      out.push({ key: `g|${e.id}|${ymd(d)}`, kind: "google", id: e.id, date: ymd(d), allDay: p.allDay, start: p.allDay ? null : p.start, end: p.allDay ? null : p.end,
        title: e.summary || "(sem título)", color: col, done: st === "declined", late: false, pend, local: e.location || "" });
      d = addDays(d, 1);
    }
  }
  return out;
}

/* ---------- RSVP ---------- */
async function gRsvp(id, status){
  const e = G.events.find(x => x.id === id); if (!e) return;
  const atts = (e.attendees || []).map(a => a.self ? { ...a, responseStatus: status } : a);
  try {
    const upd = await gFetch(`/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=all`, { method: "PATCH", body: JSON.stringify({ attendees: atts }) });
    Object.assign(e, upd);
    toast(status === "accepted" ? "Convite aceito ✓" : status === "declined" ? "Convite recusado." : "Resposta enviada: talvez.");
    renderAll();
  } catch(ex){ toast("Não foi possível responder: " + errMsg(ex), true); }
}

/* ---------- telas ---------- */
const RS = { accepted: "✅ Aceito", declined: "❌ Recusado", tentative: "❔ Talvez", needsAction: "✉ Sem resposta" };
function gSideHtml(){
  if (!isOwnSpace()) return gOn() ? `<div class="filt"><h4>Google Agenda</h4>${gReady() ? gTeamSideHtml() : `<button class="btn" data-g="connect" style="width:100%">🔄 Reconectar Google</button>`}</div>` : "";
  if (!gOn()) return `<div class="filt"><h4>Google Agenda</h4>
    <button class="btn" data-g="connect" style="width:100%">🔗 Conectar meu Google Agenda</button>
    <p class="note" style="margin:0">Veja seus eventos do Google aqui e responda convites. Use a conta Google autorizada pelo administrador. É opcional.</p></div>`;
  if (!gReady()) return `<div class="filt"><h4>Google Agenda</h4>
    <button class="btn" data-g="connect" style="width:100%">🔄 Reconectar Google</button>
    <p class="note" style="margin:0">Por segurança, o Google pede para reconectar a cada sessão. ${esc(gPref().email || "")}</p></div>`;
  const pend = G.events.filter(e => gPending(e) && gParse(e).last >= todayYmd()).length;
  return `<div class="filt"><h4>Google Agenda</h4>
    <div class="note" style="margin:0 0 2px">${esc(G.email || gPref().email || "")}${G.loading ? " · carregando…" : ""}</div>
    ${G.err ? `<div class="err" style="font-size:12px">${esc(G.err)}</div>` : ""}
    <button class="sum ${pend ? "today" : ""}" data-g="invites"><span>✉ Convites pendentes</span><b>${pend}</b></button>
    <div style="display:flex;gap:6px"><button class="btn sm" data-g="refresh" style="flex:1">↻ Atualizar</button><button class="btn sm ghost" data-g="off">Desconectar</button></div>
    ${gTeamSideHtml()}</div>`;
}
function gInvitesModal(){
  const list = G.events.filter(e => gPending(e) && gParse(e).last >= todayYmd()).sort((a,b) => gParse(a).date.localeCompare(gParse(b).date));
  overlay(`<div class="mhead"><div class="mt">✉ Convites pendentes do Google</div><button class="x" data-close>×</button></div>
    <div class="mbody">${list.length ? list.map(e => { const p = gParse(e); return `<div class="ioopt" style="align-items:center"><div style="flex:1;min-width:0">
      <b>${esc(e.summary || "(sem título)")}</b><p style="margin:0">${esc(fmtYmd(p.date,{weekday:"short",day:"2-digit",month:"2-digit"}))} · ${p.allDay ? "dia todo" : minToHm(p.start) + "–" + minToHm(p.end)}${e.organizer ? " · de " + esc(e.organizer.displayName || e.organizer.email) : ""}</p></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm ok" data-rsvp="${e.id}|accepted">Aceitar</button><button class="btn sm" data-rsvp="${e.id}|tentative">Talvez</button><button class="btn sm danger" data-rsvp="${e.id}|declined">Recusar</button><button class="btn sm ghost" data-gopen="${e.id}|${p.date}">Ver</button></div></div>`; }).join("")
      : `<div class="empty" style="padding:30px">Nenhum convite esperando resposta. 🎉</div>`}</div>`, "mid");
}
function gOpenEvent(id, date, email){
  const e = gFind(id, email); if (!e) return;
  const p = gParse(e), me = gMe(e);
  const when = p.allDay ? (p.last > p.date ? `${fmtYmd(p.date,{day:"2-digit",month:"2-digit"})} a ${fmtYmd(p.last,{day:"2-digit",month:"2-digit"})} · dia todo` : `${cap(fmtYmd(p.date,{weekday:"long",day:"numeric",month:"long"}))} · dia todo`)
    : `${cap(fmtYmd(p.date,{weekday:"long",day:"numeric",month:"long"}))} · ${minToHm(p.start)} – ${minToHm(p.end)}`;
  const desc = (e.description || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
  const atts = (e.attendees || []).filter(a => !a.resource);
  overlay(`<div class="mhead"><div class="mt"><span class="tag blue" style="font-size:11px;vertical-align:2px">Google Agenda</span> ${esc(e.summary || "(sem título)")}</div><button class="x" data-close>×</button></div>
    <div class="mbody">
      <div class="dates" style="margin-top:0"><div><b>Quando</b>${esc(when)}</div>${e.location ? `<div><b>Local</b>${esc(e.location)}</div>` : ""}${e.organizer ? `<div><b>Organizador</b>${esc(e.organizer.displayName || e.organizer.email || "")}</div>` : ""}${me ? `<div><b>Sua resposta</b>${RS[me.responseStatus] || me.responseStatus}</div>` : ""}</div>
      ${me && !email && !(e.organizer && e.organizer.self) ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="btn ok" data-rsvp="${e.id}|accepted">✓ Aceitar</button><button class="btn" data-rsvp="${e.id}|tentative">Talvez</button><button class="btn danger" data-rsvp="${e.id}|declined">Recusar</button></div>` : ""}
      ${e.hangoutLink ? `<p><a href="${esc(e.hangoutLink)}" target="_blank" rel="noopener" class="btn primary sm">🎥 Entrar no Google Meet</a></p>` : ""}
      ${desc ? `<div class="section"><h3>Descrição</h3><div style="white-space:pre-wrap;line-height:1.5;font-size:13.5px">${esc(desc).slice(0, 4000)}</div></div>` : ""}
      ${atts.length ? `<div class="section"><h3>Convidados (${atts.length})</h3>${atts.slice(0, 40).map(a => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:3px 0;border-bottom:1px solid var(--line)"><span>${esc(a.displayName || a.email)}${a.self ? " (você)" : ""}${a.organizer ? " · organizador" : ""}</span><span class="note">${RS[a.responseStatus] || ""}</span></div>`).join("")}</div>` : ""}
    </div>
    <div class="mfoot"><a class="btn" href="${esc(e.htmlLink || "https://calendar.google.com")}" target="_blank" rel="noopener">Abrir no Google Agenda ↗</a>
      ${email ? "" : `<button class="btn" data-gcopy="${e.id}">📥 Copiar para a agenda do sistema</button>`}<div class="spacer"></div><button class="btn" data-close>Fechar</button></div>`, "mid");
}
function gCopy(id){
  const e = G.events.find(x => x.id === id); if (!e) return;
  const p = gParse(e), now = Date.now();
  const row = { id: uuid(), dono: S.space, tipo: "evento", titulo: e.summary || "(sem título)", descricao: ((e.description || "").replace(/<[^>]+>/g, "") + (e.hangoutLink ? "\nMeet: " + e.hangoutLink : "")).trim(),
    data: p.date, data_fim: p.allDay && p.last > p.date ? p.last : null, hora_inicio: p.allDay ? null : minToHm(p.start), hora_fim: p.allDay ? null : minToHm(p.end),
    local: e.location || "", cor: null, recorrencia: "nenhuma", recorrencia_ate: null, concluida: false, concluida_em: null, concluidas: [],
    historico: [actorTag({ tipo: "criado", em: now, texto: "Copiado do Google Agenda" })], criado_em: now, atualizado_em: now, criado_por: S.me.id };
  S.eventos.push(row); persist("eventos", row); closeModal(true); renderAll(); toast("Copiado para a agenda do sistema.");
}

document.addEventListener("click", e => {
  const g = e.target.closest("[data-g]");
  if (g){ const a = g.dataset.g;
    if (a === "connect") gConnect();
    if (a === "refresh"){ G.from = G.to = null; gEnsure(true); toast("Atualizando Google Agenda…"); }
    if (a === "off") confirmBox("Desconectar o Google Agenda?", "Seus eventos do Google deixam de aparecer aqui. Nada é apagado no Google.", "Desconectar", gDisconnect);
    if (a === "invites") gInvitesModal();
    return; }
  const r = e.target.closest("[data-rsvp]"); if (r){ const [id, st] = r.dataset.rsvp.split("|"); const inModal = modalOpen(); gRsvp(id, st).then(() => { if (inModal && $(".mt") && /Convites/.test($(".mt").textContent)) gInvitesModal(); }); return; }
  const o = e.target.closest("[data-gopen]"); if (o){ const [id, d] = o.dataset.gopen.split("|"); gOpenEvent(id, d); return; }
  const c = e.target.closest("[data-gcopy]"); if (c){ gCopy(c.dataset.gcopy); return; }
});

/* ---------- agendas Google da equipe ---------- */
async function loadEquipeGoogle(){ try { S.equipeGoogle = await API.rpc("equipe_google"); } catch { S.equipeGoogle = []; } }
function teamEmails(){
  if (!gReady()) return [];
  if (!isOwnSpace()){ const p = (S.equipeGoogle || []).find(x => x.id === S.space); return p && p.google_email ? [p.google_email] : []; }
  return (prefs().gTeam || []).filter(em => (S.equipeGoogle || []).some(p => p.google_email === em && p.id !== S.me.id));
}
async function gTeamEnsure(from, to, force){
  const list = teamEmails(); if (!list.length) return;
  await Promise.all(list.map(async em => {
    const t = G.team[em];
    if (!force && t && t.from && t.from <= from && t.to >= to) return;
    try {
      const q = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", maxResults: "2500", timeMin: parseYmd(from).toISOString(), timeMax: addDays(parseYmd(to), 1).toISOString() });
      const r = await gFetch(`/calendars/${encodeURIComponent(em)}/events?` + q.toString());
      G.team[em] = { events: (r.items || []).filter(e => e.status !== "cancelled"), from, to, err: null };
    } catch(e){ G.team[em] = { events: [], from, to, err: /not found|notFound|404/i.test(errMsg(e)) ? "sem acesso (peça para compartilhar a agenda com você)" : errMsg(e) }; }
  }));
}
function gTeamSideHtml(){
  if (!gReady()) return "";
  if (!isOwnSpace()){
    const p = (S.equipeGoogle || []).find(x => x.id === S.space);
    if (!p) return `<p class="note" style="margin:0">${esc(spaceName())} ainda não conectou o Google Agenda.</p>`;
    const t = G.team[p.google_email];
    return `<p class="note" style="margin:0">Mostrando o Google Agenda de ${esc(p.nome)}, de acordo com o que ele(a) compartilha.${t && t.err ? ` <span style="color:var(--danger)">(${esc(t.err)})</span>` : ""}</p>`;
  }
  const others = (S.equipeGoogle || []).filter(p => p.id !== S.me.id);
  if (!others.length) return `<p class="note" style="margin:0">Quando outras pessoas conectarem o Google, você poderá ver as agendas delas aqui.</p>`;
  const sel = prefs().gTeam || [];
  return `<div style="margin-top:4px"><b style="font-size:12px">Agendas da equipe</b>${others.map(p => { const t = G.team[p.google_email];
    return `<label class="chk" style="margin-top:5px"><input type="checkbox" data-gteam="${esc(p.google_email)}" ${sel.includes(p.google_email)?"checked":""}> <span class="dot" style="background:${p.cor}"></span> ${esc(p.nome)}${t && t.err && sel.includes(p.google_email) ? ` <span class="note" style="color:var(--danger)" title="${esc(t.err)}">⚠</span>` : ""}</label>`; }).join("")}</div>`;
}
document.addEventListener("change", async e => {
  const c = e.target.closest("[data-gteam]"); if (!c) return;
  const p = prefs(); const set = new Set(p.gTeam || []);
  c.checked ? set.add(c.dataset.gteam) : set.delete(c.dataset.gteam);
  p.gTeam = [...set]; await savePrefs(p);
  const r = agRange(); await gTeamEnsure(r.from, r.to, false); renderAgenda();
});
function gFind(id, email){
  if (email && G.team[email]) return (G.team[email].events || []).find(e => e.id === id);
  return G.events.find(e => e.id === id);
}

/* ---------- criar / atualizar / cancelar no Google (Meet) ---------- */
function gBody(row, emails){
  const tz = "America/Recife";
  let start, end;
  if (!row.hora_inicio){
    start = { date: row.data };
    end = { date: ymd(addDays(parseYmd(row.tipo !== "missao" && row.data_fim ? row.data_fim : row.data), 1)) };
  } else {
    const hf = row.hora_fim ? hm(row.hora_fim) : minToHm(Math.min(toMin(row.hora_inicio) + 60, 1439));
    start = { dateTime: `${row.data}T${hm(row.hora_inicio)}:00`, timeZone: tz };
    end = { dateTime: `${row.tipo !== "missao" && row.data_fim ? row.data_fim : row.data}T${hf}:00`, timeZone: tz };
  }
  const b = { summary: (row.tipo === "missao" ? "[Missão] " : "") + row.titulo, description: (row.descricao || "") + "\n\nCriado pelo Acompanhamento ADM", location: row.local || "", start, end };
  const rr = recurrenceLines(row); if (rr.length) b.recurrence = rr;
  if (emails) b.attendees = emails.map(email => ({ email }));
  return b;
}
async function gCreateEvent(row, emails){
  const body = gBody(row, emails || []);
  body.conferenceData = { createRequest: { requestId: uuid(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
  const r = await gFetch(`/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`, { method: "POST", body: JSON.stringify(body) });
  const meet = r.hangoutLink || ((r.conferenceData && r.conferenceData.entryPoints) || []).filter(x => x.entryPointType === "video").map(x => x.uri)[0] || null;
  G.events.push(r);
  return { id: r.id, meet };
}
async function gPatchEvent(gid, row){
  const b = gBody(row, null); delete b.attendees;
  return gFetch(`/calendars/primary/events/${encodeURIComponent(gid)}?sendUpdates=all`, { method: "PATCH", body: JSON.stringify(b) });
}
async function gDeleteEvent(gid){
  G.events = G.events.filter(e => e.id !== gid);
  return gFetch(`/calendars/primary/events/${encodeURIComponent(gid)}?sendUpdates=all`, { method: "DELETE" });
}
