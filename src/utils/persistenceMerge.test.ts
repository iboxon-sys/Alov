import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeChatStores,
  mergeFriendshipStores,
  mergeMessageStores,
  mergeRecordsByIdNewestFirst,
  mergeTelegramBotUserMaps,
} from './persistenceMerge';

test('merges chats from MongoDB and disk without losing history or participants', () => {
  const mongoChats = {
    a_b: { id: 'a_b', participants: ['a', 'b'], lastMessage: 'Salom', updatedAt: '2026-11-25T10:00:00Z' },
  };
  const diskChats = {
    a_b: { id: 'a_b', participants: ['a'], lastMessage: 'Old', updatedAt: '2026-11-24T10:00:00Z' },
    c_d: { id: 'c_d', participants: ['c', 'd'], lastMessage: 'Disk only', updatedAt: '2026-11-25T09:00:00Z' },
  };

  const merged = mergeChatStores(mongoChats, diskChats);
  assert.equal(merged.a_b.lastMessage, 'Salom');
  assert.deepEqual(merged.a_b.participants.sort(), ['a', 'b']);
  assert.equal(merged.c_d.lastMessage, 'Disk only');
});

test('merges chat messages by id, keeps read status, and sorts chronologically', () => {
  const mongoMsgs = {
    a_b: [
      { id: 'm1', text: '1', createdAt: '2026-11-25T10:00:00Z', read: true, status: 'read' },
      { id: 'm3', text: '3', createdAt: '2026-11-25T10:02:00Z', read: false, status: 'sent' },
    ],
  };
  const diskMsgs = {
    a_b: [
      { id: 'm1', text: '1', createdAt: '2026-11-25T10:00:00Z', read: false, status: 'sent' },
      { id: 'm2', text: '2', createdAt: '2026-11-25T10:01:00Z', read: true, status: 'read' },
    ],
  };

  const merged = mergeMessageStores(mongoMsgs, diskMsgs);
  assert.deepEqual(merged.a_b.map((m) => m.id), ['m1', 'm2', 'm3']);
  assert.equal(merged.a_b[0].read, true);
  assert.equal(merged.a_b[0].status, 'read');
});

test('merges friendships keeping newest updatedAt state', () => {
  const merged = mergeFriendshipStores(
    { a_b: { active: true, toggledBy: 'b', updatedAt: '2026-11-25T12:00:00Z' } },
    { a_b: { active: false, toggledBy: 'b', updatedAt: '2026-11-25T11:00:00Z' } }
  );
  assert.equal(merged.a_b.active, true);
});

test('merges coin requests / withdrawals preserving reviewed status and newest-first order', () => {
  const mongoReqs = [
    { id: 'r1', status: 'approved', reviewedAt: '2026-11-25T12:00:00Z', createdAt: '2026-11-25T10:00:00Z' },
  ];
  const diskReqs = [
    { id: 'r1', status: 'pending', createdAt: '2026-11-25T10:00:00Z' },
    { id: 'r2', status: 'pending', createdAt: '2026-11-25T11:00:00Z' },
  ];

  const merged = mergeRecordsByIdNewestFirst(mongoReqs, diskReqs);
  assert.deepEqual(merged.map((r) => r.id), ['r2', 'r1']);
  assert.equal(merged[1].status, 'approved');
});

test('merges Telegram bot user maps preferring fresher records', () => {
  const merged = mergeTelegramBotUserMaps(
    [['123', { chatId: 123, firstName: 'New', updatedAt: 2000 }]],
    [
      ['123', { chatId: 123, firstName: 'Old', updatedAt: 1000 }],
      ['@ali', { chatId: 456, firstName: 'Ali', updatedAt: 1500 }],
    ]
  );
  assert.equal(merged.get('123')?.firstName, 'New');
  assert.equal(merged.get('@ali')?.firstName, 'Ali');
});
