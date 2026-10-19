/* Service worker do Bion — toque da consulta (push). Contrato: payloadPush() em src/lib/server/toque.ts */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch {
    p = {};
  }
  const titulo = typeof p.titulo === "string" && p.titulo ? p.titulo : "Sua consulta vai começar";
  const consultaId = typeof p.consultaId === "string" ? p.consultaId : "";
  const tentativa = Number.isFinite(p.tentativa) ? p.tentativa : 0;
  const url = typeof p.url === "string" && p.url.startsWith("/") ? p.url : "/paciente";
  const expira = Date.parse(p.expiraEm);
  const vencido = Number.isFinite(expira) && Date.now() > expira;
  // O Chrome exige notificação visível em todo push: mostra sempre; vencido não re-alerta.
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: "",
      tag: consultaId ? `${consultaId}:${tentativa}` : "bion-toque",
      renotify: !vencido,
      requireInteraction: !vencido,
      icon: "/logo.svg",
      data: { url, consultaId, tentativa },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const alvo = new URL((event.notification.data && event.notification.data.url) || "/paciente", self.location.origin);
  event.waitUntil(
    (async () => {
      const abas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const aba of abas) {
        if (new URL(aba.url).origin !== alvo.origin) continue;
        await aba.focus();
        if ("navigate" in aba && aba.url !== alvo.href) await aba.navigate(alvo.href).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(alvo.href);
    })(),
  );
});
