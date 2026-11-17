import { isGifMessage } from './giphy.ts';

let monotonicMsgSeq = 0;

export function generateUniqueMessageId(prefix = 'msg'): string {
  monotonicMsgSeq = (monotonicMsgSeq + 1) % 100_000;
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}_${Date.now()}_${monotonicMsgSeq}_${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now()}_${monotonicMsgSeq}_${Math.random().toString(36).slice(2, 10)}`;
}

const STATUS_RANK: Record<string, number> = {
  sending: 0,
  sent: 1,
  read: 2,
};

function pickHigherStatus(a?: string, b?: string): 'sending' | 'sent' | 'read' {
  const rankA = STATUS_RANK[String(a || '')] ?? -1;
  const rankB = STATUS_RANK[String(b || '')] ?? -1;
  if (rankB > rankA && (b === 'sending' || b === 'sent' || b === 'read')) return b;
  if (a === 'sending' || a === 'sent' || a === 'read') return a;
  if (b === 'sending' || b === 'sent' || b === 'read') return b;
  return 'sent';
}

export function mergeUniqueChatMessages(...lists: Array<any[] | undefined | null>): any[] {
  const byId = new Map<string, { msg: any; order: number }>();
  let orderCounter = 0;

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const rawMsg of list) {
      if (!rawMsg || typeof rawMsg !== 'object') continue;
      const id = String(rawMsg.id || '').trim() || `__anon_${orderCounter}`;
      const existing = byId.get(id);
      if (!existing) {
        byId.set(id, {
          msg: {
            ...rawMsg,
            id,
            status: rawMsg.read ? 'read' : (rawMsg.status || 'sent'),
          },
          order: orderCounter++,
        });
      } else {
        const mergedRead = Boolean(existing.msg.read || rawMsg.read);
        const nextStatus = mergedRead
          ? 'read'
          : pickHigherStatus(existing.msg.status, rawMsg.status);
        byId.set(id, {
          order: existing.order,
          msg: {
            ...existing.msg,
            ...rawMsg,
            id,
            read: mergedRead,
            status: nextStatus,
            fileUrl: rawMsg.fileUrl ?? existing.msg.fileUrl ?? null,
            content: rawMsg.content ?? existing.msg.content,
            durationSec: rawMsg.durationSec ?? existing.msg.durationSec,
            fileName: rawMsg.fileName ?? existing.msg.fileName,
          },
        });
      }
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => {
      const ta = new Date(a.msg.createdAt || 0).getTime();
      const tb = new Date(b.msg.createdAt || 0).getTime();
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) {
        return ta - tb;
      }
      return a.order - b.order;
    })
    .map((entry) => entry.msg);
}

export function capMessagesForLocalCache(messages: any[], maxCount = 120): any[] {
  if (!Array.isArray(messages)) return [];
  const slice = messages.length > maxCount ? messages.slice(-maxCount) : messages;
  return slice.map((m) => {
    if (!m || typeof m !== 'object') return m;
    const rawUrl = typeof m.fileUrl === 'string' ? m.fileUrl : '';
    // Keep external/server URLs intact; drop oversized inline base64 blobs from localStorage cache so quota never fails
    if (rawUrl.startsWith('data:') && rawUrl.length > 64 * 1024) {
      return { ...m, fileUrl: '' };
    }
    return m;
  });
}

export function shouldAutoScrollConversation(params: {
  prevCount: number;
  nextCount: number;
  conversationChanged: boolean;
  forceScroll: boolean;
  isNearBottom: boolean;
}): boolean {
  if (params.conversationChanged || params.forceScroll) return true;
  if (params.nextCount > params.prevCount && params.isNearBottom) return true;
  return false;
}

export function formatMediaDuration(seconds?: number | null): string {
  const num = Number(seconds);
  if (!Number.isFinite(num) || num <= 0) return '0:00';
  const total = Math.floor(num);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function isFramelessChatMediaType(
  msg: { type?: string; fileUrl?: string | null; content?: string | null; text?: string | null } | null | undefined
): boolean {
  if (!msg) return false;
  if (msg.type === 'gif' || msg.type === 'image' || msg.type === 'video') return true;
  return isGifMessage(msg);
}
