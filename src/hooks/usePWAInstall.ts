import { useEffect, useState } from 'react';
import {
  isIOSUserAgent,
  isStandaloneDisplayMode,
  isTelegramMiniAppContext,
  shouldSuppressPwaInstall,
} from '../utils/pwaHelpers';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isTelegramMiniApp, setIsTelegramMiniApp] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone = isStandaloneDisplayMode({
      matchMediaStandalone: window.matchMedia?.('(display-mode: standalone)')?.matches,
      navigatorStandalone: (window.navigator as unknown as { standalone?: boolean }).standalone === true,
    });
    setIsInstalled(standalone);
    setIsIOS(isIOSUserAgent(window.navigator.userAgent));
    setIsTelegramMiniApp(isTelegramMiniAppContext(window));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    mediaQuery?.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery?.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  const suppressed = shouldSuppressPwaInstall({ isStandalone: isInstalled, isTelegramMiniApp });

  return {
    isInstallable: !suppressed && Boolean(deferredPrompt),
    isInstalled,
    isIOS: !suppressed && isIOS,
    isSuppressed: suppressed,
    install,
  };
}
