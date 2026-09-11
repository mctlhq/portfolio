import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildMetrics } from '../scripts/snapshot-metrics.mjs';
import { metricProblems } from '../src/lib/metrics.ts';
import { scanForTypedNumbers, RULES } from '../scripts/check-no-metrics.mjs';

const GITHUB_METHOD =
  'gh api: repos of org mctlhq plus mashkoffdmitry/pelican-libertex-social; commits and releases per repository via the REST API';
const MCTL_METHOD =
  'mctl_list_services via api.mctl.ai and count of platform-gitops/agents-state/*/proposals directories in mctlhq/mctl-gitops';

function fixtureInputs() {
  return {
    github: {
      perRepo: {
        'mctlhq/mctl-api': {
          commits: 42,
          releases: 3,
          first_commit_at: '2026-01-05T00:00:00Z',
          last_commit_at: '2026-09-10T00:00:00Z',
        },
        'mctlhq/mctl-agents': {
          commits: 17,
          releases: 1,
          first_commit_at: '2026-02-01T00:00:00Z',
          last_commit_at: '2026-09-01T00:00:00Z',
        },
      },
    },
    mctl: { devloopProposals: 9, services: 24 },
    previous: {
      generated_at: '2026-09-01T00:00:00Z',
      sources: {
        github: { collected_at: null, method: 'placeholder', repos: null, commits: null, releases: null, per_repo: {} },
        mctl: { collected_at: null, method: 'placeholder', services: 20, devloop_proposals: null, stale: true },
      },
    },
  };
}

// T1: determinism -- two calls with the same fixture and two different
// `now` values produce results that differ only in the three timestamp
// fields.
test('buildMetrics is deterministic across two `now` values, except the three timestamps', () => {
  const inputs = fixtureInputs();
  const a = buildMetrics(inputs, new Date('2026-09-11T12:00:00Z'));
  const b = buildMetrics(inputs, new Date('2026-09-11T12:05:30Z'));

  delete (a as Record<string, unknown>).generated_at;
  delete (b as Record<string, unknown>).generated_at;
  delete (a.sources.github as Record<string, unknown>).collected_at;
  delete (b.sources.github as Record<string, unknown>).collected_at;
  delete (a.sources.mctl as Record<string, unknown>).collected_at;
  delete (b.sources.mctl as Record<string, unknown>).collected_at;

  assert.deepEqual(a, b);
});

// T2: carry-forward -- MCTL_TOKEN-absent case (mctl.services undefined)
// carries the previous services value forward and marks the source stale;
// a collected value is used as-is and marked not stale.
test('buildMetrics carries sources.mctl.services forward and sets stale when services is not collected', () => {
  const inputs = fixtureInputs();
  inputs.mctl = { devloopProposals: 9, services: undefined };
  const result = buildMetrics(inputs, new Date('2026-09-11T12:00:00Z'));
  assert.equal(result.sources.mctl.services, 20);
  assert.equal(result.sources.mctl.stale, true);
});

test('buildMetrics uses the collected services value and clears stale when services is collected', () => {
  const inputs = fixtureInputs();
  const result = buildMetrics(inputs, new Date('2026-09-11T12:00:00Z'));
  assert.equal(result.sources.mctl.services, 24);
  assert.equal(result.sources.mctl.stale, false);
});

// T3: shape and provenance.
test('buildMetrics output passes metricProblems, carries the exact method strings, sums totals from per_repo, and sorts per_repo keys', () => {
  const inputs = fixtureInputs();
  const result = buildMetrics(inputs, new Date('2026-09-11T12:00:00Z'));

  assert.deepEqual(metricProblems(result), []);
  assert.equal(result.sources.github.method, GITHUB_METHOD);
  assert.equal(result.sources.mctl.method, MCTL_METHOD);
  assert.ok(result.sources.github.collected_at);
  assert.ok(result.sources.mctl.collected_at);
  assert.equal(result.sources.github.commits, 42 + 17);
  assert.equal(result.sources.github.releases, 3 + 1);
  assert.deepEqual(Object.keys(result.sources.github.per_repo), ['mctlhq/mctl-agents', 'mctlhq/mctl-api']);
});

// T8: self-check of the gate.
const FIXTURE_ROOT_BASE = tmpdir();

async function withFixtureTree(files: Record<string, string>, run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(FIXTURE_ROOT_BASE, 'check-no-metrics-'));
  try {
    for (const [relPath, content] of Object.entries(files)) {
      const abs = path.join(root, relPath);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, 'utf8');
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('check-no-metrics permits an ISO date and rejects a bare unclassified number, naming file/line/text', async () => {
  await withFixtureTree(
    {
      'src/pages/fixture.astro': [
        '---',
        '// Published 2026-09-11.',
        'const bogus = 12345;',
        '---',
      ].join('\n'),
    },
    async (root) => {
      const { problems } = await scanForTypedNumbers(root, ['src/pages'], RULES, []);
      assert.equal(problems.length, 1);
      assert.match(problems[0], /fixture\.astro:3/);
      assert.match(problems[0], /12345/);
    },
  );
});

test('check-no-metrics fails on a stale ALLOW entry whose value matches nothing', async () => {
  await withFixtureTree(
    {
      'src/pages/fixture.astro': ['---', 'const ok = 42;', '---'].join('\n'),
    },
    async (root) => {
      const staleAllow = [
        {
          file: 'src/pages/fixture.astro',
          values: [42, 999],
          reason: 'fixture: 999 never appears, exercising the stale-allowance failure',
        },
      ];
      const { problems } = await scanForTypedNumbers(root, ['src/pages'], RULES, staleAllow);
      assert.ok(
        problems.some((p) => p.includes('stale ALLOW entry') && p.includes('999')),
        `expected a stale-allowance problem naming 999, got: ${JSON.stringify(problems)}`,
      );
    },
  );
});
