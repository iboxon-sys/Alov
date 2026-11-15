export interface CountryDialRule {
  iso: string;
  dialCode: string; // digits without '+'
  nameUz: string;
  flag: string;
  groups: number[]; // digit group sizes after dialCode
  maxNationalDigits: number;
  placeholderExample: string;
}

export const COUNTRY_DIAL_RULES: CountryDialRule[] = [
  {
    iso: 'UZ',
    dialCode: '998',
    nameUz: "O'zbekiston",
    flag: '🇺🇿',
    groups: [2, 3, 2, 2],
    maxNationalDigits: 9,
    placeholderExample: '+998 90 123 45 67',
  },
  {
    iso: 'KG',
    dialCode: '996',
    nameUz: "Qirg'iziston",
    flag: '🇰🇬',
    groups: [3, 3, 3],
    maxNationalDigits: 9,
    placeholderExample: '+996 555 123 456',
  },
  {
    iso: 'TJ',
    dialCode: '992',
    nameUz: 'Tojikiston',
    flag: '🇹🇯',
    groups: [2, 3, 4],
    maxNationalDigits: 9,
    placeholderExample: '+992 90 123 4567',
  },
  {
    iso: 'TM',
    dialCode: '993',
    nameUz: 'Turkmaniston',
    flag: '🇹🇲',
    groups: [2, 6],
    maxNationalDigits: 8,
    placeholderExample: '+993 65 123456',
  },
  {
    iso: 'AZ',
    dialCode: '994',
    nameUz: 'Ozarbayjon',
    flag: '🇦🇿',
    groups: [2, 3, 2, 2],
    maxNationalDigits: 9,
    placeholderExample: '+994 50 123 45 67',
  },
  {
    iso: 'AE',
    dialCode: '971',
    nameUz: 'BAA',
    flag: '🇦🇪',
    groups: [2, 3, 4],
    maxNationalDigits: 9,
    placeholderExample: '+971 50 123 4567',
  },
  {
    iso: 'TR',
    dialCode: '90',
    nameUz: 'Turkiya',
    flag: '🇹🇷',
    groups: [3, 3, 2, 2],
    maxNationalDigits: 10,
    placeholderExample: '+90 532 123 45 67',
  },
  {
    iso: 'KR',
    dialCode: '82',
    nameUz: 'Janubiy Koreya',
    flag: '🇰🇷',
    groups: [2, 4, 4],
    maxNationalDigits: 10,
    placeholderExample: '+82 10 1234 5678',
  },
  {
    iso: 'DE',
    dialCode: '49',
    nameUz: 'Germaniya',
    flag: '🇩🇪',
    groups: [3, 4, 4],
    maxNationalDigits: 11,
    placeholderExample: '+49 151 1234 5678',
  },
  {
    iso: 'GB',
    dialCode: '44',
    nameUz: 'Buyuk Britaniya',
    flag: '🇬🇧',
    groups: [4, 3, 3],
    maxNationalDigits: 10,
    placeholderExample: '+44 7911 123 456',
  },
  {
    iso: 'RU',
    dialCode: '7',
    nameUz: 'Rossiya',
    flag: '🇷🇺',
    groups: [3, 3, 2, 2],
    maxNationalDigits: 10,
    placeholderExample: '+7 916 123 45 67',
  },
  {
    iso: 'US',
    dialCode: '1',
    nameUz: 'AQSh / Kanada',
    flag: '🇺🇸',
    groups: [3, 3, 4],
    maxNationalDigits: 10,
    placeholderExample: '+1 212 555 0199',
  },
];

// Longest dial code first so +998 matches before +9, etc.
const SORTED_DIAL_RULES = [...COUNTRY_DIAL_RULES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length
);

export function extractPhoneDigits(input: string): string {
  return String(input || '').replace(/\D/g, '');
}

export function detectPhoneCountry(input: string): CountryDialRule | null {
  const digits = extractPhoneDigits(input);
  if (!digits) return null;

  for (const rule of SORTED_DIAL_RULES) {
    if (digits.startsWith(rule.dialCode)) {
      return rule;
    }
  }
  return null;
}

export function formatPhoneNumberPretty(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const digits = extractPhoneDigits(raw);
  if (!digits) {
    return raw.startsWith('+') ? '+' : '';
  }

  const rule = detectPhoneCountry(digits);
  if (!rule) {
    // Generic international grouping by 3-digit blocks after dial prefix
    const trimmed = digits.slice(0, 15);
    const chunks = trimmed.match(/.{1,3}/g) || [];
    return `+${chunks.join(' ')}`;
  }

  const national = digits.slice(rule.dialCode.length, rule.dialCode.length + rule.maxNationalDigits);
  if (!national) {
    return `+${rule.dialCode}`;
  }

  const parts: string[] = [`+${rule.dialCode}`];
  let cursor = 0;
  for (const size of rule.groups) {
    if (cursor >= national.length) break;
    parts.push(national.slice(cursor, cursor + size));
    cursor += size;
  }
  if (cursor < national.length) {
    parts.push(national.slice(cursor));
  }

  return parts.join(' ');
}
