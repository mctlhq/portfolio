// Proves ProjectCard.astro's rendered markup for the private-repo capability
// and for a card carrying both a repository link and a service link --
// issue #89, criteria B.5-B.7. test/work.test.ts's T3 already source-greps
// ProjectCard.astro for the right conditionals, but a grep cannot
// distinguish `en.data.private` from `!en.data.repo` in emitted markup: both
// conditionals happened to agree on the shape of the one now-removed
// production entry that had no repo and was marked private, which is
// exactly the coincidence that let a wrong implementation through
// undetected before that entry was removed.
// This file builds a real fixture tree and asserts the discriminating cases
// that a source grep cannot see, following the pattern established by
// test/journal-build.test.ts: `makeProjectFixtureTree` copies the committed
// src/, replaces src/content/projects/ with four fixture projects, and runs
// a real `astro build` via spawnSync (never `npm run build`, whose
// `prebuild` would recurse).

import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const ASTRO_BIN = path.join(ROOT, 'node_modules/astro/bin/astro.mjs');
const CARD_PATH = path.join(ROOT, 'src/components/ProjectCard.astro');

interface FixtureLink {
  label: string;
  ruLabel: string;
  url: string;
}

interface FixtureSpec {
  slug: string;
  group: 'platform' | 'product';
  order: number;
  repo?: string;
  private?: boolean;
  links?: FixtureLink[];
}

const FIXTURES: readonly FixtureSpec[] = [
  {
    slug: 'fixture-private-no-repo',
    group: 'platform',
    order: 1,
    private: true,
  },
  {
    slug: 'fixture-public-repo',
    group: 'platform',
    order: 2,
    repo: 'https://github.com/mctlhq/fixture-public-repo',
    links: [{ label: 'Service', ruLabel: 'Сервис', url: 'https://fixture-public-repo.example.com' }],
  },
  {
    slug: 'fixture-no-repo-no-private',
    group: 'product',
    order: 3,
  },
  {
    slug: 'fixture-private-with-repo',
    group: 'product',
    order: 4,
    repo: 'https://github.com/mctlhq/fixture-private-with-repo',
    private: true,
  },
];

function projectFile(spec: FixtureSpec, lang: 'en' | 'ru'): string {
  const lines = [
    `slug: ${spec.slug}`,
    `lang: ${lang}`,
    `name: "${spec.slug}"`,
    `group: ${spec.group}`,
    `order: ${spec.order}`,
  ];
  if (spec.repo) lines.push(`repo: ${spec.repo}`);
  if (spec.private) lines.push('private: true');
  lines.push('stack: ["TypeScript"]');
  const summary =
    lang === 'en' ? `Fixture summary for ${spec.slug}.` : `Тестовое описание для ${spec.slug}.`;
  lines.push(`summary: "${summary}"`);
  if (spec.links) {
    lines.push('links:');
    for (const link of spec.links) {
      const label = lang === 'en' ? link.label : link.ruLabel;
      lines.push(`  - label: "${label}"`);
      lines.push(`    url: ${link.url}`);
    }
  }
  const bullet = lang === 'en' ? `- fixture bullet for ${spec.slug}` : `- тестовый пункт для ${spec.slug}`;
  return ['---', ...lines, '---', '', bullet, ''].join('\n');
}

/** Copies the committed src/ tree into a fresh mkdtemp directory, replaces
 * src/content/projects with the four FIXTURES (en and ru each), optionally
 * overwrites src/components/ProjectCard.astro with `cardSource`, and
 * symlinks node_modules and public/ from the real repository. Also copies
 * astro.config.mjs and package.json, which astro's own tooling reads. */
