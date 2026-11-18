export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_MAX_TOKEN_LENGTH = 2048;

export interface TurnstileReplayGuard {
  has: (token: string) => boolean;
  consume: (token: string, now?: number) => boolean;
  size: () => number;
}

export function createTurnstileReplayGuard(ttlMs = 10 * 60 * 1000, maxEntries = 5000): TurnstileReplayGuard {
  const redeemed = new Map<string, number>();

  const prune = (now: number) => {
    for (const [key, expiresAt] of redeemed.entries()) {
      if (expiresAt <= now) {
        redeemed.delete(key);
      }
    }
    while (redeemed.size > maxEntries) {
      const oldest = redeemed.keys().next().value;
      if (!oldest) break;
      redeemed.delete(oldest);
    }
  };

  return {
    has: (token: string) => {
      const clean = String(token || '').trim();
      if (!clean) return false;
      const exp = redeemed.get(clean);
      if (!exp) return false;
      if (exp <= Date.now()) {
        redeemed.delete(clean);
        return false;
      }
      return true;
    },
    consume: (token: string, now = Date.now()) => {
      const clean = String(token || '').trim();
      if (!clean) return false;
      prune(now);
      const existing = redeemed.get(clean);
      if (existing && existing > now) {
        return false;
      }
      redeemed.set(clean, now + ttlMs);
      return true;
    },
    size: () => redeemed.size,
  };
}

export interface TurnstileVerificationParams {
  token?: string | null;
  secretKey: string;
  remoteIp?: string | null;
  expectedAction?: string | null;
  expectedHostnames?: string[] | null;
  replayGuard?: TurnstileReplayGuard | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface TurnstileVerificationResult {
  ok: boolean;
  error?: string;
  hostname?: string;
  action?: string;
  errorCodes?: string[];
}

export async function verifyTurnstileWithSiteverify(
  params: TurnstileVerificationParams
): Promise<TurnstileVerificationResult> {
  const cleanToken = String(params.token || '').trim();
  if (!cleanToken) {
    return {
      ok: false,
      error: 'Iltimos, Cloudflare xavfsizlik tekshiruvini (CAPTCHA) tasdiqlang!',
    };
  }

  if (cleanToken.length > TURNSTILE_MAX_TOKEN_LENGTH) {
    return {
      ok: false,
      error: "Cloudflare xavfsizlik tekshiruvi tokeni noto'g'ri formatda.",
    };
  }

  const secretKey = String(params.secretKey || '').trim();
  if (!secretKey) {
    return {
      ok: false,
      error: 'Server CAPTCHA kaliti sozlanmagan.',
    };
  }

  if (params.replayGuard && params.replayGuard.has(cleanToken)) {
    return {
      ok: false,
      error: "Ushbu Cloudflare xavfsizlik tekshiruvi tokeni allaqachon ishlatilgan. Iltimos, CAPTCHA ni qayta tasdiqlang.",
      errorCodes: ['timeout-or-duplicate'],
    };
  }

  const fetchFn = params.fetchImpl || fetch;
  const timeoutMs = Number.isFinite(params.timeoutMs) && (params.timeoutMs || 0) > 0
    ? Number(params.timeoutMs)
    : 10_000;

  try {
    const form = new URLSearchParams();
    form.append('secret', secretKey);
    form.append('response', cleanToken);
    if (params.remoteIp && String(params.remoteIp).trim()) {
      form.append('remoteip', String(params.remoteIp).trim());
    }

    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : undefined;

    const verifyRes = await fetchFn(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      ...(signal ? { signal } : {}),
    });

    if (!verifyRes.ok) {
      return {
        ok: false,
        error: "Cloudflare xavfsizlik tekshiruvi serveri bilan bog'lanib bo'lmadi. Qayta urinib ko'ring.",
      };
    }

    const verifyData: any = await verifyRes.json().catch(() => null);
    if (!verifyData || verifyData.success !== true) {
      const errorCodes = Array.isArray(verifyData?.['error-codes'])
        ? verifyData['error-codes'].map(String)
        : undefined;

      return {
        ok: false,
        error:
          "Cloudflare xavfsizlik tekshiruvi muvaffaqiyatsiz tugadi. Iltimos, CAPTCHA ni qayta tasdiqlang.",
        errorCodes,
      };
    }

    const verifiedHostname = typeof verifyData.hostname === 'string' ? verifyData.hostname.trim().toLowerCase() : undefined;
    const verifiedAction = typeof verifyData.action === 'string' ? verifyData.action.trim() : undefined;

    if (
      params.expectedHostnames &&
      params.expectedHostnames.length > 0 &&
      verifiedHostname
    ) {
      const allowedSet = new Set(params.expectedHostnames.map((h) => String(h || '').trim().toLowerCase()).filter(Boolean));
      if (allowedSet.size > 0 && !allowedSet.has(verifiedHostname)) {
        return {
          ok: false,
          hostname: verifiedHostname,
          action: verifiedAction,
          error: "Cloudflare xavfsizlik tekshiruvi domenga mos kelmadi.",
          errorCodes: ['hostname-mismatch'],
        };
      }
    }

    if (params.expectedAction && verifiedAction && verifiedAction !== params.expectedAction) {
      return {
        ok: false,
        hostname: verifiedHostname,
        action: verifiedAction,
        error: "Cloudflare xavfsizlik tekshiruvi amali mos kelmadi. Iltimos, qayta tasdiqlang.",
        errorCodes: ['action-mismatch'],
      };
    }

    if (params.replayGuard && !params.replayGuard.consume(cleanToken)) {
      return {
        ok: false,
        error: "Ushbu Cloudflare xavfsizlik tekshiruvi tokeni allaqachon ishlatilgan. Iltimos, CAPTCHA ni qayta tasdiqlang.",
        errorCodes: ['timeout-or-duplicate'],
      };
    }

    return {
      ok: true,
      hostname: verifiedHostname,
      action: verifiedAction,
    };
  } catch {
    return {
      ok: false,
      error: "Cloudflare xavfsizlik tekshiruvida tarmoq xatoligi yuz berdi. Qayta urinib ko'ring.",
    };
  }
}
