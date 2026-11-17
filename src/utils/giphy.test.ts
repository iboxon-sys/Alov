import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GIPHY_PUBLIC_API_KEY,
  KLIPY_API_KEY,
  GIPHY_DEBOUNCE_MS,
  uzToEnMap,
  translateUzbekToGiphyQuery,
  buildGiphyApiUrl,
  parseGiphyGifItems,
  isGifMessage,
  fetchGiphyGifs,
} from './giphy.ts';

describe('Klipy GIF search, Uzbek translation & optimization helpers', () => {
  it('uses Klipy API key, Klipy Trending endpoint on empty query, and 300-400ms debounce window', () => {
    assert.equal(
      KLIPY_API_KEY,
      'ZweNxjIB3CdKxUfhLMdodMnRsB9B0bsXJCI4roKa0iJYV4k0bHmKW6qRk26yL2qv'
    );
    assert.equal(GIPHY_PUBLIC_API_KEY, KLIPY_API_KEY);
    assert.ok(GIPHY_DEBOUNCE_MS >= 300 && GIPHY_DEBOUNCE_MS <= 400);

    const url = buildGiphyApiUrl('   ');
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://api.klipy.com');
    assert.equal(parsed.pathname, `/api/v1/${KLIPY_API_KEY}/gifs/trending`);
    assert.equal(parsed.searchParams.get('q'), null);
    assert.equal(parsed.searchParams.get('per_page'), '20');
  });

  it('translates Uzbek words and phrases via uzToEnMap and handles general fallback', () => {
    assert.equal(uzToEnMap['kulgu'], 'laugh');
    assert.equal(uzToEnMap["zo'r"], 'awesome');
    assert.equal(uzToEnMap['salom'], 'hello');

    assert.equal(translateUzbekToGiphyQuery('kulgu'), 'laugh');
    assert.equal(translateUzbekToGiphyQuery("zo'r"), 'awesome');
    assert.equal(translateUzbekToGiphyQuery('salom'), 'hello');
    assert.equal(translateUzbekToGiphyQuery("salom do'stim"), 'hello friend');
    assert.equal(translateUzbekToGiphyQuery('Yaxshi ko‘raman!'), 'i love you');
    assert.equal(translateUzbekToGiphyQuery('салом зўр'), 'hello awesome');

    assert.equal(translateUzbekToGiphyQuery("nimaga bunaqa bo'lyapti?"), 'thinking');
    assert.equal(translateUzbekToGiphyQuery('qayerdansizlar'), 'reaction');
    assert.equal(translateUzbekToGiphyQuery('happy cat'), 'happy cat');
    assert.equal(translateUzbekToGiphyQuery('   '), '');
  });

  it('uses Klipy Search endpoint with translated English query when Uzbek text is provided', () => {
    const url = buildGiphyApiUrl('  kulgu  ', 'custom_key_123', 15);
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://api.klipy.com');
    assert.equal(parsed.pathname, '/api/v1/custom_key_123/gifs/search');
    assert.equal(parsed.searchParams.get('q'), 'laugh');
    assert.equal(parsed.searchParams.get('per_page'), '15');
  });

  it('parses Klipy v1, Klipy v2, and legacy Giphy payloads while skipping ads', () => {
    const klipyV1Items = parseGiphyGifItems({
      result: true,
      data: {
        data: [
          {
            id: 1444921304603424,
            title: 'Laughing Meme',
            file: {
              sm: { gif: { url: 'https://static.klipy.com/ii/abc/sm.gif', width: 220, height: 180 } },
              hd: { gif: { url: 'https://static.klipy.com/ii/abc/hd.gif', width: 440, height: 360 } },
            },
          },
          {
            id: 'ad_slot',
            type: 'ad',
            title: 'Sponsored',
          },
        ],
      },
    });

    assert.equal(klipyV1Items.length, 1);
    assert.equal(klipyV1Items[0].id, '1444921304603424');
    assert.equal(klipyV1Items[0].previewUrl, 'https://static.klipy.com/ii/abc/sm.gif');
    assert.equal(klipyV1Items[0].sendUrl, 'https://static.klipy.com/ii/abc/hd.gif');
    assert.equal(klipyV1Items[0].images?.original?.url, 'https://static.klipy.com/ii/abc/hd.gif');

    const klipyV2Items = parseGiphyGifItems({
      results: [
        {
          id: 'v2_1',
          title: 'Klipy V2',
          media_formats: {
            tinygif: { url: 'https://static.klipy.com/ii/v2/tiny.gif', dims: [150, 120] },
            gif: { url: 'https://static.klipy.com/ii/v2/full.gif', dims: [400, 320] },
          },
        },
      ],
    });
    assert.equal(klipyV2Items.length, 1);
    assert.equal(klipyV2Items[0].previewUrl, 'https://static.klipy.com/ii/v2/tiny.gif');
    assert.equal(klipyV2Items[0].sendUrl, 'https://static.klipy.com/ii/v2/full.gif');

    const legacyGiphyItems = parseGiphyGifItems({
      data: [
        {
          id: 'gif_1',
          title: 'Happy Dance',
          images: {
            fixed_height_small: {
              url: 'https://media0.giphy.com/media/gif_1/100.gif',
              width: '120',
              height: '100',
            },
            original: {
              url: 'https://media0.giphy.com/media/gif_1/giphy.gif',
            },
          },
        },
      ],
    });
    assert.equal(legacyGiphyItems.length, 1);
    assert.equal(legacyGiphyItems[0].previewUrl, 'https://media0.giphy.com/media/gif_1/100.gif');
    assert.equal(legacyGiphyItems[0].sendUrl, 'https://media0.giphy.com/media/gif_1/giphy.gif');
  });

  it('identifies Klipy and GIF chat messages accurately', () => {
    assert.equal(isGifMessage({ type: 'gif', content: 'https://static.klipy.com/ii/1/hd.gif' }), true);
    assert.equal(isGifMessage({ type: 'image', fileUrl: 'https://static.klipy.com/ii/1/hd.webp', text: 'GIF' }), true);
    assert.equal(
      isGifMessage({ type: 'image', fileUrl: 'https://alov.onrender.com/uploads/photo.jpg', text: 'Rasm' }),
      false
    );
  });

  it('fetchGiphyGifs translates Uzbek query, calls Klipy directly, and falls back to backend proxy on 403', async () => {
    const calledUrls: string[] = [];
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      calledUrls.push(url);
      if (url.startsWith('https://api.klipy.com/')) {
        return new Response(JSON.stringify({ result: false, message: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          success: true,
          gifs: [
            {
              id: 'proxy_1',
              title: 'Proxy GIF',
              previewUrl: 'https://static.klipy.com/ii/p1/sm.gif',
              sendUrl: 'https://static.klipy.com/ii/p1/hd.gif',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await fetchGiphyGifs({
      query: 'kulgu',
      backendOrigin: 'https://alov.onrender.com/',
      fetchImpl: mockFetch,
    });

    assert.equal(calledUrls.length, 2);
    assert.ok(
      calledUrls[0].startsWith(
        `https://api.klipy.com/api/v1/${KLIPY_API_KEY}/gifs/search?`
      )
    );
    assert.ok(calledUrls[0].includes('q=laugh'));
    assert.equal(calledUrls[1], 'https://alov.onrender.com/api/gifs?limit=20&q=laugh');
    assert.equal(res.ok, true);
    assert.equal(res.translatedQuery, 'laugh');
    assert.equal(res.gifs[0].id, 'proxy_1');
  });
});
