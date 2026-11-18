import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAMOND_CASHOUT_PACKAGES,
  MIN_COIN_PURCHASE_AMOUNT,
  MIN_COIN_PURCHASE_UZS,
  MIN_DIAMOND_CASHOUT_AMOUNT,
  MIN_DIAMOND_CASHOUT_UZS,
  STORE_COIN_PACKAGES,
  buildStoreBalanceSummary,
  calculateDiamondCashoutUzs,
  findCoinStorePackage,
} from './store.ts';

describe('Alov.uz Do\'kon (Store) pricing, diamond cashout & balance summary helpers', () => {
  it('enforces 120 olmos = 25,000 so\'m minimum diamond cashout and 1,000 moneta = 50,000 so\'m minimum coin price', () => {
    assert.equal(MIN_DIAMOND_CASHOUT_AMOUNT, 120);
    assert.equal(MIN_DIAMOND_CASHOUT_UZS, 25000);
    assert.equal(DIAMOND_CASHOUT_PACKAGES[0].diamonds, 120);
    assert.equal(DIAMOND_CASHOUT_PACKAGES[0].uzs, 25000);
    assert.equal(calculateDiamondCashoutUzs(120), 25000);
    assert.equal(calculateDiamondCashoutUzs(240), 50000);
    assert.equal(calculateDiamondCashoutUzs(500), 115000);

    assert.equal(MIN_COIN_PURCHASE_AMOUNT, 1000);
    assert.equal(MIN_COIN_PURCHASE_UZS, 50000);
    assert.equal(STORE_COIN_PACKAGES[0].coins, 1000);
    assert.equal(STORE_COIN_PACKAGES[0].uzs, 50000);
    assert.equal(findCoinStorePackage(25000).uzs, 950000);
  });

  it('resolves top Store balances cleanly for diamond earners, coin spenders, and admins', () => {
    const femaleSummary = buildStoreBalanceSummary({
      uid: 'u_female_1',
      gender: 'female',
      diamonds: 120,
      coins: 0,
    });
    assert.equal(femaleSummary.defaultTab, 'diamonds');
    assert.equal(femaleSummary.hasDiamonds, true);
    assert.equal(femaleSummary.diamondsCount, 120);
    assert.equal(femaleSummary.diamondsCashoutUzs, 25000);
    assert.equal(femaleSummary.canWithdrawDiamonds, true);
    assert.equal(femaleSummary.remainingDiamondsForMinCashout, 0);

    const lowDiamondSummary = buildStoreBalanceSummary({
      uid: 'u_female_2',
      gender: 'female',
      diamonds: 45,
      coins: 0,
    });
    assert.equal(lowDiamondSummary.canWithdrawDiamonds, false);
    assert.equal(lowDiamondSummary.remainingDiamondsForMinCashout, 75);

    const maleSummary = buildStoreBalanceSummary({
      uid: 'u_male_1',
      gender: 'male',
      coins: 350,
      diamonds: 0,
    });
    assert.equal(maleSummary.defaultTab, 'coins');
    assert.equal(maleSummary.hasCoins, true);
    assert.equal(maleSummary.coinsCount, 350);

    const adminSummary = buildStoreBalanceSummary({
      uid: 'tg_salikh_07',
      telegram: 'https://t.me/Salikh_07',
      role: 'admin',
      isAdmin: true,
      diamonds: 999999,
      coins: 999999,
    });
    assert.equal(adminSummary.isAdmin, true);
    assert.equal(adminSummary.hasDiamonds, true);
    assert.equal(adminSummary.hasCoins, true);
    assert.equal(adminSummary.diamondsDisplay, 'Full');
    assert.equal(adminSummary.coinsDisplay, 'Full');
  });
});
