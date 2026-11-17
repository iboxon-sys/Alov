import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGE_COIN_COST,
  VOICE_MESSAGE_COIN_COST,
  MEDIA_FILE_COIN_COST,
  getMessageCoinCost,
  MESSAGE_DIAMOND_REWARD,
  AUDIO_CALL_COIN_COST_PER_MIN,
  AUDIO_CALL_DIAMOND_PER_MIN,
  VIDEO_CALL_COIN_COST_PER_MIN,
  VIDEO_CALL_DIAMOND_PER_MIN,
  DIAMOND_LIMIT_TARGET,
  DAILY_LIMIT_WINDOW_HOURS,
  DAILY_LIMIT_WINDOW_MS,
  DIAMOND_TO_UZS_RATE,
  DIAMOND_UNLOCK_HOURS,
  DIAMOND_UNLOCK_DURATION_MS,
  ADMIN_FULL_COINS,
  ADMIN_FULL_DIAMONDS,
  isAdminTelegramUser,
  canChargeForMessage,
  coinsToDiamonds,
  formatDiamondsDisplay,
  applyDiamondProgress,
  releaseMatureDiamondBatches,
  getDiamondProgressPercent,
  calculateDiamondsToUzs,
  calculateCallMinuteBilling,
  buildUserWalletSnapshot,
  computeCountdownParts,
} from './tokenomics.ts';

