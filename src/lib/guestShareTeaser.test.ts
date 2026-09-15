import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GUEST_TEASER_LATER,
  GUEST_TEASER_LOGIN,
  GUEST_TEASER_SHEET_SUB,
  guestTeaserBadge,
  guestTeaserCopy,
  guestTeaserReactionCount,
  guestTeaserShouldShow,
  guestTeaserTitle,
  parseGuestCreatedTokens,
  parseGuestTeaserPayload,
  sumGuestTeaserReactions,
} from './guestShareTeaser';

describe('guest share teaser — Innovateur KEEP', () => {
  it('badge is digit only (1 / 2 / 9+), never a first name', () => {
    assert.equal(guestTeaserBadge(0), null);
    assert.equal(guestTeaserBadge(1), '1');
    assert.equal(guestTeaserBadge(2), '2');
    assert.equal(guestTeaserBadge(9), '9');
    assert.equal(guestTeaserBadge(10), '9+');
    assert.equal(guestTeaserBadge(3)?.includes('Ludo'), false);
    assert.equal(/y va/.test(guestTeaserBadge(3) || ''), false);
  });

  it('sheet copy aggregates envie|going as « réagi », no first names', () => {
    assert.equal(
      guestTeaserCopy(1),
      '1 personne a réagi à ton partage — Connecte-toi pour voir qui.',
    );
    assert.equal(
      guestTeaserCopy(2),
      '2 personnes ont réagi à ton partage — Connecte-toi pour voir qui.',
    );
    assert.equal(guestTeaserTitle(1).includes('Ludo'), false);
    assert.equal(/y va/.test(guestTeaserCopy(2)), false);
    assert.equal(GUEST_TEASER_SHEET_SUB, 'Connecte-toi pour voir qui.');
    assert.equal(GUEST_TEASER_LOGIN, 'Se connecter');
    assert.equal(GUEST_TEASER_LATER, 'Plus tard');
  });

  it('counts only real envie+going, omit 0 / junk', () => {
    assert.equal(guestTeaserReactionCount(null), 0);
    assert.equal(guestTeaserReactionCount({ envie: 0, going: 0 }), 0);
    assert.equal(guestTeaserReactionCount({ envie: 1, going: 0 }), 1);
    assert.equal(guestTeaserReactionCount({ envie: 1, going: 1 }), 2);
    assert.equal(guestTeaserReactionCount({ envie: 'x', going: 2 }), 2);
    assert.equal(
      sumGuestTeaserReactions([
        { envie: 1, going: 0 },
        { envie: 0, going: 2 },
        null,
      ]),
      3,
    );
  });

  it('shows only for guest + their tokens + ≥1 reaction', () => {
    assert.equal(
      guestTeaserShouldShow({
        signedIn: true,
        tokens: ['abcd1234'],
        reactions: 2,
      }),
      false,
    );
    assert.equal(
      guestTeaserShouldShow({
        signedIn: false,
        tokens: [],
        reactions: 2,
      }),
      false,
    );
    assert.equal(
      guestTeaserShouldShow({
        signedIn: false,
        tokens: ['abcd1234'],
        reactions: 0,
      }),
      false,
    );
    assert.equal(
      guestTeaserShouldShow({
        signedIn: false,
        tokens: ['abcd1234'],
        reactions: 1,
      }),
      true,
    );
  });

  it('teaser payload is { count } only — rejects names / envie / going', () => {
    assert.deepEqual(parseGuestTeaserPayload({ count: 3 }), { count: 3 });
    assert.deepEqual(parseGuestTeaserPayload({ count: 2, firstName: 'Ludo' }), {
      count: 0,
    });
    assert.deepEqual(parseGuestTeaserPayload({ count: 2, envie: 1 }), {
      count: 0,
    });
    assert.deepEqual(parseGuestTeaserPayload({ count: 2, going: 1 }), {
      count: 0,
    });
    assert.deepEqual(parseGuestTeaserPayload(null), { count: 0 });
  });

  it('parses only opaque 8-char tokens (their created list)', () => {
    assert.deepEqual(parseGuestCreatedTokens(['abcd1234', 'nope', 'abcd1234']), [
      'abcd1234',
    ]);
    assert.deepEqual(parseGuestCreatedTokens('["zzzzzzzz"]'), ['zzzzzzzz']);
    assert.deepEqual(parseGuestCreatedTokens(null), []);
  });
});
