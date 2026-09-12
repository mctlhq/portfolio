import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SOURCE_PATH = fileURLToPath(new URL('../src/pages/index.astro', import.meta.url));
const source = readFileSync(SOURCE_PATH, 'utf8');

test('index.astro imports the metrics data file', () => {
  assert.match(source, /import\s+raw\s+from\s+['"]\.\.\/data\/metrics\.json['"]/);
});

test('every value= prop on a <Stat tag is an expression rooted at metrics.sources.', () => {
  const statTagRe = /<Stat\b[^>]*>/g;
  const statTags = source.match(statTagRe) ?? [];
  assert.equal(statTags.length, 4, 'expected exactly four <Stat occurrences');
  for (const tag of statTags) {
    const valueMatch = tag.match(/value=\{([^}]+)\}/);
    assert.ok(valueMatch, `<Stat tag has no value= prop: ${tag}`);
    assert.match(valueMatch[1].trim(), /^metrics\.sources\./);
  }
});

test('stripping heading tag names leaves the rendered markup with no digit', () => {
  // Checked against the template (everything after the frontmatter fence),
  // not the whole file: the frontmatter necessarily imports from
  // '../i18n/ui' and '../i18n/Lang.astro', and "i18n" itself contains the
  // digits 1 and 8 -- a directory name, not a typed metric value. The EARS
  // criterion ("no digit ... other than digits in HTML heading element
  // names") is the mechanical proxy for "no metric value is typed into the
  // page", so this asserts against the markup the page actually renders.
  const frontmatterEnd = source.indexOf('\n---', source.indexOf('---') + 3);
  const template = source.slice(frontmatterEnd + 4);
  const stripped = template.replace(/<\/?h[1-6]\b/g, '');
  assert.doesNotMatch(stripped, /\d/);
});

test('the placeholder #work and #approach sections are gone', () => {
  assert.doesNotMatch(source, /id="work"/);
  assert.doesNotMatch(source, /id="approach"/);
});

test('index.astro renders exactly three <Details tags, every one carrying heading, and exactly one carrying open, bound to ui.detailsContactSummary', () => {
  const detailsTagRe = /<Details\b[^>]*(?:\/>|>)/g;
  const detailsTags = source.match(detailsTagRe) ?? [];
  assert.equal(detailsTags.length, 3, 'expected exactly three <Details tags on index.astro');

  const withHeading = detailsTags.filter((tag) => /\bheading\b/.test(tag));
  assert.equal(withHeading.length, 3, 'expected every <Details tag to carry the heading prop');

  const withOpen = detailsTags.filter((tag) => /\bopen\b/.test(tag));
  assert.equal(withOpen.length, 1, 'expected exactly one <Details tag to carry open');
  assert.match(withOpen[0], /summaryEn=\{ui\.detailsContactSummary\.en\}/, 'the open block must be bound to ui.detailsContactSummary');
});

test('both CTAs link to their trailing-slash paths', () => {
  assert.match(source, /href="\/work\/"/);
  assert.match(source, /href="\/colophon\/"/);
});

test('the hero name renders through <Lang> bound to ui.heroName, with no literal name in the template', () => {
  const frontmatterEnd = source.indexOf('\n---', source.indexOf('---') + 3);
  const template = source.slice(frontmatterEnd + 4);

  assert.match(
    template,
    /<h1\s+class="hero-name"><Lang\s+en=\{ui\.heroName\.en\}\s+ru=\{ui\.heroName\.ru\}\s*\/>\s*<\/h1>/,
    'expected <h1 class="hero-name"> to wrap a <Lang en={ui.heroName.en} ru={ui.heroName.ru} /> element',
  );

  // The <Base description="..."> attribute is untouched, out-of-scope prose
  // (see requirements.md / design.md: "the description prop ... does not
  // trip this") and is the one place in the template still allowed to spell
  // the name out, since <meta description> is a single string, not a
  // toggled pair. Strip only that attribute's value before checking that no
  // other part of the template holds the name as a literal.
  const withoutDescription = template.replace(/description="[^"]*"/, 'description=""');
  assert.doesNotMatch(withoutDescription, /Dmitrii Mashkov/, 'the template must not hold the name as a literal string');
  assert.doesNotMatch(withoutDescription, /Дмитрий Машков/, 'the template must not hold the name as a literal string');
});

/**
 * Parses `--name: value;` custom-property declarations out of a CSS text
 * into a Map, first declaration wins. Used to resolve the var(--...) chain
 * for .hero-name's font-family without hard-coding the expected value.
 */
function parseCustomProperties(css) {
  const map = new Map();
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(css))) {
    if (!map.has(m[1])) map.set(m[1], m[2].trim());
  }
  return map;
}

/**
 * Repeatedly substitutes a value that is exactly `var(--some-name)` with
 * that property's declared value, until the value is no longer a single
 * var() reference (i.e. it is a literal font stack). Throws if a
 * referenced custom property is undefined or the chain cycles.
 */
function resolveVarChain(value, map) {
  let current = value.trim();
  const seen = new Set();
  for (;;) {
    const varMatch = current.match(/^var\(\s*(--[a-zA-Z0-9-]+)\s*\)$/);
    if (!varMatch) return current;
    const name = varMatch[1];
    if (seen.has(name)) throw new Error(`circular var() reference resolving ${name}`);
    seen.add(name);
    if (!map.has(name)) throw new Error(`custom property ${name} is not declared in mctl.css`);
    current = map.get(name).trim();
  }
}

/** Isolates the `{ ... }` block of a single top-level CSS rule by exact selector. */
function isolateRuleBlock(css, selector) {
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(css))) {
    const selectors = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (selectors.includes(selector)) return m[2];
  }
  return null;
}

const siteCss = readFileSync(path.join(ROOT, 'src/styles/site.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const mctlCss = readFileSync(path.join(ROOT, 'public/assets/mctl/mctl.css'), 'utf8');
const customProperties = parseCustomProperties(mctlCss);

const heroNameRule = isolateRuleBlock(siteCss, '.hero-name');
assert.ok(heroNameRule !== null, 'expected a .hero-name rule in src/styles/site.css');

const fontFamilyMatch = heroNameRule.match(/font-family:\s*([^;]+);/);
assert.ok(fontFamilyMatch, '.hero-name has no font-family declaration');
const resolvedStack = resolveVarChain(fontFamilyMatch[1], customProperties);
const firstFamily = resolvedStack.split(',')[0].trim().replace(/^['"]|['"]$/g, '');

test('.hero-name font-family resolves (through the mctl.css var chain) to a stack whose first family is Onest', () => {
  assert.equal(firstFamily, 'Onest');
});

test('.hero-name references neither Instrument Serif nor --font-editorial', () => {
  assert.doesNotMatch(resolvedStack, /Instrument Serif/);
  assert.doesNotMatch(heroNameRule, /Instrument Serif/);
  assert.doesNotMatch(heroNameRule, /--font-editorial/);
});
