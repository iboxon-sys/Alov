import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react';
import {
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_TITLE,
  PRIVACY_POLICY_UPDATED_DATE,
  hasScrolledPrivacyToBottom,
} from '../utils/privacyPolicy';

interface PrivacyPolicyInlineProps {
  onAccept: () => void;
  onBack: () => void;
  acceptButtonLabel?: string;
}

export const PrivacyPolicyInline: React.FC<PrivacyPolicyInlineProps> = ({
  onAccept,
  onBack,
  acceptButtonLabel = 'Roziman',
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [readToBottom, setReadToBottom] = useState(false);

  const checkScroll = (el: HTMLDivElement | null) => {
    if (!el) return;
    if (hasScrolledPrivacyToBottom(el.scrollTop, el.clientHeight, el.scrollHeight, 24)) {
      setReadToBottom(true);
    }
  };

  useEffect(() => {
    setReadToBottom(false);
    const id = window.setTimeout(() => checkScroll(scrollContainerRef.current), 120);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="space-y-3.5 relative z-10 text-left" data-testid="inline-privacy-policy">
      <div className="flex items-center justify-between gap-2 pb-2.5 pr-14 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-editorial font-bold text-white leading-tight truncate">
              {PRIVACY_POLICY_TITLE}
            </h2>
            <p className="text-[10.5px] text-zinc-400">{PRIVACY_POLICY_UPDATED_DATE}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          data-testid="inline-privacy-back-btn"
          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white text-[11px] font-bold flex items-center gap-1 transition shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Orqaga</span>
        </button>
      </div>

      <div
        ref={scrollContainerRef}
        data-testid="inline-privacy-scroll-box"
        onScroll={(e) => checkScroll(e.currentTarget)}
        className="h-[290px] sm:h-[320px] overflow-y-auto pr-2 space-y-3.5 text-xs text-zinc-300 leading-relaxed bg-[#0B0D14] rounded-2xl p-4 border border-white/[0.08]"
      >
        <p className="font-bold text-white text-xs">{PRIVACY_POLICY_UPDATED_DATE}</p>
        <p className="text-zinc-300">{PRIVACY_POLICY_INTRO}</p>

        {PRIVACY_POLICY_SECTIONS.map((sec) => (
          <div key={sec.number} className="space-y-1.5 pt-1">
            <h3 className="font-bold text-white text-xs sm:text-[13px]">{sec.title}</h3>
            {sec.paragraphs.map((p, i) => (
              <p key={i} className="text-zinc-300">
                {p}
              </p>
            ))}
          </div>
        ))}

        <div className="pt-2">
          {!readToBottom ? (
            <div className="p-2.5 bg-amber-500/10 border border-amber-400/25 rounded-xl text-amber-300 text-center font-bold text-[11px]">
              Hammasini o'qib, "Roziman" tugmasini ochish uchun oxirigacha pastga tushiring
            </div>
          ) : (
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-emerald-300 text-center font-bold text-[11px] flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Matn oxirigacha o'qildi — endi "Roziman" tugmasini bosishingiz mumkin</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-[11px] text-zinc-400 font-medium">
          {readToBottom ? "Rozilik berishga tayyor" : "Pastga oxirigacha aylantiring"}
        </span>
        <button
          type="button"
          disabled={!readToBottom}
          data-testid="inline-privacy-accept-btn"
          onClick={onAccept}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#E11D48] to-rose-600 text-white font-bold text-xs shadow-lg shadow-rose-950/40 hover:brightness-110 disabled:opacity-35 disabled:cursor-not-allowed transition cursor-pointer"
        >
          {acceptButtonLabel}
        </button>
      </div>
    </div>
  );
};
