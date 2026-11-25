/**
 * Alov.uz Service Worker
 * - Offline-capable Navigation + Static Asset Caching (PWABuilder & Android/iOS PWA compliant)
 * - Background Push Notifications & Call Actions ("Javob berish" / "Rad etish")
 */

const SHELL_CACHE = 'alov-shell-v1';
const STATIC_CACHE = 'alov-static-v1';
const ACTIVE_CACHES = new Set([SHELL_CACHE, STATIC_CACHE]);

const PRECACHE_SHELL_URLS = [
  '/',
  '/manifest.json',
  '/trusted-types-bootstrap.js',
  '/assets/images/icon-192.png',
  '/assets/images/icon-512.png',
  '/assets/images/icon-maskable-512.png',
  '/assets/images/apple-touch-icon.png',
  '/assets/images/alov_app_logo_1793451330582.webp',
  '/favicon.ico',
];

const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="uz">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#09090D" />
  <title>Alov.uz — Oflayn rejim</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: #09090D;
      color: #F4F4F6;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .card {
      width: 100%;
      max-width: 400px;
      background: #12141E;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 24px;
      padding: 28px 24px;
      text-align: center;
      box-shadow: 0 24px 64px rgba(0,0,0,0.65);
    }
    .logo {
      width: 72px;
      height: 72px;
      border-radius: 18px;
      margin: 0 auto 16px;
      display: block;
      object-fit: cover;
    }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
    p { font-size: 14px; line-height: 1.5; color: #A1A1AA; margin-bottom: 20px; }
    button {
      width: 100%;
      border: none;
      border-radius: 14px;
      padding: 12px 18px;
      font-size: 14px;
      font-weight: 700;
      background: #E11D48;
      color: #ffffff;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <main class="card">
    <img class="logo" src="/assets/images/icon-192.png" alt="Alov.uz" />
    <h1>Internet aloqasi uzildi</h1>
    <p>Alov.uz hozir oflayn rejimda. Internet tiklangach sahifani qayta yuklang.</p>
    <button type="button" onclick="window.location.reload()">Qayta urinish</button>
  </main>
</body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SHELL_CACHE);
        await Promise.allSettled(
          PRECACHE_SHELL_URLS.map(async (url) => {
            try {
              const res = await fetch(new Request(url, { cache: 'reload' }));
              if (!res || !res.ok) return;
              if (url === '/') {
                const htmlText = await res.clone().text().catch(() => '');
                if (!htmlText || htmlText.includes('/src/main.tsx') || htmlText.includes('/@vite/client')) {
                  return;
                }
                await cache.put(url, res.clone());
                await warmProductionAssetsFromHtml(htmlText);
                return;
              }
              await cache.put(url, res.clone());
            } catch (_) {}
          })
        );
      } catch (_) {}
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => !ACTIVE_CACHES.has(key))
            .map((key) => caches.delete(key))
        );
      } catch (_) {}
      await self.clients.claim();
    })()
  );
});

function classifyRequest(request) {
  if (!request || request.method !== 'GET') return 'bypass';

  let parsed;
  try {
    parsed = new URL(request.url);
  } catch (_) {
    return 'bypass';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'bypass';
  }

  const isSameOrigin = parsed.origin === self.location.origin;
  const isGoogleFont =
    parsed.hostname === 'fonts.googleapis.com' || parsed.hostname === 'fonts.gstatic.com';
  if (!isSameOrigin && !isGoogleFont) {
    return 'bypass';
  }

  const pathname = parsed.pathname || '/';
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/socket.io/') ||
    pathname.startsWith('/@vite') ||
    pathname.startsWith('/@react-refresh') ||
    pathname.startsWith('/@fs/') ||
    pathname.startsWith('/src/') ||
    pathname.startsWith('/node_modules/') ||
    pathname === '/sw.js'
  ) {
    return 'bypass';
  }

  if (pathname === '/manifest.json') {
    return 'manifest';
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    return 'navigation';
  }

  if (
    isGoogleFont ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/face-models/') ||
    pathname === '/favicon.ico' ||
    pathname === '/trusted-types-bootstrap.js' ||
    /\.(?:png|jpe?g|webp|svg|ico|woff2?|css|js)$/i.test(pathname)
  ) {
    return 'static-asset';
  }

  return 'bypass';
}

