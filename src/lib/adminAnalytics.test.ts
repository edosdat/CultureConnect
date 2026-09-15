import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOME_EVENTS_COUNTER_EMAIL } from './homeEventsCounter';
import {
  analyticsWindowDays,
  csvEscape,
  dailyVidUniquesKey,
  formatTasteExportCsv,
  googleLoginCountKey,
  hashEmailKey,
  inParisWindow,
  isUsefulCatalogueTag,
  mean,
  median,
  mergeVidDay,
  parisDayOfIso,
  splitCatalogueTagSlugs,
  tagBucket,
  tasteExportRows,
  uniquesAndReturns,
  usefulTagsFromFields,
  usefulTasteTags,
} from './adminAnalytics';
import { emptyProfile, type AccountTasteState } from './signals';

function state(partial: Partial<AccountTasteState>): AccountTasteState {
  return {
    signalsRecent: [],
    profile: emptyProfile(),
    ...partial,
  };
}

describe('analytics window', () => {
  it('covers 7 inclusive Paris days ending today', () => {
    const days = analyticsWindowDays(new Date('2026-09-15T12:00:00+02:00'));
    assert.equal(days.length, 7);
    assert.equal(days[0], '2026-09-09');
    assert.equal(days[6], '2026-09-15');
    assert.equal(inParisWindow('2026-09-15T08:00:00.000Z', new Set(days)), true);
    assert.equal(inParisWindow('2026-09-08T10:00:00.000Z', new Set(days)), false);
  });

  it('maps ISO timestamps to Paris civil days', () => {
    assert.equal(parisDayOfIso('2026-09-15T00:30:00+02:00'), '2026-09-15');
    assert.equal(parisDayOfIso('not-a-date'), null);
  });
});

describe('uniques and returns (même vid j+1+)', () => {
  it('counts uniques / j and returners across the window', () => {
    const vidDays = new Map<string, Set<string>>();
    mergeVidDay(vidDays, 'v_aaa11111', '2026-09-13');
    mergeVidDay(vidDays, 'v_aaa11111', '2026-09-15');
    mergeVidDay(vidDays, 'v_bbb22222', '2026-09-15');
    const out = uniquesAndReturns(vidDays, [
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
    ]);
    assert.equal(out.distinct, 2);
    assert.equal(out.returners, 1);
    assert.equal(out.perDay[0]?.uniques, 1);
    assert.equal(out.perDay[0]?.returns, 0);
    assert.equal(out.perDay[2]?.uniques, 2);
    assert.equal(out.perDay[2]?.returns, 1);
  });
});

describe('mean / median', () => {
  it('handles empty, odd, and even lists', () => {
    assert.equal(mean([]), 0);
    assert.equal(median([]), 0);
    assert.equal(mean([2, 4, 6]), 4);
    assert.equal(median([1, 3, 9]), 3);
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });
});

describe('taste tags + matchable threshold', () => {
  it('counts moods / genres / themes and ignores cats', () => {
    const tags = usefulTasteTags(
      state({
        profile: {
          cats: { cinema: { weight: 9, pct: 100 } },
          moods: { rigolo: { weight: 4, pct: 50 }, sortie: { weight: 2, pct: 25 } },
          genres: { comedie: { weight: 2, pct: 40 }, cinema: { weight: 3, pct: 60 } },
          themes: { histoire: { weight: 1, pct: 100 } },
          communes: { Toulouse: 2 },
        },
      }),
    );
    assert.equal(tags.includes('rigolo'), true);
    assert.equal(tags.includes('g:comedie'), true);
    assert.equal(tags.includes('t:histoire'), true);
    assert.equal(tags.some((t) => t.includes('cinema')), false);
    assert.equal(tagBucket(0), '0');
    assert.equal(tagBucket(5), '1-5');
    assert.equal(tagBucket(6), '6-15');
    assert.equal(tagBucket(16), '15+');
  });
});

