export interface TelegramWebAppUser {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export interface TelegramWebAppLike {
  initData?: string;
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
    start_param?: string;
  };
  platform?: string;
  colorScheme?: 'light' | 'dark';
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  enableClosingConfirmation?: () => void;
}

export type AppRuntimeMode = 'telegram' | 'web';

export interface DualModeRuntimeInfo {
  mode: AppRuntimeMode;
  isTelegramMiniApp: boolean;
  platform: string;
  telegramUser: {
    uid: string;
    telegramId: string;
    displayName: string;
    username: string;
    telegramUrl: string;
    avatarUrl: string;
  } | null;
}

export function extractTelegramWebAppProfile(tg: TelegramWebAppLike | null | undefined) {
  const user = tg?.initDataUnsafe?.user;
  if (!user || !user.id) return null;

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  const cleanUsername = (user.username || '').replace(/^@+/, '').trim();

  return {
    uid: `tg_${user.id}`,
    telegramId: String(user.id),
    displayName: fullName || (cleanUsername ? `@${cleanUsername}` : 'Foydalanuvchi'),
    username: cleanUsername,
    telegramUrl: cleanUsername ? `https://t.me/${cleanUsername}` : '',
    avatarUrl: user.photo_url || '',
  };
}

export function detectDualModePlatform(win?: {
  Telegram?: { WebApp?: TelegramWebAppLike };
  navigator?: { userAgent?: string };
} | null): DualModeRuntimeInfo {
  const tg = win?.Telegram?.WebApp;
  const telegramUser = extractTelegramWebAppProfile(tg);
  const hasInitData = Boolean(tg && (tg.initData || telegramUser || (tg.platform && tg.platform !== 'unknown')));

  return {
    mode: hasInitData ? 'telegram' : 'web',
    isTelegramMiniApp: hasInitData,
    platform: tg?.platform || (hasInitData ? 'telegram' : 'web'),
    telegramUser,
  };
}

export function applyTelegramWebAppTheme(
  tg: TelegramWebAppLike | null | undefined,
  isDark: boolean = true
): boolean {
  if (!tg) return false;
  try {
    tg.ready?.();
    tg.expand?.();
    const bgHex = isDark ? '#09090D' : '#FDFBF9';
    const bottomHex = isDark ? '#111218' : '#FFFFFF';
    tg.setHeaderColor?.(bgHex);
    tg.setBackgroundColor?.(bgHex);
    tg.setBottomBarColor?.(bottomHex);
    return true;
  } catch {
    return false;
  }
}
