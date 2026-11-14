import React, { useEffect, useRef, useState } from 'react';
import {
  Heart,
  MessageCircle,
  Send,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  Trash2,
  Play,
  Pause,
  Upload,
  X,
  ShieldCheck,
  Volume2,
  Link as LinkIcon,
  Sparkles,
  Plus,
  Camera,
  CheckCircle2,
  ExternalLink,
  Disc,
} from 'lucide-react';
import { PostItem, PostMediaType, formatPostTimeUz, validateNewPostDraft } from '../utils/posts';
import { isUserOnlineStrict } from '../utils/presence';
import {
  parseMediaLink,
  CURATED_MUSIC_CATALOG,
  parseAudioFilenameMetadata,
  MusicCatalogTrack,
} from '../utils/mediaLinks';
import { formatUsernameDisplay } from '../utils/username';

interface MusicPlayerCardProps {
  mediaUrl: string;
  title?: string;
  artist?: string;
  coverUrl?: string;
}

export const MusicPlayerCard: React.FC<MusicPlayerCardProps> = ({ mediaUrl, title, artist, coverUrl }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadError(false);
  }, [mediaUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const formatSec = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#221719] via-[#2E1F22] to-[#3B262B] text-white p-4 border border-[#C89B54]/30 shadow-md">
      <audio
        ref={audioRef}
        src={mediaUrl}
        preload="metadata"
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => setIsPlaying(false)}
        onError={() => setLoadError(true)}
      />
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pauza' : 'Ijro etish'}
          className="relative w-14 h-14 rounded-2xl shrink-0 bg-[#1A1113] border border-[#C89B54]/40 flex items-center justify-center overflow-hidden group hover:border-[#C89B54] transition-all cursor-pointer"
        >
          {coverUrl ? (
            <img src={coverUrl} alt={title || 'Musiqa'} className="w-full h-full object-cover opacity-55" />
          ) : (
            <div
              className={`w-10 h-10 rounded-full border-2 border-dashed border-[#C89B54]/70 flex items-center justify-center ${
                isPlaying ? 'animate-spin' : ''
              }`}
              style={{ animationDuration: '4s' }}
            >
              <Music className="w-4 h-4 text-[#C89B54]" />
            </div>
          )}
          <span className="absolute inset-0 bg-black/35 flex items-center justify-center">
            {isPlaying ? (
              <Pause className="w-5 h-5 text-white fill-white" />
            ) : (
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            )}
          </span>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-editorial text-lg font-bold text-[#FAF4F2] truncate leading-tight">
                {title || 'Musiqiy trek'}
              </p>
              <p className="text-[11px] text-[#E4C28E] truncate flex items-center gap-1 mt-0.5">
                <Volume2 className="w-3 h-3 shrink-0" />
                {artist || 'Alov.uz Audio'}
              </p>
            </div>
            <span className="text-[11px] text-white/75 tabular-nums shrink-0">
              {formatSec(currentTime)} / {duration ? formatSec(duration) : '--:--'}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={duration || 100}
            value={duration ? currentTime : 0}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (audioRef.current && isFinite(val)) {
                audioRef.current.currentTime = val;
                setCurrentTime(val);
              }
            }}
            className="w-full mt-2.5 accent-[#C89B54] h-1.5 bg-white/15 rounded-lg cursor-pointer"
          />
          {loadError && (
            <p className="text-[10px] text-rose-300 mt-1">Audio manbasini yuklab bo'lmadi</p>
          )}
        </div>
      </div>
    </div>
  );
};

interface PostsFeedProps {
  posts: PostItem[];
  currentUser: any | null;
  usersList: any[];
  onlineUserIds: Set<string>;
  authorUid?: string;
  allowCompose?: boolean;
  onPostCreated: (post: PostItem) => void;
  onPostUpdated: (post: PostItem) => void;
  onPostDeleted: (postId: string) => void;
  onOpenProfile: (uid: string, snapshot?: any) => void;
  onOpenAuth: () => void;
  onNotify?: (msg: string) => void;
}

