import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUpdatedUserSnapshot,
  calculateAgeFromBirthDate,
  collectReplacedUserMediaUrls,
  deduplicateUsersList,
  deriveBirthDateFromAge,
  isExplicitProfileDisplayName,
  mergeAuthoritativeUserState,
  mergeReturningAuthProfile,
  normalizeTelegramUrl,
  pickNewestCanonicalUser,
  propagateProfileUpdateAcrossStores,
  reconcileAppVersionCache,
  upsertUniqueUserInList,
  userSharesIdentity,
  writeAuthoritativeUserCache,
} from './profileSync.ts';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(k: string) {
      return map.has(k) ? map.get(k)! : null;
    },
    setItem(k: string, v: string) {
      map.set(k, String(v));
    },
    removeItem(k: string) {
      map.delete(k);
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

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

  it('overwrites old profile fields/media cleanly instead of appending duplicates and clears removed fields', () => {
    const existing = {
      uid: 'u1',
      name: 'Eski Ism',
      username: 'eski_nick',
      telegramUsername: 'eski_tg',
      avatar: '/api/media/old_avatar.jpg',
      banner: '/api/media/old_banner.jpg',
      videoUrl: '/api/media/old_video.mp4',
      photos: ['/api/media/p1.jpg', '/api/media/p1.jpg'],
      gallery: ['/api/media/g1.jpg'],
    };

    const next = buildUpdatedUserSnapshot(existing, {
      name: 'Yangi Ism',
      username: '',
      avatar: '/api/media/new_avatar.jpg',
      banner: null,
      videoUrl: '/api/media/new_video.mp4',
      photos: ['/api/media/p2.jpg', '/api/media/p2.jpg'],
      gallery: [],
    });

    assert.equal(next.name, 'Yangi Ism');
    assert.equal(next.username, '');
    assert.equal('telegramUsername' in next, false);
    assert.equal(next.avatar, '/api/media/new_avatar.jpg');
    assert.equal(next.banner, '');
    assert.equal(next.videoUrl, '/api/media/new_video.mp4');
    assert.deepEqual(next.photos, ['/api/media/p2.jpg']);
    assert.deepEqual(next.gallery, []);

    const replacedMedia = collectReplacedUserMediaUrls(existing, next);
    assert.deepEqual(replacedMedia.sort(), [
      '/api/media/g1.jpg',
      '/api/media/old_avatar.jpg',
      '/api/media/old_banner.jpg',
      '/api/media/old_video.mp4',
      '/api/media/p1.jpg',
    ]);
  });

  it('deduplicates users sharing identity and replaces matching users in-place on update', () => {
    const oldAlias: Record<string, any> = {
      uid: 'tg_999',
      id: 'TG-999',
      name: 'Eski Alias',
      telegram: 'https://t.me/sardor_uz',
      isProfileCompleted: true,
      updatedAt: '2026-11-10T10:00:00.000Z',
    };
    const canonical: Record<string, any> = {
      uid: 'google_999',
      id: 'ALOV-999',
      name: 'Yangi Sardor',
      telegram: 'https://t.me/sardor_uz',
      isProfileCompleted: true,
      updatedAt: '2026-11-16T10:00:00.000Z',
    };
    const unrelated: Record<string, any> = {
      uid: 'u_other',
      id: 'ALOV-2',
      name: 'Dilnoza',
      isProfileCompleted: true,
    };

    const deduped = deduplicateUsersList([oldAlias, unrelated, canonical]);
    assert.equal(deduped.users.length, 2);
    assert.deepEqual(deduped.removedUids, ['tg_999']);
    assert.equal(deduped.users.some((u) => u.uid === 'google_999'), true);

    const updatedList = upsertUniqueUserInList([oldAlias, unrelated], {
      ...canonical,
      name: 'Sardor Yangilandi',
      photos: ['/api/media/a.jpg', '/api/media/a.jpg'],
    });
    assert.equal(updatedList.length, 2);
    assert.equal(updatedList[0].uid, 'google_999');
    assert.equal(updatedList[0].name, 'Sardor Yangilandi');
    assert.deepEqual(updatedList[0].photos, ['/api/media/a.jpg']);

    const mergedAuth = mergeAuthoritativeUserState(
      { uid: 'google_999', authToken: 'tok_keep', staleExtra: 'old' },
      { uid: 'google_999', name: 'Sardor Yangilandi' }
    );
    assert.equal(mergedAuth?.authToken, 'tok_keep');
    assert.equal('staleExtra' in mergedAuth, false);
  });

  it('clears stale profile and legacy local chat caches on app version bump while strictly preserving posts and login identity', () => {
    const storage = createMemoryStorage({
      alov_app_version: '1.1.1',
      alov_user_id: 'tg_777',
      userId: 'tg_777',
      alov_auth_token: 'alov_session_tg_777',
      alov_tg_chat_salikh: '777',
      alov_current_user: JSON.stringify({ uid: 'tg_777', name: 'Eski Kesh Ism', avatar: '/api/media/old.jpg' }),
      alov_user_tg_777: JSON.stringify({ uid: 'tg_777', name: 'Eski Kesh Ism', avatar: '/api/media/old.jpg' }),
      alov_user_old_alias: JSON.stringify({ uid: 'old_alias', name: 'Alias' }),
      alov_chats_tg_777: '[{"id":"c1"}]',
      alov_msgs_tg_777_u2: '[{"id":"m1","text":"Salom"}]',
      alov_posts_feed: '[{"id":"p1"}]',
    });

    const res = reconcileAppVersionCache(storage, '1.1.2');
    assert.equal(res.versionChanged, true);
    assert.equal(res.previousVersion, '1.1.1');
    assert.equal(res.currentVersion, '1.1.2');
    assert.equal(res.preservedUserId, 'tg_777');
    assert.equal(res.preservedToken, 'alov_session_tg_777');
    assert.equal(storage.getItem('alov_app_version'), '1.1.2');
    assert.equal(storage.getItem('alov_current_user'), null);
    assert.equal(storage.getItem('alov_user_tg_777'), null);
    assert.equal(storage.getItem('alov_user_old_alias'), null);
    // Legacy local chat caches MUST be wiped because chats persist strictly on Render server
    assert.equal(storage.getItem('alov_chats_tg_777'), null);
    assert.equal(storage.getItem('alov_msgs_tg_777_u2'), null);
    // Posts and auth identity MUST NEVER be wiped on version update
    assert.equal(storage.getItem('alov_posts_feed'), '[{"id":"p1"}]');
    assert.equal(storage.getItem('alov_user_id'), 'tg_777');
    assert.equal(storage.getItem('alov_auth_token'), 'alov_session_tg_777');
    assert.equal(storage.getItem('alov_tg_chat_salikh'), '777');

    // Second boot on same version should NOT clear fresh cache
    writeAuthoritativeUserCache(storage, {
      uid: 'tg_777',
      name: 'Yangi Server Ism',
      avatar: '/api/media/new.jpg',
      startGifUrl: 'https://static.klipy.com/start.gif',
    });
    const sameVersion = reconcileAppVersionCache(storage, '1.1.2');
    assert.equal(sameVersion.versionChanged, false);
    assert.ok(storage.getItem('alov_current_user')?.includes('Yangi Server Ism'));
    assert.ok(storage.getItem('alov_current_user')?.includes('/api/media/new.jpg'));
    assert.ok(!storage.getItem('alov_current_user')?.includes('/api/media/old.jpg'));
  });

  it('completely erases initial login avatar/name/address shadows on profile edit while keeping uid & immunity against returning auth', () => {
    const initialUser = {
      uid: 'tg_555001',
      id: 'ALOV-555001',
      name: 'Telegram Birinchi Ism',
      firstName: 'Telegram',
      lastName: 'Familiya',
      displayName: 'Telegram Birinchi Ism',
      googlePhotoURL: 'https://lh3.googleusercontent.com/initial.jpg',
      username: 'birinchi_nick',
      region: 'Toshkent shahri',
      district: 'Yunusobod tumani',
      neighborhood: 'Eski MFY',
      avatar: '/api/face-id/photo/face_tg_555001.jpg',
      banner: '/api/media/initial_banner.jpg',
      hasCustomAvatar: false,
      isProfileCompleted: true,
      coins: 450,
      faceId: {
        verified: true,
        detectedGender: 'male',
        genderLabelUz: 'Erkak',
        confidence: 96,
        capturedPhotoUrl: '/api/face-id/photo/face_tg_555001.jpg',
      },
    };

    const edited = buildUpdatedUserSnapshot(
      initialUser,
      {
        uid: 'wrong_duplicate_uid',
        name: 'Azizbek Yangi',
        username: 'azizbek_yangi',
        region: 'Samarqand viloyati',
        district: 'Samarqand shahri',
        neighborhood: 'Bog\'i Shamol MFY',
        avatar: '/api/media/edited_avatar.jpg',
        banner: '/api/media/cropped_banner.jpg',
        hasCustomAvatar: true,
        isProfileEdit: true,
      },
      { isProfileEdit: true, replaceInitialAvatar: true }
    );

    // Must keep original uid (no duplicate account) & preserve coins
    assert.equal(edited.uid, 'tg_555001');
    assert.equal(edited.coins, 450);
    assert.equal(edited.hasEditedProfile, true);

    // Primary edited data overwrites completely; old shadows & initial capturedPhotoUrl removed
    assert.equal(edited.name, 'Azizbek Yangi');
    assert.equal(edited.firstName, 'Azizbek Yangi');
    assert.equal(edited.lastName, '');
    assert.equal(edited.username, 'azizbek_yangi');
    assert.equal(edited.region, 'Samarqand viloyati');
    assert.equal(edited.district, 'Samarqand shahri');
    assert.equal(edited.neighborhood, 'Bog\'i Shamol MFY');
    assert.equal(edited.avatar, '/api/media/edited_avatar.jpg');
    assert.equal(edited.photoURL, '/api/media/edited_avatar.jpg');
    assert.equal(edited.banner, '/api/media/cropped_banner.jpg');
    assert.equal('displayName' in edited, false);
    assert.equal('googlePhotoURL' in edited, false);
    assert.equal('capturedPhotoUrl' in edited.faceId, false);
    assert.equal(edited.faceId.verified, true);
    assert.equal(edited.faceId.detectedGender, 'male');

    const replaced = collectReplacedUserMediaUrls(initialUser, edited);
    assert.deepEqual(replaced.sort(), [
      '/api/face-id/photo/face_tg_555001.jpg',
      '/api/media/initial_banner.jpg',
    ]);

    // Subsequent Telegram/Google login must NEVER revert edited primary data back to initial values
    const afterRelogin = mergeReturningAuthProfile(edited, {
      name: 'Telegram Birinchi Ism',
      firstName: 'Telegram',
      lastName: 'Familiya',
      avatar: 'https://api.telegram.org/file/bot123/initial.jpg',
      telegram: '@birinchi_nick',
    });
    assert.equal(afterRelogin.name, 'Azizbek Yangi');
    assert.equal(afterRelogin.lastName, '');
    assert.equal(afterRelogin.avatar, '/api/media/edited_avatar.jpg');
    assert.equal(afterRelogin.username, 'azizbek_yangi');
  });

  it('derives birthDate from age consistently and propagates gender/age edits across faceId, posts, and chats', () => {
    const refNow = new Date('2026-11-19T12:00:00.000Z');
    const derived = deriveBirthDateFromAge(27, '2002-05-15', refNow);
    assert.equal(derived, '1999-05-15');
    assert.equal(calculateAgeFromBirthDate(derived, 22, refNow), 27);

    const updated = buildUpdatedUserSnapshot(
      {
        uid: 'tg_salikh_07',
        gender: 'male',
        age: 24,
        birthDate: '2002-05-15',
        faceId: { verified: true, detectedGender: 'male', genderLabelUz: 'Yigit (Erkak)' },
      },
      {
        gender: 'female',
        age: 27,
        birthDate: derived,
        isProfileEdit: true,
      },
      { isProfileEdit: true }
    );
    assert.equal(updated.gender, 'female');
    assert.equal(updated.age, 27);
    assert.equal(updated.faceId.detectedGender, 'female');
    assert.equal(updated.faceId.genderLabelUz, 'Qiz (Ayol)');

    const stores = {
      posts: [{ id: 'p_adm', authorUid: 'tg_salikh_07', authorName: 'Salikh', authorGender: 'male' }],
      userChats: {
        c1: { id: 'c1', participants: ['tg_salikh_07', 'u2'], partner: { uid: 'tg_salikh_07', name: 'Salikh', gender: 'male', age: 24 } },
      },
      chatMessages: {},
      liveStreams: {},
      coinRequests: [],
      withdrawals: [],
    };
    const prop = propagateProfileUpdateAcrossStores(stores, updated);
    assert.equal(prop.postsChanged, true);
    assert.equal(prop.chatsChanged, true);
    assert.equal(stores.posts[0].authorGender, 'female');
    assert.equal(stores.userChats.c1.partner.gender, 'female');
    assert.equal(stores.userChats.c1.partner.age, 27);
  });
});


