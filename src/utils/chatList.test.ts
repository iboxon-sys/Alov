import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalChatId, mergeChatLists } from './chatList';

test('buildCanonicalChatId produces order-independent canonical ids', () => {
  assert.equal(buildCanonicalChatId('u2', 'u1'), 'u1_u2');
  assert.equal(buildCanonicalChatId('u1', 'u2'), 'u1_u2');
});

test('mergeChatLists retains older chats when adding new partners and preserves partner metadata', () => {
  const existing = [
    {
      id: 'me_old1',
      participants: ['me', 'old1'],
      lastMessage: 'Salom eski suhbat',
      updatedAt: '2026-11-16T01:00:00.000Z',
      partner: { uid: 'old1', name: 'Ali' },
    },
    {
      id: 'me_old2',
      participants: ['me', 'old2'],
      lastMessage: 'Yana bir suhbat',
      updatedAt: '2026-11-16T02:00:00.000Z',
      partner: { uid: 'old2', name: 'Vali' },
    },
  ];
  const server = [
    {
      id: 'me_old1',
      participants: ['me', 'old1'],
      lastMessage: 'Salom eski suhbat',
      updatedAt: '2026-11-16T01:00:00.000Z',
    },
  ];
  const newlyOpened = [
    {
      id: 'me_new3',
      participants: ['me', 'new3'],
      lastMessage: 'Yangi suhbat boshlandi',
      updatedAt: '2026-11-16T03:00:00.000Z',
      partner: { uid: 'new3', name: 'Madina' },
    },
  ];

  const merged = mergeChatLists([existing, server, newlyOpened], 'me');
  assert.equal(merged.length, 3);
  assert.equal(merged[0].partner.name, 'Madina');
  assert.equal(merged[1].partner.name, 'Vali');
  assert.equal(merged[2].partner.name, 'Ali');
});

test('mergeChatLists supports unlimited chats without dropping items', () => {
  const manyChats = Array.from({ length: 150 }, (_, idx) => ({
    id: `me_user_${idx}`,
    participants: ['me', `user_${idx}`],
    lastMessage: `Msg ${idx}`,
    updatedAt: new Date(1700000000000 + idx * 1000).toISOString(),
    partner: { uid: `user_${idx}`, name: `User ${idx}` },
  }));

  const merged = mergeChatLists([manyChats], 'me');
  assert.equal(merged.length, 150);
  assert.equal(merged[0].partner.uid, 'user_149');
  assert.equal(merged[149].partner.uid, 'user_0');
});
