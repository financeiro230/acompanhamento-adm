/* ===================== ACOMPANHAMENTO ADM — núcleo ===================== */
"use strict";

const CFG = {
  url: "https://upvkaawddhvicoupdtpd.supabase.co",
  key: "sb_publishable_By5ZPecg5qpMN2_r3fVXTw_LW_Ukror",
  dominio: "@usuarios.central-unigames.com",
  idleMin: 30,
};

const DEFAULT_COLS = [
  {key:"ideias",    label:"💡 Ideias & Insights",     color:"#e0a800", lado:"lateral"},
  {key:"rascunhos", label:"📝 Rascunhos",             color:"#8a94a6", lado:"lateral"},
  {key:"standby",   label:"💤 Stand by",              color:"#5b6b8c", lado:"lateral"},
  {key:"pendente",  label:"Iniciar / Pendente",       color:"#8a94a6", lado:"principal"},
  {key:"andamento", label:"Em andamento",             color:"#2f5bea", lado:"principal"},
  {key:"terceiros", label:"Dependendo de terceiros",  color:"#d98a00", lado:"principal"},
  {key:"douglas",   label:"Passar pro Douglas",       color:"#8a3ffc", lado:"principal"},
];
const FIN = "finalizado";
let COLS = DEFAULT_COLS.map(c => ({...c}));
let LABEL = {};
function setCols(list){
  COLS = (Array.isArray(list) && list.length ? list : DEFAULT_COLS).map(c => ({key:c.key, label:c.label, color:c.color||"#8a94a6", lado:c.lado==="lateral"?"lateral":"principal", junto: c.lado!=="lateral" && !!c.junto}));
  LABEL = Object.fromEntries(COLS.map(c => [c.key, c.label])); LABEL[FIN] = "Finalizado";
}
setCols(null);
const firstMain = () => (COLS.find(c => c.lado !== "lateral") || COLS[0]).key;
function applySpaceCols(){
  const p = S.perfis.find(x => x.id === S.space);
  setCols((p && p.preferencias && Array.isArray(p.preferencias.colunas) && p.preferencias.colunas.length) ? p.preferencias.colunas : S.globalCols);
}
const colLabel = k => LABEL[k] || "Quadro removido";
/* listas vindas do banco sempre como lista (evita "object is not iterable" com dados antigos ou corrompidos) */
const LISTAS = { eventos: ["concluidas","rec_dias","rec_datas","checklist","historico","anexos"], demandas: ["checklist","historico","anexos","participantes"],
  notas: ["itens","marcadores","membros"], contatos: ["marcadores","membros"], info_pastas: ["membros"], pastas_compartilhadas: ["membros"] };
function normLista(v){ return Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []; }
function normRows(table, rows){
  const ks = LISTAS[table]; if (!ks || !Array.isArray(rows)) return rows || [];
  for (const r of rows) if (r) for (const k of ks) if (!Array.isArray(r[k])) r[k] = normLista(r[k]);
  return rows;
}
const CORES = ["#2f5bea","#1f9d61","#d23b3b","#d98a00","#8a3ffc","#0891b2","#db2777","#5b6b8c","#65a30d","#ea580c"];

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==="x"?r:(r&3|8)).toString(16); }));
const clone = o => JSON.parse(JSON.stringify(o));
const dayMs = 86400000;
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const todayYmd = () => ymd(new Date());
const fmt = ts => ts ? new Date(ts).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "—";
const fmtD = ts => ts ? new Date(ts).toLocaleDateString("pt-BR") : "—";
const fmtYmd = (s, opt={day:"2-digit",month:"2-digit"}) => s ? parseYmd(s).toLocaleDateString("pt-BR", opt) : "";
const hm = t => t ? t.slice(0,5) : "";
function ago(ts){ const d = Math.floor((Date.now()-ts)/dayMs); if (d<=0) return "hoje"; if (d===1) return "ontem"; return `há ${d} dias`; }
function dur(a,b){ const ms=b-a, d=Math.floor(ms/dayMs); if (d>=1) return d===1?"1 dia":`${d} dias`; const h=Math.floor(ms/3600000); return h>=1?`${h} h`:"menos de 1 h"; }
const initials = n => (n||"?").trim().split(/\s+/).slice(0,2).map(p=>p[0]).join("").toUpperCase();
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const semAcento = s => s.normalize("NFD").replace(/[̀-ͯ]/g,"");

