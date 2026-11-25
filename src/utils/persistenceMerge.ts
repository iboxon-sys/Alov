export function mergeChatStores(
  primaryChats: Record<string, any>,
  secondaryChats: Record<string, any>
): Record<string, any> {
  const merged: Record<string, any> = {};
  const allIds = new Set<string>([
    ...Object.keys(secondaryChats || {}),
    ...Object.keys(primaryChats || {}),
  ]);

  for (const chatId of allIds) {
    const a = primaryChats?.[chatId];
    const b = secondaryChats?.[chatId];
    if (a && !b) {
      merged[chatId] = a;
    } else if (!a && b) {
      merged[chatId] = b;
    } else if (a && b) {
      const tA = new Date(a.updatedAt || 0).getTime() || 0;
      const tB = new Date(b.updatedAt || 0).getTime() || 0;
      const winner = tB > tA ? b : a;
      const loser = winner === a ? b : a;
      merged[chatId] = {
        ...loser,
        ...winner,
        participants: Array.from(
          new Set([...(loser.participants || []), ...(winner.participants || [])].filter(Boolean))
        ),
        partner: winner.partner || loser.partner,
      };
    }
  }
  return merged;
}

export function mergeMessageStores(
  primaryMessages: Record<string, any[]>,
  secondaryMessages: Record<string, any[]>,
  maxPerChat: number = 250
): Record<string, any[]> {
  const merged: Record<string, any[]> = {};
  const allChatIds = new Set<string>([
    ...Object.keys(secondaryMessages || {}),
    ...Object.keys(primaryMessages || {}),
  ]);

  for (const chatId of allChatIds) {
    const listA = Array.isArray(primaryMessages?.[chatId]) ? primaryMessages[chatId] : [];
    const listB = Array.isArray(secondaryMessages?.[chatId]) ? secondaryMessages[chatId] : [];
    const byId = new Map<string, any>();

    for (const msg of [...listB, ...listA]) {
      if (!msg || typeof msg !== 'object') continue;
      const key = String(msg.id || `${msg.senderId || ''}_${msg.createdAt || ''}_${msg.text || ''}`);
      if (!key) continue;
      const existing = byId.get(key);
      if (!existing) {
        byId.set(key, msg);
      } else {
        byId.set(key, {
          ...existing,
          ...msg,
          read: Boolean(existing.read || msg.read),
          status: existing.status === 'read' || msg.status === 'read' ? 'read' : msg.status || existing.status,
        });
      }
    }

    const combined = Array.from(byId.values()).sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime() || 0;
      const tB = new Date(b.createdAt || 0).getTime() || 0;
      return tA - tB;
    });
    merged[chatId] = combined.length > maxPerChat ? combined.slice(-maxPerChat) : combined;
  }

  return merged;
}

export function mergeFriendshipStores(
  primary: Record<string, { active: boolean; toggledBy: string; updatedAt: string }>,
  secondary: Record<string, { active: boolean; toggledBy: string; updatedAt: string }>
): Record<string, { active: boolean; toggledBy: string; updatedAt: string }> {
  const merged: Record<string, { active: boolean; toggledBy: string; updatedAt: string }> = {};
  const allIds = new Set<string>([
    ...Object.keys(secondary || {}),
    ...Object.keys(primary || {}),
  ]);

  for (const chatId of allIds) {
    const a = primary?.[chatId];
    const b = secondary?.[chatId];
    if (a && !b) merged[chatId] = a;
    else if (!a && b) merged[chatId] = b;
    else if (a && b) {
      const tA = new Date(a.updatedAt || 0).getTime() || 0;
      const tB = new Date(b.updatedAt || 0).getTime() || 0;
      merged[chatId] = tB > tA ? b : a;
    }
  }
  return merged;
}

export function mergeRecordsByIdNewestFirst<T extends Record<string, any>>(
  primaryList: T[],
  secondaryList: T[],
  idField: string = 'id'
): T[] {
  const byId = new Map<string, T>();
  for (const item of [...(secondaryList || []), ...(primaryList || [])]) {
    if (!item || typeof item !== 'object') continue;
    const key = String(item[idField] || '').trim();
    if (!key) continue;
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, item);
    } else {
      const tNew = new Date(item.reviewedAt || item.updatedAt || item.createdAt || 0).getTime() || 0;
      const tOld = new Date(existing.reviewedAt || existing.updatedAt || existing.createdAt || 0).getTime() || 0;
      byId.set(key, tNew >= tOld ? { ...existing, ...item } : { ...item, ...existing });
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    const tA = new Date(a.createdAt || a.updatedAt || 0).getTime() || 0;
    const tB = new Date(b.createdAt || b.updatedAt || 0).getTime() || 0;
    return tB - tA;
  });
}

export function mergeTelegramBotUserMaps<T extends { chatId: number; updatedAt?: number }>(
  primaryEntries: Array<[string, T]>,
  secondaryEntries: Array<[string, T]>
): Map<string, T> {
  const merged = new Map<string, T>();
  for (const [k, v] of [...secondaryEntries, ...primaryEntries]) {
    if (!k || !v || !v.chatId) continue;
    const existing = merged.get(k);
    if (!existing || (Number(v.updatedAt) || 0) >= (Number(existing.updatedAt) || 0)) {
      merged.set(k, v);
    }
  }
  return merged;
}
