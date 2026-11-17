import { normalizeTelegramHandle } from './telegramProfile';
import { isAdminTelegramUser } from './tokenomics';

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
  regUsername: string;
  regBirthDate: string;
  regAge: string;
  regGender: 'female' | 'male' | '';
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
    regUsername: '',
    regBirthDate: '2002-05-15',
    regAge: '22',
    regGender: '',
    regRegion: 'Toshkent shahri',
    regDistrict: 'Yunusobod tumani',
    regNeighborhood: '',
    regPhone: '+998 ',
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

const SYNTHETIC_PROFILE_PREFIX_RE = /^(test|demo|mock|seed|fake)_/i;
const KNOWN_TEST_HANDLES = new Set([
  'madina_live_01',
  'aziz_viewer_02',
  'madina_perm_01',
]);

export function isSyntheticDemoProfile(user: any): boolean {
  if (!user || typeof user !== 'object') return false;
  if (isAdminTelegramUser(user)) return false;
  if (user.isDemo === true || user.isMock === true || user.isTest === true) return true;
  const uid = String(user.uid || '').trim();
  const id = String(user.id || '').trim();
  if (SYNTHETIC_PROFILE_PREFIX_RE.test(uid) || SYNTHETIC_PROFILE_PREFIX_RE.test(id)) {
    return true;
  }
  const username = String(user.username || '').trim().toLowerCase().replace(/^@/, '');
  if (username && KNOWN_TEST_HANDLES.has(username)) return true;
  return false;
}

export function canPersistUserProfile(user: any): boolean {
  if (!user || typeof user !== 'object') return false;
  if (!user.uid && !user.id) return false;
  if (isAdminTelegramUser(user)) return true;
  if (isSyntheticDemoProfile(user)) return false;
  if (user.isProfileCompleted !== true) return false;
  if (user.faceId?.verified !== true) return false;
  if (user.gender !== 'male' && user.gender !== 'female') return false;
  if (!String(user.name || '').trim()) return false;
  return true;
}

export function canAuthenticateUserProfile(user: any): boolean {
  return canPersistUserProfile(user);
}

export function pruneIncompleteProfiles<T extends Record<string, any>>(users: T[]): T[] {
  if (!Array.isArray(users)) return [];
  return users.filter((u) => canPersistUserProfile(u));
}

export function formatAuthErrorMessage(
  err: any,
  context: 'login' | 'register' | 'google' = 'login'
): string {
  const code = String(err?.code || '').trim();
  const msg = String(err?.message || '').trim();

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password' ||
    msg.includes('auth/invalid-credential') ||
    msg.includes('auth/user-not-found') ||
    msg.includes('auth/wrong-password')
  ) {
    return "Bunday foydalanuvchi topilmadi, ro'yxatdan o'tish yakunlanmagan yoki parol noto'g'ri!";
  }

  if (code === 'auth/invalid-email' || msg.includes('auth/invalid-email')) {
    return "Email manzil formati noto'g'ri!";
  }

  if (code === 'auth/weak-password' || msg.includes('auth/weak-password')) {
    return "Parol kamida 6 ta belgidan iborat bo'lishi kerak!";
  }

  if (code === 'auth/email-already-in-use' || msg.includes('auth/email-already-in-use')) {
    return "Bu email allaqachon ro'yxatdan o'tgan. Iltimos, 'Kirish' bo'limidan kiring!";
  }

  if (code === 'auth/too-many-requests' || msg.includes('auth/too-many-requests')) {
    return "Juda ko'p urinish qilindi. Iltimos, birozdan so'ng qayta urinib ko'ring.";
  }

  if (code === 'auth/network-request-failed' || msg.includes('auth/network-request-failed')) {
    return "Internet aloqasi bilan muammo yuz berdi. Qayta urinib ko'ring.";
  }

  if (code === 'auth/popup-blocked' || msg.includes('auth/popup-blocked')) {
    return "Brauzer qalqib chiquvchi oynani (popup) blokladi. Ruxsat bering va qayta urinib ko'ring.";
  }

  if (msg && !msg.startsWith('Firebase:')) {
    return msg;
  }

  if (context === 'register') return "Ro'yxatdan o'tishda xatolik yuz berdi.";
  if (context === 'google') return "Google orqali kirishda xatolik yuz berdi.";
  return "Kirishda xatolik yuz berdi.";
}

export type AuthProviderKind = 'telegram' | 'google' | 'email';

export interface BootTelegramWebAppDecision {
  shouldAutoLogin: boolean;
  shouldOpenAuthModal: boolean;
  initialStep: null;
}

/**
 * Decides what happens when a Telegram Mini App user opens the site.
 * Never auto-opens Auth or Face ID modals on initial mount for unregistered visitors.
 */
export function resolveTelegramMiniAppBootAction(params: {
  exists: boolean;
  user?: any | null;
}): BootTelegramWebAppDecision {
  if (params.exists && params.user && canPersistUserProfile(params.user)) {
    return {
      shouldAutoLogin: true,
      shouldOpenAuthModal: false,
      initialStep: null,
    };
  }

  return {
    shouldAutoLogin: false,
    shouldOpenAuthModal: false,
    initialStep: null,
  };
}

/**
 * Decides the next step right after a user passes Telegram, Google, or Email authentication.
 * Returning completed users enter the app immediately; first-time users enter Face ID.
 */
export function resolvePostProviderAuthStep(params: {
  provider: AuthProviderKind;
  exists: boolean;
  user?: any | null;
}): 'enter_app' | 'face_id' {
  if (params.exists && params.user && canPersistUserProfile(params.user)) {
    return 'enter_app';
  }
  return 'face_id';
}

/**
 * Decides the next step right after Face ID verification succeeds for a first-time user.
 */
export function resolvePostFaceIdStep(provider: AuthProviderKind): 'profile_setup' | 'google_setup' {
  return provider === 'telegram' ? 'profile_setup' : 'google_setup';
}
