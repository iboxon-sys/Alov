import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Download,
  Loader2,
  Reply,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PostItem,
  PostMediaType,
  formatPostTimeUz,
  isPostVisibleToViewer,
  canUserDeletePost,
  canUserDeleteComment,
  didPostAuthorLikeComment,
  isActorPostAuthor,
  splitCommentRepliesForDisplay,
  resolvePostAuthorGender,
  isPostCommentsOpen,
  validateNewPostDraft,
} from '../utils/posts';
import { isAdminTelegramUser } from '../utils/tokenomics';
import { AdminBadge } from './AdminBadge';
import { isUserOnlineStrict } from '../utils/presence';
import {
  parseMediaLink,
  parseAudioFilenameMetadata,
} from '../utils/mediaLinks';
import { formatUsernameDisplay } from '../utils/username';
import { isDirectPlayableVideoUrl, sanitizeMp3DownloadFilename } from '../utils/videoImport';
import { getApiUrl, resolveApiMediaUrl } from '../config/api';

interface MusicPlayerCardProps {
  mediaUrl: string;
  embedUrl?: string;
  title?: string;
  artist?: string;
  coverUrl?: string;
}

export const MusicPlayerCard: React.FC<MusicPlayerCardProps> = ({ mediaUrl, embedUrl, title, artist, coverUrl }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const resolvedMediaUrl = resolveApiMediaUrl(mediaUrl);
  const resolvedCoverUrl = coverUrl ? resolveApiMediaUrl(coverUrl) : '';
  const isLocalMedia = resolvedMediaUrl.includes('/api/media/');
  const isDirectAudioFile = isLocalMedia || /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(resolvedMediaUrl) || resolvedMediaUrl.startsWith('data:audio/') || resolvedMediaUrl.startsWith('blob:');
  const downloadFileName = sanitizeMp3DownloadFilename(title);
  const downloadHref = isLocalMedia
    ? `${resolvedMediaUrl}?download=1&filename=${encodeURIComponent(downloadFileName)}`
    : resolvedMediaUrl;

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadError(false);
  }, [resolvedMediaUrl, embedUrl]);

  if (embedUrl && !isDirectAudioFile) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-[#12141E] border border-white/10 shadow-lg">
        <iframe
          src={embedUrl}
          title={title || 'Musiqiy pleyer'}
          className="w-full h-[152px] border-0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
        />
      </div>
    );
  }

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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#171824] via-[#1C1722] to-[#28151D] text-white p-4 border border-white/10 shadow-lg">
      <audio
        ref={audioRef}
        src={resolvedMediaUrl}
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
          className="relative w-14 h-14 rounded-2xl shrink-0 bg-[#101118] border border-amber-400/30 flex items-center justify-center overflow-hidden group hover:border-rose-500 transition-all cursor-pointer"
        >
          {resolvedCoverUrl ? (
            <img src={resolvedCoverUrl} alt={title || 'Musiqa'} className="w-full h-full object-cover opacity-55" />
          ) : (
            <div
              className={`w-10 h-10 rounded-full border-2 border-dashed border-amber-400/60 flex items-center justify-center ${
                isPlaying ? 'animate-spin' : ''
              }`}
              style={{ animationDuration: '4s' }}
            >
              <Music className="w-4 h-4 text-amber-400" />
            </div>
          )}
          <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
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
              <p className="font-editorial text-lg font-bold text-zinc-100 truncate leading-tight">
                {title || 'Musiqiy trek'}
              </p>
              <p className="text-[11px] text-amber-300/90 truncate flex items-center gap-1 mt-0.5">
                <Volume2 className="w-3 h-3 shrink-0" />
                <span>{artist || 'Alov.uz Audio'}</span>
                <span className="text-zinc-500">·</span>
                <span className="font-mono text-[10px] text-emerald-400 uppercase">MP3</span>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                {formatSec(currentTime)} / {duration ? formatSec(duration) : '--:--'}
              </span>
              {resolvedMediaUrl && !loadError && (
                <a
                  href={downloadHref}
                  download={downloadFileName}
                  data-testid="music-mp3-download-btn"
                  title="MP3 faylni yuklab olish"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-rose-600 border border-white/10 text-[10.5px] font-bold text-zinc-100 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">MP3</span>
                </a>
              )}
            </div>
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
            className="w-full mt-2.5 accent-[#E11D48] h-1.5 bg-white/15 rounded-lg cursor-pointer"
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
  const [adminGenderFilter, setAdminGenderFilter] = useState<'all' | 'female' | 'male'>('all');
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

  // Comments & Replies State
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [submittingCommentId, setSubmittingCommentId] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [openReplyComposerId, setOpenReplyComposerId] = useState<string | null>(null);
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null);
  const [togglingCommentLikeId, setTogglingCommentLikeId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [detectedVerticalByPostId, setDetectedVerticalByPostId] = useState<Record<string, boolean>>({});

  // File Inputs
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  const viewerIsAdmin = isAdminTelegramUser(currentUser);

  const visiblePosts = posts.filter((p) => {
    const postAuthor =
      usersList.find((u) => u.uid === p.authorUid || (p.authorId && u.id === p.authorId)) ||
      (currentUser && (currentUser.uid === p.authorUid || currentUser.id === p.authorId) ? currentUser : null);
    if (!isPostVisibleToViewer(p, currentUser, postAuthor?.gender)) return false;
    if (authorUid && p.authorUid !== authorUid) return false;
    if (!authorUid && filterType !== 'all' && p.type !== filterType) return false;
    if (viewerIsAdmin && !authorUid && adminGenderFilter !== 'all') {
      const resolvedGender = resolvePostAuthorGender(p, postAuthor);
      if (resolvedGender !== adminGenderFilter) return false;
    }
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
  };

  const handleApplyLink = async (urlToParse: string) => {
    const raw = (urlToParse || '').trim();
    if (!raw || uploadingMedia) return;
    setDraftError('');

    const parsed = parseMediaLink(raw, draftType);

    if (draftType === 'photo' && !raw.startsWith('/api/media/') && !raw.startsWith('blob:') && !raw.startsWith('data:')) {
      setUploadingMedia(true);
      try {
        const res = await fetch(getApiUrl('/api/media/import-image-url'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: parsed.normalizedUrl || raw }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success || !data?.url) {
          setDraftError(
            data?.error ||
              "Havoladan rasmni yuklab bo'lmadi. To'g'ridan-to'g'ri rasm havolasi kiriting yoki qurilmadan rasm yuklang."
          );
          return;
        }
        setMediaUrl(data.url);
        setEmbedUrl('');
        setMediaProvider('direct');
        setLinkInputText('');
        setShowLinkInput(false);
        if (onNotify) onNotify('Rasm kerakli formatda yuklandi');
        return;
      } catch {
        setDraftError("Rasm havolasini yuklab olishda server bilan aloqa uzildi.");
        return;
      } finally {
        setUploadingMedia(false);
      }
    }

    if (draftType === 'video' && !raw.startsWith('/api/media/') && !raw.startsWith('blob:') && !raw.startsWith('data:')) {
      setUploadingMedia(true);
      try {
        const res = await fetch(getApiUrl('/api/media/import-video-url'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: parsed.normalizedUrl || raw }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success || data.mode === 'embed' || !data.url) {
          setDraftError(
            data?.error ||
              "Ushbu havoladan haqiqiy MP4 video faylni yuklab bo'lmadi. Boshqa havola kiriting yoki qurilmadan video yuklang."
          );
          return;
        }
        setMediaUrl(data.url);
        setEmbedUrl('');
        setMediaProvider('direct');
        setIsVerticalVideo(Boolean(data.isVertical));
        setLinkInputText('');
        if (onNotify) onNotify('Video haqiqiy MP4 formatida yuklandi');
        return;
      } catch {
        setDraftError("Video havolasini yuklab olishda server bilan aloqa uzildi.");
        return;
      } finally {
        setUploadingMedia(false);
      }
    }

    if (draftType === 'music' && !raw.startsWith('/api/media/') && !raw.startsWith('blob:') && !raw.startsWith('data:')) {
      setUploadingMedia(true);
      try {
        const res = await fetch(getApiUrl('/api/media/import-audio-url'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: parsed.normalizedUrl || raw }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          setDraftError(
            data?.error ||
              "Havoladan MP3 audio ajratib bo'lmadi. Boshqa havola kiriting yoki qurilmadan audio yuklang."
          );
          return;
        }
        if (data.mode === 'embed' && data.embedUrl) {
          setMediaUrl(data.url || parsed.normalizedUrl || raw);
          setEmbedUrl(data.embedUrl);
          setMediaProvider(data.provider || parsed.provider || 'direct');
          setLinkInputText('');
          return;
        }
        if (!data.url) {
          setDraftError("MP3 fayl yaratilmadi. Boshqa havola sinab ko'ring.");
          return;
        }
        setMediaUrl(data.url);
        setEmbedUrl('');
        setMediaProvider('direct');
        setLinkInputText('');
        if (!audioTitle && data.title) setAudioTitle(data.title);
        if (!audioArtist && data.artist) setAudioArtist(data.artist);
        if (onNotify) onNotify('Video/audio MP3 formatida yuklandi');
        return;
      } catch {
        setDraftError("Havolani MP3 ga aylantirishda server bilan aloqa uzildi.");
        return;
      } finally {
        setUploadingMedia(false);
      }
    }

    setMediaUrl(parsed.normalizedUrl);
    setEmbedUrl(parsed.embedUrl || '');
    setMediaProvider(parsed.provider || 'direct');
    setIsVerticalVideo(Boolean(parsed.isVertical));

    if (draftType === 'music' && !audioTitle) {
      const meta = parseAudioFilenameMetadata(raw);
      if (meta.title) setAudioTitle(meta.title);
      if (meta.artist) setAudioArtist(meta.artist);
    }
  };

  const handleFileUpload = async (file: File | undefined, typeHint: PostMediaType) => {
    if (!file) return;
    setDraftError('');

    if (file.size > 45 * 1024 * 1024) {
      setDraftError('Fayl hajmi 45 MB dan oshmasligi kerak.');
      return;
    }

    setUploadingMedia(true);
    try {
      const res = await fetch(getApiUrl(`/api/media/upload-raw?type=${encodeURIComponent(typeHint)}`), {
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
        setIsVerticalVideo(Boolean(data.isVertical));

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
      const res = await fetch(getApiUrl('/api/posts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorUid: currentUser.uid,
          authorId: currentUser.id || '',
          authorName: currentUser.name || '',
          authorUsername: currentUser.username || '',
          authorAvatar: currentUser.avatar || '',
          authorGender: currentUser.gender || '',
          authorVerified: Boolean(currentUser.faceId?.verified || currentUser.isVerified),
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
      if (onNotify) onNotify('Postingiz muvaffaqiyatli joylandi');
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
      const res = await fetch(getApiUrl(`/api/posts/${encodeURIComponent(post.id)}/like`), {
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
      const res = await fetch(getApiUrl(`/api/posts/${encodeURIComponent(postId)}/comments`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorUid: currentUser.uid,
          authorName: currentUser.name || '',
          authorUsername: currentUser.username || '',
          authorAvatar: currentUser.avatar || '',
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

  const handleToggleCommentLike = async (postId: string, commentId: string) => {
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    setTogglingCommentLikeId(commentId);
    try {
      const res = await fetch(
        getApiUrl(`/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.uid }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && data?.post) {
        onPostUpdated(data.post);
      }
    } finally {
      setTogglingCommentLikeId(null);
    }
  };

  const handleAddReply = async (postId: string, commentId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onOpenAuth();
      return;
    }
    const text = (replyInputs[commentId] || '').trim();
    if (!text) return;

    setSubmittingReplyId(commentId);
    try {
      const res = await fetch(
        getApiUrl(`/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/replies`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authorUid: currentUser.uid,
            authorName: currentUser.name || '',
            authorUsername: currentUser.username || '',
            authorAvatar: currentUser.avatar || '',
            text,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && data?.post) {
        onPostUpdated(data.post);
        setReplyInputs((prev) => ({ ...prev, [commentId]: '' }));
        setOpenReplyComposerId(null);
        // Non-author replies stay collapsed behind toggle unless user expands them,
        // while author replies automatically surface immediately via splitCommentRepliesForDisplay.
      } else {
        if (onNotify) onNotify(data?.error || "Javob yozib bo'lmadi");
      }
    } finally {
      setSubmittingReplyId(null);
    }
  };

  const handleDeleteComment = async (postId: string, commentId: string) => {
    if (!currentUser) return;
    setDeletingCommentId(commentId);
    try {
      const res = await fetch(
        getApiUrl(
          `/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}?uid=${encodeURIComponent(
            currentUser.uid
          )}`
        ),
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.uid }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && data?.post) {
        onPostUpdated(data.post);
        if (onNotify) onNotify("Izoh o'chirildi");
      } else {
        if (onNotify) onNotify(data?.error || "Izohni o'chirib bo'lmadi");
      }
    } catch {
      if (onNotify) onNotify("Izohni o'chirishda tarmoq xatoligi");
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleDeleteReply = async (postId: string, commentId: string, replyId: string) => {
    if (!currentUser) return;
    setDeletingCommentId(replyId);
    try {
      const res = await fetch(
        getApiUrl(
          `/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/replies/${encodeURIComponent(
            replyId
          )}?uid=${encodeURIComponent(currentUser.uid)}`
        ),
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: currentUser.uid }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && data?.post) {
        onPostUpdated(data.post);
        if (onNotify) onNotify("Javob o'chirildi");
      } else {
        if (onNotify) onNotify(data?.error || "Javobni o'chirib bo'lmadi");
      }
    } catch {
      if (onNotify) onNotify("Javobni o'chirishda tarmoq xatoligi");
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch(getApiUrl(`/api/posts/${encodeURIComponent(postId)}?uid=${encodeURIComponent(currentUser.uid)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: currentUser.uid }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        onPostDeleted(postId);
        if (onNotify) onNotify("Post o'chirildi");
      } else {
        if (onNotify) onNotify(data?.error || "Postni o'chirib bo'lmadi");
      }
    } catch {
      if (onNotify) onNotify("Postni o'chirishda tarmoq xatoligi");
    }
  };

  return (
    <div className="relative space-y-5" data-testid={authorUid ? `profile-posts-${authorUid}` : 'global-posts-feed'}>
      {/* Hidden file inputs for direct device selection */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          handleFileUpload(file, 'photo');
        }}
        className="hidden"
        data-testid="hidden-gallery-input"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          handleFileUpload(file, 'photo');
        }}
        className="hidden"
        data-testid="hidden-camera-input"
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          handleFileUpload(file, 'video');
        }}
        className="hidden"
        data-testid="hidden-video-input"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          handleFileUpload(file, 'music');
        }}
        className="hidden"
        data-testid="hidden-audio-input"
      />

      {/* Floating Action Button (+) for Post Creation */}
      {allowCompose && (
        <motion.button
          type="button"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => {
            if (!currentUser) {
              onOpenAuth();
              return;
            }
            setShowComposeModal(true);
          }}
          data-testid="open-compose-modal-btn"
          aria-label="Yangi post joylash"
          className="fixed bottom-20 sm:bottom-24 right-5 sm:right-8 z-40 w-14 h-14 rounded-full bg-gradient-to-tr from-[#BE123C] via-[#E11D48] to-[#FB7185] text-white shadow-[0_12px_32px_rgba(225,29,72,0.45)] flex items-center justify-center border border-white/25 cursor-pointer group"
        >
          <Plus className="w-7 h-7 stroke-[2.5] group-hover:rotate-90 transition-transform duration-200" />
        </motion.button>
      )}

      {/* Post Compose Modal Dialog (Portaled to document.body so header/dock never clip it) */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showComposeModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[160] bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
              onClick={() => setShowComposeModal(false)}
              data-testid="compose-modal-backdrop"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="bg-[#11131B] w-full max-w-xl rounded-[28px] shadow-[0_30px_90px_rgba(0,0,0,0.8)] border border-white/10 overflow-hidden flex flex-col max-h-[92vh] text-zinc-100"
                onClick={(e) => e.stopPropagation()}
                data-testid="post-compose-modal"
              >
                {/* Modal Header */}
                <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#151822] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-editorial text-xl font-bold text-white leading-tight">Yangi post joylash</h3>
                    <p className="text-[11px] text-zinc-400">Rasm, video, MP3 musiqa yoki fikringizni ulashing</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowComposeModal(false)}
                  aria-label="Yopish"
                  data-testid="compose-modal-close-btn"
                  className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/15 text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handlePublishPost} className="p-5 overflow-y-auto space-y-4 flex-1">
                {/* Media Type Selector Tabs */}
                <div className="grid grid-cols-4 gap-1.5 p-1 bg-[#0A0C12] rounded-2xl border border-white/[0.08]">
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
                          setMediaProvider('direct');
                          setIsVerticalVideo(false);
                          setLinkInputText('');
                          setDraftError('');
                          setShowLinkInput(false);
                        }}
                        className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          active
                            ? 'bg-[#E11D48] text-white shadow-sm'
                            : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Caption Textarea */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
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
                          ? "Video haqida qisqacha ma'lumot yozing..."
                          : "Bugungi kayfiyat yoki xotirangiz bilan bo'lishing..."
                    }
                    data-testid="post-caption-input"
                    className="w-full px-3.5 py-2.5 bg-[#161923] border border-white/10 rounded-2xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500 resize-none leading-relaxed"
                  />
                </div>

                {/* PHOTO UPLOAD OPTIONS */}
                {draftType === 'photo' && (
                  <div className="space-y-3">
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
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
                            className="p-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/25 text-rose-300 flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center group"
                          >
                            <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 group-hover:scale-105 transition-transform">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold text-white">Galereyadan tanlash</span>
                            <span className="text-[10px] text-zinc-400">Qurilmangizdagi fotosuratlar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => cameraInputRef.current?.click()}
                            disabled={uploadingMedia}
                            data-testid="compose-camera-btn"
                            className="p-3.5 rounded-2xl bg-[#161923] hover:bg-[#1D212E] border border-white/10 text-zinc-200 flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center group"
                          >
                            <div className="w-10 h-10 rounded-full bg-white/[0.07] flex items-center justify-center text-zinc-200 group-hover:scale-105 transition-transform">
                              <Camera className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold text-white">Kamerada suratga olish</span>
                            <span className="text-[10px] text-zinc-400">Jonli lahzani oling</span>
                          </button>
                        </div>

                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setShowLinkInput((v) => !v)}
                            className="text-xs font-semibold text-rose-400 hover:underline flex items-center gap-1.5 cursor-pointer"
                          >
                            <LinkIcon className="w-3.5 h-3.5" />
                            <span>{showLinkInput ? 'Havolani yashirish' : 'Yoki rasm havolasi (URL) orqali'}</span>
                          </button>
                        </div>

                        {showLinkInput && (
                          <div className="flex gap-2">
                            <input
                              type="url"
                              value={linkInputText}
                              onChange={(e) => setLinkInputText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleApplyLink(linkInputText);
                                }
                              }}
                              placeholder="https://... yoki Pinterest/Telegram rasm havolasi"
                              data-testid="post-photo-link-input"
                              className="flex-1 px-3.5 py-2 bg-[#161923] border border-white/10 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                            />
                            <button
                              type="button"
                              disabled={uploadingMedia || !linkInputText.trim()}
                              onClick={() => handleApplyLink(linkInputText)}
                              data-testid="post-photo-link-submit-btn"
                              className="px-3.5 py-2 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                            >
                              {uploadingMedia && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              <span>{uploadingMedia ? 'Yuklanmoqda...' : 'Yuklash'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0A0C12]">
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
                        <img src={resolveApiMediaUrl(mediaUrl)} alt="Preview" className="w-full max-h-72 object-cover" />
                      </div>
                    )}
                  </div>
                )}

                {/* VIDEO UPLOAD OPTIONS */}
                {draftType === 'video' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                        Video havolasi yoki fayl
                      </label>
                      <span className="text-[10px] text-rose-400 font-semibold">
                        MP4 · TikTok · Reels · Shorts
                      </span>
                    </div>

                    {!mediaUrl ? (
                      <div className="space-y-3">
                        <div className="p-3.5 rounded-2xl bg-[#161923] border border-white/10 space-y-2.5">
                          <p className="text-xs font-bold text-white flex items-center gap-1.5">
                            <LinkIcon className="w-3.5 h-3.5 text-rose-400" />
                            <span>Video havolasini kiriting (avtomatik yuklanadi):</span>
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="url"
                              value={linkInputText}
                              onChange={(e) => setLinkInputText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleApplyLink(linkInputText);
                                }
                              }}
                              placeholder="TikTok, Instagram, YouTube, X, Telegram yoki .mp4 havola"
                              data-testid="post-video-link-input"
                              className="flex-1 px-3.5 py-2.5 bg-[#0D0F16] border border-white/10 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                            />
                            <button
                              type="button"
                              disabled={uploadingMedia || !linkInputText.trim()}
                              onClick={() => handleApplyLink(linkInputText)}
                              data-testid="post-video-link-submit-btn"
                              className="px-4 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                            >
                              {uploadingMedia && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              <span>{uploadingMedia ? 'Yuklanmoqda...' : 'Yuklash'}</span>
                            </button>
                          </div>
                          <p className="text-[10.5px] text-zinc-400 leading-relaxed">
                            Havoladagi video serverda MP4 formatiga keltirilib, toza pleyerda ijro etiladi.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => videoInputRef.current?.click()}
                          disabled={uploadingMedia}
                          data-testid="compose-device-video-btn"
                          className="w-full p-3 rounded-xl bg-[#161923] hover:bg-[#1D212E] border border-dashed border-rose-500/35 text-xs font-bold text-rose-300 flex items-center justify-center gap-2 transition cursor-pointer"
                        >
                          <Upload className="w-4 h-4" />
                          <span>{uploadingMedia ? 'Video yuklanmoqda...' : 'Yoki qurilmadan video fayl tanlash'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="relative overflow-hidden rounded-2xl bg-black border border-white/10">
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

                          <div className={isVerticalVideo ? 'aspect-[9/16] max-w-[260px] mx-auto bg-black overflow-hidden' : 'w-full bg-black'}>
                            <video
                              src={resolveApiMediaUrl(mediaUrl)}
                              controls
                              playsInline
                              preload="metadata"
                              onLoadedMetadata={(e) => {
                                const v = e.currentTarget;
                                if (v.videoHeight > v.videoWidth) {
                                  setIsVerticalVideo(true);
                                }
                              }}
                              className={isVerticalVideo ? 'w-full h-full object-contain bg-black block' : 'w-full max-h-72 object-contain bg-black block'}
                            />
                          </div>
                        </div>
                        {mediaUrl && !mediaUrl.startsWith('blob:') && (
                          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#161923] border border-white/10">
                            <span className="text-[11px] font-semibold text-emerald-300">Haqiqiy MP4 pleyer tayyor</span>
                            <a
                              href={
                                resolveApiMediaUrl(mediaUrl).includes('/api/media/')
                                  ? `${resolveApiMediaUrl(mediaUrl)}${resolveApiMediaUrl(mediaUrl).includes('?') ? '&' : '?'}download=1&filename=alov-video.mp4`
                                  : resolveApiMediaUrl(mediaUrl)
                              }
                              download="alov-video.mp4"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold transition"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>MP4 yuklab olish</span>
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* MUSIC UPLOAD OPTIONS (Video/Audio Link -> MP3 Extraction + Device Upload) */}
                {draftType === 'music' && (
                  <div className="space-y-3" data-testid="compose-music-panel">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                        Havoladan MP3 yuklash yoki audio fayl
                      </label>
                      <span className="text-[10px] font-mono font-bold text-emerald-400">
                        MP3 Konverter
                      </span>
                    </div>

                    {/* Video or Audio Link to MP3 Converter Box */}
                    <div className="p-3.5 rounded-2xl bg-[#161923] border border-white/10 space-y-2.5">
                      <p className="text-xs font-bold text-white flex items-center gap-1.5">
                        <LinkIcon className="w-3.5 h-3.5 text-rose-400" />
                        <span>Video yoki audio havolasini kiriting (MP3 ga aylantiriladi):</span>
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={linkInputText}
                          onChange={(e) => setLinkInputText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleApplyLink(linkInputText);
                            }
                          }}
                          placeholder="YouTube, TikTok, Instagram, Telegram yoki .mp4/.mp3 havola"
                          data-testid="post-audio-link-input"
                          className="flex-1 px-3.5 py-2.5 bg-[#0D0F16] border border-white/10 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                        />
                        <button
                          type="button"
                          disabled={uploadingMedia || !linkInputText.trim()}
                          onClick={() => handleApplyLink(linkInputText)}
                          data-testid="post-audio-link-submit-btn"
                          className="px-4 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                        >
                          {uploadingMedia && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>{uploadingMedia ? 'MP3...' : 'MP3 yuklash'}</span>
                        </button>
                      </div>
                      <p className="text-[10.5px] text-zinc-400 leading-relaxed">
                        Havoladagi video ovozi serverda avtomatik <strong className="text-zinc-200">.mp3</strong> formatiga o'giriladi.
                      </p>
                    </div>

                    {/* Device Audio Upload */}
                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      disabled={uploadingMedia}
                      data-testid="compose-device-audio-btn"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#161923] hover:bg-[#1D212E] border border-dashed border-rose-500/35 text-xs font-bold text-rose-300 flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingMedia ? 'Audio tayyorlanmoqda...' : 'Yoki qurilmadan audio fayl tanlash'}</span>
                    </button>

                    {/* Audio Title & Artist */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Musiqa nomi</label>
                        <input
                          type="text"
                          value={audioTitle}
                          onChange={(e) => setAudioTitle(e.target.value)}
                          placeholder="Trek nomi (masalan: Bahor)"
                          data-testid="post-audio-title-input"
                          className="w-full px-3.5 py-2 bg-[#161923] border border-white/10 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Ijrochi ismi</label>
                        <input
                          type="text"
                          value={audioArtist}
                          onChange={(e) => setAudioArtist(e.target.value)}
                          placeholder="Ijrochi (masalan: Sevara)"
                          data-testid="post-audio-artist-input"
                          className="w-full px-3.5 py-2 bg-[#161923] border border-white/10 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                        />
                      </div>
                    </div>

                    {/* Audio Preview Card */}
                    {mediaUrl && (
                      <div className="pt-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[10.5px] font-semibold text-zinc-400">Tayyor MP3 pleyer:</p>
                          <button
                            type="button"
                            onClick={() => {
                              setMediaUrl('');
                              setEmbedUrl('');
                            }}
                            className="text-[10.5px] font-semibold text-rose-400 hover:underline cursor-pointer"
                          >
                            Olib tashlash
                          </button>
                        </div>
                        <MusicPlayerCard mediaUrl={mediaUrl} embedUrl={embedUrl} title={audioTitle} artist={audioArtist} />
                      </div>
                    )}
                  </div>
                )}

                {/* Draft Error Message */}
                {draftError && (
                  <p className="text-xs font-semibold text-rose-300 bg-rose-500/15 px-3.5 py-2.5 rounded-2xl border border-rose-500/30">
                    {draftError}
                  </p>
                )}

                {/* Modal Footer Buttons */}
                <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setShowComposeModal(false)}
                    className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-bold text-zinc-300 transition cursor-pointer"
                  >
                    Bekor qilish
                  </button>

                  <button
                    type="submit"
                    disabled={publishing || uploadingMedia}
                    data-testid="publish-post-btn"
                    className="px-6 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold shadow-lg shadow-rose-950/50 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{publishing ? 'Joylanmoqda...' : 'Postni joylash'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}

      {/* Filter Tabs for Global Feed */}
      {!authorUid && (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
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
                    ? 'bg-[#E11D48] text-white border-[#E11D48] shadow-sm'
                    : 'bg-[#141620] text-zinc-400 border-white/[0.08] hover:text-white hover:border-white/20'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {viewerIsAdmin && (
            <div className="flex items-center gap-1 bg-[#141620] p-1 rounded-xl border border-white/[0.08]" data-testid="feed-admin-gender-filter">
              {[
                { key: 'all' as const, label: 'Hamma' },
                { key: 'female' as const, label: 'Qizlar' },
                { key: 'male' as const, label: 'Yigitlar' },
              ].map((gTab) => (
                <button
                  key={gTab.key}
                  type="button"
                  data-testid={`feed-gender-filter-${gTab.key}`}
                  onClick={() => setAdminGenderFilter(gTab.key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    adminGenderFilter === gTab.key
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {gTab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {visiblePosts.length === 0 ? (
        <div className="bg-[#12141E] rounded-3xl border border-white/[0.08] p-10 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/25 text-rose-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="font-editorial text-xl font-bold text-white">Hozircha postlar yo'q</p>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
            {authorUid
              ? 'Bu foydalanuvchi hali rasm, video yoki musiqa joylamagan.'
              : 'Pastdagi "+" tugmasini bosib, birinchi bo\'lib rasm, video yoki MP3 musiqa ulashing.'}
          </p>
          {allowCompose && !authorUid && (
            <button
              type="button"
              onClick={() => {
                if (!currentUser) onOpenAuth();
                else setShowComposeModal(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold shadow transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Yangi post qo'shish</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {visiblePosts.map((post, idx) => {
            const liveAuthor =
              usersList.find((u) => u.uid === post.authorUid || (post.authorId && u.id === post.authorId)) ||
              (currentUser && (currentUser.uid === post.authorUid || currentUser.id === post.authorId) ? currentUser : null);
            const authorOnline = liveAuthor ? isUserOnlineStrict(liveAuthor, onlineUserIds) : onlineUserIds.has(post.authorUid);
            const authorAvatar = resolveApiMediaUrl(
              liveAuthor?.avatar ||
                post.authorAvatar ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(liveAuthor?.name || post.authorName || 'U')}&background=1C1F2B&color=F4F4F6`
            );
            const authorName = liveAuthor?.name || post.authorName || 'Foydalanuvchi';
            const authorUsername = liveAuthor?.username || post.authorUsername || '';
            const authorVerified = Boolean(liveAuthor?.faceId?.verified || liveAuthor?.isVerified || post.authorVerified);
            const authorAdminUser =
              liveAuthor ||
              (post.authorIsAdmin || post.authorRole === 'admin'
                ? {
                    uid: post.authorUid,
                    id: post.authorId,
                    username: authorUsername,
                    role: 'admin',
                    isAdmin: true,
                  }
                : {
                    uid: post.authorUid,
                    id: post.authorId,
                    username: authorUsername,
                  });

            const likes = Array.isArray(post.likes) ? post.likes : [];
            const isLiked = Boolean(currentUser?.uid && likes.includes(currentUser.uid));
            const comments = Array.isArray(post.comments) ? post.comments : [];
            const isCommentsOpen = isPostCommentsOpen(expandedComments, post.id);

            const canDelete = canUserDeletePost(post, currentUser);
            const authorGender = resolvePostAuthorGender(post, liveAuthor);
            const isAdminModeratorDelete = viewerIsAdmin && currentUser?.uid !== post.authorUid;

            const resolvedEmbedUrl =
              post.embedUrl ||
              (post.type === 'video' && post.mediaUrl ? parseMediaLink(post.mediaUrl, 'video').embedUrl : undefined);
            const isVertical = Boolean(
              post.isVerticalVideo ||
              detectedVerticalByPostId[post.id] ||
              (post.mediaUrl && parseMediaLink(post.mediaUrl, 'video').isVertical)
            );

            return (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min(idx * 0.04, 0.24), ease: [0.16, 1, 0.3, 1] }}
                data-testid={`post-card-${post.id}`}
                className="bg-[#12141E] rounded-3xl border border-white/[0.08] shadow-subtle overflow-hidden"
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
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                        className="w-10 h-10 rounded-full object-cover border border-white/15 group-hover:scale-105 transition-transform"
                      />
                      <div
                        className="hidden w-10 h-10 rounded-full bg-[#1C1F2B] text-rose-400 font-editorial font-black text-sm items-center justify-center border border-white/10"
                        aria-hidden="true"
                      >
                        {authorName.charAt(0).toUpperCase()}
                      </div>
                      <span
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#12141E] ${
                          authorOnline ? 'bg-emerald-500' : 'bg-zinc-500'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-white group-hover:text-rose-400 transition-colors truncate">
                          {authorName}
                        </span>
                        <AdminBadge
                          user={authorAdminUser}
                          size="xs"
                          testId={`post-author-admin-badge-${post.id}`}
                        />
                        {authorVerified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        {viewerIsAdmin && authorGender && (
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border ${
                              authorGender === 'female'
                                ? 'bg-pink-500/15 text-pink-300 border-pink-500/30'
                                : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                            }`}
                          >
                            {authorGender === 'female' ? 'Qiz' : 'Yigit'}
                          </span>
                        )}
                        {authorUsername && (
                          <span className="text-[11px] font-semibold text-zinc-400 font-mono">
                            {formatUsernameDisplay(authorUsername)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                        <span>{formatPostTimeUz(post.createdAt)}</span>
                        <span>·</span>
                        <span className="font-semibold text-zinc-300">
                          {post.type === 'photo'
                            ? 'Rasm'
                            : post.type === 'video'
                              ? (isVertical ? 'Shorts Video' : 'Video')
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
                      data-testid={`delete-post-btn-${post.id}`}
                      title={isAdminModeratorDelete ? "Admin sifatida postni o'chirish" : "Postni o'chirish"}
                      className={
                        isAdminModeratorDelete
                          ? 'px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-[11px] font-bold transition flex items-center gap-1 shrink-0 cursor-pointer'
                          : 'p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer'
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {isAdminModeratorDelete && <span>O&apos;chirish</span>}
                    </button>
                  )}
                </div>

                {/* Caption */}
                {post.caption && (
                  <p className="px-4 sm:px-5 pb-3 text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
                    {post.caption}
                  </p>
                )}

                {/* Media Body */}
                {post.type === 'photo' && post.mediaUrl && (
                  <div className="px-4 sm:px-5 pb-3">
                    <img
                      src={resolveApiMediaUrl(post.mediaUrl)}
                      alt={post.caption || authorName}
                      className="w-full max-h-[520px] object-cover rounded-2xl border border-white/10 bg-[#0A0C12]"
                    />
                  </div>
                )}

                {post.type === 'video' && (
                  <div className="w-full bg-black" data-vertical-video={isVertical ? 'true' : 'false'}>
                    {post.mediaUrl ? (
                      <>
                        <div
                          className={
                            isVertical
                              ? 'aspect-[9/16] max-w-[360px] mx-auto bg-black overflow-hidden'
                              : 'w-full bg-black'
                          }
                        >
                          <video
                            src={resolveApiMediaUrl(post.mediaUrl)}
                            controls
                            playsInline
                            preload="metadata"
                            onLoadedMetadata={(e) => {
                              const v = e.currentTarget;
                              if (v.videoHeight > v.videoWidth && !detectedVerticalByPostId[post.id]) {
                                setDetectedVerticalByPostId((prev) => ({ ...prev, [post.id]: true }));
                              }
                            }}
                            className={
                              isVertical
                                ? 'w-full h-full object-contain bg-black block'
                                : 'w-full max-h-[520px] bg-black object-contain mx-auto block'
                            }
                          />
                        </div>
                        {isDirectPlayableVideoUrl(post.mediaUrl) && (
                          <div className="px-4 sm:px-5 py-2 bg-[#0E1018] border-t border-white/[0.06] flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-zinc-400">MP4 Video</span>
                            <a
                              href={
                                resolveApiMediaUrl(post.mediaUrl).includes('/api/media/')
                                  ? `${resolveApiMediaUrl(post.mediaUrl)}${resolveApiMediaUrl(post.mediaUrl).includes('?') ? '&' : '?'}download=1&filename=${encodeURIComponent(`alov-video-${post.id.slice(-6)}.mp4`)}`
                                  : resolveApiMediaUrl(post.mediaUrl)
                              }
                              download={`alov-video-${post.id.slice(-6)}.mp4`}
                              data-testid={`post-video-mp4-download-btn-${post.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-rose-600 text-white text-[11px] font-bold transition"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>MP4 yuklab olish</span>
                            </a>
                          </div>
                        )}
                      </>
                    ) : resolvedEmbedUrl ? (
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
                    ) : null}
                  </div>
                )}

                {post.type === 'music' && post.mediaUrl && (
                  <div className="px-4 sm:px-5 pb-3">
                    <MusicPlayerCard
                      mediaUrl={post.mediaUrl}
                      embedUrl={post.embedUrl}
                      title={post.audioTitle}
                      artist={post.audioArtist || authorName}
                      coverUrl={post.coverUrl}
                    />
                  </div>
                )}

                {/* Post Actions: Like & Comments toggle */}
                <div className="px-4 sm:px-5 py-2.5 border-t border-white/[0.06] flex items-center gap-4 bg-[#10121B]">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleToggleLike(post)}
                    data-testid={`like-post-btn-${post.id}`}
                    className={`flex items-center gap-1.5 text-xs font-bold py-1 px-2.5 rounded-xl transition-all cursor-pointer ${
                      isLiked
                        ? 'text-rose-400 bg-rose-500/15'
                        : 'text-zinc-400 hover:text-rose-400 hover:bg-white/[0.05]'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                    <span className="tabular-nums">{likes.length}</span>
                  </motion.button>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedComments((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
                    }
                    aria-expanded={isCommentsOpen}
                    data-testid={`toggle-comments-btn-${post.id}`}
                    className={`flex items-center gap-1.5 text-xs font-bold py-1 px-2.5 rounded-xl transition-colors cursor-pointer ${
                      isCommentsOpen
                        ? 'text-rose-400 bg-rose-500/15'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span className="tabular-nums">{comments.length} izoh</span>
                  </button>
                </div>

                {/* Collapsible Comments Area (hidden until user clicks the comment toggle button) */}
                {isCommentsOpen && (
                  <div
                    data-testid={`comments-panel-${post.id}`}
                    className="px-4 sm:px-5 py-3.5 bg-[#0D0F16] border-t border-white/[0.06] space-y-3"
                  >
                    {comments.length > 0 ? (
                      <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                        {comments.map((c) => {
                          const commentLiveUser =
                            usersList.find((u) => u.uid === c.authorUid || (c.authorId && u.id === c.authorId)) ||
                            (currentUser && (currentUser.uid === c.authorUid || currentUser.id === c.authorId)
                              ? currentUser
                              : null);
                          const commentAvatar = resolveApiMediaUrl(
                            commentLiveUser?.avatar ||
                              c.authorAvatar ||
                              `https://ui-avatars.com/api/?name=${encodeURIComponent(commentLiveUser?.name || c.authorName || 'U')}&background=1C1F2B&color=F4F4F6`
                          );
                          const commentName = commentLiveUser?.name || c.authorName || 'Foydalanuvchi';
                          const commentUsername = commentLiveUser?.username || c.authorUsername || '';
                          const commentLikes = Array.isArray(c.likes) ? c.likes : [];
                          const isCommentLikedByMe = Boolean(currentUser?.uid && commentLikes.includes(currentUser.uid));
                          const authorLikedComment = didPostAuthorLikeComment(post, c);
                          const isCommentAuthorSameAsPost = isActorPostAuthor(post, c);
                          const canDeleteThisComment = canUserDeleteComment(post, c, currentUser);
                          const isRepliesOpen = Boolean(expandedReplies[c.id]);
                          const { visibleReplies, hiddenRepliesCount, totalRepliesCount } =
                            splitCommentRepliesForDisplay(post, c, isRepliesOpen);

                          return (
                            <div
                              key={c.id}
                              data-testid={`comment-item-${c.id}`}
                              className="bg-[#151822] p-3 rounded-2xl border border-white/[0.06] space-y-2"
                            >
                              <div className="flex items-start gap-2.5">
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
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                                      if (fallback) fallback.style.display = 'flex';
                                    }}
                                    className="w-8 h-8 rounded-full object-cover border border-white/10 group-hover:ring-2 group-hover:ring-rose-500/50 transition-all"
                                  />
                                  <div
                                    className="hidden w-8 h-8 rounded-full bg-[#1C1F2B] text-rose-400 font-editorial font-black text-xs items-center justify-center border border-white/10"
                                    aria-hidden="true"
                                  >
                                    {commentName.charAt(0).toUpperCase()}
                                  </div>
                                </button>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
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
                                        className="text-xs font-bold text-white hover:text-rose-400 hover:underline transition-colors text-left cursor-pointer"
                                      >
                                        {commentName}
                                      </button>
                                      {isCommentAuthorSameAsPost && (
                                        <span className="text-[10px] font-bold text-amber-300">
                                          · Muallif
                                        </span>
                                      )}
                                      {commentUsername && (
                                        <span className="text-[10px] font-semibold text-zinc-400 font-mono">
                                          {formatUsernameDisplay(commentUsername)}
                                        </span>
                                      )}
                                      <span className="text-[10px] text-zinc-600">·</span>
                                      <span className="text-[10px] text-zinc-500">
                                        {formatPostTimeUz(c.createdAt)}
                                      </span>
                                    </div>

                                    {canDeleteThisComment && (
                                      <button
                                        type="button"
                                        disabled={deletingCommentId === c.id}
                                        onClick={() => handleDeleteComment(post.id, c.id)}
                                        data-testid={`delete-comment-btn-${c.id}`}
                                        aria-label="Izohni o'chirish"
                                        title={viewerIsAdmin ? "Admin sifatida izohni o'chirish" : "Izohni o'chirish"}
                                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/15 transition-colors shrink-0 cursor-pointer disabled:opacity-40"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>

                                  <p className="text-xs text-zinc-200 mt-1 leading-relaxed break-words">
                                    {c.text}
                                  </p>

                                  {/* Comment Actions Row + Author Liked Marker */}
                                  <div className="flex items-center flex-wrap gap-3 mt-2 pt-1.5 border-t border-white/[0.05]">
                                    <button
                                      type="button"
                                      disabled={togglingCommentLikeId === c.id}
                                      onClick={() => handleToggleCommentLike(post.id, c.id)}
                                      data-testid={`like-comment-btn-${c.id}`}
                                      className={`inline-flex items-center gap-1 text-[11px] font-bold py-1 px-2 rounded-lg transition-colors cursor-pointer ${
                                        isCommentLikedByMe
                                          ? 'text-rose-400 bg-rose-500/15'
                                          : 'text-zinc-400 hover:text-rose-400 hover:bg-white/[0.05]'
                                      }`}
                                    >
                                      <Heart className={`w-3.5 h-3.5 ${isCommentLikedByMe ? 'fill-rose-500 text-rose-500' : ''}`} />
                                      <span className="tabular-nums">{commentLikes.length}</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        setOpenReplyComposerId((prev) => (prev === c.id ? null : c.id))
                                      }
                                      data-testid={`reply-comment-btn-${c.id}`}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-white py-1 px-2 rounded-lg hover:bg-white/[0.05] transition-colors cursor-pointer"
                                    >
                                      <Reply className="w-3.5 h-3.5" />
                                      <span>Javob yozish</span>
                                    </button>

                                    {authorLikedComment && (
                                      <span
                                        data-testid={`author-liked-badge-${c.id}`}
                                        className="inline-flex items-center gap-1 text-[10.5px] font-bold text-rose-300"
                                      >
                                        <Heart className="w-3 h-3 fill-rose-500 text-rose-500" />
                                        <span>Muallifga yoqdi</span>
                                      </span>
                                    )}
                                  </div>

                                  {/* Replies List: Author replies show immediately, other replies hidden until user clicks "Javoblarni ko'rish" */}
                                  {(visibleReplies.length > 0 || hiddenRepliesCount > 0) && (
                                    <div
                                      data-testid={`comment-replies-section-${c.id}`}
                                      className="mt-2.5 pl-3 border-l border-white/10 space-y-2"
                                    >
                                      {visibleReplies.map((r) => {
                                        const replyLiveUser =
                                          usersList.find(
                                            (u) => u.uid === r.authorUid || (r.authorId && u.id === r.authorId)
                                          ) ||
                                          (currentUser && (currentUser.uid === r.authorUid || currentUser.id === r.authorId)
                                            ? currentUser
                                            : null);
                                        const replyAvatar = resolveApiMediaUrl(
                                          replyLiveUser?.avatar ||
                                            r.authorAvatar ||
                                            `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                              replyLiveUser?.name || r.authorName || 'U'
                                            )}&background=1C1F2B&color=F4F4F6`
                                        );
                                        const replyName = replyLiveUser?.name || r.authorName || 'Foydalanuvchi';
                                        const replyIsAuthor = isActorPostAuthor(post, r);
                                        const canDeleteThisReply = canUserDeleteComment(post, r, currentUser);

                                        return (
                                          <div
                                            key={r.id}
                                            data-testid={`reply-item-${r.id}`}
                                            data-author-reply={replyIsAuthor ? 'true' : 'false'}
                                            className={`flex items-start gap-2 p-2 rounded-xl border ${
                                              replyIsAuthor
                                                ? 'bg-rose-500/[0.08] border-rose-500/25'
                                                : 'bg-[#10121B] border-white/[0.05]'
                                            }`}
                                          >
                                            <img
                                              src={replyAvatar}
                                              alt={replyName}
                                              className="w-6 h-6 rounded-full object-cover border border-white/10 shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-start justify-between gap-1.5">
                                                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                                                  <button
                                                    type="button"
                                                    onClick={() => onOpenProfile(r.authorUid, replyLiveUser || r)}
                                                    className="font-bold text-white hover:text-rose-400 transition-colors cursor-pointer"
                                                  >
                                                    {replyName}
                                                  </button>
                                                  {replyIsAuthor && (
                                                    <span
                                                      data-testid={`author-reply-label-${r.id}`}
                                                      className="text-[10px] font-bold text-rose-300"
                                                    >
                                                      · Avtor javobi
                                                    </span>
                                                  )}
                                                  <span className="text-[10px] text-zinc-600">·</span>
                                                  <span className="text-[10px] text-zinc-500">
                                                    {formatPostTimeUz(r.createdAt)}
                                                  </span>
                                                </div>
                                                {canDeleteThisReply && (
                                                  <button
                                                    type="button"
                                                    disabled={deletingCommentId === r.id}
                                                    onClick={() => handleDeleteReply(post.id, c.id, r.id)}
                                                    data-testid={`delete-reply-btn-${r.id}`}
                                                    aria-label="Javobni o'chirish"
                                                    className="p-1 rounded text-zinc-400 hover:text-rose-400 hover:bg-rose-500/15 transition-colors shrink-0 cursor-pointer"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                )}
                                              </div>
                                              <p className="text-[11.5px] text-zinc-200 mt-0.5 leading-relaxed break-words">
                                                {r.text}
                                              </p>
                                            </div>
                                          </div>
                                        );
                                      })}

                                      {hiddenRepliesCount > 0 && !isRepliesOpen && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedReplies((prev) => ({ ...prev, [c.id]: true }))
                                          }
                                          data-testid={`toggle-replies-btn-${c.id}`}
                                          className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-300 hover:text-rose-200 py-1 cursor-pointer"
                                        >
                                          <ChevronDown className="w-3.5 h-3.5" />
                                          <span>Javoblarni ko&apos;rish ({hiddenRepliesCount})</span>
                                        </button>
                                      )}

                                      {isRepliesOpen && totalRepliesCount > 0 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setExpandedReplies((prev) => ({ ...prev, [c.id]: false }))
                                          }
                                          data-testid={`toggle-replies-btn-${c.id}`}
                                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 py-1 cursor-pointer"
                                        >
                                          <ChevronUp className="w-3.5 h-3.5" />
                                          <span>Javoblarni yashirish</span>
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* Inline Reply Composer */}
                                  {openReplyComposerId === c.id && (
                                    <form
                                      onSubmit={(e) => handleAddReply(post.id, c.id, e)}
                                      className="flex items-center gap-1.5 mt-2"
                                      data-testid={`reply-form-${c.id}`}
                                    >
                                      <input
                                        type="text"
                                        value={replyInputs[c.id] || ''}
                                        onChange={(e) =>
                                          setReplyInputs((prev) => ({ ...prev, [c.id]: e.target.value }))
                                        }
                                        placeholder={`${commentName}ga javob yozing...`}
                                        data-testid={`reply-input-${c.id}`}
                                        className="flex-1 px-3 py-1.5 bg-[#0D0F16] border border-white/10 rounded-xl text-[11.5px] text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                                      />
                                      <button
                                        type="submit"
                                        disabled={submittingReplyId === c.id || !(replyInputs[c.id] || '').trim()}
                                        data-testid={`reply-submit-${c.id}`}
                                        aria-label="Javob yuborish"
                                        className="px-3 py-1.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-[11px] font-bold disabled:opacity-40 cursor-pointer shrink-0"
                                      >
                                        Yuborish
                                      </button>
                                    </form>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-500">
                        Hali izohlar yo'q. Birinchi bo'lib fikringizni qoldiring.
                      </p>
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
                        className="flex-1 px-3.5 py-2.5 bg-[#151822] border border-white/10 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
                      />
                      <button
                        type="submit"
                        disabled={submittingCommentId === post.id || !(commentInputs[post.id] || '').trim()}
                        data-testid={`comment-submit-${post.id}`}
                        aria-label="Izoh yuborish"
                        className="px-3.5 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white transition-colors disabled:opacity-40 flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                )}
              </motion.article>
            );
          })}
        </div>
      )}
    </div>
  );
};