export const PostsFeed: React.FC<PostsFeedProps> = ({
  posts,
  currentUser,
  usersList,
  onlineUserIds,
  authorUid,
  allowCompose = true,
  onPostCreated,
  onPostUpdated,
  onPostDeleted,
  onOpenProfile,
  onOpenAuth,
  onNotify,
}) => {
  const [filterType, setFilterType] = useState<'all' | PostMediaType>('all');
  const [showComposeModal, setShowComposeModal] = useState(false);

  // Composer Form State
  const [draftType, setDraftType] = useState<PostMediaType>('photo');
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [embedUrl, setEmbedUrl] = useState('');
  const [mediaProvider, setMediaProvider] = useState<string>('direct');
  const [isVerticalVideo, setIsVerticalVideo] = useState(false);
  const [audioTitle, setAudioTitle] = useState('');
  const [audioArtist, setAudioArtist] = useState('');
  const [linkInputText, setLinkInputText] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // Comments State
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [submittingCommentId, setSubmittingCommentId] = useState<string | null>(null);

  // File Inputs
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  const visiblePosts = posts.filter((p) => {
    if (authorUid && p.authorUid !== authorUid) return false;
    if (!authorUid && filterType !== 'all' && p.type !== filterType) return false;
    return true;
  });

  const resetComposerState = () => {
    setCaption('');
    setMediaUrl('');
    setEmbedUrl('');
    setMediaProvider('direct');
    setIsVerticalVideo(false);
    setAudioTitle('');
    setAudioArtist('');
    setLinkInputText('');
    setShowLinkInput(false);
    setDraftError('');
    setSelectedPresetId(null);
  };

  const handleApplyLink = (urlToParse: string) => {
    const raw = (urlToParse || '').trim();
    if (!raw) return;
    const parsed = parseMediaLink(raw, draftType);
    setMediaUrl(parsed.normalizedUrl);
    setEmbedUrl(parsed.embedUrl || '');
    setMediaProvider(parsed.provider || 'direct');
    setIsVerticalVideo(Boolean(parsed.isVertical));

    if (parsed.detectedType && draftType !== parsed.detectedType) {
      setDraftType(parsed.detectedType);
    }

    if (draftType === 'music' && !audioTitle) {
      const meta = parseAudioFilenameMetadata(raw);
      if (meta.title) setAudioTitle(meta.title);
      if (meta.artist) setAudioArtist(meta.artist);
    }
  };

  const handleFileUpload = async (file: File | undefined, typeHint: PostMediaType) => {
    if (!file) return;
    setDraftError('');

    if (file.size > 40 * 1024 * 1024) {
      setDraftError('Fayl hajmi 40 MB dan oshmasligi kerak.');
      return;
    }

    setUploadingMedia(true);
    try {
      const res = await fetch('/api/media/upload-raw', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-file-name': encodeURIComponent(file.name || 'upload'),
        },
        body: file,
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.url) {
        setDraftError(data?.error || "Faylni yuklab bo'lmadi.");
      } else {
        setMediaUrl(data.url);
        setEmbedUrl('');
        setMediaProvider('direct');
        setIsVerticalVideo(false);

        if (typeHint === 'music') {
          const meta = parseAudioFilenameMetadata(file.name);
          if (!audioTitle && meta.title) setAudioTitle(meta.title);
          if (!audioArtist && meta.artist) setAudioArtist(meta.artist);
        }
      }
    } catch {
      setDraftError("Server bilan aloqa uzildi. Qaytadan urinib ko'ring.");
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleSelectCuratedTrack = (track: MusicCatalogTrack) => {
    setSelectedPresetId(track.id);
    setMediaUrl(track.audioUrl);
    setEmbedUrl('');
    setMediaProvider('direct');
    setAudioTitle(track.title);
    setAudioArtist(track.artist);
    setDraftError('');
  };

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setShowComposeModal(false);
      onOpenAuth();
      return;
    }
    setDraftError('');

    const check = validateNewPostDraft({
      type: draftType,
      caption,
      mediaUrl,
      audioTitle,
      audioArtist,
    });
    if (!check.valid) {
      setDraftError(check.error || "Post ma'lumotlarini tekshiring.");
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorUid: currentUser.uid,
          authorUsername: currentUser.username || '',
          type: draftType,
          caption,
          mediaUrl,
          embedUrl,
          mediaProvider,
          isVerticalVideo,
          audioTitle,
          audioArtist,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.post) {
        setDraftError(data?.error || 'Post joylanmadi.');
        return;
      }
      onPostCreated(data.post);
      resetComposerState();
      setShowComposeModal(false);
      if (onNotify) onNotify('Postingiz muvaffaqiyatli joylandi!');
    } catch {
      setDraftError('Post joylashda xatolik yuz berdi.');
    } finally {
      setPublishing(false);
    }
  };

  const handleToggleLike = async (post: PostItem) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(post.id)}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.uid }),
      });
      const data = await res.json();
      if (res.ok && data?.success && data?.post) {
        onPostUpdated(data.post);
      }
    } catch {}
  };

  const handleAddComment = async (postId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    const text = (commentInputs[postId] || '').trim();
    if (!text) return;

    setSubmittingCommentId(postId);
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(postId)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorUid: currentUser.uid,
          authorUsername: currentUser.username || '',
          text,
        }),
      });
      const data = await res.json();
      if (res.ok && data?.success && data?.post) {
        onPostUpdated(data.post);
        setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
        setExpandedComments((prev) => ({ ...prev, [postId]: true }));
      }
    } finally {
      setSubmittingCommentId(null);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(postId)}?uid=${encodeURIComponent(currentUser.uid)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        onPostDeleted(postId);
        if (onNotify) onNotify("Post o'chirildi");
      }
    } catch {}
  };

  return (
    <div className="relative space-y-5" data-testid={authorUid ? `profile-posts-${authorUid}` : 'global-posts-feed'}>
      {/* Hidden file inputs for direct device selection */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileUpload(e.target.files?.[0], 'photo')}
        className="hidden"
        data-testid="hidden-gallery-input"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleFileUpload(e.target.files?.[0], 'photo')}
        className="hidden"
        data-testid="hidden-camera-input"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={(e) => handleFileUpload(e.target.files?.[0], 'video')}
        className="hidden"
        data-testid="hidden-video-input"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a"
        onChange={(e) => handleFileUpload(e.target.files?.[0], 'music')}
        className="hidden"
        data-testid="hidden-audio-input"
      />

      {/* Floating Action Button (+) for Post Creation */}
      {allowCompose && (
        <button
          type="button"
          onClick={() => {
            if (!currentUser) {
              onOpenAuth();
              return;
            }
            setShowComposeModal(true);
          }}
          data-testid="open-compose-modal-btn"
          aria-label="Yangi post joylash"
          className="fixed bottom-20 sm:bottom-24 right-5 sm:right-8 z-40 w-14 h-14 rounded-full bg-gradient-to-tr from-[#A62433] via-[#C93545] to-[#E35465] text-white shadow-[0_10px_30px_rgba(201,53,69,0.45)] hover:shadow-[0_14px_36px_rgba(201,53,69,0.6)] flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 border-2 border-white/50 cursor-pointer group"
        >
          <Plus className="w-7 h-7 stroke-[2.5] group-hover:rotate-90 transition-transform duration-200" />
        </button>
      )}

      {/* Post Compose Modal Dialog */}
      {showComposeModal && (
        <div
          className="fixed inset-0 z-[150] bg-[#1A1113]/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setShowComposeModal(false)}
          data-testid="compose-modal-backdrop"
        >
          <div
            className="bg-[#FFFFFF] w-full max-w-xl rounded-3xl shadow-2xl border border-[#F2E8E6] overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            data-testid="post-compose-modal"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#F2E8E6] flex items-center justify-between bg-gradient-to-r from-[#FFF5F6] via-white to-[#FDFBF9]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#FDF2F3] border border-[#F2D5D9] flex items-center justify-center text-[#C93545] shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-editorial text-xl font-bold text-[#221719] leading-tight">Yangi post joylash</h3>
                  <p className="text-[11px] text-[#837275]">Rasm, universal video, musiqa yoki fikringizni ulashing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowComposeModal(false)}
                aria-label="Yopish"
                data-testid="compose-modal-close-btn"
                className="w-8 h-8 rounded-full bg-[#FAF4F2] hover:bg-[#F2E8E6] text-[#57484B] flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Scrollable Content */}
            <form onSubmit={handlePublishPost} className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Media Type Selector Tabs */}
              <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#FAF4F2] rounded-2xl border border-[#F2E8E6]">
                {[
                  { key: 'photo' as PostMediaType, label: 'Rasm', icon: ImageIcon },
                  { key: 'video' as PostMediaType, label: 'Video', icon: Video },
                  { key: 'music' as PostMediaType, label: 'Musiqa', icon: Music },
                  { key: 'text' as PostMediaType, label: 'Matn', icon: FileText },
                ].map((m) => {
                  const Icon = m.icon;
                  const active = draftType === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      data-testid={`compose-type-${m.key}`}
                      onClick={() => {
                        setDraftType(m.key);
                        setMediaUrl('');
                        setEmbedUrl('');
                        setDraftError('');
                        setShowLinkInput(false);
                      }}
                      className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        active
                          ? 'bg-[#C93545] text-white shadow-sm'
                          : 'text-[#6B5B5E] hover:text-[#221719] hover:bg-white/60'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Caption Textarea */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#6B5B5E] uppercase tracking-wider">
                  Post matni / Taassurotingiz
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={3}
                  placeholder={
                    draftType === 'music'
                      ? 'Ushbu musiqa sizga qanday kayfiyat beradi? Fikringizni yozing...'
                      : draftType === 'video'
                        ? 'Video haqida qisqacha ma\'lumot yoki eslatma yozing...'
                        : 'Bugungi kayfiyat yoki chiroyli xotirangiz bilan bo\'lishing...'
                  }
                  data-testid="post-caption-input"
                  className="w-full px-3.5 py-2.5 bg-[#FAF4F2] border border-[#F2E8E6] rounded-2xl text-sm text-[#221719] placeholder-[#837275] focus:outline-none focus:border-[#C93545] resize-none leading-relaxed"
                />
              </div>

              {/* PHOTO UPLOAD OPTIONS */}
              {draftType === 'photo' && (
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-[#6B5B5E] uppercase tracking-wider">
                    Rasm manbasi
                  </label>
                  {!mediaUrl ? (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          disabled={uploadingMedia}
                          data-testid="compose-gallery-btn"
                          className="p-3.5 rounded-2xl bg-[#FFF5F6] hover:bg-[#FDECEF] border border-[#F2D5D9] text-[#C93545] flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center group"
                        >
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-xs text-[#C93545] group-hover:scale-105 transition-transform">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-bold">Galereyadan tanlash</span>
                          <span className="text-[10px] text-[#A62433]/70">Qurilmangizdagi fotosuratlar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          disabled={uploadingMedia}
                          data-testid="compose-camera-btn"
                          className="p-3.5 rounded-2xl bg-[#FAF4F2] hover:bg-[#F2E8E6] border border-[#F2E8E6] text-[#221719] flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center group"
                        >
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-xs text-[#221719] group-hover:scale-105 transition-transform">
                            <Camera className="w-5 h-5" />
                          </div>
                          <span className="text-xs font-bold">Kamerada suratga olish</span>
                          <span className="text-[10px] text-[#6B5B5E]">Jonli lahzani oling</span>
                        </button>
                      </div>

                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setShowLinkInput((v) => !v)}
                          className="text-xs font-bold text-[#C93545] hover:underline flex items-center gap-1.5 cursor-pointer"
                        >
                          <LinkIcon className="w-3.5 h-3.5" />
                          <span>{showLinkInput ? "Havolani yashirish" : "Yoki internetdan rasm havolasi (URL) orqali"}</span>
                        </button>
                      </div>

                      {showLinkInput && (
                        <div className="flex gap-2">
                          <input
                            type="url"
                            value={linkInputText}
                            onChange={(e) => setLinkInputText(e.target.value)}
                            placeholder="https://... rasm havolasini kiriting"
                            data-testid="post-photo-link-input"
                            className="flex-1 px-3.5 py-2 bg-[#FAF4F2] border border-[#F2E8E6] rounded-xl text-xs text-[#221719] placeholder-[#837275] focus:outline-none focus:border-[#C93545]"
                          />
                          <button
                            type="button"
                            onClick={() => handleApplyLink(linkInputText)}
                            className="px-3.5 py-2 rounded-xl bg-[#221719] text-white text-xs font-bold hover:bg-[#36272A] transition cursor-pointer"
                          >
                            Tasdiqlash
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative rounded-2xl overflow-hidden border border-[#F2E8E6] bg-[#FAF4F2]">
                      <button
                        type="button"
                        onClick={() => {
                          setMediaUrl('');
                          setEmbedUrl('');
                        }}
                        aria-label="Rasmni o'chirish"
                        className="absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center transition cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <img src={mediaUrl} alt="Preview" className="w-full max-h-72 object-cover" />
                    </div>
                  )}
                </div>
              )}

              {/* VIDEO UPLOAD OPTIONS (Universal Social Media Embeds) */}
              {draftType === 'video' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-[#6B5B5E] uppercase tracking-wider">
                      Universal video havolasi yoki fayl
                    </label>
                    <span className="text-[10px] text-[#A62433] font-bold">
                      YouTube, TikTok, Reels, VK, FB
                    </span>
                  </div>

                  {!mediaUrl ? (
                    <div className="space-y-3">
                      <div className="p-3 rounded-2xl bg-[#FAF4F2] border border-[#F2E8E6] space-y-2">
                        <p className="text-xs font-bold text-[#221719] flex items-center gap-1.5">
                          <LinkIcon className="w-3.5 h-3.5 text-[#C93545]" />
                          <span>Ijtimoiy tarmoq yoki video havolasi:</span>
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="url"
                            value={linkInputText}
                            onChange={(e) => setLinkInputText(e.target.value)}
                            placeholder="https://youtube.com/shorts/..., tiktok.com/..., instagram.com/reel/..."
                            data-testid="post-video-link-input"
                            className="flex-1 px-3.5 py-2.5 bg-white border border-[#F2E8E6] rounded-xl text-xs text-[#221719] placeholder-[#837275] focus:outline-none focus:border-[#C93545]"
                          />
                          <button
                            type="button"
                            onClick={() => handleApplyLink(linkInputText)}
                            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#C93545] to-[#A62433] text-white text-xs font-bold hover:opacity-95 transition cursor-pointer"
                          >
                            Yuklash
                          </button>
                        </div>
                        <p className="text-[10.5px] text-[#837275]">
                          Cheklovsiz: YouTube (oddiy va Shorts), TikTok, Instagram (Reels va postlar), Vimeo, Rutube, VK va to'g'ridan-to'g'ri MP4 havolalari avtomatik ochiladi.
                        </p>
                      </div>

                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => videoInputRef.current?.click()}
                          disabled={uploadingMedia}
                          data-testid="compose-device-video-btn"
                          className="w-full p-3 rounded-xl bg-white hover:bg-[#FAF4F2] border border-dashed border-[#C93545]/40 text-xs font-bold text-[#C93545] flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          <Upload className="w-4 h-4" />
                          <span>{uploadingMedia ? "Video yuklanmoqda..." : "Yoki telefon/qurilmadan video fayl tanlash"}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative rounded-2xl overflow-hidden border border-[#F2E8E6] bg-black">
                      <button
                        type="button"
                        onClick={() => {
                          setMediaUrl('');
                          setEmbedUrl('');
                          setLinkInputText('');
                        }}
                        aria-label="Videoni o'chirish"
                        className="absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center transition cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>

                      {embedUrl ? (
                        <div className={`relative w-full ${isVerticalVideo ? 'aspect-[9/16] max-w-[280px] mx-auto' : 'aspect-video'}`}>
                          <iframe
                            src={embedUrl}
                            title="Video Preview"
                            className="w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <video src={mediaUrl} controls className="w-full max-h-72 object-contain" />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* MUSIC UPLOAD OPTIONS (Device + 1-Click Curated Catalog) */}
              {draftType === 'music' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-[#6B5B5E] uppercase tracking-wider">
                      Musiqa tanlash yoki yuklash
                    </label>
                    <span className="text-[10px] text-[#A62433] font-bold">1-bosishda treklar</span>
                  </div>

                  {/* Curated 1-Click Music Catalog */}
                  <div className="space-y-2">
                    <p className="text-[11px] text-[#57484B] font-semibold flex items-center gap-1.5">
                      <Disc className="w-3.5 h-3.5 text-[#C93545]" />
                      <span>Mashhur treklar (Fayl qidirish shart emas):</span>
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {CURATED_MUSIC_CATALOG.map((track) => {
                        const isSelected = selectedPresetId === track.id || mediaUrl === track.audioUrl;
                        return (
                          <button
                            key={track.id}
                            type="button"
                            onClick={() => handleSelectCuratedTrack(track)}
                            data-testid={`curated-track-${track.id}`}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                              isSelected
                                ? 'bg-[#FDF2F3] border-[#C93545] shadow-sm'
                                : 'bg-[#FAF4F2] border-[#F2E8E6] hover:border-[#C93545]/40 hover:bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-xs font-bold text-[#221719] truncate">{track.title}</p>
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[#C93545] shrink-0" />}
                            </div>
                            <p className="text-[10px] text-[#837275] truncate mt-0.5">{track.artist}</p>
                            <div className="flex items-center justify-between mt-1 text-[9px] text-[#A62433] font-bold">
                              <span>{track.genre}</span>
                              <span className="tabular-nums">{track.durationLabel}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Device Audio Upload or URL */}
                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      disabled={uploadingMedia}
                      data-testid="compose-device-audio-btn"
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#FAF4F2] border border-dashed border-[#C93545]/40 text-xs font-bold text-[#C93545] flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingMedia ? "Yuklanmoqda..." : "Qurilmadan audio tanlash"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowLinkInput((v) => !v)}
                      className="px-3 py-2 rounded-xl bg-[#FAF4F2] hover:bg-[#F2E8E6] text-xs font-semibold text-[#57484B] flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>SoundCloud / URL</span>
                    </button>
                  </div>

                  {showLinkInput && (
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={linkInputText}
                        onChange={(e) => setLinkInputText(e.target.value)}
                        placeholder="https://... musiqa / audio havolasi"
                        data-testid="post-audio-link-input"
                        className="flex-1 px-3.5 py-2 bg-[#FAF4F2] border border-[#F2E8E6] rounded-xl text-xs text-[#221719] placeholder-[#837275] focus:outline-none focus:border-[#C93545]"
                      />
                      <button
                        type="button"
                        onClick={() => handleApplyLink(linkInputText)}
                        className="px-3.5 py-2 rounded-xl bg-[#221719] text-white text-xs font-bold hover:bg-[#36272A] transition cursor-pointer"
                      >
                        Qo'shish
                      </button>
                    </div>
                  )}

                  {/* Audio Title & Artist */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] font-bold text-[#837275] block mb-1">Musiqa nomi</label>
                      <input
                        type="text"
                        value={audioTitle}
                        onChange={(e) => setAudioTitle(e.target.value)}
                        placeholder="Trek nomi (masalan: Bahor)"
                        data-testid="post-audio-title-input"
                        className="w-full px-3.5 py-2 bg-[#FAF4F2] border border-[#F2E8E6] rounded-xl text-xs text-[#221719] placeholder-[#837275] focus:outline-none focus:border-[#C93545]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#837275] block mb-1">Ijrochi ismi</label>
                      <input
                        type="text"
                        value={audioArtist}
                        onChange={(e) => setAudioArtist(e.target.value)}
                        placeholder="Ijrochi (masalan: Sevara Nazrxon)"
                        data-testid="post-audio-artist-input"
                        className="w-full px-3.5 py-2 bg-[#FAF4F2] border border-[#F2E8E6] rounded-xl text-xs text-[#221719] placeholder-[#837275] focus:outline-none focus:border-[#C93545]"
                      />
                    </div>
                  </div>

                  {/* Audio Preview Card */}
                  {mediaUrl && (
                    <div className="pt-2">
                      <p className="text-[10.5px] font-bold text-[#6B5B5E] mb-1.5">Musiqa ijrosi tekshiruvi:</p>
                      <MusicPlayerCard mediaUrl={mediaUrl} title={audioTitle} artist={audioArtist} />
                    </div>
                  )}
                </div>
              )}

              {/* Draft Error Message */}
              {draftError && (
                <p className="text-xs font-semibold text-[#C93545] bg-[#FDF2F3] px-3.5 py-2.5 rounded-2xl border border-[#F2D5D9]">
                  {draftError}
                </p>
              )}

              {/* Modal Footer Buttons */}
              <div className="pt-3 border-t border-[#F2E8E6] flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowComposeModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#FAF4F2] hover:bg-[#F2E8E6] text-xs font-bold text-[#57484B] transition cursor-pointer"
                >
                  Bekor qilish
                </button>

                <button
                  type="submit"
                  disabled={publishing || uploadingMedia}
                  data-testid="publish-post-btn"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#C93545] to-[#A62433] text-white text-xs font-bold shadow-md hover:opacity-95 transition-opacity disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{publishing ? 'Joylanmoqda...' : 'Postni joylash'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filter Tabs for Global Feed */}
      {!authorUid && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { key: 'all' as const, label: 'Barchasi' },
            { key: 'photo' as const, label: 'Rasmlar' },
            { key: 'video' as const, label: 'Videolar' },
            { key: 'music' as const, label: 'Musiqalar' },
            { key: 'text' as const, label: 'Matnlar' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterType(tab.key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 border cursor-pointer ${
                filterType === tab.key
                  ? 'bg-[#221719] text-white border-[#221719] shadow-xs'
                  : 'bg-[#FFFFFF] text-[#57484B] border-[#F2E8E6] hover:border-[#C93545]/40 hover:bg-[#FAF4F2]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Empty State */}
      {visiblePosts.length === 0 ? (
        <div className="bg-[#FFFFFF] rounded-3xl border border-[#F2E8E6] p-10 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-[#FAF4F2] text-[#C93545] flex items-center justify-center mx-auto shadow-xs">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="font-editorial text-xl font-bold text-[#221719]">Hozircha postlar yo'q</p>
          <p className="text-xs text-[#837275] max-w-sm mx-auto leading-relaxed">
            {authorUid
              ? 'Bu foydalanuvchi hali rasm, video yoki musiqa joylamagan.'
              : 'Pastdagi "+" tugmasini bosib, birinchi bo\'lib chiroyli rasm, video yoki musiqa ulashing!'}
          </p>
          {allowCompose && !authorUid && (
            <button
              type="button"
              onClick={() => {
                if (!currentUser) onOpenAuth();
                else setShowComposeModal(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#C93545] to-[#A62433] text-white text-xs font-bold shadow hover:opacity-95 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Yangi post qo'shish</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {visiblePosts.map((post) => {
            const liveAuthor =
              usersList.find((u) => u.uid === post.authorUid || (post.authorId && u.id === post.authorId)) ||
              (currentUser && (currentUser.uid === post.authorUid || currentUser.id === post.authorId) ? currentUser : null);
            const authorOnline = liveAuthor ? isUserOnlineStrict(liveAuthor, onlineUserIds) : onlineUserIds.has(post.authorUid);
            const authorAvatar =
              liveAuthor?.avatar ||
              post.authorAvatar ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(liveAuthor?.name || post.authorName || 'U')}&background=FDF2F3&color=C93545`;
            const authorName = liveAuthor?.name || post.authorName || 'Foydalanuvchi';
            const authorUsername = liveAuthor?.username || post.authorUsername || '';
            const authorVerified = Boolean(liveAuthor?.faceId?.verified || liveAuthor?.isVerified || post.authorVerified);

            const likes = Array.isArray(post.likes) ? post.likes : [];
            const isLiked = Boolean(currentUser?.uid && likes.includes(currentUser.uid));
            const comments = Array.isArray(post.comments) ? post.comments : [];
            const showAllComments = Boolean(expandedComments[post.id]);
            const displayedComments = showAllComments ? comments : comments.slice(-3);

            const canDelete = Boolean(
              currentUser &&
                (currentUser.uid === post.authorUid ||
                  currentUser.role === 'admin' ||
                  currentUser.isAdmin ||
                  currentUser.id === 'ALOV-ADMIN')
            );

            // Universal embed detection for posts
            const resolvedEmbedUrl =
              post.embedUrl ||
              (post.type === 'video' && post.mediaUrl ? parseMediaLink(post.mediaUrl, 'video').embedUrl : undefined);
            const isVertical = Boolean(
              post.isVerticalVideo ||
              (post.mediaUrl && parseMediaLink(post.mediaUrl, 'video').isVertical)
            );

            return (
              <article
                key={post.id}
                data-testid={`post-card-${post.id}`}
                className="bg-[#FFFFFF] rounded-3xl border border-[#F2E8E6] shadow-subtle overflow-hidden"
              >
                {/* Author Header */}
                <div className="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenProfile(
                        post.authorUid,
                        liveAuthor || {
                          uid: post.authorUid,
                          id: post.authorId,
                          name: authorName,
                          username: authorUsername,
                          avatar: authorAvatar,
                        }
                      )
                    }
                    data-testid={`post-author-btn-${post.id}`}
                    className="flex items-center gap-3 min-w-0 text-left group cursor-pointer"
                  >
                    <div className="relative w-10 h-10 shrink-0">
                      <img
                        src={authorAvatar}
                        alt={authorName}
                        className="w-10 h-10 rounded-full object-cover border border-[#F2E8E6] group-hover:scale-105 transition-transform"
                      />
                      <span
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          authorOnline ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-[#221719] group-hover:text-[#C93545] transition-colors truncate">
                          {authorName}
                        </span>
                        {authorVerified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                        {authorUsername && (
                          <span className="text-[11px] font-semibold text-[#837275] font-mono">
                            {formatUsernameDisplay(authorUsername)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-[#837275]">
                        <span>{formatPostTimeUz(post.createdAt)}</span>
                        <span>·</span>
                        <span className="font-semibold text-[#6B5B5E]">
                          {post.type === 'photo'
                            ? 'Rasm'
                            : post.type === 'video'
                              ? 'Video'
                              : post.type === 'music'
                                ? 'Musiqa'
                                : 'Matn'}
                        </span>
                      </div>
                    </div>
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeletePost(post.id)}
                      aria-label="Postni o'chirish"
                      className="p-2 rounded-xl text-[#837275] hover:text-[#C93545] hover:bg-[#FDF2F3] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Caption */}
                {post.caption && (
                  <p className="px-4 sm:px-5 pb-3 text-sm text-[#36272A] leading-relaxed whitespace-pre-line">
                    {post.caption}
                  </p>
                )}

                {/* Media Body */}
                {post.type === 'photo' && post.mediaUrl && (
                  <div className="px-4 sm:px-5 pb-3">
                    <img
                      src={post.mediaUrl}
                      alt={post.caption || authorName}
                      className="w-full max-h-[520px] object-cover rounded-2xl border border-[#F2E8E6] bg-[#FAF4F2]"
                    />
                  </div>
                )}

                {post.type === 'video' && (
                  <div className="w-full bg-black">
                    {resolvedEmbedUrl ? (
                      <div
                        className={`relative w-full overflow-hidden bg-black ${
                          isVertical ? 'aspect-[9/16] max-w-[360px] mx-auto' : 'aspect-video w-full'
                        }`}
                      >
                        <iframe
                          src={resolvedEmbedUrl}
                          title={post.caption || 'Video'}
                          className="w-full h-full border-0 outline-none"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      </div>
                    ) : post.mediaUrl ? (
                      <video
                        src={post.mediaUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full max-h-[520px] bg-black object-contain mx-auto"
                      />
                    ) : null}
                  </div>
                )}

                {post.type === 'music' && post.mediaUrl && (
                  <div className="px-4 sm:px-5 pb-3">
                    <MusicPlayerCard
                      mediaUrl={post.mediaUrl}
                      title={post.audioTitle}
                      artist={post.audioArtist || authorName}
                      coverUrl={post.coverUrl}
                    />
                  </div>
                )}

                {/* Post Actions: Like & Comments toggle */}
                <div className="px-4 sm:px-5 py-2.5 border-t border-[#F2E8E6] flex items-center gap-4 bg-[#FDFBF9]">
                  <button
                    type="button"
                    onClick={() => handleToggleLike(post)}
                    data-testid={`like-post-btn-${post.id}`}
                    className={`flex items-center gap-1.5 text-xs font-bold py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
                      isLiked
                        ? 'text-[#C93545] bg-[#FDF2F3]'
                        : 'text-[#57484B] hover:text-[#C93545] hover:bg-[#FAF4F2]'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isLiked ? 'fill-[#C93545] text-[#C93545]' : ''}`} />
                    <span className="tabular-nums">{likes.length}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedComments((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
                    }
                    data-testid={`toggle-comments-btn-${post.id}`}
                    className="flex items-center gap-1.5 text-xs font-bold py-1 px-2.5 rounded-xl text-[#57484B] hover:text-[#221719] hover:bg-[#FAF4F2] transition-colors cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span className="tabular-nums">{comments.length} izoh</span>
                  </button>
                </div>

                {/* Comments Area (Tidy, Refined with @username and Profile Navigation) */}
                <div className="px-4 sm:px-5 py-3.5 bg-[#FAF4F2]/50 border-t border-[#F2E8E6] space-y-3">
                  {comments.length > 3 && !showAllComments && (
                    <button
                      type="button"
                      onClick={() => setExpandedComments((prev) => ({ ...prev, [post.id]: true }))}
                      className="text-[11px] font-bold text-[#C93545] hover:underline cursor-pointer"
                    >
                      Barcha {comments.length} ta izohni ko'rish
                    </button>
                  )}

                  {displayedComments.length > 0 && (
                    <div className="space-y-2">
                      {displayedComments.map((c) => {
                        const commentLiveUser =
                          usersList.find((u) => u.uid === c.authorUid || (c.authorId && u.id === c.authorId)) ||
                          (currentUser && (currentUser.uid === c.authorUid || currentUser.id === c.authorId)
                            ? currentUser
                            : null);
                        const commentAvatar =
                          commentLiveUser?.avatar ||
                          c.authorAvatar ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(commentLiveUser?.name || c.authorName || 'U')}&background=FDF2F3&color=C93545`;
                        const commentName = commentLiveUser?.name || c.authorName || 'Foydalanuvchi';
                        const commentUsername = commentLiveUser?.username || c.authorUsername || '';

                        return (
                          <div
                            key={c.id}
                            data-testid={`comment-item-${c.id}`}
                            className="flex items-start gap-2.5 bg-white p-2.5 sm:p-3 rounded-2xl border border-[#F2E8E6] shadow-xs"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                onOpenProfile(
                                  c.authorUid,
                                  commentLiveUser || {
                                    uid: c.authorUid,
                                    id: c.authorId,
                                    name: commentName,
                                    username: commentUsername,
                                    avatar: commentAvatar,
                                  }
                                )
                              }
                              data-testid={`comment-author-avatar-${c.id}`}
                              className="shrink-0 cursor-pointer group"
                              title={`${commentName} profiliga o'tish`}
                            >
                              <img
                                src={commentAvatar}
                                alt={commentName}
                                className="w-8 h-8 rounded-full object-cover border border-[#F2E8E6] group-hover:ring-2 group-hover:ring-[#C93545]/50 transition-all"
                              />
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenProfile(
                                      c.authorUid,
                                      commentLiveUser || {
                                        uid: c.authorUid,
                                        id: c.authorId,
                                        name: commentName,
                                        username: commentUsername,
                                        avatar: commentAvatar,
                                      }
                                    )
                                  }
                                  data-testid={`comment-author-name-${c.id}`}
                                  className="text-xs font-bold text-[#221719] hover:text-[#C93545] hover:underline transition-colors text-left cursor-pointer"
                                >
                                  {commentName}
                                </button>
                                {commentUsername && (
                                  <span className="text-[10px] font-semibold text-[#837275] font-mono">
                                    {formatUsernameDisplay(commentUsername)}
                                  </span>
                                )}
                                <span className="text-[10px] text-[#A6979A]">·</span>
                                <span className="text-[10px] text-[#A6979A]">
                                  {formatPostTimeUz(c.createdAt)}
                                </span>
                              </div>
                              <p className="text-xs text-[#36272A] mt-1 leading-relaxed break-words">
                                {c.text}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Comment Input Box */}
                  <form onSubmit={(e) => handleAddComment(post.id, e)} className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={commentInputs[post.id] || ''}
                      onChange={(e) =>
                        setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))
                      }
                      placeholder={currentUser ? 'Fikringizni yozing...' : 'Izoh qoldirish uchun tizimga kiring...'}
                      data-testid={`comment-input-${post.id}`}
                      className="flex-1 px-3.5 py-2.5 bg-white border border-[#F2E8E6] rounded-xl text-xs text-[#221719] placeholder-[#837275] focus:outline-none focus:border-[#C93545] shadow-xs"
                    />
                    <button
                      type="submit"
                      disabled={submittingCommentId === post.id || !(commentInputs[post.id] || '').trim()}
                      data-testid={`comment-submit-${post.id}`}
                      aria-label="Izoh yuborish"
                      className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#C93545] to-[#A62433] text-white hover:opacity-95 transition-opacity disabled:opacity-40 flex items-center justify-center shrink-0 cursor-pointer shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
