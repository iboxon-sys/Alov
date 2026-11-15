export type SupportedVideoExt = '.mp4' | '.webm' | '.mov' | '.m4v';

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^0\.0\.0\.0$/,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd00:/i,
  /\.local$/i,
  /\.internal$/i,
];

export function validateExternalVideoUrl(
  rawUrl: string,
  options: { allowLoopback?: boolean } = {}
): { ok: true; url: URL } | { ok: false; error: string } {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Video havolasini kiriting.' };
  }

  const hasExplicitScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  const normalized = hasExplicitScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { ok: false, error: "Havola formati noto'g'ri." };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Faqat http:// yoki https:// havolalar qo‘llab-quvvatlanadi.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (!options.allowLoopback) {
    for (const pattern of PRIVATE_HOST_PATTERNS) {
      if (pattern.test(host)) {
        return { ok: false, error: 'Ichki yoki lokal tarmoq manzillariga ruxsat berilmagan.' };
      }
    }
  }

  return { ok: true, url: parsed };
}

export function inferVideoFileExtension(
  contentType: string = '',
  sourceUrl: string = ''
): SupportedVideoExt | null {
  const ct = String(contentType || '').toLowerCase().split(';')[0].trim();
  let urlPath = '';
  try {
    urlPath = new URL(sourceUrl).pathname.toLowerCase();
  } catch {
    urlPath = String(sourceUrl || '').toLowerCase().split('?')[0];
  }

  if (ct === 'video/webm') return '.webm';
  if (ct === 'video/quicktime') return '.mov';
  if (ct === 'video/x-m4v') return '.m4v';
  if (ct === 'video/mp4' || ct === 'application/mp4') return '.mp4';

  if (urlPath.endsWith('.webm')) return '.webm';
  if (urlPath.endsWith('.mov')) return '.mov';
  if (urlPath.endsWith('.m4v')) return '.m4v';
  if (urlPath.endsWith('.mp4')) return '.mp4';

  if (ct.startsWith('video/')) return '.mp4';

  return null;
}

function unescapeExtractedUrl(raw: string): string {
  return raw
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/&amp;/g, '&')
    .trim();
}

export function extractVideoUrlsFromHtml(html: string, baseUrl: string): string[] {
  if (!html) return [];
  const candidates: string[] = [];

  const patterns: RegExp[] = [
    /<meta[^>]+(?:property|name)=["'](?:og:video:secure_url|og:video:url|og:video|twitter:player:stream)["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:video:secure_url|og:video:url|og:video|twitter:player:stream)["']/gi,
    /<(?:video|source)[^>]+src=["']([^"']+)["']/gi,
    /"(?:hdplay|playAddr|play_addr|video_url|videoUrl|contentUrl|playbackUrl|fallback_url|url)"\s*:\s*"(https?:[^"\\]*(?:\\.[^"\\]*)*)"/gi,
    /(https?:\/\/[^"'\\\s<>]+\.(?:mp4|webm|mov|m4v)(?:\?[^"'\\\s<>]*)?)/gi,
  ];

  for (const regex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const cleaned = unescapeExtractedUrl(match[1] || '');
      if (!cleaned) continue;
      try {
        const resolved = new URL(cleaned, baseUrl).toString();
        if (!/^https?:\/\//i.test(resolved)) continue;
        // Skip obvious iframe / player HTML pages if a direct media file is available
        if (!candidates.includes(resolved)) {
          candidates.push(resolved);
        }
      } catch {
        // ignore invalid candidate URLs
      }
    }
  }

  // Prioritize explicit video file extensions first
  return candidates.sort((a, b) => {
    const score = (u: string) => {
      const lower = u.toLowerCase();
      if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(lower)) return 0;
      if (/video|cdn|stream|play/i.test(lower)) return 1;
      return 2;
    };
    return score(a) - score(b);
  });
}

export function isDirectPlayableVideoUrl(url: string = ''): boolean {
  const lower = String(url || '').trim().toLowerCase();
  if (!lower) return false;
  if (lower.startsWith('/api/media/') || lower.startsWith('data:video/') || lower.startsWith('blob:')) {
    return true;
  }
  return /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(lower);
}

export function isHlsStreamUrl(url: string = ''): boolean {
  return /\.m3u8(\?.*)?$/i.test(String(url || '').trim());
}

export function extractTwitterStatusPath(rawUrl: string): string | null {
  const match = String(rawUrl || '').match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]+\/status\/\d+)/i);
  return match && match[1] ? match[1] : null;
}

export function extractInstagramShortcode(rawUrl: string): string | null {
  const match = String(rawUrl || '').match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  return match && match[1] ? match[1] : null;
}

export function isSocialVideoHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return /(youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|vk\.com|vkvideo\.ru|rutube\.ru|vimeo\.com|dailymotion\.com|dai\.ly|twitter\.com|x\.com|reddit\.com|v\.redd\.it|pinterest\.com|pin\.it|ok\.ru|t\.me|twitch\.tv|threads\.net)/i.test(
      host
    );
  } catch {
    return false;
  }
}
