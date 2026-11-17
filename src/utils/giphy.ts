export const GIPHY_PUBLIC_API_KEY =
  'ZweNxjIB3CdKxUfhLMdodMnRsB9B0bsXJCI4roKa0iJYV4k0bHmKW6qRk26yL2qv';
export const GIPHY_DEBOUNCE_MS = 350;
export const GIPHY_DEFAULT_LIMIT = 20;

export interface GiphyGifItem {
  id: string;
  title: string;
  previewUrl: string;
  sendUrl: string;
  images?: {
    fixed_height_small?: { url: string; width?: number; height?: number };
    original?: { url: string };
  };
  width?: number;
  height?: number;
}

export interface FetchGiphyGifsResult {
  ok: boolean;
  gifs: GiphyGifItem[];
  mode: 'trending' | 'search';
  query: string;
  translatedQuery: string;
  status: number;
  error?: string;
}

/**
 * O'zbekcha so'z va iboralarni Giphy tushunadigan inglizcha qidiruv so'zlariga o'giruvchi lug'at.
 */
export const uzToEnMap: Record<string, string> = {
  // Salomlashish va xayrlashish
  salom: 'hello',
  assalomu: 'hello',
  alaykum: 'hello',
  privet: 'hello',
  qalaysan: 'how are you',
  qalaysiz: 'how are you',
  qaley: 'how are you',
  xayr: 'bye',
  xayrli: 'good',
  tong: 'morning',
  kun: 'day',
  kech: 'evening',
  tun: 'night',
  uxla: 'sleep',
  uyqu: 'sleep',
  uyqum: 'sleepy',
  charchadim: 'tired',

  // Kulgu va hazil
  kulgu: 'laugh',
  kulgi: 'laugh',
  kulgili: 'funny',
  kulish: 'laugh',
  kul: 'laugh',
  kuldim: 'laughing',
  hazil: 'funny',
  xaxa: 'laugh',
  xaxaxa: 'laugh',
  haha: 'laugh',
  hahaha: 'laugh',
  ahaha: 'laugh',
  axaxa: 'laugh',
  lol: 'laugh',
  tabassum: 'smile',

  // Maqtov va ijobiy reaksiyalar
  "zo'r": 'awesome',
  zor: 'awesome',
  ajoyib: 'amazing',
  super: 'super',
  klass: 'cool',
  yaxshi: 'good',
  barakalla: 'bravo',
  ofarin: 'applause',
  qoyil: 'wow',
  dahshat: 'awesome',
  chotki: 'cool',
  "a'lo": 'perfect',
  alo: 'perfect',
  muvaffaqiyat: 'success',
  omad: 'good luck',
  "g'alaba": 'victory',
  galaba: 'victory',
  yutdim: 'win',
  rahmat: 'thank you',
  raxmat: 'thank you',
  tashakkur: 'thank you',
  minnatdor: 'grateful',
  iltimos: 'please',
  uzr: 'sorry',
  kechir: 'sorry',
  kechirasiz: 'sorry',
  ha: 'yes',
  xa: 'yes',
  albatta: 'yes',
  "to'g'ri": 'yes',
  togri: 'yes',
  "yo'q": 'no',
  yoq: 'no',
  aslo: 'no',
  mayli: 'ok',
  "bo'ldi": 'ok',
  boldi: 'ok',

  // Sevgi va romantika
  sevgi: 'love',
  muhabbat: 'love',
  sevaman: 'love',
  sevgilim: 'love',
  yuragim: 'heart',
  yurak: 'heart',
  qalb: 'heart',
  jonim: 'love',
  asalim: 'sweetheart',
  shirintoy: 'cute',
  mehr: 'love',
  "o'pich": 'kiss',
  opich: 'kiss',
  "bo'sa": 'kiss',
  bosa: 'kiss',
  quchoq: 'hug',
  quchoqlash: 'hug',
  sogindim: 'miss you',
  "sog'indim": 'miss you',
  chiroyli: 'beautiful',
  "go'zal": 'beautiful',
  gozal: 'beautiful',
  kelishgan: 'handsome',
  gul: 'flower',
  atirgul: 'rose',
  gullar: 'flowers',

  // His-tuyg'ular
  xursand: 'happy',
  baxt: 'happy',
  baxtli: 'happy',
  quvonch: 'happy',
  shod: 'happy',
  xafa: 'sad',
  "g'amgin": 'sad',
  gamgin: 'sad',
  mahzun: 'sad',
  "yig'lash": 'cry',
  yiglash: 'cry',
  "yig'i": 'cry',
  yigi: 'cry',
  "yig'lama": 'dont cry',
  yiglama: 'dont cry',
  zerikdim: 'bored',
  zerikarli: 'bored',
  jahl: 'angry',
  "g'azab": 'angry',
  gazab: 'angry',
  asabiy: 'angry',
  hayrat: 'shocked',
  shok: 'shocked',
  voy: 'omg',
  vau: 'wow',
  ajabo: 'wow',
  "qo'rqinchli": 'scary',
  qorqinchli: 'scary',
  "qo'rqdim": 'scared',
  qorqdim: 'scared',
  uyat: 'shy',
  uyaldim: 'shy',
  bilmadim: 'confused',
  tushunmadim: 'confused',
  kutayapman: 'waiting',
  kutish: 'waiting',

  // Bayram va harakatlar
  tabrik: 'congratulations',
  tabriklayman: 'congratulations',
  muborak: 'celebration',
  bayram: 'party',
  "tug'ilgan": 'birthday',
  tugilgan: 'birthday',
  "sovg'a": 'gift',
  sovga: 'gift',
  raqs: 'dance',
  "o'yin": 'dance',
  oyin: 'dance',
  musiqa: 'music',
  "qo'shiq": 'singing',
  qoshiq: 'singing',
  ish: 'work',
  ishla: 'work',
  "o'qi": 'study',
  oqi: 'study',
  yoz: 'typing',
  qara: 'look',
  ket: 'go',
  kel: 'come',
  tez: 'fast',
  shoshil: 'hurry',
  kuchli: 'strong',
  aqlli: 'smart',

  // Odamlar, hayvonlar, narsalar
  "do'st": 'friend',
  dost: 'friend',
  oila: 'family',
  ona: 'mom',
  ota: 'dad',
  mushuk: 'cat',
  kuchuk: 'dog',
  ayiq: 'bear',
  sher: 'lion',
  olov: 'fire',
  alov: 'fire',
  pul: 'money',
  olmos: 'diamond',
  almaz: 'diamond',
  oltin: 'gold',
  ovqat: 'food',
  och: 'hungry',
  mazali: 'delicious',
  choy: 'tea',
  qahva: 'coffee',
  kofe: 'coffee',
  suv: 'water',
  yulduz: 'star',
  quyosh: 'sun',
  oy: 'moon',
  "yomg'ir": 'rain',
  yomgir: 'rain',
  qor: 'snow',
  mashina: 'car',
  sayohat: 'travel',
  samolyot: 'airplane',
  dengiz: 'ocean',
  futbol: 'football',
  sport: 'sport',

  // Kirillcha o'zbekcha so'zlar
  салом: 'hello',
  ассалому: 'hello',
  қалайсан: 'how are you',
  қалайсиз: 'how are you',
  хайр: 'bye',
  кулгу: 'laugh',
  кулги: 'laugh',
  кулгили: 'funny',
  зўр: 'awesome',
  зор: 'awesome',
  ажойиб: 'amazing',
  яхши: 'good',
  раҳмат: 'thank you',
  рахмат: 'thank you',
  севги: 'love',
  севаман: 'love',
  юрак: 'heart',
  хурсанд: 'happy',
  бахт: 'happy',
  хафа: 'sad',
  йиғлаш: 'cry',
  жаҳл: 'angry',
  уйқу: 'sleep',
  рақс: 'dance',
  байрам: 'party',
  табрик: 'congratulations',
  мусиқа: 'music',
  дўст: 'friend',
  совға: 'gift',
  олов: 'fire',
  алов: 'fire',
  мушук: 'cat',
  кучук: 'dog',
  хаха: 'laugh',
  хахаха: 'laugh',
};

