import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

// T11b/T11c (issue #71, C3): scripts/check-no-metrics.mjs's second,
// independent check over src/content/projects. Spawns a *copy* of the real
// script (its ROOT is derived from import.meta.url, so a copy scopes every
// path it touches to the fixture directory, the same posture
// test/check-dist.test.ts and test/vendor-assets.test.ts already use) rather
// than calling an exported function with a hand-picked directory argument --
// the point of these two tests is to pin which directories the real gate
// reads and which part of a file it reads, not just that a matcher can
// recognize a semver-shaped string.

// SCAN_DIRS/ALLOW in scripts/check-no-metrics.mjs are untouched by this
// cycle and reference two real files by relative path (src/components/
// CycleDiagram.astro, src/layouts/Base.astro); a fixture tree that lacks
// them would report those ALLOW entries "stale" and pollute stderr with
// noise unrelated to the project-content check under test here, so both are
// copied in alongside the script to keep the fixture's SCAN_DIRS/ALLOW halt
// clean.
async function makeCheckNoMetricsScriptCopy(): Promise<string> {
  const root = await mkdtemp(path.join(FIXTURE_ROOT_BASE, 'check-no-metrics-content-'));
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await cp(
    fileURLToPath(new URL('../scripts/check-no-metrics.mjs', import.meta.url)),
    path.join(root, 'scripts/check-no-metrics.mjs'),
  );
  await mkdir(path.join(root, 'src/components'), { recursive: true });
  await cp(
    fileURLToPath(new URL('../src/components/CycleDiagram.astro', import.meta.url)),
    path.join(root, 'src/components/CycleDiagram.astro'),
  );
  await mkdir(path.join(root, 'src/layouts'), { recursive: true });
  await cp(
    fileURLToPath(new URL('../src/layouts/Base.astro', import.meta.url)),
    path.join(root, 'src/layouts/Base.astro'),
  );
  await cp(
    fileURLToPath(new URL('../src/components/ThemeToggle.astro', import.meta.url)),
    path.join(root, 'src/components/ThemeToggle.astro'),
  );
  return root;
}

function runCheckNoMetrics(root: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', [path.join(root, 'scripts/check-no-metrics.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

test('T11b: the project-content version check reads src/content/projects bodies only -- not journal, not adr, not frontmatter', async () => {
  const root = await makeCheckNoMetricsScriptCopy();
  try {
    await mkdir(path.join(root, 'src/content/projects'), { recursive: true });
    await mkdir(path.join(root, 'src/content/journal'), { recursive: true });
    await mkdir(path.join(root, 'src/content/adr'), { recursive: true });
    await writeFile(
      path.join(root, 'src/content/projects/fixture.en.md'),
      ['---', 'order: 12', '---', '', '- this project ships version 9.9.9', ''].join('\n'),
      'utf8',
    );
    await writeFile(
      path.join(root, 'src/content/journal/2026-09-12-fixture.md'),
      ['---', 'order: 12', '---', '', '- released version 9.9.9', ''].join('\n'),
      'utf8',
    );
    await writeFile(
      path.join(root, 'src/content/adr/0001-fixture.md'),
      ['---', 'order: 12', '---', '', '- decided version 9.9.9', ''].join('\n'),
      'utf8',
    );

    const result = runCheckNoMetrics(root);
    assert.notEqual(result.status, 0, `expected a non-zero exit; stdout: ${result.stdout}`);
    assert.match(
      result.stderr,
      /check-no-metrics: src\/content\/projects\/fixture\.en\.md:5: matched version-shaped literal "9\.9\.9"/,
    );
    assert.doesNotMatch(result.stderr, /journal.*9\.9\.9/);
    assert.doesNotMatch(result.stderr, /adr.*9\.9\.9/);
    // The frontmatter's `order: 12` is on line 2, before the body starts;
    // it must never be named by a version-shaped-literal problem line.
    assert.doesNotMatch(result.stderr, /fixture\.en\.md:2:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function makeProjectsTreeCopy(): Promise<string> {
  const root = await makeCheckNoMetricsScriptCopy();
  await cp(
    fileURLToPath(new URL('../src/content/projects', import.meta.url)),
    path.join(root, 'src/content/projects'),
    { recursive: true },
  );
  return root;
}

test('T11c: control -- the committed src/content/projects tree ("60 seconds", "15-minute" prose and every order: value) is clean', async () => {
  const root = await makeProjectsTreeCopy();
  try {
    const result = runCheckNoMetrics(root);
    assert.equal(result.status, 0, `expected exit 0; stderr: ${result.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('T11c: mutant -- writing "version 0.5.0" back into mctl-design.en.md is reported naming file and line; removing it is clean again', async () => {
  const root = await makeProjectsTreeCopy();
  try {
    const filePath = path.join(root, 'src/content/projects/mctl-design.en.md');
    const original = await readFile(filePath, 'utf8');
    assert.doesNotMatch(original, /0\.5\.0/, 'fixture must start from the already-fixed copy');
    const mutated = original.replace(
      '- this site vendors the design system',
      '- this site vendors version 0.5.0',
    );
    assert.notEqual(mutated, original, 'expected the replacement to actually change the file');
    await writeFile(filePath, mutated, 'utf8');

    const mutatedResult = runCheckNoMetrics(root);
    assert.notEqual(mutatedResult.status, 0, `expected a non-zero exit; stdout: ${mutatedResult.stdout}`);
    assert.match(
      mutatedResult.stderr,
      /check-no-metrics: src\/content\/projects\/mctl-design\.en\.md:\d+: matched version-shaped literal "0\.5\.0"/,
    );

    await writeFile(filePath, original, 'utf8');
    const cleanResult = runCheckNoMetrics(root);
    assert.equal(cleanResult.status, 0, `expected exit 0 after removing the mutation; stderr: ${cleanResult.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
