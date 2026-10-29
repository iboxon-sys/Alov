/**
 * Alov.uz Dynamic Base URL & API Helper
 * Automatically handles local development, custom domains, and Render production (https://alov.onrender.com/)
 */

export const getBaseUrl = (): string => {
  // 1. Check if configured via Vite or React App environment variables
  const envUrl = (import.meta as any).env?.VITE_PUBLIC_URL || (import.meta as any).env?.REACT_APP_BACKEND_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.replace(/\/$/, '');
  }

  // 2. Browser runtime detection
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    if (window.location.hostname.includes('onrender.com') || window.location.hostname === 'alov.onrender.com') {
      return origin || 'https://alov.onrender.com';
    }
    return origin;
  }

  // 3. Fallback default
  return 'https://alov.onrender.com';
};

/**
 * Builds absolute API URL ensuring dynamic domain resolution across environments
 */
export const getApiUrl = (endpoint: string): string => {
  const base = getBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
};
