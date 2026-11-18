import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_TILE_PROVIDERS,
  pickNextTileProviderIndex,
  getRegionFallbackCoords,
  resolveEffectiveOriginCoords,
  shouldShowBlockingGpsBanner,
} from './mapHelpers.ts';

describe('mapHelpers tile failover and geolocation region fallbacks', () => {
  it('provides multiple resilient tile servers and sequential failover', () => {
    assert.ok(MAP_TILE_PROVIDERS.length >= 3);
    assert.ok(MAP_TILE_PROVIDERS[0].url.includes('cartocdn.com'));
    assert.equal(pickNextTileProviderIndex(0), 1);
    assert.equal(pickNextTileProviderIndex(1), 2);
    assert.equal(pickNextTileProviderIndex(2), null);
  });

  it('resolves Uzbekistan region fallbacks when live GPS permission is blocked', () => {
    const sam = getRegionFallbackCoords('Samarqand viloyati');
    assert.equal(Math.round(sam.lat), 40);

    const live = resolveEffectiveOriginCoords(
      { lat: 41.31, lng: 69.28 },
      { region: 'Samarqand viloyati' },
      null
    );
    assert.equal(live.isFallback, false);
    assert.deepEqual(live.coords, { lat: 41.31, lng: 69.28 });

    const fallbackFromUserRegion = resolveEffectiveOriginCoords(
      null,
      { region: "Farg'ona viloyati" },
      null
    );
    assert.equal(fallbackFromUserRegion.isFallback, true);
    assert.equal(fallbackFromUserRegion.label, "Farg'ona viloyati");
    assert.ok(fallbackFromUserRegion.coords.lat > 40 && fallbackFromUserRegion.coords.lng > 71);
  });

  it('suppresses intrusive GPS error banners on passive mount load', () => {
    assert.equal(shouldShowBlockingGpsBanner(1, false), false);
    assert.equal(shouldShowBlockingGpsBanner(1, true), true);
  });
});
