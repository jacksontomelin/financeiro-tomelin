/* Service Worker: Tomelin Gestão Financeira
   Network-first para o shell (sempre busca a versão mais nova primeiro);
   cache só como fallback offline. Nunca faz cache de chamadas /api. */
const CACHE = "tomelin-v14";
const SHELL = [
  "/", "/static/styles.css", "/static/app.js", "/manifest.json",
  "/static/icons/logo-mark.png", "/static/icons/logo-lockup.png",
  "/static/icons/icon-192.png", "/static/icons/icon-maskable-192.png",
  "/static/fonts/inter-latin.woff2", "/static/fonts/manrope-latin.woff2"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
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
  if (url.origin !== self.location.origin) return;  // fontes externas: comportamento padrão

  // Network-first: tenta a rede, guarda no cache; só usa cache se rede falhar (offline).
  // cache: "no-cache" = sempre confere com o servidor, nunca usa o
  // cache HTTP do navegador (o Safari guardava app.js antigo ali)
  e.respondWith(
    fetch(e.request.mode === "navigate"
            ? new Request(e.request.url, { cache: "no-cache", credentials: "same-origin" })
            : new Request(e.request, { cache: "no-cache" }))
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      // sem internet: o que estiver guardado; navegação (inclusive /?acao=...) cai no app
      .catch(() => caches.match(e.request, { ignoreSearch: e.request.mode === "navigate" })
        .then((hit) => hit || caches.match("/")))
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});
