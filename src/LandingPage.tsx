import React, { useState } from 'react';
import {
  ShieldCheck,
  Heart,
  Video,
  MapPin,
  CheckCircle2,
  Lock,
  ArrowRight,
  MessageCircle,
  Smartphone,
  ScanFace,
  UserCheck,
} from 'lucide-react';
import { GenderStatsBar } from './components/GenderStatsBar';
import { SpringPetalsBackground } from './components/SpringPetalsBackground';

interface LandingPageProps {
  onLogin: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
  const [heroImgError, setHeroImgError] = useState(false);
  const [communityImgError, setCommunityImgError] = useState(false);

  return (
    <div className="relative min-h-screen bg-[#09090D] text-[#F4F4F6] font-sans selection:bg-rose-500/30 selection:text-rose-200">
      <SpringPetalsBackground />

      {/* 3-Zone Sticky Navigation Bar */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-[#09090D]/90 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 sm:h-18 flex items-center justify-between gap-8">
          <a href="#" className="text-2xl font-editorial font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            alov<span className="text-rose-500">.uz</span>
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-300">
            <a href="#afzalliklar" className="hover:text-rose-400 transition-colors whitespace-nowrap shrink-0">Afzalliklar</a>
            <a href="#faceid" className="hover:text-rose-400 transition-colors whitespace-nowrap shrink-0">Face ID</a>
            <a href="#bosqichlar" className="hover:text-rose-400 transition-colors whitespace-nowrap shrink-0">Qanday ishlaydi</a>
            <a href="#xavfsizlik" className="hover:text-rose-400 transition-colors whitespace-nowrap shrink-0">Xavfsizlik</a>
          </nav>

          <button
            onClick={onLogin}
            className="px-5 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs sm:text-sm font-semibold shadow-lg shadow-rose-950/50 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Kirish</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 pt-24 sm:pt-32 pb-20 space-y-20 sm:space-y-28 relative z-20">
        {/* Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-center space-y-6 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-400">
              O'zbekiston · Web va Telegram Mini App · Dark Edition
            </p>

            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-editorial font-bold text-white leading-[1.08] tracking-tight"
              style={{ textWrap: 'balance' }}
            >
              Samimiy insonlar bilan <span className="italic text-rose-500">haqiqiy</span> uchrashuvlar
            </h1>

            <p className="text-base sm:text-lg text-zinc-300 max-w-xl leading-relaxed">
              Har bir profil jonli kamera orqali Face ID dan o'tadi. Soxta rasmlar va anonim akkauntlarsiz, o'z hududingizdagi munosib insonlar bilan xavfsiz suhbatlashing.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <button
                onClick={onLogin}
                className="py-3.5 px-7 rounded-2xl bg-gradient-to-r from-[#E11D48] to-[#BE123C] text-white font-semibold text-sm sm:text-base shadow-lg shadow-rose-950/50 hover:brightness-110 transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <span>Boshlash va Face ID o'tish</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <a
                href="https://t.me/alovuz_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="py-3.5 px-6 rounded-2xl bg-[#181A22] border border-white/15 hover:border-[#229ED9] text-zinc-100 hover:text-[#38BDF8] font-semibold text-sm transition-all flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <svg className="w-4 h-4 fill-current text-[#38BDF8] shrink-0" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27 0-.12.05-1.98 1.26-5.6 3.7-.53.36-1.01.54-1.44.53-.47-.01-1.38-.26-2.06-.48-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.65-2.89 7.98-3.45 3.8-1.6 4.59-1.88 5.1-1.89.11 0 .37.03.54.17.14.12.18.28.2.4-.02.07-.02.13-.04.2z" />
                </svg>
                <span>Telegram Bot (@alovuz_bot)</span>
              </a>
            </div>

            <div className="pt-4 flex flex-wrap items-center gap-4 text-xs text-zinc-400 font-medium border-t border-white/10">
              <span>Face ID jonli verifikatsiya</span>
              <span aria-hidden="true">·</span>
              <span>Avtomatik jins va surat aniqlash</span>
              <span aria-hidden="true">·</span>
              <span>14 hudud bo'ylab</span>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="lg:col-span-5 flex">
            <div className="relative w-full rounded-[28px] overflow-hidden border border-white/15 shadow-[0_24px_60px_rgba(0,0,0,0.65)] bg-[#181A22] min-h-[340px]">
              {!heroImgError ? (
                <picture className="block w-full h-full min-h-[360px]">
                  <source srcSet="/assets/images/hero_spring_dating_1794157256006.webp" type="image/webp" />
                  <img
                    src="/assets/images/hero_spring_dating_1794157256006.webp"
                    alt="Alov.uz samimiy tanishuv"
                    referrerPolicy="no-referrer"
                    fetchPriority="high"
                    decoding="async"
                    width={640}
                    height={480}
                    className="w-full h-full min-h-[360px] object-cover"
                    onError={() => setHeroImgError(true)}
                  />
                </picture>
              ) : (
                <div className="w-full h-full min-h-[360px] bg-gradient-to-br from-[#28121B] via-[#181A22] to-[#111218] flex flex-col items-center justify-center p-8 text-center">
                  <Heart className="w-12 h-12 text-rose-500 mb-3" />
                  <p className="font-editorial text-2xl font-bold text-white">Alov.uz</p>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-6 text-white text-left">
                <p className="text-xs text-rose-300 font-medium">Jonli efirlar va suhbatlar</p>
                <p className="font-editorial text-2xl font-semibold text-white mt-0.5">
                  Toshkent, Samarqand, Andijon va barcha hududlar
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Real-time Gender Statistics */}
        <section>
          <GenderStatsBar />
        </section>

        {/* Face ID & Core Advantages */}
        <section id="afzalliklar" className="space-y-8 text-left">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-400">Platforma imkoniyatlari</p>
            <h2 className="text-3xl sm:text-4xl font-editorial font-bold text-white tracking-tight">
              Ishonch va samimiylikka asoslangan muhit
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div id="faceid" className="md:col-span-2 bg-[#14161F] p-7 sm:p-9 rounded-[24px] border border-white/10 shadow-subtle flex flex-col justify-between space-y-6">
              <div className="space-y-3 max-w-xl">
                <div className="w-11 h-11 rounded-2xl bg-rose-500/15 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                  <ScanFace className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-editorial font-bold text-white">
                  Haqiqiy Face ID va Jonli Surat
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  Kirishda kameraga qarab ko'zingizni bir marta ochib-yuming va ozgina tabassum qiling. Tizim jinsingizni avtomatik aniqlaydi va o'zingiz tanlagan pozada haqiqiy profil rasmingizni oladi.
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 pt-1">
                  <span>Soxta suratlarsiz</span>
                  <span aria-hidden="true">·</span>
                  <span>Avtomatik jins aniqlash</span>
                  <span aria-hidden="true">·</span>
                  <span>Qo'lda poza tanlash</span>
                </div>
              </div>

              <div>
                <button
                  onClick={onLogin}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-rose-400 hover:text-rose-300 transition cursor-pointer"
                >
                  <span>Hozir kirib ko'rish</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="bg-[#14161F] rounded-[24px] border border-white/10 overflow-hidden shadow-subtle flex flex-col">
              {!communityImgError ? (
                <picture className="block w-full h-48">
                  <source srcSet="/assets/images/spring_community_vibes_1794157256761.webp" type="image/webp" />
                  <img
                    src="/assets/images/spring_community_vibes_1794157256761.webp"
                    alt="Do'stona jamoa"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                    width={480}
                    height={320}
                    className="w-full h-48 object-cover"
                    onError={() => setCommunityImgError(true)}
                  />
                </picture>
              ) : (
                <div className="w-full h-48 bg-[#181A22] flex items-center justify-center">
                  <ShieldCheck className="w-10 h-10 text-rose-400" />
                </div>
              )}
              <div className="p-6 space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-editorial font-bold text-white">Madaniyatli Muloqot</h3>
                  <p className="text-xs sm:text-sm text-zinc-300 mt-1 leading-relaxed">
                    O'zbekona qadriyatlar va o'zaro hurmat ustuvor. Moderatorlar tartibni doimiy nazorat qiladi.
                  </p>
                </div>
                <p className="pt-2 text-xs font-semibold text-rose-400">Tasdiqlangan hamjamiyat</p>
              </div>
            </div>

            <div className="bg-[#14161F] p-6 rounded-[24px] border border-white/10 shadow-subtle space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center">
                <Video className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-editorial font-bold text-white">HD Video & Audio Qo'ng'iroqlar</h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Telefon raqamingizni bermasdan bevosita ilova ichida jonli video va ovozli suhbatlar quring.
              </p>
            </div>

            <div className="bg-[#14161F] p-6 rounded-[24px] border border-white/10 shadow-subtle space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-editorial font-bold text-white">Umumiy Jonli Xarita</h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Hududingizdagi foydalanuvchilarni xaritada ko'ring yoki istalgan vaqtda Ghost Mode orqali yashirining.
              </p>
            </div>

            <div className="bg-[#14161F] p-6 rounded-[24px] border border-white/10 shadow-subtle space-y-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-editorial font-bold text-white">Telegram Mini App & Web</h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Chrome, Safari brauzerlari va Telegram Mini App ichida birdek tezkor va qulay ishlaydi.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="bosqichlar" className="space-y-8 text-left">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-400">3 oddiy qadam</p>
            <h2 className="text-3xl sm:text-4xl font-editorial font-bold text-white tracking-tight">
              Qanday boshlash mumkin?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                title: 'Telegram yoki Google bilan kiring',
                desc: 'Bir necha soniyada akkauntingizni ulang. Telegram Mini App orqali ma\'lumotlar avtomatik yuklanadi.',
                icon: UserCheck,
              },
              {
                step: '02',
                title: 'Face ID va jonli rasm',
                desc: 'Kameraga qarab ko‘z ochib-yuming va tabassum qiling. Tizim jinsingizni aniqlaydi, so‘ng o‘zingiz rasmga olasiz.',
                icon: ScanFace,
              },
              {
                step: '03',
                title: 'Muloqotni boshlang',
                desc: 'Nomzodlarni ko‘ring, chatda media ulashing, audio/video qo‘ng‘iroqlarda qatnashing.',
                icon: MessageCircle,
              },
            ].map((item) => (
              <div key={item.step} className="p-7 rounded-[24px] bg-[#14161F] border border-white/10 shadow-subtle space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-mono font-bold text-rose-400 tabular-nums">{item.step}</span>
                  <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center">
                    <item.icon className="w-5 h-5" />
                  </div>
                </div>
                <h3 className="text-xl font-editorial font-bold text-white">{item.title}</h3>
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Safety Section */}
        <section id="xavfsizlik" className="rounded-[28px] bg-gradient-to-br from-[#1B131B] via-[#14161F] to-[#0E1016] text-white p-8 sm:p-12 border border-white/10 shadow-2xl text-left">
          <div className="max-w-2xl space-y-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
              <Lock className="w-4 h-4" />
              <span>Shaxsiy maxfiylik va biometrik himoya</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-editorial font-bold tracking-tight text-white">
              Ma'lumotlaringiz va qadriyatlaringiz himoyada
            </h2>

            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
              Face ID tekshiruvi har bir foydalanuvchining haqiqiy inson ekanligini kafolatlaydi. Telefon raqamingiz hech kimga ko'rsatilmaydi va lokatsiya boshqaruvi to'liq sizning qo'lingizda.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs sm:text-sm text-zinc-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Telefon raqami maxfiy saqlanadi</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Har bir profil Face ID orqali tasdiqlanadi</span>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="text-center p-8 sm:p-14 rounded-[28px] bg-[#14161F] border border-white/10 space-y-5">
          <h2 className="text-3xl sm:text-4xl font-editorial font-bold text-white tracking-tight" style={{ textWrap: 'balance' }}>
            Samimiy suhbatlar sari ilk qadamni qo'ying
          </h2>
          <p className="text-sm sm:text-base text-zinc-300 max-w-lg mx-auto">
            O'zbekistondagi tasdiqlangan insonlar davrasiga hoziroq qo'shiling.
          </p>
          <div className="pt-2 flex justify-center">
            <button
              onClick={onLogin}
              className="py-3.5 px-9 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-semibold text-sm sm:text-base shadow-lg shadow-rose-950/50 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Ro'yxatdan o'tish</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#0D0E14] py-8 text-center text-xs text-zinc-400 space-y-1.5 relative z-20">
        <p className="font-semibold text-zinc-200">© 2026 Alov.uz — O'zbekistonning zamonaviy tanishuv va jonli muloqot platformasi</p>
        <p>Barcha huquqlar himoyalangan · Xavfsizlik va maxfiylik siyosati</p>
      </footer>
    </div>
  );
};
