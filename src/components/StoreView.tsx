import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Coins,
  CreditCard,
  Gem,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { cn } from '../utils/cn';
import { type CoinPurchaseRequest, type CoinShopPackage } from '../utils/coinRequests';
import {
  DIAMOND_CASHOUT_PACKAGES,
  MIN_COIN_PURCHASE_AMOUNT,
  MIN_COIN_PURCHASE_UZS,
  MIN_DIAMOND_CASHOUT_AMOUNT,
  MIN_DIAMOND_CASHOUT_UZS,
  STORE_COIN_PACKAGES,
  UZBEK_STORE_PAYMENT_METHODS,
  buildStoreBalanceSummary,
  calculateDiamondCashoutUzs,
  formatUzsPrice,
  type StoreFocusTab,
} from '../utils/store';

interface StoreViewProps {
  currentUser: any;
  selectedCoinPackage: CoinShopPackage;
  onSelectCoinPackage: (pkg: CoinShopPackage) => void;
  paymentProvider: string;
  onSelectPaymentProvider: (id: string) => void;
  coinRequestContact: string;
  onChangeCoinRequestContact: (val: string) => void;
  coinRequestNote: string;
  onChangeCoinRequestNote: (val: string) => void;
  isSubmittingCoinRequest: boolean;
  onSubmitCoinOrder: () => void | Promise<void>;
  userCoinRequests: CoinPurchaseRequest[];
  withdrawAmount: number;
  onChangeWithdrawAmount: (val: number) => void;
  withdrawCardNumber: string;
  onChangeWithdrawCardNumber: (val: string) => void;
  withdrawContact: string;
  onChangeWithdrawContact: (val: string) => void;
  onSubmitWithdrawal: (e: React.FormEvent) => void | Promise<void>;
  walletNoticeMsg?: string;
}

