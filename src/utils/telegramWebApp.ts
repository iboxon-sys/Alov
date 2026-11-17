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
  version?: string;
  isVersionAtLeast?: (version: string) => boolean;
  colorScheme?: 'light' | 'dark';
  isExpanded?: boolean;
  isFullscreen?: boolean;
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
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

export function enterTelegramMiniAppFullscreen(
  tg: TelegramWebAppLike | null | undefined
): { expanded: boolean; fullscreenRequested: boolean } {
  if (!tg) return { expanded: false, fullscreenRequested: false };
  let expanded = false;
  let fullscreenRequested = false;
  const canSwipeLock =
    typeof tg.isVersionAtLeast === 'function' ? tg.isVersionAtLeast('7.7') : true;
  const canFullscreen =
    typeof tg.isVersionAtLeast === 'function' ? tg.isVersionAtLeast('8.0') : true;
  try {
    tg.ready?.();
    if (typeof tg.expand === 'function') {
      tg.expand();
      expanded = true;
    }
    if (canSwipeLock && typeof tg.disableVerticalSwipes === 'function') {
      tg.disableVerticalSwipes();
    }
    if (canFullscreen && typeof tg.requestFullscreen === 'function' && !tg.isFullscreen) {
      tg.requestFullscreen();
      fullscreenRequested = true;
    }
  } catch {
    // Older Telegram clients may throw on requestFullscreen/disableVerticalSwipes
  }
  return { expanded, fullscreenRequested };
}

export function applyTelegramWebAppTheme(
  tg: TelegramWebAppLike | null | undefined,
  isDark: boolean = true
): boolean {
  if (!tg) return false;
  const canSwipeLock =
    typeof tg.isVersionAtLeast === 'function' ? tg.isVersionAtLeast('7.7') : true;
  const canFullscreen =
    typeof tg.isVersionAtLeast === 'function' ? tg.isVersionAtLeast('8.0') : true;
  try {
    tg.ready?.();
    tg.expand?.();
    if (canSwipeLock && typeof tg.disableVerticalSwipes === 'function') {
      tg.disableVerticalSwipes();
    }
    if (canFullscreen && typeof tg.requestFullscreen === 'function' && !tg.isFullscreen) {
      tg.requestFullscreen();
    }
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
