// Source-level checks for issue #103 (Q16): the compact segmented
// language/theme toggles on the navigation line. `.site-header` and
// `.toggle-group` each resolve to TWO rule-block bodies in the raw
// stylesheet -- the real one and the @media print block's
// `.site-header, .toggle-group, .ctas { display: none; }`, because the
// shared flat-regex parser in test/support/css-rules.ts does not understand
// @media nesting. Every assertion below is therefore written as a
// quantifier over ruleBlockBodies()'s return value (.some()/.every()),
// never as "the last matching block" or a bare assert.match against the
// whole stylesheet.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ruleBlockBodies, minBlockSizes } from './support/css-rules.ts';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const siteCss = readFileSync(path.join(ROOT, 'src/styles/site.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('T1: some .site-header rule block declares display: flex, flex-wrap: wrap, justify-content: space-between and border-bottom', () => {
  const bodies = ruleBlockBodies(siteCss, '.site-header');
  assert.ok(bodies.length > 0, 'expected at least one .site-header rule block');
  const hasAll = bodies.some(
    (b) =>
      /display:\s*flex/.test(b) &&
      /flex-wrap:\s*wrap/.test(b) &&
      /justify-content:\s*space-between/.test(b) &&
      /border-bottom:/.test(b),
  );
  assert.ok(hasAll, 'expected one .site-header block declaring all four of display: flex, flex-wrap: wrap, justify-content: space-between and border-bottom');
});

test('T2: no rule block whose selector list includes .site-nav declares border-bottom', () => {
  const bodies = ruleBlockBodies(siteCss, '.site-nav');
  assert.ok(bodies.length > 0, 'expected at least one .site-nav rule block');
  assert.ok(
    bodies.every((b) => !/border-bottom:/.test(b)),
    'expected no .site-nav rule block to declare border-bottom -- it moved to .site-header',
  );
});

test('T3: the .toggle-bar block declares margin-inline-start: auto', () => {
  const bodies = ruleBlockBodies(siteCss, '.toggle-bar');
  assert.ok(bodies.length > 0, 'expected at least one .toggle-bar rule block');
  assert.ok(
    bodies.some((b) => /margin-inline-start:\s*auto/.test(b)),
    'expected a .toggle-bar block declaring margin-inline-start: auto',
  );
});

test('T4: some .toggle-group block declares a border and a border-radius, and no .toggle-group block declares overflow', () => {
  const bodies = ruleBlockBodies(siteCss, '.toggle-group');
  assert.ok(bodies.length > 0, 'expected at least one .toggle-group rule block');
  assert.ok(
    bodies.some((b) => /\bborder:\s*[^;]+;/.test(b) && /border-radius:/.test(b)),
    'expected a .toggle-group block declaring both border and border-radius',
  );
  assert.ok(
    bodies.every((b) => !/\boverflow\s*:/.test(b)),
    'expected no .toggle-group block to declare overflow -- it would clip the focus-visible ring on the first and last segment',
  );
});

test('T5: a rule block whose selector list includes .toggle-group button + button declares border-inline-start', () => {
  const bodies = ruleBlockBodies(siteCss, '.toggle-group button + button');
  assert.ok(bodies.length > 0, 'expected at least one ".toggle-group button + button" rule block');
  assert.ok(
    bodies.some((b) => /border-inline-start:/.test(b)),
    'expected a ".toggle-group button + button" block declaring border-inline-start',
  );
});

test('T6: .toggle-group button resolves to exactly one min-block-size of 32px, .site-nav a and .site-footer a resolve to 44px', () => {
  assert.deepEqual(minBlockSizes(siteCss, '.toggle-group button'), [32]);
  assert.ok(minBlockSizes(siteCss, '.site-nav a').includes(44));
  assert.ok(minBlockSizes(siteCss, '.site-footer a').includes(44));
});
