import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAIN_RENDER_ORIGIN,
  VERCEL_HEAVY_ORIGIN,
  buildPostMessageAuthPayload,
  buildVercelSectionUrl,
  extractLocalAuthCredentials,
  isAllowedCorsOrigin,
  isAllowedEmbedOrigin,
  isAllowedParentOrigin,
  mapTabToVercelSection,
  parseIncomingAuthMessage,
  parseVercelEmbedRoute,
  persistLocalAuthCredentials,
  resolveRealtimeBackendUrl,
  shouldRedirectVercelStandaloneToMain,
  shouldUseVercelIframeForSection,
} from './microFrontendBridge';

test('CORS and origin validators allow Vercel, Render, alov.uz and block untrusted domains', () => {
  assert.equal(isAllowedCorsOrigin('https://alov-mu.vercel.app'), true);
  assert.equal(isAllowedCorsOrigin('https://alov-mu-preview.vercel.app'), true);
  assert.equal(isAllowedCorsOrigin('https://alov.onrender.com'), true);
  assert.equal(isAllowedCorsOrigin('https://alov.uz'), true);
  assert.equal(isAllowedCorsOrigin('http://localhost:3000'), true);
  assert.equal(isAllowedCorsOrigin('https://evil-attacker.com'), false);

  assert.equal(isAllowedParentOrigin('https://alov.onrender.com'), true);
  assert.equal(isAllowedParentOrigin('https://alov.uz'), true);
  assert.equal(isAllowedParentOrigin('https://evil.com'), false);

  assert.equal(isAllowedEmbedOrigin('https://alov-mu.vercel.app'), true);
  assert.equal(isAllowedEmbedOrigin('https://phishing.site'), false);
});

test('Section URL mapping and Vercel route parsing work accurately including /chat', () => {
  assert.equal(mapTabToVercelSection('reels'), 'efir');
  assert.equal(mapTabToVercelSection('efir'), 'efir');
  assert.equal(mapTabToVercelSection('posts'), 'postlar');
  assert.equal(mapTabToVercelSection('chatruletka'), 'chatroulette');
  assert.equal(mapTabToVercelSection('chatroulette'), 'chatroulette');
  assert.equal(mapTabToVercelSection('chats'), 'chat');
  assert.equal(mapTabToVercelSection('chat'), 'chat');
  assert.equal(mapTabToVercelSection('discover'), null);

  assert.equal(buildVercelSectionUrl('efir'), `${VERCEL_HEAVY_ORIGIN}/efir`);
  assert.equal(buildVercelSectionUrl('postlar'), `${VERCEL_HEAVY_ORIGIN}/postlar`);
  assert.equal(buildVercelSectionUrl('chatroulette'), `${VERCEL_HEAVY_ORIGIN}/chatroulette`);
  assert.equal(buildVercelSectionUrl('chat'), `${VERCEL_HEAVY_ORIGIN}/chat`);

  assert.deepEqual(parseVercelEmbedRoute('/efir'), { isEmbedRoute: true, section: 'efir' });
  assert.deepEqual(parseVercelEmbedRoute('/postlar/'), { isEmbedRoute: true, section: 'postlar' });
  assert.deepEqual(parseVercelEmbedRoute('/chatroulette'), { isEmbedRoute: true, section: 'chatroulette' });
  assert.deepEqual(parseVercelEmbedRoute('/chatruletka'), { isEmbedRoute: true, section: 'chatroulette' });
  assert.deepEqual(parseVercelEmbedRoute('/chat'), { isEmbedRoute: true, section: 'chat' });
  assert.deepEqual(parseVercelEmbedRoute('/'), { isEmbedRoute: false, section: null });
});

test('resolveRealtimeBackendUrl never returns Vercel origins for WebRTC/Socket.io signaling', () => {
  assert.equal(resolveRealtimeBackendUrl('https://alov-mu.vercel.app'), MAIN_RENDER_ORIGIN);
  assert.equal(resolveRealtimeBackendUrl('https://alov-preview.vercel.app'), MAIN_RENDER_ORIGIN);
  assert.equal(resolveRealtimeBackendUrl(''), MAIN_RENDER_ORIGIN);
  assert.equal(resolveRealtimeBackendUrl('https://alov.onrender.com/'), 'https://alov.onrender.com');
  assert.equal(resolveRealtimeBackendUrl('http://localhost:3000'), 'http://localhost:3000');
});