const uzPhraseToEnMap: Array<[string, string]> = [
  ["yaxshi ko'raman", 'i love you'],
  ['yaxshi koraman', 'i love you'],
  ['seni sevaman', 'i love you'],
  ["tug'ilgan kun", 'happy birthday'],
  ['tugilgan kun', 'happy birthday'],
  ['xayrli tong', 'good morning'],
  ['xayrli kun', 'good day'],
  ['xayrli kech', 'good evening'],
  ['xayrli tun', 'good night'],
  ["gap yo'q", 'awesome'],
  ['gap yoq', 'awesome'],
  ['nima gap', 'whats up'],
  ["ko'rishguncha", 'see you'],
  ['korishguncha', 'see you'],
  ["xafa bo'lma", 'cheer up'],
  ['xafa bolma', 'cheer up'],
  ["ko'z yosh", 'crying'],
  ['koz yosh', 'crying'],
  ['rahmat katta', 'thank you'],
  ['katta rahmat', 'thank you'],
  ['omad tilayman', 'good luck'],
];

const UZBEK_COMMON_SUFFIXES = [
  'yapman',
  'yapsan',
  'yapti',
  'yapmiz',
  'yapsiz',
  'mayman',
  'maysan',
  'maydi',
  'dingiz',
  'dim',
  'ding',
  'di',
  'man',
  'san',
  'miz',
  'siz',
  'lar',
  'ler',
  'ning',
  'dan',
  'tan',
  'dagi',
  'tagi',
  'ga',
  'ka',
  'qa',
  'da',
  'ta',
  'ni',
  'im',
  'ing',
  'lik',
  'chi',
  'cha',
  'mi',
  'ku',
];

