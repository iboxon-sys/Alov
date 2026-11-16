import { isAdminTelegramUser } from './tokenomics';

export interface MandatorySubscriptionConfig {
  enabled: boolean;
  messageText: string;
  channelLink: string;
  buttonText: string;
  channelChatId?: string;
  channelUsername?: string;
  channelTitle?: string;
  botIsAdmin: boolean;
  botAdminCheckedAt?: string;
  botAdminError?: string;
  updatedAt?: string;
}

export const DEFAULT_MANDATORY_SUBSCRIPTION_CONFIG: MandatorySubscriptionConfig = {
  enabled: false,
  messageText: "Platformadan to'liq foydalanish uchun rasmiy kanalimizga obuna bo'ling!",
  channelLink: '',
  buttonText: "Kanalga obuna bo'lish",
  channelChatId: '',
  channelUsername: '',
  channelTitle: '',
  botIsAdmin: false,
};

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatChatMessageSpoilerNotification(params: {
  senderName: string;
  senderUsername?: string;
  messageText: string;
  mediaType?: string;
}): string {
  const safeName = escapeTelegramHtml(params.senderName?.trim() || 'Foydalanuvchi');
  const cleanHandle = String(params.senderUsername || '')
    .replace(/^(https?:\/\/t\.me\/|@)/i, '')
    .trim();
  const handleSuffix = cleanHandle ? ` (@${escapeTelegramHtml(cleanHandle)})` : '';

  const fallbackByType =
    params.mediaType === 'image'
      ? 'Rasm yuborildi'
      : params.mediaType === 'video'
        ? 'Video yuborildi'
        : params.mediaType === 'voice'
          ? 'Ovozli xabar yuborildi'
          : params.mediaType === 'audio'
            ? 'Audio xabar yuborildi'
            : params.mediaType === 'gift'
              ? 'Sovg\'a yuborildi'
              : 'Yangi xabar';

  const rawText = String(params.messageText || '').trim() || fallbackByType;
  const safeSpoilerBody = escapeTelegramHtml(rawText.slice(0, 1200));

  return (
    `💌 <b>Sizga yangi xabar keldi!</b>\n\n` +
    `👤 <b>Kimdan:</b> ${safeName}${handleSuffix}\n` +
    `💬 <b>Xabar:</b> <span class="tg-spoiler">${safeSpoilerBody}</span>`
  );
}

export function parseTelegramChannelReference(
  rawLinkOrId: string,
  explicitChatId?: string
): {
  chatId: string;
  normalizedLink: string;
  channelUsername: string;
  isCheckable: boolean;
} {
  const raw = String(rawLinkOrId || '').trim();
  const explicit = String(explicitChatId || '').trim();

  if (explicit && /^-?\d{6,}$/.test(explicit)) {
    const normalizedLink = raw
      ? raw.startsWith('http')
        ? raw
        : raw.startsWith('@')
          ? `https://t.me/${raw.slice(1)}`
          : `https://t.me/${raw}`
      : '';
    return {
      chatId: explicit,
      normalizedLink,
      channelUsername: '',
      isCheckable: true,
    };
  }

  if (/^-100\d{5,}$/.test(raw) || /^-\d{5,}$/.test(raw)) {
    return {
      chatId: raw,
      normalizedLink: '',
      channelUsername: '',
      isCheckable: true,
    };
  }

  const tgUrlMatch = raw.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,})(?:[/?#]|$)/i);
  if (tgUrlMatch && tgUrlMatch[1]) {
    const slug = tgUrlMatch[1];
    if (slug.startsWith('+') || slug.toLowerCase() === 'joinchat') {
      return {
        chatId: explicit || '',
        normalizedLink: raw.startsWith('http') ? raw : `https://${raw}`,
        channelUsername: '',
        isCheckable: Boolean(explicit),
      };
    }
    return {
      chatId: `@${slug}`,
      normalizedLink: `https://t.me/${slug}`,
      channelUsername: `@${slug}`,
      isCheckable: true,
    };
  }

  const cleanAt = raw.replace(/^@+/, '');
  if (/^[A-Za-z0-9_]{4,}$/.test(cleanAt)) {
    return {
      chatId: `@${cleanAt}`,
      normalizedLink: `https://t.me/${cleanAt}`,
      channelUsername: `@${cleanAt}`,
      isCheckable: true,
    };
  }

  return {
    chatId: explicit || '',
    normalizedLink: raw,
    channelUsername: '',
    isCheckable: Boolean(explicit),
  };
}

export function isTelegramMemberSubscribedStatus(
  member: { status?: string; is_member?: boolean } | null | undefined
): boolean {
  if (!member || !member.status) return false;
  const st = String(member.status).toLowerCase();
  if (st === 'creator' || st === 'administrator' || st === 'member') return true;
  if (st === 'restricted') return member.is_member !== false;
  return false;
}

export function evaluateMandatorySubscriptionAccess(params: {
  config: MandatorySubscriptionConfig | null | undefined;
  user?: any;
  isTelegramContext: boolean;
  isSubscribed?: boolean;
}): { gateRequired: boolean; reason: 'disabled' | 'admin_bypass' | 'not_telegram' | 'bot_not_admin' | 'subscribed' | 'not_subscribed' } {
  const { config, user, isTelegramContext, isSubscribed } = params;
  if (!config || !config.enabled) {
    return { gateRequired: false, reason: 'disabled' };
  }
  if (user && isAdminTelegramUser(user)) {
    return { gateRequired: false, reason: 'admin_bypass' };
  }
  if (!isTelegramContext) {
    return { gateRequired: false, reason: 'not_telegram' };
  }
  // Enforce ONLY when the bot is confirmed to be admin in the configured channel
  if (!config.botIsAdmin) {
    return { gateRequired: false, reason: 'bot_not_admin' };
  }
  if (isSubscribed) {
    return { gateRequired: false, reason: 'subscribed' };
  }
  return { gateRequired: true, reason: 'not_subscribed' };
}
