export interface MapTileProvider {
  id: string;
  url: string;
  attribution: string;
  subdomains?: string | string[];
  maxZoom: number;
}

export const MAP_TILE_PROVIDERS: MapTileProvider[] = [
  {
    id: 'carto_voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap · CARTO Alov.uz GPS',
    subdomains: ['a', 'b', 'c', 'd'],
    maxZoom: 20,
  },
  {
    id: 'osm_standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap Alov.uz GPS',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
  },
  {
    id: 'esri_street',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri Alov.uz GPS',
    maxZoom: 19,
  },
];

export const UZ_REGION_FALLBACK_COORDS: Record<string, { lat: number; lng: number }> = {
  'Toshkent shahri': { lat: 41.2995, lng: 69.2401 },
  'Toshkent viloyati': { lat: 41.1167, lng: 69.5667 },
  'Andijon viloyati': { lat: 40.7821, lng: 72.3442 },
  "Farg'ona viloyati": { lat: 40.3842, lng: 71.7843 },
  'Namangan viloyati': { lat: 40.9983, lng: 71.6726 },
  'Samarqand viloyati': { lat: 39.6542, lng: 66.9597 },
  'Buxoro viloyati': { lat: 39.7747, lng: 64.4286 },
  'Xorazm viloyati': { lat: 41.55, lng: 60.6333 },
  'Qashqadaryo viloyati': { lat: 38.8606, lng: 65.7891 },
  'Surxondaryo viloyati': { lat: 37.2242, lng: 67.2783 },
  'Jizzax viloyati': { lat: 40.1158, lng: 67.8422 },
  'Sirdaryo viloyati': { lat: 40.4897, lng: 68.7842 },
  'Navoiy viloyati': { lat: 40.0844, lng: 65.3792 },
  "Qoraqalpog'iston Respublikasi": { lat: 42.4531, lng: 59.6103 },
};

export function pickNextTileProviderIndex(currentIndex: number): number | null {
  const next = currentIndex + 1;
  if (next >= MAP_TILE_PROVIDERS.length) return null;
  return next;
}

export function getRegionFallbackCoords(regionName?: string | null): { lat: number; lng: number } {
  const clean = String(regionName || '').trim();
  if (clean && clean !== 'Barchasi' && UZ_REGION_FALLBACK_COORDS[clean]) {
    return UZ_REGION_FALLBACK_COORDS[clean];
  }
  return UZ_REGION_FALLBACK_COORDS['Toshkent shahri'];
}

export function resolveEffectiveOriginCoords(
  userCoords: { lat?: number | null; lng?: number | null } | null | undefined,
  currentUser?: { location?: { lat?: number | null; lng?: number | null } | null; region?: string | null } | null,
  filterRegion?: string | null
): { coords: { lat: number; lng: number }; isFallback: boolean; label: string } {
  const uLat = Number(userCoords?.lat);
  const uLng = Number(userCoords?.lng);
  if (Number.isFinite(uLat) && Number.isFinite(uLng) && uLat !== 0 && uLng !== 0) {
    return { coords: { lat: uLat, lng: uLng }, isFallback: false, label: 'Jonli GPS' };
  }

  const savedLat = Number(currentUser?.location?.lat);
  const savedLng = Number(currentUser?.location?.lng);
  if (Number.isFinite(savedLat) && Number.isFinite(savedLng) && savedLat !== 0 && savedLng !== 0) {
    return { coords: { lat: savedLat, lng: savedLng }, isFallback: true, label: 'Saqlangan lokatsiya' };
  }

  const chosenRegion =
    (filterRegion && filterRegion !== 'Barchasi' ? filterRegion : currentUser?.region) || 'Toshkent shahri';
  return {
    coords: getRegionFallbackCoords(chosenRegion),
    isFallback: true,
    label: chosenRegion,
  };
}

export function shouldShowBlockingGpsBanner(
  errorCode: number | undefined | null,
  userInitiated: boolean
): boolean {
  // Never flash a blocking red error banner across the map on passive auto-detect load
  if (!userInitiated) return false;
  return Boolean(errorCode === 1 || errorCode === 2 || errorCode === 3);
}