function normalizeUzbekApostrophes(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’`ʻʼʹ′]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupUzbekWord(word: string): string | null {
  const clean = word.replace(/[^a-zа-яёўқғҳ']/gi, '');
  if (!clean) return null;

  if (uzToEnMap[clean]) return uzToEnMap[clean];

  // Try without apostrophe (e.g. zo'r vs zor)
  const noApos = clean.replace(/'/g, '');
  if (uzToEnMap[noApos]) return uzToEnMap[noApos];

  // Try stripping Uzbek suffixes iteratively (up to 2 passes)
  for (const baseCandidate of [clean, noApos]) {
    for (const suffix of UZBEK_COMMON_SUFFIXES) {
      if (baseCandidate.length > suffix.length + 1 && baseCandidate.endsWith(suffix)) {
        const stem = baseCandidate.slice(0, -suffix.length);
        if (uzToEnMap[stem]) return uzToEnMap[stem];
        const stemNoApos = stem.replace(/'/g, '');
        if (uzToEnMap[stemNoApos]) return uzToEnMap[stemNoApos];
      }
    }
  }

  // Laugh variants like xaxaxaxa, hahahaha
  if (/^(?:xa)+x?a?$|^(?:ha)+h?a?$|^(?:ax)+a?$/i.test(noApos) && noApos.length >= 4) {
    return 'laugh';
  }

  return null;
}

function looksLikeUntranslatedUzbekOrCyrillic(text: string): boolean {
  if (/[а-яёўқғҳ]/i.test(text)) return true;
  if (/[og]'/i.test(text)) return true;
  if (/(?:yap|man|san|miz|siz|lar|ning|dan|lik|dim|ding|di|mi|ku)\b/i.test(text)) return true;
  return false;
}

/**
 * Foydalanuvchi yozgan o'zbekcha so'z yoki gapni Giphy qidiruv tizimi tushunadigan
 * inglizcha kalit so'zlarga tarjima qiladi. Lug'atda bo'lmasa, umumiy ma'noli qidiruv
 * so'ziga ("thinking", "waiting", "reaction" va h.k.) o'giradi.
 */
export function translateUzbekToGiphyQuery(rawText: string): string {
  const normalized = normalizeUzbekApostrophes(rawText);
  if (!normalized) return '';

  const translatedTokens: string[] = [];
  let working = normalized;

  // 1. Replace known multi-word phrases first
  for (const [phrase, en] of uzPhraseToEnMap) {
    if (working.includes(phrase)) {
      if (!translatedTokens.includes(en)) {
        translatedTokens.push(en);
      }
      working = working.replaceAll(phrase, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // 2. Translate remaining tokens word by word
  const rawTokens = working.split(/\s+/).filter(Boolean);
  const passthroughEnglishTokens: string[] = [];

  for (const token of rawTokens) {
    const mapped = lookupUzbekWord(token);
    if (mapped) {
      if (!translatedTokens.includes(mapped)) {
        translatedTokens.push(mapped);
      }
    } else {
      const asciiClean = token.replace(/[^a-z0-9]/gi, '');
      if (asciiClean.length >= 2) {
        passthroughEnglishTokens.push(asciiClean);
      }
    }
  }

  if (translatedTokens.length > 0) {
    return translatedTokens.slice(0, 3).join(' ');
  }

  // 3. Fallback when word/sentence wasn't in the dictionary
  if (looksLikeUntranslatedUzbekOrCyrillic(normalized)) {
    if (normalized.includes('?') || /\bmi\b/.test(normalized)) {
      return 'thinking';
    }
    if (normalized.includes('...')) {
      return 'waiting';
    }
    if (normalized.includes('!')) {
      return 'wow';
    }
    return 'reaction';
  }

  // Already ASCII / English keyword (e.g. "cat", "happy", "party")
  if (passthroughEnglishTokens.length > 0) {
    return passthroughEnglishTokens.slice(0, 4).join(' ');
  }

  return 'reaction';
}

export const KLIPY_API_KEY = GIPHY_PUBLIC_API_KEY;

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
  const rawQuery = String(query || '').trim();
  const translatedQuery = rawQuery ? translateUzbekToGiphyQuery(rawQuery) : '';
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || GIPHY_DEFAULT_LIMIT));

  const params = new URLSearchParams({
    per_page: String(safeLimit),
    contentfilter: 'medium',
  });

  if (translatedQuery) {
    params.set('q', translatedQuery);
    return `https://api.klipy.com/api/v1/${encodeURIComponent(cleanKey)}/gifs/search?${params.toString()}`;
  }

  return `https://api.klipy.com/api/v1/${encodeURIComponent(cleanKey)}/gifs/trending?${params.toString()}`;
}

