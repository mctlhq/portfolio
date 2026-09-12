// Cascade gate for the content-link contrast fix (issue #55, Q2'). The issue
// is explicit that a test must exercise the interaction between the visited
// pins and the hover rules, not merely assert that each rule exists: a pin
// written as a bare `:visited`, a deleted pin, or a reordering that flips a
// specificity tie must all be caught. This file implements a miniature CSS
// cascade resolver over the real `src/styles/site.css` -- not a hardcoded
// table of what we hope the file says -- so a regression in the stylesheet
// itself, not just in this test's assumptions, turns the assertions red.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SITE_CSS_PATH = path.join(ROOT, 'src/styles/site.css');
const BASE_ASTRO_PATH = path.join(ROOT, 'src/layouts/Base.astro');

interface Rule {
  selectors: string[];
  declarations: string;
  sourceIndex: number;
}

/**
 * Strips comments, then walks the CSS top to bottom skipping any top-level
 * `@media ... { ... }` block entirely (site.css's three `main a` / `.cta` /
 * `.project-links a` rule families are all declared outside any media
 * query -- the print block this deliberately excludes is exactly the one
 * named in the issue), and returns every other top-level `selector { body }`
 * rule in source order.
 */
function parseTopLevelRules(cssText: string): Rule[] {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  let i = 0;
  let sourceIndex = 0;

  function skipBlock(openBraceIndex: number): number {
    let depth = 0;
    let j = openBraceIndex;
    for (; j < css.length; j += 1) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    return j;
  }

  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i += 1;
    if (i >= css.length) break;

    if (css.startsWith('@media', i)) {
      const braceIdx = css.indexOf('{', i);
      if (braceIdx === -1) break;
      i = skipBlock(braceIdx);
      continue;
    }

    const braceIdx = css.indexOf('{', i);
    if (braceIdx === -1) break;
    const selectorText = css.slice(i, braceIdx).trim();
    const closeIdx = skipBlock(braceIdx);
    const declarations = css.slice(braceIdx + 1, closeIdx - 1);
    const selectors = selectorText
      .split(',')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter((s) => s.length > 0);
    rules.push({ selectors, declarations, sourceIndex });
    sourceIndex += 1;
    i = closeIdx;
  }

  return rules;
}

/**
 * Computes (a, b, c) specificity for a selector drawn from the closed set
 * this file actually uses. `:not(x)` is unwrapped to `x` before counting --
 * `:not()` itself contributes nothing, but its argument counts exactly as
 * if it appeared unwrapped, per the CSS specification and per the ledger in
 * design.md.
 */
function specificity(selectorText: string): [number, number, number] {
  let s = selectorText.replace(/:not\(([^)]*)\)/g, '$1');

  let a = 0;
  let b = 0;
  let c = 0;

  a += (s.match(/#[a-zA-Z0-9_-]+/g) ?? []).length;
  s = s.replace(/#[a-zA-Z0-9_-]+/g, ' ');

  b += (s.match(/\[[^\]]*\]/g) ?? []).length;
  s = s.replace(/\[[^\]]*\]/g, ' ');

  c += (s.match(/::[a-zA-Z-]+/g) ?? []).length;
  s = s.replace(/::[a-zA-Z-]+/g, ' ');

  b += (s.match(/(?<!:):[a-zA-Z-]+/g) ?? []).length;
  s = s.replace(/(?<!:):[a-zA-Z-]+/g, ' ');

  b += (s.match(/\.[a-zA-Z0-9_-]+/g) ?? []).length;
  s = s.replace(/\.[a-zA-Z0-9_-]+/g, ' ');

  const typeTokens = s
    .split(/[\s>+~]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t !== '*');
  c += typeTokens.length;

  return [a, b, c];
}

const BASES = ['main a', '.cta', '.project-links a'] as const;
type Base = (typeof BASES)[number];
const KNOWN_SUFFIXES = [':visited:not(:hover)', ':hover', ':visited', ''] as const;
type Suffix = (typeof KNOWN_SUFFIXES)[number];

/**
 * Classifies a selector as one of the three modelled families plus a known
 * suffix, `{ base: null }` when the selector has nothing to do with any
 * modelled family (e.g. `.site-nav a`, `.toggle-group button` -- left
 * alone), or `{ base, suffix: null }` when the selector visibly extends a
 * modelled family (starts with `main a` or `.cta` or `.project-links a`
 * followed by a pseudo-class chain) but with a suffix this resolver does
 * not recognise -- the shape the risk register calls out explicitly.
 */
function classifySelector(selectorText: string): { base: Base; suffix: Suffix | null } | { base: null } {
  for (const base of BASES) {
    if (selectorText === base) return { base, suffix: '' };
    if (selectorText.startsWith(base)) {
      const rest = selectorText.slice(base.length);
      if ((KNOWN_SUFFIXES as readonly string[]).includes(rest)) {
        return { base, suffix: rest as Suffix };
      }
      if (rest.startsWith(':')) {
        return { base, suffix: null };
      }
      // A coincidental textual prefix (e.g. ".ctas" starts with ".cta" but
      // is not it) -- not a member of this family at all.
    }
  }
  return { base: null };
}

/** Extracts the `color` declaration's raw value from a rule body, ignoring
 * `border-color`, `background-color` etc. via a negative lookbehind on the
 * character immediately before "color". */
