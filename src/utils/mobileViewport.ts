import { useEffect, useRef, useState } from 'react';

export interface ViewportMetricInput {
  innerHeight: number;
  visualHeight?: number | null;
  visualOffsetTop?: number | null;
  baselineHeight?: number | null;
  keyboardThresholdPx?: number;
}

export interface EffectiveViewportMetrics {
  heightPx: number;
  offsetTopPx: number;
  baselineHeightPx: number;
  keyboardInsetPx: number;
  isKeyboardOpen: boolean;
}

export interface TelegramSafeAreaInsets {
  safeTopPx: number;
  contentTopPx: number;
  totalTopPx: number;
}

export function computeTelegramSafeAreaInsets(tg?: {
  safeAreaInset?: { top?: number | null } | null;
  contentSafeAreaInset?: { top?: number | null } | null;
} | null): TelegramSafeAreaInsets {
  const rawSafe = Number(tg?.safeAreaInset?.top ?? 0);
  const rawContent = Number(tg?.contentSafeAreaInset?.top ?? 0);
  const safeTopPx = Number.isFinite(rawSafe) && rawSafe > 0 ? Math.round(rawSafe) : 0;
  const contentTopPx = Number.isFinite(rawContent) && rawContent > 0 ? Math.round(rawContent) : 0;
  return {
    safeTopPx,
    contentTopPx,
    totalTopPx: safeTopPx + contentTopPx,
  };
}

export function computeEffectiveViewportMetrics(
  input: ViewportMetricInput
): EffectiveViewportMetrics {
  const safeInner = Number.isFinite(input.innerHeight) && input.innerHeight > 0 ? Math.round(input.innerHeight) : 640;
  const safeVisual =
    input.visualHeight != null && Number.isFinite(input.visualHeight) && input.visualHeight > 0
      ? Math.round(input.visualHeight)
      : safeInner;
  const heightPx = Math.max(200, Math.min(safeInner, safeVisual) || safeVisual);
  const offsetTopPx =
    input.visualOffsetTop != null && Number.isFinite(input.visualOffsetTop)
      ? Math.max(0, Math.round(input.visualOffsetTop))
      : 0;
  const candidateBaseline =
    input.baselineHeight != null && Number.isFinite(input.baselineHeight) && input.baselineHeight > 0
      ? Math.round(input.baselineHeight)
      : safeInner;
  const baselineHeightPx = Math.max(safeInner, candidateBaseline, heightPx);
  const threshold = input.keyboardThresholdPx ?? 120;
  const diff = baselineHeightPx - heightPx;
  const isKeyboardOpen = diff >= threshold;
  const keyboardInsetPx = isKeyboardOpen ? Math.max(0, diff) : 0;

  return {
    heightPx,
    offsetTopPx,
    baselineHeightPx,
    keyboardInsetPx,
    isKeyboardOpen,
  };
}

export function shouldHideMobileBottomDock(params: {
  isMobileViewport: boolean;
  isKeyboardOpen: boolean;
  activeTab: string;
  chatView: 'list' | 'conversation';
}): boolean {
  if (params.activeTab === 'reels' || params.activeTab === 'chatruletka') return true;
  if (params.activeTab === 'chats' && params.chatView === 'conversation') return true;
  if (params.isMobileViewport && params.isKeyboardOpen) return true;
  return false;
}

export function shouldShowOuterAppHeader(params: {
  isMobileViewport: boolean;
  activeTab: string;
  chatView: 'list' | 'conversation';
}): boolean {
  if (params.activeTab === 'reels' || params.activeTab === 'chatruletka') return false;
  if (params.isMobileViewport && params.activeTab === 'chats' && params.chatView === 'conversation') {
    return false;
  }
  return true;
}

export function filterChatConversations<T extends Record<string, any>>(
  chats: T[],
  rawQuery: string,
  currentUid: string | undefined,
  usersList: any[]
): T[] {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return chats;

  return chats.filter((chat) => {
    const partnerUid =
      chat.participants?.find((p: string) => p !== currentUid) ||
      chat.partner?.uid ||
      chat.partner?.id;
    const matchedUser =
      usersList.find((u) => (u.uid && u.uid === partnerUid) || (u.id && u.id === partnerUid)) ||
      chat.partner;
    const name = String(matchedUser?.name || matchedUser?.username || '').toLowerCase();
    const lastMsg = String(chat.lastMessage || '').toLowerCase();
    return name.includes(q) || lastMsg.includes(q);
  });
}

