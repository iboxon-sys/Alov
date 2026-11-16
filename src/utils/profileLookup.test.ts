import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveExactUserByUid,
  resolveConnectionUsers,
  getInitialAuthDraftState,
  telegramInputMatchesBotRecord,
  canPersistUserProfile,
  pruneIncompleteProfiles,
  formatAuthErrorMessage,
  resolveTelegramMiniAppBootAction,
  resolvePostProviderAuthStep,
  resolvePostFaceIdStep,
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
    assert.equal(clean.regGender, '');
    assert.equal(clean.regBanner, '');
  });

  it('matches Telegram bot users strictly by handle or phone and never leaks to a different handle', () => {
    const salikhRecord = { chatId: 6621230534, username: 'salikh_07', phone: '998901112233' };
    assert.equal(telegramInputMatchesBotRecord(salikhRecord, '@Salikh_07'), true);
    assert.equal(telegramInputMatchesBotRecord(salikhRecord, '+998901112233'), true);
    assert.equal(telegramInputMatchesBotRecord(salikhRecord, '@other_person'), false);
    assert.equal(telegramInputMatchesBotRecord(salikhRecord, '+998999999999'), false);
  });

  it('persists only completed Face-ID-verified profiles with explicit gender or platform admin', () => {
    const adminProfile = { uid: 'tg_salikh_07', telegram: '@Salikh_07', isProfileCompleted: false };
    const incompleteTg = { uid: 'tg_draft_1', telegram: '@someone', isProfileCompleted: false, faceId: { verified: true }, name: 'Test', gender: 'male' };
    const incompleteGoogle = { uid: 'google_draft_2', email: 'a@b.com', name: 'Google', isProfileCompleted: true, gender: 'female' };
    const namelessUser = { uid: 'uid_noname', name: '   ', isProfileCompleted: true, faceId: { verified: true }, gender: 'male' };
    const genderlessUser = { uid: 'uid_nogender', name: 'Aziz', isProfileCompleted: true, faceId: { verified: true } };
    const completedUser = {
      uid: 'uid_complete',
      name: 'Madina',
      gender: 'female',
      isProfileCompleted: true,
      faceId: { verified: true },
    };

    assert.equal(canPersistUserProfile(null), false);
    assert.equal(canPersistUserProfile(incompleteTg), false);
    assert.equal(canPersistUserProfile(incompleteGoogle), false);
    assert.equal(canPersistUserProfile(namelessUser), false);
    assert.equal(canPersistUserProfile(genderlessUser), false);
    assert.equal(canPersistUserProfile(completedUser), true);
    assert.equal(canPersistUserProfile(adminProfile), true);

    const pruned = pruneIncompleteProfiles([adminProfile, incompleteTg, incompleteGoogle, namelessUser, genderlessUser, completedUser]);
    assert.deepEqual(
      pruned.map((u) => u.uid),
      ['tg_salikh_07', 'uid_complete']
    );
  });

  it('maps Firebase Auth error codes to clean Uzbek messages', () => {
    const invalidCred = formatAuthErrorMessage({ code: 'auth/invalid-credential', message: 'Firebase: Error (auth/invalid-credential).' }, 'login');
    assert.ok(!invalidCred.includes('Firebase:'));
    assert.ok(invalidCred.includes('topilmadi'));

    const weakPass = formatAuthErrorMessage({ code: 'auth/weak-password', message: 'Firebase: Password should be at least 6 characters (auth/weak-password).' }, 'register');
    assert.ok(weakPass.includes('6 ta belgi'));

    const genericFirebase = formatAuthErrorMessage({ code: 'auth/internal-error', message: 'Firebase: Error (auth/internal-error).' }, 'login');
    assert.equal(genericFirebase, "Kirishda xatolik yuz berdi.");
  });

  it('never opens Auth or Face ID on boot for new/unregistered visitors even in Telegram Mini App', () => {
    const newGuest = resolveTelegramMiniAppBootAction({ exists: false, user: null });
    assert.equal(newGuest.shouldAutoLogin, false);
    assert.equal(newGuest.shouldOpenAuthModal, false);
    assert.equal(newGuest.initialStep, null);

    const incompleteVisitor = resolveTelegramMiniAppBootAction({
      exists: true,
      user: { uid: 'tg_999', name: 'Visitor', isProfileCompleted: false },
    });
    assert.equal(incompleteVisitor.shouldAutoLogin, false);
    assert.equal(incompleteVisitor.shouldOpenAuthModal, false);
    assert.equal(incompleteVisitor.initialStep, null);

    const returningUser = resolveTelegramMiniAppBootAction({
      exists: true,
      user: {
        uid: 'tg_123',
        name: 'Dilnoza',
        gender: 'female',
        isProfileCompleted: true,
        faceId: { verified: true },
      },
    });
    assert.equal(returningUser.shouldAutoLogin, true);
    assert.equal(returningUser.shouldOpenAuthModal, false);
    assert.equal(returningUser.initialStep, null);
  });

  it('routes only first-time Telegram/Google/Email registrants into Face ID and then profile registration', () => {
    const completedUser = {
      uid: 'uid_done',
      name: 'Azizbek',
      gender: 'male',
      isProfileCompleted: true,
      faceId: { verified: true },
    };

    assert.equal(resolvePostProviderAuthStep({ provider: 'telegram', exists: false, user: null }), 'face_id');
    assert.equal(resolvePostProviderAuthStep({ provider: 'google', exists: false, user: null }), 'face_id');
    assert.equal(resolvePostProviderAuthStep({ provider: 'email', exists: false, user: null }), 'face_id');

    assert.equal(resolvePostProviderAuthStep({ provider: 'telegram', exists: true, user: completedUser }), 'enter_app');
    assert.equal(resolvePostProviderAuthStep({ provider: 'google', exists: true, user: completedUser }), 'enter_app');
    assert.equal(resolvePostProviderAuthStep({ provider: 'email', exists: true, user: completedUser }), 'enter_app');

    assert.equal(resolvePostFaceIdStep('telegram'), 'profile_setup');
    assert.equal(resolvePostFaceIdStep('google'), 'google_setup');
    assert.equal(resolvePostFaceIdStep('email'), 'google_setup');
  });
});

