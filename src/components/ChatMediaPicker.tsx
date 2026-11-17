import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Music,
  Send,
  Trash2,
  RefreshCw,
  UploadCloud,
  X,
  FileAudio,
  Sparkles,
  FolderOpen,
  Coins,
  Play,
  ShieldCheck,
} from 'lucide-react';
import {
  checkDirectoryHandlePermission,
  inferGalleryMediaKind,
  isFileSystemDirectoryPickerSupported,
  loadInAppSavedMediaItems,
  loadSavedDirectoryHandle,
  readMediaFromDirectoryHandle,
  saveDirectoryHandle,
  saveFilesToInAppLibrary,
  type InAppGalleryItem,
} from '../utils/localMediaGallery';
import { MEDIA_FILE_COIN_COST, MESSAGE_COIN_COST } from '../utils/tokenomics';

export type ChatMediaKind = 'image' | 'video' | 'audio';

export interface StagedChatMedia {
  file?: File;
  remoteUrl?: string;
  fileName: string;
  kind: ChatMediaKind;
  previewUrl: string;
  sizeLabel: string;
  isObjectUrl: boolean;
}

export interface ChatMediaPickerProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  onSendMedia: (
    payload: { file?: File; remoteUrl?: string; fileName?: string },
    kind: ChatMediaKind,
    caption?: string
  ) => Promise<void> | void;
  isUploading?: boolean;
  apiOrigin?: string;
  currentUserUid?: string;
  showPrices?: boolean;
}

export function formatBytesCompact(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function detectChatMediaKind(file: File): ChatMediaKind {
  return inferGalleryMediaKind(file.type, file.name) || 'image';
}

const GalleryThumb: React.FC<{
  item: InAppGalleryItem;
  onSelect: (item: InAppGalleryItem) => void;
}> = ({ item, onSelect }) => {
  const [thumbUrl, setThumbUrl] = useState<string>(item.remoteUrl || '');

  useEffect(() => {
    if (item.remoteUrl) {
      setThumbUrl(item.remoteUrl);
      return;
    }
    if (!item.file) return;
    const objUrl = URL.createObjectURL(item.file);
    setThumbUrl(objUrl);
    return () => {
      try {
        URL.revokeObjectURL(objUrl);
      } catch {}
    };
  }, [item.file, item.remoteUrl]);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      data-testid={`inapp-gallery-item-${item.kind}`}
      title={item.name}
      className="group relative aspect-square rounded-xl overflow-hidden bg-[#1D2030] border border-white/[0.1] hover:border-rose-400/80 transition active:scale-95 cursor-pointer flex items-center justify-center"
    >
      {item.kind === 'image' && thumbUrl ? (
        <img
          src={thumbUrl}
          alt={item.name}
          loading="lazy"
          className="w-full h-full object-cover block"
        />
      ) : item.kind === 'video' && thumbUrl ? (
        <>
          <video
            src={thumbUrl}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover block pointer-events-none"
          />
          <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
            <span className="w-7 h-7 rounded-full bg-black/65 border border-white/25 flex items-center justify-center text-white">
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            </span>
          </div>
        </>
      ) : (
        <div className="w-full h-full p-2 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-amber-500/15 to-[#171925]">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center">
            <Music className="w-4 h-4" />
          </div>
          <span className="text-[9.5px] font-semibold text-zinc-200 line-clamp-2 text-center leading-tight px-0.5">
            {item.name}
          </span>
        </div>
      )}

      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/65 text-[8.5px] font-bold text-white/90 uppercase tracking-wide backdrop-blur-xs">
        {item.kind === 'image' ? 'Rasm' : item.kind === 'video' ? 'Video' : 'Audio'}
      </span>
    </button>
  );
};

