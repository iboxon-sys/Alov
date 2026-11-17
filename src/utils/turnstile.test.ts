import test from 'node:test';
import assert from 'node:assert/strict';
import { TURNSTILE_SITEVERIFY_URL, verifyTurnstileWithSiteverify } from './turnstile';

test('verifyTurnstileWithSiteverify rejects empty or missing token without calling Cloudflare', async () => {
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
});

test('verifyTurnstileWithSiteverify sends POST form data to Cloudflare siteverify and accepts success: true', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const res = await verifyTurnstileWithSiteverify({
    token: 'cf_turnstile_valid_token_abc',
    secretKey: 'secret_xyz',
    remoteIp: '203.0.113.10',
    fetchImpl: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ success: true, hostname: 'alov.onrender.com' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.equal(capturedUrl, TURNSTILE_SITEVERIFY_URL);
  assert.equal(capturedInit?.method, 'POST');
  const bodyParams = new URLSearchParams(String(capturedInit?.body || ''));
  assert.equal(bodyParams.get('secret'), 'secret_xyz');
  assert.equal(bodyParams.get('response'), 'cf_turnstile_valid_token_abc');
  assert.equal(bodyParams.get('remoteip'), '203.0.113.10');

  assert.equal(res.ok, true);
  assert.equal(res.hostname, 'alov.onrender.com');
});

test('verifyTurnstileWithSiteverify rejects tokens when Cloudflare returns success: false', async () => {
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
});

test('verifyTurnstileWithSiteverify rejects when network request fails or returns non-200', async () => {
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
