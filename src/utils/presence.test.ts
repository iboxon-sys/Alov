import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PresenceRegistry,
  isUserOnlineStrict,
  formatLastSeenUz,
} from './presence.ts';

describe('PresenceRegistry & strict presence evaluation', () => {
  it('counts unique authenticated UIDs across multiple tabs/sockets accurately', () => {
    const reg = new PresenceRegistry();
    reg.connectSocket('s1');
    reg.connectSocket('s2');
    reg.connectSocket('s3');
    // Before registerUser, 0 authenticated users online
    assert.equal(reg.getOnlineCount(), 0);

    // User A opens two tabs
    const r1 = reg.registerUser('s1', 'uid_a');
    assert.equal(r1.becameOnline, true);
    const r2 = reg.registerUser('s2', 'uid_a');
    assert.equal(r2.becameOnline, false);
    assert.equal(reg.getOnlineCount(), 1);

    // User B connects
    reg.registerUser('s3', 'uid_b');
    assert.equal(reg.getOnlineCount(), 2);

    // User A closes one tab — still online via s2
    const d1 = reg.disconnectSocket('s1');
    assert.equal(d1.becameOffline, false);
    assert.equal(reg.isUidOnline('uid_a'), true);
    assert.equal(reg.getOnlineCount(), 2);

    // User A closes second tab — now offline
    const d2 = reg.disconnectSocket('s2');
    assert.equal(d2.becameOffline, true);
    assert.equal(d2.uid, 'uid_a');
    assert.equal(reg.isUidOnline('uid_a'), false);
    assert.equal(reg.getOnlineCount(), 1);
  });

  it('cleanly switches UID on same socket when logging out or changing account', () => {
    const reg = new PresenceRegistry();
    reg.connectSocket('s1');
    reg.registerUser('s1', 'uid_first');
    assert.equal(reg.isUidOnline('uid_first'), true);

    const switchRes = reg.registerUser('s1', 'uid_second');
    assert.equal(switchRes.previousUid, 'uid_first');
    assert.equal(switchRes.removedPreviousUidOffline, true);
    assert.equal(reg.isUidOnline('uid_first'), false);
    assert.equal(reg.isUidOnline('uid_second'), true);
    assert.equal(reg.getOnlineCount(), 1);

    const logoutRes = reg.unregisterUser('s1', 'uid_second');
    assert.equal(logoutRes.becameOffline, true);
    assert.equal(reg.getOnlineCount(), 0);
  });

  it('prunes stale sockets when heartbeat expires', () => {
    const reg = new PresenceRegistry();
    reg.connectSocket('s1', 1000);
    reg.registerUser('s1', 'uid_stale', 1000);
    reg.connectSocket('s2', 50000);
    reg.registerUser('s2', 'uid_fresh', 50000);

    const offline = reg.pruneStaleSockets(30000, 55000);
    assert.deepEqual(offline, ['uid_stale']);
    assert.equal(reg.isUidOnline('uid_stale'), false);
    assert.equal(reg.isUidOnline('uid_fresh'), true);
  });

  it('evaluates online status strictly without false positives', () => {
    const onlineIds = new Set(['uid_1']);
    assert.equal(isUserOnlineStrict({ uid: 'uid_1', isOnline: false, status: 'offline' }, onlineIds), true);
    assert.equal(isUserOnlineStrict({ uid: 'uid_2', isOnline: true, status: 'online' }, onlineIds), false);
    assert.equal(isUserOnlineStrict({ uid: 'uid_2', isOnline: true, status: 'offline' }), false);
    assert.equal(isUserOnlineStrict({ uid: 'uid_2', isOnline: true, status: 'online' }), true);
    assert.equal(isUserOnlineStrict(null, onlineIds), false);
  });

  it('formats last seen in Uzbek properly', () => {
    const now = new Date('2026-11-14T12:00:00Z').getTime();
    assert.equal(formatLastSeenUz(undefined, true, now), 'Onlayn');
    assert.equal(formatLastSeenUz('2026-11-14T11:59:30Z', false, now), 'Hozirgina oflayn');
    assert.equal(formatLastSeenUz('2026-11-14T11:45:00Z', false, now), '15 daqiqa oldin');
    assert.equal(formatLastSeenUz('2026-11-14T09:00:00Z', false, now), '3 soat oldin');
  });
});
