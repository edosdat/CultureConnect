import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  proposeSpectaclePlacement,
  searchPackVisible,
} from './displayHome';
import {
  buildProposalCandidates,
  officialProgUrl,
  parseProposalBody,
  pickProposalMatch,
  proposalDedupeKey,
  proposalRateLimited,
  type CatalogueMatchCandidate,
} from './eventProposal';
import type { ProgrammeWithContext } from './types';
import {
  confirmEventProposal,
  deleteEventProposals,
  submitEventProposal,
} from './eventProposalStore';

const EMAIL = 'ada@example.com';

function candidate(
  patch: Partial<CatalogueMatchCandidate> & Pick<CatalogueMatchCandidate, 'title'>,
): CatalogueMatchCandidate {
  return {
    eventId: patch.eventId || 'e1',
    title: patch.title,
    venueName: patch.venueName || 'La Petite Écoute',
    venueId: patch.venueId || 'L1',
    dateIso: patch.dateIso || '2026-05-29',
    time: patch.time || '20:30',
    imageUrl: patch.imageUrl || '',
    category: patch.category || 'concert',
    url: patch.url ?? 'https://lapetiteecoute.fr/prog',
  };
}

describe('propose spectacle placement', () => {
  it('hides the CTA when search has no query', () => {
    assert.equal(
      proposeSpectaclePlacement({ query: '   ', settled: true, resultCount: 0 }),
      'hidden',
    );
    assert.equal(
      proposeSpectaclePlacement({ query: '', settled: true, resultCount: 4 }),
      'hidden',
    );
  });

  it('invites on a settled zero-hit search and footnotes hits', () => {
    assert.equal(
      proposeSpectaclePlacement({
        query: 'zzzzqxqqqq',
        settled: false,
        resultCount: 0,
      }),
      'hidden',
    );
    assert.equal(
      proposeSpectaclePlacement({
        query: 'zzzzqxqqqq',
        settled: true,
        resultCount: 0,
      }),
      'empty',
    );
    assert.equal(
      proposeSpectaclePlacement({ query: 'jazz', settled: true, resultCount: 2 }),
      'footer',
    );
    assert.equal(
      proposeSpectaclePlacement({
        query: 'jazz',
        settled: false,
        resultCount: 1,
      }),
      'footer',
    );
  });

  it('stays off a phrase/date clash and off empty home packs', () => {
    assert.equal(
      proposeSpectaclePlacement({
        query: 'jazz',
        settled: true,
        resultCount: 0,
        phraseDateClash: true,
      }),
      'hidden',
    );
    assert.equal(searchPackVisible({ sectionAllowed: true, rowCount: 0 }), false);
    assert.equal(searchPackVisible({ sectionAllowed: true, rowCount: 2 }), true);
    assert.equal(searchPackVisible({ sectionAllowed: false, rowCount: 3 }), false);
  });
});

describe('proposal parse, url, match', () => {
  it('requires a title and keeps lieu/date/lien optional', () => {
    assert.equal(parseProposalBody({}).ok, false);
    const only = parseProposalBody({ title: '  Concert Balkan  ' });
    assert.equal(only.ok, true);
    if (only.ok) {
      assert.equal(only.value.title, 'Concert Balkan');
      assert.equal(only.value.venueName, '');
      assert.equal(only.value.date, null);
    }
    assert.equal(parseProposalBody({ title: 'x', date: '2026-02-31' }).ok, false);
  });

  it('rejects social pages as official prog urls', () => {
    assert.equal(officialProgUrl('https://instagram.com/p/abc'), null);
    assert.equal(officialProgUrl('https://www.facebook.com/events/1'), null);
    assert.equal(
      officialProgUrl('https://theatre-du-capitole.fr/saison'),
      'https://theatre-du-capitole.fr/saison',
    );
  });

  it('matches an exact titled show and ignores a vague query', () => {
    const rows = [
      candidate({ title: 'Jazz à la Petite Écoute', eventId: 'jazz-1' }),
      candidate({
        title: 'Jazz à la Petite Écoute',
        eventId: 'jazz-old',
        dateIso: '2024-01-02',
      }),
    ];
    const exact = pickProposalMatch(
      { title: 'Jazz à la Petite Écoute', venueName: '', date: null },
      rows,
      new Date('2026-05-01T12:00:00Z'),
    );
    assert.equal(exact?.eventId, 'jazz-1');
    assert.equal(
      pickProposalMatch({ title: 'jazz', venueName: '', date: null }, rows),
      null,
    );
    const hinted = pickProposalMatch(
      {
        title: 'Jazz Petite Écoute',
        venueName: 'Petite Écoute',
        date: '2026-05-29',
      },
      rows,
    );
    assert.equal(hinted?.eventId, 'jazz-1');
  });

  it('builds candidates without keeping a facebook url', () => {
    const built = buildProposalCandidates([
      {
        programme: {
          programme_id: 'p1',
          event_id: 'e1',
          lieu_id: 'L1',
          nom_item: 'Soirée jazz',
          type_item: 'concert',
          date: '2026-06-01',
          heure_debut: '21:00:00',
          heure_fin: '',
          scene_salle: '',
          prix_item: '',
          url: 'https://facebook.com/events/9',
          notes: '',
          genre: '',
          artiste_id: '',
        },
        evenement: null,
        lieu: null,
      } as unknown as ProgrammeWithContext,
    ]);
    assert.equal(built.length, 1);
    assert.equal(built[0]?.url, '');
    assert.equal(built[0]?.time, '21:00');
  });
});