function toast(msg, bad){
  const t = $("#toast"); t.textContent = msg; t.classList.toggle("bad", !!bad); t.classList.remove("hidden");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), bad ? 4500 : 2400);
}
function errMsg(e){
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  if (/Invalid login credentials/i.test(m)) return "Usuário ou senha incorretos.";
  if (/banned/i.test(m)) return "Este usuário está desativado. Fale com o administrador.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão com o servidor. Verifique a internet.";
  if (/JWT|session|refresh token/i.test(m)) return "Sua sessão expirou. Entre novamente.";
  return m;
}

/* ---------- API (Supabase) ---------- */
let sb = null;
const API = window.API_MOCK || {
  init(){
    sb = window.supabase.createClient(CFG.url, CFG.key, {
      auth: { storage: window.localStorage, persistSession: true, autoRefreshToken: true }
    });
  },
  async sessionUserId(){ const { data } = await sb.auth.getSession(); return data.session ? data.session.user.id : null; },
  async login(usuario, senha){
    const { data, error } = await sb.auth.signInWithPassword({ email: usuario.trim().toLowerCase() + CFG.dominio, password: senha });
    if (error) throw error; return data.user.id;
  },
  async logout(){ try { await sb.auth.signOut({ scope: "local" }); } catch {} },
  async logoutLocal(){ try { await sb.auth.signOut({ scope: "local" }); } catch {} },
  onSignedOut(cb){ sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") cb(); }); },
  async changeMyPassword(senha){ const { error } = await sb.auth.updateUser({ password: senha }); if (error) throw error; },
  async list(table, dono){
    let q = sb.from(table).select("*");
    if (dono) q = q.eq("dono", dono);
    const { data, error } = await q; if (error) throw error; return normRows(table, data || []);
  },
  async save(table, row){
    // itens compartilhados de outra pessoa: atualiza (o upsert exigiria permissão de criar no espaço dela)
    if ((table === "demandas" || table === "notas") && row.dono && S.me && row.dono !== S.me.id){
      const { data, error } = await sb.from(table).update(row).eq("id", row.id).select("id");
      if (error) throw error; if (data && data.length) return;
    }
    const { error } = await sb.from(table).upsert(row); if (error) throw error; },
  async del(table, id){ const { error } = await sb.from(table).delete().eq("id", id); if (error) throw error; },
  async listMembro(table, uid){ const { data, error } = await sb.from(table).select("*").contains("membros", [uid]).neq("dono", uid); if (error) throw error; return normRows(table, data || []); },
  async saveMany(table, rows){ for (let i = 0; i < rows.length; i += 200){ const { error } = await sb.from(table).upsert(rows.slice(i, i + 200)); if (error) throw error; } },
  async listShared(uid){ const { data, error } = await sb.from("demandas").select("*").contains("participantes", [uid]).neq("dono", uid); if (error) throw error; return normRows("demandas", data || []); },
  async listBy(table, field, value){ const { data, error } = await sb.from(table).select("*").eq(field, value); if (error) throw error; return normRows(table, data || []); },
  async fn(nome, body){
    const { data, error } = await sb.functions.invoke(nome, { body });
    if (error){ let j = null; try { j = await error.context.json(); } catch {} const e = new Error((j && j.erro) || error.message); e.codigo = j && j.erro; e.status = error.context && error.context.status; throw e; }
    return data; },
  async rpc(fn, args){ const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; },
  async getConfig(chave){ const { data, error } = await sb.from("config").select("valor").eq("chave", chave).maybeSingle(); if (error) throw error; return data ? data.valor : null; },
  async setConfig(chave, valor){ const { error } = await sb.from("config").upsert({ chave, valor, atualizado_em: new Date().toISOString() }); if (error) throw error; },
};

/* ---------- preferências e tema ---------- */
const PREF_DEF = { tema:"claro", cor:"#2f5bea", sidebar:true, corEvento:"#2f5bea", corMissao:"#1f9d61", corPrazo:"#d98a00", corGoogle:"#4285f4" };
const prefs = () => Object.assign({}, PREF_DEF, (S.me && S.me.preferencias) || {});
function applyTheme(p){
  p = Object.assign({}, PREF_DEF, p || {});
  document.body.dataset.t = ["claro","escuro","vidro"].includes(p.tema) ? p.tema : "claro";
  const r = document.documentElement.style;
  r.setProperty("--accent", p.cor); r.setProperty("--c-evento", p.corEvento); r.setProperty("--c-missao", p.corMissao); r.setProperty("--c-prazo", p.corPrazo);
  try { localStorage.setItem("cu_theme", JSON.stringify({tema:p.tema, cor:p.cor})); } catch {}
}
try { applyTheme(JSON.parse(localStorage.getItem("cu_theme") || "null")); } catch { applyTheme(null); }

/* ---------- estado ---------- */
const S = {
  me: null,          // perfil logado
  perfis: [],        // perfis visíveis (admin: todos)
  space: null,       // id do dono que está sendo visto
  demandas: [],
  eventos: [],
  all: null,         // {demandas, eventos} para visão de equipe (admin)
  equipe: [],        // lista básica da equipe (para quem pode atribuir)
  q: "",             // texto da busca
  globalCols: null,  // modelo de quadros da equipe (admin)
  atribuidas: [],    // compromissos que eu criei para outras pessoas
  view: "agenda",
  selected: new Set(),
};
const isAdmin = () => S.me && S.me.papel === "admin";
const canAssign = () => !!(S.me && (S.me.papel === "admin" || S.me.pode_atribuir));
const pessoa = id => S.perfis.find(p => p.id === id) || (S.equipe || []).find(p => p.id === id);
const perfil = id => S.perfis.find(p => p.id === id);
const spaceName = () => { const p = perfil(S.space); return p ? p.nome : ""; };
const isOwnSpace = () => S.me && S.space === S.me.id;

/* ---------- gravação serializada por registro ---------- */
const queues = {};
let savingN = 0;
function setSaving(){
  const el = $("#saving");
  if (savingN > 0) el.textContent = "Salvando…";
  else { el.textContent = "Salvo ✓"; clearTimeout(setSaving._t); setSaving._t = setTimeout(() => { if (el.textContent === "Salvo ✓") el.textContent = ""; }, 1500); }
}
function persist(table, row){
  const body = clone(row);
  savingN++; setSaving();
  const run = () => API.save(table, body);
  const p = (queues[row.id] = (queues[row.id] || Promise.resolve()).then(run, run));
  return p.then(() => { savingN--; setSaving(); }, e => {
    savingN--; setSaving(); console.error(e); toast("Não foi possível salvar: " + errMsg(e), true);
    reloadSpace();
  });
}
async function remove(table, id){
  savingN++; setSaving();
  try { await API.del(table, id); } catch(e){ console.error(e); toast("Não foi possível excluir: " + errMsg(e), true); reloadSpace(); }
  finally { savingN--; setSaving(); }
}
function actorTag(entry){
  if (S.me && S.space && S.me.id !== S.space) entry.por = S.me.nome;
  return entry;
}

/* ---------- modais ---------- */
let modalOnClose = null, modalDirty = () => false;
function overlay(html, cls = "", opts = {}){
  $("#modalRoot").innerHTML = `<div class="overlay" id="ov"><div class="modal ${cls}">${html}</div></div>`;
  modalOnClose = opts.onClose || null;
  modalDirty = opts.dirty || (() => false);
  $("#ov").addEventListener("mousedown", e => { if (e.target.id === "ov") closeModal(); });
  $$("#ov [data-close]").forEach(b => b.addEventListener("click", () => closeModal()));
  return $("#ov");
}
function closeModal(force){
  if (!$("#modalRoot").innerHTML) return;
  if (!force && modalDirty()){
    confirmBox("Descartar alterações?", "Você editou campos e não salvou.", "Descartar", () => closeModal(true));
    return;
  }
  $("#modalRoot").innerHTML = "";
  const cb = modalOnClose; modalOnClose = null; modalDirty = () => false;
  if (cb) cb();
}
const modalOpen = () => !!$("#modalRoot").innerHTML;
function confirmBox(title, text, okLabel, onOk, okClass = "danger"){
  const host = document.createElement("div");
  host.innerHTML = `<div class="overlay" style="z-index:60"><div class="modal small">
    <div class="mhead"><div class="mt">${esc(title)}</div></div>
    <div class="mbody" style="color:var(--muted)">${esc(text)}</div>
    <div class="mfoot" style="justify-content:flex-end"><button class="btn" data-no>Cancelar</button>
    <button class="btn primary" data-ok ${okClass==="danger"?'style="background:var(--danger);border-color:var(--danger)"':""}>${esc(okLabel)}</button></div>
  </div></div>`;
  document.body.appendChild(host);
  host.querySelector("[data-no]").onclick = () => host.remove();
  host.querySelector("[data-ok]").onclick = async () => { host.remove(); await onOk(); };
  host.querySelector(".overlay").addEventListener("mousedown", e => { if (e.target.classList.contains("overlay")) host.remove(); });
}
function swatchesHtml(sel, name = "cor", def = null){
  const defBtn = def ? `<span class="sw def ${!sel?"on":""}" data-sw="" title="Cor padrão (muda quando você altera a cor padrão)"><span style="background:${def}"></span></span>` : "";
  return `<div class="swatches" data-swname="${name}">${defBtn}${CORES.map(c => `<span class="sw ${c===sel?"on":""}" data-sw="${c}" style="background:${c}"></span>`).join("")}
    <label class="sw ${sel && !CORES.includes(sel)?"on":""}" title="Outra cor" style="background:${sel && !CORES.includes(sel)?sel:"conic-gradient(red,yellow,lime,cyan,blue,magenta,red)"};position:relative;overflow:hidden" data-swc><input type="color" value="${sel||def||"#2f5bea"}" style="opacity:0;position:absolute;inset:0;cursor:pointer"></label></div>`;
}
document.addEventListener("input", e => {
  const lab = e.target.closest("[data-swc]"); if (!lab) return;
  const box = lab.parentElement; box.querySelectorAll(".sw").forEach(x => x.classList.toggle("on", x === lab));
  lab.style.background = e.target.value; lab.dataset.sw = e.target.value;
});
document.addEventListener("click", e => {
  const sw = e.target.closest("[data-sw]"); if (!sw || sw.hasAttribute("data-swc")) return;
  const box = sw.parentElement; box.querySelectorAll(".sw").forEach(x => x.classList.toggle("on", x === sw));
  box.dataset.value = sw.dataset.sw;
});
const swValue = (root, name = "cor") => { const b = root.querySelector(`[data-swname="${name}"]`); if (!b) return null; const on = b.querySelector(".sw.on"); return on ? (on.dataset.sw || null) : null; };

/* ---------- prazo tag ---------- */
function prazoTag(p, status){
  if (!p || status === FIN) return "";
  const end = parseYmd(p).getTime() + dayMs - 1;
  const diff = Math.ceil((end - Date.now()) / dayMs);
  const txt = "Prazo " + fmtYmd(p);
  if (end < Date.now()) return `<span class="tag late">⚠ ${txt}</span>`;
  if (diff <= 2) return `<span class="tag soon">${txt}</span>`;
  return `<span class="tag">${txt}</span>`;
}
