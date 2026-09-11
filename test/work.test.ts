import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const WORK_PATH = fileURLToPath(new URL('../src/pages/work.astro', import.meta.url));
const CARD_PATH = fileURLToPath(new URL('../src/components/ProjectCard.astro', import.meta.url));
const work = readFileSync(WORK_PATH, 'utf8');
const card = readFileSync(CARD_PATH, 'utf8');

// A representative sample of literals that must never appear typed into the
// template: proper stack chips (language/tool names) and the two plain-word
// chips that have a Russian counterpart in stackChipRu.
const CHIP_LITERALS = [
  'TypeScript',
  'PostgreSQL',
  'Go',
  'design tokens',
  'upstream fork',
  'ArgoCD',
  'MCP',
];

test('ProjectCard derives chips from en.data.stack, not from a literal', () => {
  assert.match(card, /en\.data\.stack\.map/);
});

test('neither work.astro nor ProjectCard.astro contains a chip literal', () => {
  for (const literal of CHIP_LITERALS) {
    assert.doesNotMatch(work, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `work.astro must not contain the chip literal "${literal}"`);
    assert.doesNotMatch(card, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `ProjectCard.astro must not contain the chip literal "${literal}"`);
  }
});

test('neither file references --font-editorial', () => {
  assert.doesNotMatch(work, /--font-editorial/);
  assert.doesNotMatch(card, /--font-editorial/);
});

test('neither file contains a tabindex override', () => {
  assert.doesNotMatch(work, /tabindex/);
  assert.doesNotMatch(card, /tabindex/);
});

test('work.astro sorts project entries on data.order', () => {
  assert.match(work, /\.sort\(\(a,\s*b\)\s*=>\s*a\.data\.order\s*-\s*b\.data\.order\)/);
});

test('work.astro imports ProjectCard and getCollection', () => {
  assert.match(work, /import\s+ProjectCard\s+from\s+['"]\.\.\/components\/ProjectCard\.astro['"]/);
  assert.match(work, /getCollection/);
});
