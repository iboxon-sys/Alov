export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileVerificationParams {
  token?: string | null;
  secretKey: string;
  remoteIp?: string | null;
  fetchImpl?: typeof fetch;
}

export interface TurnstileVerificationResult {
  ok: boolean;
  error?: string;
  hostname?: string;
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

  const secretKey = String(params.secretKey || '').trim();
  if (!secretKey) {
    return {
      ok: false,
      error: 'Server CAPTCHA kaliti sozlanmagan.',
    };
  }

  const fetchFn = params.fetchImpl || fetch;

  try {
    const form = new URLSearchParams();
    form.append('secret', secretKey);
    form.append('response', cleanToken);
    if (params.remoteIp && String(params.remoteIp).trim()) {
      form.append('remoteip', String(params.remoteIp).trim());
    }

    const verifyRes = await fetchFn(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    if (!verifyRes.ok) {
      return {
        ok: false,
        error: "Cloudflare xavfsizlik tekshiruvi serveri bilan bog'lanib bo'lmadi. Qayta urinib ko'ring.",
      };
    }

    const verifyData: any = await verifyRes.json().catch(() => null);
    if (verifyData && verifyData.success === true) {
      return {
        ok: true,
        hostname: typeof verifyData.hostname === 'string' ? verifyData.hostname : undefined,
      };
    }

    const errorCodes = Array.isArray(verifyData?.['error-codes'])
      ? verifyData['error-codes'].map(String)
      : undefined;

    return {
      ok: false,
      error:
        "Cloudflare xavfsizlik tekshiruvi muvaffaqiyatsiz tugadi. Iltimos, CAPTCHA ni qayta tasdiqlang.",
      errorCodes,
    };
  } catch {
    return {
      ok: false,
      error: "Cloudflare xavfsizlik tekshiruvida tarmoq xatoligi yuz berdi. Qayta urinib ko'ring.",
    };
  }
}
