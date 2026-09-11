import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatStat, metricProblems, repoKey, repoMetrics, snapshotDate, type Metrics } from '../src/lib/metrics.ts';

const METRICS_PATH = fileURLToPath(new URL('../src/data/metrics.json', import.meta.url));

test('metricProblems returns [] for the real src/data/metrics.json', () => {
  const raw = JSON.parse(readFileSync(METRICS_PATH, 'utf8'));
  assert.deepEqual(metricProblems(raw), []);
});

function baseMetrics() {
  return {
    generated_at: null,
    sources: {
      github: {
        collected_at: null,
        method: 'placeholder',
        repos: null,
        commits: null,
        releases: null,
        per_repo: {},
      },
      mctl: { collected_at: null, method: 'placeholder', services: null, devloop_proposals: null, stale: false },
    },
  };
}

test('metricProblems reports a missing sources.mctl key', () => {
  const metrics = baseMetrics() as Record<string, unknown>;
  delete (metrics.sources as Record<string, unknown>).mctl;
  const problems = metricProblems(metrics);
  assert.ok(problems.some((p) => p.includes('sources.mctl') && p.includes('missing')));
});

test('metricProblems reports a negative metric value', () => {
  const metrics = baseMetrics();
  metrics.sources.github.repos = -1;
  const problems = metricProblems(metrics);
  assert.ok(problems.some((p) => p.includes('sources.github.repos')));
});

test('metricProblems reports a float metric value', () => {
  const metrics = baseMetrics();
  metrics.sources.github.commits = 1.5;
  const problems = metricProblems(metrics);
  assert.ok(problems.some((p) => p.includes('sources.github.commits')));
});

test('metricProblems reports a string where a number belongs', () => {
  const metrics = baseMetrics() as unknown as { sources: { github: Record<string, unknown> } };
  metrics.sources.github.releases = '12';
  const problems = metricProblems(metrics);
  assert.ok(problems.some((p) => p.includes('sources.github.releases')));
});

test('metricProblems reports an empty method string', () => {
  const metrics = baseMetrics();
  metrics.sources.github.method = '';
  const problems = metricProblems(metrics);
  assert.ok(problems.some((p) => p.includes('sources.github.method')));
});

test('metricProblems reports an unparseable generated_at', () => {
  const metrics = baseMetrics() as unknown as { generated_at: unknown };
  metrics.generated_at = 'not-a-timestamp';
  const problems = metricProblems(metrics);
  assert.ok(problems.some((p) => p.includes('generated_at')));
});

test('formatStat renders the em dash for null and branches on null, not falsiness', () => {
  assert.equal(formatStat(null), '—');
  assert.equal(formatStat(0), '0');
  assert.equal(formatStat(42), '42');
});

test('snapshotDate renders the em dash for null and the calendar date otherwise', () => {
  assert.equal(snapshotDate(null), '—');
  assert.equal(snapshotDate('2026-09-11T01:42:36Z'), '2026-09-11');
});

test('metricProblems reports a per_repo entry with a negative commits value', () => {
  const metrics = baseMetrics() as unknown as { sources: { github: Record<string, unknown> } };
  (metrics.sources.github.per_repo as Record<string, unknown>)['mctlhq/mctl-api'] = {
    commits: -1,
    releases: 0,
    first_commit_at: null,
    last_commit_at: null,
  };
  const problems = metricProblems(metrics);
  assert.ok(problems.some((p) => p.includes('sources.github.per_repo["mctlhq/mctl-api"].commits')));
});

test('metricProblems reports a per_repo entry with a float releases value', () => {
  const metrics = baseMetrics() as unknown as { sources: { github: Record<string, unknown> } };
  (metrics.sources.github.per_repo as Record<string, unknown>)['mctlhq/mctl-api'] = {
    commits: 0,
    releases: 1.5,
    first_commit_at: null,
    last_commit_at: null,
  };
  const problems = metricProblems(metrics);
  assert.ok(problems.some((p) => p.includes('sources.github.per_repo["mctlhq/mctl-api"].releases')));
});

test('metricProblems reports a per_repo entry with an unparseable first_commit_at', () => {
  const metrics = baseMetrics() as unknown as { sources: { github: Record<string, unknown> } };
  (metrics.sources.github.per_repo as Record<string, unknown>)['mctlhq/mctl-api'] = {
    commits: 0,
    releases: 0,
    first_commit_at: 'not-a-timestamp',
    last_commit_at: null,
  };
  const problems = metricProblems(metrics);
  assert.ok(
    problems.some((p) => p.includes('sources.github.per_repo["mctlhq/mctl-api"].first_commit_at')),
  );
});

test('metricProblems reports a non-boolean sources.mctl.stale', () => {
  const metrics = baseMetrics() as unknown as { sources: { mctl: Record<string, unknown> } };
  metrics.sources.mctl.stale = 'true';
  const problems = metricProblems(metrics);
  assert.ok(problems.some((p) => p.includes('sources.mctl.stale')));
});

test('repoKey converts a github.com repo URL to owner/name, tolerates a trailing slash, and returns null otherwise', () => {
  assert.equal(repoKey('https://github.com/mctlhq/mctl-api'), 'mctlhq/mctl-api');
  assert.equal(repoKey('https://github.com/mctlhq/mctl-api/'), 'mctlhq/mctl-api');
  assert.equal(repoKey(undefined), null);
  assert.equal(repoKey('https://example.com/mctlhq/mctl-api'), null);
});

test('repoMetrics returns the matching entry for a known key and an all-null entry otherwise', () => {
  const metrics: Metrics = {
    generated_at: '2026-09-11T00:00:00Z',
    sources: {
      github: {
        collected_at: '2026-09-11T00:00:00Z',
        method: 'x',
        repos: 1,
        commits: 5,
        releases: 2,
        per_repo: {
          'mctlhq/mctl-api': {
            commits: 5,
            releases: 2,
            first_commit_at: '2026-01-01T00:00:00Z',
            last_commit_at: '2026-09-01T00:00:00Z',
          },
        },
      },
      mctl: { collected_at: '2026-09-11T00:00:00Z', method: 'y', services: 1, devloop_proposals: 1, stale: false },
    },
  };

  assert.deepEqual(repoMetrics(metrics, 'https://github.com/mctlhq/mctl-api'), {
    commits: 5,
    releases: 2,
    first_commit_at: '2026-01-01T00:00:00Z',
    last_commit_at: '2026-09-01T00:00:00Z',
  });
  assert.deepEqual(repoMetrics(metrics, undefined), {
    commits: null,
    releases: null,
    first_commit_at: null,
    last_commit_at: null,
  });
  assert.deepEqual(repoMetrics(metrics, 'https://github.com/mctlhq/unknown-repo'), {
    commits: null,
    releases: null,
    first_commit_at: null,
    last_commit_at: null,
  });

  const noPerRepo: Metrics = {
    generated_at: null,
    sources: {
      github: { collected_at: null, method: 'x', repos: null, commits: null, releases: null, per_repo: {} },
      mctl: { collected_at: null, method: 'y', services: null, devloop_proposals: null, stale: false },
    },
  };
  assert.deepEqual(repoMetrics(noPerRepo, 'https://github.com/mctlhq/mctl-api'), {
    commits: null,
    releases: null,
    first_commit_at: null,
    last_commit_at: null,
  });
});
