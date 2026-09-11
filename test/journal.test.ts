import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ISO_WITH_OFFSET,
  interventionCount,
  isoWithOffset,
  leadTimeHours,
  yyyyMmDd,
} from '../src/lib/journal.ts';

test('leadTimeHours returns unrounded hours for a fully timestamped entry', () => {
  const entry = {
    issue_opened_at: '2026-09-10T22:44:09Z',
    deployed_at: '2026-09-10T23:28:11Z',
  };
  const hours = leadTimeHours(entry);
  assert.equal(typeof hours, 'number');
  // (23:28:11 - 22:44:09) = 44 minutes 2 seconds = 2642 seconds = 0.73388...h
  assert.ok(Math.abs((hours as number) - 0.7338888888888889) < 1e-9);
});

test('leadTimeHours accepts Date and string inputs interchangeably', () => {
  const opened = new Date('2026-09-10T22:44:09Z');
  const deployed = new Date('2026-09-10T23:28:11Z');
  const fromDates = leadTimeHours({ issue_opened_at: opened, deployed_at: deployed });
  const fromStrings = leadTimeHours({
    issue_opened_at: opened.toISOString(),
    deployed_at: deployed.toISOString(),
  });
  assert.equal(fromDates, fromStrings);
});

test('leadTimeHours returns null when deployed_at is absent, null or empty', () => {
  const base = { issue_opened_at: '2026-09-10T22:44:09Z' };
  assert.equal(leadTimeHours(base), null);
  assert.equal(leadTimeHours({ ...base, deployed_at: null }), null);
  assert.equal(leadTimeHours({ ...base, deployed_at: '' }), null);
});

test('leadTimeHours throws RangeError when deployed_at precedes issue_opened_at', () => {
  assert.throws(
    () =>
      leadTimeHours({
        issue_opened_at: '2026-09-10T23:00:00Z',
        deployed_at: '2026-09-10T22:00:00Z',
      }),
    RangeError,
  );
});

test('leadTimeHours throws RangeError on an unparseable timestamp', () => {
  assert.throws(
    () =>
      leadTimeHours({
        issue_opened_at: '2026-09-10T22:44:09Z',
        deployed_at: 'not-a-timestamp',
      }),
    RangeError,
  );
});

test('interventionCount returns 0 when interventions is absent, 0 for [], and the length otherwise', () => {
  const base = { issue_opened_at: '2026-09-10T22:44:09Z' };
  assert.equal(interventionCount(base), 0);
  assert.equal(interventionCount({ ...base, interventions: [] }), 0);
  const four = [
    { what: 'a', why: 'a', at: '2026-09-10T22:44:09Z' },
    { what: 'b', why: 'b', at: '2026-09-10T22:44:09Z' },
    { what: 'c', why: 'c', at: '2026-09-10T22:44:09Z' },
    { what: 'd', why: 'd', at: '2026-09-10T22:44:09Z' },
  ];
  assert.equal(interventionCount({ ...base, interventions: four }), 4);
});

test('isoWithOffset accepts Z and numeric-offset ISO 8601 timestamps', () => {
  assert.equal(isoWithOffset('2026-09-10T22:44:09Z'), true);
  assert.equal(isoWithOffset('2026-09-10T22:44:09+02:00'), true);
});

test('isoWithOffset rejects a timestamp with no timezone, a bare date and a Date instance', () => {
  assert.equal(isoWithOffset('2026-09-10T22:44:09'), false);
  assert.equal(isoWithOffset('2026-09-10'), false);
  assert.equal(isoWithOffset(new Date('2026-09-10T22:44:09Z')), false);
});

test('ISO_WITH_OFFSET and yyyyMmDd are exported regexes matching their names', () => {
  assert.ok(ISO_WITH_OFFSET instanceof RegExp);
  assert.ok(yyyyMmDd instanceof RegExp);
  assert.equal(yyyyMmDd.test('2026-09-11'), true);
  assert.equal(yyyyMmDd.test('2026-9-11'), false);
});