export const StoreView: React.FC<StoreViewProps> = ({
  currentUser,
  selectedCoinPackage,
  onSelectCoinPackage,
  paymentProvider,
  onSelectPaymentProvider,
  coinRequestContact,
  onChangeCoinRequestContact,
  coinRequestNote,
  onChangeCoinRequestNote,
  isSubmittingCoinRequest,
  onSubmitCoinOrder,
  userCoinRequests,
  withdrawAmount,
  onChangeWithdrawAmount,
  withdrawCardNumber,
  onChangeWithdrawCardNumber,
  withdrawContact,
  onChangeWithdrawContact,
  onSubmitWithdrawal,
  walletNoticeMsg,
}) => {
  const balance = buildStoreBalanceSummary(currentUser);
  const [storeTab, setStoreTab] = useState<StoreFocusTab>(balance.defaultTab);

  useEffect(() => {
    setStoreTab(balance.defaultTab);
  }, [currentUser?.uid, currentUser?.gender]);

  useEffect(() => {
    if (!withdrawAmount || withdrawAmount < MIN_DIAMOND_CASHOUT_AMOUNT) {
      onChangeWithdrawAmount(MIN_DIAMOND_CASHOUT_AMOUNT);
    }
  }, [currentUser?.uid]);

  const liveCashoutUzs = calculateDiamondCashoutUzs(withdrawAmount);

  return (
    <div data-testid="store-view" className="max-w-5xl mx-auto space-y-5">
      {/* Top Wallet Hero Banner: Available Olmos (with UZS cashout) and/or Moneta */}
      <section className="bg-[#12141E] rounded-[28px] border border-white/[0.08] p-5 sm:p-7 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-rose-400">
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Alov.uz Do'koni</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-editorial font-bold text-white tracking-tight">
              Moneta va Olmos Xizmatlari
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              O'zbekiston bo'ylab qulay narxlar — tezkor Click, Payme, Uzum va Humo/Uzcard hisob-kitoblari.
            </p>
          </div>

          {/* Mode Toggle Tabs */}
          <div
            role="tablist"
            aria-label="Do'kon bo'limlari"
            className="inline-flex p-1 rounded-2xl bg-[#0A0C12] border border-white/[0.08] self-start sm:self-auto shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={storeTab === 'coins'}
              data-testid="store-tab-coins"
              onClick={() => setStoreTab('coins')}
              className={cn(
                'min-h-[44px] px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap',
                storeTab === 'coins'
                  ? 'bg-amber-500/20 text-amber-200 border border-amber-400/35'
                  : 'text-zinc-400 hover:text-white border border-transparent'
              )}
            >
              <Coins className="w-4 h-4 text-amber-400" />
              <span>Moneta olish</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={storeTab === 'diamonds'}
              data-testid="store-tab-diamonds"
              onClick={() => setStoreTab('diamonds')}
              className={cn(
                'min-h-[44px] px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap',
                storeTab === 'diamonds'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/35'
                  : 'text-zinc-400 hover:text-white border border-transparent'
              )}
            >
              <Gem className="w-4 h-4 text-cyan-400" />
              <span>Olmos chiqarish</span>
            </button>
          </div>
        </div>

        {/* Top User Available Balance Readouts */}
        <div
          data-testid="store-top-balance-cards"
          className={cn(
            'grid gap-3',
            balance.hasDiamonds && balance.hasCoins ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
          )}
        >
          {balance.hasCoins && (
            <div
              data-testid="store-coins-balance-card"
              className="rounded-2xl bg-[#171A26] border border-amber-400/25 p-4 flex items-center justify-between gap-4"
            >
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Mavjud Moneta Balansi
                </p>
                <p className="text-2xl sm:text-3xl font-black text-white tabular-nums">
                  {balance.coinsDisplay} <span className="text-sm font-bold text-amber-300">moneta</span>
                </p>
                <p className="text-xs text-zinc-400">
                  Minimal sotib olish: <span className="font-semibold text-amber-200 tabular-nums whitespace-nowrap">1 000 moneta = {formatUzsPrice(MIN_COIN_PURCHASE_UZS)}</span>
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0">
                <Coins className="w-6 h-6 text-amber-400" />
              </div>
            </div>
          )}

          {balance.hasDiamonds && (
            <div
              data-testid="store-diamonds-balance-card"
              className="rounded-2xl bg-[#171A26] border border-cyan-400/25 p-4 flex items-center justify-between gap-4"
            >
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                  Mavjud Olmos Balansi
                </p>
                <p className="text-2xl sm:text-3xl font-black text-white tabular-nums">
                  {balance.diamondsDisplay} <span className="text-sm font-bold text-cyan-300">olmos</span>
                </p>
                <p className="text-xs text-zinc-300 tabular-nums">
                  {balance.isAdmin ? (
                    'Admin balansi: cheksiz kirish'
                  ) : (
                    <>
                      Pulga chiqarish qiymati:{' '}
                      <span className="whitespace-nowrap font-semibold text-white">
                        {formatUzsPrice(balance.diamondsCashoutUzs)}
                      </span>
                    </>
                  )}
                </p>
                <p className="text-[11px] text-zinc-400 tabular-nums">
                  Minimal chiqarish: <span className="font-semibold text-cyan-200 whitespace-nowrap">{MIN_DIAMOND_CASHOUT_AMOUNT} olmos = {formatUzsPrice(MIN_DIAMOND_CASHOUT_UZS)}</span>
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0">
                <Gem className="w-6 h-6 text-cyan-400" />
              </div>
            </div>
          )}
        </div>

        {walletNoticeMsg && (
          <div className="p-3.5 rounded-2xl bg-amber-500/12 border border-amber-400/30 text-xs font-medium text-amber-200">
            {walletNoticeMsg}
          </div>
        )}
      </section>

      {/* TAB 1: MONETA SOTIB OLISH (Coins Store) */}
      {storeTab === 'coins' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Packages Catalog */}
          <div className="lg:col-span-7 bg-[#12141E] rounded-[28px] border border-white/[0.08] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-editorial font-bold text-white">Moneta Paketlari</h2>
                <p className="text-xs text-zinc-400">
                  Minimal narx:{' '}
                  <span className="whitespace-nowrap">
                    {MIN_COIN_PURCHASE_AMOUNT.toLocaleString()} moneta — {formatUzsPrice(MIN_COIN_PURCHASE_UZS)}
                  </span>
                </p>
              </div>
              <span className="px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-400/30 text-[11px] font-bold text-amber-200">
                O'zbekiston tariflari
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {STORE_COIN_PACKAGES.map((pkg) => {
                const isSelected = selectedCoinPackage.coins === pkg.coins;
                const pricePerThousand = Math.round((pkg.uzs / pkg.coins) * 1000);
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    data-testid={`store-coin-pkg-${pkg.coins}`}
                    onClick={() => onSelectCoinPackage(pkg)}
                    className={cn(
                      'p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 min-h-[120px]',
                      isSelected
                        ? 'border-amber-400 bg-amber-500/15 shadow-[0_0_24px_rgba(245,158,11,0.12)]'
                        : 'border-white/[0.08] bg-[#171A26] hover:border-white/25'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                        {pkg.label}
                      </span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />}
                    </div>

                    <div>
                      <p className="text-xl font-black text-white tabular-nums">
                        {pkg.coins.toLocaleString()} <span className="text-xs font-bold text-amber-300">moneta</span>
                      </p>
                      <p className="text-sm font-bold text-emerald-400 mt-0.5 tabular-nums">
                        {formatUzsPrice(pkg.uzs)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2 border-t border-white/[0.06]">
                      <span>{pkg.bonusText || 'Tezkor yetkazish'}</span>
                      <span className="tabular-nums text-zinc-500">
                        1k = {(pricePerThousand / 1000).toFixed(0)}k
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Checkout / Request Form */}
          <div className="lg:col-span-5 bg-[#12141E] rounded-[28px] border border-white/[0.08] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Buyurtma rasmiylashtirish</h2>
              <span className="text-xs font-bold text-amber-300 tabular-nums">
                {formatUzsPrice(selectedCoinPackage.uzs)}
              </span>
            </div>

            <div className="rounded-2xl bg-[#171A26] border border-white/[0.08] p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-zinc-400">Tanlangan paket</p>
                <p className="text-sm font-bold text-white tabular-nums">
                  {selectedCoinPackage.coins.toLocaleString()} moneta ({selectedCoinPackage.label})
                </p>
              </div>
              <p className="text-sm font-black text-emerald-400 tabular-nums">
                {formatUzsPrice(selectedCoinPackage.uzs)}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                To'lov tizimi
              </label>
              <div className="grid grid-cols-2 gap-2">
                {UZBEK_STORE_PAYMENT_METHODS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectPaymentProvider(p.id)}
                    className={cn(
                      'min-h-[44px] px-3 py-2 rounded-xl border text-left transition cursor-pointer',
                      paymentProvider === p.id
                        ? 'border-rose-500 bg-rose-500/18 text-white'
                        : 'border-white/[0.08] bg-[#171A26] text-zinc-300 hover:border-white/25'
                    )}
                  >
                    <p className="text-xs font-bold">{p.name}</p>
                    <p className="text-[10px] text-zinc-400 truncate">{p.subtitle}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="store-coin-contact"
                className="block text-[11px] font-bold uppercase tracking-wider text-amber-300"
              >
                Aloqa uchun Telegram yoki telefon *
              </label>
              <input
                id="store-coin-contact"
                type="text"
                required
                value={coinRequestContact}
                onChange={(e) => onChangeCoinRequestContact(e.target.value)}
                data-testid="store-coin-contact-input"
                placeholder="@username yoki +998 90 123 45 67"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-amber-400/35 text-[16px] sm:text-xs text-white placeholder:text-zinc-500 outline-none focus:border-amber-400"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="store-coin-note"
                className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400"
              >
                Izoh (ixtiyoriy)
              </label>
              <input
                id="store-coin-note"
                type="text"
                value={coinRequestNote}
                onChange={(e) => onChangeCoinRequestNote(e.target.value)}
                data-testid="store-coin-note-input"
                placeholder="To'lov vaqti yoki karta oxiri..."
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-[16px] sm:text-xs text-white placeholder:text-zinc-500 outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="button"
              disabled={isSubmittingCoinRequest}
              data-testid="store-submit-coin-btn"
              onClick={onSubmitCoinOrder}
              className="w-full min-h-[46px] py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-600 hover:brightness-110 text-white font-bold text-xs shadow-lg shadow-amber-950/40 transition active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <CreditCard className="w-4 h-4" />
              <span>
                {isSubmittingCoinRequest
                  ? 'Yuborilmoqda...'
                  : `Sotib olish — ${selectedCoinPackage.coins.toLocaleString()} moneta (${formatUzsPrice(selectedCoinPackage.uzs)})`}
              </span>
            </button>

            <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Buyurtma adminga tushadi va to'lov tasdiqlangach balansingiz darhol to'ldiriladi.</span>
            </p>

            {userCoinRequests.length > 0 && (
              <div className="pt-3 border-t border-white/[0.08] space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Buyurtmalarim ({userCoinRequests.length})
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {userCoinRequests.slice(0, 6).map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#171A26] border border-white/[0.07] text-xs"
                    >
                      <div className="min-w-0 tabular-nums">
                        <span className="font-bold text-white">+{req.coinAmount.toLocaleString()} moneta</span>
                        <span className="text-zinc-400 ml-2 text-[11px]">{formatUzsPrice(req.uzsAmount)}</span>
                      </div>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0',
                          req.status === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : req.status === 'rejected'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                        )}
                      >
                        {req.status === 'approved'
                          ? 'Tasdiqlangan'
                          : req.status === 'rejected'
                          ? 'Rad etilgan'
                          : 'Kutilmoqda'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: OLMOSNI PULGA CHIQARISH (Diamonds Cashout Store) */}
      {storeTab === 'diamonds' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Cashout Tiers Catalog */}
          <div className="lg:col-span-7 bg-[#12141E] rounded-[28px] border border-white/[0.08] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-editorial font-bold text-white">Olmos Yechish Narxlari</h2>
                <p className="text-xs text-zinc-400">
                  Minimal baxo:{' '}
                  <span className="whitespace-nowrap">
                    {MIN_DIAMOND_CASHOUT_AMOUNT} olmos — {formatUzsPrice(MIN_DIAMOND_CASHOUT_UZS)}
                  </span>
                </p>
              </div>
              <span className="px-3 py-1 rounded-xl bg-cyan-500/15 border border-cyan-400/30 text-[11px] font-bold text-cyan-200">
                Humo / Uzcard
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DIAMOND_CASHOUT_PACKAGES.map((tier) => {
                const isSelected = Number(withdrawAmount) === tier.diamonds;
                const canAfford = balance.isAdmin || balance.diamondsCount >= tier.diamonds;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    data-testid={`store-diamond-tier-${tier.diamonds}`}
                    onClick={() => onChangeWithdrawAmount(tier.diamonds)}
                    className={cn(
                      'p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 min-h-[118px]',
                      isSelected
                        ? 'border-cyan-400 bg-cyan-500/15 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
                        : 'border-white/[0.08] bg-[#171A26] hover:border-white/25'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                        {tier.label}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-md',
                          canAfford ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.06] text-zinc-400'
                        )}
                      >
                        {canAfford ? 'Yechish mumkin' : `${Math.ceil(tier.diamonds - balance.diamondsCount)} yetmaydi`}
                      </span>
                    </div>

                    <div>
                      <p className="text-xl font-black text-white tabular-nums">
                        {tier.diamonds.toLocaleString()} <span className="text-xs font-bold text-cyan-300">olmos</span>
                      </p>
                      <p className="text-sm font-bold text-emerald-400 mt-0.5 tabular-nums flex items-center gap-1">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>{formatUzsPrice(tier.uzs)}</span>
                      </p>
                    </div>

                    {tier.badgeText && (
                      <p className="text-[11px] text-zinc-400 pt-2 border-t border-white/[0.06]">
                        {tier.badgeText}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cashout Calculator & Withdrawal Request Form */}
          <form
            onSubmit={onSubmitWithdrawal}
            className="lg:col-span-5 bg-[#12141E] rounded-[28px] border border-white/[0.08] p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-cyan-400" />
                <span>Kartaga Pul Chiqarish</span>
              </h2>
              <span className="text-xs font-bold text-emerald-400 tabular-nums">
                {formatUzsPrice(liveCashoutUzs)}
              </span>
            </div>

            {!balance.canWithdrawDiamonds && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-400/25 text-xs text-amber-200 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Minimal chiqarish uchun <strong className="tabular-nums">{MIN_DIAMOND_CASHOUT_AMOUNT} olmos</strong> kerak.
                  Yana <strong className="tabular-nums">{balance.remainingDiamondsForMinCashout} olmos</strong> yig'sangiz {formatUzsPrice(MIN_DIAMOND_CASHOUT_UZS)} chiqara olasiz.
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="store-withdraw-amount"
                className="block text-[11px] font-bold uppercase tracking-wider text-zinc-300"
              >
                Olmos miqdori (min. {MIN_DIAMOND_CASHOUT_AMOUNT})
              </label>
              <input
                id="store-withdraw-amount"
                type="number"
                min={MIN_DIAMOND_CASHOUT_AMOUNT}
                step="1"
                value={withdrawAmount}
                onChange={(e) => onChangeWithdrawAmount(Number(e.target.value))}
                data-testid="store-withdraw-amount-input"
                required
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-[16px] sm:text-xs font-bold text-white tabular-nums focus:border-cyan-400 outline-none"
              />
              <p className="text-xs text-zinc-400 tabular-nums">
                Kartangizga o'tkaziladi: <span className="font-bold text-emerald-400">{formatUzsPrice(liveCashoutUzs)}</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="store-withdraw-card"
                className="block text-[11px] font-bold uppercase tracking-wider text-zinc-300"
              >
                Humo / Uzcard karta raqami (16 xonali)
              </label>
              <input
                id="store-withdraw-card"
                type="text"
                maxLength={19}
                placeholder="8600 0000 0000 0000"
                value={withdrawCardNumber}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  const formatted = raw.match(/.{1,4}/g)?.join(' ') || raw;
                  onChangeWithdrawCardNumber(formatted);
                }}
                data-testid="store-withdraw-card-input"
                required
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-white/10 text-[16px] sm:text-xs font-mono font-bold text-white placeholder:text-zinc-500 focus:border-cyan-400 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="store-withdraw-contact"
                className="block text-[11px] font-bold uppercase tracking-wider text-cyan-300"
              >
                Aloqa uchun Telegram yoki telefon *
              </label>
              <input
                id="store-withdraw-contact"
                type="text"
                placeholder="@username yoki +998 90 123 45 67"
                value={withdrawContact}
                onChange={(e) => onChangeWithdrawContact(e.target.value)}
                data-testid="store-withdraw-contact-input"
                required
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#171A26] border border-cyan-400/35 text-[16px] sm:text-xs font-semibold text-white placeholder:text-zinc-500 focus:border-cyan-400 outline-none"
              />
            </div>

            <button
              type="submit"
              data-testid="store-submit-withdraw-btn"
              className="w-full min-h-[46px] py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:brightness-110 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Wallet className="w-4 h-4" />
              <span>Pul chiqarishga ariza berish ({formatUzsPrice(liveCashoutUzs)})</span>
            </button>

            <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Minimal chiqarish: 120 olmos = 25 000 so'm. Ariza adminga yuboriladi va kartangizga tushiriladi.</span>
            </p>
          </form>
        </div>
      )}
    </div>
  );
};
