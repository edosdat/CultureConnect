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

  it('Enfants chip off → default register', () => {
    assert.equal(charteRegister(false), 'default');
    assert.deepEqual(charteCopy(false), CHARTE_COPY.default);
  });

  it('Enfants chip on → enfants register', () => {
    assert.equal(charteRegister(true), 'enfants');
    assert.deepEqual(charteCopy(true), CHARTE_COPY.enfants);
  });

  it('a mixed list shares one register — no per-item branching', () => {
    const mixed = [
      { categorie: 'enfants_famille', publicCible: 'jeune_public' },
      { categorie: 'cinema', publicCible: 'Interdit - 16 ans' },
      { categorie: 'musique', publicCible: 'tout_public' },
    ];
    for (const chipOn of [false, true]) {
      const copy = charteCopy(chipOn);
      const labels = mixed.map(() => copy);
      assert.equal(new Set(labels.map((row) => row.mesCrushs)).size, 1);
      assert.equal(new Set(labels.map((row) => row.deuxSoirs)).size, 1);
      assert.equal(
        labels[0].mesCrushs,
        chipOn ? 'Mes plans' : 'Mes crushs',
      );
    }
  });
});

describe('charte copy is wired once from the Enfants chip', () => {
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

  it('the home resolves the register from the Enfants chip only', () => {
    assert.match(app, /enfantsChipOn/);
    assert.match(app, /charteRegister\(enfantsChipOn\)/);
    assert.match(app, /charteCopy\(enfantsChipOn\)/);
    assert.equal(app.includes('charteRegister(avecEnfants)'), false);
    assert.equal(app.includes('charteCopy(avecEnfants)'), false);
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
  });

  it('cards and grids never pick a register', () => {
    assert.equal(card.includes('charteRegister'), false);
    assert.equal(card.includes('charteCopy'), false);
    assert.equal(grid.includes('charteRegister'), false);
    assert.equal(grid.includes('charteCopy'), false);
  });

  it('the boot chrome stays on the default register', () => {
    const boot = readFileSync(
      new URL('../components/HomeBootChrome.tsx', import.meta.url),
      'utf8',
    );
    assert.equal(boot.includes('avecEnfants'), false);
    assert.equal(boot.includes('enfantsChipOn'), false);
  });
});

describe('connected home title — Mes crushs only', () => {
  const app = readFileSync(
    new URL('../components/CultureConnectApp.tsx', import.meta.url),
    'utf8',
  );
  const boot = readFileSync(
    new URL('../components/HomeTop3BootFallback.tsx', import.meta.url),
    'utf8',
  );

  it('paints CharteRegisterLine only when authenticated', () => {
    const uses = app.split('<CharteRegisterLine').length - 1;
    assert.equal(uses, 1);
    const at = app.indexOf('<CharteRegisterLine');
    const before = app.slice(Math.max(0, at - 180), at);
    assert.match(before, /sessionStatus === 'authenticated' \? \(/);
    assert.equal(app.includes('Mes crushs'), false);
    assert.equal(app.includes('Mon top 3 du moment'), false);
  });

  it('omits the Top 3 H2 when authenticated and keeps it for guests', () => {
    const at = app.indexOf('<h2 className={HOME_SECTION_TITLE_CLASS}>');
    assert.ok(at > 0);
    const before = app.slice(Math.max(0, at - 220), at);
    assert.match(before, /sessionStatus === 'authenticated' \? null : \(/);
    const block = app.slice(at, app.indexOf('</h2>', at));
    assert.match(block, /top3Heading\(recoReady \? top3Cards\.length : 3\)/);
    assert.equal(block.includes('authenticated'), false);
    assert.equal(block.includes('Mon top 3'), false);
  });

  it('guest first paint keeps Le top 3 and does not show Mes crushs', () => {
    assert.match(boot, /Le top 3 du moment/);
    assert.equal(boot.includes('CharteRegisterLine'), false);
    assert.equal(boot.includes('Mes crushs'), false);
    assert.equal(boot.includes('Mon top 3 du moment'), false);
    assert.equal(boot.includes('CHARTE_COPY'), false);
  });
});
