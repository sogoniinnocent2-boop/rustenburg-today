const CACHE = "rt-shell-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/en", "/icon.svg"])));
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api") || url.pathname.startsWith("/account") || url.pathname.startsWith("/admin")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
