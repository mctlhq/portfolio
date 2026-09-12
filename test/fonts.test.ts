// Mechanical checks for issue #50 (Q6), "Fonts: preload and no layout
// shift": the pruned family/weight table, the preload set Base.astro
// renders, and the metric-matched Onest Fallback face. Runs against the
// committed, already-vendored tree (public/assets/fonts/, src/data/
// assets.json), the same posture as test/check-contrast.test.ts and
// test/home.test.ts.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'src/data/assets.json'), 'utf8'));

const siteCss = readFileSync(path.join(ROOT, 'src/styles/site.css'), 'utf8');
const baseAstro = readFileSync(path.join(ROOT, 'src/layouts/Base.astro'), 'utf8');
const vendoredCssFiles = ['mctl.css', 'global.css', 'prose.css'].map((name) => {
  const href = assets.styles.find((h) => new RegExp(`/assets/mctl/${name.replace('.css', '')}\\.[0-9a-f]{8}\\.css$`).test(h));
  assert.ok(href, `expected src/data/assets.json to name a hashed href for public/assets/mctl/${name}`);
  return readFileSync(path.join(ROOT, 'public', href!.replace(/^\/+/, '')), 'utf8');
});
const fontsCssHref = assets.styles.find((h) => /\/assets\/fonts\/fonts\.[0-9a-f]{8}\.css$/.test(h));
assert.ok(fontsCssHref, 'expected src/data/assets.json to name a hashed fonts.css href');
const fontsCss = readFileSync(path.join(ROOT, 'public', fontsCssHref!.replace(/^\/+/, '')), 'utf8');

/** Strips CSS comments (site.css has plenty). */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Collects every `--mctl-typography-font-weight-*: <n>;` custom property
 * declared in `css`, keyed by the property name including its leading
 * `--`. `font-weight` is never set to a literal digit anywhere in this
 * codebase -- every declaration reads one of these tokens via `var(...)` --
 * so resolving them is required for `collectFontWeights` below to see
 * anything at all. */
function collectWeightTokens(css: string): Map<string, number> {
  const tokens = new Map<string, number>();
  const re = /(--mctl-typography-font-weight-[\w-]+):\s*(\d+)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    tokens.set(m[1], Number(m[2]));
  }
  return tokens;
}

/** Collects every numeric `font-weight` value declared anywhere in `css`,
 * resolving `font-weight: var(--mctl-typography-font-weight-*);` against
 * `tokens` (a literal `font-weight: <n>;` is also accepted, in case one is
 * ever added directly). Without token resolution this scan matches nothing
 * in this repo -- font-weight is always set through a token -- and the
 * "reachable weight" test below would pass vacuously regardless of which
 * families/weights fonts.css actually declares. */
function collectFontWeights(css: string, tokens: Map<string, number>): Set<number> {
  const weights = new Set<number>();
  const re = /font-weight:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const raw = m[1].trim();
    if (/^\d+$/.test(raw)) {
      weights.add(Number(raw));
      continue;
    }
    const varMatch = raw.match(/^var\((--[\w-]+)\)$/);
    if (varMatch && tokens.has(varMatch[1])) {
      weights.add(tokens.get(varMatch[1])!);
    }
  }
  return weights;
}

/** Collects every `{ family, weight }` pair declared by an `@font-face`
 * block in `css`. */
function collectFaceRules(css: string): { family: string; weight: number }[] {
  const rules: { family: string; weight: number }[] = [];
  const blockRe = /@font-face\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(css))) {
    const block = m[1];
    const familyMatch = block.match(/font-family:\s*'([^']+)'/);
    const weightMatch = block.match(/font-weight:\s*(\d+)/);
    if (familyMatch && weightMatch) {
      rules.push({ family: familyMatch[1], weight: Number(weightMatch[1]) });
    }
  }
  return rules;
}

// -- A2: family-aware weight resolution -------------------------------------
// The check above only proves "this weight is reachable from *some*
// family" -- JetBrains Mono 600/700 (pruned in #65, absent from FAMILIES in
// scripts/vendor-assets.mjs) could vanish from fonts.css entirely and the
// assertion above would stay green as long as Onest still declares a weight
// 600/700 face. This resolves each rule's *own* font-family (literal stack
// or a var(--font-*) chain through site.css then mctl.css) alongside its
// font-weight, and checks the (family, weight) pair specifically. A rule
// that declares a font-weight but no font-family in its own block keeps the
// family-blind assertion (A2b) -- full per-selector cascade resolution is
// out of reach for a source-level test, so coverage strictly increases
// rather than replacing what already holds.

interface CssRule {
  selectors: string[];
  declarations: string;
  sourceIndex: number;
}

