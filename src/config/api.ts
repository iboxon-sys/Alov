/**
 * Alov.uz Dynamic Base URL & API Helper
 * Full Render Cloud Integration (https://alov-backend.onrender.com)
 */

export const RENDER_BACKEND_URL = "";

export const getBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    const customBackend = window.localStorage.getItem('alov_render_backend_url');
    if (customBackend && customBackend.trim().startsWith('http')) {
      return customBackend.trim().replace(/\/$/, '');
    }
    return window.location.origin;
  }
  return '';
};

/**
 * Builds absolute API URL ensuring dynamic domain resolution across environments
 */
export const getApiUrl = (endpoint: string): string => {
  const base = getBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return base ? `${base}${cleanEndpoint}` : cleanEndpoint;
};

/**
 * Helper to update Render backend URL dynamically
 */
export const setCustomRenderUrl = (url: string): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (!url || url.trim() === '') {
      window.localStorage.removeItem('alov_render_backend_url');
    } else {
      window.localStorage.setItem('alov_render_backend_url', url.trim().replace(/\/$/, ''));
    }
  }
};

/**
 * Safe fetch helper that handles non-JSON (HTML 404/502/DOCTYPE) responses gracefully
 * preventing "Unexpected token '<', '<!DOCTYPE '... is not valid JSON" crashes.
 */
export const safeFetchJson = async (url: string, options?: RequestInit): Promise<any> => {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    
    if (text && text.trim()) {
      try {
        const data = JSON.parse(text);
        return data;
      } catch (jsonErr) {
        console.warn(`[safeFetchJson] Response is non-JSON HTML from ${url}:`, text.substring(0, 150));
        return { 
          success: false, 
          error: "Serverga ulanishda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.",
          status: res.status 
        };
      }
    }

    return { success: false, error: "Serverdan bo'sh javob keldi", status: res.status };
  } catch (err: any) {
    console.warn(`[safeFetchJson] Request error for ${url}:`, err);
    return { success: false, error: err?.message || 'Tarmoq ulanishida xatolik' };
  }
};
