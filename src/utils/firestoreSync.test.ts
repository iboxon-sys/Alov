import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFirestoreProfilePatch,
  mergeDbAuthoritativeProfile,
  shouldPreserveLocalSessionOnSyncResult,
  splitUserToFirestoreDocs,
} from './firestoreSync.ts';

describe('Firestore persistent sync & non-destructive merge helpers', () => {
  it('splits PII out of public_profiles and initializes default coins ONLY on initial create', () => {
    const rawUser = {
      uid: 'google_u1',
      id: 'ALOV-U1',
      name: 'Madina',
      username: 'madina_uz',
      email: 'madina@example.com',
      phone: '+998 90 123 45 67',
      bankCard: '8600 1234 5678 9012',
      telegramChatId: 123456,
      age: 23,
      birthDate: '2003-04-10',
      gender: 'female',
      region: 'Toshkent shahri',
      district: 'Chilonzor tumani',
      bio: 'Assalomu alaykum',
      avatar: '/api/media/madina.jpg',
      banner: '/api/media/banner.jpg',
      startGifUrl: 'https://static.klipy.com/hi.gif',
      isProfileCompleted: true,
      isVerified: true,
      locationVisibility: 'mutual',
      isLocationEnabled: true,
      coins: 950,
      diamonds: 42.5,
      role: 'admin',
      isAdmin: true,
    };

    const initialDocs = splitUserToFirestoreDocs(rawUser, { isInitialCreate: true });
    assert.ok(initialDocs);
    assert.equal(initialDocs.walletDoc.coins, 100);
    assert.equal(initialDocs.walletDoc.diamonds, 0);
    assert.equal(initialDocs.userDoc.role, 'user');
    assert.equal(initialDocs.userDoc.isAdmin, false);
    assert.equal('email' in initialDocs.publicProfileDoc, false);
    assert.equal('phone' in initialDocs.publicProfileDoc, false);
    assert.equal('bankCard' in initialDocs.publicProfileDoc, false);
    assert.equal(initialDocs.privateInfoDoc.email, 'madina@example.com');
    assert.equal(initialDocs.privateInfoDoc.phone, '+998 90 123 45 67');
    assert.equal(initialDocs.settingsDoc.locationVisibility, 'mutual');
    assert.equal(initialDocs.settingsDoc.startGifUrl, 'https://static.klipy.com/hi.gif');

    const existingDocs = splitUserToFirestoreDocs(rawUser, { isInitialCreate: false });
    assert.ok(existingDocs);
    assert.equal(existingDocs.walletDoc.coins, 950);
    assert.equal(existingDocs.walletDoc.diamonds, 42.5);
  });

  it('builds partial profile patches without touching coins, diamonds, createdAt, role, or locked gender/birthDate', () => {
    const existing = {
      uid: 'u_locked',
      name: 'Eski Ism',
      gender: 'male',
      birthDate: '2000-01-01',
      age: 26,
      coins: 1200,
      diamonds: 85,
      isProfileCompleted: true,
    };

    const patch = buildFirestoreProfilePatch(existing, {
      name: 'Yangi Ism',
      bio: 'Yangi bio',
      gender: 'female',
      birthDate: '1990-01-01',
      age: 36,
      coins: 0,
      diamonds: 0,
      locationVisibility: 'ghost',
      isLocationEnabled: false,
    });

    assert.equal(patch.userPatch.name, 'Yangi Ism');
    assert.equal(patch.userPatch.bio, 'Yangi bio');
    assert.equal(patch.userPatch.locationVisibility, 'ghost');
    assert.equal(patch.userPatch.isLocationEnabled, false);
    assert.equal(patch.settingsPatch.locationVisibility, 'ghost');
    assert.equal(patch.settingsPatch.isLocationEnabled, false);

    // Locked fields & financial balances must NEVER be modified by profile edit patch
    assert.equal('gender' in patch.userPatch, false);
    assert.equal('birthDate' in patch.userPatch, false);
    assert.equal('age' in patch.userPatch, false);
    assert.equal('coins' in patch.userPatch, false);
    assert.equal('diamonds' in patch.userPatch, false);
    assert.equal('createdAt' in patch.userPatch, false);
    assert.equal('role' in patch.userPatch, false);
  });

  it('merges Firestore and backend records keeping newest edits & preserving balances across server restarts', () => {
    const firestoreUser = {
      uid: 'google_abc',
      name: 'Sardor Yangi',
      username: 'sardor_vip',
      bio: 'Toshkentdan',
      avatar: '/api/media/sardor.jpg',
      coins: 2400,
      diamonds: 65,
      locationVisibility: 'ghost',
      isLocationEnabled: false,
      isProfileCompleted: true,
      hasEditedProfile: true,
      faceId: { verified: true },
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-11-20T15:00:00.000Z',
    };

    // Scenario A: Backend restarted empty after deploy (backendUser is null)
    const restoredOnlyFromFirestore = mergeDbAuthoritativeProfile({
      firestoreUser,
      backendUser: null,
      cachedUser: { uid: 'google_abc', authToken: 'tok_123', coins: 100 },
    });
    assert.ok(restoredOnlyFromFirestore);
    assert.equal(restoredOnlyFromFirestore.name, 'Sardor Yangi');
    assert.equal(restoredOnlyFromFirestore.coins, 2400);
    assert.equal(restoredOnlyFromFirestore.diamonds, 65);
    assert.equal(restoredOnlyFromFirestore.locationVisibility, 'ghost');
    assert.equal(restoredOnlyFromFirestore.authToken, 'tok_123');

    // Scenario B: Backend has newer wallet deduction after sending gift
    const backendAfterGift = {
      ...firestoreUser,
      coins: 2350,
      diamonds: 65,
      updatedAt: '2026-11-20T15:05:00.000Z',
    };
    const mergedWithNewerBackend = mergeDbAuthoritativeProfile({
      firestoreUser,
      backendUser: backendAfterGift,
      cachedUser: null,
    });
    assert.ok(mergedWithNewerBackend);
    assert.equal(mergedWithNewerBackend.coins, 2350);
    assert.equal(mergedWithNewerBackend.createdAt, '2026-10-01T10:00:00.000Z');
  });

  it('never drops session when backend restarts empty while Firestore has valid profile, or on transient network error', () => {
    const validCompletedUser = {
      uid: 'google_abc',
      name: 'Sardor',
      gender: 'male',
      isProfileCompleted: true,
      faceId: { verified: true },
    };

    // Server returned exists: false after deploy wipe, but Firestore has the completed user
    const res1 = shouldPreserveLocalSessionOnSyncResult({
      cachedUser: validCompletedUser,
      firestoreUser: validCompletedUser,
      backendResponse: { success: true, exists: false, user: null },
      networkFailed: false,
    });
    assert.equal(res1.preserve, true);
    assert.equal(res1.reason, 'firestore_authoritative');

    // Network down while loading
    const res2 = shouldPreserveLocalSessionOnSyncResult({
      cachedUser: validCompletedUser,
      firestoreUser: null,
      backendResponse: null,
      networkFailed: true,
    });
    assert.equal(res2.preserve, true);
    assert.equal(res2.reason, 'network_resilient');

    // Explicitly banned or deleted account must NOT preserve session
    const res3 = shouldPreserveLocalSessionOnSyncResult({
      cachedUser: validCompletedUser,
      firestoreUser: validCompletedUser,
      backendResponse: { success: true, exists: false, deleted: true },
      networkFailed: false,
    });
    assert.equal(res3.preserve, false);
    assert.equal(res3.reason, 'deleted_or_banned');
  });
});