/** Modelled on test/link-cascade.test.ts's / test/work.test.ts's
 * parseTopLevelRules: strips comments, skips @media blocks, and returns
 * every other top-level `selector { body }` rule in source order. */
function parseTopLevelRules(cssText: string): CssRule[] {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];
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

/** Parses `--name: value;` custom-property declarations out of a CSS text
 * into a Map, first declaration wins. */
function parseCustomProperties(css: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    if (!map.has(m[1])) map.set(m[1], m[2].trim());
  }
  return map;
}

/** Resolves a `font-family` declaration's raw value to its first family
 * name: a `var(--font-*)` chain resolved against `siteMap` first, falling
 * back to `mctlMap` (mirroring test/home.test.ts's D1 convention: site.css
 * is the declaration the page applies; mctl.css is the fallback), or the
 * literal stack itself when the value is not a bare var() reference.
 * Returns `null` when the chain cannot be resolved to a literal (an
 * undeclared or circular custom property) -- the caller treats that the
 * same as "no family declared", never as a false positive. */
function resolveFamilyName(rawValue: string, siteMap: Map<string, string>, mctlMap: Map<string, string>): string | null {
  let current = rawValue.trim();
  const seen = new Set<string>();
  for (;;) {
    const varMatch = current.match(/^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/);
    if (!varMatch) break;
    const name = varMatch[1];
    if (seen.has(name)) return null;
    seen.add(name);
    if (siteMap.has(name)) {
      current = siteMap.get(name)!.trim();
    } else if (mctlMap.has(name)) {
      current = mctlMap.get(name)!.trim();
    } else {
      return null;
    }
  }
  const first = current.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
  return first || null;
}

interface FamilyWeightPair {
  family: string;
  weight: number;
}

/** For every top-level rule in `css` that declares a numeric `font-weight`
 * (literal or resolved via `weightTokens`), resolves the *same rule's own*
 * `font-family` (if any) via `resolveFamilyName`. Returns the resolved
 * `(family, weight)` pairs plus the set of weights whose rule declared no
 * family at all (or an unresolvable one) -- callers check the former against
 * `collectFaceRules()`'s exact pairs, and keep the family-blind assertion for
 * the latter. */
function collectFamilyWeightPairs(
  css: string,
  weightTokens: Map<string, number>,
  siteMap: Map<string, string>,
  mctlMap: Map<string, string>,
): { pairs: FamilyWeightPair[]; blindWeights: Set<number> } {
  const pairs: FamilyWeightPair[] = [];
  const blindWeights = new Set<number>();
  for (const rule of parseTopLevelRules(css)) {
    const weightMatch = rule.declarations.match(/font-weight:\s*([^;]+);/);
    if (!weightMatch) continue;
    const raw = weightMatch[1].trim();
    let weight: number | null = null;
    if (/^\d+$/.test(raw)) {
      weight = Number(raw);
    } else {
      const varMatch = raw.match(/^var\((--[\w-]+)\)$/);
      if (varMatch && weightTokens.has(varMatch[1])) {
        weight = weightTokens.get(varMatch[1])!;
      }
    }
    if (weight === null) continue;

    const familyMatch = rule.declarations.match(/font-family:\s*([^;]+);/);
    if (!familyMatch) {
      blindWeights.add(weight);
      continue;
    }
    const family = resolveFamilyName(familyMatch[1], siteMap, mctlMap);
    if (family === null) {
      blindWeights.add(weight);
      continue;
    }
    pairs.push({ family, weight });
  }
  return { pairs, blindWeights };
}

test('the generated fonts.css declares exactly the three vendored families, Instrument Serif among them', () => {
  const families = new Set(collectFaceRules(fontsCss).map((r) => r.family));
  assert.deepEqual([...families].sort(), ['Instrument Serif', 'JetBrains Mono', 'Onest'].sort());
});

test('the generated fonts.css declares exactly 28 @font-face rules (Onest 400/500/600/700 x4 subsets, JetBrains Mono 400/500 x4 subsets, Instrument Serif 400 normal+italic x2 subsets)', () => {
  const rules = collectFaceRules(fontsCss);
  assert.equal(rules.length, 28);
});

