import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  AGENDA_REFRESH_EVENT,
  AGENDA_REFRESH_MIN_MS,
  SHELL_UPDATE_ACTION,
  SHELL_UPDATE_TIP,
  SW_UPDATE_INTERVAL_MS,
  agendaRefreshDue,
  homeWindowRefreshAllowed,
  mergeRowsByKey,
  shellReloadIsSafe,
} from './pwaRefresh';

const FIVE_MIN = 5 * 60 * 1000;
const FIFTEEN_MIN = 15 * 60 * 1000;

describe('pwa refresh while open', () => {
  it('checks the worker on a 5–15 min cadence and refetches the agenda after 5 min', () => {
    assert.ok(SW_UPDATE_INTERVAL_MS >= FIVE_MIN);
    assert.ok(SW_UPDATE_INTERVAL_MS <= FIFTEEN_MIN);
    assert.equal(SW_UPDATE_INTERVAL_MS, 10 * 60 * 1000);
    assert.equal(AGENDA_REFRESH_MIN_MS, FIVE_MIN);
    assert.equal(agendaRefreshDue(null, 1_000), true);
    assert.equal(agendaRefreshDue(1_000, 1_000 + FIVE_MIN - 1), false);
    assert.equal(agendaRefreshDue(1_000, 1_000 + FIVE_MIN), true);
    assert.equal(AGENDA_REFRESH_EVENT, 'planc-agenda-refresh');
  });

  it('soft-reloads only when the page is visible, idle, and free of a sheet', () => {
    const safe = {
      visibilityState: 'visible',
      activeTag: 'BODY',
      activeEditable: false,
      dialogOpen: false,
    };
    assert.equal(shellReloadIsSafe(safe), true);
    assert.equal(shellReloadIsSafe({ ...safe, visibilityState: 'hidden' }), false);
    assert.equal(shellReloadIsSafe({ ...safe, activeTag: 'INPUT' }), false);
    assert.equal(shellReloadIsSafe({ ...safe, activeTag: 'TEXTAREA' }), false);
    assert.equal(shellReloadIsSafe({ ...safe, activeTag: 'SELECT' }), false);
    assert.equal(shellReloadIsSafe({ ...safe, activeEditable: true }), false);
    assert.equal(shellReloadIsSafe({ ...safe, dialogOpen: true }), false);
  });

  it('keeps the unfiltered home rail off chip, title, and phrase views', () => {
    const open = {
      scope: 'tous',
      bootScope: 'tous',
      cats: [] as string[],
      genres: [] as string[],
      q: '',
      title: '',
      phraseMode: false,
    };
    assert.equal(homeWindowRefreshAllowed(open), true);
    assert.equal(homeWindowRefreshAllowed({ ...open, scope: 'soir' }), false);
    assert.equal(homeWindowRefreshAllowed({ ...open, cats: ['cinema'] }), false);
    assert.equal(homeWindowRefreshAllowed({ ...open, genres: ['jazz'] }), false);
    assert.equal(homeWindowRefreshAllowed({ ...open, q: 'balkan' }), false);
    assert.equal(homeWindowRefreshAllowed({ ...open, title: 'balkan' }), false);
    assert.equal(homeWindowRefreshAllowed({ ...open, phraseMode: true }), false);
    assert.equal(homeWindowRefreshAllowed({ ...open, avecEnfants: true }), false);
  });

  it('updates rows in place and appends new keys without dropping a loaded page', () => {
    const prev = [
      { key: 'a', title: 'ancien' },
      { key: 'b', title: 'reste' },
    ];
    const incoming = [
      { key: 'a', title: 'frais' },
      { key: 'c', title: 'nouveau' },
    ];
    assert.deepEqual(mergeRowsByKey(prev, incoming), [
      { key: 'a', title: 'frais' },
      { key: 'b', title: 'reste' },
      { key: 'c', title: 'nouveau' },
    ]);
    assert.deepEqual(mergeRowsByKey(prev, []), prev);
  });

  it('keeps the shell network-first, the offline line, and cookies out of the cache', () => {
    const sw = readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');
    assert.match(sw, /cache:\s*'no-store'/);
    assert.match(sw, /destination === 'document'/);
    assert.match(sw, /text\/html/);
    assert.match(sw, /text\/x-component/);
    assert.match(sw, /RSC/);
    assert.ok(sw.indexOf('Response.error') < sw.indexOf('Plan C a besoin du réseau'));
    assert.match(sw, /Plan C a besoin du réseau pour s’ouvrir\./);
    assert.match(sw, /cc_vid/);
    assert.doesNotMatch(sw, /caches\.open|cache\.put|caches\.put/);
    assert.doesNotMatch(sw, /credentials:\s*['"]omit['"]/);
    assert.doesNotMatch(sw, /headers\.get\(\s*['"]cookie['"]/i);
    assert.doesNotMatch(sw, /addEventListener\(\s*['"]push['"]/);
    assert.equal(SHELL_UPDATE_TIP, 'Une version plus fraîche est là.');
    assert.equal(SHELL_UPDATE_ACTION, 'Actualiser');
  });

  it('wires focus, the interval, and a safe reload in the install provider', () => {
    const ui = readFileSync(path.join(process.cwd(), 'src/components/PwaInstall.tsx'), 'utf8');
    const app = readFileSync(
      path.join(process.cwd(), 'src/components/CultureConnectApp.tsx'),
      'utf8',
    );
    assert.match(ui, /updateViaCache:\s*'none'/);
    assert.match(ui, /SW_UPDATE_INTERVAL_MS/);
    assert.match(ui, /shellReloadIsSafe/);
    assert.match(ui, /AGENDA_REFRESH_EVENT/);
    assert.match(ui, /visibilitychange/);
    assert.match(ui, /data-testid="pwa-shell-refresh"/);
    assert.match(ui, /SHELL_UPDATE_TIP/);
    assert.match(ui, /if \(!sawController/);
    assert.match(app, /AGENDA_REFRESH_EVENT/);
    assert.match(app, /mergeRowsByKey/);
    assert.match(app, /cache:\s*'no-store'/);
    assert.match(app, /window=home/);
    assert.equal(app.includes('keep previous window'), false);
  });
});
