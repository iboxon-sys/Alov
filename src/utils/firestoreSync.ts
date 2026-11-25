import { isPlaceholderAvatar } from './telegramProfile';
import { canPersistUserProfile } from './profileLookup';
import { isAdminTelegramUser } from './tokenomics';

export const FIRESTORE_LIMITS = {
  ID_MAX: 128,
  NAME_MAX: 100,
  USERNAME_MAX: 32,
  REGION_MAX: 100,
  BIO_MAX: 500,
  URL_MAX: 1000,
  EMAIL_MAX: 160,
  PHONE_MAX: 32,
  CARD_MAX: 32,
  TEXT_MAX: 4000,
  CAPTION_MAX: 2000,
  MAX_COINS: 100_000_000,
  MAX_DIAMONDS: 100_000_000,
  MAX_PENDING_BATCHES: 50,
  MAX_LIKED_BY: 200,
} as const;

export function clampText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

export function clampNonNegativeNumber(value: unknown, maxVal: number, fallback: number = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.min(maxVal, num);
}

export function clampNonNegativeInt(value: unknown, maxVal: number, fallback: number = 0): number {
  return Math.floor(clampNonNegativeNumber(value, maxVal, fallback));
}

export interface FirestoreUserCoreDoc {
  uid: string;
  id: string;
  name: string;
  username: string;
  age: number;
  birthDate: string;
  gender: 'male' | 'female' | '';
  region: string;
  district: string;
  neighborhood: string;
  telegram: string;
  instagram: string;
  bio: string;
  avatar: string;
  banner: string;
  videoUrl: string;
  startGifUrl: string;
  hasCustomAvatar: boolean;
  hasEditedProfile: boolean;
  isProfileCompleted: boolean;
  isVerified: boolean;
  role: 'user' | 'admin';
  isAdmin: boolean;
  locationVisibility: 'everyone' | 'mutual' | 'ghost';
  isLocationEnabled: boolean;
  location?: { lat: number; lng: number; accuracy?: number };
  isOnline: boolean;
  status: 'online' | 'offline';
  followersCount: number;
  followingCount: number;
  likesCount: number;
  faceId?: {
    verified: boolean;
    detectedGender?: string | null;
    genderLabelUz?: string | null;
    confidence?: number;
    verifiedAt?: string;
    capturedPhotoUrl?: string;
  };
}

export interface FirestorePublicProfileDoc {
  uid: string;
  id: string;
  name: string;
  username: string;
  age: number;
  gender: 'male' | 'female' | '';
  region: string;
  district: string;
  bio: string;
  avatar: string;
  banner: string;
  videoUrl: string;
  startGifUrl: string;
  isVerified: boolean;
  isProfileCompleted: boolean;
  locationVisibility: 'everyone' | 'mutual' | 'ghost';
  isLocationEnabled: boolean;
  location?: { lat: number; lng: number };
  isOnline: boolean;
  status: 'online' | 'offline';
  followersCount: number;
  followingCount: number;
  likesCount: number;
}

export interface FirestorePrivateInfoDoc {
  uid: string;
  email: string;
  phone: string;
  bankCard: string;
  telegramChatId: number | null;
}

export interface FirestoreWalletDoc {
  uid: string;
  coins: number;
  diamonds: number;
  diamondProgress: number;
  pendingDiamondBatches: Array<{ id: string; amount: number; earnedAt: number; unlockAt: number }>;
  totalEarnedDiamonds: number;
  totalWithdrawnUzs: number;
}

export interface FirestoreUserSettingsDoc {
  uid: string;
  locationVisibility: 'everyone' | 'mutual' | 'ghost';
  isLocationEnabled: boolean;
  startGifUrl: string;
  language: string;
  notificationsEnabled: boolean;
}

export interface SplitFirestoreDocuments {
  uid: string;
  userDoc: FirestoreUserCoreDoc;
  publicProfileDoc: FirestorePublicProfileDoc;
  privateInfoDoc: FirestorePrivateInfoDoc;
  walletDoc: FirestoreWalletDoc;
  settingsDoc: FirestoreUserSettingsDoc;
}

function sanitizeSafeUrl(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || s.startsWith('data:') || s.startsWith('blob:')) return '';
  if (
    !s.startsWith('https://') &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?\//.test(s) &&
    !/^\/[a-zA-Z0-9_\-./]+(\?[a-zA-Z0-9_\-=&.%]+)?$/.test(s)
  ) {
    return '';
  }
  return s.length > FIRESTORE_LIMITS.URL_MAX ? s.slice(0, FIRESTORE_LIMITS.URL_MAX) : s;
}

