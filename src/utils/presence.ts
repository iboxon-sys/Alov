export interface PresenceSocketEntry {
  socketId: string;
  uid?: string;
  streamId?: string;
  lastHeartbeatAt: number;
}

export class PresenceRegistry {
  private sockets = new Map<string, PresenceSocketEntry>();
  private uidSockets = new Map<string, Set<string>>();

  connectSocket(socketId: string, now: number = Date.now()): void {
    if (!socketId) return;
    if (!this.sockets.has(socketId)) {
      this.sockets.set(socketId, { socketId, lastHeartbeatAt: now });
    }
  }

  registerUser(
    socketId: string,
    uid: string,
    now: number = Date.now()
  ): { previousUid?: string; becameOnline: boolean; removedPreviousUidOffline: boolean } {
    if (!socketId || !uid) {
      return { becameOnline: false, removedPreviousUidOffline: false };
    }
    const existing = this.sockets.get(socketId) || { socketId, lastHeartbeatAt: now };
    const previousUid = existing.uid && existing.uid !== uid ? existing.uid : undefined;
    let removedPreviousUidOffline = false;

    if (previousUid) {
      const prevSet = this.uidSockets.get(previousUid);
      if (prevSet) {
        prevSet.delete(socketId);
        if (prevSet.size === 0) {
          this.uidSockets.delete(previousUid);
          removedPreviousUidOffline = true;
        }
      }
    }

    existing.uid = uid;
    existing.lastHeartbeatAt = now;
    this.sockets.set(socketId, existing);

    let set = this.uidSockets.get(uid);
    const wasOnline = Boolean(set && set.size > 0);
    if (!set) {
      set = new Set<string>();
      this.uidSockets.set(uid, set);
    }
    set.add(socketId);

    return {
      previousUid,
      becameOnline: !wasOnline,
      removedPreviousUidOffline,
    };
  }

  unregisterUser(socketId: string, targetUid?: string): { uid?: string; becameOffline: boolean } {
    const entry = this.sockets.get(socketId);
    const uid = targetUid || entry?.uid;
    if (entry && (!targetUid || entry.uid === targetUid)) {
      delete entry.uid;
      this.sockets.set(socketId, entry);
    }
    if (!uid) return { becameOffline: false };

    const set = this.uidSockets.get(uid);
    if (!set) return { uid, becameOffline: false };
    set.delete(socketId);
    if (set.size === 0) {
      this.uidSockets.delete(uid);
      return { uid, becameOffline: true };
    }
    return { uid, becameOffline: false };
  }

  disconnectSocket(socketId: string): { uid?: string; streamId?: string; becameOffline: boolean } {
    const entry = this.sockets.get(socketId);
    this.sockets.delete(socketId);
    if (!entry) return { becameOffline: false };

    const { uid, streamId } = entry;
    if (!uid) return { streamId, becameOffline: false };

    const set = this.uidSockets.get(uid);
    if (!set) return { uid, streamId, becameOffline: false };
    set.delete(socketId);
    if (set.size === 0) {
      this.uidSockets.delete(uid);
      return { uid, streamId, becameOffline: true };
    }
    return { uid, streamId, becameOffline: false };
  }

  heartbeat(socketId: string, uid?: string, now: number = Date.now()): boolean {
    const entry = this.sockets.get(socketId);
    if (!entry) return false;
    entry.lastHeartbeatAt = now;
    if (uid && entry.uid !== uid) {
      this.registerUser(socketId, uid, now);
    }
    return true;
  }

  setStream(socketId: string, streamId?: string): void {
    const entry = this.sockets.get(socketId);
    if (entry) {
      entry.streamId = streamId;
    }
  }

  getSocketInfo(socketId: string): PresenceSocketEntry | undefined {
    return this.sockets.get(socketId);
  }

  pruneStaleSockets(maxIdleMs: number, now: number = Date.now()): string[] {
    const wentOfflineUids: string[] = [];
    for (const [socketId, entry] of Array.from(this.sockets.entries())) {
      if (now - entry.lastHeartbeatAt > maxIdleMs) {
        const res = this.disconnectSocket(socketId);
        if (res.becameOffline && res.uid) {
          wentOfflineUids.push(res.uid);
        }
      }
    }
    return wentOfflineUids;
  }

  isUidOnline(uid?: string | null): boolean {
    if (!uid) return false;
    const set = this.uidSockets.get(uid);
    return Boolean(set && set.size > 0);
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.uidSockets.keys());
  }

  getOnlineCount(): number {
    return this.uidSockets.size;
  }
}

export function isUserOnlineStrict(
  user: any,
  onlineUserIds?: Set<string> | string[] | null
): boolean {
  if (!user) return false;
  if (user.isAI || user.uid === 'alov_ai_bot') return true;

  if (onlineUserIds) {
    const uid = user.uid ? String(user.uid) : '';
    const id = user.id ? String(user.id) : '';
    if (onlineUserIds instanceof Set) {
      return Boolean((uid && onlineUserIds.has(uid)) || (id && onlineUserIds.has(id)));
    }
    if (Array.isArray(onlineUserIds)) {
      return Boolean((uid && onlineUserIds.includes(uid)) || (id && onlineUserIds.includes(id)));
    }
  }

  return user.isOnline === true && user.status === 'online';
}

export function formatLastSeenUz(lastSeen?: string | null, isOnline?: boolean, nowMs: number = Date.now()): string {
  if (isOnline) return 'Onlayn';
  if (!lastSeen) return 'Oflayn';
  const ts = new Date(lastSeen).getTime();
  if (isNaN(ts)) return 'Oflayn';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return 'Hozirgina oflayn';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} daqiqa oldin`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} soat oldin`;
  return 'Oflayn';
}