test('every numeric font-weight reachable from site.css and the vendored mctl/global/prose CSS has a matching @font-face weight in the generated fonts.css, per family declared reachable', () => {
  // Every weight that appears anywhere in the vendored/site CSS must be
  // declared by *some* face in fonts.css -- the mechanical proxy this
  // repository can check without per-selector font-family resolution
  // (test/home.test.ts already proves .hero-name's family chain resolves
  // to Onest specifically). font-weight is always set via a
  // --mctl-typography-font-weight-* token (mctl.css defines the tokens;
  // site.css/prose.css consume them), never a literal digit, so the tokens
  // must be resolved first -- without this, the scan below matches nothing
  // and the assertion passes regardless of what fonts.css declares.
  const tokens = collectWeightTokens(vendoredCssFiles[0]);
  const faceWeights = new Set(collectFaceRules(fontsCss).map((r) => r.weight));
  const reachableWeights = new Set<number>();
  for (const css of [stripComments(siteCss), ...vendoredCssFiles]) {
    for (const w of collectFontWeights(css, tokens)) reachableWeights.add(w);
  }
  assert.ok(reachableWeights.size > 0, 'expected at least one resolved font-weight token to be reachable');
  const missing = [...reachableWeights].filter((w) => !faceWeights.has(w));
  assert.deepEqual(missing, [], `font-weight(s) with no matching @font-face in fonts.css: ${missing.join(', ')}`);
});

// A2: family-aware. A rule that resolves its own font-family alongside a
// numeric font-weight must have a matching (family, weight) @font-face in
// fonts.css, not merely a face at that weight under any family -- the gap
// the test above cannot see (JetBrains Mono 600/700 could vanish while
// Onest still declares 600/700, and the family-blind check above would stay
// green).
test('every (family, weight) pair a rule declares together in site.css/mctl/global/prose has a matching @font-face in fonts.css; rules with no family in their own block keep the family-blind assertion', () => {
  const weightTokens = collectWeightTokens(vendoredCssFiles[0]);
  const siteMap = parseCustomProperties(stripComments(siteCss));
  const mctlMap = parseCustomProperties(vendoredCssFiles[0]);
  const faceRules = collectFaceRules(fontsCss);
  const faceWeights = new Set(faceRules.map((r) => r.weight));
  const facePairKeys = new Set(faceRules.map((r) => `${r.family} ${r.weight}`));

  let sawAtLeastOnePair = false;
  for (const css of [stripComments(siteCss), ...vendoredCssFiles]) {
    const { pairs, blindWeights } = collectFamilyWeightPairs(css, weightTokens, siteMap, mctlMap);
    for (const { family, weight } of pairs) {
      sawAtLeastOnePair = true;
      assert.ok(
        facePairKeys.has(`${family} ${weight}`),
        `expected fonts.css to declare an @font-face for family "${family}" at weight ${weight}`,
      );
    }
    for (const weight of blindWeights) {
      assert.ok(faceWeights.has(weight), `expected fonts.css to declare some @font-face at weight ${weight}`);
    }
  }
  assert.ok(sawAtLeastOnePair, 'expected at least one rule to resolve both a font-family and a font-weight in its own block');
});

test('A2a mutation: a synthetic rule declaring font-family: var(--font-mono); font-weight: 600 is reported (JetBrains Mono 600 was pruned)', () => {
  const weightTokens = collectWeightTokens(vendoredCssFiles[0]);
  const siteMap = parseCustomProperties(stripComments(siteCss));
  const mctlMap = parseCustomProperties(vendoredCssFiles[0]);
  const faceRules = collectFaceRules(fontsCss);
  const facePairKeys = new Set(faceRules.map((r) => `${r.family} ${r.weight}`));

  const syntheticCss = `.synthetic { font-family: var(--font-mono); font-weight: var(--mctl-typography-font-weight-semibold); }`;
  const { pairs } = collectFamilyWeightPairs(syntheticCss, weightTokens, siteMap, mctlMap);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].family, 'JetBrains Mono');
  assert.equal(pairs[0].weight, 600);
  assert.ok(
    !facePairKeys.has(`${pairs[0].family} ${pairs[0].weight}`),
    `expected fonts.css to NOT declare JetBrains Mono at weight 600 (pruned in #65) -- the mutation case is vacuous otherwise`,
  );
});

test('A2a control: the same synthetic rule at weight 500 (medium) is not reported', () => {
  const weightTokens = collectWeightTokens(vendoredCssFiles[0]);
  const siteMap = parseCustomProperties(stripComments(siteCss));
  const mctlMap = parseCustomProperties(vendoredCssFiles[0]);
  const faceRules = collectFaceRules(fontsCss);
  const facePairKeys = new Set(faceRules.map((r) => `${r.family} ${r.weight}`));

  const syntheticCss = `.synthetic { font-family: var(--font-mono); font-weight: var(--mctl-typography-font-weight-medium); }`;
  const { pairs } = collectFamilyWeightPairs(syntheticCss, weightTokens, siteMap, mctlMap);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].family, 'JetBrains Mono');
  assert.equal(pairs[0].weight, 500);
  assert.ok(
    facePairKeys.has(`${pairs[0].family} ${pairs[0].weight}`),
    `expected fonts.css to declare JetBrains Mono at weight 500`,
  );
});

