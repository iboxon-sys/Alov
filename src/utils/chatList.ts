export function buildCanonicalChatId(uidA: string, uidB: string): string {
  const a = String(uidA || '').trim();
  const b = String(uidB || '').trim();
  if (!a && !b) return '';
  if (!a) return b;
  if (!b) return a;
  return [a, b].sort().join('_');
}

export function resolvePartnerUidForChat(
  chat: any,
  myUid: string,
  myAliases: string[] = [],
  usersList: any[] = []
): string {
  const selfKeys = new Set(
    [myUid, ...myAliases].map((v) => String(v || '').trim()).filter(Boolean)
  );
  const participants: string[] = Array.isArray(chat?.participants)
    ? chat.participants.map((p: any) => String(p || '').trim()).filter(Boolean)
    : [];

  for (const p of participants) {
    if (!selfKeys.has(p)) {
      const matched = usersList.find((u) => u && (u.uid === p || u.id === p));
      return String(matched?.uid || p);
    }
  }

  const partnerCandidate = chat?.partner?.uid || chat?.partner?.id;
  if (partnerCandidate && !selfKeys.has(String(partnerCandidate))) {
    const matched = usersList.find(
      (u) => u && (u.uid === partnerCandidate || u.id === partnerCandidate)
    );
    return String(matched?.uid || partnerCandidate);
  }

  return '';
}

function getTimestampMs(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val?.toDate === 'function') return val.toDate().getTime();
  const parsed = new Date(val).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function mergeChatLists(
  lists: any[][],
  myUid: string,
  options: { myAliases?: string[]; usersList?: any[] } = {}
): any[] {
  const myAliases = options.myAliases || [];
  const usersList = options.usersList || [];
  const deduped = new Map<string, any>();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const rawChat of list) {
      if (!rawChat || typeof rawChat !== 'object') continue;
      const partnerUid = resolvePartnerUidForChat(rawChat, myUid, myAliases, usersList);
      const canonicalId =
        partnerUid && myUid ? buildCanonicalChatId(myUid, partnerUid) : String(rawChat.id || '').trim();
      if (!canonicalId) continue;

      const dedupeKey = partnerUid ? `partner:${partnerUid}` : `id:${canonicalId}`;
      const existing = deduped.get(dedupeKey);

      const resolvedPartner =
        usersList.find((u) => u && (u.uid === partnerUid || u.id === partnerUid)) ||
        rawChat.partner ||
        existing?.partner ||
        (partnerUid ? { uid: partnerUid, id: partnerUid, name: 'Foydalanuvchi' } : undefined);

      const participants = Array.from(
        new Set(
          [
            myUid,
            partnerUid,
            ...(Array.isArray(existing?.participants) ? existing.participants : []),
            ...(Array.isArray(rawChat.participants) ? rawChat.participants : []),
          ]
            .map((x) => String(x || '').trim())
            .filter(Boolean)
        )
      );

      if (!existing) {
        deduped.set(dedupeKey, {
          ...rawChat,
          id: rawChat.id || canonicalId,
          canonicalId,
          participants,
          partner: resolvedPartner,
        });
        continue;
      }

      const existingTime = getTimestampMs(existing.updatedAt);
      const incomingTime = getTimestampMs(rawChat.updatedAt);
      const preferIncoming = incomingTime >= existingTime;

      const existingMsg = String(existing.lastMessage || '').trim();
      const incomingMsg = String(rawChat.lastMessage || '').trim();
      const isGenericInit = (m: string) => !m || m === 'Yangi suhbat boshlandi';

      let chosenLastMessage = preferIncoming ? incomingMsg || existingMsg : existingMsg || incomingMsg;
      if (isGenericInit(chosenLastMessage) && !isGenericInit(existingMsg)) {
        chosenLastMessage = existingMsg;
      } else if (isGenericInit(chosenLastMessage) && !isGenericInit(incomingMsg)) {
        chosenLastMessage = incomingMsg;
      }

      const unreadCount = {
        ...(existing.unreadCount || {}),
        ...(rawChat.unreadCount || {}),
      };

      deduped.set(dedupeKey, {
        ...existing,
        ...rawChat,
        id: existing.id || rawChat.id || canonicalId,
        canonicalId,
        participants,
        partner: resolvedPartner,
        lastMessage: chosenLastMessage || 'Yangi suhbat boshlandi',
        unreadCount,
        updatedAt: preferIncoming
          ? rawChat.updatedAt || existing.updatedAt
          : existing.updatedAt || rawChat.updatedAt,
      });
    }
  }

  return Array.from(deduped.values()).sort(
    (a, b) => getTimestampMs(b.updatedAt) - getTimestampMs(a.updatedAt)
  );
}
