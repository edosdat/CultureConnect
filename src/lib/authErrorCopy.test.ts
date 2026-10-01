import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTH_ERROR_RETRY_HREF, authErrorCopy } from './authErrorCopy';

describe('auth error copy', () => {
  it('maps the safe Auth.js codes to plain French', () => {
    assert.equal(
      authErrorCopy('Configuration').body,
      'La connexion n’est pas disponible pour le moment. Ça arrive aussi si le lien d’entrée n’est pas le bon.',
    );
    assert.equal(authErrorCopy('AccessDenied').body, 'L’accès a été refusé.');
    assert.equal(
      authErrorCopy('OAuthCallback').body,
      'Le retour depuis Google n’a pas abouti.',
    );
    assert.match(authErrorCopy('Verification').body, /vérification/);
    assert.equal(
      authErrorCopy('Default').body,
      'Quelque chose a bloqué la connexion.',
    );
    assert.equal(authErrorCopy(undefined).code, 'Default');
    assert.equal(AUTH_ERROR_RETRY_HREF, '/');
  });

  it('does not echo an unknown query value', () => {
    const junk = 'AUTH_SECRET=super-secret\n    at Object.<anonymous>';
    const copy = authErrorCopy(junk);
    const rendered = JSON.stringify(copy);
    assert.equal(copy.code, 'Default');
    assert.equal(rendered.includes('AUTH_SECRET'), false);
    assert.equal(rendered.includes('super-secret'), false);
    assert.equal(rendered.includes('anonymous'), false);
    assert.equal(rendered.includes(junk), false);
  });

  it('keeps only the first code when the query is repeated', () => {
    const copy = authErrorCopy(['AccessDenied', 'AUTH_GOOGLE_SECRET=leak']);
    const rendered = JSON.stringify(copy);
    assert.equal(copy.code, 'AccessDenied');
    assert.equal(rendered.includes('leak'), false);
    assert.equal(rendered.includes('AUTH_GOOGLE_SECRET'), false);
  });

  it('points Auth.js at the French error page', () => {
    const src = readFileSync(new URL('../auth.ts', import.meta.url), 'utf8');
    assert.match(src, /pages:\s*\{[^}]*error:\s*'\/auth\/erreur'/);
  });
});
