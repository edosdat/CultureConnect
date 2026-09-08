import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rawUrls, reservePickForVenueGroup, reservePickOf } from './reserve';
import type { DayItem, Evenement, Lieu, ProgrammeItem } from './types';

const ARTO_FLEUR =
  'https://festivalramonville-arto.fr/programmation/spectacle/fleur-de-peau';

function fleur(url: string): DayItem {
  const evenement: Evenement = {
    event_id: 'EHG007',
    lieu_id: 'L150',
    titre: 'Festival de rue de Ramonville 2026 (39e édition)',
    categorie: 'festival',
    date_debut: '2026-09-11',
    date_fin: '2026-09-13',
    heure_debut: '20:30',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: 'cirque_arts_rue',
  };
  const programme: ProgrammeItem = {
    programme_id: 'FEP0029',
    event_id: 'EHG007',
    lieu_id: 'L150',
    nom_item: "Fleur de peau - L'An 01",
    type_item: 'spectacle',
    date: '2026-09-11',
    heure_debut: '20:30',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url,
    notes: '',
    genre: '',
    artiste_id: '',
  };
  const lieu: Lieu = {
    lieu_id: 'L150',
    nom: 'Le Kiwi',
    type: '',
    adresse: '',
    commune: 'Ramonville-Saint-Agne',
    dist_km_capitole: '',
    site_web: '',
    notes: '',
  };
  return {
    kind: 'programme',
    key: 'p:FEP0029',
    dayIso: '2026-09-11',
    programme,
    evenement,
    lieu,
  };
}

describe('rawUrls ARTO spectacle', () => {
  it('keeps the filled https programme.url', () => {
    assert.equal(rawUrls(fleur(ARTO_FLEUR)).page, ARTO_FLEUR);
  });

  it('rewrites /spectacle/… so the href is never an app route', () => {
    assert.equal(rawUrls(fleur('/spectacle/fleur-de-peau')).page, ARTO_FLEUR);
  });
});

const UTOPIA_HOME = 'https://toulouse.cinemas-utopia.org/';
const EXAMPLE_BILLE = 'https://tickets.example/session/1';
const EXAMPLE_TICKET_PAGE = 'https://tickets.example/reservation/1';

function venueSeance(opts: {
  bille?: string;
  page?: string;
  siteWeb?: string;
  eventBille?: string;
}): DayItem {
  const evenement: Evenement = {
    event_id: 'E003',
    lieu_id: 'L125',
    titre: 'Programmation Utopia Borderouge',
    categorie: 'cinema',
    date_debut: '2026-09-08',
    date_fin: '2026-09-08',
    heure_debut: '20:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: opts.page ?? '',
    description_courte: '',
    statut: 'ouvert',
    genre: 'fiction',
    billetterie_url: opts.eventBille ?? '',
  };
  const programme: ProgrammeItem = {
    programme_id: 'P-L125-1',
    event_id: 'E003',
    lieu_id: 'L125',
    nom_item: 'Un film',
    type_item: 'film',
    date: '2026-09-08',
    heure_debut: '20:00',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: opts.page ?? '',
    notes: '',
    genre: '',
    artiste_id: '',
    billetterie_url: opts.bille ?? '',
  };
  const lieu: Lieu = {
    lieu_id: 'L125',
    nom: 'Utopia Borderouge',
    type: 'cinema',
    adresse: '',
    commune: 'Toulouse',
    dist_km_capitole: '',
    site_web: opts.siteWeb ?? UTOPIA_HOME,
    notes: '',
  };
  return {
    kind: 'programme',
    key: 'p:P-L125-1',
    dayIso: '2026-09-08',
    programme,
    evenement,
    lieu,
  };
}

describe('reservePickOf', () => {
  it('hides Réserver when only the venue homepage exists', () => {
    assert.deepEqual(reservePickOf(venueSeance({})), { url: '', soldOut: false });
  });

  it('uses billetterie_url when present', () => {
    assert.deepEqual(reservePickOf(venueSeance({ bille: EXAMPLE_BILLE })), {
      url: EXAMPLE_BILLE,
      soldOut: false,
    });
  });

  it('uses a looksLikeTicket page when there is no bille', () => {
    assert.deepEqual(reservePickOf(venueSeance({ page: EXAMPLE_TICKET_PAGE })), {
      url: EXAMPLE_TICKET_PAGE,
      soldOut: false,
    });
  });
});

describe('reservePickForVenueGroup', () => {
  it('does not fall back to the cinema homepage (L125 empty bille)', () => {
    assert.deepEqual(reservePickForVenueGroup([venueSeance({})]), {
      url: '',
      soldOut: false,
    });
  });

  it('matches reservePickOf when there is no ticket URL', () => {
    const item = venueSeance({ page: UTOPIA_HOME });
    assert.deepEqual(reservePickForVenueGroup([item]), reservePickOf(item));
    assert.equal(reservePickOf(item).url, '');
  });

  it('keeps a real billetterie_url', () => {
    assert.deepEqual(
      reservePickForVenueGroup([venueSeance({ bille: EXAMPLE_BILLE })]),
      { url: EXAMPLE_BILLE, soldOut: false },
    );
  });

  it('keeps a looksLikeTicket page when there is no bille', () => {
    assert.deepEqual(
      reservePickForVenueGroup([venueSeance({ page: EXAMPLE_TICKET_PAGE })]),
      { url: EXAMPLE_TICKET_PAGE, soldOut: false },
    );
  });

  it('prefers event-level bille over a venue homepage', () => {
    assert.deepEqual(
      reservePickForVenueGroup([
        venueSeance({ eventBille: EXAMPLE_BILLE, page: UTOPIA_HOME }),
      ]),
      { url: EXAMPLE_BILLE, soldOut: false },
    );
  });
});
