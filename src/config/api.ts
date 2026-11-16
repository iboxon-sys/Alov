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
    const host = window.location.hostname;
    const isSameOriginFullStack =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.onrender.com') ||
      host.endsWith('.run.app') ||
      host.endsWith('.usercontent.goog') ||
      host === 'alov.uz' ||
      host === 'www.alov.uz';
    if (isSameOriginFullStack) {
      return window.location.origin;
    }
    const envBackend = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_BACKEND_URL;
    if (envBackend && typeof envBackend === 'string' && envBackend.trim().startsWith('http')) {
      return envBackend.trim().replace(/\/$/, '');
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
 * Resolves relative /api/... media and avatar URLs against the active Render backend origin
 */
export const resolveApiMediaUrl = (url?: string): string => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/api/')) {
    return getApiUrl(raw);
  }
  return raw;
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
