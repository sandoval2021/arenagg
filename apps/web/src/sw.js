const CACHE_PREFIX = 'chavea-shell-';
const APP_CACHE = `${CACHE_PREFIX}v12-20260910-stability`;
const PRECACHE = self.__WB_MANIFEST;
const PRECACHE_URLS = PRECACHE.map((entry) => typeof entry === 'string' ? entry : entry.url);

function cacheVersion(name) {
  const match = name.match(/chavea-shell-v(\d+)-/);
  return match ? Number(match[1]) : -1;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await Promise.allSettled(
      PRECACHE_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' }))),
    );
    // Promote the new worker without reloading or navigating the React app.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const shellCaches = names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== APP_CACHE)
      .sort((a, b) => cacheVersion(b) - cacheVersion(a));

    // Keep exactly one previous shell. An already-open old React bundle can
    // still request one of its lazy chunks after the new SW takes control.
    // Keeping the previous shell avoids a mid-session white screen/freeze.
    const previousShell = shellCaches[0] ?? null;
    await Promise.all(
      names
        .filter((name) => {
          if (name === APP_CACHE || name === previousShell) return false;
          return name.startsWith(CACHE_PREFIX) || name.startsWith('workbox-precache-');
        })
        .map((name) => caches.delete(name)),
    );

    await self.clients.claim();

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      client.postMessage({ type: 'CHAVEA_SW_ACTIVATED', cache: APP_CACHE });
    }
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

  event.respondWith((async () => {
    try {
      const fresh = await fetch(request, { cache: 'no-store' });
      if (fresh.ok) {
        const cache = await caches.open(APP_CACHE);
        await cache.put(request, fresh.clone());
        return fresh;
      }

      // If the active tab still references a previous hashed chunk, serve the
      // previous cached asset instead of returning a 404 during SW takeover.
      return (await caches.match(request)) || fresh;
    } catch {
      return (await caches.match(request)) || Response.error();
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
