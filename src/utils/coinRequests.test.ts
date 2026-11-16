import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COIN_SHOP_PACKAGES,
  buildCoinPurchaseRequest,
  canReviewCoinRequest,
  countPendingRequests,
  findCoinPackageByAmount,
  sortRequestsNewestFirst,
} from './coinRequests.ts';

describe('coinRequests pure shop & admin approval helpers', () => {
  it('resolves predefined shop packages starting at 1,000 coins = 50,000 UZS', () => {
    const minPkg = findCoinPackageByAmount(1000);
    assert.equal(minPkg.coins, 1000);
    assert.equal(minPkg.uzs, 50000);
    assert.equal(COIN_SHOP_PACKAGES[0].coins, 1000);
    assert.equal(COIN_SHOP_PACKAGES[0].uzs, 50000);
    assert.equal(COIN_SHOP_PACKAGES.length, 4);
  });

  it('builds pending coin purchase request with required contactInfo and Face ID photo', () => {
    const req = buildCoinPurchaseRequest({
      user: {
        uid: 'u_99',
        name: 'Azizbek',
        username: 'aziz_01',
        avatar: 'https://old.example/avatar.jpg',
        faceId: { capturedPhotoUrl: '/api/face-id/photo/face_u_99.jpg' },
      },
      coinAmount: 2500,
      paymentMethod: 'payme',
      contactInfo: '@aziz_tg',
      note: 'Karta oxiri 4412',
      nowIso: '2026-11-15T10:00:00.000Z',
    });

    assert.equal(req.status, 'pending');
    assert.equal(req.userUid, 'u_99');
    assert.equal(req.userName, 'Azizbek');
    assert.equal(req.userAvatar, '/api/face-id/photo/face_u_99.jpg');
    assert.equal(req.contactInfo, '@aziz_tg');
    assert.equal(req.coinAmount, 2500);
    assert.equal(req.uzsAmount, 115000);
    assert.equal(req.paymentMethod, 'payme');
    assert.equal(canReviewCoinRequest(req), true);
  });

  it('counts pending requests and sorts newest first without mutating input', () => {
    const list = [
      { id: '1', status: 'approved', createdAt: '2026-11-15T08:00:00.000Z' },
      { id: '2', status: 'pending', createdAt: '2026-11-15T10:00:00.000Z' },
      { id: '3', status: 'pending', createdAt: '2026-11-15T09:00:00.000Z' },
    ];
    assert.equal(countPendingRequests(list), 2);
    const sorted = sortRequestsNewestFirst(list);
    assert.deepEqual(
      sorted.map((x) => x.id),
      ['2', '3', '1']
    );
    assert.equal(list[0].id, '1');
  });
});
