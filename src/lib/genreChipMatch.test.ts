import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXTRA_GENRE_CHIP_LABELS,
  genreSlugsFromItems,
  genreSlugsOfFields,
  itemMatchesGenreChip,
  looksLikeBlindTest,
  matchesSelectedGenres,
} from './genreChipMatch';
import { mainFromGenreSlug } from './categories';
import { itemsForDateRange } from './events';
import type {
  DayItem,
  Evenement,
  EventWithDetails,
  Lieu,
  ProgrammeItem,
  ProgrammeWithContext,
} from './types';

const BIJOU_TITLE = "Qu'ouis-je - Le Blind-Test Décalé";
const BETTY_TITLE = 'Malchance aux chansons — Blindtest qui dérape';

function lieu(): Lieu {
  return {
    lieu_id: 'L1',
    nom: 'Salle',
    type: '',
    adresse: '',
    commune: 'Toulouse',
    dist_km_capitole: '',
    site_web: '',
    notes: '',
  };
}

function ev(
  p: Partial<Evenement> & Pick<Evenement, 'event_id' | 'titre'>,
): Evenement {
  return {
    lieu_id: 'L1',
    categorie: 'musique',
    date_debut: '2026-09-15',
    date_fin: '2026-09-15',
    heure_debut: '20:00',
    heure_fin: '',
    prix: '',
    gratuit: '',
    url_source: '',
    description_courte: '',
    statut: 'ouvert',
    genre: '',
    ...p,
  };
}

function progItem(
  p: Partial<ProgrammeItem> & Pick<ProgrammeItem, 'programme_id' | 'event_id' | 'nom_item'>,
): ProgrammeItem {
  return {
    lieu_id: 'L1',
    type_item: 'concert',
    date: '2026-09-15',
    heure_debut: '20:32',
    heure_fin: '',
    scene_salle: '',
    prix_item: '',
    url: '',
    notes: '',
    genre: '',
    artiste_id: '',
    ...p,
  };
}

function dayProg(opts: {
  key: string;
  title: string;
  genre?: string;
  pitch?: string;
  day?: string;
}): DayItem {
  const evenement = ev({
    event_id: opts.key,
    titre: opts.title,
    genre: opts.genre ?? '',
    description_courte: opts.pitch ?? '',
  });
  return {
    kind: 'programme',
    key: `p:${opts.key}`,
    dayIso: opts.day ?? '2026-09-15',
    programme: progItem({
      programme_id: opts.key,
      event_id: opts.key,
      nom_item: opts.title,
      genre: opts.genre ?? '',
      date: opts.day ?? '2026-09-15',
      description_item: opts.pitch ?? '',
    }),
    evenement,
    lieu: lieu(),
  };
}

describe('blind test catalogue chip — not vocab 89', () => {
  it('labels the chip Blind test without a 90th scoring-vocab slug', () => {
    assert.equal(EXTRA_GENRE_CHIP_LABELS.blindtest, 'Blind test');
    assert.equal(mainFromGenreSlug('blindtest'), 'musique');
  });

  it('matches official September titles and genre=blindtest', () => {
    assert.equal(looksLikeBlindTest(BIJOU_TITLE), true);
    assert.equal(looksLikeBlindTest(BETTY_TITLE), true);
    assert.equal(
      itemMatchesGenreChip({ genre: '', title: BIJOU_TITLE }, 'blindtest'),
      true,
    );
    assert.equal(
      itemMatchesGenreChip({ genre: 'blindtest', title: BETTY_TITLE }, 'blindtest'),
      true,
    );
    assert.equal(
      matchesSelectedGenres({ genre: '', title: BIJOU_TITLE }, ['blindtest']),
      true,
    );
  });

  it('does not treat karaoke / lukaraoke as blind test', () => {
    assert.equal(looksLikeBlindTest('Karaoké'), false);
    assert.equal(looksLikeBlindTest('Le Lukaraoké'), false);
    assert.equal(looksLikeBlindTest('Soirée karaoké — 9 ans du Black Lion'), false);
    assert.equal(
      itemMatchesGenreChip(
        { genre: 'karaoke', title: 'Soirée karaoké' },
        'blindtest',
      ),
      false,
    );
    assert.equal(
      genreSlugsOfFields({ genre: 'karaoke', title: 'Karaoké' }).includes(
        'blindtest',
      ),
      false,
    );
  });

  it('emits the chip only when a scoped item actually matches', () => {
    const sept = [
      dayProg({ key: 'PRIO0008', title: BIJOU_TITLE, genre: '' }),
      dayProg({
        key: 'BAR0044',
        title: BETTY_TITLE,
        genre: 'blindtest',
        day: '2026-09-16',
      }),
      dayProg({ key: 'KARAOKE', title: 'Le Lukaraoké', genre: 'karaoke' }),
    ];
    const slugs = genreSlugsFromItems(sept);
    assert.ok(slugs.includes('blindtest'));
    assert.ok(slugs.includes('karaoke'));

    const emptyMonth = [
      dayProg({ key: 'JAZZ', title: 'Jam session', genre: 'jazz_blues' }),
    ];
    assert.equal(
      genreSlugsFromItems(emptyMonth).includes('blindtest'),
      false,
    );
  });
});

