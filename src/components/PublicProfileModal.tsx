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
import { PostItem, computeAuthorTotalLikes } from '../utils/posts';
import { isUserOnlineStrict, formatLastSeenUz } from '../utils/presence';
import { PostsFeed } from './PostsFeed';

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

  const avatarSrc =
    liveProfile.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(liveProfile.name || 'U')}&background=FDF2F3&color=C93545`;

  return (
    <div
      className="fixed inset-0 z-[140] bg-[#1A1113]/65 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4"
      onClick={onClose}
      data-testid="public-profile-modal"
    >
      <div
        className="bg-[#FDFBF9] w-full max-w-2xl rounded-3xl shadow-2xl border border-[#F2E8E6] overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto flex-1">
          {/* Large Profile Cover Banner */}
          <div className="relative h-44 sm:h-56 w-full bg-gradient-to-br from-[#F7DCD8] via-[#F9E7DC] to-[#EFE0D8] overflow-hidden">
            {liveProfile.banner ? (
              <img
                src={liveProfile.banner}
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
                  className="absolute inset-0 opacity-35"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 22% 28%, rgba(201, 53, 69, 0.22), transparent 55%), radial-gradient(circle at 80% 72%, rgba(200, 155, 84, 0.25), transparent 52%)',
                  }}
                />
                <span className="text-[11px] font-semibold tracking-widest uppercase text-[#837275]/75 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" /> Alov.uz Profil
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/15 pointer-events-none" />

            {/* Top-left live status badge */}
            <div className="absolute top-3.5 left-4 z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/45 backdrop-blur-md text-white text-[11px] font-semibold border border-white/15">
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'
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
              className="absolute top-3.5 right-4 z-10 w-9 h-9 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-md text-white flex items-center justify-center transition-colors border border-white/15"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Main Identity Card */}
          <div className="px-5 sm:px-7 pb-6 bg-[#FFFFFF] border-b border-[#F2E8E6]">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-14 sm:-mt-16 relative z-10">
              <div className="flex items-end gap-4">
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1 bg-[#FFFFFF] shadow-lg shrink-0">
                  <img
                    src={avatarSrc}
                    alt={liveProfile.name}
                    className="w-full h-full rounded-full object-cover border border-[#F2E8E6]"
                  />
                  <span
                    title={presenceLabel}
                    className={`absolute bottom-2 right-2 w-4 h-4 rounded-full border-2 border-white ${
                      isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  />
                  {isFaceVerified && (
                    <span
                      title="Face ID tasdiqlangan"
                      className="absolute bottom-1 left-1 w-6 h-6 rounded-full bg-emerald-600 text-white border-2 border-white flex items-center justify-center shadow"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </div>

              {/* Primary Action Buttons: Obuna bo'lish + Chat + Call + Route */}
              {!isSelf && (
                <div className="flex items-center flex-wrap gap-2 pt-1 sm:pt-0">
                  <button
                    type="button"
                    onClick={() => onToggleFollow(liveProfile)}
                    data-testid="public-profile-follow-btn"
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                      isFollowing
                        ? 'bg-[#FAF4F2] text-[#221719] border border-[#E7D8D5] hover:bg-[#F2E8E6]'
                        : 'bg-gradient-to-r from-[#C93545] to-[#A62433] text-white hover:opacity-95'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-4 h-4 text-emerald-600" />
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
                    className="px-4 py-2.5 rounded-xl bg-[#221719] hover:bg-[#36272A] text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Chat</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onStartCall(liveProfile)}
                    title="Video qo'ng'iroq"
                    aria-label="Video qo'ng'iroq"
                    className="w-10 h-10 rounded-xl bg-[#FAF4F2] hover:bg-[#F2E8E6] border border-[#F2E8E6] text-[#C93545] flex items-center justify-center transition-colors"
                  >
                    <Video className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onShowRoute(liveProfile)}
                    title="Xaritadan masofani ko'rish"
                    aria-label="Xaritada ko'rish"
                    className="w-10 h-10 rounded-xl bg-[#FAF4F2] hover:bg-[#F2E8E6] border border-[#F2E8E6] text-[#36272A] flex items-center justify-center transition-colors"
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
                  className="font-editorial text-2xl sm:text-3xl font-bold text-[#221719] leading-tight"
                  data-testid="public-profile-name"
                >
                  {liveProfile.name || 'Foydalanuvchi'}
                  {liveProfile.age ? `, ${liveProfile.age}` : ''}
                </h2>

                {isAdmin && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#FDF8EE] border border-[#E9D7B2] text-[#9A6F26] text-[11px] font-bold">
                    <Crown className="w-3 h-3" /> Admin
                  </span>
                )}
                {isFaceVerified && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                    <ShieldCheck className="w-3 h-3" /> Face ID
                  </span>
                )}
              </div>

              <div className="flex items-center flex-wrap gap-2 text-xs text-[#6B5B5E] tabular-nums">
                {(() => {
                  const locText = [liveProfile.district, liveProfile.region].filter(Boolean).join(', ') || liveProfile.city || '';
                  return locText ? (
                    <>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#C93545]" />
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
                    <span className="font-semibold text-[#57484B]">ID: {liveProfile.id}</span>
                  </>
                )}
              </div>

              {liveProfile.bio && (
                <div className="mt-3 p-3.5 rounded-2xl bg-[#FAF4F2] border border-[#F2E8E6] text-xs sm:text-sm text-[#36272A] leading-relaxed">
                  {liveProfile.bio}
                </div>
              )}

              {/* Clickable Followers / Following / Likes Strip */}
              <div className="grid grid-cols-3 gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => onOpenConnections(liveProfile, 'followers')}
                  data-testid="public-profile-followers-btn"
                  className="p-3 rounded-2xl bg-[#FAF4F2] hover:bg-[#FDF2F3] border border-[#F2E8E6] text-center transition-colors group"
                >
                  <div className="text-lg sm:text-xl font-bold text-[#221719] group-hover:text-[#C93545] tabular-nums">
                    {followersCount}
                  </div>
                  <div className="text-[11px] font-semibold text-[#6B5B5E]">Obunachilar</div>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenConnections(liveProfile, 'following')}
                  data-testid="public-profile-following-btn"
                  className="p-3 rounded-2xl bg-[#FAF4F2] hover:bg-[#FDF2F3] border border-[#F2E8E6] text-center transition-colors group"
                >
                  <div className="text-lg sm:text-xl font-bold text-[#221719] group-hover:text-[#C93545] tabular-nums">
                    {followingCount}
                  </div>
                  <div className="text-[11px] font-semibold text-[#6B5B5E]">Obunalar</div>
                </button>

                <div className="p-3 rounded-2xl bg-[#FAF4F2] border border-[#F2E8E6] text-center">
                  <div className="text-lg sm:text-xl font-bold text-[#C93545] tabular-nums">
                    {likesCount}
                  </div>
                  <div className="text-[11px] font-semibold text-[#6B5B5E]">Laiklar</div>
                </div>
              </div>

              {/* Face ID verification badge details */}
              {liveProfile.faceId?.verified && (
                <div className="mt-3 p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-emerald-900 truncate">
                        Haqiqiy yuz tekshiruvidan o'tgan
                      </p>
                      <p className="text-[11px] text-emerald-700 truncate">
                        Face ID · {liveProfile.faceId.detectedGender === 'male' ? 'Erkak' : 'Ayol'} tasdiqlangan
                      </p>
                    </div>
                  </div>
                  <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                </div>
              )}
            </div>
          </div>

          {/* 2nd-Person Posts Section */}
          <div className="p-5 sm:p-7 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-editorial text-xl font-bold text-[#221719]">
                Postlar
              </h3>
              <span className="text-xs font-semibold text-[#837275] tabular-nums">
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
      </div>
    </div>
  );
};
