export interface PrivacyPolicySection {
  number: number;
  title: string;
  paragraphs: string[];
}

export const PRIVACY_POLICY_TITLE = 'MAXXFIYLIK SIYOSATI (PRIVACY POLICY)';
export const PRIVACY_POLICY_UPDATED_DATE = 'Oxirgi yangilangan sana: 2026-yil 16-noyabr';
export const PRIVACY_POLICY_INTRO =
  'Ushbu Maxfiylik Siyosati Alov.uz platformasi (keyingi o‘rinlarda — "Platforma") foydalanuvchilarining shaxsiy ma\'lumotlarini qanday yig‘ishi, saqlashi, qayta ishlashi va himoya qilishini tartibga soladi. Platformadan foydalanish orqali siz ushbu shartlarga rozilik bildirasiz.';

export const PRIVACY_POLICY_SECTIONS: PrivacyPolicySection[] = [
  {
    number: 1,
    title: "1. Yig‘iladigan ma'lumotlar",
    paragraphs: [
      'Platformamiz xizmatlarini ko‘rsatish va xavfsizlikni ta\'minlash maqsadida quyidagi ma\'lumotlar yig‘iladi:',
      '• Ro‘yxatdan o‘tish ma\'lumotlari: Foydalanuvchi ismi, foydalanuvchi nomi (username), jinsi va ro‘yxatdan o‘tgan vaqti.',
      '• Profil rasmi: Foydalanuvchi tomonidan yuklangan yoki kamera orqali olingan oddiy profil avatari.',
      '• Texnik ma\'lumotlar: Platforma xavfsizligini ta\'minlash va firibgarlikning oldini olish uchun IP-manzillar va qurilma loglari.',
    ],
  },
  {
    number: 2,
    title: '2. Biometrik ma\'lumotlar va Face ID bo‘yicha tushuntirish',
    paragraphs: [
      'Platformamizda yuzni aniqlash (Face ID / Liveness Detection) texnologiyasi faqatgina foydalanuvchining real inson ekanligini tekshirish (soxta profil yaratishning oldini olish) uchun real vaqt rejimida ishlatiladi.',
      'Foydalanuvchining yuz vektorlari, o‘lchovlari yoki biometrik shablonlari serverimizda yoki ma\'lumotlar bazasida aslo saqlanmaydi. Tasdiqlashdan so‘ng faqat oddiy profil rasmi saqlanib qoladi.',
    ],
  },
  {
    number: 3,
    title: "3. Ma'lumotlardan foydalanish maqsadi",
    paragraphs: [
      'To‘plangan ma\'lumotlar quyidagi maqsadlarda ishlatiladi:',
      '• Platformaning ishlashini ta\'minlash va foydalanuvchilarni o‘zaro bog‘lash.',
      '• Xavfsizlikni ta\'minlash, soxta akkauntlar va spamning oldini olish.',
      '• Qonunbuzarliklar yoki shubhali harakatlar sodir bo‘lganda, O‘zbekiston Respublikasining amaldagi qonunchiligiga muvofiq vakolatli davlat organlarining (IIV) rasmiy so‘rovlariga zarur texnik ma\'lumotlarni taqdim etish.',
    ],
  },
  {
    number: 4,
    title: '4. Admin panel va Moderatsiya',
    paragraphs: [
      'Platforma ma\'muriyati tizim xavfsizligini nazorat qilish va qoidalarga rioya etilishini tekshirish maqsadida foydalanuvchilarning asosiy ma\'lumotlari (ismi, profil rasmi, ro‘yxatdan o‘tgan vaqti) bo‘yicha texnik xabarnomalar (loglar) olish huquqiga ega.',
      'Bu ma\'lumotlar faqat xavfsizlik va moderatsiya maqsadida ishlatiladi, uchinchi shaxslarga sotilmaydi va shaxsiy maqsadlarda shaxsiy qurilmalarga saqlab olinmaydi.',
    ],
  },
  {
    number: 5,
    title: '5. Videoqo‘ng‘iroqlar maxfiyligi (End-to-End Encryption)',
    paragraphs: [
      'Platformamizdagi barcha video va ovozli qo‘ng‘iroqlar 100% End-to-End Shifrlangan (E2EE) hisoblanadi.',
      'Qo‘ng‘iroqlar mazmuni va videolavhalar serverimizda yozib olinmaydi va saqlanmaydi. Suhbatdoshlar o‘rtasidagi ma\'lumotlar faqat ularning o‘ziga tegishli bo‘lib, ma\'muriyat ularni ko‘ra olmaydi.',
    ],
  },
  {
    number: 6,
    title: '6. Taqiqlangan harakatlar va Kontent cheklovi',
    paragraphs: [
      'Platforma orqali har qanday zararli dasturlar (.apk, .exe va boshqa virusli fayllar), 100% taqiqlangan behayo (18+) kontent, shantaj materiallari va firibgarlik havolalarini tarqatish qat\'iyan taqiqlanadi.',
      'Shubhali yoki zararli fayllar aniqlansa, tizim ularni avtomatik bloklaydi. Qoidalarni buzgan foydalanuvchilarning akkaunti ogohlantirishsiz bloklanadi va ularning ma\'lumotlari qonun doirasida huquq-tartibot organlariga taqdim etilishi mumkin.',
    ],
  },
  {
    number: 7,
    title: '7. Foydalanuvchining huquq va majburiyatlari',
    paragraphs: [
      'Har bir foydalanuvchi o‘z shaxsiy ma\'lumotlarini o‘chirishni yoki akkauntini yopishni talab qilish huquqiga ega.',
      'Foydalanuvchi o‘z harakatlari va boshqalar bilan muloqotdagi odob-axloq qoidalari uchun shaxsan o‘zi javobgardir. Shubhali yoki tahdidli holatlar yuz berganda "Shikoyat qilish" (Report) tugmasidan foydalanish tavsiya etiladi.',
    ],
  },
];

export function hasScrolledPrivacyToBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  thresholdPx: number = 24
): boolean {
  if (scrollHeight <= 0 || clientHeight <= 0) return false;
  if (scrollHeight <= clientHeight + 4) return true;
  return scrollTop + clientHeight >= scrollHeight - Math.max(0, thresholdPx);
}
