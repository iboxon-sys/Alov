export type ResolvedMediaKind = 'direct_video' | 'direct_image' | 'direct_audio' | 'embed_iframe' | 'external';

export interface ParsedMediaLink {
  originalUrl: string;
  normalizedUrl: string;
  kind: ResolvedMediaKind;
  provider:
    | 'youtube'
    | 'tiktok'
    | 'instagram'
    | 'vimeo'
    | 'facebook'
    | 'dailymotion'
    | 'telegram'
    | 'vk'
    | 'rutube'
    | 'soundcloud'
    | 'spotify'
    | 'direct';
  embedUrl?: string;
  isVertical?: boolean;
  detectedType: 'photo' | 'video' | 'music';
}

export interface MusicCatalogTrack {
  id: string;
  title: string;
  artist: string;
  genre: string;
  durationLabel: string;
  audioUrl: string;
  accentFrom: string;
  accentTo: string;
}

export const CURATED_MUSIC_CATALOG: MusicCatalogTrack[] = [
  {
    id: 'toshkent_oqshomi',
    title: 'Toshkent Oqshomi',
    artist: 'Alov Acoustic',
    genre: 'Romantik Lo-Fi',
    durationLabel: '0:24',
    audioUrl: '/api/media/preset-audio/toshkent_oqshomi',
    accentFrom: '#2C181C',
    accentTo: '#6E2634',
  },
  {
    id: 'bahor_nafasi',
    title: 'Bahor Nafasi',
    artist: 'Dilnoza & Ensemble',
    genre: 'Lirik Kuy',
    durationLabel: '0:24',
    audioUrl: '/api/media/preset-audio/bahor_nafasi',
    accentFrom: '#1D2432',
    accentTo: '#4B324C',
  },
  {
    id: 'samarqand_yulduzlari',
    title: 'Samarqand Yulduzlari',
    artist: 'Registon Vibe',
    genre: 'Chillout',
    durationLabel: '0:24',
    audioUrl: '/api/media/preset-audio/samarqand_yulduzlari',
    accentFrom: '#1E2A26',
    accentTo: '#3C5949',
  },
  {
    id: 'samimiy_hislar',
    title: 'Samimiy Hislar',
    artist: 'Piano & Strings',
    genre: 'Klassik Pop',
    durationLabel: '0:24',
    audioUrl: '/api/media/preset-audio/samimiy_hislar',
    accentFrom: '#2A1D2B',
    accentTo: '#83324B',
  },
  {
    id: 'tungi_sayr',
    title: 'Tungi Sayr',
    artist: 'Amir Beats',
    genre: 'Deep House',
    durationLabel: '0:24',
    audioUrl: '/api/media/preset-audio/tungi_sayr',
    accentFrom: '#181E2B',
    accentTo: '#2E4366',
  },
  {
    id: 'yor_yor_melody',
    title: 'Baxt Kuyi',
    artist: 'Sharq Sadosi',
    genre: 'Milliy & Zamonaviy',
    durationLabel: '0:24',
    audioUrl: '/api/media/preset-audio/yor_yor_melody',
    accentFrom: '#301E17',
    accentTo: '#8F592E',
  },
];

export function normalizeMediaUrlInput(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/api/') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function extractYouTubeVideoId(url: string): { id: string; isShorts: boolean } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '').replace(/^music\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id ? { id, isShorts: false } : null;
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/shorts/')[1]?.split('/')[0];
        return id ? { id, isShorts: true } : null;
      }
      if (u.pathname.startsWith('/live/')) {
        const id = u.pathname.split('/live/')[1]?.split('/')[0];
        return id ? { id, isShorts: false } : null;
      }
      if (u.pathname.startsWith('/embed/')) {
        const id = u.pathname.split('/embed/')[1]?.split('/')[0];
        return id ? { id, isShorts: false } : null;
      }
      const v = u.searchParams.get('v');
      if (v) return { id: v, isShorts: false };
    }
  } catch {
    return null;
  }
  return null;
}

