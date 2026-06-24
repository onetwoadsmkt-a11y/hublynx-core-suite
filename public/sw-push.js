// Service worker dedicado a Web Push para o PWA da Central de Tarefas Hublynx.
// NÃO faz cache de app shell — apenas push + click handling.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Hublynx Tarefas", body: "Você tem um lembrete." };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }
  const options = {
    body: payload.body,
    icon: "/icon-tarefas-512.png",
    badge: "/icon-tarefas-512.png",
    data: { url: payload.url || "/app/hoje" },
    vibrate: [120, 60, 120],
    tag: payload.tag || "hublynx-tarefa",
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app/hoje";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.includes(url) && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
