import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTelegramWebAppProfile,
  detectDualModePlatform,
  applyTelegramWebAppTheme,
  enterTelegramMiniAppFullscreen,
} from './telegramWebApp.ts';

describe('Telegram WebApp & Web dual-mode helpers', () => {
  it('falls back cleanly to standard web mode when Telegram SDK has no initData', () => {
    const info = detectDualModePlatform({
      Telegram: { WebApp: { platform: 'unknown' } },
      navigator: { userAgent: 'Mozilla/5.0' },
    });
    assert.equal(info.mode, 'web');
    assert.equal(info.isTelegramMiniApp, false);
    assert.equal(info.telegramUser, null);
  });

  it('extracts Telegram user profile and activates telegram mode inside Mini App', () => {
    const tg = {
      initData: 'query_id=AAH...',
      platform: 'ios',
      colorScheme: 'dark' as const,
      initDataUnsafe: {
        user: {
          id: 987654321,
          first_name: 'Madina',
          last_name: 'Karimova',
          username: 'madina_k',
          photo_url: 'https://t.me/i/userpic/320/madina.jpg',
        },
      },
    };
    const info = detectDualModePlatform({ Telegram: { WebApp: tg } });
    assert.equal(info.mode, 'telegram');
    assert.equal(info.isTelegramMiniApp, true);
    assert.equal(info.platform, 'ios');
    assert.deepEqual(info.telegramUser, {
      uid: 'tg_987654321',
      telegramId: '987654321',
      displayName: 'Madina Karimova',
      username: 'madina_k',
      telegramUrl: 'https://t.me/madina_k',
      avatarUrl: 'https://t.me/i/userpic/320/madina.jpg',
    });
  });

  it('invokes Telegram WebApp ready/expand and applies dark obsidian header & background colors', () => {
    const calls: string[] = [];
    const ok = applyTelegramWebAppTheme({
      ready: () => calls.push('ready'),
      expand: () => calls.push('expand'),
      setHeaderColor: (c) => calls.push(`header:${c}`),
      setBackgroundColor: (c) => calls.push(`bg:${c}`),
      setBottomBarColor: (c) => calls.push(`bottom:${c}`),
    }, true);

    assert.equal(ok, true);
    assert.deepEqual(calls, [
      'ready',
      'expand',
      'header:#09090D',
      'bg:#09090D',
      'bottom:#111218',
    ]);
    assert.equal(extractTelegramWebAppProfile(null), null);
  });

  it('never requests Telegram Mini App fullscreen and exits fullscreen if already active', () => {
    const calls: string[] = [];
    const res = enterTelegramMiniAppFullscreen({
      isFullscreen: false,
      ready: () => calls.push('ready'),
      expand: () => calls.push('expand'),
      disableVerticalSwipes: () => calls.push('disableVerticalSwipes'),
      requestFullscreen: () => calls.push('requestFullscreen'),
      exitFullscreen: () => calls.push('exitFullscreen'),
    });

    assert.deepEqual(res, { expanded: true, fullscreenRequested: false });
    assert.deepEqual(calls, ['ready', 'expand', 'disableVerticalSwipes']);
    assert.equal(calls.includes('requestFullscreen'), false);

    const activeCalls: string[] = [];
    const themeOk = applyTelegramWebAppTheme({
      isFullscreen: true,
      ready: () => activeCalls.push('ready'),
      expand: () => activeCalls.push('expand'),
      disableVerticalSwipes: () => activeCalls.push('disableVerticalSwipes'),
      requestFullscreen: () => activeCalls.push('requestFullscreen'),
      exitFullscreen: () => activeCalls.push('exitFullscreen'),
    }, true);
    assert.equal(themeOk, true);
    assert.deepEqual(activeCalls, ['ready', 'exitFullscreen', 'expand', 'disableVerticalSwipes']);
    assert.equal(activeCalls.includes('requestFullscreen'), false);

    assert.deepEqual(enterTelegramMiniAppFullscreen(null), {
      expanded: false,
      fullscreenRequested: false,
    });
  });

  it('skips disableVerticalSwipes on older Telegram SDK versions (e.g. 6.0) without requesting fullscreen', () => {
    const calls: string[] = [];
    const res = enterTelegramMiniAppFullscreen({
      version: '6.0',
      isVersionAtLeast: () => false,
      ready: () => calls.push('ready'),
      expand: () => calls.push('expand'),
      disableVerticalSwipes: () => calls.push('disableVerticalSwipes'),
      requestFullscreen: () => calls.push('requestFullscreen'),
    });

    assert.deepEqual(res, { expanded: true, fullscreenRequested: false });
    assert.deepEqual(calls, ['ready', 'expand']);
  });
});
