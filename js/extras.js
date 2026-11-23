/* ===================== PRIORIDADE · ANEXOS (Google Drive) · ATUALIZAÇÕES NA AGENDA · NOTAS ===================== */
"use strict";

/* ---------- prioridade: alta / média / baixa ---------- */
const PRIO = { alta: { l: "Alta", r: 0, i: "▲" }, media: { l: "Média", r: 1, i: "◆" }, baixa: { l: "Baixa", r: 2, i: "▼" } };
const prioKey = p => p === "alta" || p === "media" || p === "baixa" ? p : "";   // "normal" (antigo), vazio ou nulo = sem prioridade
const prioRankOf = p => { const k = prioKey(p); return k ? PRIO[k].r : 1.5; };
const prioTag = (p, long) => { const k = prioKey(p); if (!k) return ""; return `<span class="tag prio-${k}" title="Prioridade ${PRIO[k].l.toLowerCase()}">${PRIO[k].i} ${long ? "Prioridade " : ""}${PRIO[k].l}</span>`; };
const prioOpts = sel => `<option value="" ${!prioKey(sel) ? "selected" : ""}>— Sem prioridade</option>` + Object.keys(PRIO).map(k => `<option value="${k}" ${prioKey(sel) === k ? "selected" : ""}>${PRIO[k].i} ${PRIO[k].l}</option>`).join("");
const cardColor = cor => cor ? { cls: " colored", st: ` style="--cc:${esc(cor)}"` } : { cls: "", st: "" };

/* ---------- utilidades ---------- */
const fmtSize = n => !n ? "" : n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1).replace(".", ",") + " MB";
function anxIcon(a){
  const t = (a.tipo || "") + " " + (a.nome || "").toLowerCase();
  if (a.tipo === "link") return "🔗";
  if (/image/.test(t)) return "🖼"; if (/pdf/.test(t)) return "📕"; if (/sheet|excel|\.xls|\.csv/.test(t)) return "📗";
  if (/word|document|\.doc/.test(t)) return "📘"; if (/presentation|powerpoint|\.ppt/.test(t)) return "📙";
  if (/zip|rar|compressed/.test(t)) return "🗜"; if (/video/.test(t)) return "🎞"; if (/audio/.test(t)) return "🎵"; return "📄";
}

/* ===================== ANEXOS NO GOOGLE DRIVE ===================== */
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FOLDER = "Acompanhamento Demandas";
const DRIVE_OLD = "Acompanhamento de Demandas";
const DRIVE_SUB = { d: "Kanban", e: "Agenda" };
const DRV = { folder: null, busy: false };
const driveReady = () => gReady() && (G.scopes || "").includes(DRIVE_SCOPE);

