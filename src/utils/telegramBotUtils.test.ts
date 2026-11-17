import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MANDATORY_SUBSCRIPTION_CONFIG,
  evaluateMandatorySubscriptionAccess,
  formatChatMessageSpoilerNotification,
  isTelegramMemberSubscribedStatus,
  isVercelEnvironment,
  parseTelegramChannelReference,
  shouldStartTelegramBot,
} from './telegramBotUtils';

test('formatChatMessageSpoilerNotification wraps message text in tg-spoiler and escapes HTML', () => {
  const html = formatChatMessageSpoilerNotification({
    senderName: 'Dilnoza <Admin>',
    senderUsername: 'https://t.me/dilnoza_uz',
    messageText: 'Salom! <script>alert(1)</script>',
  });

  assert.match(html, /Sizga yangi xabar keldi/);
  assert.match(html, /Dilnoza &lt;Admin&gt; \(@dilnoza_uz\)/);
  assert.match(html, /<span class="tg-spoiler">Salom! &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/span>/);
});

test('parseTelegramChannelReference handles @handle, t.me URL, and chat IDs', () => {
  assert.deepEqual(parseTelegramChannelReference('https://t.me/alovuz_news'), {
    chatId: '@alovuz_news',
    normalizedLink: 'https://t.me/alovuz_news',
    channelUsername: '@alovuz_news',
    isCheckable: true,
  });

  assert.deepEqual(parseTelegramChannelReference('@my_channel'), {
    chatId: '@my_channel',
    normalizedLink: 'https://t.me/my_channel',
    channelUsername: '@my_channel',
    isCheckable: true,
  });

  const priv = parseTelegramChannelReference('https://t.me/+AbCdEfGh');
  assert.equal(priv.isCheckable, false);
});

test('evaluateMandatorySubscriptionAccess requires bot admin and Telegram context, bypasses @Salikh_07', () => {
  const activeWithBotAdmin = {
    ...DEFAULT_MANDATORY_SUBSCRIPTION_CONFIG,
    enabled: true,
    channelLink: 'https://t.me/alovuz_news',
    botIsAdmin: true,
  };

  assert.equal(
    evaluateMandatorySubscriptionAccess({
      config: activeWithBotAdmin,
      user: { uid: 'u1', telegram: '@user1' },
      isTelegramContext: true,
      isSubscribed: false,
    }).gateRequired,
    true
  );

  assert.equal(
    evaluateMandatorySubscriptionAccess({
      config: activeWithBotAdmin,
      user: { uid: 'u1', telegram: '@user1' },
      isTelegramContext: true,
      isSubscribed: true,
    }).gateRequired,
    false
  );

  // Admin bypass
  assert.equal(
    evaluateMandatorySubscriptionAccess({
      config: activeWithBotAdmin,
      user: { uid: 'tg_salikh_07', telegram: 'https://t.me/Salikh_07', role: 'admin' },
      isTelegramContext: true,
      isSubscribed: false,
    }).gateRequired,
    false
  );

  // Bot not admin => do not block
  assert.equal(
    evaluateMandatorySubscriptionAccess({
      config: { ...activeWithBotAdmin, botIsAdmin: false },
      user: { uid: 'u1' },
      isTelegramContext: true,
      isSubscribed: false,
    }).gateRequired,
    false
  );

  assert.equal(isTelegramMemberSubscribedStatus({ status: 'member' }), true);
  assert.equal(isTelegramMemberSubscribedStatus({ status: 'left' }), false);
});

test('isVercelEnvironment & shouldStartTelegramBot disable bot on Vercel and allow on Render', () => {
  assert.equal(isVercelEnvironment({ VERCEL: '1' }), true);
  assert.equal(isVercelEnvironment({ VERCEL: 'true' }), true);
  assert.equal(isVercelEnvironment({ VERCEL_ENV: 'production' }), true);
  assert.equal(isVercelEnvironment({ VERCEL_URL: 'alov-mu.vercel.app' }), true);
  assert.equal(isVercelEnvironment({ VERCEL: '0' }), false);
  assert.equal(isVercelEnvironment({ RENDER: 'true' }), false);
  assert.equal(isVercelEnvironment({}), false);

  assert.equal(shouldStartTelegramBot({ VERCEL: '1' }, '12345:token'), false);
  assert.equal(shouldStartTelegramBot({ VERCEL_ENV: 'preview' }, '12345:token'), false);
  assert.equal(shouldStartTelegramBot({ RENDER: 'true' }, '12345:token'), true);
  assert.equal(shouldStartTelegramBot({ RENDER: 'true' }, ''), false);
});

