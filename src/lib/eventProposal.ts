/**
 * Pure rules for « Proposer un spectacle ».
 * Pending store only — never writes programme.csv or the live catalogue.
 */
import { createHash } from 'crypto';
import { labelCategorie } from './labels';
import { normalizeSearch } from './searchText';
import { externalPageUrl } from './externalUrl';
import { parisParts } from './timeScope';
import type { ProgrammeWithContext } from './types';

export const PROPOSAL_RATE_LIMIT = 5;
export const PROPOSAL_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const TITLE_MAX = 200;
export const VENUE_MAX = 200;
export const URL_MAX = 500;

export const ACTIVE_PROPOSAL_STATUSES = [
  'pending',
  'needs_review',
  'matched_candidate',
  'matched_confirmed',
] as const;

export type ProposalStatus =
  | 'pending'
  | 'matched_candidate'
  | 'matched_confirmed'
  | 'needs_review'
  | 'rejected'
  | 'ingested';

export type ProposalInput = {
  title: string;
  venueName: string;
  date: string | null;
  time: string | null;
  urlUser: string | null;
};

export type CatalogueMatchCandidate = {
  eventId: string;
  title: string;
  venueName: string;
  venueId: string;
  dateIso: string;
  time: string;
  imageUrl: string;
  category: string;
  /** Official HTML prog URL, or empty. Never FB/IG. */
  url: string;
};

export type ProposalMatchPreview = {
  eventId: string;
  title: string;
  venue: string;
  whenLabel: string;
  imageUrl: string;
  categoryLabel: string;
};

export type StoredProposal = {
  id: string;
  submitterEmail: string;
  title: string;
  venueName: string;
  venueId: string | null;
  isNewVenue: boolean;
  date: string | null;
  time: string | null;
  urlUser: string | null;
  urlProgCandidate: string | null;
  status: ProposalStatus;
  dedupeKey: string;
  matchEventId: string | null;
  match: ProposalMatchPreview | null;
  createdAt: string;
  updatedAt: string;
};

const SOCIAL_HOST =
  /(^|\.)((facebook|instagram)\.com|fb\.com|fb\.me|instagr\.am)$/i;

export function officialProgUrl(raw: string | null | undefined): string | null {
  const href = externalPageUrl(raw);
  if (!href) return null;
  try {
    const host = new URL(href).hostname.replace(/^www\./, '');
    if (SOCIAL_HOST.test(host)) return null;
    if (!/^https?:$/i.test(new URL(href).protocol)) return null;
    return href;
  } catch {
    return null;
  }
}

export function proposalDedupeKey(input: {
  title: string;
  venueName: string;
  date: string | null;
  time: string | null;
}): string {
  const raw = [
    normalizeSearch(input.title),
    normalizeSearch(input.venueName),
    input.date || '',
    (input.time || '').slice(0, 5),
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

export function proposalRateLimited(
  createdAtMs: readonly number[],
  nowMs: number,
): boolean {
  let n = 0;
  for (const t of createdAtMs) {
    if (nowMs - t < PROPOSAL_RATE_WINDOW_MS && nowMs - t >= 0) n += 1;
  }
  return n >= PROPOSAL_RATE_LIMIT;
}

export function parseProposalBody(
  body: unknown,
): { ok: true; value: ProposalInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Corps invalide' };
  }
  const o = body as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  if (!title) return { ok: false, error: 'Titre requis' };
  if (title.length > TITLE_MAX) return { ok: false, error: 'Titre trop long' };
  const venueName = typeof o.venue_name === 'string' ? o.venue_name.trim() : '';
  if (venueName.length > VENUE_MAX) return { ok: false, error: 'Lieu trop long' };

  let date: string | null = null;
  if (typeof o.date === 'string' && o.date.trim()) {
    const d = o.date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return { ok: false, error: 'Date invalide' };
    }
    const [y, m, day] = d.split('-').map(Number);
    const check = new Date(Date.UTC(y, m - 1, day));
    if (
      check.getUTCFullYear() !== y ||
      check.getUTCMonth() !== m - 1 ||
      check.getUTCDate() !== day
    ) {
      return { ok: false, error: 'Date invalide' };
    }
    date = d;
  }

  let time: string | null = null;
  if (typeof o.time === 'string' && o.time.trim()) {
    const t = o.time.trim().slice(0, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
      return { ok: false, error: 'Heure invalide' };
    }
    time = t;
  }

  let urlUser: string | null = null;
  if (typeof o.url_user === 'string' && o.url_user.trim()) {
    const u = o.url_user.trim();
    if (u.length > URL_MAX) return { ok: false, error: 'Lien trop long' };
    urlUser = u;
  }

  return { ok: true, value: { title, venueName, date, time, urlUser } };
}