async function warmProductionAssetsFromHtml(htmlText) {
  if (!htmlText || htmlText.includes('/src/main.tsx') || htmlText.includes('/@vite/client')) {
    return;
  }
  const matches = htmlText.match(/(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g) || [];
  if (matches.length === 0) return;
  const staticCache = await caches.open(STATIC_CACHE);
  await Promise.allSettled(
    matches.map(async (attr) => {
      const m = attr.match(/["']([^"']+)["']/);
      if (!m || !m[1]) return;
      try {
        const assetReq = new Request(m[1]);
        const existing = await staticCache.match(assetReq);
        if (!existing) {
          const res = await fetch(assetReq);
          if (res && res.ok) {
            await staticCache.put(assetReq, res.clone());
          }
        }
      } catch (_) {}
    })
  );
}

self.addEventListener('fetch', (event) => {
  const route = classifyRequest(event.request);
  if (route === 'bypass') return;

  if (route === 'navigation') {
    event.respondWith(
      (async () => {
        const shellCache = await caches.open(SHELL_CACHE);
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.ok) {
            const copyForCache = networkResponse.clone();
            const htmlText = await networkResponse.clone().text().catch(() => '');
            if (htmlText && !htmlText.includes('/src/main.tsx') && !htmlText.includes('/@vite/client')) {
              await shellCache.put(event.request, copyForCache.clone());
              await shellCache.put('/', copyForCache);
              event.waitUntil(warmProductionAssetsFromHtml(htmlText));
            }
          }
          return networkResponse;
        } catch (_) {
          const exactCached = await shellCache.match(event.request);
          if (exactCached) {
            const txt = await exactCached.clone().text().catch(() => '');
            if (txt && !txt.includes('/src/main.tsx') && !txt.includes('/@vite/client')) {
              return exactCached;
            }
            await shellCache.delete(event.request).catch(() => {});
          }
          const rootCached = await shellCache.match('/');
          if (rootCached) {
            const txt = await rootCached.clone().text().catch(() => '');
            if (txt && !txt.includes('/src/main.tsx') && !txt.includes('/@vite/client')) {
              return rootCached;
            }
            await shellCache.delete('/').catch(() => {});
          }
          return new Response(OFFLINE_FALLBACK_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  if (route === 'manifest') {
    event.respondWith(
      (async () => {
        const shellCache = await caches.open(SHELL_CACHE);
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.ok) {
            await shellCache.put('/manifest.json', networkResponse.clone());
          }
          return networkResponse;
        } catch (_) {
          const cached = await shellCache.match('/manifest.json');
          if (cached) return cached;
          return new Response('{}', {
            status: 200,
            headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  if (route === 'static-asset') {
    event.respondWith(
      (async () => {
        const staticCache = await caches.open(STATIC_CACHE);
        const shellCache = await caches.open(SHELL_CACHE);
        const cached = (await staticCache.match(event.request)) || (await shellCache.match(event.request));

        const networkFetch = fetch(event.request)
          .then(async (response) => {
            if (response && (response.ok || response.type === 'opaque')) {
              await staticCache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(networkFetch);
          return cached;
        }

        const fresh = await networkFetch;
        if (fresh) return fresh;

        return new Response('', { status: 204 });
      })()
    );
  }
});

// Handle incoming background push or local notification dispatch
self.addEventListener('push', (event) => {
  let data = {
    title: "Kiruvchi video qo'ng'iroq 📞",
    body: "Alov.uz da sizga video qo'ng'iroq kelmoqda...",
    icon: '/assets/images/icon-192.png',
    callerUid: '',
  };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/assets/images/icon-192.png',
    badge: '/assets/images/icon-192.png',
    vibrate: [500, 200, 500, 200, 500],
    tag: 'incoming-call',
    renotify: true,
    requireInteraction: true,
    priority: 2,
    importance: 'high',
    data: { callerUid: data.callerUid, url: '/' },
    actions: [
      { action: 'accept', title: '📞 Javob berish' },
      { action: 'reject', title: '✕ Rad etish' },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Handle notification click and action buttons ("Javob berish" / "Rad etish")
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;

  notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      let clientFound = false;
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'CALL_NOTIFICATION_ACTION',
            action: action || 'accept',
            data: notification.data,
          });
          clientFound = true;
          break;
        }
      }

      if (!clientFound && clients.openWindow) {
        return clients.openWindow('/?action=' + (action || 'accept'));
      }
    })
  );
});

// Clear badge / notification via message from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'DISMISS_CALL_NOTIFICATIONS') {
    self.registration.getNotifications({ tag: 'incoming-call' }).then((notifications) => {
      notifications.forEach((n) => n.close());
    });
  } else if (event.data && event.data.action === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
