export interface UsernameValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

/**
 * Validates an Alov.uz @username:
 * - No spaces allowed anywhere (including leading/trailing inside handle)
 * - 3 to 20 characters
 * - Only Latin letters, digits, and underscore (_)
 */
export function validateUsername(raw: string | null | undefined): UsernameValidationResult {
  const source = String(raw ?? '');
  if (/\s/.test(source)) {
    return {
      valid: false,
      normalized: source.replace(/^@/, '').replace(/\s+/g, '').toLowerCase(),
      error: "Username da bo'sh joy (probel) ishlatish mumkin emas!",
    };
  }

  const stripped = source.replace(/^@+/, '').toLowerCase();
  if (!stripped) {
    return {
      valid: false,
      normalized: '',
      error: 'Username kiriting (kamida 3 ta belgi).',
    };
  }

  if (stripped.length < 3 || stripped.length > 20) {
    return {
      valid: false,
      normalized: stripped,
      error: "Username 3 dan 20 tagacha belgidan iborat bo'lishi kerak.",
    };
  }

  if (!/^[a-z0-9_]+$/.test(stripped)) {
    return {
      valid: false,
      normalized: stripped,
      error: "Username faqat lotin harflari (a-z), raqamlar (0-9) va pastki chiziq (_) dan iborat bo'lishi kerak.",
    };
  }

  return {
    valid: true,
    normalized: stripped,
  };
}

export function isUsernameUnique(
  candidate: string | null | undefined,
  usersList: Array<{ uid?: string; id?: string; username?: string }>,
  excludeUid?: string | null
): boolean {
  const clean = String(candidate ?? '').trim().replace(/^@+/, '').toLowerCase();
  if (!clean) return false;

  for (const u of usersList || []) {
    if (!u) continue;
    if (excludeUid && (u.uid === excludeUid || u.id === excludeUid)) continue;
    const existing = String(u.username || '').trim().replace(/^@+/, '').toLowerCase();
    if (existing && existing === clean) {
      return false;
    }
  }
  return true;
}

export function formatUsernameDisplay(username?: string | null): string {
  const clean = String(username || '').trim().replace(/^@+/, '');
  return clean ? `@${clean}` : '';
}
