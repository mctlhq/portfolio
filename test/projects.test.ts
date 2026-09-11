import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PROJECTS_DIR = fileURLToPath(new URL('../src/content/projects/', import.meta.url));

const EXPECTED_SLUGS = [
  'mctl-api',
  'mctl-gitops',
  'mctl-agents',
  'mctl-agent',
  'mctl-portal',
  'mctl-design',
  'mctl-telegram',
  'seerrsense',
  'mctl-academy',
  'mctl-loyalty',
  'mctl-pairdesk',
  'pelican-libertex-social',
  'pfeifenpatenschaft-backend',
  'mctl-openclaw',
];

const NO_REPO_SLUGS = new Set(['pfeifenpatenschaft-backend']);
const REPO_RE = /^https:\/\/github\.com\/(mctlhq|mashkoffdmitry)\/([a-z0-9-]+)$/;

const files = readdirSync(PROJECTS_DIR).filter((name) => name.endsWith('.md'));

function frontmatterField(source: string, field: string): string | null {
  const match = source.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

test('exactly 28 project content files exist, one en and one ru per expected slug', () => {
  assert.equal(files.length, 28, `expected 28 files, found ${files.length}: ${files.join(', ')}`);

  const slugs = new Set(files.map((name) => name.replace(/\.(en|ru)\.md$/, '')));
  assert.equal(slugs.size, 14, `expected 14 distinct slugs, found ${slugs.size}`);
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

test('6 files per language carry group: platform and 8 carry group: product', () => {
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
    assert.equal(platformCount, 6, `expected 6 platform entries for ${lang}, got ${platformCount}`);
    assert.equal(productCount, 8, `expected 8 product entries for ${lang}, got ${productCount}`);
  }
});

test('order: values are 1..14 once per language', () => {
  for (const lang of ['en', 'ru'] as const) {
    const langFiles = files.filter((name) => name.endsWith(`.${lang}.md`));
    const orders = langFiles
      .map((name) => readFileSync(`${PROJECTS_DIR}${name}`, 'utf8'))
      .map((source) => Number(frontmatterField(source, 'order')))
      .sort((a, b) => a - b);
    assert.deepEqual(orders, Array.from({ length: 14 }, (_, i) => i + 1), `${lang}: order values must be 1..14 once each`);
  }
});

test('pfeifenpatenschaft-backend has no repo: line in either language file', () => {
  for (const lang of ['en', 'ru'] as const) {
    const source = readFileSync(`${PROJECTS_DIR}pfeifenpatenschaft-backend.${lang}.md`, 'utf8');
    assert.doesNotMatch(source, /^repo:/m, `pfeifenpatenschaft-backend.${lang}.md must not carry a repo: line`);
  }
});

test('every other repo: value matches https://github.com/(mctlhq|mashkoffdmitry)/<slug>', () => {
  for (const slug of EXPECTED_SLUGS) {
    if (NO_REPO_SLUGS.has(slug)) continue;
    for (const lang of ['en', 'ru'] as const) {
      const source = readFileSync(`${PROJECTS_DIR}${slug}.${lang}.md`, 'utf8');
      const repo = frontmatterField(source, 'repo');
      assert.ok(repo, `${slug}.${lang}.md: missing repo: line`);
      const match = REPO_RE.exec(repo as string);
      assert.ok(match, `${slug}.${lang}.md: repo "${repo}" does not match the expected pattern`);
      assert.equal(match?.[2], slug, `${slug}.${lang}.md: repo path "${match?.[2]}" does not match slug`);
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
