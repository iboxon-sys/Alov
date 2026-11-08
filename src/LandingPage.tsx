import React from 'react';
import { 
  ShieldCheck, 
  Users, 
  Flame, 
  Zap, 
  Heart, 
  Video, 
  Mic, 
  MapPin, 
  Sparkles, 
  CheckCircle2, 
  Lock, 
  ArrowRight,
  MessageCircle,
  Smartphone
} from 'lucide-react';
import { GenderStatsBar } from './components/GenderStatsBar';
import { SpringPetalsBackground } from './components/SpringPetalsBackground';

interface LandingPageProps {
  onLogin: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-rose-50/60 via-white to-pink-50/40 text-slate-900 font-sans selection:bg-rose-200 selection:text-rose-900">
      {/* Dynamic floating spring blossom petals canvas */}
      <SpringPetalsBackground />

      {/* Fixed Top Bar Navigation - always sticky regardless of scroll */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-white/90 border-b border-rose-100/80 shadow-xs transition-all">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
          {/* Brand Wordmark */}
          <div className="flex items-center space-x-3">
            <div className="relative">
              <img 
                src="/assets/aistudio/image_e20a1307.png" 
                alt="Alov.uz" 
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl shadow-sm object-cover border border-rose-200" 
              />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
            </div>
            <div>
              <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 font-display">
                alov<span className="text-[#E8474A]">.uz</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-[11px] font-semibold text-rose-500/80 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">
                ✨ Maxsus mavsum
              </span>
            </div>
          </div>

          {/* Clean Nav Links */}
          <nav className="hidden md:flex items-center space-x-8 text-sm font-semibold text-slate-600">
            <a href="#afzalliklar" className="hover:text-rose-600 transition whitespace-nowrap">Afzalliklar</a>
            <a href="#imkoniyatlar" className="hover:text-rose-600 transition whitespace-nowrap">Imkoniyatlar</a>
            <a href="#bosqichlar" className="hover:text-rose-600 transition whitespace-nowrap">Qanday ishlaydi</a>
            <a href="#xavfsizlik" className="hover:text-rose-600 transition whitespace-nowrap">Xavfsizlik</a>
          </nav>

          {/* Action CTA */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={onLogin}
              className="px-4 sm:px-6 py-2.5 rounded-2xl bg-[#E8474A] hover:bg-[#d4383b] text-white text-xs sm:text-sm font-bold shadow-md shadow-rose-500/20 active:scale-95 transition-all flex items-center space-x-1.5 whitespace-nowrap"
            >
              <span>Kirish</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-16 space-y-16 sm:space-y-24 relative z-20">
        
        {/* Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-rose-100/80 border border-rose-200/70 text-rose-700 text-xs font-bold tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-rose-500" />
              <span>O'zbekistondagi №1 Zamonaviy Tanishuv Maydoni</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]" style={{ textWrap: 'balance' }}>
              Yangi Tanishuvlar, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E8474A] via-pink-600 to-rose-500">
                Jonli Ovozli Xonalar
              </span> <br />
              va Samimiy Suhbatlar
            </h1>

            <p className="text-base sm:text-lg text-slate-600 max-w-xl leading-relaxed">
              Yangi hayot va iliq munosabatlar sari qadam qo'ying. O'zbekistonning barcha 14 hududidan 100% tekshirilgan insonlar bilan xavfsiz tanishing, jonli ovozli xonalarda suhbatlashing va o'z juftingizni toping.
            </p>

            {/* CTA Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button 
                onClick={onLogin}
                className="py-4 px-8 rounded-2xl bg-gradient-to-r from-[#E8474A] to-rose-600 text-white font-bold text-base shadow-xl shadow-rose-500/25 hover:shadow-rose-500/35 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center space-x-2"
              >
                <span>🔥 Hoziroq Boshlash</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <a 
                href="https://t.me/alovuz_bot" 
                target="_blank" 
                rel="noopener noreferrer"
                className="py-4 px-6 rounded-2xl bg-white border border-slate-200 hover:border-[#229ED9] text-slate-800 hover:text-[#229ED9] font-bold text-sm shadow-xs transition-all flex items-center justify-center space-x-2"
              >
                <svg className="w-4 h-4 fill-current text-[#229ED9]" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27 0-.12.05-1.98 1.26-5.6 3.7-.53.36-1.01.54-1.44.53-.47-.01-1.38-.26-2.06-.48-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.65-2.89 7.98-3.45 3.8-1.6 4.59-1.88 5.1-1.89.11 0 .37.03.54.17.14.12.18.28.2.4-.02.07-.02.13-.04.2z"/>
                </svg>
                <span>Telegram Bot (@alovuz_bot)</span>
              </a>
            </div>

            {/* Trust Metrics */}
            <div className="pt-4 flex items-center gap-6 text-xs text-slate-500 font-semibold border-t border-rose-100">
              <div className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>100% Tekshirilgan profillar</span>
              </div>
              <span className="text-slate-300">·</span>
              <div className="flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-rose-500 shrink-0" />
                <span>To'liq maxfiylik nazorati</span>
              </div>
            </div>
          </div>

          {/* Hero Visual Card */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              {/* Soft decorative background glow */}
              <div className="absolute -inset-4 bg-gradient-to-r from-pink-300/40 via-rose-200/40 to-amber-200/30 rounded-3xl blur-2xl -z-10" />

              <div className="relative rounded-3xl overflow-hidden shadow-2xl border-2 border-white/80 bg-white">
                <img 
                  src="/assets/images/hero_spring_dating_1794157256006.jpg" 
                  alt="Alov.uz Tanishuv" 
                  className="w-full h-80 sm:h-96 object-cover"
                  onError={(e: any) => {
                    e.target.src = 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&q=80&w=800';
                  }}
                />
                
                {/* Overlay live tag */}
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-2xl shadow-md border border-white/60 flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
                  <span className="text-xs font-black text-slate-800 tracking-tight">Ovozli xonalar faol</span>
                </div>

                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/85 via-slate-900/40 to-transparent p-5 text-white text-left">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm sm:text-base text-white">Yangi Uchrashuvlar va Suhbatlar</p>
                      <p className="text-xs text-rose-200">Toshkent, Samarqand, Andijon va boshqa viloyatlar</p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-rose-300">
                      <Heart className="w-5 h-5 fill-current text-rose-400" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Real-time Gender Statistics Bar Component */}
        <section className="space-y-3">
          <GenderStatsBar />
        </section>

        {/* Bento Grid: Core Capabilities */}
        <section id="afzalliklar" className="space-y-8 text-left">
          <div className="space-y-2">
            <span className="text-xs font-black uppercase tracking-wider text-rose-600">Platforma Afzalliklari</span>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Nega aynan Alov.uz?
            </h2>
            <p className="text-slate-600 text-sm sm:text-base max-w-2xl">
              Oddiy tanishuv saytlaridan farqli ravishda, Alov.uz zamonaviy texnologiyalar va o'zbekona qadriyatlarni uyg'unlashtirgan.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Large Featured */}
            <div className="md:col-span-2 bg-gradient-to-br from-rose-50 via-white to-pink-50/60 p-6 sm:p-8 rounded-3xl border border-rose-100 shadow-sm relative overflow-hidden flex flex-col justify-between">
              <div className="space-y-4 max-w-lg relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-[#E8474A] text-white flex items-center justify-center shadow-md shadow-rose-500/20">
                  <Mic className="w-6 h-6" />
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                  Jonli Ovozli Xonalar (Clubhouse / Spaces)
                </h3>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                  Faqat matnli yozishmalar bilan cheklanmang! Qiziqishlar, kitoblar, psixologiya yoki erkin suhbat xonalariga qo'shiling, ovozingiz bilan samimiy taassurot qoldiring.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <span className="text-xs font-bold px-3 py-1 bg-white border border-rose-200 rounded-xl text-rose-700">🎙️ Jonli efir</span>
                  <span className="text-xs font-bold px-3 py-1 bg-white border border-rose-200 rounded-xl text-rose-700">⚡ Nol kechikish</span>
                  <span className="text-xs font-bold px-3 py-1 bg-white border border-rose-200 rounded-xl text-rose-700">🔒 Faqat tasdiqlanganlar</span>
                </div>
              </div>

              <div className="pt-6 relative z-10">
                <button 
                  onClick={onLogin}
                  className="inline-flex items-center space-x-2 text-sm font-bold text-[#E8474A] hover:text-[#cb2e31] transition"
                >
                  <span>Xonalarni ko'rish</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Card 2: Community Vibes Image */}
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
              <img 
                src="/assets/images/spring_community_vibes_1794157256761.jpg" 
                alt="Do'stona Jamoa" 
                className="w-full h-48 object-cover" 
                onError={(e: any) => {
                  e.target.src = 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&q=80&w=800';
                }}
              />
              <div className="p-6 space-y-2 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Do'stona va Madaniyatli Muhit</h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    Haqorat, noo'rin xatti-harakatlar moderatorlar va AI filtrlari tomonidan darhol cheklanadi.
                  </p>
                </div>
                <div className="pt-2 text-xs font-bold text-rose-600 flex items-center space-x-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Xavfsiz va madaniyatli</span>
                </div>
              </div>
            </div>

            {/* Card 3: Video Calls */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <Video className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">HD Video & Audio Qo'ng'iroqlar</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Google Meet va WebRTC texnologiyasi asosida telefon raqamingizni oshkor qilmasdan to'g'ridan-to'g'ri bog'laning.
              </p>
            </div>

            {/* Card 4: Location Radar */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
                <MapPin className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Yaqin Atrofdagi Insonlar</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Xaritada o'z hududingizdagi foydalanuvchilarni ko'ring yoki Ghost Mode (Arvoh rejimi) orqali to'liq yashirining.
              </p>
            </div>

            {/* Card 5: Telegram Bot Notification */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#229ED9]">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Telegram Bot Eslatmalari</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Yangi xabar, efir boshlanishi yoki layklar haqida Telegram (@alovuz_bot) orqali bir soniyada xabardor bo'ling.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works (3 Steps) */}
        <section id="bosqichlar" className="space-y-8 text-left">
          <div className="space-y-2">
            <span className="text-xs font-black uppercase tracking-wider text-rose-600">Oson va Qulay</span>
            <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Qanday boshlash mumkin?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Tezkor Ro'yxatdan O'tish",
                desc: "Telegram profilingiz yoki telefon raqamingiz orqali 10 soniyada kiring. Parol eslab qolish shart emas.",
                icon: Zap
              },
              {
                step: "02",
                title: "Profilni Sozlash",
                desc: "Yoshingiz, qiziqishlaringiz va samimiy suratingizni joylang. O'zingiz haqingizda qisqacha yozing.",
                icon: Heart
              },
              {
                step: "03",
                title: "Jonli Muloqotni Boshlash",
                desc: "Ovozli xonalarga kiring, reels videolarni tomosha qiling va yoqqan insonlarga xabar yuboring.",
                icon: MessageCircle
              }
            ].map((item, idx) => (
              <div key={idx} className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4 relative">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-black text-rose-300 font-mono tabular-nums">{item.step}</span>
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 text-[#E8474A] flex items-center justify-center">
                    <item.icon className="w-5 h-5" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Safety & Values Section */}
        <section id="xavfsizlik" className="rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-8 sm:p-12 shadow-2xl relative overflow-hidden text-left">
          <div className="max-w-2xl space-y-5 relative z-10">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold">
              <Lock className="w-3.5 h-3.5" />
              <span>Ishonchli va Kafolatlangan Himoya</span>
            </div>
            
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
              Shaxsiy ma'lumotlaringiz va qadriyatlaringiz daxlsizdir
            </h2>
            
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Biz o'zbekona axloq me'yorlari va o'zaro hurmatni ustun qo'yamiz. Har bir akkaunt moderatorlarimiz tomonidan doimiy tekshiriladi, noo'rin xabarlar va soxta akkauntlarga ruxsat berilmaydi.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-xs sm:text-sm text-slate-200">Telefon raqamingiz hech kimga ko'rinmaydi</span>
              </div>
              <div className="flex items-start space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-xs sm:text-sm text-slate-200">Xaritada lokatsiyani istalgan payt yashirish</span>
              </div>
            </div>
          </div>
        </section>

        {/* Final Conversion CTA */}
        <section className="text-center p-8 sm:p-14 rounded-3xl bg-gradient-to-b from-rose-100/70 via-pink-50 to-white border border-rose-200/80 shadow-md space-y-6">
          <span className="text-4xl sm:text-5xl">🌸</span>
          <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight" style={{ textWrap: 'balance' }}>
            Hayotingizdagi yangi baxt va samimiy do'stlaringizni qarshi oling!
          </h2>
          <p className="text-sm sm:text-base text-slate-600 max-w-lg mx-auto">
            Alov.uz hamjamiyatiga bugunoq bepul qo'shiling. O'zingiz kabi samimiy va jiddiy niyatli insonlar sizni kutmoqda.
          </p>
          <div className="pt-2 flex justify-center">
            <button
              onClick={onLogin}
              className="py-4 px-10 rounded-2xl bg-[#E8474A] hover:bg-[#d4383b] text-white font-bold text-base shadow-xl shadow-rose-500/30 active:scale-95 transition-all flex items-center space-x-2"
            >
              <span>🔥 Bepul A'zo Bo'lish</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>

      </main>

      {/* Clean Footer */}
      <footer className="border-t border-rose-100 bg-white/70 backdrop-blur-md py-8 text-center text-xs text-slate-500 space-y-2 relative z-20">
        <p className="font-semibold text-slate-700">© 2026 Alov.uz — O'zbekistonning zamonaviy tanishuv va jonli muloqot platformasi.</p>
        <p>Barcha huquqlar himoyalangan · Xavfsizlik va maxfiylik siyosati</p>
      </footer>
    </div>
  );
};
