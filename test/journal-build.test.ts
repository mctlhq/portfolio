// Isolated Astro builds over fixture content trees, proving the real
// journal schema and journalLoader() wiring -- not just the pure helpers in
// src/lib/journal.ts. Each fixture tree is a full copy of the committed
// src/ (so the projects and adr collections stay valid and every page keeps
// its real imports), with src/content/journal replaced by the fixture set
// under test. node_modules and public/ are symlinked rather than copied.
//
// `astro sync` runs the content loaders and schema (proven by the plain
// schema/loader cases below: a violation there throws before any page is
// ever rendered), so the fast schema/loader cases use it; the markup case
// needs actual output and uses `astro build`. Neither is invoked through
// `npm run build` -- that recurses through `prebuild` -- these spawn the
// astro CLI directly, per the issue's constraint on npm test.

import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const ASTRO_BIN = path.join(ROOT, 'node_modules/astro/bin/astro.mjs');

/** Copies the committed src/ tree into a fresh mkdtemp directory, replaces
 * src/content/journal with `journalFiles` (name -> content; an empty object
 * builds a journal directory with zero entries), and symlinks node_modules
 * and public/ from the real repository so nothing is duplicated. Also
 * copies astro.config.mjs and package.json, which astro's own tooling reads. */
async function makeFixtureTree(
  journalFiles: Record<string, string>,
  opts: { contentConfigOverride?: string } = {},
): Promise<string> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'journal-build-test-'));
  await cp(path.join(ROOT, 'src'), path.join(tmp, 'src'), { recursive: true });
  await rm(path.join(tmp, 'src/content/journal'), { recursive: true, force: true });
  await mkdir(path.join(tmp, 'src/content/journal'), { recursive: true });
  for (const [name, content] of Object.entries(journalFiles)) {
    await writeFile(path.join(tmp, 'src/content/journal', name), content, 'utf8');
  }
  if (opts.contentConfigOverride) {
    await writeFile(path.join(tmp, 'src/content.config.ts'), opts.contentConfigOverride, 'utf8');
  }
  await cp(path.join(ROOT, 'astro.config.mjs'), path.join(tmp, 'astro.config.mjs'));
  await cp(path.join(ROOT, 'package.json'), path.join(tmp, 'package.json'));
  await cp(path.join(ROOT, 'tsconfig.json'), path.join(tmp, 'tsconfig.json'));
  await symlink(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  await symlink(path.join(ROOT, 'public'), path.join(tmp, 'public'));
  return tmp;
}

