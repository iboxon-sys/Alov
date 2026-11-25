import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySwFetchRequest,
  getCachesToDeleteOnActivate,
  isIOSUserAgent,
  isStandaloneDisplayMode,
  isTelegramMiniAppContext,
  shouldSuppressPwaInstall,
  SW_SHELL_CACHE,
  SW_STATIC_CACHE,
} from './pwaHelpers';

test('suppresses PWA install button when standalone or inside Telegram Mini App', () => {
  assert.equal(shouldSuppressPwaInstall({ isStandalone: true, isTelegramMiniApp: false }), true);
  assert.equal(shouldSuppressPwaInstall({ isStandalone: false, isTelegramMiniApp: true }), true);
  assert.equal(shouldSuppressPwaInstall({ isStandalone: false, isTelegramMiniApp: false }), false);
});

test('detects iOS user agents and standalone mode accurately', () => {
  assert.equal(isIOSUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)'), true);
  assert.equal(isIOSUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), false);
  assert.equal(isStandaloneDisplayMode({ matchMediaStandalone: true }), true);
  assert.equal(isStandaloneDisplayMode({ navigatorStandalone: true }), true);
  assert.equal(isStandaloneDisplayMode({ matchMediaStandalone: false, navigatorStandalone: false }), false);
});

test('detects Telegram Mini App context safely', () => {
  assert.equal(isTelegramMiniAppContext({ Telegram: { WebApp: { initDataUnsafe: { user: { id: 123 } } } } }), true);
  assert.equal(isTelegramMiniAppContext({ Telegram: { WebApp: { initData: 'query_id=abc' } } }), true);
  assert.equal(isTelegramMiniAppContext({ Telegram: { WebApp: {} } }), false);
  assert.equal(isTelegramMiniAppContext(undefined), false);
});

test('classifies service worker fetch requests cleanly', () => {
  const origin = 'https://alov.onrender.com';

  assert.equal(
    classifySwFetchRequest({ url: 'https://alov.onrender.com/', origin, mode: 'navigate' }),
    'navigation'
  );
  assert.equal(
    classifySwFetchRequest({ url: 'https://alov.onrender.com/manifest.json', origin }),
    'manifest'
  );
  assert.equal(
    classifySwFetchRequest({ url: 'https://alov.onrender.com/assets/images/icon-192.png', origin }),
    'static-asset'
  );
  assert.equal(
    classifySwFetchRequest({ url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans', origin }),
    'static-asset'
  );
  assert.equal(
    classifySwFetchRequest({ url: 'https://alov.onrender.com/api/users', origin }),
    'bypass'
  );
  assert.equal(
    classifySwFetchRequest({ url: 'https://alov.onrender.com/socket.io/?EIO=4', origin }),
    'bypass'
  );
  assert.equal(
    classifySwFetchRequest({ url: 'https://alov.onrender.com/sw.js', origin }),
    'bypass'
  );
  assert.equal(
    classifySwFetchRequest({ url: 'https://alov.onrender.com/api/auth/telegram', origin, method: 'POST' }),
    'bypass'
  );
  assert.equal(
    classifySwFetchRequest({ url: 'https://firestore.googleapis.com/google.firestore.v1', origin }),
    'bypass'
  );
});

test('preserves active PWA caches while pruning obsolete ones on activate', () => {
  const toDelete = getCachesToDeleteOnActivate([SW_SHELL_CACHE, SW_STATIC_CACHE, 'legacy-v0']);
  assert.deepEqual(toDelete, ['legacy-v0']);
});
