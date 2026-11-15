import React, { useEffect, useMemo, useState } from 'react';
import { X, Users, UserPlus, UserCheck, ShieldCheck, Search, MapPin } from 'lucide-react';
import { isUserOnlineStrict, formatLastSeenUz } from '../utils/presence';
import { resolveConnectionUsers } from '../utils/profileLookup';
import { getApiUrl, resolveApiMediaUrl } from '../config/api';

interface FollowListModalProps {
  isOpen: boolean;
  targetUser: any | null;
  initialTab: 'followers' | 'following';
  currentUser: any | null;
  usersList: any[];
  onlineUserIds: Set<string>;
  onClose: () => void;
  onOpenProfile: (uid: string, snapshot?: any) => void;
  onToggleFollow: (targetUser: any) => void;
}

export const FollowListModal: React.FC<FollowListModalProps> = ({
  isOpen,
  targetUser,
  initialTab,
  currentUser,
  usersList,
  onlineUserIds,
  onClose,
  onOpenProfile,
  onToggleFollow,
}) => {
  const [activeTab, setActiveTab] = useState<'followers' | 'following'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverFollowers, setServerFollowers] = useState<any[]>([]);
  const [serverFollowing, setServerFollowing] = useState<any[]>([]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, targetUser?.uid]);

  useEffect(() => {
    if (!isOpen || !targetUser?.uid) return;
    setSearchQuery('');
    let cancelled = false;
    setLoading(true);
    fetch(getApiUrl(`/api/users/${encodeURIComponent(targetUser.uid)}/connections`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        setServerFollowers(Array.isArray(data.followers) ? data.followers : []);
        setServerFollowing(Array.isArray(data.following) ? data.following : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, targetUser?.uid]);

  const { followersList, followingList } = useMemo(() => {
    if (!targetUser) return { followersList: [], followingList: [] };

    const freshTarget =
      usersList.find((u) => u.uid === targetUser.uid || u.id === targetUser.id) ||
      (currentUser && (currentUser.uid === targetUser.uid || currentUser.id === targetUser.id) ? currentUser : targetUser);

    const mergedPool = [...usersList];
    for (const u of [...serverFollowers, ...serverFollowing]) {
      if (u?.uid && !mergedPool.some((m) => m.uid === u.uid)) {
        mergedPool.push(u);
      }
    }

    const followerIds: string[] = Array.isArray(freshTarget?.followers) ? freshTarget.followers : [];
    const followingIds: string[] = Array.isArray(freshTarget?.following) ? freshTarget.following : [];

    const resolvedFollowers =
      serverFollowers.length > 0 && followerIds.length === 0
        ? serverFollowers
        : resolveConnectionUsers(followerIds, mergedPool, currentUser);

    const resolvedFollowing =
      serverFollowing.length > 0 && followingIds.length === 0
        ? serverFollowing
        : resolveConnectionUsers(followingIds, mergedPool, currentUser);

    return {
      followersList: resolvedFollowers.length >= serverFollowers.length ? resolvedFollowers : serverFollowers,
      followingList: resolvedFollowing.length >= serverFollowing.length ? resolvedFollowing : serverFollowing,
    };
  }, [targetUser, usersList, currentUser, serverFollowers, serverFollowing]);

  if (!isOpen || !targetUser) return null;

  const displayedList = (activeTab === 'followers' ? followersList : followingList).filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const loc = [u.district, u.region].filter(Boolean).join(', ') || u.city || '';
    return (
      String(u.name || '').toLowerCase().includes(q) ||
      loc.toLowerCase().includes(q) ||
      String(u.id || '').toLowerCase().includes(q)
    );
  });

  const currentFollowingIds: string[] = Array.isArray(currentUser?.following) ? currentUser.following : [];

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
      onClick={onClose}
      data-testid="follow-list-modal"
    >
      <div
        className="bg-[#11131C] text-zinc-100 w-full max-w-md rounded-[28px] shadow-[0_28px_80px_rgba(0,0,0,0.75)] border border-white/10 overflow-hidden flex flex-col max-h-[84vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#151824]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-white/15 shrink-0 bg-[#1B1E2C]">
              <img
                src={resolveApiMediaUrl(targetUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(targetUser.name || 'U')}&background=1F2437&color=F43F5E`)}
                alt={targetUser.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <h3 className="font-editorial text-xl font-bold text-white truncate leading-tight">
                {targetUser.name || 'Foydalanuvchi'}
              </h3>
              <p className="text-[11px] text-zinc-400 truncate">Obuna tarmog'i</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-rose-600 text-zinc-300 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 border-b border-white/[0.08] bg-[#11131C]">
          <button
            type="button"
            onClick={() => setActiveTab('followers')}
            data-testid="tab-followers"
            className={`py-3 text-xs font-bold tracking-wide transition-colors border-b-2 cursor-pointer ${
              activeTab === 'followers'
                ? 'border-rose-500 text-white bg-rose-500/10'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Obunachilar <span className="ml-1 tabular-nums text-zinc-400">({followersList.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('following')}
            data-testid="tab-following"
            className={`py-3 text-xs font-bold tracking-wide transition-colors border-b-2 cursor-pointer ${
              activeTab === 'following'
                ? 'border-rose-500 text-white bg-rose-500/10'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Obunalar <span className="ml-1 tabular-nums text-zinc-400">({followingList.length})</span>
          </button>
        </div>

        {/* Search */}
        {(activeTab === 'followers' ? followersList.length : followingList.length) > 3 && (
          <div className="px-4 pt-3 pb-1">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ism yoki shahar bo'yicha qidirish..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-[#171A26] border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading && displayedList.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">Yuklanmoqda...</div>
          ) : displayedList.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-2 text-zinc-400">
              <Users className="w-8 h-8 text-zinc-600" />
              <p className="text-xs font-medium">
                {activeTab === 'followers' ? "Hozircha obunachilar yo'q" : "Hozircha hech kimga obuna bo'lmagan"}
              </p>
            </div>
          ) : (
            displayedList.map((u) => {
              const liveUser =
                usersList.find((item) => item.uid === u.uid || item.id === u.id) || u;
              const online = isUserOnlineStrict(liveUser, onlineUserIds);
              const isSelf = Boolean(currentUser && (currentUser.uid === liveUser.uid || currentUser.id === liveUser.id));
              const isFollowing =
                currentFollowingIds.includes(liveUser.uid) ||
                (liveUser.id ? currentFollowingIds.includes(liveUser.id) : false);

              return (
                <div
                  key={liveUser.uid || liveUser.id}
                  data-testid={`connection-row-${liveUser.uid}`}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-2xl hover:bg-white/[0.04] transition-colors border border-transparent hover:border-white/[0.08]"
                >
                  <button
                    type="button"
                    aria-label={`${liveUser.name || 'Foydalanuvchi'} profilini ochish`}
                    onClick={() => {
                      onClose();
                      onOpenProfile(liveUser.uid, liveUser);
                    }}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left group cursor-pointer"
                  >
                    <div className="relative w-11 h-11 shrink-0">
                      <img
                        src={resolveApiMediaUrl(
                          liveUser.avatar ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(liveUser.name || 'U')}&background=1F2437&color=F43F5E`
                        )}
                        alt={liveUser.name}
                        className="w-11 h-11 rounded-full object-cover border border-white/15 group-hover:scale-105 transition-transform"
                      />
                      <span
                        title={online ? 'Onlayn' : formatLastSeenUz(liveUser.lastSeen, false)}
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#11131C] ${
                          online ? 'bg-emerald-500' : 'bg-zinc-600'
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold text-white group-hover:text-rose-400 transition-colors truncate">
                          {liveUser.name || 'Foydalanuvchi'}
                        </span>
                        {(liveUser.faceId?.verified || liveUser.isVerified) && (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 truncate">
                        <span className={online ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                          {online ? 'Onlayn' : formatLastSeenUz(liveUser.lastSeen, false)}
                        </span>
                        {(() => {
                          const rowLoc = [liveUser.district, liveUser.region].filter(Boolean).join(', ') || liveUser.city;
                          return rowLoc ? (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5 truncate">
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                {rowLoc}
                              </span>
                            </>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </button>

                  {!isSelf && currentUser && (
                    <button
                      type="button"
                      onClick={() => onToggleFollow(liveUser)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all shrink-0 cursor-pointer ${
                        isFollowing
                          ? 'bg-white/[0.06] text-zinc-200 border border-white/10 hover:bg-white/[0.1]'
                          : 'bg-rose-600 text-white hover:bg-rose-500 shadow-sm'
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Obunada</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Obuna</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
