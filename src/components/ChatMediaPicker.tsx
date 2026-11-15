import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';

export type ChatMediaKind = 'image' | 'video' | 'audio';

export interface StagedChatMedia {
  file: File;
  kind: ChatMediaKind;
  previewUrl: string;
  sizeLabel: string;
}

export interface ChatMediaPickerProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  onSendMedia: (file: File, kind: ChatMediaKind, caption?: string) => Promise<void> | void;
  isUploading?: boolean;
}

export function formatBytesCompact(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function detectChatMediaKind(file: File): ChatMediaKind {
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v|3gp|mkv)$/i.test(name)) return 'video';
  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(name)) return 'audio';
  return 'image';
}

export const ChatMediaPicker: React.FC<ChatMediaPickerProps> = ({
  isOpen,
  onToggleOpen,
  onSendMedia,
  isUploading = false,
}) => {
  const [staged, setStaged] = useState<StagedChatMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const activeKindRef = useRef<ChatMediaKind>('image');

  const revokeCurrentPreview = (item: StagedChatMedia | null) => {
    if (item?.previewUrl) {
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

  const stageFile = (file: File, forcedKind?: ChatMediaKind) => {
    const kind = forcedKind || detectChatMediaKind(file);
    const previewUrl = URL.createObjectURL(file);
    setStaged((prev) => {
      revokeCurrentPreview(prev);
      return {
        file,
        kind,
        previewUrl,
        sizeLabel: formatBytesCompact(file.size),
      };
    });
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
    const { file, kind } = staged;
    const msgCaption = caption.trim();
    await onSendMedia(file, kind, msgCaption);
    handleClear();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      stageFile(file);
    }
  };

  return (
    <div className="w-full" data-testid="chat-media-picker-root">
      {/* Hidden dedicated inputs for quick category launch */}
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

      {/* Instant Preview Panel (shown immediately whenever a file is selected before sending) */}
      {staged && (
        <div
          data-testid="chat-media-instant-preview"
          className="mb-3 rounded-2xl bg-[#181A22] border border-white/15 p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                <Sparkles className="w-3 h-3" />
                {staged.kind === 'image' ? 'Rasm' : staged.kind === 'video' ? 'Video' : 'Audio'}
              </span>
              <span className="text-xs font-semibold text-zinc-200 truncate" title={staged.file.name}>
                {staged.file.name}
              </span>
              <span className="text-[11px] font-mono text-zinc-400 shrink-0">({staged.sizeLabel})</span>
            </div>
            <button
              type="button"
              onClick={handleClear}
              data-testid="media-preview-close"
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-zinc-400 hover:text-white transition"
              title="Bekor qilish"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Live Blob URL Preview */}
          <div className="rounded-xl overflow-hidden bg-[#0E1016] border border-white/10 flex items-center justify-center max-h-60">
            {staged.kind === 'image' && (
              <img
                src={staged.previewUrl}
                alt={staged.file.name}
                data-testid="media-preview-img"
                className="max-h-56 w-auto max-w-full object-contain"
              />
            )}
            {staged.kind === 'video' && (
              <video
                src={staged.previewUrl}
                controls
                playsInline
                data-testid="media-preview-video"
                className="max-h-56 w-full object-contain bg-black"
              />
            )}
            {staged.kind === 'audio' && (
              <div className="w-full p-4 flex flex-col gap-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center text-white shadow-lg shrink-0">
                    <FileAudio className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{staged.file.name}</p>
                    <p className="text-[11px] text-zinc-400">Yuborishdan oldin eshitib ko'ring • {staged.sizeLabel}</p>
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

          {/* Optional Caption + Replace / Delete / Send Controls */}
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
                className="px-3 py-2 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Almashtirish</span>
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={isUploading}
                data-testid="media-preview-delete"
                className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>O'chirish</span>
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={isUploading}
                data-testid="media-preview-send"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:brightness-110 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-rose-900/40 transition active:scale-95 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isUploading ? 'Yuklanmoqda...' : 'Yuborish'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Designed Dark Media Drawer (no boring unstyled file dialog confusion) */}
      {isOpen && !staged && (
        <div
          data-testid="chat-media-tray"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`mb-3 rounded-2xl p-3 border transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${
            isDragging
              ? 'bg-rose-950/40 border-rose-500 shadow-lg shadow-rose-900/30'
              : 'bg-[#161821] border-white/12 shadow-xl'
          }`}
        >
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-bold text-zinc-100">Tezkor Media Tanlash (Darhol ko'rish)</span>
            </div>
            <button
              type="button"
              onClick={onToggleOpen}
              className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition"
              title="Yopish"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => handleTriggerPick('image')}
              data-testid="pick-media-image"
              className="group flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[#1E212E] hover:bg-[#25293A] border border-white/10 hover:border-rose-500/50 transition active:scale-95"
            >
              <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center group-hover:scale-110 transition">
                <ImageIcon className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-zinc-100">Rasm</span>
              <span className="text-[10px] text-zinc-400">Galereyadan</span>
            </button>

            <button
              type="button"
              onClick={() => handleTriggerPick('video')}
              data-testid="pick-media-video"
              className="group flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[#1E212E] hover:bg-[#25293A] border border-white/10 hover:border-cyan-500/50 transition active:scale-95"
            >
              <div className="w-10 h-10 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition">
                <VideoIcon className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-zinc-100">Video</span>
              <span className="text-[10px] text-zinc-400">MP4 / Reels</span>
            </button>

            <button
              type="button"
              onClick={() => handleTriggerPick('audio')}
              data-testid="pick-media-audio"
              className="group flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[#1E212E] hover:bg-[#25293A] border border-white/10 hover:border-amber-500/50 transition active:scale-95"
            >
              <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition">
                <Music className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-zinc-100">Audio</span>
              <span className="text-[10px] text-zinc-400">Musiqa / MP3</span>
            </button>
          </div>

          <p className="mt-2 text-[11px] text-zinc-400 text-center">
            Tanlangan fayl yuborilishidan oldin shu yerda ko'rinadi — o'chirish yoki almashtirish mumkin.
          </p>
        </div>
      )}
    </div>
  );
};
