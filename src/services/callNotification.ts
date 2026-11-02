/**
 * Call notification & Web Audio synthesized ringtone service (WhatsApp / Telegram style)
 * Generates rhythmic telephone chime without requiring external audio downloads.
 */

class CallNotificationService {
  private audioCtx: AudioContext | null = null;
  private ringtoneInterval: any = null;
  private isRinging: boolean = false;

  // Request browser notification permission
  public async requestPermission(): Promise<NotificationPermission> {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        return await Notification.requestPermission();
      } catch (e) {
        return 'denied';
      }
    }
    return ('Notification' in window ? Notification.permission : 'denied') as NotificationPermission;
  }

  // Show system web notification
  public showCallNotification(callerName: string, avatarUrl?: string) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notif = new Notification("Kiruvchi video qo'ng'iroq 📞", {
          body: `${callerName} sizga video qo'ng'iroq qilmoqda...`,
          icon: avatarUrl || '/src/assets/images/alov_app_logo_1793451330582.jpg',
          tag: 'incoming-call',
          requireInteraction: true
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch (e) {
        console.warn("Could not show system notification:", e);
      }
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
        // WhatsApp / Telegram style harmonious two-tone melody (notes: E5, G#5, B5, E6)
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

          // Smooth exponential decay for marimba/bell timbre
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

    // Play immediately and repeat every 2.4 seconds
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