function extractColor(declarations: string): string | null {
  const m = declarations.match(/(?<![\w-])color\s*:\s*([^;]+);/);
  return m ? m[1].trim() : null;
}

interface ColorRule {
  base: Base;
  suffix: Suffix;
  color: string;
  spec: [number, number, number];
  sourceIndex: number;
}

const siteCssText = readFileSync(SITE_CSS_PATH, 'utf8');
const rules = parseTopLevelRules(siteCssText);

const colorRules: ColorRule[] = [];
for (const rule of rules) {
  for (const selector of rule.selectors) {
    const classified = classifySelector(selector);
    if (classified.base === null) continue;
    const color = extractColor(rule.declarations);
    if (classified.suffix === null) {
      // A selector shape in one of the three modelled families that this
      // resolver does not recognise. Only a real problem if it carries a
      // color -- an unrelated property on an otherwise-unmodelled
      // extension would not affect the cascade table below.
      assert.ok(
        color === null,
        `link-cascade: selector "${selector}" extends a modelled family (${classified.base}) with an unrecognised suffix and declares color: ${color} -- teach the resolver this shape or it will silently ignore a real cascade change`,
      );
      continue;
    }
    if (color === null) continue;
    colorRules.push({
      base: classified.base,
      suffix: classified.suffix,
      color,
      spec: specificity(selector),
      sourceIndex: rule.sourceIndex,
    });
  }
}

function compareSpecificity(x: [number, number, number], y: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return 0;
}

type State = 'normal' | 'visited' | 'hover' | 'visited+hover';

function isActive(suffix: Suffix, state: State): boolean {
  const visited = state === 'visited' || state === 'visited+hover';
  const hover = state === 'hover' || state === 'visited+hover';
  switch (suffix) {
    case '':
      return true;
    case ':hover':
      return hover;
    case ':visited':
      return visited;
    case ':visited:not(:hover)':
      return visited && !hover;
    default:
      return false;
  }
}

/**
 * Resolves the winning `color` for an element belonging to `base` (`main a`
 * always applies too, since every modelled element lives inside `<main>`)
 * in a given cascade state, by specificity then source order -- the same
 * two-step tie-break a browser applies.
 */
function resolveColor(elementBase: Base, state: State): string {
  const candidates = colorRules.filter(
    (r) => (r.base === 'main a' || r.base === elementBase) && isActive(r.suffix, state),
  );
  assert.ok(candidates.length > 0, `link-cascade: no active rule found for ${elementBase} in state ${state}`);
  let winner = candidates[0];
  for (const candidate of candidates.slice(1)) {
    const cmp = compareSpecificity(candidate.spec, winner.spec);
    if (cmp > 0 || (cmp === 0 && candidate.sourceIndex > winner.sourceIndex)) {
      winner = candidate;
    }
  }
  return winner.color;
}

const STATES: State[] = ['normal', 'visited', 'hover', 'visited+hover'];

const EXPECTED: Record<Base, Record<State, string>> = {
  'main a': {
    normal: 'var(--accent)',
    visited: 'var(--accent)',
    hover: 'var(--accent-highlight)',
    'visited+hover': 'var(--accent-highlight)',
  },
  '.cta': {
    normal: 'var(--surface-fg)',
    visited: 'var(--surface-fg)',
    hover: 'var(--accent)',
    'visited+hover': 'var(--accent)',
  },
  '.project-links a': {
    normal: 'var(--surface-fg)',
    visited: 'var(--surface-fg)',
    hover: 'var(--surface-fg)',
    'visited+hover': 'var(--surface-fg)',
  },
};

for (const base of BASES) {
  for (const state of STATES) {
    test(`cascade resolves ${base} in state "${state}" to ${EXPECTED[base][state]}`, () => {
      assert.equal(resolveColor(base, state), EXPECTED[base][state]);
    });
  }
}

// -- T2: Nav and Footer render outside the element receiving <slot /> ------

test('Base.astro renders <Nav />, the <main> wrapping <slot />, and <Footer /> as direct siblings inside <body>', () => {
  // Since issue #49 (Q5), <main id="main" tabindex="-1"> is hoisted into
  // Base.astro (so the skip link's target and the per-page <main> landmark
  // come from one place), so <slot /> is no longer a bare sibling of <Nav />
  // and <Footer /> -- it is the sole child of <main>. The cascade-safety
  // property this test guards still holds under that structure: <Nav />'s
  // <header class="site-nav"> and <Footer />'s <footer class="site-footer">
  // remain outside <main>, as direct siblings of it, so `main a` can never
  // also match an anchor inside `.site-nav` or `.site-footer`.
  const source = readFileSync(BASE_ASTRO_PATH, 'utf8');
  const bodyMatch = source.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  assert.ok(bodyMatch, 'Base.astro has no <body>...</body> block');
  const bodyContent = bodyMatch![1];
  assert.match(
    bodyContent,
    /<a\s+class="skip-link"[^>]*>[\s\S]*?<\/a>\s*<Nav\s*\/>\s*<main\s+id="main"\s+tabindex="-1">\s*<slot\s*\/>\s*<\/main>\s*<Footer\s*\/>\s*/,
    'expected <body> to contain the skip link, then <Nav />, then <main id="main" tabindex="-1"><slot /></main>, then <Footer /> as siblings, with nothing else wrapping <slot /> other than that one <main>; ' +
      'main a can only stay out of .site-nav a / .site-footer a while this structural fact holds',
  );
});
