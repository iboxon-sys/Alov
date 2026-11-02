/**
 * Call notification, App Badge & Web Audio synthesized ringtone service
 * Supports Android standard Push Notifications, Heads-Up banners, App Badges and Web Audio ringtones.
 */

class CallNotificationService {
  private audioCtx: AudioContext | null = null;
  private ringtoneInterval: any = null;
  private isRinging: boolean = false;
  private swRegistration: ServiceWorkerRegistration | null = null;
  private onActionCallback: ((action: 'accept' | 'reject', data?: any) => void) | null = null;

  constructor() {
    this.registerServiceWorker();
    this.listenToSWWorkerMessages();
  }

  // Register Service Worker for Android PWA / APK notifications
  public async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        this.swRegistration = reg;
        console.log('Service Worker registered for Android PWA:', reg.scope);
      } catch (err) {
        console.warn('Service Worker registration notice:', err);
      }
    }
  }

  // Set callback for notification action buttons ("Javob berish" / "Rad etish")
  public setActionCallback(cb: (action: 'accept' | 'reject', data?: any) => void) {
    this.onActionCallback = cb;
  }

  private listenToSWWorkerMessages() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'CALL_NOTIFICATION_ACTION') {
          const action = event.data.action === 'reject' ? 'reject' : 'accept';
          this.stopRingtone();
          this.dismissNotifications();
          if (this.onActionCallback) {
            this.onActionCallback(action, event.data.data);
          }
        }
      });
    }
  }

  // Request browser notification permission
  public async requestPermission(): Promise<NotificationPermission> {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          return await Notification.requestPermission();
        } catch (e) {
          return 'denied';
        }
      }
      return Notification.permission as NotificationPermission;
    }
    return 'denied';
  }

  // Show Android high priority heads-up notification and update launcher app badge
  public async showCallNotification(callerName: string, avatarUrl?: string, callerUid?: string) {
    // 1. Update App Badge (Launcher icon badge on Android / Desktop)
    this.setAppBadge(1);

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const title = "Kiruvchi video qo'ng'iroq 📞";
        const options: any = {
          body: `${callerName} sizga video qo'ng'iroq qilmoqda...`,
          icon: avatarUrl || '/favicon.ico',
          badge: '/favicon.ico',
          vibrate: [500, 200, 500, 200, 500],
          tag: 'incoming-call',
          renotify: true,
          requireInteraction: true,
          priority: 2,
          importance: 'high',
          data: { callerUid },
          actions: [
            { action: 'accept', title: '📞 Javob berish' },
            { action: 'reject', title: '✕ Rad etish' }
          ]
        };

        if (this.swRegistration && this.swRegistration.showNotification) {
          await this.swRegistration.showNotification(title, options);
        } else if ('registration' in navigator && (navigator as any).serviceWorker?.ready) {
          const reg = await (navigator as any).serviceWorker.ready;
          await reg.showNotification(title, options);
        } else {
          const notif = new Notification(title, options);
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        }
      } catch (e) {
        console.warn("Could not show system notification:", e);
      }
    }
  }

  // Dismiss active call notifications & clear app badge
  public dismissNotifications() {
    this.clearAppBadge();

    if (this.swRegistration && this.swRegistration.active) {
      this.swRegistration.active.postMessage({ action: 'DISMISS_CALL_NOTIFICATIONS' });
    }

    if ('registration' in navigator && (navigator as any).serviceWorker) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.getNotifications({ tag: 'incoming-call' }).then((notifications) => {
          notifications.forEach(n => n.close());
        });
      }).catch(() => {});
    }
  }

  // Set App Launcher Icon Badge
  public setAppBadge(count: number = 1) {
    if ('setAppBadge' in navigator) {
      try {
        (navigator as any).setAppBadge(count).catch(() => {});
      } catch (e) {}
    }
  }

  // Clear App Launcher Icon Badge
  public clearAppBadge() {
    if ('clearAppBadge' in navigator) {
      try {
        (navigator as any).clearAppBadge().catch(() => {});
      } catch (e) {}
    }
  }

  // Play synthesized modern phone ringtone using Web Audio API
  public startRingtone() {
    if (this.isRinging) return;
    this.isRinging = true;

    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([500, 200, 500, 200, 500]);
      } catch (e) {}
    }

    const playChimeSequence = () => {
      if (!this.isRinging) return;
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        if (!this.audioCtx || this.audioCtx.state === 'closed') {
          this.audioCtx = new AudioContextClass();
        }

        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }

        const now = this.audioCtx.currentTime;
        const notes = [
          { freq: 659.25, time: 0, dur: 0.18 },
          { freq: 830.61, time: 0.22, dur: 0.18 },
          { freq: 987.77, time: 0.44, dur: 0.25 },
          { freq: 1318.51, time: 0.72, dur: 0.45 }
        ];

        notes.forEach(n => {
          const osc = this.audioCtx!.createOscillator();
          const gain = this.audioCtx!.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(n.freq, now + n.time);

          gain.gain.setValueAtTime(0.001, now + n.time);
          gain.gain.exponentialRampToValueAtTime(0.35, now + n.time + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + n.time + n.dur);

          osc.connect(gain);
          gain.connect(this.audioCtx!.destination);

          osc.start(now + n.time);
          osc.stop(now + n.time + n.dur);
        });

      } catch (err) {
        console.warn("Ringtone audio notice:", err);
      }
    };

    playChimeSequence();
    this.ringtoneInterval = setInterval(() => {
      playChimeSequence();
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate([500, 200, 500, 200, 500]);
        } catch (e) {}
      }
    }, 2400);
  }

  // Stop ringtone and vibration immediately
  public stopRingtone() {
    this.isRinging = false;
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch (e) {}
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close().catch(() => {});
      } catch (e) {}
      this.audioCtx = null;
    }
  }
}

export const callNotification = new CallNotificationService();
