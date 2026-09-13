// Behaviour tests for the journal lifecycle helpers added in issue #79
// (statusCounts, isComplete, status-aware leadTimeHours,
// journalEntryProblems, checkJournalCollection), plus source-level
// assertions over the committed journal content: every file carries a
// status, every complete entry carries its four evidence fields, at most one
// entry is in_progress, the fourteen backfill rows and two approval stamps
// match verbatim, no deployed_at is invented, and the two cross-repository
// entries keep their existing evidence.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  checkJournalCollection,
  isComplete,
  isRealTimestamp,
  journalEntryProblems,
  leadTimeHours,
  statusCounts,
  statusEvidenceProblems,
  timestampOrderProblems,
} from '../src/lib/journal.ts';

const JOURNAL_DIR = fileURLToPath(new URL('../src/content/journal/', import.meta.url));

// -- statusCounts / isComplete ------------------------------------------------

test('statusCounts returns all-zero keys for an empty input', () => {
  assert.deepEqual(statusCounts([]), { complete: 0, in_progress: 0, abandoned: 0 });
});

test('statusCounts tallies a mix of all three statuses', () => {
  const entries = [
    { status: 'complete' as const },
    { status: 'complete' as const },
    { status: 'in_progress' as const },
    { status: 'abandoned' as const },
  ];
  assert.deepEqual(statusCounts(entries), { complete: 2, in_progress: 1, abandoned: 1 });
});

test('isComplete is true only for status complete', () => {
  assert.equal(isComplete({ status: 'complete' }), true);
  assert.equal(isComplete({ status: 'in_progress' }), false);
  assert.equal(isComplete({ status: 'abandoned' }), false);
});

// -- status-aware leadTimeHours ------------------------------------------------

test('leadTimeHours returns null for in_progress and abandoned entries even when timestamps are present', () => {
  const timestamps = {
    issue_opened_at: '2026-09-10T22:00:00Z',
    released_at: '2026-09-10T23:00:00Z',
    deployed_at: '2026-09-10T23:30:00Z',
  };
  assert.equal(leadTimeHours({ ...timestamps, status: 'in_progress' }), null);
  assert.equal(leadTimeHours({ ...timestamps, status: 'abandoned' }), null);
});

test('leadTimeHours computes the unrounded hours for a complete entry, including exact zero', () => {
  const base = { issue_opened_at: '2026-09-10T22:00:00Z', released_at: '2026-09-10T23:00:00Z', status: 'complete' as const };
  assert.equal(leadTimeHours(base), 1);
  const sameInstant = '2026-09-10T22:00:00Z';
  assert.equal(leadTimeHours({ issue_opened_at: sameInstant, deployed_at: sameInstant, status: 'complete' }), 0);
});

test('leadTimeHours keeps deployed_at-over-released_at precedence for a complete entry', () => {
  const entry = {
    status: 'complete' as const,
    issue_opened_at: '2026-09-10T22:00:00Z',
    released_at: '2026-09-10T23:00:00Z',
    deployed_at: '2026-09-11T00:00:00Z',
  };
  assert.equal(leadTimeHours(entry), 2);
});

test('leadTimeHours still throws RangeError for a complete entry with a reversed pair', () => {
  assert.throws(
    () =>
      leadTimeHours({
        status: 'complete',
        issue_opened_at: '2026-09-10T23:00:00Z',
        deployed_at: '2026-09-10T22:00:00Z',
      }),
    RangeError,
  );
});

// -- isRealTimestamp -----------------------------------------------------------

test('isRealTimestamp accepts a real ISO-with-offset instant and rejects an ISO-shaped non-instant', () => {
  assert.equal(isRealTimestamp('2026-09-10T22:44:09Z'), true);
  assert.equal(isRealTimestamp('2026-02-31T00:00:00Z'), false);
  assert.equal(isRealTimestamp('2026-09-10T22:44:09'), false); // no timezone
  assert.equal(isRealTimestamp('not-a-timestamp'), false);
});

// -- journalEntryProblems / statusEvidenceProblems / timestampOrderProblems ---

const OPENED = '2026-01-01T00:00:00Z';

test('statusEvidenceProblems requires pr, release, merged_at, released_at for a complete entry', () => {
  const problems = statusEvidenceProblems({ status: 'complete', issue_opened_at: OPENED });
  const fields = problems.map((p) => p.field).sort();
  assert.deepEqual(fields, ['merged_at', 'pr', 'release', 'released_at']);
});

