/**
 * Alov.uz Dynamic Base URL & API Helper
 * Supports Render Cloud Backend (https://alov-backend.onrender.com) and dynamic local preview
 */

export const RENDER_BACKEND_URL = "https://alov-backend.onrender.com";

export const getBaseUrl = (): string => {
  // 1. Check if configured via Vite or React App environment variables
  const envUrl = (import.meta as any).env?.VITE_PUBLIC_URL || (import.meta as any).env?.REACT_APP_BACKEND_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.replace(/\/$/, '');
  }

  // 2. Browser runtime detection
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    // If running on local dev or AI Studio preview container, return origin so Express Vite middleware works
    if (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1') || window.location.hostname.includes('run.app')) {
      return origin;
    }
    // Render deployment static client pointing to Render backend
    if (window.location.hostname.includes('onrender.com')) {
      return origin || RENDER_BACKEND_URL;
    }
    return origin;
  }

  // 3. Fallback default
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
