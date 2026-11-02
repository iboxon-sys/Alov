/**
 * Call notification & Web Audio synthesized ringtone service (WhatsApp / Telegram style)
 * Supports Android standard Push Notifications via Service Worker and Web Audio ringtone.
 */

class CallNotificationService {
  private audioCtx: AudioContext | null = null;
  private ringtoneInterval: any = null;
  private isRinging: boolean = false;
  private swRegistration: ServiceWorkerRegistration | null = null;

  constructor() {
    this.registerServiceWorker();
  }

  // Register Service Worker for Android PWA notifications
  public async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        this.swRegistration = reg;
        console.log('Service Worker registered successfully:', reg.scope);
      } catch (err) {
        console.warn('Service Worker registration failed:', err);
      }
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

  // Show Android system web notification via Service Worker registration
  public async showCallNotification(callerName: string, avatarUrl?: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const title = "Kiruvchi video qo'ng'iroq 📞";
        const options = {
          body: `${callerName} sizga video qo'ng'iroq qilmoqda...`,
          icon: avatarUrl || '/favicon.ico',
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

  // Dismiss active call notifications when call is answered or rejected
  public dismissNotifications() {
    if ('registration' in navigator && (navigator as any).serviceWorker) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.getNotifications({ tag: 'incoming-call' }).then((notifications) => {
          notifications.forEach(n => n.close());
        });
      });
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        // Fallback dismissal if any
      } catch (e) {}
    }
  }

  // Play synthesized modern phone ringtone using Web Audio API
  public startRingtone() {
    if (this.isRinging) return;
    this.isRinging = true;

    // Vibrate device if supported
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([400, 200, 400, 1500]);
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
          navigator.vibrate([400, 200, 400, 1500]);
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
