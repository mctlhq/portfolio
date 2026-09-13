import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveMctlCssPath } from '../scripts/check-contrast.mjs';
import { ui } from '../src/i18n/ui.ts';

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

test('index.astro renders exactly two <Details tags, both carrying heading, and none carrying open (issue #98, Q15)', () => {
  const detailsTagRe = /<Details\b[^>]*(?:\/>|>)/g;
  const detailsTags = source.match(detailsTagRe) ?? [];
  assert.equal(detailsTags.length, 2, 'expected exactly two <Details tags on index.astro');

  const withHeading = detailsTags.filter((tag) => /\bheading\b/.test(tag));
  assert.equal(withHeading.length, 2, 'expected every <Details tag to carry the heading prop');

  const withOpen = detailsTags.filter((tag) => /\bopen\b/.test(tag));
  assert.equal(withOpen.length, 0, 'expected no <Details tag to carry open');
});

test('index.astro no longer references ui.ctaColophon or ui.detailsContactSummary anywhere', () => {
  assert.doesNotMatch(source, /ui\.ctaColophon/);
  assert.doesNotMatch(source, /ui\.detailsContactSummary/);
});

test('the .ctas nav holds exactly two <a> elements: cta-primary to #contact, then the plain cta to /work/', () => {
  const navMatch = source.match(/<nav\s+class="ctas"[^>]*>[\s\S]*?<\/nav>/);
  assert.ok(navMatch, 'expected a <nav class="ctas"> element');
  const anchors = navMatch![0].match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
  assert.equal(anchors.length, 2, 'expected exactly two <a> elements inside .ctas');

  assert.match(anchors[0], /class="cta cta-primary"/);
  assert.match(anchors[0], /href="#contact"/);
  assert.match(anchors[0], /ui\.ctaContact\.en/);

  assert.match(anchors[1], /class="cta"/);
  assert.doesNotMatch(anchors[1], /cta-primary/);
  assert.match(anchors[1], /href="\/work\/"/);
  assert.match(anchors[1], /ui\.ctaWork\.en/);
});

