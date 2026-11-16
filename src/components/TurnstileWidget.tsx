import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement | string, params: Record<string, any>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export const TURNSTILE_SITE_KEY =
  (import.meta as any).env?.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAGA6CBOpiOAB5R-s';

interface TurnstileWidgetProps {
  onTokenChange: (token: string | null) => void;
  resetSignal?: number;
  className?: string;
}

export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  onTokenChange,
  resetSignal = 0,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onTokenChange);
  onTokenRef.current = onTokenChange;

  const [status, setStatus] = useState<'loading' | 'ready' | 'verified' | 'error'>('loading');
  const [errorCode, setErrorCode] = useState<string>('');
  const [mountVersion, setMountVersion] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | null = null;
    let maxAttempts = 40;

    const mountWidget = () => {
      if (cancelled || !containerRef.current) return;
      if (!window.turnstile || typeof window.turnstile.render !== 'function') {
        maxAttempts -= 1;
        if (maxAttempts <= 0) {
          setStatus('error');
          setErrorCode('SCRIPT_TIMEOUT');
          return;
        }
        pollTimer = window.setTimeout(mountWidget, 200);
        return;
      }

      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }

      try {
        setStatus('ready');
        setErrorCode('');
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'dark',
          language: 'auto',
          callback: (token: string) => {
            if (cancelled) return;
            setStatus('verified');
            setErrorCode('');
            onTokenRef.current(token);
          },
          'expired-callback': () => {
            if (cancelled) return;
            setStatus('ready');
            onTokenRef.current(null);
          },
          'error-callback': (errCode?: string | number) => {
            if (cancelled) return;
            setStatus('error');
            setErrorCode(errCode ? String(errCode) : 'LOAD_ERROR');
            onTokenRef.current(null);
          },
        });
      } catch {
        setStatus('error');
        setErrorCode('RENDER_EXCEPTION');
        onTokenRef.current(null);
      }
    };

    mountWidget();

    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [mountVersion]);

  useEffect(() => {
    if (resetSignal <= 0) return;
    onTokenRef.current(null);
    setStatus('ready');
    setErrorCode('');
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {}
    }
  }, [resetSignal]);

  return (
    <div
      data-testid="turnstile-captcha-box"
      className={`rounded-2xl bg-[#0D0F16] border border-white/10 p-2.5 flex flex-col items-center justify-center gap-1.5 ${className}`}
    >
      <div className="w-full flex items-center justify-between px-1 text-[10.5px]">
        <span className="font-semibold text-zinc-400 flex items-center gap-1.5">
          <ShieldCheck className={`w-3.5 h-3.5 ${status === 'verified' ? 'text-emerald-400' : 'text-rose-400'}`} />
          <span>Cloudflare xavfsizlik tekshiruvi</span>
        </span>
        {status === 'verified' && (
          <span className="text-emerald-400 font-bold" data-testid="turnstile-verified-badge">
            Tasdiqlandi ✓
          </span>
        )}
      </div>

      <div ref={containerRef} className="min-h-[65px] flex items-center justify-center w-full overflow-hidden" />

      {status === 'loading' && (
        <p className="text-[10px] text-zinc-500">Captcha yuklanmoqda...</p>
      )}
      {status === 'error' && (
        <div className="flex flex-col items-center gap-1.5 text-center">
          <p className="text-[10.5px] text-amber-300 flex items-center justify-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>
              {errorCode === '110200'
                ? 'Ushbu domen Cloudflare Turnstile ruxsatlarida yoqilmagan (110200)'
                : `Captcha yuklanishida xatolik (${errorCode || 'tarmoq'})`}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setMountVersion((v) => v + 1)}
            className="text-[10px] font-bold text-rose-400 hover:text-rose-300 underline cursor-pointer"
          >
            Qayta urinish
          </button>
        </div>
      )}
    </div>
  );
};
