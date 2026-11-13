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
    <div className="relative min-h-screen bg-[#FDFBF9] text-[#221719] font-sans selection:bg-rose-200 selection:text-rose-950">
      <SpringPetalsBackground />

      {/* 3-Zone Sticky Navigation Bar */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-[#FDFBF9]/90 border-b border-[rgba(166,36,51,0.08)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 sm:h-18 flex items-center justify-between gap-8">
          <a href="#" className="text-2xl font-editorial font-bold tracking-tight text-[#221719] whitespace-nowrap shrink-0">
            alov<span className="text-[#C93545]">.uz</span>
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#57484B]">
            <a href="#afzalliklar" className="hover:text-[#C93545] transition-colors whitespace-nowrap shrink-0">Afzalliklar</a>
            <a href="#faceid" className="hover:text-[#C93545] transition-colors whitespace-nowrap shrink-0">Face ID</a>
            <a href="#bosqichlar" className="hover:text-[#C93545] transition-colors whitespace-nowrap shrink-0">Qanday ishlaydi</a>
            <a href="#xavfsizlik" className="hover:text-[#C93545] transition-colors whitespace-nowrap shrink-0">Xavfsizlik</a>
          </nav>

          <button
            onClick={onLogin}
            className="px-5 py-2.5 rounded-xl bg-[#C93545] hover:bg-[#A62433] text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C93545]">
              O'zbekiston · Face ID tasdiqlangan tanishuv maydoni
            </p>

            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-editorial font-bold text-[#221719] leading-[1.08] tracking-tight"
              style={{ textWrap: 'balance' }}
            >
              Samimiy insonlar bilan <span className="italic text-[#C93545]">haqiqiy</span> uchrashuvlar
            </h1>

            <p className="text-base sm:text-lg text-[#57484B] max-w-xl leading-relaxed">
              Har bir profil jonli kamera orqali Face ID dan o'tadi. Soxta rasmlar va anonim akkauntlarsiz, o'z hududingizdagi munosib insonlar bilan xavfsiz suhbatlashing.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <button
                onClick={onLogin}
                className="py-3.5 px-7 rounded-2xl bg-gradient-to-r from-[#C93545] to-[#A62433] text-white font-semibold text-sm sm:text-base shadow-lg shadow-rose-900/15 hover:brightness-105 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <span>Boshlash va Face ID o'tish</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <a
                href="https://t.me/alovuz_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="py-3.5 px-6 rounded-2xl bg-white border border-[rgba(166,36,51,0.16)] hover:border-[#229ED9] text-[#221719] hover:text-[#229ED9] font-semibold text-sm transition-all flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <svg className="w-4 h-4 fill-current text-[#229ED9] shrink-0" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27 0-.12.05-1.98 1.26-5.6 3.7-.53.36-1.01.54-1.44.53-.47-.01-1.38-.26-2.06-.48-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.65-2.89 7.98-3.45 3.8-1.6 4.59-1.88 5.1-1.89.11 0 .37.03.54.17.14.12.18.28.2.4-.02.07-.02.13-.04.2z" />
                </svg>
                <span>Telegram Bot (@alovuz_bot)</span>
              </a>
            </div>

            <div className="pt-4 flex flex-wrap items-center gap-4 text-xs text-[#6B5B5E] font-medium border-t border-[rgba(166,36,51,0.1)]">
              <span>Face ID jonli verifikatsiya</span>
              <span aria-hidden="true">·</span>
              <span>Avtomatik jins va surat aniqlash</span>
              <span aria-hidden="true">·</span>
              <span>14 hudud bo'ylab</span>
            </div>
          </div>

          {/* Hero Visual */}
          <div className="lg:col-span-5 flex">
            <div className="relative w-full rounded-[28px] overflow-hidden border border-[rgba(166,36,51,0.12)] shadow-[0_24px_60px_rgba(34,23,25,0.12)] bg-[#FAF4F2] min-h-[340px]">
              {!heroImgError ? (
                <img
                  src="/assets/images/hero_spring_dating_1794157256006.jpg"
                  alt="Alov.uz samimiy tanishuv"
                  referrerPolicy="no-referrer"
                  className="w-full h-full min-h-[360px] object-cover"
                  onError={() => setHeroImgError(true)}
                />
              ) : (
                <div className="w-full h-full min-h-[360px] bg-gradient-to-br from-[#F7E3E5] via-[#FDFBF9] to-[#F3E2D5] flex flex-col items-center justify-center p-8 text-center">
                  <Heart className="w-12 h-12 text-[#C93545] mb-3" />
                  <p className="font-editorial text-2xl font-bold text-[#221719]">Alov.uz</p>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1E1012]/85 via-[#1E1012]/40 to-transparent p-6 text-white text-left">
                <p className="text-xs text-rose-200 font-medium">Jonli efirlar va suhbatlar</p>
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
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#C93545]">Platforma imkoniyatlari</p>
            <h2 className="text-3xl sm:text-4xl font-editorial font-bold text-[#221719] tracking-tight">
              Ishonch va samimiylikka asoslangan muhit
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div id="faceid" className="md:col-span-2 bg-white p-7 sm:p-9 rounded-[24px] border border-[rgba(166,36,51,0.1)] shadow-subtle flex flex-col justify-between space-y-6">
              <div className="space-y-3 max-w-xl">
                <div className="w-11 h-11 rounded-2xl bg-[#FDF2F3] text-[#C93545] flex items-center justify-center">
                  <ScanFace className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-editorial font-bold text-[#221719]">
                  Haqiqiy Face ID va Jonli Surat
                </h3>
                <p className="text-sm text-[#57484B] leading-relaxed">
                  Kirishda kameraga qarab ko'zingizni bir marta ochib-yuming va ozgina tabassum qiling. Tizim jinsingizni avtomatik aniqlaydi va o'zingiz tanlagan pozada haqiqiy profil rasmingizni oladi.
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B5B5E] pt-1">
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
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#C93545] hover:text-[#A62433] transition"
                >
                  <span>Hozir kirib ko'rish</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[24px] border border-[rgba(166,36,51,0.1)] overflow-hidden shadow-subtle flex flex-col">
              {!communityImgError ? (
                <img
                  src="/assets/images/spring_community_vibes_1794157256761.jpg"
                  alt="Do'stona jamoa"
                  referrerPolicy="no-referrer"
                  className="w-full h-48 object-cover"
                  onError={() => setCommunityImgError(true)}
                />
              ) : (
                <div className="w-full h-48 bg-[#FAF4F2] flex items-center justify-center">
                  <ShieldCheck className="w-10 h-10 text-[#C93545]" />
                </div>
              )}
              <div className="p-6 space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-editorial font-bold text-[#221719]">Madaniyatli Muloqot</h3>
                  <p className="text-xs sm:text-sm text-[#57484B] mt-1 leading-relaxed">
                    O'zbekona qadriyatlar va o'zaro hurmat ustuvor. Moderatorlar tartibni doimiy nazorat qiladi.
                  </p>
                </div>
                <p className="pt-2 text-xs font-semibold text-[#C93545]">Tasdiqlangan hamjamiyat</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[24px] border border-[rgba(166,36,51,0.1)] shadow-subtle space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAF4F2] text-[#C93545] flex items-center justify-center">
                <Video className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-editorial font-bold text-[#221719]">HD Video & Audio Qo'ng'iroqlar</h3>
              <p className="text-xs sm:text-sm text-[#57484B] leading-relaxed">
                Telefon raqamingizni bermasdan bevosita ilova ichida jonli video va ovozli suhbatlar quring.
              </p>
            </div>

            <div className="bg-white p-6 rounded-[24px] border border-[rgba(166,36,51,0.1)] shadow-subtle space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAF4F2] text-[#C93545] flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-editorial font-bold text-[#221719]">Umumiy Jonli Xarita</h3>
              <p className="text-xs sm:text-sm text-[#57484B] leading-relaxed">
                Hududingizdagi foydalanuvchilarni xaritada ko'ring yoki istalgan vaqtda Ghost Mode orqali yashirining.
              </p>
            </div>

            <div className="bg-white p-6 rounded-[24px] border border-[rgba(166,36,51,0.1)] shadow-subtle space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAF4F2] text-[#229ED9] flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-editorial font-bold text-[#221719]">Telegram Bot Integratsiya</h3>
              <p className="text-xs sm:text-sm text-[#57484B] leading-relaxed">
                @alovuz_bot orqali tezkor tasdiqlash kodi va muhim bildirishnomalarni bir soniyada oling.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="bosqichlar" className="space-y-8 text-left">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#C93545]">3 oddiy qadam</p>
            <h2 className="text-3xl sm:text-4xl font-editorial font-bold text-[#221719] tracking-tight">
              Qanday boshlash mumkin?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                title: 'Telegram yoki Google bilan kiring',
                desc: 'Bir necha soniyada akkauntingizni ulang. Parollarni eslab qolish shart emas.',
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
                desc: 'Nomzodlarni ko‘ring, jonli efirlarga qo‘shiling va samimiy suhbatlar quring.',
                icon: MessageCircle,
              },
            ].map((item) => (
              <div key={item.step} className="p-7 rounded-[24px] bg-white border border-[rgba(166,36,51,0.1)] shadow-subtle space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-mono font-bold text-rose-300 tabular-nums">{item.step}</span>
                  <div className="w-10 h-10 rounded-xl bg-[#FDF2F3] text-[#C93545] flex items-center justify-center">
                    <item.icon className="w-5 h-5" />
                  </div>
                </div>
                <h3 className="text-xl font-editorial font-bold text-[#221719]">{item.title}</h3>
                <p className="text-xs sm:text-sm text-[#57484B] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Safety Section */}
        <section id="xavfsizlik" className="rounded-[28px] bg-[#221719] text-white p-8 sm:p-12 shadow-xl text-left">
          <div className="max-w-2xl space-y-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
              <Lock className="w-4 h-4" />
              <span>Shaxsiy maxfiylik va biometrik himoya</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-editorial font-bold tracking-tight text-white">
              Ma'lumotlaringiz va qadriyatlaringiz himoyada
            </h2>

            <p className="text-sm sm:text-base text-rose-100/80 leading-relaxed">
              Face ID tekshiruvi har bir foydalanuvchining haqiqiy inson ekanligini kafolatlaydi. Telefon raqamingiz hech kimga ko'rsatilmaydi va lokatsiya boshqaruvi to'liq sizning qo'lingizda.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs sm:text-sm text-rose-100">
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
        <section className="text-center p-8 sm:p-14 rounded-[28px] bg-[#FAF4F2] border border-[rgba(166,36,51,0.12)] space-y-5">
          <h2 className="text-3xl sm:text-4xl font-editorial font-bold text-[#221719] tracking-tight" style={{ textWrap: 'balance' }}>
            Samimiy suhbatlar sari ilk qadamni qo'ying
          </h2>
          <p className="text-sm sm:text-base text-[#57484B] max-w-lg mx-auto">
            O'zbekistondagi tasdiqlangan insonlar davrasiga hoziroq qo'shiling.
          </p>
          <div className="pt-2 flex justify-center">
            <button
              onClick={onLogin}
              className="py-3.5 px-9 rounded-2xl bg-[#C93545] hover:bg-[#A62433] text-white font-semibold text-sm sm:text-base shadow-lg shadow-rose-900/15 transition-all flex items-center gap-2"
            >
              <span>Ro'yxatdan o'tish</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-[rgba(166,36,51,0.08)] bg-white py-8 text-center text-xs text-[#6B5B5E] space-y-1.5 relative z-20">
        <p className="font-semibold text-[#221719]">© 2026 Alov.uz — O'zbekistonning zamonaviy tanishuv va jonli muloqot platformasi</p>
        <p>Barcha huquqlar himoyalangan · Xavfsizlik va maxfiylik siyosati</p>
      </footer>
    </div>
  );
};