function sanitizeLocation(raw: unknown): { lat: number; lng: number } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const lat = Number((raw as any).lat);
  const lng = Number((raw as any).lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

function sanitizeFaceId(raw: unknown): FirestoreUserCoreDoc['faceId'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, any>;
  const out: NonNullable<FirestoreUserCoreDoc['faceId']> = {
    verified: Boolean(src.verified),
  };
  if (src.detectedGender === 'male' || src.detectedGender === 'female') {
    out.detectedGender = src.detectedGender;
  }
  if (typeof src.genderLabelUz === 'string' && src.genderLabelUz.trim()) {
    out.genderLabelUz = clampText(src.genderLabelUz, 60);
  }
  if (typeof src.confidence === 'number' && Number.isFinite(src.confidence)) {
    out.confidence = Math.max(0, Math.min(100, Math.round(src.confidence)));
  }
  if (typeof src.verifiedAt === 'string' && src.verifiedAt.trim()) {
    out.verifiedAt = clampText(src.verifiedAt, 64);
  }
  const captured = sanitizeSafeUrl(src.capturedPhotoUrl);
  if (captured) {
    out.capturedPhotoUrl = captured;
  }
  return out;
}

function sanitizePendingBatches(
  raw: unknown
): Array<{ id: string; amount: number; earnedAt: number; unlockAt: number }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ id: string; amount: number; earnedAt: number; unlockAt: number }> = [];
  for (const item of raw.slice(0, FIRESTORE_LIMITS.MAX_PENDING_BATCHES)) {
    if (!item || typeof item !== 'object') continue;
    const id = clampText(String(item.id || ''), FIRESTORE_LIMITS.ID_MAX);
    const amount = clampNonNegativeNumber(item.amount, FIRESTORE_LIMITS.MAX_DIAMONDS, 0);
    const earnedAt = clampNonNegativeInt(item.earnedAt, 9_999_999_999_999, 0);
    const unlockAt = clampNonNegativeInt(item.unlockAt, 9_999_999_999_999, 0);
    if (id && amount > 0) {
      out.push({ id, amount, earnedAt, unlockAt });
    }
  }
  return out;
}

