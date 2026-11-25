import { isPlaceholderAvatar, normalizeTelegramHandle } from './telegramProfile';

export function normalizeTelegramUrl(raw?: string | null): string {
  const clean = normalizeTelegramHandle(raw);
  if (!clean || /^\d+$/.test(clean)) return '';
  return `https://t.me/${clean}`;
}

export function calculateAgeFromBirthDate(birthDateStr?: string | null, fallbackAge: number = 22, nowDate: Date = new Date()): number {
  const safeFallback = Number.isFinite(Number(fallbackAge)) && Number(fallbackAge) >= 18
    ? Math.min(99, Math.round(Number(fallbackAge)))
    : 22;
  if (!birthDateStr) return safeFallback;
  const parts = String(birthDateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!parts) {
    const parsed = new Date(birthDateStr);
    if (isNaN(parsed.getTime())) return safeFallback;
    let age = nowDate.getFullYear() - parsed.getFullYear();
    const m = nowDate.getMonth() - parsed.getMonth();
    if (m < 0 || (m === 0 && nowDate.getDate() < parsed.getDate())) age -= 1;
    return age >= 18 && age <= 99 ? age : safeFallback;
  }
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  let age = nowDate.getFullYear() - year;
  const currentMonth = nowDate.getMonth() + 1;
  const currentDay = nowDate.getDate();
  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age -= 1;
  }
  return age >= 18 && age <= 99 ? age : safeFallback;
}

