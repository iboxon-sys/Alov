import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEffectiveViewportMetrics,
  computeTelegramSafeAreaInsets,
  filterChatConversations,
  shouldHideMobileBottomDock,
  shouldShowOuterAppHeader,
  shouldUseCompactKeyboardChrome,
} from './mobileViewport';

test('computeEffectiveViewportMetrics handles Android interactive-widget=resizes-content', () => {
  const m = computeEffectiveViewportMetrics({
    innerHeight: 480,
    visualHeight: 480,
    visualOffsetTop: 0,
    baselineHeight: 844,
  });

  assert.equal(m.heightPx, 480);
  assert.equal(m.offsetTopPx, 0);
  assert.equal(m.isKeyboardOpen, true);
  assert.equal(m.keyboardInsetPx, 364);
});

test('computeEffectiveViewportMetrics tracks iOS Safari / Telegram WebView panning offsetTop', () => {
  const m = computeEffectiveViewportMetrics({
    innerHeight: 844,
    visualHeight: 492,
    visualOffsetTop: 352,
    baselineHeight: 844,
  });

  assert.equal(m.heightPx, 492);
  assert.equal(m.offsetTopPx, 352);
  assert.equal(m.isKeyboardOpen, true);
  assert.equal(m.keyboardInsetPx, 352);
});

test('computeEffectiveViewportMetrics keeps keyboard closed for standard desktop or resting mobile', () => {
  const desktop = computeEffectiveViewportMetrics({
    innerHeight: 900,
    visualHeight: 900,
    visualOffsetTop: 0,
  });
  assert.equal(desktop.isKeyboardOpen, false);
  assert.equal(desktop.keyboardInsetPx, 0);
  assert.equal(desktop.heightPx, 900);

  const slightBarChange = computeEffectiveViewportMetrics({
    innerHeight: 800,
    visualHeight: 740,
    visualOffsetTop: 0,
    baselineHeight: 800,
  });
  assert.equal(slightBarChange.isKeyboardOpen, false);
});

test('shouldHideMobileBottomDock hides dock during mobile keyboard or chat conversation', () => {
  assert.equal(
    shouldHideMobileBottomDock({
      isMobileViewport: true,
      isKeyboardOpen: true,
      activeTab: 'posts',
      chatView: 'list',
    }),
    true
  );
  assert.equal(
    shouldHideMobileBottomDock({
      isMobileViewport: false,
      isKeyboardOpen: false,
      activeTab: 'chats',
      chatView: 'conversation',
    }),
    true
  );
  assert.equal(
    shouldHideMobileBottomDock({
      isMobileViewport: true,
      isKeyboardOpen: false,
      activeTab: 'discover',
      chatView: 'list',
    }),
    false
  );
});

test('shouldShowOuterAppHeader hides redundant global header on mobile chat conversation so partner bar pins at top', () => {
  assert.equal(
    shouldShowOuterAppHeader({
      isMobileViewport: true,
      activeTab: 'chats',
      chatView: 'conversation',
    }),
    false
  );
  assert.equal(
    shouldShowOuterAppHeader({
      isMobileViewport: false,
      activeTab: 'chats',
      chatView: 'conversation',
    }),
    true
  );
  assert.equal(
    shouldShowOuterAppHeader({
      isMobileViewport: true,
      activeTab: 'chats',
      chatView: 'list',
    }),
    true
  );
  assert.equal(
    shouldShowOuterAppHeader({
      isMobileViewport: true,
      activeTab: 'chats',
      chatView: 'list',
      isKeyboardOpen: true,
    }),
    false
  );
});

test('shouldUseCompactKeyboardChrome activates when compact mobile keyboard opens or height is constrained', () => {
  assert.equal(
    shouldUseCompactKeyboardChrome({
      isCompactViewport: true,
      isKeyboardOpen: true,
      heightPx: 440,
    }),
    true
  );
  assert.equal(
    shouldUseCompactKeyboardChrome({
      isCompactViewport: true,
      isKeyboardOpen: false,
      heightPx: 844,
    }),
    false
  );
  assert.equal(
    shouldUseCompactKeyboardChrome({
      isCompactViewport: false,
      isKeyboardOpen: true,
      heightPx: 440,
    }),
    false
  );
});

test('filterChatConversations filters by partner name or last message text', () => {
  const chats = [
    { id: 'c1', participants: ['me', 'u1'], lastMessage: 'Salom yaxshimisiz' },
    { id: 'c2', participants: ['me', 'u2'], lastMessage: 'Bugun uchrashamizmi?' },
    { id: 'c3', participants: ['me', 'alov_ai_bot'], lastMessage: 'Toshkentdan nomzod topdim', partner: { uid: 'alov_ai_bot', name: 'Alov AI' } },
  ];
  const users = [
    { uid: 'u1', name: 'Madina' },
    { uid: 'u2', name: 'Aziza' },
  ];

  assert.equal(filterChatConversations(chats, '', 'me', users).length, 3);
  assert.deepEqual(
    filterChatConversations(chats, 'aziza', 'me', users).map((c) => c.id),
    ['c2']
  );
  assert.deepEqual(
    filterChatConversations(chats, 'Toshkent', 'me', users).map((c) => c.id),
    ['c3']
  );
});

test('computeTelegramSafeAreaInsets safely computes Telegram top notch and header offsets', () => {
  assert.deepEqual(computeTelegramSafeAreaInsets(null), {
    safeTopPx: 0,
    contentTopPx: 0,
    totalTopPx: 0,
  });
  assert.deepEqual(
    computeTelegramSafeAreaInsets({
      safeAreaInset: { top: 44 },
      contentSafeAreaInset: { top: 52 },
    }),
    {
      safeTopPx: 44,
      contentTopPx: 52,
      totalTopPx: 96,
    }
  );
  assert.deepEqual(
    computeTelegramSafeAreaInsets({
      safeAreaInset: { top: -10 },
      contentSafeAreaInset: { top: Number.NaN },
    }),
    {
      safeTopPx: 0,
      contentTopPx: 0,
      totalTopPx: 0,
    }
  );
});

