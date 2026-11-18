import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateUniqueMessageId,
  mergeUniqueChatMessages,
  capMessagesForLocalCache,
  shouldAutoScrollConversation,
  formatMediaDuration,
  isFramelessChatMediaType,
  evaluateStartGifGate,
} from './chatMessages.ts';

describe('chatMessages helpers for consecutive GIFs, scroll guard, frameless media, Start GIF gate & duration', () => {
  it('enforces Start GIF gate ONLY on empty non-AI chats when partner configured a startGifUrl', () => {
    const startGif = 'https://static.klipy.com/start-hello.gif';

    assert.deepEqual(
      evaluateStartGifGate({
        isAIBotChat: false,
        partnerStartGifUrl: startGif,
        messages: [],
      }),
      { isLocked: true, startGifUrl: startGif }
    );

    // Unlocks as soon as first GIF/message is sent
    assert.deepEqual(
      evaluateStartGifGate({
        isAIBotChat: false,
        partnerStartGifUrl: startGif,
        messages: [{ id: 'm1', type: 'gif', fileUrl: startGif }],
      }),
      { isLocked: false, startGifUrl: startGif }
    );

    // Never locks when partner has no startGifUrl
    assert.deepEqual(
      evaluateStartGifGate({
        isAIBotChat: false,
        partnerStartGifUrl: '',
        messages: [],
      }),
      { isLocked: false, startGifUrl: '' }
    );

    // Never locks AI bot chats
    assert.deepEqual(
      evaluateStartGifGate({
        isAIBotChat: true,
        partnerStartGifUrl: startGif,
        messages: [],
      }),
      { isLocked: false, startGifUrl: startGif }
    );
  });

  it('generates collision-free message IDs even in tight synchronous loops', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) {
      ids.add(generateUniqueMessageId('msg'));
    }
    assert.equal(ids.size, 500);
  });

  it('preserves consecutive GIFs (even identical GIF URLs) when merging history, local, and socket updates', () => {
    const gifUrl = 'https://static.klipy.com/ii/abc/hd.gif';
    const gif1 = {
      id: 'msg_gif_1',
      type: 'gif',
      fileUrl: gifUrl,
      content: gifUrl,
      text: 'GIF',
      status: 'sending',
      createdAt: '2026-01-01T10:00:00.000Z',
    };
    const gif2 = {
      id: 'msg_gif_2',
      type: 'gif',
      fileUrl: gifUrl,
      content: gifUrl,
      text: 'GIF',
      status: 'sending',
      createdAt: '2026-01-01T10:00:01.000Z',
    };

    // Simulate server returning only gif1 while gif2 was sent optimistically, and socket upgrading gif1 to sent
    const merged = mergeUniqueChatMessages(
      [gif1, gif2],
      [{ ...gif1, status: 'sent' }],
      [gif1]
    );

    assert.equal(merged.length, 2);
    assert.equal(merged[0].id, 'msg_gif_1');
    assert.equal(merged[0].status, 'sent');
    assert.equal(merged[1].id, 'msg_gif_2');
    assert.equal(merged[1].fileUrl, gifUrl);
  });

  it('only auto-scrolls on open, forceScroll, or new message while near bottom — never yanks user scrolling up', () => {
    assert.equal(
      shouldAutoScrollConversation({
        prevCount: 20,
        nextCount: 20,
        conversationChanged: false,
        forceScroll: false,
        isNearBottom: false,
      }),
      false
    );
    assert.equal(
      shouldAutoScrollConversation({
        prevCount: 20,
        nextCount: 21,
        conversationChanged: false,
        forceScroll: false,
        isNearBottom: false,
      }),
      false
    );
    assert.equal(
      shouldAutoScrollConversation({
        prevCount: 20,
        nextCount: 21,
        conversationChanged: false,
        forceScroll: false,
        isNearBottom: true,
      }),
      true
    );
    assert.equal(
      shouldAutoScrollConversation({
        prevCount: 20,
        nextCount: 20,
        conversationChanged: true,
        forceScroll: false,
        isNearBottom: false,
      }),
      true
    );
    assert.equal(
      shouldAutoScrollConversation({
        prevCount: 20,
        nextCount: 21,
        conversationChanged: false,
        forceScroll: true,
        isNearBottom: false,
      }),
      true
    );
  });

  it('detects frameless chat media types (gif, image, video) and keeps voice/audio/text framed', () => {
    assert.equal(isFramelessChatMediaType({ type: 'gif', content: 'https://static.klipy.com/1.gif' }), true);
    assert.equal(isFramelessChatMediaType({ type: 'image', fileUrl: '/api/media/a.jpg' }), true);
    assert.equal(isFramelessChatMediaType({ type: 'video', fileUrl: '/api/media/a.mp4' }), true);
    assert.equal(isFramelessChatMediaType({ type: 'voice', fileUrl: '/api/media/v.webm' }), false);
    assert.equal(isFramelessChatMediaType({ type: 'audio', fileUrl: '/api/media/s.mp3' }), false);
    assert.equal(isFramelessChatMediaType({ type: 'text', text: 'Salom' }), false);
  });

  it('formats media durations and caps oversized inline data URLs for local cache', () => {
    assert.equal(formatMediaDuration(0), '0:00');
    assert.equal(formatMediaDuration(5), '0:05');
    assert.equal(formatMediaDuration(75.8), '1:15');
    assert.equal(formatMediaDuration(NaN), '0:00');

    const hugeData = 'data:video/mp4;base64,' + 'A'.repeat(70_000);
    const cached = capMessagesForLocalCache([
      { id: '1', type: 'video', fileUrl: hugeData },
      { id: '2', type: 'gif', fileUrl: 'https://static.klipy.com/a.gif' },
    ]);
    assert.equal(cached[0].fileUrl, '');
    assert.equal(cached[1].fileUrl, 'https://static.klipy.com/a.gif');
  });
});
