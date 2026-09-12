// Mechanical checks for issue #50 (Q6), "DevLoop diagram": the wide/narrow
// viewBox geometry, and the label-fits-in-box arithmetic for both variants
// and both languages -- an estimated advance width (character count x 0.58
// x font-size) against the box width less 16 units of padding, read from
// the actual component and stylesheet sources rather than hardcoded, so a
// future label or geometry edit that no longer fits fails here instead of
// only being caught by eye. Also covers the visible legend (ui.cycleLegend,
// rendered once per language inside <figure class="cycle">).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ui } from '../src/i18n/ui.ts';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const diagram = readFileSync(path.join(ROOT, 'src/components/CycleDiagram.astro'), 'utf8');
const approach = readFileSync(path.join(ROOT, 'src/pages/approach.astro'), 'utf8');
const siteCss = readFileSync(path.join(ROOT, 'src/styles/site.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const ADVANCE_RATIO = 0.58;
const PADDING = 16;

function functionBody(source: string, name: string): string {
  const re = new RegExp(`function ${name}\\(\\)[^{]*\\{`);
  const start = source.search(re);
  assert.ok(start !== -1, `could not find function ${name}() in CycleDiagram.astro`);
  const openBrace = source.indexOf('{', start);
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(openBrace + 1, i);
    }
  }
  throw new Error(`unbalanced braces in function ${name}()`);
}

function boxWidth(body: string): number {
  const m = body.match(/const w = (\d+);/);
  assert.ok(m, 'could not find "const w = <n>;" in the function body');
  return Number(m![1]);
}

const wideBody = functionBody(diagram, 'buildWide');
const narrowBody = functionBody(diagram, 'buildNarrow');
const wideBoxWidth = boxWidth(wideBody);
const narrowBoxWidth = boxWidth(narrowBody);

/** Extracts the body of a top-level `@media <query> { ... }` block (one
 * level of brace nesting inside is fine), mirroring
 * scripts/check-contrast.mjs's extractAtRuleBlock. Returns `null` if the
 * at-rule is not found. */
function extractAtRuleBlock(css: string, atRuleNeedle: string): { block: string; start: number; end: number } | null {
  const start = css.indexOf(atRuleNeedle);
  if (start === -1) return null;
  const openBrace = css.indexOf('{', start);
  if (openBrace === -1) return null;
  let depth = 0;
  for (let i = openBrace; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return { block: css.slice(openBrace + 1, i), start, end: i + 1 };
      }
    }
  }
  return null;
}

/** Reads the `font-size: <n>px;` declared by a `.cycle-node text { ... }`
 * rule inside `css`. */
function fontSizeFor(css: string, selector: string): number {
  const re = new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{[^}]*font-size:\\s*(\\d+)px`);
  const m = css.match(re);
  assert.ok(m, `could not find a font-size for selector ${selector} in the given CSS`);
  return Number(m![1]);
}

const wideMedia = extractAtRuleBlock(siteCss, '@media (min-width: 800px)');
assert.ok(wideMedia, 'expected an @media (min-width: 800px) block in site.css');
const cssOutsideWideMedia = siteCss.slice(0, wideMedia!.start) + siteCss.slice(wideMedia!.end);

// The base (narrow-effective) rule lives outside the >=800px media block;
// the wide-effective EN size is the override declared inside it.
const narrowFontSize = fontSizeFor(cssOutsideWideMedia, '.cycle-node text');
const wideFontSizeEn = fontSizeFor(wideMedia!.block, '.cycle-node text');
const wideFontSizeRu = fontSizeFor(wideMedia!.block, ":root[data-lang='ru'] .cycle-wide .cycle-node text");

function maxLabelLength(labels: readonly string[]): number {
  return Math.max(...labels.map((l) => l.length));
}

test('wide variant viewBox is "0 0 740 200"', () => {
  const m = wideBody.match(/viewBox:\s*`0 0 \$\{cols\[4\] \+ w \+ 13\} 200`/);
  assert.ok(m, 'expected buildWide() to compute viewBox as `0 0 ${cols[4] + w + 13} 200`');
});

test('narrow variant viewBox width is unchanged (320) and its box is 220 units wide', () => {
  assert.match(narrowBody, /viewBox:\s*`0 0 320 \$\{height\}`/);
  assert.equal(narrowBoxWidth, 220);
});

test('wide variant box width is 130', () => {
  assert.equal(wideBoxWidth, 130);
});

test('wide/EN: the longest cycleNodes.en label fits inside its 130-unit box with 16 units of padding to spare', () => {
  const longest = maxLabelLength(ui.cycleNodes.en);
  const estimate = longest * ADVANCE_RATIO * wideFontSizeEn;
  assert.ok(
    estimate <= wideBoxWidth - PADDING,
    `estimated advance ${estimate} exceeds budget ${wideBoxWidth - PADDING} (label length ${longest}, font-size ${wideFontSizeEn}px)`,
  );
});

test('wide/RU: the longest cycleNodes.ru label fits inside its 130-unit box at the reduced RU font-size', () => {
  const longest = maxLabelLength(ui.cycleNodes.ru);
  const estimate = longest * ADVANCE_RATIO * wideFontSizeRu;
  assert.ok(
    estimate <= wideBoxWidth - PADDING,
    `estimated advance ${estimate} exceeds budget ${wideBoxWidth - PADDING} (label length ${longest}, font-size ${wideFontSizeRu}px)`,
  );
  assert.ok(wideFontSizeRu < wideFontSizeEn, 'the RU wide font-size must be one step smaller than the EN wide font-size');
});

test('narrow/EN and narrow/RU: the longest label fits inside the 220-unit box at the narrow font-size', () => {
  for (const lang of ['en', 'ru'] as const) {
    const longest = maxLabelLength(ui.cycleNodes[lang]);
    const estimate = longest * ADVANCE_RATIO * narrowFontSize;
    assert.ok(
      estimate <= narrowBoxWidth - PADDING,
      `[${lang}] estimated advance ${estimate} exceeds budget ${narrowBoxWidth - PADDING}`,
    );
  }
});

test('ui.cycleLegend has non-empty en and ru copy', () => {
  assert.ok(ui.cycleLegend.en.length > 0);
  assert.ok(ui.cycleLegend.ru.length > 0);
});

test('approach.astro renders ui.cycleLegend as one .l en and one .l ru occurrence inside <figure class="cycle">', () => {
  const figureMatch = approach.match(/<figure class="cycle">[\s\S]*?<\/figure>/);
  assert.ok(figureMatch, 'expected a <figure class="cycle"> element in approach.astro');
  const figure = figureMatch![0];
  assert.match(figure, /<figcaption class="cycle-legend">/);
  assert.match(figure, /<span class="cycle-legend-swatch" aria-hidden="true"><\/span>/);
  assert.match(figure, /ui\.cycleLegend\.en/);
  assert.match(figure, /ui\.cycleLegend\.ru/);
});
