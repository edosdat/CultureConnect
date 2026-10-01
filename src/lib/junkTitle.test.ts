import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import {
  isDateOnlyTitle,
  isJunkTitle,
  isTruncatedDateTitle,
  junkTitleReason,
} from './junkTitle';
import { isPublishableEvent, isPublishableProgrammeName } from './publishable';
import { normalizeProgrammeRows } from './programmeRow';

describe('isDateOnlyTitle', () => {
  it('accepts French weekday + date + time and ISO dates', () => {
    assert.equal(isDateOnlyTitle('Vendredi 02 octobre 2026 - 20H30'), true);
    assert.equal(isDateOnlyTitle('Samedi 19 septembre 2026 - 20H00'), true);
    assert.equal(isDateOnlyTitle('2026-10-02'), true);
    assert.equal(
      isDateOnlyTitle(
        'Jeudi 17 septembre 2026 - 20H30 Jeudi 12 novembre 2026 - 20H30',
      ),
      true,
    );
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

  it('flags multi-date scrape concatenations (M1 hole / #177 live FAIL)', () => {
    const multi =
      'Jeudi 17 septembre 2026 - 20H30 Jeudi 12 novembre 2026 - 20H30';
    assert.equal(junkTitleReason(multi), 'date_only');
    assert.equal(isJunkTitle(multi), true);
    assert.equal(
      junkTitleReason(
        'Mardi 29 septembre 2026 - 20H30 Mercredi 30 septembre 2026 - 20H30 + de dates',
      ),
      'date_only',
    );
    assert.equal(
      junkTitleReason(
        'Mercredi 18 novembre 2026 - 20H30 Jeudi 19 novembre 2026 - 20H30',
      ),
      'date_only',
    );
  });

  it('flags date-only titles with common month typos (fvrier / dcembre)', () => {
    assert.equal(
      junkTitleReason('Vendredi 19 fvrier 2027 - 20H00'),
      'date_only',
    );
    assert.equal(
      junkTitleReason('Mercredi 02 dcembre 2026 - 20H30'),
      'date_only',
    );
    assert.equal(
      junkTitleReason(
        'Jeudi 25 fvrier 2027 - 20H30 Vendredi 26 fvrier 2027 - 20H30 + de dates',
      ),
      'date_only',
    );
  });

  it('flags truncated date-range fragments (soft #192 R2)', () => {
    assert.equal(junkTitleReason('Mercredi 30 septembre et'), 'truncated_date');
    assert.equal(junkTitleReason('Du jeudi 8 au'), 'truncated_date');
    assert.equal(junkTitleReason('Vendredi 25 et'), 'truncated_date');
    assert.equal(
      junkTitleReason('Les Lancers de Fil : Triplicata – Du jeudi 01 au'),
      'truncated_date',
    );
    assert.equal(
      junkTitleReason('Stella et la magie de Yule – Du mercredi 30 septembre au'),
      'truncated_date',
    );
    assert.equal(
      junkTitleReason("Tout-Jeune Public : En'corps ! – Les mercredi 21 et"),
      'truncated_date',
    );
    assert.equal(isTruncatedDateTitle('Du jeudi 8 au'), true);
    // Real titles without truncated suffix stay
    assert.equal(isJunkTitle('Les Lancers de Fil : Triplicata'), false);
    assert.equal(isJunkTitle('Amir et les miroirs'), false);
    assert.equal(isJunkTitle('Jean de la Lune'), false);
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
    assert.equal(junkTitleReason('Les infos pratiques'), 'placeholder');
  });

  it('flags bare month names as exact titles (M1)', () => {
    assert.equal(junkTitleReason('septembre'), 'bare_month');
    assert.equal(isJunkTitle('septembre'), true);
    assert.equal(junkTitleReason('Octobre'), 'bare_month');
  });

  it('flags month-led placeholders with a/au or a time (M1)', () => {
    assert.equal(junkTitleReason('octobre à 19h et'), 'month_time');
    assert.equal(junkTitleReason("OCTOBRE au BUV'ART"), 'month_time');
    assert.equal(isJunkTitle('octobre à 21h et'), true);
  });

  it('flags empty / whitespace-only titles (M1)', () => {
    assert.equal(junkTitleReason(''), 'empty_title');
    assert.equal(junkTitleReason('   '), 'empty_title');
    assert.equal(isJunkTitle(''), true);
  });

  it('keeps real titles that contain a month, category, or digits (M1)', () => {
    assert.equal(isJunkTitle('Un dimanche de septembre'), false);
    assert.equal(isJunkTitle('Le Théâtre du Soleil'), false);
    assert.equal(isJunkTitle('4.48 Psychose'), false);
    assert.equal(junkTitleReason('Un dimanche de septembre'), null);
  });

  it('does not junk PRIO0018 atelier with a date suffix (M1)', () => {
    const titre =
      "Atelier D'écritures Le Lab' des mots - 29 septembre - 18h30 > 20h30";
    assert.equal(isJunkTitle(titre), false);
    assert.equal(junkTitleReason(titre), null);
    // Brief residual short form — still a real atelier, not month-led junk.
    assert.equal(
      isJunkTitle("Atelier D'écritures Le Lab' des mots - 29 sep"),
      false,
    );
  });

  it('keeps Bord de scène (live catalogue series, not a placeholder)', () => {
    assert.equal(isJunkTitle('Bord de scène'), false);
    assert.equal(junkTitleReason('Bord de scène'), null);
    assert.equal(isJunkTitle('Bord de scene'), false);
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
    assert.equal(
      isPublishableEvent({ ...baseEv, titre: 'septembre' }),
      false,
    );
  });

  it('isPublishableProgrammeName rejects junk nom_item', () => {
    assert.equal(isPublishableProgrammeName('Toc Toc'), true);
    assert.equal(isPublishableProgrammeName('1 évènement 11'), false);
    assert.equal(isPublishableProgrammeName('Complet'), false);
    assert.equal(isPublishableProgrammeName('octobre à 19h et'), false);
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
      {
        programme_id: 'P4',
        event_id: 'T900717',
        lieu_id: 'L050',
        nom_item: 'septembre',
        type_item: 'spectacle',
        date: '2026-10-07',
        film_id: '',
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.nom_item, 'Toc Toc');
  });
});

describe('M1 catalogue integration', () => {
  it('after load, T900717 produces 0 séances', () => {
    const text = fs.readFileSync(
      path.join(process.cwd(), 'data', 'programme.csv'),
      'utf-8',
    );
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    const rawT900717 = parsed.data.filter(
      (row) => (row.event_id || '').trim() === 'T900717',
    );
    assert.ok(
      rawT900717.length > 0,
      'fixture: programme.csv still has T900717 rows before filter',
    );
    assert.ok(
      rawT900717.every((row) => (row.nom_item || '').trim().toLowerCase() === 'septembre'),
      'fixture: T900717 rows are bare « septembre »',
    );
    const rows = normalizeProgrammeRows(parsed.data);
    const kept = rows.filter((row) => row.event_id === 'T900717');
    assert.equal(kept.length, 0);
  });
});
