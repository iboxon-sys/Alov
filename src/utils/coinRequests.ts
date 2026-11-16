export type CoinRequestStatus = 'pending' | 'approved' | 'rejected';

export interface CoinShopPackage {
  id: string;
  coins: number;
  uzs: number;
  label: string;
  bonusText?: string;
}

export const COIN_SHOP_PACKAGES: CoinShopPackage[] = [
  { id: 'pkg_1000', coins: 1000, uzs: 50000, label: 'Minimal', bonusText: '100 ta xabar' },
  { id: 'pkg_2500', coins: 2500, uzs: 115000, label: 'Ommabop', bonusText: '250 ta xabar · Chegirma' },
  { id: 'pkg_5000', coins: 5000, uzs: 215000, label: 'Tejamkor', bonusText: '500 ta xabar · -14%' },
  { id: 'pkg_10000', coins: 10000, uzs: 400000, label: 'VIP Maksimal', bonusText: '1000 ta xabar · -20%' },
];

export interface CoinPurchaseRequest {
  id: string;
  userUid: string;
  userName: string;
  userAvatar?: string;
  userUsername?: string;
  userTelegram?: string;
  userPhone?: string;
  contactInfo: string;
  coinAmount: number;
  uzsAmount: number;
  packageLabel: string;
  paymentMethod: string;
  note?: string;
  status: CoinRequestStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export function findCoinPackageByAmount(coins: number): CoinShopPackage {
  const found = COIN_SHOP_PACKAGES.find((p) => p.coins === Number(coins));
  if (found) return found;
  const safeCoins = Math.max(1000, Math.floor(Number(coins) || 1000));
  return {
    id: `custom_${safeCoins}`,
    coins: safeCoins,
    uzs: safeCoins * 50,
    label: 'Maxsus paket',
  };
}

export function buildCoinPurchaseRequest(params: {
  user: {
    uid: string;
    name?: string;
    avatar?: string;
    username?: string;
    telegram?: string;
    phone?: string;
    faceId?: { capturedPhotoUrl?: string | null } | null;
  };
  coinAmount: number;
  uzsAmount?: number;
  packageLabel?: string;
  paymentMethod?: string;
  contactInfo?: string;
  note?: string;
  nowIso?: string;
  id?: string;
}): CoinPurchaseRequest {
  const pkg = findCoinPackageByAmount(params.coinAmount);
  const safeUzs = Number(params.uzsAmount) > 0 ? Math.floor(Number(params.uzsAmount)) : pkg.uzs;
  const resolvedAvatar = String(params.user.faceId?.capturedPhotoUrl || params.user.avatar || '').trim();
  const resolvedContact = String(
    params.contactInfo || params.user.telegram || params.user.phone || params.user.username || ''
  ).trim().slice(0, 120);

  return {
    id: params.id || `coinreq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userUid: String(params.user.uid),
    userName: String(params.user.name || 'Foydalanuvchi').trim() || 'Foydalanuvchi',
    userAvatar: resolvedAvatar,
    userUsername: params.user.username ? String(params.user.username).trim() : '',
    userTelegram: params.user.telegram ? String(params.user.telegram).trim() : '',
    userPhone: params.user.phone ? String(params.user.phone).trim() : '',
    contactInfo: resolvedContact,
    coinAmount: pkg.coins,
    uzsAmount: safeUzs,
    packageLabel: String(params.packageLabel || pkg.label),
    paymentMethod: String(params.paymentMethod || 'click').trim(),
    note: String(params.note || '').trim().slice(0, 200),
    status: 'pending',
    createdAt: params.nowIso || new Date().toISOString(),
  };
}

export function countPendingRequests<T extends { status?: string }>(items: T[] | null | undefined): number {
  if (!Array.isArray(items)) return 0;
  return items.filter((item) => item?.status === 'pending').length;
}

export function sortRequestsNewestFirst<T extends { createdAt?: string }>(items: T[] | null | undefined): T[] {
  if (!Array.isArray(items)) return [];
  return [...items].sort((a, b) => {
    const tA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tB - tA;
  });
}

export function canReviewCoinRequest(req: CoinPurchaseRequest | null | undefined): boolean {
  return Boolean(req && req.status === 'pending' && req.coinAmount > 0 && req.userUid);
}
