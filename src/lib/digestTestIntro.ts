/**
 * Copy and once-per-account local flag for the post-Google test intro.
 * Account flag is `mail_consent.seen` (POST { seen: true } only — never `opted`).
 */
import { MAIL_IDEAS_LABEL } from '@/lib/mailConsent';
import { digestTestWindowOpen } from '@/lib/digestTestWindow';

export { digestTestWindowOpen };

export const DIGEST_TEST_INTRO_STORAGE_KEY = 'cc_digest_test_intro';
export const DIGEST_TEST_INTRO_SYNC_KEY = 'cc_digest_intro_synced';
/** Logged-out design preview. Does not write the account or local flag. */
export const DIGEST_TEST_INTRO_PREVIEW = 'digeste';

export const DIGEST_TEST_INTRO_COPY = {
  kicker: 'Période de test',
  title: 'Chaque jeudi, un digeste pour toi',
  lead: 'Plan C est en test. Chaque jeudi, un mail perso : trois sorties, d’après ce que tu regardes ici.',
  natural:
    'Utilise-le au naturel. Ça me tente, pas mon genre, ou rien : le digeste suit.',
  unsub: 'Tu l’arrêtes en un clic, le lien est dans le mail.',
  gate: `Jusqu’au 1er décembre, il part même sans la case « ${MAIL_IDEAS_LABEL} ».`,
  dismiss: 'OK, je parcours',
  close: 'Fermer',
} as const;

const LOCAL_CAP = 12;

export function normalizeIntroEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseIntroSeenList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const email = normalizeIntroEmail(item);
      if (!email || out.includes(email)) continue;
      out.push(email);
    }
    return out;
  } catch {
    return [];
  }
}

export function digestIntroSeenLocally(email: string, raw: string | null): boolean {
  const key = normalizeIntroEmail(email);
  if (!key) return false;
  return parseIntroSeenList(raw).includes(key);
}

export function withIntroSeen(email: string, raw: string | null): string {
  const key = normalizeIntroEmail(email);
  const list = parseIntroSeenList(raw);
  if (key && !list.includes(key)) list.push(key);
  return JSON.stringify(list.slice(-LOCAL_CAP));
}

export function readDigestIntroSeen(email: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return digestIntroSeenLocally(
      email,
      localStorage.getItem(DIGEST_TEST_INTRO_STORAGE_KEY),
    );
  } catch {
    return false;
  }
}

export function writeDigestIntroSeen(email: string): void {
  if (!normalizeIntroEmail(email) || typeof localStorage === 'undefined') return;
  try {
    const prev = localStorage.getItem(DIGEST_TEST_INTRO_STORAGE_KEY);
    localStorage.setItem(
      DIGEST_TEST_INTRO_STORAGE_KEY,
      withIntroSeen(email, prev),
    );
  } catch {
    /* private mode / quota — the in-memory close still lets them browse */
  }
}

export function digestIntroPreviewRequested(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get('apercu') === DIGEST_TEST_INTRO_PREVIEW;
}
