import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ui } from '../src/i18n/ui.ts';

const APPROACH_PATH = fileURLToPath(new URL('../src/pages/approach.astro', import.meta.url));
const DIAGRAM_PATH = fileURLToPath(new URL('../src/components/CycleDiagram.astro', import.meta.url));
const NAV_PATH = fileURLToPath(new URL('../src/components/Nav.astro', import.meta.url));
const CSS_PATH = fileURLToPath(new URL('../src/styles/site.css', import.meta.url));

const approach = readFileSync(APPROACH_PATH, 'utf8');
const diagram = readFileSync(DIAGRAM_PATH, 'utf8');
const nav = readFileSync(NAV_PATH, 'utf8');
const css = readFileSync(CSS_PATH, 'utf8');

test('approach.astro imports the metrics data file', () => {
  assert.match(approach, /import\s+raw\s+from\s+['"]\.\.\/data\/metrics\.json['"]/);
});

test('every value= prop on a <Stat tag is an expression rooted at metrics.sources.', () => {
  const statTagRe = /<Stat\b[^>]*>/g;
  const statTags = approach.match(statTagRe) ?? [];
  assert.equal(statTags.length, 3, 'expected exactly three <Stat occurrences');
  for (const tag of statTags) {
    const valueMatch = tag.match(/value=\{([^}]+)\}/);
    assert.ok(valueMatch, `<Stat tag has no value= prop: ${tag}`);
    assert.match(valueMatch[1].trim(), /^metrics\.sources\./);
  }
});

test('stripping heading tag names leaves the rendered markup with no digit', () => {
  // Same mechanical proxy as test/home.test.ts: the frontmatter necessarily
  // contains digits (e.g. '../i18n/ui', array indices are not typed here),
  // so this checks only the template region, after stripping <h1>..<h6> tag
  // names (criterion 9).
  const frontmatterEnd = approach.indexOf('\n---', approach.indexOf('---') + 3);
  const template = approach.slice(frontmatterEnd + 4);
  const stripped = template.replace(/<\/?h[1-6]\b/g, '');
  assert.doesNotMatch(stripped, /\d/);
});

test('approach.astro renders exactly three <Details tags, exactly one carrying open, bound to ui.detailsGatesSummary, and none carrying heading', () => {
  const detailsTagRe = /<Details\b[^>]*(?:\/>|>)/g;
  const detailsTags = approach.match(detailsTagRe) ?? [];
  assert.equal(detailsTags.length, 3, 'expected exactly three <Details tags on approach.astro');

  const withOpen = detailsTags.filter((tag) => /\bopen\b/.test(tag));
  assert.equal(withOpen.length, 1, 'expected exactly one <Details tag to carry open');
  assert.match(withOpen[0], /summaryEn=\{ui\.detailsGatesSummary\.en\}/, 'the open block must be bound to ui.detailsGatesSummary');

  const withHeading = detailsTags.filter((tag) => /\bheading\b/.test(tag));
  assert.equal(withHeading.length, 0, 'no <Details tag on approach.astro should carry heading');
});

test('neither approach.astro nor CycleDiagram.astro references --font-editorial', () => {
  assert.doesNotMatch(approach, /--font-editorial/);
  assert.doesNotMatch(diagram, /--font-editorial/);
});

test('neither approach.astro nor CycleDiagram.astro contains a tabindex override', () => {
  assert.doesNotMatch(approach, /tabindex/);
  assert.doesNotMatch(diagram, /tabindex/);
});

test('CycleDiagram.astro does not import metrics.json and renders no <Stat', () => {
  assert.doesNotMatch(diagram, /data\/metrics\.json/);
  assert.doesNotMatch(diagram, /<Stat\b/);
});

test('CycleDiagram.astro contains no colour literal, no style attribute, no raster reference', () => {
  assert.doesNotMatch(diagram, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(diagram, /rgb\(/);
  assert.doesNotMatch(diagram, /hsl\(/);
  assert.doesNotMatch(diagram, /style=/);
  assert.doesNotMatch(diagram, /<image\b/);
  assert.doesNotMatch(diagram, /data:/);
  assert.doesNotMatch(diagram, /xlink:href/);
  assert.doesNotMatch(diagram, /\.(png|jpe?g|gif|webp)\b/i);
});

test('CycleDiagram.astro renders one accessible-name svg template (two variants at build time) with no width/height attribute', () => {
  // The component renders both the wide and narrow variants from a single
  // template via one Array.map, so the *source* carries each of these once;
  // scripts/check-dist.mjs asserts the built page has exactly two of each
  // (one per rendered <svg>), which a source-level test cannot see.
  const countOf = (re: RegExp) => (diagram.match(re) ?? []).length;
  assert.equal(countOf(/role="img"/g), 1);
  assert.equal(countOf(/aria-labelledby=/g), 1);
  assert.equal(countOf(/<title\b/g), 1);
  assert.equal(countOf(/<desc\b/g), 1);
  const svgTags = diagram.match(/<svg\b[^>]*>/gs) ?? [];
  assert.equal(svgTags.length, 1);
  for (const tag of svgTags) {
    assert.doesNotMatch(tag, /\bwidth=/);
    assert.doesNotMatch(tag, /\bheight=/);
    assert.match(tag, /viewBox=/);
  }
});

test('ui.cycleNodes has ten entries per language starting with Issue, and detailsGatesItems has four', () => {
  assert.equal(ui.cycleNodes.en.length, 10);
  assert.equal(ui.cycleNodes.ru.length, 10);
  assert.equal(ui.cycleNodes.en[0], 'Issue');
  assert.equal(ui.cycleNodes.ru[0], 'Issue');
  assert.equal(ui.detailsGatesItems.en.length, 4);
  assert.equal(ui.detailsGatesItems.ru.length, 4);
});

test('ui.detailsStackItems is ui.detailsRunItems plus the four extra items, in both languages', () => {
  const extra = ['Claude Agent SDK', 'release-please', 'Astro', 'nginx'];
  assert.deepEqual(ui.detailsStackItems.en.slice(0, ui.detailsRunItems.en.length), ui.detailsRunItems.en);
  assert.deepEqual(ui.detailsStackItems.en.slice(ui.detailsRunItems.en.length), extra);
  assert.deepEqual(ui.detailsStackItems.ru.slice(0, ui.detailsRunItems.ru.length), ui.detailsRunItems.ru);
  assert.deepEqual(ui.detailsStackItems.ru.slice(ui.detailsRunItems.ru.length), extra);
  assert.equal(ui.detailsStackItems.en.length, 13);
  assert.equal(ui.detailsStackItems.ru.length, 13);
});

test('Nav.astro links the approach entry to /approach/ and no longer to /#approach', () => {
  assert.match(nav, /href="\/approach\/"/);
  assert.doesNotMatch(nav, /\/#approach"/);
});

test('site.css carries the diagram variant breakpoint and fluid sizing rule', () => {
  assert.match(css, /@media \(min-width: 800px\)/);
  assert.match(css, /\.cycle-svg\s*\{[^}]*width:\s*100%[^}]*height:\s*auto/s);
  assert.match(css, /\.cycle-node\.is-gate\s*rect\s*\{[^}]*var\(--accent\)/s);
});