test('the #contact section the primary CTA points at is focusable, same pattern as <main id="main" tabindex="-1">', () => {
  // The primary CTA's href="#contact" only meets the "focus moves to the
  // target on activation" half of the fragment-navigation contract if the
  // target itself is focusable -- the same reason Base.astro's skip link
  // target carries tabindex="-1" (see test/nav.test.ts). This pins both the
  // frontmatter constant that carries the literal (kept out of the template
  // so the "no digit in the rendered template" check above does not flag
  // it) and its use on <section id="contact">.
  assert.match(source, /const\s+contactFocusTabIndex\s*=\s*-1\s*;/);
  assert.match(source, /<section\s+id="contact"\s+tabindex=\{contactFocusTabIndex\}>/);
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
const mctlCss = readFileSync(await resolveMctlCssPath(), 'utf8');
// D1: site.css is the declaration the page actually applies -- it redefines
// --font-display (`'Onest', 'Onest Fallback', system-ui, ...`) on top of
// mctl.css's own `--font-display: var(--mctl-typography-font-family-display)`.
// Resolving against mctl.css alone (as before this cycle) would silently miss
// that override and resolve `.hero-name`'s var(--font-display) to whatever
// mctl.css says, not to what the page renders. Building the map from
// mctl.css first, then site.css, makes site.css's declarations win on
// conflict: a plain object/Map spread keeps the *last* occurrence of a
// duplicate key, so site.css has to come second here (the opposite order
// from parseCustomProperties' own "first wins" rule within a single file).
const customProperties = new Map([...parseCustomProperties(mctlCss), ...parseCustomProperties(siteCss)]);

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

// -- Build-backed assertions (issue #98, Q15, task 11) -----------------------
// Follows test/project-card-private.test.ts's pattern: copy the committed
// src/ tree (unmodified -- this proves the real page, not a fixture) into a
// mkdtemp directory, symlink node_modules and public/, and run a real
// `astro build` there once for the whole file (never `npm run build`, whose
// `prebuild` would recurse). Memoised so every test below shares one build.

const ASTRO_BIN = path.join(ROOT, 'node_modules/astro/bin/astro.mjs');

interface BuiltTree {
  indexHtml: string;
  workHtml: string;
  allHtml: Map<string, string>;
}

async function walkHtmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkHtmlFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

let builtTreePromise: Promise<BuiltTree> | null = null;

/** Builds the real, unmodified src/ tree once (memoised across every test
 * in this file) and returns dist/index.html, dist/work/index.html, and a
 * map of every built dist/**\/*.html keyed by its path relative to dist/. */
function builtTree(): Promise<BuiltTree> {
  if (!builtTreePromise) {
    builtTreePromise = (async () => {
      const tmp = await mkdtemp(path.join(tmpdir(), 'home-build-test-'));
      try {
        await cp(path.join(ROOT, 'src'), path.join(tmp, 'src'), { recursive: true });
        await cp(path.join(ROOT, 'astro.config.mjs'), path.join(tmp, 'astro.config.mjs'));
        await cp(path.join(ROOT, 'package.json'), path.join(tmp, 'package.json'));
        await cp(path.join(ROOT, 'tsconfig.json'), path.join(tmp, 'tsconfig.json'));
        await symlink(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
        await symlink(path.join(ROOT, 'public'), path.join(tmp, 'public'));
        const result = spawnSync('node', [ASTRO_BIN, 'build'], { cwd: tmp, encoding: 'utf8' });
        assert.equal(result.status, 0, `expected astro build to pass, stderr: ${result.stderr}`);

        const distDir = path.join(tmp, 'dist');
        const indexHtml = await readFile(path.join(distDir, 'index.html'), 'utf8');
        const workHtml = await readFile(path.join(distDir, 'work', 'index.html'), 'utf8');
        const files = await walkHtmlFiles(distDir);
        const allHtml = new Map<string, string>();
        for (const file of files) {
          allHtml.set(path.relative(distDir, file).split(path.sep).join('/'), await readFile(file, 'utf8'));
        }
        return { indexHtml, workHtml, allHtml };
      } finally {
        await rm(tmp, { recursive: true, force: true });
      }
    })();
  }
  return builtTreePromise;
}

/** Reverses the small set of HTML entities Astro emits into element text
 * (`&`, `<`, `>`, `"`, `'`), mirroring scripts/check-dist.mjs's
 * decodeHtmlEntities, so a string compared against ui.ts's raw copy (e.g.
 * "the team's") matches byte for byte. */
function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** True when `text` appears verbatim inside a `class="l en"` span somewhere
 * in `html` -- the exact shape src/i18n/Lang.astro emits for its `en` prop. */
function hasEnSpan(html: string, text: string): boolean {
  return decodeHtmlEntities(html).includes(`class="l en">${text}<`);
}

/** True when `text` appears verbatim inside a `class="l ru" lang="ru"` span
 * somewhere in `html` -- the exact shape src/i18n/Lang.astro emits for its
 * `ru` prop. */
function hasRuSpan(html: string, text: string): boolean {
  return decodeHtmlEntities(html).includes(`class="l ru" lang="ru">${text}<`);
}

/** Every string this cycle's home page renders through <Lang>, gathered
 * from ui.ts so this list cannot drift from Appendix A by hand-retyping it. */
const NEW_BILINGUAL_STRINGS: readonly string[] = [
  ui.heroEyebrow.en,
  ui.heroEyebrow.ru,
  ...ui.aboutParagraphs.en,
  ...ui.aboutParagraphs.ru,
  ...ui.capabilityItems.en.flatMap((item) => [item.term, item.body]),
  ...ui.capabilityItems.ru.flatMap((item) => [item.term, item.body]),
  ui.contactIntro.en,
  ui.contactIntro.ru,
  ...ui.contactItems.en.flatMap((item) => [item.label, item.text]),
  ...ui.contactItems.ru.flatMap((item) => [item.label, item.text]),
];

/** Extracts every `<details ...>...</details>` element's full markup out of
 * `html`, so "no <details> contains any of the new copy" can be checked
 * against each one individually. */
function extractDetailsBlocks(html: string): string[] {
  return html.match(/<details\b[^>]*>[\s\S]*?<\/details>/g) ?? [];
}

test('dist/index.html carries the eyebrow, in both class="l en" and class="l ru" elements', async () => {
  const { indexHtml } = await builtTree();
  assert.ok(hasEnSpan(indexHtml, ui.heroEyebrow.en), 'missing the EN eyebrow span');
  assert.ok(hasRuSpan(indexHtml, ui.heroEyebrow.ru), 'missing the RU eyebrow span');
});

test('dist/index.html carries each of the three aboutParagraphs, in both languages', async () => {
  const { indexHtml } = await builtTree();
  for (let i = 0; i < ui.aboutParagraphs.en.length; i += 1) {
    assert.ok(hasEnSpan(indexHtml, ui.aboutParagraphs.en[i]), `missing EN aboutParagraphs[${i}]`);
    assert.ok(hasRuSpan(indexHtml, ui.aboutParagraphs.ru[i]), `missing RU aboutParagraphs[${i}]`);
  }
});

test('dist/index.html carries each of the three capabilityItems terms and bodies, in both languages', async () => {
  const { indexHtml } = await builtTree();
  for (let i = 0; i < ui.capabilityItems.en.length; i += 1) {
    assert.ok(hasEnSpan(indexHtml, ui.capabilityItems.en[i].term), `missing EN capabilityItems[${i}].term`);
    assert.ok(hasRuSpan(indexHtml, ui.capabilityItems.ru[i].term), `missing RU capabilityItems[${i}].term`);
    assert.ok(hasEnSpan(indexHtml, ui.capabilityItems.en[i].body), `missing EN capabilityItems[${i}].body`);
    assert.ok(hasRuSpan(indexHtml, ui.capabilityItems.ru[i].body), `missing RU capabilityItems[${i}].body`);
  }
});

test('dist/index.html carries contactIntro and each of the four contactItems texts, in both languages', async () => {
  const { indexHtml } = await builtTree();
  assert.ok(hasEnSpan(indexHtml, ui.contactIntro.en), 'missing EN contactIntro');
  assert.ok(hasRuSpan(indexHtml, ui.contactIntro.ru), 'missing RU contactIntro');
  for (let i = 0; i < ui.contactItems.en.length; i += 1) {
    assert.ok(hasEnSpan(indexHtml, ui.contactItems.en[i].label), `missing EN contactItems[${i}].label`);
    assert.ok(hasRuSpan(indexHtml, ui.contactItems.ru[i].label), `missing RU contactItems[${i}].label`);
    // contactItems.text is identical across languages (Appendix A.9) and is
    // rendered through <Lang en={text} ru={text} />, so it must appear
    // inside both an l en and an l ru element with the same value.
    assert.ok(hasEnSpan(indexHtml, ui.contactItems.en[i].text), `missing EN contactItems[${i}].text`);
    assert.ok(hasRuSpan(indexHtml, ui.contactItems.en[i].text), `missing RU contactItems[${i}].text`);
  }
});

test('dist/index.html renders every one of the four contactItems as an <a href> equal to its href, with visible text equal to its text', async () => {
  const { indexHtml } = await builtTree();
  const decoded = decodeHtmlEntities(indexHtml);
  for (const item of ui.contactItems.en) {
    const anchorRe = new RegExp(`<a href="${item.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">[\\s\\S]*?<\\/a>`);
    const match = decoded.match(anchorRe);
    assert.ok(match, `expected an <a href="${item.href}"> element`);
    assert.ok(match![0].includes(item.text), `expected the anchor for ${item.href} to contain the visible text "${item.text}"`);
  }
});

test('no <details> element on dist/index.html contains any of aboutParagraphs, capabilityItems or contactItems text', async () => {
  const { indexHtml } = await builtTree();
  const decoded = decodeHtmlEntities(indexHtml);
  const detailsBlocks = extractDetailsBlocks(decoded);
  assert.ok(detailsBlocks.length > 0, 'expected at least one <details> element on dist/index.html');
  for (const text of NEW_BILINGUAL_STRINGS) {
    for (const block of detailsBlocks) {
      assert.ok(!block.includes(text), `a <details> element unexpectedly contains: "${text.slice(0, 40)}..."`);
    }
  }
});

test('dist/index.html carries exactly one application/ld+json block, which JSON.parses to the Appendix A.11 Person/WebSite graph', async () => {
  const { indexHtml } = await builtTree();
  const blocks = [...indexHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1, `expected exactly one application/ld+json block, found ${blocks.length}`);

  const parsed = JSON.parse(blocks[0][1]) as { '@context': string; '@graph': Record<string, unknown>[] };
  assert.equal(parsed['@context'], 'https://schema.org');
  assert.equal(parsed['@graph'].length, 2);

  const person = parsed['@graph'][0];
  assert.equal(person['@type'], 'Person');
  assert.equal(person.name, 'Dmitrii Mashkov');
  assert.equal(person.url, 'https://dmitriimashkov.com/');
  assert.equal(person.jobTitle, 'Senior platform engineer');
  assert.equal(person.email, 'mailto:hello@dmitriimashkov.com');
  assert.deepEqual(person.sameAs, [
    'https://www.linkedin.com/in/dmitriimashkov',
    'https://github.com/mctlhq',
    'https://t.me/dmitriimashkov',
  ]);
  assert.deepEqual(Object.keys(person).sort(), ['@type', 'email', 'jobTitle', 'name', 'sameAs', 'url'].sort());

  const site = parsed['@graph'][1];
  assert.equal(site['@type'], 'WebSite');
  assert.equal(site.name, 'Dmitrii Mashkov');
  assert.equal(site.url, 'https://dmitriimashkov.com/');
  assert.equal(site.inLanguage, 'en');
  assert.deepEqual(Object.keys(site).sort(), ['@type', 'inLanguage', 'name', 'url'].sort());
});

test('dist/work/index.html contains https://rewards.mctl.ai', async () => {
  const { workHtml } = await builtTree();
  assert.ok(workHtml.includes('https://rewards.mctl.ai'));
});

// Assembled from parts, not written as one contiguous literal: this file
// lives under test/, which the repository's own grep-for-the-old-host
// verification step walks, and a literal occurrence here would itself be a
// false positive against that check (see test/projects.test.ts's identical
// treatment of REMOVED_SLUGS for the same reason).
const OLD_LOYALTY_HOST = `${['labs', 'mctl', 'loyalty'].join('-')}.mctl.ai`;

test('the old loyalty host appears on no built page', async () => {
  const { allHtml } = await builtTree();
  for (const [rel, html] of allHtml) {
    assert.ok(!html.includes(OLD_LOYALTY_HOST), `${rel} still contains ${OLD_LOYALTY_HOST}`);
  }
});

// D1a: proves the resolved value actually came from site.css's own
// `--font-display` override, not from mctl.css's declaration of the same
// custom property -- 'Onest Fallback' is declared only in site.css
// (:root { --font-display: 'Onest', 'Onest Fallback', system-ui, ... }), so
// a future deletion of that declaration would make this assertion fail
// rather than silently resolve through to whatever mctl.css says instead.
test('the resolved --font-display stack came from site.css, not mctl.css: it contains Onest Fallback', () => {
  assert.match(resolvedStack, /Onest Fallback/);
  assert.equal(customProperties.get('--font-display'), parseCustomProperties(siteCss).get('--font-display'));
});
