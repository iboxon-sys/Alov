import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTelegramWebAppProfile,
  detectDualModePlatform,
  applyTelegramWebAppTheme,
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
});
