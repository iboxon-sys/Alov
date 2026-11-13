import test from 'node:test';
import assert from 'node:assert/strict';
import { initGoogleTagManager, isValidGtmId } from './analytics';

test('isValidGtmId validates GTM container format only', () => {
  assert.equal(isValidGtmId('GTM-ABC1234'), true);
  assert.equal(isValidGtmId('G-123456789'), false);
  assert.equal(isValidGtmId(''), false);
  assert.equal(isValidGtmId(undefined), false);
});

test('initGoogleTagManager injects GTM script once and never injects separate gtag.js', () => {
  const appended: Array<{ src: string; attrs: Record<string, string> }> = [];
  const fakeDoc: any = {
    querySelector: (selector: string) => {
      if (selector.includes('googletagmanager.com/gtm.js')) {
        return appended.find((s) => s.src.includes('googletagmanager.com/gtm.js')) || null;
      }
      return null;
    },
    createElement: () => ({
      async: false,
      src: '',
      attrs: {} as Record<string, string>,
      setAttribute(k: string, v: string) {
        this.attrs[k] = v;
      },
    }),
    head: {
      appendChild(el: any) {
        appended.push(el);
      },
    },
  };
  const fakeWin: any = {};

  assert.equal(initGoogleTagManager('', fakeDoc, fakeWin), false);
  assert.equal(appended.length, 0);

  assert.equal(initGoogleTagManager('GTM-TEST123', fakeDoc, fakeWin), true);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST123');
  assert.equal(appended.some((s) => s.src.includes('gtag/js')), false);

  // Calling a second time must NOT insert a duplicate tag
  assert.equal(initGoogleTagManager('GTM-TEST123', fakeDoc, fakeWin), false);
  assert.equal(appended.length, 1);
});
