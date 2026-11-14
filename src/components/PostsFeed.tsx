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
} from 'lucide-react';
import { PostItem, PostMediaType, formatPostTimeUz, validateNewPostDraft } from '../utils/posts';
import { isUserOnlineStrict } from '../utils/presence';

interface MusicPlayerCardProps {
  mediaUrl: string;
  title?: string;
  artist?: string;
  coverUrl?: string;
}

const MusicPlayerCard: React.FC<MusicPlayerCardProps> = ({ mediaUrl, title, artist, coverUrl }) => {
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
          className="relative w-14 h-14 rounded-2xl shrink-0 bg-[#1A1113] border border-[#C89B54]/40 flex items-center justify-center overflow-hidden group hover:border-[#C89B54] transition-all"
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
  const [draftType, setDraftType] = useState<PostMediaType>('photo');
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [audioTitle, setAudioTitle] = useState('');
  const [audioArtist, setAudioArtist] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [draftError, setDraftError] = useState('');

  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [submittingCommentId, setSubmittingCommentId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const visiblePosts = posts.filter((p) => {
    if (authorUid && p.authorUid !== authorUid) return false;
    if (!authorUid && filterType !== 'all' && p.type !== filterType) return false;
    return true;
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDraftError('');

    if (file.size > 30 * 1024 * 1024) {
      setDraftError('Fayl hajmi 30 MB dan oshmasligi kerak.');
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
        setDraftError(data?.error || 'Faylni yuklab bo\'lmadi.');
      } else {
        setMediaUrl(data.url);
        if (draftType === 'music' && !audioTitle) {
          const cleanName = file.name.replace(/\.[^.]+$/, '');
          setAudioTitle(cleanName);
        }
      }
    } catch {
      setDraftError('Server bilan aloqa uzildi.');
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
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
      setDraftError(check.error || 'Post ma\'lumotlarini tekshiring.');
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorUid: currentUser.uid,
          type: draftType,
          caption,
          mediaUrl,
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
      setCaption('');
      setMediaUrl('');
      setAudioTitle('');
      setAudioArtist('');
      setShowUrlInput(false);
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
        body: JSON.stringify({ authorUid: currentUser.uid, text }),
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
        if (onNotify) onNotify('Post o\'chirildi');
      }
    } catch {}
  };

  const acceptAttr =
    draftType === 'photo'
      ? 'image/*'
      : draftType === 'video'
        ? 'video/*'
        : draftType === 'music'
          ? 'audio/*,.mp3,.wav,.ogg,.m4a'
          : '*/*';

  return (
    <div className="space-y-5" data-testid={authorUid ? `profile-posts-${authorUid}` : 'global-posts-feed'}>
      {/* Composer Card */}
      {allowCompose && (
        <form
          onSubmit={handlePublishPost}
          className="bg-[#FFFFFF] rounded-3xl border border-[#F2E8E6] shadow-subtle p-4 sm:p-5 space-y-4"
          data-testid="post-composer"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              {currentUser ? (
                <img
                  src={currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name || 'U')}&background=FDF2F3&color=C93545`}
                  alt={currentUser.name}
                  className="w-9 h-9 rounded-full object-cover border border-[#F2E8E6]"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#FDF2F3] border border-[#F2E8E6] flex items-center justify-center text-[#C93545]">
                  <Sparkles className="w-4 h-4" />
                </div>
              )}
              <div>
                <h3 className="font-editorial text-lg font-bold text-[#221719] leading-none">Yangi post joylash</h3>
                <p className="text-[11px] text-[#837275] mt-0.5">Rasm, video, musiqa yoki fikringizni ulashing</p>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-[#FAF4F2] p-1 rounded-xl border border-[#F2E8E6]">
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
                      setDraftError('');
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      active
                        ? 'bg-[#C93545] text-white shadow-sm'
                        : 'text-[#6B5B5E] hover:text-[#221719]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={2}
            placeholder={
              draftType === 'music'
                ? 'Ushbu musiqa haqida taassurotingiz...'
                : 'Bugungi kayfiyat yoki chiroyli xotirangiz bilan bo\'lishing...'
            }
            data-testid="post-caption-input"
            className="w-full px-3.5 py-2.5 bg-[#FAF4F2] border border-[#F2E8E6] rounded-2xl text-sm text-[#221719] placeholder-[#837275] focus:outline-none focus:border-[#C93545] resize-none"
          />

          {draftType === 'music' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={audioTitle}
                onChange={(e) => setAudioTitle(e.target.value)}
                placeholder="Musiqa nomi (masalan: Bahor)"
                data-testid="post-audio-title-input"
                className="px-3.5 py-2 bg-[#FAF4F2] border border-[#F2E8E6] rounded-xl text-xs text-[#221719] placeholder-[#837275] focus:outline-none focus:border-[#C93545]"
              />
              <input
                type="text"
                value={audioArtist}
                onChange={(e) => setAudioArtist(e.target.value)}
                placeholder="Ijrochi ismi"
                data-testid="post-audio-artist-input"
                className="px-3.5 py-2 bg-[#FAF4F2] border border-[#F2E8E6] rounded-xl text-xs text-[#221719] placeholder-[#837275] focus:outline-none focus:border-[#C93545]"
              />
            </div>
          )}

          {draftType !== 'text' && (
            <div className="space-y-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptAttr}
                onChange={handleFileUpload}
                className="hidden"
                data-testid="post-media-file-input"
              />

              {!mediaUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingMedia}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-[#FAF4F2] hover:bg-[#F2E8E6] border border-dashed border-[#C93545]/40 text-xs font-bold text-[#C93545] flex items-center gap-1.5 transition-colors disabled:opacity-60"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {uploadingMedia
                        ? 'Yuklanmoqda...'
                        : draftType === 'photo'
                          ? 'Rasm tanlash'
                          : draftType === 'video'
                            ? 'Video tanlash'
                            : 'Musiqa tanlash'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowUrlInput((v) => !v)}
                    className="px-3 py-2 rounded-xl bg-[#FAF4F2] hover:bg-[#F2E8E6] text-xs font-semibold text-[#57484B] flex items-center gap-1.5 transition-colors"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>Havola orqali</span>
                  </button>
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-[#F2E8E6] bg-[#FAF4F2]">
                  <button
                    type="button"
                    onClick={() => setMediaUrl('')}
                    aria-label="Mediani olib tashlash"
                    className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  {draftType === 'photo' && (
                    <img src={mediaUrl} alt="Preview" className="w-full max-h-72 object-cover" />
                  )}
                  {draftType === 'video' && (
                    <video src={mediaUrl} controls className="w-full max-h-72 bg-black" />
                  )}
                  {draftType === 'music' && (
                    <div className="p-2">
                      <MusicPlayerCard mediaUrl={mediaUrl} title={audioTitle} artist={audioArtist} />
                    </div>
                  )}
                </div>
              )}

              {showUrlInput && !mediaUrl && (
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://... media havolasini kiriting"
                  data-testid="post-media-url-input"
                  className="w-full px-3.5 py-2 bg-[#FAF4F2] border border-[#F2E8E6] rounded-xl text-xs text-[#221719] placeholder-[#837275] focus:outline-none focus:border-[#C93545]"
                />
              )}
            </div>
          )}

          {draftError && (
            <p className="text-xs font-semibold text-[#C93545] bg-[#FDF2F3] px-3 py-2 rounded-xl border border-[#F2D5D9]">
              {draftError}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={publishing || uploadingMedia}
              data-testid="publish-post-btn"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#C93545] to-[#A62433] text-white text-xs font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{publishing ? 'Joylanmoqda...' : 'Post joylash'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Filter Pills for Global Feed */}
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
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                filterType === tab.key
                  ? 'bg-[#221719] text-white border-[#221719]'
                  : 'bg-[#FFFFFF] text-[#57484B] border-[#F2E8E6] hover:border-[#C93545]/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Posts List */}
      {visiblePosts.length === 0 ? (
        <div className="bg-[#FFFFFF] rounded-3xl border border-[#F2E8E6] p-10 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#FAF4F2] text-[#C93545] flex items-center justify-center mx-auto">
            <Sparkles className="w-5 h-5" />
          </div>
          <p className="font-editorial text-xl font-bold text-[#221719]">Hozircha postlar yo'q</p>
          <p className="text-xs text-[#837275]">
            {authorUid
              ? 'Bu foydalanuvchi hali rasm, video yoki musiqa joylamagan.'
              : 'Birinchi bo\'lib chiroyli rasm, video yoki musiqa ulashing!'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visiblePosts.map((post) => {
            const liveAuthor =
              usersList.find((u) => u.uid === post.authorUid) ||
              (currentUser && currentUser.uid === post.authorUid ? currentUser : null);
            const authorOnline = liveAuthor ? isUserOnlineStrict(liveAuthor, onlineUserIds) : onlineUserIds.has(post.authorUid);
            const authorAvatar =
              liveAuthor?.avatar ||
              post.authorAvatar ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(post.authorName || 'U')}&background=FDF2F3&color=C93545`;
            const authorName = liveAuthor?.name || post.authorName || 'Foydalanuvchi';
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
                    onClick={() => onOpenProfile(post.authorUid, liveAuthor || { uid: post.authorUid, name: authorName, avatar: authorAvatar })}
                    data-testid={`post-author-btn-${post.id}`}
                    className="flex items-center gap-3 min-w-0 text-left group"
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
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold text-[#221719] group-hover:text-[#C93545] transition-colors truncate">
                          {authorName}
                        </span>
                        {authorVerified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
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
                                : 'Post'}
                        </span>
                      </div>
                    </div>
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeletePost(post.id)}
                      aria-label="Postni o'chirish"
                      className="p-2 rounded-xl text-[#837275] hover:text-[#C93545] hover:bg-[#FDF2F3] transition-colors"
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

                {post.type === 'video' && post.mediaUrl && (
                  <div className="px-4 sm:px-5 pb-3">
                    <video
                      src={post.mediaUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full max-h-[480px] rounded-2xl bg-[#1A1113] object-contain border border-[#F2E8E6]"
                    />
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

                {/* Actions */}
                <div className="px-4 sm:px-5 py-2.5 border-t border-[#F2E8E6] flex items-center gap-4 bg-[#FDFBF9]">
                  <button
                    type="button"
                    onClick={() => handleToggleLike(post)}
                    data-testid={`like-post-btn-${post.id}`}
                    className={`flex items-center gap-1.5 text-xs font-bold py-1 px-2.5 rounded-xl transition-all ${
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
                    className="flex items-center gap-1.5 text-xs font-bold py-1 px-2.5 rounded-xl text-[#57484B] hover:text-[#221719] hover:bg-[#FAF4F2] transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span className="tabular-nums">{comments.length} izoh</span>
                  </button>
                </div>

                {/* Comments Area */}
                <div className="px-4 sm:px-5 py-3 bg-[#FAF4F2]/60 border-t border-[#F2E8E6] space-y-2.5">
                  {comments.length > 3 && !showAllComments && (
                    <button
                      type="button"
                      onClick={() => setExpandedComments((prev) => ({ ...prev, [post.id]: true }))}
                      className="text-[11px] font-bold text-[#C93545] hover:underline"
                    >
                      Barcha {comments.length} ta izohni ko'rish
                    </button>
                  )}

                  {displayedComments.map((c) => {
                    const commentLiveUser =
                      usersList.find((u) => u.uid === c.authorUid) ||
                      (currentUser && currentUser.uid === c.authorUid ? currentUser : null);
                    const commentAvatar =
                      commentLiveUser?.avatar ||
                      c.authorAvatar ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(c.authorName || 'U')}&background=FDF2F3&color=C93545`;
                    const commentName = commentLiveUser?.name || c.authorName || 'Foydalanuvchi';

                    return (
                      <div
                        key={c.id}
                        data-testid={`comment-item-${c.id}`}
                        className="flex items-start gap-2.5 bg-[#FFFFFF] p-2.5 rounded-2xl border border-[#F2E8E6]"
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
                                avatar: commentAvatar,
                              }
                            )
                          }
                          data-testid={`comment-author-avatar-${c.id}`}
                          className="shrink-0 group"
                          title={`${commentName} profiliga o'tish`}
                        >
                          <img
                            src={commentAvatar}
                            alt={commentName}
                            className="w-7 h-7 rounded-full object-cover border border-[#F2E8E6] group-hover:ring-2 group-hover:ring-[#C93545]/40 transition-all"
                          />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() =>
                                onOpenProfile(
                                  c.authorUid,
                                  commentLiveUser || {
                                    uid: c.authorUid,
                                    id: c.authorId,
                                    name: commentName,
                                    avatar: commentAvatar,
                                  }
                                )
                              }
                              data-testid={`comment-author-name-${c.id}`}
                              className="text-xs font-bold text-[#221719] hover:text-[#C93545] hover:underline transition-colors text-left"
                            >
                              {commentName}
                            </button>
                            <span className="text-[10px] text-[#837275]">
                              {formatPostTimeUz(c.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-[#36272A] mt-0.5 leading-snug break-words">
                            {c.text}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  <form onSubmit={(e) => handleAddComment(post.id, e)} className="flex items-center gap-2 pt-0.5">
                    <input
                      type="text"
                      value={commentInputs[post.id] || ''}
                      onChange={(e) =>
                        setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))
                      }
                      placeholder={currentUser ? 'Izoh yozing...' : 'Izoh yozish uchun tizimga kiring...'}
                      data-testid={`comment-input-${post.id}`}
                      className="flex-1 px-3.5 py-2 bg-[#FFFFFF] border border-[#F2E8E6] rounded-xl text-xs text-[#221719] placeholder-[#837275] focus:outline-none focus:border-[#C93545]"
                    />
                    <button
                      type="submit"
                      disabled={submittingCommentId === post.id}
                      data-testid={`comment-submit-${post.id}`}
                      aria-label="Izoh yuborish"
                      className="px-3 py-2 rounded-xl bg-[#C93545] text-white hover:bg-[#A62433] transition-colors disabled:opacity-50 flex items-center justify-center shrink-0"
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
