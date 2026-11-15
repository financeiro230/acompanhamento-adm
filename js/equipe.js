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
  const filt = A.filt; A.filt = { evento:true, missao:true, prazo:false };
  const cards = S.perfis.map(p => {
    const s = statsFor(p.id);
    return `<div class="member ${p.ativo?"":"off"}">
      <div class="mtop"><span class="avatar" style="background:${p.cor}">${esc(initials(p.nome))}</span>
        <div style="flex:1;min-width:0"><div class="nm">${esc(p.nome)} ${p.id===S.me.id?'<span class="tag blue">você</span>':""}</div>
        <div class="us">@${esc(p.usuario)} · ${p.papel==="admin"?"Administrador":"Membro"}${p.ativo?"":" · <b style='color:var(--danger)'>desativado</b>"}</div></div></div>
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
        <button class="btn sm" data-eq="pass" data-id="${p.id}">🔑 Senha</button>
        ${p.id!==S.me.id?`<button class="btn sm danger" data-eq="del" data-id="${p.id}">Excluir</button>`:""}
      </div></div>`;
  }).join("");
  A.filt = filt;
  v.innerHTML = `<div class="kbar"><h2 style="margin:0;font-size:18px">👥 Equipe</h2><span class="note">Cada pessoa vê só o próprio espaço. Você vê e edita todos.</span>
      <div class="spacer"></div><button class="btn" data-eq="reload">↻ Atualizar</button><button class="btn primary" data-eq="new">＋ Novo membro</button></div>
    <div class="teamgrid">${cards}</div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-eq]"); if (!b || S.view !== "equipe") return;
  const a = b.dataset.eq, p = perfil(b.dataset.id);
  if (a === "reload"){ S.all = null; reloadPerfis().then(renderEquipe); }
  if (a === "open"){ setSpace(p.id); setView("kanban"); }
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
        <div><label class="f">Tipo de acesso</label><select class="fld" id="mbR"><option value="membro" ${!p||p.papel==="membro"?"selected":""}>Membro (vê só o seu)</option><option value="admin" ${p&&p.papel==="admin"?"selected":""}>Administrador (vê todos)</option></select></div>
        ${novo ? "" : `<div><label class="f">Situação</label><select class="fld" id="mbA"><option value="1" ${p.ativo?"selected":""}>Ativo</option><option value="0" ${!p.ativo?"selected":""}>Desativado (sem acesso)</option></select></div>`}
      </div>
      <div class="section"><label class="f">Cor</label>${swatchesHtml(p ? p.cor : CORES[(S.perfis.length) % CORES.length])}</div>
      <div class="err" id="mbErr" style="margin-top:10px"></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" id="mbOk">${novo?"Criar acesso":"Salvar"}</button></div>
    </form>`, "mid");
  $("#mbN").focus();
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
        const id = await API.rpc("admin_criar_usuario", { p_usuario: usuario, p_senha: senha, p_nome: nome, p_papel: papel });
        if (cor) await API.rpc("admin_atualizar_perfil", { p_id: id, p_nome: nome, p_papel: papel, p_ativo: true, p_cor: cor });
        closeModal(true); toast(`Acesso criado para ${nome}. Usuário: ${usuario}`);
      } else {
        await API.rpc("admin_atualizar_perfil", { p_id: p.id, p_nome: nome, p_papel: papel, p_ativo: $("#mbA").value === "1", p_cor: cor });
        closeModal(true); toast("Salvo.");
      }
      S.all = null; await reloadPerfis(); renderEquipe();
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
