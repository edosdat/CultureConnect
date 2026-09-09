import 'server-only';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { loadCultureData } from '@/lib/data';
import {
  pickUrlProgCandidate,
  proposalAccountKey,
  stubCatalogueMatch,
  type EventProposal,
  type MatchPreview,
  type VenueHint,
} from '@/lib/eventProposal';

export async function requireProposalEmail(): Promise<
  { email: string } | { error: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }),
    };
  }
  const email = proposalAccountKey(session.user.email);
  if (!email) {
    return {
      error: NextResponse.json({ error: 'Email requis' }, { status: 400 }),
    };
  }
  return { email };
}

export function catalogueVenues(): VenueHint[] {
  return loadCultureData().lieux.map((l) => ({
    lieu_id: l.lieu_id,
    nom: l.nom,
    commune: l.commune,
    label_affiche: l.label_affiche,
    url_programmation: l.url_programmation,
  }));
}

export function readOnlyMatchPreview(input: {
  title: string;
  venue_name: string;
  venue_id: string | null;
  date: string;
}): MatchPreview | null {
  const data = loadCultureData();
  const byId = new Map(data.lieux.map((l) => [l.lieu_id, l]));
  const rows = data.evenements.map((ev) => {
    const lieu = ev.lieu_id ? byId.get(ev.lieu_id) : undefined;
    return {
      event_id: ev.event_id,
      titre: ev.titre,
      lieu_id: ev.lieu_id,
      date_debut: ev.date_debut,
      heure_debut: ev.heure_debut,
      image_url: ev.image_url,
      venue_name: lieu?.nom,
    };
  });
  return stubCatalogueMatch(input, rows);
}

export function matchPayload(
  proposal: EventProposal,
): { proposal: EventProposal; match: MatchPreview | null } {
  if (proposal.status !== 'matched_candidate' || !proposal.match_event_id) {
    return { proposal, match: null };
  }
  const data = loadCultureData();
  const ev = data.evenements.find((e) => e.event_id === proposal.match_event_id);
  if (!ev) {
    return { proposal, match: null };
  }
  const lieu = ev.lieu_id
    ? data.lieux.find((l) => l.lieu_id === ev.lieu_id)
    : undefined;
  return {
    proposal,
    match: {
      event_id: ev.event_id,
      title: ev.titre,
      venue_name: lieu?.nom || proposal.venue_name,
      date: ev.date_debut || proposal.date,
      time: ev.heure_debut || proposal.time,
      image_url: (ev.image_url || '').trim() || null,
    },
  };
}

export function resolveProgCandidate(
  urlUser: string | null | undefined,
  venueProg: string | null | undefined,
): string | null {
  return pickUrlProgCandidate(urlUser, venueProg);
}
