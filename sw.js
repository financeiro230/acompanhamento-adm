/* Acompanhamento ADM — service worker: notificações push (não guarda cache) */
const FN = "https://upvkaawddhvicoupdtpd.supabase.co/functions/v1/push";
const KEY = "sb_publishable_By5ZPecg5qpMN2_r3fVXTw_LW_Ukror";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("push", e => e.waitUntil((async () => {
  let itens = [];
  try {
    const sub = await self.registration.pushManager.getSubscription();
    const r = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + KEY },
      body: JSON.stringify({ acao: "pendentes", endpoint: sub && sub.endpoint }) });
    itens = (await r.json()).itens || [];
  } catch {}
  if (!itens.length) itens = [{ titulo: "Acompanhamento ADM", corpo: "Você tem novidades no sistema.", tag: "geral" }];
  for (const n of itens) await self.registration.showNotification(n.titulo, {
    body: n.corpo || "", tag: n.tag || undefined, renotify: !!n.tag, icon: "icons/icon-192.png", badge: "icons/favicon-64.png",
    data: { url: n.url || self.registration.scope }, requireInteraction: /^e\|/.test(n.tag || "") });
})()));
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)){ c.focus(); if ("navigate" in c && url !== c.url) c.navigate(url).catch(() => {}); return; }
    return self.clients.openWindow(url);
  }));
});
