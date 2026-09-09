/**
 * Propose-événement MVP — pure helpers (no catalogue write, no taste bump).
 * Account key = Google email lowercase, same as account_tastes.
 */

import { normalizeFr } from './signals';
import { externalPageUrl } from './externalUrl';
import { formatDateFr, formatHeure } from './labels';

export const PROPOSE_COPY = {
  emptyTitle: 'Pas encore sur CultureConnect',
  emptyBody: 'Un bar, un concert, une date — propose-la, on vérifie.',
  emptyCta: 'Proposer cet événement',
  emptyGuestCta: 'Connexion pour proposer',
  emptyHelp: 'Tu aides les salles qu’on rate encore.',
  formTitle: 'Proposer un événement',
  lieuHelper: 'Nouveau lieu OK — bars et salles petites bienvenus.',
  matchTitle: 'On a trouvé ça — c’est bien ?',
  matchYes: 'Oui, c’est ça',
  matchNo: 'Non, continuer la vérif',
  pendingMerci: 'Merci.',
  pendingVerify: 'On vérifie avant de l’ajouter à l’agenda.',
  pendingBadge: 'Proposition reçue',
  pendingToast: 'Merci — on vérifie et on te prévient',
  pendingBody:
    'Merci pour votre suggestion. Nous vous tiendrons informé dès que c’est ajouté.',
} as const;

export const PROPOSE_COLORS = {
  cream: '#F7F1E8',
  terracotta: '#C45C3E',
  ink: '#2C241B',
} as const;

export const PROPOSE_INTENT_KEY = 'cc_propose_intent';

export type ProposeIntent = { q: string; open: boolean };

export function writeProposeIntent(query: string): void {
  try {
    sessionStorage.setItem(
      PROPOSE_INTENT_KEY,
      JSON.stringify({ q: query, open: true }),
    );
  } catch {
    /* ignore */
  }
}

export function readProposeIntent(): ProposeIntent | null {
  try {
    const raw = sessionStorage.getItem(PROPOSE_INTENT_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { q?: unknown; open?: unknown };
    return {
      q: typeof o.q === 'string' ? o.q : '',
      open: o.open === true,
    };
  } catch {
    return null;
  }
}

export function clearProposeIntent(): void {
  try {
    sessionStorage.removeItem(PROPOSE_INTENT_KEY);
  } catch {
    /* ignore */
  }
}

export const PROPOSE_RATE_MAX = 5;
export const PROPOSE_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PROPOSE_TZ = 'Europe/Paris';

export const EVENT_PROPOSAL_STATUSES = [
  'pending',
  'matched_candidate',
  'matched_confirmed',
  'needs_review',
  'rejected',
  'ingested',
] as const;

export type EventProposalStatus = (typeof EVENT_PROPOSAL_STATUSES)[number];

/** Still “open” for the same user + dedupe_key. */
export const ACTIVE_PROPOSAL_STATUSES: readonly EventProposalStatus[] = [
  'pending',
  'matched_candidate',
  'matched_confirmed',
  'needs_review',
];

export type EventProposal = {
  id: string;
  submitter_email: string;
  title: string;
  venue_name: string;
  venue_id: string | null;
  is_new_venue: boolean;
  date: string;
  time: string | null;
  url_user: string | null;
  url_prog_candidate: string | null;
  status: EventProposalStatus;
  dedupe_key: string;
  match_event_id: string | null;
  user_note: string | null;
  created_at: string;
  updated_at: string;
};

export type EventProposalPublic = Omit<EventProposal, 'submitter_email'>;

export type MatchPreview = {
  event_id: string;
  title: string;
  venue_name: string;
  date: string;
  time: string | null;
  image_url: string | null;
};

export type ProposeEventInput = {
  title: string;
  venue_name: string;
  venue_id?: string;
  date: string;
  time?: string;
  url_user?: string;
  user_note?: string;
};

export type ProposeParseOk = {
  ok: true;
  value: {
    title: string;
    venue_name: string;
    venue_id?: string;
    date: string;
    time?: string;
    url_user?: string;
    user_note?: string;
  };
};

export type ProposeParseErr = {
  ok: false;
  error: string;
  fields: Partial<Record<'title' | 'venue_name' | 'date' | 'url_user', string>>;
};

/** Stable key: session email (lowercased). Never NextAuth UUID. */
export function proposalAccountKey(email?: string | null): string | null {
  const raw = (email || '').trim().toLowerCase();
  return raw || null;
}

export function proposalDedupeKey(
  title: string,
  venueName: string,
  date: string,
): string {
  return [normalizeFr(title), normalizeFr(venueName), (date || '').trim()].join(
    '|',
  );
}

export function isActiveProposalStatus(
  status: string,
): status is EventProposalStatus {
  return (ACTIVE_PROPOSAL_STATUSES as readonly string[]).includes(status);
}

export function isEventProposalStatus(
  status: string,
): status is EventProposalStatus {
  return (EVENT_PROPOSAL_STATUSES as readonly string[]).includes(status);
}

const SOCIAL_HOST =
  /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|instagr\.am)$/i;

