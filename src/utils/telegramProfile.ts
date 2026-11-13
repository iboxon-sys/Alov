export interface TelegramNameInput {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  phone?: string | null;
  existingName?: string | null;
}

export function normalizeTelegramHandle(input?: string | null): string {
  if (!input) return '';
  return input
    .toString()
    .trim()
    .replace(/^(https?:\/\/t\.me\/|@)/i, '')
    .toLowerCase();
}

export function isPlaceholderOrUsername(
  name?: string | null,
  username?: string | null,
  phone?: string | null
): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (!trimmed) return true;

  const lower = trimmed.toLowerCase();
  if (
    lower === 'foydalanuvchi' ||
    lower === 'profil' ||
    lower === 'mehmon' ||
    lower.includes('telegram foydalanuvch') ||
    lower.includes('alov foydalanuvch') ||
    trimmed.startsWith('@') ||
    lower.startsWith('https://t.me/') ||
    lower.startsWith('http://t.me/')
  ) {
    return true;
  }

  const cleanUsername = normalizeTelegramHandle(username);
  if (cleanUsername && normalizeTelegramHandle(trimmed) === cleanUsername) {
    return true;
  }

  const digitsName = trimmed.replace(/\D/g, '');
  const digitsPhone = (phone || '').replace(/\D/g, '');
  if (
    digitsName.length >= 7 &&
    digitsName.length === trimmed.replace(/[\s+\-()]/g, '').length &&
    (!digitsPhone || digitsPhone.endsWith(digitsName.slice(-9)) || digitsName.endsWith(digitsPhone.slice(-9)))
  ) {
    return true;
  }

  return false;
}

export function buildTelegramDisplayName(input: TelegramNameInput): string {
  const cleanFirst = (input.firstName || '').trim();
  const cleanLast = (input.lastName || '').trim();

  const firstValid = !isPlaceholderOrUsername(cleanFirst, input.username, input.phone)
    ? cleanFirst
    : '';
  const lastValid = !isPlaceholderOrUsername(cleanLast, input.username, input.phone)
    ? cleanLast
    : '';

  const combined = [firstValid, lastValid].filter(Boolean).join(' ').trim();
  if (combined) return combined;

  const cleanExisting = (input.existingName || '').trim();
  if (!isPlaceholderOrUsername(cleanExisting, input.username, input.phone)) {
    return cleanExisting;
  }

  return '';
}

export function isPlaceholderAvatar(url?: string | null): boolean {
  if (!url) return true;
  const trimmed = url.trim();
  if (!trimmed) return true;
  return trimmed.includes('images.unsplash.com');
}

export function pickPreferredAvatar(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (candidate && !isPlaceholderAvatar(candidate)) {
      return candidate.trim();
    }
  }
  return '';
}
