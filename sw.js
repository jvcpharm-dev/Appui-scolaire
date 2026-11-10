/*
 * Service worker : garde une copie de l'application pour qu'elle s'ouvre
 * vite, même avec un réseau faible. Les données (Supabase) ne sont jamais
 * mises en cache : elles viennent toujours du serveur.
 * Après une mise à jour des fichiers, augmentez VERSION.
 */
const VERSION = "appui-v3";
const SHELL = [
  "./", "index.html", "css/styles.css",
  "js/config.js", "js/utils.js", "js/api.js", "js/charts.js", "js/pwa.js", "js/app.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/favicon.svg"
];
const CDN = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Fichiers de l'application : réseau d'abord (pour avoir la dernière version), copie locale si hors ligne
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match("index.html")))
    );
    return;
  }

  // Bibliothèque Supabase et polices : copie locale d'abord
  if (CDN.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }))
    );
  }
  // Tout le reste (API Supabase) : pas d'interception.
});