export function formatProposalWhen(dateIso: string, time: string): string {
  if (!dateIso) return time ? time.slice(0, 5) : '';
  const [y, m, d] = dateIso.split('-').map(Number);
  if (!y || !m || !d) return dateIso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const label = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
  const cap = label.charAt(0).toUpperCase() + label.slice(1);
  const hm = (time || '').slice(0, 5);
  return hm ? `${cap} · ${hm}` : cap;
}

export function scoreProposalMatch(
  input: { title: string; venueName: string; date: string | null },
  candidate: CatalogueMatchCandidate,
): number {
  const q = normalizeSearch(input.title);
  const t = normalizeSearch(candidate.title);
  if (!q || !t) return 0;
  let titleScore = 0;
  if (q === t) titleScore = 80;
  else if (q.length >= 8 && (t.includes(q) || q.includes(t))) titleScore = 55;
  else {
    const tokens = q.split(' ').filter((w) => w.length >= 4);
    if (tokens.length >= 2 && tokens.every((w) => t.includes(w))) titleScore = 45;
  }
  if (titleScore === 0) return 0;
  let score = titleScore;
  const v = normalizeSearch(input.venueName);
  const cv = normalizeSearch(candidate.venueName);
  if (v.length >= 3 && cv && (cv.includes(v) || v.includes(cv))) score += 25;
  if (input.date && candidate.dateIso === input.date) score += 25;
  return score;
}

function tieRank(
  candidate: CatalogueMatchCandidate,
  inputDate: string | null,
  today: string,
): number {
  if (inputDate && candidate.dateIso === inputDate) return 0;
  if (candidate.dateIso >= today) return 1;
  return 2;
}

/** Strong enough to ask « c’est bien ça ? ». Title alone must be exact. */
export function pickProposalMatch(
  input: { title: string; venueName: string; date: string | null },
  candidates: readonly CatalogueMatchCandidate[],
  now = new Date(),
): CatalogueMatchCandidate | null {
  const today = parisParts(now).iso;
  const hinted = Boolean(input.venueName.trim() || input.date);
  let best: { c: CatalogueMatchCandidate; score: number } | null = null;
  for (const c of candidates) {
    const score = scoreProposalMatch(input, c);
    const exact = normalizeSearch(input.title) === normalizeSearch(c.title);
    if (!exact && !(hinted && score >= 70)) continue;
    if (score < 70 && !exact) continue;
    if (!best || score > best.score) {
      best = { c, score };
      continue;
    }
    if (score < best.score) continue;
    const next = tieRank(c, input.date, today);
    const prev = tieRank(best.c, input.date, today);
    if (next < prev || (next === prev && c.dateIso < best.c.dateIso)) {
      best = { c, score };
    }
  }
  return best?.c ?? null;
}

export function matchPreviewOf(
  candidate: CatalogueMatchCandidate,
): ProposalMatchPreview {
  return {
    eventId: candidate.eventId,
    title: candidate.title,
    venue: candidate.venueName,
    whenLabel: formatProposalWhen(candidate.dateIso, candidate.time),
    imageUrl: candidate.imageUrl,
    categoryLabel: labelCategorie(candidate.category),
  };
}

export function matchVenueId(
  name: string,
  lieux: readonly { id: string; name: string }[],
): string | null {
  const n = normalizeSearch(name);
  if (n.length < 3) return null;
  for (const lieu of lieux) {
    const ln = normalizeSearch(lieu.name);
    if (!ln || ln.length < 3) continue;
    if (ln === n || ln.includes(n) || n.includes(ln)) return lieu.id;
  }
  return null;
}

export function buildProposalCandidates(
  rows: readonly ProgrammeWithContext[],
): CatalogueMatchCandidate[] {
  const out: CatalogueMatchCandidate[] = [];
  for (const row of rows) {
    const title = (row.programme.nom_item || row.evenement?.titre || '').trim();
    if (!title) continue;
    const url =
      officialProgUrl(row.programme.url) ||
      officialProgUrl(row.evenement?.url_source) ||
      '';
    out.push({
      eventId: (row.evenement?.event_id || row.programme.event_id || '').trim(),
      title,
      venueName: (row.lieu?.label_affiche || row.lieu?.nom || '').trim(),
      venueId: (row.lieu?.lieu_id || row.programme.lieu_id || '').trim(),
      dateIso: (row.programme.date || '').slice(0, 10),
      time: (row.programme.heure_debut || '').slice(0, 5),
      imageUrl: (
        row.programme.image_url ||
        row.evenement?.image_url ||
        ''
      ).trim(),
      category: (row.evenement?.categorie || row.programme.type_item || '').trim(),
      url,
    });
  }
  return out;
}

export function proposalPublic(row: StoredProposal, duplicate = false) {
  const showMatch =
    row.status === 'matched_candidate' && row.match && row.urlProgCandidate;
  return {
    id: row.id,
    status: row.status,
    duplicate,
    match: showMatch ? row.match : null,
  };
}
