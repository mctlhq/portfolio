import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { repoKey } from '../src/lib/metrics.ts';
import { EXPECTED_PROJECTS, EXPECTED_SLUGS } from './support/expected-projects.ts';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const PROJECTS_DIR = fileURLToPath(new URL('../src/content/projects/', import.meta.url));
const METRICS_PATH = fileURLToPath(new URL('../src/data/metrics.json', import.meta.url));
const CARD_PATH = fileURLToPath(new URL('../src/components/ProjectCard.astro', import.meta.url));

const REPO_RE = /^https:\/\/github\.com\/(mctlhq|mashkoffdmitry)\/([a-z0-9-]+)$/;

const files = readdirSync(PROJECTS_DIR).filter((name) => name.endsWith('.md'));

function frontmatterField(source: string, field: string): string | null {
  const match = source.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

test('exactly twenty project content files exist, one en and one ru per expected slug', () => {
  const expectedFileCount = EXPECTED_SLUGS.length * 2;
  assert.equal(files.length, expectedFileCount, `expected ${expectedFileCount} files, found ${files.length}: ${files.join(', ')}`);

  const slugs = new Set(files.map((name) => name.replace(/\.(en|ru)\.md$/, '')));
  assert.equal(slugs.size, EXPECTED_SLUGS.length, `expected ${EXPECTED_SLUGS.length} distinct slugs, found ${slugs.size}`);
  assert.deepEqual([...slugs].sort(), [...EXPECTED_SLUGS].sort());

  for (const slug of EXPECTED_SLUGS) {
    assert.ok(files.includes(`${slug}.en.md`), `missing ${slug}.en.md`);
    assert.ok(files.includes(`${slug}.ru.md`), `missing ${slug}.ru.md`);
  }
});

test('lang: in each file matches its filename suffix', () => {
  for (const name of files) {
    const source = readFileSync(`${PROJECTS_DIR}${name}`, 'utf8');
    const lang = frontmatterField(source, 'lang');
    const expected = name.endsWith('.en.md') ? 'en' : 'ru';
    assert.equal(lang, expected, `${name}: expected lang: ${expected}, got ${lang}`);
  }
});

test('platform and product group counts per language match EXPECTED_PROJECTS', () => {
  const expectedPlatform = EXPECTED_PROJECTS.filter((p) => p.group === 'platform').length;
  const expectedProduct = EXPECTED_PROJECTS.filter((p) => p.group === 'product').length;

  for (const lang of ['en', 'ru'] as const) {
    const langFiles = files.filter((name) => name.endsWith(`.${lang}.md`));
    let platformCount = 0;
    let productCount = 0;
    for (const name of langFiles) {
      const source = readFileSync(`${PROJECTS_DIR}${name}`, 'utf8');
      const group = frontmatterField(source, 'group');
      if (group === 'platform') platformCount += 1;
      else if (group === 'product') productCount += 1;
      else assert.fail(`${name}: unexpected group: ${group}`);
    }
    assert.equal(platformCount, expectedPlatform, `expected ${expectedPlatform} platform entries for ${lang}, got ${platformCount}`);
    assert.equal(productCount, expectedProduct, `expected ${expectedProduct} product entries for ${lang}, got ${productCount}`);
  }
});

test('order: values run 1..N once per language, matching EXPECTED_PROJECTS', () => {
  const expectedOrders = EXPECTED_PROJECTS.map((p) => p.order).sort((a, b) => a - b);
  for (const lang of ['en', 'ru'] as const) {
    const langFiles = files.filter((name) => name.endsWith(`.${lang}.md`));
    const orders = langFiles
      .map((name) => readFileSync(`${PROJECTS_DIR}${name}`, 'utf8'))
      .map((source) => Number(frontmatterField(source, 'order')))
      .sort((a, b) => a - b);
    assert.deepEqual(orders, expectedOrders, `${lang}: order values must match EXPECTED_PROJECTS`);
  }
});

test('each file\'s order: and group: match its EXPECTED_PROJECTS row', () => {
  for (const project of EXPECTED_PROJECTS) {
    for (const lang of ['en', 'ru'] as const) {
      const source = readFileSync(`${PROJECTS_DIR}${project.slug}.${lang}.md`, 'utf8');
      const order = Number(frontmatterField(source, 'order'));
      const group = frontmatterField(source, 'group');
      assert.equal(order, project.order, `${project.slug}.${lang}.md: expected order ${project.order}, got ${order}`);
      assert.equal(group, project.group, `${project.slug}.${lang}.md: expected group ${project.group}, got ${group}`);
    }
  }
});

test('every project that declares a repo: matches https://github.com/(mctlhq|mashkoffdmitry)/<slug> and resolves through repoKey to a src/data/metrics.json per_repo key', () => {
  const metrics = JSON.parse(readFileSync(METRICS_PATH, 'utf8'));
  const perRepo = metrics.sources.github.per_repo as Record<string, unknown>;

  for (const slug of EXPECTED_SLUGS) {
    for (const lang of ['en', 'ru'] as const) {
      const source = readFileSync(`${PROJECTS_DIR}${slug}.${lang}.md`, 'utf8');
      const repo = frontmatterField(source, 'repo');
      assert.ok(repo, `${slug}.${lang}.md: missing repo: line`);
      const match = REPO_RE.exec(repo);
      assert.ok(match, `${slug}.${lang}.md: repo "${repo}" does not match the expected pattern`);
      assert.equal(match?.[2], slug, `${slug}.${lang}.md: repo path "${match?.[2]}" does not match slug`);

      const key = repoKey(repo);
      assert.ok(key, `${slug}.${lang}.md: repo "${repo}" did not resolve through repoKey`);
      assert.ok(
        key !== null && key in perRepo,
        `${slug}.${lang}.md: repo key "${key}" is not present in src/data/metrics.json's per_repo`,
      );
    }
  }
});

test('the stack: line is byte-identical between the .en.md and .ru.md file for every slug', () => {
  for (const slug of EXPECTED_SLUGS) {
    const enSource = readFileSync(`${PROJECTS_DIR}${slug}.en.md`, 'utf8');
    const ruSource = readFileSync(`${PROJECTS_DIR}${slug}.ru.md`, 'utf8');
    const enStack = frontmatterField(enSource, 'stack');
    const ruStack = frontmatterField(ruSource, 'stack');
    assert.ok(enStack, `${slug}.en.md: missing stack: line`);
    assert.equal(enStack, ruStack, `${slug}: stack: line differs between .en.md and .ru.md`);
  }
});

// T7: source-level assertions on ProjectCard.astro, in the style of
// test/home.test.ts.
test('ProjectCard.astro imports the metrics data file', () => {
  const card = readFileSync(CARD_PATH, 'utf8');
  assert.match(card, /import\s+rawMetrics\s+from\s+['"]\.\.\/data\/metrics\.json['"]/);
});

test('ProjectCard.astro renders commits and releases only through formatStat(...) rooted at the repoMetrics(...) result', () => {
  const card = readFileSync(CARD_PATH, 'utf8');
  assert.match(card, /const\s+repoStats\s*=\s*repoMetrics\(/);
  assert.match(card, /formatStat\(repoStats\.commits\)/);
  assert.match(card, /formatStat\(repoStats\.releases\)/);
});

test('ProjectCard.astro template contains no digit (other than heading tag names) and no longer contains slot name="metrics"', () => {
  const card = readFileSync(CARD_PATH, 'utf8');
  const frontmatterEnd = card.indexOf('\n---', card.indexOf('---') + 3);
  const template = card.slice(frontmatterEnd + 4);
  const stripped = template.replace(/<\/?h[1-6]\b/g, '');
  assert.doesNotMatch(stripped, /\d/);
  assert.doesNotMatch(card, /slot name="metrics"/);
});

// -- issue-89 task 9(a): the seerrsense correction ---------------------------

test('seerrsense.en.md carries the exact corrected summary and the new bullet, and mentions neither Radarr nor Sonarr in its summary', () => {
  const source = readFileSync(`${PROJECTS_DIR}seerrsense.en.md`, 'utf8');
  const summary = frontmatterField(source, 'summary');
  assert.equal(
    summary,
    '"Natural-language media requests for Seerr over MCP: the model interprets intent, provider IDs stay the source of truth."',
  );
  assert.doesNotMatch(summary ?? '', /radarr|sonarr/i);
  assert.match(source, /^- one upstream: Seerr, which is what drives Radarr and Sonarr\s*$/m);
});

test('seerrsense.ru.md carries the exact corrected summary and the new bullet, and mentions neither Radarr nor Sonarr in its summary', () => {
  const source = readFileSync(`${PROJECTS_DIR}seerrsense.ru.md`, 'utf8');
  const summary = frontmatterField(source, 'summary');
  assert.equal(
    summary,
    '"Запросы медиа на естественном языке для Seerr через MCP: модель интерпретирует намерение, идентификаторы провайдеров остаются источником истины."',
  );
  assert.doesNotMatch(summary ?? '', /radarr|sonarr/i);
  assert.match(source, /^- один апстрим — Seerr, и уже он управляет Radarr и Sonarr\s*$/m);
});

// -- issue-89 task 9(b): the six service links -------------------------------

interface ExpectedLink {
  slug: string;
  url: string;
  en: string;
  ru: string;
}

const EXPECTED_LINKS: readonly ExpectedLink[] = [
  { slug: 'mctl-portal', url: 'https://app.mctl.ai', en: 'Portal', ru: 'Портал' },
  { slug: 'mctl-design', url: 'https://ui.mctl.ai', en: 'Storybook', ru: 'Storybook' },
  { slug: 'mctl-telegram', url: 'https://tg.mctl.ai', en: 'Service', ru: 'Сервис' },
  { slug: 'seerrsense', url: 'https://seerrsense.mctl.ai', en: 'Service', ru: 'Сервис' },
  { slug: 'mctl-academy', url: 'https://academy.mctl.ai', en: 'Service', ru: 'Сервис' },
  { slug: 'mctl-loyalty', url: 'https://rewards.mctl.ai', en: 'Service', ru: 'Сервис' },
];

const NO_LINKS_SLUGS = ['mctl-gitops', 'pelican-libertex-social'];

test('the six service-link slugs carry exactly the listed url and EN/RU label', () => {
  for (const link of EXPECTED_LINKS) {
    const enSource = readFileSync(`${PROJECTS_DIR}${link.slug}.en.md`, 'utf8');
    const ruSource = readFileSync(`${PROJECTS_DIR}${link.slug}.ru.md`, 'utf8');
    assert.match(
      enSource,
      new RegExp(`links:\\n  - label: "${link.en}"\\n    url: ${link.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`),
      `${link.slug}.en.md: expected links entry for "${link.en}" -> ${link.url}`,
    );
    assert.match(
      ruSource,
      new RegExp(`links:\\n  - label: "${link.ru}"\\n    url: ${link.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`),
      `${link.slug}.ru.md: expected links entry for "${link.ru}" -> ${link.url}`,
    );
  }
});

test('mctl-api keeps its existing Docs / Документация link and gains nothing further', () => {
  const enSource = readFileSync(`${PROJECTS_DIR}mctl-api.en.md`, 'utf8');
  const ruSource = readFileSync(`${PROJECTS_DIR}mctl-api.ru.md`, 'utf8');
  assert.match(enSource, /links:\n  - label: "Docs"\n    url: https:\/\/docs\.mctl\.ai\n/);
  assert.match(ruSource, /links:\n  - label: "Документация"\n    url: https:\/\/docs\.mctl\.ai\n/);
  assert.equal((enSource.match(/^  - label:/gm) ?? []).length, 1, 'mctl-api.en.md: expected exactly one links entry');
  assert.equal((ruSource.match(/^  - label:/gm) ?? []).length, 1, 'mctl-api.ru.md: expected exactly one links entry');
});

test('mctl-gitops and pelican-libertex-social carry no links: line', () => {
  for (const slug of NO_LINKS_SLUGS) {
    for (const lang of ['en', 'ru'] as const) {
      const source = readFileSync(`${PROJECTS_DIR}${slug}.${lang}.md`, 'utf8');
      assert.doesNotMatch(source, /^links:/m, `${slug}.${lang}.md must not carry a links: line`);
    }
  }
});

// -- issue-89 task 9(c): the four removed slugs are gone ---------------------

// src/data/metrics.json is excluded from this walk: it is a snapshot of
// twenty-four repositories, and the issue's own out-of-scope list keeps the
// per-repo keys for the removed projects there deliberately. Every other
// file under src/ and test/ must carry no word-bounded occurrence of a
// removed slug. The word boundary matters because one removed slug is a
// proper prefix of a remaining one (with an "s" appended), so a plain
// substring search would false-positive on every surviving file that names
// it. The four slugs below are assembled from parts rather than written as
// contiguous literals, on purpose: this very test file lives under test/
// and is itself part of the walk, and a literal occurrence here would be a
// false positive against its own guard.
const REMOVED_SLUGS = [
  ['mctl', 'agent'].join('-'),
  ['mctl', 'pairdesk'].join('-'),
  ['pfeifenpatenschaft', 'backend'].join('-'),
  ['mctl', 'openclaw'].join('-'),
];
const METRICS_JSON_REL = 'src/data/metrics.json';
const SCAN_DIRS = ['src', 'test'];

function walkFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkFiles(full));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}

test('no word-bounded occurrence of a removed slug remains under src/ or test/, excluding src/data/metrics.json', () => {
  const allFiles = SCAN_DIRS.flatMap((dir) => walkFiles(path.join(ROOT, dir)));
  const problems: string[] = [];

  for (const file of allFiles) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (rel === METRICS_JSON_REL) continue;
    const source = readFileSync(file, 'utf8');
    for (const slug of REMOVED_SLUGS) {
      const re = new RegExp(`\\b${slug}\\b`);
      if (re.test(source)) {
        problems.push(`${rel}: contains a word-bounded occurrence of "${slug}"`);
      }
    }
  }

  assert.deepEqual(problems, [], problems.join('\n'));
});