export const buildKlipyApiUrl = buildGiphyApiUrl;

export function parseGiphyGifItems(payload: any): GiphyGifItem[] {
  const rawList = Array.isArray(payload?.data?.data)
    ? payload.data.data
    : Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.gifs)
    ? payload.gifs
    : [];

  const parsed: GiphyGifItem[] = [];
  const seen = new Set<string>();

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    if (String(item.type || '').toLowerCase() === 'ad') continue;

    // 1. Already-normalized shape (e.g. from backend /api/gifs)
    if (isValidHttpUrl(item.previewUrl) && isValidHttpUrl(item.sendUrl)) {
      const id = String(item.id || item.sendUrl);
      if (seen.has(id)) continue;
      seen.add(id);
      const previewUrl = item.previewUrl.trim();
      const sendUrl = item.sendUrl.trim();
      parsed.push({
        id,
        title: String(item.title || '').trim(),
        previewUrl,
        sendUrl,
        images: {
          fixed_height_small: {
            url: previewUrl,
            width: Number(item.width) || undefined,
            height: Number(item.height) || undefined,
          },
          original: { url: sendUrl },
        },
        width: Number(item.width) || undefined,
        height: Number(item.height) || undefined,
      });
      continue;
    }

    // 2. Klipy v1 format: item.file.{xs,sm,md,hd}.{gif,webp}
    if (item.file && typeof item.file === 'object') {
      const f = item.file;
      const smallMedia = f.sm?.gif || f.xs?.gif || f.md?.gif || f.hd?.gif || f.sm?.webp || f.md?.webp;
      const origMedia = f.hd?.gif || f.md?.gif || f.sm?.gif || f.hd?.webp || smallMedia;
      const smallUrl = isValidHttpUrl(smallMedia?.url) ? smallMedia.url.trim() : '';
      const originalUrl = isValidHttpUrl(origMedia?.url) ? origMedia.url.trim() : smallUrl;
      if (!smallUrl || !originalUrl) continue;

      const id = String(item.id ?? item.slug ?? originalUrl);
      if (seen.has(id)) continue;
      seen.add(id);

      const width = Number(smallMedia?.width) || Number(origMedia?.width) || undefined;
      const height = Number(smallMedia?.height) || Number(origMedia?.height) || undefined;

      parsed.push({
        id,
        title: String(item.title || '').trim(),
        previewUrl: smallUrl,
        sendUrl: originalUrl,
        images: {
          fixed_height_small: { url: smallUrl, width, height },
          original: { url: originalUrl },
        },
        width,
        height,
      });
      continue;
    }

    // 3. Klipy v2 / Tenor format: item.media_formats.{tinygif,nanogif,mediumgif,gif}
    if (item.media_formats && typeof item.media_formats === 'object') {
      const mf = item.media_formats;
      const smallMedia = mf.tinygif || mf.nanogif || mf.mediumgif || mf.gif;
      const origMedia = mf.gif || mf.mediumgif || mf.tinygif || smallMedia;
      const smallUrl = isValidHttpUrl(smallMedia?.url) ? smallMedia.url.trim() : '';
      const originalUrl = isValidHttpUrl(origMedia?.url) ? origMedia.url.trim() : smallUrl;
      if (!smallUrl || !originalUrl) continue;

      const id = String(item.id || originalUrl);
      if (seen.has(id)) continue;
      seen.add(id);

      const dims = Array.isArray(smallMedia?.dims) ? smallMedia.dims : Array.isArray(origMedia?.dims) ? origMedia.dims : [];
      const width = Number(dims[0]) || undefined;
      const height = Number(dims[1]) || undefined;

      parsed.push({
        id,
        title: String(item.title || '').trim(),
        previewUrl: smallUrl,
        sendUrl: originalUrl,
        images: {
          fixed_height_small: { url: smallUrl, width, height },
          original: { url: originalUrl },
        },
        width,
        height,
      });
      continue;
    }

    // 4. Legacy Giphy format: item.images.{fixed_height_small,original}
    const images = item.images || {};
    const smallUrl =
      (isValidHttpUrl(images.fixed_height_small?.url) && images.fixed_height_small.url.trim()) ||
      (isValidHttpUrl(images.fixed_height_small_still?.url) && images.fixed_height_small_still.url.trim()) ||
      (isValidHttpUrl(images.fixed_height?.url) && images.fixed_height.url.trim()) ||
      (isValidHttpUrl(images.original?.url) && images.original.url.trim()) ||
      '';

    const originalUrl =
      (isValidHttpUrl(images.original?.url) && images.original.url.trim()) ||
      (isValidHttpUrl(images.fixed_height?.url) && images.fixed_height.url.trim()) ||
      smallUrl;

    if (!smallUrl || !originalUrl) continue;

    const id = String(item.id || originalUrl);
    if (seen.has(id)) continue;
    seen.add(id);

    const width = Number(images.fixed_height_small?.width) || Number(images.fixed_height?.width) || undefined;
    const height = Number(images.fixed_height_small?.height) || Number(images.fixed_height?.height) || undefined;

    parsed.push({
      id,
      title: String(item.title || '').trim(),
      previewUrl: smallUrl,
      sendUrl: originalUrl,
      images: {
        fixed_height_small: { url: smallUrl, width, height },
        original: { url: originalUrl },
      },
      width,
      height,
    });
  }

  return parsed;
}

