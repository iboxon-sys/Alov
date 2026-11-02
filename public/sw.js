/**
 * Alov.uz PWA Service Worker for Background Push Notifications & WebRTC Calls
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Kiruvchi qo\'ng\'iroq 📞', body: 'Alov.uz da yangi video qo\'ng\'iroq bor...', icon: '/favicon.ico' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [300, 100, 300, 1000],
    tag: 'incoming-call',
    renotify: true,
    requireInteraction: true,
    actions: [
      { action: 'accept', title: 'Javob berish' },
      { action: 'reject', title: 'Rad etish' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'accept') {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow('/');
      })
    );
  }
});
