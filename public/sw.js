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
  let data = { title: 'Kiruvchi video qo\'ng\'iroq 📞', body: 'Alov.uz da yangi video qo\'ng\'iroq bor...', icon: '/favicon.ico', callerUid: '' };
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
    vibrate: [400, 200, 400, 1500],
    tag: 'incoming-call',
    renotify: true,
    requireInteraction: true,
    data: { callerUid: data.callerUid },
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
  const action = event.action;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_ACTION', action, data: event.notification.data });
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
