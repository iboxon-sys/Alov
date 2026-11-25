import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import {
  fetchGiphyGifs,
  GIPHY_DEBOUNCE_MS,
  GIPHY_PUBLIC_API_KEY,
  GiphyGifItem,
  translateUzbekToGiphyQuery,
} from '../utils/giphy';

export const GIF_BAR_MAX_ITEMS = 6;

export interface ChatGifBarProps {
  query: string;
  hideTrigger?: number;
  apiOrigin?: string;
  disabled?: boolean;
  onSelectGif: (gif: GiphyGifItem) => void;
}

export const ChatGifBar: React.FC<ChatGifBarProps> = ({
  query,
  hideTrigger = 0,
  apiOrigin,
  disabled = false,
  onSelectGif,
}) => {
  const [gifs, setGifs] = useState<GiphyGifItem[]>([]);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [activeTranslatedQuery, setActiveTranslatedQuery] = useState<string>('');
  const [reloadTick, setReloadTick] = useState(0);

  // Half-screen GIF browser sheet state
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerQuery, setDrawerQuery] = useState<string>('');
  const [drawerGifs, setDrawerGifs] = useState<GiphyGifItem[]>([]);
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);
  const [drawerError, setDrawerError] = useState<string>('');
  const [drawerTranslated, setDrawerTranslated] = useState<string>('');

  const queryCacheRef = useRef<Map<string, GiphyGifItem[]>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const drawerAbortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHideTriggerRef = useRef<number>(hideTrigger);
  const dismissedRef = useRef<boolean>(false);

  const resolvedApiKey =
    (typeof import.meta !== 'undefined' &&
      ((import.meta as any).env?.VITE_KLIPY_API_KEY || (import.meta as any).env?.VITE_GIPHY_API_KEY)) ||
    GIPHY_PUBLIC_API_KEY;

  const hideBar = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsVisible(false);
    setIsLoading(false);
    setErrorMsg('');
  }, []);

  const closeDrawer = useCallback(() => {
    if (drawerDebounceRef.current) {
      clearTimeout(drawerDebounceRef.current);
      drawerDebounceRef.current = null;
    }
    if (drawerAbortRef.current) {
      drawerAbortRef.current.abort();
      drawerAbortRef.current = null;
    }
    setIsDrawerOpen(false);
    setDrawerLoading(false);
    setDrawerError('');
  }, []);

  const searchGifs = useCallback(
    async (rawQuery: string, forceRefresh = false) => {
      const cleanQuery = String(rawQuery || '').trim();
      if (!cleanQuery) {
        hideBar();
        setGifs([]);
        setActiveTranslatedQuery('');
        return;
      }

      const translated = translateUzbekToGiphyQuery(cleanQuery);
      setActiveTranslatedQuery(translated);
      setIsVisible(true);

      const cacheKey = `${translated.toLowerCase()}::24`;
      if (!forceRefresh) {
        const cached = queryCacheRef.current.get(cacheKey);
        if (cached) {
          setGifs(cached);
          setErrorMsg('');
          setIsLoading(false);
          return;
        }
      }

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setErrorMsg('');

      try {
        const result = await fetchGiphyGifs({
          query: cleanQuery,
          apiKey: resolvedApiKey,
          backendOrigin: apiOrigin,
          limit: 24,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (result.ok) {
          setGifs(result.gifs);
          setErrorMsg('');
          if (translated) {
            queryCacheRef.current.set(cacheKey, result.gifs);
          }
        } else {
          setGifs([]);
          setErrorMsg(
            result.status === 401 || result.status === 403
              ? 'Klipy API kaliti cheklangan'
              : "GIF yuklab bo'lmadi"
          );
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setGifs([]);
        setErrorMsg("GIF yuklab bo'lmadi");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [apiOrigin, hideBar, resolvedApiKey]
  );

  const searchDrawerGifs = useCallback(
    async (rawQuery: string) => {
      const cleanQuery = String(rawQuery || '').trim();
      const translated = cleanQuery ? translateUzbekToGiphyQuery(cleanQuery) : 'trending';
      setDrawerTranslated(translated);

      const cacheKey = `${(cleanQuery ? translated : '__trending__').toLowerCase()}::30`;
      const cached = queryCacheRef.current.get(cacheKey);
      if (cached && cached.length > 0) {
        setDrawerGifs(cached);
        setDrawerError('');
        setDrawerLoading(false);
        return;
      }

      if (drawerAbortRef.current) {
        drawerAbortRef.current.abort();
      }
      const controller = new AbortController();
      drawerAbortRef.current = controller;

      setDrawerLoading(true);
      setDrawerError('');

      try {
        const result = await fetchGiphyGifs({
          query: cleanQuery,
          apiKey: resolvedApiKey,
          backendOrigin: apiOrigin,
          limit: 30,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        if (result.ok) {
          setDrawerGifs(result.gifs);
          setDrawerError('');
          queryCacheRef.current.set(cacheKey, result.gifs);
        } else {
          setDrawerGifs([]);
          setDrawerError("GIFlarni yuklab bo'lmadi");
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setDrawerGifs([]);
        setDrawerError("GIFlarni yuklab bo'lmadi");
      } finally {
        if (!controller.signal.aborted) {
          setDrawerLoading(false);
        }
      }
    },
    [apiOrigin, resolvedApiKey]
  );

  // Explicitly hide when parent sends a message or resets chat
  useEffect(() => {
    if (hideTrigger !== lastHideTriggerRef.current) {
      lastHideTriggerRef.current = hideTrigger;
      dismissedRef.current = true;
      hideBar();
      closeDrawer();
      setGifs([]);
      setActiveTranslatedQuery('');
    }
  }, [hideTrigger, hideBar, closeDrawer]);

  // Debounced Klipy/Giphy search when user stops typing; hidden when input is empty
  useEffect(() => {
    const cleanQuery = String(query || '').trim();

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (!cleanQuery) {
      dismissedRef.current = false;
      hideBar();
      setGifs([]);
      setActiveTranslatedQuery('');
      return;
    }

    if (dismissedRef.current) {
      dismissedRef.current = false;
    }

    debounceTimerRef.current = setTimeout(() => {
      if (!dismissedRef.current) {
        void searchGifs(cleanQuery, reloadTick > 0);
      }
    }, GIPHY_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [query, reloadTick, searchGifs, hideBar]);

  // Half-screen drawer debounced search
  useEffect(() => {
    if (!isDrawerOpen) return;
    if (drawerDebounceRef.current) {
      clearTimeout(drawerDebounceRef.current);
    }
    drawerDebounceRef.current = setTimeout(() => {
      void searchDrawerGifs(drawerQuery);
    }, 260);
    return () => {
      if (drawerDebounceRef.current) {
        clearTimeout(drawerDebounceRef.current);
        drawerDebounceRef.current = null;
      }
    };
  }, [drawerQuery, isDrawerOpen, searchDrawerGifs]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (drawerDebounceRef.current) clearTimeout(drawerDebounceRef.current);
      if (abortRef.current) abortRef.current.abort();
      if (drawerAbortRef.current) drawerAbortRef.current.abort();
    };
  }, []);

  const handleOpenDrawer = () => {
    const initial = String(query || '').trim();
    setDrawerQuery(initial);
    setDrawerTranslated(activeTranslatedQuery || (initial ? translateUzbekToGiphyQuery(initial) : 'trending'));
    if (gifs.length > 0 && initial) {
      setDrawerGifs(gifs);
    }
    setIsDrawerOpen(true);
    void searchDrawerGifs(initial);
  };

  const handlePickGif = (gif: GiphyGifItem) => {
    dismissedRef.current = true;
    hideBar();
    closeDrawer();
    onSelectGif(gif);
  };

  const trimmedQuery = String(query || '').trim();
  const previewGifs = gifs.slice(0, GIF_BAR_MAX_ITEMS);

  return (
    <>
      <div
        data-testid="chat-gif-bar"
        style={{ display: isVisible ? 'flex' : 'none' }}
        aria-hidden={!isVisible}
        className="w-full mb-2 items-center gap-2 overflow-hidden"
      >
        <div className="shrink-0 flex flex-col justify-center pr-1 select-none">
          <span className="text-[11px] font-bold tracking-wide text-rose-400 leading-none">
            GIF
          </span>
          <span
            data-testid="chat-gif-translated-label"
            className="text-[10px] text-zinc-400 mt-0.5 max-w-[62px] truncate leading-none"
            title={activeTranslatedQuery || trimmedQuery}
          >
            {activeTranslatedQuery || trimmedQuery}
          </span>
        </div>

        <div
          data-testid="chat-gif-scroll"
          className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto flex-nowrap py-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {isLoading ? (
            Array.from({ length: GIF_BAR_MAX_ITEMS }).map((_, idx) => (
              <div
                key={`gif-skel-${idx}`}
                className="h-14 w-20 rounded-xl bg-white/[0.06] border border-white/[0.06] shrink-0 animate-pulse"
              />
            ))
          ) : errorMsg ? (
            <div className="flex items-center gap-2.5 h-14 px-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-400 shrink-0">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setReloadTick((t) => t + 1)}
                className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 font-semibold cursor-pointer py-1 px-1.5 rounded-lg hover:bg-white/[0.05] transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Qayta urinish</span>
              </button>
            </div>
          ) : previewGifs.length === 0 ? (
            <div className="flex items-center h-14 px-3 text-xs text-zinc-400 whitespace-nowrap">
              {trimmedQuery ? `«${trimmedQuery}» bo'yicha GIF topilmadi` : 'GIF topilmadi'}
            </div>
          ) : (
            previewGifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                disabled={disabled}
                data-testid={`gif-bar-item-${gif.id}`}
                aria-label={`GIF yuborish: ${gif.title || 'GIF'}`}
                title={gif.title || 'GIF yuborish'}
                onClick={() => handlePickGif(gif)}
                className="h-14 min-w-[56px] max-w-[120px] rounded-xl overflow-hidden shrink-0 bg-[#181B29] border border-white/[0.1] hover:border-rose-400/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <img
                  src={gif.previewUrl}
                  alt={gif.title || 'GIF'}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-auto min-w-[56px] max-w-[120px] object-cover pointer-events-none block"
                />
              </button>
            ))
          )}
        </div>

        {/* '>' Button at the end of the GIF bar to open half-screen GIF grid */}
        <button
          type="button"
          onClick={handleOpenDrawer}
          data-testid="gif-bar-expand-btn"
          aria-label="Barcha GIFlarni yarim oynada ko'rish"
          title="Barcha GIFlar"
          className="h-14 min-w-[44px] rounded-xl shrink-0 bg-white/[0.07] hover:bg-rose-500/20 border border-white/[0.12] hover:border-rose-400/60 text-zinc-200 hover:text-white flex items-center justify-center transition active:scale-95 cursor-pointer"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Half-Screen GIF Drawer Modal (50dvh) */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs"
          data-testid="gif-halfscreen-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDrawer();
          }}
        >
          <div
            data-testid="gif-halfscreen-drawer"
            className="w-full max-w-[1060px] mx-auto h-[50dvh] min-h-[300px] max-h-[65dvh] bg-[#11131C] border-t border-white/15 rounded-t-[26px] shadow-[0_-20px_60px_rgba(0,0,0,0.75)] flex flex-col overflow-hidden"
          >
            <div className="shrink-0 px-4 pt-3 pb-2.5 border-b border-white/[0.08] flex items-center gap-2.5">
              <span className="text-xs font-extrabold tracking-wide text-rose-400 shrink-0">GIF</span>
              <div className="flex-1 relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={drawerQuery}
                  onChange={(e) => setDrawerQuery(e.target.value)}
                  data-testid="gif-drawer-search-input"
                  placeholder="GIF qidirish (o'zbekcha yoki inglizcha)..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#181B29] border border-white/[0.1] text-[16px] sm:text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-rose-500"
                />
              </div>
              {drawerTranslated && (
                <span className="hidden sm:inline-block text-[10px] font-semibold text-zinc-400 bg-white/[0.05] px-2 py-1 rounded-lg border border-white/[0.08] shrink-0">
                  {drawerTranslated}
                </span>
              )}
              <button
                type="button"
                onClick={closeDrawer}
                data-testid="gif-drawer-close-btn"
                aria-label="Yopish"
                className="min-w-[44px] min-h-[44px] rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              data-testid="gif-drawer-grid-scroll"
              className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y p-3"
            >
              {drawerLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {Array.from({ length: 12 }).map((_, idx) => (
                    <div
                      key={`drawer-skel-${idx}`}
                      className="aspect-[4/3] rounded-xl bg-white/[0.06] animate-pulse"
                    />
                  ))}
                </div>
              ) : drawerError ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-zinc-400">
                  <span>{drawerError}</span>
                  <button
                    type="button"
                    onClick={() => void searchDrawerGifs(drawerQuery)}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-300 font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Qayta urinish</span>
                  </button>
                </div>
              ) : drawerGifs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                  Mos GIFlar topilmadi
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {drawerGifs.map((gif) => (
                    <button
                      key={gif.id}
                      type="button"
                      disabled={disabled}
                      data-testid={`gif-drawer-item-${gif.id}`}
                      aria-label={`GIF yuborish: ${gif.title || 'GIF'}`}
                      onClick={() => handlePickGif(gif)}
                      className="aspect-[4/3] rounded-xl overflow-hidden bg-[#181B29] border border-white/[0.08] hover:border-rose-400/80 transition active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <img
                        src={gif.previewUrl}
                        alt={gif.title || 'GIF'}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover block pointer-events-none"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
