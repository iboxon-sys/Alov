/**
 * Alov.uz Service Worker for Android PWA / APK Background Notifications & Call Actions
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Handle incoming background push or local notification dispatch
self.addEventListener('push', (event) => {
  let data = { title: 'Kiruvchi video qo\'ng\'iroq 📞', body: 'Alov.uz da sizga video qo\'ng\'iroq kelmoqda...', icon: '/favicon.ico', callerUid: '' };
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
    vibrate: [500, 200, 500, 200, 500],
    tag: 'incoming-call',
    renotify: true,
    requireInteraction: true,
    priority: 2,
    importance: 'high',
    data: { callerUid: data.callerUid, url: '/' },
    actions: [
      { action: 'accept', title: '📞 Javob berish' },
      { action: 'reject', title: '✕ Rad etish' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
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
            data: notification.data
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
      notifications.forEach(n => n.close());
    });
  }
});