describe('September 2026 CSV — official musique blind tests only', () => {
  it('has the two official titles and does not invent rows', () => {
    const csv = readFileSync(join(process.cwd(), 'data/evenements.csv'), 'utf8');
    const rows = csv.split('\n').filter(Boolean);
    const header = rows[0]!.split(',');
    const titreIdx = header.indexOf('titre');
    const catIdx = header.indexOf('categorie');
    const debutIdx = header.indexOf('date_debut');
    const genreIdx = header.indexOf('genre');
    assert.ok(titreIdx >= 0 && catIdx >= 0 && debutIdx >= 0 && genreIdx >= 0);

    const hits: { titre: string; genre: string; date: string }[] = [];
    for (const line of rows.slice(1)) {
      // CSV may quote fields; official titles are unique enough to scan raw.
      const date = line.includes('2026-09-15') || line.includes('2026-09-16');
      if (!date) continue;
      if (!/blind[\s_\-]?test/i.test(line)) continue;
      if (!line.includes(',musique,')) continue;
      hits.push({ titre: line, genre: line, date: 'sept' });
    }

    assert.ok(
      csv.includes(BIJOU_TITLE),
      'Bijou official title must stay in evenements.csv',
    );
    assert.ok(
      csv.includes(BETTY_TITLE),
      'Betty Pop’s official title must stay in evenements.csv',
    );
    assert.equal(
      hits.length,
      2,
      `expected 2 musique blind tests in Sept 2026, got ${hits.length}`,
    );
    assert.ok(csv.includes(',blindtest,'));
    assert.equal(csv.includes('vocab_blindtest_invented'), false);
  });
});

describe('Musique → Blind test filters the catalogue (not vocab 89 tags)', () => {
  it('returns both official September séances and excludes karaoke', () => {
    const bijou = ev({
      event_id: 'PRIO0008',
      lieu_id: 'L078',
      titre: BIJOU_TITLE,
      categorie: 'musique',
      date_debut: '2026-09-15',
      date_fin: '2026-09-15',
      heure_debut: '20:32',
      genre: '',
    });
    const betty = ev({
      event_id: 'BAR0044',
      lieu_id: 'L166',
      titre: BETTY_TITLE,
      categorie: 'musique',
      date_debut: '2026-09-16',
      date_fin: '2026-09-16',
      heure_debut: '20:00',
      genre: 'blindtest',
    });
    const karaoke = ev({
      event_id: 'BAR0038',
      lieu_id: 'L174',
      titre: 'Soirée karaoké — 9 ans du Black Lion (jour 3)',
      categorie: 'musique',
      date_debut: '2026-09-23',
      date_fin: '2026-09-23',
      heure_debut: '21:00',
      genre: 'karaoke',
    });
    const salle = lieu();
    const asDetails = (e: Evenement): EventWithDetails => ({
      ...e,
      lieu: salle,
      programme: [],
    });
    const asProg = (e: Evenement, pid: string, date: string, heure: string): ProgrammeWithContext => ({
      programme: progItem({
        programme_id: pid,
        event_id: e.event_id,
        nom_item: e.titre,
        genre: e.genre,
        date,
        heure_debut: heure,
        lieu_id: e.lieu_id,
      }),
      evenement: e,
      lieu: salle,
    });
    const items = itemsForDateRange(
      [
        asProg(bijou, 'PRIOP0008', '2026-09-15', '20:32'),
        asProg(betty, 'BARP0044', '2026-09-16', '20:00'),
        asProg(karaoke, 'BARP0038', '2026-09-23', '21:00'),
      ],
      [asDetails(bijou), asDetails(betty), asDetails(karaoke)],
      '2026-09-01',
      '2026-09-30',
      ['musique'],
      [],
      ['blindtest'],
    );
    const titles = items.map((i) =>
      i.kind === 'programme' ? i.programme.nom_item : i.evenement.titre,
    );
    assert.deepEqual(titles.sort(), [BETTY_TITLE, BIJOU_TITLE].sort());
    assert.equal(titles.some((t) => /karaoke|karaoké/i.test(t)), false);
  });
});
