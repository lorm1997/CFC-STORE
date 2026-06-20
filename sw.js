/* ================================================
   CFC STORE MANAGER — Service Worker
   Maneja cache offline y almacenamiento persistente
================================================ */

const CACHE_NAME = 'cfc-store-v1';
const CACHE_VERSION = 1;

// Archivos a cachear para uso offline
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  // CDN externos — se cachean en la primera visita
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;1,700&family=Barlow:wght@400;500;600&display=swap',
];

/* ── INSTALL: cachear todos los assets ── */
self.addEventListener('install', event => {
  console.log('[SW] Instalando v' + CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cachear assets locales (críticos)
      const localAssets = ['/', '/index.html', '/manifest.json', '/icon-192.svg', '/icon-512.svg'];
      return cache.addAll(localAssets).then(() => {
        // Intentar cachear CDN (no crítico, puede fallar)
        const cdnAssets = ASSETS.filter(a => a.startsWith('http'));
        return Promise.allSettled(cdnAssets.map(url =>
          fetch(url, { mode: 'no-cors' }).then(r => cache.put(url, r))
        ));
      });
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: limpiar caches viejas ── */
self.addEventListener('activate', event => {
  console.log('[SW] Activando v' + CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Borrando cache vieja:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: servir desde cache, si no hay red ── */
self.addEventListener('fetch', event => {
  // Solo interceptar GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Estrategia: Cache First para assets, Network First para navegación
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    // Network first — si hay internet, trae la versión más nueva
    // Si no hay, sirve desde cache
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache first — para JS, CSS, fuentes, iconos
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => {
          // Si falla todo, devolver respuesta vacía para CDN
          return new Response('', { status: 408 });
        });
      })
    );
  }
});

/* ── PERSISTENT STORAGE: solicitar almacenamiento persistente ── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'REQUEST_PERSISTENT_STORAGE') {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(granted => {
        event.source.postMessage({
          type: 'PERSISTENT_STORAGE_RESULT',
          granted
        });
      });
    }
  }
});
