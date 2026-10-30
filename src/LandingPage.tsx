import React from 'react';
import { ShieldCheck, Users, Smartphone, Zap, Heart, Flame } from 'lucide-react';
import { GenderStatsBar } from './components/GenderStatsBar';

export const LandingPage = ({ onLogin }: { onLogin: () => void }) => (
  <div className="min-h-screen bg-white text-slate-900 font-sans p-6 pb-20 space-y-10">
    <header className="text-center space-y-2">
      <h1 className="text-4xl font-black tracking-tight text-slate-900">
        alov<span className="text-[#E8474A]">.uz</span>
      </h1>
      <p className="text-slate-600 font-medium">O'zbekistondagi eng zamonaviy tanishuv va jonli muloqot platformasi.</p>
    </header>

    {/* Real-time Gender Statistics Bar */}
    <GenderStatsBar />

    <div className="bg-gradient-to-br from-rose-50 to-pink-50 p-6 rounded-3xl space-y-4 border border-rose-100">
      <h2 className="text-2xl font-bold text-slate-900">Nima uchun Alov.uz?</h2>
      <div className="grid grid-cols-2 gap-4">
        {[
          { icon: ShieldCheck, title: "Xavfsiz", desc: "Maxfiylik nazorati" },
          { icon: Users, title: "Jonli", desc: "Ovozli xonalar" },
          { icon: Flame, title: "Efir", desc: "Jonli translyatsiyalar" },
          { icon: Zap, title: "Tez", desc: "Zamonaviy interfeys" }
        ].map((item, i) => (
          <div key={i} className="bg-white p-4 rounded-2xl shadow-sm border border-rose-100 space-y-2">
            <item.icon className="w-6 h-6 text-[#E8474A]" />
            <div className="font-bold text-sm">{item.title}</div>
            <div className="text-[10px] text-slate-500">{item.desc}</div>
          </div>
        ))}
      </div>
    </div>

    <section className="space-y-6">
      <h2 className="text-2xl font-black text-slate-900">Ilova Kimlar Uchun?</h2>
      <div className="grid grid-cols-1 gap-4">
        {[
          { title: "Jiddiy niyatdagi insonlar", desc: "Oila qurishni rejalashtirganlar uchun." },
          { title: "Xavfsiz muhit", desc: "Nazorat qilinadigan tanishuv maydoni." },
          { title: "Real vaqtda muloqot", desc: "Yaqinlar bilan jonli bog'lanish." }
        ].map((item, i) => (
          <div key={i} className="p-5 rounded-3xl border border-slate-100 bg-white shadow-sm">
            <h3 className="font-bold text-lg">{item.title}</h3>
            <p className="text-sm text-slate-600">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="space-y-6">
      <h2 className="text-2xl font-black text-slate-900">Qanday Ishlaydi?</h2>
      <div className="space-y-4">
        {[
          { step: 1, text: "Profil yarating va rasmni yuklang." },
          { step: 2, text: "Xaritada jonli lokatsiya va efirlarni ko'ring." },
          { step: 3, text: "O'zaro rozilik bilan tanishish va yo'l topish." }
        ].map((item, i) => (
          <div key={i} className="flex items-center space-x-4">
            <div className="w-10 h-10 rounded-2xl bg-[#E8474A] text-white flex items-center justify-center font-black text-lg">
              {item.step}
            </div>
            <p className="text-base font-semibold text-slate-700">{item.text}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="space-y-6">
      <h2 className="text-2xl font-black text-slate-900">Xavfsizlik va Maxfiylik</h2>
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-8 rounded-3xl space-y-3 shadow-2xl">
        <p className="text-base font-medium">Biz xavfsizligingizni birinchi o'ringa qo'yamiz. Har bir profil tekshiriladi.</p>
        <p className="text-sm text-slate-400">Ma'lumotlaringiz shifrlangan va hech kimga oshkor qilinmaydi.</p>
      </div>
    </section>

    <button 
      onClick={onLogin}
      className="w-full py-4 rounded-2xl bg-slate-900 text-white font-bold text-lg shadow-xl shadow-slate-900/20 active:scale-95 transition"
    >
      Boshlash
    </button>
  </div>
);
