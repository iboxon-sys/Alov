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
  Camera,
  Coins,
  Gem,
  ChevronDown,
  Radio,
  Users,
} from 'lucide-react';
import { GenderStatsBar } from './components/GenderStatsBar';
import { SpringPetalsBackground } from './components/SpringPetalsBackground';
import { buildAutoplayYouTubeEmbedUrl } from './utils/mediaLinks';

const LANDING_PROMO_VIDEO_URL = 'https://youtu.be/KE1-tslT2DM?si=b_eI_Ppp__ojU9uo';

const LANDING_GALLERY_IMAGES = [
  {
    src: 'https://i.pinimg.com/736x/ee/a5/88/eea588b0eecbafacd1d0cb28c433c4b2.jpg',
    alt: 'Alov.uz samimiy tanishuv va jonli uchrashuvlar',
    eyebrow: 'Jonli efirlar va suhbatlar',
    title: 'Toshkent, Samarqand, Andijon va barcha hududlar',
  },
  {
    src: 'https://i.pinimg.com/736x/5c/99/46/5c9946ddcc36b8c6f1f3a2b058e42b66.jpg',
    alt: 'Alov.uz tasdiqlangan hamjamiyat a’zolari',
    eyebrow: 'Samimiy muloqot',
    title: 'Face ID bilan tasdiqlangan haqiqiy insonlar',
  },
  {
    src: 'https://i.pinimg.com/736x/5f/5c/99/5f5c99056a49f12cc34cca755482d908.jpg',
    alt: 'Alov.uz ishonchli tanishuv muhiti',
    eyebrow: 'Ishonchli tanishuv',
    title: 'O‘z hududingizdagi munosib davra',
  },
];

const AUDIENCE_BENEFITS = {
  female: {
    heading: 'Qizlar va ayollar uchun xavfsiz muloqot va daromad',
    lead: 'Faqat haqiqiy kamera orqali tasdiqlangan suhbatdoshlar, shaxsiy maxfiylik va faollik uchun shaffof olmos hamyoni.',
    points: [
      {
        title: 'Har bir muloqot uchun olmos',
        desc: 'Suhbatdagi javoblar, audio va video qo‘ng‘iroqlar hamda sovg‘alar avtomatik tarzda olmos balansiga yoziladi.',
      },
      {
        title: '24 soatlik 120 olmos limiti va 12 soatlik yechim',
        desc: 'Kunlik limit to‘lmay qolsa ham, yig‘ilgan barcha olmoslar 12 soat ichida hamyoningizga o‘tadi.',
      },
      {
        title: 'Karta orqali ishonchli chiqarish',
        desc: '100 olmos = 10,000 so‘m kursida Humo yoki Uzcard kartangizga ariza bering — admin bog‘lanib o‘tkazib beradi.',
      },
    ],
    ctaLabel: 'Qiz sifatida qo‘shilish',
  },
  male: {
    heading: 'Yigitlar uchun haqiqiy insonlar bilan samimiy tanishuv',
    lead: 'Soxta akkauntlarsiz, Face ID tasdig‘idan o‘tgan qizlar bilan to‘g‘ridan-to‘g‘ri tanishish va jonli muloqot qilish.',
    points: [
      {
        title: 'Faqat tasdiqlangan profillar',
        desc: 'Har bir foydalanuvchi kirishda jonli kamera orqali Face ID tekshiruvidan o‘tadi va real suratini saqlaydi.',
      },
      {
        title: 'Chat, HD qo‘ng‘iroqlar va sovg‘alar',
        desc: 'Ovozli xabarlar, video qo‘ng‘iroqlar va virtual sovg‘alar orqali e’tiboringizni chiroyli tarzda bildiring.',
      },
      {
        title: 'Qulay moneta paketlari',
        desc: '1,000 monetadan boshlab buyurtma bering — Telegram yoki telefon raqamingiz orqali admin tezda hisobingizni to‘ldiradi.',
      },
    ],
    ctaLabel: 'Yigit sifatida qo‘shilish',
  },
} as const;

