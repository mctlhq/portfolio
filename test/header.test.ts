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

test('some .icon-toggle block declares border, border-radius and background, and no .icon-toggle block declares overflow', () => {
  const bodies = ruleBlockBodies(siteCss, '.icon-toggle');
  assert.ok(bodies.length > 0, 'expected at least one .icon-toggle rule block');
  assert.ok(
    bodies.some((b) => /\bborder:\s*[^;]+;/.test(b) && /border-radius:/.test(b) && /background:/.test(b)),
    'expected a .icon-toggle block declaring border, border-radius and background',
  );
  assert.ok(
    bodies.every((b) => !/\boverflow\s*:/.test(b)),
    'expected no .icon-toggle block to declare overflow',
  );
});

test('T6: .icon-toggle resolves to exactly one min-block-size of 32px, .site-nav a and .site-footer a resolve to 44px', () => {
  assert.deepEqual(minBlockSizes(siteCss, '.icon-toggle'), [32]);
  assert.ok(minBlockSizes(siteCss, '.site-nav a').includes(44));
  assert.ok(minBlockSizes(siteCss, '.site-footer a').includes(44));
});
