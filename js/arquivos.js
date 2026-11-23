/* ===================== ARQUIVOS (Google Drive de quem está conectado) ===================== */
"use strict";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const FX = { stack: [], items: [], loading: false, err: "", q: "", email: null, tree: null };
const FFIELDS = "id,name,mimeType,size,modifiedTime,webViewLink,appProperties,parents,description";
const isFolder = f => f.mimeType === FOLDER_MIME;
const isLink = f => f.appProperties && f.appProperties.acomp === "link";
const fxCur = () => FX.stack[FX.stack.length - 1];
function fxIcon(f){ if (isFolder(f)) return "📁"; if (isLink(f)) return "🔗"; return anxIcon({ tipo: f.mimeType, nome: f.name }); }
const fxDate = s => s ? new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";
const linkUrl = f => f.description || "";
const fxOpenUrl = f => isLink(f) ? linkUrl(f) : (f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`);
const normUrl = u => { u = (u || "").trim(); return /^https?:\/\//i.test(u) ? u : u ? "https://" + u : ""; };

async function fxLoad(){
  if (!driveReady()) return;
  FX.loading = true; FX.err = ""; renderArquivos();
  try {
    if (!FX.stack.length || FX.email !== G.email){ FX.stack = [{ id: await driveFolder(), name: DRIVE_FOLDER }]; FX.email = G.email; }
    const q = encodeURIComponent(`'${fxCur().id}' in parents and trashed=false`);
    const r = await dFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(${FFIELDS})&orderBy=folder,name_natural&pageSize=1000&spaces=drive`);
    FX.items = r.files || [];
  } catch(e){ FX.err = errMsg(e); }
  FX.loading = false; if (S.view === "arquivos") renderArquivos();
}
function renderArquivos(){
  const v = $("#v-arquivos");
  if (!driveReady()){
    v.innerHTML = `<div class="fxwrap"><div class="fxconnect">
      <div style="font-size:42px">📁</div><h2>Seus arquivos no Google Drive</h2>
      <p>Guarde arquivos e links, crie pastas e dê nomes do seu jeito. Tudo fica no Google Drive da conta que você conectar, dentro da pasta <b>"${DRIVE_FOLDER}"</b>: nada fica salvo no site.</p>
      <button class="btn primary" id="fxCon">🔗 Conectar Google Drive</button>
      <p class="note">Na primeira vez o Google pede permissão para o app criar e abrir os arquivos dele no seu Drive.</p></div></div>`;
    $("#fxCon").onclick = async () => { try { await driveConnect(); FX.stack = []; toast("Google Drive conectado."); fxLoad(); } catch(ex){ toast(ex.message, true); } };
    return;
  }
  if ((FX.stale || !FX.stack.length) && !FX.loading && !FX.err){ FX.stale = false; fxLoad(); return; }
  const q = FX.q.trim().toLowerCase();
  const items = FX.items.filter(f => !q || f.name.toLowerCase().includes(q) || (isLink(f) && linkUrl(f).toLowerCase().includes(q)));
  v.innerHTML = `<div class="fxwrap" id="fxDrop">
    <div class="fxbar">
      <nav class="fxcrumbs">${FX.stack.map((s, i) => `${i ? `<span class="sep">›</span>` : ""}<button data-fxgo="${i}" class="${i === FX.stack.length - 1 ? "on" : ""}">${i ? esc(s.name) : "📁 " + esc(s.name)}</button>`).join("")}</nav>
      <div class="spacer"></div>
      <div class="ksearch fxs"><span>🔎</span><input id="fxQ" placeholder="Procurar nesta pasta…" value="${esc(FX.q)}"></div>
    </div>
    <div class="fxacts">
      <button class="btn primary" data-fx="up">⬆ Enviar arquivo</button>
      <button class="btn" data-fx="link">🔗 Adicionar link</button>
      <button class="btn" data-fx="folder">＋ Nova pasta</button>
      <div class="spacer"></div>
      <span class="note fxacc" title="Conta do Google conectada">☁ ${esc(G.email || "Google Drive")}</span>
      <button class="btn ghost sm" data-fx="reload" title="Atualizar">⟳</button>
      <input type="file" id="fxFile" multiple hidden>
    </div>
    <div class="fxprog note" id="fxProg"></div>
    ${FX.err ? `<div class="banner" style="margin:10px 0">⚠ ${esc(FX.err)} <button class="btn sm" data-fx="reload">Tentar de novo</button></div>` : ""}
    ${FX.loading && !FX.items.length ? `<div class="empty" style="padding:40px"><div class="spinner" style="margin:auto"></div></div>` :
      items.length ? `<div class="fxlist">${items.map(f => `<div class="fxrow" data-fxid="${f.id}">
        <span class="fxic">${fxIcon(f)}</span>
        <div class="fxname"><b>${esc(f.name)}</b><span class="note">${isFolder(f) ? "Pasta" : isLink(f) ? esc(linkUrl(f)) : [fmtSize(+f.size || 0), fxDate(f.modifiedTime)].filter(Boolean).join(" · ")}</span></div>
        <div class="fxbtns">
          ${!isFolder(f) ? `<a class="btn ghost sm" href="${esc(fxOpenUrl(f))}" target="_blank" rel="noopener" title="Abrir">↗</a>` : ""}
          ${!isFolder(f) && !isLink(f) ? `<button class="btn ghost sm" data-fxa="copy" title="Copiar link do Drive">⧉</button>` : isLink(f) ? `<button class="btn ghost sm" data-fxa="copy" title="Copiar link">⧉</button>` : ""}
          <button class="btn ghost sm" data-fxa="ren" title="Renomear">✏️</button>
          <button class="btn ghost sm" data-fxa="mv" title="Mover para outra pasta">📂</button>
          <button class="btn ghost sm del" data-fxa="del" title="Mandar para a lixeira do Drive">🗑</button>
        </div></div>`).join("")}</div>`
      : `<div class="fxempty">${q ? "Nada encontrado com esse nome." : `Esta pasta está vazia.<br><span class="note">Arraste arquivos para cá ou use os botões acima.</span>`}</div>`}
  </div>`;
  const qi = $("#fxQ"); qi.oninput = () => { const p = qi.selectionStart; FX.q = qi.value; renderArquivos(); const n = $("#fxQ"); n.focus(); n.setSelectionRange(p, p); };
  $("#fxFile").onchange = e => { const fs = [...e.target.files]; e.target.value = ""; fxUpload(fs); };
  const dz = $("#fxDrop");
  dz.ondragover = e => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")){ e.preventDefault(); dz.classList.add("fxover"); } };
  dz.ondragleave = e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove("fxover"); };
  dz.ondrop = e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); dz.classList.remove("fxover"); fxUpload([...e.dataTransfer.files]); };
}
async function fxUpload(files){
  if (!files.length) return;
  const prog = $("#fxProg"); let ok = 0, noShare = 0;
  for (const [n, f] of files.entries()){
    if (f.size > 500 * 1048576){ toast(`"${f.name}" passa de 500 MB.`, true); continue; }
    const label = `Enviando ${files.length > 1 ? `${n + 1} de ${files.length}: ` : ""}${f.name}…`;
    if (prog) prog.textContent = label;
    try { const a = await driveUpload(f, p => { const pr = $("#fxProg"); if (pr) pr.textContent = `${label} ${p}%`; }, fxCur().id); ok++; if (!a.compartilhado) noShare++; }
    catch(ex){ toast(`Não foi possível enviar "${f.name}": ${errMsg(ex)}`, true); }
  }
  const pr = $("#fxProg"); if (pr) pr.textContent = "";
  if (ok) toast(ok > 1 ? `${ok} arquivos enviados.` : "Arquivo enviado.");
  if (noShare) toast("Sua conta não permite compartilhar por link: quem abrir pode precisar pedir acesso.", true);
  fxLoad();
}
function fxNameModal(title, label, val, onOk, extra){
  const ov = overlay(`<div class="mhead"><div class="mt">${title}</div><button class="x" data-close>×</button></div>
    <form class="mbody" id="fxF"><label class="f">${label}</label><input class="fld" id="fxN" value="${esc(val || "")}" maxlength="200" required>
      ${extra || ""}<div class="err" id="fxE" style="margin-top:8px"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" id="fxOk">Salvar</button></div></form>`, "small");
  setTimeout(() => { const i = $("#fxN"); i.focus(); const dot = i.value.lastIndexOf("."); i.setSelectionRange(0, dot > 0 && !extra ? dot : i.value.length); }, 30);
  $("#fxF").onsubmit = async e => {
    e.preventDefault(); const b = $("#fxOk"); b.disabled = true;
    try { await onOk($("#fxN").value.trim(), ov); closeModal(true); fxLoad(); }
    catch(ex){ $("#fxE").textContent = errMsg(ex); b.disabled = false; }
  };
}
async function fxFolders(){
  const root = await driveFolder();
  const q = encodeURIComponent(`mimeType='${FOLDER_MIME}' and trashed=false`);
  const r = await dFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,parents)&pageSize=1000&spaces=drive`);
  const all = (r.files || []).filter(f => f.id !== root), kids = {};
  all.forEach(f => (f.parents || []).forEach(p => (kids[p] = kids[p] || []).push(f)));
  const out = [{ id: root, name: DRIVE_FOLDER, depth: 0 }];
  const walk = (id, d) => (kids[id] || []).sort((a, z) => a.name.localeCompare(z.name, "pt-BR")).forEach(f => { out.push({ id: f.id, name: f.name, depth: d }); walk(f.id, d + 1); });
  walk(root, 1); return out;
}
async function fxMove(f){
  let folders; try { folders = await fxFolders(); } catch(ex){ toast(errMsg(ex), true); return; }
  const banned = new Set();
  if (isFolder(f)){ // não deixa mover uma pasta para dentro dela mesma
    banned.add(f.id);
    let inside = false, d0 = 0; for (const x of folders){ if (x.id === f.id){ inside = true; d0 = x.depth; continue; } if (inside){ if (x.depth > d0) banned.add(x.id); else inside = false; } }
  }
  const curParent = (f.parents || [])[0];
  overlay(`<div class="mhead"><div class="mt">📂 Mover "${esc(f.name)}"</div><button class="x" data-close>×</button></div>
    <div class="mbody"><p class="note" style="margin-top:0">Escolha a pasta de destino:</p><div class="fxtree">
    ${folders.map(x => `<button class="fxtnode" data-fxto="${x.id}" ${banned.has(x.id) || x.id === curParent ? "disabled" : ""} style="padding-left:${10 + x.depth * 18}px">📁 ${esc(x.name)}${x.id === curParent ? ` <span class="note">(pasta atual)</span>` : ""}</button>`).join("")}
    </div></div>`, "small");
  $$("[data-fxto]").forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await dFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?addParents=${b.dataset.fxto}&removeParents=${(f.parents || []).join(",")}&fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
      closeModal(true); toast("Movido."); fxLoad(); }
    catch(ex){ toast(errMsg(ex), true); b.disabled = false; }
  });
}
document.addEventListener("click", async e => {
  if (S.view !== "arquivos" || e.target.closest("#modalRoot")) return;
  const go = e.target.closest("[data-fxgo]"); if (go){ FX.stack = FX.stack.slice(0, +go.dataset.fxgo + 1); FX.q = ""; fxLoad(); return; }
  const act = e.target.closest("[data-fx]");
  if (act){
    const a = act.dataset.fx;
    if (a === "reload") fxLoad();
    if (a === "up") $("#fxFile").click();
    if (a === "folder") fxNameModal("＋ Nova pasta", "Nome da pasta", "", async name => {
      await dFetch("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [fxCur().id] }) });
      toast(`Pasta "${name}" criada.`); });
    if (a === "link") fxNameModal("🔗 Adicionar link", "Título", "", async (name, ov) => {
      const url = normUrl(ov.querySelector("#fxU").value); if (!url) throw new Error("Cole o endereço (link).");
      const meta = { name, parents: [fxCur().id], mimeType: "text/x-uri", description: url, appProperties: { acomp: "link" } };
      const b = "cu" + Math.random().toString(36).slice(2);
      const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: text/x-uri\r\n\r\n[InternetShortcut]\r\nURL=${url}\r\n--${b}--`;
      await dFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${b}` }, body });
      toast("Link adicionado."); }, `<label class="f" style="margin-top:12px">Link (Google Drive, planilha, site…)</label><input class="fld" id="fxU" placeholder="https://drive.google.com/…" required>`);
    return;
  }
  const row = e.target.closest("[data-fxid]"); if (!row) return;
  const f = FX.items.find(x => x.id === row.dataset.fxid); if (!f) return;
  const ba = e.target.closest("[data-fxa]");
  if (!ba){
    if (e.target.closest("a")) return;
    if (isFolder(f)){ FX.stack.push({ id: f.id, name: f.name }); FX.q = ""; fxLoad(); }
    else window.open(fxOpenUrl(f), "_blank", "noopener");
    return;
  }
  const a = ba.dataset.fxa;
  if (a === "copy"){ try { await navigator.clipboard.writeText(fxOpenUrl(f)); toast("Link copiado."); } catch { toast("Não foi possível copiar.", true); } }
  if (a === "ren") fxNameModal("✏️ Renomear", isFolder(f) ? "Nome da pasta" : "Título", f.name, async (name, ov) => {
    const body = { name };
    if (isLink(f)){ const u = normUrl(ov.querySelector("#fxU").value); if (!u) throw new Error("Cole o endereço (link)."); body.description = u; }
    if (name === f.name && (!isLink(f) || body.description === linkUrl(f))) return;
    await dFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    toast("Alterado."); }, isLink(f) ? `<label class="f" style="margin-top:12px">Link</label><input class="fld" id="fxU" value="${esc(linkUrl(f))}" required>` : "");
  if (a === "mv") fxMove(f);
  if (a === "del") confirmBox(`Excluir "${f.name}"?`, isFolder(f) ? "A pasta e tudo o que está dentro vão para a lixeira do seu Google Drive (dá para recuperar por lá em até 30 dias). Anexos de demandas que apontam para esses arquivos deixam de abrir." : "Vai para a lixeira do seu Google Drive (dá para recuperar por lá em até 30 dias). Se estiver anexado a alguma demanda, o anexo deixa de abrir.", "Excluir", async () => {
    try { await dFetch(`https://www.googleapis.com/drive/v3/files/${f.id}?fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) }); toast("Enviado para a lixeira do Drive."); fxLoad(); }
    catch(ex){ toast(errMsg(ex), true); }
  });
});

document.addEventListener("click", e => { if (e.target.closest && e.target.closest('.tab[data-view="arquivos"],.tab[data-view=arquivos]')) FX.stale = true; }, true);
