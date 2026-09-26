/* Service Worker — Tomelin Gestão Financeira
   Network-first para o shell (sempre busca a versão mais nova primeiro);
   cache só como fallback offline. Nunca faz cache de chamadas /api. */
const CACHE = "tomelin-v5";
const SHELL = [
  "/", "/static/styles.css", "/static/app.js",
  "/static/icons/logo-mark.png", "/static/icons/logo-lockup.png", "/manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api")) return; // rede sempre

  // Network-first: tenta a rede, guarda no cache; só usa cache se rede falhar (offline).
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("/")))
  );
});
