const APP_CACHE = 'chavea-shell-v4';
const PRECACHE = self.__WB_MANIFEST;
const PRECACHE_URLS = PRECACHE.map((entry) => typeof entry === 'string' ? entry : entry.url);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('chavea-shell-') && name !== APP_CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
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
        return await fetch(request);
      } catch {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    return cached || fetch(request);
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
