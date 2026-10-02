/**
 * Soft LOCK beat 1 — one social tip under Envie / J’y vais.
 * Connected users only. First successful Envie or Partager wins, then silence.
 * Dismiss writes `cc_social_tip_b1_seen` (local, wiped by the admin cold reset).
 * `?apercu=social` shows the line for Soft Design and does not write the flag.
 */

export const SOCIAL_TIP_B1_COPY =
  'Un Plan C, c\u2019est pas pour \u00eatre tout seul.';

export const SOCIAL_TIP_B1_SEEN_KEY = 'cc_social_tip_b1_seen';

/** Logged-out design preview. Does not write the seen flag. */
export const SOCIAL_TIP_B1_PREVIEW = 'social';

export const SOCIAL_TIP_EVENT = 'cc-social-tip-b1';

const RSVP_ROW =
  '[data-testid="share-rsvp-mother"], [data-testid="share-rsvp-daughter"]';

let latched = false;
let previewTaken = false;

export function socialTipSeen(raw: string | null): boolean {
  return raw === '1';
}

export function readSocialTipSeen(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return socialTipSeen(localStorage.getItem(SOCIAL_TIP_B1_SEEN_KEY));
  } catch {
    return false;
  }
}

export function writeSocialTipSeen(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SOCIAL_TIP_B1_SEEN_KEY, '1');
  } catch {
    /* private mode / quota — the in-memory latch still silences this page */
  }
}

/** First caller shows the tip. Later calls, and any later page load, stay quiet. */
export function claimSocialTipBeat1(): boolean {
  if (latched || readSocialTipSeen()) {
    latched = true;
    return false;
  }
  latched = true;
  writeSocialTipSeen();
  return true;
}

export function dismissSocialTip(): void {
  latched = true;
  writeSocialTipSeen();
}

export function socialTipPreviewRequested(search: string): boolean {
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search,
  );
  return params.get('apercu') === SOCIAL_TIP_B1_PREVIEW;
}

/** First ShareSocial on the page wins the design preview. */
export function claimSocialTipPreview(): boolean {
  if (previewTaken) return false;
  previewTaken = true;
  return true;
}

/** Give the slot back when the claimant unmounts before dismiss (Strict Mode). */
export function releaseSocialTipPreview(): void {
  previewTaken = false;
}

/**
 * Partager lives beside the Envie row, not inside it.
 * The tip belongs to the row that shares the tightest card with the button:
 * that card holds exactly one Envie / J’y vais row.
 */
export function shareActionOwnsSocialTip(
  socialRoot: HTMLElement,
  from: Node,
): boolean {
  let node: Node | null = from;
  while (node) {
    if (node instanceof HTMLElement && node.contains(socialRoot)) {
      const rows = node.querySelectorAll(RSVP_ROW);
      return rows.length === 1 && rows[0] === socialRoot;
    }
    node = node.parentNode;
  }
  return false;
}

/** Connected Partager announces itself. The Envie row decides whether to show. */
export function notifySocialTip(from: HTMLElement | null): void {
  if (!from) return;
  from.dispatchEvent(new CustomEvent(SOCIAL_TIP_EVENT, { bubbles: true }));
}