export function isGifMessage(
  msg: { type?: string; fileUrl?: string | null; content?: string | null; text?: string | null } | null | undefined
): boolean {
  if (!msg) return false;
  if (msg.type === 'gif') return true;
  if (msg.type !== 'image') return false;
  const url = String(msg.fileUrl || msg.content || '').toLowerCase();
  const caption = String(msg.text || '').trim().toUpperCase();
  return (
    url.includes('klipy.com') ||
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
  const translatedQuery = cleanQuery ? translateUzbekToGiphyQuery(cleanQuery) : '';
  const mode: 'trending' | 'search' = translatedQuery ? 'search' : 'trending';
  const directUrl = buildGiphyApiUrl(cleanQuery, apiKey, limit);

  try {
    const res = await fetchImpl(directUrl, { signal });
    const data = await res.json().catch(() => null);

    if (res.ok && data?.result !== false) {
      return {
        ok: true,
        gifs: parseGiphyGifItems(data),
        mode,
        query: cleanQuery,
        translatedQuery,
        status: res.status,
      };
    }

    // Fallback to Render backend proxy if direct request is rejected
    const cleanBackend = String(backendOrigin || '').trim().replace(/\/+$/, '');
    if ((res.status === 401 || res.status === 403 || res.status >= 400) && cleanBackend) {
      const proxyParams = new URLSearchParams({ limit: String(limit) });
      if (translatedQuery) proxyParams.set('q', translatedQuery);
      const proxyRes = await fetchImpl(`${cleanBackend}/api/gifs?${proxyParams.toString()}`, { signal });
      const proxyData = await proxyRes.json().catch(() => null);
      if (proxyRes.ok && proxyData?.success) {
        return {
          ok: true,
          gifs: parseGiphyGifItems(proxyData),
          mode,
          query: cleanQuery,
          translatedQuery,
          status: proxyRes.status,
        };
      }
    }

    return {
      ok: false,
      gifs: [],
      mode,
      query: cleanQuery,
      translatedQuery,
      status: res.status || data?.meta?.status || 500,
      error: data?.message || data?.meta?.msg || `Klipy HTTP ${res.status}`,
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
      translatedQuery,
      status: 0,
      error: err?.message || 'Tarmoq xatoligi',
    };
  }
}
