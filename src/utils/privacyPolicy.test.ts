import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_TITLE,
  PRIVACY_POLICY_UPDATED_DATE,
  hasScrolledPrivacyToBottom,
} from './privacyPolicy';

test('privacy policy includes all 7 sections and exact update date', () => {
  assert.equal(PRIVACY_POLICY_TITLE, 'MAXXFIYLIK SIYOSATI (PRIVACY POLICY)');
  assert.equal(PRIVACY_POLICY_UPDATED_DATE, 'Oxirgi yangilangan sana: 2026-yil 16-noyabr');
  assert.equal(PRIVACY_POLICY_SECTIONS.length, 7);
  assert.match(PRIVACY_POLICY_SECTIONS[1].title, /Biometrik/i);
  assert.match(PRIVACY_POLICY_SECTIONS[4].title, /End-to-End/i);
  assert.match(PRIVACY_POLICY_SECTIONS[6].title, /huquq va majburiyatlari/i);
});

test('hasScrolledPrivacyToBottom unlocks only when scrolled near bottom', () => {
  assert.equal(hasScrolledPrivacyToBottom(0, 300, 900), false);
  assert.equal(hasScrolledPrivacyToBottom(400, 300, 900), false);
  assert.equal(hasScrolledPrivacyToBottom(575, 300, 900), false);
  assert.equal(hasScrolledPrivacyToBottom(580, 300, 900), true);
  assert.equal(hasScrolledPrivacyToBottom(600, 300, 900), true);
  assert.equal(hasScrolledPrivacyToBottom(0, 500, 480), true);
});