export function splitUserToFirestoreDocs(
  user: Record<string, any>,
  options: { isInitialCreate?: boolean } = {}
): SplitFirestoreDocuments | null {
  if (!user || typeof user !== 'object') return null;
  const uid = clampText(user.uid, FIRESTORE_LIMITS.ID_MAX);
  if (!uid) return null;

  const isInitialCreate = options.isInitialCreate === true;
  const rawGender = user.gender === 'male' || user.gender === 'female' ? user.gender : '';
  const rawVis =
    user.locationVisibility === 'everyone' ||
    user.locationVisibility === 'mutual' ||
    user.locationVisibility === 'ghost'
      ? user.locationVisibility
      : 'everyone';
  const isLocationEnabled = user.isLocationEnabled !== false && rawVis !== 'ghost';

  const avatar = !isPlaceholderAvatar(user.avatar) ? sanitizeSafeUrl(user.avatar) : '';
  const banner = sanitizeSafeUrl(user.banner);
  const videoUrl = sanitizeSafeUrl(user.videoUrl);
  const startGifUrl = sanitizeSafeUrl(user.startGifUrl);
  const location = sanitizeLocation(user.location);
  const faceId = sanitizeFaceId(user.faceId);

  const ageNum = Number(user.age);
  const safeAge = Number.isFinite(ageNum) && ageNum >= 18 && ageNum <= 99 ? Math.round(ageNum) : 22;
  const birthDate = clampText(user.birthDate, 20) || '2002-05-15';
  const name = clampText(user.name, FIRESTORE_LIMITS.NAME_MAX) || 'Foydalanuvchi';
  const id = clampText(user.id, FIRESTORE_LIMITS.ID_MAX) || `ALOV-${uid.slice(0, 5).toUpperCase()}`;

  const isAdminAccount = !isInitialCreate && Boolean(user.role === 'admin' || user.isAdmin || isAdminTelegramUser(user));

  const userDoc: FirestoreUserCoreDoc = {
    uid,
    id,
    name,
    username: clampText(user.username, FIRESTORE_LIMITS.USERNAME_MAX),
    age: safeAge,
    birthDate,
    gender: rawGender,
    region: clampText(user.region, FIRESTORE_LIMITS.REGION_MAX) || 'Toshkent shahri',
    district: clampText(user.district, FIRESTORE_LIMITS.REGION_MAX) || 'Yunusobod tumani',
    neighborhood: clampText(user.neighborhood, FIRESTORE_LIMITS.REGION_MAX),
    telegram: clampText(user.telegram, FIRESTORE_LIMITS.URL_MAX),
    instagram: clampText(user.instagram, FIRESTORE_LIMITS.USERNAME_MAX),
    bio: clampText(user.bio, FIRESTORE_LIMITS.BIO_MAX),
    avatar,
    banner,
    videoUrl,
    startGifUrl,
    hasCustomAvatar: Boolean(user.hasCustomAvatar),
    hasEditedProfile: Boolean(user.hasEditedProfile),
    isProfileCompleted: Boolean(user.isProfileCompleted),
    isVerified: Boolean(user.isVerified || faceId?.verified),
    role: isAdminAccount ? 'admin' : 'user',
    isAdmin: isAdminAccount,
    locationVisibility: rawVis,
    isLocationEnabled,
    ...(location ? { location } : {}),
    isOnline: Boolean(user.isOnline),
    status: user.isOnline ? 'online' : 'offline',
    followersCount: clampNonNegativeInt(
      Array.isArray(user.followers) ? user.followers.length : user.followersCount,
      10_000_000,
      0
    ),
    followingCount: clampNonNegativeInt(
      Array.isArray(user.following) ? user.following.length : user.followingCount,
      10_000_000,
      0
    ),
    likesCount: clampNonNegativeInt(user.likesCount, 100_000_000, 0),
    ...(faceId ? { faceId } : {}),
  };

  const publicProfileDoc: FirestorePublicProfileDoc = {
    uid,
    id,
    name,
    username: userDoc.username,
    age: safeAge,
    gender: rawGender,
    region: userDoc.region,
    district: userDoc.district,
    bio: userDoc.bio,
    avatar,
    banner,
    videoUrl,
    startGifUrl,
    isVerified: userDoc.isVerified,
    isProfileCompleted: userDoc.isProfileCompleted,
    locationVisibility: rawVis,
    isLocationEnabled,
    ...(location ? { location } : {}),
    isOnline: userDoc.isOnline,
    status: userDoc.status,
    followersCount: userDoc.followersCount,
    followingCount: userDoc.followingCount,
    likesCount: userDoc.likesCount,
  };

  const privateInfoDoc: FirestorePrivateInfoDoc = {
    uid,
    email: clampText(user.email, FIRESTORE_LIMITS.EMAIL_MAX),
    phone: clampText(user.phone, FIRESTORE_LIMITS.PHONE_MAX),
    bankCard: clampText(user.bankCard, FIRESTORE_LIMITS.CARD_MAX),
    telegramChatId:
      typeof user.telegramChatId === 'number' && Number.isFinite(user.telegramChatId)
        ? Math.trunc(user.telegramChatId)
        : null,
  };

  const walletDoc: FirestoreWalletDoc = isInitialCreate
    ? {
        uid,
        coins: 100,
        diamonds: 0,
        diamondProgress: 0,
        pendingDiamondBatches: [],
        totalEarnedDiamonds: 0,
        totalWithdrawnUzs: 0,
      }
    : {
        uid,
        coins: clampNonNegativeInt(user.coins, FIRESTORE_LIMITS.MAX_COINS, 100),
        diamonds: clampNonNegativeNumber(user.diamonds, FIRESTORE_LIMITS.MAX_DIAMONDS, 0),
        diamondProgress: clampNonNegativeNumber(user.diamondProgress, 1000, 0),
        pendingDiamondBatches: sanitizePendingBatches(user.pendingDiamondBatches),
        totalEarnedDiamonds: clampNonNegativeNumber(user.totalEarnedDiamonds, FIRESTORE_LIMITS.MAX_DIAMONDS, 0),
        totalWithdrawnUzs: clampNonNegativeInt(user.totalWithdrawnUzs, 10_000_000_000, 0),
      };

  const settingsDoc: FirestoreUserSettingsDoc = {
    uid,
    locationVisibility: rawVis,
    isLocationEnabled,
    startGifUrl,
    language: clampText(user.language, 10) || 'uz',
    notificationsEnabled: user.notificationsEnabled !== false,
  };

  return {
    uid,
    userDoc,
    publicProfileDoc,
    privateInfoDoc,
    walletDoc,
    settingsDoc,
  };
}

