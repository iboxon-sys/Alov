import test from 'node:test';
import assert from 'node:assert/strict';
import { isCaptureShortcutEvent, shouldEnableCaptureProtection } from './captureProtection';

test('shouldEnableCaptureProtection protects regular users and never blocks admin', () => {
  assert.equal(shouldEnableCaptureProtection(null), false);
  assert.equal(
    shouldEnableCaptureProtection({ uid: 'u1', telegram: 'https://t.me/regular_user', role: 'user' }),
    true
  );
  assert.equal(
    shouldEnableCaptureProtection({ uid: 'tg_salikh_07', telegram: 'https://t.me/Salikh_07', role: 'admin' }),
    false
  );
});

test('isCaptureShortcutEvent flags screenshot, print, and save shortcuts', () => {
  assert.equal(isCaptureShortcutEvent({ key: 'PrintScreen' }), true);
  assert.equal(isCaptureShortcutEvent({ key: '4', metaKey: true, shiftKey: true }), true);
  assert.equal(isCaptureShortcutEvent({ key: 'p', ctrlKey: true }), true);
  assert.equal(isCaptureShortcutEvent({ key: 'a', ctrlKey: true }), false);
});
