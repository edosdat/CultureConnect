import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARTE_COPY, charteCopy, charteRegister } from './charteCopy';

describe('charte copy registry', () => {
  it('returns the two default labels and the two enfants labels', () => {
    assert.equal(CHARTE_COPY.default.mesCrushs, 'Mes crushs');
    assert.equal(
      CHARTE_COPY.default.deuxSoirs,
      'Plus que deux soirs pour conclure',
    );
    assert.equal(CHARTE_COPY.enfants.mesCrushs, 'Mes plans');
    assert.equal(CHARTE_COPY.enfants.deuxSoirs, 'Plus que deux dates');
  });

  it('mode off → default register', () => {
    assert.equal(charteRegister(false), 'default');
    assert.deepEqual(charteCopy(false), CHARTE_COPY.default);
  });

  it('mode on → enfants register', () => {
    assert.equal(charteRegister(true), 'enfants');
    assert.deepEqual(charteCopy(true), CHARTE_COPY.enfants);
  });

  it('a mixed list shares one register — no per-item branching', () => {
    const mixed = [
      { categorie: 'enfants_famille', publicCible: 'jeune_public' },
      { categorie: 'cinema', publicCible: 'Interdit - 16 ans' },
      { categorie: 'musique', publicCible: 'tout_public' },
    ];
    for (const avecEnfants of [false, true]) {
      const copy = charteCopy(avecEnfants);
      const labels = mixed.map(() => copy);
      assert.equal(new Set(labels.map((row) => row.mesCrushs)).size, 1);
      assert.equal(new Set(labels.map((row) => row.deuxSoirs)).size, 1);
      assert.equal(
        labels[0].mesCrushs,
        avecEnfants ? 'Mes plans' : 'Mes crushs',
      );
    }
  });

  it('the enfants_famille chip alone does not select the enfants register', () => {
    const chipOnModeOff = charteCopy(false);
    assert.equal(chipOnModeOff.mesCrushs, 'Mes crushs');
    assert.equal(chipOnModeOff.deuxSoirs, 'Plus que deux soirs pour conclure');
  });
});

describe('charte copy is wired once from the mode flag', () => {
  const app = readFileSync(
    new URL('../components/CultureConnectApp.tsx', import.meta.url),
    'utf8',
  );
  const line = readFileSync(
    new URL('../components/CharteRegisterLine.tsx', import.meta.url),
    'utf8',
  );
  const card = readFileSync(
    new URL('../components/SeanceCard.tsx', import.meta.url),
    'utf8',
  );
  const grid = readFileSync(
    new URL('../components/SeanceGrid.tsx', import.meta.url),
    'utf8',
  );

  it('the home resolves the register from avecEnfants only', () => {
    assert.match(app, /charteRegister\(avecEnfants\)/);
    assert.match(app, /charteCopy\(avecEnfants\)/);
    assert.equal(app.includes("? 'Mes plans'"), false);
    assert.equal(app.includes('? "Mes plans"'), false);
    assert.equal(app.includes('Mes crushs'), false);
    assert.equal(app.includes('Plus que deux soirs pour conclure'), false);
    assert.equal(app.includes('Plus que deux dates'), false);
  });

  it('the label component prints the copy object and does not branch', () => {
    assert.match(line, /copy\.mesCrushs/);
    assert.match(line, /copy\.deuxSoirs/);
    assert.equal(line.includes('avecEnfants'), false);
    assert.equal(line.includes('enfants_famille'), false);
    assert.equal(line.includes('?'), false);
  });

  it('first paint uses the default register, same block as the live home', () => {
    const boot = readFileSync(
      new URL('../components/HomeTop3BootFallback.tsx', import.meta.url),
      'utf8',
    );
    assert.match(boot, /<CharteRegisterLine register="default" copy=\{CHARTE_COPY\.default\}/);
    assert.equal(boot.includes('avecEnfants'), false);
    assert.equal(boot.includes('Mes crushs'), false);
    assert.equal(boot.includes('Mes plans'), false);
  });

  it('cards and the grid do not carry these labels', () => {
    for (const src of [card, grid]) {
      assert.equal(src.includes('Mes crushs'), false);
      assert.equal(src.includes('Mes plans'), false);
      assert.equal(src.includes('Plus que deux soirs pour conclure'), false);
      assert.equal(src.includes('Plus que deux dates'), false);
      assert.equal(src.includes('charteCopy'), false);
    }
  });
});
