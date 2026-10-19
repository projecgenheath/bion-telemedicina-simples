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
      // tag só consultaId: o toque seguinte SUBSTITUI o anterior (renotify re-alerta).
      tag: consultaId || "bion-toque",
      renotify: !vencido, // vencido: mostra (exigência do Chrome) sem re-alertar e fecha em seguida
      requireInteraction: !vencido,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url, consultaId, tentativa },
    }).then(() => (vencido ? fecharTag(consultaId || "bion-toque", tentativa) : fecharNoExpira(consultaId || "bion-toque", tentativa, expira))),
  );
});

/*
 * Fechamento best-effort no expiraEm. NÃO é garantido: o navegador pode
 * encerrar o SW antes (o Chrome corta waitUntil longos, ~5 min no máximo),
 * por isso o limite de 90 s. O fechamento confiável é o do cliente
 * (chamada_expirada / atender / recusar → fecharNotificacoesConsulta).
 */
const ESPERA_MAX_MS = 90 * 1000;
async function fecharTag(tag, tentativa) {
  const ns = await self.registration.getNotifications({ tag });
  // Só fecha se ainda for a mesma tentativa (uma nova pode ter substituído).
  for (const n of ns) if (!n.data || n.data.tentativa === tentativa) n.close();
}
function fecharNoExpira(tag, tentativa, expira) {
  if (!Number.isFinite(expira)) return undefined;
  const ms = expira - Date.now();
  if (ms > ESPERA_MAX_MS) return undefined;
  return new Promise((r) => setTimeout(r, Math.max(0, ms))).then(() => fecharTag(tag, tentativa));
}

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
