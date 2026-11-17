import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  fetchGiphyGifs,
  GIPHY_DEBOUNCE_MS,
  GIPHY_PUBLIC_API_KEY,
  GiphyGifItem,
} from '../utils/giphy';

export interface ChatGifBarProps {
  query: string;
  apiOrigin?: string;
  disabled?: boolean;
  onSelectGif: (gif: GiphyGifItem) => void;
}

export const ChatGifBar: React.FC<ChatGifBarProps> = ({
  query,
  apiOrigin,
  disabled = false,
  onSelectGif,
}) => {
  const [gifs, setGifs] = useState<GiphyGifItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [activeMode, setActiveMode] = useState<'trending' | 'search'>('trending');
  const [reloadTick, setReloadTick] = useState(0);

  const trendingCacheRef = useRef<GiphyGifItem[] | null>(null);
  const queryCacheRef = useRef<Map<string, GiphyGifItem[]>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const hasLoadedInitialRef = useRef(false);

  const resolvedApiKey =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GIPHY_API_KEY) ||
    GIPHY_PUBLIC_API_KEY;

  const loadGifs = useCallback(
    async (rawQuery: string, forceRefresh = false) => {
      const cleanQuery = String(rawQuery || '').trim();
      const mode: 'trending' | 'search' = cleanQuery ? 'search' : 'trending';

      if (!forceRefresh) {
        if (!cleanQuery && trendingCacheRef.current && trendingCacheRef.current.length > 0) {
          setGifs(trendingCacheRef.current);
          setActiveMode('trending');
          setErrorMsg('');
          setIsLoading(false);
          return;
        }
        if (cleanQuery) {
          const cached = queryCacheRef.current.get(cleanQuery.toLowerCase());
          if (cached) {
            setGifs(cached);
            setActiveMode('search');
            setErrorMsg('');
            setIsLoading(false);
            return;
          }
        }
      }

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setErrorMsg('');
      setActiveMode(mode);

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
          setActiveMode(result.mode);
          setErrorMsg('');
          if (result.mode === 'trending' && result.gifs.length > 0) {
            trendingCacheRef.current = result.gifs;
          } else if (result.mode === 'search' && result.query) {
            queryCacheRef.current.set(result.query.toLowerCase(), result.gifs);
          }
        } else {
          setGifs([]);
          setErrorMsg(
            result.status === 401 || result.status === 403
              ? 'Giphy API kaliti cheklangan'
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
    [apiOrigin, resolvedApiKey]
  );

  useEffect(() => {
    const cleanQuery = String(query || '').trim();

    if (!cleanQuery) {
      hasLoadedInitialRef.current = true;
      void loadGifs('', reloadTick > 0);
      return;
    }
    hasLoadedInitialRef.current = true;

    const timer = setTimeout(() => {
      void loadGifs(cleanQuery, reloadTick > 0);
    }, GIPHY_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [query, reloadTick, loadGifs]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const trimmedQuery = String(query || '').trim();

  return (
    <div
      data-testid="chat-gif-bar"
      className="w-full mb-2 flex items-center gap-2 overflow-hidden"
    >
      <div className="shrink-0 flex flex-col justify-center pr-1 select-none">
        <span className="text-[11px] font-bold tracking-wide text-rose-400 leading-none">
          GIF
        </span>
        <span className="text-[10px] text-zinc-400 mt-0.5 max-w-[54px] truncate leading-none">
          {activeMode === 'search' && trimmedQuery ? trimmedQuery : 'Trend'}
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
            {trimmedQuery ? `«${trimmedQuery}» bo'yicha GIF topilmadi` : 'Hozircha GIFlar topilmadi'}
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
              onClick={() => onSelectGif(gif)}
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