test('statusEvidenceProblems accepts a fully evidenced complete entry', () => {
  assert.deepEqual(
    statusEvidenceProblems({
      status: 'complete',
      issue_opened_at: OPENED,
      pr: 'https://github.com/mctlhq/portfolio/pull/1',
      release: '0.1.0',
      merged_at: '2026-01-02T00:00:00Z',
      released_at: '2026-01-03T00:00:00Z',
    }),
    [],
  );
});

test('statusEvidenceProblems forbids release, released_at, deployed_at on an in_progress entry', () => {
  const problems = statusEvidenceProblems({
    status: 'in_progress',
    issue_opened_at: OPENED,
    release: '0.1.0',
    released_at: '2026-01-02T00:00:00Z',
    deployed_at: '2026-01-03T00:00:00Z',
  });
  const fields = problems.map((p) => p.field).sort();
  assert.deepEqual(fields, ['deployed_at', 'release', 'released_at']);
});

test('statusEvidenceProblems permits a known pr and merged_at on an in_progress entry', () => {
  assert.deepEqual(
    statusEvidenceProblems({
      status: 'in_progress',
      issue_opened_at: OPENED,
      pr: 'https://github.com/mctlhq/portfolio/pull/1',
      merged_at: '2026-01-02T00:00:00Z',
    }),
    [],
  );
});

test('statusEvidenceProblems requires abandoned_reason and forbids merge/release evidence on an abandoned entry, while allowing a known pr', () => {
  const problems = statusEvidenceProblems({
    status: 'abandoned',
    issue_opened_at: OPENED,
    merged_at: '2026-01-02T00:00:00Z',
    release: '0.1.0',
    released_at: '2026-01-03T00:00:00Z',
    deployed_at: '2026-01-04T00:00:00Z',
  });
  const fields = problems.map((p) => p.field).sort();
  // merged_at is present with no pr, so "merged_at implies pr" also fires.
  assert.deepEqual(fields, ['abandoned_reason', 'deployed_at', 'merged_at', 'pr', 'release', 'released_at']);

  assert.deepEqual(
    statusEvidenceProblems({
      status: 'abandoned',
      issue_opened_at: OPENED,
      abandoned_reason: { en: 'cancelled', ru: 'отменено' },
      pr: 'https://github.com/mctlhq/portfolio/pull/1',
    }),
    [],
  );
});

test('statusEvidenceProblems: merged_at present implies pr required, regardless of status', () => {
  const problems = statusEvidenceProblems({ status: 'complete', issue_opened_at: OPENED, merged_at: '2026-01-02T00:00:00Z', release: '0.1.0', released_at: '2026-01-03T00:00:00Z' });
  assert.ok(problems.some((p) => p.field === 'pr'));
});

test('statusEvidenceProblems: abandoned_reason present on a non-abandoned entry is rejected', () => {
  const problems = statusEvidenceProblems({
    status: 'in_progress',
    issue_opened_at: OPENED,
    abandoned_reason: { en: 'x', ru: 'y' },
  });
  assert.ok(problems.some((p) => p.field === 'abandoned_reason'));
});

test('timestampOrderProblems accepts equal instants and skips absent stages', () => {
  assert.deepEqual(
    timestampOrderProblems({
      status: 'complete',
      issue_opened_at: OPENED,
      merged_at: OPENED,
      pr: 'https://github.com/mctlhq/portfolio/pull/1',
      release: '0.1.0',
      released_at: OPENED,
    }),
    [],
  );
});

test('timestampOrderProblems reports a reversed pair, naming the later field', () => {
  const problems = timestampOrderProblems({
    status: 'complete',
    issue_opened_at: '2026-01-02T00:00:00Z',
    proposal_approved_at: '2026-01-01T00:00:00Z',
  });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].field, 'proposal_approved_at');
});

test('journalEntryProblems combines status-evidence and timestamp-order problems', () => {
  const problems = journalEntryProblems({
    status: 'complete',
    issue_opened_at: '2026-01-02T00:00:00Z',
    proposal_approved_at: '2026-01-01T00:00:00Z',
  });
  const fields = problems.map((p) => p.field).sort();
  assert.ok(fields.includes('pr'));
  assert.ok(fields.includes('proposal_approved_at'));
});

// -- checkJournalCollection ------------------------------------------------

