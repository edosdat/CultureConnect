import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME_EVENTS_COUNTER_EMAIL,
  formatHomeEventsCounter,
  showHomeEventsCounter,
} from './homeEventsCounter';

describe('showHomeEventsCounter', () => {
  it('is true only for the admin Google email (trimmed, case-insensitive)', () => {
    assert.equal(showHomeEventsCounter('edosdat@gmail.com'), true);
    assert.equal(showHomeEventsCounter('EdoSdat@Gmail.com'), true);
    assert.equal(showHomeEventsCounter(' edosdat@gmail.com '), true);
    assert.equal(HOME_EVENTS_COUNTER_EMAIL, 'edosdat@gmail.com');
  });

  it('is false for guests and any other account', () => {
    assert.equal(showHomeEventsCounter(null), false);
    assert.equal(showHomeEventsCounter(undefined), false);
    assert.equal(showHomeEventsCounter(''), false);
    assert.equal(showHomeEventsCounter('other@gmail.com'), false);
    assert.equal(showHomeEventsCounter('edosdat@gmail.com.evil'), false);
  });
});

describe('formatHomeEventsCounter', () => {
  it('prints full filtered + raw CSV totals, not page size', () => {
    const line = formatHomeEventsCounter({
      cards: 2525,
      seances: 4078,
      csvEvents: 4920,
      csvProgramme: 9892,
      rangeLabel: 'à venir',
    });
    assert.equal(line, 'cartes 2525 · séances 4078 · csv 4920/9892 · à venir');
    assert.equal(line.includes('sur'), false);
    assert.equal(line.includes('19'), false);
    assert.equal(line.includes('29'), false);
    assert.equal(line.includes('@'), false);
    assert.equal(line.toLowerCase().includes('edosdat'), false);
  });

  it('omits an empty range and floors invalid counts', () => {
    assert.equal(
      formatHomeEventsCounter({
        cards: -3,
        seances: Number.NaN,
        csvEvents: 1.9,
        csvProgramme: 2,
        rangeLabel: '  ',
      }),
      'cartes 0 · séances 0 · csv 1/2',
    );
  });
});
