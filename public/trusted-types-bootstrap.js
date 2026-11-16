(function () {
  if (typeof window === 'undefined' || !window.trustedTypes || !window.trustedTypes.createPolicy) {
    return;
  }
  if (window.trustedTypes.defaultPolicy) {
    return;
  }
  var ALLOWED_SCRIPT_HOSTS = [
    'telegram.org',
    'challenges.cloudflare.com',
    'apis.google.com',
    'www.gstatic.com',
    'www.google.com',
    'www.recaptcha.net',
    'accounts.google.com',
    'www.googletagmanager.com',
    'cdn.jsdelivr.net',
    'alov.uz',
    'alov.onrender.com'
  ];
  function isAllowedScriptUrl(rawUrl) {
    try {
      var str = String(rawUrl || '').trim();
      if (!str) return false;
      if (str.charAt(0) === '/' || str.indexOf('blob:') === 0) return true;
      var parsed = new URL(str, window.location.origin);
      if (parsed.origin === window.location.origin) return true;
      var host = parsed.hostname.toLowerCase();
      return ALLOWED_SCRIPT_HOSTS.some(function (allowed) {
        return host === allowed || host.endsWith('.' + allowed);
      }) || host.endsWith('.firebaseapp.com');
    } catch (_e) {
      return false;
    }
  }
  try {
    window.trustedTypes.createPolicy('default', {
      createHTML: function (html) {
        return String(html)
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      },
      createScriptURL: function (url) {
        if (!isAllowedScriptUrl(url)) {
          throw new TypeError('Blocked untrusted script URL: ' + url);
        }
        return String(url);
      },
      createScript: function (script) {
        return String(script);
      }
    });
  } catch (_err) {
    // Policy already created
  }
})();
