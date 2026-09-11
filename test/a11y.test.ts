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

const TARGET_SELECTORS = ['.site-nav a', '.toggle-group button', '.site-footer a', '.cta', '.block > summary'];

for (const selector of TARGET_SELECTORS) {
  test(`site.css declares a min-block-size of at least ${MIN_TARGET_PX}px on ${selector}`, () => {
    // Find every rule block whose selector list includes this exact
    // selector (selectors are grouped with commas across lines in
    // site.css), then check at least one of those blocks sets
    // min-block-size >= MIN_TARGET_PX.
    const ruleRe = /([^{}]+)\{([^}]*)\}/g;
    let found = false;
    let sizes = [];
    let m;
    while ((m = ruleRe.exec(siteCss))) {
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
    assert.ok(found, `no min-block-size rule found for selector "${selector}"`);
    assert.ok(
      sizes.every((size) => size >= MIN_TARGET_PX),
      `min-block-size for "${selector}" is ${sizes.join(', ')}px, expected at least ${MIN_TARGET_PX}px`,
    );
  });
}

test('site.css declares no animation or transition anywhere', () => {
  assert.doesNotMatch(siteCss, /\banimation(-[a-z]+)?\s*:/);
  assert.doesNotMatch(siteCss, /\btransition(-[a-z]+)?\s*:/);
});

test('Lang.astro emits lang="ru" on the Russian span', () => {
  assert.match(langAstro, /<span class="l ru" lang="ru">/);
});

test('site.css declares a color for "main a" and "main a:visited" (content link contrast, issue #46)', () => {
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
  let m;
  const declared = new Set();
  while ((m = ruleRe.exec(siteCss))) {
    const selectors = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    const hasColour = /color:\s*[^;]+;/.test(m[2]);
    if (!hasColour) continue;
    for (const selector of ['main a', 'main a:visited']) {
      if (selectors.includes(selector)) declared.add(selector);
    }
  }
  assert.ok(declared.has('main a'), 'no "main a { color: ... }" rule found');
  assert.ok(declared.has('main a:visited'), 'no "main a:visited { color: ... }" rule found');
});

test('site.css pins .cta:visited and .project-links a:visited to their unvisited colour', () => {
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
  let m;
  const declared = new Set();
  while ((m = ruleRe.exec(siteCss))) {
    const selectors = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    const hasColour = /color:\s*[^;]+;/.test(m[2]);
    if (!hasColour) continue;
    for (const selector of ['.cta:visited', '.project-links a:visited']) {
      if (selectors.includes(selector)) declared.add(selector);
    }
  }
  assert.ok(declared.has('.cta:visited'), 'no ".cta:visited { color: ... }" rule found');
  assert.ok(declared.has('.project-links a:visited'), 'no ".project-links a:visited { color: ... }" rule found');
});
