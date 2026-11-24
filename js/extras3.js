/* ===================== abrir módulo em outra aba · emojis ao digitar ===================== */
"use strict";

/* ---------- abrir um módulo em outra aba do navegador ---------- */
const urlModulo = v => location.pathname + location.search + "#" + v + (S.space && S.me && S.space !== S.me.id ? "/" + S.space : "");
function abrirOutraAba(v){ window.open(urlModulo(v), "_blank"); }
(function(){
  $$(".tab[data-view]").forEach(t => {
    if (t.querySelector(".tabnew")) return;
    const b = document.createElement("span"); b.className = "tabnew"; b.title = "Abrir em outra aba"; b.textContent = "⧉";
    b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); abrirOutraAba(t.dataset.view); });
    t.appendChild(b);
    t.addEventListener("auxclick", e => { if (e.button === 1){ e.preventDefault(); abrirOutraAba(t.dataset.view); } });
    t.addEventListener("click", e => { if (e.ctrlKey || e.metaKey || e.shiftKey){ e.preventDefault(); e.stopImmediatePropagation(); abrirOutraAba(t.dataset.view); } }, true);
  });
})();

/* ---------- emojis ---------- */
const EMO = {
  "⭐": "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😎 🤩 🥳 🤔 🤨 😐 😑 😶 🙄 😏 😬 😮 😯 😲 😳 🥺 😢 😭 😤 😡 🤯 😱 😴 🤒 🤧 😷 🤝 🙏",
  "👍": "👍 👎 👌 ✌️ 🤞 👏 🙌 👋 🤙 💪 👀 👉 👈 👆 👇 ☝️ ✋ 🖐️ 🫡 🙋 🙋‍♂️ 🙋‍♀️ 🤷 🤷‍♂️ 🤷‍♀️ 🤦 💁 🧑‍💼 👨‍💼 👩‍💼 👥",
  "✅": "✅ ☑️ ✔️ ❌ ❎ ⚠️ ❗ ❓ ‼️ ⁉️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ ▶️ ⏸️ ⏹️ 🔁 🔄 ➡️ ⬅️ ⬆️ ⬇️ 🆕 🆗 🆘 🔝 💯 🚫 ⛔ 📍 📌 🔖 🏷️",
  "📅": "📅 📆 🗓️ ⏰ ⏳ ⌛ ⏱️ 🕐 🕑 🕒 🕓 🕔 🕕 🕖 🕗 🕘 🕙 🕚 🕛 🔔 🔕 📢 📣",
  "💼": "💼 📁 📂 🗂️ 📋 📝 ✏️ 🖊️ 📎 🖇️ 📏 📐 ✂️ 🗃️ 🗄️ 🗑️ 📊 📈 📉 🧾 📑 📄 📃 📜 📦 📫 📬 📮 ✉️ 📧 📨 📩 📤 📥 🔒 🔓 🔑 🗝️ 🏢 🏬 🏪 🏦 🏭 🚚 🚛 📍 🛒 🛍️ 🎁",
  "💰": "💰 💵 💸 💳 🪙 🏧 🧮 💲 📉 📈 💹 🧾",
  "💻": "💻 🖥️ ⌨️ 🖱️ 🖨️ 📱 📲 ☎️ 📞 📟 📠 🔋 🔌 💡 🔦 🎮 🕹️ 🎧 📷 📸 📹 🎥 📺 📡 🛠️ 🔧 🔨 ⚙️ 🧰 🔩 🧲 🖲️ 💾 💿 📀 🌐 🔗",
  "🎉": "🎉 🎊 🎈 🎂 🍰 🏆 🥇 🥈 🥉 🏅 🎯 🚀 ✨ 🔥 💥 💫 🌟 ⭐ ☀️ 🌧️ ⛈️ ❄️ 🌈 ☕ 🍕 🍔 🍟 🥤 🍫 🍪 🎵 🎶",
  "❤️": "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝",
};
const EMO_TODOS = [...new Set(Object.values(EMO).join(" ").split(" ").filter(Boolean))];
const EP = { alvo: null, btn: null, pan: null, cat: "⭐" };
const emoRecentes = () => { try { return JSON.parse(localStorage.getItem("cu_emo") || "[]"); } catch { return []; } };
const emoUsou = e => { try { const r = emoRecentes().filter(x => x !== e); r.unshift(e); localStorage.setItem("cu_emo", JSON.stringify(r.slice(0, 24))); } catch {} };
const emoCampoOk = el => el && !el.disabled && !el.readOnly && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && ["text", "search", ""].includes(el.type || "") && !/Q$|Search|^lg|^search$/.test(el.id || "")))
  && !el.closest(".emopan") && el.id !== "nLabIn" && !el.closest(".ksearch");
