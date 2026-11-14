import { normalizeTelegramHandle } from './telegramProfile';

export interface ExactUserResolution {
  isSelf: boolean;
  user: any | null;
}

export function resolveExactUserByUid(
  targetIdentifier: string | null | undefined,
  usersList: any[],
  currentUser?: any | null,
  snapshot?: any | null
): ExactUserResolution {
  const key = String(targetIdentifier || '').trim();
  if (!key) return { isSelf: false, user: null };

  const currentUid = currentUser?.uid ? String(currentUser.uid) : '';
  const currentId = currentUser?.id ? String(currentUser.id) : '';
  if ((currentUid && key === currentUid) || (currentId && key === currentId)) {
    return { isSelf: true, user: currentUser };
  }

  const exactByUid = usersList.find((u) => u && String(u.uid || '') === key);
  if (exactByUid) {
    return { isSelf: false, user: exactByUid };
  }

  const exactById = usersList.find((u) => u && String(u.id || '') === key);
  if (exactById) {
    return { isSelf: false, user: exactById };
  }

  if (snapshot && (String(snapshot.uid || '') === key || String(snapshot.id || '') === key)) {
    return { isSelf: false, user: snapshot };
  }

  return { isSelf: false, user: null };
}

export function resolveConnectionUsers(
  connectionIds: string[] | undefined | null,
  usersList: any[],
  currentUser?: any | null
): any[] {
  if (!Array.isArray(connectionIds) || connectionIds.length === 0) return [];
  const seenUids = new Set<string>();
  const resolved: any[] = [];

  for (const rawId of connectionIds) {
    const id = String(rawId || '').trim();
    if (!id) continue;
    const match = resolveExactUserByUid(id, usersList, currentUser);
    if (match.user) {
      const canonicalUid = String(match.user.uid || match.user.id);
      if (!seenUids.has(canonicalUid)) {
        seenUids.add(canonicalUid);
        resolved.push(match.user);
      }
    }
  }
  return resolved;
}

export interface CleanAuthDraftState {
  authEmail: string;
  authPassword: string;
  telegramInput: string;
  enteredTgCode: string;
  generatedTgCode: string;
  pendingTgUser: null;
  pendingGoogleUser: null;
  pendingFaceId: null;
  hasStartedBotError: boolean;
  errorMsg: string;
  regName: string;
  regBirthDate: string;
  regAge: string;
  regGender: 'female' | 'male';
  regRegion: string;
  regDistrict: string;
  regNeighborhood: string;
  regPhone: string;
  regTelegram: string;
  regInstagram: string;
  regBio: string;
  regAvatar: string;
  regBanner: string;
}

export function getInitialAuthDraftState(): CleanAuthDraftState {
  return {
    authEmail: '',
    authPassword: '',
    telegramInput: '',
    enteredTgCode: '',
    generatedTgCode: '',
    pendingTgUser: null,
    pendingGoogleUser: null,
    pendingFaceId: null,
    hasStartedBotError: false,
    errorMsg: '',
    regName: '',
    regBirthDate: '2002-05-15',
    regAge: '22',
    regGender: 'female',
    regRegion: 'Toshkent shahri',
    regDistrict: 'Yunusobod tumani',
    regNeighborhood: '',
    regPhone: '+99890',
    regTelegram: '',
    regInstagram: '',
    regBio: '',
    regAvatar: '',
    regBanner: '',
  };
}

export function telegramInputMatchesBotRecord(
  record: { chatId?: number; username?: string; phone?: string } | undefined | null,
  rawInput: string
): boolean {
  if (!record || !record.chatId || !rawInput) return false;
  const cleanHandle = normalizeTelegramHandle(rawInput);
  const cleanPhone = rawInput.replace(/\D/g, '');
  const recordHandle = normalizeTelegramHandle(record.username || '');
  const recordPhone = (record.phone || '').replace(/\D/g, '');

  if (cleanHandle && !/^\d+$/.test(cleanHandle) && recordHandle) {
    if (recordHandle === cleanHandle) return true;
  }

  if (cleanPhone.length >= 9 && recordPhone.length >= 9) {
    if (recordPhone.slice(-9) === cleanPhone.slice(-9)) return true;
  }

  return false;
}
