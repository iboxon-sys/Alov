import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGE_COIN_COST,
  DIAMOND_LIMIT_TARGET,
  DIAMOND_UNLOCK_DURATION_MS,
  ADMIN_FULL_COINS,
  ADMIN_FULL_DIAMONDS,
  isAdminTelegramUser,
  canChargeForMessage,
  applyDiamondProgress,
  releaseMatureDiamondBatches,
  getDiamondProgressPercent,
  computeCountdownParts,
} from './tokenomics.ts';

describe('tokenomics & admin pure helpers', () => {
  it('sets message price to 5 coins and full admin balances', () => {
    assert.equal(MESSAGE_COIN_COST, 5);
    assert.ok(ADMIN_FULL_COINS >= 999999);
    assert.ok(ADMIN_FULL_DIAMONDS >= 999999);
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

  it('fills 0-100% diamond progress and creates 24h locked batch at 100 diamonds', () => {
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
    assert.equal(step2.pendingDiamondBatches[0].unlockAt, t0 + DIAMOND_UNLOCK_DURATION_MS);

    // Before 24h: wallet should stay 0
    const beforeUnlock = releaseMatureDiamondBatches(10, step2.pendingDiamondBatches, t0 + DIAMOND_UNLOCK_DURATION_MS - 1000);
    assert.equal(beforeUnlock.diamonds, 10);
    assert.equal(beforeUnlock.releasedAmount, 0);
    assert.equal(beforeUnlock.pendingDiamondBatches.length, 1);

    // After 24h: 100 diamonds released into wallet
    const afterUnlock = releaseMatureDiamondBatches(10, step2.pendingDiamondBatches, t0 + DIAMOND_UNLOCK_DURATION_MS);
    assert.equal(afterUnlock.diamonds, 110);
    assert.equal(afterUnlock.releasedAmount, 100);
    assert.equal(afterUnlock.pendingDiamondBatches.length, 0);
  });

  it('formats 24h countdown cleanly', () => {
    const now = 1_000_000;
    const parts = computeCountdownParts(now + 24 * 3600 * 1000 - 3661 * 1000, now);
    assert.equal(parts.formatted, '22:58:59');
  });
});
