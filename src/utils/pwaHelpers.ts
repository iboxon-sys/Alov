export type SwFetchRoute = 'bypass' | 'navigation' | 'manifest' | 'static-asset';

export const SW_SHELL_CACHE = 'alov-shell-v1';
export const SW_STATIC_CACHE = 'alov-static-v1';
export const SW_ACTIVE_CACHES = new Set<string>([SW_SHELL_CACHE, SW_STATIC_CACHE]);

export function shouldSuppressPwaInstall(params: {
  isStandalone: boolean;
  isTelegramMiniApp: boolean;
}): boolean {
  return Boolean(params.isStandalone || params.isTelegramMiniApp);
}

export function isIOSUserAgent(userAgent?: string | null): boolean {
  if (!userAgent) return false;
  return /iphone|ipad|ipod/i.test(String(userAgent));
}

export function isStandaloneDisplayMode(params: {
  matchMediaStandalone?: boolean;
  navigatorStandalone?: boolean;
}): boolean {
  return Boolean(params.matchMediaStandalone || params.navigatorStandalone);
}

export function isTelegramMiniAppContext(win?: any): boolean {
  if (!win) return false;
  const tgUser = win?.Telegram?.WebApp?.initDataUnsafe?.user;
  const tgInitData = win?.Telegram?.WebApp?.initData;
  return Boolean(tgUser?.id || (typeof tgInitData === 'string' && tgInitData.length > 0));
}

export function classifySwFetchRequest(params: {
  url: string;
  origin: string;
  method?: string;
  mode?: string;
  destination?: string;
}): SwFetchRoute {
  const method = String(params.method || 'GET').toUpperCase();
  if (method !== 'GET') return 'bypass';

  let parsed: URL;
  try {
    parsed = new URL(params.url);
  } catch {
    return 'bypass';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'bypass';
  }

  // Only handle same-origin requests + Google Fonts stylesheets/fonts
  const isSameOrigin = parsed.origin === params.origin;
  const isGoogleFont =
    parsed.hostname === 'fonts.googleapis.com' || parsed.hostname === 'fonts.gstatic.com';
  if (!isSameOrigin && !isGoogleFont) {
    return 'bypass';
  }

  const pathname = parsed.pathname || '/';

  // Never cache API calls, realtime sockets, or Vite dev-server module transforms
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/socket.io/') ||
    pathname.startsWith('/@vite') ||
    pathname.startsWith('/@react-refresh') ||
    pathname.startsWith('/@fs/') ||
    pathname.startsWith('/src/') ||
    pathname.startsWith('/node_modules/') ||
    pathname === '/sw.js'
  ) {
    return 'bypass';
  }

  if (pathname === '/manifest.json') {
    return 'manifest';
  }

  if (params.mode === 'navigate' || params.destination === 'document') {
    return 'navigation';
  }

  if (
    isGoogleFont ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/face-models/') ||
    pathname === '/favicon.ico' ||
    pathname === '/trusted-types-bootstrap.js' ||
    /\.(?:png|jpe?g|webp|svg|ico|woff2?|css|js)$/i.test(pathname)
  ) {
    return 'static-asset';
  }

  return 'bypass';
}

export function getCachesToDeleteOnActivate(existingKeys: string[]): string[] {
  return existingKeys.filter((key) => !SW_ACTIVE_CACHES.has(key));
}
