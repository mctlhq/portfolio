import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatStat, metricProblems, snapshotDate } from '../src/lib/metrics.ts';

const METRICS_PATH = fileURLToPath(new URL('../src/data/metrics.json', import.meta.url));

test('metricProblems returns [] for the real src/data/metrics.json', () => {
  const raw = JSON.parse(readFileSync(METRICS_PATH, 'utf8'));
  assert.deepEqual(metricProblems(raw), []);
});

function baseMetrics() {
  return {
    generated_at: null,
    sources: {
      github: { collected_at: null, method: 'placeholder', repos: null, commits: null, releases: null },
      mctl: { collected_at: null, method: 'placeholder', services: null, devloop_proposals: null },
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
