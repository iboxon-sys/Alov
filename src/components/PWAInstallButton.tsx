import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const { isInstallable, isIOS, isSuppressed, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isSuppressed) return null;
  if (!isInstallable && !isIOS) return null;

  const handleAction = () => {
    if (isInstallable) {
      void install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {variant === 'card' ? (
        <button
          type="button"
          onClick={handleAction}
          data-testid="pwa-install-card-btn"
          className={`w-full py-2.5 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/30 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-[0.98] cursor-pointer ${className}`}
        >
          {isInstallable ? (
            <Download className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{isInstallable ? "Ilovani o'rnatish (PWA)" : "iPhone / iPad ga o'rnatish"}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleAction}
          data-testid="pwa-install-compact-btn"
          className={`py-3.5 px-5 rounded-2xl bg-[#14161F] border border-white/15 hover:border-rose-500/60 text-zinc-100 hover:text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer active:scale-[0.98] ${className}`}
        >
          {isInstallable ? (
            <Download className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Smartphone className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{isInstallable ? "Ilova qilib o'rnatish" : "iOS ga o'rnatish"}</span>
        </button>
      )}

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-[24px] bg-[#12141E] border border-white/10 p-5 sm:p-6 shadow-2xl text-zinc-100 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src="/assets/images/icon-192.png"
                  alt="Alov.uz"
                  className="w-9 h-9 rounded-xl object-cover border border-white/10 shrink-0"
                />
                <h3 className="text-base font-editorial font-bold text-white truncate">
                  iPhone / iPad ga o&apos;rnatish
                </h3>
              </div>
              <button
                type="button"
                aria-label="Oynani yopish"
                onClick={() => setShowIOSGuide(false)}
                className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full bg-white/[0.08] hover:bg-rose-600 border border-white/15 text-zinc-200 hover:text-white flex items-center justify-center transition shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ol className="space-y-2.5 text-xs sm:text-sm text-zinc-300 leading-relaxed list-decimal list-inside">
              <li>
                Safari pastki panelidagi <strong className="text-white">Share (Ulashish)</strong> tugmasini bosing.
              </li>
              <li>
                Pastga tushib <strong className="text-white">Add to Home Screen</strong> bandini tanlang.
              </li>
              <li>
                Yuqori o&apos;ng burchakdan <strong className="text-white">Add</strong> tugmasini bosing.
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-xs font-bold text-white transition cursor-pointer"
            >
              Tushunarli
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
      className="fixed top-[calc(0.75rem+var(--alov-safe-top,0px))] left-1/2 -translate-x-1/2 max-w-[calc(100vw-2rem)] z-[190] flex items-center gap-2 rounded-xl bg-amber-500/95 backdrop-blur-md px-3.5 py-2 text-xs font-bold text-zinc-950 shadow-lg border border-amber-300/60"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">Oflayn rejim — internet aloqasi uzilgan</span>
    </div>
  );
};
