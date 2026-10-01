/*
 * Plan C — service worker de fraîcheur.
 * But : à l'ouverture, et tant que l'app reste ouverte, servir la dernière
 * version live du shell (document + navigation RSC). Pas de Cache Storage.
 * Le client appelle registration.update() au retour au premier plan
 * et environ toutes les 10 min.
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

function isDocumentShell(request) {
  if (request.mode === 'navigate' || request.destination === 'document') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

function isAppFlight(request) {
  if (request.headers.get('RSC') === '1') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/x-component');
}

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

  const documentShell = isDocumentShell(request);
  if (!documentShell && !isAppFlight(request)) return;

  // Network-first, no Cache Storage write: never replay an old shell.
  // Cookies stay on the request the browser already built.
  event.respondWith(
    fetch(request, { cache: 'no-store' }).catch(() => {
      if (!documentShell) return Response.error();
      return new Response('Plan C a besoin du réseau pour s’ouvrir.', {
        status: 503,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }),
  );
});
