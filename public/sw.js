/*
 * Plan C — service worker de fraîcheur.
 * But : à l'ouverture depuis l'écran d'accueil, servir la dernière version live.
 * Les cookies produit (cc_vid, session, consentement) ne sont ni lus,
 * ni écrits, ni mis en cache. Le navigateur les envoie tout seul avec la requête.
 * Aucune permission, aucun abonnement, aucune synchro en arrière-plan.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  const accept = request.headers.get('accept') || '';
  const isDocument = request.mode === 'navigate' || accept.includes('text/html');
  if (!isDocument) return;

  // Network-first, no Cache Storage write: never replay an old HTML shell.
  event.respondWith(
    fetch(request, { cache: 'no-store' }).catch(
      () =>
        new Response('Plan C a besoin du réseau pour s’ouvrir.', {
          status: 503,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        }),
    ),
  );
});