function runAstro(tmp: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', [ASTRO_BIN, ...args], { cwd: tmp, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

async function cleanup(tmp: string): Promise<void> {
  await rm(tmp, { recursive: true, force: true });
}

const BASE = {
  service: 'portfolio',
  issue: 'https://github.com/mctlhq/portfolio/issues/1',
  proposal_slug: 'issue-1-example',
  visibility: 'public',
};

/** Renders one journal fixture file's frontmatter from a flat set of
 * lines, always closing with the bilingual title/decided block and an
 * empty interventions array -- kept separate from the lifecycle fields
 * under test so every fixture stays otherwise minimal and valid. */
function entry(lines: string[]): string {
  return [
    '---',
    ...lines,
    'title:',
    '  en: "Example"',
    '  ru: "Пример"',
    'decided:',
    '  en: "Something."',
    '  ru: "Что-то."',
    'interventions: []',
    '---',
    '',
  ].join('\n');
}

function baseLines(overrides: Partial<typeof BASE> = {}): string[] {
  const merged = { ...BASE, ...overrides };
  return Object.entries(merged).map(([k, v]) => `${k}: ${v}`);
}

// -- T3: schema enforcement (astro sync) -------------------------------------

test('valid in_progress, complete and abandoned fixtures all pass astro sync', async () => {
  const tmp = await makeFixtureTree({
    '2026-01-01-a.md': entry([...baseLines(), 'status: in_progress', "issue_opened_at: '2026-01-01T00:00:00Z'"]),
    '2026-01-02-b.md': entry([
      ...baseLines({ issue: 'https://github.com/mctlhq/portfolio/issues/2', proposal_slug: 'issue-2-example' }),
      'status: complete',
      'pr: https://github.com/mctlhq/portfolio/pull/2',
      'release: 0.1.0',
      "issue_opened_at: '2026-01-01T00:00:00Z'",
      "merged_at: '2026-01-02T00:00:00Z'",
      "released_at: '2026-01-03T00:00:00Z'",
    ]),
    '2026-01-03-c.md': entry([
      ...baseLines({ issue: 'https://github.com/mctlhq/portfolio/issues/3', proposal_slug: 'issue-3-example' }),
      'status: abandoned',
      "issue_opened_at: '2026-01-01T00:00:00Z'",
      'abandoned_reason:',
      '  en: "Cancelled."',
      '  ru: "Отменено."',
    ]),
  });
  try {
    const result = runAstro(tmp, ['sync']);
    assert.equal(result.status, 0, `expected sync to pass, stderr: ${result.stderr}`);
  } finally {
    await cleanup(tmp);
  }
});

interface SchemaCase {
  name: string;
  lines: string[];
  expectField: string;
}

const SCHEMA_CASES: SchemaCase[] = [
  {
    name: 'complete entry missing pr',
    lines: [...baseLines(), 'status: complete', 'release: 0.1.0', "issue_opened_at: '2026-01-01T00:00:00Z'", "merged_at: '2026-01-02T00:00:00Z'", "released_at: '2026-01-03T00:00:00Z'"],
    expectField: 'pr',
  },
  {
    name: 'complete entry missing release',
    lines: [...baseLines(), 'status: complete', 'pr: https://github.com/mctlhq/portfolio/pull/1', "issue_opened_at: '2026-01-01T00:00:00Z'", "merged_at: '2026-01-02T00:00:00Z'", "released_at: '2026-01-03T00:00:00Z'"],
    expectField: 'release',
  },
  {
    name: 'complete entry missing merged_at',
    lines: [...baseLines(), 'status: complete', 'pr: https://github.com/mctlhq/portfolio/pull/1', 'release: 0.1.0', "issue_opened_at: '2026-01-01T00:00:00Z'", "released_at: '2026-01-03T00:00:00Z'"],
    expectField: 'merged_at',
  },
  {
    name: 'complete entry missing released_at',
    lines: [...baseLines(), 'status: complete', 'pr: https://github.com/mctlhq/portfolio/pull/1', 'release: 0.1.0', "issue_opened_at: '2026-01-01T00:00:00Z'", "merged_at: '2026-01-02T00:00:00Z'"],
    expectField: 'released_at',
  },
  {
    name: 'in_progress entry forbidding release',
    lines: [...baseLines(), 'status: in_progress', 'release: 0.1.0', "issue_opened_at: '2026-01-01T00:00:00Z'"],
    expectField: 'release',
  },
  {
    name: 'in_progress entry forbidding deployed_at',
    lines: [...baseLines(), 'status: in_progress', "issue_opened_at: '2026-01-01T00:00:00Z'", "deployed_at: '2026-01-02T00:00:00Z'"],
    expectField: 'deployed_at',
  },
  {
    name: 'abandoned entry missing abandoned_reason',
    lines: [...baseLines(), 'status: abandoned', "issue_opened_at: '2026-01-01T00:00:00Z'"],
    expectField: 'abandoned_reason',
  },
  {
    name: 'abandoned entry forbidding merged_at',
    lines: [
      ...baseLines(),
      'status: abandoned',
      "issue_opened_at: '2026-01-01T00:00:00Z'",
      "merged_at: '2026-01-02T00:00:00Z'",
      'abandoned_reason:',
      '  en: "Cancelled."',
      '  ru: "Отменено."',
    ],
    expectField: 'merged_at',
  },
  {
    name: 'whitespace-only abandonment reason',
    lines: [
      ...baseLines(),
      'status: abandoned',
      "issue_opened_at: '2026-01-01T00:00:00Z'",
      'abandoned_reason:',
      '  en: "   "',
      '  ru: "Отменено."',
    ],
    expectField: 'abandoned_reason',
  },
  {
    name: 'an ISO-shaped but unreal date',
    lines: [...baseLines(), 'status: in_progress', "issue_opened_at: '2026-02-31T00:00:00Z'"],
    expectField: 'issue_opened_at',
  },
  {
    name: 'a reversed lifecycle timestamp pair',
    lines: [...baseLines(), 'status: in_progress', "issue_opened_at: '2026-01-02T00:00:00Z'", "proposal_approved_at: '2026-01-01T00:00:00Z'"],
    expectField: 'proposal_approved_at',
  },
];

for (const testCase of SCHEMA_CASES) {
  test(`astro sync rejects: ${testCase.name}, naming the offending field`, async () => {
    const tmp = await makeFixtureTree({ '2026-01-01-a.md': entry(testCase.lines) });
    try {
      const result = runAstro(tmp, ['sync']);
      assert.notEqual(result.status, 0, `expected sync to fail for ${testCase.name}`);
      const output = result.stdout + result.stderr;
      assert.match(output, /InvalidContentEntryDataError|does not match collection schema/);
      assert.match(output, new RegExp(testCase.expectField), `expected the diagnostic to name "${testCase.expectField}": ${output}`);
    } finally {
      await cleanup(tmp);
    }
  });
}

// -- T4: journalLoader's collection-wide guard -------------------------------

function inProgressEntry(issueNum: number, slug: string, visibility = 'public'): string {
  return entry([
    ...baseLines({ issue: `https://github.com/mctlhq/portfolio/issues/${issueNum}`, proposal_slug: slug, visibility }),
    'status: in_progress',
    "issue_opened_at: '2026-01-01T00:00:00Z'",
  ]);
}

test('astro sync fails when two entries are in_progress, including a public/private pair', async () => {
  const tmp = await makeFixtureTree({
    '2026-01-01-a.md': inProgressEntry(1, 'issue-1-example', 'public'),
    '2026-01-02-b.md': inProgressEntry(2, 'issue-2-example', 'private'),
  });
  try {
    const result = runAstro(tmp, ['sync']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /Journal validation failed/);
  } finally {
    await cleanup(tmp);
  }
});

test('astro sync passes with zero in_progress entries', async () => {
  const tmp = await makeFixtureTree({
    '2026-01-01-a.md': entry([
      ...baseLines(),
      'status: complete',
      'pr: https://github.com/mctlhq/portfolio/pull/1',
      'release: 0.1.0',
      "issue_opened_at: '2026-01-01T00:00:00Z'",
      "merged_at: '2026-01-02T00:00:00Z'",
      "released_at: '2026-01-03T00:00:00Z'",
    ]),
  });
  try {
    const result = runAstro(tmp, ['sync']);
    assert.equal(result.status, 0, `expected sync to pass, stderr: ${result.stderr}`);
  } finally {
    await cleanup(tmp);
  }
});

test('astro sync passes with exactly one in_progress entry, even when it belongs to an older backlog issue than a completed entry', async () => {
  const tmp = await makeFixtureTree({
    '2026-01-05-newer.md': entry([
      ...baseLines({ issue: 'https://github.com/mctlhq/portfolio/issues/65', proposal_slug: 'issue-65-newer' }),
      'status: complete',
      'pr: https://github.com/mctlhq/portfolio/pull/65',
      'release: 0.1.0',
      "issue_opened_at: '2026-01-04T00:00:00Z'", // newer issue, ran first
      "merged_at: '2026-01-05T00:00:00Z'",
      "released_at: '2026-01-05T01:00:00Z'",
    ]),
    '2026-01-06-older.md': inProgressEntry(52, 'issue-52-older'), // older backlog issue, runs later
  });
  try {
    const result = runAstro(tmp, ['sync']);
    assert.equal(result.status, 0, `expected sync to pass, stderr: ${result.stderr}`);
  } finally {
    await cleanup(tmp);
  }
});

test('mutant: removing journalLoader\'s collection guard call lets the two-in_progress fixture build, proving the guard is what fails the negative case above', async () => {
  const realConfig = await readFile(path.join(ROOT, 'src/content.config.ts'), 'utf8');
  assert.match(realConfig, /checkJournalCollection\(/, 'expected the real content.config.ts to call checkJournalCollection');
  const mutated = realConfig.replace(
    /checkJournalCollection\(\n[\s\S]*?\n {6}\);\n/,
    '// checkJournalCollection call removed by test/journal-build.test.ts mutation\n',
  );
  assert.notEqual(mutated, realConfig, 'expected the mutation to actually remove the checkJournalCollection call');

  const tmp = await makeFixtureTree(
    {
      '2026-01-01-a.md': inProgressEntry(1, 'issue-1-example', 'public'),
      '2026-01-02-b.md': inProgressEntry(2, 'issue-2-example', 'private'),
    },
    { contentConfigOverride: mutated },
  );
  try {
    const result = runAstro(tmp, ['sync']);
    assert.equal(result.status, 0, `expected sync to pass once the guard is removed, stderr: ${result.stderr}`);
  } finally {
    await cleanup(tmp);
  }
});

// -- T5: markup ----------------------------------------------------------------

test('a mixed fixture (complete, in_progress, abandoned, private) builds markup with the five totals, status labels, the Status column/row, and the right lead-time explanations', async () => {
  const tmp = await makeFixtureTree({
    '2026-01-01-complete.md': entry([
      ...baseLines({ issue: 'https://github.com/mctlhq/portfolio/issues/1', proposal_slug: 'issue-1-complete' }),
      'status: complete',
      'pr: https://github.com/mctlhq/portfolio/pull/1',
      'release: 0.1.0',
      "issue_opened_at: '2026-01-01T00:00:00Z'",
      "merged_at: '2026-01-01T01:00:00Z'",
      "released_at: '2026-01-01T02:00:00Z'",
    ]),
    '2026-01-02-in-progress.md': entry([
      ...baseLines({ issue: 'https://github.com/mctlhq/portfolio/issues/2', proposal_slug: 'issue-2-in-progress' }),
      'status: in_progress',
      'pr: https://github.com/mctlhq/portfolio/pull/2',
      "issue_opened_at: '2026-01-02T00:00:00Z'",
      "merged_at: '2026-01-02T01:00:00Z'",
    ]),
    '2026-01-03-abandoned.md': entry([
      ...baseLines({ issue: 'https://github.com/mctlhq/portfolio/issues/3', proposal_slug: 'issue-3-abandoned' }),
      'status: abandoned',
      "issue_opened_at: '2026-01-03T00:00:00Z'",
      'abandoned_reason:',
      '  en: "Cancelled for this test."',
      '  ru: "Отменено для этого теста."',
    ]),
    '2026-01-04-private.md': entry([
      ...baseLines({ issue: 'https://github.com/mctlhq/portfolio/issues/4', proposal_slug: 'issue-4-private', visibility: 'private' }),
      'status: complete',
      'pr: https://github.com/mctlhq/portfolio/pull/4',
      'release: 0.1.1',
      "issue_opened_at: '2026-01-04T00:00:00Z'",
      "merged_at: '2026-01-04T01:00:00Z'",
      "released_at: '2026-01-04T02:00:00Z'",
    ]),
  });
  try {
    const buildResult = runAstro(tmp, ['build']);
    assert.equal(buildResult.status, 0, `expected build to pass, stderr: ${buildResult.stderr}`);

    const indexHtml = await readFile(path.join(tmp, 'dist/colophon/index.html'), 'utf8');
    assert.match(indexHtml, /data-cycle-count="3"/); // only the three public entries
    assert.match(indexHtml, /data-complete-count="1"/);
    assert.match(indexHtml, /data-in-progress-count="1"/);
    assert.match(indexHtml, /data-abandoned-count="1"/);
    assert.match(indexHtml, /data-intervention-count="0"/);
    assert.match(indexHtml, /complete/);
    assert.match(indexHtml, /in progress/);
    assert.match(indexHtml, /abandoned/);
    assert.doesNotMatch(indexHtml, /issue-4-private/);

    const cycleTableHtml = indexHtml;
    assert.match(cycleTableHtml, /<th scope="col">.*Status/);

    const completeSlug = '2026-01-01-complete';
    const inProgressSlug = '2026-01-02-in-progress';
    const abandonedSlug = '2026-01-03-abandoned';

    const completeDetail = await readFile(path.join(tmp, `dist/colophon/journal/${completeSlug}/index.html`), 'utf8');
    assert.match(completeDetail, /journal-meta">.*?<dt>.*?Status/s);

    const inProgressDetail = await readFile(path.join(tmp, `dist/colophon/journal/${inProgressSlug}/index.html`), 'utf8');
    assert.match(inProgressDetail, /not measured: this cycle has no end timestamp yet/);
    assert.match(inProgressDetail, /pull\/2/); // known in-progress PR link renders

    const abandonedDetail = await readFile(path.join(tmp, `dist/colophon/journal/${abandonedSlug}/index.html`), 'utf8');
    assert.match(abandonedDetail, /not measured: this cycle was abandoned/);
    assert.match(abandonedDetail, /Why this cycle was abandoned/);
    assert.match(abandonedDetail, /Cancelled for this test\./);

    assert.ok(!existsSync(path.join(tmp, 'dist/colophon/journal/2026-01-04-private')));
  } finally {
    await cleanup(tmp);
  }
});