export function useVisualViewportLock(options?: {
  enabled?: boolean;
  resetWindowScrollOnKeyboard?: boolean;
}) {
  const enabled = options?.enabled !== false;
  const resetWindowScrollOnKeyboard = options?.resetWindowScrollOnKeyboard === true;
  const baselineHeightRef = useRef<number>(
    typeof window !== 'undefined' ? window.innerHeight || 640 : 640
  );

  const [metrics, setMetrics] = useState<EffectiveViewportMetrics>(() => {
    if (typeof window === 'undefined') {
      return {
        heightPx: 844,
        offsetTopPx: 0,
        baselineHeightPx: 844,
        keyboardInsetPx: 0,
        isKeyboardOpen: false,
      };
    }
    const vv = window.visualViewport;
    return computeEffectiveViewportMetrics({
      innerHeight: window.innerHeight,
      visualHeight: vv?.height ?? window.innerHeight,
      visualOffsetTop: vv?.offsetTop ?? 0,
      baselineHeight: window.innerHeight,
    });
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let rafId: number | null = null;

    const syncMetrics = () => {
      const vv = window.visualViewport;
      const innerH = window.innerHeight || 640;
      const visualH = vv?.height ?? innerH;
      const visualTop = vv?.offsetTop ?? 0;

      // Update baseline when viewport grows (orientation change or keyboard closing)
      const currentMax = Math.max(innerH, visualH);
      if (currentMax > baselineHeightRef.current || Math.abs(innerH - visualH) < 40 && currentMax >= baselineHeightRef.current - 20) {
        baselineHeightRef.current = Math.max(baselineHeightRef.current, currentMax);
      }

      const next = computeEffectiveViewportMetrics({
        innerHeight: innerH,
        visualHeight: visualH,
        visualOffsetTop: visualTop,
        baselineHeight: baselineHeightRef.current,
      });

      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--alov-vvh', `${next.heightPx}px`);
      rootStyle.setProperty('--alov-vv-top', `${next.offsetTopPx}px`);
      const tgInsets = computeTelegramSafeAreaInsets((window as any).Telegram?.WebApp);
      rootStyle.setProperty('--alov-tg-safe-top', `${tgInsets.safeTopPx}px`);
      rootStyle.setProperty('--alov-tg-content-top', `${tgInsets.contentTopPx}px`);

      if (resetWindowScrollOnKeyboard && (next.isKeyboardOpen || next.offsetTopPx > 0 || window.scrollY > 0)) {
        if (window.scrollY !== 0 || window.scrollX !== 0) {
          window.scrollTo(0, 0);
        }
      }

      setMetrics((prev) =>
        prev.heightPx === next.heightPx &&
        prev.offsetTopPx === next.offsetTopPx &&
        prev.isKeyboardOpen === next.isKeyboardOpen &&
        prev.keyboardInsetPx === next.keyboardInsetPx
          ? prev
          : next
      );
    };

    const scheduleSync = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        syncMetrics();
      });
    };

    const handleOrientationReset = () => {
      baselineHeightRef.current = window.innerHeight || 640;
      scheduleSync();
    };

    syncMetrics();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', scheduleSync);
    vv?.addEventListener('scroll', scheduleSync);
    window.addEventListener('resize', scheduleSync);
    window.addEventListener('orientationchange', handleOrientationReset);
    window.addEventListener('focusin', scheduleSync);
    window.addEventListener('focusout', scheduleSync);

    const tg = (window as any).Telegram?.WebApp;
    try {
      tg?.onEvent?.('viewportChanged', scheduleSync);
      tg?.onEvent?.('safeAreaChanged', scheduleSync);
      tg?.onEvent?.('contentSafeAreaChanged', scheduleSync);
      tg?.onEvent?.('fullscreenChanged', scheduleSync);
    } catch {}

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      vv?.removeEventListener('resize', scheduleSync);
      vv?.removeEventListener('scroll', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
      window.removeEventListener('orientationchange', handleOrientationReset);
      window.removeEventListener('focusin', scheduleSync);
      window.removeEventListener('focusout', scheduleSync);
      try {
        tg?.offEvent?.('viewportChanged', scheduleSync);
        tg?.offEvent?.('safeAreaChanged', scheduleSync);
        tg?.offEvent?.('contentSafeAreaChanged', scheduleSync);
        tg?.offEvent?.('fullscreenChanged', scheduleSync);
      } catch {}
    };
  }, [enabled, resetWindowScrollOnKeyboard]);

  return metrics;
}