describe('tokenomics, wallet, 24h 120-diamond cap, 12h unlock & call billing helpers', () => {
  it('sets 10 coins -> 2.5 diamonds, voice 5, audio/video 20, call pricing, 120 daily target, and exchange rate', () => {
    assert.equal(MESSAGE_COIN_COST, 10);
    assert.equal(VOICE_MESSAGE_COIN_COST, 5);
    assert.equal(MEDIA_FILE_COIN_COST, 20);
    assert.equal(getMessageCoinCost('text'), 10);
    assert.equal(getMessageCoinCost('gif'), 10);
    assert.equal(getMessageCoinCost('image'), 10);
    assert.equal(getMessageCoinCost('voice'), 5);
    assert.equal(getMessageCoinCost('audio'), 20);
    assert.equal(getMessageCoinCost('video'), 20);
    assert.equal(getMessageCoinCost(undefined), 10);
    assert.equal(MESSAGE_DIAMOND_REWARD, 2.5);
    assert.equal(AUDIO_CALL_COIN_COST_PER_MIN, 10);
    assert.equal(AUDIO_CALL_DIAMOND_PER_MIN, 2.5);
    assert.equal(VIDEO_CALL_COIN_COST_PER_MIN, 20);
    assert.equal(VIDEO_CALL_DIAMOND_PER_MIN, 5);
    assert.equal(coinsToDiamonds(10), 2.5);
    assert.equal(coinsToDiamonds(40), 10);
    assert.equal(DIAMOND_LIMIT_TARGET, 120);
    assert.equal(DAILY_LIMIT_WINDOW_HOURS, 24);
    assert.equal(DIAMOND_TO_UZS_RATE, 100);
    assert.equal(DIAMOND_UNLOCK_HOURS, 12);
    assert.equal(DIAMOND_UNLOCK_DURATION_MS, 12 * 60 * 60 * 1000);
    assert.equal(calculateDiamondsToUzs(2.5), 250);
    assert.equal(calculateDiamondsToUzs(100), 10000);
    assert.equal(calculateDiamondsToUzs(120), 12000);
    assert.equal(formatDiamondsDisplay(2.5), '2.5');
    assert.equal(formatDiamondsDisplay(120), '120');
    assert.ok(ADMIN_FULL_COINS >= 999999);
    assert.ok(ADMIN_FULL_DIAMONDS >= 999999);
  });

  it('computes per-minute billing accurately for audio and video calls', () => {
    const audioBill = calculateCallMinuteBilling('audio');
    assert.equal(audioBill.coinCost, 10);
    assert.equal(audioBill.diamondReward, 2.5);
    assert.equal(audioBill.uzsEquivalent, 250);

    const videoBill = calculateCallMinuteBilling('video');
    assert.equal(videoBill.coinCost, 20);
    assert.equal(videoBill.diamondReward, 5);
    assert.equal(videoBill.uzsEquivalent, 500);
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

  it('queues even partial (<120) 2.5-diamond earnings for wallet release and caps 24h earnings at 120', () => {
    const t0 = 1_700_000_000_000;
    const step1 = applyDiamondProgress(0, [], 2.5, t0, null);
    assert.equal(step1.diamondProgress, 2.5);
    assert.equal(step1.acceptedDiamonds, 2.5);
    assert.equal(step1.dailyLimitResetAt, t0 + DAILY_LIMIT_WINDOW_MS);
    assert.equal(step1.pendingDiamondBatches.length, 1);
    assert.equal(step1.pendingDiamondBatches[0].amount, 2.5);
    assert.equal(step1.limitReached, false);

    // Partial earnings (even 42.5 < 120) still release to wallet after 12h!
    const step2 = applyDiamondProgress(step1.diamondProgress, step1.pendingDiamondBatches, 40, t0 + 1000, step1.dailyLimitResetAt);
    assert.equal(step2.diamondProgress, 42.5);
    assert.equal(step2.acceptedDiamonds, 40);
    assert.equal(step2.pendingDiamondBatches[0].amount, 42.5);

    const after12h = releaseMatureDiamondBatches(10, step2.pendingDiamondBatches, t0 + DIAMOND_UNLOCK_DURATION_MS);
    assert.equal(after12h.diamonds, 52.5);
    assert.equal(after12h.releasedAmount, 42.5);
    assert.equal(after12h.pendingDiamondBatches.length, 0);

    // Remaining daily cap is 120 - 42.5 = 77.5; requesting 90 caps at 77.5
    const step3 = applyDiamondProgress(step2.diamondProgress, [], 90, t0 + 2 * 3600 * 1000, step2.dailyLimitResetAt);
    assert.equal(step3.acceptedDiamonds, 77.5);
    assert.equal(step3.diamondProgress, 120);
    assert.equal(step3.limitReached, true);
    assert.equal(getDiamondProgressPercent(step3.diamondProgress), 100);

    // After 24h window expires, counter resets cleanly to 0 for the next day
    const nextDay = applyDiamondProgress(step3.diamondProgress, [], 2.5, t0 + DAILY_LIMIT_WINDOW_MS + 1000, step3.dailyLimitResetAt);
    assert.equal(nextDay.diamondProgress, 2.5);
    assert.equal(nextDay.acceptedDiamonds, 2.5);
    assert.equal(nextDay.limitReached, false);
  });

  it('builds consistent wallet snapshot with decimal UZS balance and 120 daily target', () => {
    const t0 = 1_700_000_000_000;
    const snapshot = buildUserWalletSnapshot({
      uid: 'u_female_1',
      diamonds: 152.5,
      diamondProgress: 42.5,
      dailyLimitResetAt: t0 + DAILY_LIMIT_WINDOW_MS,
      pendingDiamondBatches: [
        { id: 'b1', amount: 42.5, createdAt: t0, unlockAt: t0 + DIAMOND_UNLOCK_DURATION_MS },
      ],
      totalWithdrawnUzs: 20000,
    }, t0);

    assert.equal(snapshot.uid, 'u_female_1');
    assert.equal(snapshot.balanceDiamonds, 152.5);
    assert.equal(snapshot.balanceUzs, 15250);
    assert.equal(snapshot.pendingDiamonds, 42.5);
    assert.equal(snapshot.pendingUzs, 4250);
    assert.equal(snapshot.diamondProgress, 42.5);
    assert.equal(snapshot.dailyLimitTarget, 120);
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
