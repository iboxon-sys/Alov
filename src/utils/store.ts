import { COIN_SHOP_PACKAGES, type CoinShopPackage } from './coinRequests';
import { formatDiamondsDisplay, isAdminTelegramUser } from './tokenomics';

export const MIN_DIAMOND_CASHOUT_AMOUNT = 120;
export const MIN_DIAMOND_CASHOUT_UZS = 25000; // 120 olmos = 25,000 so'm
export const MIN_COIN_PURCHASE_AMOUNT = 1000;
export const MIN_COIN_PURCHASE_UZS = 50000; // 1,000 moneta = 50,000 so'm

export interface DiamondCashoutPackage {
  id: string;
  diamonds: number;
  uzs: number;
  label: string;
  badgeText?: string;
}

export const DIAMOND_CASHOUT_PACKAGES: DiamondCashoutPackage[] = [
  { id: 'dia_120', diamonds: 120, uzs: 25000, label: 'Minimal', badgeText: 'Eng kam yechish · 120 olmos' },
  { id: 'dia_250', diamonds: 250, uzs: 55000, label: 'Ommabop', badgeText: 'Tezkor Humo/Uzcard · +5% bonus' },
  { id: 'dia_500', diamonds: 500, uzs: 115000, label: 'Foydali', badgeText: 'Ustuvor to\'lov · +10% bonus' },
  { id: 'dia_1000', diamonds: 1000, uzs: 240000, label: 'VIP', badgeText: 'Katta chiqarish · +15% bonus' },
  { id: 'dia_2500', diamonds: 2500, uzs: 625000, label: 'Premium', badgeText: 'Maksimal kurs · +20% bonus' },
];

export const STORE_COIN_PACKAGES: CoinShopPackage[] = [
  ...COIN_SHOP_PACKAGES,
  {
    id: 'pkg_25000',
    coins: 25000,
    uzs: 950000,
    label: 'Premium Katta',
    bonusText: '2500 ta xabar · -24% chegirma',
  },
];

export const UZBEK_STORE_PAYMENT_METHODS = [
  { id: 'click', name: 'Click', subtitle: 'Tezkor ilova orqali' },
  { id: 'payme', name: 'Payme', subtitle: 'Humo / Uzcard karta' },
  { id: 'uzum', name: 'Uzum Bank', subtitle: 'Onlayn o\'tkazma' },
  { id: 'card', name: 'Humo / Uzcard', subtitle: 'To\'g\'ridan-to\'g\'ri karta' },
  { id: 'telegram_stars', name: 'Telegram Stars', subtitle: 'Bot ichida to\'lov' },
] as const;

/**
 * Calculates UZS payout for diamonds in Store / Cashout flows:
 * Anchor rate: 120 olmos = 25,000 so'm (matches all predefined tiers when selected,
 * otherwise scales proportionally from the 120 -> 25,000 anchor rounded to nearest 100 so'm).
 */
export function calculateDiamondCashoutUzs(diamonds: number): number {
  const safe = Number(diamonds);
  if (!Number.isFinite(safe) || safe <= 0) return 0;
  const exactTier = DIAMOND_CASHOUT_PACKAGES.find((tier) => tier.diamonds === safe);
  if (exactTier) return exactTier.uzs;
  const raw = (safe / MIN_DIAMOND_CASHOUT_AMOUNT) * MIN_DIAMOND_CASHOUT_UZS;
  return Math.round(raw / 100) * 100;
}

export function findCoinStorePackage(coins: number): CoinShopPackage {
  const exact = STORE_COIN_PACKAGES.find((p) => p.coins === Number(coins));
  if (exact) return exact;
  const safe = Math.max(MIN_COIN_PURCHASE_AMOUNT, Math.floor(Number(coins) || MIN_COIN_PURCHASE_AMOUNT));
  return {
    id: `pkg_${safe}`,
    coins: safe,
    uzs: Math.round((safe / MIN_COIN_PURCHASE_AMOUNT) * MIN_COIN_PURCHASE_UZS),
    label: 'Maxsus paket',
  };
}

export type StoreFocusTab = 'coins' | 'diamonds';

export interface StoreBalanceSummary {
  defaultTab: StoreFocusTab;
  hasDiamonds: boolean;
  hasCoins: boolean;
  isAdmin: boolean;
  diamondsCount: number;
  diamondsDisplay: string;
  diamondsCashoutUzs: number;
  canWithdrawDiamonds: boolean;
  remainingDiamondsForMinCashout: number;
  coinsCount: number;
  coinsDisplay: string;
  minCoinPackage: CoinShopPackage;
  minDiamondPackage: DiamondCashoutPackage;
}

export function buildStoreBalanceSummary(user: {
  uid?: string | null;
  id?: string | null;
  telegram?: string | null;
  username?: string | null;
  role?: string | null;
  isAdmin?: boolean | null;
  gender?: string | null;
  diamonds?: number | null;
  coins?: number | null;
} | null | undefined): StoreBalanceSummary {
  const isAdmin = isAdminTelegramUser(user);
  const rawDiamonds = Math.max(0, Number(user?.diamonds ?? 0) || 0);
  const rawCoins = Math.max(0, Number(user?.coins ?? (user ? 0 : 0)) || 0);

  const isFemale = user?.gender === 'female';
  const defaultTab: StoreFocusTab = isFemale || (rawDiamonds > 0 && rawCoins <= 0) ? 'diamonds' : 'coins';

  const hasDiamonds = isAdmin || isFemale || rawDiamonds > 0;
  const hasCoins = isAdmin || !isFemale || rawCoins > 0;

  return {
    defaultTab,
    hasDiamonds,
    hasCoins,
    isAdmin,
    diamondsCount: rawDiamonds,
    diamondsDisplay: isAdmin ? 'Full' : formatDiamondsDisplay(rawDiamonds),
    diamondsCashoutUzs: calculateDiamondCashoutUzs(rawDiamonds),
    canWithdrawDiamonds: isAdmin || rawDiamonds >= MIN_DIAMOND_CASHOUT_AMOUNT,
    remainingDiamondsForMinCashout: Math.max(0, Math.round((MIN_DIAMOND_CASHOUT_AMOUNT - rawDiamonds) * 100) / 100),
    coinsCount: rawCoins,
    coinsDisplay: isAdmin ? 'Full' : rawCoins.toLocaleString(),
    minCoinPackage: STORE_COIN_PACKAGES[0],
    minDiamondPackage: DIAMOND_CASHOUT_PACKAGES[0],
  };
}

export function formatUzsPrice(uzs: number): string {
  const safe = Math.max(0, Math.round(Number(uzs) || 0));
  return `${safe.toLocaleString('uz-UZ').replace(/,/g, ' ')} so'm`;
}
