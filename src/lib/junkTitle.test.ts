import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDateOnlyTitle,
  isJunkTitle,
  junkTitleReason,
} from './junkTitle';
import { isPublishableEvent, isPublishableProgrammeName } from './publishable';
import { normalizeProgrammeRows } from './programmeRow';

describe('isDateOnlyTitle', () => {
  it('accepts French weekday + date + time and ISO dates', () => {
    assert.equal(isDateOnlyTitle('Vendredi 02 octobre 2026 - 20H30'), true);
    assert.equal(isDateOnlyTitle('Samedi 19 septembre 2026 - 20H00'), true);
    assert.equal(isDateOnlyTitle('2026-10-02'), true);
  });

  it('rejects real titles that merely contain a date', () => {
    assert.equal(isDateOnlyTitle('Toc Toc'), false);
    assert.equal(isDateOnlyTitle('Vendredi 02 octobre 2026 — Toc Toc'), false);
  });
});

describe('isJunkTitle', () => {
  it('flags date-only titles', () => {
    assert.equal(junkTitleReason('Vendredi 02 octobre 2026 - 20H30'), 'date_only');
    assert.equal(isJunkTitle('2026-10-02'), true);
  });

  it('flags pagination scrape leftovers', () => {
    assert.equal(junkTitleReason('pagination'), 'pagination');
    assert.equal(isJunkTitle('Page pagination 2'), true);
  });

  it('flags N événement(s) counters', () => {
    assert.equal(junkTitleReason('1 évènement 11'), 'event_count');
    assert.equal(junkTitleReason('2 évènements 13'), 'event_count');
    assert.equal(junkTitleReason('4 evenements 17'), 'event_count');
    assert.equal(isJunkTitle('11 événements demain'), false);
  });

  it('flags bare category labels only as exact titles', () => {
    for (const title of [
      'Théâtre',
      'Danse',
      'CONCERT',
      'Cirque',
      'Musiques',
      'Évènements',
    ]) {
      assert.equal(junkTitleReason(title), 'bare_category', title);
    }
    assert.equal(isJunkTitle('Théâtre de la Cité'), false);
  });

  it('flags known placeholders as exact titles', () => {
    assert.equal(junkTitleReason('Complet'), 'placeholder');
    assert.equal(junkTitleReason('Bord de scène'), 'placeholder');
    assert.equal(junkTitleReason('Les infos pratiques'), 'placeholder');
    assert.equal(isJunkTitle('Bord de scène en LSF'), false);
  });

  it('keeps real work titles', () => {
    assert.equal(isJunkTitle('Toc Toc'), false);
    assert.equal(isJunkTitle('L’Odyssée'), false);
  });
});

describe('publishable + programmeRow junk filter', () => {
  const baseEv = {
    titre: 'Toc Toc',
    statut: 'ok',
    categorie: 'theatre_danse',
  };

  it('isPublishableEvent rejects junk titres', () => {
    assert.equal(isPublishableEvent(baseEv), true);
    assert.equal(
      isPublishableEvent({ ...baseEv, titre: 'pagination' }),
      false,
    );
    assert.equal(
      isPublishableEvent({ ...baseEv, titre: 'Vendredi 02 octobre 2026 - 20H30' }),
      false,
    );
  });

  it('isPublishableProgrammeName rejects junk nom_item', () => {
    assert.equal(isPublishableProgrammeName('Toc Toc'), true);
    assert.equal(isPublishableProgrammeName('1 évènement 11'), false);
    assert.equal(isPublishableProgrammeName('Complet'), false);
  });

  it('normalizeProgrammeRows drops junk nom_item rows', () => {
    const rows = normalizeProgrammeRows([
      {
        programme_id: 'P1',
        event_id: 'E1',
        lieu_id: 'L1',
        nom_item: 'Toc Toc',
        type_item: 'spectacle',
        date: '2026-10-02',
        film_id: '',
      },
      {
        programme_id: 'P2',
        event_id: 'E2',
        lieu_id: 'L1',
        nom_item: 'pagination',
        type_item: 'spectacle',
        date: '2026-10-02',
        film_id: '',
      },
      {
        programme_id: 'P3',
        event_id: 'E3',
        lieu_id: 'L1',
        nom_item: 'Théâtre',
        type_item: 'spectacle',
        date: '2026-10-02',
        film_id: '',
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.nom_item, 'Toc Toc');
  });
});
