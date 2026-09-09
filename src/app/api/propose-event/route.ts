import { NextResponse } from 'next/server';
import {
  PROPOSE_RATE_MAX,
  parseProposeEventBody,
  proposalDedupeKey,
  rateWindowStartMs,
  resolveProposalVenue,
  toPublicProposal,
} from '@/lib/eventProposal';
import {
  catalogueVenues,
  matchPayload,
  readOnlyMatchPreview,
  requireProposalEmail,
  resolveProgCandidate,
} from '@/lib/proposeEventServer';
import {
  countProposalsSince,
  findActiveByDedupe,
  insertEventProposal,
  updateEventProposal,
} from '@/lib/eventProposalStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const authz = await requireProposalEmail();
  if ('error' in authz) return authz.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const parsed = parseProposeEventBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error, fields: parsed.fields },
      { status: 400 },
    );
  }

  const since = rateWindowStartMs();
  const recent = await countProposalsSince(authz.email, since);
  if (recent >= PROPOSE_RATE_MAX) {
    return NextResponse.json(
      { error: 'Trop de propositions (5 / 24h)', code: 'rate_limit' },
      { status: 429 },
    );
  }

  const v = parsed.value;
  const venue = resolveProposalVenue(v.venue_name, v.venue_id, catalogueVenues());
  const dedupe_key = proposalDedupeKey(v.title, venue.venue_name, v.date);
  const existing = await findActiveByDedupe(authz.email, dedupe_key);
  if (existing) {
    const packed = matchPayload(existing);
    return NextResponse.json(
      {
        error: 'Proposition déjà enregistrée',
        code: 'duplicate',
        proposal: toPublicProposal(existing),
        match: packed.match,
      },
      { status: 409 },
    );
  }

  const url_prog_candidate = resolveProgCandidate(
    v.url_user,
    venue.url_programmation,
  );

  let row = await insertEventProposal({
    submitter_email: authz.email,
    title: v.title,
    venue_name: venue.venue_name,
    venue_id: venue.venue_id,
    is_new_venue: venue.is_new_venue,
    date: v.date,
    time: v.time ?? null,
    url_user: v.url_user ?? null,
    url_prog_candidate,
    status: 'pending',
    dedupe_key,
    match_event_id: null,
    user_note: v.user_note ?? null,
  });

  const preview = readOnlyMatchPreview({
    title: row.title,
    venue_name: row.venue_name,
    venue_id: row.venue_id,
    date: row.date,
  });
  if (preview) {
    const updated = await updateEventProposal(row.id, {
      status: 'matched_candidate',
      match_event_id: preview.event_id,
      url_prog_candidate: row.url_prog_candidate,
    });
    if (updated) row = updated;
  }

  const packed = matchPayload(row);
  return NextResponse.json(
    {
      proposal: toPublicProposal(row),
      match: packed.match ?? preview,
    },
    { status: 201 },
  );
}