test('Direct standalone visit on alov-mu.vercel.app redirects to main Render site unless inside iframe or preview', () => {
  assert.equal(
    shouldRedirectVercelStandaloneToMain({
      hostname: 'alov-mu.vercel.app',
      isInIframe: false,
      search: '',
    }),
    `${MAIN_RENDER_ORIGIN}/`
  );

  assert.equal(
    shouldRedirectVercelStandaloneToMain({
      hostname: 'alov-mu.vercel.app',
      isInIframe: true,
      search: '',
    }),
    null
  );

  assert.equal(
    shouldRedirectVercelStandaloneToMain({
      hostname: 'alov-mu.vercel.app',
      isInIframe: false,
      search: '?preview=1',
    }),
    null
  );

  assert.equal(
    shouldRedirectVercelStandaloneToMain({
      hostname: 'alov.onrender.com',
      isInIframe: false,
      search: '',
    }),
    null
  );
});

test('shouldUseVercelIframeForSection activates seamlessly and forces Chat & Chatroulette via Vercel iframe without nesting', () => {
  assert.equal(
    shouldUseVercelIframeForSection({ hostname: 'alov.onrender.com', section: 'efir', isInIframe: false }),
    true
  );
  assert.equal(
    shouldUseVercelIframeForSection({ hostname: 'alov.uz', section: 'postlar', isInIframe: false }),
    true
  );
  assert.equal(
    shouldUseVercelIframeForSection({ hostname: 'alov.onrender.com', section: 'chat', isInIframe: false }),
    true
  );
  assert.equal(
    shouldUseVercelIframeForSection({ hostname: 'localhost', section: 'chat', isInIframe: false }),
    false
  );
  assert.equal(
    shouldUseVercelIframeForSection({ hostname: 'localhost', section: 'chat', isInIframe: false, search: '?microfrontend=1' }),
    true
  );
  assert.equal(
    shouldUseVercelIframeForSection({ hostname: 'alov.onrender.com', section: 'chat', isInIframe: false, search: '?microfrontend=0' }),
    false
  );
  assert.equal(
    shouldUseVercelIframeForSection({ hostname: 'alov-mu.vercel.app', section: 'chat', isInIframe: true }),
    false
  );
  assert.equal(
    shouldUseVercelIframeForSection({ hostname: 'alov-mu.vercel.app', section: 'efir', isInIframe: true }),
    false
  );
  assert.equal(
    shouldUseVercelIframeForSection({ hostname: 'localhost', section: 'efir', isInIframe: false }),
    false
  );
  assert.equal(
    shouldUseVercelIframeForSection({ hostname: 'localhost', section: 'chatroulette', isInIframe: false }),
    true
  );
  assert.equal(
    shouldUseVercelIframeForSection({ hostname: 'alov.onrender.com', section: 'chatroulette', isInIframe: true }),
    false
  );
  assert.equal(
    shouldUseVercelIframeForSection({
      hostname: 'localhost',
      section: 'chatroulette',
      isInIframe: false,
      search: '?microfrontend=1',
    }),
    true
  );
});

test('localStorage auth extraction and postMessage bridge parsing enforce origin security and forward partner', () => {
  const mem = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
  };

  persistLocalAuthCredentials(mockStorage, {
    token: 'tok_abc_123',
    userId: 'user_42',
    user: { uid: 'user_42', name: 'Aziz' },
  });

  const creds = extractLocalAuthCredentials(mockStorage);
  assert.equal(creds.token, 'tok_abc_123');
  assert.equal(creds.userId, 'user_42');
  assert.equal(creds.user?.name, 'Aziz');

  const msg = buildPostMessageAuthPayload({
    ...creds,
    backendOrigin: 'https://alov-mu.vercel.app',
    section: 'chat',
    partnerUid: 'user_99',
    partner: { uid: 'user_99', name: 'Madina' },
  });

  // backendOrigin must automatically reject Vercel and fallback to Render
  assert.equal(msg.backendOrigin, MAIN_RENDER_ORIGIN);

  const accepted = parseIncomingAuthMessage({ origin: 'https://alov.onrender.com', data: msg });
  assert.ok(accepted);
  assert.equal(accepted.token, 'tok_abc_123');
  assert.equal(accepted.userId, 'user_42');
  assert.equal(accepted.backendOrigin, MAIN_RENDER_ORIGIN);
  assert.equal(accepted.section, 'chat');
  assert.equal(accepted.partnerUid, 'user_99');
  assert.equal(accepted.partner?.name, 'Madina');

  const rejected = parseIncomingAuthMessage({ origin: 'https://malicious.example', data: msg });
  assert.equal(rejected, null);

  persistLocalAuthCredentials(mockStorage, null);
  assert.equal(mem.get('alov_auth_token'), undefined);
  assert.equal(mem.get('alov_user_id'), undefined);
});
