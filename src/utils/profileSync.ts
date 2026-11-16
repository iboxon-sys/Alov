import { isPlaceholderAvatar, normalizeTelegramHandle } from './telegramProfile';

export function normalizeTelegramUrl(raw?: string | null): string {
  const clean = normalizeTelegramHandle(raw);
  if (!clean || /^\d+$/.test(clean)) return '';
  return `https://t.me/${clean}`;
}

export function isExplicitProfileDisplayName(name?: string | null): boolean {
  if (!name) return false;
  const trimmed = String(name).trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower === 'foydalanuvchi' ||
    lower === 'profil' ||
    lower === 'mehmon' ||
    lower.includes('telegram foydalanuvch') ||
    lower.includes('alov foydalanuvch') ||
    trimmed.startsWith('@') ||
    lower.startsWith('https://t.me/') ||
    lower.startsWith('http://t.me/')
  ) {
    return false;
  }
  const digitsName = trimmed.replace(/\D/g, '');
  if (digitsName.length >= 7 && digitsName.length === trimmed.replace(/[\s+\-()]/g, '').length) {
    return false;
  }
  return true;
}

export function userSharesIdentity(a: any, b: any): boolean {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (a.uid && b.uid && String(a.uid) === String(b.uid)) return true;

  const emailA = String(a.email || '').trim().toLowerCase();
  const emailB = String(b.email || '').trim().toLowerCase();
  if (emailA && emailB && emailA === emailB) return true;

  const tgChatA = Number(a.telegramChatId || a.chatId || 0);
  const tgChatB = Number(b.telegramChatId || b.chatId || 0);
  if (tgChatA > 0 && tgChatB > 0 && tgChatA === tgChatB) return true;

  const tgA = normalizeTelegramHandle(a.telegram);
  const tgB = normalizeTelegramHandle(b.telegram);
  if (tgA && tgB && !/^\d+$/.test(tgA) && !/^\d+$/.test(tgB) && tgA === tgB) return true;

  const phoneA = String(a.phone || '').replace(/\D/g, '');
  const phoneB = String(b.phone || '').replace(/\D/g, '');
  if (phoneA.length >= 9 && phoneB.length >= 9 && phoneA.slice(-9) === phoneB.slice(-9)) {
    return true;
  }

  return false;
}

export function pickNewestCanonicalUser(records: any[]): any | null {
  const valid = records.filter((r) => r && typeof r === 'object' && r.uid);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => {
    const compDiff = Number(Boolean(b.isProfileCompleted)) - Number(Boolean(a.isProfileCompleted));
    if (compDiff !== 0) return compDiff;
    const tB = new Date(b.updatedAt || 0).getTime() || 0;
    const tA = new Date(a.updatedAt || 0).getTime() || 0;
    return tB - tA;
  });
  return sorted[0];
}

export interface ProfilePropagationStores {
  posts: any[];
  userChats: Record<string, any>;
  chatMessages: Record<string, any[]>;
  liveStreams: Record<string, any>;
  coinRequests: any[];
  withdrawals: any[];
}

export interface ProfilePropagationResult {
  postsChanged: boolean;
  chatsChanged: boolean;
  messagesChanged: boolean;
  streamsChanged: boolean;
  coinRequestsChanged: boolean;
  withdrawalsChanged: boolean;
}

