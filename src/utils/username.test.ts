import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateUsername, isUsernameUnique, formatUsernameDisplay } from './username';

describe('Username validation & uniqueness helpers', () => {
  it('rejects any whitespace inside username', () => {
    const res1 = validateUsername('ali valiyev');
    assert.equal(res1.valid, false);
    assert.match(res1.error || '', /bo'sh joy/i);

    const res2 = validateUsername(' ali_07');
    assert.equal(res2.valid, false);
  });

  it('rejects too short, too long, or invalid symbol usernames', () => {
    assert.equal(validateUsername('ab').valid, false);
    assert.equal(validateUsername('a'.repeat(21)).valid, false);
    assert.equal(validateUsername('ali-07!').valid, false);
  });

  it('accepts valid handles with optional @ prefix and normalizes to lowercase', () => {
    const res = validateUsername('@Salikh_07');
    assert.equal(res.valid, true);
    assert.equal(res.normalized, 'salikh_07');
    assert.equal(formatUsernameDisplay(res.normalized), '@salikh_07');
  });

  it('checks case-insensitive uniqueness across users excluding self', () => {
    const users = [
      { uid: 'u1', username: 'Salikh_07' },
      { uid: 'u2', username: 'malika_uz' },
    ];
    assert.equal(isUsernameUnique('salikh_07', users, 'u2'), false);
    assert.equal(isUsernameUnique('salikh_07', users, 'u1'), true);
    assert.equal(isUsernameUnique('jasur_99', users, 'u2'), true);
  });
});
