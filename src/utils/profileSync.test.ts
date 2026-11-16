import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isExplicitProfileDisplayName,
  normalizeTelegramUrl,
  pickNewestCanonicalUser,
  propagateProfileUpdateAcrossStores,
  userSharesIdentity,
} from './profileSync.ts';

describe('Profile persistence, identity deduplication & DB propagation', () => {
  it('normalizes Telegram handles into canonical https://t.me/ URLs or empty string', () => {
    assert.equal(normalizeTelegramUrl('@Azizbek_01'), 'https://t.me/azizbek_01');
    assert.equal(normalizeTelegramUrl('https://t.me/Azizbek_01'), 'https://t.me/azizbek_01');
    assert.equal(normalizeTelegramUrl('   '), '');
    assert.equal(normalizeTelegramUrl('123456789'), '');
  });

  it('accepts explicit user display names even when matching handle, while rejecting generic placeholders', () => {
    assert.equal(isExplicitProfileDisplayName('Dilshod'), true);
    assert.equal(isExplicitProfileDisplayName('Salikh_07'), true);
    assert.equal(isExplicitProfileDisplayName('Foydalanuvchi'), false);
    assert.equal(isExplicitProfileDisplayName('@dilshod'), false);
    assert.equal(isExplicitProfileDisplayName('+998 90 123 45 67'), false);
  });

  it('detects shared identity across duplicate Google/Telegram/Phone records and picks the newest completed one', () => {
    const staleOld = {
      uid: 'tg_12345',
      name: 'Eski Ism',
      telegram: 'https://t.me/aziz_uz',
      telegramChatId: 777111,
      phone: '+998 90 111 22 33',
      isProfileCompleted: true,
      updatedAt: '2026-11-15T10:00:00.000Z',
    };
    const editedNew = {
      uid: 'google_uid_abc',
      name: 'Yangi Ism',
      email: 'aziz@example.com',
      telegram: 'https://t.me/aziz_uz',
      telegramChatId: 777111,
      phone: '+998 90 111 22 33',
      isProfileCompleted: true,
      updatedAt: '2026-11-16T12:00:00.000Z',
    };
    const otherUser = {
      uid: 'uid_other',
      name: 'Malika',
      email: 'malika@example.com',
      phone: '+998 91 999 88 77',
      isProfileCompleted: true,
    };

    assert.equal(userSharesIdentity(staleOld, editedNew), true);
    assert.equal(userSharesIdentity(staleOld, otherUser), false);

    const winner = pickNewestCanonicalUser([staleOld, editedNew]);
    assert.equal(winner?.uid, 'google_uid_abc');
    assert.equal(winner?.name, 'Yangi Ism');
  });

  it('propagates edited profile name and avatar across posts, chats, messages, streams, coin requests, and withdrawals', () => {
    const stores = {
      posts: [
        {
          id: 'p1',
          authorUid: 'tg_old_uid',
          authorId: 'ALOV-1',
          authorName: 'Eski Ism',
          authorUsername: 'eski_user',
          authorAvatar: '/api/media/old.jpg',
          comments: [
            { id: 'c1', authorUid: 'tg_old_uid', authorName: 'Eski Ism', authorAvatar: '/api/media/old.jpg', text: 'Salom' },
          ],
        },
      ],
      userChats: {
        tg_1_tg_old_uid: {
          id: 'tg_1_tg_old_uid',
          participants: ['tg_1', 'tg_old_uid'],
          partner: { uid: 'tg_old_uid', id: 'ALOV-1', name: 'Eski Ism', username: 'eski_user', avatar: '/api/media/old.jpg' },
        },
      },
      chatMessages: {
        tg_1_tg_old_uid: [
          {
            id: 'm1',
            senderId: 'tg_old_uid',
            senderName: 'Eski Ism',
            senderAvatar: '/api/media/old.jpg',
            sender: { _id: 'tg_old_uid', uid: 'tg_old_uid', name: 'Eski Ism', avatar: '/api/media/old.jpg' },
            text: 'Assalomu alaykum',
          },
        ],
      },
      liveStreams: {
        s1: { id: 's1', hostUid: 'tg_old_uid', hostName: 'Eski Ism', hostAvatar: '/api/media/old.jpg' },
      },
      coinRequests: [
        { id: 'cr1', userUid: 'tg_old_uid', userId: 'ALOV-1', userName: 'Eski Ism', userAvatar: '/api/media/old.jpg' },
      ],
      withdrawals: [
        { id: 'w1', userUid: 'tg_old_uid', userName: 'Eski Ism' },
      ],
    };

    const updatedUser = {
      uid: 'uid_canonical',
      id: 'ALOV-1',
      name: 'Yangi Ism',
      username: 'yangi_user',
      avatar: '/api/media/new.jpg',
      faceId: { verified: true },
    };

    const res = propagateProfileUpdateAcrossStores(stores, updatedUser, ['tg_old_uid']);
    assert.equal(res.postsChanged, true);
    assert.equal(res.chatsChanged, true);
    assert.equal(res.messagesChanged, true);
    assert.equal(res.streamsChanged, true);
    assert.equal(res.coinRequestsChanged, true);
    assert.equal(res.withdrawalsChanged, true);

    assert.equal(stores.posts[0].authorUid, 'uid_canonical');
    assert.equal(stores.posts[0].authorName, 'Yangi Ism');
    assert.equal(stores.posts[0].authorAvatar, '/api/media/new.jpg');
    assert.equal(stores.posts[0].comments[0].authorName, 'Yangi Ism');

    assert.deepEqual(stores.userChats.tg_1_tg_old_uid.participants, ['tg_1', 'uid_canonical']);
    assert.equal(stores.userChats.tg_1_tg_old_uid.partner.name, 'Yangi Ism');
    assert.equal(stores.userChats.tg_1_tg_old_uid.partner.avatar, '/api/media/new.jpg');

    assert.equal(stores.chatMessages.tg_1_tg_old_uid[0].senderId, 'uid_canonical');
    assert.equal(stores.chatMessages.tg_1_tg_old_uid[0].senderName, 'Yangi Ism');
    assert.equal(stores.chatMessages.tg_1_tg_old_uid[0].sender.name, 'Yangi Ism');

    assert.equal(stores.liveStreams.s1.hostName, 'Yangi Ism');
    assert.equal(stores.coinRequests[0].userName, 'Yangi Ism');
    assert.equal(stores.withdrawals[0].userName, 'Yangi Ism');
  });
});