export const ChatMediaPicker: React.FC<ChatMediaPickerProps> = ({
  isOpen,
  onToggleOpen,
  onSendMedia,
  isUploading = false,
  apiOrigin = '',
  currentUserUid = '',
  showPrices = true,
}) => {
  const [staged, setStaged] = useState<StagedChatMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const [galleryItems, setGalleryItems] = useState<InAppGalleryItem[]>([]);
  const [galleryTab, setGalleryTab] = useState<'all' | ChatMediaKind>('all');
  const [dirPermission, setDirPermission] = useState<'unknown' | 'granted' | 'prompt' | 'denied'>('unknown');
  const [savedHandle, setSavedHandle] = useState<any | null>(null);
  const [isScanningGallery, setIsScanningGallery] = useState(false);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const folderFallbackInputRef = useRef<HTMLInputElement | null>(null);
  const multiLibraryInputRef = useRef<HTMLInputElement | null>(null);
  const activeKindRef = useRef<ChatMediaKind>('image');

  const revokeCurrentPreview = (item: StagedChatMedia | null) => {
    if (item?.isObjectUrl && item?.previewUrl) {
      try {
        URL.revokeObjectURL(item.previewUrl);
      } catch {}
    }
  };

  useEffect(() => {
    return () => {
      revokeCurrentPreview(staged);
    };
  }, [staged]);

  const refreshInAppGallery = useCallback(async () => {
    setIsScanningGallery(true);
    try {
      const merged = new Map<string, InAppGalleryItem>();

      // 1. Persisted Folder Handle (File System Access API)
      const handle = await loadSavedDirectoryHandle();
      setSavedHandle(handle);
      if (handle) {
        const perm = await checkDirectoryHandlePermission(handle, false);
        setDirPermission(perm);
        if (perm === 'granted') {
          const dirItems = await readMediaFromDirectoryHandle(handle, 72, 2);
          dirItems.forEach((it) => merged.set(it.id, it));
        }
      } else {
        setDirPermission('unknown');
      }

      // 2. IndexedDB Cached Device Media
      const savedItems = await loadInAppSavedMediaItems(60);
      savedItems.forEach((it) => {
        if (!merged.has(it.id)) merged.set(it.id, it);
      });

      // 3. Account's Previously Uploaded Platform Media
      if (currentUserUid && apiOrigin) {
        try {
          const res = await fetch(
            `${apiOrigin.replace(/\/+$/, '')}/api/posts?authorUid=${encodeURIComponent(
              currentUserUid
            )}&viewerUid=${encodeURIComponent(currentUserUid)}`
          );
          const data = await res.json().catch(() => null);
          if (res.ok && data?.success && Array.isArray(data.posts)) {
            for (const p of data.posts) {
              const rawUrl = String(p?.mediaUrl || '').trim();
              if (!rawUrl || rawUrl.startsWith('data:')) continue;
              const resolvedUrl = rawUrl.startsWith('/') ? `${apiOrigin.replace(/\/+$/, '')}${rawUrl}` : rawUrl;
              const postKind: ChatMediaKind =
                p.type === 'video' ? 'video' : p.type === 'music' ? 'audio' : 'image';
              const id = `acct_${p.id}`;
              if (!merged.has(id)) {
                merged.set(id, {
                  id,
                  name: String(p.caption || p.musicTitle || (postKind === 'video' ? 'Video' : postKind === 'audio' ? 'Audio' : 'Rasm')).slice(0, 48),
                  kind: postKind,
                  size: 0,
                  lastModified: new Date(p.createdAt || 0).getTime() || 0,
                  mimeType: '',
                  remoteUrl: resolvedUrl,
                  source: 'account',
                });
              }
            }
          }
        } catch {}
      }

      setGalleryItems(Array.from(merged.values()));
    } finally {
      setIsScanningGallery(false);
    }
  }, [apiOrigin, currentUserUid]);

  useEffect(() => {
    if (isOpen && !staged) {
      void refreshInAppGallery();
    }
  }, [isOpen, staged, refreshInAppGallery]);

  const stageFile = (file: File, forcedKind?: ChatMediaKind) => {
    const kind = forcedKind || detectChatMediaKind(file);
    const previewUrl = URL.createObjectURL(file);
    void saveFilesToInAppLibrary([file]);
    setStaged((prev) => {
      revokeCurrentPreview(prev);
      return {
        file,
        fileName: file.name,
        kind,
        previewUrl,
        sizeLabel: formatBytesCompact(file.size),
        isObjectUrl: true,
      };
    });
  };

  const stageGalleryItem = (item: InAppGalleryItem) => {
    if (item.file) {
      stageFile(item.file, item.kind);
      return;
    }
    if (item.remoteUrl) {
      setStaged((prev) => {
        revokeCurrentPreview(prev);
        return {
          remoteUrl: item.remoteUrl,
          fileName: item.name,
          kind: item.kind,
          previewUrl: item.remoteUrl!,
          sizeLabel: item.size ? formatBytesCompact(item.size) : 'Platforma',
          isObjectUrl: false,
        };
      });
    }
  };

  const handleGrantGalleryAccess = async () => {
    if (isFileSystemDirectoryPickerSupported()) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
        await saveDirectoryHandle(dirHandle);
        setSavedHandle(dirHandle);
        setDirPermission('granted');
        await refreshInAppGallery();
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        // SecurityError inside cross-origin iframe or unsupported fallback -> fall through to webkitdirectory/multi-file
      }
    }
    // Fallback: folder scan input or multi-file library import
    if (folderFallbackInputRef.current) {
      folderFallbackInputRef.current.click();
    } else {
      multiLibraryInputRef.current?.click();
    }
  };

  const handleReauthorizeSavedFolder = async () => {
    if (!savedHandle) {
      await handleGrantGalleryAccess();
      return;
    }
    const perm = await checkDirectoryHandlePermission(savedHandle, true);
    setDirPermission(perm);
    if (perm === 'granted') {
      await refreshInAppGallery();
    }
  };

  const handleBulkLibraryImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (list.length === 0) return;
    setIsScanningGallery(true);
    try {
      await saveFilesToInAppLibrary(list.slice(0, 60));
      await refreshInAppGallery();
    } finally {
      setIsScanningGallery(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, kind: ChatMediaKind) => {
    const file = e.target.files?.[0];
    if (file) {
      stageFile(file, kind);
    }
    e.target.value = '';
  };

  const handleTriggerPick = (kind: ChatMediaKind) => {
    activeKindRef.current = kind;
    if (kind === 'image') imageInputRef.current?.click();
    else if (kind === 'video') videoInputRef.current?.click();
    else audioInputRef.current?.click();
  };

  const handleClear = () => {
    revokeCurrentPreview(staged);
    setStaged(null);
    setCaption('');
  };

  const handleReplace = () => {
    const kind = staged?.kind || activeKindRef.current || 'image';
    handleTriggerPick(kind);
  };

  const handleSend = async () => {
    if (!staged || isUploading) return;
    const { file, remoteUrl, fileName, kind } = staged;
    const msgCaption = caption.trim();
    await onSendMedia({ file, remoteUrl, fileName }, kind, msgCaption);
    handleClear();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length > 1) {
      void saveFilesToInAppLibrary(files).then(() => refreshInAppGallery());
    }
    if (files[0]) {
      stageFile(files[0]);
    }
  };

  const filteredGallery = useMemo(() => {
    if (galleryTab === 'all') return galleryItems;
    return galleryItems.filter((it) => it.kind === galleryTab);
  }, [galleryItems, galleryTab]);

  const stagedCoinCost =
    staged?.kind === 'video' || staged?.kind === 'audio' ? MEDIA_FILE_COIN_COST : MESSAGE_COIN_COST;

  return (
    <div className="w-full" data-testid="chat-media-picker-root">
      {/* Hidden quick inputs + folder scan fallback */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="media-input-image"
        onChange={(e) => handleInputChange(e, 'image')}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        data-testid="media-input-video"
        onChange={(e) => handleInputChange(e, 'video')}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
        className="hidden"
        data-testid="media-input-audio"
        onChange={(e) => handleInputChange(e, 'audio')}
      />
      <input
        ref={folderFallbackInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is supported on Chromium/WebKit browsers
        webkitdirectory=""
        accept="image/*,video/*,audio/*"
        className="hidden"
        data-testid="media-input-folder-scan"
        onChange={(e) => void handleBulkLibraryImport(e)}
      />
      <input
        ref={multiLibraryInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="hidden"
        data-testid="media-input-multi-import"
        onChange={(e) => void handleBulkLibraryImport(e)}
      />

      {/* Instant Preview Panel */}
      {staged && (
        <div
          data-testid="chat-media-instant-preview"
          className="mb-3 rounded-2xl bg-[#181A22] border border-white/15 p-3 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                <Sparkles className="w-3 h-3" />
                {staged.kind === 'image' ? 'Rasm' : staged.kind === 'video' ? 'Video' : 'Audio'}
              </span>
              {showPrices && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25 shrink-0">
                  <Coins className="w-3 h-3" />
                  {stagedCoinCost}
                </span>
              )}
              <span className="text-xs font-semibold text-zinc-200 truncate" title={staged.fileName}>
                {staged.fileName}
              </span>
              <span className="text-[11px] font-mono text-zinc-400 shrink-0">({staged.sizeLabel})</span>
            </div>
            <button
              type="button"
              onClick={handleClear}
              data-testid="media-preview-close"
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition cursor-pointer"
              title="Bekor qilish"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="rounded-xl overflow-hidden bg-[#0E1016] border border-white/10 flex items-center justify-center max-h-56">
            {staged.kind === 'image' && (
              <img
                src={staged.previewUrl}
                alt={staged.fileName}
                data-testid="media-preview-img"
                className="max-h-52 w-auto max-w-full object-contain"
              />
            )}
            {staged.kind === 'video' && (
              <video
                src={staged.previewUrl}
                controls
                playsInline
                data-testid="media-preview-video"
                className="max-h-52 w-full object-contain bg-black"
              />
            )}
            {staged.kind === 'audio' && (
              <div className="w-full p-4 flex flex-col gap-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center text-white shadow-lg shrink-0">
                    <FileAudio className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{staged.fileName}</p>
                    <p className="text-[11px] text-zinc-400">
                      Yuborishdan oldin eshitib ko&apos;ring • {staged.sizeLabel}
                    </p>
                  </div>
                </div>
                <audio
                  src={staged.previewUrl}
                  controls
                  data-testid="media-preview-audio"
                  className="w-full h-10"
                />
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Izoh qo'shish (ixtiyoriy)..."
              className="flex-1 bg-[#101219] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-rose-500/60"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={handleReplace}
                disabled={isUploading}
                data-testid="media-preview-replace"
                className="px-3 py-2 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Almashtirish</span>
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={isUploading}
                data-testid="media-preview-delete"
                className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>O&apos;chirish</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={isUploading}
                data-testid="media-preview-send"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:brightness-110 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-rose-900/40 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isUploading ? 'Yuklanmoqda...' : 'Yuborish'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App Media Gallery & Quick Upload Drawer */}
      {isOpen && !staged && (
        <div
          data-testid="chat-media-tray"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`mb-2.5 rounded-2xl p-3 border transition-all ${
            isDragging
              ? 'bg-rose-950/40 border-rose-500 shadow-lg shadow-rose-900/30'
              : 'bg-[#141620] border-white/12 shadow-xl'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <UploadCloud className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-xs font-bold text-zinc-100 truncate">
                Platforma ichidagi Galereya va Fayllar
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => void handleGrantGalleryAccess()}
                data-testid="grant-inapp-gallery-btn"
                className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 text-[10.5px] font-bold flex items-center gap-1 transition cursor-pointer"
              >
                <FolderOpen className="w-3 h-3" />
                <span>Galereyaga ruxsat</span>
              </button>
              <button
                type="button"
                onClick={onToggleOpen}
                className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
                title="Yopish"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Prompt re-grant if user previously connected a folder */}
          {dirPermission === 'prompt' && savedHandle && (
            <button
              type="button"
              onClick={() => void handleReauthorizeSavedFolder()}
              className="w-full mb-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Ruxsat berilgan papkadagi barcha rasm/videolarni ochish</span>
            </button>
          )}

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-0.5">
            {(
              [
                { id: 'all', label: `Barchasi (${galleryItems.length})` },
                { id: 'image', label: 'Rasmlar' },
                { id: 'video', label: 'Videolar' },
                { id: 'audio', label: 'Audio' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setGalleryTab(t.id)}
                className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold whitespace-nowrap transition cursor-pointer ${
                  galleryTab === t.id
                    ? 'bg-rose-600 text-white'
                    : 'bg-white/[0.05] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.1]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* In-App Browsable Media Grid */}
          {isScanningGallery ? (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-44 overflow-hidden mb-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={`gskel-${i}`} className="aspect-square rounded-xl bg-white/[0.06] animate-pulse" />
              ))}
            </div>
          ) : filteredGallery.length > 0 ? (
            <div
              data-testid="inapp-gallery-grid"
              className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 max-h-44 overflow-y-auto overscroll-y-contain touch-pan-y mb-2.5 pr-0.5"
            >
              {filteredGallery.map((item) => (
                <GalleryThumb key={item.id} item={item} onSelect={stageGalleryItem} />
              ))}
            </div>
          ) : (
            <div className="mb-2.5 rounded-xl bg-[#10121A] border border-dashed border-white/15 px-3 py-3 text-center">
              <p className="text-[11px] text-zinc-300 font-medium">
                Rasm, video va audio fayllaringiz shu yerda ko&apos;rinishi uchun{' '}
                <button
                  type="button"
                  onClick={() => void handleGrantGalleryAccess()}
                  className="text-rose-400 hover:text-rose-300 font-bold underline cursor-pointer"
                >
                  galereyaga ruxsat bering
                </button>{' '}
                yoki quyidan tanlang.
              </p>
            </div>
          )}

          {/* Quick Individual Category Buttons with Clear Pricing */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleTriggerPick('image')}
              data-testid="pick-media-image"
              className="group flex items-center gap-2 p-2 rounded-xl bg-[#1B1E2B] hover:bg-[#232738] border border-white/10 hover:border-rose-500/50 transition active:scale-95 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <ImageIcon className="w-4 h-4" />
              </div>
              <div className="text-left min-w-0">
                <span className="block text-[11px] font-bold text-zinc-100 leading-tight">Rasm</span>
                <span className="block text-[9.5px] text-amber-300 font-semibold">
                  {showPrices ? `${MESSAGE_COIN_COST} 🪙` : 'Galereya'}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleTriggerPick('video')}
              data-testid="pick-media-video"
              className="group flex items-center gap-2 p-2 rounded-xl bg-[#1B1E2B] hover:bg-[#232738] border border-white/10 hover:border-cyan-500/50 transition active:scale-95 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                <VideoIcon className="w-4 h-4" />
              </div>
              <div className="text-left min-w-0">
                <span className="block text-[11px] font-bold text-zinc-100 leading-tight">Video</span>
                <span className="block text-[9.5px] text-amber-300 font-semibold">
                  {showPrices ? `${MEDIA_FILE_COIN_COST} 🪙` : 'MP4'}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleTriggerPick('audio')}
              data-testid="pick-media-audio"
              className="group flex items-center gap-2 p-2 rounded-xl bg-[#1B1E2B] hover:bg-[#232738] border border-white/10 hover:border-amber-500/50 transition active:scale-95 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <Music className="w-4 h-4" />
              </div>
              <div className="text-left min-w-0">
                <span className="block text-[11px] font-bold text-zinc-100 leading-tight">Audio</span>
                <span className="block text-[9.5px] text-amber-300 font-semibold">
                  {showPrices ? `${MEDIA_FILE_COIN_COST} 🪙` : 'MP3'}
                </span>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
