/* Over the Changes offline cache. The page and scripts are fetched fresh when online; everything else comes from the cache.
   Bump CACHE on each release. */
const CACHE = "otc-2026-09-30c";
const CORE = ["./", "index.html", "manifest.webmanifest", "css/app.css", "css/fonts.css", "js/theory.js", "js/data.js", "js/audio.js", "js/band.js", "js/app.js",
  "vendor/Tone.min.js", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/favicon-32.png",
  "fonts/courier-prime-400.woff2", "fonts/courier-prime-700.woff2", "fonts/dela-gothic-one-400.woff2", "fonts/permanent-marker-400.woff2"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  const fresh = req.mode === "navigate" || /\.(html|js|css)$/.test(url.pathname) || url.pathname.endsWith("/");
  if (fresh) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
