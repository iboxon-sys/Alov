import test from 'node:test';
import assert from 'node:assert/strict';

// Test 1: Deterministic Chat ID generator
function getChatRoomId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

// Test 2: Country detector based on phone code
function detectCountry(phone: string): { name: string; flag: string; code: string } {
  const clean = phone.replace(/[\s-]/g, '');
  if (clean.startsWith('+998')) return { name: "O'zbekiston", flag: "🇺🇿", code: "+998" };
  if (clean.startsWith('+7')) return { name: "Rossiya / Qozog'iston", flag: "🇰🇿", code: "+7" };
  if (clean.startsWith('+992')) return { name: "Tojikiston", flag: "🇹🇯", code: "+992" };
  if (clean.startsWith('+996')) return { name: "Qirg'iziston", flag: "🇰🇬", code: "+996" };
  if (clean.startsWith('+90')) return { name: "Turkiya", flag: "🇹🇷", code: "+90" };
  if (clean.startsWith('+1')) return { name: "AQSH / Kanada", flag: "🇺🇸", code: "+1" };
  return { name: "Boshqa davlat", flag: "🌐", code: "+" };
}

// Test 3: Duration string formatter
function formatLiveDuration(totalSec: number): string {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

test('Chat Room ID is symmetric regardless of sender or recipient order', () => {
  const id1 = getChatRoomId('user_alice', 'user_bob');
  const id2 = getChatRoomId('user_bob', 'user_alice');
  assert.equal(id1, id2);
  assert.equal(id1, 'user_alice_user_bob');
});

test('detectCountry identifies phone prefixes accurately', () => {
  assert.equal(detectCountry('+998901234567').name, "O'zbekiston");
  assert.equal(detectCountry('+998901234567').flag, "🇺🇿");
  assert.equal(detectCountry('+77011234567').flag, "🇰🇿");
  assert.equal(detectCountry('+905321234567').name, "Turkiya");
});

test('formatLiveDuration formats seconds into MM:SS correctly', () => {
  assert.equal(formatLiveDuration(0), '00:00');
  assert.equal(formatLiveDuration(65), '01:05');
  assert.equal(formatLiveDuration(3600), '60:00');
});
