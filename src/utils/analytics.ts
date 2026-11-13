declare global {
  interface Window {
    dataLayer?: any[];
    __alovGtmLoadedId?: string;
  }
}

export function isValidGtmId(gtmId?: string | null): gtmId is string {
  return typeof gtmId === 'string' && /^GTM-[A-Z0-9]+$/i.test(gtmId.trim());
}

/**
 * Loads Google Tag Manager strictly once.
 * Google Analytics (GA4) must be configured inside Google Tag Manager — never added separately.
 */
export function initGoogleTagManager(
  gtmId?: string | null,
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined,
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined
): boolean {
  if (!doc || !win || !isValidGtmId(gtmId)) return false;

  const cleanId = gtmId.trim();
  if (win.__alovGtmLoadedId === cleanId) return false;

  const existingScript = doc.querySelector(
    `script[src*="googletagmanager.com/gtm.js"]`
  );
  if (existingScript) {
    win.__alovGtmLoadedId = cleanId;
    return false;
  }

  win.dataLayer = win.dataLayer || [];
  win.dataLayer.push({
    'gtm.start': new Date().getTime(),
    event: 'gtm.js',
  });

  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(cleanId)}`;
  script.setAttribute('data-gtm-id', cleanId);

  const head = doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement;
  head.appendChild(script);
  win.__alovGtmLoadedId = cleanId;
  return true;
}
