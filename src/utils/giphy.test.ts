import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GIPHY_PUBLIC_API_KEY,
  GIPHY_DEBOUNCE_MS,
  buildGiphyApiUrl,
  parseGiphyGifItems,
  isGifMessage,
  fetchGiphyGifs,
} from './giphy.ts';

describe('Giphy GIF search & optimization helpers', () => {
  it('uses Trending endpoint when query is empty or whitespace and defaults to dc6zaTOxFJmzC', () => {
    assert.equal(GIPHY_PUBLIC_API_KEY, 'dc6zaTOxFJmzC');
    assert.ok(GIPHY_DEBOUNCE_MS >= 400 && GIPHY_DEBOUNCE_MS <= 500);

    const url = buildGiphyApiUrl('   ');
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://api.giphy.com');
    assert.equal(parsed.pathname, '/v1/gifs/trending');
    assert.equal(parsed.searchParams.get('api_key'), 'dc6zaTOxFJmzC');
    assert.equal(parsed.searchParams.get('q'), null);
  });

  it('uses Search endpoint with trimmed encoded query when text is provided', () => {
    const url = buildGiphyApiUrl('  salom do\'st  ', 'custom_key_123', 15);
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/v1/gifs/search');
    assert.equal(parsed.searchParams.get('api_key'), 'custom_key_123');
    assert.equal(parsed.searchParams.get('q'), "salom do'st");
    assert.equal(parsed.searchParams.get('limit'), '15');
  });

  it('extracts fixed_height_small for list previews and fixed_height/original for sending', () => {
    const items = parseGiphyGifItems({
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
            fixed_height: {
              url: 'https://media0.giphy.com/media/gif_1/200.gif',
            },
            original: {
              url: 'https://media0.giphy.com/media/gif_1/giphy.gif',
            },
          },
        },
        {
          id: 'gif_2_fallback_original',
          title: 'Wave',
          images: {
            fixed_height_small: {
              url: 'https://media1.giphy.com/media/gif_2/100.gif',
            },
            original: {
              url: 'https://media1.giphy.com/media/gif_2/giphy.gif',
            },
          },
        },
        {
          id: 'gif_invalid',
          title: 'Broken',
          images: {
            fixed_height_small: { url: 'javascript:alert(1)' },
          },
        },
      ],
    });

    assert.equal(items.length, 2);
    assert.deepEqual(items[0], {
      id: 'gif_1',
      title: 'Happy Dance',
      previewUrl: 'https://media0.giphy.com/media/gif_1/100.gif',
      sendUrl: 'https://media0.giphy.com/media/gif_1/200.gif',
      width: 120,
      height: 100,
    });
    assert.equal(items[1].previewUrl, 'https://media1.giphy.com/media/gif_2/100.gif');
    assert.equal(items[1].sendUrl, 'https://media1.giphy.com/media/gif_2/giphy.gif');
  });

  it('identifies GIF chat messages accurately', () => {
    assert.equal(isGifMessage({ type: 'gif', fileUrl: 'https://example.com/a.webp' }), true);
    assert.equal(
      isGifMessage({ type: 'image', fileUrl: 'https://media0.giphy.com/media/abc/200.gif', text: 'GIF' }),
      true
    );
    assert.equal(
      isGifMessage({ type: 'image', fileUrl: 'https://alov.onrender.com/uploads/photo.jpg', text: 'Rasm' }),
      false
    );
  });

  it('fetchGiphyGifs calls Giphy directly and falls back to backend proxy on 403', async () => {
    const calledUrls: string[] = [];
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      calledUrls.push(url);
      if (url.startsWith('https://api.giphy.com/')) {
        return new Response(JSON.stringify({ data: [], meta: { status: 403, msg: 'BANNED' } }), {
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
              previewUrl: 'https://media.giphy.com/media/p1/100.gif',
              sendUrl: 'https://media.giphy.com/media/p1/200.gif',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await fetchGiphyGifs({
      query: 'love',
      backendOrigin: 'https://alov.onrender.com/',
      fetchImpl: mockFetch,
    });

    assert.equal(calledUrls.length, 2);
    assert.ok(calledUrls[0].includes('https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC'));
    assert.equal(calledUrls[1], 'https://alov.onrender.com/api/gifs?limit=20&q=love');
    assert.equal(res.ok, true);
    assert.equal(res.gifs[0].id, 'proxy_1');
  });
});
