// Source-level checks for issue #49 (Q5): current-page marking is derived
// from Astro.url.pathname at build time (no client-side script), the toggle
// groups and both <nav> landmarks carry a single-language accessible name
// through role="group"/aria-labelledby rather than a slash-joined bilingual
// aria-label, and no file in this list still builds one of those bilingual
// template literals.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const NAV_PATH = fileURLToPath(new URL('../src/components/Nav.astro', import.meta.url));
const LANG_TOGGLE_PATH = fileURLToPath(new URL('../src/components/LangToggle.astro', import.meta.url));
const THEME_TOGGLE_PATH = fileURLToPath(new URL('../src/components/ThemeToggle.astro', import.meta.url));
const BASE_PATH = fileURLToPath(new URL('../src/layouts/Base.astro', import.meta.url));
const BREADCRUMB_PATH = fileURLToPath(new URL('../src/components/Breadcrumb.astro', import.meta.url));
const INDEX_PATH = fileURLToPath(new URL('../src/pages/index.astro', import.meta.url));

const nav = readFileSync(NAV_PATH, 'utf8');
const langToggle = readFileSync(LANG_TOGGLE_PATH, 'utf8');
const themeToggle = readFileSync(THEME_TOGGLE_PATH, 'utf8');
const base = readFileSync(BASE_PATH, 'utf8');
const breadcrumb = readFileSync(BREADCRUMB_PATH, 'utf8');
const index = readFileSync(INDEX_PATH, 'utf8');

const BILINGUAL_TEMPLATE_RE = /\$\{[^}]*\.en\}\s*\/\s*\$\{[^}]*\.ru\}/;

test('Nav.astro derives the current path from Astro.url.pathname at build time', () => {
  assert.match(nav, /Astro\.url\.pathname/);
  assert.match(nav, /aria-current=\{current\(/);
});

test('Nav.astro keeps the four literal href="/.../" anchors', () => {
  assert.match(nav, /href="\/"/);
  assert.match(nav, /href="\/work\/"/);
  assert.match(nav, /href="\/approach\/"/);
  assert.match(nav, /href="\/colophon\/"/);
});

test('Nav.astro emits no client-side script', () => {
  assert.doesNotMatch(nav, /<script/);
});

test('Nav.astro gives the site-nav landmark an aria-labelledby, not a bilingual aria-label', () => {
  assert.match(nav, /<nav\s+class="site-nav"\s+aria-labelledby="nav-label"/);
  assert.doesNotMatch(nav, /aria-label=/);
});

test('LangToggle.astro and ThemeToggle.astro render exactly two .icon-toggle buttons, each with its own aria-labelledby, no role="group" and no aria-label', () => {
  for (const [name, source] of [
    ['LangToggle.astro', langToggle],
    ['ThemeToggle.astro', themeToggle],
  ] as const) {
    const buttonTags = source.match(/<button\s+type="button"\s+class="[^"]*icon-toggle[^"]*"[^>]*>/g) ?? [];
    assert.equal(buttonTags.length, 2, `${name}: expected exactly two .icon-toggle buttons`);
    for (const tag of buttonTags) {
      assert.match(tag, /aria-labelledby="/, `${name}: ${tag} is missing aria-labelledby`);
    }
    assert.doesNotMatch(source, /role="group"/, `${name}: no role="group" should remain -- a single button is not a set`);
    assert.doesNotMatch(source, /aria-label=/, `${name}: no aria-label should remain`);
    assert.doesNotMatch(source, /groupLabel/, `${name}: no groupLabel const should remain`);
  }
});

test('none of Nav.astro, LangToggle.astro, ThemeToggle.astro, Base.astro, Breadcrumb.astro or index.astro builds a slash-joined bilingual template literal', () => {
  for (const [name, source] of [
    ['Nav.astro', nav],
    ['LangToggle.astro', langToggle],
    ['ThemeToggle.astro', themeToggle],
    ['Base.astro', base],
    ['Breadcrumb.astro', breadcrumb],
    ['index.astro', index],
  ] as const) {
    assert.doesNotMatch(source, BILINGUAL_TEMPLATE_RE, `${name} still builds a bilingual "\${...en} / \${...ru}" template literal`);
  }
});

test('Base.astro hoists <main id="main" tabindex="-1"> and renders the skip link before <Nav />', () => {
  assert.match(base, /<main\s+id="main"\s+tabindex="-1">/);
  const skipIndex = base.indexOf('class="skip-link"');
  const navIndex = base.indexOf('<Nav');
  assert.ok(skipIndex !== -1, 'expected a .skip-link element in Base.astro');
  assert.ok(navIndex !== -1, 'expected <Nav /> in Base.astro');
  assert.ok(skipIndex < navIndex, 'the skip link must render before <Nav />');
  assert.match(base, /href="#main"/);
});
