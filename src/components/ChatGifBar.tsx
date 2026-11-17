import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  fetchGiphyGifs,
  GIPHY_DEBOUNCE_MS,
  GIPHY_PUBLIC_API_KEY,
  GiphyGifItem,
  translateUzbekToGiphyQuery,
} from '../utils/giphy';

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

  const queryCacheRef = useRef<Map<string, GiphyGifItem[]>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

      const cacheKey = translated.toLowerCase();
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

  // Explicitly hide when parent sends a message or resets chat
  useEffect(() => {
    if (hideTrigger !== lastHideTriggerRef.current) {
      lastHideTriggerRef.current = hideTrigger;
      dismissedRef.current = true;
      hideBar();
      setGifs([]);
      setActiveTranslatedQuery('');
    }
  }, [hideTrigger, hideBar]);

  // Debounced Giphy /v1/gifs/search when user stops typing; hidden when input is empty
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

    // If user just clicked Send in the same tick while query hadn't emptied yet, keep hidden
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

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const trimmedQuery = String(query || '').trim();

  return (
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
          Array.from({ length: 6 }).map((_, idx) => (
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
        ) : gifs.length === 0 ? (
          <div className="flex items-center h-14 px-3 text-xs text-zinc-400 whitespace-nowrap">
            {trimmedQuery ? `«${trimmedQuery}» bo'yicha GIF topilmadi` : 'GIF topilmadi'}
          </div>
        ) : (
          gifs.map((gif) => (
            <button
              key={gif.id}
              type="button"
              disabled={disabled}
              data-testid={`gif-bar-item-${gif.id}`}
              aria-label={`GIF yuborish: ${gif.title || 'GIF'}`}
              title={gif.title || 'GIF yuborish'}
              onClick={() => {
                dismissedRef.current = true;
                hideBar();
                onSelectGif(gif);
              }}
              className="h-14 min-w-[56px] max-w-[128px] rounded-xl overflow-hidden shrink-0 bg-[#181B29] border border-white/[0.1] hover:border-rose-400/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <img
                src={gif.previewUrl}
                alt={gif.title || 'GIF'}
                loading="lazy"
                decoding="async"
                className="h-full w-auto min-w-[56px] max-w-[128px] object-cover pointer-events-none block"
              />
            </button>
          ))
        )}
      </div>
    </div>
  );
};
