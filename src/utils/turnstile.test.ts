import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TURNSTILE_SITEVERIFY_URL,
  createTurnstileReplayGuard,
  verifyTurnstileWithSiteverify,
} from './turnstile';

test('verifyTurnstileWithSiteverify rejects empty, missing, or oversized (>2048) token without calling Cloudflare', async () => {
  let called = false;
  const res = await verifyTurnstileWithSiteverify({
    token: '   ',
    secretKey: 'secret_123',
    fetchImpl: async () => {
      called = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
  });

  assert.equal(res.ok, false);
  assert.equal(called, false);
  assert.ok(res.error && res.error.includes('CAPTCHA'));

  const longRes = await verifyTurnstileWithSiteverify({
    token: 'a'.repeat(2049),
    secretKey: 'secret_123',
    fetchImpl: async () => {
      called = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    },
  });
  assert.equal(longRes.ok, false);
  assert.equal(called, false);
});

test('verifyTurnstileWithSiteverify sends POST form data with timeout signal and accepts success: true', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const res = await verifyTurnstileWithSiteverify({
    token: 'cf_turnstile_valid_token_abc',
    secretKey: 'secret_xyz',
    remoteIp: '203.0.113.10',
    expectedAction: 'login',
    expectedHostnames: ['alov.onrender.com', 'alov.uz'],
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(
        JSON.stringify({ success: true, hostname: 'alov.onrender.com', action: 'login' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    },
  });

  assert.equal(capturedUrl, TURNSTILE_SITEVERIFY_URL);
  assert.equal(capturedInit?.method, 'POST');
  assert.ok(capturedInit?.signal);
  const bodyParams = new URLSearchParams(String(capturedInit?.body || ''));
  assert.equal(bodyParams.get('secret'), 'secret_xyz');
  assert.equal(bodyParams.get('response'), 'cf_turnstile_valid_token_abc');
  assert.equal(bodyParams.get('remoteip'), '203.0.113.10');

  assert.equal(res.ok, true);
  assert.equal(res.hostname, 'alov.onrender.com');
  assert.equal(res.action, 'login');
});

test('verifyTurnstileWithSiteverify rejects replayed tokens, mismatched actions, and disallowed hostnames', async () => {
  const replayGuard = createTurnstileReplayGuard();
  let calls = 0;
  const mockFetch: typeof fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ success: true, hostname: 'alov.uz', action: 'login' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const first = await verifyTurnstileWithSiteverify({
    token: 'single_use_tok_1',
    secretKey: 'secret_xyz',
    replayGuard,
    fetchImpl: mockFetch,
  });
  assert.equal(first.ok, true);
  assert.equal(calls, 1);

  const replay = await verifyTurnstileWithSiteverify({
    token: 'single_use_tok_1',
    secretKey: 'secret_xyz',
    replayGuard,
    fetchImpl: mockFetch,
  });
  assert.equal(replay.ok, false);
  assert.equal(calls, 1); // rejected before hitting Cloudflare a second time
  assert.deepEqual(replay.errorCodes, ['timeout-or-duplicate']);

  const wrongHost = await verifyTurnstileWithSiteverify({
    token: 'single_use_tok_2',
    secretKey: 'secret_xyz',
    expectedHostnames: ['alov.onrender.com'],
    fetchImpl: mockFetch,
  });
  assert.equal(wrongHost.ok, false);
  assert.deepEqual(wrongHost.errorCodes, ['hostname-mismatch']);

  const wrongAction = await verifyTurnstileWithSiteverify({
    token: 'single_use_tok_3',
    secretKey: 'secret_xyz',
    expectedAction: 'register',
    fetchImpl: mockFetch,
  });
  assert.equal(wrongAction.ok, false);
  assert.deepEqual(wrongAction.errorCodes, ['action-mismatch']);
});

test('verifyTurnstileWithSiteverify rejects tokens when Cloudflare returns success: false or network fails', async () => {
  const res = await verifyTurnstileWithSiteverify({
    token: 'forged_long_token_123456789',
    secretKey: 'secret_xyz',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ),
  });

  assert.equal(res.ok, false);
  assert.deepEqual(res.errorCodes, ['invalid-input-response']);

  const errStatusRes = await verifyTurnstileWithSiteverify({
    token: 'some_token_12345',
    secretKey: 'secret_xyz',
    fetchImpl: async () => new Response('Server error', { status: 502 }),
  });
  assert.equal(errStatusRes.ok, false);

  const networkFailRes = await verifyTurnstileWithSiteverify({
    token: 'some_token_12345',
    secretKey: 'secret_xyz',
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  assert.equal(networkFailRes.ok, false);
});
