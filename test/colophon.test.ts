import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ISO_WITH_OFFSET } from '../src/lib/journal.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const JOURNAL_DIR = fileURLToPath(new URL('../src/content/journal/', import.meta.url));
const CONTENT_DIR = fileURLToPath(new URL('../src/content/', import.meta.url));

const INDEX_PATH = `${ROOT}src/pages/colophon/index.astro`;
const CYCLE_TABLE_PATH = `${ROOT}src/components/CycleTable.astro`;
const JOURNAL_ROUTE_PATH = `${ROOT}src/pages/colophon/journal/[...slug].astro`;
const ADR_ROUTE_PATH = `${ROOT}src/pages/colophon/adr/[...slug].astro`;
const FOOTER_PATH = `${ROOT}src/components/Footer.astro`;

const indexAstro = readFileSync(INDEX_PATH, 'utf8');
const cycleTable = readFileSync(CYCLE_TABLE_PATH, 'utf8');
const journalRoute = readFileSync(JOURNAL_ROUTE_PATH, 'utf8');
const adrRoute = readFileSync(ADR_ROUTE_PATH, 'utf8');
const footer = readFileSync(FOOTER_PATH, 'utf8');

function walkContentFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = `${dir}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...walkContentFiles(`${full}/`));
    } else if (entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

const contentFiles = walkContentFiles(CONTENT_DIR);
const journalFiles = readdirSync(JOURNAL_DIR).filter((name) => name.endsWith('.md'));

test('no file under src/content/ carries a hand-typed lead time or intervention count field (issue criterion 3)', () => {
  for (const file of contentFiles) {
    const source = readFileSync(file, 'utf8');
    for (const forbidden of ['lead_time', 'leadTime', 'intervention_count', 'interventionCount']) {
      assert.doesNotMatch(source, new RegExp(forbidden), `${file} must not contain "${forbidden}"`);
    }
  }
});

test('colophon/index.astro derives its totals from the collection, not a literal', () => {
  assert.match(indexAstro, /totalInterventions\(/);
  assert.match(indexAstro, /journal\.length/);
  // The totals markup binds the computed variables, not a re-typed number.
  assert.match(indexAstro, /data-cycle-count=\{cycleCount\}/);
  assert.match(indexAstro, /data-intervention-count=\{interventionsTotal\}/);
});

test('CycleTable.astro maps over its entries prop and contains no journal title, issue number or release tag literal', () => {
  assert.match(cycleTable, /entries\.map/);
  const forbidden = [
    'Home page',
    'Work page with project entries',
    'Approach page',
    'Content collections for projects, journal and ADRs',
    '#5',
    '#6',
    '#7',
    '#8',
    '0.1.2',
    '0.1.3',
    '0.1.4',
    '0.1.5',
  ];
  for (const literal of forbidden) {
    assert.doesNotMatch(cycleTable, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('every public journal file has the required frontmatter keys, single-quoted timestamps, and well-formed interventions', () => {
  const REQUIRED_KEYS = ['service', 'issue', 'proposal_slug', 'visibility', 'title', 'decided', 'issue_opened_at'];
  for (const name of journalFiles) {
    const source = readFileSync(`${JOURNAL_DIR}${name}`, 'utf8');
    const visibilityMatch = source.match(/^visibility:\s*(public|private)\s*$/m);
    assert.ok(visibilityMatch, `${name}: missing visibility:`);
    if (visibilityMatch![1] !== 'public') continue;

    for (const key of REQUIRED_KEYS) {
      assert.match(source, new RegExp(`^${key}:`, 'm'), `${name}: missing required key "${key}"`);
    }

    const timestampLines = source.match(/^\s*(?:issue_opened_at|proposal_approved_at|merged_at|released_at|deployed_at|at):\s*(.+)$/gm) ?? [];
    for (const line of timestampLines) {
      const value = line.split(':').slice(1).join(':').trim();
      assert.match(value, /^'.*'$/, `${name}: timestamp value "${value}" is not single-quoted`);
      const unquoted = value.slice(1, -1);
      assert.ok(ISO_WITH_OFFSET.test(unquoted), `${name}: timestamp "${unquoted}" does not match ISO_WITH_OFFSET`);
    }

    const whatCount = (source.match(/^\s*-\s+what:/gm) ?? []).length;
    const whyCount = (source.match(/^\s*why:/gm) ?? []).length;
    const atCount = (source.match(/^\s*at:\s*'/gm) ?? []).length;
    assert.equal(whyCount, whatCount, `${name}: ${whatCount} intervention "what" items but ${whyCount} "why" items`);
    assert.equal(atCount, whatCount, `${name}: ${whatCount} intervention "what" items but ${atCount} "at" items`);
  }
});

test('Footer.astro imports package.json and renders pkg.version with no semver literal', () => {
  assert.match(footer, /import\s+pkg\s+from\s+['"]\.\.\/\.\.\/package\.json['"]/);
  assert.match(footer, /\{pkg\.version\}/);
  assert.doesNotMatch(footer, /\d+\.\d+\.\d+/);
});

test('none of the new colophon .astro files reference var(--font-editorial) or class="lede"', () => {
  for (const [name, source] of [
    ['colophon/index.astro', indexAstro],
    ['components/CycleTable.astro', cycleTable],
    ['colophon/journal/[...slug].astro', journalRoute],
    ['colophon/adr/[...slug].astro', adrRoute],
  ] as const) {
    assert.doesNotMatch(source, /--font-editorial/, `${name} must not reference --font-editorial`);
    assert.doesNotMatch(source, /class="lede"/, `${name} must not use class="lede"`);
  }
});
