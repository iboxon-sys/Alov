import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMediaLink,
  parseAudioFilenameMetadata,
  normalizeMediaUrlInput,
  CURATED_MUSIC_CATALOG,
} from './mediaLinks';

describe('Universal media links & music catalog helpers', () => {
  it('normalizes bare domains cleanly to https', () => {
    assert.equal(normalizeMediaUrlInput('youtube.com/watch?v=abc123'), 'https://youtube.com/watch?v=abc123');
    assert.equal(normalizeMediaUrlInput('/api/media/video.mp4'), '/api/media/video.mp4');
  });

  it('parses YouTube Shorts, Watch, and youtu.be URLs into embeds', () => {
    const shorts = parseMediaLink('https://youtube.com/shorts/dQw4w9WgXcQ');
    assert.equal(shorts.provider, 'youtube');
    assert.equal(shorts.kind, 'embed_iframe');
    assert.equal(shorts.isVertical, true);
    assert.ok(shorts.embedUrl?.includes('embed/dQw4w9WgXcQ'));

    const watch = parseMediaLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(watch.provider, 'youtube');
    assert.equal(watch.isVertical, false);
  });

  it('parses TikTok, Instagram Reels, Facebook, Vimeo, Telegram, SoundCloud, Spotify', () => {
    const tt = parseMediaLink('https://www.tiktok.com/@alov/video/7123456789012345678');
    assert.equal(tt.provider, 'tiktok');
    assert.equal(tt.isVertical, true);
    assert.ok(tt.embedUrl?.includes('7123456789012345678'));

    const ig = parseMediaLink('https://www.instagram.com/reel/CxYz123AbC/');
    assert.equal(ig.provider, 'instagram');
    assert.equal(ig.isVertical, true);
    assert.ok(ig.embedUrl?.includes('/p/CxYz123AbC/embed/'));

    const fb = parseMediaLink('https://www.facebook.com/watch?v=123456');
    assert.equal(fb.provider, 'facebook');
    assert.equal(fb.kind, 'embed_iframe');

    const tg = parseMediaLink('https://t.me/alovuz_news/42');
    assert.equal(tg.provider, 'telegram');
    assert.equal(tg.embedUrl, 'https://t.me/alovuz_news/42?embed=1&userpic=false');

    const sc = parseMediaLink('https://soundcloud.com/artist/track-name', 'music');
    assert.equal(sc.provider, 'soundcloud');
    assert.equal(sc.detectedType, 'music');

    const sp = parseMediaLink('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', 'music');
    assert.equal(sp.provider, 'spotify');
    assert.ok(sp.embedUrl?.includes('/embed/track/4cOdK2wGLETKBW3PvgPWqT'));
  });

  it('parses direct image, video, and audio URLs without restriction', () => {
    assert.equal(parseMediaLink('https://cdn.site.uz/pic.webp').kind, 'direct_image');
    assert.equal(parseMediaLink('https://cdn.site.uz/clip.mp4').kind, 'direct_video');
    assert.equal(parseMediaLink('https://cdn.site.uz/song.mp3').kind, 'direct_audio');
    // Fallback respects preferred type when CDN URL has no file extension
    assert.equal(parseMediaLink('https://images.unsplash.com/photo-123', 'photo').kind, 'direct_image');
    assert.equal(parseMediaLink('https://stream.example.com/live', 'video').kind, 'direct_video');
    assert.equal(parseMediaLink('https://stream.example.com/audio', 'music').kind, 'direct_audio');
  });

  it('extracts artist and title cleanly from audio filenames and includes curated catalog', () => {
    assert.deepEqual(parseAudioFilenameMetadata('Yulduz Usmonova - Qizgaldogim.mp3'), {
      artist: 'Yulduz Usmonova',
      title: 'Qizgaldogim',
    });
    assert.ok(CURATED_MUSIC_CATALOG.length >= 6);
  });
});
