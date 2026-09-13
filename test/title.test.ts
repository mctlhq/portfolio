// Build-time title-length budget (issue #88, Q13): an editorial <h1> and a
// search-result <title> are different jobs. titleProblems() judges the
// latter; journalPageTitle()/adrPageTitle() are the same functions the
// routes call, so scanning the content files through them proves what the
// route actually renders, not a hand-typed list of titles.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { adrPageTitle, journalPageTitle, titleProblems } from '../src/lib/seo.ts';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const JOURNAL_DIR = path.join(ROOT, 'src', 'content', 'journal');
const ADR_DIR = path.join(ROOT, 'src', 'content', 'adr');

const TITLE_EN_RE = /^title:\s*\n\s*en:\s*"([^"]*)"/m;
const SEO_TITLE_RE = /^seoTitle:\s*"([^"]*)"/m;
const ADR_ID_RE = /^id:\s*(\d+)\s*$/m;

// -- titleProblems at 65/66/75/76 --------------------------------------------

test('titleProblems returns [] for a title of exactly 65 characters', () => {
  assert.deepEqual(titleProblems('x'.repeat(65)), []);
});

test('titleProblems returns one warning for a title of 66 characters, naming 66 and 65', () => {
  const problems = titleProblems('x'.repeat(66));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /warning/);
  assert.match(problems[0], /66/);
  assert.match(problems[0], /65/);
});

test('titleProblems reports no failure for a title of exactly 75 characters', () => {
  const problems = titleProblems('x'.repeat(75));
  assert.ok(problems.every((p) => !p.startsWith('failure')));
});

test('titleProblems reports a failure for a title of 76 characters, naming 76 and 75', () => {
  const problems = titleProblems('x'.repeat(76));
  assert.ok(problems.some((p) => p.startsWith('failure')));
  const joined = problems.join('\n');
  assert.match(joined, /76/);
  assert.match(joined, /75/);
});

// -- journalPageTitle / adrPageTitle -----------------------------------------

test('journalPageTitle uses the template when no seoTitle is present', () => {
  assert.equal(journalPageTitle({ title: { en: 'X' } }), 'X — Dmitrii Mashkov');
});

test('journalPageTitle uses seoTitle verbatim when present', () => {
  assert.equal(journalPageTitle({ title: { en: 'X' }, seoTitle: 'Y' }), 'Y');
});

test('adrPageTitle uses the template when no seoTitle is present', () => {
  assert.equal(adrPageTitle({ id: 3, title: { en: 'X' } }), 'ADR-0003: X — Dmitrii Mashkov');
});

test('adrPageTitle uses seoTitle verbatim when present', () => {
  assert.equal(adrPageTitle({ id: 3, title: { en: 'X' }, seoTitle: 'Y' }), 'Y');
});

// -- Every journal and ADR entry's route-computed title -----------------------

interface Entry {
  file: string;
  titleEn: string;
  seoTitle: string | undefined;
  computed: string;
}

function readJournalEntries(): Entry[] {
  const entries: Entry[] = [];
  for (const name of readdirSync(JOURNAL_DIR)) {
    if (!name.endsWith('.md')) continue;
    const text = readFileSync(path.join(JOURNAL_DIR, name), 'utf8');
    const titleMatch = TITLE_EN_RE.exec(text);
    assert.ok(titleMatch, `${name}: expected a title.en frontmatter value`);
    const seoTitleMatch = SEO_TITLE_RE.exec(text);
    const titleEn = titleMatch![1];
    const seoTitle = seoTitleMatch ? seoTitleMatch[1] : undefined;
    entries.push({
      file: name,
      titleEn,
      seoTitle,
      computed: journalPageTitle({ title: { en: titleEn }, seoTitle }),
    });
  }
  return entries;
}

function readAdrEntries(): Entry[] {
  const entries: Entry[] = [];
  for (const name of readdirSync(ADR_DIR)) {
    if (!name.endsWith('.md')) continue;
    const text = readFileSync(path.join(ADR_DIR, name), 'utf8');
    const titleMatch = TITLE_EN_RE.exec(text);
    assert.ok(titleMatch, `${name}: expected a title.en frontmatter value`);
    const idMatch = ADR_ID_RE.exec(text);
    assert.ok(idMatch, `${name}: expected an id frontmatter value`);
    const seoTitleMatch = SEO_TITLE_RE.exec(text);
    const titleEn = titleMatch![1];
    const seoTitle = seoTitleMatch ? seoTitleMatch[1] : undefined;
    entries.push({
      file: name,
      titleEn,
      seoTitle,
      computed: adrPageTitle({ id: Number(idMatch![1]), title: { en: titleEn }, seoTitle }),
    });
  }
  return entries;
}

const journalEntries = readJournalEntries();
const adrEntries = readAdrEntries();

test('every journal and ADR entry has at least one file to scan', () => {
  assert.ok(journalEntries.length > 0);
  assert.ok(adrEntries.length > 0);
});

for (const entry of [...journalEntries, ...adrEntries]) {
  test(`${entry.file}: computed title does not exceed 75 characters`, () => {
    const problems = titleProblems(entry.computed);
    assert.ok(
      problems.every((p) => !p.startsWith('failure')),
      `${entry.file}: computed title "${entry.computed}" (${[...entry.computed].length} chars) fails the 75-character limit`,
    );
  });

  test(`${entry.file}: a computed title over 65 characters carries a seoTitle`, () => {
    if ([...entry.computed].length > 65) {
      assert.ok(entry.seoTitle, `${entry.file}: computed title exceeds 65 characters but carries no seoTitle`);
    }
  });
}
