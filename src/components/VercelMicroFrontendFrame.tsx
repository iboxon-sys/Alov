import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import {
  VERCEL_HEAVY_ORIGIN,
  buildPostMessageAuthPayload,
  buildVercelSectionUrl,
  extractLocalAuthCredentials,
  isAllowedEmbedOrigin,
  resolveRealtimeBackendUrl,
  type HeavyVercelSection,
} from '../utils/microFrontendBridge';
import { getBaseUrl } from '../config/api';

interface VercelMicroFrontendFrameProps {
  section: HeavyVercelSection;
  currentUser?: any | null;
  partnerUser?: any | null;
  targetOrigin?: string;
  onNavigateTab?: (tab: string) => void;
  onNotify?: (message: string) => void;
  onOpenProfile?: (uid: string, snapshot?: any) => void;
  onStartCall?: (user: any) => void;
  onOpenGift?: (user: any) => void;
  onOpenTopUp?: (notice?: string) => void;
  onChatViewChange?: (view: 'list' | 'conversation') => void;
}

export const VercelMicroFrontendFrame: React.FC<VercelMicroFrontendFrameProps> = ({
  section,
  currentUser,
  partnerUser,
  targetOrigin = VERCEL_HEAVY_ORIGIN,
  onNavigateTab,
  onNotify,
  onOpenProfile,
  onStartCall,
  onOpenGift,
  onOpenTopUp,
  onChatViewChange,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const resolvedOrigin = targetOrigin.replace(/\/+$/, '');
  const iframeSrc = buildVercelSectionUrl(section, resolvedOrigin);

  const pushAuthCredentials = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    const stored =
      typeof window !== 'undefined' && window.localStorage
        ? extractLocalAuthCredentials(window.localStorage)
        : { token: '', userId: '', user: null };

    const userId = String(
      currentUser?.uid || currentUser?.id || stored.userId || ''
    ).trim();
    const token = String(
      stored.token ||
        currentUser?.authToken ||
        (userId ? `alov_session_${userId}` : '')
    ).trim();

    const rawBackendOrigin =
      typeof window !== 'undefined' ? getBaseUrl() || window.location.origin : '';

    const payload = buildPostMessageAuthPayload({
      token,
      userId,
      user: currentUser || stored.user || null,
      backendOrigin: resolveRealtimeBackendUrl(rawBackendOrigin),
      section,
      partnerUid: partnerUser?.uid || partnerUser?.id || undefined,
      partner: partnerUser || undefined,
    });

    try {
      win.postMessage(payload, resolvedOrigin);
    } catch (err) {
      console.warn('[VercelBridge] postMessage failed:', err);
    }
  }, [currentUser, partnerUser, resolvedOrigin, section]);

  useEffect(() => {
    setIsLoaded(false);
  }, [iframeSrc]);

  useEffect(() => {
    if (!isLoaded) return;
    pushAuthCredentials();
  }, [isLoaded, pushAuthCredentials]);

  useEffect(() => {
    const handleChildMessage = (event: MessageEvent) => {
      if (!isAllowedEmbedOrigin(event.origin, [resolvedOrigin])) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'ALOV_EMBED_READY') {
        setIsLoaded(true);
        pushAuthCredentials();
      } else if (data.type === 'ALOV_EMBED_NAVIGATE' && typeof data.tab === 'string') {
        onNavigateTab?.(data.tab);
      } else if (data.type === 'ALOV_EMBED_TOAST' && typeof data.message === 'string') {
        onNotify?.(data.message);
      } else if (data.type === 'ALOV_EMBED_OPEN_PROFILE' && data.uid) {
        onOpenProfile?.(String(data.uid), data.snapshot);
      } else if (data.type === 'ALOV_EMBED_START_CALL' && data.user) {
        onStartCall?.(data.user);
      } else if (data.type === 'ALOV_EMBED_OPEN_GIFT' && data.user) {
        onOpenGift?.(data.user);
      } else if (data.type === 'ALOV_EMBED_OPEN_TOPUP') {
        onOpenTopUp?.(typeof data.message === 'string' ? data.message : undefined);
      } else if (data.type === 'ALOV_EMBED_CHAT_VIEW' && (data.view === 'list' || data.view === 'conversation')) {
        onChatViewChange?.(data.view);
      }
    };

    window.addEventListener('message', handleChildMessage);
    return () => window.removeEventListener('message', handleChildMessage);
  }, [
    onChatViewChange,
    onNavigateTab,
    onNotify,
    onOpenGift,
    onOpenProfile,
    onOpenTopUp,
    onStartCall,
    pushAuthCredentials,
    resolvedOrigin,
  ]);

  return (
    <div
      data-testid={`vercel-iframe-wrapper-${section}`}
      className="relative w-full h-full flex-1 min-h-0 bg-[#09090D] overflow-hidden"
    >
      {!isLoaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#09090D] text-zinc-300 pointer-events-none">
          <Loader2 className="w-7 h-7 text-rose-500 animate-spin" />
          <span className="text-xs font-medium text-zinc-400">Yuklanmoqda...</span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title={`Alov.uz ${section}`}
        data-testid={`vercel-iframe-${section}`}
        onLoad={() => {
          setIsLoaded(true);
          pushAuthCredentials();
        }}
        allow="camera; microphone; clipboard-write; autoplay; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        className="w-full h-full min-h-[inherit] border-0 block bg-[#09090D]"
      />
    </div>
  );
};
