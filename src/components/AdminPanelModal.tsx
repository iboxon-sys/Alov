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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPendingDiamondsTotal } from '../utils/tokenomics';
import { resolveEffectiveProfileAvatar } from '../utils/faceId';
import { resolveApiMediaUrl } from '../config/api';
import type { CoinPurchaseRequest } from '../utils/coinRequests';

interface AdminPanelModalProps {
  currentUser: any;
  apiBaseUrl: string;
  socket?: any;
  onClose: () => void;
  onUserUpdated?: (user: any) => void;
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
  onOpenUserProfile,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'requests' | 'users' | 'transactions'>('requests');
  const [requestTypeFilter, setRequestTypeFilter] = useState<'all' | 'coins' | 'withdrawals'>('all');
  const [onlyPending, setOnlyPending] = useState(false);
  const [userSegment, setUserSegment] = useState<'all' | 'verified' | 'banned' | 'admins'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<any>({});
  const [users, setUsers] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [coinRequests, setCoinRequests] = useState<CoinPurchaseRequest[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingBalanceUid, setEditingBalanceUid] = useState<string | null>(null);
  const [balanceForm, setBalanceForm] = useState<{ coins: string; diamonds: string }>({ coins: '0', diamonds: '0' });

  const adminUid = currentUser?.uid || '';

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
        setWithdrawals(Array.isArray(data.withdrawals) ? data.withdrawals : []);
        setCoinRequests(Array.isArray(data.coinRequests) ? data.coinRequests : []);
        setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
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
    socket.on('coin_request_created', handleCoinReqCreated);
    socket.on('coin_request_updated', handleCoinReqUpdated);
    return () => {
      socket.off('coin_request_created', handleCoinReqCreated);
      socket.off('coin_request_updated', handleCoinReqUpdated);
    };
  }, [socket]);

  const handleUserAction = async (targetUid: string, action: string, extra: Record<string, any> = {}) => {
    setBusyId(targetUid);
    setError('');
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

  const handleCoinRequestAction = async (requestId: string, action: 'approve' | 'reject') => {
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
      if (userSegment === 'admins' && u.role !== 'admin') return false;
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
      className="fixed inset-0 z-[130] flex items-center justify-center p-2 sm:p-5 bg-black/80 backdrop-blur-md"
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
                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[10px] font-bold uppercase tracking-wider shrink-0">
                  Admin
                </span>
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
              className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-rose-600 border border-white/10 text-zinc-200 hover:text-white flex items-center justify-center transition cursor-pointer"
              title="Yopish"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hairline-divided 4-Metric KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08] bg-[#0B0C12] border-b border-white/[0.08] shrink-0">
          <div className="px-4 sm:px-5 py-3 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap">Foydalanuvchilar</p>
              <span className="text-[11px] font-semibold text-emerald-400 tabular-nums whitespace-nowrap">
                {stats.onlineUsers ?? 0} onlayn
              </span>
            </div>
            <p className="text-2xl font-mono font-bold text-white tabular-nums">
              {stats.totalUsers ?? users.length}
            </p>
          </div>

          <div className="px-4 sm:px-5 py-3 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap">Jami Moneta</p>
              <span className="text-[11px] text-zinc-400 font-mono whitespace-nowrap">1 xabar = 5</span>
            </div>
            <p className="text-2xl font-mono font-bold text-amber-400 tabular-nums">
              {(stats.totalCoins ?? 0).toLocaleString()}
            </p>
          </div>

          <div className="px-4 sm:px-5 py-3 flex flex-col justify-between gap-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap">Wallet Almaz</p>
              <span className="text-[11px] text-amber-300 font-mono tabular-nums whitespace-nowrap">
                Kutish: {stats.pendingDiamonds ?? 0}
              </span>
            </div>
            <p className="text-2xl font-mono font-bold text-cyan-400 tabular-nums">
              {(stats.totalDiamonds ?? 0).toLocaleString()}
            </p>
          </div>

          <div className="px-4 sm:px-5 py-3 flex flex-col justify-between gap-1 bg-rose-500/[0.04]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-300 whitespace-nowrap">Yangi Arizalar</p>
              <span className="text-[11px] text-zinc-400 font-mono tabular-nums whitespace-nowrap">
                {pendingCoinCount}m · {pendingWithdrawalsCount}y
              </span>
            </div>
            <p className="text-2xl font-mono font-bold text-rose-400 tabular-nums">
              {totalPendingCount}
            </p>
          </div>
        </div>

        {/* Navigation & Sub-Controls Bar */}
        <div className="px-4 sm:px-7 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#11131C] shrink-0">
          <div className="flex items-center gap-1 bg-[#090A0F] p-1 rounded-xl border border-white/[0.07]">
            {[
              { id: 'requests' as const, label: 'Arizalar', icon: Inbox, count: coinRequests.length + withdrawals.length, highlight: totalPendingCount > 0 },
              { id: 'users' as const, label: 'Foydalanuvchilar', icon: Users, count: users.length, highlight: false },
              { id: 'transactions' as const, label: 'Tarix', icon: Activity, count: transactions.length, highlight: false },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id)}
                  data-testid={`admin-tab-${tab.id}`}
                  className={`relative px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
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
                                      <span>Moneta xaridi</span>
                                    </span>
                                  </div>
                                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                                    {req.userUsername ? `@${req.userUsername.replace(/^@/, '')} · ` : ''}
                                    {req.userTelegram || req.userPhone || req.userUid}
                                    {req.createdAt ? ` · ${new Date(req.createdAt).toLocaleString()}` : ''}
                                  </p>
                                </div>
                              </div>

                              <div className="text-left sm:text-right shrink-0">
                                <p className="text-base font-mono font-bold text-amber-400 tabular-nums">
                                  +{Number(req.coinAmount || 0).toLocaleString()} moneta
                                </p>
                                <p className="text-xs font-mono text-zinc-300 tabular-nums">
                                  {Number(req.uzsAmount || 0).toLocaleString()} so'm · {PAYMENT_LABELS[req.paymentMethod] || req.paymentMethod}
                                </p>
                              </div>
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
                                  ? 'Tasdiqlangan'
                                  : req.status === 'rejected'
                                  ? 'Rad etilgan'
                                  : 'Tasdiq kutilmoqda'}
                              </span>

                              {req.status === 'pending' && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={busyId === req.id}
                                    data-testid={`admin-approve-coin-${req.id}`}
                                    onClick={() => handleCoinRequestAction(req.id, 'approve')}
                                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Tasdiqlash</span>
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

                      return (
                        <div key={w.id} className="p-4 sm:px-5 hover:bg-white/[0.02] transition space-y-2.5">
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
                                    <span>Pul yechish</span>
                                  </span>
                                </div>
                                <p className="text-xs font-mono text-zinc-400 mt-0.5">
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
                                {w.diamondAmount} almaz
                              </p>
                            </div>
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
                                ? 'Tasdiqlangan'
                                : w.status === 'rejected'
                                ? 'Rad etilgan'
                                : 'Kutilmoqda'}
                            </span>

                            {w.status === 'pending' && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busyId === w.id}
                                  onClick={() => handleWithdrawalAction(w.id, 'approve')}
                                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Tasdiqlash</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === w.id}
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

                {filteredUsers.length === 0 ? (
                  <div className="bg-[#12141E] rounded-2xl p-10 text-center text-xs text-zinc-400 border border-white/10">
                    Qidiruv yoki filtr bo'yicha foydalanuvchi topilmadi.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredUsers.map((u) => {
                      const pending24h = getPendingDiamondsTotal(u.pendingDiamondBatches);
                      const isEditingThis = editingBalanceUid === u.uid;
                      const userAvatar = resolveApiMediaUrl(resolveEffectiveProfileAvatar(u));

                      return (
                        <div
                          key={u.uid}
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
                                  {u.role === 'admin' && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-black">
                                      ADMIN
                                    </span>
                                  )}
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
                                  {u.id} · {u.gender === 'male' ? 'Yigit' : 'Qiz'} · {u.telegram || u.phone || u.email || u.uid}
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0 text-xs font-mono font-bold space-y-0.5 tabular-nums">
                              <p className="text-amber-400">{Number(u.coins ?? 0).toLocaleString()} moneta</p>
                              <p className="text-cyan-400">{Number(u.diamonds ?? 0).toLocaleString()} almaz</p>
                              {pending24h > 0 && <p className="text-purple-300">{pending24h} kutilmoqda</p>}
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

                          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/[0.06]">
                            <button
                              type="button"
                              disabled={busyId === u.uid}
                              onClick={() => {
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
                                <button
                                  type="button"
                                  disabled={busyId === u.uid}
                                  onClick={() => handleUserAction(u.uid, 'toggle_ban')}
                                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 border border-white/10 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                  <Ban className="w-3 h-3" />
                                  <span>{u.isBanned ? 'Blokdan ochish' : 'Bloklash'}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === u.uid}
                                  onClick={() => handleUserAction(u.uid, 'toggle_admin')}
                                  className="px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/25 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>{u.role === 'admin' ? 'Adminlikni olish' : 'Admin qilish'}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === u.uid}
                                  onClick={() => handleUserAction(u.uid, 'delete_user')}
                                  className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/25 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>O'chirish</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};
