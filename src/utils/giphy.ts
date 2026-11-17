export const GIPHY_PUBLIC_API_KEY = 'dc6zaTOxFJmzC';
export const GIPHY_DEBOUNCE_MS = 450;
export const GIPHY_DEFAULT_LIMIT = 20;

export interface GiphyGifItem {
  id: string;
  title: string;
  previewUrl: string;
  sendUrl: string;
  width?: number;
  height?: number;
}

export interface FetchGiphyGifsResult {
  ok: boolean;
  gifs: GiphyGifItem[];
  mode: 'trending' | 'search';
  query: string;
  status: number;
  error?: string;
}

function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return /^https?:\/\/.+/i.test(trimmed);
}

export function buildGiphyApiUrl(
  query: string = '',
  apiKey: string = GIPHY_PUBLIC_API_KEY,
  limit: number = GIPHY_DEFAULT_LIMIT
): string {
  const cleanKey = String(apiKey || '').trim() || GIPHY_PUBLIC_API_KEY;
  const cleanQuery = String(query || '').trim();
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || GIPHY_DEFAULT_LIMIT));

  const params = new URLSearchParams({
    api_key: cleanKey,
    limit: String(safeLimit),
    rating: 'pg-13',
  });

  if (cleanQuery) {
    params.set('q', cleanQuery);
    return `https://api.giphy.com/v1/gifs/search?${params.toString()}`;
  }

  return `https://api.giphy.com/v1/gifs/trending?${params.toString()}`;
}

export function parseGiphyGifItems(payload: any): GiphyGifItem[] {
  const rawList = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.gifs)
    ? payload.gifs
    : [];

  const parsed: GiphyGifItem[] = [];
  const seen = new Set<string>();

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;

    // Support already-normalized shape (e.g. from backend /api/gifs)
    if (isValidHttpUrl(item.previewUrl) && isValidHttpUrl(item.sendUrl)) {
      const id = String(item.id || item.sendUrl);
      if (seen.has(id)) continue;
      seen.add(id);
      parsed.push({
        id,
        title: String(item.title || '').trim(),
        previewUrl: item.previewUrl.trim(),
        sendUrl: item.sendUrl.trim(),
        width: Number(item.width) || undefined,
        height: Number(item.height) || undefined,
      });
      continue;
    }

    const images = item.images || {};
    const smallUrl =
      (isValidHttpUrl(images.fixed_height_small?.url) && images.fixed_height_small.url.trim()) ||
      (isValidHttpUrl(images.fixed_height_small_still?.url) && images.fixed_height_small_still.url.trim()) ||
      (isValidHttpUrl(images.fixed_height?.url) && images.fixed_height.url.trim()) ||
      (isValidHttpUrl(images.original?.url) && images.original.url.trim()) ||
      '';

    const highQualityUrl =
      (isValidHttpUrl(images.fixed_height?.url) && images.fixed_height.url.trim()) ||
      (isValidHttpUrl(images.original?.url) && images.original.url.trim()) ||
      smallUrl;

    if (!smallUrl || !highQualityUrl) continue;

    const id = String(item.id || highQualityUrl);
    if (seen.has(id)) continue;
    seen.add(id);

    parsed.push({
      id,
      title: String(item.title || '').trim(),
      previewUrl: smallUrl,
      sendUrl: highQualityUrl,
      width: Number(images.fixed_height_small?.width) || Number(images.fixed_height?.width) || undefined,
      height: Number(images.fixed_height_small?.height) || Number(images.fixed_height?.height) || undefined,
    });
  }

  return parsed;
}

export function isGifMessage(msg: { type?: string; fileUrl?: string | null; text?: string | null } | null | undefined): boolean {
  if (!msg) return false;
  if (msg.type === 'gif') return true;
  if (msg.type !== 'image') return false;
  const url = String(msg.fileUrl || '').toLowerCase();
  const caption = String(msg.text || '').trim().toUpperCase();
  return (
    url.includes('giphy.com') ||
    /\.gif(\?|$|#)/i.test(url) ||
    caption === 'GIF' ||
    caption.startsWith('GIF ')
  );
}

export async function fetchGiphyGifs(options: {
  query?: string;
  apiKey?: string;
  backendOrigin?: string;
  limit?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<FetchGiphyGifsResult> {
  const {
    query = '',
    apiKey = GIPHY_PUBLIC_API_KEY,
    backendOrigin = '',
    limit = GIPHY_DEFAULT_LIMIT,
    signal,
    fetchImpl = fetch,
  } = options;

  const cleanQuery = String(query || '').trim();
  const mode: 'trending' | 'search' = cleanQuery ? 'search' : 'trending';
  const directUrl = buildGiphyApiUrl(cleanQuery, apiKey, limit);

  try {
    const res = await fetchImpl(directUrl, { signal });
    const data = await res.json().catch(() => null);

    if (res.ok) {
      return {
        ok: true,
        gifs: parseGiphyGifItems(data),
        mode,
        query: cleanQuery,
        status: res.status,
      };
    }

    // Fallback to Render backend proxy if direct key (e.g. legacy public beta key) was rejected
    const cleanBackend = String(backendOrigin || '').trim().replace(/\/+$/, '');
    if ((res.status === 401 || res.status === 403) && cleanBackend) {
      const proxyParams = new URLSearchParams({ limit: String(limit) });
      if (cleanQuery) proxyParams.set('q', cleanQuery);
      const proxyRes = await fetchImpl(`${cleanBackend}/api/gifs?${proxyParams.toString()}`, { signal });
      const proxyData = await proxyRes.json().catch(() => null);
      if (proxyRes.ok && proxyData?.success) {
        return {
          ok: true,
          gifs: parseGiphyGifItems(proxyData),
          mode,
          query: cleanQuery,
          status: proxyRes.status,
        };
      }
    }

    return {
      ok: false,
      gifs: [],
      mode,
      query: cleanQuery,
      status: res.status || data?.meta?.status || 500,
      error: data?.meta?.msg || `Giphy HTTP ${res.status}`,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw err;
    }
    return {
      ok: false,
      gifs: [],
      mode,
      query: cleanQuery,
      status: 0,
      error: err?.message || 'Tarmoq xatoligi',
    };
  }
}
