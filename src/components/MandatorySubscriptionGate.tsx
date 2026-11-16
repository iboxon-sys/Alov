import React, { useEffect } from 'react';
import { CheckCircle2, ExternalLink, RefreshCw, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MandatorySubscriptionConfig } from '../utils/telegramBotUtils';

interface MandatorySubscriptionGateProps {
  config: MandatorySubscriptionConfig;
  isSubscribed: boolean;
  isChecking: boolean;
  errorMsg?: string;
  onVerifySubscription: () => void;
  onContinue?: () => void;
}

export const MandatorySubscriptionGate: React.FC<MandatorySubscriptionGateProps> = ({
  config,
  isSubscribed,
  isChecking,
  errorMsg,
  onVerifySubscription,
  onContinue,
}) => {
  useEffect(() => {
    const handleResumeCheck = () => {
      if (document.visibilityState === 'visible') {
        onVerifySubscription();
      }
    };
    window.addEventListener('focus', handleResumeCheck);
    document.addEventListener('visibilitychange', handleResumeCheck);
    return () => {
      window.removeEventListener('focus', handleResumeCheck);
      document.removeEventListener('visibilitychange', handleResumeCheck);
    };
  }, [onVerifySubscription]);

  const handleOpenChannel = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const link = String(config.channelLink || '').trim();
    const tg = (window as any).Telegram?.WebApp;
    if (tg && typeof tg.openTelegramLink === 'function' && /t\.me\//i.test(link)) {
      e.preventDefault();
      tg.openTelegramLink(link.startsWith('http') ? link : `https://${link}`);
    }
  };

  return (
    <div
      data-testid="mandatory-subscription-gate"
      className="fixed inset-0 z-[190] bg-[#07080C]/95 backdrop-blur-2xl flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md rounded-[28px] bg-[#11131C] border border-white/12 p-6 sm:p-7 shadow-[0_30px_90px_rgba(0,0,0,0.85)] space-y-5 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500/25 to-amber-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
          {isSubscribed ? (
            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
          ) : (
            <ShieldAlert className="w-7 h-7" />
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-editorial font-bold text-white tracking-tight">
            {config.channelTitle ? `${config.channelTitle}` : "Majburiy obuna"}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
            {config.messageText || "Ilovadan foydalanish uchun kanalimizga obuna bo'ling!"}
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <div className="space-y-2.5">
          {config.channelLink && (
            <a
              href={config.channelLink.startsWith('http') ? config.channelLink : `https://t.me/${config.channelLink.replace(/^@/, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleOpenChannel}
              data-testid="mandatory-sub-channel-btn"
              className="w-full py-3.5 px-4 rounded-2xl bg-[#229ED9] hover:bg-[#1c8cc2] text-white font-bold text-sm flex items-center justify-between gap-3 transition shadow-lg shadow-sky-950/40"
            >
              <span className="flex items-center gap-2 min-w-0 truncate">
                <ExternalLink className="w-4 h-4 shrink-0" />
                <span className="truncate">{config.buttonText || "Kanalga obuna bo'lish"}</span>
              </span>
              <span
                data-testid="mandatory-sub-status-check"
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isSubscribed ? 'bg-emerald-500 text-white' : 'bg-white/20 text-white/70'
                }`}
                title={isSubscribed ? 'Obuna tasdiqlangan' : 'Hali obuna tekshirilmagan'}
              >
                {isSubscribed ? '✓' : '○'}
              </span>
            </a>
          )}

          <button
            type="button"
            disabled={isChecking}
            onClick={() => {
              if (isSubscribed && onContinue) {
                onContinue();
              } else {
                onVerifySubscription();
              }
            }}
            data-testid="mandatory-sub-verify-btn"
            className={`w-full py-3.5 px-4 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 transition shadow-lg disabled:opacity-60 cursor-pointer ${
              isSubscribed
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40'
                : 'bg-gradient-to-r from-[#E11D48] to-rose-600 hover:brightness-110 shadow-rose-950/40'
            }`}
          >
            {isSubscribed ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            )}
            <span>
              {isChecking
                ? 'Tekshirilmoqda...'
                : isSubscribed
                  ? 'Tasdiqlandi — Davom etish ✓'
                  : 'Tekshirish'}
            </span>
          </button>
        </div>

        <p className="text-[11px] text-zinc-500">
          Obuna bo'lgach, avtomatik galochka chiqadi yoki "Tekshirish" tugmasini bosing.
        </p>
      </motion.div>
    </div>
  );
};