describe('pending store', { concurrency: 1 }, () => {
  let dir = '';

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cc-propose-'));
    process.env.EVENT_PROPOSAL_STORE = 'file';
    process.env.EVENT_PROPOSAL_STORE_DIR = dir;
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const show = candidate({
    title: 'Concert Balkan Le Bikini',
    venueName: 'Le Bikini',
    url: 'https://lebikini.com/prog/balkan',
  });

  it('writes needs_review for a title-only miss and does not touch the catalogue file', async () => {
    const first = await submitEventProposal(
      EMAIL,
      { title: 'zzzzqxqqqq' },
      { candidates: [show], now: new Date('2026-09-28T10:00:00Z') },
    );
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.body.status, 'needs_review');
    assert.equal(first.body.match, null);
    const again = await submitEventProposal(
      EMAIL,
      { title: 'zzzzqxqqqq' },
      { candidates: [show], now: new Date('2026-09-28T11:00:00Z') },
    );
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.body.duplicate, true);
    assert.equal(again.body.id, first.body.id);
    const src = await readFile(
      new URL('./eventProposalStore.ts', import.meta.url),
      'utf8',
    );
    const route = await readFile(
      new URL('../app/api/propose-event/route.ts', import.meta.url),
      'utf8',
    );
    const quotedCsv = /['"`][^'"`]*programme\.csv['"`]/;
    assert.equal(quotedCsv.test(src), false);
    assert.equal(quotedCsv.test(route), false);
    assert.match(route, /sessionSharerEmail/);
  });

  it('returns a confirmable candidate only with an official prog url', async () => {
    const hit = await submitEventProposal(
      'bea@example.com',
      { title: 'Concert Balkan Le Bikini', venue_name: 'Le Bikini' },
      { candidates: [show], now: new Date('2026-09-28T10:00:00Z') },
    );
    assert.equal(hit.ok, true);
    if (!hit.ok) return;
    assert.equal(hit.body.status, 'matched_candidate');
    assert.equal(hit.body.match?.title, 'Concert Balkan Le Bikini');
    const no = await confirmEventProposal(
      'bea@example.com',
      hit.body.id,
      false,
      new Date('2026-09-28T12:00:00Z'),
    );
    assert.equal(no.ok, true);
    if (!no.ok) return;
    assert.equal(no.body.status, 'needs_review');
    assert.equal(no.body.match, null);
  });

  it('confirms a match without publishing, and rate-limits the 6th', async () => {
    const email = 'cleo@example.com';
    const now = new Date('2026-09-28T08:00:00Z');
    const hit = await submitEventProposal(
      email,
      { title: show.title },
      { candidates: [show], now },
    );
    assert.equal(hit.ok, true);
    if (!hit.ok) return;
    const yes = await confirmEventProposal(email, hit.body.id, true, now);
    assert.equal(yes.ok, true);
    if (!yes.ok) return;
    assert.equal(yes.body.status, 'matched_confirmed');
    assert.equal(yes.body.match, null);

    for (let i = 0; i < 4; i += 1) {
      const row = await submitEventProposal(
        email,
        { title: `Autre ${i}` },
        { candidates: [], now },
      );
      assert.equal(row.ok, true);
    }
    const blocked = await submitEventProposal(
      email,
      { title: 'Encore un' },
      { candidates: [], now },
    );
    assert.equal(blocked.ok, false);
    if (blocked.ok) return;
    assert.equal(blocked.status, 429);

    const key = proposalDedupeKey({
      title: 'Même',
      venueName: 'Salle',
      date: '2026-10-01',
      time: '20:00',
    });
    assert.equal(
      key,
      proposalDedupeKey({
        title: '  même ',
        venueName: 'salle',
        date: '2026-10-01',
        time: '20:00',
      }),
    );
    assert.equal(
      proposalRateLimited(
        [now.getTime(), now.getTime(), now.getTime(), now.getTime(), now.getTime()],
        now.getTime(),
      ),
      true,
    );
  });

  it('deletes one email and leaves the other', async () => {
    await deleteEventProposals(EMAIL);
    const left = await submitEventProposal(
      'bea@example.com',
      { title: 'Concert Balkan Le Bikini', venue_name: 'Le Bikini' },
      { candidates: [show], now: new Date('2026-09-29T10:00:00Z') },
    );
    assert.equal(left.ok, true);
    if (!left.ok) return;
    assert.equal(left.body.duplicate, true);
  });
});
