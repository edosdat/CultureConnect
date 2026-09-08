import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { externalPageUrl } from './externalUrl';

const ARTO_FLEUR =
  'https://festivalramonville-arto.fr/programmation/spectacle/fleur-de-peau';

describe('externalPageUrl', () => {
  it('keeps filled ARTO https spectacle URLs', () => {
    assert.equal(externalPageUrl(ARTO_FLEUR), ARTO_FLEUR);
  });

  it('rewrites /spectacle/… to the ARTO host (never an app route)', () => {
    assert.equal(externalPageUrl('/spectacle/fleur-de-peau'), ARTO_FLEUR);
    assert.equal(
      externalPageUrl('/programmation/spectacle/fleur-de-peau'),
      ARTO_FLEUR,
    );
  });

  it('drops other root-relative paths so Next.js cannot 404 them', () => {
    assert.equal(externalPageUrl('/artistes'), '');
    assert.equal(externalPageUrl('/confidentialite'), '');
    assert.equal(externalPageUrl('/api/agenda'), '');
    assert.equal(externalPageUrl('/evenements/foo'), '');
  });

  it('accepts protocol-relative and bare hosts', () => {
    assert.equal(
      externalPageUrl('//festivalramonville-arto.fr/programmation/spectacle/fleur-de-peau'),
      ARTO_FLEUR,
    );
    assert.equal(
      externalPageUrl('mapado.com/event/1'),
      'https://mapado.com/event/1',
    );
  });

  it('rejects empty / javascript', () => {
    assert.equal(externalPageUrl(''), '');
    assert.equal(externalPageUrl('   '), '');
    assert.equal(externalPageUrl('javascript:alert(1)'), '');
  });
});