test('checkJournalCollection accepts zero in_progress entries', () => {
  assert.doesNotThrow(() =>
    checkJournalCollection([
      { id: 'a', data: { status: 'complete' } },
      { id: 'b', data: { status: 'abandoned' } },
    ]),
  );
});

test('checkJournalCollection accepts exactly one in_progress entry', () => {
  assert.doesNotThrow(() =>
    checkJournalCollection([
      { id: 'a', data: { status: 'complete' } },
      { id: 'b', data: { status: 'in_progress' } },
    ]),
  );
});

test('checkJournalCollection throws, naming both ids, for two in_progress entries', () => {
  assert.throws(
    () =>
      checkJournalCollection([
        { id: 'a', data: { status: 'in_progress' } },
        { id: 'b', data: { status: 'in_progress' } },
      ]),
    /Journal validation failed:[\s\S]*a[\s\S]*b/,
  );
});

// -- Source-level content assertions ---------------------------------------

const journalFiles = readdirSync(JOURNAL_DIR).filter((name) => name.endsWith('.md'));

function frontmatterOf(name: string): Record<string, string> {
  const source = readFileSync(`${JOURNAL_DIR}${name}`, 'utf8');
  const match = /^---\n([\s\S]*?)\n---/.exec(source);
  assert.ok(match, `${name}: no frontmatter block`);
  const data: Record<string, string> = {};
  for (const line of match![1].split('\n')) {
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):[ \t]*(.*)$/.exec(line);
    if (!kv || kv[2] === '') continue;
    const value = kv[2].trim();
    const quoted = /^'(.*)'$/.exec(value);
    data[kv[1]] = quoted ? quoted[1] : value;
  }
  return data;
}

test('every journal file carries a status', () => {
  for (const name of journalFiles) {
    const data = frontmatterOf(name);
    assert.ok(data.status, `${name}: missing status`);
    assert.ok(['in_progress', 'complete', 'abandoned'].includes(data.status), `${name}: unexpected status "${data.status}"`);
  }
});

test('every complete entry carries pr, release, merged_at and released_at', () => {
  for (const name of journalFiles) {
    const data = frontmatterOf(name);
    if (data.status !== 'complete') continue;
    for (const field of ['pr', 'release', 'merged_at', 'released_at']) {
      assert.ok(data[field], `${name}: complete entry missing ${field}`);
    }
  }
});

test('at most one journal entry is in_progress -- at this implementation-PR checkpoint, exactly one', () => {
  const inProgress = journalFiles.filter((name) => frontmatterOf(name).status === 'in_progress');
  assert.equal(inProgress.length, 1, `expected exactly one in_progress entry at this checkpoint, got: ${inProgress.join(', ')}`);
});

test('no portfolio journal entry carries a deployed_at (none was collected for the backfill)', () => {
  for (const name of journalFiles) {
    const data = frontmatterOf(name);
    if (data.service === 'portfolio') {
      assert.ok(!data.deployed_at, `${name}: portfolio entry unexpectedly carries deployed_at`);
    }
  }
});

test('the two cross-repository entries keep their deployed_at evidence', () => {
  const mctlApi = frontmatterOf('2026-09-10-add-portfolio-to-the-devloop-service-enums.md');
  const mctlAgents = frontmatterOf('2026-09-10-register-portfolio-as-a-devloop-service.md');
  assert.equal(mctlApi.deployed_at, '2026-09-10T23:28:21Z');
  assert.equal(mctlAgents.deployed_at, '2026-09-10T23:28:11Z');
});

