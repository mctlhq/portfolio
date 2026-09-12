import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ISO_WITH_OFFSET,
  byNewestFirst,
  cycleEndTimestamp,
  cycleTimestamp,
  formatInterval,
  formatLeadTime,
  formatStamp,
  githubRef,
  intervalMinutes,
  interventionCount,
  isoDate,
  isoStamp,
  isoWithOffset,
  leadTimeHours,
  totalInterventions,
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

test('leadTimeHours falls back to released_at when deployed_at is absent, null or empty', () => {
  const base = { issue_opened_at: '2026-09-10T22:00:00Z', released_at: '2026-09-10T23:00:00Z' };
  assert.equal(leadTimeHours(base), 1);
  assert.equal(leadTimeHours({ ...base, deployed_at: null }), 1);
  assert.equal(leadTimeHours({ ...base, deployed_at: '' }), 1);
});

test('leadTimeHours prefers deployed_at over released_at when both are present and disagree', () => {
  const entry = {
    issue_opened_at: '2026-09-10T22:00:00Z',
    released_at: '2026-09-10T23:00:00Z',
    deployed_at: '2026-09-11T00:00:00Z',
  };
  assert.equal(leadTimeHours(entry), 2);
});

test('leadTimeHours returns null for an entry with neither deployed_at nor released_at, and formatLeadTime of that is the em dash', () => {
  const entry = { issue_opened_at: '2026-09-10T22:00:00Z' };
  const hours = leadTimeHours(entry);
  assert.equal(hours, null);
  assert.equal(formatLeadTime(hours), '—');
});

test('leadTimeHours returns exactly 0 when issue_opened_at and the end timestamp are the same instant, distinct from the missing rendering', () => {
  const sameInstant = '2026-09-10T22:00:00Z';
  const hours = leadTimeHours({ issue_opened_at: sameInstant, deployed_at: sameInstant });
  assert.equal(hours, 0);
  assert.equal(formatLeadTime(hours), '0.0');
  assert.notEqual(formatLeadTime(hours), formatLeadTime(null));
});

