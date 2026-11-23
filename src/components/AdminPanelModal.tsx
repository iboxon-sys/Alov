import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  X,
  Users,
  Activity,
  Search,
  CheckCircle2,
  Ban,
  Trash2,
  Coins,
  Clock,
  RefreshCw,
  Crown,
  ArrowUpRight,
  ShoppingBag,
  Banknote,
  Check,
  XCircle,
  Inbox,
  Send,
  BellRing,
  Link2,
  AlertTriangle,
  FileText,
  Heart,
  MessageCircle,
  SlidersHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  canManageAdminRoles,
  formatDiamondsDisplay,
  getPendingDiamondsTotal,
  isAdminTelegramUser,
  isPrimaryAdminUser,
} from '../utils/tokenomics';
import { AdminBadge } from './AdminBadge';
import { resolveEffectiveProfileAvatar } from '../utils/faceId';
import { calculateAgeFromBirthDate, deriveBirthDateFromAge } from '../utils/profileSync';
import { resolveApiMediaUrl } from '../config/api';
import type { CoinPurchaseRequest } from '../utils/coinRequests';
import {
  DEFAULT_MANDATORY_SUBSCRIPTION_CONFIG,
  type MandatorySubscriptionConfig,
} from '../utils/telegramBotUtils';
import {
  filterPostsForAdminModeration,
  formatPostTimeUz,
  resolvePostAuthorGender,
  type PostItem,
} from '../utils/posts';

