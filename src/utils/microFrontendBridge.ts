export const MAIN_RENDER_ORIGIN = 'https://alov.onrender.com';
export const VERCEL_HEAVY_ORIGIN = 'https://alov-mu.vercel.app';

export const HEAVY_VERCEL_SECTIONS = ['efir', 'postlar', 'chatroulette', 'chat'] as const;
export type HeavyVercelSection = (typeof HEAVY_VERCEL_SECTIONS)[number];

export interface AuthBridgePayload {
  type: 'ALOV_AUTH_BRIDGE';
  token: string;
  userId: string;
  user?: Record<string, any> | null;
  backendOrigin: string;
  section?: HeavyVercelSection;
  partnerUid?: string;
  partner?: Record<string, any> | null;
  issuedAt: number;
}

const TRUSTED_RENDER_HOSTS = new Set([
  'alov.onrender.com',
  'alov-backend.onrender.com',
  'alov.uz',
  'www.alov.uz',
]);

const TRUSTED_VERCEL_HOSTS = new Set([
  'alov-mu.vercel.app',
]);

function parseOriginHostname(origin?: string | null): { valid: boolean; hostname: string; protocol: string; origin: string } {
  const raw = String(origin || '').trim();
  if (!raw || raw === 'null') {
    return { valid: false, hostname: '', protocol: '', origin: '' };
  }
  try {
    const u = new URL(raw);
    return {
      valid: u.protocol === 'https:' || u.protocol === 'http:',
      hostname: u.hostname.toLowerCase(),
      protocol: u.protocol,
      origin: u.origin,
    };
  } catch {
    return { valid: false, hostname: '', protocol: '', origin: '' };
  }
}

export function isRenderHost(hostname?: string | null): boolean {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return false;
  return TRUSTED_RENDER_HOSTS.has(h) || h.endsWith('.onrender.com');
}

export function isVercelHost(hostname?: string | null): boolean {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return false;
  return TRUSTED_VERCEL_HOSTS.has(h) || h.endsWith('.vercel.app');
}

export function isDevPreviewHost(hostname?: string | null): boolean {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return false;
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.endsWith('.run.app') ||
    h.endsWith('.usercontent.goog') ||
    h === 'aistudio.google.com'
  );
}

/**
 * Ensures real-time Socket.io, Chat REST API, and WebRTC signaling (Efir, Chat, Chatruletka)
 * ALWAYS resolve to the Render/fullstack backend origin and NEVER route signaling requests to Vercel.
 */
export function resolveRealtimeBackendUrl(candidateOrigin?: string | null): string {
  const parsed = parseOriginHostname(candidateOrigin);
  if (!parsed.valid || isVercelHost(parsed.hostname)) {
    return MAIN_RENDER_ORIGIN;
  }
  return parsed.origin.replace(/\/+$/, '');
}

/**
 * Validates HTTP/Socket.io CORS Origin headers on Render backend.
 * Allows Vercel micro-frontend (https://alov-mu.vercel.app), Render main site, alov.uz, Telegram Web, and local/preview hosts.
 */
export function isAllowedCorsOrigin(origin?: string | null, extraOrigins: string[] = []): boolean {
  if (!origin) return true; // Same-origin / server-to-server / curl / mobile native
  const parsed = parseOriginHostname(origin);
  if (!parsed.valid) return false;

  if (
    isVercelHost(parsed.hostname) ||
    isRenderHost(parsed.hostname) ||
    parsed.hostname === 'alov.uz' ||
    parsed.hostname.endsWith('.alov.uz') ||
    parsed.hostname === 'web.telegram.org' ||
    parsed.hostname.endsWith('.telegram.org') ||
    isDevPreviewHost(parsed.hostname)
  ) {
    return true;
  }

  return extraOrigins.some((extra) => {
    const p = parseOriginHostname(extra);
    return p.valid && p.origin === parsed.origin;
  });
}

/**
 * Strict origin check for postMessage listener on the Vercel micro-frontend (alov-mu.vercel.app).
 * Accepts ONLY trusted Render/Alov parent origins (plus explicit dev/preview overrides).
 */
export function isAllowedParentOrigin(origin?: string | null, extraOrigins: string[] = []): boolean {
  const parsed = parseOriginHostname(origin);
  if (!parsed.valid) return false;

  if (
    isRenderHost(parsed.hostname) ||
    parsed.hostname === 'alov.uz' ||
    parsed.hostname.endsWith('.alov.uz') ||
    isDevPreviewHost(parsed.hostname)
  ) {
    return true;
  }

  return extraOrigins.some((extra) => {
    const p = parseOriginHostname(extra);
    return p.valid && p.origin === parsed.origin;
  });
}

/**
 * Strict origin check for parent Render window receiving messages from Vercel iframe.
 */