export function propagateProfileUpdateAcrossStores(
  stores: ProfilePropagationStores,
  updatedUser: any,
  aliasIdentifiers: string[] = []
): ProfilePropagationResult {
  const result: ProfilePropagationResult = {
    postsChanged: false,
    chatsChanged: false,
    messagesChanged: false,
    streamsChanged: false,
    coinRequestsChanged: false,
    withdrawalsChanged: false,
  };
  if (!updatedUser?.uid) return result;

  const aliases = new Set<string>(
    [updatedUser.uid, updatedUser.id, ...aliasIdentifiers]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
  );

  const newName = String(updatedUser.name || '').trim();
  const newUsername = updatedUser.username !== undefined ? String(updatedUser.username) : undefined;
  const newAvatar =
    updatedUser.avatar !== undefined && !isPlaceholderAvatar(updatedUser.avatar)
      ? String(updatedUser.avatar)
      : updatedUser.avatar === ''
        ? ''
        : undefined;
  const isVerified = Boolean(updatedUser.faceId?.verified || updatedUser.isVerified);

  // 1. Posts & Comments
  for (let i = 0; i < stores.posts.length; i++) {
    const p = stores.posts[i];
    if (!p) continue;
    let changed = false;
    const nextPost = { ...p };
    if (aliases.has(String(p.authorUid || '')) || (p.authorId && aliases.has(String(p.authorId)))) {
      if (nextPost.authorUid !== updatedUser.uid) {
        nextPost.authorUid = updatedUser.uid;
        changed = true;
      }
      if (updatedUser.id && nextPost.authorId !== updatedUser.id) {
        nextPost.authorId = updatedUser.id;
        changed = true;
      }
      if (newName && nextPost.authorName !== newName) {
        nextPost.authorName = newName;
        changed = true;
      }
      if (newUsername !== undefined && nextPost.authorUsername !== newUsername) {
        nextPost.authorUsername = newUsername;
        changed = true;
      }
      if (newAvatar !== undefined && nextPost.authorAvatar !== newAvatar) {
        nextPost.authorAvatar = newAvatar;
        changed = true;
      }
      if (Boolean(nextPost.authorVerified) !== isVerified) {
        nextPost.authorVerified = isVerified;
        changed = true;
      }
    }
    if (Array.isArray(p.comments)) {
      const nextComments = p.comments.map((c: any) => {
        if (!c) return c;
        if (aliases.has(String(c.authorUid || '')) || (c.authorId && aliases.has(String(c.authorId)))) {
          const nextC = { ...c };
          if (nextC.authorUid !== updatedUser.uid) {
            nextC.authorUid = updatedUser.uid;
            changed = true;
          }
          if (newName && nextC.authorName !== newName) {
            nextC.authorName = newName;
            changed = true;
          }
          if (newUsername !== undefined && nextC.authorUsername !== newUsername) {
            nextC.authorUsername = newUsername;
            changed = true;
          }
          if (newAvatar !== undefined && nextC.authorAvatar !== newAvatar) {
            nextC.authorAvatar = newAvatar;
            changed = true;
          }
          return nextC;
        }
        return c;
      });
      nextPost.comments = nextComments;
    }
    if (changed) {
      stores.posts[i] = nextPost;
      result.postsChanged = true;
    }
  }

  // 2. User Chats partner snapshots & participants
  for (const chatId of Object.keys(stores.userChats)) {
    const chat = stores.userChats[chatId];
    if (!chat) continue;
    let changed = false;
    if (Array.isArray(chat.participants)) {
      const mapped = chat.participants.map((pid: string) =>
        aliases.has(String(pid)) && String(pid) !== String(updatedUser.uid) ? String(updatedUser.uid) : pid
      );
      const deduped = Array.from(new Set(mapped));
      if (deduped.length !== chat.participants.length || deduped.some((v, idx) => v !== chat.participants[idx])) {
        chat.participants = deduped;
        changed = true;
      }
    }
    if (chat.partner && (aliases.has(String(chat.partner.uid || '')) || aliases.has(String(chat.partner.id || '')))) {
      chat.partner = {
        ...chat.partner,
        uid: updatedUser.uid,
        id: updatedUser.id || chat.partner.id,
        name: newName || chat.partner.name,
        username: newUsername !== undefined ? newUsername : chat.partner.username,
        avatar: newAvatar !== undefined ? newAvatar : chat.partner.avatar,
        isVerified,
        faceId: updatedUser.faceId ?? chat.partner.faceId,
      };
      changed = true;
    }
    if (changed) result.chatsChanged = true;
  }

  // 3. Chat Messages sender snapshots
  for (const chatId of Object.keys(stores.chatMessages)) {
    const msgs = stores.chatMessages[chatId];
    if (!Array.isArray(msgs)) continue;
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (!m) continue;
      const senderKey = String(m.senderId || m.sender?.uid || m.sender?._id || '');
      if (!aliases.has(senderKey)) continue;
      const nextMsg = { ...m };
      let msgChanged = false;
      if (nextMsg.senderId !== updatedUser.uid) {
        nextMsg.senderId = updatedUser.uid;
        msgChanged = true;
      }
      if (newName && nextMsg.senderName !== newName) {
        nextMsg.senderName = newName;
        msgChanged = true;
      }
      if (newAvatar !== undefined && nextMsg.senderAvatar !== newAvatar) {
        nextMsg.senderAvatar = newAvatar;
        msgChanged = true;
      }
      if (nextMsg.sender && typeof nextMsg.sender === 'object') {
        const nextSender = {
          ...nextMsg.sender,
          _id: updatedUser.uid,
          uid: updatedUser.uid,
          name: newName || nextMsg.sender.name,
          avatar: newAvatar !== undefined ? newAvatar : nextMsg.sender.avatar,
        };
        if (
          nextSender.name !== nextMsg.sender.name ||
          nextSender.avatar !== nextMsg.sender.avatar ||
          nextSender.uid !== nextMsg.sender.uid
        ) {
          nextMsg.sender = nextSender;
          msgChanged = true;
        }
      }
      if (msgChanged) {
        msgs[i] = nextMsg;
        result.messagesChanged = true;
      }
    }
  }

  // 4. Live Streams
  for (const streamId of Object.keys(stores.liveStreams)) {
    const st = stores.liveStreams[streamId];
    if (!st) continue;
    if (aliases.has(String(st.hostUid || ''))) {
      const nextName = newName || st.hostName;
      const nextAvatar = newAvatar !== undefined ? newAvatar : st.hostAvatar;
      if (st.hostName !== nextName || st.hostAvatar !== nextAvatar || st.hostUid !== updatedUser.uid) {
        st.hostUid = updatedUser.uid;
        st.hostName = nextName;
        st.hostAvatar = nextAvatar;
        result.streamsChanged = true;
      }
    }
  }

  // 5. Coin Purchase Requests
  for (let i = 0; i < stores.coinRequests.length; i++) {
    const r = stores.coinRequests[i];
    if (!r) continue;
    if (aliases.has(String(r.userUid || '')) || (r.userId && aliases.has(String(r.userId)))) {
      const nextReq = {
        ...r,
        userUid: updatedUser.uid,
        userId: updatedUser.id || r.userId,
        userName: newName || r.userName,
        userAvatar: newAvatar !== undefined ? newAvatar : r.userAvatar,
      };
      if (
        nextReq.userUid !== r.userUid ||
        nextReq.userName !== r.userName ||
        nextReq.userAvatar !== r.userAvatar
      ) {
        stores.coinRequests[i] = nextReq;
        result.coinRequestsChanged = true;
      }
    }
  }

  // 6. Withdrawals
  for (let i = 0; i < stores.withdrawals.length; i++) {
    const w = stores.withdrawals[i];
    if (!w) continue;
    if (aliases.has(String(w.userUid || ''))) {
      const nextW = {
        ...w,
        userUid: updatedUser.uid,
        userName: newName || w.userName,
      };
      if (nextW.userUid !== w.userUid || nextW.userName !== w.userName) {
        stores.withdrawals[i] = nextW;
        result.withdrawalsChanged = true;
      }
    }
  }

  return result;
}
