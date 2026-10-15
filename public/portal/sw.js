// Service worker do app do Portal do cliente (escopo /portal/), separado do Core.
// Sem cache de dados do projeto (sempre busca na rede); só mostra uma tela
// simples quando o aparelho está sem internet.
const OFFLINE_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem conexão</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f6f7f9;color:#1f2937}
main{max-width:320px;padding:24px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{margin:0 0 16px;color:#6b7280;line-height:1.4}
button{min-height:44px;padding:0 20px;border:0;border-radius:999px;background:#0a2557;color:#fff;font-size:15px;font-weight:600}</style></head>
<body><main><h1>Sem conexão</h1><p>Conecte-se à internet para ver o andamento do seu projeto.</p>
<button onclick="location.reload()">Tentar de novo</button></main></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return; // dados e arquivos: direto na rede
  event.respondWith(
    fetch(req).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