async function makeProjectFixtureTree(cardSource?: string): Promise<string> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'project-card-private-test-'));
  await cp(path.join(ROOT, 'src'), path.join(tmp, 'src'), { recursive: true });
  await rm(path.join(tmp, 'src/content/projects'), { recursive: true, force: true });
  await mkdir(path.join(tmp, 'src/content/projects'), { recursive: true });
  for (const spec of FIXTURES) {
    await writeFile(path.join(tmp, 'src/content/projects', `${spec.slug}.en.md`), projectFile(spec, 'en'), 'utf8');
    await writeFile(path.join(tmp, 'src/content/projects', `${spec.slug}.ru.md`), projectFile(spec, 'ru'), 'utf8');
  }
  if (cardSource) {
    await writeFile(path.join(tmp, 'src/components/ProjectCard.astro'), cardSource, 'utf8');
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

/** Slices one fixture's rendered <article> out of dist/work/index.html by
 * its id (ProjectCard.astro renders `<article class="project"
 * id={en.data.slug}>`), so each fixture's expectations are asserted against
 * its own isolated markup rather than the whole page. */
function extractCard(html: string, slug: string): string {
  const marker = `<article class="project" id="${slug}"`;
  const start = html.indexOf(marker);
  assert.ok(start !== -1, `expected to find ${marker} in dist/work/index.html`);
  const end = html.indexOf('</article>', start);
  assert.ok(end !== -1, `expected a closing </article> after ${marker}`);
  return html.slice(start, end + '</article>'.length);
}

function hasPrivateChip(card: string): boolean {
  return card.includes('private repo') && card.includes('приватный репозиторий');
}

function hasRepoLink(card: string, repoUrl: string): boolean {
  return card.includes(`<a href="${repoUrl}">`);
}

function hasProjectLinksList(card: string): boolean {
  return card.includes('<ul class="project-links">');
}

function hasMetricsLine(card: string): boolean {
  return card.includes('class="project-metrics"');
}

async function buildAndReadWorkPage(cardSource?: string): Promise<string> {
  const tmp = await makeProjectFixtureTree(cardSource);
  try {
    const result = runAstro(tmp, ['build']);
    assert.equal(result.status, 0, `expected build to pass, stderr: ${result.stderr}`);
    return await readFile(path.join(tmp, 'dist/work/index.html'), 'utf8');
  } finally {
    await cleanup(tmp);
  }
}

// -- T8/T9/T11: the honest card ------------------------------------------

test('a private: true entry with no repo: renders the private chip and no repository link or metrics line', async () => {
  const html = await buildAndReadWorkPage();
  const card = extractCard(html, 'fixture-private-no-repo');
  assert.ok(hasPrivateChip(card), 'expected the private chip to render');
  assert.ok(!hasRepoLink(card, 'https://github.com/mctlhq/fixture-private-no-repo'), 'expected no repository link');
  assert.ok(!hasMetricsLine(card), 'expected no metrics line without a repo:');
});

test('a public repo: entry with one links: entry renders the repository link and the service link, in that order, and no private chip', async () => {
  const html = await buildAndReadWorkPage();
  const card = extractCard(html, 'fixture-public-repo');
  const repoUrl = 'https://github.com/mctlhq/fixture-public-repo';
  const serviceUrl = 'https://fixture-public-repo.example.com';
  assert.ok(hasRepoLink(card, repoUrl), 'expected the repository link to render');
  assert.ok(card.includes(`<a href="${serviceUrl}">`), 'expected the service link to render');
  assert.ok(card.indexOf(repoUrl) < card.indexOf(serviceUrl), 'expected the repository link before the service link');
  assert.ok(!hasPrivateChip(card), 'expected no private chip on a non-private entry');
});

test('an entry with neither repo: nor private: renders no private chip and no project-links list at all', async () => {
  const html = await buildAndReadWorkPage();
  const card = extractCard(html, 'fixture-no-repo-no-private');
  assert.ok(!hasPrivateChip(card), 'expected no private chip');
  assert.ok(!hasProjectLinksList(card), 'expected no project-links list when there is neither a repo nor a links entry');
});

test('an entry with both repo: and private: true renders the private chip alongside the repository link', async () => {
  const html = await buildAndReadWorkPage();
  const card = extractCard(html, 'fixture-private-with-repo');
  assert.ok(hasPrivateChip(card), 'expected the private chip to render');
  assert.ok(hasRepoLink(card, 'https://github.com/mctlhq/fixture-private-with-repo'), 'expected the repository link to render');
});

// -- T10: the mutation control ---------------------------------------------

const PRIVATE_TOKEN = '{en.data.private && (';
const MUTANT_TOKEN = '{!en.data.repo && (';

/** Reads the committed ProjectCard.astro, asserts the private-chip
 * conditional occurs exactly once (failing loudly if the source has
 * drifted, rather than silently mutating the wrong thing or nothing at
 * all), and returns the source with that one conditional swapped for
 * `!en.data.repo`. This is the mutation evidence itself, re-derived on
 * every test run and committed in this file -- never described only in a
 * pull request. */
async function mutantCard(): Promise<string> {
  const source = await readFile(CARD_PATH, 'utf8');
  const occurrences = source.split(PRIVATE_TOKEN).length - 1;
  assert.equal(
    occurrences,
    1,
    `expected the token "${PRIVATE_TOKEN}" to occur exactly once in ProjectCard.astro, found ${occurrences}`,
  );
  return source.replace(PRIVATE_TOKEN, MUTANT_TOKEN);
}

test('mutant: a card reading !en.data.repo instead of en.data.private fails the two discriminating cases', async () => {
  const mutated = await mutantCard();
  const html = await buildAndReadWorkPage(mutated);

  const noRepoNoPrivate = extractCard(html, 'fixture-no-repo-no-private');
  assert.ok(
    hasPrivateChip(noRepoNoPrivate),
    'expected the mutant to wrongly render a private chip on an entry with no repo: and no private:',
  );

  const privateWithRepo = extractCard(html, 'fixture-private-with-repo');
  assert.ok(
    !hasPrivateChip(privateWithRepo),
    'expected the mutant to wrongly omit the private chip on an entry with both repo: and private: true',
  );
});
