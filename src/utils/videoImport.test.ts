import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateExternalVideoUrl,
  inferImageFileExtension,
  inferVideoFileExtension,
  extractImageUrlsFromHtml,
  extractVideoUrlsFromHtml,
  extractAudioUrlsFromHtml,
  isDirectPlayableVideoUrl,
  isHlsStreamUrl,
  extractTwitterStatusPath,
  extractInstagramShortcode,
  isSocialVideoHost,
  inferAudioFileExtension,
  buildFfmpegMp3Args,
  buildFfmpegMp4Args,
  deriveAudioMetadataFromUrl,
  sanitizeMp3DownloadFilename,
} from './videoImport';

describe('Video link import & MP4 resolution helpers', () => {
  it('validates external HTTP/HTTPS URLs and rejects private/SSRF targets', () => {
    const valid = validateExternalVideoUrl('cdn.example.com/clip.mp4');
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(valid.url.toString(), 'https://cdn.example.com/clip.mp4');
    }

    assert.equal(validateExternalVideoUrl('http://127.0.0.1:3000/secret').ok, false);
    assert.equal(validateExternalVideoUrl('http://localhost/video.mp4').ok, false);
    assert.equal(validateExternalVideoUrl('http://192.168.1.5/cam.mp4').ok, false);
    assert.equal(validateExternalVideoUrl('ftp://files.example.com/v.mp4').ok, false);
    assert.equal(validateExternalVideoUrl('').ok, false);
  });

  it('infers mp4, webm, mov, and m4v extensions accurately', () => {
    assert.equal(inferVideoFileExtension('video/mp4', 'https://cdn.site/video'), '.mp4');
    assert.equal(inferVideoFileExtension('video/webm; codecs=vp9', 'https://cdn.site/v'), '.webm');
    assert.equal(inferVideoFileExtension('video/quicktime', 'https://cdn.site/v'), '.mov');
    assert.equal(inferVideoFileExtension('application/octet-stream', 'https://cdn.site/clip.mp4?token=1'), '.mp4');
    assert.equal(inferVideoFileExtension('text/html; charset=utf-8', 'https://site.com/watch'), null);
  });

  it('infers image extensions accurately and rejects HTML pages', () => {
    assert.equal(inferImageFileExtension('image/jpeg', 'https://cdn.site/photo'), '.jpg');
    assert.equal(inferImageFileExtension('image/png', 'https://cdn.site/p'), '.png');
    assert.equal(inferImageFileExtension('image/webp', 'https://cdn.site/p'), '.webp');
    assert.equal(inferImageFileExtension('application/octet-stream', 'https://i.pinimg.com/736x/a/b/c.jpg'), '.jpg');
    assert.equal(inferImageFileExtension('text/html; charset=utf-8', 'https://www.pinterest.com/pin/123/'), null);
  });

  it('extracts direct image, video (including m3u8), and audio URLs from HTML', () => {
    const videoHtml = `
      <html>
        <head>
          <meta property="og:video" content="https://cdn.example.uz/stream/sample.mp4?tag=1&amp;hd=1" />
        </head>
        <body>
          <script>window.__DATA__ = {"video_url":"https:\\/\\/cdn.example.uz\\/alt\\/clip.webm","hls":"https://cdn.example.uz/live/stream.m3u8"};</script>
        </body>
      </html>
    `;
    const videoUrls = extractVideoUrlsFromHtml(videoHtml, 'https://example.uz/post/1');
    assert.ok(videoUrls.includes('https://cdn.example.uz/stream/sample.mp4?tag=1&hd=1'));
    assert.ok(videoUrls.includes('https://cdn.example.uz/alt/clip.webm'));
    assert.ok(videoUrls.includes('https://cdn.example.uz/live/stream.m3u8'));

    const imageHtml = `
      <html>
        <head>
          <meta property="og:image" content="https://i.pinimg.com/736x/aa/bb/cc.jpg" />
        </head>
        <body>
          <img src="/favicon.ico" />
          <img src="https://cdn.example.uz/gallery/photo.webp" />
        </body>
      </html>
    `;
    const imageUrls = extractImageUrlsFromHtml(imageHtml, 'https://www.pinterest.com/pin/123/');
    assert.equal(imageUrls[0], 'https://i.pinimg.com/736x/aa/bb/cc.jpg');
    assert.ok(imageUrls.includes('https://cdn.example.uz/gallery/photo.webp'));

    const audioHtml = `
      <html>
        <head><meta property="og:audio" content="https://cdn.example.uz/tracks/melody.mp3" /></head>
        <body><audio src="/clips/voice.ogg"></audio></body>
      </html>
    `;
    const audioUrls = extractAudioUrlsFromHtml(audioHtml, 'https://example.uz/music/1');
    assert.equal(audioUrls[0], 'https://cdn.example.uz/tracks/melody.mp3');
    assert.ok(audioUrls.includes('https://example.uz/clips/voice.ogg'));
  });

  it('detects directly playable native video URLs and social video platforms', () => {
    assert.equal(isDirectPlayableVideoUrl('/api/media/media_123.mp4'), true);
    assert.equal(isDirectPlayableVideoUrl('https://cdn.site.uz/video.webm?v=2'), true);
    assert.equal(isDirectPlayableVideoUrl('https://youtube.com/watch?v=abc'), false);
    assert.equal(isHlsStreamUrl('https://cdn.site.uz/hls/master.m3u8?token=x'), true);
    assert.equal(extractTwitterStatusPath('https://x.com/SpaceX/status/1732824684683784516?s=20'), 'SpaceX/status/1732824684683784516');
    assert.equal(extractInstagramShortcode('https://www.instagram.com/reel/CxYz123AbC/'), 'CxYz123AbC');
    assert.equal(isSocialVideoHost('https://www.instagram.com/reel/CxYz123AbC/'), true);
    assert.equal(isSocialVideoHost('https://youtube.com/shorts/dQw4w9WgXcQ'), true);
    assert.equal(isSocialVideoHost('https://soundcloud.com/artist/track'), true);
  });

  it('infers audio extensions and builds deterministic ffmpeg MP3 & MP4 args', () => {
    assert.equal(inferAudioFileExtension('audio/mpeg', 'https://cdn.site/audio'), '.mp3');
    assert.equal(inferAudioFileExtension('audio/x-m4a', 'https://cdn.site/song'), '.m4a');
    assert.equal(inferAudioFileExtension('application/octet-stream', 'https://cdn.site/track.ogg?v=1'), '.ogg');
    assert.equal(inferAudioFileExtension('text/html', 'https://youtube.com/watch?v=1'), null);

    const args = buildFfmpegMp3Args('/tmp/in.mp4', '/tmp/out.mp3', { maxDurationSec: 300 });
    assert.deepEqual(args, [
      '-y',
      '-i',
      '/tmp/in.mp4',
      '-t',
      '300',
      '-vn',
      '-acodec',
      'libmp3lame',
      '-b:a',
      '192k',
      '-ar',
      '44100',
      '-f',
      'mp3',
      '/tmp/out.mp3',
    ]);

    const mp4Args = buildFfmpegMp4Args('/tmp/in.mov', '/tmp/out.mp4', { maxBytes: 50_000_000 });
    assert.ok(mp4Args.includes('libx264'));
    assert.ok(mp4Args.includes('+faststart'));
    assert.ok(mp4Args.includes('mp4'));

    const meta = deriveAudioMetadataFromUrl('https://cdn.example.uz/clips/toshkent_oqshomi.mp4');
    assert.equal(meta.title, 'toshkent oqshomi');
    assert.equal(meta.artist, 'cdn.example.uz');
    assert.equal(sanitizeMp3DownloadFilename('Bahor Nafasi (Live)'), 'Bahor_Nafasi_Live.mp3');
  });
});

