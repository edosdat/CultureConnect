import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_PROPOSAL_STATUSES,
  PROPOSE_COPY,
  PROPOSE_RATE_MAX,
  enqueueFillEmptyIngest,
  formatProposePreviewWhen,
  isOfficialHtmlProgUrl,
  nextStatusAfterConfirm,
  parseProposeEventBody,
  proposalAccountKey,
  proposalDedupeKey,
  rateWindowStartMs,
  resolveProposalVenue,
  stubCatalogueMatch,
} from './eventProposal';
import { proposeEventInvitationVisible } from './displayHome';

describe('proposalAccountKey — email lowercase, never UUID', () => {
  it('lowercases Google email and rejects empty / UUID-only', () => {
    assert.equal(proposalAccountKey('Eloi@Example.com'), 'eloi@example.com');
    assert.equal(proposalAccountKey('  A@B.FR  '), 'a@b.fr');
    assert.equal(proposalAccountKey(''), null);
    assert.equal(proposalAccountKey(null), null);
    assert.notEqual(
      proposalAccountKey('user@example.com'),
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    );
  });
});

describe('proposalDedupeKey', () => {
  it('normalizes title + venue + date', () => {
    const a = proposalDedupeKey('Concert Balkan', 'Le Bikini', '2026-09-20');
    const b = proposalDedupeKey('CONCERT  balkan', 'le  bikini', '2026-09-20');
    assert.equal(a, b);
    assert.notEqual(
      a,
      proposalDedupeKey('Concert Balkan', 'Le Bikini', '2026-09-21'),
    );
  });
});

describe('isOfficialHtmlProgUrl', () => {
  it('accepts venue HTML prog, rejects FB/IG and binaries', () => {
    assert.equal(
      isOfficialHtmlProgUrl('https://onct.toulouse.fr/programmation/'),
      true,
    );
    assert.equal(
      isOfficialHtmlProgUrl('https://www.facebook.com/events/123'),
      false,
    );
    assert.equal(
      isOfficialHtmlProgUrl('https://instagram.com/salle.toulouse'),
      false,
    );
    assert.equal(
      isOfficialHtmlProgUrl('https://example.com/saison.pdf'),
      false,
    );
    assert.equal(isOfficialHtmlProgUrl(''), false);
  });
});

describe('parseProposeEventBody', () => {
  it('requires titre, lieu, date', () => {
    const empty = parseProposeEventBody({});
    assert.equal(empty.ok, false);
    if (!empty.ok) {
      assert.ok(empty.fields.title);
      assert.ok(empty.fields.venue_name);
      assert.ok(empty.fields.date);
    }
    const ok = parseProposeEventBody({
      title: 'Concert Balkan',
      venue_name: 'Le Bikini',
      date: '2026-09-20',
      time: '21:00',
      url_user: 'https://lebikini.com/agenda',
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.value.time, '21:00');
      assert.equal(ok.value.url_user, 'https://lebikini.com/agenda');
    }
  });

  it('rejects invalid date / social-only is still a URL (official check is separate)', () => {
    const badDate = parseProposeEventBody({
      title: 'A',
      venue_name: 'B',
      date: '20/09/2026',
    });
    assert.equal(badDate.ok, false);
    const ig = parseProposeEventBody({
      title: 'A',
      venue_name: 'B',
      date: '2026-09-20',
      url_user: 'https://instagram.com/foo',
    });
    assert.equal(ig.ok, true);
  });
});

describe('resolveProposalVenue', () => {
  const lieux = [
    {
      lieu_id: 'L100',
      nom: 'Le Bikini',
      commune: 'Ramonville-Saint-Agne',
      url_programmation: 'https://www.lebikini.com/programmation',
    },
  ];

  it('marks known venue and new venue', () => {
    const known = resolveProposalVenue('Le Bikini', undefined, lieux);
    assert.equal(known.is_new_venue, false);
    assert.equal(known.venue_id, 'L100');
    const neu = resolveProposalVenue('Bar inconnu', undefined, lieux);
    assert.equal(neu.is_new_venue, true);
    assert.equal(neu.venue_id, null);
  });
});