const BACKFILL_ROWS: Array<[string, { pr: string; merged_at: string; release: string; released_at: string }]> = [
  ['2026-09-11-metrics-provenance-and-no-analytics.md', { pr: 'https://github.com/mctlhq/portfolio/pull/36', merged_at: '2026-09-11T12:36:26Z', release: '0.1.7', released_at: '2026-09-11T12:38:49Z' }],
  ['2026-09-11-p8-production-hardening-accessibility-wc.md', { pr: 'https://github.com/mctlhq/portfolio/pull/38', merged_at: '2026-09-11T13:24:25Z', release: '0.1.8', released_at: '2026-09-11T13:26:35Z' }],
  ['2026-09-11-hero-name-in-the-reader-s-script.md', { pr: 'https://github.com/mctlhq/portfolio/pull/40', merged_at: '2026-09-11T14:09:24Z', release: '0.1.9', released_at: '2026-09-11T14:11:40Z' }],
  ['2026-09-11-production-cutover.md', { pr: 'https://github.com/mctlhq/portfolio/pull/43', merged_at: '2026-09-11T17:05:16Z', release: '0.1.10', released_at: '2026-09-11T17:07:39Z' }],
  ['2026-09-11-csp-hash-quoting-and-browser-verified-headers.md', { pr: 'https://github.com/mctlhq/portfolio/pull/51', merged_at: '2026-09-11T21:59:44Z', release: '0.1.11', released_at: '2026-09-11T22:02:01Z' }],
  ['2026-09-12-content-link-contrast-and-an-offline-link-check.md', { pr: 'https://github.com/mctlhq/portfolio/pull/56', merged_at: '2026-09-12T04:10:35Z', release: '0.1.12', released_at: '2026-09-12T04:13:25Z' }],
  ['2026-09-12-repository-links-out-of-the-disclosure.md', { pr: 'https://github.com/mctlhq/portfolio/pull/58', merged_at: '2026-09-12T06:21:10Z', release: '0.1.13', released_at: '2026-09-12T06:23:31Z' }],
  ['2026-09-12-colophon-tables-and-computed-lead-time.md', { pr: 'https://github.com/mctlhq/portfolio/pull/60', merged_at: '2026-09-12T07:00:05Z', release: '0.1.14', released_at: '2026-09-12T07:02:38Z' }],
  ['2026-09-12-navigation-state-and-accessibility-affordances.md', { pr: 'https://github.com/mctlhq/portfolio/pull/62', merged_at: '2026-09-12T07:56:41Z', release: '0.1.15', released_at: '2026-09-12T07:59:14Z' }],
  ['2026-09-12-share-image-font-preload-cache-lifetime.md', { pr: 'https://github.com/mctlhq/portfolio/pull/66', merged_at: '2026-09-12T12:26:11Z', release: '0.1.16', released_at: '2026-09-12T12:28:58Z' }],
  ['2026-09-12-q7-polish-wave-findings.md', { pr: 'https://github.com/mctlhq/portfolio/pull/69', merged_at: '2026-09-12T13:42:40Z', release: '0.1.17', released_at: '2026-09-12T13:45:35Z' }],
  ['2026-09-12-backfilling-five-omitted-journal-entries.md', { pr: 'https://github.com/mctlhq/portfolio/pull/72', merged_at: '2026-09-12T15:51:08Z', release: '0.1.18', released_at: '2026-09-12T15:53:06Z' }],
  ['2026-09-12-q9-six-review-findings.md', { pr: 'https://github.com/mctlhq/portfolio/pull/74', merged_at: '2026-09-12T17:34:48Z', release: '0.1.19', released_at: '2026-09-12T17:37:14Z' }],
  ['2026-09-12-symlink-safe-check-no-metrics-entry-guard.md', { pr: 'https://github.com/mctlhq/portfolio/pull/77', merged_at: '2026-09-12T19:37:37Z', release: '0.1.20', released_at: '2026-09-12T19:40:48Z' }],
];

for (const [name, expected] of BACKFILL_ROWS) {
  test(`${name} carries its backfilled evidence verbatim`, () => {
    const data = frontmatterOf(name);
    assert.equal(data.pr, expected.pr);
    assert.equal(data.merged_at, expected.merged_at);
    assert.equal(data.release, expected.release);
    assert.equal(data.released_at, expected.released_at);
    assert.equal(data.status, 'complete');
  });
}

test('the two missing approval stamps are backfilled verbatim', () => {
  assert.equal(
    frontmatterOf('2026-09-11-metrics-provenance-and-no-analytics.md').proposal_approved_at,
    '2026-09-11T11:15:37Z',
  );
  assert.equal(
    frontmatterOf('2026-09-12-symlink-safe-check-no-metrics-entry-guard.md').proposal_approved_at,
    '2026-09-12T19:03:02Z',
  );
});

test("this cycle's own entry is in_progress with no invented evidence", () => {
  const data = frontmatterOf('2026-09-13-journal-lifecycle-and-release-closure.md');
  assert.equal(data.status, 'in_progress');
  assert.equal(data.pr, undefined);
  assert.equal(data.release, undefined);
  assert.equal(data.merged_at, undefined);
  assert.equal(data.released_at, undefined);
  assert.equal(data.deployed_at, undefined);
});