describe('catalogue tag utile', () => {
  it('keeps closed vocab only', () => {
    assert.deepEqual(splitCatalogueTagSlugs('rigolo|comedie, junk'), [
      'rigolo',
      'comedie',
      'junk',
    ]);
    assert.equal(isUsefulCatalogueTag('rigolo'), true);
    assert.equal(isUsefulCatalogueTag('junk'), false);
    assert.deepEqual(
      usefulTagsFromFields({ moods: 'rigolo|sortie', genre: 'comedie|foo' }),
      ['rigolo', 'comedie'],
    );
  });
});

describe('KPI 18 CSV interne', () => {
  it('hashes email, sorts first profiles, omits raw email and payload', () => {
    const rows = tasteExportRows(
      [
        {
          userKey: 'later@gmail.com',
          state: state({
            tastesText: 'jazz intimiste',
            tastesSetAt: '2026-09-10T00:00:00.000Z',
          }),
          updatedAt: '2026-09-10T00:00:00.000Z',
        },
        {
          userKey: 'first@gmail.com',
          state: state({
            tastesText: 'comédie tendre',
            tastesSetAt: '2026-09-01T00:00:00.000Z',
            profile: {
              ...emptyProfile(),
              moods: { tendre: { weight: 2, pct: 100 } },
            },
          }),
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          userKey: 'empty@gmail.com',
          state: state({}),
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      30,
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.emailHash, hashEmailKey('first@gmail.com'));
    assert.equal(rows[0]?.emailHash.includes('@'), false);
    const csv = formatTasteExportCsv(rows);
    assert.match(csv, /INTERNE/);
    assert.equal(csv.includes('first@gmail.com'), false);
    assert.equal(csv.includes('signalsRecent'), false);
    assert.equal(csv.includes('comédie tendre'), false);
    assert.match(csv, /email_hash/);
    assert.equal(csvEscape('a,b').includes('"'), true);
  });
});

describe('KV key helpers', () => {
  it('uses first-party prefixes already in the app family', () => {
    assert.equal(dailyVidUniquesKey('2026-09-15'), 'cc:vu:2026-09-15');
    assert.equal(googleLoginCountKey('2026-09-15'), 'cc:login:2026-09-15');
  });
});

describe('admin gate + export route', () => {
  it('reuses the existing admin Google email and 404s everyone else', () => {
    assert.equal(HOME_EVENTS_COUNTER_EMAIL, 'edosdat@gmail.com');
    const page = readFileSync(
      new URL('../app/admin/analytics/page.tsx', import.meta.url),
      'utf8',
    );
    const exportRoute = readFileSync(
      new URL('../app/admin/analytics/export/route.ts', import.meta.url),
      'utf8',
    );
    const loader = readFileSync(
      new URL('./adminAnalyticsLoad.ts', import.meta.url),
      'utf8',
    );
    assert.match(page, /showHomeEventsCounter/);
    assert.match(page, /notFound\(\)/);
    assert.equal(page.includes('searchParams'), false);
    assert.match(exportRoute, /showHomeEventsCounter/);
    assert.match(exportRoute, /status: 404/);
    assert.match(loader, /cc-gouts-internes/);
    assert.match(exportRoute, /filename/);
  });
});

describe('Mesure — approx. / minorant on guest KV KPIs', () => {
  it('labels KPI 1–2, 10, 16 only', () => {
    const view = readFileSync(
      new URL('../components/AdminAnalyticsView.tsx', import.meta.url),
      'utf8',
    );
    assert.match(view, /export const APPROX_MINORANT_LABEL = 'approx\. \/ minorant'/);
    const cards = view.split(/<Card\b/).slice(1);
    const approxKpis = cards
      .filter((block) => /\bapprox\b/.test(block))
      .map((block) => block.match(/kpi="(\d+)"/)?.[1])
      .filter((k): k is string => Boolean(k))
      .sort((a, b) => Number(a) - Number(b));
    assert.deepEqual(approxKpis, ['1', '2', '10', '16']);
    assert.equal(cards.some((b) => /kpi="5"/.test(b) && /\bapprox\b/.test(b)), false);
    assert.equal(cards.some((b) => /kpi="18"/.test(b) && /\bapprox\b/.test(b)), false);
  });
});
