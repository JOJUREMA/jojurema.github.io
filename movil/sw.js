// Service worker del cascaron movil de CUSSHMI (Fase 1 PWA).
// Unico proposito: cumplir el requisito de instalabilidad cacheando el
// cascaron de la app (manifest, iconos, index.html). NUNCA intercepta
// llamadas a Supabase ni a ningun otro origen/ruta fuera de esta lista:
// los datos siempre vienen en vivo, una sola fuente de informacion.

const CACHE_NAME = 'cusshmi-movil-shell-v1';
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NAME)
          .map((nombre) => caches.delete(nombre))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Solo intercepta el cascaron propio (mismo origen, dentro de /movil/,
  // y en la lista SHELL_URLS). Todo lo demas (Supabase, assets/core,
  // assets/supabase, escritorio) pasa directo a red sin tocarlo.
  const esMismoOrigen = url.origin === self.location.origin;
  const rutaRelativa = url.pathname.replace(self.registration.scope.replace(self.location.origin, ''), './');
  const esDelCascaron = esMismoOrigen && SHELL_URLS.includes(rutaRelativa);

  if (!esDelCascaron) return; // no interceptar: comportamiento normal del navegador

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const redFetch = fetch(event.request)
        .then((respuesta) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respuesta.clone()));
          return respuesta;
        })
        .catch(() => cached);
      return cached || redFetch;
    })
  );
});
