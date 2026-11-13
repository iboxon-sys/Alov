import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTelegramDisplayName,
  isPlaceholderAvatar,
  isPlaceholderOrUsername,
  normalizeTelegramHandle,
  pickPreferredAvatar,
} from './telegramProfile';

test('normalizeTelegramHandle strips @ and t.me URLs cleanly', () => {
  assert.equal(normalizeTelegramHandle('@Jasur_Dev'), 'jasur_dev');
  assert.equal(normalizeTelegramHandle('https://t.me/Jasur_Dev'), 'jasur_dev');
  assert.equal(normalizeTelegramHandle('  jasur_dev  '), 'jasur_dev');
});

test('isPlaceholderOrUsername rejects @username, bare username, phone, and placeholders', () => {
  assert.equal(isPlaceholderOrUsername('Foydalanuvchi', 'jasur'), true);
  assert.equal(isPlaceholderOrUsername('@jasur', 'jasur'), true);
  assert.equal(isPlaceholderOrUsername('jasur', '@jasur'), true);
  assert.equal(isPlaceholderOrUsername('+998901234567', '', '+998901234567'), true);
  assert.equal(isPlaceholderOrUsername('Telegram Foydalanuvchisi', 'jasur'), true);
  assert.equal(isPlaceholderOrUsername('Jasur', 'jasur_dev'), false);
});

test('buildTelegramDisplayName returns first_name alone or with optional last_name', () => {
  assert.equal(
    buildTelegramDisplayName({
      firstName: 'Jasur',
      lastName: '',
      username: 'jasur_dev',
    }),
    'Jasur'
  );

  assert.equal(
    buildTelegramDisplayName({
      firstName: 'Jasur',
      lastName: 'Karimov',
      username: 'jasur_dev',
    }),
    'Jasur Karimov'
  );

  // Never falls back to @username when first_name is missing
  assert.equal(
    buildTelegramDisplayName({
      firstName: '@jasur_dev',
      lastName: '',
      username: 'jasur_dev',
      existingName: 'Foydalanuvchi',
    }),
    ''
  );
});

test('pickPreferredAvatar skips empty and Unsplash fallback URLs', () => {
  const unsplash =
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600';
  assert.equal(isPlaceholderAvatar(unsplash), true);
  assert.equal(isPlaceholderAvatar('/api/telegram/avatar/12345'), false);

  assert.equal(
    pickPreferredAvatar(unsplash, '/api/telegram/avatar/12345'),
    '/api/telegram/avatar/12345'
  );
  assert.equal(pickPreferredAvatar('', unsplash), '');
});