function driveConnect(){
  return loadGis().then(() => new Promise((ok, bad) => {
    const scope = gOn() ? GCFG.scope + " " + DRIVE_SCOPE : DRIVE_SCOPE;
    const c = google.accounts.oauth2.initTokenClient({
      client_id: GCFG.clientId, scope, include_granted_scopes: true, hint: (gPref() && gPref().email) || S.me.google_email || undefined,
      callback: async resp => {
        if (resp.error) return bad(new Error(resp.error === "access_denied" ? "Permissão do Google Drive não concedida." : "Google: " + resp.error));
        if (!google.accounts.oauth2.hasGrantedAllScopes(resp, DRIVE_SCOPE)) return bad(new Error('Na tela do Google, marque a permissão do Google Drive para poder anexar arquivos.'));
        G.token = resp.access_token; G.exp = Date.now() + (resp.expires_in || 3600) * 1000; G.scopes = resp.scope || DRIVE_SCOPE;
        if (!G.email){ try { const r = await dFetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)"); G.email = r.user.emailAddress; } catch {} }
        gStore(); ok();
      },
      error_callback: e => bad(new Error(e && e.type === "popup_closed" ? "Janela do Google fechada antes de concluir." : "Não foi possível abrir o login do Google (o navegador pode ter bloqueado a janela).")),
    });
    c.requestAccessToken({ prompt: "" });
  }));
}
async function dFetch(url, opts = {}){
  const r = await fetch(url, { ...opts, headers: { Authorization: "Bearer " + G.token, ...(opts.headers || {}) } });
  if (r.status === 401){ G.token = null; G.exp = 0; G.scopes = ""; try { localStorage.removeItem(gKey()); } catch {} gRenew(); throw new Error('A conexão com o Google expirou. Clique de novo em um instante (o site está renovando) ou em "Reconectar Google Drive".'); }
  if (!r.ok){ let m = r.statusText; try { m = (await r.json()).error.message; } catch {} throw new Error(m); }
  return r.status === 204 ? null : r.json();
}
async function driveFolder(){
  if (DRV.folder && DRV.folder.email === G.email) return DRV.folder.id;
  // uma pasta só: "Acompanhamento Demandas" (a antiga "Acompanhamento de Demandas" é renomeada)
  const q = encodeURIComponent(`(name='${DRIVE_FOLDER}' or name='${DRIVE_OLD}') and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`);
  const r = await dFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&orderBy=createdTime&spaces=drive`);
  const fs = r.files || [];
  const main = fs.find(f => f.name === DRIVE_FOLDER) || fs[0];
  let id = main && main.id;
  if (main && main.name !== DRIVE_FOLDER) await dFetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: DRIVE_FOLDER }) });
  for (const other of fs.filter(f => f !== main)){ // juntar pastas duplicadas na principal
    try {
      const qq = encodeURIComponent(`'${other.id}' in parents and trashed=false`);
      const kids = (await dFetch(`https://www.googleapis.com/drive/v3/files?q=${qq}&fields=files(id)&pageSize=1000`)).files || [];
      for (const k of kids) await dFetch(`https://www.googleapis.com/drive/v3/files/${k.id}?addParents=${id}&removeParents=${other.id}&fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
      await dFetch(`https://www.googleapis.com/drive/v3/files/${other.id}?fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
    } catch(e){ console.warn(e); }
  }
  if (!id){
    const f = await dFetch("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: "application/vnd.google-apps.folder", parents: ["root"], description: "Arquivos do Acompanhamento ADM (Kanban, Agenda e Arquivos)" }) });
    id = f.id;
  }
  DRV.folder = { id, email: G.email, subs: {} };
  return id;
}
async function driveSub(name){
  const root = await driveFolder();
  if (DRV.folder.subs[name]) return DRV.folder.subs[name];
  const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${root}' in parents`);
  const r = await dFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
  let id = r.files && r.files[0] && r.files[0].id;
  if (!id) id = (await dFetch("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [root] }) })).id;
  DRV.folder.subs[name] = id; return id;
}
async function driveUpload(file, onProg, parent){
  const folder = parent || await driveFolder();
  const meta = { name: file.name, parents: [folder] };
  const fields = "id,name,mimeType,size,webViewLink";
  let f;
  if (file.size <= 5 * 1048576){
    const b = "cu" + Math.random().toString(36).slice(2);
    const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`, file, `\r\n--${b}--`]);
    f = await dFetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${fields}`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${b}` }, body });
  } else {
    const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=${fields}`, { method: "POST",
      headers: { Authorization: "Bearer " + G.token, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": file.type || "application/octet-stream", "X-Upload-Content-Length": String(file.size) },
      body: JSON.stringify(meta) });
    const loc = r.ok && r.headers.get("Location");
    if (!loc) throw new Error("O Google Drive não aceitou o envio do arquivo grande.");
    f = await new Promise((ok, bad) => {
      const x = new XMLHttpRequest(); x.open("PUT", loc);
      x.upload.onprogress = e => onProg && e.lengthComputable && onProg(Math.round(e.loaded * 100 / e.total));
      x.onload = () => x.status < 300 ? ok(JSON.parse(x.responseText)) : bad(new Error("Falha no envio (" + x.status + ")."));
      x.onerror = () => bad(new Error("Falha de conexão no envio."));
      x.send(file);
    });
  }
  let shared = true;
  try { await dFetch(`https://www.googleapis.com/drive/v3/files/${f.id}/permissions?sendNotificationEmail=false`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "reader", type: "anyone" }) }); }
  catch { shared = false; }
  return { id: f.id, nome: f.name || file.name, tipo: f.mimeType || file.type || "", tamanho: +(f.size || file.size) || 0,
    link: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`, por: S.me.nome, por_id: S.me.id, conta: G.email || null, em: Date.now(), compartilhado: shared };
}

const anxItem = (kind, id) => kind === "d" ? getD(id) : getE(id);
function anexosHtml(kind, id){
  const it = anxItem(kind, id), list = (it && it.anexos) || [];
  return `<div class="anx" data-anx="${kind}|${id}">
    ${list.length ? `<ul class="anxlist">${list.map(a => `<li><a href="${esc(a.link)}" target="_blank" rel="noopener" title="Abrir no Google Drive"><span class="anxic">${anxIcon(a)}</span><span class="anxn">${esc(a.nome)}</span></a>
      <span class="anxm">${[fmtSize(a.tamanho), a.por, fmtD(a.em)].filter(Boolean).map(esc).join(" · ")}</span>
      <button type="button" class="ckb del" data-anxrm="${esc(a.id)}" title="Tirar do item (o arquivo continua no Drive de quem anexou)">×</button></li>`).join("")}</ul>` : ""}
    <div class="anxbar">${driveReady() ? `<button type="button" class="btn sm" data-anxadd>📎 Anexar arquivo</button>` : `<button type="button" class="btn sm" data-anxcon>📎 Conectar Google Drive para anexar</button>`}
      <button type="button" class="btn sm ghost" data-anxlink>🔗 Link</button>
      <span class="note">Fica no seu Google Drive, em "${DRIVE_FOLDER} › ${DRIVE_SUB[kind] || ""}"</span></div>
    <div class="anxlf" hidden data-nodirty><input class="fld" data-alu placeholder="Cole o link (Google Drive, planilha, site…)"><input class="fld" data-alt placeholder="Título (opcional)" maxlength="200">
      <div class="row"><button type="button" class="btn sm primary" data-alok>Anexar link</button><button type="button" class="btn sm ghost" data-alcancel>Cancelar</button></div></div>
    <input type="file" multiple hidden data-anxfile><div class="anxprog note"></div></div>`;
}
function refreshAnx(kind, id){
  $$(`[data-anx="${kind}|${id}"]`).forEach(b => { b.outerHTML = anexosHtml(kind, id); });
}
async function saveAnexos(kind, id, list, texto){
  if (kind === "d"){
    await updateD(id, it => { it.anexos = list; it.historico.push(actorTag({ tipo: "edicao", em: Date.now(), texto })); });
  } else {
    const cur = getE(id); if (!cur) return;
    if (cur.grupo){
      cur.anexos = list; renderAll();
      try { await API.rpc("grupo_anexos", { g: cur.grupo, p_anexos: list }); } catch(e){ toast("Não foi possível salvar o anexo para todos: " + errMsg(e), true); }
    } else {
      const it = clone(cur); it.anexos = list; it.historico = [...(it.historico || []), actorTag({ tipo: "edicao", em: Date.now(), texto })]; it.atualizado_em = Date.now();
      Object.assign(cur, it); renderAll(); await persist("eventos", it);
    }
  }
  refreshAnx(kind, id);
}
document.addEventListener("click", async e => {
  const box = e.target.closest("[data-anx]"); if (!box) return;
  const [kind, id] = box.dataset.anx.split("|");
  if (e.target.closest("[data-anxcon]")){
    try { await driveConnect(); toast("Google Drive conectado. Agora é só anexar."); refreshAnx(kind, id); } catch(ex){ toast(ex.message, true); }
    return;
  }
  if (e.target.closest("[data-anxadd]")){ box.querySelector("[data-anxfile]").click(); return; }
  if (e.target.closest("[data-anxlink]")){
    const f = box.querySelector(".anxlf"); f.hidden = !f.hidden; if (!f.hidden) f.querySelector("[data-alu]").focus(); return;
  }
  if (e.target.closest("[data-alcancel]")){ box.querySelector(".anxlf").hidden = true; return; }
  if (e.target.closest("[data-alok]")){
    const f = box.querySelector(".anxlf"); let u = f.querySelector("[data-alu]").value.trim(); if (!u){ f.querySelector("[data-alu]").focus(); return; }
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    const t = f.querySelector("[data-alt]").value.trim() || u.replace(/^https?:\/\//, "").slice(0, 80);
    const it = anxItem(kind, id); if (!it) return;
    await saveAnexos(kind, id, [...(it.anexos || []), { id: "l" + Date.now().toString(36), nome: t, tipo: "link", link: u, por: S.me.nome, por_id: S.me.id, em: Date.now() }], "Link anexado: " + t);
    toast("Link anexado."); return;
  }
  const rm = e.target.closest("[data-anxrm]");
  if (rm){
    const it = anxItem(kind, id); const a = ((it && it.anexos) || []).find(x => x.id === rm.dataset.anxrm); if (!a) return;
    confirmBox("Tirar este anexo?", `"${a.nome}" sai deste item. O arquivo continua no Google Drive de ${a.por || "quem anexou"}.`, "Tirar", () =>
      saveAnexos(kind, id, it.anexos.filter(x => x !== a), `Anexo removido: ${a.nome}`).then(() => toast("Anexo retirado.")));
  }
});
document.addEventListener("change", async e => {
  if (!e.target.matches || !e.target.matches("[data-anxfile]")) return;
  const box = e.target.closest("[data-anx]"), [kind, id] = box.dataset.anx.split("|");
  const files = [...e.target.files]; e.target.value = ""; if (!files.length) return;
  const big = files.find(f => f.size > 500 * 1048576); if (big){ toast(`"${big.name}" passa de 500 MB.`, true); return; }
  const prog = box.querySelector(".anxprog"), added = [];
  for (const [n, f] of files.entries()){
    const label = `Enviando ${files.length > 1 ? `${n + 1} de ${files.length}: ` : ""}${f.name}…`;
    prog.textContent = label;
    try { added.push(await driveUpload(f, p => { prog.textContent = `${label} ${p}%`; }, await driveSub(DRIVE_SUB[kind] || "Outros"))); }
    catch(ex){ toast(`Não foi possível enviar "${f.name}": ${errMsg(ex)}`, true); }
  }
  prog.textContent = "";
  if (!added.length) return;
  const it = anxItem(kind, id); if (!it) return;
  await saveAnexos(kind, id, [...(it.anexos || []), ...added], "Anexo: " + added.map(a => a.nome).join(", "));
  toast(added.length > 1 ? `${added.length} arquivos anexados.` : "Arquivo anexado.");
  if (added.some(a => !a.compartilhado)) toast("Arquivo salvo no seu Drive, mas sua conta não permite compartilhar por link: quem abrir pode precisar pedir acesso.", true);
});

/* ===================== ATUALIZAÇÕES DENTRO DA AGENDA ===================== */
function evUpdHtml(id){
  const ev = getE(id), notes = ((ev && ev.historico) || []).filter(h => h.tipo === "nota").sort((a, z) => z.em - a.em);
  return `<div class="evupd" data-eupdbox="${id}" data-nodirty>
    <div class="upd"><input class="fld" data-eupdin placeholder="Registrar andamento… (Enter)"><button type="button" class="btn sm primary" data-eupd>Registrar</button></div>
    ${notes.length ? `<ul class="timeline" style="margin-top:8px">${notes.map(n => `<li class="nota"><div class="tl-when">${fmt(n.em)}${n.por ? " · " + esc(n.por) : ""}${n.editadoEm ? ` <span class="note">(editada)</span>` : ""}<span class="nacts updacts"><button type="button" data-eupe="${n.em}" title="Editar">✏️</button><button type="button" data-eupx="${n.em}" title="Excluir">🗑</button></span></div><div class="tl-what">${esc(n.texto)}</div></li>`).join("")}</ul>`
      : `<p class="note" style="margin:6px 0 0">Nenhuma atualização ainda.</p>`}</div>`;
}
async function addNoteE(id, texto){
  const cur = getE(id); texto = (texto || "").trim(); if (!cur || !texto) return;
  if (cur.grupo){
    cur.historico = [...(cur.historico || []), { tipo: "nota", em: Date.now(), texto, por: S.me.nome }];
    try { await API.rpc("grupo_nota", { g: cur.grupo, p_texto: texto }); } catch(e){ toast("Não foi possível registrar: " + errMsg(e), true); }
  } else {
    const it = clone(cur); it.historico = [...(it.historico || []), actorTag({ tipo: "nota", em: Date.now(), texto })]; it.atualizado_em = Date.now();
    Object.assign(cur, it); persist("eventos", it);
  }
  $$(`[data-eupdbox="${id}"]`).forEach(b => { b.outerHTML = evUpdHtml(id); });
  if (!modalOpen()) renderAll();
  toast(cur.grupo ? "Atualização registrada para todos." : "Atualização registrada.");
}
function eupdSubmit(box){ const inp = box.querySelector("[data-eupdin]"); const v = inp.value.trim(); if (!v) return; inp.value = ""; addNoteE(box.dataset.eupdbox, v); }
document.addEventListener("click", e => { const b = e.target.closest("[data-eupd]"); if (b) eupdSubmit(b.closest("[data-eupdbox]")); });
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches && e.target.matches("[data-eupdin]")){ e.preventDefault(); eupdSubmit(e.target.closest("[data-eupdbox]")); } });

/* ===================== NOTAS (estilo Google Keep) ===================== */
const NOTE_CORES = [null, "#f28b82", "#fbbc04", "#fff475", "#ccff90", "#a7ffeb", "#cbf0f8", "#aecbfa", "#d7aefb", "#fdcfe8", "#e6c9a8", "#e8eaed"];
const NOTE_NOMES = ["Padrão", "Vermelho", "Laranja", "Amarelo", "Verde", "Verde-água", "Azul-claro", "Azul", "Roxo", "Rosa", "Marrom", "Cinza"];
const N = { q: "", arq: false, loaded: false, lab: "" };
async function loadNotas(){
  try { S.notas = await API.list("notas", S.me.id); N.loaded = true; }
  catch(e){ S.notas = S.notas || []; N.err = errMsg(e); }
}
const noteMatch = n => { if (N.lab && !(n.marcadores || []).includes(N.lab)) return false; const q = N.q.trim().toLowerCase(); if (!q) return true;
  return (n.titulo + " " + n.texto + " " + (n.itens || []).map(i => i.texto).join(" ") + " " + (n.marcadores || []).join(" ")).toLowerCase().includes(q); };
const noteEmpty = n => !n.titulo.trim() && !n.texto.trim() && !(n.itens || []).some(i => i.texto.trim());
function noteCard(n){
  const it = n.itens || [], pend = it.filter(i => !i.feito), done = it.filter(i => i.feito);
  const show = [...pend, ...done].slice(0, 8);
  return `<article class="ncard" data-nota="${n.id}" ${n.cor ? `style="--nc:${n.cor}"` : ""}>
    <button class="npin ${n.fixada ? "on" : ""}" data-npin="${n.id}" title="${n.fixada ? "Desafixar" : "Fixar"}">📌</button>
    ${n.titulo ? `<h4>${esc(n.titulo)}</h4>` : ""}
    ${n.texto ? `<div class="ntxt">${esc(n.texto)}</div>` : ""}
    ${it.length ? `<ul class="nitems">${show.map(i => `<li class="${i.feito ? "done" : ""}"><input type="checkbox" data-nck="${n.id}|${i.id}" ${i.feito ? "checked" : ""}><span>${esc(i.texto)}</span></li>`).join("")}</ul>
      ${it.length > show.length ? `<div class="note">+ ${it.length - show.length} item(ns)</div>` : ""}` : ""}
    ${(n.marcadores || []).length ? `<div class="nlabels">${n.marcadores.map(l => `<span class="nlabel" data-nlabf="${esc(l)}">🏷 ${esc(l)}</span>`).join("")}</div>` : ""}
    <div class="nfoot"><span class="note">${fmtD(n.atualizado_em)}</span><span class="nacts">
      <button data-narq="${n.id}" title="${n.arquivada ? "Desarquivar" : "Arquivar"}">${n.arquivada ? "📤" : "🗄"}</button>
      <button data-ndelx="${n.id}" title="Excluir">🗑</button></span></div></article>`;
}
function renderNotas(){
  const v = $("#v-notas");
  if (!N.loaded){ v.innerHTML = `<div class="empty" style="padding:40px"><div class="spinner" style="margin:auto"></div></div>`; loadNotas().then(() => S.view === "notas" && renderNotas()); return; }
  const all = (S.notas || []).filter(n => !!n.arquivada === N.arq && noteMatch(n)).sort((a, z) => z.atualizado_em - a.atualizado_em);
  const fix = all.filter(n => n.fixada), outras = all.filter(n => !n.fixada);
  const narq = (S.notas || []).filter(n => n.arquivada).length;
  v.innerHTML = `<div class="nwrap">
    <div class="kbar">
      <div class="ksearch"><span>🔎</span><input id="nSearch" placeholder="Pesquisar nas notas…" value="${esc(N.q)}"></div>
      <div class="seg"><button data-narqv="0" class="${!N.arq ? "on" : ""}">📝 Notas</button><button data-narqv="1" class="${N.arq ? "on" : ""}">🗄 Arquivadas${narq ? ` (${narq})` : ""}</button></div>
    </div>
    ${`<div class="nlabbar"><button class="nlabel ${!N.lab ? "on" : ""}" data-nlabf="">Todas</button>${labelsAll().map(l => `<button class="nlabel ${N.lab === l ? "on" : ""}" data-nlabf="${esc(l)}">🏷 ${esc(l)}</button>`).join("")}<button class="nlabel ghostl" data-nlman title="Criar, renomear e excluir marcadores">✏️ Editar marcadores</button></div>`}
    ${!N.arq ? `<div class="ncompose"><button class="ncin" data-nnew="texto">Criar uma nota…</button><button class="btn ghost" data-nnew="lista" title="Nova lista">☑ Lista</button></div>` : ""}
    ${!isOwnSpace() ? `<p class="note" style="text-align:center">As notas são pessoais: aqui aparecem sempre as suas, nunca as de outra pessoa.</p>` : ""}
    ${fix.length ? `<h5 class="nsec">📌 Fixadas</h5><div class="ngrid">${fix.map(noteCard).join("")}</div>${outras.length ? `<h5 class="nsec">Outras</h5>` : ""}` : ""}
    ${outras.length ? `<div class="ngrid">${outras.map(noteCard).join("")}</div>` : ""}
    ${!all.length ? `<div class="nempty">${N.q ? "Nenhuma nota encontrada." : N.arq ? "Nenhuma nota arquivada." : "💡 Suas notas aparecem aqui.<br><span class=\"note\">Anote ideias, listas e lembretes rápidos. Só você vê.</span>"}</div>` : ""}
  </div>`;
  const s = $("#nSearch");
  s.oninput = () => { const p = s.selectionStart; N.q = s.value; renderNotas(); const n = $("#nSearch"); n.focus(); n.setSelectionRange(p, p); };
}
function saveNota(n){
  n.atualizado_em = Date.now();
  const i = S.notas.findIndex(x => x.id === n.id);
  if (i >= 0) S.notas[i] = n; else S.notas.push(n);
  if (S.view === "notas") renderNotas();
  return persist("notas", n);
}
function delNota(id){
  confirmBox("Excluir esta nota?", "Ela será apagada de vez.", "Excluir", async () => {
    closeModal(true); S.notas = S.notas.filter(x => x.id !== id); renderNotas(); await remove("notas", id); toast("Nota excluída."); });
}
document.addEventListener("click", e => {
  if (S.view !== "notas" || e.target.closest("#modalRoot")) return;
  const t = e.target;
  const nv = t.closest("[data-narqv]"); if (nv){ N.arq = nv.dataset.narqv === "1"; renderNotas(); return; }
  const nn = t.closest("[data-nnew]"); if (nn){ openNota(null, nn.dataset.nnew === "lista"); return; }
  const getN = id => S.notas.find(x => x.id === id);
  const pin = t.closest("[data-npin]"); if (pin){ const n = clone(getN(pin.dataset.npin)); n.fixada = !n.fixada; if (n.fixada) n.arquivada = false; saveNota(n); return; }
  const arq = t.closest("[data-narq]"); if (arq){ const n = clone(getN(arq.dataset.narq)); n.arquivada = !n.arquivada; if (n.arquivada) n.fixada = false; saveNota(n); toast(n.arquivada ? "Nota arquivada." : "Nota de volta às notas."); return; }
  const dl = t.closest("[data-ndelx]"); if (dl){ delNota(dl.dataset.ndelx); return; }
  const ck = t.closest("[data-nck]");
  if (ck){ const [nid, iid] = ck.dataset.nck.split("|"); const n = clone(getN(nid)); const i = n.itens.find(x => x.id === iid); i.feito = ck.checked; saveNota(n); return; }
  if (t.closest("[data-nlman]")){ openMarcadores(); return; }
  const lf = t.closest("[data-nlabf]"); if (lf){ N.lab = N.lab === lf.dataset.nlabf ? "" : lf.dataset.nlabf; renderNotas(); return; }
  const card = t.closest("[data-nota]"); if (card) openNotaView(card.dataset.nota);
});

function openNota(id, lista){
  const orig = id ? S.notas.find(x => x.id === id) : null;
  const now = Date.now();
  const d = orig ? clone(orig) : { id: uuid(), dono: S.me.id, titulo: "", texto: "", cor: null, fixada: false, arquivada: false, itens: [], criado_em: now, atualizado_em: now };
  d.itens = d.itens || []; d.marcadores = d.marcadores || [];
  if (!orig && N.lab) d.marcadores.push(N.lab);
  let modoLista = orig ? d.itens.length > 0 : !!lista;
  if (modoLista && !d.itens.length) d.itens.push({ id: uuid(), texto: "", feito: false });
  const snap = JSON.stringify(d);
  const itemsHtml = () => {
    const pend = d.itens.filter(i => !i.feito), done = d.itens.filter(i => i.feito);
    const li = i => `<li class="${i.feito ? "done" : ""}"><input type="checkbox" data-nik="${i.id}" ${i.feito ? "checked" : ""}><input class="nit" data-nit="${i.id}" value="${esc(i.texto)}" placeholder="Item da lista"><button type="button" class="ckb del" data-nidel="${i.id}" title="Remover">×</button></li>`;
    return `<ul class="nlist">${pend.map(li).join("")}</ul><button type="button" class="btn ghost sm" data-niadd>＋ Item</button>
      ${done.length ? `<div class="note" style="margin:8px 0 2px">${done.length} item(ns) marcado(s)</div><ul class="nlist">${done.map(li).join("")}</ul>` : ""}`;
  };
  const body = () => modoLista ? itemsHtml() : `<textarea class="ntext" id="nTx" placeholder="Criar uma nota…">${esc(d.texto)}</textarea>`;
  const ov = overlay(`<div class="nedit" ${d.cor ? `style="--nc:${d.cor}"` : ""} id="nEd">
    <div class="nedhead"><input class="ntitle" id="nTi" placeholder="Título" value="${esc(d.titulo)}"><button type="button" class="npin ${d.fixada ? "on" : ""}" id="nPin" title="Fixar">📌</button></div>
    <div id="nBody">${body()}</div>
    <div id="nLabBox">${labelsEditorHtml(d.marcadores, false, "")}</div>
    <div class="nfoot" style="margin-top:12px">
      <div class="ncolors">${NOTE_CORES.map((c, i) => `<button type="button" class="ncol ${(d.cor || null) === c ? "on" : ""}" data-ncor="${c || ""}" title="${NOTE_NOMES[i]}" style="${c ? `background:${c}` : ""}"></button>`).join("")}</div>
      <span class="nacts">
        <button type="button" id="nMode" title="${modoLista ? "Mostrar como texto" : "Mostrar caixas de seleção"}">${modoLista ? "📝" : "☑"}</button>
        <button type="button" id="nArq" title="${d.arquivada ? "Desarquivar" : "Arquivar"}">${d.arquivada ? "📤" : "🗄"}</button>
        ${orig ? `<button type="button" id="nDel" title="Excluir">🗑</button>` : ""}
        <button type="button" class="btn sm" data-close>Fechar</button></span></div>
    ${orig ? `<div class="note" style="margin-top:6px;text-align:right">Editada ${fmt(d.atualizado_em)}</div>` : ""}</div>`, "mid nmodal", {
    onClose: () => {
      d.titulo = d.titulo.trim(); d.itens = d.itens.filter(i => i.texto.trim());
      if (!orig && noteEmpty(d)) return;
      if (orig && noteEmpty(d)){ toast("Nota vazia descartada."); S.notas = S.notas.filter(x => x.id !== d.id); renderNotas(); remove("notas", d.id); return; }
      if (JSON.stringify(d) !== snap) saveNota(d);
    },
  });
  const redraw = () => { $("#nBody").innerHTML = body(); };
  const lab = { open: false, q: "" };
  const labRedraw = foco => { $("#nLabBox").innerHTML = labelsEditorHtml(d.marcadores, lab.open, lab.q); const i = $("#nLabIn"); if (foco && i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
  const focusItem = iid => { const el = ov.querySelector(`[data-nit="${iid}"]`); if (el) el.focus(); };
  const addItem = after => { const ni = { id: uuid(), texto: "", feito: false }; const k = after ? d.itens.findIndex(x => x.id === after) + 1 : d.itens.length; d.itens.splice(k, 0, ni); redraw(); focusItem(ni.id); };
  ov.addEventListener("input", e => {
    if (e.target.id === "nLabIn"){ lab.q = e.target.value; labRedraw(true); return; }
    if (e.target.id === "nTi") d.titulo = e.target.value;
    if (e.target.id === "nTx") d.texto = e.target.value;
    const k = e.target.dataset.nit; if (k){ const i = d.itens.find(x => x.id === k); if (i) i.texto = e.target.value; }
  });
  ov.addEventListener("keydown", e => {
    const k = e.target.dataset && e.target.dataset.nit;
    if (k && e.key === "Enter"){ e.preventDefault(); addItem(k); }
    if (k && e.key === "Backspace" && !e.target.value && d.itens.length > 1){ e.preventDefault(); const idx = d.itens.findIndex(x => x.id === k); d.itens.splice(idx, 1); redraw(); const prev = d.itens[Math.max(0, idx - 1)]; prev && focusItem(prev.id); }
    if (e.target.id === "nLabIn" && e.key === "Enter"){ e.preventDefault(); const v = e.target.value.trim().replace(/\s+/g, " "); if (!v) return;
      const ex = labelsAll().find(x => x.toLowerCase() === v.toLowerCase());
      if (ex){ if (!d.marcadores.includes(ex)) d.marcadores.push(ex); } else { labelCriar(v); d.marcadores.push(v); }
      lab.q = ""; labRedraw(true); return; }
    if (e.target.id === "nLabIn" && e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); lab.open = false; labRedraw(); return; }
    if (e.target.id === "nTi" && e.key === "Enter"){ e.preventDefault(); const nx = ov.querySelector("#nTx, [data-nit]"); nx && nx.focus(); }
  });
  ov.addEventListener("click", e => {
    const t = e.target;
    const c = t.closest("[data-ncor]");
    if (c){ d.cor = c.dataset.ncor || null; [...ov.querySelectorAll(".ncol")].forEach(x => x.classList.toggle("on", x === c)); const ed = $("#nEd"); d.cor ? ed.style.setProperty("--nc", d.cor) : ed.style.removeProperty("--nc"); return; }
    const lr = t.closest("[data-nlrm]"); if (lr){ d.marcadores = d.marcadores.filter(x => x !== lr.dataset.nlrm); labRedraw(); return; }
    if (t.closest("[data-nlopen]")){ lab.open = !lab.open; lab.q = ""; labRedraw(lab.open); return; }
    const lc = t.closest("[data-nlck]"); if (lc){ const l = lc.dataset.nlck; d.marcadores = lc.checked ? [...new Set([...d.marcadores, l])] : d.marcadores.filter(x => x !== l); labRedraw(true); return; }
    const ln = t.closest("[data-nlnew]"); if (ln){ const v = lab.q.trim().replace(/\s+/g, " "); if (v){ labelCriar(v); d.marcadores.push(v); lab.q = ""; } labRedraw(true); return; }
    if (t.closest("#nPin")){ d.fixada = !d.fixada; if (d.fixada) d.arquivada = false; $("#nPin").classList.toggle("on", d.fixada); return; }
    if (t.closest("#nArq")){ d.arquivada = !d.arquivada; if (d.arquivada) d.fixada = false; closeModal(true); toast(d.arquivada ? "Nota arquivada." : "Nota de volta às notas."); return; }
    if (t.closest("#nDel")){ delNota(d.id); return; }
    if (t.closest("#nMode")){
      if (modoLista){ d.texto = [d.texto, ...d.itens.filter(i => i.texto.trim()).map(i => (i.feito ? "✓ " : "") + i.texto)].filter(Boolean).join("\n"); d.itens = []; modoLista = false; }
      else { d.itens = d.texto.split("\n").map(s => s.trim()).filter(Boolean).map(s => ({ id: uuid(), texto: s.replace(/^[-•✓*]\s*/, ""), feito: /^✓/.test(s) })); d.texto = ""; if (!d.itens.length) d.itens.push({ id: uuid(), texto: "", feito: false }); modoLista = true; }
      $("#nMode").textContent = modoLista ? "📝" : "☑"; $("#nMode").title = modoLista ? "Mostrar como texto" : "Mostrar caixas de seleção"; redraw(); return;
    }
    if (t.closest("[data-niadd]")){ addItem(null); return; }
    const kc = t.closest("[data-nik]"); if (kc){ const i = d.itens.find(x => x.id === kc.dataset.nik); i.feito = kc.checked; redraw(); return; }
    const kd = t.closest("[data-nidel]"); if (kd){ d.itens = d.itens.filter(x => x.id !== kd.dataset.nidel); redraw(); return; }
  });
  setTimeout(() => { const el = orig ? null : (modoLista ? ov.querySelector("[data-nit]") : $("#nTx")); el && el.focus(); }, 30);
}

/* ===================== KANBAN: mover e inserir quadros (lados, em cima, embaixo) ===================== */
const canMoveCols = () => isOwnSpace() && !isMob();
let colDrag = null;
async function saveColsList(list, msg){
  const p = prefs(); p.colunas = list.map(c => ({ key: c.key, label: c.label, color: c.color, lado: c.lado, junto: c.lado !== "lateral" && !!c.junto }));
  await savePrefs(p); applySpaceCols(); renderAll(); if (msg) toast(msg);
}
/* coloca "item" na posição "pos" (esquerda | direita | cima | baixo) em relação ao quadro "refKey" */
function placeCol(list, item, refKey, pos){
  const i0 = list.indexOf(item);
  if (i0 >= 0){ // tirar da posição antiga sem desmontar a pilha de baixo
    const nx = list[i0 + 1];
    if (nx && nx.junto && !item.junto && item.lado !== "lateral") nx.junto = false;
    list.splice(i0, 1);
  }
  const ref = list.find(c => c.key === refKey); let at = list.indexOf(ref);
  if (ref.lado === "lateral"){
    item.lado = "lateral"; item.junto = false;
    list.splice(at + (pos === "baixo" || pos === "direita" ? 1 : 0), 0, item); return list;
  }
  item.lado = "principal";
  if (pos === "cima"){ item.junto = !!ref.junto; ref.junto = true; list.splice(at, 0, item); }
  else if (pos === "baixo"){ item.junto = true; list.splice(at + 1, 0, item); }
  else {
    let st = at; while (st > 0 && list[st].junto && list[st - 1].lado !== "lateral") st--;
    let en = at; while (list[en + 1] && list[en + 1].junto) en++;
    item.junto = false;
    list.splice(pos === "esquerda" ? st : en + 1, 0, item);
  }
  return list;
}
document.addEventListener("dragstart", e => {
  const h = e.target.closest && e.target.closest("[data-colkey]"); if (!h) return;
  colDrag = h.dataset.colkey; h.closest(".col").classList.add("coldragging");
  try { e.dataTransfer.setData("text/plain", "col:" + colDrag); e.dataTransfer.effectAllowed = "move"; } catch {}
});
const COLMARK = ["colbefore","colafter","colabove","colbelow"];
document.addEventListener("dragend", () => { colDrag = null; $$(".coldragging," + COLMARK.map(c => "." + c).join(",")).forEach(x => x.classList.remove("coldragging", ...COLMARK)); });
function colDropPos(col, e){
  const r = col.getBoundingClientRect(), y = e.clientY - r.top, x = e.clientX - r.left;
  if (col.closest(".stack") && col.dataset.lat) return y < r.height / 2 ? "cima" : "baixo";
  const edge = Math.min(80, r.height * 0.25);
  if (y < edge) return "cima";
  if (y > r.height - edge) return "baixo";
  return x < r.width / 2 ? "esquerda" : "direita";
}
const POSCLS = { esquerda: "colbefore", direita: "colafter", cima: "colabove", baixo: "colbelow" };
document.addEventListener("dragover", e => {
  if (!colDrag) return; const col = e.target.closest && e.target.closest(".col[data-col]"); if (!col) return;
  e.preventDefault(); $$(COLMARK.map(c => "." + c).join(",")).forEach(x => x.classList.remove(...COLMARK));
  if (col.dataset.col !== colDrag) col.classList.add(POSCLS[colDropPos(col, e)]);
});
document.addEventListener("drop", e => {
  if (!colDrag) return; const col = e.target.closest && e.target.closest(".col[data-col]"); if (!col) return;
  e.preventDefault(); const from = colDrag, to = col.dataset.col, pos = colDropPos(col, e); colDrag = null;
  if (from === to) return;
  const list = COLS.map(c => ({ ...c })), item = list.find(c => c.key === from);
  placeCol(list, item, to, pos);
  if (!list.some(c => c.lado !== "lateral")){ toast("Deixe pelo menos um quadro na área principal.", true); return; }
  saveColsList(list, `"${item.label}" mudou de lugar.`);
});
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-colins]"); if (!b) return;
  e.stopPropagation(); openNewCol(b.dataset.colins);
});
function openNewCol(refKey){
  if (!COLS.find(c => c.key === refKey)) refKey = (COLS.find(c => c.lado !== "lateral") || COLS[0]).key;
  const ov = overlay(`<div class="mhead"><div class="mt">＋ Novo quadro</div><button class="x" data-close>×</button></div>
    <form class="mbody" id="ncForm">
      <label class="f">Nome do quadro</label><input class="fld" id="ncN" maxlength="60" placeholder="Ex.: Aguardando fornecedor" required>
      <label class="f" style="margin-top:12px">Cor</label>${swatchesHtml(CORES[COLS.length % CORES.length], "nccor")}
      <label class="f" style="margin-top:12px">Onde colocar</label>
      <div class="grid2"><select class="fld" id="ncPos"><option value="direita">À direita de</option><option value="esquerda">À esquerda de</option><option value="baixo">Embaixo de</option><option value="cima">Em cima de</option></select>
      <select class="fld" id="ncRef">${COLS.map(c => `<option value="${c.key}" ${c.key === refKey ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select></div>
      <p class="note">Dica: no computador, arraste o título de qualquer quadro (⠿) para os lados, para cima ou para baixo de outro.</p>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Criar quadro</button></div>
    </form>`, "small");
  setTimeout(() => $("#ncN").focus(), 30);
  $("#ncForm").onsubmit = ev => {
    ev.preventDefault(); const label = $("#ncN").value.trim(); if (!label) return;
    const list = COLS.map(c => ({ ...c }));
    const nc = { key: "q_" + Math.random().toString(36).slice(2, 8), label, color: swValue(ov, "nccor") || CORES[0], lado: "principal", junto: false };
    placeCol(list, nc, $("#ncRef").value, $("#ncPos").value);
    closeModal(true); if (isMob()) K.mcol = nc.key;
    saveColsList(list, `Quadro "${label}" criado.`);
  };
}

/* ===================== HISTÓRICO: ler mais / ler menos ===================== */
const TL_SHOW = 4, TL_OPEN = new Set();
const tlKey = ul => (ul.id || "tl") + "|" + ((ul.closest("[data-eupdbox]") || {}).dataset?.eupdbox || K.openId || "");
function tidyTimelines(){
  $$("ul.timeline:not([data-tlx])").forEach(ul => {
    ul.dataset.tlx = "1";
    const lis = [...ul.children].filter(li => li.tagName === "LI" && !li.classList.contains("tlmore"));
    lis.forEach(li => {
      const w = li.querySelector(".tl-what"); if (!w || w.querySelector("textarea")) return;
      w.classList.add("clamp");
      if (w.scrollHeight > w.clientHeight + 2){
        const b = document.createElement("button"); b.type = "button"; b.className = "lnk tlread"; b.textContent = "ler mais";
        b.onclick = ev => { ev.stopPropagation(); const o = w.classList.toggle("clamp"); b.textContent = o ? "ler mais" : "ler menos"; };
        w.after(b);
      } else w.classList.remove("clamp");
    });
    if (lis.length <= TL_SHOW) return;
    const key = tlKey(ul), apply = () => { const open = TL_OPEN.has(key); lis.forEach((li, i) => li.classList.toggle("tlhide", !open && i >= TL_SHOW));
      more.querySelector("button").textContent = open ? "▴ Ver menos" : `▾ Ver mais (${lis.length - TL_SHOW} anteriores)`; };
    const more = document.createElement("li"); more.className = "tlmore"; more.innerHTML = `<button type="button" class="btn ghost sm"></button>`;
    more.querySelector("button").onclick = ev => { ev.stopPropagation(); TL_OPEN.has(key) ? TL_OPEN.delete(key) : TL_OPEN.add(key); apply(); };
    ul.appendChild(more); apply();
  });
}
let tlRaf = 0;
new MutationObserver(() => { if (!tlRaf) tlRaf = requestAnimationFrame(() => { tlRaf = 0; tidyTimelines(); }); })
  .observe(document.getElementById("modalRoot"), { childList: true, subtree: true });
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.matches && e.target.matches("[data-alu],[data-alt]")){ e.preventDefault(); e.target.closest(".anxlf").querySelector("[data-alok]").click(); }
}, true);