export function isAllowedEmbedOrigin(origin?: string | null, extraOrigins: string[] = []): boolean {
  const parsed = parseOriginHostname(origin);
  if (!parsed.valid) return false;

  if (isVercelHost(parsed.hostname) || isDevPreviewHost(parsed.hostname)) {
    return true;
  }

  return extraOrigins.some((extra) => {
    const p = parseOriginHostname(extra);
    return p.valid && p.origin === parsed.origin;
  });
}

/**
 * Maps an active app tab or section identifier to its Heavy Vercel Micro-Frontend URL.
 */
export function mapTabToVercelSection(tab: string): HeavyVercelSection | null {
  switch (String(tab || '').trim().toLowerCase()) {
    case 'reels':
    case 'efir':
    case 'live':
      return 'efir';
    case 'posts':
    case 'postlar':
    case 'feed':
      return 'postlar';
    case 'chatruletka':
    case 'chatroulette':
    case 'roulette':
    case 'ruletka':
      return 'chatroulette';
    case 'chats':
    case 'chat':
    case 'messages':
    case 'xabarlar':
      return 'chat';
    default:
      return null;
  }
}

export function buildVercelSectionUrl(
  section: HeavyVercelSection,
  baseOrigin: string = VERCEL_HEAVY_ORIGIN,
  extraQuery?: Record<string, string>
): string {
  const cleanOrigin = String(baseOrigin || VERCEL_HEAVY_ORIGIN).trim().replace(/\/+$/, '');
  const path = `/${section}`;
  if (!extraQuery || Object.keys(extraQuery).length === 0) {
    return `${cleanOrigin}${path}`;
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(extraQuery)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `${cleanOrigin}${path}?${qs}` : `${cleanOrigin}${path}`;
}

export function parseVercelEmbedRoute(pathname: string): {
  isEmbedRoute: boolean;
  section: HeavyVercelSection | null;
} {
  const clean = String(pathname || '/').trim().toLowerCase().replace(/\/+$/, '') || '/';
  if (clean === '/efir' || clean === '/live') {
    return { isEmbedRoute: true, section: 'efir' };
  }
  if (clean === '/postlar' || clean === '/posts') {
    return { isEmbedRoute: true, section: 'postlar' };
  }
  if (clean === '/chatroulette' || clean === '/chatruletka' || clean === '/roulette') {
    return { isEmbedRoute: true, section: 'chatroulette' };
  }
  if (clean === '/chat' || clean === '/chats' || clean === '/messages') {
    return { isEmbedRoute: true, section: 'chat' };
  }
  return { isEmbedRoute: false, section: null };
}

/**
 * Determines whether someone opening alov-mu.vercel.app directly (outside an iframe)
 * should be automatically redirected back to the main Render site.
 */
export function shouldRedirectVercelStandaloneToMain(params: {
  hostname?: string | null;
  isInIframe: boolean;
  search?: string | null;
  mainOrigin?: string | null;
}): string | null {
  const { hostname, isInIframe, search, mainOrigin } = params;
  if (!isVercelHost(hostname)) return null;
  if (isInIframe) return null;

  const qs = String(search || '');
  try {
    const sp = new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : qs);
    if (sp.get('preview') === '1' || sp.get('autostart') === '1' || sp.get('standalone') === '1') {
      return null;
    }
  } catch {
    // ignore malformed query
  }

  const target = String(mainOrigin || MAIN_RENDER_ORIGIN).trim().replace(/\/+$/, '');
  return `${target}/`;
}

/**
 * Determines whether the host site should render Efir / Postlar / Chatroulette inside the
 * seamless Vercel iframe (`https://alov-mu.vercel.app/<section>`).
 * Chatroulette has no local Render fallback and ALWAYS renders via Vercel iframe when outside an iframe.
 */
export function shouldUseVercelIframeForSection(params: {
  hostname?: string | null;
  section: HeavyVercelSection | null;
  isInIframe?: boolean;
  search?: string | null;
  envEnabled?: boolean | string;
}): boolean {
  const { hostname, section, isInIframe = false, search = '', envEnabled } = params;
  if (!section) return false;
  if (isInIframe) return false;
  if (isVercelHost(hostname)) return false;

  const qs = String(search || '');
  let explicitFlag: string | null = null;
  let inlineFlag: string | null = null;
  try {
    const sp = new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : qs);
    explicitFlag = sp.get('microfrontend');
    inlineFlag = sp.get('inline');
  } catch {
    // ignore
  }

  if (explicitFlag === '0' || inlineFlag === '1') {
    return false;
  }
  if (explicitFlag === '1') {
    return true;
  }

  if (section === 'chatroulette') {
    return true;
  }

  if (section === 'chat' && isDevPreviewHost(hostname) && !(envEnabled === true || envEnabled === 'true')) {
    return false;
  }

  if (envEnabled === true || envEnabled === 'true') {
    return true;
  }

  return isRenderHost(hostname) || String(hostname || '').toLowerCase() === 'alov.uz' || String(hostname || '').toLowerCase() === 'www.alov.uz';
}