test('cycleEndTimestamp returns deployed_at when present, else released_at, else null', () => {
  assert.equal(cycleEndTimestamp({ issue_opened_at: '2026-01-01T00:00:00Z' }), null);
  assert.equal(
    cycleEndTimestamp({
      issue_opened_at: '2026-01-01T00:00:00Z',
      released_at: '2026-01-02T00:00:00Z',
    })!.toISOString(),
    '2026-01-02T00:00:00.000Z',
  );
  assert.equal(
    cycleEndTimestamp({
      issue_opened_at: '2026-01-01T00:00:00Z',
      released_at: '2026-01-02T00:00:00Z',
      deployed_at: '2026-01-03T00:00:00Z',
    })!.toISOString(),
    '2026-01-03T00:00:00.000Z',
  );
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

test('cycleTimestamp prefers deployed_at, then released_at, merged_at, proposal_approved_at, issue_opened_at', () => {
  const base = { issue_opened_at: '2026-01-01T00:00:00Z' };
  assert.equal(
    cycleTimestamp({ ...base, proposal_approved_at: '2026-01-02T00:00:00Z' }).toISOString(),
    '2026-01-02T00:00:00.000Z',
  );
  assert.equal(
    cycleTimestamp({
      ...base,
      proposal_approved_at: '2026-01-02T00:00:00Z',
      merged_at: '2026-01-03T00:00:00Z',
    }).toISOString(),
    '2026-01-03T00:00:00.000Z',
  );
  assert.equal(
    cycleTimestamp({
      ...base,
      merged_at: '2026-01-03T00:00:00Z',
      released_at: '2026-01-04T00:00:00Z',
    }).toISOString(),
    '2026-01-04T00:00:00.000Z',
  );
  assert.equal(
    cycleTimestamp({
      ...base,
      released_at: '2026-01-04T00:00:00Z',
      deployed_at: '2026-01-05T00:00:00Z',
    }).toISOString(),
    '2026-01-05T00:00:00.000Z',
  );
  assert.equal(cycleTimestamp(base).toISOString(), '2026-01-01T00:00:00.000Z');
});

test('byNewestFirst sorts a shuffled fixture newest first and breaks ties on id, descending', () => {
  const entries = [
    { id: 'b-entry', data: { issue_opened_at: '2026-01-01T00:00:00Z', deployed_at: '2026-01-05T00:00:00Z' } },
    { id: 'a-entry', data: { issue_opened_at: '2026-01-01T00:00:00Z', deployed_at: '2026-01-05T00:00:00Z' } },
    { id: 'c-entry', data: { issue_opened_at: '2026-01-01T00:00:00Z', deployed_at: '2026-01-10T00:00:00Z' } },
  ];
  const sorted = entries.slice().sort(byNewestFirst).map((e) => e.id);
  assert.deepEqual(sorted, ['c-entry', 'b-entry', 'a-entry']);
});

test('isoDate and isoStamp render UTC with no fractional seconds', () => {
  assert.equal(isoDate('2026-09-11T06:41:07.123Z'), '2026-09-11');
  assert.equal(isoStamp('2026-09-11T06:41:07.123Z'), '2026-09-11T06:41:07Z');
  assert.equal(isoStamp(new Date('2026-09-11T06:41:07Z')), '2026-09-11T06:41:07Z');
});

test('formatLeadTime renders an em dash for null, one decimal otherwise, and 0 as "0.0"', () => {
  assert.equal(formatLeadTime(null), '—');
  assert.equal(formatLeadTime(0.7338888888888889), '0.7');
  assert.equal(formatLeadTime(0), '0.0');
  assert.notEqual(formatLeadTime(0), '—');
});

test('totalInterventions sums interventionCount across entries and is 0 for []', () => {
  const entries = [
    { issue_opened_at: '2026-01-01T00:00:00Z', interventions: [{ what: 'a', why: 'a', at: '2026-01-01T00:00:00Z' }] },
    {
      issue_opened_at: '2026-01-01T00:00:00Z',
      interventions: [
        { what: 'b', why: 'b', at: '2026-01-01T00:00:00Z' },
        { what: 'c', why: 'c', at: '2026-01-01T00:00:00Z' },
      ],
    },
    { issue_opened_at: '2026-01-01T00:00:00Z' },
  ];
  assert.equal(totalInterventions(entries), 3);
  assert.equal(totalInterventions([]), 0);
});

test('githubRef returns "#<n>" for a pull request URL and the input URL unchanged otherwise', () => {
  assert.equal(githubRef('https://github.com/mctlhq/portfolio/pull/28'), '#28');
  assert.equal(githubRef('https://github.com/mctlhq/portfolio/issues/7'), '#7');
  assert.equal(githubRef('https://github.com/mctlhq/portfolio'), 'https://github.com/mctlhq/portfolio');
});

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

test('formatStamp renders a UTC wall clock with an unpadded day and padded hour/minute, in the supplied language', () => {
  assert.equal(formatStamp('2026-09-11T05:20:48Z', MONTHS_EN), '11 Sep, 05:20 UTC');
  assert.equal(formatStamp('2026-09-11T05:20:48Z', MONTHS_RU), '11 сен, 05:20 UTC');
});

test('formatStamp gives the same output for a Date and its ISO string', () => {
  const date = new Date('2026-09-11T05:20:48Z');
  assert.equal(formatStamp(date, MONTHS_EN), formatStamp(date.toISOString(), MONTHS_EN));
});

test('formatStamp renders the UTC wall clock, not the offset one, for a non-Z offset timestamp', () => {
  // 2026-09-11T05:20:48+02:00 is 2026-09-11T03:20:48Z.
  assert.equal(formatStamp('2026-09-11T05:20:48+02:00', MONTHS_EN), '11 Sep, 03:20 UTC');
});

test('formatInterval renders hours-and-minutes, minutes-only, a zero gap, and a gap over 24 hours in whole hours', () => {
  assert.equal(
    formatInterval('2026-09-11T00:00:00Z', '2026-09-11T06:32:00Z', { hour: 'h', minute: 'min' }),
    '+6 h 32 min',
  );
  assert.equal(
    formatInterval('2026-09-11T00:00:00Z', '2026-09-11T06:32:00Z', { hour: 'ч', minute: 'мин' }),
    '+6 ч 32 мин',
  );
  assert.equal(
    formatInterval('2026-09-11T00:00:00Z', '2026-09-11T00:44:00Z', { hour: 'h', minute: 'min' }),
    '+44 min',
  );
  assert.equal(
    formatInterval('2026-09-11T00:00:00Z', '2026-09-11T00:00:00Z', { hour: 'h', minute: 'min' }),
    '+0 min',
  );
  assert.equal(
    formatInterval('2026-09-10T00:00:00Z', '2026-09-11T08:09:00Z', { hour: 'h', minute: 'min' }),
    '+32 h 9 min',
  );
});

test('formatInterval and intervalMinutes throw RangeError on a reversed pair', () => {
  assert.throws(
    () => intervalMinutes('2026-09-11T06:00:00Z', '2026-09-11T05:00:00Z'),
    RangeError,
  );
  assert.throws(
    () => formatInterval('2026-09-11T06:00:00Z', '2026-09-11T05:00:00Z', { hour: 'h', minute: 'min' }),
    RangeError,
  );
});
