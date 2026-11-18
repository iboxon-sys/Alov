import { normalizeTelegramHandle } from './telegramProfile';

export const MESSAGE_COIN_COST = 10;
export const VOICE_MESSAGE_COIN_COST = 5;
export const MEDIA_FILE_COIN_COST = 20;
export const MESSAGE_DIAMOND_REWARD = 2.5;

export function getMessageCoinCost(messageType?: string | null): number {
  const normalized = String(messageType || 'text').trim().toLowerCase();
  if (normalized === 'voice') return VOICE_MESSAGE_COIN_COST;
  if (normalized === 'audio' || normalized === 'video') return MEDIA_FILE_COIN_COST;
  return MESSAGE_COIN_COST;
}
export const AUDIO_CALL_COIN_COST_PER_MIN = 10;
export const AUDIO_CALL_DIAMOND_PER_MIN = 2.5;
export const VIDEO_CALL_COIN_COST_PER_MIN = 20;
export const VIDEO_CALL_DIAMOND_PER_MIN = 5;
export const COIN_TO_DIAMOND_RATIO = 0.25; // Har 10 moneta uchun 2.5 olmos

export const DIAMOND_LIMIT_TARGET = 120; // 24 soat ichida yig'ish limiti
export const DAILY_LIMIT_WINDOW_HOURS = 24;
export const DAILY_LIMIT_WINDOW_MS = DAILY_LIMIT_WINDOW_HOURS * 60 * 60 * 1000;
export const DIAMOND_TO_UZS_RATE = 100; // 100 olmos = 10,000 UZS (1 olmos = 100 UZS)
export const DIAMOND_UNLOCK_HOURS = 12;
export const DIAMOND_UNLOCK_DURATION_MS = DIAMOND_UNLOCK_HOURS * 60 * 60 * 1000;

export const ADMIN_TELEGRAM_HANDLES = ['salikh_07'] as const;
export const ADMIN_FULL_COINS = 999999;
export const ADMIN_FULL_DIAMONDS = 999999;

export interface PendingDiamondBatch {
  id: string;
  amount: number;
  createdAt: number;
  unlockAt: number;
}

export interface UserWalletSnapshot {
  uid: string;
  balanceDiamonds: number;
  pendingDiamonds: number;
  diamondProgress: number;
  dailyLimitTarget: number;
  dailyLimitResetAt: number | null;
  balanceUzs: number;
  pendingUzs: number;
  totalEarnedDiamonds: number;
  totalWithdrawnUzs: number;
  exchangeRateUzs: number;
  unlockWindowHours: number;
  nextUnlockAt: number | null;
  updatedAt: string;
}

export function roundDiamonds(value: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100) / 100;
}

export function formatDiamondsDisplay(value: number | undefined | null): string {
  const rounded = roundDiamonds(Number(value) || 0);
  return Number.isInteger(rounded) ? rounded.toLocaleString() : rounded.toFixed(1).replace(/\.0$/, '');
}

export function coinsToDiamonds(coins: number): number {
  const safeCoins = Math.max(0, Number(coins) || 0);
  return roundDiamonds(safeCoins * COIN_TO_DIAMOND_RATIO);
}

export function calculateDiamondsToUzs(diamonds: number): number {
  const safe = roundDiamonds(Number(diamonds) || 0);
  return Math.round(safe * DIAMOND_TO_UZS_RATE);
}

export function calculateCallMinuteBilling(callType: 'audio' | 'video'): {
  callType: 'audio' | 'video';
  coinCost: number;
  diamondReward: number;
  uzsEquivalent: number;
} {
  const isVideo = callType === 'video';
  const coinCost = isVideo ? VIDEO_CALL_COIN_COST_PER_MIN : AUDIO_CALL_COIN_COST_PER_MIN;
  const diamondReward = isVideo ? VIDEO_CALL_DIAMOND_PER_MIN : AUDIO_CALL_DIAMOND_PER_MIN;
  return {
    callType: isVideo ? 'video' : 'audio',
    coinCost,
    diamondReward,
    uzsEquivalent: calculateDiamondsToUzs(diamondReward),
  };
}

