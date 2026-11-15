import { normalizeTelegramHandle } from './telegramProfile';

export const MESSAGE_COIN_COST = 5;
export const MESSAGE_DIAMOND_REWARD = 5;
export const AUDIO_CALL_COIN_COST_PER_MIN = 10;
export const AUDIO_CALL_DIAMOND_PER_MIN = 10;
export const VIDEO_CALL_COIN_COST_PER_MIN = 20;
export const VIDEO_CALL_DIAMOND_PER_MIN = 20;

export const DIAMOND_LIMIT_TARGET = 100;
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
  balanceUzs: number;
  pendingUzs: number;
  totalEarnedDiamonds: number;
  totalWithdrawnUzs: number;
  exchangeRateUzs: number;
  unlockWindowHours: number;
  nextUnlockAt: number | null;
  updatedAt: string;
}

export function calculateDiamondsToUzs(diamonds: number): number {
  const safe = Math.max(0, Math.floor(Number(diamonds) || 0));
  return safe * DIAMOND_TO_UZS_RATE;
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

export function isAdminTelegramUser(user: {
  telegram?: string | null;
  username?: string | null;
  role?: string | null;
  isAdmin?: boolean | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.isAdmin === true) return true;
  const tgHandle = normalizeTelegramHandle(user.telegram || user.username || '');
  return (ADMIN_TELEGRAM_HANDLES as readonly string[]).includes(tgHandle);
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
  nowMs: number = Date.now()
): {
  diamondProgress: number;
  pendingDiamondBatches: PendingDiamondBatch[];
  newlyLockedCount: number;
} {
  const safeEarned = Math.max(0, Math.floor(Number(earnedDiamonds) || 0));
  let totalProgress = Math.max(0, Math.floor(Number(currentProgress) || 0)) + safeEarned;
  const nextBatches: PendingDiamondBatch[] = Array.isArray(existingBatches)
    ? existingBatches.map(b => ({ ...b }))
    : [];
  let newlyLockedCount = 0;

  while (totalProgress >= DIAMOND_LIMIT_TARGET) {
    totalProgress -= DIAMOND_LIMIT_TARGET;
    newlyLockedCount += 1;
    nextBatches.push({
      id: `dbatch_${nowMs}_${Math.random().toString(36).slice(2, 7)}`,
      amount: DIAMOND_LIMIT_TARGET,
      createdAt: nowMs,
      unlockAt: nowMs + DIAMOND_UNLOCK_DURATION_MS,
    });
  }

  return {
    diamondProgress: totalProgress,
    pendingDiamondBatches: nextBatches,
    newlyLockedCount,
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
  const safeWallet = Math.max(0, Math.floor(Number(currentWalletDiamonds) || 0));
  const batches = Array.isArray(existingBatches) ? existingBatches : [];
  let releasedAmount = 0;
  const stillPending: PendingDiamondBatch[] = [];

  for (const batch of batches) {
    if (!batch || typeof batch.amount !== 'number') continue;
    if (batch.unlockAt <= nowMs) {
      releasedAmount += Math.max(0, Math.floor(batch.amount));
    } else {
      stillPending.push(batch);
    }
  }

  return {
    diamonds: safeWallet + releasedAmount,
    pendingDiamondBatches: stillPending,
    releasedAmount,
  };
}

export function getDiamondProgressPercent(progress: number): number {
  const clamped = Math.max(0, Math.min(DIAMOND_LIMIT_TARGET, Math.floor(Number(progress) || 0)));
  return Math.round((clamped / DIAMOND_LIMIT_TARGET) * 100);
}

export function getPendingDiamondsTotal(batches: PendingDiamondBatch[] | undefined | null): number {
  if (!Array.isArray(batches)) return 0;
  return batches.reduce((sum, b) => sum + Math.max(0, Number(b?.amount) || 0), 0);
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
    pendingDiamondBatches?: PendingDiamondBatch[];
    totalEarnedDiamonds?: number;
    totalWithdrawnUzs?: number;
  },
  nowMs: number = Date.now()
): UserWalletSnapshot {
  const balanceDiamonds = Math.max(0, Math.floor(Number(user?.diamonds) || 0));
  const diamondProgress = Math.max(0, Math.floor(Number(user?.diamondProgress) || 0));
  const pendingDiamonds = getPendingDiamondsTotal(user?.pendingDiamondBatches);
  const nextUnlockAt = getNextUnlockTimestamp(user?.pendingDiamondBatches);
  const totalEarnedDiamonds = Math.max(
    balanceDiamonds + pendingDiamonds + diamondProgress,
    Math.floor(Number(user?.totalEarnedDiamonds) || 0)
  );

  return {
    uid: String(user?.uid || user?.id || ''),
    balanceDiamonds,
    pendingDiamonds,
    diamondProgress,
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