export function parseMediaLink(
  rawUrl: string,
  preferredType?: 'photo' | 'video' | 'music' | 'text'
): ParsedMediaLink {
  const normalizedUrl = normalizeMediaUrlInput(rawUrl);
  const lower = normalizedUrl.toLowerCase();

  const fallbackType: 'photo' | 'video' | 'music' =
    preferredType === 'music' ? 'music' : preferredType === 'photo' ? 'photo' : 'video';

  if (!normalizedUrl) {
    return {
      originalUrl: rawUrl,
      normalizedUrl: '',
      kind: 'external',
      provider: 'direct',
      detectedType: fallbackType,
    };
  }

  // Local / Data / Blob URLs
  if (lower.startsWith('data:image/') || /\.(jpg|jpeg|png|webp|gif|avif|svg)(\?.*)?$/i.test(lower)) {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'direct_image',
      provider: 'direct',
      detectedType: 'photo',
    };
  }
  if (
    lower.startsWith('data:audio/') ||
    lower.includes('/api/media/preset-audio/') ||
    /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(lower)
  ) {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'direct_audio',
      provider: 'direct',
      detectedType: 'music',
    };
  }
  if (lower.startsWith('data:video/') || /\.(mp4|webm|mov|m4v|mkv|ogv)(\?.*)?$/i.test(lower)) {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'direct_video',
      provider: 'direct',
      detectedType: 'video',
    };
  }
  if (lower.startsWith('/api/media/') || lower.startsWith('blob:')) {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind:
        fallbackType === 'photo'
          ? 'direct_image'
          : fallbackType === 'music'
            ? 'direct_audio'
            : 'direct_video',
      provider: 'direct',
      detectedType: fallbackType,
    };
  }

  // YouTube
  const yt = extractYouTubeVideoId(normalizedUrl);
  if (yt) {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'embed_iframe',
      provider: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${yt.id}?playsinline=1&rel=0&modestbranding=1`,
      isVertical: yt.isShorts,
      detectedType: preferredType === 'music' ? 'music' : 'video',
    };
  }

  // TikTok
  const ttMatch = normalizedUrl.match(/tiktok\.com\/(?:@[^/]+\/video|v|embed\/v2)\/(\d+)/i);
  if (ttMatch && ttMatch[1]) {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'embed_iframe',
      provider: 'tiktok',
      embedUrl: `https://www.tiktok.com/embed/v2/${ttMatch[1]}`,
      isVertical: true,
      detectedType: 'video',
    };
  }

  // Instagram Reels / Posts / TV
  const igMatch = normalizedUrl.match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i);
  if (igMatch && igMatch[1]) {
    const isReel = /instagram\.com\/(?:reel|reels)\//i.test(normalizedUrl);
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'embed_iframe',
      provider: 'instagram',
      embedUrl: `https://www.instagram.com/p/${igMatch[1]}/embed/`,
      isVertical: isReel,
      detectedType: preferredType === 'photo' && !isReel ? 'photo' : 'video',
    };
  }

  // Vimeo
  const vimeoMatch = normalizedUrl.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'embed_iframe',
      provider: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      isVertical: false,
      detectedType: 'video',
    };
  }

  // Dailymotion
  const dmMatch = normalizedUrl.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/i);
  if (dmMatch && dmMatch[1]) {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'embed_iframe',
      provider: 'dailymotion',
      embedUrl: `https://www.dailymotion.com/embed/video/${dmMatch[1]}`,
      isVertical: false,
      detectedType: 'video',
    };
  }

  // Facebook Videos / Reels / Watch
  if (/(facebook\.com|fb\.watch)/i.test(normalizedUrl)) {
    const isReel = /\/reel\//i.test(normalizedUrl);
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'embed_iframe',
      provider: 'facebook',
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(normalizedUrl)}&show_text=false`,
      isVertical: isReel,
      detectedType: 'video',
    };
  }

  // Telegram post link: https://t.me/channel/123
  const tgPostMatch = normalizedUrl.match(/t\.me\/([a-zA-Z0-9_]+)\/(\d+)/i);
  if (tgPostMatch && tgPostMatch[1] && tgPostMatch[2]) {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'embed_iframe',
      provider: 'telegram',
      embedUrl: `https://t.me/${tgPostMatch[1]}/${tgPostMatch[2]}?embed=1&userpic=false`,
      isVertical: false,
      detectedType: fallbackType,
    };
  }

  // VK Video
  const vkMatch = normalizedUrl.match(/(?:vk\.com|vkvideo\.ru)\/video(-?\d+)_(\d+)/i);
  if (vkMatch && vkMatch[1] && vkMatch[2]) {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'embed_iframe',
      provider: 'vk',
      embedUrl: `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}`,
      isVertical: false,
      detectedType: 'video',
    };
  }

  // Rutube
  const rtMatch = normalizedUrl.match(/rutube\.ru\/video\/([a-zA-Z0-9]+)/i);
  if (rtMatch && rtMatch[1]) {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'embed_iframe',
      provider: 'rutube',
      embedUrl: `https://rutube.ru/play/embed/${rtMatch[1]}`,
      isVertical: false,
      detectedType: 'video',
    };
  }

  // SoundCloud
  if (/soundcloud\.com\//i.test(normalizedUrl)) {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'embed_iframe',
      provider: 'soundcloud',
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(normalizedUrl)}&color=%23C93545&auto_play=false&show_teaser=false`,
      detectedType: 'music',
    };
  }

  // Spotify Track
  const spotifyMatch = normalizedUrl.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/i);
  if (spotifyMatch && spotifyMatch[1] && spotifyMatch[2]) {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'embed_iframe',
      provider: 'spotify',
      embedUrl: `https://open.spotify.com/embed/${spotifyMatch[1].toLowerCase()}/${spotifyMatch[2]}`,
      detectedType: 'music',
    };
  }

  // Fallback by preferredType so direct image/audio/video CDN URLs without extensions still work!
  if (preferredType === 'photo') {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'direct_image',
      provider: 'direct',
      detectedType: 'photo',
    };
  }
  if (preferredType === 'music') {
    return {
      originalUrl: rawUrl,
      normalizedUrl,
      kind: 'direct_audio',
      provider: 'direct',
      detectedType: 'music',
    };
  }

  return {
    originalUrl: rawUrl,
    normalizedUrl,
    kind: 'direct_video',
    provider: 'direct',
    detectedType: 'video',
  };
}

export function parseAudioFilenameMetadata(fileName: string): { title: string; artist: string } {
  const withoutExt = String(fileName || 'Musiqa')
    .replace(/\.[^.]+$/, '')
    .replace(/_/g, ' ')
    .trim();
  const dashParts = withoutExt.split(/\s+[-–—]\s+/);
  if (dashParts.length >= 2) {
    return {
      artist: dashParts[0].trim(),
      title: dashParts.slice(1).join(' - ').trim(),
    };
  }
  return {
    title: withoutExt || 'Musiqiy trek',
    artist: '',
  };
}
