import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');
const BLUEPRINT_PATH = path.resolve(process.cwd(), 'firebase-blueprint.json');

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '');
}

describe('Firestore Security Rules — Eight Pillars & Dirty Dozen Structural Verification', () => {
  it('enforces all Eight Pillars, strict blueprint alignment, and zero open/blanket rules', () => {
    assert.equal(fs.existsSync(RULES_PATH), true, 'firestore.rules must exist');
    assert.equal(fs.existsSync(BLUEPRINT_PATH), true, 'firebase-blueprint.json must exist');

    const rulesRaw = fs.readFileSync(RULES_PATH, 'utf8');
    const rules = stripComments(rulesRaw);
    const blueprint = JSON.parse(fs.readFileSync(BLUEPRINT_PATH, 'utf8'));

    // Pillar 0: rules_version = '2' and default-deny safety net
    assert.match(rules, /rules_version\s*=\s*'2'\s*;/);
    assert.match(rules, /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false\s*;\s*\}/);

    // Zero blanket open reads or writes
    assert.equal(/allow\s+(read|write|get|list|create|update|delete)\s*:\s*if\s+true\b/.test(rules), false);
    assert.equal(/allow\s+(read|get)\s*:\s*if\s+isSignedIn\(\)\s*;/.test(rules), false);

    // Every blueprint collection path has an explicit match block
    const expectedBlocks = [
      'match /users/{userId}',
      'match /private/{docId}',
      'match /wallet/{docId}',
      'match /public_profiles/{userId}',
      'match /user_settings/{userId}',
      'match /admins/{adminId}',
      'match /chats/{chatId}',
      'match /messages/{messageId}',
      'match /posts/{postId}',
      'match /live_streams/{streamId}',
      'match /viewers/{viewerId}',
      'match /signals/{signalId}',
      'match /test/{docId}',
    ];
    for (const block of expectedBlocks) {
      assert.equal(rules.includes(block), true, `Missing match block: ${block}`);
    }
    assert.ok(Object.keys(blueprint.firestore || {}).length >= 13);

    // Dirty Dozen Guard 1 & 2: Role self-assignment & shadow fields blocked
    assert.equal(rules.includes('keys().hasAll(['), true);
    assert.equal(rules.includes('keys().hasOnly(['), true);
    assert.equal(rules.includes('affectedKeys().hasOnly(['), true);
    assert.equal(rules.includes("incoming().role == 'user' && incoming().isAdmin == false"), true);

    // Dirty Dozen Guard 3: Bootstrapped admin requires email_verified == true
    assert.equal(
      rules.includes("request.auth.token.email_verified == true") &&
        rules.includes("request.auth.token.email == 'zuhriddinoblaqul@gmail.com'"),
      true
    );

    // Dirty Dozen Guard 4: Private PII isolated to owner or admin
    assert.match(rules, /match\s+\/private\/\{docId\}[\s\S]*?isOwner\(userId\)\s*\|\|\s*isAdmin\(\)/);

    // Dirty Dozen Guard 5: Completed profile gender/birthDate/age immutable for non-admin owners
    assert.equal(rules.includes('incoming().gender == existing().gender'), true);
    assert.equal(rules.includes('incoming().birthDate == existing().birthDate'), true);
    assert.equal(rules.includes('incoming().age == existing().age'), true);

    // Dirty Dozen Guard 6: Server-timestamp request.time enforcement
    assert.equal(rules.includes('incoming().createdAt == request.time'), true);
    assert.equal(rules.includes('incoming().updatedAt == request.time'), true);
    assert.equal(rules.includes('incoming().createdAt == existing().createdAt'), true);

    // Dirty Dozen Guard 7: ID poisoning & media URL data:-URI guard
    assert.equal(rules.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')"), true);
    assert.equal(rules.includes('isValidMediaUrl('), true);

    // Dirty Dozen Guard 8 & 9: Chat participants size == 2 & message senderId == request.auth.uid
    assert.equal(rules.includes('data.participants.size() == 2'), true);
    assert.equal(rules.includes('data.senderId == request.auth.uid'), true);

    // Dirty Dozen Guard 10: Terminal live stream state lock
    assert.equal(rules.includes("existing().status != 'ended'"), true);

    // Dirty Dozen Guard 11: Bounded wallet arrays & balances
    assert.equal(rules.includes('data.pendingDiamondBatches.size() <= 50'), true);
    assert.equal(rules.includes('data.coins <= 100000000'), true);

    // Dirty Dozen Guard 12: No get() or exists() inside allow list blocks
    const allowListMatches = rules.match(/allow\s+list\s*:[^;]+;/g) || [];
    assert.ok(allowListMatches.length > 0);
    for (const stmt of allowListMatches) {
      assert.equal(/\b(get|exists)\s*\(/.test(stmt), false, `allow list must not call get()/exists(): ${stmt}`);
    }
  });
});
