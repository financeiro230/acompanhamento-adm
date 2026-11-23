/* ===================== EQUIPE (admin) ===================== */
"use strict";

async function loadAll(){
  const [d, e] = await Promise.all([API.list("demandas"), API.list("eventos")]);
  S.all = { demandas: d, eventos: e };
}
function statsFor(id){
  const today = todayYmd();
  const ds = (S.all ? S.all.demandas : []).filter(d => d.dono === id);
  const es = (S.all ? S.all.eventos : []).filter(e => e.dono === id);
  const abertas = ds.filter(d => d.status !== FIN && !["ideias","rascunhos"].includes(d.status)).length;
  const andamento = ds.filter(d => d.status === "andamento").length;
  const atrasadas = ds.filter(d => d.prazo && d.status !== FIN && d.prazo < today).length;
  const fin30 = ds.filter(d => d.status === FIN && d.finalizado_em && d.finalizado_em > Date.now() - 30*dayMs).length;
  const savedEv = S.eventos; S.eventos = es;
  const hoje = instances(today, today).filter(i => i.kind !== "prazo" && !i.done).length;
  const mLate = instances(ymd(addDays(new Date(), -30)), today).filter(i => i.kind === "missao" && i.late).length;
  S.eventos = savedEv;
  return { abertas, andamento, atrasadas, fin30, hoje, mLate };
}
async function renderEquipe(){
  const v = $("#v-equipe");
  if (!isAdmin()){ v.innerHTML = ""; return; }
  if (!S.all){ v.innerHTML = `<div class="empty" style="padding:40px"><div class="spinner" style="margin:auto"></div></div>`; try { await loadAll(); } catch(e){ v.innerHTML = `<div class="empty">Erro ao carregar: ${esc(errMsg(e))}</div>`; return; } }
  const filt = A.filt; A.filt = { evento:true, missao:true, prazo:false, google:false };
  const cards = S.perfis.map(p => {
    const s = statsFor(p.id);
    return `<div class="member ${p.ativo?"":"off"}">
      <div class="mtop"><span class="avatar" style="background:${p.cor}">${esc(initials(p.nome))}</span>
        <div style="flex:1;min-width:0"><div class="nm">${esc(p.nome)} ${p.id===S.me.id?'<span class="tag blue">você</span>':""}</div>
        <div class="us">@${esc(p.usuario)} · ${p.master?"⭐ ADM master":p.papel==="admin"?(Array.isArray(p.ve)?(p.ve.length?"Administrador (vê "+p.ve.length+" pessoa"+(p.ve.length>1?"s":"")+")":"Administrador (não vê ninguém)"):"Administrador"):"Membro"}${p.papel==="admin"&&p.id!==S.me.id?" · 🔒 abre com a senha":""}${(p.ocultar_de||[]).length?" · 🔒 oculto de "+p.ocultar_de.length+" admin":""}${p.papel!=="admin"&&p.pode_atribuir?" · 📤 atribui missões":""}${p.ativo?"":" · <b style='color:var(--danger)'>desativado</b>"}</div></div></div>
      <div class="stats">
        <div class="stat"><b>${s.abertas}</b><small>demandas abertas</small></div>
        <div class="stat"><b>${s.andamento}</b><small>em andamento</small></div>
        <div class="stat ${s.atrasadas?"red":""}"><b>${s.atrasadas}</b><small>prazos vencidos</small></div>
        <div class="stat"><b>${s.hoje}</b><small>na agenda hoje</small></div>
        <div class="stat ${s.mLate?"red":""}"><b>${s.mLate}</b><small>missões atrasadas</small></div>
        <div class="stat"><b>${s.fin30}</b><small>finalizadas (30d)</small></div>
      </div>
      <div class="mact">
        <button class="btn primary sm" data-eq="open" data-id="${p.id}">Abrir espaço</button>
        <button class="btn sm" data-eq="edit" data-id="${p.id}">Editar</button>
        ${p.id===S.me.id || p.papel!=="admin" || S.me.master ? `<button class="btn sm" data-eq="pass" data-id="${p.id}">🔑 Senha</button>` : ""}
        ${p.id!==S.me.id && !p.master && (p.papel!=="admin" || S.me.master)?`<button class="btn sm danger" data-eq="del" data-id="${p.id}">Excluir</button>`:""}
      </div></div>`;
  }).join("");
  A.filt = filt;
  v.innerHTML = `<div class="kbar"><h2 style="margin:0;font-size:18px">👥 Equipe</h2><span class="note">Cada pessoa vê só o próprio espaço. O espaço de outro administrador só abre com a senha dele.</span>
      <div class="spacer"></div><button class="btn" data-eq="reload">↻ Atualizar</button><button class="btn primary" data-eq="new">＋ Novo membro</button></div>
    <div class="teamgrid">${cards}</div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-eq]"); if (!b || S.view !== "equipe") return;
  const a = b.dataset.eq, p = perfil(b.dataset.id);
  if (a === "reload"){ S.all = null; reloadPerfis().then(renderEquipe); }
  if (a === "open"){ setSpace(p.id).then(ok => { if (ok) setView("kanban"); }); }
  if (a === "new") memberModal(null);
  if (a === "edit") memberModal(p);
  if (a === "pass") passModal(p);
  if (a === "del") confirmBox(`Excluir ${p.nome}?`, "O usuário perde o acesso e TODAS as demandas e compromissos dele serão apagados de vez. Se quiser só bloquear o acesso, use Editar → Desativar.", "Excluir de vez", async () => {
    try { await API.rpc("admin_excluir_usuario", { p_id: p.id }); toast(`${p.nome} excluído.`); S.all = null; await reloadPerfis(); renderEquipe(); }
    catch(err){ toast(errMsg(err), true); }
  });
});
function memberModal(p){
  const novo = !p;
  const ov = overlay(`<div class="mhead"><div class="mt">${novo ? "Novo membro" : "Editar " + esc(p.nome)}</div><button class="x" data-close>×</button></div>
    <form class="mbody" id="mbForm">
      <label class="f">Nome</label><input class="fld" id="mbN" placeholder="Ex.: Lidiane" value="${esc(p?p.nome:"")}" required>
      ${novo ? `<div class="grid2 section">
        <div><label class="f">Usuário (para entrar)</label><input class="fld" id="mbU" placeholder="ex.: lidiane" autocapitalize="none" spellcheck="false"></div>
        <div><label class="f">Senha inicial</label><input class="fld" id="mbP" placeholder="mínimo 6 caracteres"></div></div>
        <p class="note">Anote e passe o usuário e a senha para a pessoa. Ela pode trocar a senha depois, no menu do perfil.</p>` : `<p class="note">Usuário para entrar: <b>@${esc(p.usuario)}</b></p>`}
      <div class="grid2 section">
        <div><label class="f">Tipo de acesso</label>${p && p.master ? `<select class="fld" id="mbR" disabled><option value="admin" selected>⭐ ADM master</option></select>` : `<select class="fld" id="mbR" ${!S.me.master && !(p && p.papel==="admin") ? "" : ""}><option value="membro" ${!p||p.papel==="membro"?"selected":""}>Membro (vê só o seu)</option>${S.me.master || (p && p.papel==="admin") ? `<option value="admin" ${p&&p.papel==="admin"?"selected":""}>Administrador</option>` : ""}</select>`}</div>
        ${novo ? "" : `<div><label class="f">Situação</label><select class="fld" id="mbA"><option value="1" ${p.ativo?"selected":""}>Ativo</option><option value="0" ${!p.ativo?"selected":""}>Desativado (sem acesso)</option></select></div>`}
      </div>
      <div class="section"><label class="f">E-mail Google (para integrar a agenda)</label><input class="fld" id="mbG" type="email" placeholder="nome@unigameslojas.com" value="${esc(p && p.google_email || "")}">
        <p class="note" style="margin:4px 0 0">É preenchido sozinho quando a pessoa conecta o Google. Serve para convidá-la nos eventos com Meet e para ver a agenda dela.</p></div>
      <div class="section"><label class="chk"><input type="checkbox" id="mbAtr" ${p && p.pode_atribuir ? "checked" : ""}> Pode atribuir missões e eventos para outras pessoas da equipe</label>
        <p class="note" style="margin:4px 0 0">A pessoa passa a ver a lista de nomes da equipe para escolher em "Para quem" e acompanha o que atribuiu. Ela continua sem ver a agenda ou o kanban dos outros. Administradores já podem.</p></div>
      ${acessoHtml(p)}
      <div class="section"><label class="f">Cor</label>${swatchesHtml(p ? p.cor : CORES[(S.perfis.length) % CORES.length])}</div>
      <div class="err" id="mbErr" style="margin-top:10px"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" id="mbOk">${novo?"Criar acesso":"Salvar"}</button></div>
    </form>`, "mid");
  $("#mbN").focus();
  const syncAc = () => { const adm = $("#mbR").value === "admin"; const b = $("#acVe"); if (b) b.hidden = !adm;
    const so = $("#acSo"); if (so) $("#acVeList").hidden = !so.checked; };
  $("#mbR").addEventListener("change", syncAc); ov.addEventListener("change", e => { if (e.target.name === "acmodo") syncAc(); }); syncAc();
  if (novo) $("#mbN").addEventListener("input", () => {
    const u = $("#mbU"); if (u.dataset.touched) return;
    u.value = semAcento($("#mbN").value.trim().split(/\s+/)[0] || "").toLowerCase().replace(/[^a-z0-9._-]/g, "");
  });
  if (novo) $("#mbU").addEventListener("input", e => { e.target.dataset.touched = 1; });
  $("#mbForm").addEventListener("submit", async e => {
    e.preventDefault();
    const nome = $("#mbN").value.trim(), papel = $("#mbR").value, cor = swValue(ov);
    const err = $("#mbErr"); err.textContent = "";
    if (!nome){ err.textContent = "Informe o nome."; return; }
    $("#mbOk").disabled = true;
    try {
      if (novo){
        const usuario = $("#mbU").value.trim().toLowerCase(), senha = $("#mbP").value;
        if (!/^[a-z0-9._-]{2,30}$/.test(usuario)){ throw new Error("Usuário: só letras minúsculas, números, ponto ou traço, sem espaço."); }
        if (senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
        if (papel === "admin" && $("#acSo") && $("#acSo").checked && !$$("[data-acve]").some(c => c.checked)) throw new Error("Marque pelo menos uma pessoa que este administrador pode ver (ou escolha outra opção).");
        const id = await API.rpc("admin_criar_usuario", { p_usuario: usuario, p_senha: senha, p_nome: nome, p_papel: papel });
        let aviso = "";
        try {
          if (cor) await API.rpc("admin_atualizar_perfil", { p_id: id, p_nome: nome, p_papel: papel, p_ativo: true, p_cor: cor });
          if ($("#mbAtr").checked) await API.rpc("admin_definir_atribuir", { p_id: id, p_valor: true });
          if ($("#mbG").value.trim()) await API.rpc("admin_definir_google_email", { p_id: id, p_email: $("#mbG").value.trim() });
          await salvarAcesso(id, null, papel);
        } catch(ex2){ aviso = errMsg(ex2); }
        closeModal(true);
        if (aviso) toast(`Acesso criado para ${nome} (usuário: ${usuario}), mas um ajuste não foi salvo: ${aviso}. Abra "Editar" para conferir.`, true);
        else toast(`Acesso criado para ${nome}. Usuário: ${usuario}`);
      } else {
        await API.rpc("admin_atualizar_perfil", { p_id: p.id, p_nome: nome, p_papel: papel, p_ativo: $("#mbA").value === "1", p_cor: cor });
        if (!!p.pode_atribuir !== $("#mbAtr").checked) await API.rpc("admin_definir_atribuir", { p_id: p.id, p_valor: $("#mbAtr").checked });
        if ((p.google_email || "") !== $("#mbG").value.trim().toLowerCase()) await API.rpc("admin_definir_google_email", { p_id: p.id, p_email: $("#mbG").value.trim() });
        await salvarAcesso(p.id, p, papel);
        closeModal(true); toast("Salvo.");
      }
      S.all = null; await reloadPerfis(); loadEquipeGoogle(); renderEquipe();
    } catch(ex){ err.textContent = errMsg(ex); $("#mbOk").disabled = false; }
  });
}
function passModal(p){
  const self = p.id === S.me.id;
  overlay(`<div class="mhead"><div class="mt">${self ? "Trocar minha senha" : "Nova senha para " + esc(p.nome)}</div><button class="x" data-close>×</button></div>
    <form class="mbody" id="pwForm">
      <input class="fld" type="password" id="pw1" placeholder="Nova senha (mínimo 6 caracteres)" autocomplete="new-password">
      <input class="fld" type="password" id="pw2" placeholder="Repita a nova senha" style="margin-top:8px" autocomplete="new-password">
      <div class="err" id="pwErr" style="margin-top:8px"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" id="pwOk">Salvar senha</button></div>
    </form>`, "small");
  $("#pw1").focus();
  $("#pwForm").addEventListener("submit", async e => {
    e.preventDefault();
    const a = $("#pw1").value, b = $("#pw2").value, err = $("#pwErr");
    if (a.length < 6){ err.textContent = "Use pelo menos 6 caracteres."; return; }
    if (a !== b){ err.textContent = "As senhas não conferem."; return; }
    $("#pwOk").disabled = true;
    try {
      if (self) await API.changeMyPassword(a); else await API.rpc("admin_trocar_senha", { p_id: p.id, p_senha: a });
      closeModal(true); toast(self ? "Sua senha foi alterada." : `Senha de ${p.nome} alterada.`);
    } catch(ex){ err.textContent = errMsg(ex); $("#pwOk").disabled = false; }
  });
}

/* ---------- limites de visualização entre administradores ---------- */
const adminTotal = () => S.me.papel === "admin" && !!S.me.master;
function acessoHtml(p){
  if (!adminTotal()) return "";
  const others = S.perfis.filter(x => !p || x.id !== p.id);
  const admins = others.filter(x => x.papel === "admin");
  const ve = p && Array.isArray(p.ve) ? p.ve : null, oc = (p && p.ocultar_de) || [];
  const self = p && p.id === S.me.id;
  return `<div class="section acbox">
    <div id="acVe" ${p && p.papel === "admin" ? "" : "hidden"}>
      <label class="f">🔭 O que este administrador pode ver</label>
      ${self ? `<p class="note" style="margin:4px 0 0">Você vê todos os espaços (não dá para limitar o seu próprio acesso).</p>` : `
      <label class="chk"><input type="radio" name="acmodo" value="todos" ${!ve ? "checked" : ""}> O espaço de todos</label>
      <label class="chk"><input type="radio" name="acmodo" value="nada" id="acNada" ${ve && !ve.length ? "checked" : ""}> Não ver o espaço de ninguém (só o próprio)</label>
      <label class="chk"><input type="radio" name="acmodo" value="so" id="acSo" ${ve && ve.length ? "checked" : ""}> Só o espaço destas pessoas:</label>
      <div id="acVeList" class="acl" ${ve && ve.length ? "" : "hidden"}>${others.length ? others.map(x => `<label class="chk"><input type="checkbox" data-acve="${x.id}" ${ve && ve.includes(x.id) ? "checked" : ""}> ${esc(x.nome)}${x.papel === "admin" ? ` <span class="note">(admin)</span>` : ""}</label>`).join("") : `<span class="note">Ainda não há outras pessoas.</span>`}</div>`}
    </div>
    <label class="f" style="margin-top:10px">🔒 Quem pode ver o espaço ${p ? "de " + esc(p.nome) : "desta pessoa"}</label>
    ${admins.length ? `<div class="acl">${admins.map(x => `<label class="chk"><input type="checkbox" data-acoc="${x.id}" ${oc.includes(x.id) ? "" : "checked"} ${x.id === S.me.id && !self ? "disabled title=\"Você sempre vê os espaços que administra\"" : ""}> ${esc(x.nome)}${x.id === S.me.id ? " (você)" : ""}</label>`).join("")}</div>
      <p class="note" style="margin:4px 0 0">Desmarque um administrador para que ele não veja a agenda nem o kanban desta pessoa, mesmo sendo administrador. O espaço de um administrador, para os outros (inclusive você), só abre digitando a senha dele.</p>`
      : `<p class="note" style="margin:4px 0 0">Só você é administrador. Quando houver outros, dá para escolher aqui quem vê este espaço.</p>`}
  </div>`;
}
async function salvarAcesso(id, p, papel){
  if (!adminTotal() || !$(".acbox")) return;
  let ve = null;
  if (papel === "admin" && id !== S.me.id && $("#acNada") && $("#acNada").checked) ve = [];
  if (papel === "admin" && id !== S.me.id && $("#acSo") && $("#acSo").checked){
    ve = $$("[data-acve]").filter(c => c.checked).map(c => c.dataset.acve);
    if (!ve.length) throw new Error("Marque pelo menos uma pessoa que este administrador pode ver (ou escolha \"O espaço de todos\").");
  }
  const oc = $$("[data-acoc]").filter(c => !c.checked && !c.disabled).map(c => c.dataset.acoc);
  const same = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
  if (p && (p.ve == null) === (ve == null) && same(p.ve, ve) && same(p.ocultar_de, oc)) return;
  if (!p && ve == null && !oc.length) return;
  await API.rpc("admin_definir_acesso", { p_id: id, p_ve: ve, p_ocultar: oc });
}
