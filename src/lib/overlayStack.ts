/**
 * One blocking surface at a time.
 * Digeste wins over the install sheet. The sticky bar hides while either
 * is open and comes back on dismiss. Push stays off during both (future V0).
 *
 * z ladder: header ~30 · sticky 45 · feedback FAB 40 · toast 50 ·
 * digeste 70 · install sheet 160. Sticky is above the FAB and below
 * both blocking surfaces. Those surfaces hide the bar anyway.
 */

export type OverlaySnap = {
  digestOpen: boolean;
  a2hsSheetOpen: boolean;
};

const CLOSED: OverlaySnap = { digestOpen: false, a2hsSheetOpen: false };

let digestOpen = false;
let a2hsSheetOpen = false;
let snap: OverlaySnap = CLOSED;
const listeners = new Set<() => void>();
let closeA2hsSheet: (() => void) | null = null;

function publish() {
  snap = { digestOpen, a2hsSheetOpen };
  for (const listener of listeners) listener();
}

export function subscribeOverlayStack(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOverlayStack(): OverlaySnap {
  return snap;
}

export function getServerOverlayStack(): OverlaySnap {
  return CLOSED;
}

export function setDigestBlocking(open: boolean) {
  if (digestOpen === open) return;
  digestOpen = open;
  publish();
}

export function setA2hsSheetBlocking(open: boolean) {
  if (a2hsSheetOpen === open) return;
  a2hsSheetOpen = open;
  publish();
}

/** PwaInstall registers the sheet closer so the digeste can dismiss it first. */
export function registerA2hsSheetCloser(close: () => void): () => void {
  closeA2hsSheet = close;
  return () => {
    if (closeA2hsSheet === close) closeA2hsSheet = null;
  };
}

/** Digeste is about to show: the install sheet must already be gone. */
export function dismissA2hsSheetForDigest() {
  setA2hsSheetBlocking(false);
  closeA2hsSheet?.();
}

/** Sticky nudge hides under the digeste and under the install sheet. */
export function stickyInstallHidden(input: {
  digestOpen: boolean;
  a2hsSheetOpen: boolean;
}): boolean {
  return input.digestOpen || input.a2hsSheetOpen;
}

/** Digeste stays alone. A tap does not open the install sheet over it. */
export function canOpenA2hsSheet(input: { digestOpen: boolean }): boolean {
  return !input.digestOpen;
}

/** Feedback panel stays shut while the install sheet is the blocking surface. */
export function feedbackOpenAllowed(input: { a2hsSheetOpen: boolean }): boolean {
  return !input.a2hsSheetOpen;
}

/**
 * Future push V0. Never the same moment as the digeste or the install sheet.
 * No permission prompt ships here.
 */
export function pushPromptAllowed(input: {
  digestOpen: boolean;
  a2hsSheetOpen: boolean;
}): boolean {
  return !input.digestOpen && !input.a2hsSheetOpen;
}

/** Share toast waits until the blocking card or sheet is gone. */
export function toastBlockedByModal(input: {
  digestOpen: boolean;
  a2hsSheetOpen: boolean;
}): boolean {
  return input.digestOpen || input.a2hsSheetOpen;
}
