export interface AlovAiMatchCard {
  uid: string;
  id: string;
  name: string;
  username?: string;
  age?: number;
  gender?: 'male' | 'female' | string;
  region?: string;
  district?: string;
  neighborhood?: string;
  avatar?: string;
  bio?: string;
  isVerified?: boolean;
  isOnline?: boolean;
  startGifUrl?: string;
}

export type AlovAiPersonaRole = 'female_friend' | 'male_friend' | 'neutral_friend';

export function resolveAlovAiPersona(requesterGender?: string | null): AlovAiPersonaRole {
  const clean = String(requesterGender || '').trim().toLowerCase();
  if (clean === 'male' || clean === 'erkak' || clean === 'yigit') {
    // Boy user chats with AI acting as a friendly female friend
    return 'female_friend';
  }
  if (clean === 'female' || clean === 'ayol' || clean === 'qiz') {
    // Girl user chats with AI acting as a gentlemanly male friend
    return 'male_friend';
  }
  return 'neutral_friend';
}

const MATCHMAKING_TRIGGER_RE =
  /(qiz\s*top|yigit\s*top|juft\s*top|tanish(moq|ish|uv|tir)|qizlar\s*bormi|yigitlar\s*bormi|bola\s*top|qiz\s*kerak|yigit\s*kerak|juft\s*kerak|menga\s*(biror\s*)?(qiz|yigit|bola|odam)\s*(top|tavsiya|ko'rsat|korsat|chiqar)|turmush\s*o'rtoq|sevgi|romantik\s*tanish)/i;

const FEMALE_REQUEST_RE = /\b(qiz|ayol|qizlar|kelin)\b/i;
const MALE_REQUEST_RE = /\b(yigit|bola|erkak|yigitlar|bolalar|kuyov)\b/i;

export function detectMatchmakingIntent(conversationTexts: string | string[]): {
  wantsMatchmaking: boolean;
  requestedGender: 'female' | 'male' | null;
} {
  const combined = Array.isArray(conversationTexts)
    ? conversationTexts.join(' \n ')
    : String(conversationTexts || '');
  const wantsMatchmaking = MATCHMAKING_TRIGGER_RE.test(combined);
  if (!wantsMatchmaking) {
    return { wantsMatchmaking: false, requestedGender: null };
  }
  const asksFemale = FEMALE_REQUEST_RE.test(combined);
  const asksMale = MALE_REQUEST_RE.test(combined);
  const requestedGender =
    asksFemale && !asksMale ? 'female' : asksMale && !asksFemale ? 'male' : null;
  return { wantsMatchmaking: true, requestedGender };
}

function isEligibleDbCandidate(u: any, requesterUid?: string): boolean {
  if (!u || typeof u !== 'object' || !u.uid) return false;
  const uid = String(u.uid).trim();
  if (!uid || uid === String(requesterUid || '').trim()) return false;
  if (uid === 'alov_ai_bot' || uid === 'user_kamola_006' || u.id === 'ALOV-AI' || u.id === 'ALOV-006' || u.isAI) {
    return false;
  }
  if (u.isBanned) return false;
  if (u.isProfileCompleted === false) return false;
  if (u.gender !== 'male' && u.gender !== 'female') return false;
  return Boolean(String(u.name || '').trim());
}

export function filterCandidateMatches(
  allUsers: any[],
  requesterUser: any,
  conversationTexts: string | string[] = '',
  maxResults: number = 35
): any[] {
  const combinedLower = (Array.isArray(conversationTexts) ? conversationTexts.join(' ') : String(conversationTexts || '')).toLowerCase();
  const intent = detectMatchmakingIntent(combinedLower);

  const defaultTargetGender: 'male' | 'female' | null =
    intent.requestedGender ||
    (requesterUser?.gender === 'male'
      ? 'female'
      : requesterUser?.gender === 'female'
      ? 'male'
      : null);

  // Extract optional explicit age numbers mentioned in recent conversation
  const ageMatches = combinedLower.match(/\b(1[89]|[2-5][0-9]|60)\b/g)?.map(Number) || [];
  const minAge = ageMatches.length >= 2 ? Math.min(...ageMatches) : ageMatches.length === 1 ? ageMatches[0] - 4 : null;
  const maxAge = ageMatches.length >= 2 ? Math.max(...ageMatches) : ageMatches.length === 1 ? ageMatches[0] + 4 : null;

  const eligible = (Array.isArray(allUsers) ? allUsers : []).filter((u) =>
    isEligibleDbCandidate(u, requesterUser?.uid)
  );

  const scored = eligible.map((u) => {
    let score = 0;
    if (defaultTargetGender && u.gender === defaultTargetGender) score += 100;
    if (u.isOnline) score += 12;
    if (u.avatar) score += 8;
    if (u.bio && String(u.bio).trim().length > 10) score += 5;

    const regionLower = String(u.region || '').toLowerCase();
    const districtLower = String(u.district || '').toLowerCase();
    const regionRoot = regionLower.replace(/\s*(viloyati|shahri|respublikasi)\s*/g, '').trim();
    const districtRoot = districtLower.replace(/\s*(tumani|shahri)\s*/g, '').trim();

    if (regionRoot && combinedLower.includes(regionRoot)) score += 45;
    if (districtRoot && combinedLower.includes(districtRoot)) score += 45;

    const age = Number(u.age || 0);
    if (minAge !== null && maxAge !== null && age > 0) {
      if (age >= minAge && age <= maxAge) score += 30;
    }

    return { user: u, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, maxResults)).map((s) => s.user);
}

export function formatCandidateForPrompt(u: any): Record<string, any> {
  return {
    uid: String(u.uid || ''),
    name: String(u.name || ''),
    username: u.username ? `@${String(u.username).replace(/^@/, '')}` : '',
    age: Number(u.age || 22),
    gender: u.gender === 'female' ? 'ayol/qiz' : 'erkak/yigit',
    region: String(u.region || ''),
    district: String(u.district || ''),
    bio: String(u.bio || '').slice(0, 140),
    isOnline: Boolean(u.isOnline),
  };
}

export function buildAlovAiSystemInstruction(params: {
  requesterUser: any;
  candidatePool: any[];
  includeMatchmakingDatabase: boolean;
}): string {
  const { requesterUser, candidatePool, includeMatchmakingDatabase } = params;
  const persona = resolveAlovAiPersona(requesterUser?.gender);
  const userName = String(requesterUser?.name || '').trim() || "do'stim";

  const personaBlock =
    persona === 'female_friend'
      ? `Sening ro'ling: Sen foydalanuvchi (${userName}, yigit) bilan samimiy, quvnoq, aqlli va mehrli QIZ BOLA do'st sifatida gaplashasan ("men" deganda ayol/qiz kishi ohangida, samimiy o'zbek tilida).`
      : persona === 'male_friend'
      ? `Sening ro'ling: Sen foydalanuvchi (${userName}, qiz bola) bilan xushmuomala, e'tiborli, samimiy va himoyakor ER YIGIT do'st sifatida gaplashasan ("men" deganda erkak/yigit kishi ohangida, hurmat bilan).`
      : `Sening ro'ling: Sen foydalanuvchi (${userName}) bilan samimiy, tabiiy do'st sifatida gaplashasan.`;

  const baseRules = `Isming: Alov AI.
${personaBlock}

ASOSIY QOIDALAR:
1. ODDIY DO'STONA SUHBAT: Oddiy hayotiy mavzularda (salom-alik, kayfiyat, kun, ish, qiziqishlar, hazil) xuddi Telegramdagi yaqin do'stdek tabiiy, qisqa va jonli gaplash. Rasmiy robot yoki shablon avtojavob yozma.
2. QAT'IY TAQIQ (JUFT HAQIDA OLDINDAN GAPIRMASLIK): Foydalanuvchining o'zi "menga qiz topib ber", "yigit topib ber", "juft izlayapman" yoki tanishish/juft topish mavzusini ochmaguncha — TANISHUV, JUFT IZLASH, QANDAY ODAM XOHLASHI YOKI PROFLLAR HAQIDA BIR OG'IZ HAM GAPIRMA! Ungacha matchedUserUids ni HAR DOIM [] (bo'sh massiv) qilib qaytar.
3. JSON FORMAT: Javobingni FAQAT quyidagi JSON formatda qaytar:
{
  "reply": "Suhbat javobi matni",
  "matchedUserUids": []
}`;

  if (!includeMatchmakingDatabase) {
    return baseRules;
  }

  const compactDb = candidatePool.map(formatCandidateForPrompt);
  return `${baseRules}

TANISHUV VA BAZADAN JUFT TOPISH REJIMI (FAQAT foydalanuvchi o'zi so'raganda ishlatiladi):
- Foydalanuvchi qiz yoki yigit topib berishni so'ragan bo'lsa:
  a) Agar hali qanday yosh, qaysi viloyat/shahar yoki xarakter/qiziqishdagi inson kerakligini aytmagan bo'lsa, avval do'stona so'roq qil: masalan, yoshi nechida bo'lishi, qaysi hududdan bo'lishi va qanday inson yoqishini so'ra (bunda matchedUserUids: []).
  b) Agar foydalanuvchi o'z talablarini (yoshi, viloyat/tumani, jinsi, qiziqishlari yoki "farqi yo'q ko'rsataver") aytgan bo'lsa, quyidagi REAL BAZA RO'YXATIDAN eng mos keladigan 1 tadan 4 tagacha foydalanuvchining ANIQ "uid" qiymatini matchedUserUids ga qo'y va javobingda ularning ismi, yoshi va hududi haqida qisqacha iliq tavsiya ber!
  c) HECH QACHON ro'yxatda yo'q uydirma uid yoki odam o'ylab topma.

REAL FOYDALANUVCHILAR BAZASI (JSON):
${JSON.stringify(compactDb)}`;
}

export function sanitizeAlovAiMatchCard(user: any): AlovAiMatchCard {
  return {
    uid: String(user.uid),
    id: String(user.id || user.uid),
    name: String(user.name || 'Foydalanuvchi'),
    username: user.username ? String(user.username) : '',
    age: Number(user.age || 22),
    gender: user.gender,
    region: String(user.region || ''),
    district: String(user.district || ''),
    neighborhood: String(user.neighborhood || ''),
    avatar: String(user.avatar || user.faceId?.capturedPhotoUrl || ''),
    bio: String(user.bio || ''),
    isVerified: Boolean(user.faceId?.verified || user.isVerified),
    isOnline: Boolean(user.isOnline),
    startGifUrl: String(user.startGifUrl || ''),
  };
}

export function parseAlovAiStructuredOutput(
  rawText: string,
  candidatePool: any[],
  allowMatchCards: boolean
): { reply: string; recommendedProfiles: AlovAiMatchCard[] } {
  const cleanRaw = String(rawText || '').trim();
  let parsed: any = null;
  if (cleanRaw) {
    try {
      parsed = JSON.parse(cleanRaw);
    } catch {
      const jsonMatch = cleanRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          parsed = null;
        }
      }
    }
  }

  const reply =
    parsed && typeof parsed.reply === 'string' && parsed.reply.trim()
      ? parsed.reply.trim()
      : cleanRaw || 'Salom! Qalaysiz, bugun nima gaplar?';

  if (!allowMatchCards || !parsed || !Array.isArray(parsed.matchedUserUids)) {
    return { reply, recommendedProfiles: [] };
  }

  const byUid = new Map<string, any>();
  for (const u of candidatePool) {
    if (u?.uid) byUid.set(String(u.uid), u);
  }

  const recommendedProfiles: AlovAiMatchCard[] = [];
  const seen = new Set<string>();
  for (const rawUid of parsed.matchedUserUids) {
    const uid = String(rawUid || '').trim();
    if (!uid || seen.has(uid)) continue;
    const matched = byUid.get(uid);
    if (!matched) continue;
    seen.add(uid);
    recommendedProfiles.push(sanitizeAlovAiMatchCard(matched));
    if (recommendedProfiles.length >= 4) break;
  }

  return { reply, recommendedProfiles };
}