const LANDING_FAQS = [
  {
    q: 'Face ID tekshiruvi qanday ishlaydi va suratim qayerga tushadi?',
    a: 'Google yoki Telegram orqali ro‘yxatdan o‘tganingizda kamera orqali qisqa biometrik tekshiruv ishga tushadi. Olingan jonli surat soxta profillarning oldini olish uchun bevosita asosiy profil rasmingizga saqlanadi.',
  },
  {
    q: 'Telefon raqamim va joylashuvim boshqalarga ko‘rinadimi?',
    a: 'Yo‘q. Telefon raqamingiz profilda boshqalarga oshkor qilinmaydi. Xaritada ko‘rinishni esa istalgan payt bitta tugma bilan yopishingiz (Ghost Mode) mumkin.',
  },
  {
    q: 'Moneta sotib olish va olmos yechib olish qanday amalga oshiriladi?',
    a: 'Buyurtma berishda Telegram username yoki telefon raqamingizni qoldirasiz. Ariza boshqaruv markaziga tushadi va admin siz bilan shaxsan bog‘lanib to‘lovni tasdiqlagach balansga o‘tkazadi.',
  },
  {
    q: 'Saytdan tashqari Telegram ichida ham foydalansa bo‘ladimi?',
    a: 'Ha. Alov.uz ham oddiy mobil va kompyuter brauzerlarida, ham Telegram Mini App (@alovuz_bot) ichida bir xil tezkor rejimda ishlaydi.',
  },
];

interface LandingPageProps {
  onLogin: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
  const [galleryImgErrors, setGalleryImgErrors] = useState<Record<number, boolean>>({});
  const [communityImgError, setCommunityImgError] = useState(false);
  const [audienceMode, setAudienceMode] = useState<'female' | 'male'>('female');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const promoAutoplayUrl = buildAutoplayYouTubeEmbedUrl(LANDING_PROMO_VIDEO_URL);
  const activeAudience = AUDIENCE_BENEFITS[audienceMode];

