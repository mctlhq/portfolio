// Source-level checks for issue #10 (P8) accessibility criteria that a
// build-time script can prove without a browser: a visible focus indicator,
// a minimum interactive-element size, no motion, and lang="ru" on the
// Russian half of the bilingual toggle.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const siteCss = readFileSync(path.join(ROOT, 'src/styles/site.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const langAstro = readFileSync(path.join(ROOT, 'src/i18n/Lang.astro'), 'utf8');

const MIN_TARGET_PX = 24;

test('site.css keeps a :focus-visible outline rule', () => {
  assert.match(siteCss, /:focus-visible\s*\{[^}]*outline:/);
});

const TARGET_SELECTORS = [
  '.site-nav a',
  '.toggle-group button',
  '.site-footer a',
  '.cta',
  '.block > summary',
  '.skip-link:focus',
  '.project-links a',
  '.breadcrumb a',
  '.journal-meta a',
  '.table-scroll a',
];

/**
 * Finds every rule block in `css` whose selector list includes the exact
 * `selector` (selectors are grouped with commas across lines in site.css),
 * and reports a problem when no such block sets `min-block-size`, or when
 * any such declaration is below `floor` px. Returns problem strings instead
 * of asserting, so both the real stylesheet and a synthetic one can be
 * checked with the same function (mirrors entryPointProblems() in
 * test/entry-point.test.ts).
 */
function minBlockSizeProblems(css: string, selector: string, floor: number): string[] {
  const problems: string[] = [];
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
  let found = false;
  const sizes: number[] = [];
  let m;
  while ((m = ruleRe.exec(css))) {
    const selectors = m[1]
      .split(',')
      .map((s) => s.trim().replace(/\s+/g, ' '));
    if (!selectors.includes(selector)) continue;
    const sizeMatch = m[2].match(/min-block-size:\s*(\d+)px/);
    if (sizeMatch) {
      found = true;
      sizes.push(Number(sizeMatch[1]));
    }
  }
  if (!found) {
    problems.push(`no min-block-size rule found for selector "${selector}"`);
  }
  const tooSmall = sizes.filter((size) => size < floor);
  if (tooSmall.length > 0) {
    problems.push(
      `min-block-size for "${selector}" is ${sizes.join(', ')}px, expected at least ${floor}px`,
    );
  }
  return problems;
}

for (const selector of TARGET_SELECTORS) {
  test(`site.css declares a min-block-size of at least ${MIN_TARGET_PX}px on ${selector}`, () => {
    assert.deepEqual(minBlockSizeProblems(siteCss, selector, MIN_TARGET_PX), []);
  });
}

test('minBlockSizeProblems reports a problem for a declaration below the floor', () => {
  const synthetic = '.foo {\n  display: inline-flex;\n  min-block-size: 20px;\n}\n';
  const problems = minBlockSizeProblems(synthetic, '.foo', MIN_TARGET_PX);
  assert.ok(problems.length > 0);
  assert.match(problems.join('\n'), /20/);
  assert.match(problems.join('\n'), /\.foo/);
});

test('minBlockSizeProblems reports a problem when the selector has no min-block-size rule at all', () => {
  const synthetic = '.foo {\n  display: inline-flex;\n  color: red;\n}\n';
  const problems = minBlockSizeProblems(synthetic, '.foo', MIN_TARGET_PX);
  assert.ok(problems.length > 0);
  assert.match(problems.join('\n'), /no min-block-size rule found/);
});

test('site.css declares no animation or transition anywhere', () => {
  assert.doesNotMatch(siteCss, /\banimation(-[a-z]+)?\s*:/);
  assert.doesNotMatch(siteCss, /\btransition(-[a-z]+)?\s*:/);
});

test('site.css declares the .toggle-bar rule with display: flex, flex-wrap: wrap and gap: var(--mctl-space-4)', () => {
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
  let block = null;
  let m;
  while ((m = ruleRe.exec(siteCss))) {
    const selectors = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (selectors.includes('.toggle-bar')) block = m[2];
  }
  assert.ok(block, 'expected a .toggle-bar rule in site.css');
  assert.match(block, /display:\s*flex/);
  assert.match(block, /flex-wrap:\s*wrap/);
  assert.match(block, /gap:\s*var\(--mctl-space-4\)/);
});

test('site.css declares .site-nav a[aria-current] with both a color and a text-decoration', () => {
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
  let block = null;
  let m;
  while ((m = ruleRe.exec(siteCss))) {
    const selectors = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (selectors.includes('.site-nav a[aria-current]')) block = m[2];
  }
  assert.ok(block, 'expected a rule whose selector list includes .site-nav a[aria-current]');
  assert.match(block, /\bcolor:\s*[^;]+;/);
  assert.match(block, /\btext-decoration:\s*[^;]+;/);
});

test('Lang.astro emits lang="ru" on the Russian span', () => {
  assert.match(langAstro, /<span class="l ru" lang="ru">/);
});

test('the shared table.cycles, table.adr-index block no longer declares white-space: nowrap', () => {
  const sharedBlockMatch = siteCss.match(/table\.cycles,\s*table\.adr-index\s*\{([^}]*)\}/);
  assert.ok(sharedBlockMatch, 'expected a shared "table.cycles, table.adr-index" rule block');
  assert.doesNotMatch(sharedBlockMatch![1], /white-space:\s*nowrap/);
});

test('site.css declares white-space: nowrap for table.cycles td:nth-child(1) and table.adr-index td:nth-child(4)', () => {
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
  let cyclesCol1Nowrap = false;
  let adrCol4Nowrap = false;
  let m;
  while ((m = ruleRe.exec(siteCss))) {
    const selectors = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    const declares = /white-space:\s*nowrap/.test(m[2]);
    if (!declares) continue;
    if (selectors.includes('table.cycles td:nth-child(1)')) cyclesCol1Nowrap = true;
    if (selectors.includes('table.adr-index td:nth-child(4)')) adrCol4Nowrap = true;
  }
  assert.ok(cyclesCol1Nowrap, 'expected a nowrap rule for table.cycles td:nth-child(1)');
  assert.ok(adrCol4Nowrap, 'expected a nowrap rule for table.adr-index td:nth-child(4)');
});

test('site.css keeps column headings free to wrap at a space but never mid-word', () => {
  const headingBlockMatch = siteCss.match(/table\.cycles th,\s*table\.adr-index th\s*\{([^}]*)\}/);
  assert.ok(headingBlockMatch, 'expected a shared "table.cycles th, table.adr-index th" rule block');
  assert.match(headingBlockMatch![1], /overflow-wrap:\s*normal/);
  assert.match(headingBlockMatch![1], /word-break:\s*normal/);
});

test('site.css hides table.cycles columns 2 and 6 and declares the scroll affordance below 600px', () => {
  const narrowMatch = siteCss.match(/@media \(max-width: 599px\) \{([\s\S]*?)\n\}/g);
  assert.ok(narrowMatch, 'expected at least one @media (max-width: 599px) block');
  const narrowBlocks = narrowMatch!.join('\n');
  assert.match(narrowBlocks, /table\.cycles th:nth-child\(2\)/);
  assert.match(narrowBlocks, /table\.cycles td:nth-child\(2\)/);
  assert.match(narrowBlocks, /table\.cycles th:nth-child\(6\)/);
  assert.match(narrowBlocks, /table\.cycles td:nth-child\(6\)/);
  assert.match(narrowBlocks, /display:\s*none/);
  assert.match(narrowBlocks, /\.table-scroll::after/);
});
