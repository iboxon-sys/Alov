import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectPhoneCountry, formatPhoneNumberPretty } from './phone.ts';

describe('Phone country detection & pretty formatting', () => {
  it('auto-detects Uzbekistan (+998) and formats as +998 XX XXX XX XX', () => {
    const country = detectPhoneCountry('+998901234567');
    assert.equal(country?.iso, 'UZ');
    assert.equal(country?.nameUz, "O'zbekiston");
    assert.equal(formatPhoneNumberPretty('+998901234567'), '+998 90 123 45 67');
    assert.equal(formatPhoneNumberPretty('998901234567'), '+998 90 123 45 67');
    assert.equal(formatPhoneNumberPretty('+99890'), '+998 90');
  });

  it('auto-detects Russia (+7) and formats as +7 XXX XXX XX XX', () => {
    const country = detectPhoneCountry('+79161234567');
    assert.equal(country?.iso, 'RU');
    assert.equal(country?.nameUz, 'Rossiya');
    assert.equal(formatPhoneNumberPretty('+79161234567'), '+7 916 123 45 67');
    assert.equal(formatPhoneNumberPretty('79161234567'), '+7 916 123 45 67');
  });

  it('supports other international prefixes cleanly', () => {
    assert.equal(detectPhoneCountry('+905321234567')?.nameUz, 'Turkiya');
    assert.equal(formatPhoneNumberPretty('+905321234567'), '+90 532 123 45 67');
    assert.equal(detectPhoneCountry('+996555123456')?.nameUz, "Qirg'iziston");
    assert.equal(formatPhoneNumberPretty('+996555123456'), '+996 555 123 456');
    assert.equal(detectPhoneCountry('+12125550199')?.iso, 'US');
    assert.equal(formatPhoneNumberPretty('+12125550199'), '+1 212 555 0199');
  });

  it('handles empty or partial inputs safely', () => {
    assert.equal(formatPhoneNumberPretty(''), '');
    assert.equal(formatPhoneNumberPretty('+'), '+');
    assert.equal(detectPhoneCountry(''), null);
  });
});
