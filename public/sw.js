// Service worker mínimo da Central PinheiroAdv.
// Objetivo: tornar o site instalável como app (Chrome/Edge exigem um SW com handler de fetch).
// Não faz cache de dados — o site depende do Supabase em tempo real; tudo vai direto pra rede.
// Só guarda uma página offline simples para quando a conexão cair.
const VERSAO = "pa-sw-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSAO).then((c) => c.add(OFFLINE_URL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Navegações: rede primeiro; se cair, mostra a página offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
  // Demais requisições (API Supabase, chunks, imagens): passam direto, sem interferência.
});
