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
