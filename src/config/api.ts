/**
 * Alov.uz Dynamic Base URL & API Helper
 * Full Render Cloud Integration (https://alov-backend.onrender.com)
 */

export const RENDER_BACKEND_URL = "https://alov-backend.onrender.com";

export const getBaseUrl = (): string => {
  // 1. Check if user set a custom backend in localStorage (e.g. from app settings)
  if (typeof window !== 'undefined' && window.localStorage) {
    const customBackend = window.localStorage.getItem('alov_render_backend_url');
    if (customBackend && customBackend.trim().startsWith('http')) {
      return customBackend.trim().replace(/\/$/, '');
    }
  }

  // 2. Check if configured via Vite environment variables
  const envUrl = (import.meta as any).env?.VITE_RENDER_BACKEND_URL || 
                 (import.meta as any).env?.VITE_PUBLIC_URL || 
                 (import.meta as any).env?.REACT_APP_BACKEND_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/$/, '');
  }

  // 3. Browser runtime detection
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    const origin = window.location.origin;

    // If client is already running directly on Render
    if (hostname.includes('onrender.com')) {
      return origin || RENDER_BACKEND_URL;
    }

    // In production or mobile environment, prioritize Render cloud backend
    if (window.location.protocol === 'https:' && !hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
      // If deployed in cloud preview or mobile standalone PWA
      return origin || RENDER_BACKEND_URL;
    }

    return origin || RENDER_BACKEND_URL;
  }

  // 4. Default fallback to Render Cloud Backend
  return RENDER_BACKEND_URL;
};

/**
 * Builds absolute API URL ensuring dynamic domain resolution across environments
 */
export const getApiUrl = (endpoint: string): string => {
  const base = getBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
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
