import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calendarDayTone } from './monthCalendarTone';

describe('calendarDayTone', () => {
  it('selected wins over today', () => {
    assert.equal(
      calendarDayTone('2026-10-01', '2026-10-01', '2026-10-01'),
      'selected',
    );
  });

  it('marks today when not selected', () => {
    assert.equal(
      calendarDayTone('2026-10-01', '2026-10-15', '2026-10-01'),
      'today',
    );
  });

  it('defaults other days', () => {
    assert.equal(
      calendarDayTone('2026-10-02', null, '2026-10-01'),
      'default',
    );
  });
});