/**
 * Official HTML prog URL — not Facebook / Instagram, not a binary asset.
 * Used before enqueueing fill-empty ingest (never writes catalogue here).
 */
export function isOfficialHtmlProgUrl(raw?: string | null): boolean {
  const href = externalPageUrl(raw);
  if (!href) return false;
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.replace(/^www\./i, '');
  if (SOCIAL_HOST.test(host)) return false;
  if (/\.(pdf|jpe?g|png|gif|webp|mp4|zip)(\?|$)/i.test(u.pathname)) return false;
  return true;
}

export function pickUrlProgCandidate(
  urlUser?: string | null,
  venueProgUrl?: string | null,
): string | null {
  if (isOfficialHtmlProgUrl(venueProgUrl)) {
    return externalPageUrl(venueProgUrl) || null;
  }
  if (isOfficialHtmlProgUrl(urlUser)) {
    return externalPageUrl(urlUser) || null;
  }
  return null;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec((value || '').trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

export function normalizeTime(value?: string | null): string | undefined {
  const raw = (value || '').trim();
  if (!raw) return undefined;
  const m = ISO_TIME.exec(raw);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function clip(text: string, max: number): string {
  return text.trim().slice(0, max);
}

export function parseProposeEventBody(raw: unknown): ProposeParseOk | ProposeParseErr {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Corps invalide', fields: {} };
  }
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === 'string' ? clip(o.title, 200) : '';
  const venue_name =
    typeof o.venue_name === 'string' ? clip(o.venue_name, 200) : '';
  const date = typeof o.date === 'string' ? o.date.trim() : '';
  const fields: ProposeParseErr['fields'] = {};
  if (!title) fields.title = 'Le titre est requis';
  if (!venue_name) fields.venue_name = 'Le lieu est requis';
  if (!date || !isIsoDate(date)) fields.date = 'La date est requise';
  if (Object.keys(fields).length > 0) {
    return { ok: false, error: 'Champs requis manquants', fields };
  }

  const venue_id =
    typeof o.venue_id === 'string' && o.venue_id.trim()
      ? clip(o.venue_id, 40)
      : undefined;
  const time = normalizeTime(typeof o.time === 'string' ? o.time : undefined);
  if (typeof o.time === 'string' && o.time.trim() && !time) {
    return {
      ok: false,
      error: 'Heure invalide',
      fields: { date: 'Heure invalide' },
    };
  }

  let url_user: string | undefined;
  if (typeof o.url_user === 'string' && o.url_user.trim()) {
    const href = externalPageUrl(o.url_user);
    if (!href) {
      return {
        ok: false,
        error: 'Lien invalide',
        fields: { url_user: 'Lien invalide' },
      };
    }
    url_user = href.slice(0, 500);
  }

  const user_note =
    typeof o.user_note === 'string' && o.user_note.trim()
      ? clip(o.user_note, 500)
      : undefined;

  return {
    ok: true,
    value: { title, venue_name, venue_id, date, time, url_user, user_note },
  };
}

export type VenueHint = {
  lieu_id: string;
  nom: string;
  commune?: string;
  label_affiche?: string;
  url_programmation?: string;
};

export function resolveProposalVenue(
  venueName: string,
  venueId: string | undefined,
  lieux: readonly VenueHint[],
): {
  venue_name: string;
  venue_id: string | null;
  is_new_venue: boolean;
  url_programmation: string | null;
} {
  const name = venueName.trim();
  const id = (venueId || '').trim();
  if (id) {
    const hit = lieux.find((l) => l.lieu_id === id);
    if (hit) {
      return {
        venue_name: name || hit.nom,
        venue_id: hit.lieu_id,
        is_new_venue: false,
        url_programmation: (hit.url_programmation || '').trim() || null,
      };
    }
  }
  const n = normalizeFr(name);
  const hit = lieux.find(
    (l) =>
      normalizeFr(l.nom) === n ||
      normalizeFr(l.label_affiche || '') === n ||
      normalizeFr([l.commune, l.nom].filter(Boolean).join(' — ')) === n,
  );
  if (hit) {
    return {
      venue_name: name,
      venue_id: hit.lieu_id,
      is_new_venue: false,
      url_programmation: (hit.url_programmation || '').trim() || null,
    };
  }
  return {
    venue_name: name,
    venue_id: null,
    is_new_venue: true,
    url_programmation: null,
  };
}

export type CatalogueMatchRow = {
  event_id: string;
  titre: string;
  lieu_id: string;
  date_debut: string;
  heure_debut?: string;
  image_url?: string;
  venue_name?: string;
};

/**
 * Conservative unique hit (title + date + venue). Recherche owns richer match.
 * 0 or 2+ hits → null (MVP stub → pending / needs_review + UI D).
 */
export function stubCatalogueMatch(
  input: {
    title: string;
    venue_name: string;
    venue_id: string | null;
    date: string;
  },
  catalogue: readonly CatalogueMatchRow[],
): MatchPreview | null {
  const t = normalizeFr(input.title);
  const v = normalizeFr(input.venue_name);
  if (!t || !input.date) return null;
  const hits = catalogue.filter((ev) => {
    if (normalizeFr(ev.titre) !== t) return false;
    if ((ev.date_debut || '').trim() !== input.date) return false;
    if (input.venue_id && ev.lieu_id && input.venue_id !== ev.lieu_id) {
      return false;
    }
    if (!input.venue_id && v) {
      const evVenue = normalizeFr(ev.venue_name || '');
      if (evVenue && evVenue !== v) return false;
    }
    return true;
  });
  if (hits.length !== 1) return null;
  const ev = hits[0]!;
  return {
    event_id: ev.event_id,
    title: ev.titre,
    venue_name: ev.venue_name || input.venue_name,
    date: ev.date_debut,
    time: normalizeTime(ev.heure_debut) ?? null,
    image_url: (ev.image_url || '').trim() || null,
  };
}

/** Fill-empty ingest enqueue — stub only. Never writes programme.csv / evenements. */
export function enqueueFillEmptyIngest(proposal: {
  url_prog_candidate?: string | null;
}): { enqueued: boolean; reason: string } {
  if (!isOfficialHtmlProgUrl(proposal.url_prog_candidate)) {
    return { enqueued: false, reason: 'not_official_html' };
  }
  return { enqueued: true, reason: 'stub_queued' };
}

export function toPublicProposal(row: EventProposal): EventProposalPublic {
  const { submitter_email: _email, ...rest } = row;
  void _email;
  return rest;
}

export function rateWindowStartMs(now = new Date()): number {
  return now.getTime() - PROPOSE_RATE_WINDOW_MS;
}

/** Instant of “now” interpreted on the Paris clock (same epoch, TZ-aware label). */
export function parisNowParts(now = new Date()): {
  date: string;
  time: string;
} {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: PROPOSE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

export function formatProposePreviewWhen(
  date: string,
  time?: string | null,
): string {
  if (!isIsoDate(date)) return date;
  const [y, m, d] = date.split('-').map(Number);
  const local = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const long = local.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const titled = long.charAt(0).toUpperCase() + long.slice(1);
  const hh = time ? formatHeure(time) : '';
  return hh ? `${titled} · ${hh}` : titled;
}

export function formatProposeDateShort(date: string): string {
  return formatDateFr(date);
}

export type ConfirmDecision = 'accept' | 'decline';

export function nextStatusAfterConfirm(opts: {
  accept: boolean;
  url_prog_candidate?: string | null;
}): {
  status: Extract<EventProposalStatus, 'matched_confirmed' | 'needs_review'>;
  enqueue: boolean;
} {
  if (!opts.accept) {
    return { status: 'needs_review', enqueue: false };
  }
  const enqueue = enqueueFillEmptyIngest({
    url_prog_candidate: opts.url_prog_candidate,
  }).enqueued;
  return {
    status: enqueue ? 'matched_confirmed' : 'needs_review',
    enqueue,
  };
}