interface AdminPanelModalProps {
  currentUser: any;
  apiBaseUrl: string;
  socket?: any;
  onClose: () => void;
  onUserUpdated?: (user: any) => void;
  onUserDeleted?: (uid: string) => void;
  onPostDeleted?: (postId: string) => void;
  onPostUpdated?: (post: PostItem) => void;
  onOpenUserProfile?: (uid: string, snapshot?: any) => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  click: 'Click',
  payme: 'Payme',
  uzum: 'Uzum Bank',
  telegram_stars: 'Telegram Stars',
};

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  currentUser,
  apiBaseUrl,
  socket,
  onClose,
  onUserUpdated,
  onUserDeleted,
  onPostDeleted,
  onPostUpdated,
  onOpenUserProfile,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'requests' | 'posts' | 'users' | 'transactions' | 'telegram'>('requests');
  const [requestTypeFilter, setRequestTypeFilter] = useState<'all' | 'coins' | 'withdrawals'>('all');
  const [onlyPending, setOnlyPending] = useState(false);
  const [userSegment, setUserSegment] = useState<'all' | 'verified' | 'banned' | 'admins'>('all');
  const [postGenderFilter, setPostGenderFilter] = useState<'all' | 'female' | 'male'>('all');
  const [expandedAdminComments, setExpandedAdminComments] = useState<Record<string, boolean>>({});
  const [postSearchQuery, setPostSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<any>({});
  const [users, setUsers] = useState<any[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [coinRequests, setCoinRequests] = useState<CoinPurchaseRequest[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmPurgeNonAdmins, setConfirmPurgeNonAdmins] = useState(false);
  const [purgeConfirmPhrase, setPurgeConfirmPhrase] = useState('');
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);
  const [editingBalanceUid, setEditingBalanceUid] = useState<string | null>(null);
  const [balanceForm, setBalanceForm] = useState<{ coins: string; diamonds: string }>({ coins: '0', diamonds: '0' });
  const [editingDemographicsUid, setEditingDemographicsUid] = useState<string | null>(null);
  const [demographicsForm, setDemographicsForm] = useState<{
    gender: 'female' | 'male';
    age: string;
    birthDate: string;
  }>({ gender: 'female', age: '22', birthDate: '2004-05-15' });

  // Admin Bot Broadcast & Mandatory Channel Subscription states
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastLinkUrl, setBroadcastLinkUrl] = useState('');
  const [broadcastButtonText, setBroadcastButtonText] = useState('');
  const [broadcastTargetMode, setBroadcastTargetMode] = useState<'all' | 'single'>('all');
  const [broadcastTargetInput, setBroadcastTargetInput] = useState('');
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [broadcastStats, setBroadcastStats] = useState<{ totalTargets: number; sentCount: number; failedCount: number } | null>(null);

  const [subConfig, setSubConfig] = useState<MandatorySubscriptionConfig>(DEFAULT_MANDATORY_SUBSCRIPTION_CONFIG);
  const [subBusy, setSubBusy] = useState(false);
  const [subVerifyBusy, setSubVerifyBusy] = useState(false);
  const [canManageAdminsState, setCanManageAdminsState] = useState<boolean>(() =>
    canManageAdminRoles(currentUser)
  );

  const adminUid = currentUser?.uid || '';
  const actorCanManageAdmins = canManageAdminRoles(currentUser) && canManageAdminsState;

  const fetchOverview = async () => {
    if (!adminUid) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/overview?adminUid=${encodeURIComponent(adminUid)}`);
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Admin ma'lumotlarini yuklashda xatolik");
      } else {
        setStats(data.stats || {});
        setUsers(Array.isArray(data.users) ? data.users : []);
        setPosts(Array.isArray(data.posts) ? data.posts : []);
        setWithdrawals(Array.isArray(data.withdrawals) ? data.withdrawals : []);
        setCoinRequests(Array.isArray(data.coinRequests) ? data.coinRequests : []);
        setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
        if (typeof data.canManageAdmins === 'boolean') {
          setCanManageAdminsState(data.canManageAdmins);
        } else {
          setCanManageAdminsState(canManageAdminRoles(currentUser));
        }
      }

      const subRes = await fetch(`${apiBaseUrl}/api/admin/subscription/config?adminUid=${encodeURIComponent(adminUid)}`);
      const subData = await subRes.json().catch(() => null);
      if (subData?.success && subData.config) {
        setSubConfig({ ...DEFAULT_MANDATORY_SUBSCRIPTION_CONFIG, ...subData.config });
      }
    } catch (e: any) {
      setError(e?.message || "Server bilan bog'lanib bo'lmadi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [adminUid]);

  useEffect(() => {
    if (!socket) return;
    const handleCoinReqCreated = (req: CoinPurchaseRequest) => {
      setCoinRequests((prev) => (prev.some((r) => r.id === req.id) ? prev : [req, ...prev]));
    };
    const handleCoinReqUpdated = (req: CoinPurchaseRequest) => {
      setCoinRequests((prev) => prev.map((r) => (r.id === req.id ? req : r)));
    };
    const handleWithdrawalCreated = (w: any) => {
      setWithdrawals((prev) => (prev.some((item) => item.id === w.id) ? prev : [w, ...prev]));
    };
    const handleWithdrawalUpdated = (w: any) => {
      setWithdrawals((prev) => prev.map((item) => (item.id === w.id ? w : item)));
    };
    const handlePostCreated = (post: PostItem) => {
      if (!post?.id) return;
      setPosts((prev) => (prev.some((p) => p.id === post.id) ? prev : [post, ...prev]));
    };
    const handlePostUpdated = (post: PostItem) => {
      if (!post?.id) return;
      setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
    };
    const handlePostDeleted = ({ postId }: { postId?: string }) => {
      if (!postId) return;
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    };
    socket.on('coin_request_created', handleCoinReqCreated);
    socket.on('coin_request_updated', handleCoinReqUpdated);
    socket.on('withdrawal_created', handleWithdrawalCreated);
    socket.on('withdrawal_updated', handleWithdrawalUpdated);
    socket.on('post_created', handlePostCreated);
    socket.on('post_updated', handlePostUpdated);
    socket.on('post_deleted', handlePostDeleted);
    return () => {
      socket.off('coin_request_created', handleCoinReqCreated);
      socket.off('coin_request_updated', handleCoinReqUpdated);
      socket.off('withdrawal_created', handleWithdrawalCreated);
      socket.off('withdrawal_updated', handleWithdrawalUpdated);
      socket.off('post_created', handlePostCreated);
      socket.off('post_updated', handlePostUpdated);
      socket.off('post_deleted', handlePostDeleted);
    };
  }, [socket]);

  const handleUserAction = async (targetUid: string, action: string, extra: Record<string, any> = {}) => {
    setBusyId(targetUid);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/user-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUid, targetUid, action, ...extra }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Amalni bajarishda xatolik');
      } else {
        if (action === 'delete_user') {
          const deletedId = data.deletedUid || targetUid;
          setUsers((prev) => prev.filter((item) => item.uid !== deletedId));
          setConfirmDeleteUid(null);
          setNotice(`"${data.deletedName || deletedId}" bazadan chiqarildi (faqat shu foydalanuvchi o'chirildi).`);
          onUserDeleted?.(deletedId);
        } else if (action === 'set_demographics') {
          setNotice("Foydalanuvchining jinsi va yoshi yangilandi.");
        }
        if (data.user && onUserUpdated) {
          onUserUpdated(data.user);
        }
        await fetchOverview();
      }
    } catch (e: any) {
      setError(e?.message || 'Tarmoq xatoligi');
    } finally {
      setBusyId(null);
    }
  };

  const handleWithdrawalAction = async (withdrawalId: string, action: 'approve' | 'reject') => {
    setBusyId(withdrawalId);
    setError('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/withdrawal-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUid, withdrawalId, action }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Ariza holatini yangilashda xatolik');
      } else {
        if (data.user && onUserUpdated) {
          onUserUpdated(data.user);
        }
        setNotice(action === 'approve' ? 'Pul yechish arizasi tasdiqlandi' : 'Pul yechish arizasi rad etildi');
        await fetchOverview();
      }
    } catch (e: any) {
      setError(e?.message || 'Tarmoq xatoligi');
    } finally {
      setBusyId(null);
    }
  };

  const handleCoinRequestAction = async (
    requestId: string,
    action: 'approve' | 'complete_manual' | 'reject'
  ) => {
    setBusyId(requestId);
    setError('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/coin-request-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUid, requestId, action }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Moneta arizasini ko'rib chiqishda xatolik");
      } else {
        if (data.user && onUserUpdated) {
          onUserUpdated(data.user);
        }
        setNotice(
          action === 'approve'
            ? `Ariza tasdiqlandi va +${data.request?.coinAmount || ''} moneta hisobga qo'shildi`
            : action === 'complete_manual'
            ? "Ariza qo'lda bajarilgan deb belgilandi (moneta qayta qo'shilmadi)"
            : 'Moneta xaridi arizasi rad etildi'
        );
        await fetchOverview();
      }
    } catch (e: any) {
      setError(e?.message || 'Tarmoq xatoligi');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeletePostAsAdmin = async (postId: string) => {
    if (!adminUid || !postId) return;
    setBusyId(postId);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/posts/${encodeURIComponent(postId)}?uid=${encodeURIComponent(adminUid)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: adminUid }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setError(data?.error || "Postni o'chirishda xatolik yuz berdi");
      } else {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        if (onPostDeleted) onPostDeleted(postId);
        setNotice("Post tizimdan butunlay o'chirildi");
      }
    } catch (e: any) {
      setError(e?.message || 'Tarmoq xatoligi');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteCommentAsAdmin = async (postId: string, commentId: string) => {
    if (!adminUid || !postId || !commentId) return;
    setBusyId(commentId);
    setError('');
    setNotice('');
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}?uid=${encodeURIComponent(adminUid)}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: adminUid }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !data?.post) {
        setError(data?.error || "Izohni o'chirishda xatolik yuz berdi");
      } else {
        setPosts((prev) => prev.map((p) => (p.id === postId ? data.post : p)));
        onPostUpdated?.(data.post);
        setNotice("Izoh tizimdan o'chirildi");
      }
    } catch (e: any) {
      setError(e?.message || 'Tarmoq xatoligi');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteReplyAsAdmin = async (postId: string, commentId: string, replyId: string) => {
    if (!adminUid || !postId || !commentId || !replyId) return;
    setBusyId(replyId);
    setError('');
    setNotice('');
    try {
      const res = await fetch(
        `${apiBaseUrl}/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/replies/${encodeURIComponent(replyId)}?uid=${encodeURIComponent(adminUid)}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: adminUid }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success || !data?.post) {
        setError(data?.error || "Javobni o'chirishda xatolik yuz berdi");
      } else {
        setPosts((prev) => prev.map((p) => (p.id === postId ? data.post : p)));
        onPostUpdated?.(data.post);
        setNotice("Javob tizimdan o'chirildi");
      }
    } catch (e: any) {
      setError(e?.message || 'Tarmoq xatoligi');
    } finally {
      setBusyId(null);
    }
  };

  const handlePurgeNonAdmins = async () => {
    setBusyId('purge_non_admins');
    setError('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/purge-non-admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminUid }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Bazani tozalashda xatolik");
      } else {
        setNotice(`Admindan boshqa barcha (${data.removedUsersCount || 0} ta) profil bazadan chiqarildi.`);
        setConfirmPurgeNonAdmins(false);
        setPurgeConfirmPhrase('');
        await fetchOverview();
      }
    } catch (e: any) {
      setError(e?.message || 'Tarmoq xatoligi');
    } finally {
      setBusyId(null);
    }
  };

  const handleSendBotBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastText.trim()) {
      setError("Botga yuboriladigan xabar matnini kiriting!");
      return;
    }
    setBroadcastBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/telegram/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUid,
          messageText: broadcastText.trim(),
          linkUrl: broadcastLinkUrl.trim() || undefined,
          buttonText: broadcastButtonText.trim() || undefined,
          targetMode: broadcastTargetMode,
          targetChatIdOrUid: broadcastTargetMode === 'single' ? broadcastTargetInput.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Botga xabar yuborishda xatolik");
      } else {
        setBroadcastStats({
          totalTargets: Number(data.totalTargets || 0),
          sentCount: Number(data.sentCount || 0),
          failedCount: Number(data.failedCount || 0),
        });
        setNotice(`Xabar @alovuz_bot chatlariga yuborildi (${data.sentCount}/${data.totalTargets})`);
        setBroadcastText('');
      }
    } catch (err: any) {
      setError(err?.message || 'Tarmoq xatoligi');
    } finally {
      setBroadcastBusy(false);
    }
  };

  const handleVerifyChannelBotAdmin = async () => {
    if (!subConfig.channelLink.trim() && !subConfig.channelChatId?.trim()) {
      setError("Tekshirish uchun kanal havolasi (@kanal yoki https://t.me/kanal) kiriting.");
      return;
    }
    setSubVerifyBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/subscription/verify-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUid,
          channelLink: subConfig.channelLink.trim(),
          channelChatId: subConfig.channelChatId?.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.config) {
        setSubConfig({ ...DEFAULT_MANDATORY_SUBSCRIPTION_CONFIG, ...data.config });
      }
      if (data.botIsAdmin) {
        setNotice(`Tasdiqlandi: @alovuz_bot "${data.channelTitle || subConfig.channelLink}" kanalida admin!`);
      } else {
        setError(data.error || "Bot ushbu kanalda admin emas. Avval @alovuz_bot ni kanalga admin qiling.");
      }
    } catch (err: any) {
      setError(err?.message || 'Tarmoq xatoligi');
    } finally {
      setSubVerifyBusy(false);
    }
  };

  const handleSaveSubscriptionConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/subscription/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUid,
          enabled: subConfig.enabled,
          messageText: subConfig.messageText,
          channelLink: subConfig.channelLink,
          channelChatId: subConfig.channelChatId,
          buttonText: subConfig.buttonText,
        }),
      });
      const data = await res.json();
      if (data.config) {
        setSubConfig({ ...DEFAULT_MANDATORY_SUBSCRIPTION_CONFIG, ...data.config });
      }
      if (!data.success) {
        setError(data.error || "Majburiy obuna sozlamalarini saqlab bo'lmadi");
      } else {
        setNotice(
          data.config?.enabled
            ? "Majburiy obuna yoqildi va saqlandi!"
            : "Majburiy obuna sozlamalari saqlandi."
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Tarmoq xatoligi');
    } finally {
      setSubBusy(false);
    }
  };

  const usersByUid = useMemo(() => {
    const map = new Map<string, any>();
    users.forEach((u) => {
      if (u.uid) map.set(u.uid, u);
      if (u.id) map.set(u.id, u);
    });
    return map;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (userSegment === 'verified' && !u.isVerified && !u.faceId?.verified) return false;
      if (userSegment === 'banned' && !u.isBanned) return false;
      if (userSegment === 'admins' && !isAdminTelegramUser(u)) return false;
      if (!q) return true;
      return (
        String(u.name || '').toLowerCase().includes(q) ||
        String(u.username || '').toLowerCase().includes(q) ||
        String(u.id || '').toLowerCase().includes(q) ||
        String(u.telegram || '').toLowerCase().includes(q) ||
        String(u.phone || '').toLowerCase().includes(q)
      );
    });
  }, [users, searchQuery, userSegment]);

  const filteredPosts = useMemo(() => {
    return filterPostsForAdminModeration(posts, {
      genderFilter: postGenderFilter,
      query: postSearchQuery,
      resolveAuthorGender: (p) => {
        const linkedAuthor = usersByUid.get(p.authorUid) || (p.authorId ? usersByUid.get(p.authorId) : undefined);
        return resolvePostAuthorGender(p, linkedAuthor);
      },
    });
  }, [posts, postGenderFilter, postSearchQuery, usersByUid]);

  const pendingCoinCount = coinRequests.filter((r) => r.status === 'pending').length;
  const pendingWithdrawalsCount = withdrawals.filter((w) => w.status === 'pending').length;
  const totalPendingCount = pendingCoinCount + pendingWithdrawalsCount;

  const combinedRequests = useMemo(() => {
    const items: Array<{ kind: 'coin' | 'withdrawal'; createdAt: string; status: string; data: any }> = [];
    if (requestTypeFilter === 'all' || requestTypeFilter === 'coins') {
      coinRequests.forEach((r) => {
        if (!onlyPending || r.status === 'pending') {
          items.push({ kind: 'coin', createdAt: r.createdAt || '', status: r.status, data: r });
        }
      });
    }
    if (requestTypeFilter === 'all' || requestTypeFilter === 'withdrawals') {
      withdrawals.forEach((w) => {
        if (!onlyPending || w.status === 'pending') {
          items.push({ kind: 'withdrawal', createdAt: w.createdAt || '', status: w.status, data: w });
        }
      });
    }
    return items.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [coinRequests, withdrawals, requestTypeFilter, onlyPending]);

  const handleJumpToProfile = (uid: string, fallbackSnapshot?: any) => {
    if (!onOpenUserProfile || !uid) return;
    const matched = usersByUid.get(uid) || fallbackSnapshot;
    onOpenUserProfile(uid, matched);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[130] flex items-center justify-center p-2 sm:p-5 pt-[max(0.5rem,var(--alov-safe-top,0px))] bg-black/80 backdrop-blur-md"
      data-testid="admin-panel-modal"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="bg-[#0E1017] rounded-[28px] w-full max-w-5xl h-[92dvh] max-h-[860px] flex flex-col overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.85)] border border-white/10 text-zinc-100"
      >
        {/* Top Executive Bar */}
        <div className="px-5 sm:px-7 py-4 bg-[#12141E] border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 via-rose-500 to-rose-700 flex items-center justify-center shrink-0 shadow-lg shadow-rose-950/50 border border-white/15">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-editorial font-bold tracking-tight text-white truncate">
                  Alov.uz Boshqaruv Markazi
                </h2>
                <AdminBadge user={currentUser} size="sm" testId="admin-panel-header-badge" />
              </div>
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {currentUser?.name || 'Admin'} · {currentUser?.telegram || '@Salikh_07'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={fetchOverview}
              className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              title="Yangilash"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-rose-400' : ''}`} />
              <span className="hidden sm:inline">Yangilash</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              data-testid="admin-panel-close-btn"
              aria-label="Admin panelni yopish"
              className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-white/[0.08] hover:bg-rose-600 border border-white/15 text-zinc-200 hover:text-white flex items-center justify-center transition shrink-0 cursor-pointer"
              title="Yopish"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hairline-divided 4-Metric KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08] bg-[#0B0C12] border-b border-white/[0.08] shrink-0">
          <div className="px-3.5 sm:px-5 py-2.5 sm:py-3 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-zinc-400 truncate">Foydalanuvchilar</p>
              <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-400 tabular-nums whitespace-nowrap shrink-0">
                {stats.onlineUsers ?? 0} onlayn
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-mono font-bold text-white tabular-nums">
              {stats.totalUsers ?? users.length}
            </p>
          </div>

          <div className="px-3.5 sm:px-5 py-2.5 sm:py-3 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-zinc-400 truncate">Jami Moneta</p>
              <span className="hidden sm:inline text-[11px] text-zinc-400 font-mono whitespace-nowrap shrink-0">1 xabar = 10</span>
            </div>
            <p className="text-xl sm:text-2xl font-mono font-bold text-amber-400 tabular-nums">
              {(stats.totalCoins ?? 0).toLocaleString()}
            </p>
          </div>

          <div className="px-3.5 sm:px-5 py-2.5 sm:py-3 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-zinc-400 truncate">Wallet Almaz</p>
              <span className="text-[10px] sm:text-[11px] text-amber-300 font-mono tabular-nums whitespace-nowrap shrink-0">
                Kutish: {formatDiamondsDisplay(stats.pendingDiamonds ?? 0)}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-mono font-bold text-cyan-400 tabular-nums">
              {formatDiamondsDisplay(stats.totalDiamonds ?? 0)}
            </p>
          </div>

          <div className="px-3.5 sm:px-5 py-2.5 sm:py-3 flex flex-col justify-between gap-1 bg-rose-500/[0.04]">
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-rose-300 truncate">Yangi Arizalar</p>
              <span className="text-[10px] sm:text-[11px] text-zinc-400 font-mono tabular-nums whitespace-nowrap shrink-0">
                {pendingCoinCount}m · {pendingWithdrawalsCount}y
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-mono font-bold text-rose-400 tabular-nums">
              {totalPendingCount}
            </p>
          </div>
        </div>

        {/* Navigation & Sub-Controls Bar */}
        <div className="px-3.5 sm:px-7 py-2.5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 border-b border-white/[0.08] bg-[#11131C] shrink-0">
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 bg-[#090A0F] p-1 rounded-xl border border-white/[0.07] w-full sm:w-auto overflow-x-auto">
            {[
              { id: 'requests' as const, label: 'Arizalar', icon: Inbox, count: coinRequests.length + withdrawals.length, highlight: totalPendingCount > 0 },
              { id: 'posts' as const, label: 'Postlar', icon: FileText, count: posts.length, highlight: false },
              { id: 'users' as const, label: 'Foydalanuvchilar', icon: Users, count: users.length, highlight: false },
              { id: 'transactions' as const, label: 'Tarix', icon: Activity, count: transactions.length, highlight: false },
              { id: 'telegram' as const, label: 'Bot & Obuna', icon: Send, count: subConfig.enabled && subConfig.botIsAdmin ? 'ON' : 'OFF', highlight: subConfig.enabled && subConfig.botIsAdmin },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id)}
                  data-testid={`admin-tab-${tab.id}`}
                  className={`relative px-2.5 sm:px-3.5 py-2 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1.5 sm:gap-2 whitespace-nowrap cursor-pointer ${
                    isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="adminActiveSubTab"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-lg bg-[#E11D48] shadow-sm"
                    />
                  )}
                  <Icon className="w-3.5 h-3.5 relative z-10" />
                  <span className="relative z-10">{tab.label}</span>
                  <span
                    className={`relative z-10 px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : tab.highlight
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-white/10 text-zinc-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {activeSubTab === 'requests' && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-[#090A0F] p-1 rounded-xl border border-white/[0.07] text-[11px] font-semibold">
                {[
                  { id: 'all', label: 'Barchasi' },
                  { id: 'coins', label: 'Moneta' },
                  { id: 'withdrawals', label: 'Pul yechish' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRequestTypeFilter(f.id as any)}
                    className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                      requestTypeFilter === f.id
                        ? 'bg-white/15 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setOnlyPending((p) => !p)}
                className={`px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition cursor-pointer ${
                  onlyPending
                    ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                    : 'bg-[#090A0F] border-white/10 text-zinc-400 hover:text-white'
                }`}
              >
                Faqat kutilayotgan
              </button>
            </div>
          )}

          {activeSubTab === 'posts' && (
            <div className="flex items-center gap-1 bg-[#090A0F] p-1 rounded-xl border border-white/[0.07] text-[11px] font-semibold">
              {[
                { id: 'all', label: 'Barchasi' },
                { id: 'female', label: 'Qizlar' },
                { id: 'male', label: 'Yigitlar' },
              ].map((seg) => (
                <button
                  key={seg.id}
                  type="button"
                  data-testid={`admin-posts-gender-${seg.id}`}
                  onClick={() => setPostGenderFilter(seg.id as any)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    postGenderFilter === seg.id
                      ? 'bg-white/15 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {seg.label}
                </button>
              ))}
            </div>
          )}

          {activeSubTab === 'users' && (
            <div className="flex items-center gap-1 bg-[#090A0F] p-1 rounded-xl border border-white/[0.07] text-[11px] font-semibold">
              {[
                { id: 'all', label: 'Barchasi' },
                { id: 'verified', label: 'Face ID' },
                { id: 'admins', label: 'Admin' },
                { id: 'banned', label: 'Bloklangan' },
              ].map((seg) => (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => setUserSegment(seg.id as any)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    userSegment === seg.id
                      ? 'bg-white/15 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {seg.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status Alerts */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mx-4 sm:mx-7 mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-semibold flex items-center justify-between shrink-0"
            >
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} className="text-rose-300 hover:text-white font-bold ml-3 cursor-pointer">
                ✕
              </button>
            </motion.div>
          )}

          {notice && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mx-4 sm:mx-7 mt-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs font-semibold flex items-center justify-between shrink-0"
            >
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice('')} className="text-emerald-300 hover:text-white font-bold ml-3 cursor-pointer">
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content Viewport */}
        <div className="flex-1 overflow-y-auto p-4 sm:px-7 sm:py-5 bg-[#090A0F]">
          <AnimatePresence mode="wait">
            {activeSubTab === 'requests' && (
              <motion.div
                key="admin-requests-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-3"
              >
                {combinedRequests.length === 0 ? (
                  <div className="bg-[#12141E] rounded-2xl p-10 text-center border border-white/[0.08] space-y-2">
                    <Inbox className="w-8 h-8 text-zinc-500 mx-auto" />
                    <p className="text-sm font-semibold text-zinc-300">Hozircha arizalar mavjud emas</p>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto">
                      Foydalanuvchilar do'kondan moneta sotib olish yoki almaz yechish uchun ariza yuborganda shu yerda ko'rinadi.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.07] bg-[#12141E] rounded-2xl border border-white/10 overflow-hidden">
                    {combinedRequests.map((entry) => {
                      if (entry.kind === 'coin') {
                        const req: CoinPurchaseRequest = entry.data;
                        const linkedUser = usersByUid.get(req.userUid);
                        const avatar = resolveApiMediaUrl(
                          resolveEffectiveProfileAvatar(linkedUser) || req.userAvatar
                        );
                        const displayName = linkedUser?.name || req.userName || req.userUid;
                        const contactDisplay =
                          req.contactInfo || req.userTelegram || req.userPhone || linkedUser?.telegram || linkedUser?.phone || req.userUid;

                        return (
                          <div
                            key={req.id}
                            data-testid={`admin-coin-request-${req.id}`}
                            className="p-4 sm:px-5 hover:bg-white/[0.02] transition space-y-2.5"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-3.5 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handleJumpToProfile(req.userUid, linkedUser)}
                                  title="Profilga o'tish"
                                  className="w-11 h-11 rounded-full overflow-hidden border border-white/15 bg-[#1B1E2B] shrink-0 flex items-center justify-center cursor-pointer hover:border-rose-400 transition"
                                >
                                  {avatar ? (
                                    <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="font-bold text-sm text-rose-300">
                                      {displayName.charAt(0).toUpperCase()}
                                    </span>
                                  )}
                                </button>

                                <div className="min-w-0">
                                  <div className="flex items-center flex-wrap gap-2">
                                    <button
                                      type="button"
                                      data-testid={`admin-request-user-btn-${req.id}`}
                                      onClick={() => handleJumpToProfile(req.userUid, linkedUser)}
                                      className="text-sm font-bold text-white hover:text-rose-400 transition inline-flex items-center gap-1 underline-offset-4 hover:underline cursor-pointer text-left"
                                    >
                                      <span>{displayName}</span>
                                      <ArrowUpRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                    </button>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/25 text-amber-300 text-[10px] font-bold">
                                      <ShoppingBag className="w-3 h-3" />
                                      <span>Moneta buyurtmasi</span>
                                    </span>
                                  </div>
                                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                                    {req.userUsername ? `@${req.userUsername.replace(/^@/, '')} · ` : ''}
                                    {req.createdAt ? new Date(req.createdAt).toLocaleString() : req.userUid}
                                  </p>
                                </div>
                              </div>

                              <div className="text-left sm:text-right shrink-0">
                                <p className="text-base font-mono font-bold text-amber-400 tabular-nums">
                                  {Number(req.coinAmount || 0).toLocaleString()} moneta
                                </p>
                                <p className="text-xs font-mono text-zinc-300 tabular-nums">
                                  {Number(req.uzsAmount || 0).toLocaleString()} so'm · {PAYMENT_LABELS[req.paymentMethod] || req.paymentMethod}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs bg-[#0B0C12] px-3.5 py-2 rounded-xl border border-amber-500/20">
                              <span className="text-zinc-400 font-semibold">Aloqa (Telegram / Tel):</span>
                              <span className="font-mono font-bold text-amber-300 select-all">{contactDisplay}</span>
                            </div>

                            {req.note && (
                              <p className="text-xs text-zinc-300 bg-[#0B0C12] px-3.5 py-2 rounded-xl border border-white/[0.06]">
                                Izoh: {req.note}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                  req.status === 'approved'
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : req.status === 'rejected'
                                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                }`}
                              >
                                {req.status === 'approved'
                                  ? 'Bajarilgan'
                                  : req.status === 'rejected'
                                  ? 'Rad etilgan'
                                  : "To'lov va admin o'tkazmasi kutilmoqda"}
                              </span>

                              {req.status === 'pending' && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={busyId === req.id}
                                    data-testid={`admin-complete-manual-coin-${req.id}`}
                                    onClick={() => handleCoinRequestAction(req.id, 'complete_manual')}
                                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-zinc-100 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                    title="Agar monetni Foydalanuvchilar bo'limidan qo'lda tashlab bo'lgan bo'lsangiz"
                                  >
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Qo'lda berildi (Yopish)</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId === req.id}
                                    data-testid={`admin-approve-coin-${req.id}`}
                                    onClick={() => handleCoinRequestAction(req.id, 'approve')}
                                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>+{Number(req.coinAmount || 0).toLocaleString()} o'tkazish</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busyId === req.id}
                                    data-testid={`admin-reject-coin-${req.id}`}
                                    onClick={() => handleCoinRequestAction(req.id, 'reject')}
                                    className="px-3.5 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>Rad etish</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      const w = entry.data;
                      const linkedUser = usersByUid.get(w.userUid);
                      const avatar = resolveApiMediaUrl(resolveEffectiveProfileAvatar(linkedUser));
                      const displayName = linkedUser?.name || w.userName || w.userUid;
                      const withdrawalContact =
                        w.contactInfo || w.userTelegram || w.userPhone || linkedUser?.telegram || linkedUser?.phone || w.userUid;
                      const withdrawalUsername = w.userUsername || linkedUser?.username;

                      return (
                        <div
                          key={w.id}
                          data-testid={`admin-withdrawal-request-${w.id}`}
                          className="p-4 sm:px-5 hover:bg-white/[0.02] transition space-y-2.5"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3.5 min-w-0">
                              <button
                                type="button"
                                onClick={() => handleJumpToProfile(w.userUid, linkedUser)}
                                title="Profilga o'tish"
                                className="w-11 h-11 rounded-full overflow-hidden border border-white/15 bg-[#1B1E2B] shrink-0 flex items-center justify-center cursor-pointer hover:border-cyan-400 transition"
                              >
                                {avatar ? (
                                  <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="font-bold text-sm text-cyan-300">
                                    {displayName.charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </button>

                              <div className="min-w-0">
                                <div className="flex items-center flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleJumpToProfile(w.userUid, linkedUser)}
                                    className="text-sm font-bold text-white hover:text-cyan-300 transition inline-flex items-center gap-1 underline-offset-4 hover:underline cursor-pointer text-left"
                                  >
                                    <span>{displayName}</span>
                                    <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  </button>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-400/25 text-cyan-300 text-[10px] font-bold">
                                    <Banknote className="w-3 h-3" />
                                    <span>Pul yechish buyurtmasi</span>
                                  </span>
                                </div>
                                <p className="text-xs font-mono text-zinc-400 mt-0.5">
                                  {withdrawalUsername ? `@${String(withdrawalUsername).replace(/^@/, '')} · ` : ''}
                                  Karta: {w.userCard}
                                  {w.createdAt ? ` · ${new Date(w.createdAt).toLocaleString()}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="text-left sm:text-right shrink-0">
                              <p className="text-base font-mono font-bold text-emerald-400 tabular-nums">
                                {Number(w.uzsAmount || 0).toLocaleString()} so'm
                              </p>
                              <p className="text-xs font-mono text-cyan-300 tabular-nums">
                                {formatDiamondsDisplay(w.diamondAmount)} almaz
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs bg-[#0B0C12] px-3.5 py-2 rounded-xl border border-cyan-500/20">
                            <span className="text-zinc-400 font-semibold">Aloqa (Telegram / Tel):</span>
                            <span className="font-mono font-bold text-cyan-300 select-all">{withdrawalContact}</span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <span
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                w.status === 'approved'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : w.status === 'rejected'
                                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {w.status === 'approved'
                                ? "To'lab berilgan"
                                : w.status === 'rejected'
                                ? 'Rad etilgan (almaz qaytarilgan)'
                                : "Admin aloqasi va to'lov kutilmoqda"}
                            </span>

                            {w.status === 'pending' && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busyId === w.id}
                                  data-testid={`admin-approve-withdrawal-${w.id}`}
                                  onClick={() => handleWithdrawalAction(w.id, 'approve')}
                                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>To'landi (Yopish)</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === w.id}
                                  data-testid={`admin-reject-withdrawal-${w.id}`}
                                  onClick={() => handleWithdrawalAction(w.id, 'reject')}
                                  className="px-3.5 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Rad etish</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {activeSubTab === 'posts' && (
              <motion.div
                key="admin-posts-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-3"
                data-testid="admin-posts-panel"
              >
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={postSearchQuery}
                    onChange={(e) => setPostSearchQuery(e.target.value)}
                    placeholder="Post matni, muallif ismi yoki @username bo'yicha qidirish..."
                    data-testid="admin-posts-search-input"
                    className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#12141E] border border-white/10 text-xs font-medium text-white placeholder:text-zinc-500 outline-none focus:border-rose-500"
                  />
                </div>

                {filteredPosts.length === 0 ? (
                  <div className="bg-[#12141E] rounded-2xl p-10 text-center border border-white/10 space-y-2">
                    <FileText className="w-8 h-8 text-zinc-500 mx-auto" />
                    <p className="text-sm font-semibold text-zinc-300">Postlar topilmadi</p>
                    <p className="text-xs text-zinc-500">
                      Qizlar va yigitlar tomonidan joylangan barcha postlar moderatsiya uchun shu yerda ko&apos;rinadi.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredPosts.map((p) => {
                      const linkedAuthor = usersByUid.get(p.authorUid) || (p.authorId ? usersByUid.get(p.authorId) : undefined);
                      const authorAvatar = resolveApiMediaUrl(
                        resolveEffectiveProfileAvatar(linkedAuthor) || p.authorAvatar
                      );
                      const authorGender = resolvePostAuthorGender(p, linkedAuthor);
                      const mediaSrc = p.mediaUrl ? resolveApiMediaUrl(p.mediaUrl) : '';

                      return (
                        <div
                          key={p.id}
                          data-testid={`admin-post-card-${p.id}`}
                          className="bg-[#12141E] rounded-2xl p-4 border border-white/10 flex flex-col justify-between gap-3"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => handleJumpToProfile(p.authorUid, linkedAuthor)}
                                className="flex items-center gap-2.5 min-w-0 text-left group cursor-pointer"
                              >
                                <div className="w-10 h-10 rounded-full overflow-hidden border border-white/15 bg-[#1B1E2B] shrink-0 flex items-center justify-center">
                                  {authorAvatar ? (
                                    <img src={authorAvatar} alt={p.authorName} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="font-black text-sm text-rose-400">
                                      {(p.authorName || 'F').charAt(0).toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center flex-wrap gap-1.5">
                                    <span className="font-bold text-sm text-white group-hover:text-rose-400 transition truncate">
                                      {linkedAuthor?.name || p.authorName}
                                    </span>
                                    {authorGender && (
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                          authorGender === 'female'
                                            ? 'bg-pink-500/15 text-pink-300 border-pink-500/30'
                                            : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                        }`}
                                      >
                                        {authorGender === 'female' ? 'Qiz' : 'Yigit'}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-zinc-400 truncate">
                                    {p.authorUsername ? `@${p.authorUsername.replace(/^@/, '')}` : p.authorUid} · {formatPostTimeUz(p.createdAt)} · {p.type}
                                  </p>
                                </div>
                              </button>

                              <button
                                type="button"
                                disabled={busyId === p.id}
                                onClick={() => handleDeletePostAsAdmin(p.id)}
                                data-testid={`admin-delete-post-${p.id}`}
                                className="px-3 py-1.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-[11px] font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{busyId === p.id ? "O'chirilmoqda..." : "O'chirish"}</span>
                              </button>
                            </div>

                            {p.caption && (
                              <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-line line-clamp-4 bg-[#0B0C12] p-3 rounded-xl border border-white/[0.06]">
                                {p.caption}
                              </p>
                            )}

                            {p.type === 'photo' && mediaSrc && (
                              <img
                                src={mediaSrc}
                                alt={p.caption || p.authorName}
                                className="w-full h-44 object-cover rounded-xl border border-white/10 bg-[#0A0C12]"
                              />
                            )}

                            {p.type === 'video' && (mediaSrc || p.embedUrl) && (
                              <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
                                {mediaSrc ? (
                                  <video src={mediaSrc} controls preload="metadata" className="w-full max-h-44 object-contain" />
                                ) : (
                                  <p className="p-3 text-[11px] text-zinc-300 truncate">Embed video: {p.embedUrl}</p>
                                )}
                              </div>
                            )}

                            {p.type === 'music' && mediaSrc && (
                              <div className="bg-[#0B0C12] p-2.5 rounded-xl border border-white/[0.06] space-y-1.5">
                                <p className="text-[11px] font-semibold text-amber-300 truncate">
                                  🎵 {p.audioTitle || 'Musiqa'}{p.audioArtist ? ` — ${p.audioArtist}` : ''}
                                </p>
                                <audio src={mediaSrc} controls className="w-full h-8" />
                              </div>
                            )}
                          </div>

                          <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                            <div className="flex items-center justify-between text-[11px] text-zinc-400">
                              <div className="flex items-center gap-3">
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  <Heart className="w-3.5 h-3.5 text-rose-400" />
                                  {Array.isArray(p.likes) ? p.likes.length : 0}
                                </span>
                                <button
                                  type="button"
                                  data-testid={`admin-toggle-post-comments-${p.id}`}
                                  onClick={() =>
                                    setExpandedAdminComments((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                                  }
                                  className="inline-flex items-center gap-1 text-zinc-300 hover:text-rose-300 font-semibold cursor-pointer tabular-nums"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  <span>
                                    {Array.isArray(p.comments) ? p.comments.length : 0} izoh
                                    {Array.isArray(p.comments) && p.comments.length > 0
                                      ? expandedAdminComments[p.id]
                                        ? ' (Yashirish)'
                                        : " (Ko'rish)"
                                      : ''}
                                  </span>
                                </button>
                              </div>
                              <span className="font-mono text-[10px] text-zinc-500">{p.id}</span>
                            </div>

                            {expandedAdminComments[p.id] && Array.isArray(p.comments) && p.comments.length > 0 && (
                              <div
                                data-testid={`admin-post-comments-list-${p.id}`}
                                className="space-y-1.5 max-h-56 overflow-y-auto bg-[#0B0C12] p-2.5 rounded-xl border border-white/[0.06]"
                              >
                                {p.comments.map((c) => (
                                  <div key={c.id} className="space-y-1.5 bg-[#12141E] p-2 rounded-lg border border-white/[0.05]">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-[11px] font-bold text-white truncate">
                                          {c.authorName}{' '}
                                          <span className="text-[10px] font-normal text-zinc-500">
                                            · {formatPostTimeUz(c.createdAt)}
                                          </span>
                                        </p>
                                        <p className="text-[11px] text-zinc-300 break-words">{c.text}</p>
                                      </div>
                                      <button
                                        type="button"
                                        disabled={busyId === c.id}
                                        onClick={() => handleDeleteCommentAsAdmin(p.id, c.id)}
                                        data-testid={`admin-delete-comment-${c.id}`}
                                        aria-label="Izohni o'chirish"
                                        className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white text-[10px] font-bold shrink-0 cursor-pointer"
                                      >
                                        O&apos;chirish
                                      </button>
                                    </div>

                                    {Array.isArray(c.replies) && c.replies.length > 0 && (
                                      <div className="pl-2.5 border-l border-white/10 space-y-1">
                                        {c.replies.map((r) => (
                                          <div key={r.id} className="flex items-start justify-between gap-2 text-[10.5px]">
                                            <div className="min-w-0">
                                              <span className="font-semibold text-zinc-200">{r.authorName}: </span>
                                              <span className="text-zinc-400 break-words">{r.text}</span>
                                            </div>
                                            <button
                                              type="button"
                                              disabled={busyId === r.id}
                                              onClick={() => handleDeleteReplyAsAdmin(p.id, c.id, r.id)}
                                              data-testid={`admin-delete-reply-${r.id}`}
                                              aria-label="Javobni o'chirish"
                                              className="px-1.5 py-0.5 rounded bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white text-[9.5px] font-bold shrink-0 cursor-pointer"
                                            >
                                              O&apos;chirish
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {activeSubTab === 'users' && (
              <motion.div
                key="admin-users-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="space-y-3"
              >
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ism, @username, ID yoki telefon bo'yicha qidirish..."
                    className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#12141E] border border-white/10 text-xs font-medium text-white placeholder:text-zinc-500 outline-none focus:border-rose-500"
                  />
                </div>

                {!actorCanManageAdmins && (
                  <div
                    data-testid="admin-delegated-notice"
                    className="bg-amber-500/10 border border-amber-400/25 rounded-2xl px-4 py-2.5 text-xs text-amber-200 flex items-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4 text-amber-300 shrink-0" />
                    <span>
                      Sizda barcha admin vakolatlari faol. Faqat Bosh Admin (@Salikh_07) boshqa foydalanuvchilarga adminlik bera oladi.
                    </span>
                  </div>
                )}

                {filteredUsers.length === 0 ? (
                  <div className="bg-[#12141E] rounded-2xl p-10 text-center text-xs text-zinc-400 border border-white/10">
                    Qidiruv yoki filtr bo'yicha foydalanuvchi topilmadi.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredUsers.map((u) => {
                      const pending24h = getPendingDiamondsTotal(u.pendingDiamondBatches);
                      const isEditingThis = editingBalanceUid === u.uid;
                      const isEditingDemographicsThis = editingDemographicsUid === u.uid;
                      const isConfirmingDeleteThis = confirmDeleteUid === u.uid;
                      const canEditThisDemographics = !isPrimaryAdminUser(u) || isPrimaryAdminUser(currentUser);
                      const displayAge = calculateAgeFromBirthDate(u.birthDate, Number(u.age || 22));
                      const userAvatar = resolveApiMediaUrl(resolveEffectiveProfileAvatar(u));

                      return (
                        <div
                          key={u.uid}
                          data-testid={`admin-user-card-${u.uid}`}
                          className="bg-[#12141E] rounded-2xl p-4 border border-white/10 space-y-3 flex flex-col justify-between"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <button
                                type="button"
                                onClick={() => handleJumpToProfile(u.uid, u)}
                                className="w-11 h-11 rounded-full overflow-hidden border border-white/15 bg-[#1B1E2B] shrink-0 flex items-center justify-center cursor-pointer hover:border-rose-400 transition"
                                title="Profilga o'tish"
                              >
                                {userAvatar ? (
                                  <img src={userAvatar} alt={u.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="font-black text-sm text-rose-400">
                                    {(u.name || 'F').charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </button>

                              <div className="min-w-0">
                                <div className="flex items-center flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleJumpToProfile(u.uid, u)}
                                    className="font-bold text-sm text-white hover:text-rose-400 transition inline-flex items-center gap-1 truncate cursor-pointer text-left"
                                  >
                                    <span className="truncate">{u.name || 'Nomsiz'}</span>
                                    <ArrowUpRight className="w-3 h-3 text-rose-400 shrink-0" />
                                  </button>
                                  <AdminBadge user={u} size="xs" testId={`admin-user-card-badge-${u.uid}`} />
                                  {u.isVerified && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold">
                                      Tasdiqlangan
                                    </span>
                                  )}
                                  {u.isBanned && (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[9px] font-bold">
                                      Bloklangan
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                                  {u.id} · {u.gender === 'male' ? 'Yigit' : 'Qiz'} · {displayAge} yosh · {u.telegram || u.phone || u.email || u.uid}
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0 text-xs font-mono font-bold space-y-0.5 tabular-nums">
                              <p className="text-amber-400">{Number(u.coins ?? 0).toLocaleString()} moneta</p>
                              <p className="text-cyan-400">{formatDiamondsDisplay(u.diamonds ?? 0)} almaz</p>
                              {pending24h > 0 && <p className="text-purple-300">{formatDiamondsDisplay(pending24h)} kutilmoqda</p>}
                            </div>
                          </div>

                          {isEditingThis && (
                            <div className="flex items-end gap-2 bg-[#0B0C12] p-2.5 rounded-xl border border-white/10">
                              <div className="flex-1">
                                <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Moneta</label>
                                <input
                                  type="number"
                                  value={balanceForm.coins}
                                  onChange={(e) => setBalanceForm((p) => ({ ...p, coins: e.target.value }))}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-white/15 text-xs font-mono font-bold bg-[#131520] text-white outline-none focus:border-amber-400"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Almaz</label>
                                <input
                                  type="number"
                                  step="0.5"
                                  value={balanceForm.diamonds}
                                  onChange={(e) => setBalanceForm((p) => ({ ...p, diamonds: e.target.value }))}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-white/15 text-xs font-mono font-bold bg-[#131520] text-white outline-none focus:border-cyan-400"
                                />
                              </div>
                              <button
                                type="button"
                                disabled={busyId === u.uid}
                                onClick={async () => {
                                  await handleUserAction(u.uid, 'set_balances', {
                                    coins: Number(balanceForm.coins),
                                    diamonds: Number(balanceForm.diamonds),
                                  });
                                  setEditingBalanceUid(null);
                                }}
                                className="px-3 py-2 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-[11px] font-bold cursor-pointer"
                              >
                                Saqlash
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingBalanceUid(null)}
                                className="px-2.5 py-2 rounded-lg bg-white/10 text-zinc-300 text-[11px] font-bold cursor-pointer"
                              >
                                Bekor
                              </button>
                            </div>
                          )}

                          {isEditingDemographicsThis && (
                            <div
                              data-testid={`admin-demographics-editor-${u.uid}`}
                              className="bg-[#0B0C12] p-3 rounded-xl border border-rose-500/25 space-y-2.5"
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Jins</label>
                                  <select
                                    data-testid={`admin-demographics-gender-${u.uid}`}
                                    value={demographicsForm.gender}
                                    onChange={(e) =>
                                      setDemographicsForm((p) => ({
                                        ...p,
                                        gender: e.target.value === 'male' ? 'male' : 'female',
                                      }))
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-white/15 text-xs font-bold bg-[#131520] text-white outline-none focus:border-rose-400"
                                  >
                                    <option value="female" className="bg-[#11131C]">Ayol / Qiz</option>
                                    <option value="male" className="bg-[#11131C]">Erkak / Yigit</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Yosh (18-99)</label>
                                  <input
                                    type="number"
                                    min={18}
                                    max={99}
                                    data-testid={`admin-demographics-age-${u.uid}`}
                                    value={demographicsForm.age}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const n = Math.round(Number(raw));
                                      setDemographicsForm((p) => ({
                                        ...p,
                                        age: raw,
                                        birthDate:
                                          Number.isFinite(n) && n >= 18 && n <= 99
                                            ? deriveBirthDateFromAge(n, p.birthDate)
                                            : p.birthDate,
                                      }));
                                    }}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-white/15 text-xs font-mono font-bold bg-[#131520] text-white outline-none focus:border-rose-400"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold text-zinc-400 block mb-1">Tug&apos;ilgan sana</label>
                                  <input
                                    type="date"
                                    data-testid={`admin-demographics-birthdate-${u.uid}`}
                                    value={demographicsForm.birthDate}
                                    onChange={(e) => {
                                      const nextBd = e.target.value;
                                      const computedAge = calculateAgeFromBirthDate(nextBd, Number(demographicsForm.age || 22));
                                      setDemographicsForm((p) => ({
                                        ...p,
                                        birthDate: nextBd,
                                        age: String(computedAge),
                                      }));
                                    }}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-white/15 text-xs font-semibold bg-[#131520] text-white outline-none focus:border-rose-400"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingDemographicsUid(null)}
                                  className="px-3 py-1.5 rounded-lg bg-white/10 text-zinc-300 text-[11px] font-bold cursor-pointer"
                                >
                                  Bekor
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === u.uid}
                                  data-testid={`admin-save-demographics-btn-${u.uid}`}
                                  onClick={async () => {
                                    await handleUserAction(u.uid, 'set_demographics', {
                                      gender: demographicsForm.gender,
                                      age: Number(demographicsForm.age),
                                      birthDate: demographicsForm.birthDate,
                                    });
                                    setEditingDemographicsUid(null);
                                  }}
                                  className="px-3.5 py-1.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-white text-[11px] font-bold cursor-pointer"
                                >
                                  Saqlash
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/[0.06]">
                            <button
                              type="button"
                              disabled={busyId === u.uid}
                              onClick={() => {
                                setEditingDemographicsUid(null);
                                setEditingBalanceUid(isEditingThis ? null : u.uid);
                                setBalanceForm({
                                  coins: String(u.coins ?? 0),
                                  diamonds: String(u.diamonds ?? 0),
                                });
                              }}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/25 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Coins className="w-3 h-3" />
                              <span>Balans</span>
                            </button>

                            {canEditThisDemographics && (
                              <button
                                type="button"
                                disabled={busyId === u.uid}
                                data-testid={`admin-edit-demographics-btn-${u.uid}`}
                                onClick={() => {
                                  setEditingBalanceUid(null);
                                  const nextAge = calculateAgeFromBirthDate(u.birthDate, Number(u.age || 22));
                                  const nextBirthDate =
                                    u.birthDate || deriveBirthDateFromAge(nextAge);
                                  setEditingDemographicsUid(isEditingDemographicsThis ? null : u.uid);
                                  setDemographicsForm({
                                    gender: u.gender === 'male' ? 'male' : 'female',
                                    age: String(nextAge),
                                    birthDate: nextBirthDate,
                                  });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/25 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <SlidersHorizontal className="w-3 h-3" />
                                <span>Jins / Yosh</span>
                              </button>
                            )}

                            {pending24h > 0 && (
                              <button
                                type="button"
                                disabled={busyId === u.uid}
                                onClick={() => handleUserAction(u.uid, 'unlock_pending_diamonds')}
                                className="px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/25 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Clock className="w-3 h-3" />
                                <span>Almazni ochish</span>
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={busyId === u.uid}
                              onClick={() => handleUserAction(u.uid, 'toggle_verify')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/25 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{u.isVerified ? 'Tasdiqni olish' : 'Tasdiqlash'}</span>
                            </button>

                            {u.uid !== adminUid && (
                              <>
                                {!isPrimaryAdminUser(u) && (!isAdminTelegramUser(u) || actorCanManageAdmins) && (
                                  <button
                                    type="button"
                                    disabled={busyId === u.uid}
                                    data-testid={`admin-toggle-ban-btn-${u.uid}`}
                                    onClick={() => handleUserAction(u.uid, 'toggle_ban')}
                                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 border border-white/10 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Ban className="w-3 h-3" />
                                    <span>{u.isBanned ? 'Blokdan ochish' : 'Bloklash'}</span>
                                  </button>
                                )}
                                {actorCanManageAdmins && !isPrimaryAdminUser(u) && (
                                  <button
                                    type="button"
                                    disabled={busyId === u.uid}
                                    data-testid={`admin-toggle-role-btn-${u.uid}`}
                                    onClick={() => handleUserAction(u.uid, 'toggle_admin')}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/25 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                  >
                                    <ShieldCheck className="w-3 h-3" />
                                    <span>{isAdminTelegramUser(u) ? 'Adminlikni olish' : 'Admin qilish'}</span>
                                  </button>
                                )}
                                {!isPrimaryAdminUser(u) && (!isAdminTelegramUser(u) || actorCanManageAdmins) && (
                                  isConfirmingDeleteThis ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={busyId === u.uid}
                                        data-testid={`admin-confirm-delete-user-btn-${u.uid}`}
                                        onClick={() => handleUserAction(u.uid, 'delete_user')}
                                        className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        <span>Ha, {u.name?.split(' ')[0] || 'chiqarish'}ni chiqarish</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteUid(null)}
                                        className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-300 text-[11px] font-semibold cursor-pointer"
                                      >
                                        Bekor
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={busyId === u.uid}
                                      data-testid={`admin-delete-user-btn-${u.uid}`}
                                      onClick={() => setConfirmDeleteUid(u.uid)}
                                      className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/25 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>Chiqarish</span>
                                    </button>
                                  )
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Isolated Danger Zone: Global Non-Admin Wipe (never near search bar) */}
                {actorCanManageAdmins && users.some((u) => u.uid !== adminUid && !isAdminTelegramUser(u)) && (
                  <div className="mt-4 bg-rose-950/20 border border-rose-500/20 rounded-2xl p-4 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Xavfli hudud: Barcha oddiy foydalanuvchilarni ommaviy tozalash</span>
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Faqat barcha foydalanuvchilarni birdaniga o&apos;chirish kerak bo&apos;lganda ishlating. Bitta odamni chiqarish uchun yuqoridagi profil kartasidan &quot;Chiqarish&quot; tugmasini bosing.
                        </p>
                      </div>
                      {!confirmPurgeNonAdmins && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmPurgeNonAdmins(true);
                            setPurgeConfirmPhrase('');
                          }}
                          data-testid="admin-purge-non-admins-btn"
                          className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[11px] font-bold transition shrink-0 cursor-pointer"
                        >
                          Barchasini tozalash...
                        </button>
                      )}
                    </div>

                    {confirmPurgeNonAdmins && (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={purgeConfirmPhrase}
                          onChange={(e) => setPurgeConfirmPhrase(e.target.value)}
                          placeholder="Tasdiqlash uchun HAMMASINI TOZALASH deb yozing..."
                          className="flex-1 px-3 py-2 rounded-xl bg-[#0B0C12] border border-rose-500/30 text-xs font-mono text-white placeholder:text-zinc-500 outline-none focus:border-rose-400"
                        />
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={busyId === 'purge_non_admins' || purgeConfirmPhrase.trim().toUpperCase() !== 'HAMMASINI TOZALASH'}
                            onClick={handlePurgeNonAdmins}
                            data-testid="admin-confirm-purge-btn"
                            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {busyId === 'purge_non_admins' ? 'Tozalanmoqda...' : 'Tasdiqlab tozalash'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmPurgeNonAdmins(false);
                              setPurgeConfirmPhrase('');
                            }}
                            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 text-xs font-semibold transition cursor-pointer"
                          >
                            Bekor
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {activeSubTab === 'transactions' && (
              <motion.div
                key="admin-transactions-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                {transactions.length === 0 ? (
                  <div className="bg-[#12141E] rounded-2xl p-10 text-center text-xs text-zinc-400 border border-white/10">
                    Tranzaksiyalar mavjud emas.
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06] bg-[#12141E] rounded-2xl border border-white/10 overflow-hidden">
                    {transactions.slice(0, 80).map((t) => (
                      <div
                        key={t.id}
                        className="px-4 py-3.5 hover:bg-white/[0.02] transition flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">{t.note || t.type}</p>
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                            {t.sender || ''} {t.receiver ? `→ ${t.receiver}` : ''} · {new Date(t.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right shrink-0 font-mono font-bold text-xs tabular-nums">
                          {t.coinAmount ? <span className="text-amber-400 block">{t.coinAmount} moneta</span> : null}
                          {t.diamondAmount ? <span className="text-cyan-400 block">+{t.diamondAmount} almaz</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeSubTab === 'telegram' && (
              <motion.div
                key="admin-telegram-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-4"
                data-testid="admin-telegram-panel"
              >
                {/* 1. Bot Chatiga Xabar Yuborish */}
                <form
                  onSubmit={handleSendBotBroadcast}
                  className="bg-[#12141E] rounded-2xl p-5 border border-white/10 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#229ED9]/15 border border-[#229ED9]/30 text-[#38BDF8] flex items-center justify-center shrink-0">
                          <Send className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">Botga Xabar Yuborish (@alovuz_bot)</h3>
                          <p className="text-[11px] text-zinc-400">Barcha bot foydalanuvchilariga yoki bitta chatga xabar</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#090A0F] border border-white/10">
                      <button
                        type="button"
                        onClick={() => setBroadcastTargetMode('all')}
                        className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                          broadcastTargetMode === 'all' ? 'bg-[#229ED9] text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Barcha bot foydalanuvchilari
                      </button>
                      <button
                        type="button"
                        onClick={() => setBroadcastTargetMode('single')}
                        className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                          broadcastTargetMode === 'single' ? 'bg-[#229ED9] text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        Bitta Chat ID / Username
                      </button>
                    </div>

                    {broadcastTargetMode === 'single' && (
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-300 mb-1">
                          Qabul qiluvchi Chat ID yoki @username
                        </label>
                        <input
                          type="text"
                          value={broadcastTargetInput}
                          onChange={(e) => setBroadcastTargetInput(e.target.value)}
                          placeholder="Masalan: 6621230534 yoki @username"
                          data-testid="admin-broadcast-target-input"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0C12] border border-white/10 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-[#38BDF8]"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-300 mb-1">Xabar matni *</label>
                      <textarea
                        rows={4}
                        value={broadcastText}
                        onChange={(e) => setBroadcastText(e.target.value)}
                        placeholder="Foydalanuvchilarga yuboriladigan xabar matnini yozing..."
                        data-testid="admin-broadcast-text-input"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0C12] border border-white/10 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-[#38BDF8] resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-300 mb-1">Havola (ixtiyoriy)</label>
                        <input
                          type="url"
                          value={broadcastLinkUrl}
                          onChange={(e) => setBroadcastLinkUrl(e.target.value)}
                          placeholder="https://t.me/..."
                          data-testid="admin-broadcast-link-input"
                          className="w-full px-3 py-2 rounded-xl bg-[#0B0C12] border border-white/10 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-[#38BDF8]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-300 mb-1">Tugma nomi (ixtiyoriy)</label>
                        <input
                          type="text"
                          value={broadcastButtonText}
                          onChange={(e) => setBroadcastButtonText(e.target.value)}
                          placeholder="Masalan: Ko'rish 🔗"
                          data-testid="admin-broadcast-btn-label-input"
                          className="w-full px-3 py-2 rounded-xl bg-[#0B0C12] border border-white/10 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-[#38BDF8]"
                        />
                      </div>
                    </div>

                    {broadcastStats && (
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-200 flex items-center justify-between">
                        <span>Natija:</span>
                        <span className="font-mono font-bold">
                          Yuborildi: {broadcastStats.sentCount} / {broadcastStats.totalTargets} (Xato: {broadcastStats.failedCount})
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={broadcastBusy}
                    data-testid="admin-broadcast-send-btn"
                    className="w-full py-3 px-4 rounded-xl bg-[#229ED9] hover:bg-[#1b8cc2] text-white text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>{broadcastBusy ? 'Yuborilmoqda...' : 'Bot Chatiga Yuborish'}</span>
                  </button>
                </form>

                {/* 2. Majburiy Kanal Obunasi */}
                <form
                  onSubmit={handleSaveSubscriptionConfig}
                  className="bg-[#12141E] rounded-2xl p-5 border border-white/10 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                          <BellRing className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">Majburiy Kanal Obunasi</h3>
                          <p className="text-[11px] text-zinc-400">Telegram ichidagi foydalanuvchilar uchun obuna nazorati</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={subConfig.enabled}
                        data-testid="admin-sub-enable-toggle"
                        onClick={() => setSubConfig((p) => ({ ...p, enabled: !p.enabled }))}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer shrink-0 ${
                          subConfig.enabled
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-white/5 border-white/15 text-zinc-400'
                        }`}
                      >
                        {subConfig.enabled ? 'Yoqilgan ✓' : "O'chirilgan"}
                      </button>
                    </div>

                    <div
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                        subConfig.botIsAdmin
                          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                          : 'bg-amber-500/10 border-amber-500/25 text-amber-200'
                      }`}
                    >
                      {subConfig.botIsAdmin ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-bold">
                          {subConfig.botIsAdmin
                            ? `Bot kanalga admin qilingan${subConfig.channelTitle ? `: ${subConfig.channelTitle}` : ''}`
                            : 'Bot kanalga adminligi tasdiqlanmagan'}
                        </p>
                        {subConfig.botAdminError && !subConfig.botIsAdmin && (
                          <p className="text-[11px] text-amber-300/90 break-words">{subConfig.botAdminError}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-300 mb-1">Xabar matni</label>
                      <textarea
                        rows={2}
                        value={subConfig.messageText}
                        onChange={(e) => setSubConfig((p) => ({ ...p, messageText: e.target.value }))}
                        placeholder="Ilovadan foydalanish uchun rasmiy kanalimizga obuna bo'ling..."
                        data-testid="admin-sub-message-input"
                        className="w-full px-3.5 py-2 rounded-xl bg-[#0B0C12] border border-white/10 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-rose-500 resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-300 mb-1">Kanal havolasi (@kanal yoki t.me/...)</label>
                        <div className="relative">
                          <Link2 className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={subConfig.channelLink}
                            onChange={(e) => setSubConfig((p) => ({ ...p, channelLink: e.target.value }))}
                            placeholder="https://t.me/alov_uz"
                            data-testid="admin-sub-link-input"
                            className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#0B0C12] border border-white/10 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-rose-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-300 mb-1">Tugma nomi</label>
                        <input
                          type="text"
                          value={subConfig.buttonText}
                          onChange={(e) => setSubConfig((p) => ({ ...p, buttonText: e.target.value }))}
                          placeholder="Kanalga obuna bo'lish"
                          data-testid="admin-sub-btn-label-input"
                          className="w-full px-3 py-2 rounded-xl bg-[#0B0C12] border border-white/10 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-rose-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-300 mb-1">
                        Kanal ID (maxfiy kanallar uchun ixtiyoriy, masalan: -1001234567890)
                      </label>
                      <input
                        type="text"
                        value={subConfig.channelChatId || ''}
                        onChange={(e) => setSubConfig((p) => ({ ...p, channelChatId: e.target.value }))}
                        placeholder="-100..."
                        data-testid="admin-sub-chatid-input"
                        className="w-full px-3 py-2 rounded-xl bg-[#0B0C12] border border-white/10 text-xs font-mono text-white placeholder:text-zinc-500 outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={subVerifyBusy}
                      onClick={handleVerifyChannelBotAdmin}
                      data-testid="admin-sub-verify-bot-btn"
                      className="flex-1 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      {subVerifyBusy ? 'Tekshirilmoqda...' : 'Bot adminligini tekshirish'}
                    </button>
                    <button
                      type="submit"
                      disabled={subBusy}
                      data-testid="admin-sub-save-btn"
                      className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#E11D48] to-rose-600 hover:brightness-110 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                    >
                      {subBusy ? 'Saqlanmoqda...' : 'Saqlash'}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};
