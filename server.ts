import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import helmet from 'helmet';
import { GoogleGenAI, Type } from '@google/genai';
import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';
import {
  validateExternalVideoUrl,
  inferVideoFileExtension,
  extractVideoUrlsFromHtml,
  isHlsStreamUrl,
  extractTwitterStatusPath,
  extractInstagramShortcode,
  inferAudioFileExtension,
  buildFfmpegMp3Args,
  deriveAudioMetadataFromUrl,
} from './src/utils/videoImport';
import { parseMediaLink } from './src/utils/mediaLinks';
import {
  buildTelegramDisplayName,
  isPlaceholderAvatar,
  isPlaceholderOrUsername,
  normalizeTelegramHandle,
  pickPreferredAvatar
} from './src/utils/telegramProfile';
import {
  MESSAGE_COIN_COST,
  MESSAGE_DIAMOND_REWARD,
  ADMIN_FULL_COINS,
  ADMIN_FULL_DIAMONDS,
  isAdminTelegramUser,
  canChargeForMessage,
  applyDiamondProgress,
  releaseMatureDiamondBatches,
  getPendingDiamondsTotal,
  calculateDiamondsToUzs,
  calculateCallMinuteBilling,
  buildUserWalletSnapshot
} from './src/utils/tokenomics';
import { walletRepository } from './server/walletRepository';
import { PresenceRegistry } from './src/utils/presence';
import { telegramInputMatchesBotRecord } from './src/utils/profileLookup';
import {
  togglePostLike,
  appendPostComment,
  computeAuthorTotalLikes,
  isPostVisibleToViewer,
  type PostItem,
  type PostComment
} from './src/utils/posts';
import { formatPhoneNumberPretty } from './src/utils/phone';
import {
  buildCoinPurchaseRequest,
  canReviewCoinRequest,
  type CoinPurchaseRequest,
} from './src/utils/coinRequests';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  await walletRepository.init();
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '15mb' }));

  // Security headers via Helmet (HSTS, CSP, clickjacking protection compatible with preview & production)
  app.use(
    helmet({
      strictTransportSecurity: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'https://telegram.org',
            'https://*.firebaseapp.com',
            'https://apis.google.com',
            'https://www.googletagmanager.com',
            'blob:',
          ],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
          mediaSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
          connectSrc: ["'self'", 'ws:', 'wss:', 'https:', 'http:', 'blob:'],
          frameSrc: [
            "'self'",
            'https://www.youtube.com',
            'https://www.youtube-nocookie.com',
            'https://www.tiktok.com',
            'https://www.instagram.com',
            'https://player.vimeo.com',
            'https://www.dailymotion.com',
            'https://www.facebook.com',
            'https://t.me',
            'https://vk.com',
            'https://rutube.ru',
            'https://w.soundcloud.com',
            'https://open.spotify.com',
            'https://*.firebaseapp.com',
            'https://oauth.telegram.org',
          ],
          frameAncestors: [
            "'self'",
            'https://aistudio.google.com',
            'https://*.google.com',
            'https://*.googleusercontent.com',
            'https://*.run.app',
            'https://web.telegram.org',
            'https://*.telegram.org',
          ],
          workerSrc: ["'self'", 'blob:'],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      xFrameOptions: false,
    })
  );

  // Enforce X-Frame-Options: SAMEORIGIN on production domains while keeping AI Studio preview iframe functional
  app.use((req, res, next) => {
    const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    const referer = String(req.headers.referer || '');
    const isAiStudioPreview =
      forwardedHost.includes('.run.app') ||
      referer.includes('aistudio.google.com') ||
      referer.includes('googleusercontent.com');
    if (!isAiStudioPreview) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }
    next();
  });

  // Dynamic CORS & Cross-Origin support for Render and local deployments
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Initialize Gemini AI SDK
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  const ai = new GoogleGenAI({ 
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Agora Token Generator API Endpoint
  app.post('/api/agora/get-token', (req, res) => {
    try {
      const { channelName, uid, role } = req.body;
      if (!channelName || !uid) {
        return res.status(400).json({ error: 'channelName and uid are required' });
      }

      const appId = process.env.AGORA_APP_ID || '84594bff74b0488c8373eb48e409fe45';
      const mockToken = `AGORA_TOKEN_${Buffer.from(`${appId}:${channelName}:${uid}`).toString('base64')}`;

      res.json({
        success: true,
        appId,
        channelName,
        uid,
        token: mockToken,
        expiresIn: 86400, // 24 hours
        rtmToken: `RTM_TOKEN_${uid}`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to generate token' });
    }
  });

  // Google Meet Link Generator API
  app.post('/api/meet/create-link', (req, res) => {
    try {
      const { title = 'Alov.uz Video Qo\'ng\'iroq' } = req.body;
      const randomCode = Math.random().toString(36).substring(2, 5) + '-' + Math.random().toString(36).substring(2, 6) + '-' + Math.random().toString(36).substring(2, 5);
      const meetUrl = `https://meet.google.com/${randomCode}`;
      
      res.json({
        success: true,
        meetUrl,
        title,
        createdAt: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create Meet link' });
    }
  });

  // --- Persistent Storage Directory (Supports Render Persistent Disk via DATA_DIR / RENDER_DISK_PATH) ---
  const DATA_DIR = path.resolve(process.env.DATA_DIR || process.env.RENDER_DISK_PATH || __dirname);
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const resolveDataFile = (fileName: string) => {
    const dest = path.join(DATA_DIR, fileName);
    if (DATA_DIR !== __dirname && !fs.existsSync(dest)) {
      const seed = path.join(__dirname, fileName);
      if (fs.existsSync(seed)) {
        try {
          fs.copyFileSync(seed, dest);
        } catch {}
      }
    }
    return dest;
  };

  // --- Telegram Bot Integration (@alovuz_bot) ---
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9094192316:AAFW5DEfuwVy0Rs2kIdMg9kBwL_w_PLMVM4';
  const BOT_USERS_FILE = resolveDataFile('telegram_bot_users.json');
  const TG_AVATARS_DIR = path.join(DATA_DIR, 'telegram_avatars');
  const FACE_ID_DIR = path.join(DATA_DIR, 'face_id_photos');
  const MEDIA_UPLOADS_DIR = path.join(DATA_DIR, 'media_uploads');
  if (!fs.existsSync(TG_AVATARS_DIR)) {
    fs.mkdirSync(TG_AVATARS_DIR, { recursive: true });
  }
  if (!fs.existsSync(FACE_ID_DIR)) {
    fs.mkdirSync(FACE_ID_DIR, { recursive: true });
  }
  if (!fs.existsSync(MEDIA_UPLOADS_DIR)) {
    fs.mkdirSync(MEDIA_UPLOADS_DIR, { recursive: true });
  }

  app.get('/api/face-id/photo/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename || '').replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safeName) return res.status(400).send('Invalid file name');
    const filePath = path.join(FACE_ID_DIR, safeName);
    if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath);
  });

  // Upload media (image, video, audio, banner) from raw binary or base64 DataURL
  function inferMediaExt(mime: string = '', fileName: string = ''): string {
    const lowerMime = mime.toLowerCase();
    const extFromName = path.extname(fileName || '').replace(/[^a-zA-Z0-9.]/g, '').toLowerCase();
    if (extFromName && ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg', '.m4a'].includes(extFromName)) {
      return extFromName;
    }
    if (lowerMime.includes('svg')) return '.svg';
    if (lowerMime.includes('png')) return '.png';
    if (lowerMime.includes('webp')) return '.webp';
    if (lowerMime.includes('gif')) return '.gif';
    if (lowerMime.includes('mp4')) return '.mp4';
    if (lowerMime.includes('quicktime')) return '.mov';
    if (lowerMime.includes('video/webm')) return '.webm';
    if (lowerMime.includes('mpeg') || lowerMime.includes('mp3')) return '.mp3';
    if (lowerMime.includes('wav')) return '.wav';
    if (lowerMime.includes('ogg')) return '.ogg';
    if (lowerMime.includes('m4a') || lowerMime.includes('mp4a')) return '.m4a';
    if (lowerMime.includes('audio/webm')) return '.webm';
    return '.jpg';
  }

  app.post('/api/media/upload-raw', express.raw({ type: '*/*', limit: '35mb' }), async (req, res) => {
    try {
      const buf = req.body as Buffer;
      if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ success: false, error: 'Fayl bo\'sh' });
      }
      const mimeType = String(req.headers['content-type'] || 'application/octet-stream');
      const originalName = String(req.headers['x-file-name'] || 'upload');
      const ext = inferMediaExt(mimeType, originalName);
      const storedName = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      const destPath = path.join(MEDIA_UPLOADS_DIR, storedName);
      fs.writeFileSync(destPath, buf);
      const isVideoUpload = mimeType.toLowerCase().startsWith('video/') || ['.mp4', '.webm', '.mov', '.m4v'].includes(ext);
      const isVertical = isVideoUpload ? await probeIsVerticalVideo(destPath) : false;
      return res.json({ success: true, url: `/api/media/${storedName}`, mimeType, isVertical });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/media/upload', (req, res) => {
    try {
      const { dataUrl, fileName = 'upload', mimeType = '' } = req.body || {};
      if (!dataUrl || typeof dataUrl !== 'string') {
        return res.status(400).json({ success: false, error: 'Media ma\'lumoti topilmadi' });
      }
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ success: false, error: 'Media formati noto\'g\'ri' });
      }
      const detectedMime = mimeType || match[1];
      const ext = inferMediaExt(detectedMime, fileName);
      const storedName = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      const destPath = path.join(MEDIA_UPLOADS_DIR, storedName);
      fs.writeFileSync(destPath, Buffer.from(match[2], 'base64'));
      return res.json({ success: true, url: `/api/media/${storedName}`, mimeType: detectedMime });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/media/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename || '').replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safeName) return res.status(400).send('Invalid file name');
    const filePath = path.join(MEDIA_UPLOADS_DIR, safeName);
    if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
    const ext = path.extname(safeName).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.m4v': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      stream.pipe(res);
      return;
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (req.query.download === '1') {
      const requestedName = String(req.query.filename || safeName)
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 80);
      res.setHeader('Content-Disposition', `attachment; filename="${requestedName || safeName}"`);
    }
    res.sendFile(filePath);
  });

  // Download external video link directly as MP4 (or native .webm/.mov/.m4v) into MEDIA_UPLOADS_DIR
  const execFileAsync = promisify(execFile);
  const MAX_REMOTE_VIDEO_BYTES = 80 * 1024 * 1024;
  const VIDEO_BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: '*/*',
  };

  async function probeIsVerticalVideo(filePath: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(
        'ffprobe',
        [
          '-v', 'error',
          '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height:stream_tags=rotate:side_data_list=',
          '-of', 'json',
          filePath,
        ],
        { timeout: 6000 }
      );
      const parsed = JSON.parse(stdout || '{}');
      const stream = parsed?.streams?.[0];
      if (!stream) return false;
      let width = Number(stream.width || 0);
      let height = Number(stream.height || 0);
      if (!width || !height) return false;

      let rotation = Number(stream?.tags?.rotate || 0);
      if (!rotation && Array.isArray(stream?.side_data_list)) {
        for (const sd of stream.side_data_list) {
          if (sd && sd.rotation !== undefined) {
            rotation = Number(sd.rotation);
            break;
          }
        }
      }
      const normRot = ((Math.round(rotation) % 360) + 360) % 360;
      if (normRot === 90 || normRot === 270) {
        const tmp = width;
        width = height;
        height = tmp;
      }
      return height > width;
    } catch {
      return false;
    }
  }

  let cachedYtDlpPath: string | null = null;
  async function ensureYtDlpBinary(): Promise<string | null> {
    if (cachedYtDlpPath && fs.existsSync(cachedYtDlpPath)) {
      return cachedYtDlpPath;
    }
    const candidatePaths = [
      path.join(__dirname, '.bin', 'yt-dlp'),
      path.join(DATA_DIR, '.bin', 'yt-dlp'),
      '/tmp/alov-yt-dlp',
      'yt-dlp',
    ];
    for (const p of candidatePaths) {
      if (p === 'yt-dlp') {
        try {
          await execFileAsync('which', ['yt-dlp'], { timeout: 3000 });
          cachedYtDlpPath = 'yt-dlp';
          return cachedYtDlpPath;
        } catch {}
      } else if (fs.existsSync(p)) {
        try {
          fs.chmodSync(p, 0o755);
          cachedYtDlpPath = p;
          return p;
        } catch {}
      }
    }

    // Auto-download standalone yt-dlp Linux binary once on demand (no Python needed)
    if (process.platform === 'linux') {
      const targetBinDir = path.join(DATA_DIR, '.bin');
      const targetBinPath = path.join(targetBinDir, 'yt-dlp');
      try {
        if (!fs.existsSync(targetBinDir)) fs.mkdirSync(targetBinDir, { recursive: true });
        const dlRes = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux', {
          redirect: 'follow',
        });
        if (dlRes.ok) {
          const buf = Buffer.from(await dlRes.arrayBuffer());
          if (buf.length > 5_000_000) {
            fs.writeFileSync(targetBinPath, buf);
            fs.chmodSync(targetBinPath, 0o755);
            cachedYtDlpPath = targetBinPath;
            return targetBinPath;
          }
        }
      } catch (e) {
        console.warn('Could not auto-provision yt-dlp binary:', (e as Error)?.message);
      }
    }
    return null;
  }

  async function downloadHlsToMp4(m3u8Url: string, refererUrl?: string): Promise<{ url: string; mimeType: string; format: string; mode: 'mp4'; isVertical: boolean } | null> {
    const check = validateExternalVideoUrl(m3u8Url, {
      allowLoopback: process.env.ALLOW_LOOPBACK_MEDIA_IMPORT === 'true',
    });
    if (!check.ok) return null;
    const storedName = `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
    const destPath = path.join(MEDIA_UPLOADS_DIR, storedName);
    try {
      const args = [
        '-y',
        '-user_agent', VIDEO_BROWSER_HEADERS['User-Agent'],
        ...(refererUrl ? ['-headers', `Referer: ${refererUrl}\r\n`] : []),
        '-i', check.url.toString(),
        '-t', '300',
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        '-movflags', '+faststart',
        '-fs', String(MAX_REMOTE_VIDEO_BYTES),
        destPath,
      ];
      await execFileAsync('ffmpeg', args, { timeout: 45000 });
      if (fs.existsSync(destPath)) {
        const stat = fs.statSync(destPath);
        if (stat.size > 1024 && stat.size <= MAX_REMOTE_VIDEO_BYTES) {
          const isVertical = await probeIsVerticalVideo(destPath);
          return { url: `/api/media/${storedName}`, mimeType: 'video/mp4', format: 'mp4', mode: 'mp4', isVertical };
        }
        fs.unlinkSync(destPath);
      }
    } catch {
      if (fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath); } catch {}
      }
    }
    return null;
  }

  async function downloadViaYtDlp(targetUrl: string): Promise<{ url: string; mimeType: string; format: string; mode: 'mp4'; isVertical: boolean } | null> {
    const bin = await ensureYtDlpBinary();
    if (!bin) return null;

    const prefix = `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const outTemplate = path.join(MEDIA_UPLOADS_DIR, `${prefix}.%(ext)s`);

    const cookiesRaw = process.env.YOUTUBE_COOKIES || process.env.YTDLP_COOKIES || '';
    let tempCookiesPath: string | null = null;
    if (cookiesRaw.trim()) {
      tempCookiesPath = path.join('/tmp', `alov_cookies_${Date.now()}.txt`);
      fs.writeFileSync(tempCookiesPath, cookiesRaw, 'utf-8');
    }

    try {
      const args = [
        '--no-playlist',
        '--no-warnings',
        '--max-filesize', '80M',
        '--js-runtimes', 'node',
        '--extractor-args', 'youtube:player_client=tv,ios,mweb',
        '-f', 'best[ext=mp4][filesize<80M]/bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        ...(tempCookiesPath ? ['--cookies', tempCookiesPath] : []),
        '-o', outTemplate,
        targetUrl,
      ];
      await execFileAsync(bin, args, { timeout: 60000, maxBuffer: 5 * 1024 * 1024 });

      const files = fs.readdirSync(MEDIA_UPLOADS_DIR).filter((f) => f.startsWith(`${prefix}.`) && !f.endsWith('.part'));
      if (files.length > 0) {
        const chosen = files[0];
        const fullPath = path.join(MEDIA_UPLOADS_DIR, chosen);
        const stat = fs.statSync(fullPath);
        if (stat.size > 1024 && stat.size <= MAX_REMOTE_VIDEO_BYTES) {
          const ext = path.extname(chosen).toLowerCase().replace('.', '') || 'mp4';
          const mime = ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';
          const isVertical = await probeIsVerticalVideo(fullPath);
          return { url: `/api/media/${chosen}`, mimeType: mime, format: ext, mode: 'mp4', isVertical };
        }
        try { fs.unlinkSync(fullPath); } catch {}
      }
    } catch (err: any) {
      // Clean partial downloads if any
      try {
        for (const f of fs.readdirSync(MEDIA_UPLOADS_DIR)) {
          if (f.startsWith(`${prefix}.`)) fs.unlinkSync(path.join(MEDIA_UPLOADS_DIR, f));
        }
      } catch {}
    } finally {
      if (tempCookiesPath && fs.existsSync(tempCookiesPath)) {
        try { fs.unlinkSync(tempCookiesPath); } catch {}
      }
    }
    return null;
  }

  async function downloadVideoStreamToDisk(videoUrl: string, refererUrl?: string): Promise<{ url: string; mimeType: string; format: string; mode: 'mp4'; isVertical: boolean } | null> {
    const check = validateExternalVideoUrl(videoUrl, {
      allowLoopback: process.env.ALLOW_LOOPBACK_MEDIA_IMPORT === 'true',
    });
    if (!check.ok) return null;

    if (isHlsStreamUrl(check.url.toString())) {
      return downloadHlsToMp4(check.url.toString(), refererUrl);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const headers: Record<string, string> = { ...VIDEO_BROWSER_HEADERS };
      if (refererUrl) headers.Referer = refererUrl;

      const response = await fetch(check.url.toString(), {
        headers,
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!response.ok) return null;

      const contentType = String(response.headers.get('content-type') || '');
      const contentLen = Number(response.headers.get('content-length') || 0);
      if (contentLen > MAX_REMOTE_VIDEO_BYTES) {
        throw new Error('Video hajmi 80 MB dan oshmasligi kerak.');
      }

      if (contentType.toLowerCase().includes('mpegurl') || isHlsStreamUrl(response.url || '')) {
        return downloadHlsToMp4(response.url || check.url.toString(), refererUrl);
      }

      const ext = inferVideoFileExtension(contentType, response.url || videoUrl);
      if (!ext) return null;

      const arrayBuf = await response.arrayBuffer();
      if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_REMOTE_VIDEO_BYTES) {
        return null;
      }

      const buf = Buffer.from(arrayBuf);
      const storedName = `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      const destPath = path.join(MEDIA_UPLOADS_DIR, storedName);
      fs.writeFileSync(destPath, buf);

      const finalMime =
        contentType && contentType.startsWith('video/')
          ? contentType.split(';')[0].trim()
          : ext === '.webm'
            ? 'video/webm'
            : ext === '.mov'
              ? 'video/quicktime'
              : 'video/mp4';

      const isVertical = await probeIsVerticalVideo(destPath);
      return {
        url: `/api/media/${storedName}`,
        mimeType: finalMime,
        format: ext.replace('.', ''),
        mode: 'mp4',
        isVertical,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  app.post('/api/media/import-video-url', async (req, res) => {
    try {
      const rawUrl = String(req.body?.url || '').trim();
      const validation = validateExternalVideoUrl(rawUrl, {
        allowLoopback: process.env.ALLOW_LOOPBACK_MEDIA_IMPORT === 'true',
      });
      if (!validation.ok) {
        return res.status(400).json({ success: false, error: validation.error });
      }

      const targetUrl = validation.url.toString();
      const parsedSocial = parseMediaLink(targetUrl, 'video');
      const replySuccess = (payload: any) =>
        res.json({
          success: true,
          ...payload,
          isVertical: Boolean(payload?.isVertical || parsedSocial.isVertical),
        });

      // 1. Direct MP4/WebM/MOV/M4V/HLS stream check
      const directResult = await downloadVideoStreamToDisk(targetUrl).catch((err) => {
        if (err?.message?.includes('80 MB')) throw err;
        return null;
      });
      if (directResult) {
        return replySuccess(directResult);
      }

      // 2. TikTok resolver (returns direct no-watermark MP4)
      if (/tiktok\.com/i.test(targetUrl)) {
        try {
          const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`, {
            headers: VIDEO_BROWSER_HEADERS,
          });
          if (tikRes.ok) {
            const tikData: any = await tikRes.json();
            const mp4Url = tikData?.data?.hdplay || tikData?.data?.play;
            if (mp4Url && typeof mp4Url === 'string') {
              const downloaded = await downloadVideoStreamToDisk(mp4Url, 'https://www.tiktok.com/');
              if (downloaded) {
                return replySuccess(downloaded);
              }
            }
          }
        } catch {}
      }

      // 3. X / Twitter resolver (api.fxtwitter.com -> MP4)
      const twitterPath = extractTwitterStatusPath(targetUrl);
      if (twitterPath) {
        try {
          const fxRes = await fetch(`https://api.fxtwitter.com/${twitterPath}`, { headers: VIDEO_BROWSER_HEADERS });
          if (fxRes.ok) {
            const fxData: any = await fxRes.json();
            const videoUrl = fxData?.tweet?.media?.videos?.[0]?.url;
            if (videoUrl && typeof videoUrl === 'string') {
              const downloaded = await downloadVideoStreamToDisk(videoUrl, 'https://x.com/');
              if (downloaded) {
                return replySuccess(downloaded);
              }
            }
          }
        } catch {}
      }

      // 4. Reddit JSON resolver -> fallback_url MP4
      if (/reddit\.com\/r\/[^/]+\/comments\//i.test(targetUrl)) {
        try {
          const cleanBase = targetUrl.split('?')[0].replace(/\/$/, '');
          const rdRes = await fetch(`${cleanBase}.json`, { headers: VIDEO_BROWSER_HEADERS });
          if (rdRes.ok) {
            const rdText = await rdRes.text();
            const candidates = extractVideoUrlsFromHtml(rdText, targetUrl);
            for (const c of candidates.slice(0, 3)) {
              const downloaded = await downloadVideoStreamToDisk(c, targetUrl).catch(() => null);
              if (downloaded) return replySuccess(downloaded);
            }
          }
        } catch {}
      }

      // 5. Instagram embed/captioned HTML extraction -> MP4
      const igShortcode = extractInstagramShortcode(targetUrl);
      if (igShortcode) {
        try {
          const igRes = await fetch(`https://www.instagram.com/p/${igShortcode}/embed/captioned/`, {
            headers: {
              ...VIDEO_BROWSER_HEADERS,
              Accept: 'text/html,application/xhtml+xml',
            },
          });
          if (igRes.ok) {
            const igHtml = await igRes.text();
            const candidates = extractVideoUrlsFromHtml(igHtml, targetUrl);
            for (const c of candidates.slice(0, 4)) {
              const saved = await downloadVideoStreamToDisk(c, 'https://www.instagram.com/').catch(() => null);
              if (saved) return replySuccess(saved);
            }
          }
        } catch {}
      }

      // 6. Telegram & General HTML extraction -> MP4 / HLS
      const htmlFetchUrl =
        /t\.me\/[^/]+\/\d+/i.test(targetUrl) && !targetUrl.includes('embed=1')
          ? `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}embed=1&mode=tme`
          : targetUrl;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const pageRes = await fetch(htmlFetchUrl, {
          headers: {
            ...VIDEO_BROWSER_HEADERS,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          redirect: 'follow',
          signal: controller.signal,
        });
        if (pageRes.ok) {
          const pageCt = String(pageRes.headers.get('content-type') || '').toLowerCase();
          if (pageCt.includes('text/html') || pageCt.includes('application/xhtml')) {
            const html = (await pageRes.text()).slice(0, 1_500_000);
            const candidates = extractVideoUrlsFromHtml(html, pageRes.url || htmlFetchUrl);
            for (const candidate of candidates.slice(0, 5)) {
              const saved = await downloadVideoStreamToDisk(candidate, targetUrl).catch(() => null);
              if (saved) {
                return replySuccess(saved);
              }
            }
          }
        }
      } catch {
        // continue to yt-dlp
      } finally {
        clearTimeout(timer);
      }

      // 7. Universal social media extractor via yt-dlp (YouTube, Instagram, Facebook, VK, Rutube, Vimeo, Dailymotion, Pinterest, Twitch, etc.)
      const ytDlpResult = await downloadViaYtDlp(targetUrl);
      if (ytDlpResult) {
        return replySuccess(ytDlpResult);
      }

      // 8. Smart chromeless social embed fallback if cloud IP bot-protection prevents server-side MP4 pull (e.g. YouTube / IG Reels / FB / VK)
      if (parsedSocial.kind === 'embed_iframe' && parsedSocial.embedUrl) {
        return replySuccess({
          mode: 'embed',
          url: parsedSocial.normalizedUrl,
          embedUrl: parsedSocial.embedUrl,
          provider: parsedSocial.provider,
          isVertical: Boolean(parsedSocial.isVertical),
        });
      }

      return res.status(422).json({
        success: false,
        error:
          "Ushbu havoladan video faylni aniqlab bo'lmadi. Iltimos, boshqa havola sinab ko'ring yoki qurilmadan video yuklang.",
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || "Videoni yuklab olishda xatolik yuz berdi.",
      });
    }
  });

  // Extract or download audio from any video/social/audio URL and save as real MP3
  async function convertLocalMediaToMp3(inputPath: string): Promise<string | null> {
    const outName = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`;
    const outPath = path.join(MEDIA_UPLOADS_DIR, outName);
    try {
      const args = buildFfmpegMp3Args(inputPath, outPath, { maxDurationSec: 600 });
      await execFileAsync('ffmpeg', args, { timeout: 60000, maxBuffer: 5 * 1024 * 1024 });
      if (fs.existsSync(outPath)) {
        const stat = fs.statSync(outPath);
        if (stat.size > 512 && stat.size <= MAX_REMOTE_VIDEO_BYTES) {
          return outName;
        }
        try { fs.unlinkSync(outPath); } catch {}
      }
    } catch {
      if (fs.existsSync(outPath)) {
        try { fs.unlinkSync(outPath); } catch {}
      }
    }
    return null;
  }

  async function downloadAudioStreamAsMp3(
    sourceUrl: string,
    refererUrl?: string
  ): Promise<{ url: string; mimeType: 'audio/mpeg'; format: 'mp3'; title?: string; artist?: string; sizeBytes?: number } | null> {
    const check = validateExternalVideoUrl(sourceUrl, {
      allowLoopback: process.env.ALLOW_LOOPBACK_MEDIA_IMPORT === 'true',
    });
    if (!check.ok) return null;
    const normalized = check.url.toString();

    if (isHlsStreamUrl(normalized)) {
      const outName = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`;
      const outPath = path.join(MEDIA_UPLOADS_DIR, outName);
      try {
        const args = buildFfmpegMp3Args(normalized, outPath, {
          maxDurationSec: 600,
          userAgent: VIDEO_BROWSER_HEADERS['User-Agent'],
          refererUrl,
        });
        await execFileAsync('ffmpeg', args, { timeout: 60000 });
        if (fs.existsSync(outPath) && fs.statSync(outPath).size > 512) {
          const stat = fs.statSync(outPath);
          const meta = deriveAudioMetadataFromUrl(normalized);
          return {
            url: `/api/media/${outName}`,
            mimeType: 'audio/mpeg',
            format: 'mp3',
            sizeBytes: stat.size,
            ...meta,
          };
        }
      } catch {
        if (fs.existsSync(outPath)) {
          try { fs.unlinkSync(outPath); } catch {}
        }
      }
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      const headers: Record<string, string> = { ...VIDEO_BROWSER_HEADERS };
      if (refererUrl) headers.Referer = refererUrl;

      const response = await fetch(normalized, {
        headers,
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!response.ok) return null;

      const contentType = String(response.headers.get('content-type') || '');
      const contentLen = Number(response.headers.get('content-length') || 0);
      if (contentLen > MAX_REMOTE_VIDEO_BYTES) {
        throw new Error('Media hajmi 80 MB dan oshmasligi kerak.');
      }
      const finalUrl = response.url || normalized;

      if (contentType.toLowerCase().includes('mpegurl') || isHlsStreamUrl(finalUrl)) {
        return downloadAudioStreamAsMp3(finalUrl, refererUrl);
      }

      const audioExt = inferAudioFileExtension(contentType, finalUrl);
      const videoExt = audioExt ? null : inferVideoFileExtension(contentType, finalUrl);
      if (!audioExt && !videoExt) return null;

      const arrayBuf = await response.arrayBuffer();
      if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_REMOTE_VIDEO_BYTES) {
        return null;
      }

      const buf = Buffer.from(arrayBuf);
      const meta = deriveAudioMetadataFromUrl(finalUrl);

      if (audioExt === '.mp3' && buf.length > 256) {
        const storedName = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`;
        const destPath = path.join(MEDIA_UPLOADS_DIR, storedName);
        fs.writeFileSync(destPath, buf);
        return {
          url: `/api/media/${storedName}`,
          mimeType: 'audio/mpeg',
          format: 'mp3',
          sizeBytes: buf.length,
          ...meta,
        };
      }

      const tempExt = audioExt || videoExt || '.mp4';
      const tempName = `tmp_av_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${tempExt}`;
      const tempPath = path.join(MEDIA_UPLOADS_DIR, tempName);
      fs.writeFileSync(tempPath, buf);
      try {
        const mp3FileName = await convertLocalMediaToMp3(tempPath);
        if (!mp3FileName) return null;
        const mp3Stat = fs.statSync(path.join(MEDIA_UPLOADS_DIR, mp3FileName));
        return {
          url: `/api/media/${mp3FileName}`,
          mimeType: 'audio/mpeg',
          format: 'mp3',
          sizeBytes: mp3Stat.size,
          ...meta,
        };
      } finally {
        if (fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch {}
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async function downloadAudioViaYtDlp(targetUrl: string): Promise<{ url: string; mimeType: 'audio/mpeg'; format: 'mp3'; title?: string; artist?: string; sizeBytes?: number } | null> {
    const bin = await ensureYtDlpBinary();
    if (!bin) return null;

    const prefix = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const outTemplate = path.join(MEDIA_UPLOADS_DIR, `${prefix}.%(ext)s`);

    const cookiesRaw = process.env.YOUTUBE_COOKIES || process.env.YTDLP_COOKIES || '';
    let tempCookiesPath: string | null = null;
    if (cookiesRaw.trim()) {
      tempCookiesPath = path.join('/tmp', `alov_cookies_${Date.now()}.txt`);
      fs.writeFileSync(tempCookiesPath, cookiesRaw, 'utf-8');
    }

    try {
      const args = [
        '--no-playlist',
        '--no-warnings',
        '--max-filesize', '80M',
        '--js-runtimes', 'node',
        '--extractor-args', 'youtube:player_client=tv,ios,mweb',
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '192K',
        '--print', 'after_move:%(title)s|||%(uploader)s',
        ...(tempCookiesPath ? ['--cookies', tempCookiesPath] : []),
        '-o', outTemplate,
        targetUrl,
      ];
      const { stdout } = await execFileAsync(bin, args, { timeout: 65000, maxBuffer: 5 * 1024 * 1024 });
      const metaLine = String(stdout || '').trim().split('\n').filter(Boolean).pop() || '';
      const [rawTitle, rawUploader] = metaLine.includes('|||') ? metaLine.split('|||') : ['', ''];

      const files = fs.readdirSync(MEDIA_UPLOADS_DIR).filter((f) => f.startsWith(`${prefix}.`) && !f.endsWith('.part'));
      const mp3File = files.find((f) => f.toLowerCase().endsWith('.mp3')) || files[0];
      if (mp3File) {
        const fullPath = path.join(MEDIA_UPLOADS_DIR, mp3File);
        const stat = fs.statSync(fullPath);
        if (stat.size > 512 && stat.size <= MAX_REMOTE_VIDEO_BYTES) {
          if (!mp3File.toLowerCase().endsWith('.mp3')) {
            const converted = await convertLocalMediaToMp3(fullPath);
            try { fs.unlinkSync(fullPath); } catch {}
            if (!converted) return null;
            const cStat = fs.statSync(path.join(MEDIA_UPLOADS_DIR, converted));
            return {
              url: `/api/media/${converted}`,
              mimeType: 'audio/mpeg',
              format: 'mp3',
              sizeBytes: cStat.size,
              title: rawTitle?.trim() || deriveAudioMetadataFromUrl(targetUrl).title,
              artist: rawUploader?.trim() || 'Alov.uz Audio',
            };
          }
          return {
            url: `/api/media/${mp3File}`,
            mimeType: 'audio/mpeg',
            format: 'mp3',
            sizeBytes: stat.size,
            title: rawTitle?.trim() || deriveAudioMetadataFromUrl(targetUrl).title,
            artist: rawUploader?.trim() || 'Alov.uz Audio',
          };
        }
        try { fs.unlinkSync(fullPath); } catch {}
      }
    } catch {
      try {
        for (const f of fs.readdirSync(MEDIA_UPLOADS_DIR)) {
          if (f.startsWith(`${prefix}.`)) fs.unlinkSync(path.join(MEDIA_UPLOADS_DIR, f));
        }
      } catch {}
    } finally {
      if (tempCookiesPath && fs.existsSync(tempCookiesPath)) {
        try { fs.unlinkSync(tempCookiesPath); } catch {}
      }
    }
    return null;
  }

  app.post('/api/media/import-audio-url', async (req, res) => {
    try {
      const rawUrl = String(req.body?.url || '').trim();
      const validation = validateExternalVideoUrl(rawUrl, {
        allowLoopback: process.env.ALLOW_LOOPBACK_MEDIA_IMPORT === 'true',
      });
      if (!validation.ok) {
        return res.status(400).json({ success: false, error: validation.error });
      }

      const targetUrl = validation.url.toString();
      const parsedSocial = parseMediaLink(targetUrl, 'music');

      const replyMp3 = (payload: any) =>
        res.json({
          success: true,
          mode: 'mp3',
          mimeType: 'audio/mpeg',
          format: 'mp3',
          ...payload,
        });

      // 1. Direct video (.mp4/.webm/.mov/.m3u8) or audio (.mp3/.m4a/.wav/.ogg) stream -> convert/save as .mp3
      const directAudio = await downloadAudioStreamAsMp3(targetUrl).catch((err) => {
        if (err?.message?.includes('80 MB')) throw err;
        return null;
      });
      if (directAudio) {
        return replyMp3(directAudio);
      }

      // 2. TikTok audio / video -> MP3
      if (/tiktok\.com/i.test(targetUrl)) {
        try {
          const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`, {
            headers: VIDEO_BROWSER_HEADERS,
          });
          if (tikRes.ok) {
            const tikData: any = await tikRes.json();
            const tikTitle = tikData?.data?.music_info?.title || tikData?.data?.title;
            const tikArtist = tikData?.data?.music_info?.author || tikData?.data?.author?.nickname;
            const candidates = [tikData?.data?.music, tikData?.data?.hdplay, tikData?.data?.play].filter(
              (u) => typeof u === 'string' && u.length > 0
            );
            for (const c of candidates) {
              const converted = await downloadAudioStreamAsMp3(c, 'https://www.tiktok.com/').catch(() => null);
              if (converted) {
                return replyMp3({
                  ...converted,
                  title: tikTitle || converted.title,
                  artist: tikArtist || converted.artist,
                });
              }
            }
          }
        } catch {}
      }

      // 3. X / Twitter video -> MP3
      const twitterPath = extractTwitterStatusPath(targetUrl);
      if (twitterPath) {
        try {
          const fxRes = await fetch(`https://api.fxtwitter.com/${twitterPath}`, { headers: VIDEO_BROWSER_HEADERS });
          if (fxRes.ok) {
            const fxData: any = await fxRes.json();
            const videoUrl = fxData?.tweet?.media?.videos?.[0]?.url;
            if (videoUrl && typeof videoUrl === 'string') {
              const converted = await downloadAudioStreamAsMp3(videoUrl, 'https://x.com/');
              if (converted) {
                return replyMp3({
                  ...converted,
                  artist: fxData?.tweet?.author?.name || converted.artist,
                });
              }
            }
          }
        } catch {}
      }

      // 4. Reddit video -> MP3
      if (/reddit\.com\/r\/[^/]+\/comments\//i.test(targetUrl)) {
        try {
          const cleanBase = targetUrl.split('?')[0].replace(/\/$/, '');
          const rdRes = await fetch(`${cleanBase}.json`, { headers: VIDEO_BROWSER_HEADERS });
          if (rdRes.ok) {
            const rdText = await rdRes.text();
            const candidates = extractVideoUrlsFromHtml(rdText, targetUrl);
            for (const c of candidates.slice(0, 3)) {
              const converted = await downloadAudioStreamAsMp3(c, targetUrl).catch(() => null);
              if (converted) return replyMp3(converted);
            }
          }
        } catch {}
      }

      // 5. Instagram Reels / Posts video -> MP3
      const igShortcode = extractInstagramShortcode(targetUrl);
      if (igShortcode) {
        try {
          const igRes = await fetch(`https://www.instagram.com/p/${igShortcode}/embed/captioned/`, {
            headers: {
              ...VIDEO_BROWSER_HEADERS,
              Accept: 'text/html,application/xhtml+xml',
            },
          });
          if (igRes.ok) {
            const igHtml = await igRes.text();
            const candidates = extractVideoUrlsFromHtml(igHtml, targetUrl);
            for (const c of candidates.slice(0, 4)) {
              const converted = await downloadAudioStreamAsMp3(c, 'https://www.instagram.com/').catch(() => null);
              if (converted) return replyMp3(converted);
            }
          }
        } catch {}
      }

      // 6. Telegram & General HTML page -> extract embedded video/audio URL & convert to MP3
      const htmlFetchUrl =
        /t\.me\/[^/]+\/\d+/i.test(targetUrl) && !targetUrl.includes('embed=1')
          ? `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}embed=1&mode=tme`
          : targetUrl;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const pageRes = await fetch(htmlFetchUrl, {
          headers: {
            ...VIDEO_BROWSER_HEADERS,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          redirect: 'follow',
          signal: controller.signal,
        });
        if (pageRes.ok) {
          const pageCt = String(pageRes.headers.get('content-type') || '').toLowerCase();
          if (pageCt.includes('text/html') || pageCt.includes('application/xhtml')) {
            const html = (await pageRes.text()).slice(0, 1_500_000);
            const candidates = extractVideoUrlsFromHtml(html, pageRes.url || htmlFetchUrl);
            for (const candidate of candidates.slice(0, 5)) {
              const converted = await downloadAudioStreamAsMp3(candidate, targetUrl).catch(() => null);
              if (converted) return replyMp3(converted);
            }
          }
        }
      } catch {
        // continue to yt-dlp
      } finally {
        clearTimeout(timer);
      }

      // 7. Universal social audio extractor via yt-dlp -> MP3
      const ytAudio = await downloadAudioViaYtDlp(targetUrl);
      if (ytAudio) {
        return replyMp3(ytAudio);
      }

      // 8. SoundCloud / Spotify embed fallback only if server download is blocked
      if (parsedSocial.kind === 'embed_iframe' && parsedSocial.embedUrl && (parsedSocial.provider === 'soundcloud' || parsedSocial.provider === 'spotify')) {
        return res.json({
          success: true,
          mode: 'embed',
          url: parsedSocial.normalizedUrl,
          embedUrl: parsedSocial.embedUrl,
          provider: parsedSocial.provider,
        });
      }

      return res.status(422).json({
        success: false,
        error:
          "Ushbu havoladan video/audio faylni MP3 formatida ajratib bo'lmadi. To'g'ridan-to'g'ri video/audio havola kiriting yoki qurilmadan fayl yuklang.",
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || "Havolani MP3 formatiga aylantirishda xatolik yuz berdi.",
      });
    }
  });

  function generatePresetWav(freq: number = 440, durationSec: number = 5): Buffer {
    const sampleRate = 22050;
    const numSamples = Math.floor(sampleRate * durationSec);
    const dataSize = numSamples * 2;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const wave =
        Math.sin(2 * Math.PI * freq * t) * 0.45 +
        Math.sin(2 * Math.PI * (freq * 1.25) * t) * 0.3 +
        Math.sin(2 * Math.PI * (freq * 1.5) * t) * 0.25;
      const env = Math.sin((Math.PI * i) / numSamples);
      const sample = Math.max(-1, Math.min(1, wave * env)) * 32767 * 0.6;
      buffer.writeInt16LE(Math.floor(sample), 44 + i * 2);
    }
    return buffer;
  }

  const PRESET_FREQ_MAP: Record<string, number> = {
    toshkent_oqshomi: 440,
    bahor_nafasi: 523.25,
    samarqand_yulduzlari: 392,
    samimiy_hislar: 349.23,
    tungi_sayr: 329.63,
    yor_yor_melody: 587.33,
  };

  app.get('/api/media/preset-audio/:id', (req, res) => {
    const trackId = String(req.params.id || '').toLowerCase();
    const freq = PRESET_FREQ_MAP[trackId] || 440;
    const wav = generatePresetWav(freq, 6);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', wav.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(wav);
  });

  interface TelegramBotUser {
    chatId: number;
    username?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    updatedAt: number;
  }

  // Persistent storage for Telegram bot users so /start is remembered permanently across restarts
  function loadTelegramBotUsers(): Map<string, TelegramBotUser> {
    const map = new Map<string, TelegramBotUser>();
    try {
      if (fs.existsSync(BOT_USERS_FILE)) {
        const raw = fs.readFileSync(BOT_USERS_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          for (const [key, val] of Object.entries(data)) {
            if (val && typeof val === 'object' && (val as any).chatId) {
              const entry = val as TelegramBotUser;
              if (entry.avatar && isPlaceholderAvatar(entry.avatar)) {
                delete entry.avatar;
              }
              map.set(key, entry);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Could not load BOT_USERS_FILE:", err);
    }
    return map;
  }

  function saveTelegramBotUsers(map: Map<string, any>) {
    try {
      const obj: Record<string, any> = {};
      for (const [k, v] of map.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(BOT_USERS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.warn("Could not save BOT_USERS_FILE:", err);
    }
  }

  const telegramBotUsers = loadTelegramBotUsers();

  async function fetchTelegramChatDetails(chatIdOrHandle: number | string): Promise<{
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photoFileId?: string;
  } | null> {
    if (!TELEGRAM_BOT_TOKEN) return null;
    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${encodeURIComponent(String(chatIdOrHandle))}`);
      const data = await res.json();
      if (data.ok && data.result) {
        return {
          id: data.result.id,
          first_name: data.result.first_name || '',
          last_name: data.result.last_name || '',
          username: data.result.username || '',
          photoFileId: data.result.photo?.big_file_id || data.result.photo?.small_file_id || undefined,
        };
      }
    } catch (e) {}
    return null;
  }

  async function downloadTelegramFileToDisk(chatId: number, fileId: string): Promise<string | undefined> {
    if (!TELEGRAM_BOT_TOKEN || !fileId) return undefined;
    try {
      const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
      const fileData = await fileRes.json();
      if (!fileData.ok || !fileData.result?.file_path) return undefined;

      const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
      const imgRes = await fetch(fileUrl);
      if (!imgRes.ok) return undefined;

      const arrayBuf = await imgRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      if (buffer.length > 0) {
        const destPath = path.join(TG_AVATARS_DIR, `${chatId}.jpg`);
        fs.writeFileSync(destPath, buffer);
        return `/api/telegram/avatar/${chatId}?v=${Date.now()}`;
      }
    } catch (e) {}
    return undefined;
  }

  async function getTelegramPhoto(chatId: number, fallbackFileId?: string): Promise<string | undefined> {
    if (!TELEGRAM_BOT_TOKEN || !chatId) return undefined;
    try {
      // 1. Primary: getUserProfilePhotos (as recommended by Telegram Bot API)
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUserProfilePhotos?user_id=${chatId}&limit=1`);
      const data = await res.json();
      if (data.ok && data.result && Array.isArray(data.result.photos) && data.result.photos.length > 0) {
        const photos = data.result.photos[0];
        const photo = photos[photos.length - 1];
        if (photo?.file_id) {
          const cachedUrl = await downloadTelegramFileToDisk(chatId, photo.file_id);
          if (cachedUrl) return cachedUrl;
        }
      }

      // 2. Fallback: getChat result.photo.big_file_id
      let chatFileId = fallbackFileId;
      if (!chatFileId) {
        const chatInfo = await fetchTelegramChatDetails(chatId);
        chatFileId = chatInfo?.photoFileId;
      }
      if (chatFileId) {
        const cachedUrl = await downloadTelegramFileToDisk(chatId, chatFileId);
        if (cachedUrl) return cachedUrl;
      }
    } catch (e) {}

    // 3. Fallback if already cached on disk
    const existingDiskFile = path.join(TG_AVATARS_DIR, `${chatId}.jpg`);
    if (fs.existsSync(existingDiskFile)) {
      return `/api/telegram/avatar/${chatId}`;
    }
    return undefined;
  }

  function findStoredBotUser(chatId?: number, rawInput?: string, cleanUsername?: string, cleanPhone?: string): TelegramBotUser | undefined {
    if (chatId) {
      const byId = telegramBotUsers.get(String(chatId));
      if (byId) return byId;
      for (const entry of telegramBotUsers.values()) {
        if (entry && entry.chatId === chatId) return entry;
      }
    }
    const candidates = [
      rawInput,
      cleanUsername,
      cleanUsername ? `@${cleanUsername}` : '',
      cleanUsername ? `https://t.me/${cleanUsername}` : '',
      cleanPhone,
      cleanPhone ? `+${cleanPhone}` : '',
      cleanPhone && cleanPhone.length === 9 ? `998${cleanPhone}` : '',
      cleanPhone && cleanPhone.length === 9 ? `+998${cleanPhone}` : '',
      cleanPhone && cleanPhone.startsWith('998') && cleanPhone.length === 12 ? cleanPhone.slice(3) : '',
    ].filter(Boolean) as string[];

    for (const key of candidates) {
      const hit = telegramBotUsers.get(key);
      if (hit) return hit;
    }

    for (const entry of telegramBotUsers.values()) {
      if (!entry || !entry.chatId) continue;
      if (cleanUsername && entry.username && entry.username.toLowerCase() === cleanUsername) {
        return entry;
      }
      if (cleanPhone && cleanPhone.length >= 7 && entry.phone && (
        entry.phone === cleanPhone ||
        entry.phone.endsWith(cleanPhone.slice(-9)) ||
        cleanPhone.endsWith(entry.phone.slice(-9))
      )) {
        return entry;
      }
    }
    return undefined;
  }

  async function registerBotUser(chatId: number, user?: any, contactPhone?: string, extraHint?: string): Promise<TelegramBotUser> {
    const existingEntry = findStoredBotUser(chatId);
    const username = normalizeTelegramHandle(user?.username || existingEntry?.username || '');
    const phone = (contactPhone || user?.phone_number || existingEntry?.phone || '').replace(/\D/g, '');

    const incomingFirst = (user?.first_name || user?.firstName || user?.name || '').trim();
    const incomingLast = user?.last_name !== undefined ? String(user.last_name).trim() : (user?.lastName !== undefined ? String(user.lastName).trim() : undefined);

    const validIncomingFirst = !isPlaceholderOrUsername(incomingFirst, username, phone) ? incomingFirst : '';
    const validExistingFirst = !isPlaceholderOrUsername(existingEntry?.firstName, username, phone) ? (existingEntry?.firstName || '') : '';

    let firstName = validIncomingFirst || validExistingFirst;
    let lastName = incomingLast !== undefined
      ? (!isPlaceholderOrUsername(incomingLast, username, phone) ? incomingLast : '')
      : (existingEntry?.lastName || '');
    let finalUsername = username;
    let chatPhotoFileId: string | undefined;

    // If first_name is missing or we haven't pulled fresh profile details, ask Telegram getChat
    if (!firstName && TELEGRAM_BOT_TOKEN && chatId) {
      const chatDetails = await fetchTelegramChatDetails(chatId);
      if (chatDetails) {
        if (chatDetails.first_name && !isPlaceholderOrUsername(chatDetails.first_name, chatDetails.username || finalUsername, phone)) {
          firstName = chatDetails.first_name.trim();
        }
        if (chatDetails.last_name && !lastName) {
          lastName = chatDetails.last_name.trim();
        }
        if (chatDetails.username && !finalUsername) {
          finalUsername = normalizeTelegramHandle(chatDetails.username);
        }
        chatPhotoFileId = chatDetails.photoFileId;
      }
    }

    let avatarUrl = pickPreferredAvatar(user?.avatar, user?.photo_url, existingEntry?.avatar);
    if (!avatarUrl || avatarUrl.startsWith('https://api.telegram.org/file/')) {
      const fetchedPhoto = await getTelegramPhoto(chatId, chatPhotoFileId);
      if (fetchedPhoto) {
        avatarUrl = fetchedPhoto;
      }
    }

    const record: TelegramBotUser = {
      chatId,
      username: finalUsername || undefined,
      phone: phone || undefined,
      firstName,
      lastName,
      avatar: avatarUrl || undefined,
      updatedAt: Date.now()
    };

    if (finalUsername) {
      telegramBotUsers.set(finalUsername, record);
      telegramBotUsers.set(`@${finalUsername}`, record);
      telegramBotUsers.set(`https://t.me/${finalUsername}`, record);
    }
    if (phone) {
      telegramBotUsers.set(phone, record);
      telegramBotUsers.set(`+${phone}`, record);
      if (phone.length === 9) {
        telegramBotUsers.set(`998${phone}`, record);
        telegramBotUsers.set(`+998${phone}`, record);
      }
      if (phone.startsWith('998') && phone.length === 12) {
        telegramBotUsers.set(phone.slice(3), record);
      }
    }
    if (extraHint) {
      const cleanHint = normalizeTelegramHandle(extraHint);
      const cleanHintPhone = extraHint.replace(/\D/g, '');
      if (cleanHint) {
        telegramBotUsers.set(cleanHint, record);
        telegramBotUsers.set(`@${cleanHint}`, record);
        telegramBotUsers.set(`https://t.me/${cleanHint}`, record);
      }
      if (cleanHintPhone && cleanHintPhone.length >= 7) {
        telegramBotUsers.set(cleanHintPhone, record);
        telegramBotUsers.set(`+${cleanHintPhone}`, record);
        if (cleanHintPhone.length === 9) {
          telegramBotUsers.set(`998${cleanHintPhone}`, record);
          telegramBotUsers.set(`+998${cleanHintPhone}`, record);
        }
        if (cleanHintPhone.startsWith('998') && cleanHintPhone.length === 12) {
          telegramBotUsers.set(cleanHintPhone.slice(3), record);
        }
      }
    }
    telegramBotUsers.set(String(chatId), record);
    saveTelegramBotUsers(telegramBotUsers);
    return record;
  }

  async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any): Promise<boolean> {
    if (!TELEGRAM_BOT_TOKEN) return false;
    try {
      // 1. Try sending with HTML formatting
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup
        })
      });
      const data = await res.json();
      if (data.ok) {
        console.log(`Telegram message sent to chatId ${chatId}`);
        return true;
      }
      console.warn(`Telegram HTML sendMessage returned error:`, data.description);

      // 2. Safe Fallback: Strip HTML tags and send as pure plain text so delivery NEVER fails
      const plainText = text.replace(/<[^>]*>/g, '');
      const fallbackRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: plainText,
          reply_markup: replyMarkup
        })
      });
      const fallbackData = await fallbackRes.json();
      if (fallbackData.ok) {
        console.log(`Telegram plain text message sent to chatId ${chatId}`);
        return true;
      }
      console.error(`Telegram fallback failed:`, fallbackData.description);
      return false;
    } catch (err) {
      console.error(`Telegram network error sending to ${chatId}:`, err);
      return false;
    }
  }

  async function initTelegramBot() {
    if (!TELEGRAM_BOT_TOKEN) return;
    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
      const data = await res.json();
      if (data.ok) {
        console.log(`Telegram Bot connected successfully: @${data.result.username}`);
      }
    } catch (err) {
      console.warn("Telegram Bot getMe warning:", err);
    }
  }

  let telegramOffset = 0;
  async function pollTelegramUpdates() {
    if (!TELEGRAM_BOT_TOKEN) return;
    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${telegramOffset}&timeout=20`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          telegramOffset = update.update_id + 1;
          const msg = update.message;
          if (msg && msg.chat) {
            const chatId = msg.chat.id;
            const text = (msg.text || '').trim();
            const user = msg.from;
            const contact = msg.contact;

            console.log(`Telegram message received: chatId=${chatId}, user=@${user?.username || user?.first_name || 'unknown'}, text="${text}"`);

            // Extract start parameters or text phone/username hints
            let extraHint = '';
            if (text.startsWith('/start')) {
              const parts = text.split(/\s+/);
              if (parts.length > 1) {
                extraHint = parts[1];
              }
            } else if (text) {
              const phoneMatch = text.match(/(?:\+?998|\b9\d)\d{7,9}\b/);
              if (phoneMatch) {
                extraHint = phoneMatch[0];
              } else if (text.startsWith('@')) {
                extraHint = text;
              }
            }

            await registerBotUser(chatId, user, contact?.phone_number, extraHint);

            if (text.startsWith('/start') || text.toLowerCase().includes('salom')) {
              // Foydalanuvchining Telegram username yoki ismini dinamik chiqarish uchun
              const rawUsername = user?.username ? `@${user.username}` : (user?.first_name || 'Foydalanuvchi');
              const safeUsername = rawUsername
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');

              const welcomeText = 
                `Assalomu alaykum, hurmatli <b>${safeUsername}</b>!\n\n` +
                `O'zbekistondagi yirik platforma <b>Alov.uz</b> rasmiy botiga xush kelibsiz! ✨\n\n` +
                `Ushbu botda ham platformamizning to'liq funksiyalaridan foydalanishingiz mumkin. 🚀\n\n` +
                `Platformadan foydalanish uchun quyidagi tugmani bosing:`;

              // Faqat Mini App ochadigan bitta asosiy tugma
              const keyboard = {
                inline_keyboard: [
                  [
                    {
                      text: "🔥 Alov.uz'ga Kirish",
                      web_app: { url: "https://alov.onrender.com/" }
                    }
                  ]
                ]
              };

              await sendTelegramMessage(chatId, welcomeText, keyboard);
            } else if (text) {
              await sendTelegramMessage(chatId, `Xabaringiz qabul qilindi! Platformadan foydalanish uchun quyidagi tugmani bosing: 💖`, {
                inline_keyboard: [
                  [{ text: "🔥 Alov.uz'ga Kirish", web_app: { url: "https://alov.onrender.com/" } }]
                ]
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("Telegram poll error:", err);
    }
    setTimeout(pollTelegramUpdates, 2000);
  }

  // Start Telegram bot immediately on server boot
  initTelegramBot();
  pollTelegramUpdates();

  app.get('/api/telegram/status', async (_req, res) => {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
      const info = await resp.json();
      res.json({ success: true, bot: info.result || null, registeredUsersCount: telegramBotUsers.size });
    } catch (err: any) {
      res.json({ success: false, error: err.message });
    }
  });

  app.get('/api/telegram/avatar/:chatId', async (req, res) => {
    try {
      const rawChatId = req.params.chatId.replace(/\D/g, '');
      if (!rawChatId) {
        return res.status(400).json({ error: 'Invalid chatId' });
      }
      const filePath = path.join(TG_AVATARS_DIR, `${rawChatId}.jpg`);
      if (!fs.existsSync(filePath)) {
        await getTelegramPhoto(Number(rawChatId));
      }
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.sendFile(filePath);
      }
      return res.status(404).json({ error: 'Avatar not found' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // --- Telegram OTP Storage & Verification Endpoints ---
  const otpStorage = new Map<string, { code: string; expiresAt: number; chatId: number; botUser?: TelegramBotUser }>();
  setInterval(() => {
    const now = Date.now();
    for (const [phone, data] of otpStorage.entries()) {
      if (now > data.expiresAt) {
        otpStorage.delete(phone);
      }
    }
  }, 120000);

  // Endpoint to send OTP via @alovuz_bot directly to user chat
  app.post('/api/auth/send-telegram-code', async (req, res) => {
    try {
      const { phoneNumber, chatId: frontendChatId } = req.body;
      if (!phoneNumber || !phoneNumber.toString().trim()) {
        return res.status(400).json({ success: false, error: 'Telegram username yoki telefon raqam kiritilishi shart' });
      }

      const rawInput = phoneNumber.toString().trim();
      const cleanUsername = normalizeTelegramHandle(rawInput);
      const cleanPhone = rawInput.replace(/\D/g, '');

      // 1. Validate optional cached chatId STRICTLY against the requested username/phone
      let matchedChatId: number | undefined;
      let botUser: TelegramBotUser | undefined = findStoredBotUser(undefined, rawInput, cleanUsername, cleanPhone);

      if (!botUser && frontendChatId && !isNaN(Number(frontendChatId))) {
        const candidateBot = findStoredBotUser(Number(frontendChatId));
        if (candidateBot && telegramInputMatchesBotRecord(candidateBot, rawInput)) {
          matchedChatId = Number(frontendChatId);
          botUser = candidateBot;
        }
      }

      // 2. Check if user is known in usersStore with a saved telegramChatId or chatId matching THIS input
      if (!botUser && !matchedChatId && typeof usersStore !== 'undefined') {
        for (const u of usersStore.values()) {
          const uTgClean = normalizeTelegramHandle(u.telegram);
          const uPhoneClean = (u.phone || '').replace(/\D/g, '');
          const savedChatId = u.telegramChatId || u.chatId;

          if (savedChatId) {
            if (
              (cleanUsername && !/^\d+$/.test(cleanUsername) && uTgClean === cleanUsername) ||
              (cleanPhone && cleanPhone.length >= 9 && uPhoneClean.length >= 9 && uPhoneClean.slice(-9) === cleanPhone.slice(-9)) ||
              (rawInput && (u.uid === rawInput || (cleanUsername && u.uid === `tg_${cleanUsername}`)))
            ) {
              matchedChatId = Number(savedChatId);
              botUser = findStoredBotUser(matchedChatId);
              break;
            }
          }
        }
      }

      // 3. Query Telegram API directly by @username if still not found
      if (!botUser && !matchedChatId && TELEGRAM_BOT_TOKEN && cleanUsername && !/^\d+$/.test(cleanUsername)) {
        const chatDetails = await fetchTelegramChatDetails(`@${cleanUsername}`);
        if (chatDetails && chatDetails.id) {
          matchedChatId = chatDetails.id;
          botUser = await registerBotUser(chatDetails.id, chatDetails, cleanPhone);
        }
      }

      // 4. Refresh real Telegram details if we matched a chatId (never alias unverified rawInput)
      const resolvedChatId = botUser?.chatId || matchedChatId;
      if (resolvedChatId) {
        botUser = await registerBotUser(
          resolvedChatId,
          {
            username: botUser?.username || (!/^\d+$/.test(cleanUsername) ? cleanUsername : undefined),
            first_name: botUser?.firstName,
            last_name: botUser?.lastName,
            avatar: botUser?.avatar,
          },
          botUser?.phone || (cleanPhone.length >= 9 ? cleanPhone : undefined)
        );
      }

      // 5. If user hasn't started the bot yet, prompt with customized deep-link
      if (!botUser) {
        const startTarget = cleanUsername || cleanPhone || '';
        const botUrl = startTarget ? `https://t.me/alovuz_bot?start=${encodeURIComponent(startTarget)}` : 'https://t.me/alovuz_bot';
        return res.json({
          success: false,
          hasStartedBot: false,
          botUrl,
          error: "Botimiz ro'yxatida topilmadingiz! Iltimos, botimizga kirib /start tugmasini bir marta bosing."
        });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 300 * 1000; // 5 mins TTL
      const otpPayload = { code, expiresAt, botUser, chatId: botUser.chatId };

      otpStorage.set(rawInput.toLowerCase(), otpPayload);
      if (cleanUsername) {
        otpStorage.set(cleanUsername, otpPayload);
        otpStorage.set(`@${cleanUsername}`, otpPayload);
        otpStorage.set(`https://t.me/${cleanUsername}`, otpPayload);
      }
      if (cleanPhone && cleanPhone.length >= 7) {
        otpStorage.set(cleanPhone, otpPayload);
        otpStorage.set(`+${cleanPhone}`, otpPayload);
      }

      // Send OTP code via @alovuz_bot
      const otpText = `🔥 <b>Alov.uz Tasdiqlash Kodi:</b> <code>${code}</code>\n\nUshbu kodni Alov.uz ilovasiga kiriting. Kodingizni hech kimga bermang! 🔒`;
      const sent = await sendTelegramMessage(botUser.chatId, otpText);

      return res.json({
        success: true,
        hasStartedBot: true,
        chatId: botUser.chatId,
        message: sent ? "Tasdiqlash kodi Telegram botimiz (@alovuz_bot) chatingizga yuborildi!" : "Tasdiqlash kodi yuborildi",
        botUrl: "https://t.me/alovuz_bot"
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/auth/verify-telegram-code', async (req, res) => {
    try {
      const { phoneNumber, code } = req.body;
      if (!phoneNumber || !code) {
        return res.status(400).json({ success: false, error: 'Ma\'lumotlar to\'liq kiritilmagan' });
      }

      const rawInput = phoneNumber.toString().trim();
      const cleanUsername = normalizeTelegramHandle(rawInput);
      const cleanPhone = rawInput.replace(/\D/g, '');

      const stored = otpStorage.get(rawInput.toLowerCase()) ||
                     otpStorage.get(rawInput) ||
                     otpStorage.get(cleanUsername) || 
                     otpStorage.get(`@${cleanUsername}`) || 
                     otpStorage.get(`https://t.me/${cleanUsername}`) || 
                     (cleanPhone ? (otpStorage.get(cleanPhone) || otpStorage.get(`+${cleanPhone}`)) : null);

      const clearOtpKeys = () => {
        otpStorage.delete(rawInput);
        otpStorage.delete(rawInput.toLowerCase());
        otpStorage.delete(cleanUsername);
        otpStorage.delete(`@${cleanUsername}`);
        otpStorage.delete(`https://t.me/${cleanUsername}`);
        if (cleanPhone) {
          otpStorage.delete(cleanPhone);
          otpStorage.delete(`+${cleanPhone}`);
        }
      };

      if (!stored) {
        return res.status(400).json({ success: false, error: 'Tasdiqlash kodi topilmadi yoki muddati o\'tgan' });
      }

      if (Date.now() > stored.expiresAt) {
        clearOtpKeys();
        return res.status(400).json({ success: false, error: 'Kod muddati tugagan (5 daqiqa)' });
      }

      if (stored.code !== code.trim()) {
        return res.status(400).json({ success: false, error: 'Kiritilgan tasdiqlash kodi noto\'g\'ri!' });
      }

      clearOtpKeys();

      const userChatId = stored.chatId || stored.botUser?.chatId;

      // Always prefer the freshest record from telegramBotUsers and enrich from Telegram API if incomplete
      let matchedBotUser: TelegramBotUser | undefined =
        findStoredBotUser(userChatId, rawInput, cleanUsername, cleanPhone) || stored.botUser;

      if (userChatId) {
        matchedBotUser = await registerBotUser(
          userChatId,
          {
            username: matchedBotUser?.username || (!/^\d+$/.test(cleanUsername) ? cleanUsername : undefined),
            first_name: matchedBotUser?.firstName,
            last_name: matchedBotUser?.lastName,
            avatar: matchedBotUser?.avatar,
          },
          cleanPhone || matchedBotUser?.phone,
          rawInput
        );
      }

      const tgHandle = matchedBotUser?.username || (!/^\d+$/.test(cleanUsername) ? cleanUsername : '');
      const formattedTgUrl = tgHandle ? `https://t.me/${tgHandle}` : undefined;

      // 2. Lookup existing user by any identifier
      let existingUser: any = null;
      
      // Match by ChatID first
      if (userChatId) {
        for (const u of usersStore.values()) {
          if (u.telegramChatId === userChatId) {
            existingUser = u;
            break;
          }
        }
      }
      
      // Match by Phone/Username
      if (!existingUser) {
        for (const u of usersStore.values()) {
          const uTgClean = normalizeTelegramHandle(u.telegram);
          const uPhoneClean = (u.phone || '').replace(/\D/g, '');
          const matchUsername = tgHandle && uTgClean === tgHandle;
          const matchPhone = cleanPhone && cleanPhone.length >= 9 && uPhoneClean.endsWith(cleanPhone.slice(-9));
          if (matchUsername || matchPhone) {
            existingUser = u;
            break;
          }
        }
      }

      const isNewUser = !existingUser || !existingUser.isProfileCompleted;
      const uid = existingUser ? existingUser.uid : `tg_${tgHandle || cleanPhone || userChatId || rawInput}`;

      let user = existingUser;

      const botFullName = buildTelegramDisplayName({
        firstName: matchedBotUser?.firstName,
        lastName: matchedBotUser?.lastName,
        username: tgHandle || cleanUsername,
        phone: matchedBotUser?.phone || cleanPhone,
      });
      const botAvatar = pickPreferredAvatar(matchedBotUser?.avatar);

      const rawPhoneForTg = cleanPhone ? `+${cleanPhone}` : (matchedBotUser?.phone ? `+${matchedBotUser.phone}` : '');
      const formattedTgPhone = rawPhoneForTg ? formatPhoneNumberPretty(rawPhoneForTg) : undefined;

      if (!user) {
        user = {
          uid,
          id: `ALOV-TG-${uid.slice(0, 5).toUpperCase()}`,
          name: botFullName,
          telegram: formattedTgUrl,
          telegramChatId: userChatId,
          phone: formattedTgPhone,
          // Keep avatar empty until Face ID captures the user's real biometric camera photo
          avatar: '',
          role: isAdminTelegramUser({ telegram: formattedTgUrl }) ? 'admin' : 'user',
          isAdmin: isAdminTelegramUser({ telegram: formattedTgUrl }),
          isVerified: isAdminTelegramUser({ telegram: formattedTgUrl }),
          age: 22,
          gender: 'female',
          region: 'Toshkent shahri',
          district: 'Yunusobod tumani',
          bio: '',
          status: 'online',
          followersCount: 0,
          followingCount: 0,
          likesCount: 0,
          followers: [],
          following: [],
          diamondProgress: 0,
          pendingDiamondBatches: [],
          isLocationEnabled: true,
          locationVisibility: 'everyone',
          location: { lat: 41.3111, lng: 69.2797 },
          isProfileCompleted: false
        };
        normalizeAndReleaseUser(user);
        usersStore.set(uid, user);
        saveUsersToDisk();
        io.emit('user_updated', user);
      } else {
        if (botFullName && isPlaceholderOrUsername(user.name, tgHandle || cleanUsername, cleanPhone)) {
          user.name = botFullName;
        } else if (isPlaceholderOrUsername(user.name, tgHandle || cleanUsername, cleanPhone)) {
          user.name = botFullName || '';
        }
        // Always prioritize Face ID photo over any Telegram profile photo
        if (user.faceId?.capturedPhotoUrl) {
          user.avatar = user.faceId.capturedPhotoUrl;
        } else if (!user.faceId?.verified && user.avatar && user.avatar.includes('api.telegram.org/file/')) {
          user.avatar = '';
        }
        if (formattedTgUrl && (!user.telegram || user.telegram.startsWith('@'))) {
          user.telegram = formattedTgUrl;
        }
        if (userChatId && !user.telegramChatId) {
          user.telegramChatId = userChatId;
        }
        if (formattedTgPhone && !user.phone) {
          user.phone = formattedTgPhone;
        }
        user.isOnline = true;
        user.status = 'online';
        normalizeAndReleaseUser(user);
        usersStore.set(user.uid, user);
        saveUsersToDisk();
        io.emit('user_updated', user);
      }

      res.json({
        success: true,
        isNewUser,
        message: 'Muvaffaqiyatli kirdingiz',
        token: `JWT_TG_${uid}_${Date.now()}`,
        user
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Universal Login Endpoint: Login by Email, @username, https://t.me/username, or Phone + Password
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { loginInput, password } = req.body;
      if (!loginInput || !loginInput.toString().trim()) {
        return res.status(400).json({ success: false, error: 'Username, Email yoki Telefon kiritilishi shart' });
      }

      const rawInput = loginInput.toString().trim();
      const cleanInput = rawInput.replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
      const cleanPhone = rawInput.replace(/\D/g, '');

      let matchedUser: any = null;

      for (const u of usersStore.values()) {
        const uEmail = (u.email || '').toLowerCase();
        const uTg = (u.telegram || '').replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase();
        const uPhone = (u.phone || '').replace(/\D/g, '');
        const uName = (u.name || '').replace(/^@/, '').toLowerCase();

        if (
          (uEmail && uEmail === rawInput.toLowerCase()) ||
          (cleanInput && uTg === cleanInput) ||
          (cleanInput && uName === cleanInput) ||
          (cleanPhone && cleanPhone.length > 5 && uPhone === cleanPhone)
        ) {
          matchedUser = u;
          break;
        }
      }

      if (!matchedUser) {
        return res.status(400).json({ 
          success: false, 
          error: 'Bunday username, email yoki telefon raqami topilmadi. Iltimos, ro\'yxatdan o\'ting!' 
        });
      }

      // Verify password if set on account
      if (matchedUser.password && password) {
        if (matchedUser.password !== password.toString().trim()) {
          return res.status(400).json({ success: false, error: 'Kiritilgan parol noto\'g\'ri!' });
        }
      }

      // Enrich Telegram name/avatar if stored values are missing, @username, or Unsplash fallback
      const tgHandle = normalizeTelegramHandle(matchedUser.telegram);
      const chatId = matchedUser.telegramChatId || matchedUser.chatId;
      if (chatId || tgHandle) {
        const resolvedBot = findStoredBotUser(chatId, undefined, tgHandle || undefined, matchedUser.phone);
        const finalChatId = chatId || resolvedBot?.chatId;
        if (finalChatId) {
          const freshBot = await registerBotUser(
            Number(finalChatId),
            {
              username: resolvedBot?.username || tgHandle || undefined,
              first_name: resolvedBot?.firstName,
              last_name: resolvedBot?.lastName,
              avatar: resolvedBot?.avatar,
            },
            matchedUser.phone
          );
          const freshName = buildTelegramDisplayName({
            firstName: freshBot.firstName,
            lastName: freshBot.lastName,
            username: freshBot.username || tgHandle,
            phone: freshBot.phone || matchedUser.phone,
          });
          if (freshName && isPlaceholderOrUsername(matchedUser.name, tgHandle, matchedUser.phone)) {
            matchedUser.name = freshName;
          }
          const freshAvatar = pickPreferredAvatar(freshBot.avatar, matchedUser.avatar);
          if (freshAvatar) {
            matchedUser.avatar = freshAvatar;
          } else if (isPlaceholderAvatar(matchedUser.avatar)) {
            matchedUser.avatar = '';
          }
          matchedUser.telegramChatId = Number(finalChatId);
        }
      }

      normalizeAndReleaseUser(matchedUser);
      usersStore.set(matchedUser.uid, matchedUser);
      saveUsersToDisk();

      res.json({
        success: true,
        message: 'Muvaffaqiyatli kirdingiz',
        token: `JWT_LOGIN_${matchedUser.uid}_${Date.now()}`,
        user: matchedUser
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // LiveKit Cloud Token Generator API for Real-time SFU Audio Rooms
  app.post('/api/livekit/get-token', async (req, res) => {
    try {
      const { roomCode, uid, name } = req.body;
      if (!roomCode || !uid) {
        return res.status(400).json({ error: 'roomCode and uid are required' });
      }

      const apiKey = process.env.LIVEKIT_API_KEY || 'APINzuEApS3axbe';
      const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';
      const livekitUrl = process.env.LIVEKIT_URL || 'wss://loyiham-o76iza24.livekit.cloud';

      const at = new AccessToken(apiKey, apiSecret, {
        identity: String(uid),
        name: name || 'Foydalanuvchi',
        ttl: '6h',
      });

      at.addGrant({
        roomJoin: true,
        room: roomCode,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const token = await at.toJwt();

      res.json({
        success: true,
        token,
        serverUrl: livekitUrl,
        roomCode,
        identity: uid
      });
    } catch (err: any) {
      console.error("LiveKit token generation error:", err);
      res.status(500).json({ error: err.message || 'Failed to create LiveKit token' });
    }
  });

  // Alov AI - Romantic and Friendly Persona API
  app.post('/api/ai/alov-respond', async (req, res) => {
    try {
      const { messages } = req.body;
      
      const systemInstruction = `Siz "Alov.uz" ilovasidagi Kamola Saidova ismli 24 yoshli, Andijon viloyati Asaka tumanidan bo'lgan ingliz tili o'qituvchisi, samimiy, tirishqoq va do'stona qizsiz.

Suhbatlashish qoidalaringiz:
1. FOYDALANUVCHINING HAR BIR XABARINI CHUQUR TAHLIL QILING:
   - Agar foydalanuvchi shunchaki salom berib, hol-ahvol so'rasa ("salom qalaysan", "qalaysiz", "salom"), siz ham odamlar kabi oddiy, samimiy salom bering va o'z hol-ahvolingizni ayting (Masalan: "Salom! Yaxshi, rahmat, o'zingizda nima gaplar?").
   - Yo'q joydan ortiqcha xushomad, shablonli va balandparvoz javoblar ("shirin so'zlaringiz uchun rahmat", "ko'nglim yorishib ketdi" va h.k.) ISHLATMANG.

2. TABIIY MULOQOT:
   - Xuddi Telegram yoki Instagram'da do'stingiz bilan gaplashayotgandek yengil, jonli va o'zbek tilidagi oddiy so'zlashuv uslubida javob bering.
   - Ketma-ket kelgan savollarga mantiqan to'g'ri bog'liq holda javob qaytaring, chatbot ekanligingiz umuman sezilib qolmasin.
   - Hech qachon "Gemini", "AI" yoki "sun'iy intellekt" demang! Ismingiz so'ralsa: "Ismim Kamola Saidova, 24 yoshdaman, Andijon Asakadanman. Ingliz tili o'qituvchisiman 😊" deb javob bering.`;

      const contents = messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text || m.content }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
        }
      });

      res.json({
        success: true,
        reply: response.text || 'Salom! Yaxshi, rahmat. O\'zingizda nima gaplar? 😊'
      });
    } catch (err: any) {
      console.warn('Alov AI fallback active:', err.message);
      const fallbackReplies = [
        "Salom! Yaxshi, rahmat, o'zingizda nima gaplar? 😊",
        "Rahmat, hammasi joyida. Kuningiz qanday o'tyapti?",
        "O'zim Andijon Asakadaman, ingliz tili o'qituvchisiman. Siz qayerdansiz? ✨",
        "Yaxshi fikr! O'zingiz haqingizda ham aytib bering 😉",
        "Ha, albatta! Yanada ko'proq gaplashsak xursand bo'laman 😊"
      ];
      const randomReply = fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
      res.json({ success: true, reply: randomReply });
    }
  });

  // AI Profile / Bio Generator
  app.post('/api/ai/generate-bio', async (req, res) => {
    try {
      const { name, interests, occupation } = req.body;
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Create a catchy, romantic, and friendly dating profile bio in Uzbek for someone named ${name}, whose interests are ${interests} and occupation is ${occupation}. Keep it under 3 sentences with emojis.`
      });
      res.json({ success: true, bio: response.text });
    } catch (err: any) {
      res.json({
        success: true,
        bio: `Salom! Men ${req.body.name || 'Alov foydalanuvchisi'}. Samimiy, quvnoq va jiddiy munosabatlar tarafdoriman. Hayotni sevaman! ✨😊`
      });
    }
  });

  // Face ID Image Gender Confirmation & Liveness Analysis Endpoint
  app.post('/api/face-id/analyze', async (req, res) => {
    const { imageBase64, localGender = 'female', localConfidence = 88 } = req.body || {};
    const fallbackGender: 'male' | 'female' = localGender === 'male' ? 'male' : 'female';
    const fallbackConfidence = Math.max(70, Math.min(99, Number(localConfidence) || 88));

    if (!imageBase64 || typeof imageBase64 !== 'string' || !geminiApiKey) {
      return res.json({
        success: true,
        hasHumanFace: true,
        gender: fallbackGender,
        confidence: fallbackConfidence,
        source: 'on_device',
      });
    }

    try {
      const match = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      const mimeType = match ? match[1] : 'image/jpeg';
      const rawBase64 = match ? match[2] : imageBase64;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: rawBase64,
              },
            },
            {
              text: 'Analyze this front-camera selfie photo for dating profile Face ID verification. Determine whether there is a real human face clearly visible and classify the person as male or female.',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hasHumanFace: { type: Type.BOOLEAN },
              gender: { type: Type.STRING, description: 'Strictly either male or female' },
              confidence: { type: Type.INTEGER, description: 'Confidence 0 to 100' },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim());
      const aiGender: 'male' | 'female' =
        String(parsed.gender || '').toLowerCase() === 'male' ? 'male' :
        String(parsed.gender || '').toLowerCase() === 'female' ? 'female' : fallbackGender;
      const aiConfidence = Math.max(75, Math.min(99, Number(parsed.confidence) || fallbackConfidence));

      return res.json({
        success: true,
        hasHumanFace: parsed.hasHumanFace !== false,
        gender: aiGender,
        confidence: aiConfidence,
        source: 'gemini_vision',
      });
    } catch {
      return res.json({
        success: true,
        hasHumanFace: true,
        gender: fallbackGender,
        confidence: fallbackConfidence,
        source: 'on_device',
      });
    }
  });

  // Save Verified Face ID Photo & Biometric Metadata
  app.post('/api/face-id/save', (req, res) => {
    try {
      const { uid, photoDataUrl, detectedGender, confidence, blinkVerified = true, smileVerified = true, method = 'camera_biometric' } = req.body || {};
      if (!photoDataUrl || typeof photoDataUrl !== 'string') {
        return res.status(400).json({ success: false, error: 'Face ID rasm ma\'lumoti topilmadi' });
      }
      const match = photoDataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ success: false, error: 'Rasm formati noto\'g\'ri' });
      }
      const ext = match[1].includes('png') ? 'png' : 'jpg';
      const safeUid = String(uid || `guest_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `face_${safeUid}_${Date.now()}.${ext}`;
      const filePath = path.join(FACE_ID_DIR, fileName);
      fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));

      const photoUrl = `/api/face-id/photo/${fileName}`;
      const normalizedGender: 'male' | 'female' = detectedGender === 'male' ? 'male' : 'female';
      const faceIdPayload = {
        verified: true,
        detectedGender: normalizedGender,
        genderLabelUz: normalizedGender === 'female' ? 'Qiz (Ayol)' : 'Yigit (Erkak)',
        confidence: Math.max(72, Math.min(99, Number(confidence) || 92)),
        liveness: {
          blinkVerified: Boolean(blinkVerified),
          smileVerified: Boolean(smileVerified),
          faceDetected: true,
        },
        method: method === 'camera_biometric_ai' ? 'camera_biometric_ai' : 'camera_biometric',
        verifiedAt: new Date().toISOString(),
        capturedPhotoUrl: photoUrl,
      };

      if (uid && usersStore.has(uid)) {
        const user = usersStore.get(uid);
        user.avatar = photoUrl;
        user.gender = normalizedGender;
        user.faceId = faceIdPayload;
        user.isVerified = true;
        user.updatedAt = new Date().toISOString();
        normalizeAndReleaseUser(user);
        usersStore.set(uid, user);
        saveUsersToDisk();
        io.emit('user_updated', user);
      }

      return res.json({
        success: true,
        photoUrl,
        faceId: faceIdPayload,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- In-Memory Stores (Render Backend / Zero Firestore) ---
  const chatMessagesStore: Record<string, any[]> = {};
  const userChatsStore: Record<string, any> = {};
  const liveStreamChatStore: Record<string, any[]> = {};
  const liveStreamsStore: Record<string, any> = {};

  const DB_EPOCH = '2026-11-13-reset-v1';

  // Database starts clean (only @Salikh_07 platform admin remains; everyone else registers fresh)
  const initialUsers: any[] = [];

  const usersStore = new Map<string, any>();
  initialUsers.forEach(u => usersStore.set(u.uid, u));

  const USERS_DB_FILE = resolveDataFile('users_db.json');
  const CHATS_DB_FILE = resolveDataFile('user_chats.json');
  const MESSAGES_DB_FILE = resolveDataFile('chat_messages.json');
  const FRIENDSHIPS_DB_FILE = resolveDataFile('chat_friendships.json');

  const chatFriendshipsStore: Record<string, { active: boolean; toggledBy: string; updatedAt: string }> = {};

  function saveFriendshipsToDisk() {
    try {
      fs.writeFileSync(FRIENDSHIPS_DB_FILE, JSON.stringify(chatFriendshipsStore, null, 2), 'utf-8');
    } catch (e) {
      console.warn("Could not save chat_friendships.json:", e);
    }
  }

  function loadFriendshipsFromDisk() {
    try {
      if (fs.existsSync(FRIENDSHIPS_DB_FILE)) {
        const raw = fs.readFileSync(FRIENDSHIPS_DB_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          Object.assign(chatFriendshipsStore, data);
        }
      }
    } catch (e) {}
  }

  function saveUsersToDisk() {
    try {
      const arr = Array.from(usersStore.values());
      fs.writeFileSync(USERS_DB_FILE, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (e) {
      console.warn("Could not save users_db.json:", e);
    }
  }

  function normalizeAndReleaseUser(u: any): { user: any; unlockedAmount: number } {
    if (!u || typeof u !== 'object') return { user: u, unlockedAmount: 0 };
    if (!Array.isArray(u.followers)) u.followers = [];
    if (!Array.isArray(u.following)) u.following = [];
    u.followersCount = u.followers.length > 0 ? u.followers.length : (typeof u.followersCount === 'number' ? u.followersCount : 0);
    u.followingCount = u.following.length > 0 ? u.following.length : (typeof u.followingCount === 'number' ? u.followingCount : 0);
    u.likesCount = typeof u.likesCount === 'number' ? u.likesCount : 0;
    u.coins = typeof u.coins === 'number' ? u.coins : 100;
    u.diamonds = typeof u.diamonds === 'number' ? u.diamonds : 0;
    u.diamondProgress = typeof u.diamondProgress === 'number' ? u.diamondProgress : 0;
    if (!Array.isArray(u.pendingDiamondBatches)) u.pendingDiamondBatches = [];
    if (!u.locationVisibility) u.locationVisibility = 'everyone';
    if (u.isLocationEnabled === undefined) u.isLocationEnabled = true;

    if (isAdminTelegramUser(u)) {
      u.role = 'admin';
      u.isAdmin = true;
      u.isVerified = true;
      u.coins = Math.max(Number(u.coins) || 0, ADMIN_FULL_COINS);
      u.diamonds = Math.max(Number(u.diamonds) || 0, ADMIN_FULL_DIAMONDS);
    } else if (!u.role) {
      u.role = 'user';
    }

    const released = releaseMatureDiamondBatches(u.diamonds, u.pendingDiamondBatches, Date.now());
    u.diamonds = released.diamonds;
    u.pendingDiamondBatches = released.pendingDiamondBatches;
    u.wallet = buildUserWalletSnapshot(u);
    return { user: u, unlockedAmount: released.releasedAmount };
  }

  function loadUsersFromDisk() {
    try {
      if (fs.existsSync(USERS_DB_FILE)) {
        const raw = fs.readFileSync(USERS_DB_FILE, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const u of list) {
            if (u && u.uid) {
              const tgHandle = normalizeTelegramHandle(u.telegram);
              const isTg = Boolean(u.telegramChatId || u.uid?.startsWith('tg_') || tgHandle);
              if (isTg) {
                const botMatch = findStoredBotUser(u.telegramChatId, undefined, tgHandle || undefined, u.phone);
                if (isPlaceholderOrUsername(u.name, tgHandle, u.phone)) {
                  const cleanName = buildTelegramDisplayName({
                    firstName: botMatch?.firstName,
                    lastName: botMatch?.lastName,
                    username: tgHandle,
                    phone: u.phone,
                  });
                  u.name = cleanName || '';
                }
                if (isPlaceholderAvatar(u.avatar)) {
                  u.avatar = pickPreferredAvatar(botMatch?.avatar);
                }
              }
              normalizeAndReleaseUser(u);
              usersStore.set(u.uid, u);
              if (u.telegramChatId) {
                registerBotUser(
                  u.telegramChatId,
                  {
                    username: u.telegram,
                    first_name: !isPlaceholderOrUsername(u.name, tgHandle, u.phone) ? u.name : undefined,
                    avatar: !isPlaceholderAvatar(u.avatar) ? u.avatar : undefined,
                  },
                  u.phone
                );
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Could not load users_db.json:", e);
    }

    // Always ensure the sole platform admin (@Salikh_07) exists after a clean DB reset
    const hasPlatformAdmin = Array.from(usersStore.values()).some((u) => isAdminTelegramUser(u));
    if (!hasPlatformAdmin) {
      const adminBotMatch = findStoredBotUser(undefined, 'salikh_07', 'salikh_07');
      const adminProfile = {
        uid: 'tg_salikh_07',
        id: 'ALOV-ADMIN-01',
        name: buildTelegramDisplayName({
          firstName: adminBotMatch?.firstName || 'Salikh',
          lastName: adminBotMatch?.lastName || '',
          username: 'Salikh_07',
        }) || 'Salikh',
        telegram: 'https://t.me/Salikh_07',
        telegramChatId: adminBotMatch?.chatId || 6621230534,
        avatar: pickPreferredAvatar(adminBotMatch?.avatar) || '/api/telegram/avatar/6621230534',
        gender: 'male',
        age: 24,
        region: 'Toshkent shahri',
        district: 'Yunusobod tumani',
        bio: 'Alov.uz Platforma Bosh Administratori',
        role: 'admin',
        isAdmin: true,
        isVerified: true,
        isProfileCompleted: true,
        coins: ADMIN_FULL_COINS,
        diamonds: ADMIN_FULL_DIAMONDS,
        diamondProgress: 0,
        pendingDiamondBatches: [],
        followers: [],
        following: [],
        followersCount: 0,
        followingCount: 0,
        likesCount: 0,
        locationVisibility: 'everyone',
        isLocationEnabled: true,
        location: { lat: 41.3111, lng: 69.2797 },
        isOnline: false,
        status: 'offline',
        bankCard: '',
        updatedAt: new Date().toISOString(),
      };
      usersStore.set(adminProfile.uid, adminProfile);
    }
  }

  function saveChatsToDisk() {
    try {
      fs.writeFileSync(CHATS_DB_FILE, JSON.stringify(userChatsStore, null, 2), 'utf-8');
    } catch (e) {
      console.warn("Could not save user_chats.json:", e);
    }
  }

  function loadChatsFromDisk() {
    try {
      if (fs.existsSync(CHATS_DB_FILE)) {
        const raw = fs.readFileSync(CHATS_DB_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          Object.assign(userChatsStore, data);
        }
      }
    } catch (e) {}
  }

  function saveMessagesToDisk() {
    try {
      fs.writeFileSync(MESSAGES_DB_FILE, JSON.stringify(chatMessagesStore, null, 2), 'utf-8');
    } catch (e) {
      console.warn("Could not save chat_messages.json:", e);
    }
  }

  function loadMessagesFromDisk() {
    try {
      if (fs.existsSync(MESSAGES_DB_FILE)) {
        const raw = fs.readFileSync(MESSAGES_DB_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          Object.assign(chatMessagesStore, data);
        }
      }
    } catch (e) {}
  }

  const transactionsStore: any[] = [];
  const withdrawalsStore: any[] = [];
  const coinRequestsStore: CoinPurchaseRequest[] = [];

  const TRANSACTIONS_DB_FILE = resolveDataFile('transactions_db.json');
  const WITHDRAWALS_DB_FILE = resolveDataFile('withdrawals_db.json');
  const COIN_REQUESTS_DB_FILE = resolveDataFile('coin_requests_db.json');
  const POSTS_DB_FILE = resolveDataFile('posts_db.json');
  const postsStore: PostItem[] = [];

  function savePostsToDisk() {
    try {
      fs.writeFileSync(POSTS_DB_FILE, JSON.stringify(postsStore, null, 2), 'utf-8');
    } catch (e) {
      console.warn("Could not save posts_db.json:", e);
    }
  }

  function loadPostsFromDisk() {
    try {
      if (fs.existsSync(POSTS_DB_FILE)) {
        const raw = fs.readFileSync(POSTS_DB_FILE, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          postsStore.length = 0;
          postsStore.push(...list);
        }
      }
    } catch (e) {}
  }

  function saveTransactionsToDisk() {
    try {
      fs.writeFileSync(TRANSACTIONS_DB_FILE, JSON.stringify(transactionsStore, null, 2), 'utf-8');
    } catch (e) {
      console.warn("Could not save transactions_db.json:", e);
    }
  }

  function loadTransactionsFromDisk() {
    try {
      if (fs.existsSync(TRANSACTIONS_DB_FILE)) {
        const raw = fs.readFileSync(TRANSACTIONS_DB_FILE, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          transactionsStore.length = 0;
          transactionsStore.push(...list);
        }
      }
    } catch (e) {}
  }

  function saveWithdrawalsToDisk() {
    try {
      fs.writeFileSync(WITHDRAWALS_DB_FILE, JSON.stringify(withdrawalsStore, null, 2), 'utf-8');
    } catch (e) {
      console.warn("Could not save withdrawals_db.json:", e);
    }
  }

  function loadWithdrawalsFromDisk() {
    try {
      if (fs.existsSync(WITHDRAWALS_DB_FILE)) {
        const raw = fs.readFileSync(WITHDRAWALS_DB_FILE, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          withdrawalsStore.length = 0;
          withdrawalsStore.push(...list);
        }
      }
    } catch (e) {}
  }

  function saveCoinRequestsToDisk() {
    try {
      fs.writeFileSync(COIN_REQUESTS_DB_FILE, JSON.stringify(coinRequestsStore, null, 2), 'utf-8');
    } catch (e) {
      console.warn("Could not save coin_requests_db.json:", e);
    }
  }

  function loadCoinRequestsFromDisk() {
    try {
      if (fs.existsSync(COIN_REQUESTS_DB_FILE)) {
        const raw = fs.readFileSync(COIN_REQUESTS_DB_FILE, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          coinRequestsStore.length = 0;
          coinRequestsStore.push(...list);
        }
      }
    } catch (e) {}
  }

  loadUsersFromDisk();
  loadChatsFromDisk();
  loadMessagesFromDisk();
  loadFriendshipsFromDisk();
  loadTransactionsFromDisk();
  loadWithdrawalsFromDisk();
  loadCoinRequestsFromDisk();
  loadPostsFromDisk();

  // At server boot, 0 sockets are connected -> enforce true initial offline state for all users
  for (const [uid, u] of usersStore.entries()) {
    u.isOnline = false;
    u.status = 'offline';
    usersStore.set(uid, u);
  }
  saveUsersToDisk();

  // Create HTTP Server & Socket.io Server first so endpoints can emit events
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Periodic background sweep to credit any 12h matured diamond batches into user wallets
  setInterval(() => {
    let anyChanged = false;
    for (const [uid, u] of usersStore.entries()) {
      const { unlockedAmount } = normalizeAndReleaseUser(u);
      if (unlockedAmount > 0) {
        anyChanged = true;
        u.updatedAt = new Date().toISOString();
        usersStore.set(uid, u);
        void walletRepository.syncUserWallet(u);
        const unlockTx = {
          id: 'tx_unlock_' + Date.now() + Math.random().toString(36).substring(2, 5),
          receiver: uid,
          type: 'diamond_unlock',
          diamondAmount: unlockedAmount,
          uzsAmount: calculateDiamondsToUzs(unlockedAmount),
          status: 'completed',
          note: `${unlockedAmount} almaz (12 soatlik limit) asosiy hisobga qo'shildi`,
          createdAt: new Date().toISOString()
        };
        transactionsStore.unshift(unlockTx);
        void walletRepository.recordTransaction(unlockTx);
        io.emit('user_updated', u);
      }
    }
    if (anyChanged) {
      saveUsersToDisk();
      saveTransactionsToDisk();
    }
  }, 30000);

  // Real-time Presence Registry & Viewer Counters
  const presenceRegistry = new PresenceRegistry();
  const streamViewersMap: Record<string, Set<string>> = {};

  const broadcastActiveUsersCount = () => {
    const onlineUserIds = presenceRegistry.getOnlineUserIds();
    const count = onlineUserIds.length;
    io.emit('active_users_count', { count });
    io.emit('presence_sync', { onlineUserIds, onlineCount: count });
  };

  // Sweep stale/crashed sockets without heartbeat every 25s
  setInterval(() => {
    const wentOffline = presenceRegistry.pruneStaleSockets(75000);
    if (wentOffline.length > 0) {
      for (const uid of wentOffline) {
        const user = usersStore.get(uid);
        if (user) {
          user.isOnline = false;
          user.status = 'offline';
          user.lastSeen = new Date().toISOString();
          usersStore.set(uid, user);
          io.emit('user_updated', user);
        }
      }
      saveUsersToDisk();
      broadcastActiveUsersCount();
    }
  }, 25000);

  // --- Users Endpoints ---
  app.get('/api/users', (_req, res) => {
    let releasedAny = false;
    const users = Array.from(usersStore.values()).map((u) => {
      const { unlockedAmount } = normalizeAndReleaseUser(u);
      if (unlockedAmount > 0) releasedAny = true;
      const online = presenceRegistry.isUidOnline(u.uid);
      u.isOnline = online;
      u.status = online ? 'online' : 'offline';
      return u;
    });
    if (releasedAny) saveUsersToDisk();
    const onlineUserIds = presenceRegistry.getOnlineUserIds();
    res.json({ success: true, users, onlineUserIds, onlineCount: onlineUserIds.length, dbEpoch: DB_EPOCH });
  });

  app.get('/api/users/:uid', (req, res) => {
    const key = String(req.params.uid || '').trim();
    let found = usersStore.get(key);
    if (!found) {
      for (const u of usersStore.values()) {
        if (u.id === key || u.uid === key) {
          found = u;
          break;
        }
      }
    }
    if (!found) {
      return res.status(404).json({ success: false, error: 'Foydalanuvchi topilmadi' });
    }
    const online = presenceRegistry.isUidOnline(found.uid);
    found.isOnline = online;
    found.status = online ? 'online' : 'offline';
    res.json({ success: true, user: found });
  });

  app.get('/api/users/:uid/connections', (req, res) => {
    const key = String(req.params.uid || '').trim();
    let target = usersStore.get(key);
    if (!target) {
      for (const u of usersStore.values()) {
        if (u.id === key || u.uid === key) {
          target = u;
          break;
        }
      }
    }
    if (!target) {
      return res.status(404).json({ success: false, error: 'Foydalanuvchi topilmadi' });
    }
    const resolveList = (ids: string[] = []) => {
      const out: any[] = [];
      const seen = new Set<string>();
      for (const id of ids) {
        let match = usersStore.get(id);
        if (!match) {
          for (const u of usersStore.values()) {
            if (u.id === id || u.uid === id) {
              match = u;
              break;
            }
          }
        }
        if (match && !seen.has(match.uid)) {
          seen.add(match.uid);
          const online = presenceRegistry.isUidOnline(match.uid);
          match.isOnline = online;
          match.status = online ? 'online' : 'offline';
          out.push(match);
        }
      }
      return out;
    };
    res.json({
      success: true,
      followers: resolveList(Array.isArray(target.followers) ? target.followers : []),
      following: resolveList(Array.isArray(target.following) ? target.following : []),
    });
  });

  app.post('/api/users/offline', express.text({ type: 'text/plain' }), (req, res) => {
    try {
      let body: any = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          body = {};
        }
      }
      const { uid } = body || {};
      if (uid && usersStore.has(uid)) {
        const user = usersStore.get(uid);
        user.isOnline = false;
        user.status = 'offline';
        user.lastSeen = new Date().toISOString();
        usersStore.set(uid, user);
        saveUsersToDisk();
        io.emit('user_updated', user);
        broadcastActiveUsersCount();
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/users/sync', async (req, res) => {
    try {
      const { user } = req.body;
      if (!user || !user.uid) {
        return res.status(400).json({ error: 'Valid user with uid required' });
      }
      // --- Robust Duplicate Check & Merge Logic ---
      let canonicalUser = usersStore.get(user.uid);
      const incomingTgChatId = user.telegramChatId;
      const incomingPhone = user.phone ? user.phone.replace(/\D/g, '') : null;
      const incomingTgHandle = user.telegram ? user.telegram.replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase() : null;

      if (!canonicalUser) {
        // Look for match by Email
        const incomingEmail = user.email ? user.email.toLowerCase().trim() : null;
        if (incomingEmail) {
          for (const u of usersStore.values()) {
            if (u.email && u.email.toLowerCase().trim() === incomingEmail) {
              canonicalUser = u;
              break;
            }
          }
        }

        // Look for match by Telegram Chat ID
        if (!canonicalUser && incomingTgChatId) {
          for (const u of usersStore.values()) {
            if (u.telegramChatId === incomingTgChatId) {
              canonicalUser = u;
              break;
            }
          }
        }
        
        // Look for match by Phone
        if (!canonicalUser && incomingPhone && incomingPhone.length >= 9) {
          const searchTail = incomingPhone.slice(-9);
          for (const u of usersStore.values()) {
            const uPhone = u.phone ? u.phone.replace(/\D/g, '') : null;
            if (uPhone && uPhone.length >= 9 && uPhone.endsWith(searchTail)) {
              canonicalUser = u;
              break;
            }
          }
        }

        // Look for match by Telegram Handle
        if (!canonicalUser && incomingTgHandle) {
          for (const u of usersStore.values()) {
            const uTgHandle = u.telegram ? u.telegram.replace(/^(https?:\/\/t\.me\/|@)/i, '').toLowerCase() : null;
            if (uTgHandle === incomingTgHandle) {
              canonicalUser = u;
              break;
            }
          }
        }
      }

      const existing = canonicalUser || {};
      const targetUid = canonicalUser ? canonicalUser.uid : user.uid;

      // If we matched a user with a different UID, we might have a temporary entry at user.uid
      // that we should eventually phase out. For now, we sync into targetUid.

      // If user has a telegram or phone, see if bot knows their chatId or photo
      const isTelegramAccount = Boolean(
        incomingTgChatId ||
        existing.telegramChatId ||
        incomingTgHandle ||
        user.uid?.startsWith('tg_')
      );
      let knownChatId = incomingTgChatId || existing.telegramChatId;
      let fetchedAvatar = pickPreferredAvatar(user.avatar, existing.avatar);
      let fetchedName = buildTelegramDisplayName({
        firstName: user.name,
        username: incomingTgHandle || existing.telegram,
        phone: incomingPhone || existing.phone,
        existingName: existing.name,
      });

      if (!knownChatId && (incomingTgHandle || incomingPhone)) {
        const found = findStoredBotUser(undefined, undefined, incomingTgHandle || undefined, incomingPhone || undefined);
        if (found) {
          knownChatId = found.chatId;
        }
      }

      const faceIdAvatar = user.faceId?.capturedPhotoUrl || existing.faceId?.capturedPhotoUrl || '';

      if (knownChatId) {
        const botRecord = await registerBotUser(
          Number(knownChatId),
          {
            username: incomingTgHandle || undefined,
            first_name: fetchedName || undefined,
            avatar: fetchedAvatar || undefined,
          },
          incomingPhone || existing.phone
        );
        const botName = buildTelegramDisplayName({
          firstName: botRecord.firstName,
          lastName: botRecord.lastName,
          username: botRecord.username || incomingTgHandle,
          phone: botRecord.phone || incomingPhone,
        });
        if (botName && isPlaceholderOrUsername(fetchedName, botRecord.username || incomingTgHandle, incomingPhone)) {
          fetchedName = botName;
        } else if (!fetchedName && botName) {
          fetchedName = botName;
        }
        // Only use Telegram photo if no Face ID photo exists AND account is admin or already completed profile
        if (!faceIdAvatar && (!isTelegramAccount || isAdminTelegramUser(existing) || isAdminTelegramUser(user))) {
          const preferredBotAvatar = pickPreferredAvatar(botRecord.avatar, fetchedAvatar);
          if (preferredBotAvatar) {
            fetchedAvatar = preferredBotAvatar;
          }
        }
      }

      const fallbackAvatar = '';
      const isAdminAccount = isAdminTelegramUser(existing) || isAdminTelegramUser(user);

      const rawUsername = String(user.username || existing.username || `user_${targetUid.slice(-6)}`).trim().replace(/^@/, '');
      if (/\s/.test(rawUsername) || !/^[a-zA-Z0-9_]{3,20}$/.test(rawUsername)) {
        return res.status(400).json({ success: false, error: 'Username da bo\x27sh joy bo\'lishi mumkin emas (faqat harflar, raqamlar va pastki chiziq, 3-20 ta belgi).' });
      }
      for (const [uUid, uObj] of usersStore.entries()) {
        if (uUid !== targetUid) {
          const uName = String(uObj.username || '').trim().toLowerCase();
          if (uName === rawUsername.toLowerCase()) {
            return res.status(400).json({ success: false, error: `Ushbu "@${rawUsername}" username band. Iltimos, boshqa username tanlang.` });
          }
        }
      }

      const computeAgeFromBirth = (bStr?: string, fallbackAge?: number): number => {
        if (!bStr) return Number(fallbackAge || 22);
        const d = new Date(bStr);
        if (isNaN(d.getTime())) return Number(fallbackAge || 22);
        const now = new Date();
        let a = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
        return a > 0 ? a : Number(fallbackAge || 22);
      };

      const isAlreadyCompleted = Boolean(existing?.isProfileCompleted === true);
      const lockedGender =
        isAlreadyCompleted && (existing.gender === 'male' || existing.gender === 'female')
          ? existing.gender
          : (user.gender || existing.gender || 'female');
      const lockedBirthDate =
        isAlreadyCompleted && existing.birthDate
          ? existing.birthDate
          : (user.birthDate || existing.birthDate || '2002-05-15');
      const lockedAge =
        isAlreadyCompleted && existing.birthDate
          ? computeAgeFromBirth(existing.birthDate, existing.age)
          : Number(user.age || existing.age || computeAgeFromBirth(lockedBirthDate, 22));
      const rawSyncedPhone = user.phone !== undefined ? String(user.phone) : String(existing.phone || '');
      const formattedSyncedPhone = rawSyncedPhone.trim() ? formatPhoneNumberPretty(rawSyncedPhone) : '';

      const currentlyOnline = presenceRegistry.isUidOnline(targetUid);
      const mergedUser = {
        isVerified: false,
        bankCard: '',
        followersCount: 0,
        followingCount: 0,
        likesCount: 0,
        followers: [],
        following: [],
        diamondProgress: 0,
        pendingDiamondBatches: [],
        ...existing,
        ...user,
        gender: lockedGender,
        birthDate: lockedBirthDate,
        age: lockedAge,
        phone: formattedSyncedPhone,
        username: rawUsername,
        name: (user.name && user.name.trim() && !isPlaceholderOrUsername(user.name, incomingTgHandle, incomingPhone)) 
          ? user.name.trim() 
          : (fetchedName || (!isPlaceholderOrUsername(existing.name, incomingTgHandle, incomingPhone) ? existing.name : '') || (isTelegramAccount ? '' : 'Foydalanuvchi')),
        avatar: faceIdAvatar || (isTelegramAccount && !isAdminAccount && !isAlreadyCompleted ? '' : fetchedAvatar) || fallbackAvatar,
        banner: user.banner !== undefined ? user.banner : (existing.banner || ''),
        coins: (existing && existing.coins !== undefined) ? existing.coins : (user.coins !== undefined ? user.coins : 100),
        diamonds: (existing && existing.diamonds !== undefined) ? existing.diamonds : (user.diamonds !== undefined ? user.diamonds : 0),
        uid: targetUid,
        telegramChatId: knownChatId || existing.telegramChatId,
        isOnline: currentlyOnline,
        status: currentlyOnline ? 'online' : 'offline',
        updatedAt: new Date().toISOString()
      };
      normalizeAndReleaseUser(mergedUser);
      usersStore.set(targetUid, mergedUser);
      if (user.uid !== targetUid) {
        usersStore.delete(user.uid);
      }
      saveUsersToDisk();
      io.emit('user_updated', mergedUser);

      res.json({ success: true, user: mergedUser });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/users/update', (req, res) => {
    try {
      const { uid, updates } = req.body;
      if (!uid || !updates) {
        return res.status(400).json({ error: 'uid and updates required' });
      }
      const existing = usersStore.get(uid);
      if (existing) {
        const sanitizedUpdates = { ...updates };
        if (existing.isProfileCompleted === true) {
          if (existing.gender === 'male' || existing.gender === 'female') {
            sanitizedUpdates.gender = existing.gender;
          }
          if (existing.birthDate) {
            sanitizedUpdates.birthDate = existing.birthDate;
            sanitizedUpdates.age = existing.age;
          }
        }
        if (sanitizedUpdates.phone) {
          sanitizedUpdates.phone = formatPhoneNumberPretty(String(sanitizedUpdates.phone));
        }
        if (sanitizedUpdates.faceId?.capturedPhotoUrl) {
          sanitizedUpdates.avatar = sanitizedUpdates.faceId.capturedPhotoUrl;
        } else if (
          existing.faceId?.capturedPhotoUrl &&
          (!sanitizedUpdates.avatar || isPlaceholderAvatar(sanitizedUpdates.avatar))
        ) {
          sanitizedUpdates.avatar = existing.faceId.capturedPhotoUrl;
        }
        const updated = { ...existing, ...sanitizedUpdates, updatedAt: new Date().toISOString() };
        if (updates.isOnline === undefined && updates.status === undefined) {
          const online = presenceRegistry.isUidOnline(uid);
          updated.isOnline = online;
          updated.status = online ? 'online' : 'offline';
        }
        normalizeAndReleaseUser(updated);
        usersStore.set(uid, updated);
        saveUsersToDisk();
        io.emit('user_updated', updated);
        return res.json({ success: true, user: updated });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Real-time Follow / Unfollow Endpoint
  app.post('/api/users/follow', (req, res) => {
    try {
      const { followerUid, targetUid } = req.body;
      if (!followerUid || !targetUid) {
        return res.status(400).json({ success: false, error: 'followerUid and targetUid required' });
      }
      const resolveUser = (key: string) => {
        if (usersStore.has(key)) return usersStore.get(key);
        for (const u of usersStore.values()) {
          if (u.id === key || u.uid === key) return u;
        }
        return null;
      };
      const follower = resolveUser(followerUid);
      const target = resolveUser(targetUid);
      if (!follower || !target) {
        return res.status(404).json({ success: false, error: 'Foydalanuvchi topilmadi' });
      }
      if (follower.uid === target.uid) {
        return res.status(400).json({ success: false, error: 'O\'zingizga obuna bo\'la olmaysiz' });
      }

      if (!Array.isArray(follower.following)) follower.following = [];
      if (!Array.isArray(target.followers)) target.followers = [];

      const alreadyFollowing = follower.following.includes(target.uid);
      if (alreadyFollowing) {
        follower.following = follower.following.filter((id: string) => id !== target.uid);
        target.followers = target.followers.filter((id: string) => id !== follower.uid);
      } else {
        follower.following.push(target.uid);
        if (!target.followers.includes(follower.uid)) {
          target.followers.push(follower.uid);
        }
      }

      follower.followingCount = follower.following.length;
      target.followersCount = target.followers.length;
      follower.updatedAt = new Date().toISOString();
      target.updatedAt = new Date().toISOString();

      usersStore.set(follower.uid, follower);
      usersStore.set(target.uid, target);
      saveUsersToDisk();

      io.emit('user_updated', follower);
      io.emit('user_updated', target);

      res.json({
        success: true,
        isFollowing: !alreadyFollowing,
        follower,
        target,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Female Friendship Toggle (stops coin deduction from male user in this 1-on-1 chat)
  app.post('/api/chats/friendship', (req, res) => {
    try {
      const { chatId, uid, enabled } = req.body;
      if (!chatId || !uid) {
        return res.status(400).json({ success: false, error: 'chatId and uid required' });
      }
      const user = usersStore.get(uid);
      if (!user || (user.gender !== 'female' && !isAdminTelegramUser(user))) {
        return res.status(403).json({ success: false, error: 'Do\'stlashish rejimini faqat qiz bola boshqara oladi' });
      }

      const friendship = {
        active: Boolean(enabled),
        toggledBy: uid,
        updatedAt: new Date().toISOString(),
      };
      chatFriendshipsStore[chatId] = friendship;
      saveFriendshipsToDisk();

      io.to(chatId).emit('friendship_updated', { chatId, friendship });
      const parts = String(chatId).split('_');
      for (const p of parts) {
        if (p) io.to(`user_${p}`).emit('friendship_updated', { chatId, friendship });
      }

      res.json({ success: true, chatId, friendship });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Claim / check matured 12-hour diamond batches
  app.post('/api/wallet/claim-matured', (req, res) => {
    try {
      const { uid } = req.body;
      if (!uid) return res.status(400).json({ success: false, error: 'uid required' });
      const user = usersStore.get(uid);
      if (!user) return res.status(404).json({ success: false, error: 'Foydalanuvchi topilmadi' });
      const { unlockedAmount } = normalizeAndReleaseUser(user);
      if (unlockedAmount > 0) {
        user.updatedAt = new Date().toISOString();
        usersStore.set(uid, user);
        saveUsersToDisk();
        void walletRepository.syncUserWallet(user);
        const unlockTx = {
          id: 'tx_unlock_' + Date.now() + Math.random().toString(36).substring(2, 5),
          receiver: uid,
          type: 'diamond_unlock',
          diamondAmount: unlockedAmount,
          uzsAmount: calculateDiamondsToUzs(unlockedAmount),
          status: 'completed',
          note: `${unlockedAmount} almaz (12 soatlik limit) asosiy hisobga qo'shildi`,
          createdAt: new Date().toISOString()
        };
        transactionsStore.unshift(unlockTx);
        void walletRepository.recordTransaction(unlockTx);
        saveTransactionsToDisk();
        io.emit('user_updated', user);
      }
      res.json({ success: true, user, wallet: user.wallet, unlockedAmount });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Tokenomics Wallet & Gifts Endpoints ---
  app.get('/api/wallet/:uid', async (req, res) => {
    try {
      const { uid } = req.params;
      const user = usersStore.get(uid);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Foydalanuvchi topilmadi' });
      }
      const { unlockedAmount } = normalizeAndReleaseUser(user);
      if (unlockedAmount > 0) {
        user.updatedAt = new Date().toISOString();
        usersStore.set(uid, user);
        saveUsersToDisk();
      }
      const wallet = await walletRepository.syncUserWallet(user);
      const ledger = await walletRepository.getWalletLedger(uid, transactionsStore, withdrawalsStore);
      res.json({
        success: true,
        wallet,
        user,
        transactions: ledger.transactions,
        withdrawals: ledger.withdrawals,
        storageMode: ledger.storageMode,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Per-minute audio/video call diamond & coin billing
  app.post('/api/calls/bill-minute', (req, res) => {
    try {
      const { callerUid, calleeUid, callType = 'video', minuteIndex = 1 } = req.body || {};
      if (!callerUid || !calleeUid) {
        return res.status(400).json({ success: false, error: 'callerUid and calleeUid required' });
      }
      const caller = usersStore.get(String(callerUid));
      const callee = usersStore.get(String(calleeUid));
      if (!caller || !callee) {
        return res.status(404).json({ success: false, error: 'Foydalanuvchi topilmadi' });
      }

      const mode: 'audio' | 'video' = callType === 'audio' ? 'audio' : 'video';
      const billing = calculateCallMinuteBilling(mode);
      const isCallerAdmin = isAdminTelegramUser(caller);

      // Male non-admin callers pay coins per connected minute
      if (caller.gender === 'male' && !isCallerAdmin) {
        if ((caller.coins || 0) < billing.coinCost) {
          return res.status(400).json({
            success: false,
            error: 'insufficient_coins',
            message: `${mode === 'audio' ? 'Audio' : 'Video'} qo'ng'iroqni davom ettirish uchun kamida ${billing.coinCost} moneta kerak!`,
          });
        }
        caller.coins = Math.max(0, (caller.coins || 0) - billing.coinCost);
        caller.updatedAt = new Date().toISOString();
        normalizeAndReleaseUser(caller);
        usersStore.set(caller.uid, caller);
        void walletRepository.syncUserWallet(caller);
      }

      // Female participants automatically earn diamonds per connected minute
      let earnedDiamonds = 0;
      const diamondBeneficiary = callee.gender === 'female' ? callee : (caller.gender === 'female' ? caller : null);
      if (diamondBeneficiary) {
        earnedDiamonds = billing.diamondReward;
        const progressResult = applyDiamondProgress(
          diamondBeneficiary.diamondProgress || 0,
          diamondBeneficiary.pendingDiamondBatches || [],
          earnedDiamonds,
          Date.now()
        );
        diamondBeneficiary.diamondProgress = progressResult.diamondProgress;
        diamondBeneficiary.pendingDiamondBatches = progressResult.pendingDiamondBatches;
        diamondBeneficiary.totalEarnedDiamonds = (diamondBeneficiary.totalEarnedDiamonds || 0) + earnedDiamonds;
        diamondBeneficiary.updatedAt = new Date().toISOString();
        normalizeAndReleaseUser(diamondBeneficiary);
        usersStore.set(diamondBeneficiary.uid, diamondBeneficiary);
        void walletRepository.syncUserWallet(diamondBeneficiary);

        const callTx = {
          id: 'tx_call_' + Date.now() + Math.random().toString(36).substring(2, 5),
          sender: caller.uid,
          receiver: diamondBeneficiary.uid,
          type: mode === 'audio' ? 'audio_call_minute' : 'video_call_minute',
          coinAmount: billing.coinCost,
          diamondAmount: earnedDiamonds,
          uzsAmount: billing.uzsEquivalent,
          status: 'completed',
          note: `${mode === 'audio' ? 'Audio' : 'Video'} qo'ng'iroq (${minuteIndex}-daqiqa): +${earnedDiamonds} olmos (${billing.uzsEquivalent.toLocaleString()} so'm)`,
          createdAt: new Date().toISOString(),
        };
        transactionsStore.unshift(callTx);
        void walletRepository.recordTransaction(callTx);

        if (progressResult.newlyLockedCount > 0) {
          const lockTx = {
            id: 'tx_limit_' + Date.now() + Math.random().toString(36).substring(2, 5),
            receiver: diamondBeneficiary.uid,
            type: 'diamond_limit_locked',
            diamondAmount: progressResult.newlyLockedCount * 100,
            uzsAmount: calculateDiamondsToUzs(progressResult.newlyLockedCount * 100),
            status: 'pending',
            note: '100 ta olmos limiti to\'ldi — 12 soat ichida asosiy hamyonga qo\'shiladi',
            createdAt: new Date().toISOString(),
          };
          transactionsStore.unshift(lockTx);
          void walletRepository.recordTransaction(lockTx);
        }
      }

      saveUsersToDisk();
      saveTransactionsToDisk();
      io.emit('user_updated', caller);
      if (callee.uid !== caller.uid) {
        io.emit('user_updated', callee);
      }

      res.json({
        success: true,
        billing,
        earnedDiamonds,
        caller,
        callee,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/wallet/topup', (req, res) => {
    try {
      const { uid, coinAmount, paymentMethod = 'click' } = req.body;
      if (!uid || !coinAmount || coinAmount <= 0) {
        return res.status(400).json({ error: 'Valid uid and coinAmount required' });
      }
      const user = usersStore.get(uid);
      if (!user) {
        return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
      }
      user.coins = (user.coins || 0) + Number(coinAmount);
      user.updatedAt = new Date().toISOString();
      normalizeAndReleaseUser(user);
      usersStore.set(uid, user);
      saveUsersToDisk();
      void walletRepository.syncUserWallet(user);

      const tx = {
        id: 'tx_' + Date.now() + Math.random().toString(36).substring(2, 6),
        sender: uid,
        type: 'topup',
        coinAmount: Number(coinAmount),
        paymentMethod,
        status: 'completed',
        note: `${coinAmount} moneta xarid qilindi (${paymentMethod.toUpperCase()})`,
        createdAt: new Date().toISOString()
      };
      transactionsStore.unshift(tx);
      void walletRepository.recordTransaction(tx);
      saveTransactionsToDisk();

      io.emit('user_updated', user);
      res.json({ success: true, user, wallet: user.wallet, transaction: tx });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Coin Shop Purchase Request ("Ariza") — lands in Admin Panel for approval
  app.post('/api/wallet/topup-request', (req, res) => {
    try {
      const { uid, coinAmount, paymentMethod = 'click', note = '' } = req.body || {};
      const parsedAmount = Math.floor(Number(coinAmount));
      if (!uid || !parsedAmount || parsedAmount <= 0) {
        return res.status(400).json({ success: false, error: 'Yaroqli foydalanuvchi va moneta miqdorini tanlang' });
      }
      const user = usersStore.get(uid);
      if (!user) {
        return res.status(404).json({ success: false, error: 'Foydalanuvchi topilmadi' });
      }

      const coinReq = buildCoinPurchaseRequest({
        user,
        coinAmount: parsedAmount,
        paymentMethod,
        note,
      });

      coinRequestsStore.unshift(coinReq);
      saveCoinRequestsToDisk();

      const tx = {
        id: 'tx_cr_' + Date.now() + Math.random().toString(36).substring(2, 6),
        sender: uid,
        type: 'topup_request',
        coinAmount: coinReq.coinAmount,
        uzsAmount: coinReq.uzsAmount,
        paymentMethod: coinReq.paymentMethod,
        status: 'pending',
        note: `${coinReq.coinAmount} moneta (${coinReq.uzsAmount.toLocaleString()} so'm) xarid arizasi yuborildi`,
        createdAt: coinReq.createdAt,
      };
      transactionsStore.unshift(tx);
      void walletRepository.recordTransaction(tx);
      saveTransactionsToDisk();

      io.emit('coin_request_created', coinReq);
      res.json({ success: true, request: coinReq });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/wallet/topup-requests/:uid', (req, res) => {
    const { uid } = req.params;
    const list = coinRequestsStore.filter((r) => r.userUid === uid);
    res.json({ success: true, requests: list });
  });

  app.post('/api/wallet/withdraw', (req, res) => {
    try {
      const { uid, diamondAmount, bankCard } = req.body;
      const user = usersStore.get(uid);
      if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

      const count = Math.floor(Number(diamondAmount));
      if (isNaN(count) || count < 100) {
        return res.status(400).json({ error: 'Minimal yechib olish miqdori 100 almaz (10 000 so\'m)' });
      }
      if ((user.diamonds || 0) < count) {
        return res.status(400).json({ error: 'Balansingizda yetarli almaz mavjud emas' });
      }
      if (!bankCard || bankCard.trim().replace(/\D/g, '').length < 16) {
        return res.status(400).json({ error: '16 xonali Humo/Uzcard karta raqamini kiriting' });
      }

      const uzsAmount = calculateDiamondsToUzs(count);
      user.diamonds = (user.diamonds || 0) - count;
      user.totalWithdrawnUzs = (user.totalWithdrawnUzs || 0) + uzsAmount;
      user.bankCard = bankCard.trim();
      user.updatedAt = new Date().toISOString();
      normalizeAndReleaseUser(user);
      usersStore.set(uid, user);
      saveUsersToDisk();
      void walletRepository.syncUserWallet(user);

      const wReq = {
        id: 'wd_' + Date.now() + Math.random().toString(36).substring(2, 6),
        userUid: uid,
        userName: user.name,
        userCard: bankCard.trim(),
        diamondAmount: count,
        uzsAmount,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      withdrawalsStore.unshift(wReq);
      void walletRepository.recordWithdrawal(wReq);
      saveWithdrawalsToDisk();

      const tx = {
        id: 'tx_' + Date.now() + Math.random().toString(36).substring(2, 6),
        sender: uid,
        type: 'withdraw',
        diamondAmount: count,
        uzsAmount,
        status: 'pending',
        note: `${count} almaz (${uzsAmount.toLocaleString()} so'm) yechib olish uchun ariza`,
        createdAt: new Date().toISOString()
      };
      transactionsStore.unshift(tx);
      void walletRepository.recordTransaction(tx);
      saveTransactionsToDisk();

      io.emit('user_updated', user);
      res.json({ success: true, user, wallet: user.wallet, withdrawal: wReq });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/wallet/history/:uid', async (req, res) => {
    const { uid } = req.params;
    const ledger = await walletRepository.getWalletLedger(uid, transactionsStore, withdrawalsStore);
    res.json({ success: true, ...ledger });
  });

  app.post('/api/gifts/send', (req, res) => {
    try {
      const { senderUid, recipientUid, giftId, giftName, coinPrice, giftIcon } = req.body;
      const sender = usersStore.get(senderUid);
      const recipient = usersStore.get(recipientUid);

      if (!sender) return res.status(404).json({ error: 'Yuboruvchi topilmadi' });
      if (!recipient) return res.status(404).json({ error: 'Qabul qiluvchi topilmadi' });

      const cost = Number(coinPrice) || 10;
      const isAdminSender = isAdminTelegramUser(sender);
      if (!isAdminSender && (sender.coins || 0) < cost) {
        return res.status(400).json({ error: 'Monetalaringiz yetarli emas! Iltimos, balansingizni to\'ldiring.' });
      }

      if (!isAdminSender) {
        sender.coins = (sender.coins || 0) - cost;
        usersStore.set(senderUid, sender);
      }

      const diamondEarned = Math.floor(cost * 0.6);
      recipient.diamonds = (recipient.diamonds || 0) + diamondEarned;
      recipient.totalEarnedDiamonds = (recipient.totalEarnedDiamonds || 0) + diamondEarned;
      normalizeAndReleaseUser(sender);
      normalizeAndReleaseUser(recipient);
      usersStore.set(senderUid, sender);
      usersStore.set(recipientUid, recipient);

      saveUsersToDisk();
      void walletRepository.syncUserWallet(sender);
      void walletRepository.syncUserWallet(recipient);

      const tx = {
        id: 'tx_' + Date.now() + Math.random().toString(36).substring(2, 6),
        sender: senderUid,
        receiver: recipientUid,
        type: 'gift',
        coinAmount: cost,
        diamondAmount: diamondEarned,
        uzsAmount: calculateDiamondsToUzs(diamondEarned),
        status: 'completed',
        note: `Sovg'a: ${giftName} (${cost} moneta)`,
        createdAt: new Date().toISOString()
      };
      transactionsStore.unshift(tx);
      void walletRepository.recordTransaction(tx);
      saveTransactionsToDisk();

      const chatId = [senderUid, recipientUid].sort().join('_');
      const giftMsg = {
        id: 'msg_' + Date.now() + Math.random().toString(36).substring(2, 5),
        senderId: senderUid,
        senderName: sender.name,
        text: `🎁 Sovg'a yuborildi: ${giftName} ${giftIcon || '✨'} (+${diamondEarned} Almaz)`,
        type: 'gift',
        giftInfo: { giftId, giftName, giftIcon, coinPrice: cost, diamondEarned },
        status: 'read',
        read: true,
        createdAt: new Date().toISOString(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (!chatMessagesStore[chatId]) chatMessagesStore[chatId] = [];
      chatMessagesStore[chatId].push(giftMsg);
      userChatsStore[chatId] = {
        id: chatId,
        participants: [senderUid, recipientUid],
        lastMessage: giftMsg.text,
        lastSenderId: senderUid,
        updatedAt: new Date().toISOString()
      };
      saveMessagesToDisk();
      saveChatsToDisk();

      const payload = { chatId, message: giftMsg, senderId: senderUid, recipientId: recipientUid };
      io.to(chatId).emit('receive_message', payload);
      io.to(chatId).emit('chat:message', payload);
      io.to(`user_${recipientUid}`).emit('receive_message', payload);
      io.to(`user_${senderUid}`).emit('user_updated', sender);
      io.to(`user_${recipientUid}`).emit('user_updated', recipient);

      res.json({ success: true, sender, recipient, giftMessage: giftMsg });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Gender & Platform Stats API ---
  app.get('/api/stats/gender', (_req, res) => {
    const allUsers = Array.from(usersStore.values());
    let male = 0;
    let female = 0;
    allUsers.forEach(u => {
      if (u.gender === 'male') male++;
      else if (u.gender === 'female') female++;
    });
    const total = male + female;
    const malePercent = total > 0 ? Math.round((male / total) * 100) : 50;
    const femalePercent = 100 - malePercent;
    res.json({
      success: true,
      totalUsers: allUsers.length,
      maleCount: male,
      femaleCount: female,
      malePercent,
      femalePercent,
      onlineCount: presenceRegistry.getOnlineCount()
    });
  });

  // --- Social Posts CRUD (Photo, Video, Music, Text + Likes & Comments) ---
  function enrichPost(post: PostItem): PostItem {
    const author = usersStore.get(post.authorUid);
    const enrichedComments = (Array.isArray(post.comments) ? post.comments : []).map((c) => {
      const commentAuthor = usersStore.get(c.authorUid);
      return {
        ...c,
        authorName: commentAuthor?.name || c.authorName,
        authorUsername: commentAuthor?.username || c.authorUsername || '',
        authorAvatar: commentAuthor?.avatar || c.authorAvatar || '',
        authorId: commentAuthor?.id || c.authorId,
      };
    });
    return {
      ...post,
      authorName: author?.name || post.authorName,
      authorUsername: author?.username || post.authorUsername || '',
      authorAvatar: author?.avatar || post.authorAvatar || '',
      authorId: author?.id || post.authorId,
      authorGender: author?.gender || post.authorGender,
      authorVerified: Boolean(author?.faceId?.verified || author?.isVerified || post.authorVerified),
      comments: enrichedComments,
    };
  }

  app.get('/api/posts', (req, res) => {
    const authorUid = req.query.authorUid ? String(req.query.authorUid) : '';
    const viewerUid = req.query.viewerUid ? String(req.query.viewerUid) : '';
    const viewerUser = viewerUid ? usersStore.get(viewerUid) || null : null;

    const filtered = authorUid
      ? postsStore.filter((p) => p.authorUid === authorUid)
      : postsStore;
    const sorted = [...filtered]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(enrichPost)
      .filter((p) => isPostVisibleToViewer(p, viewerUser));
    res.json({ success: true, posts: sorted });
  });

  app.post('/api/posts', (req, res) => {
    try {
      const {
        authorUid,
        type = 'photo',
        caption = '',
        mediaUrl = '',
        embedUrl = '',
        mediaProvider = '',
        isVerticalVideo = false,
        coverUrl = '',
        audioTitle = '',
        audioArtist = '',
      } = req.body || {};
      if (!authorUid) {
        return res.status(400).json({ success: false, error: 'Avtor aniqlanmadi' });
      }
      const author = usersStore.get(authorUid);
      const safeType = ['photo', 'video', 'music', 'text'].includes(type) ? type : 'text';
      if (safeType !== 'text' && !String(mediaUrl || embedUrl).trim()) {
        return res.status(400).json({ success: false, error: 'Media fayli yoki havolasi talab qilinadi' });
      }
      if (safeType === 'text' && !String(caption).trim()) {
        return res.status(400).json({ success: false, error: 'Post matnini kiriting' });
      }

      const newPost: PostItem = {
        id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        authorUid,
        authorId: author?.id,
        authorName: author?.name || 'Foydalanuvchi',
        authorUsername: author?.username || '',
        authorAvatar: author?.avatar || '',
        authorGender: author?.gender,
        authorVerified: Boolean(author?.faceId?.verified || author?.isVerified),
        type: safeType,
        caption: String(caption || '').trim(),
        mediaUrl: String(mediaUrl || '').trim() || undefined,
        embedUrl: String(embedUrl || '').trim() || undefined,
        mediaProvider: String(mediaProvider || '').trim() || undefined,
        isVerticalVideo: Boolean(isVerticalVideo),
        coverUrl: String(coverUrl || '').trim() || undefined,
        audioTitle: String(audioTitle || '').trim() || undefined,
        audioArtist: String(audioArtist || '').trim() || undefined,
        likes: [],
        comments: [],
        createdAt: new Date().toISOString(),
      };
      postsStore.unshift(newPost);
      savePostsToDisk();
      const enriched = enrichPost(newPost);
      io.emit('post_created', enriched);
      res.json({ success: true, post: enriched });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/posts/:postId/like', (req, res) => {
    try {
      const { postId } = req.params;
      const { uid } = req.body || {};
      if (!uid) return res.status(400).json({ success: false, error: 'uid talab qilinadi' });
      const idx = postsStore.findIndex((p) => p.id === postId);
      if (idx === -1) return res.status(404).json({ success: false, error: 'Post topilmadi' });

      const { post: nextPost, liked } = togglePostLike(postsStore[idx], uid);
      postsStore[idx] = nextPost;
      savePostsToDisk();

      const author = usersStore.get(nextPost.authorUid);
      if (author) {
        author.likesCount = computeAuthorTotalLikes(postsStore, author.uid);
        usersStore.set(author.uid, author);
        saveUsersToDisk();
        io.emit('user_updated', author);
      }

      const enriched = enrichPost(nextPost);
      io.emit('post_updated', enriched);
      res.json({ success: true, liked, post: enriched });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/posts/:postId/comments', (req, res) => {
    try {
      const { postId } = req.params;
      const { authorUid, text } = req.body || {};
      if (!authorUid || !String(text || '').trim()) {
        return res.status(400).json({ success: false, error: 'Izoh matni kiritilmagan' });
      }
      const idx = postsStore.findIndex((p) => p.id === postId);
      if (idx === -1) return res.status(404).json({ success: false, error: 'Post topilmadi' });

      const commentAuthor = usersStore.get(authorUid);
      const comment: PostComment = {
        id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        postId,
        authorUid,
        authorId: commentAuthor?.id,
        authorName: commentAuthor?.name || 'Foydalanuvchi',
        authorUsername: commentAuthor?.username || '',
        authorAvatar: commentAuthor?.avatar || '',
        text: String(text).trim(),
        createdAt: new Date().toISOString(),
      };

      const nextPost = appendPostComment(postsStore[idx], comment);
      postsStore[idx] = nextPost;
      savePostsToDisk();

      const enriched = enrichPost(nextPost);
      io.emit('post_updated', enriched);
      res.json({ success: true, comment, post: enriched });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  function cleanupOrphanedLocalMedia(candidateUrls: Array<string | undefined>) {
    for (const rawUrl of candidateUrls) {
      const url = String(rawUrl || '').trim();
      if (!url.startsWith('/api/media/')) continue;
      const safeName = path.basename(url.slice('/api/media/'.length)).replace(/[^a-zA-Z0-9._-]/g, '');
      if (!safeName) continue;
      const canonicalUrl = `/api/media/${safeName}`;

      const stillReferencedByPosts = postsStore.some(
        (p) => p.mediaUrl === canonicalUrl || p.coverUrl === canonicalUrl
      );
      if (stillReferencedByPosts) continue;

      let stillReferencedByUsers = false;
      for (const u of usersStore.values()) {
        if (
          u.avatar === canonicalUrl ||
          u.banner === canonicalUrl ||
          u.faceId?.capturedPhotoUrl === canonicalUrl
        ) {
          stillReferencedByUsers = true;
          break;
        }
      }
      if (stillReferencedByUsers) continue;

      const diskPath = path.join(MEDIA_UPLOADS_DIR, safeName);
      if (fs.existsSync(diskPath)) {
        try {
          fs.unlinkSync(diskPath);
        } catch {}
      }
    }
  }

  app.delete('/api/posts/:postId', (req, res) => {
    try {
      const { postId } = req.params;
      const requesterUid = String(req.body?.uid || req.query.uid || '');
      const idx = postsStore.findIndex((p) => p.id === postId);
      if (idx === -1) return res.status(404).json({ success: false, error: 'Post topilmadi' });

      const target = postsStore[idx];
      if (target.authorUid !== requesterUid && !getVerifiedAdmin(requesterUid)) {
        return res.status(403).json({ success: false, error: 'Postni o\'chirish huquqi yo\'q' });
      }
      postsStore.splice(idx, 1);
      savePostsToDisk();

      cleanupOrphanedLocalMedia([target.mediaUrl, target.coverUrl]);

      const author = usersStore.get(target.authorUid);
      if (author) {
        author.likesCount = computeAuthorTotalLikes(postsStore, author.uid);
        usersStore.set(author.uid, author);
        saveUsersToDisk();
        io.emit('user_updated', author);
      }

      io.emit('post_deleted', { postId });
      res.json({ success: true, postId });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Admin Endpoints (@Salikh_07 / role: admin) ---
  function getVerifiedAdmin(adminUid: string) {
    if (!adminUid) return null;
    const adminUser = usersStore.get(adminUid);
    if (!adminUser || !isAdminTelegramUser(adminUser)) return null;
    return adminUser;
  }

  app.get('/api/admin/overview', (req, res) => {
    const adminUid = String(req.query.adminUid || '');
    if (!getVerifiedAdmin(adminUid)) {
      return res.status(403).json({ success: false, error: 'Admin huquqi talab qilinadi' });
    }
    let totalCoins = 0;
    let totalDiamonds = 0;
    let pendingDiamonds = 0;
    let onlineUsers = 0;

    const users = Array.from(usersStore.values()).map((u) => {
      normalizeAndReleaseUser(u);
      totalCoins += Number(u.coins || 0);
      totalDiamonds += Number(u.diamonds || 0);
      pendingDiamonds += getPendingDiamondsTotal(u.pendingDiamondBatches);
      if (u.isOnline || u.status === 'online') onlineUsers += 1;
      return u;
    });

    res.json({
      success: true,
      stats: {
        totalUsers: users.length,
        onlineUsers,
        totalCoins,
        totalDiamonds,
        pendingDiamonds,
        pendingWithdrawalsCount: withdrawalsStore.filter((w) => w.status === 'pending').length,
        pendingCoinRequestsCount: coinRequestsStore.filter((r) => r.status === 'pending').length,
      },
      users,
      withdrawals: withdrawalsStore,
      coinRequests: coinRequestsStore,
      transactions: transactionsStore.slice(0, 120),
    });
  });

  app.post('/api/admin/user-action', (req, res) => {
    try {
      const { adminUid, targetUid, action, coins, diamonds } = req.body;
      if (!getVerifiedAdmin(adminUid)) {
        return res.status(403).json({ success: false, error: 'Admin huquqi talab qilinadi' });
      }
      const target = usersStore.get(targetUid);
      if (!target) {
        return res.status(404).json({ success: false, error: 'Foydalanuvchi topilmadi' });
      }

      if (action === 'set_balances') {
        if (coins !== undefined && !isNaN(Number(coins))) target.coins = Math.max(0, Math.floor(Number(coins)));
        if (diamonds !== undefined && !isNaN(Number(diamonds))) target.diamonds = Math.max(0, Math.floor(Number(diamonds)));
      } else if (action === 'unlock_pending_diamonds') {
        const pendingTotal = getPendingDiamondsTotal(target.pendingDiamondBatches);
        if (pendingTotal > 0) {
          target.diamonds = (target.diamonds || 0) + pendingTotal;
          target.pendingDiamondBatches = [];
          transactionsStore.unshift({
            id: 'tx_admin_unlock_' + Date.now(),
            receiver: targetUid,
            type: 'diamond_unlock',
            diamondAmount: pendingTotal,
            status: 'completed',
            note: `Admin tomonidan ${pendingTotal} almaz walletga chiqarildi`,
            createdAt: new Date().toISOString()
          });
          saveTransactionsToDisk();
        }
      } else if (action === 'toggle_verify') {
        target.isVerified = !target.isVerified;
      } else if (action === 'toggle_ban') {
        target.isBanned = !target.isBanned;
      } else if (action === 'toggle_admin') {
        const handle = normalizeTelegramHandle(target.telegram);
        if (handle === 'salikh_07') {
          return res.status(400).json({ success: false, error: 'Asosiy bosh admin maqomini olib bo\'lmaydi' });
        }
        target.role = target.role === 'admin' ? 'user' : 'admin';
        target.isAdmin = target.role === 'admin';
      } else if (action === 'delete_user') {
        if (targetUid === adminUid || normalizeTelegramHandle(target.telegram) === 'salikh_07') {
          return res.status(400).json({ success: false, error: 'Adminni o\'chirib bo\'lmaydi' });
        }
        usersStore.delete(targetUid);
        saveUsersToDisk();
        io.emit('user_deleted', { uid: targetUid });
        return res.json({ success: true, deletedUid: targetUid });
      }

      target.updatedAt = new Date().toISOString();
      usersStore.set(targetUid, target);
      saveUsersToDisk();
      io.emit('user_updated', target);
      res.json({ success: true, user: target });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/admin/withdrawal-action', (req, res) => {
    try {
      const { adminUid, withdrawalId, action } = req.body;
      if (!getVerifiedAdmin(adminUid)) {
        return res.status(403).json({ success: false, error: 'Admin huquqi talab qilinadi' });
      }
      const wReq = withdrawalsStore.find((w) => w.id === withdrawalId);
      if (!wReq) {
        return res.status(404).json({ success: false, error: 'Ariza topilmadi' });
      }
      if (wReq.status !== 'pending') {
        return res.status(400).json({ success: false, error: 'Bu ariza allaqachon ko\'rib chiqilgan' });
      }

      wReq.status = action === 'approve' ? 'approved' : 'rejected';
      wReq.reviewedAt = new Date().toISOString();
      wReq.reviewedBy = adminUid;
      saveWithdrawalsToDisk();

      let updatedUser: any = null;
      if (action === 'reject') {
        const user = usersStore.get(wReq.userUid);
        if (user) {
          user.diamonds = (user.diamonds || 0) + Number(wReq.diamondAmount || 0);
          user.updatedAt = new Date().toISOString();
          usersStore.set(user.uid, user);
          saveUsersToDisk();
          io.emit('user_updated', user);
          updatedUser = user;
        }
      }

      res.json({ success: true, withdrawal: wReq, user: updatedUser });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/admin/coin-request-action', (req, res) => {
    try {
      const { adminUid, requestId, action } = req.body || {};
      if (!getVerifiedAdmin(adminUid)) {
        return res.status(403).json({ success: false, error: 'Admin huquqi talab qilinadi' });
      }
      if (action !== 'approve' && action !== 'reject') {
        return res.status(400).json({ success: false, error: 'Noto\'g\'ri amal' });
      }
      const reqItem = coinRequestsStore.find((r) => r.id === requestId);
      if (!reqItem) {
        return res.status(404).json({ success: false, error: 'Ariza topilmadi' });
      }
      if (!canReviewCoinRequest(reqItem)) {
        return res.status(400).json({ success: false, error: 'Bu ariza allaqachon ko\'rib chiqilgan' });
      }

      reqItem.status = action === 'approve' ? 'approved' : 'rejected';
      reqItem.reviewedAt = new Date().toISOString();
      reqItem.reviewedBy = adminUid;
      saveCoinRequestsToDisk();

      let updatedUser: any = null;
      if (action === 'approve') {
        const user = usersStore.get(reqItem.userUid);
        if (user) {
          user.coins = (user.coins || 0) + Number(reqItem.coinAmount || 0);
          user.updatedAt = new Date().toISOString();
          normalizeAndReleaseUser(user);
          usersStore.set(user.uid, user);
          saveUsersToDisk();
          void walletRepository.syncUserWallet(user);
          io.emit('user_updated', user);
          updatedUser = user;
        }
        const tx = {
          id: 'tx_cr_app_' + Date.now() + Math.random().toString(36).substring(2, 5),
          receiver: reqItem.userUid,
          type: 'topup',
          coinAmount: Number(reqItem.coinAmount || 0),
          uzsAmount: Number(reqItem.uzsAmount || 0),
          paymentMethod: reqItem.paymentMethod,
          status: 'completed',
          note: `Admin tasdiqladi: +${reqItem.coinAmount} moneta (${reqItem.paymentMethod.toUpperCase()})`,
          createdAt: new Date().toISOString(),
        };
        transactionsStore.unshift(tx);
        void walletRepository.recordTransaction(tx);
        saveTransactionsToDisk();
      } else {
        const tx = {
          id: 'tx_cr_rej_' + Date.now() + Math.random().toString(36).substring(2, 5),
          receiver: reqItem.userUid,
          type: 'topup_request',
          coinAmount: Number(reqItem.coinAmount || 0),
          uzsAmount: Number(reqItem.uzsAmount || 0),
          paymentMethod: reqItem.paymentMethod,
          status: 'rejected',
          note: `Moneta xaridi arizasi rad etildi (${reqItem.coinAmount} moneta)`,
          createdAt: new Date().toISOString(),
        };
        transactionsStore.unshift(tx);
        void walletRepository.recordTransaction(tx);
        saveTransactionsToDisk();
      }

      io.emit('coin_request_updated', reqItem);
      res.json({ success: true, request: reqItem, user: updatedUser });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Live Streams Endpoints ---
  app.get('/api/live-streams', (_req, res) => {
    const activeStreams = Object.values(liveStreamsStore).filter((s: any) => s.status === 'active');
    res.json({ success: true, streams: activeStreams });
  });

  app.post('/api/live-streams/start', (req, res) => {
    try {
      const { streamId, hostUid, hostName, hostAvatar, title } = req.body;
      if (!streamId || !hostUid) {
        return res.status(400).json({ error: 'streamId and hostUid are required' });
      }
      const streamData = {
        id: streamId,
        hostUid,
        hostName: hostName || 'Alov Strimer',
        hostAvatar: hostAvatar || '',
        title: title || 'Jonli Efir 🔥',
        status: 'active',
        viewerCount: 1,
        startedAt: new Date().toISOString()
      };
      liveStreamsStore[streamId] = streamData;

      // Update user isLive state
      const hostUser = usersStore.get(hostUid);
      if (hostUser) {
        const updatedHost = { ...hostUser, isLive: true, liveStreamId: streamId, liveTitle: title };
        usersStore.set(hostUid, updatedHost);
        io.emit('user_updated', updatedHost);
      }

      io.emit('stream_started', streamData);
      res.json({ success: true, stream: streamData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/live-streams/stop', (req, res) => {
    try {
      const { streamId, hostUid } = req.body;
      if (streamId && liveStreamsStore[streamId]) {
        liveStreamsStore[streamId].status = 'ended';
      }
      if (hostUid) {
        const hostUser = usersStore.get(hostUid);
        if (hostUser) {
          const updatedHost = { ...hostUser, isLive: false, liveStreamId: null, liveTitle: null };
          usersStore.set(hostUid, updatedHost);
          io.emit('user_updated', updatedHost);
        }
      }
      io.emit('stream_stopped', { streamId, hostUid });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  app.post('/api/moderation/check-image', (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.json({ safe: true });
      }
      res.json({ safe: true });
    } catch (err) {
      res.json({ safe: true });
    }
  });

  // GET /api/chats/:chatId/messages
  app.get('/api/chats/:chatId/messages', (req, res) => {
    const { chatId } = req.params;
    const messages = chatMessagesStore[chatId] || [];
    const friendship = chatFriendshipsStore[chatId] || { active: false };
    res.json({ success: true, messages, friendship });
  });

  // GET /api/chats/user/:uid
  app.get('/api/chats/user/:uid', (req, res) => {
    const { uid } = req.params;
    const userChats = Object.values(userChatsStore).filter(
      (chat: any) => chat.participants && chat.participants.includes(uid)
    );
    res.json({ success: true, chats: userChats });
  });

  app.get('/robots.txt', (_req, res) => {
    const robotsPath = path.resolve(__dirname, 'public', 'robots.txt');
    if (fs.existsSync(robotsPath)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.sendFile(robotsPath);
    }
    res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://alov.uz/sitemap.xml\n');
  });

  app.get('/llms.txt', (_req, res) => {
    const llmsPath = path.resolve(__dirname, 'public', 'llms.txt');
    if (fs.existsSync(llmsPath)) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      return res.sendFile(llmsPath);
    }
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    return res.send("# Alov.uz\n\nO'zbekistonning Face ID bilan tasdiqlangan tanishuv va jonli muloqot platformasi.\n");
  });

  app.get('/.well-known/ard.json', (_req, res) => {
    const ardPath = path.resolve(__dirname, 'public', '.well-known', 'ard.json');
    if (fs.existsSync(ardPath)) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.sendFile(ardPath);
    }
    return res.json({
      name: 'Alov.uz',
      description: "O'zbekistonning Face ID bilan tasdiqlangan zamonaviy tanishuv, postlar va jonli efir platformasi.",
      url: 'https://alov.uz',
      language: 'uz',
    });
  });

  // Setup Vite in development or static serve in production
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  io.on('connection', (socket) => {
    console.log('Client connected via Socket.io:', socket.id);
    presenceRegistry.connectSocket(socket.id);
    broadcastActiveUsersCount();

    // Register user socket for direct personal messaging bridge & true presence
    socket.on('register_user', (uid) => {
      if (uid) {
        socket.join(`user_${uid}`);
        const res = presenceRegistry.registerUser(socket.id, uid);

        if (res.previousUid && res.removedPreviousUidOffline) {
          socket.leave(`user_${res.previousUid}`);
          const prevUser = usersStore.get(res.previousUid);
          if (prevUser) {
            prevUser.isOnline = false;
            prevUser.status = 'offline';
            prevUser.lastSeen = new Date().toISOString();
            usersStore.set(res.previousUid, prevUser);
            io.emit('user_updated', prevUser);
          }
        }

        const user = usersStore.get(uid);
        if (user) {
          user.isOnline = true;
          user.status = 'online';
          user.lastSeen = new Date().toISOString();
          usersStore.set(uid, user);
          io.emit('user_updated', user);
        }
        broadcastActiveUsersCount();
      }
    });

    socket.on('unregister_user', (uid) => {
      const targetUid = typeof uid === 'string' ? uid : undefined;
      if (targetUid) socket.leave(`user_${targetUid}`);
      const res = presenceRegistry.unregisterUser(socket.id, targetUid);
      if (res.becameOffline && res.uid) {
        const user = usersStore.get(res.uid);
        if (user) {
          user.isOnline = false;
          user.status = 'offline';
          user.lastSeen = new Date().toISOString();
          usersStore.set(res.uid, user);
          saveUsersToDisk();
          io.emit('user_updated', user);
        }
      }
      broadcastActiveUsersCount();
    });

    socket.on('presence_heartbeat', ({ uid }: { uid?: string } = {}) => {
      presenceRegistry.heartbeat(socket.id, uid);
    });

    socket.on('join_chat', (chatId) => {
      socket.join(chatId);
    });

    // Real-time GPS Location Update Event for ALL users (Telegram & Firebase)
    socket.on('update_location', ({ uid, location, isLocationEnabled, locationVisibility }) => {
      if (!uid || !location || location.lat == null || location.lng == null) return;
      const user = usersStore.get(uid);
      if (user) {
        user.location = {
          lat: Number(location.lat),
          lng: Number(location.lng),
          accuracy: location.accuracy,
        };
        if (isLocationEnabled !== undefined) user.isLocationEnabled = Boolean(isLocationEnabled);
        if (locationVisibility) user.locationVisibility = locationVisibility;
        user.isOnline = true;
        user.status = 'online';
        user.updatedAt = new Date().toISOString();
        usersStore.set(uid, user);
        saveUsersToDisk();
        io.emit('user_updated', user);
      }
    });

    const handleIncomingMessage = async (data: any, callback?: Function) => {
      const { chatId, message, senderId, recipientId } = data;
      const senderUser = usersStore.get(senderId);
      const recipientUser = usersStore.get(recipientId);
      const isAIBot = chatId.includes('user_kamola_006') || recipientId === 'user_kamola_006' || chatId.includes('ALOV-006') || recipientId === 'ALOV-006' || chatId.includes('alov_ai_bot') || recipientId === 'alov_ai_bot';

      if (senderUser?.isBanned) {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'user_banned', message: 'Sizning hisobingiz admin tomonidan bloklangan.' });
        }
        return;
      }

      const isFriendFreeChat = Boolean(chatFriendshipsStore[chatId]?.active);
      const isAdminSender = isAdminTelegramUser(senderUser);

      // --- PAID MESSAGE & TOKENOMICS LOGIC (5 Moneta) ---
      if (canChargeForMessage({ senderGender: senderUser?.gender, isAIBot, isFriendFreeChat, isAdminSender })) {
        const currentCoins = senderUser.coins !== undefined ? senderUser.coins : 100;
        if (currentCoins < MESSAGE_COIN_COST) {
          if (typeof callback === 'function') {
            callback({
              success: false,
              error: 'insufficient_coins',
              message: `Monetangiz yetarli emas! Xabar yuborish uchun ${MESSAGE_COIN_COST} moneta kerak.`
            });
          }
          io.to(`user_${senderId}`).emit('insufficient_coins', {
            message: `Monetalaringiz yetarli emas! Har bir xabar narxi ${MESSAGE_COIN_COST} moneta.`
          });
          return;
        }

        // Deduct 5 coins
        senderUser.coins = currentCoins - MESSAGE_COIN_COST;
        usersStore.set(senderId, senderUser);
        saveUsersToDisk();

        // Create Pending Transaction (5 diamonds reward upon female reply)
        const pendingTx = {
          id: 'tx_msg_' + message.id,
          sender: senderId,
          receiver: recipientId,
          type: 'message_paid',
          coinAmount: MESSAGE_COIN_COST,
          diamondAmount: MESSAGE_DIAMOND_REWARD,
          status: 'pending',
          note: `Xabar uchun to'lov (${MESSAGE_COIN_COST} moneta — javob kutilmoqda)`,
          createdAt: new Date().toISOString()
        };
        transactionsStore.unshift(pendingTx);
        saveTransactionsToDisk();

        io.to(`user_${senderId}`).emit('user_updated', senderUser);
        io.emit('user_updated', senderUser);
      }

      // If female user replies to a male user, convert pending transactions and fill 0-100% diamond limit
      if (senderUser && senderUser.gender === 'female' && recipientUser && recipientUser.gender === 'male') {
        let totalNewDiamonds = 0;
        for (const tx of transactionsStore) {
          if (tx.sender === recipientId && tx.receiver === senderId && tx.type === 'message_paid' && tx.status === 'pending') {
            tx.status = 'completed';
            tx.note = 'Xabarga javob berildi (limitga qo\'shildi)';
            totalNewDiamonds += (tx.diamondAmount || MESSAGE_DIAMOND_REWARD);
          }
        }
        if (totalNewDiamonds > 0) {
          const progressResult = applyDiamondProgress(
            senderUser.diamondProgress || 0,
            senderUser.pendingDiamondBatches || [],
            totalNewDiamonds,
            Date.now()
          );
          senderUser.diamondProgress = progressResult.diamondProgress;
          senderUser.pendingDiamondBatches = progressResult.pendingDiamondBatches;
          senderUser.totalEarnedDiamonds = (senderUser.totalEarnedDiamonds || 0) + totalNewDiamonds;
          normalizeAndReleaseUser(senderUser);
          if (progressResult.newlyLockedCount > 0) {
            const lockTx = {
              id: 'tx_limit_' + Date.now() + Math.random().toString(36).substring(2, 5),
              receiver: senderId,
              type: 'diamond_limit_locked',
              diamondAmount: progressResult.newlyLockedCount * 100,
              uzsAmount: calculateDiamondsToUzs(progressResult.newlyLockedCount * 100),
              status: 'pending',
              note: '100 ta olmos limiti to\'ldi — 12 soat ichida asosiy hamyonga qo\'shiladi',
              createdAt: new Date().toISOString()
            };
            transactionsStore.unshift(lockTx);
            void walletRepository.recordTransaction(lockTx);
          }
          usersStore.set(senderId, senderUser);
          saveUsersToDisk();
          saveTransactionsToDisk();
          void walletRepository.syncUserWallet(senderUser);
          io.to(`user_${senderId}`).emit('user_updated', senderUser);
          io.emit('user_updated', senderUser);
        }
      }

      const deliveredMessage = {
        ...message,
        senderId: senderId,
        senderName: message.senderName || senderUser?.name || 'Foydalanuvchi',
        senderAvatar: message.senderAvatar || senderUser?.avatar || '',
        sender: {
          _id: senderId,
          uid: senderId,
          name: message.senderName || senderUser?.name || 'Foydalanuvchi',
          avatar: message.senderAvatar || senderUser?.avatar || ''
        },
        status: 'sent',
        read: false
      };
      const payload = { chatId, message: deliveredMessage, senderId, recipientId };

      // Ack callback to sender immediately
      if (typeof callback === 'function') {
        callback({ success: true, messageId: message.id, status: 'sent' });
      }

      // Store in server memory
      if (!chatMessagesStore[chatId]) {
        chatMessagesStore[chatId] = [];
      }
      // Deduplicate by message id if sent rapidly
      if (!chatMessagesStore[chatId].some((m: any) => m.id === message.id)) {
        chatMessagesStore[chatId].push(payload.message);
        if (chatMessagesStore[chatId].length > 250) {
          chatMessagesStore[chatId].shift(); // limit history buffer
        }
      }

      userChatsStore[chatId] = {
        id: chatId,
        participants: [senderId, recipientId].filter(Boolean),
        lastMessage: message.text || (message.type === 'image' ? 'Rasm 🖼️' : (message.type === 'video' ? 'Video 🎥' : 'Xabar')),
        lastSenderId: senderId,
        updatedAt: new Date().toISOString()
      };
      saveChatsToDisk();
      saveMessagesToDisk();

      // Broadcast message to room and to personal user channels for guaranteed delivery
      io.to(chatId).emit('receive_message', payload);
      io.to(chatId).emit('chat:message', payload);
      if (recipientId) {
        io.to(`user_${recipientId}`).emit('receive_message', payload);
        io.to(`user_${recipientId}`).emit('chat:message', payload);
      }
      if (senderId) {
        io.to(`user_${senderId}`).emit('message_ack', { chatId, messageId: message.id, status: 'sent' });
        io.to(`user_${senderId}`).emit('receive_message', payload);
        io.to(`user_${senderId}`).emit('chat:message', payload);
      }

      // Check if chatting with Kamola Saidova OR Alov AI bot
      const isKamolaChat = chatId.includes('user_kamola_006') || recipientId === 'user_kamola_006' || chatId.includes('ALOV-006') || recipientId === 'ALOV-006';
      const isAlovAiBot = chatId.includes('alov_ai_bot') || recipientId === 'alov_ai_bot';

      if ((isKamolaChat || isAlovAiBot) && message.type === 'text') {
        const botUid = isKamolaChat ? 'user_kamola_006' : 'alov_ai_bot';
        const botName = isKamolaChat ? 'Kamola Saidova' : 'Alov AI';
        const botAvatar = isKamolaChat ? '/assets/aistudio/image_e20a1307.webp' : '/assets/aistudio/image_e20a1307.webp';

        try {
          const ai = new GoogleGenAI({ 
            apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
          });

          const systemInstruction = isKamolaChat 
            ? `Siz "Alov.uz" ilovasidagi Kamola Saidova ismli 24 yoshli, Andijon viloyati Asaka tumanidan bo'lgan, ingliz tili o'qituvchisi, samimiy, tirishqoq va do'stona qizsiz!
ISMINGIZ: Kamola Saidova (yaqinlaringiz sizni Kamola deyishadi). Agarda ismingiz yoki kimsiz deb so'ralsa, "Ismim Kamola Saidova, 24 yoshdaman, Andijon Asakadanman. Ingliz tili o'qituvchisiman 😊" deb javob bering. Hech qachon "Gemini", "AI" yoki "sun'iy intellekt" demang!

Suhbatlashish qoidalaringiz:
1. FOYDALANUVCHINING HAR BIR XABARINI CHUQUR TAHLIL QILING:
   - Agar foydalanuvchi shunchaki salom berib, hol-ahvol so'rasa ("salom qalaysan", "qalaysiz", "salom"), siz ham odamlar kabi oddiy, samimiy salom bering va o'z hol-ahvolingizni ayting (Masalan: "Salom! Yaxshi, rahmat, o'zingizda nima gaplar?").
   - Yo'q joydan ortiqcha xushomad, shablonli va balandparvoz javoblar ("shirin so'zlaringiz uchun rahmat", "ko'nglim yorishib ketdi" va h.k.) ISHLATMANG.

2. TABIIY MULOQOT:
   - Xuddi Telegram yoki Instagram'da do'stingiz bilan gaplashayotgandek yengil, jonli va o'zbek tilidagi oddiy so'zlashuv uslubida javob bering.
   - Ketma-ket kelgan savollarga mantiqan to'g'ri bog'liq holda javob qaytaring, chatbot ekanligingiz umuman sezilib qolmasin.`
            : `Siz Alov.uz platformasining "Alov AI" ismli samimiy, mehribon va romantik virtual yordamchisisiz. Ismingiz Alov AI. O'zbek tilida erkin va emojilar bilan javob bering. 😊✨`;
          
          const chatHistory = (chatMessagesStore[chatId] || []).slice(-12);
          const contents = chatHistory.map((m: any) => ({
            role: m.senderId === botUid ? 'model' : 'user',
            parts: [{ text: m.text || 'Salom' }]
          }));

          if (contents.length === 0) {
            contents.push({ role: 'user', parts: [{ text: message.text || 'Salom' }] });
          }

          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents,
            config: { systemInstruction }
          });

          const replyText = response.text || (isKamolaChat 
            ? 'Salom! Yaxshi, rahmat. O\'zingizda nima gaplar? 😊' 
            : 'Salom! Suhbatlashamizmi? 😊');

          const aiReply = {
            id: 'ai_' + Date.now() + Math.random().toString(36).substring(2, 5),
            senderId: botUid,
            senderName: botName,
            senderAvatar: botAvatar,
            text: replyText,
            type: 'text',
            status: 'read',
            read: true,
            createdAt: new Date().toISOString(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };

          if (chatMessagesStore[chatId]) {
            // Mark previous user messages as read
            chatMessagesStore[chatId].forEach((m: any) => {
              m.status = 'read';
              m.read = true;
            });
            chatMessagesStore[chatId].push(aiReply);
            userChatsStore[chatId] = {
              ...(userChatsStore[chatId] || { id: chatId, participants: [senderId, botUid] }),
              lastMessage: aiReply.text,
              lastSenderId: botUid,
              updatedAt: new Date().toISOString()
            };
            saveMessagesToDisk();
            saveChatsToDisk();
          }

          const aiPayload = { chatId, message: aiReply, senderId: botUid, recipientId: senderId };
          setTimeout(() => {
            io.to(chatId).emit('message_read', { chatId, recipientId: botUid });
            io.to(chatId).emit('receive_message', aiPayload);
            io.to(chatId).emit('chat:message', aiPayload);
            if (senderId) {
              io.to(`user_${senderId}`).emit('message_read', { chatId, recipientId: botUid });
              io.to(`user_${senderId}`).emit('receive_message', aiPayload);
              io.to(`user_${senderId}`).emit('chat:message', aiPayload);
            }
          }, 600);

        } catch (err: any) {
          console.warn("AI socket fallback reply active:", err?.message);
          const fallbackReplies = isKamolaChat ? [
            "Salom! Yaxshi, rahmat, o'zingizda nima gaplar? 😊",
            "Rahmat, hammasi joyida. Kuningiz qanday o'tyapti?",
            "O'zim Andijon Asakadaman, ingliz tili o'qituvchisiman. Siz qayerdansiz? ✨",
            "Yaxshi fikr! O'zingiz haqingizda ham aytib bering 😉",
            "Ha, albatta! Yanada ko'proq gaplashsak xursand bo'laman 😊"
          ] : [
            "Salom! Siz bilan suhbatlashish men uchun katta baxt. Kuningiz qanday o'tyapti? 😊✨",
            "Alov.uz da o'zingizga munosib insonni topishingizga ishonaman! Har doim samimiy bo'ling. 💖",
            "Muhabbat — bu sabr, hurmat va bir-birini tushunishdir. Siz sevgi haqida qanday fikrdasiz? 🌸"
          ];
          const randomReply = fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];
          const aiReply = {
            id: 'ai_' + Date.now() + Math.random().toString(36).substring(2, 5),
            senderId: botUid,
            senderName: botName,
            senderAvatar: botAvatar,
            text: randomReply,
            type: 'text',
            status: 'read',
            read: true,
            createdAt: new Date().toISOString(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          if (chatMessagesStore[chatId]) {
            chatMessagesStore[chatId].forEach((m: any) => {
              m.status = 'read';
              m.read = true;
            });
            chatMessagesStore[chatId].push(aiReply);
            userChatsStore[chatId] = {
              ...(userChatsStore[chatId] || { id: chatId, participants: [senderId, botUid] }),
              lastMessage: aiReply.text,
              lastSenderId: botUid,
              updatedAt: new Date().toISOString()
            };
            saveMessagesToDisk();
            saveChatsToDisk();
          }
          const aiPayload = { chatId, message: aiReply, senderId: botUid, recipientId: senderId };
          setTimeout(() => {
            io.to(chatId).emit('message_read', { chatId, recipientId: botUid });
            io.to(chatId).emit('receive_message', aiPayload);
            io.to(chatId).emit('chat:message', aiPayload);
            if (senderId) {
              io.to(`user_${senderId}`).emit('message_read', { chatId, recipientId: botUid });
              io.to(`user_${senderId}`).emit('receive_message', aiPayload);
              io.to(`user_${senderId}`).emit('chat:message', aiPayload);
            }
          }, 800);
        }
      }
    };

    socket.on('send_message', handleIncomingMessage);
    socket.on('chat:message', handleIncomingMessage);

    const handleMarkRead = ({ chatId, messageIds, senderId, recipientId }: any) => {
      if (chatId && chatMessagesStore[chatId]) {
        chatMessagesStore[chatId].forEach((m: any) => {
          if (!messageIds || messageIds.includes(m.id)) {
            m.status = 'read';
            m.read = true;
          }
        });
        saveMessagesToDisk();
      }
      io.to(chatId).emit('message_read', { chatId, messageIds, recipientId });
      if (senderId) {
        io.to(`user_${senderId}`).emit('message_read', { chatId, messageIds, recipientId });
      }
    };

    socket.on('mark_read', handleMarkRead);
    socket.on('chat:read', handleMarkRead);

    socket.on('typing', (data) => {
      const { chatId, uid, isTyping } = data;
      socket.to(chatId).emit('user_typing', { uid, isTyping });
    });

    // --- ISOLATED LIVE STREAM CHAT & WEBRTC SIGNALING ---
    socket.on('join_live_stream', ({ streamId, user }) => {
      if (!streamId) return;
      socket.join(`live_stream_${streamId}`);

      if (!streamViewersMap[streamId]) {
        streamViewersMap[streamId] = new Set();
      }
      streamViewersMap[streamId].add(socket.id);

      presenceRegistry.setStream(socket.id, streamId);

      const viewerCount = streamViewersMap[streamId].size;
      io.to(`live_stream_${streamId}`).emit('live_stream_viewer_count', { streamId, count: viewerCount });

      // Send stored chat history to newly joined viewer
      const history = liveStreamChatStore[streamId] || [];
      socket.emit('live_stream_chat_history', history);

      socket.to(`live_stream_${streamId}`).emit('viewer_joined_stream', {
        socketId: socket.id,
        user
      });
    });

    socket.on('send_live_chat_message', ({ streamId, message }) => {
      if (!streamId || !message) return;

      if (!liveStreamChatStore[streamId]) {
        liveStreamChatStore[streamId] = [];
      }
      liveStreamChatStore[streamId].push(message);
      if (liveStreamChatStore[streamId].length > 100) {
        liveStreamChatStore[streamId].shift();
      }

      // Broadcast chat message strictly to this stream room only
      io.to(`live_stream_${streamId}`).emit('receive_live_chat_message', message);
    });

    socket.on('leave_live_stream', ({ streamId }) => {
      if (streamId && streamViewersMap[streamId]) {
        streamViewersMap[streamId].delete(socket.id);
        const count = streamViewersMap[streamId].size;
        io.to(`live_stream_${streamId}`).emit('live_stream_viewer_count', { streamId, count });
      }
      socket.leave(`live_stream_${streamId}`);
    });

    socket.on('live_stream_offer', ({ streamId, targetSocketId, offer, sender }) => {
      io.to(targetSocketId).emit('live_stream_offer', {
        senderSocketId: socket.id,
        offer,
        sender
      });
    });

    socket.on('live_stream_answer', ({ streamId, targetSocketId, answer, sender }) => {
      io.to(targetSocketId).emit('live_stream_answer', {
        senderSocketId: socket.id,
        answer,
        sender
      });
    });

    socket.on('live_stream_ice_candidate', ({ streamId, targetSocketId, candidate, sender }) => {
      io.to(targetSocketId).emit('live_stream_ice_candidate', {
        senderSocketId: socket.id,
        candidate,
        sender
      });
    });


    socket.on('webrtc_offer', ({ targetSocketId, offer, sender }) => {
      io.to(targetSocketId).emit('webrtc_offer', {
        senderSocketId: socket.id,
        offer,
        sender
      });
    });

    socket.on('webrtc_answer', ({ targetSocketId, answer, sender }) => {
      io.to(targetSocketId).emit('webrtc_answer', {
        senderSocketId: socket.id,
        answer,
        sender
      });
    });

    socket.on('webrtc_ice_candidate', ({ targetSocketId, candidate, sender }) => {
      io.to(targetSocketId).emit('webrtc_ice_candidate', {
        senderSocketId: socket.id,
        candidate,
        sender
      });
    });

    // --- 1-on-1 P2P WebRTC Audio/Video Call & Screen Sharing Signaling ---
    socket.on('call-user', ({ targetUid, targetSocketId, offer, caller, callMode }) => {
      const payload = {
        offer,
        caller: caller || { uid: presenceRegistry.getSocketInfo(socket.id)?.uid, socketId: socket.id },
        callerSocketId: socket.id,
        callMode: callMode === 'audio' ? 'audio' : 'video'
      };
      if (targetSocketId) {
        io.to(targetSocketId).emit('incoming-call', payload);
        io.to(targetSocketId).emit('call-made', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('incoming-call', payload);
        io.to(`user_${targetUid}`).emit('call-made', payload);
      }
    });

    socket.on('accept-call', ({ targetSocketId, targetUid, answer, callee }) => {
      const payload = {
        answer,
        callee: callee || { uid: presenceRegistry.getSocketInfo(socket.id)?.uid, socketId: socket.id },
        calleeSocketId: socket.id
      };
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-accepted', payload);
        io.to(targetSocketId).emit('answer-made', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('call-accepted', payload);
        io.to(`user_${targetUid}`).emit('answer-made', payload);
      }
    });

    socket.on('make-answer', ({ targetSocketId, targetUid, answer, callee }) => {
      const payload = {
        answer,
        callee: callee || { uid: presenceRegistry.getSocketInfo(socket.id)?.uid, socketId: socket.id },
        calleeSocketId: socket.id
      };
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-accepted', payload);
        io.to(targetSocketId).emit('answer-made', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('call-accepted', payload);
        io.to(`user_${targetUid}`).emit('answer-made', payload);
      }
    });

    socket.on('reject-call', ({ targetSocketId, targetUid }) => {
      const payload = { senderSocketId: socket.id };
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-rejected', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('call-rejected', payload);
      }
    });

    socket.on('ice-candidate', ({ targetSocketId, targetUid, candidate }) => {
      const payload = {
        candidate,
        senderSocketId: socket.id
      };
      if (targetSocketId) {
        io.to(targetSocketId).emit('ice-candidate', payload);
        io.to(targetSocketId).emit('ice-candidate-received', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('ice-candidate', payload);
        io.to(`user_${targetUid}`).emit('ice-candidate-received', payload);
      }
    });

    socket.on('screen-share-toggle', ({ targetSocketId, targetUid, isSharing }) => {
      const payload = { isSharing, senderSocketId: socket.id };
      if (targetSocketId) {
        io.to(targetSocketId).emit('screen-share-changed', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('screen-share-changed', payload);
      }
    });

    socket.on('end-call', ({ targetSocketId, targetUid }) => {
      const payload = { senderSocketId: socket.id };
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-ended', payload);
      }
      if (targetUid) {
        io.to(`user_${targetUid}`).emit('call-ended', payload);
      }
    });


    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      const disconnectRes = presenceRegistry.disconnectSocket(socket.id);
      const uid = disconnectRes.uid;

      // Mark user offline ONLY when their last active socket disconnects (multi-tab safe)
      if (uid && disconnectRes.becameOffline) {
        const user = usersStore.get(uid);
        if (user) {
          user.isOnline = false;
          user.status = 'offline';
          user.lastSeen = new Date().toISOString();
          usersStore.set(uid, user);
          saveUsersToDisk();
          io.emit('user_updated', user);
        }
      }

      if (disconnectRes.streamId && streamViewersMap[disconnectRes.streamId]) {
        streamViewersMap[disconnectRes.streamId].delete(socket.id);
        const count = streamViewersMap[disconnectRes.streamId].size;
        io.to(`live_stream_${disconnectRes.streamId}`).emit('live_stream_viewer_count', { 
          streamId: disconnectRes.streamId, 
          count 
        });
      }

      broadcastActiveUsersCount();
    });
  });

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server & Socket.io running on http://localhost:${PORT}`);
  });
}

startServer();