function isSameNormalizedValue(existingVal: unknown, nextVal: unknown): boolean {
  if (existingVal === nextVal) return true;
  if (typeof existingVal === 'object' && existingVal !== null && typeof nextVal === 'object' && nextVal !== null) {
    try {
      return JSON.stringify(existingVal) === JSON.stringify(nextVal);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Builds ONLY the changed fields when updating an existing Firestore user profile.
 * Never overwrites createdAt, role, isAdmin, coins, diamonds, or untouched fields with defaults.
 */
export function buildFirestoreProfilePatch(
  existingUser: Record<string, any> | null | undefined,
  changes: Record<string, any>,
  options: { isAdminActor?: boolean } = {}
): {
  userPatch: Record<string, any>;
  publicPatch: Record<string, any>;
  privatePatch: Record<string, any>;
  settingsPatch: Record<string, any>;
} {
  const userPatch: Record<string, any> = {};
  const publicPatch: Record<string, any> = {};
  const privatePatch: Record<string, any> = {};
  const settingsPatch: Record<string, any> = {};

  if (!changes || typeof changes !== 'object') {
    return { userPatch, publicPatch, privatePatch, settingsPatch };
  }

  const existing = existingUser && typeof existingUser === 'object' ? existingUser : {};
  const isLocked = Boolean(existing?.isProfileCompleted === true) && !options.isAdminActor;

  const setIfChanged = (key: string, nextVal: unknown, targets: Array<Record<string, any>>) => {
    const existingDefined = existing[key] !== undefined;
    if (existingDefined && isSameNormalizedValue(existing[key], nextVal)) {
      return;
    }
    for (const target of targets) {
      target[key] = nextVal;
    }
  };

  const setTextIfProvided = (
    key: string,
    maxLen: number,
    targets: Array<Record<string, any>>
  ) => {
    if (changes[key] === undefined) return;
    const nextVal = changes[key] === null ? '' : clampText(String(changes[key]), maxLen);
    setIfChanged(key, nextVal, targets);
  };

  const setUrlIfProvided = (key: string, targets: Array<Record<string, any>>) => {
    if (changes[key] === undefined) return;
    const raw = changes[key] === null ? '' : String(changes[key]);
    if (raw.startsWith('data:')) return;
    const nextVal = sanitizeSafeUrl(raw);
    setIfChanged(key, nextVal, targets);
  };

  setTextIfProvided('name', FIRESTORE_LIMITS.NAME_MAX, [userPatch, publicPatch]);
  setTextIfProvided('username', FIRESTORE_LIMITS.USERNAME_MAX, [userPatch, publicPatch]);
  setTextIfProvided('region', FIRESTORE_LIMITS.REGION_MAX, [userPatch, publicPatch]);
  setTextIfProvided('district', FIRESTORE_LIMITS.REGION_MAX, [userPatch, publicPatch]);
  setTextIfProvided('neighborhood', FIRESTORE_LIMITS.REGION_MAX, [userPatch]);
  setTextIfProvided('telegram', FIRESTORE_LIMITS.URL_MAX, [userPatch]);
  setTextIfProvided('instagram', FIRESTORE_LIMITS.USERNAME_MAX, [userPatch]);
  setTextIfProvided('bio', FIRESTORE_LIMITS.BIO_MAX, [userPatch, publicPatch]);

  setUrlIfProvided('avatar', [userPatch, publicPatch]);
  setUrlIfProvided('banner', [userPatch, publicPatch]);
  setUrlIfProvided('videoUrl', [userPatch, publicPatch]);
  setUrlIfProvided('startGifUrl', [userPatch, publicPatch, settingsPatch]);

  if (changes.hasCustomAvatar !== undefined) {
    setIfChanged('hasCustomAvatar', Boolean(changes.hasCustomAvatar), [userPatch]);
  }
  if (changes.hasEditedProfile !== undefined) {
    setIfChanged('hasEditedProfile', Boolean(changes.hasEditedProfile), [userPatch]);
  }
  if (changes.isProfileCompleted !== undefined) {
    const val = Boolean(changes.isProfileCompleted);
    // Avoid sending redundant isProfileCompleted: true when already completed
    if (!(existing.isProfileCompleted === true && val === true)) {
      setIfChanged('isProfileCompleted', val, [userPatch, publicPatch]);
    }
  }

  if (!isLocked) {
    if (changes.gender === 'male' || changes.gender === 'female') {
      setIfChanged('gender', changes.gender, [userPatch, publicPatch]);
    }
    if (typeof changes.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(changes.birthDate.trim())) {
      setIfChanged('birthDate', changes.birthDate.trim(), [userPatch]);
    }
    if (changes.age !== undefined && Number.isFinite(Number(changes.age))) {
      const clamped = Math.max(18, Math.min(99, Math.round(Number(changes.age))));
      setIfChanged('age', clamped, [userPatch, publicPatch]);
    }
  }

  if (
    changes.locationVisibility === 'everyone' ||
    changes.locationVisibility === 'mutual' ||
    changes.locationVisibility === 'ghost'
  ) {
    setIfChanged('locationVisibility', changes.locationVisibility, [userPatch, publicPatch, settingsPatch]);
  }
  if (changes.isLocationEnabled !== undefined) {
    setIfChanged('isLocationEnabled', Boolean(changes.isLocationEnabled), [userPatch, publicPatch, settingsPatch]);
  }
  if (changes.location !== undefined) {
    const loc = sanitizeLocation(changes.location);
    if (loc) {
      setIfChanged('location', loc, [userPatch, publicPatch]);
    }
  }

  if (typeof changes.isVerified === 'boolean' && (options.isAdminActor || changes.isVerified === true)) {
    setIfChanged('isVerified', changes.isVerified, [userPatch, publicPatch]);
  }

  if (typeof changes.isOnline === 'boolean') {
    const nextOnline = changes.isOnline;
    const nextStatus = nextOnline ? 'online' : 'offline';
    if (existing.isOnline !== nextOnline) {
      userPatch.isOnline = nextOnline;
      publicPatch.isOnline = nextOnline;
    }
    if (existing.status !== nextStatus) {
      userPatch.status = nextStatus;
      publicPatch.status = nextStatus;
    }
  }

  if (changes.faceId && typeof changes.faceId === 'object') {
    const sanitizedFace = sanitizeFaceId(changes.faceId);
    if (sanitizedFace) {
      setIfChanged('faceId', sanitizedFace, [userPatch]);
      if (sanitizedFace.verified && existing.isVerified !== true) {
        userPatch.isVerified = true;
        publicPatch.isVerified = true;
      }
    }
  }

  if (changes.email !== undefined) {
    setIfChanged('email', clampText(changes.email, FIRESTORE_LIMITS.EMAIL_MAX), [privatePatch]);
  }
  if (changes.phone !== undefined) {
    setIfChanged('phone', clampText(changes.phone, FIRESTORE_LIMITS.PHONE_MAX), [privatePatch]);
  }
  if (changes.bankCard !== undefined) {
    setIfChanged('bankCard', clampText(changes.bankCard, FIRESTORE_LIMITS.CARD_MAX), [privatePatch]);
  }
  if (typeof changes.telegramChatId === 'number' && Number.isFinite(changes.telegramChatId)) {
    setIfChanged('telegramChatId', Math.trunc(changes.telegramChatId), [privatePatch]);
  }

  return { userPatch, publicPatch, privatePatch, settingsPatch };
}

function toEpochMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : 0;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof ts === 'object' && ts !== null) {
    if (typeof (ts as any).toMillis === 'function') {
      return Number((ts as any).toMillis()) || 0;
    }
    if (typeof (ts as any).seconds === 'number') {
      return (ts as any).seconds * 1000;
    }
  }
  return 0;
}

/**
 * Reconciles Firestore, Backend, and Cached user records so authoritative external DB data
 * always wins over stale localStorage and never resets balances, edited profile fields, or settings to defaults.
 */
export function mergeDbAuthoritativeProfile(params: {
  firestoreUser?: Record<string, any> | null;
  backendUser?: Record<string, any> | null;
  cachedUser?: Record<string, any> | null;
}): Record<string, any> | null {
  const { firestoreUser, backendUser, cachedUser } = params;
  const fsValid = firestoreUser && typeof firestoreUser === 'object' && firestoreUser.uid ? firestoreUser : null;
  const beValid = backendUser && typeof backendUser === 'object' && backendUser.uid ? backendUser : null;
  const cacheValid = cachedUser && typeof cachedUser === 'object' && cachedUser.uid ? cachedUser : null;

  if (!fsValid && !beValid) {
    return null;
  }

  if (fsValid && !beValid) {
    return {
      ...(cacheValid?.authToken ? { authToken: cacheValid.authToken } : {}),
      ...fsValid,
    };
  }

  if (beValid && !fsValid) {
    return {
      ...(cacheValid?.authToken ? { authToken: cacheValid.authToken } : {}),
      ...beValid,
    };
  }

  // Both Firestore and Backend records exist: compare freshness without losing custom edits or wallet balances
  const fsUpdated = Math.max(toEpochMs(fsValid!.profileUpdatedAt), toEpochMs(fsValid!.updatedAt));
  const beUpdated = Math.max(toEpochMs(beValid!.profileUpdatedAt), toEpochMs(beValid!.updatedAt));

  const primary = fsUpdated > beUpdated ? fsValid! : beValid!;
  const secondary = primary === fsValid ? beValid! : fsValid!;

  const merged: Record<string, any> = {
    ...secondary,
    ...primary,
  };

  // Preserve explicitly edited profile flags & bio/media if secondary had them and primary was sparse
  if (secondary.hasEditedProfile && !primary.hasEditedProfile) {
    merged.hasEditedProfile = true;
    if (secondary.name) merged.name = secondary.name;
    if (secondary.username !== undefined) merged.username = secondary.username;
    if (secondary.avatar) merged.avatar = secondary.avatar;
    if (secondary.banner) merged.banner = secondary.banner;
    if (secondary.videoUrl) merged.videoUrl = secondary.videoUrl;
    if (secondary.bio) merged.bio = secondary.bio;
    if (secondary.startGifUrl) merged.startGifUrl = secondary.startGifUrl;
  }

  // Never downgrade completed status or Face ID verification
  if (secondary.isProfileCompleted && !primary.isProfileCompleted) {
    merged.isProfileCompleted = true;
  }
  if (secondary.faceId?.verified && !primary.faceId?.verified) {
    merged.faceId = secondary.faceId;
    merged.isVerified = true;
  }

  // Preserve coins/diamonds from whichever DB record reflects authoritative state (avoid reverting to 100/0)
  if (typeof primary.coins === 'number') {
    merged.coins = primary.coins;
  } else if (typeof secondary.coins === 'number') {
    merged.coins = secondary.coins;
  }
  if (typeof primary.diamonds === 'number') {
    merged.diamonds = primary.diamonds;
  } else if (typeof secondary.diamonds === 'number') {
    merged.diamonds = secondary.diamonds;
  }

  // Preserve createdAt
  merged.createdAt = fsValid!.createdAt || beValid!.createdAt || merged.createdAt;

  if (!merged.authToken && (beValid!.authToken || cacheValid?.authToken)) {
    merged.authToken = beValid!.authToken || cacheValid?.authToken;
  }

  return merged;
}

export function shouldPreserveLocalSessionOnSyncResult(params: {
  cachedUser?: Record<string, any> | null;
  firestoreUser?: Record<string, any> | null;
  backendResponse?: { success?: boolean; exists?: boolean; deleted?: boolean; user?: any } | null;
  networkFailed?: boolean;
}): { preserve: boolean; reason: 'firestore_authoritative' | 'backend_authoritative' | 'network_resilient' | 'deleted_or_banned' | 'incomplete_or_missing' } {
  const { cachedUser, firestoreUser, backendResponse, networkFailed } = params;

  if (backendResponse?.deleted === true || backendResponse?.user?.isBanned === true) {
    return { preserve: false, reason: 'deleted_or_banned' };
  }

  if (firestoreUser && canPersistUserProfile(firestoreUser)) {
    return { preserve: true, reason: 'firestore_authoritative' };
  }

  if (backendResponse?.success && backendResponse?.exists && backendResponse?.user && canPersistUserProfile(backendResponse.user)) {
    return { preserve: true, reason: 'backend_authoritative' };
  }

  if (networkFailed && cachedUser && canPersistUserProfile(cachedUser)) {
    return { preserve: true, reason: 'network_resilient' };
  }

  return { preserve: false, reason: 'incomplete_or_missing' };
}