export function deriveBirthDateFromAge(ageInput: number, existingBirthDate?: string | null, nowDate: Date = new Date()): string {
  const clampedAge = Math.max(18, Math.min(99, Math.round(Number(ageInput) || 22)));
  const existingMatch = String(existingBirthDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const month = existingMatch ? Number(existingMatch[2]) : 5;
  const day = existingMatch ? Number(existingMatch[3]) : 15;
  const currentMonth = nowDate.getMonth() + 1;
  const currentDay = nowDate.getDate();
  const hadBirthdayThisYear = currentMonth > month || (currentMonth === month && currentDay >= day);
  const birthYear = nowDate.getFullYear() - clampedAge - (hadBirthdayThisYear ? 0 : 1);
  const mm = String(Math.max(1, Math.min(12, month))).padStart(2, '0');
  const dd = String(Math.max(1, Math.min(28, day))).padStart(2, '0');
  return `${birthYear}-${mm}-${dd}`;
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
      const nextAuthorIsAdmin = Boolean(updatedUser.role === 'admin' || updatedUser.isAdmin);
      const nextAuthorRole = nextAuthorIsAdmin ? 'admin' : 'user';
      if (Boolean(nextPost.authorIsAdmin) !== nextAuthorIsAdmin || nextPost.authorRole !== nextAuthorRole) {
        nextPost.authorIsAdmin = nextAuthorIsAdmin;
        nextPost.authorRole = nextAuthorRole;
        changed = true;
      }
      if ((updatedUser.gender === 'male' || updatedUser.gender === 'female') && nextPost.authorGender !== updatedUser.gender) {
        nextPost.authorGender = updatedUser.gender;
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
      const partnerIsAdmin = Boolean(updatedUser.role === 'admin' || updatedUser.isAdmin);
      chat.partner = {
        ...chat.partner,
        uid: updatedUser.uid,
        id: updatedUser.id || chat.partner.id,
        name: newName || chat.partner.name,
        username: newUsername !== undefined ? newUsername : chat.partner.username,
        avatar: newAvatar !== undefined ? newAvatar : chat.partner.avatar,
        gender: updatedUser.gender || chat.partner.gender,
        age: updatedUser.age || chat.partner.age,
        birthDate: updatedUser.birthDate || chat.partner.birthDate,
        startGifUrl: updatedUser.startGifUrl !== undefined ? String(updatedUser.startGifUrl || '') : (chat.partner.startGifUrl || ''),
        isVerified,
        role: partnerIsAdmin ? 'admin' : 'user',
        isAdmin: partnerIsAdmin,
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

const STRING_LIST_FIELDS = ['photos', 'gallery', 'media', 'interests'] as const;

export function deduplicateStringList(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = typeof item === 'string' ? item.trim() : '';
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

export function sanitizeUserProfileCollections<T extends Record<string, any>>(user: T): T {
  if (!user || typeof user !== 'object') return user;
  const next: Record<string, any> = { ...user };
  for (const field of STRING_LIST_FIELDS) {
    if (Array.isArray(next[field])) {
      next[field] = deduplicateStringList(next[field]);
    }
  }
  return next as T;
}

export function extractUserMediaUrls(user: any): string[] {
  if (!user || typeof user !== 'object') return [];
  const urls: string[] = [];
  const push = (val: unknown) => {
    const clean = typeof val === 'string' ? val.trim() : '';
    if (clean) urls.push(clean);
  };
  push(user.avatar);
  push(user.banner);
  push(user.videoUrl);
  push(user.startGifUrl);
  push(user.faceId?.capturedPhotoUrl);
  for (const field of ['photos', 'gallery', 'media'] as const) {
    if (Array.isArray(user[field])) {
      for (const item of user[field]) {
        push(item);
      }
    }
  }
  return deduplicateStringList(urls);
}

export function collectReplacedUserMediaUrls(previousUser: any, nextUser: any): string[] {
  if (!previousUser || typeof previousUser !== 'object') return [];
  const prevUrls = extractUserMediaUrls(previousUser);
  const nextSet = new Set(extractUserMediaUrls(nextUser));
  return prevUrls.filter(
    (url) => (url.startsWith('/api/media/') || url.startsWith('/api/face-id/photo/')) && !nextSet.has(url)
  );
}

export function deduplicateUsersList<T extends Record<string, any>>(
  users: T[]
): { users: T[]; removedUids: string[] } {
  if (!Array.isArray(users) || users.length === 0) {
    return { users: [], removedUids: [] };
  }

  const groups: T[][] = [];
  for (const candidate of users) {
    if (!candidate || typeof candidate !== 'object' || !candidate.uid) continue;
    let matchedGroup: T[] | null = null;
    for (const group of groups) {
      if (group.some((member) => userSharesIdentity(member, candidate))) {
        matchedGroup = group;
        break;
      }
    }
    if (matchedGroup) {
      matchedGroup.push(candidate);
    } else {
      groups.push([candidate]);
    }
  }

  const canonicalUsers: T[] = [];
  const removedUids: string[] = [];

  for (const group of groups) {
    const winner = pickNewestCanonicalUser(group) as T | null;
    if (!winner) continue;
    canonicalUsers.push(sanitizeUserProfileCollections(winner));
    for (const member of group) {
      if (member.uid && member.uid !== winner.uid) {
        removedUids.push(String(member.uid));
      }
    }
  }

  return { users: canonicalUsers, removedUids };
}

export function upsertUniqueUserInList<T extends Record<string, any>>(
  users: T[],
  updatedUser: T | null | undefined
): T[] {
  if (!updatedUser || typeof updatedUser !== 'object') return Array.isArray(users) ? users : [];
  const cleanUpdated = sanitizeUserProfileCollections(updatedUser);
  const nextUid = String(cleanUpdated.uid || '').trim();
  const nextId = String(cleanUpdated.id || '').trim();
  if (!nextUid && !nextId) return Array.isArray(users) ? users : [];

  const list = Array.isArray(users) ? users : [];
  let inserted = false;
  const result: T[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const sameUid = Boolean(nextUid && String(item.uid || '').trim() === nextUid);
    const sameId = Boolean(nextId && String(item.id || '').trim() === nextId);
    const sharedIdentity = userSharesIdentity(item, cleanUpdated);
    if (sameUid || sameId || sharedIdentity) {
      if (!inserted) {
        result.push(cleanUpdated);
        inserted = true;
      }
      continue;
    }
    result.push(item);
  }

  if (!inserted) {
    result.push(cleanUpdated);
  }

  return result;
}

export function buildUpdatedUserSnapshot(
  existing: any,
  updates: any,
  options?: { isProfileEdit?: boolean; replaceInitialAvatar?: boolean }
): any {
  const base = existing && typeof existing === 'object' ? { ...existing } : {};
  const incoming = updates && typeof updates === 'object' ? updates : {};
  const isProfileEdit = Boolean(options?.isProfileEdit || incoming.isProfileEdit);
  const next: Record<string, any> = { ...base };

  // Preserve original uid on profile edits so duplicate accounts are never created
  const originalUid = base.uid ? String(base.uid).trim() : '';

  for (const [key, val] of Object.entries(incoming)) {
    if (val === undefined || key === 'isProfileEdit' || key === 'replaceInitialAvatar') continue;
    if (
      val === null &&
      [
        'username',
        'banner',
        'videoUrl',
        'startGifUrl',
        'bio',
        'phone',
        'telegram',
        'instagram',
        'neighborhood',
        'avatar',
        'photoURL',
      ].includes(key)
    ) {
      next[key] = '';
      continue;
    }
    if (STRING_LIST_FIELDS.includes(key as any) && Array.isArray(val)) {
      next[key] = deduplicateStringList(val);
      continue;
    }
    next[key] = val;
  }

  if (isProfileEdit && originalUid) {
    next.uid = originalUid;
  }

  // Keep name shadows locked to the edited primary name (wipe stale first_name/last_name/displayName)
  if (incoming.name !== undefined && isExplicitProfileDisplayName(next.name)) {
    const cleanName = String(next.name).trim();
    next.name = cleanName;
    next.firstName = cleanName;
    next.first_name = cleanName;
    next.lastName = '';
    next.last_name = '';
  }

  // Replace stale photoURL when avatar has been explicitly updated or cleared
  if (incoming.avatar !== undefined && !isPlaceholderAvatar(incoming.avatar)) {
    const cleanAvatar = String(incoming.avatar || '').trim();
    if (!cleanAvatar) {
      next.photoURL = '';
    } else if (!cleanAvatar.startsWith('data:')) {
      next.photoURL = cleanAvatar;
    } else {
      next.photoURL = '';
    }
  }

  // When user replaces or removes their initial/Face-ID avatar during edit, wipe old faceId.capturedPhotoUrl
  // while keeping biometric verification status & detected gender intact.
  const oldFacePhoto = String(base?.faceId?.capturedPhotoUrl || '').trim();
  const nextAvatarClean = String(next.avatar || '').trim();
  const explicitlyReplacedAvatar = Boolean(
    options?.replaceInitialAvatar ||
      incoming.replaceInitialAvatar ||
      (isProfileEdit &&
        incoming.avatar !== undefined &&
        oldFacePhoto &&
        nextAvatarClean !== oldFacePhoto &&
        (next.hasCustomAvatar === true || nextAvatarClean === ''))
  );
  if (explicitlyReplacedAvatar && next.faceId && typeof next.faceId === 'object') {
    const nextFaceId = { ...next.faceId };
    delete nextFaceId.capturedPhotoUrl;
    next.faceId = nextFaceId;
  }

  // Keep faceId.detectedGender synchronized when user.gender is updated (e.g. by Admin)
  if ((next.gender === 'male' || next.gender === 'female') && next.faceId && typeof next.faceId === 'object') {
    next.faceId = {
      ...next.faceId,
      detectedGender: next.gender,
      genderLabelUz: next.gender === 'female' ? 'Qiz (Ayol)' : 'Yigit (Erkak)',
    };
  }

  if (isProfileEdit) {
    next.hasEditedProfile = true;
    next.profileUpdatedAt = String(incoming.profileUpdatedAt || incoming.updatedAt || new Date().toISOString());
  }

  // Never keep stale initial-login / legacy shadows around
  delete next.telegramUsername;
  delete next.displayName;
  delete next.initialName;
  delete next.initialAvatar;
  delete next.googlePhotoURL;
  delete next.isProfileEdit;
  delete next.replaceInitialAvatar;

  return sanitizeUserProfileCollections(next);
}

/**
 * Merges incoming Telegram/Google login provider payload into an existing account WITHOUT
 * letting initial-login provider fields overwrite edited primary profile attributes.
 */
export function mergeReturningAuthProfile(
  storedUser: any,
  providerData: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    avatar?: string | null;
    telegram?: string | null;
    telegramChatId?: number | string | null;
    phone?: string | null;
    email?: string | null;
  } = {}
): any {
  if (!storedUser || typeof storedUser !== 'object') return storedUser;
  const next = { ...storedUser };
  const isEditedOrCompleted = Boolean(next.hasEditedProfile || next.isProfileCompleted);

  if (!isEditedOrCompleted) {
    if (providerData.name && isExplicitProfileDisplayName(providerData.name) && !isExplicitProfileDisplayName(next.name)) {
      next.name = String(providerData.name).trim();
    }
    if (providerData.avatar && !next.avatar && !next.hasCustomAvatar) {
      next.avatar = String(providerData.avatar).trim();
    }
  }

  // Always anchor explicit edited name into firstName and clear lastName
  if (isExplicitProfileDisplayName(next.name)) {
    const cleanName = String(next.name).trim();
    next.name = cleanName;
    next.firstName = cleanName;
    next.first_name = cleanName;
    next.lastName = '';
    next.last_name = '';
  }

  // Backfill ONLY strictly missing auth linkers (never overwrite edited handle/phone)
  if (!next.telegramChatId && providerData.telegramChatId) {
    next.telegramChatId = Number(providerData.telegramChatId);
  }
  if (next.telegram === undefined && providerData.telegram) {
    next.telegram = normalizeTelegramUrl(providerData.telegram) || String(providerData.telegram).trim();
  }
  if (next.phone === undefined && providerData.phone) {
    next.phone = String(providerData.phone).trim();
  }
  if (!next.email && providerData.email) {
    next.email = String(providerData.email).trim();
  }

  delete next.telegramUsername;
  delete next.displayName;
  delete next.initialName;
  delete next.initialAvatar;
  delete next.googlePhotoURL;

  return sanitizeUserProfileCollections(next);
}

export function mergeAuthoritativeUserState(
  prevUser: any | null | undefined,
  serverUser: any | null | undefined
): any | null {
  if (!serverUser || typeof serverUser !== 'object') return prevUser || null;
  const clean = sanitizeUserProfileCollections({ ...serverUser });
  if (!clean.authToken && prevUser?.authToken) {
    clean.authToken = prevUser.authToken;
  }
  return clean;
}

export interface StorageLike {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface VersionCacheReconciliationResult {
  previousVersion: string;
  currentVersion: string;
  versionChanged: boolean;
  clearedKeys: string[];
  preservedUserId: string;
  preservedToken: string;
}

const STALE_SNAPSHOT_PREFIXES = [
  'alov_user_',
  'alov_chats_',
  'alov_msgs_',
];

export function collectStaleCacheKeys(storage: StorageLike): string[] {
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (!k) continue;
    if (
      k === 'alov_current_user' ||
      STALE_SNAPSHOT_PREFIXES.some((prefix) => k.startsWith(prefix))
    ) {
      keysToRemove.push(k);
    }
  }
  return keysToRemove;
}

export function purgeLegacyLocalChatCaches(storage: StorageLike | null | undefined): string[] {
  if (!storage) return [];
  const removed: string[] = [];
  try {
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const k = storage.key(i);
      if (k && (k.startsWith('alov_chats_') || k.startsWith('alov_msgs_'))) {
        storage.removeItem(k);
        removed.push(k);
      }
    }
  } catch {
    // ignore storage errors
  }
  return removed;
}

/**
 * Compares stored `alov_app_version` with the running `currentVersion` BEFORE overwriting it.
 * Whenever the version changes, removes stale cached profile snapshots (`alov_current_user`,
 * `alov_user_*`) and any legacy browser chat caches (`alov_chats_*`, `alov_msgs_*`) since chats
 * persist strictly on Render permanent storage, while preserving posts (`alov_posts_*`) and active
 * auth session credentials (`alov_user_id`, `alov_auth_token`, `alov_tg_chat_*`).
 */
export function reconcileAppVersionCache(
  storage: StorageLike | null | undefined,
  currentVersion: string
): VersionCacheReconciliationResult {
  const cleanCurrentVersion = String(currentVersion || '').trim();
  if (!storage) {
    return {
      previousVersion: '',
      currentVersion: cleanCurrentVersion,
      versionChanged: false,
      clearedKeys: [],
      preservedUserId: '',
      preservedToken: '',
    };
  }

  let previousVersion = '';
  let preservedUserId = '';
  let preservedToken = '';

  try {
    previousVersion = String(storage.getItem('alov_app_version') || '').trim();
    preservedUserId = String(
      storage.getItem('alov_user_id') || storage.getItem('userId') || ''
    ).trim();
    preservedToken = String(
      storage.getItem('alov_auth_token') ||
        storage.getItem('token') ||
        storage.getItem('authToken') ||
        ''
    ).trim();

    if (!preservedUserId || !preservedToken) {
      const rawCachedUser = storage.getItem('alov_current_user');
      if (rawCachedUser) {
        const parsed = JSON.parse(rawCachedUser);
        if (parsed && typeof parsed === 'object') {
          if (!preservedUserId && (parsed.uid || parsed.id)) {
            preservedUserId = String(parsed.uid || parsed.id).trim();
          }
          if (!preservedToken && (parsed.authToken || parsed.token)) {
            preservedToken = String(parsed.authToken || parsed.token).trim();
          }
        }
      }
    }
  } catch {
    // ignore storage/JSON parse errors
  }

  const versionChanged = Boolean(cleanCurrentVersion && previousVersion !== cleanCurrentVersion);
  const clearedKeys: string[] = [];

  if (versionChanged) {
    try {
      const staleKeys = collectStaleCacheKeys(storage);
      for (const k of staleKeys) {
        storage.removeItem(k);
        clearedKeys.push(k);
      }
      if (preservedUserId) {
        storage.setItem('alov_user_id', preservedUserId);
        storage.setItem('userId', preservedUserId);
      }
      if (preservedToken) {
        storage.setItem('alov_auth_token', preservedToken);
        storage.setItem('token', preservedToken);
      }
    } catch {
      // ignore storage quota errors
    }
  }

  try {
    if (cleanCurrentVersion) {
      storage.setItem('alov_app_version', cleanCurrentVersion);
    }
  } catch {
    // ignore storage errors
  }

  return {
    previousVersion,
    currentVersion: cleanCurrentVersion,
    versionChanged,
    clearedKeys,
    preservedUserId,
    preservedToken,
  };
}

export function writeAuthoritativeUserCache(
  storage: Pick<StorageLike, 'length' | 'key' | 'setItem' | 'removeItem'> | null | undefined,
  user: any
): void {
  if (!storage || !user || typeof user !== 'object' || !user.uid) return;
  try {
    const cleanUser = sanitizeUserProfileCollections(user);
    const serialized = JSON.stringify(cleanUser);
    const keepUserKey = `alov_user_${cleanUser.uid}`;
    // Clear ALL previous profile snapshot keys before writing fresh authoritative profile from server
    storage.removeItem('alov_current_user');
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const k = storage.key(i);
      if (k && k.startsWith('alov_user_')) {
        storage.removeItem(k);
      }
    }
    storage.setItem('alov_current_user', serialized);
    storage.setItem(keepUserKey, serialized);
  } catch {
    // ignore storage quota errors
  }
}

