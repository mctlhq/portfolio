// Structural invariants for the journal `indexing` split (issue #88, Q13):
// every entry declares an explicit value, every value is `index` or
// `noindex`, the two sets partition the collection with no overlap and no
// remainder, and the `index` set is non-empty. No literal count of six or
// eighteen appears here -- that would be exactly the hand-typed-list defect
// class test/entry-point.test.ts's header already records twice (#69, #75).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { indexingFromFrontmatter, noindexJournalIds, noindexJournalPaths } from '../src/lib/indexing.ts';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const JOURNAL_DIR = path.join(ROOT, 'src', 'content', 'journal');

function journalIds(): string[] {
  return readdirSync(JOURNAL_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.replace(/\.md$/, ''))
    .sort();
}

test('every journal entry declares an explicit indexing value', () => {
  for (const id of journalIds()) {
    const text = readFileSync(path.join(JOURNAL_DIR, `${id}.md`), 'utf8');
    const value = indexingFromFrontmatter(text);
    assert.ok(value !== null, `${id}.md: expected an explicit "indexing:" frontmatter line`);
  }
});

test('every journal entry declares indexing as index or noindex', () => {
  for (const id of journalIds()) {
    const text = readFileSync(path.join(JOURNAL_DIR, `${id}.md`), 'utf8');
    const value = indexingFromFrontmatter(text);
    assert.ok(value === 'index' || value === 'noindex', `${id}.md: indexing value "${value}" is not a valid enum member`);
  }
});

test('the index and noindex sets partition the collection with no overlap and no remainder, and the index set is non-empty', () => {
  const allIds = journalIds();
  const noindexIds = new Set(noindexJournalIds(JOURNAL_DIR));
  const indexIds = allIds.filter((id) => !noindexIds.has(id));

  assert.equal(indexIds.length + noindexIds.size, allIds.length, 'index and noindex sets must together cover every entry exactly once');
  for (const id of noindexIds) {
    assert.ok(allIds.includes(id), `noindex id "${id}" is not a real journal entry`);
  }
  assert.ok(indexIds.length > 0, 'the index set must be non-empty');
});

test('noindexJournalPaths returns exactly one /colophon/journal/<id>/ path per noindex entry', () => {
  const ids = noindexJournalIds(JOURNAL_DIR);
  const paths = noindexJournalPaths(JOURNAL_DIR);
  assert.equal(paths.length, ids.length);
  for (const id of ids) {
    assert.ok(paths.includes(`/colophon/journal/${id}/`), `expected /colophon/journal/${id}/ in noindexJournalPaths()`);
  }
});

// -- indexingFromFrontmatter discriminates -----------------------------------

test('indexingFromFrontmatter returns null when no indexing line is present', () => {
  assert.equal(indexingFromFrontmatter('service: portfolio\nvisibility: public\n'), null);
});

test('indexingFromFrontmatter reads an index value', () => {
  assert.equal(indexingFromFrontmatter('indexing: index\n'), 'index');
});

test('indexingFromFrontmatter reads a noindex value', () => {
  assert.equal(indexingFromFrontmatter('indexing: noindex\n'), 'noindex');
});
