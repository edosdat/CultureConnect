import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADMIN_EMAILS, HOME_EVENTS_COUNTER_EMAIL } from './homeEventsCounter';
import {
  adminCsvFilename,
  analyticsWindowDays,
  analyticsWindowDaysN,
  buildRsvpTableRows,
  buildTokenTableRows,
  buildVisitsAgg,
  csvEscape,
  dailyVidUniquesKey,
  displayEmailHash,
  formatRsvpExportCsv,
  formatTasteExportCsv,
  formatTokenExportCsv,
  formatVisitsAggExportCsv,
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
  tasteTableRows,
  topTagsComptes,
  truncateTokenUi,
  uniquesAndReturns,
  usefulTagsFromFields,
  usefulTasteTags,
} from './adminAnalytics';
import {
  KPI_COPY,
  KPI9_LOGIN_HINT,
  SECTION_COPY,
  signalKindLabel,
} from './adminAnalyticsCopy';
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
    assert.equal(out.returnRate, 0.5);
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
  it('counts moods ∪ genres with value > 0 only — 0 themes / tastesText / cats', () => {
    const tags = usefulTasteTags(
      state({
        tastesText: 'histoire politique rigolo jazz',
        profile: {
          cats: { cinema: { weight: 9, pct: 100 }, theatre: { weight: 3, pct: 50 } },
          moods: { rigolo: { weight: 4, pct: 50 }, sortie: { weight: 2, pct: 25 } },
          genres: { comedie: { weight: 2, pct: 40 }, cinema: { weight: 3, pct: 60 } },
          themes: { histoire: { weight: 1, pct: 100 } },
          communes: { Toulouse: 2 },
        },
      }),
    );
    assert.equal(tags.includes('rigolo'), true);
    assert.equal(tags.includes('g:comedie'), true);
    assert.equal(tags.includes('t:histoire'), false);
    assert.equal(tags.includes('histoire'), false);
    assert.equal(tags.some((t) => t.startsWith('t:')), false);
    assert.equal(tags.some((t) => t.includes('cinema')), false);
    assert.equal(tags.some((t) => t.includes('theatre')), false);
    assert.equal(tagBucket(0), '0');
    assert.equal(tagBucket(5), '1-5');
    assert.equal(tagBucket(6), '6-15');
    assert.equal(tagBucket(16), '15+');
    const textOnly = usefulTasteTags(
      state({ tastesText: 'rigolo jazz intimiste histoire politique' }),
    );
    assert.deepEqual(textOnly, []);
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
    assert.equal(isUsefulCatalogueTag('histoire'), false);
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
    assert.equal(rows[0]?.nSignals, 0);
    assert.equal(rows[0]?.scorable, true);
    const csv = formatTasteExportCsv(rows);
    assert.match(csv, /INTERNE/);
    assert.equal(csv.includes('first@gmail.com'), false);
    assert.equal(csv.includes('signalsRecent'), false);
    assert.equal(csv.includes('comédie tendre'), false);
    assert.match(csv, /email_hash/);
    assert.equal(/,themes,/.test(csv), false);
    assert.equal(csv.includes('\nthemes'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(rows[0], 'themes'), false);
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
  it('gates the whole /admin namespace and 404s everyone else', () => {
    assert.deepEqual([...ADMIN_EMAILS], [
      'edosdat@gmail.com',
      'katimostef@gmail.com',
    ]);
    assert.equal(HOME_EVENTS_COUNTER_EMAIL, 'edosdat@gmail.com');
    const layout = readFileSync(
      new URL('../app/admin/layout.tsx', import.meta.url),
      'utf8',
    );
    const page = readFileSync(
      new URL('../app/admin/analytics/page.tsx', import.meta.url),
      'utf8',
    );
    const exportRoute = readFileSync(
      new URL('../app/admin/analytics/export/route.ts', import.meta.url),
      'utf8',
    );
    const gate = readFileSync(new URL('./adminGate.ts', import.meta.url), 'utf8');
    const loader = readFileSync(
      new URL('./adminAnalyticsLoad.ts', import.meta.url),
      'utf8',
    );
    assert.match(gate, /showHomeEventsCounter/);
    assert.match(layout, /isAdminSession/);
    assert.match(layout, /notFound\(\)/);
    assert.match(page, /isAdminSession/);
    assert.match(page, /notFound\(\)/);
    assert.equal(page.includes('searchParams'), false);
    assert.match(exportRoute, /isAdminSession/);
    assert.match(exportRoute, /status: 404/);
    assert.match(loader, /adminCsvFilename\('tastes'/);
    assert.match(loader, /cc-tastes|adminCsvFilename/);
    const storeExport = readFileSync(
      new URL('../app/admin/analytics/export/[store]/route.ts', import.meta.url),
      'utf8',
    );
    assert.match(storeExport, /isAdminSession/);
    assert.match(storeExport, /status: 404/);
    assert.match(storeExport, /isAdminCsvStore/);
    assert.match(loader, /cc:vs:\*/);
    assert.match(loader, /not cc:vu daily index/);
    assert.equal(loader.includes('readDailyVidSets'), false);
    assert.match(exportRoute, /filename/);
  });
});

describe('RGPD — export 18 + 0 join vid', () => {
  it('exports all scorable rows, hashes email, useful columns only, no vid↔compte', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      userKey: `u${i}@gmail.com`,
      state: state({
        tastesText: `jazz ${i}`,
        tastesSetAt: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
      updatedAt: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));
    const rows = tasteExportRows(many, 99);
    assert.equal(rows.length, 40);
    assert.equal(tasteExportRows(many).length, 40);
    assert.equal(rows.every((r) => !r.emailHash.includes('@')), true);
    const csv = formatTasteExportCsv(rows);
    assert.match(csv, /INTERNE/);
    assert.equal(csv.includes('@gmail.com'), false);
    assert.equal(csv.includes('signalsRecent'), false);
    assert.equal(csv.includes('user_key'), false);
    assert.match(csv, /email_hash/);
    assert.equal(csv.includes('themes'), false);
    const load = readFileSync(
      new URL('./adminAnalyticsLoad.ts', import.meta.url),
      'utf8',
    );
    const helpers = readFileSync(
      new URL('./adminAnalytics.ts', import.meta.url),
      'utf8',
    );
    assert.match(load, /assertNoVidAccountJoin/);
    assert.match(load, /Never joins cc_vid/);
    assert.match(helpers, /no cc_vid ↔ email join/);
    assert.equal(load.includes('firstName'), false);
    const gitignore = readFileSync(
      new URL('../../.gitignore', import.meta.url),
      'utf8',
    );
    assert.match(gitignore, /gouts-internes/);
    assert.match(gitignore, /cc-tastes-\*\.csv/);
    assert.match(gitignore, /cc-tokens-\*\.csv/);
    assert.match(gitignore, /cc-rsvps-\*\.csv/);
    assert.match(gitignore, /cc-visits-\*\.csv/);
    const conf = readFileSync(
      new URL('../app/confidentialite/page.tsx', import.meta.url),
      'utf8',
    );
    assert.match(conf, /export interne limité/);
    assert.match(conf, /Pour toi/);
    assert.match(conf, /agrégats de goûts/);
    assert.match(
      conf,
      /L’éditeur consulte des\s+agrégats de goûts et un export interne limité pour ajuster/,
    );
  });
});

describe('UX admin — allowlist + menu', () => {
  it('menu Analytics / Admin is gated on ADMIN_EMAILS via showHomeEventsCounter', () => {
    assert.deepEqual([...ADMIN_EMAILS], [
      'edosdat@gmail.com',
      'katimostef@gmail.com',
    ]);
    const auth = readFileSync(
      new URL('../components/AuthButtons.tsx', import.meta.url),
      'utf8',
    );
    assert.match(auth, /showHomeEventsCounter\(user\?\.email\)/);
    assert.match(auth, /Analytics \/ Admin/);
    assert.match(auth, /data-account-control="admin-analytics"/);
    assert.equal(auth.includes('@gmail.com'), false);
    const gate = readFileSync(new URL('./adminGate.ts', import.meta.url), 'utf8');
    assert.match(gate, /showHomeEventsCounter/);
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

describe('UX admin — labels FR + glossaire + sections', () => {
  it('plain French titles, 0-normal glossary, goûts vs catalogue split', () => {
    const ids = Array.from({ length: 18 }, (_, i) => String(i + 1));
    for (const id of ids) {
      const copy = KPI_COPY[id];
      assert.ok(copy, `KPI ${id} copy`);
      assert.ok(copy.title.trim().length > 0);
      assert.ok(copy.glossary.trim().length > 0);
      assert.match(copy.glossary, /0/);
      assert.equal(/\btoken\b/i.test(copy.title), false, `KPI ${id} title jargon`);
      assert.equal(/\bopen_card\b/i.test(copy.title), false);
      assert.equal(/\bcc_vid\b/i.test(copy.title), false);
    }
    assert.equal(KPI_COPY['15']?.title, 'Top tags catalogue Toulouse');
    assert.match(KPI_COPY['15']?.glossary ?? '', /≠/);
    assert.match(KPI_COPY['15']?.glossary ?? '', /pas ce que les gens aiment/i);
    assert.equal(KPI_COPY['9']?.hint, KPI9_LOGIN_HINT);
    assert.equal(KPI9_LOGIN_HINT, 'Logins = depuis le deploy du 15/09');
    assert.equal(SECTION_COPY.goutsComptes.title, 'Goûts comptes');
    assert.equal(SECTION_COPY.comptesTable.title, 'Comptes');
    assert.equal(SECTION_COPY.tokensTable.title, 'Liens de partage');
    assert.equal(SECTION_COPY.rsvpsTable.title, 'Réponses Envie / J’y vais');
    assert.equal(SECTION_COPY.visitsTable.title, 'Lectures des liens');
    assert.equal(SECTION_COPY.tagsCatalogue.title, 'Tags catalogue');
    assert.match(SECTION_COPY.goutsComptes.intro, /pas les tags du catalogue/);
    assert.match(SECTION_COPY.tagsCatalogue.intro, /≠ ce que les gens aiment/);
    assert.equal(signalKindLabel('open_card'), 'Ouverture de fiche');
    assert.equal(signalKindLabel('outbound_click'), 'Clic Réserver');

    const view = readFileSync(
      new URL('../components/AdminAnalyticsView.tsx', import.meta.url),
      'utf8',
    );
    assert.match(view, /SECTION_COPY\.goutsComptes/);
    assert.match(view, /AdminDataTables/);
    assert.match(view, /SECTION_COPY\.tagsCatalogue/);
    assert.match(view, /kpi="12"/);
    assert.match(view, /kpi="13"/);
    assert.match(view, /kpi="17"/);
    assert.match(view, /kpi="18"/);
    assert.match(view, /kpi="14"/);
    assert.match(view, /kpi="15"/);
    const goutsIdx = view.indexOf('SECTION_COPY.goutsComptes');
    const tagsIdx = view.indexOf('SECTION_COPY.tagsCatalogue');
    const tablesIdx = view.indexOf('<AdminDataTables');
    const kpi14 = view.indexOf('kpi="14"');
    const kpi15 = view.indexOf('kpi="15"');
    const kpi12 = view.indexOf('kpi="12"');
    const kpi18 = view.indexOf('kpi="18"');
    assert.ok(goutsIdx > 0 && tagsIdx > goutsIdx);
    assert.ok(tablesIdx > goutsIdx && tablesIdx < tagsIdx);
    assert.ok(kpi12 > goutsIdx && kpi18 > goutsIdx && kpi18 < tagsIdx);
    assert.ok(kpi14 > tagsIdx && kpi15 > tagsIdx);
    assert.equal(view.includes('Tokens créés'), false);
    assert.equal(view.includes('Uniques cc_vid'), false);
    assert.equal(view.includes('Top tags Toulouse"'), false);
    assert.match(KPI_COPY['1']?.glossary ?? '', /nav privée \/ multi-device/);
    assert.match(KPI_COPY['18']?.glossary ?? '', /tous les comptes/);
    assert.equal(KPI_COPY['18']?.glossary.includes('30'), false);
  });
});

describe('P1 admin tables + CSV (hash only)', () => {
  it('covers 30 Paris days and hashes sha256[:16]', () => {
    const days = analyticsWindowDaysN(30, new Date('2026-09-15T12:00:00+02:00'));
    assert.equal(days.length, 30);
    assert.equal(days[0], '2026-08-17');
    assert.equal(days[29], '2026-09-15');
    const hash = hashEmailKey('Eloi@Gmail.com');
    assert.equal(hash.length, 16);
    assert.equal(hash.includes('@'), false);
    assert.equal(displayEmailHash(hash + 'deadbeefcafebabe'), hash);
    assert.equal(truncateTokenUi('abcd1234'), 'abcd1234');
    assert.equal(truncateTokenUi('abcdefghijklmnop'), 'abcdefgh…mnop');
    assert.equal(adminCsvFilename('tastes', '2026-09-15'), 'cc-tastes-2026-09-15.csv');
  });

  it('table comptes includes empty rows; top tags count users ≠ catalogue', () => {
    const accounts = [
      {
        userKey: 'a@gmail.com',
        state: state({
          profile: {
            ...emptyProfile(),
            moods: { rigolo: { weight: 2, pct: 100 } },
          },
        }),
        updatedAt: '2026-09-15T10:00:00.000Z',
      },
      {
        userKey: 'b@gmail.com',
        state: state({
          profile: {
            ...emptyProfile(),
            moods: { rigolo: { weight: 1, pct: 50 } },
            genres: { comedie: { weight: 2, pct: 50 } },
          },
        }),
        updatedAt: '2026-09-14T10:00:00.000Z',
      },
      {
        userKey: 'empty@gmail.com',
        state: state({}),
        updatedAt: '2026-09-01T10:00:00.000Z',
      },
    ];
    const table = tasteTableRows(accounts);
    assert.equal(table.length, 3);
    assert.equal(table[0]?.emailHash, hashEmailKey('a@gmail.com'));
    assert.equal(table.some((r) => r.tagCount === 0), true);
    const top = topTagsComptes(accounts);
    const rigolo = top.find((t) => t.tag === 'rigolo');
    const comedie = top.find((t) => t.tag === 'g:comedie');
    assert.equal(rigolo?.userCount, 2);
    assert.equal(comedie?.userCount, 1);
    assert.equal(table.every((r) => !r.emailHash.includes('@')), true);
  });

  it('tokens hash sharer, rsvps omit prénom, visits are opens-only', () => {
    const tokens = buildTokenTableRows([
      {
        token: 'abcd1234',
        itemKey: 'e:E1',
        seanceKey: 'p:P1',
        createdAt: '2026-09-15T08:00:00.000Z',
        sharerEmail: 'sharer@gmail.com',
        opens: 4,
      },
      {
        token: 'zzzz9999',
        itemKey: 'e:E2',
        createdAt: '2026-09-01T08:00:00.000Z',
        sharerEmail: null,
        opens: 0,
      },
    ]);
    assert.equal(tokens[0]?.sharerHash, hashEmailKey('sharer@gmail.com'));
    assert.equal(tokens[0]?.sharerHash.includes('@'), false);
    const tokenCsv = formatTokenExportCsv(tokens);
    assert.match(tokenCsv, /INTERNE/);
    assert.equal(tokenCsv.includes('sharer@gmail.com'), false);
    assert.match(tokenCsv, /abcd1234/);
    assert.match(tokenCsv, /sharer_hash/);

    const rsvps = buildRsvpTableRows([
      {
        token: 'abcd1234',
        emailHash: hashEmailKey('guest@gmail.com') + 'ffffffffffffffff',
        kind: 'envie',
        itemKey: 'e:E1',
        workId: 'f:F1',
        ts: '2026-09-15T09:00:00.000Z',
      },
      {
        token: 'abcd1234',
        emailHash: hashEmailKey('other@gmail.com'),
        kind: 'going',
        itemKey: 'e:E1',
        workId: 'f:F1',
        ts: '2026-09-14T09:00:00.000Z',
      },
    ]);
    assert.equal(Object.prototype.hasOwnProperty.call(rsvps[0], 'firstName'), false);
    assert.equal(JSON.stringify(rsvps).includes('firstName'), false);
    assert.equal(JSON.stringify(rsvps).includes('Léa'), false);
    const rsvpCsv = formatRsvpExportCsv(rsvps);
    assert.equal(rsvpCsv.includes('first_name'), false);
    assert.equal(rsvpCsv.includes('firstName'), false);
    assert.equal(rsvpCsv.includes('Léa'), false);
    assert.match(rsvpCsv, /email_hash/);
    assert.match(rsvpCsv, /envie/);

    const visits = buildVisitsAgg(tokens, new Set(['2026-09-15']));
    assert.equal(visits.window7.tokensCreated, 1);
    assert.equal(visits.window7.opensSum, 4);
    assert.equal(visits.window7.tokensWithOpens, 1);
    assert.equal(visits.byTokenTop[0]?.opens, 4);
    const visitCsv = formatVisitsAggExportCsv(visits.byTokenTop);
    assert.equal(visitCsv.includes('cc_vid'), false);
    assert.match(visitCsv, /^token,opens,created_at,sharer_hash$/m);
    assert.equal(visitCsv.includes('guest@gmail.com'), false);

    const tablesUi = readFileSync(
      new URL('../components/AdminDataTables.tsx', import.meta.url),
      'utf8',
    );
    const load = readFileSync(
      new URL('./adminAnalyticsLoad.ts', import.meta.url),
      'utf8',
    );
    const helpers = readFileSync(
      new URL('./adminAnalytics.ts', import.meta.url),
      'utf8',
    );
    assert.equal(tablesUi.includes('firstName'), false);
    assert.equal(tablesUi.includes('first_name'), false);
    assert.equal(tablesUi.includes('cc_vid'), false);
    assert.equal(load.includes('firstName'), false);
    assert.equal(helpers.includes('firstName'), false);
    assert.equal(tablesUi.includes('analytics_daily'), false);
    assert.equal(load.includes('analytics_daily'), false);
    assert.match(tablesUi, /Top tags comptes/);
    assert.match(tablesUi, /Filtrer par hash/);
    assert.match(tablesUi, /export\/tastes/);
    assert.match(tablesUi, /export\/tokens/);
    assert.match(tablesUi, /export\/rsvps/);
    assert.match(tablesUi, /export\/visits/);
  });
});
