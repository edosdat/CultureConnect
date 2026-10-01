import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MES_RECOS_SHEET_TITLE,
  MES_RECOS_WEEK_STORAGE_KEY,
  mesRecosSubtitle,
  mesRecosWeekAlreadyShown,
  markMesRecosWeekShown,
  parisIsoWeekKey,
  parisWeekMondayIso,
  parseMesRecosWeekRecord,
  readMesRecosWeekRecord,
} from './mesRecosWeek';

describe('parisIsoWeekKey (Europe/Paris Mon→Sun)', () => {
  it('formats YYYY-Www for a known Thursday in W40 2026', () => {
    // 2026-10-01 12:00 Paris ≈ 10:00 UTC (CEST UTC+2)
    const thu = new Date('2026-10-01T10:00:00.000Z');
    assert.equal(parisWeekMondayIso(thu), '2026-09-28');
    assert.equal(parisIsoWeekKey(thu), '2026-W40');
  });

  it('keeps Sunday in the same ISO week as the preceding Monday', () => {
    const sun = new Date('2026-10-04T10:00:00.000Z'); // Sun W40
    assert.equal(parisWeekMondayIso(sun), '2026-09-28');
    assert.equal(parisIsoWeekKey(sun), '2026-W40');
  });

  it('rolls to the next week on Monday 00:00 Paris', () => {
    // Mon 2026-10-05 00:30 Paris = 2026-10-04T22:30:00.000Z (CEST)
    const mon = new Date('2026-10-04T22:30:00.000Z');
    assert.equal(parisWeekMondayIso(mon), '2026-10-05');
    assert.equal(parisIsoWeekKey(mon), '2026-W41');
  });
});

describe('mesRecosWeek storage gate', () => {
  it('parses a valid record and rejects junk', () => {
    assert.deepEqual(
      parseMesRecosWeekRecord({
        shown: true,
        weekKey: '2026-W40',
        closedAt: '2026-10-01T10:00:00.000Z',
      }),
      {
        shown: true,
        weekKey: '2026-W40',
        closedAt: '2026-10-01T10:00:00.000Z',
      },
    );
    assert.equal(parseMesRecosWeekRecord({ shown: true, weekKey: 'nope' }), null);
    assert.equal(parseMesRecosWeekRecord(null), null);
  });

  it('marks shown for the current Paris week and gates re-open', () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    };
    (globalThis as { localStorage?: typeof store }).localStorage =
      store as unknown as Storage;
    (globalThis as { window?: unknown }).window = globalThis;

    const now = new Date('2026-10-01T10:00:00.000Z');
    assert.equal(mesRecosWeekAlreadyShown(now), false);
    const rec = markMesRecosWeekShown(now);
    assert.equal(rec.weekKey, '2026-W40');
    assert.equal(mesRecosWeekAlreadyShown(now), true);
    assert.equal(readMesRecosWeekRecord()?.weekKey, '2026-W40');
    assert.equal(mem.has(MES_RECOS_WEEK_STORAGE_KEY), true);

    // Next Paris week → gate resets
    const nextMon = new Date('2026-10-04T22:30:00.000Z');
    assert.equal(mesRecosWeekAlreadyShown(nextMon), false);
  });
});

describe('mesRecos copy', () => {
  it('locks sheet title and subtitles', () => {
    assert.equal(MES_RECOS_SHEET_TITLE, 'Mes recos de la semaine');
    assert.equal(mesRecosSubtitle('warm'), 'D’après tes goûts');
    assert.equal(mesRecosSubtitle('cold'), 'On affine avec tes prochains clics');
    assert.equal(
      mesRecosSubtitle('empty'),
      'Plus d’idée pour l’instant — parcours l’agenda',
    );
  });
});

describe('Mes recos Plan C wiring (source contracts)', () => {
  it('keeps week sheet + avatar entry and strips × from home Top3 only', async () => {
    const { readFile } = await import('node:fs/promises');
    const app = await readFile(
      new URL('../components/CultureConnectApp.tsx', import.meta.url),
      'utf8',
    );
    const auth = await readFile(
      new URL('../components/AuthButtons.tsx', import.meta.url),
      'utf8',
    );
    const sheet = await readFile(
      new URL('../components/MesRecosSheet.tsx', import.meta.url),
      'utf8',
    );
    assert.match(auth, /data-account-control="mes-recos-menu"/);
    assert.match(auth, /requestOpenMesRecos/);
    assert.match(auth, /Ouvrir mes recommandations de la semaine/);
    assert.match(sheet, /Mes recos de la semaine/);
    assert.match(sheet, /PasPourMoi|onNotInterested/);
    assert.match(sheet, /data-mes-recos-chrome-close/);
    // iPad/sm: always single-column stack — never a 3-up poster rail
    assert.match(sheet, /grid grid-cols-1 gap-3/);
    assert.equal(/grid-cols-[23]/.test(sheet), false);
    assert.match(sheet, /variant="default"/);
    assert.equal(/variant="rail"/.test(sheet), false);
    // Open-immediate loading pulse while semaine pool in flight
    assert.match(sheet, /data-mes-recos-loading/);
    assert.match(sheet, /poolReady/);
    // Week pool key is always semaine|profile — never the chip-scoped visibleRecoKey
    assert.match(app, /recoPoolKey\('semaine', null, selectedCommune, 'profile'\)/);
    assert.match(app, /<MesRecosSheet/);
    assert.match(app, /poolReady=\{weekPoolReady\}/);
    assert.match(app, /markMesRecosWeekShown/);
    // Perf: semaine-first boot prefetch + dynamic chunk preload on auth
    assert.match(app, /j\.scope === 'semaine'/);
    assert.match(app, /void import\('\.\/MesRecosSheet'\)/);
    // Home Top3 SeanceGrid (fixedSlots) must NOT pass onNotInterested
    const top3Block = app.slice(
      app.indexOf('data-top3=""'),
      app.indexOf('data-top3=""') + 1200,
    );
    assert.equal(top3Block.includes('onNotInterested'), false);
  });
});