describe('stubCatalogueMatch — Recherche stub (unique hit only)', () => {
  const cat = [
    {
      event_id: 'E1',
      titre: 'Concert Balkan',
      lieu_id: 'L100',
      date_debut: '2026-09-20',
      heure_debut: '21:00',
      venue_name: 'Le Bikini',
      image_url: 'https://example.com/a.jpg',
    },
    {
      event_id: 'E2',
      titre: 'Concert Balkan',
      lieu_id: 'L200',
      date_debut: '2026-09-20',
      venue_name: 'Autre',
    },
  ];

  it('returns a unique title+date+venue hit', () => {
    const hit = stubCatalogueMatch(
      {
        title: 'Concert Balkan',
        venue_name: 'Le Bikini',
        venue_id: 'L100',
        date: '2026-09-20',
      },
      cat,
    );
    assert.ok(hit);
    assert.equal(hit?.event_id, 'E1');
  });

  it('returns null when Recherche would be needed (0 or ambiguous)', () => {
    assert.equal(
      stubCatalogueMatch(
        {
          title: 'Inexistant XYZ',
          venue_name: 'Nulle part',
          venue_id: null,
          date: '2026-09-20',
        },
        cat,
      ),
      null,
    );
    assert.equal(
      stubCatalogueMatch(
        {
          title: 'Concert Balkan',
          venue_name: '???',
          venue_id: null,
          date: '2026-09-20',
        },
        cat,
      ),
      null,
    );
  });
});

describe('confirm + fill-empty enqueue stub', () => {
  it('Oui without official URL → needs_review, never ingested', () => {
    const out = nextStatusAfterConfirm({
      accept: true,
      url_prog_candidate: 'https://facebook.com/events/1',
    });
    assert.equal(out.status, 'needs_review');
    assert.equal(out.enqueue, false);
  });

  it('Oui with official HTML → matched_confirmed + stub queue (0 CSV write)', () => {
    const out = nextStatusAfterConfirm({
      accept: true,
      url_prog_candidate: 'https://onct.toulouse.fr/programmation/',
    });
    assert.equal(out.status, 'matched_confirmed');
    assert.equal(out.enqueue, true);
    assert.equal(
      enqueueFillEmptyIngest({
        url_prog_candidate: 'https://onct.toulouse.fr/programmation/',
      }).reason,
      'stub_queued',
    );
  });

  it('Non → needs_review', () => {
    assert.equal(
      nextStatusAfterConfirm({
        accept: false,
        url_prog_candidate: 'https://onct.toulouse.fr/programmation/',
      }).status,
      'needs_review',
    );
  });
});

describe('rate window — 5 / 24h', () => {
  it('counts only rows inside the rolling 24h window', () => {
    const now = new Date('2026-09-09T15:00:00+02:00');
    const start = rateWindowStartMs(now);
    assert.equal(start, now.getTime() - 24 * 60 * 60 * 1000);
    const recent = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();
    const old = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const rows = [{ created_at: recent }, { created_at: old }];
    const n = rows.filter(
      (r) => Date.parse(r.created_at) >= start,
    ).length;
    assert.equal(n, 1);
    assert.equal(PROPOSE_RATE_MAX, 5);
  });
});

describe('proposeEventInvitationVisible — 0-hit applied search only', () => {
  it('hides on boot / examples / date-clash; shows on applied 0 hits', () => {
    assert.equal(
      proposeEventInvitationVisible({
        searchApplied: false,
        zeroHits: true,
      }),
      false,
    );
    assert.equal(
      proposeEventInvitationVisible({
        searchApplied: true,
        zeroHits: false,
      }),
      false,
    );
    assert.equal(
      proposeEventInvitationVisible({
        searchApplied: true,
        zeroHits: true,
        phraseDateClash: true,
      }),
      false,
    );
    assert.equal(
      proposeEventInvitationVisible({
        searchApplied: true,
        zeroHits: true,
      }),
      true,
    );
  });
});

describe('copy locks A–D', () => {
  it('keeps Design / Innovateur strings', () => {
    assert.equal(PROPOSE_COPY.emptyTitle, 'Pas encore sur CultureConnect');
    assert.equal(
      PROPOSE_COPY.emptyBody,
      'Un bar, un concert, une date — propose-la, on vérifie.',
    );
    assert.equal(PROPOSE_COPY.emptyCta, 'Proposer cet événement');
    assert.equal(PROPOSE_COPY.emptyGuestCta, 'Connexion pour proposer');
    assert.equal(
      PROPOSE_COPY.emptyHelp,
      'Tu aides les salles qu’on rate encore.',
    );
    assert.equal(PROPOSE_COPY.matchTitle, 'On a trouvé ça — c’est bien ?');
    assert.equal(PROPOSE_COPY.pendingMerci, 'Merci.');
    assert.ok(!/publié/i.test(JSON.stringify(PROPOSE_COPY)));
    assert.ok(ACTIVE_PROPOSAL_STATUSES.includes('pending'));
    assert.ok(formatProposePreviewWhen('2026-09-20', '21:00').includes('21:00'));
  });
});
