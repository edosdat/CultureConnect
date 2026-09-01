/**
 * Official ticketing URL for one séance. Display-only — no checkout.
 */

import type { DayItem } from './types';

export type ReservePick = { url: string; soldOut: boolean };

const NOWEB_THEATER_CODES = new Set(['W3161', 'P0235', 'P2235']);

/** mvtx /noweb or known noweb theaters. Not Pathé/Kinepolis 403. Not Utopia home. */
export function isSoldOutUrl(url: string): boolean {
  const raw = (url || '').trim();
  if (!raw) return false;
  if (raw.toLowerCase().includes('/noweb')) return true;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname.toLowerCase() !== 'relay.mvtx.us') return false;
    if (parsed.pathname.toLowerCase().includes('noweb')) return true;
    const theater = (parsed.searchParams.get('code_theater') || '').toUpperCase();
    return NOWEB_THEATER_CODES.has(theater);
  } catch {
    return false;
  }
}

export function looksLikeTicket(url: string): boolean {
  if (isSoldOutUrl(url)) return false;
  const u = url.toLowerCase();
  return /billet|reserv|booking|ticket|fnacspectacles|shotgun|eventbrite|dice\.fm|placeminute|billetreduc/.test(
    u,
  );
}

export function rawUrls(item: DayItem): { bille: string; page: string } {
  if (item.kind === 'programme') {
    return {
      bille: (
        (item.programme.billetterie_url || '').trim() ||
        (item.evenement?.billetterie_url || '').trim()
      ),
      page: (
        (item.programme.url || '').trim() ||
        (item.evenement?.url_source || '').trim()
      ),
    };
  }
  return {
    bille: (item.evenement.billetterie_url || '').trim(),
    page: (item.evenement.url_source || '').trim(),
  };
}

/** Ticket for THIS séance — no venue homepage fallback. */
export function reservePickOf(item: DayItem): ReservePick {
  const { bille, page } = rawUrls(item);
  if (bille) {
    if (isSoldOutUrl(bille)) return { url: '', soldOut: true };
    return { url: bille, soldOut: false };
  }
  if (page && isSoldOutUrl(page)) return { url: '', soldOut: true };
  if (page && looksLikeTicket(page)) return { url: page, soldOut: false };
  return { url: '', soldOut: false };
}

/** Same as reservePickOf, then venue site if the group has no ticket page. */
export function reservePickForVenueGroup(items: DayItem[]): ReservePick {
  let ticketPage = '';
  let siteWeb = '';
  let soldOut = false;
  for (const rel of items) {
    if (rel.kind !== 'programme') continue;
    const bille =
      (rel.programme.billetterie_url || '').trim() ||
      (rel.evenement?.billetterie_url || '').trim();
    if (bille) {
      if (isSoldOutUrl(bille)) {
        soldOut = true;
        continue;
      }
      return { url: bille, soldOut: false };
    }
    const page = (rel.programme.url || '').trim();
    if (page && isSoldOutUrl(page)) soldOut = true;
    else if (!ticketPage && page && looksLikeTicket(page)) ticketPage = page;
    const site = (rel.lieu?.site_web || '').trim();
    if (!siteWeb && site && !isSoldOutUrl(site)) siteWeb = site;
  }
  if (ticketPage) return { url: ticketPage, soldOut: false };
  if (soldOut) return { url: '', soldOut: true };
  return { url: siteWeb, soldOut: false };
}