  return (
    <div className="relative min-h-screen bg-[#09090D] text-[#F4F4F6] font-sans selection:bg-rose-500/30 selection:text-rose-200 overflow-x-clip">
      <SpringPetalsBackground />

      {/* Subtle ambient background glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/4 w-[520px] h-[520px] rounded-full bg-rose-600/10 blur-[130px]" />
        <div className="absolute top-1/3 -right-24 w-[420px] h-[420px] rounded-full bg-amber-500/5 blur-[130px]" />
      </div>

      {/* 3-Zone Top Bar Contract */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-[#09090D]/85 border-b border-white/[0.08]">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 h-16 sm:h-18 flex items-center justify-between gap-8">
          <a
            href="#"
            className="text-2xl font-editorial font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            alov<span className="text-rose-500">.uz</span>
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-300">
            <a href="#taqdimot" className="hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0">
              Taqdimot
            </a>
            <a href="#afzalliklar" className="hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0">
              Imkoniyatlar
            </a>
            <a href="#kimlar-uchun" className="hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0">
              Hamyon
            </a>
            <a href="#bosqichlar" className="hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0">
              Bosqichlar
            </a>
            <a href="#savollar" className="hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0">
              Savollar
            </a>
          </nav>

          <button
            type="button"
            onClick={onLogin}
            data-testid="landing-header-login-btn"
            className="px-5 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs sm:text-sm font-semibold shadow-lg shadow-rose-950/50 transition-all flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer active:scale-[0.98]"
          >
            <span>Kirish</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 pt-24 sm:pt-32 pb-20 space-y-20 sm:space-y-28 relative z-20">
        {/* Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-400">
              O‘zbekiston · Web va Telegram Mini App
            </p>

            <h1
              className="text-4xl sm:text-5xl lg:text-[58px] font-editorial font-bold text-white leading-[1.06] tracking-tight"
              style={{ textWrap: 'balance' }}
            >
              Samimiy insonlar bilan <span className="italic text-rose-500">haqiqiy</span> uchrashuvlar
            </h1>

            <p className="text-base sm:text-lg text-zinc-300 max-w-xl leading-relaxed">
              Google yoki Telegram orqali kirganingizda jonli kamera bilan tasdiqlangan haqiqiy profilga ega bo‘ling. Soxta suratlarsiz, o‘z hududingizdagi munosib insonlar bilan ishonchli muloqot qiling.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <button
                type="button"
                onClick={onLogin}
                data-testid="landing-hero-cta-btn"
                className="py-3.5 px-7 rounded-2xl bg-gradient-to-r from-[#E11D48] to-[#BE123C] text-white font-semibold text-sm sm:text-base shadow-xl shadow-rose-950/60 hover:brightness-110 transition-all flex items-center justify-center gap-2.5 whitespace-nowrap cursor-pointer active:scale-[0.98]"
              >
                <span>Kirish va boshlash</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <a
                href="https://t.me/alovuz_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="py-3.5 px-6 rounded-2xl bg-[#14161F] border border-white/15 hover:border-[#229ED9]/70 text-zinc-100 hover:text-[#38BDF8] font-semibold text-sm transition-all flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <svg className="w-4 h-4 fill-current text-[#38BDF8] shrink-0" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27 0-.12.05-1.98 1.26-5.6 3.7-.53.36-1.01.54-1.44.53-.47-.01-1.38-.26-2.06-.48-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.65-2.89 7.98-3.45 3.8-1.6 4.59-1.88 5.1-1.89.11 0 .37.03.54.17.14.12.18.28.2.4-.02.07-.02.13-.04.2z" />
                </svg>
                <span>Telegram Bot (@alovuz_bot)</span>
              </a>
            </div>

            <div className="pt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-400 font-medium border-t border-white/10">
              <span>Google va Telegram orqali tezkor kirish</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>Real kamera profil surati</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>14 hudud bo‘ylab</span>
            </div>
          </div>

          {/* Hero Auto-Playing Promo Video Card */}
          <div id="video" data-testid="landing-hero-video" className="lg:col-span-6 scroll-mt-24 flex">
            <div className="relative w-full rounded-[28px] overflow-hidden border border-white/15 shadow-[0_28px_70px_rgba(0,0,0,0.75)] bg-[#12131B] flex flex-col">
              {promoAutoplayUrl ? (
                <div className="relative aspect-video w-full bg-black">
                  <iframe
                    src={promoAutoplayUrl}
                    title="Alov.uz taqdimot videosi"
                    data-testid="landing-promo-iframe"
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="aspect-video w-full bg-gradient-to-br from-[#28121B] via-[#181A22] to-[#111218] flex flex-col items-center justify-center p-8 text-center">
                  <Video className="w-12 h-12 text-rose-500 mb-3" />
                  <p className="font-editorial text-2xl font-bold text-white">Alov.uz</p>
                </div>
              )}

              <div className="p-5 sm:p-6 bg-[#12131B] border-t border-white/10 text-left space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-400">
                  Platforma taqdimoti
                </p>
                <p className="font-editorial text-xl sm:text-2xl font-semibold text-white leading-snug">
                  Alov.uz qanday ishlashini tomosha qiling
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Live Metrics + Community Ratio Band */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-7">
            <GenderStatsBar />
          </div>
          <div className="lg:col-span-5 grid grid-cols-3 gap-3 bg-[#12131B] border border-white/10 rounded-[24px] p-5 sm:p-6">
            <div className="flex flex-col justify-center">
              <span className="font-mono text-2xl sm:text-3xl font-bold text-white tabular-nums">14</span>
              <span className="text-xs text-zinc-400 mt-1">Hududlar qamrovi</span>
            </div>
            <div className="flex flex-col justify-center border-l border-white/10 pl-4">
              <span className="font-mono text-2xl sm:text-3xl font-bold text-rose-400 tabular-nums">120</span>
              <span className="text-xs text-zinc-400 mt-1">Kunlik olmos limiti</span>
            </div>
            <div className="flex flex-col justify-center border-l border-white/10 pl-4">
              <span className="font-mono text-2xl sm:text-3xl font-bold text-emerald-400 tabular-nums">24/7</span>
              <span className="text-xs text-zinc-400 mt-1">Faol moderatsiya</span>
            </div>
          </div>
        </section>

        {/* Platform Visual Showcase Section */}
        <section id="taqdimot" data-testid="landing-showcase-section" className="scroll-mt-24 space-y-6 text-left">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-400">
                Samimiy hamjamiyat
              </p>
              <h2
                className="text-3xl sm:text-4xl font-editorial font-bold text-white tracking-tight"
                style={{ textWrap: 'balance' }}
              >
                Jonli efirlar va samimiy uchrashuvlar
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-sm leading-relaxed">
              Ro‘yxatdan o‘tish, Face ID tekshiruvi va jonli muloqot imkoniyatlari bilan ishonchli tanishuv muhiti.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {LANDING_GALLERY_IMAGES.map((item, idx) => (
              <div
                key={item.src}
                className="relative rounded-[26px] overflow-hidden border border-white/15 bg-[#12131B] shadow-[0_24px_60px_rgba(0,0,0,0.7)] group"
              >
                {!galleryImgErrors[idx] ? (
                  <div className="aspect-[4/5] w-full overflow-hidden">
                    <img
                      src={item.src}
                      alt={item.alt}
                      referrerPolicy="no-referrer"
                      loading={idx === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      width={736}
                      height={920}
                      className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                      onError={() => setGalleryImgErrors((prev) => ({ ...prev, [idx]: true }))}
                    />
                  </div>
                ) : (
                  <div className="aspect-[4/5] w-full bg-gradient-to-br from-[#28121B] via-[#181A22] to-[#111218] flex flex-col items-center justify-center p-8 text-center">
                    <Heart className="w-12 h-12 text-rose-500 mb-3" />
                    <p className="font-editorial text-2xl font-bold text-white">Alov.uz</p>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#09090D] via-[#09090D]/80 to-transparent p-5 sm:p-6 text-white text-left space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-400">
                    {item.eyebrow}
                  </p>
                  <p className="font-editorial text-lg sm:text-xl font-semibold text-white leading-snug">
                    {item.title}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Core Platform Capabilities Bento */}
        <section id="afzalliklar" className="scroll-mt-24 space-y-8 text-left">
          <div className="space-y-2.5 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-400">
              Platforma imkoniyatlari
            </p>
            <h2 className="text-3xl sm:text-4xl font-editorial font-bold text-white tracking-tight" style={{ textWrap: 'balance' }}>
              Ishonch, zamonaviy dizayn va samimiylikka asoslangan muhit
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Featured Face ID Card */}
            <div
              id="faceid"
              className="lg:col-span-7 bg-gradient-to-br from-[#161822] via-[#13141D] to-[#1B1218] p-7 sm:p-9 rounded-[26px] border border-white/10 flex flex-col justify-between space-y-6"
            >
              <div className="space-y-4 max-w-xl">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-400 border border-rose-500/25 flex items-center justify-center">
                  <ScanFace className="w-6 h-6" />
                </div>
                <h3 className="text-2xl sm:text-3xl font-editorial font-bold text-white tracking-tight">
                  Google va Telegram kirishida Haqiqiy Face ID
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  Saytga kirganingizda ortiqcha oynalar chiqmaydi. Faqat Google yoki Telegram orqali kirganingizda jonli kamera tekshiruvi ishga tushadi va o‘sha paytda olingan real suratingiz to‘g‘ridan-to‘g‘ri profilingizga qo‘yiladi.
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-400 pt-1">
                  <span className="inline-flex items-center gap-1.5 text-zinc-300">
                    <Camera className="w-3.5 h-3.5 text-rose-400" />
                    Real kamera surati profilga tushadi
                  </span>
                  <span aria-hidden="true" className="text-zinc-600">·</span>
                  <span>Avtomatik jins aniqlash</span>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={onLogin}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-rose-400 hover:text-rose-300 transition cursor-pointer"
                >
                  <span>Kirish oynasini ochish</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Community Photo Card */}
            <div className="lg:col-span-5 bg-[#12131B] rounded-[26px] border border-white/10 overflow-hidden flex flex-col">
              {!communityImgError ? (
                <div className="w-full h-64 sm:h-72 overflow-hidden">
                  <img
                    src={LANDING_GALLERY_IMAGES[1].src}
                    alt="Do'stona jamoa"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                    width={736}
                    height={920}
                    className="w-full h-full object-cover object-center"
                    onError={() => setCommunityImgError(true)}
                  />
                </div>
              ) : (
                <div className="w-full h-64 sm:h-72 bg-[#181A22] flex items-center justify-center">
                  <ShieldCheck className="w-10 h-10 text-rose-400" />
                </div>
              )}
              <div className="p-6 sm:p-7 space-y-2.5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-editorial font-bold text-white">Madaniyatli Muloqot</h3>
                  <p className="text-xs sm:text-sm text-zinc-300 mt-1.5 leading-relaxed">
                    O‘zbekona qadriyatlar va o‘zaro hurmat ustuvor. Soxta sahifalar va spam faoliyati qat’iy nazorat qilinadi.
                  </p>
                </div>
                <p className="pt-2 text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Tasdiqlangan hamjamiyat</span>
                </p>
              </div>
            </div>

            {/* Wallet & Monetization Card */}
            <div className="lg:col-span-6 bg-[#12131B] p-6 sm:p-7 rounded-[24px] border border-white/10 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                  <Coins className="w-5 h-5" />
                </div>
                <span className="font-mono text-xs font-semibold text-cyan-300 tabular-nums">
                  100 olmos = 10,000 so‘m
                </span>
              </div>
              <h3 className="text-xl font-editorial font-bold text-white">Shaffof Hamyon va Olmos Tizimi</h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Yigitlar uchun qulay moneta do‘koni (1,000 monetadan), qizlar uchun esa kunlik 120 olmos limiti va to‘lmagan qoldiqni ham 12 soat ichida hamyonga tushirib beruvchi avtomatik tizim.
              </p>
            </div>

            {/* Live Streams, Audio Rooms & Reels */}
            <div className="lg:col-span-6 bg-[#12131B] p-6 sm:p-7 rounded-[24px] border border-white/10 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                  <Radio className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-zinc-400">Jonli efir · Shorts · Audio xonalar</span>
              </div>
              <h3 className="text-xl font-editorial font-bold text-white">Jonli Efirlar, Postlar va 1-ga-1 Qo‘ng‘iroqlar</h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                O‘zingizning qisqa video va postlaringizni ulashing, jonli efir oching yoki ovozli suhbat xonalarida yangi do‘stlar orttiring.
              </p>
            </div>

            {/* Secondary 3 Feature Cards */}
            <div className="lg:col-span-4 bg-[#12131B] p-6 sm:p-7 rounded-[24px] border border-white/10 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                <Video className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-editorial font-bold text-white">HD Video va Audio</h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Telefon raqamingizni bermasdan ilova ichida jonli video efirlar, ovozli xabarlar va 1-ga-1 qo‘ng‘iroqlardan foydalaning.
              </p>
            </div>

            <div className="lg:col-span-4 bg-[#12131B] p-6 sm:p-7 rounded-[24px] border border-white/10 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-editorial font-bold text-white">Umumiy Jonli Xarita</h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Atrofingizdagi insonlarni xaritada ko‘ring yoki istalgan soniyada Ghost Mode orqali o‘z joylashuvingizni yashiring.
              </p>
            </div>

            <div className="lg:col-span-4 bg-[#12131B] p-6 sm:p-7 rounded-[24px] border border-white/10 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/20 flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-editorial font-bold text-white">Telegram Mini App & Web</h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Kompyuter va telefon brauzerida ham, Telegram ilovasi ichida ham bir xil tezlik va qulaylikda ishlaydi.
              </p>
            </div>
          </div>
        </section>

        {/* Interactive Audience Role Switcher */}
        <section
          id="kimlar-uchun"
          data-testid="landing-audience-section"
          className="scroll-mt-24 rounded-[28px] bg-[#12131B] border border-white/10 p-6 sm:p-10 space-y-8 text-left"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 border-b border-white/[0.08] pb-6">
            <div className="space-y-1.5 max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-400">
                Shaxsiy imkoniyatlar
              </p>
              <h2 className="text-2xl sm:text-3xl font-editorial font-bold text-white tracking-tight" style={{ textWrap: 'balance' }}>
                {activeAudience.heading}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                {activeAudience.lead}
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Foydalanuvchi turi"
              className="inline-flex items-center gap-1 p-1.5 rounded-xl bg-[#09090D] border border-white/10 self-start shrink-0"
            >
              <button
                type="button"
                role="tab"
                aria-selected={audienceMode === 'female'}
                data-testid="landing-tab-female"
                onClick={() => setAudienceMode('female')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  audienceMode === 'female'
                    ? 'bg-[#E11D48] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Gem className="w-3.5 h-3.5" />
                <span>Qizlar uchun</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={audienceMode === 'male'}
                data-testid="landing-tab-male"
                onClick={() => setAudienceMode('male')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  audienceMode === 'male'
                    ? 'bg-[#E11D48] text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Yigitlar uchun</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {activeAudience.points.map((pt, index) => (
              <div key={pt.title} className="space-y-2">
                <span className="font-mono text-xs font-bold text-rose-400 tabular-nums">
                  0{index + 1}
                </span>
                <h3 className="text-lg font-editorial font-bold text-white">{pt.title}</h3>
                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">{pt.desc}</p>
              </div>
            ))}
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08]">
            <p className="text-xs text-zinc-400">
              Ro‘yxatdan o‘tish bepul · Face ID xavfsizligi barcha a’zolar uchun majburiy
            </p>
            <button
              type="button"
              onClick={onLogin}
              className="px-5 py-2.5 rounded-xl bg-white/[0.08] hover:bg-[#E11D48] text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <span>{activeAudience.ctaLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        {/* How It Works */}
        <section id="bosqichlar" className="scroll-mt-24 space-y-8 text-left">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-400">3 oddiy qadam</p>
            <h2 className="text-3xl sm:text-4xl font-editorial font-bold text-white tracking-tight">
              Qanday boshlash mumkin?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                step: '01',
                title: 'Google yoki Telegram bilan kiring',
                desc: 'Kirish tugmasini bosib Google hisobingiz yoki Telegram bot (@alovuz_bot) orqali bir necha soniyada tizimga kiring.',
                icon: UserCheck,
              },
              {
                step: '02',
                title: 'Face ID va real kamera surati',
                desc: 'Google yoki Telegram orqali o‘tganingizda jonli kamera tekshiruvi chiqadi va real suratingiz profilingizga o‘rnatiladi.',
                icon: ScanFace,
              },
              {
                step: '03',
                title: 'Muloqot va jonli efirlar',
                desc: 'Nomzodlar bilan tanishing, postlar ulashing, chatda suhbatlashing va sovg‘alar yuboring.',
                icon: MessageCircle,
              },
            ].map((item) => (
              <div
                key={item.step}
                className="p-7 rounded-[24px] bg-[#12131B] border border-white/10 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-mono font-bold text-rose-400 tabular-nums">{item.step}</span>
                    <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                      <item.icon className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-xl font-editorial font-bold text-white">{item.title}</h3>
                  <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Safety Section */}
        <section
          id="xavfsizlik"
          className="scroll-mt-24 rounded-[28px] bg-gradient-to-br from-[#1B1218] via-[#13141D] to-[#0D0E14] text-white p-8 sm:p-12 border border-white/10 shadow-2xl text-left"
        >
          <div className="max-w-2xl space-y-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
              <Lock className="w-4 h-4" />
              <span>Shaxsiy maxfiylik va biometrik himoya</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-editorial font-bold tracking-tight text-white">
              Ma'lumotlaringiz va qadriyatlaringiz himoyada
            </h2>

            <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
              Telefon raqamingiz hech kimga ko‘rsatilmaydi va lokatsiya boshqaruvi to‘liq sizning qo‘lingizda. Face ID faqat Google va Telegram orqali kirishda ishga tushib, hamjamiyat xavfsizligini ta’minlaydi.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs sm:text-sm text-zinc-200">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Telefon raqami maxfiy saqlanadi</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Real kamera surati profilga saqlanadi</span>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive FAQ Section */}
        <section id="savollar" data-testid="landing-faq-section" className="scroll-mt-24 space-y-6 text-left">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-400">
              Ko‘p so‘raladigan savollar
            </p>
            <h2 className="text-3xl sm:text-4xl font-editorial font-bold text-white tracking-tight" style={{ textWrap: 'balance' }}>
              Platforma haqida muhim ma’lumotlar
            </h2>
          </div>

          <div className="divide-y divide-white/[0.08] rounded-[24px] bg-[#12131B] border border-white/10 overflow-hidden">
            {LANDING_FAQS.map((item, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    data-testid={`landing-faq-btn-${idx}`}
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full px-6 py-5 flex items-center justify-between gap-4 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <span className="text-sm sm:text-base font-semibold text-white">
                      {item.q}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-rose-400' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-5 text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-3xl">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Final CTA */}
        <section className="text-center p-8 sm:p-14 rounded-[28px] bg-[#12131B] border border-white/10 space-y-5">
          <p className="text-xs font-semibold text-rose-400 uppercase tracking-[0.16em]">
            Alov.uz hamjamiyati
          </p>
          <h2 className="text-3xl sm:text-4xl font-editorial font-bold text-white tracking-tight" style={{ textWrap: 'balance' }}>
            Samimiy suhbatlar sari ilk qadamni qo‘ying
          </h2>
          <p className="text-sm sm:text-base text-zinc-300 max-w-lg mx-auto">
            O‘zbekistondagi tasdiqlangan insonlar davrasiga hoziroq qo‘shiling.
          </p>
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={onLogin}
              className="py-3.5 px-9 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-semibold text-sm sm:text-base shadow-lg shadow-rose-950/50 transition-all flex items-center gap-2 cursor-pointer active:scale-[0.98]"
            >
              <span>Kirish va ro‘yxatdan o‘tish</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.08] bg-[#0B0C11] py-8 px-4 text-center text-xs text-zinc-400 space-y-2 relative z-20">
        <p className="font-semibold text-zinc-200">
          © 2026 Alov.uz · ZUHRIDDIN SYS PRODUCT
        </p>
        <p>O‘zbekistonning zamonaviy tanishuv va jonli muloqot platformasi · Barcha huquqlar himoyalangan</p>
      </footer>
    </div>
  );
};
