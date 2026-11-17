export interface StreamChatMessage {
  id: string;
  streamId?: string;
  senderUid: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  isHost: boolean;
  createdAt: string;
}

export interface FloatingHeartItem {
  id: string;
  left: number;
  size: number;
  variant: 'heart' | 'flame';
  senderUid?: string;
}

/**
 * Canonical Socket.io room name for a given live stream ID.
 */
export function getStreamRoomName(streamId: string): string {
  const clean = String(streamId || '').trim();
  return `stream_${clean}`;
}

/**
 * Legacy room name kept only for backwards compatibility during transition.
 */
export function getLegacyStreamRoomName(streamId: string): string {
  const clean = String(streamId || '').trim();
  return `live_stream_${clean}`;
}

/**
 * Normalizes an incoming live chat message and resolves whether the sender is the stream host.
 */
export function normalizeStreamChatMessage(
  raw: any,
  hostUid?: string | null,
  streamId?: string
): StreamChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text ?? raw.message ?? '').trim();
  if (!text) return null;

  const senderUid = String(raw.senderUid || raw.uid || raw.sender?.uid || 'guest').trim();
  const resolvedHostUid = hostUid ? String(hostUid).trim() : '';
  const isHost = Boolean(
    raw.isHost === true ||
      (resolvedHostUid && senderUid && senderUid === resolvedHostUid)
  );

  return {
    id: String(
      raw.id ||
        `live_msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    ),
    streamId: streamId || raw.streamId || undefined,
    senderUid,
    senderName: String(raw.senderName || raw.name || raw.sender?.name || 'Mehmon').trim() || 'Mehmon',
    senderAvatar: typeof raw.senderAvatar === 'string' ? raw.senderAvatar : (raw.avatar || ''),
    text,
    isHost,
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString(),
  };
}

/**
 * Appends a message to the live chat feed without duplicates, capping history length.
 */
export function appendStreamChatMessage(
  prev: StreamChatMessage[],
  incoming: StreamChatMessage,
  maxMessages = 150
): StreamChatMessage[] {
  if (prev.some((m) => m.id === incoming.id)) {
    return prev;
  }
  const next = [...prev, incoming];
  if (next.length > maxMessages) {
    return next.slice(next.length - maxMessages);
  }
  return next;
}

/**
 * Creates a bounded floating heart/flame particle for live stream animations.
 */
export function createFloatingHeart(
  variant: 'heart' | 'flame' = 'heart',
  senderUid?: string,
  randomFn: () => number = Math.random
): FloatingHeartItem {
  const r1 = Math.min(0.9999, Math.max(0, randomFn()));
  const r2 = Math.min(0.9999, Math.max(0, randomFn()));
  return {
    id: `like_${Date.now()}_${Math.floor(r1 * 100000)}`,
    left: Math.floor(r1 * 64) + 18, // 18%..81% across screen width
    size: Math.floor(r2 * 10) + 24, // 24px..33px
    variant,
    senderUid,
  };
}

export function appendFloatingHeart(
  prev: FloatingHeartItem[],
  item: FloatingHeartItem,
  maxItems = 24
): FloatingHeartItem[] {
  const next = [...prev, item];
  if (next.length > maxItems) {
    return next.slice(next.length - maxItems);
  }
  return next;
}

/**
 * Formats live duration in MM:SS.
 */
export function formatStreamDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export interface StreamRoomState {
  hostSocketId: string | null;
  hostUid: string | null;
  participants: Set<string>;
}

/**
 * Resolves the destination socket ID for a stream signaling message.
 * Translates `'host'` into the registered broadcaster socket ID for that room.
 */
export function resolveStreamTargetSocketId(
  room: StreamRoomState | undefined,
  targetSocketId?: string | null
): string | null {
  if (!room) return targetSocketId && targetSocketId !== 'host' ? targetSocketId : null;
  if (!targetSocketId || targetSocketId === 'host') {
    return room.hostSocketId || null;
  }
  return targetSocketId;
}
