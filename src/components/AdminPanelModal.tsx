import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  X,
  Users,
  Wallet,
  Activity,
  Search,
  CheckCircle2,
  Ban,
  Trash2,
  Coins,
  Sparkles,
  Clock,
  RefreshCw,
  Crown,
} from 'lucide-react';
import { getPendingDiamondsTotal } from '../utils/tokenomics';

interface AdminPanelModalProps {
  currentUser: any;
  apiBaseUrl: string;
  onClose: () => void;
  onUserUpdated?: (user: any) => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  currentUser,
  apiBaseUrl,
  onClose,
  onUserUpdated,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'withdrawals' | 'transactions'>('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<any>({});
  const [users, setUsers] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
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
        setError(data.error || 'Admin ma\'lumotlarini yuklashda xatolik');
      } else {
        setStats(data.stats || {});
        setUsers(Array.isArray(data.users) ? data.users : []);
        setWithdrawals(Array.isArray(data.withdrawals) ? data.withdrawals : []);
        setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      }
    } catch (e: any) {
      setError(e?.message || 'Server bilan bog\'lanib bo\'lmadi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [adminUid]);

  const handleUserAction = async (targetUid: string, action: string, extra: Record<string, any> = {}) => {
    setBusyId(targetUid);
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
        await fetchOverview();
      }
    } catch (e: any) {
      setError(e?.message || 'Tarmoq xatoligi');
    } finally {
      setBusyId(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      String(u.name || '').toLowerCase().includes(q) ||
      String(u.id || '').toLowerCase().includes(q) ||
      String(u.telegram || '').toLowerCase().includes(q) ||
      String(u.phone || '').toLowerCase().includes(q)
    );
  });

  const pendingWithdrawalsCount = withdrawals.filter((w) => w.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md">
      <div className="bg-white rounded-[28px] w-full max-w-2xl h-[90dvh] max-h-[820px] flex flex-col overflow-hidden shadow-2xl border border-slate-200 text-slate-900">
        {/* Top Bar */}
        <div className="px-5 py-4 bg-slate-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center shrink-0 shadow-md">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black tracking-tight truncate">Alov.uz Admin Panel</h2>
              <p className="text-[11px] text-slate-300 truncate">
                Bosh Administrator: {currentUser?.name || 'Admin'} ({currentUser?.telegram || '@Salikh_07'})
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={fetchOverview}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
              title="Yangilash"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 hover:bg-rose-500 text-white transition"
              title="Yopish"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Foydalanuvchilar</p>
            <p className="text-lg font-black text-slate-900 mt-0.5">{stats.totalUsers ?? users.length}</p>
            <p className="text-[10px] font-semibold text-emerald-600">{stats.onlineUsers ?? 0} onlayn</p>
          </div>
          <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Jami Moneta</p>
            <p className="text-lg font-black text-amber-600 mt-0.5">{(stats.totalCoins ?? 0).toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">Xabar: 5 moneta</p>
          </div>
          <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Wallet Almaz</p>
            <p className="text-lg font-black text-cyan-700 mt-0.5">{(stats.totalDiamonds ?? 0).toLocaleString()}</p>
            <p className="text-[10px] text-amber-700 font-semibold">24h kutilmoqda: {stats.pendingDiamonds ?? 0} 💎</p>
          </div>
          <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-xs">
            <p className="text-[10px] font-bold text-slate-500 uppercase">Pul Yechish</p>
            <p className="text-lg font-black text-rose-600 mt-0.5">{pendingWithdrawalsCount}</p>
            <p className="text-[10px] text-slate-500">Kutilayotgan ariza</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 pt-3 flex items-center space-x-2 border-b border-slate-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab('users')}
            className={`px-3.5 py-2 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
              activeSubTab === 'users'
                ? 'border-[#E8474A] text-[#E8474A]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Foydalanuvchilar ({users.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('withdrawals')}
            className={`px-3.5 py-2 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
              activeSubTab === 'withdrawals'
                ? 'border-[#E8474A] text-[#E8474A]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Arizalar ({withdrawals.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('transactions')}
            className={`px-3.5 py-2 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
              activeSubTab === 'transactions'
                ? 'border-[#E8474A] text-[#E8474A]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Tarix ({transactions.length})</span>
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between shrink-0">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} className="text-rose-500 hover:text-rose-700 font-bold ml-2">
              ✕
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
          {activeSubTab === 'users' && (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ism, @username, ID yoki telefon bo'yicha qidirish..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-medium outline-none focus:border-[#E8474A]"
                />
              </div>

              <div className="space-y-2.5">
                {filteredUsers.map((u) => {
                  const pending24h = getPendingDiamondsTotal(u.pendingDiamondBatches);
                  const isEditingThis = editingBalanceUid === u.uid;
                  return (
                    <div
                      key={u.uid}
                      className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-xs space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-3 min-w-0">
                          {u.avatar ? (
                            <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-rose-100 text-[#E8474A] font-black text-sm flex items-center justify-center shrink-0">
                              {(u.name || 'F').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center flex-wrap gap-1.5">
                              <span className="font-bold text-xs text-slate-900 truncate">{u.name || 'Nomsiz'}</span>
                              {u.role === 'admin' && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black">
                                  ADMIN
                                </span>
                              )}
                              {u.isVerified && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold">
                                  Tasdiqlangan
                                </span>
                              )}
                              {u.isBanned && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[9px] font-bold">
                                  Bloklangan
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 truncate">
                              {u.id} • {u.gender === 'male' ? 'Yigit' : 'Qiz'} • {u.telegram || u.phone || u.email || u.uid}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 text-[10px] font-bold space-y-0.5">
                          <p className="text-amber-600">🪙 {u.coins ?? 0}</p>
                          <p className="text-cyan-700">💎 {u.diamonds ?? 0}</p>
                          {pending24h > 0 && <p className="text-purple-600">⏳ {pending24h} 💎</p>}
                        </div>
                      </div>

                      {isEditingThis && (
                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                          <div className="flex-1">
                            <label className="text-[9px] font-bold text-slate-500 block">Moneta</label>
                            <input
                              type="number"
                              value={balanceForm.coins}
                              onChange={(e) => setBalanceForm((p) => ({ ...p, coins: e.target.value }))}
                              className="w-full px-2 py-1 rounded-lg border border-slate-300 text-xs font-bold bg-white"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[9px] font-bold text-slate-500 block">Almaz</label>
                            <input
                              type="number"
                              value={balanceForm.diamonds}
                              onChange={(e) => setBalanceForm((p) => ({ ...p, diamonds: e.target.value }))}
                              className="w-full px-2 py-1 rounded-lg border border-slate-300 text-xs font-bold bg-white"
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
                            className="px-3 py-2 rounded-lg bg-[#E8474A] text-white text-[10px] font-bold mt-3"
                          >
                            Saqlash
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingBalanceUid(null)}
                            className="px-2 py-2 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-bold mt-3"
                          >
                            Bekor
                          </button>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 pt-1">
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
                          className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold flex items-center space-x-1"
                        >
                          <Coins className="w-3 h-3" />
                          <span>Balans</span>
                        </button>

                        {pending24h > 0 && (
                          <button
                            type="button"
                            disabled={busyId === u.uid}
                            onClick={() => handleUserAction(u.uid, 'unlock_pending_diamonds')}
                            className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-bold flex items-center space-x-1"
                          >
                            <Clock className="w-3 h-3" />
                            <span>24h Almazni ochish</span>
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={busyId === u.uid}
                          onClick={() => handleUserAction(u.uid, 'toggle_verify')}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold flex items-center space-x-1"
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
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[10px] font-bold flex items-center space-x-1"
                            >
                              <Ban className="w-3 h-3" />
                              <span>{u.isBanned ? 'Blokdan ochish' : 'Bloklash'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyId === u.uid}
                              onClick={() => handleUserAction(u.uid, 'toggle_admin')}
                              className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-bold flex items-center space-x-1"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              <span>{u.role === 'admin' ? 'Adminlikni olish' : 'Admin qilish'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyId === u.uid}
                              onClick={() => handleUserAction(u.uid, 'delete_user')}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold flex items-center space-x-1"
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
            </>
          )}

          {activeSubTab === 'withdrawals' && (
            <div className="space-y-2.5">
              {withdrawals.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-500 border border-slate-200">
                  Hozircha pul yechib olish arizalari yo'q.
                </div>
              ) : (
                withdrawals.map((w) => (
                  <div key={w.id} className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-xs text-slate-900">{w.userName || w.userUid}</p>
                        <p className="text-[11px] font-mono text-slate-600">{w.userCard}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-emerald-600">{Number(w.uzsAmount || 0).toLocaleString()} so'm</p>
                        <p className="text-[10px] font-bold text-cyan-700">💎 {w.diamondAmount} almaz</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          w.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : w.status === 'rejected'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {w.status === 'approved'
                          ? 'Tasdiqlangan'
                          : w.status === 'rejected'
                          ? 'Rad etilgan'
                          : 'Kutilmoqda'}
                      </span>
                      {w.status === 'pending' && (
                        <div className="flex space-x-1.5">
                          <button
                            type="button"
                            disabled={busyId === w.id}
                            onClick={() => handleWithdrawalAction(w.id, 'approve')}
                            className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold"
                          >
                            Tasdiqlash ✓
                          </button>
                          <button
                            type="button"
                            disabled={busyId === w.id}
                            onClick={() => handleWithdrawalAction(w.id, 'reject')}
                            className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold"
                          >
                            Rad etish ✕
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeSubTab === 'transactions' && (
            <div className="space-y-2">
              {transactions.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-500 border border-slate-200">
                  Tranzaksiyalar mavjud emas.
                </div>
              ) : (
                transactions.slice(0, 60).map((t) => (
                  <div key={t.id} className="bg-white rounded-xl p-3 border border-slate-200 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="font-bold text-slate-800 truncate">{t.note || t.type}</p>
                      <p className="text-[10px] text-slate-400">
                        {t.sender} {t.receiver ? `→ ${t.receiver}` : ''} • {new Date(t.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right shrink-0 font-bold text-[11px]">
                      {t.coinAmount ? <span className="text-amber-600 block">{t.coinAmount} 🪙</span> : null}
                      {t.diamondAmount ? <span className="text-cyan-700 block">+{t.diamondAmount} 💎</span> : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
