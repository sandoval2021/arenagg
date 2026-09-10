const CACHE_PREFIX = 'chavea-shell-';
const APP_CACHE = `${CACHE_PREFIX}v7-20260910-auth-recovery`;
const PRECACHE = self.__WB_MANIFEST;
const PRECACHE_URLS = PRECACHE.map((entry) => typeof entry === 'string' ? entry : entry.url);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
    // Never leave a fresh mobile build stuck in the waiting state.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name !== APP_CACHE && (name.startsWith(CACHE_PREFIX) || name.startsWith('workbox-precache-')))
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();

    // A worker can take control after the old JS bundle was already loaded.
    // Reload each currently open Chavea window once on this new worker's
    // activation so the first foreground after deployment receives the new shell.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(
      windows.map(async (client) => {
        if (!('navigate' in client)) return;
        try {
          await client.navigate(client.url);
        } catch {
          // Navigation may be rejected while a mobile PWA is backgrounding;
          // the next foreground/navigation still uses the new controller.
        }
      }),
    );
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request, { cache: 'no-store' });
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  // Network-first prevents an old JS/CSS asset from pinning a stale PWA.
  // Cache is retained only as an offline fallback.
  event.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    try {
      const fresh = await fetch(request, { cache: 'no-cache' });
      if (fresh.ok) await cache.put(request, fresh.clone());
      return fresh;
    } catch {
      return (await cache.match(request)) || Response.error();
    }
  })());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || 'Você tem uma novidade no Chavea.' };
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Chavea';
  const body = typeof payload.body === 'string' ? payload.body : 'Você tem uma novidade no Chavea.';
  const tag = typeof payload.tag === 'string' ? payload.tag : 'chavea-update';
  const rawUrl = typeof payload.url === 'string' ? payload.url : '/dashboard';

  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    renotify: true,
    icon: '/chavea-logo.svg',
    data: { url: rawUrl },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    let target;
    try {
      const requested = new URL(event.notification.data?.url || '/dashboard', self.location.origin);
      target = requested.origin === self.location.origin ? requested.href : new URL('/dashboard', self.location.origin).href;
    } catch {
      target = new URL('/dashboard', self.location.origin).href;
    }

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('navigate' in client) await client.navigate(target);
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
