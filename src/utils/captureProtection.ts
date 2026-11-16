import { isAdminTelegramUser } from './tokenomics';

export function shouldEnableCaptureProtection(user: any): boolean {
  if (!user) return false;
  return !isAdminTelegramUser(user);
}

export function isCaptureShortcutEvent(e: {
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): boolean {
  const key = String(e.key || '').toLowerCase();
  const code = String(e.code || '').toLowerCase();

  if (key === 'printscreen' || code === 'printscreen') {
    return true;
  }

  // macOS screenshot shortcuts: Cmd+Shift+3 / 4 / 5 / 6
  if (e.metaKey && e.shiftKey && ['3', '4', '5', '6', 's'].includes(key)) {
    return true;
  }

  // Windows Snipping Tool / browser screenshot: Win/Meta+Shift+S or Ctrl+Shift+S
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 's') {
    return true;
  }

  // Print or Save Page shortcuts
  if ((e.ctrlKey || e.metaKey) && (key === 'p' || key === 's')) {
    return true;
  }

  return false;
}