function emoBtn(){
  if (EP.btn) return EP.btn;
  const b = document.createElement("button"); b.type = "button"; b.className = "emobtn"; b.title = "Emojis"; b.textContent = "😊";
  b.addEventListener("mousedown", e => e.preventDefault());
  b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); EP.pan ? emoFechar() : emoAbrir(); });
  document.body.appendChild(b); EP.btn = b; return b;
}
function emoPosBtn(){
  const el = EP.alvo, b = emoBtn(); if (!el || !document.contains(el)){ b.style.display = "none"; return; }
  const r = el.getBoundingClientRect(); if (!r.width){ b.style.display = "none"; return; }
  b.style.display = "block";
  const area = el.tagName === "TEXTAREA";
  b.style.left = Math.min(window.innerWidth - 30, r.right - 28) + "px";
  b.style.top = (area ? r.bottom - 28 : r.top + (r.height - 24) / 2) + "px";
}
function emoPainel(){
  const rec = emoRecentes(), cats = Object.keys(EMO), lista = EP.cat === "🕘" ? rec : EMO[EP.cat].split(" ").filter(Boolean);
  return `<div class="emocats">${rec.length ? `<button data-emc="🕘" class="${EP.cat === "🕘" ? "on" : ""}" title="Recentes">🕘</button>` : ""}${cats.map(c => `<button data-emc="${c}" class="${EP.cat === c ? "on" : ""}">${c}</button>`).join("")}</div>
    <div class="emogrid">${lista.map(e => `<button data-emo="${e}">${e}</button>`).join("")}</div>
    <div class="note" style="font-size:11px;padding:4px 6px 0">Dica: no Windows, <b>Win + .</b> abre todos os emojis; no Mac, <b>Ctrl + Cmd + Espaço</b>.</div>`;
}
function emoAbrir(){
  if (!EP.alvo) return;
  if (!EP.pan){ const p = document.createElement("div"); p.className = "emopan";
    p.addEventListener("mousedown", e => e.preventDefault());
    p.addEventListener("click", e => { e.stopPropagation();
      const c = e.target.closest("[data-emc]"); if (c){ EP.cat = c.dataset.emc; p.innerHTML = emoPainel(); return; }
      const m = e.target.closest("[data-emo]"); if (m) emoInserir(m.dataset.emo); });
    document.body.appendChild(p); EP.pan = p; }
  if (emoRecentes().length && EP.cat === "⭐" && !EP.usouCat) EP.cat = "🕘";
  EP.pan.innerHTML = emoPainel();
  const r = EP.btn.getBoundingClientRect(), w = 300, h = 290;
  EP.pan.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, r.right - w)) + "px";
  EP.pan.style.top = (r.bottom + h + 8 < window.innerHeight ? r.bottom + 6 : Math.max(6, r.top - h - 6)) + "px";
}
function emoFechar(){ if (EP.pan){ EP.pan.remove(); EP.pan = null; } }
function emoInserir(e){
  const el = EP.alvo; if (!el) return;
  el.focus();
  const a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? el.value.length;
  el.setRangeText(e, a, z, "end");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  emoUsou(e); EP.usouCat = true;
}
document.addEventListener("focusin", e => {
  const el = e.target;
  if (emoCampoOk(el)){ if (EP.alvo !== el) emoFechar(); EP.alvo = el; emoPosBtn(); }
});
document.addEventListener("focusout", () => setTimeout(() => {
  const a = document.activeElement;
  if (!emoCampoOk(a) && !EP.pan){ EP.alvo = null; if (EP.btn) EP.btn.style.display = "none"; }
}, 120));
document.addEventListener("mousedown", e => { if (EP.pan && !e.target.closest(".emopan") && !e.target.closest(".emobtn")) emoFechar(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && EP.pan){ e.stopPropagation(); emoFechar(); } }, true);
["scroll", "resize", "input"].forEach(ev => window.addEventListener(ev, e => { if (e.target && e.target.closest && e.target.closest(".emopan")) return; if (EP.alvo) emoPosBtn(); if (EP.pan && ev !== "input") emoFechar(); }, true));
new MutationObserver(() => { if (EP.alvo && !document.contains(EP.alvo)){ EP.alvo = null; emoFechar(); if (EP.btn) EP.btn.style.display = "none"; } })
  .observe(document.body, { childList: true, subtree: true });