export type AdminActionName =
  | 'set_balances'
  | 'unlock_pending_diamonds'
  | 'toggle_verify'
  | 'toggle_ban'
  | 'toggle_admin'
  | 'delete_user';

export function isPrimaryAdminUser(user: {
  uid?: string | null;
  id?: string | null;
  telegram?: string | null;
  username?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (String(user.id || '').trim() === 'ALOV-ADMIN' || String(user.uid || '').trim() === 'tg_salikh_07') {
    return true;
  }
  const tgHandle = normalizeTelegramHandle(user.telegram || user.username || '');
  return (ADMIN_TELEGRAM_HANDLES as readonly string[]).includes(tgHandle);
}

export function isAdminTelegramUser(user: {
  uid?: string | null;
  id?: string | null;
  telegram?: string | null;
  username?: string | null;
  role?: string | null;
  isAdmin?: boolean | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (isPrimaryAdminUser(user)) return true;
  return user.role === 'admin' || user.isAdmin === true;
}

export function canManageAdminRoles(user: {
  uid?: string | null;
  id?: string | null;
  telegram?: string | null;
  username?: string | null;
} | null | undefined): boolean {
  return isPrimaryAdminUser(user);
}

export function getAdminBadgeLabel(user: {
  uid?: string | null;
  id?: string | null;
  telegram?: string | null;
  username?: string | null;
  role?: string | null;
  isAdmin?: boolean | null;
} | null | undefined): 'Bosh Admin' | 'Admin' | null {
  if (!isAdminTelegramUser(user)) return null;
  return isPrimaryAdminUser(user) ? 'Bosh Admin' : 'Admin';
}

export function canActorExecuteAdminAction(
  actorUser: {
    uid?: string | null;
    id?: string | null;
    telegram?: string | null;
    username?: string | null;
    role?: string | null;
    isAdmin?: boolean | null;
  } | null | undefined,
  targetUser: {
    uid?: string | null;
    id?: string | null;
    telegram?: string | null;
    username?: string | null;
    role?: string | null;
    isAdmin?: boolean | null;
  } | null | undefined,
  action: AdminActionName | string
): { allowed: boolean; reason?: string } {
  if (!isAdminTelegramUser(actorUser)) {
    return { allowed: false, reason: 'Admin huquqi talab qilinadi' };
  }
  if (!targetUser) {
    return { allowed: false, reason: 'Foydalanuvchi topilmadi' };
  }

  if (action === 'toggle_admin') {
    if (!canManageAdminRoles(actorUser)) {
      return {
        allowed: false,
        reason: "Faqat Bosh Admin (@Salikh_07) boshqa foydalanuvchilarga adminlik bera oladi!",
      };
    }
    if (isPrimaryAdminUser(targetUser)) {
      return { allowed: false, reason: "Asosiy bosh admin maqomini olib bo'lmaydi" };
    }
    return { allowed: true };
  }

  if (action === 'toggle_ban' || action === 'delete_user') {
    if (isPrimaryAdminUser(targetUser)) {
      return { allowed: false, reason: "Bosh Adminni bloklash yoki o'chirish mumkin emas" };
    }
    if (action === 'delete_user' && actorUser?.uid && targetUser?.uid && actorUser.uid === targetUser.uid) {
      return { allowed: false, reason: "Admin o'zini o'chirib yubora olmaydi" };
    }
    if (isAdminTelegramUser(targetUser) && !isPrimaryAdminUser(actorUser)) {
      return {
        allowed: false,
        reason: "Tayinlangan admin boshqa adminni bloklashi yoki o'chirishi mumkin emas",
      };
    }
  }

  return { allowed: true };
}

export function canChargeForMessage(params: {
  senderGender?: string | null;
  isAIBot?: boolean;
  isFriendFreeChat?: boolean;
  isAdminSender?: boolean;
}): boolean {
  if (params.isAdminSender) return false;
  if (params.isAIBot) return false;
  if (params.isFriendFreeChat) return false;
  return params.senderGender === 'male';
}

export function applyDiamondProgress(
  currentProgress: number,
  existingBatches: PendingDiamondBatch[],
  earnedDiamonds: number,
  nowMs: number = Date.now(),
  dailyLimitResetAt?: number | null
): {
  diamondProgress: number;
  dailyLimitResetAt: number | null;
  pendingDiamondBatches: PendingDiamondBatch[];
  acceptedDiamonds: number;
  newlyLockedCount: number;
  limitReached: boolean;
} {
  const hasActiveWindow =
    typeof dailyLimitResetAt === 'number' &&
    Number.isFinite(dailyLimitResetAt) &&
    dailyLimitResetAt > nowMs;

  const activeProgress = hasActiveWindow ? roundDiamonds(Number(currentProgress) || 0) : 0;
  const remainingCap = roundDiamonds(Math.max(0, DIAMOND_LIMIT_TARGET - activeProgress));
  const requested = roundDiamonds(Number(earnedDiamonds) || 0);
  const acceptedDiamonds = roundDiamonds(Math.min(requested, remainingCap));
  const nextProgress = roundDiamonds(activeProgress + acceptedDiamonds);
  const nextResetAt =
    acceptedDiamonds > 0 || hasActiveWindow
      ? (hasActiveWindow ? (dailyLimitResetAt as number) : nowMs + DAILY_LIMIT_WINDOW_MS)
      : null;

  const nextBatches: PendingDiamondBatch[] = Array.isArray(existingBatches)
    ? existingBatches.map((b) => ({ ...b }))
    : [];

  let newlyLockedCount = 0;
  if (acceptedDiamonds > 0) {
    const targetUnlockAt = nowMs + DIAMOND_UNLOCK_DURATION_MS;
    const lastBatch = nextBatches[nextBatches.length - 1];
    // Merge earnings within 60s into the same batch while always queueing even partial (<120) earnings
    if (lastBatch && Math.abs(lastBatch.unlockAt - targetUnlockAt) <= 60_000) {
      lastBatch.amount = roundDiamonds(lastBatch.amount + acceptedDiamonds);
    } else {
      nextBatches.push({
        id: `dbatch_${nowMs}_${Math.random().toString(36).slice(2, 7)}`,
        amount: acceptedDiamonds,
        createdAt: nowMs,
        unlockAt: targetUnlockAt,
      });
    }
    newlyLockedCount = 1;
  }

  return {
    diamondProgress: nextProgress,
    dailyLimitResetAt: nextResetAt,
    pendingDiamondBatches: nextBatches,
    acceptedDiamonds,
    newlyLockedCount,
    limitReached: nextProgress >= DIAMOND_LIMIT_TARGET,
  };
}

export function releaseMatureDiamondBatches(
  currentWalletDiamonds: number,
  existingBatches: PendingDiamondBatch[],
  nowMs: number = Date.now()
): {
  diamonds: number;
  pendingDiamondBatches: PendingDiamondBatch[];
  releasedAmount: number;
} {
  const safeWallet = roundDiamonds(Number(currentWalletDiamonds) || 0);
  const batches = Array.isArray(existingBatches) ? existingBatches : [];
  let releasedAmount = 0;
  const stillPending: PendingDiamondBatch[] = [];

  for (const batch of batches) {
    if (!batch || typeof batch.amount !== 'number') continue;
    if (batch.unlockAt <= nowMs) {
      releasedAmount = roundDiamonds(releasedAmount + roundDiamonds(batch.amount));
    } else {
      stillPending.push(batch);
    }
  }

  return {
    diamonds: roundDiamonds(safeWallet + releasedAmount),
    pendingDiamondBatches: stillPending,
    releasedAmount,
  };
}

export function getDiamondProgressPercent(progress: number): number {
  const clamped = Math.max(0, Math.min(DIAMOND_LIMIT_TARGET, roundDiamonds(Number(progress) || 0)));
  return Math.round((clamped / DIAMOND_LIMIT_TARGET) * 100);
}

export function getPendingDiamondsTotal(batches: PendingDiamondBatch[] | undefined | null): number {
  if (!Array.isArray(batches)) return 0;
  return roundDiamonds(batches.reduce((sum, b) => sum + roundDiamonds(Number(b?.amount) || 0), 0));
}

export function getNextUnlockTimestamp(batches: PendingDiamondBatch[] | undefined | null): number | null {
  if (!Array.isArray(batches) || batches.length === 0) return null;
  let earliest = Infinity;
  for (const b of batches) {
    if (typeof b?.unlockAt === 'number' && b.unlockAt < earliest) {
      earliest = b.unlockAt;
    }
  }
  return Number.isFinite(earliest) ? earliest : null;
}

export function buildUserWalletSnapshot(
  user: {
    uid?: string;
    id?: string;
    diamonds?: number;
    diamondProgress?: number;
    dailyLimitResetAt?: number | null;
    pendingDiamondBatches?: PendingDiamondBatch[];
    totalEarnedDiamonds?: number;
    totalWithdrawnUzs?: number;
  },
  nowMs: number = Date.now()
): UserWalletSnapshot {
  const balanceDiamonds = roundDiamonds(Number(user?.diamonds) || 0);
  const hasActiveWindow =
    typeof user?.dailyLimitResetAt === 'number' &&
    Number.isFinite(user.dailyLimitResetAt) &&
    user.dailyLimitResetAt > nowMs;
  const diamondProgress = hasActiveWindow || !user?.dailyLimitResetAt
    ? roundDiamonds(Number(user?.diamondProgress) || 0)
    : 0;
  const pendingDiamonds = getPendingDiamondsTotal(user?.pendingDiamondBatches);
  const nextUnlockAt = getNextUnlockTimestamp(user?.pendingDiamondBatches);
  const totalEarnedDiamonds = Math.max(
    roundDiamonds(balanceDiamonds + pendingDiamonds),
    roundDiamonds(Number(user?.totalEarnedDiamonds) || 0)
  );

  return {
    uid: String(user?.uid || user?.id || ''),
    balanceDiamonds,
    pendingDiamonds,
    diamondProgress,
    dailyLimitTarget: DIAMOND_LIMIT_TARGET,
    dailyLimitResetAt: hasActiveWindow ? (user?.dailyLimitResetAt ?? null) : null,
    balanceUzs: calculateDiamondsToUzs(balanceDiamonds),
    pendingUzs: calculateDiamondsToUzs(pendingDiamonds),
    totalEarnedDiamonds,
    totalWithdrawnUzs: Math.max(0, Math.floor(Number(user?.totalWithdrawnUzs) || 0)),
    exchangeRateUzs: DIAMOND_TO_UZS_RATE,
    unlockWindowHours: DIAMOND_UNLOCK_HOURS,
    nextUnlockAt,
    updatedAt: new Date(nowMs).toISOString(),
  };
}

export function computeCountdownParts(
  unlockAtMs: number | null | undefined,
  nowMs: number = Date.now()
): {
  remainingMs: number;
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
} {
  if (!unlockAtMs || !Number.isFinite(unlockAtMs)) {
    return { remainingMs: 0, hours: 0, minutes: 0, seconds: 0, formatted: '00:00:00' };
  }
  const remainingMs = Math.max(0, unlockAtMs - nowMs);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    remainingMs,
    hours,
    minutes,
    seconds,
    formatted: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
  };
}
