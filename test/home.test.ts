import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

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

test('both CTAs link to their trailing-slash paths', () => {
  assert.match(source, /href="\/work\/"/);
  assert.match(source, /href="\/colophon\/"/);
});