test('A2b control: a rule declaring font-weight with no font-family in its own block is treated as family-blind, not dropped', () => {
  const weightTokens = collectWeightTokens(vendoredCssFiles[0]);
  const siteMap = parseCustomProperties(stripComments(siteCss));
  const mctlMap = parseCustomProperties(vendoredCssFiles[0]);
  const syntheticCss = `.synthetic { font-weight: var(--mctl-typography-font-weight-bold); }`;
  const { pairs, blindWeights } = collectFamilyWeightPairs(syntheticCss, weightTokens, siteMap, mctlMap);
  assert.deepEqual(pairs, []);
  assert.ok(blindWeights.has(700));
});

test('public/assets/fonts/ contains exactly the 28 vendored woff2 files, with the pruned weights (Onest 300, JetBrains Mono 600 and 700) absent from disk', () => {
  // The two tests above only look at fonts.css's own content, so a stale or
  // partially-reverted FAMILIES table that still emits the old 40-face CSS
  // (or that leaves an orphaned file the pruned CSS no longer references)
  // would not be caught. This checks the actual committed files.
  const fontsDir = path.join(ROOT, 'public/assets/fonts');
  const woff2Files = readdirSync(fontsDir).filter((f) => f.endsWith('.woff2'));
  assert.equal(
    woff2Files.length,
    28,
    `expected exactly 28 vendored woff2 files, found ${woff2Files.length}: ${woff2Files.join(', ')}`,
  );
  const prunedPatterns = [
    /^onest-[a-z-]+-300-normal\./,
    /^jetbrains-mono-[a-z-]+-600-normal\./,
    /^jetbrains-mono-[a-z-]+-700-normal\./,
  ];
  for (const file of woff2Files) {
    for (const pattern of prunedPatterns) {
      assert.ok(!pattern.test(file), `pruned weight file still present on disk: ${file}`);
    }
  }
});

test('Base.astro renders exactly four rel="preload" font links, each with as="font", type="font/woff2" and crossorigin', () => {
  const preloadTags = baseAstro.match(/<link\s+rel="preload"[^>]*>/g) ?? [];
  assert.equal(preloadTags.length, 4);
  for (const tag of preloadTags) {
    assert.match(tag, /as="font"/);
    assert.match(tag, /type="font\/woff2"/);
    assert.match(tag, /crossorigin/);
    assert.match(tag, /href=\{assets\.preload\./);
  }
});

test('src/data/assets.json preload has exactly the four required keys, each resolving to a file under public/assets/fonts/', () => {
  const keys = Object.keys(assets.preload).sort();
  assert.deepEqual(keys, ['onestCyrillic400', 'onestCyrillic700', 'onestLatin400', 'onestLatin700'].sort());
  for (const href of Object.values(assets.preload)) {
    assert.match(href as string, /^\/assets\/fonts\//);
    const filePath = path.join(ROOT, 'public', (href as string).replace(/^\/+/, ''));
    assert.ok(existsSync(filePath), `preload href ${href} does not resolve to an existing file`);
  }
});

test("site.css declares an 'Onest Fallback' @font-face carrying size-adjust, ascent-override, descent-override and line-gap-override", () => {
  const blockMatch = stripComments(siteCss).match(/@font-face\s*\{\s*font-family:\s*'Onest Fallback';([^}]*)\}/);
  assert.ok(blockMatch, "expected an @font-face rule for 'Onest Fallback' in site.css");
  const block = blockMatch![1];
  assert.match(block, /size-adjust:\s*[\d.]+%;/);
  assert.match(block, /ascent-override:\s*[\d.]+%;/);
  assert.match(block, /descent-override:\s*[\d.]+%;/);
  assert.match(block, /line-gap-override:\s*[\d.]+%;/);
});

test("site.css redefines --font-display so 'Onest Fallback' sits between 'Onest' and the generic system stack", () => {
  const rootMatch = stripComments(siteCss).match(/--font-display:\s*([^;]+);/);
  assert.ok(rootMatch, 'expected a --font-display declaration in site.css');
  const stack = rootMatch![1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  const onestIndex = stack.indexOf('Onest');
  const fallbackIndex = stack.indexOf('Onest Fallback');
  assert.ok(onestIndex !== -1 && fallbackIndex !== -1, `expected both Onest and Onest Fallback in the stack: ${stack.join(', ')}`);
  assert.ok(onestIndex < fallbackIndex, 'Onest must come before Onest Fallback');
  assert.ok(fallbackIndex < stack.length - 1, 'Onest Fallback must be followed by a generic system stack');
});
