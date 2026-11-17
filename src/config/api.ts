/**
 * Alov.uz Dynamic Base URL & API Helper
 * Supports Render Primary Backend (https://alov.onrender.com) + Vercel Micro-Frontend (https://alov-mu.vercel.app)
 */

import {
  MAIN_RENDER_ORIGIN,
  VERCEL_HEAVY_ORIGIN,
  extractLocalAuthCredentials,
  isDevPreviewHost,
  isRenderHost,
  isVercelHost,
} from '../utils/microFrontendBridge';

export { MAIN_RENDER_ORIGIN, VERCEL_HEAVY_ORIGIN };
export const RENDER_BACKEND_URL = MAIN_RENDER_ORIGIN;

export const getBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    const customBackend = window.localStorage.getItem('alov_render_backend_url');
    if (customBackend && customBackend.trim().startsWith('http')) {
      return customBackend.trim().replace(/\/$/, '');
    }

    const host = window.location.hostname.toLowerCase();
    const envBackend =
      (import.meta as any).env?.VITE_API_URL ||
      (import.meta as any).env?.VITE_BACKEND_URL ||
      '';
    const cleanEnvBackend =
      typeof envBackend === 'string' && envBackend.trim().startsWith('http')
        ? envBackend.trim().replace(/\/$/, '')
        : '';

    // When running inside Vercel Micro-Frontend (https://alov-mu.vercel.app),
    // route ALL API and Socket.io requests directly to the primary Render backend.
    if (isVercelHost(host)) {
      return cleanEnvBackend || MAIN_RENDER_ORIGIN;
    }

    const isSameOriginFullStack =
      isDevPreviewHost(host) ||
      isRenderHost(host) ||
      host === 'alov.uz' ||
      host === 'www.alov.uz';

    if (isSameOriginFullStack) {
      return window.location.origin;
    }

    if (cleanEnvBackend) {
      return cleanEnvBackend;
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
 * Resolves relative /api/... media and avatar URLs against the active backend origin
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
 * Returns auth bridge headers (Authorization Bearer + X-User-Id) for cross-origin Render API calls.
 */
export const getAuthBridgeHeaders = (): Record<string, string> => {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  const { token, userId } = extractLocalAuthCredentials(window.localStorage);
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Alov-Token'] = token;
  }
  if (userId) {
    headers['X-User-Id'] = userId;
  }
  return headers;
};

/**
 * Safe fetch helper that handles non-JSON (HTML 404/502/DOCTYPE) responses gracefully
 * and attaches Render <-> Vercel auth bridge headers automatically for API calls.
 */
export const safeFetchJson = async (url: string, options?: RequestInit): Promise<any> => {
  try {
    const mergedOptions: RequestInit = { ...(options || {}) };
    const authHeaders = getAuthBridgeHeaders();
    const isBackendCall =
      url.startsWith('/api/') ||
      url.startsWith(getBaseUrl()) ||
      url.startsWith(MAIN_RENDER_ORIGIN);

    if (isBackendCall && Object.keys(authHeaders).length > 0) {
      mergedOptions.headers = {
        ...authHeaders,
        ...(options?.headers || {}),
      };
    }

    const res = await fetch(url, mergedOptions);
    const text = await res.text();

    if (text && text.trim()) {
      try {
        const data = JSON.parse(text);
        return data;
      } catch (_jsonErr) {
        console.warn(`[safeFetchJson] Response is non-JSON HTML from ${url}:`, text.substring(0, 150));
        return {
          success: false,
          error: "Serverga ulanishda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.",
          status: res.status,
        };
      }
    }

    return { success: false, error: "Serverdan bo'sh javob keldi", status: res.status };
  } catch (err: any) {
    console.warn(`[safeFetchJson] Request error for ${url}:`, err);
    return { success: false, error: err?.message || 'Tarmoq ulanishida xatolik' };
  }
};
