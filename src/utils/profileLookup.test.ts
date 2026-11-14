import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveExactUserByUid,
  resolveConnectionUsers,
  getInitialAuthDraftState,
  telegramInputMatchesBotRecord,
} from './profileLookup.ts';

describe('Profile lookup & auth isolation helpers', () => {
  const userA = { uid: 'uid_ali', id: 'ALOV-001', name: 'Ali' };
  const userB = { uid: 'uid_malika', id: 'ALOV-002', name: 'Malika' };
  const admin = { uid: 'tg_salikh_07', id: 'ALOV-ADMIN', name: 'Salikh' };
  const allUsers = [admin, userA, userB];

  it('resolves exact user by uid or id and never substitutes another user', () => {
    const resB = resolveExactUserByUid('uid_malika', allUsers, userA);
    assert.equal(resB.isSelf, false);
    assert.equal(resB.user?.uid, 'uid_malika');

    const resById = resolveExactUserByUid('ALOV-002', allUsers, userA);
    assert.equal(resById.user?.uid, 'uid_malika');

    const resSelf = resolveExactUserByUid('uid_ali', allUsers, userA);
    assert.equal(resSelf.isSelf, true);
    assert.equal(resSelf.user?.uid, 'uid_ali');

    const resUnknown = resolveExactUserByUid('uid_nonexistent', allUsers, userA);
    assert.equal(resUnknown.isSelf, false);
    assert.equal(resUnknown.user, null);
  });

  it('resolves unique connection user objects without fabricating demo profiles', () => {
    const conns = resolveConnectionUsers(['uid_malika', 'uid_nonexistent', 'uid_malika', 'tg_salikh_07'], allUsers, userA);
    assert.equal(conns.length, 2);
    assert.deepEqual(
      conns.map((u) => u.uid),
      ['uid_malika', 'tg_salikh_07']
    );
  });

  it('returns clean empty auth draft state so no previous user data leaks', () => {
    const clean = getInitialAuthDraftState();
    assert.equal(clean.telegramInput, '');
    assert.equal(clean.enteredTgCode, '');
    assert.equal(clean.authEmail, '');
    assert.equal(clean.authPassword, '');
    assert.equal(clean.pendingTgUser, null);
    assert.equal(clean.pendingFaceId, null);
    assert.equal(clean.regName, '');
    assert.equal(clean.regBanner, '');
  });

  it('matches Telegram bot users strictly by handle or phone and never leaks to a different handle', () => {
    const salikhRecord = { chatId: 6621230534, username: 'salikh_07', phone: '998901112233' };
    assert.equal(telegramInputMatchesBotRecord(salikhRecord, '@Salikh_07'), true);
    assert.equal(telegramInputMatchesBotRecord(salikhRecord, '+998901112233'), true);
    assert.equal(telegramInputMatchesBotRecord(salikhRecord, '@other_person'), false);
    assert.equal(telegramInputMatchesBotRecord(salikhRecord, '+998999999999'), false);
  });
});
