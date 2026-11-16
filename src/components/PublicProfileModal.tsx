import React from 'react';
import {
  X,
  ShieldCheck,
  MapPin,
  MessageCircle,
  Video,
  Navigation,
  UserPlus,
  UserCheck,
  Crown,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { PostItem, computeAuthorTotalLikes } from '../utils/posts';
import { isUserOnlineStrict, formatLastSeenUz } from '../utils/presence';
import { formatUsernameDisplay } from '../utils/username';
import { resolveEffectiveProfileAvatar } from '../utils/faceId';
import { getSafeUserDisplayName } from '../utils/telegramProfile';
import { PostsFeed } from './PostsFeed';
import { resolveApiMediaUrl } from '../config/api';

interface PublicProfileModalProps {
  profile: any | null;
  currentUser: any | null;
  usersList: any[];
  onlineUserIds: Set<string>;
  posts: PostItem[];
  onClose: () => void;
  onToggleFollow: (user: any) => void;
  onOpenChat: (user: any) => void;
  onStartCall: (user: any) => void;
  onShowRoute: (user: any) => void;
  onOpenConnections: (user: any, tab: 'followers' | 'following') => void;
  onOpenProfile: (uid: string, snapshot?: any) => void;
  onPostCreated: (post: PostItem) => void;
  onPostUpdated: (post: PostItem) => void;
  onPostDeleted: (postId: string) => void;
  onOpenAuth: () => void;
}

export const PublicProfileModal: React.FC<PublicProfileModalProps> = ({
  profile,
  currentUser,
  usersList,
  onlineUserIds,
  posts,
  onClose,
  onToggleFollow,
  onOpenChat,
  onStartCall,
  onShowRoute,
  onOpenConnections,
  onOpenProfile,
  onPostCreated,
  onPostUpdated,
  onPostDeleted,
  onOpenAuth,
}) => {
  if (!profile) return null;

  const liveProfile =
    usersList.find((u) => u.uid === profile.uid || (profile.id && u.id === profile.id)) || profile;

  const isOnline = isUserOnlineStrict(liveProfile, onlineUserIds);
  const presenceLabel = isOnline ? 'Onlayn' : formatLastSeenUz(liveProfile.lastSeen, false);
  const isAdmin = Boolean(
    liveProfile.role === 'admin' || liveProfile.isAdmin || liveProfile.id === 'ALOV-ADMIN'
  );
  const isFaceVerified = Boolean(liveProfile.faceId?.verified || liveProfile.isVerified);
  const followersCount = Array.isArray(liveProfile.followers) ? liveProfile.followers.length : 0;
  const followingCount = Array.isArray(liveProfile.following) ? liveProfile.following.length : 0;
  const postLikesSum = computeAuthorTotalLikes(posts, liveProfile.uid);
  const likesCount = Math.max(Number(liveProfile.likesCount || 0), postLikesSum);

  const currentFollowingIds: string[] = Array.isArray(currentUser?.following) ? currentUser.following : [];
  const isFollowing = Boolean(
    currentUser &&
      (currentFollowingIds.includes(liveProfile.uid) ||
        (liveProfile.id && currentFollowingIds.includes(liveProfile.id)))
  );
  const isSelf = Boolean(currentUser && currentUser.uid === liveProfile.uid);

  const avatarSrc = resolveApiMediaUrl(
    resolveEffectiveProfileAvatar(liveProfile) ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(liveProfile.name || 'U')}&background=1C1F2B&color=F4F4F6`
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[150] bg-black/75 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4"
      onClick={onClose}
      data-testid="public-profile-modal"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="bg-[#0F1118] w-full max-w-2xl rounded-[28px] shadow-[0_30px_90px_rgba(0,0,0,0.85)] border border-white/10 overflow-hidden flex flex-col max-h-[92vh] text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto flex-1">
          {/* Large Profile Cover Banner */}
          <div className="relative h-44 sm:h-56 w-full bg-gradient-to-br from-[#1C141A] via-[#1A1624] to-[#121622] overflow-hidden">
            {liveProfile.banner ? (
              <img
                src={resolveApiMediaUrl(liveProfile.banner)}
                alt={`${liveProfile.name || 'Foydalanuvchi'} banneri`}
                className="w-full h-full object-cover"
                data-testid="public-profile-banner-img"
                onError={(e: any) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-full relative flex items-center justify-center">
                <div
                  className="absolute inset-0 opacity-60"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 22% 28%, rgba(225, 29, 72, 0.25), transparent 55%), radial-gradient(circle at 80% 72%, rgba(245, 158, 11, 0.14), transparent 52%)',
                  }}
                />
                <span className="text-[11px] font-semibold tracking-widest uppercase text-zinc-400 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-rose-400" /> Alov.uz Profil
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F1118] via-transparent to-black/30 pointer-events-none" />

            {/* Top-left live status badge */}
            <div className="absolute top-3.5 left-4 z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/55 backdrop-blur-md text-white text-[11px] font-semibold border border-white/15">
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? 'bg-emerald-400' : 'bg-zinc-400'
                }`}
              />
              <span data-testid="public-profile-presence">{presenceLabel}</span>
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Profilni yopish"
              data-testid="public-profile-close-btn"
              className="absolute top-3.5 right-4 z-10 w-9 h-9 rounded-full bg-black/55 hover:bg-rose-600 backdrop-blur-md text-white flex items-center justify-center transition-colors border border-white/15 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Main Identity Card */}
          <div className="px-5 sm:px-7 pb-6 bg-[#11131B] border-b border-white/[0.08]">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-14 sm:-mt-16 relative z-10">
              <div className="flex items-end gap-4">
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1 bg-[#11131B] shadow-xl shrink-0 border border-white/10">
                  <img
                    src={avatarSrc}
                    alt={liveProfile.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                  <span
                    title={presenceLabel}
                    className={`absolute bottom-2 right-2 w-4 h-4 rounded-full border-2 border-[#11131B] ${
                      isOnline ? 'bg-emerald-500' : 'bg-zinc-500'
                    }`}
                  />
                  {isFaceVerified && (
                    <span
                      title="Face ID tasdiqlangan"
                      className="absolute bottom-1 left-1 w-6 h-6 rounded-full bg-emerald-600 text-white border-2 border-[#11131B] flex items-center justify-center shadow"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </div>

              {/* Primary Action Buttons */}
              {!isSelf && (
                <div className="flex items-center flex-wrap gap-2 pt-1 sm:pt-0">
                  <button
                    type="button"
                    onClick={() => onToggleFollow(liveProfile)}
                    data-testid="public-profile-follow-btn"
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isFollowing
                        ? 'bg-white/[0.08] text-zinc-100 border border-white/15 hover:bg-white/[0.14]'
                        : 'bg-[#E11D48] hover:bg-[#BE123C] text-white shadow-lg shadow-rose-950/50'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-4 h-4 text-emerald-400" />
                        <span>Obuna bo'lingan</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>Obuna bo'lish</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenChat(liveProfile)}
                    data-testid="public-profile-chat-btn"
                    className="px-4 py-2.5 rounded-xl bg-white text-[#11131B] hover:bg-zinc-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Chat</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onStartCall(liveProfile)}
                    title="Video qo'ng'iroq"
                    aria-label="Video qo'ng'iroq"
                    className="w-10 h-10 rounded-xl bg-white/[0.06] hover:bg-rose-500/20 border border-white/10 text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onShowRoute(liveProfile)}
                    title="Xaritadan masofani ko'rish"
                    aria-label="Xaritada ko'rish"
                    className="w-10 h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Navigation className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Name, Tags & Metadata */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center flex-wrap gap-2">
                <h2
                  className="font-editorial text-2xl sm:text-3xl font-bold text-white leading-tight"
                  data-testid="public-profile-name"
                >
                  {getSafeUserDisplayName(liveProfile, 'Foydalanuvchi')}
                  {liveProfile.age ? `, ${liveProfile.age}` : ''}
                </h2>

                {isAdmin && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[11px] font-bold">
                    <Crown className="w-3 h-3" /> Admin
                  </span>
                )}
                {isFaceVerified && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold">
                    <ShieldCheck className="w-3 h-3" /> Face ID
                  </span>
                )}
              </div>

              <div className="flex items-center flex-wrap gap-2 text-xs text-zinc-400 tabular-nums">
                {liveProfile.username && (
                  <>
                    <span className="font-mono font-bold text-rose-400">
                      {formatUsernameDisplay(liveProfile.username)}
                    </span>
                    <span>·</span>
                  </>
                )}
                {(() => {
                  const locText = [liveProfile.district, liveProfile.region].filter(Boolean).join(', ') || liveProfile.city || '';
                  return locText ? (
                    <>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-400" />
                        {locText}
                      </span>
                      <span>·</span>
                    </>
                  ) : null;
                })()}
                <span>{liveProfile.gender === 'male' ? 'Yigit' : 'Qiz'}</span>
                {liveProfile.id && (
                  <>
                    <span>·</span>
                    <span className="font-mono font-semibold text-zinc-300">ID: {liveProfile.id}</span>
                  </>
                )}
              </div>

              {liveProfile.bio && (
                <p className="mt-3 text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-xl">
                  {liveProfile.bio}
                </p>
              )}

              {/* Hairline-divided Interactive Stats Row */}
              <div className="mt-4 pt-4 border-t border-white/[0.08] grid grid-cols-3 divide-x divide-white/[0.08] text-center">
                <button
                  type="button"
                  onClick={() => onOpenConnections(liveProfile, 'followers')}
                  data-testid="public-profile-followers-btn"
                  className="px-2 py-1 hover:bg-white/[0.03] transition-colors group cursor-pointer"
                >
                  <div className="text-lg sm:text-xl font-bold text-white group-hover:text-rose-400 tabular-nums">
                    {followersCount}
                  </div>
                  <div className="text-[11px] font-semibold text-zinc-400">Obunachilar</div>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenConnections(liveProfile, 'following')}
                  data-testid="public-profile-following-btn"
                  className="px-2 py-1 hover:bg-white/[0.03] transition-colors group cursor-pointer"
                >
                  <div className="text-lg sm:text-xl font-bold text-white group-hover:text-rose-400 tabular-nums">
                    {followingCount}
                  </div>
                  <div className="text-[11px] font-semibold text-zinc-400">Obunalar</div>
                </button>

                <div className="px-2 py-1">
                  <div className="text-lg sm:text-xl font-bold text-rose-400 tabular-nums">
                    {likesCount}
                  </div>
                  <div className="text-[11px] font-semibold text-zinc-400">Laiklar</div>
                </div>
              </div>

              {liveProfile.faceId?.verified && (
                <div className="mt-3 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-emerald-200 truncate">
                        Haqiqiy yuz tekshiruvidan o'tgan
                      </p>
                      <p className="text-[11px] text-emerald-300/80 truncate">
                        Face ID · {liveProfile.faceId.detectedGender === 'male' ? 'Erkak' : 'Ayol'} tasdiqlangan
                      </p>
                    </div>
                  </div>
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                </div>
              )}
            </div>
          </div>

          {/* 2nd-Person Posts Section */}
          <div className="p-5 sm:p-7 space-y-4 bg-[#0B0C12]">
            <div className="flex items-center justify-between">
              <h3 className="font-editorial text-xl font-bold text-white">Postlar</h3>
              <span className="text-xs font-semibold text-zinc-400 tabular-nums">
                {posts.filter((p) => p.authorUid === liveProfile.uid).length} ta post
              </span>
            </div>

            <PostsFeed
              posts={posts}
              currentUser={currentUser}
              usersList={usersList}
              onlineUserIds={onlineUserIds}
              authorUid={liveProfile.uid}
              allowCompose={false}
              onPostCreated={onPostCreated}
              onPostUpdated={onPostUpdated}
              onPostDeleted={onPostDeleted}
              onOpenProfile={onOpenProfile}
              onOpenAuth={onOpenAuth}
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