export function extractLocalAuthCredentials(
  storage?: Pick<Storage, 'getItem'> | null
): { token: string; userId: string; user: Record<string, any> | null } {
  if (!storage) {
    return { token: '', userId: '', user: null };
  }
  let user: Record<string, any> | null = null;
  try {
    const rawUser = storage.getItem('alov_current_user');
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      if (parsed && typeof parsed === 'object') {
        user = parsed;
      }
    }
  } catch {
    user = null;
  }

  const userId = String(
    storage.getItem('alov_user_id') ||
      storage.getItem('userId') ||
      user?.uid ||
      user?.id ||
      ''
  ).trim();

  const token = String(
    storage.getItem('alov_auth_token') ||
      storage.getItem('token') ||
      storage.getItem('authToken') ||
      user?.authToken ||
      user?.token ||
      ''
  ).trim();

  return { token, userId, user };
}

export function persistLocalAuthCredentials(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined,
  data: { token?: string | null; userId?: string | null; user?: Record<string, any> | null } | null
): void {
  if (!storage) return;
  try {
    if (!data) {
      storage.removeItem('alov_auth_token');
      storage.removeItem('token');
      storage.removeItem('alov_user_id');
      storage.removeItem('userId');
      return;
    }
    const cleanUid = String(data.userId || data.user?.uid || data.user?.id || '').trim();
    const cleanToken = String(data.token || data.user?.authToken || data.user?.token || '').trim();
    if (cleanUid) {
      storage.setItem('alov_user_id', cleanUid);
      storage.setItem('userId', cleanUid);
    }
    if (cleanToken) {
      storage.setItem('alov_auth_token', cleanToken);
      storage.setItem('token', cleanToken);
    }
    if (data.user && typeof data.user === 'object') {
      const mergedUser = {
        ...data.user,
        ...(cleanToken ? { authToken: cleanToken } : {}),
      };
      storage.setItem('alov_current_user', JSON.stringify(mergedUser));
      if (cleanUid) {
        storage.setItem(`alov_user_${cleanUid}`, JSON.stringify(mergedUser));
      }
    }
  } catch {
    // ignore storage quota errors
  }
}

export function buildPostMessageAuthPayload(params: {
  token?: string | null;
  userId?: string | null;
  user?: Record<string, any> | null;
  backendOrigin?: string | null;
  section?: HeavyVercelSection;
  partnerUid?: string | null;
  partner?: Record<string, any> | null;
}): AuthBridgePayload {
  const cleanUserId = String(params.userId || params.user?.uid || params.user?.id || '').trim();
  const cleanToken = String(params.token || params.user?.authToken || (cleanUserId ? `alov_session_${cleanUserId}` : '')).trim();
  const cleanBackend = resolveRealtimeBackendUrl(params.backendOrigin || MAIN_RENDER_ORIGIN);
  const cleanPartnerUid = String(params.partnerUid || params.partner?.uid || params.partner?.id || '').trim();
  return {
    type: 'ALOV_AUTH_BRIDGE',
    token: cleanToken,
    userId: cleanUserId,
    user: params.user || null,
    backendOrigin: cleanBackend,
    section: params.section,
    ...(cleanPartnerUid ? { partnerUid: cleanPartnerUid } : {}),
    ...(params.partner ? { partner: params.partner } : {}),
    issuedAt: Date.now(),
  };
}

export function parseIncomingAuthMessage(
  event: { origin?: string | null; data?: any },
  extraAllowedOrigins: string[] = []
): AuthBridgePayload | null {
  if (!event || !isAllowedParentOrigin(event.origin, extraAllowedOrigins)) {
    return null;
  }
  const data = event.data;
  if (!data || typeof data !== 'object' || data.type !== 'ALOV_AUTH_BRIDGE') {
    return null;
  }
  const userId = String(data.userId || data.user?.uid || '').trim();
  const token = String(data.token || '').trim();
  if (!userId && !token) {
    return null;
  }
  const backendOrigin = resolveRealtimeBackendUrl(data.backendOrigin || MAIN_RENDER_ORIGIN);
  const section = mapTabToVercelSection(data.section || '') || undefined;
  const partnerUid = String(data.partnerUid || data.partner?.uid || data.partner?.id || '').trim() || undefined;
  const partner = data.partner && typeof data.partner === 'object' ? data.partner : undefined;
  return {
    type: 'ALOV_AUTH_BRIDGE',
    token,
    userId,
    user: data.user && typeof data.user === 'object' ? data.user : null,
    backendOrigin,
    section,
    ...(partnerUid ? { partnerUid } : {}),
    ...(partner ? { partner } : {}),
    issuedAt: typeof data.issuedAt === 'number' ? data.issuedAt : Date.now(),
  };
}
