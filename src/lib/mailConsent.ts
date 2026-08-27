/** Client-safe constants + cookie for the mail-ideas opt-in (no send). */
export const MAIL_IDEAS_LABEL = 'Envoie-moi 3 idées par mail';
export const MAIL_IDEAS_COOKIE = 'cc_mail_ideas';
export const MAIL_IDEAS_EVENT = 'cc-mail-ideas';

export function readMailIdeasCookie(): '1' | '0' | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === MAIL_IDEAS_COOKIE) {
      const v = rest.join('=');
      if (v === '1' || v === '0') return v;
      return null;
    }
  }
  return null;
}

export function writeMailIdeasCookie(opted: boolean): void {
  if (typeof document === 'undefined') return;
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:'
      ? '; Secure'
      : '';
  document.cookie = `${MAIL_IDEAS_COOKIE}=${opted ? '1' : '0'}; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=Lax${secure}`;
  try {
    window.dispatchEvent(new Event(MAIL_IDEAS_EVENT));
  } catch {
    /* ignore */
  }
}

export function clearMailIdeasCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${MAIL_IDEAS_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  try {
    window.dispatchEvent(new Event(MAIL_IDEAS_EVENT));
  } catch {
    /* ignore */
  }
}
