/**
 * Freshness while Plan C stays open.
 * The service worker stays network-first (no Cache Storage).
 * This module decides when to check for a new worker, when a soft
 * reload is safe, and when to ask the open page for a new agenda.
 * Product cookies (cc_vid, session) are never read or stored here.
 */

/** Inside the 5–15 min window. Covers an app left open in the foreground. */
export const SW_UPDATE_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Agenda refetch shares that window. A focus sooner than this waits:
 * the server list cache is 5 min, so an earlier GET would repeat it.
 */
export const AGENDA_REFRESH_MIN_MS = 5 * 60 * 1000;

export const AGENDA_REFRESH_EVENT = 'planc-agenda-refresh';

export const SHELL_UPDATE_TIP = 'Une version plus fraîche est là.';
export const SHELL_UPDATE_ACTION = 'Actualiser';

export type ShellReloadSignals = {
  visibilityState: string;
  activeTag: string;
  activeEditable: boolean;
  dialogOpen: boolean;
};

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Soft reload: the page is visible, nothing is being typed, no sheet is open. */
export function shellReloadIsSafe(signals: ShellReloadSignals): boolean {
  if (signals.visibilityState !== 'visible') return false;
  if (signals.activeEditable) return false;
  if (TYPING_TAGS.has(signals.activeTag)) return false;
  if (signals.dialogOpen) return false;
  return true;
}

export function readShellReloadSignals(doc: Document): ShellReloadSignals {
  const active = doc.activeElement;
  const tag = active && 'tagName' in active ? active.tagName : '';
  const editable =
    typeof HTMLElement !== 'undefined' && active instanceof HTMLElement
      ? active.isContentEditable
      : false;
  return {
    visibilityState: doc.visibilityState,
    activeTag: tag,
    activeEditable: editable,
    dialogOpen: Boolean(doc.querySelector('[role="dialog"]')),
  };
}

export function agendaRefreshDue(
  lastAtMs: number | null,
  nowMs: number,
  minMs = AGENDA_REFRESH_MIN_MS,
): boolean {
  if (lastAtMs == null) return true;
  return nowMs - lastAtMs >= minMs;
}

/**
 * `window=home` is the unfiltered Toulouse rail. Same guard as the boot
 * merge: chips, a title, or a phrase must not receive that payload.
 */
export function homeWindowRefreshAllowed(input: {
  scope: string;
  bootScope: string;
  cats: readonly string[];
  genres: readonly string[];
  q: string;
  title: string;
  phraseMode?: boolean;
  avecEnfants?: boolean;
}): boolean {
  if (input.scope !== input.bootScope) return false;
  if (input.phraseMode) return false;
  if (input.avecEnfants) return false;
  if (input.cats.length > 0 || input.genres.length > 0) return false;
  if (input.q.trim() || input.title.trim()) return false;
  return true;
}

/** Update rows in place, append new keys, keep painted keys the payload omitted. */
export function mergeRowsByKey<T extends { key: string }>(
  prev: readonly T[],
  incoming: readonly T[],
): T[] {
  if (incoming.length === 0) return [...prev];
  const byKey = new Map(incoming.map((row) => [row.key, row]));
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const row of prev) {
    merged.push(byKey.get(row.key) ?? row);
    seen.add(row.key);
  }
  for (const row of incoming) {
    if (seen.has(row.key)) continue;
    merged.push(row);
    seen.add(row.key);
  }
  return merged;
}
