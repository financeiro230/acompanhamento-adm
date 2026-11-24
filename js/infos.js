/* ===================== CONTROLE DE INFORMAÇÕES (insumos/material de uso e consumo · acessos/senhas) ===================== */
"use strict";

const INF = { loaded: false, pasta: null, q: "", filtro: "", sort: null, ver: {} };
const INF_TIPOS = {
  insumos: { i: "📦", l: "Insumos e material de uso e consumo", curto: "Insumos",
    grupo: "secao", grupoL: "Seção", sugest: ["SACOLAS", "CAIXAS", "ADESIVOS", "FARDAMENTO", "GRÁFICA", "PAPELARIA", "ALIMENTÍCIO", "LIMPEZA", "INFORMÁTICA", "ESCRITÓRIO"],
    campos: [["secao", "Seção"], ["produto", "Insumo / produto"], ["contato", "Contato"], ["telefone", "Telefone / e-mail / site"], ["ult_data", "Última compra", "date"], ["ult_detalhe", "Detalhe da última compra (qtd, valor…)"], ["link", "Link (loja, anúncio, pasta)"], ["obs", "Observações", "area"]],
    titulo: d => d.produto || d.contato || "(sem nome)" },
  acessos: { i: "🔐", l: "Acessos e senhas", curto: "Acessos",
    grupo: "unidade", grupoL: "Unidade / setor", sugest: ["ADM", "FINANCEIRO", "RH", "RECIFE", "GUARA", "RIOMAR", "TACA", "PATTEO", "PNWS", "QUIOSQUE", "P.A", "DEPÓSITO"],
    campos: [["unidade", "Unidade / setor"], ["site", "Site / sistema"], ["login", "Login"], ["senha", "Senha", "senha"], ["alterado", "Última alteração", "date"], ["obs", "Observações (links, quem usa…)", "area"]],
    titulo: d => d.site || d.login || "(sem nome)" },
};
const infCor = s => { let h = 0; for (const c of String(s || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CORES[h % CORES.length]; };
const infChip = v => v ? `<span class="ichip" style="--c:${infCor(v.toUpperCase())}">${esc(v)}</span>` : "";
const infLink = v => { const t = String(v || "").trim(); if (!t) return ""; return /^https?:\/\//i.test(t) ? t : /^www\./i.test(t) ? "https://" + t : ""; };
const infPasta = id => (S.infoPastas || []).find(p => p.id === id);
const infItens = id => (S.infos || []).filter(i => i.pasta === id);
const infDono = p => p && p.dono === S.me.id;

async function loadInfos(){
  try { const [p, i] = await Promise.all([API.list("info_pastas"), API.list("infos")]); S.infoPastas = p; S.infos = i; INF.loaded = true; INF.err = null; }
  catch(e){ S.infoPastas = []; S.infos = []; INF.loaded = true; INF.err = errMsg(e); }
  if (!infPasta(INF.pasta)){ const s = (() => { try { return localStorage.getItem("cu_infp_" + S.me.id); } catch { return null; } })(); INF.pasta = infPasta(s) ? s : ((S.infoPastas || [])[0] || {}).id || null; }
}
function infSel(id){ INF.pasta = id; INF.filtro = ""; INF.sort = null; INF.ver = {}; try { localStorage.setItem("cu_infp_" + S.me.id, id); } catch {} renderInfos(); }

function renderInfos(){
  const v = $("#v-infos");
  if (!INF.loaded){ v.innerHTML = `<div class="empty" style="padding:40px"><div class="spinner" style="margin:auto"></div></div>`; loadInfos().then(() => S.view === "infos" && renderInfos()); return; }
  const pastas = (S.infoPastas || []).slice().sort((a, z) => (a.ordem - z.ordem) || a.nome.localeCompare(z.nome, "pt-BR"));
  const lado = tipo => { const l = pastas.filter(p => p.tipo === tipo);
    return `<div class="ifgrp"><div class="ifgh">${INF_TIPOS[tipo].i} ${INF_TIPOS[tipo].curto}</div>${l.map(p => `<button class="ifp ${p.id === INF.pasta ? "on" : ""}" data-ifp="${p.id}">
      <span class="ifpn">📁 ${esc(p.nome)}</span><span class="ifpc">${p.compartilhado ? `<span title="${esc(infCompTxt(p))}">👥</span>` : ""}${infItens(p.id).length}</span></button>`).join("") || `<div class="note" style="padding:4px 10px">Nenhuma pasta</div>`}
      <button class="ifnew" data-ifnew="${tipo}">＋ Nova pasta</button></div>`; };
  const p = infPasta(INF.pasta);
  v.innerHTML = `<div class="ifwrap">
    <aside class="ifside">${lado("insumos")}${lado("acessos")}</aside>
    <section class="ifmain">${INF.err ? `<div class="banner">⚠️ ${esc(INF.err)}</div>` : ""}${p ? infPastaHtml(p) : `<div class="nempty">🗂 Crie uma pasta para começar.<br><span class="note">Ex.: "Material de uso e consumo", "Embalagens", "Senhas das lojas", "Acessos do financeiro". Cada pasta pode ser só sua ou compartilhada com quem você escolher.</span>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:14px"><button class="btn" data-ifnew="insumos">📦 Nova pasta de insumos</button><button class="btn" data-ifnew="acessos">🔐 Nova pasta de acessos</button></div></div>`}</section></div>`;
  const qi = $("#ifQ"); if (qi) qi.oninput = () => { const pos = qi.selectionStart; INF.q = qi.value; renderInfos(); const n = $("#ifQ"); n.focus(); n.setSelectionRange(pos, pos); };
}
const infCompTxt = p => !p.compartilhado ? "Só você" : (p.membros || []).length ? "Compartilhada com " + p.membros.map(nomeDe).join(", ") : "Compartilhada com toda a equipe";

function infPastaHtml(p){
  const T = INF_TIPOS[p.tipo], q = INF.q.trim().toLowerCase();
  const todos = infItens(p.id);
  const grupos = [...new Set(todos.map(i => (i.dados[T.grupo] || "").trim().toUpperCase()).filter(Boolean))].sort((a, z) => a.localeCompare(z, "pt-BR"));
  let l = todos.filter(i => (!INF.filtro || (i.dados[T.grupo] || "").trim().toUpperCase() === INF.filtro)
    && (!q || Object.entries(i.dados).filter(([k]) => k !== "senha").map(([, x]) => x).join(" ").toLowerCase().includes(q)));
  const sk = INF.sort || T.grupo;
  l.sort((a, z) => String(a.dados[sk] || "").localeCompare(String(z.dados[sk] || ""), "pt-BR") || T.titulo(a.dados).localeCompare(T.titulo(z.dados), "pt-BR"));
  const th = (k, lbl) => `<th data-ifsort="${k}" class="${sk === k ? "on" : ""}">${lbl}${sk === k ? " ▾" : ""}</th>`;
  const copia = (v, k) => v ? `<button class="icp" data-ifcopy="${k}" title="Copiar">📋</button>` : "";
  const linhas = p.tipo === "insumos"
    ? l.map(i => { const d = i.dados, lk = infLink(d.link) || infLink(d.telefone);
        return `<tr data-ifit="${i.id}"><td>${infChip(d.secao)}</td><td><b>${esc(d.produto || "")}</b></td><td>${esc(d.contato || "")}</td>
          <td>${infLink(d.telefone) ? `<a href="${esc(infLink(d.telefone))}" target="_blank" rel="noopener">${esc(d.telefone)}</a>` : esc(d.telefone || "")}</td>
          <td>${d.ult_data ? `<b>${fmtYmd(d.ult_data, { day: "2-digit", month: "2-digit", year: "2-digit" })}</b> ` : ""}${esc(d.ult_detalhe || "")}</td>
          <td class="ilk">${infLink(d.link) ? `<a href="${esc(infLink(d.link))}" target="_blank" rel="noopener" title="${esc(d.link)}">🔗 Abrir</a>` : esc(d.link || "")}</td>
          <td class="iobs">${linkify(d.obs || "")}</td></tr>`; }).join("")
    : l.map(i => { const d = i.dados, ver = INF.ver[i.id];
        return `<tr data-ifit="${i.id}"><td>${infChip(d.unidade)}</td><td><b>${infLink(d.site) ? `<a href="${esc(infLink(d.site))}" target="_blank" rel="noopener">${esc(d.site)}</a>` : esc(d.site || "")}</b></td>
          <td class="imono">${esc(d.login || "")} ${copia(d.login, i.id + "|login")}</td>
          <td class="imono">${d.senha ? `${ver ? esc(d.senha) : "••••••••"} <button class="icp" data-ifver="${i.id}" title="${ver ? "Esconder" : "Mostrar"}">${ver ? "🙈" : "👁"}</button>${copia(d.senha, i.id + "|senha")}` : ""}</td>
          <td>${d.alterado ? fmtYmd(d.alterado, { day: "2-digit", month: "2-digit", year: "numeric" }) : ""}</td>
          <td class="iobs">${linkify(d.obs || "")}</td></tr>`; }).join("");
  const cab = p.tipo === "insumos"
    ? th("secao", "Seção") + th("produto", "Insumo / produto") + th("contato", "Contato") + th("telefone", "Telefone / e-mail / site") + th("ult_data", "Última compra") + `<th>Link</th>` + `<th>Observações</th>`
    : th("unidade", "Unidade / setor") + th("site", "Site / sistema") + th("login", "Login") + `<th>Senha</th>` + th("alterado", "Última alteração") + `<th>Observações</th>`;
  return `<div class="ifhead"><div><div class="ifttl">${T.i} ${esc(p.nome)}</div><div class="note">${T.l} · ${esc(infCompTxt(p))}${infDono(p) ? "" : ` · pasta de ${esc(nomeDe(p.dono))}`}</div></div>
      <div class="ifacts">${infDono(p) ? `<button class="btn sm" data-ifpe="${p.id}" title="Renomear, compartilhar ou excluir a pasta">⚙️ Pasta</button>` : ""}
        <button class="btn sm" data-iflote>📥 Colar da planilha</button><button class="btn sm primary" data-ifadd>＋ Novo</button></div></div>
    <div class="kbar" style="margin:10px 0 6px"><div class="ksearch" style="flex:1;min-width:200px"><span>🔎</span><input id="ifQ" placeholder="Procurar nesta pasta…" value="${esc(INF.q)}"></div></div>
    ${grupos.length > 1 ? `<div class="iffil"><button class="nlabel ${!INF.filtro ? "on" : ""}" data-iffil="">Todas</button>${grupos.map(g => `<button class="nlabel ${INF.filtro === g ? "on" : ""}" data-iffil="${esc(g)}">${esc(g)} <small>${todos.filter(i => (i.dados[T.grupo] || "").trim().toUpperCase() === g).length}</small></button>`).join("")}</div>` : ""}
    ${l.length ? `<div class="iftbl"><table><thead><tr>${cab}</tr></thead><tbody>${linhas}</tbody></table></div>`
      : `<div class="nempty">${todos.length ? "Nada encontrado." : `Pasta vazia.<br><span class="note">Clique em "＋ Novo" ou cole as linhas direto da sua planilha em "📥 Colar da planilha".</span>`}</div>`}
    ${p.tipo === "acessos" ? `<p class="note" style="margin-top:10px">🔒 As senhas ficam escondidas na tela e só aparecem para quem tem acesso a esta pasta. A data de "Última alteração" é preenchida sozinha quando a senha muda.</p>` : ""}`;
}

/* ---------- pasta: criar / editar ---------- */
function openInfoPasta(id, tipo){
  const p = id ? infPasta(id) : null;
  const d = p ? clone(p) : { id: uuid(), dono: S.me.id, nome: "", tipo, cor: null, compartilhado: false, membros: [], ordem: Date.now(), criado_em: Date.now(), atualizado_em: Date.now() };
  const ov = overlay(`<div class="mhead"><div class="mt">${p ? "⚙️ Pasta" : "＋ Nova pasta"} · ${INF_TIPOS[d.tipo].i} ${INF_TIPOS[d.tipo].curto}</div>${p ? `<button class="x" data-ifpdel title="Excluir pasta">🗑</button>` : ""}<button class="x" data-close>×</button></div>
    <form class="mbody" id="ipF"><label class="f">Nome da pasta</label><input class="fld" id="ipN" value="${esc(d.nome)}" placeholder="${d.tipo === "insumos" ? "Ex.: Material de uso e consumo" : "Ex.: Senhas das lojas"}" maxlength="80">
      ${ctShareHtml(d.compartilhado, d.membros)}
      ${d.tipo === "acessos" ? `<p class="note">Atenção: quem tiver acesso à pasta vê as senhas dela.</p>` : ""}
      <div class="err" id="ipE"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Salvar</button></div></form>`, "small");
  ctShareBind(ov); setTimeout(() => $("#ipN").focus(), 30);
  const del = $("[data-ifpdel]");
  if (del) del.onclick = () => confirmBox(`Excluir a pasta "${d.nome}"?`, `Os ${infItens(d.id).length} item(ns) dentro dela também serão apagados (para todos que têm acesso).`, "Excluir", async () => {
    closeModal(true); S.infoPastas = S.infoPastas.filter(x => x.id !== d.id); S.infos = S.infos.filter(x => x.pasta !== d.id); INF.pasta = null; await loadInfos(); renderInfos();
    await remove("info_pastas", d.id); toast("Pasta excluída."); });
  $("#ipF").onsubmit = async e => {
    e.preventDefault(); d.nome = $("#ipN").value.trim(); if (!d.nome){ $("#ipE").textContent = "Dê um nome para a pasta."; return; }
    try { Object.assign(d, ctShareRead()); } catch(ex){ $("#ipE").textContent = ex.message; return; }
    d.atualizado_em = Date.now();
    try { await API.save("info_pastas", d); } catch(ex){ $("#ipE").textContent = errMsg(ex); return; }
    const i = S.infoPastas.findIndex(x => x.id === d.id); if (i >= 0) S.infoPastas[i] = d; else S.infoPastas.push(d);
    closeModal(true); infSel(d.id); toast("Pasta salva.");
  };
}

/* ---------- item: criar / editar ---------- */
function openInfoItem(id){
  const p = infPasta(INF.pasta); if (!p) return;
  const it = id ? S.infos.find(x => x.id === id) : null, T = INF_TIPOS[p.tipo];
  const d = it ? clone(it) : { id: uuid(), pasta: p.id, dono: S.me.id, dados: INF.filtro ? { [T.grupo]: INF.filtro } : {}, criado_em: Date.now(), atualizado_em: Date.now() };
  const sug = [...new Set([...T.sugest, ...S.infos.filter(x => infPasta(x.pasta) && infPasta(x.pasta).tipo === p.tipo).map(x => (x.dados[T.grupo] || "").trim().toUpperCase()).filter(Boolean)])];
  const campo = ([k, l, t]) => t === "area" ? `<div class="full"><label class="f">${l}</label><textarea class="fld" data-iff="${k}" rows="3">${esc(d.dados[k] || "")}</textarea></div>`
    : t === "senha" ? `<div><label class="f">${l}</label><div class="pwrap"><input class="fld" data-iff="${k}" type="password" value="${esc(d.dados[k] || "")}" autocomplete="new-password"><button type="button" class="pweye" data-ifeye title="Mostrar/esconder">👁</button></div></div>`
    : `<div ${k === "obs" ? 'class="full"' : ""}><label class="f">${l}</label><input class="fld" data-iff="${k}" type="${t || "text"}" value="${esc(d.dados[k] || "")}" ${k === T.grupo ? 'list="ifSug" style="text-transform:uppercase"' : ""} autocomplete="off"></div>`;
  overlay(`<div class="mhead"><div class="mt">${it ? "Editar" : "＋ Novo"} · ${T.i} ${esc(p.nome)}</div>${it ? `<button class="x" data-ifdel title="Excluir">🗑</button>` : ""}<button class="x" data-close>×</button></div>
    <form class="mbody" id="iiF"><div class="ifform">${T.campos.map(campo).join("")}</div><datalist id="ifSug">${sug.map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      ${it ? `<p class="note" style="margin:10px 0 0">Última edição ${fmt(it.atualizado_em)}${it.atualizado_por ? " por " + esc(it.atualizado_por) : ""}.</p>` : ""}
      <div class="err" id="iiE"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Salvar</button></div></form>`, "mid", { dirty: () => true });
  setTimeout(() => { const f = $$("[data-iff]")[it ? 1 : (d.dados[T.grupo] ? 1 : 0)]; f && f.focus(); }, 30);
  $("[data-ifeye]") && ($("[data-ifeye]").onclick = e => { const i = e.target.closest(".pwrap").querySelector("input"); i.type = i.type === "password" ? "text" : "password"; });
  const del = $("[data-ifdel]");
  if (del) del.onclick = () => confirmBox("Excluir este item?", T.titulo(d.dados), "Excluir", async () => {
    closeModal(true); S.infos = S.infos.filter(x => x.id !== d.id); renderInfos(); await remove("infos", d.id); toast("Item excluído."); });
  $("#iiF").onsubmit = async e => {
    e.preventDefault();
    const novo = {}; $$("[data-iff]").forEach(i => { const v = i.value.trim(); if (v) novo[i.dataset.iff] = i.dataset.iff === T.grupo ? v.toUpperCase() : v; });
    if (!Object.keys(novo).length){ $("#iiE").textContent = "Preencha pelo menos um campo."; return; }
    if (p.tipo === "acessos" && (novo.senha || "") !== (d.dados.senha || "") && (novo.alterado || "") === (d.dados.alterado || "")) novo.alterado = todayYmd();
    d.dados = novo; d.atualizado_em = Date.now(); d.atualizado_por = S.me.nome;
    const i = S.infos.findIndex(x => x.id === d.id); if (i >= 0) S.infos[i] = d; else S.infos.push(d);
    closeModal(true); renderInfos(); await persist("infos", d); toast("Salvo.");
  };
}

/* ---------- colar da planilha (Google Sheets / Excel) ---------- */
const INF_CAB = {
  insumos: [["secao", /se[cç][aã]o|categoria|grupo/i], ["produto", /insumo|produto|item|material/i], ["contato", /^contato|fornecedor/i], ["telefone", /telefone|e-?mail|site|fone/i], ["ult_detalhe", /[uú]ltima compra|compra/i], ["link", /link|url/i], ["obs", /obs/i]],
  acessos: [["unidade", /unidade|setor|loja/i], ["site", /site|sistema|plataforma/i], ["login", /login|usu[aá]rio|e-?mail/i], ["senha", /senha|password/i], ["alterado", /altera/i], ["obs", /obs/i]],
};
const INF_ORDEM = { insumos: ["secao", "produto", "contato", "telefone", "link", "obs"], acessos: ["unidade", "site", "login", "senha", "alterado", "obs"] };
function infParse(txt, tipo){
  const linhas = txt.replace(/\r/g, "").split("\n").filter(l => l.trim());
  if (!linhas.length) return [];
  const sep = txt.includes("\t") ? "\t" : linhas[0].includes(";") ? ";" : ",";
  const split = l => { const out = []; let cur = "", q = false; for (const ch of l){ if (ch === '"') q = !q; else if (ch === sep && !q){ out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); };
  let ordem = INF_ORDEM[tipo], ini = 0;
  const h = split(linhas[0]), achados = h.map(x => (INF_CAB[tipo].find(([, r]) => r.test(x)) || [null])[0]);
  if (achados.filter(Boolean).length >= 2){ ordem = achados.map((k, i) => k || (tipo === "insumos" && !h[i] ? "link" : null)); ini = 1; }
  const dataBR = s => { const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return ""; const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; };
  return linhas.slice(ini).map(l => { const v = split(l), d = {};
    ordem.forEach((k, i) => { if (!k || !v[i]) return; let x = v[i].replace(/^📁|^🗀|^🖿/u, "").trim(); if (!x) return;
      if (k === "alterado"){ const dt = dataBR(x); if (dt){ d.alterado = dt; return; } d.obs = (d.obs ? d.obs + " · " : "") + "Alterado: " + x; return; }
      if (k === INF_TIPOS[tipo].grupo) x = x.toUpperCase();
      d[k] = d[k] ? d[k] + " " + x : x; });
    if (tipo === "insumos" && d.obs){ const m = d.obs.match(/[uú]ltima compra\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*:?\s*(.*)/i);
      if (m && !d.ult_data){ const dd = m[1].split("/"); const y = dd[2] ? (dd[2].length === 2 ? "20" + dd[2] : dd[2]) : String(new Date().getFullYear()); d.ult_data = `${y}-${dd[1].padStart(2, "0")}-${dd[0].padStart(2, "0")}`; d.ult_detalhe = m[2].trim(); d.obs = d.obs.replace(m[0], "").trim(); if (!d.obs) delete d.obs; } }
    return d; }).filter(d => Object.keys(d).length);
}
function openInfoLote(){
  const p = infPasta(INF.pasta); if (!p) return; const T = INF_TIPOS[p.tipo]; let lista = [];
  const cols = p.tipo === "insumos" ? "Seção · Insumo/produto · Contato · Telefone/e-mail/site · Link · Observações" : "Unidade/setor · Site · Login · Senha · Última alteração · Observações";
  overlay(`<div class="mhead"><div class="mt">📥 Colar da planilha · ${esc(p.nome)}</div><button class="x" data-close>×</button></div>
    <form class="mbody" id="ilF"><p class="note" style="margin-top:0">Na sua planilha, selecione as linhas (pode incluir a linha de títulos), copie (Ctrl+C) e cole aqui (Ctrl+V). Ordem esperada: <b>${cols}</b>. Se colar com os títulos, o sistema reconhece as colunas sozinho.</p>
      <textarea class="fld" id="ilT" rows="8" placeholder="Cole aqui…"></textarea>
      <div class="note" id="ilN" style="margin-top:6px"></div><div id="ilPrev" class="clprev"></div><div class="err" id="ilE"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" id="ilOk" disabled>Importar</button></div></form>`, "mid");
  const campos = T.campos.filter(([k]) => k !== "ult_detalhe");
  $("#ilT").oninput = () => {
    lista = infParse($("#ilT").value, p.tipo);
    $("#ilN").textContent = lista.length ? `${lista.length} linha(s) reconhecida(s). Confira as primeiras abaixo:` : "";
    $("#ilOk").disabled = !lista.length; $("#ilOk").textContent = lista.length ? `Importar ${lista.length}` : "Importar";
    $("#ilPrev").innerHTML = lista.length ? `<table><thead><tr>${campos.map(([, l]) => `<th>${esc(l.split(" (")[0])}</th>`).join("")}</tr></thead><tbody>${lista.slice(0, 30).map(d => `<tr>${campos.map(([k]) => `<td>${k === "senha" && d[k] ? "••••" : esc(k === "ult_data" ? [d.ult_data, d.ult_detalhe].filter(Boolean).join(" ") : d[k] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "";
  };
  $("#ilF").onsubmit = async e => {
    e.preventDefault(); if (!lista.length) return; $("#ilOk").disabled = true;
    const now = Date.now(), rows = lista.map((d, i) => ({ id: uuid(), pasta: p.id, dono: S.me.id, dados: d, criado_em: now + i, atualizado_em: now + i, atualizado_por: S.me.nome }));
    try { await (API.saveMany ? API.saveMany("infos", rows) : Promise.all(rows.map(r => API.save("infos", r)))); }
    catch(ex){ $("#ilE").textContent = errMsg(ex); $("#ilOk").disabled = false; return; }
    S.infos.push(...rows); closeModal(true); renderInfos(); toast(`${rows.length} item(ns) importado(s).`);
  };
}

/* ---------- cliques ---------- */
document.addEventListener("click", async e => {
  if (S.view !== "infos" || e.target.closest("#modalRoot")) return;
  const t = e.target;
  const pf = t.closest("[data-ifp]"); if (pf){ infSel(pf.dataset.ifp); return; }
  const nw = t.closest("[data-ifnew]"); if (nw){ openInfoPasta(null, nw.dataset.ifnew); return; }
  const pe = t.closest("[data-ifpe]"); if (pe){ openInfoPasta(pe.dataset.ifpe); return; }
  if (t.closest("[data-ifadd]")){ openInfoItem(null); return; }
  if (t.closest("[data-iflote]")){ openInfoLote(); return; }
  const fl = t.closest("[data-iffil]"); if (fl){ INF.filtro = INF.filtro === fl.dataset.iffil ? "" : fl.dataset.iffil; renderInfos(); return; }
  const so = t.closest("[data-ifsort]"); if (so){ INF.sort = so.dataset.ifsort; renderInfos(); return; }
  const vr = t.closest("[data-ifver]"); if (vr){ INF.ver[vr.dataset.ifver] = !INF.ver[vr.dataset.ifver]; renderInfos(); return; }
  const cp = t.closest("[data-ifcopy]"); if (cp){ const [id, k] = cp.dataset.ifcopy.split("|"); const it = S.infos.find(x => x.id === id);
    try { await navigator.clipboard.writeText(it.dados[k] || ""); toast(k === "senha" ? "Senha copiada." : "Copiado."); } catch { toast("Não foi possível copiar.", true); } return; }
  if (t.closest("a")) return;
  const row = t.closest("[data-ifit]"); if (row) openInfoItem(row.dataset.ifit);
});
