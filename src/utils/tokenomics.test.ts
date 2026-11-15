import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGE_COIN_COST,
  AUDIO_CALL_COIN_COST_PER_MIN,
  AUDIO_CALL_DIAMOND_PER_MIN,
  VIDEO_CALL_COIN_COST_PER_MIN,
  VIDEO_CALL_DIAMOND_PER_MIN,
  DIAMOND_LIMIT_TARGET,
  DIAMOND_TO_UZS_RATE,
  DIAMOND_UNLOCK_HOURS,
  DIAMOND_UNLOCK_DURATION_MS,
  ADMIN_FULL_COINS,
  ADMIN_FULL_DIAMONDS,
  isAdminTelegramUser,
  canChargeForMessage,
  applyDiamondProgress,
  releaseMatureDiamondBatches,
  getDiamondProgressPercent,
  calculateDiamondsToUzs,
  calculateCallMinuteBilling,
  buildUserWalletSnapshot,
  computeCountdownParts,
} from './tokenomics.ts';

describe('tokenomics, wallet, 12h unlock & call billing helpers', () => {
  it('sets message price, audio/video call pricing, and exchange rate (100 diamonds = 10,000 UZS)', () => {
    assert.equal(MESSAGE_COIN_COST, 5);
    assert.equal(AUDIO_CALL_COIN_COST_PER_MIN, 10);
    assert.equal(AUDIO_CALL_DIAMOND_PER_MIN, 10);
    assert.equal(VIDEO_CALL_COIN_COST_PER_MIN, 20);
    assert.equal(VIDEO_CALL_DIAMOND_PER_MIN, 20);
    assert.equal(DIAMOND_TO_UZS_RATE, 100);
    assert.equal(DIAMOND_UNLOCK_HOURS, 12);
    assert.equal(DIAMOND_UNLOCK_DURATION_MS, 12 * 60 * 60 * 1000);
    assert.equal(calculateDiamondsToUzs(100), 10000);
    assert.equal(calculateDiamondsToUzs(250), 25000);
    assert.ok(ADMIN_FULL_COINS >= 999999);
    assert.ok(ADMIN_FULL_DIAMONDS >= 999999);
  });

  it('computes per-minute billing accurately for audio and video calls', () => {
    const audioBill = calculateCallMinuteBilling('audio');
    assert.equal(audioBill.coinCost, 10);
    assert.equal(audioBill.diamondReward, 10);
    assert.equal(audioBill.uzsEquivalent, 1000);

    const videoBill = calculateCallMinuteBilling('video');
    assert.equal(videoBill.coinCost, 20);
    assert.equal(videoBill.diamondReward, 20);
    assert.equal(videoBill.uzsEquivalent, 2000);
  });

  it('recognizes @Salikh_07 and https://t.me/Salikh_07 as platform admin', () => {
    assert.equal(isAdminTelegramUser({ telegram: 'https://t.me/Salikh_07' }), true);
    assert.equal(isAdminTelegramUser({ telegram: '@Salikh_07' }), true);
    assert.equal(isAdminTelegramUser({ username: 'salikh_07' }), true);
    assert.equal(isAdminTelegramUser({ telegram: 'https://t.me/other_user', role: 'user' }), false);
    assert.equal(isAdminTelegramUser({ telegram: 'https://t.me/other_user', role: 'admin' }), true);
  });

  it('skips coin deduction when friendship mode is active, AI bot, or admin', () => {
    assert.equal(canChargeForMessage({ senderGender: 'male', isAIBot: false, isFriendFreeChat: false }), true);
    assert.equal(canChargeForMessage({ senderGender: 'male', isAIBot: false, isFriendFreeChat: true }), false);
    assert.equal(canChargeForMessage({ senderGender: 'male', isAIBot: true, isFriendFreeChat: false }), false);
    assert.equal(canChargeForMessage({ senderGender: 'female', isAIBot: false, isFriendFreeChat: false }), false);
    assert.equal(canChargeForMessage({ senderGender: 'male', isAdminSender: true }), false);
  });

  it('fills 0-100% diamond progress and creates 12h locked batch at 100 diamonds', () => {
    const t0 = 1_700_000_000_000;
    const step1 = applyDiamondProgress(0, [], 35, t0);
    assert.equal(step1.diamondProgress, 35);
    assert.equal(getDiamondProgressPercent(step1.diamondProgress), 35);
    assert.equal(step1.pendingDiamondBatches.length, 0);

    const step2 = applyDiamondProgress(step1.diamondProgress, step1.pendingDiamondBatches, 70, t0);
    assert.equal(step2.diamondProgress, 5);
    assert.equal(step2.newlyLockedCount, 1);
    assert.equal(step2.pendingDiamondBatches.length, 1);
    assert.equal(step2.pendingDiamondBatches[0].amount, DIAMOND_LIMIT_TARGET);
    assert.equal(step2.pendingDiamondBatches[0].unlockAt, t0 + 12 * 60 * 60 * 1000);

    // Before 12h: wallet should stay 10
    const beforeUnlock = releaseMatureDiamondBatches(10, step2.pendingDiamondBatches, t0 + DIAMOND_UNLOCK_DURATION_MS - 1000);
    assert.equal(beforeUnlock.diamonds, 10);
    assert.equal(beforeUnlock.releasedAmount, 0);
    assert.equal(beforeUnlock.pendingDiamondBatches.length, 1);

    // After 12h: 100 diamonds released into wallet
    const afterUnlock = releaseMatureDiamondBatches(10, step2.pendingDiamondBatches, t0 + DIAMOND_UNLOCK_DURATION_MS);
    assert.equal(afterUnlock.diamonds, 110);
    assert.equal(afterUnlock.releasedAmount, 100);
    assert.equal(afterUnlock.pendingDiamondBatches.length, 0);
  });

  it('builds consistent wallet snapshot with UZS balance and pending totals', () => {
    const t0 = 1_700_000_000_000;
    const snapshot = buildUserWalletSnapshot({
      uid: 'u_female_1',
      diamonds: 150,
      diamondProgress: 40,
      pendingDiamondBatches: [
        { id: 'b1', amount: 100, createdAt: t0, unlockAt: t0 + DIAMOND_UNLOCK_DURATION_MS },
      ],
      totalWithdrawnUzs: 20000,
    }, t0);

    assert.equal(snapshot.uid, 'u_female_1');
    assert.equal(snapshot.balanceDiamonds, 150);
    assert.equal(snapshot.balanceUzs, 15000);
    assert.equal(snapshot.pendingDiamonds, 100);
    assert.equal(snapshot.pendingUzs, 10000);
    assert.equal(snapshot.diamondProgress, 40);
    assert.equal(snapshot.exchangeRateUzs, 100);
    assert.equal(snapshot.unlockWindowHours, 12);
    assert.equal(snapshot.nextUnlockAt, t0 + DIAMOND_UNLOCK_DURATION_MS);
    assert.equal(snapshot.totalWithdrawnUzs, 20000);
  });

  it('formats 12h countdown cleanly', () => {
    const now = 1_000_000;
    const parts = computeCountdownParts(now + 12 * 3600 * 1000 - 3661 * 1000, now);
    assert.equal(parts.formatted, '10:58:59');
  });
});
