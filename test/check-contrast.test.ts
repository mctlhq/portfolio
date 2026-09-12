// Mutation-proof coverage for the content-link contrast checks in
// scripts/check-contrast.mjs (issue #55, Q2'). `contentLinkProblems` is pure
// and takes the stylesheet text as an argument, so this proves the three
// acceptance-criteria mutations in-process, with no subprocess and no temp
// files: the committed src/styles/site.css passes clean, and each of three
// hand-mutated in-memory copies -- the content-link colour reverted to the
// old UA default, :visited reverted to its old UA default, and the `main a`
// rule deleted outright -- reports at least one problem. A fourth mutation
// deletes the print `--accent` override and asserts the resulting 3.64:1
// failure is reported.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  contentLinkProblems,
  contentLinkReport,
  parseContentLinkColours,
  resolveMctlCssPath,
} from '../scripts/check-contrast.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const siteCssText = readFileSync(path.join(ROOT, 'src/styles/site.css'), 'utf8');
const mctlCssText = readFileSync(await resolveMctlCssPath(), 'utf8');

function parseTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const re = /--(mctl-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    tokens.set(m[1], m[2]);
  }
  return tokens;
}

const tokens = parseTokens(mctlCssText);

test('contentLinkProblems is empty for the committed src/styles/site.css', () => {
  assert.deepEqual(contentLinkProblems({ siteCssText, tokens }), []);
});

// -- C1: report lines, previously computed and discarded --------------------

test('contentLinkReport yields thirteen lines, each matching the report shape, and includes the figures docs/accessibility-checklist.md quotes', () => {
  const report = contentLinkReport({ siteCssText, tokens });
  assert.equal(report.length, 13);
  for (const line of report) {
    assert.match(line, /\[(dark|light|print)\] .* = \d+\.\d\d:1 \(min 4\.5:1, text\)/);
  }
  const joined = report.join('\n');
  assert.match(joined, /4\.81:1/);
  assert.match(joined, /5\.62:1/);
});

test('parseContentLinkColours resolves the committed normal/visited/hover/print colours', () => {
  const parsed = parseContentLinkColours(siteCssText);
  assert.deepEqual(parsed.normal, { kind: 'var', name: '--accent' });
  assert.deepEqual(parsed.visited, { kind: 'var', name: '--accent' });
  assert.deepEqual(parsed.hover, { kind: 'var', name: '--accent-highlight' });
  assert.deepEqual(parsed.print, { kind: 'hex', value: '#b83d28' });
});

test('reverting the content-link colour to #0000EE reports a problem', () => {
  const mutated = siteCssText.replace('main a {\n  color: var(--accent);\n}', 'main a {\n  color: #0000EE;\n}');
  assert.notEqual(mutated, siteCssText, 'mutation did not apply -- selector text drifted from the fixture');
  const problems = contentLinkProblems({ siteCssText: mutated, tokens });
  assert.ok(problems.length > 0);
});

test('reverting the :visited colour to #551A8B reports a problem', () => {
  const mutated = siteCssText.replace(
    'main a:visited:not(:hover) {\n  color: var(--accent);\n}',
    'main a:visited:not(:hover) {\n  color: #551A8B;\n}',
  );
  assert.notEqual(mutated, siteCssText, 'mutation did not apply -- selector text drifted from the fixture');
  const problems = contentLinkProblems({ siteCssText: mutated, tokens });
  assert.ok(problems.length > 0);
});

test('deleting the `main a` rule outright reports a problem', () => {
  const mutated = siteCssText.replace('main a {\n  color: var(--accent);\n}\n', '');
  assert.notEqual(mutated, siteCssText, 'mutation did not apply -- selector text drifted from the fixture');
  const problems = contentLinkProblems({ siteCssText: mutated, tokens });
  assert.ok(problems.length > 0);
});

test('deleting the print --accent override reports the 3.64:1 failure', () => {
  const mutated = siteCssText.replace(
    /\n\s*\/\* --accent resolves to the dark-theme #e25a3c here[\s\S]*?\n\s*--accent: #b83d28;\n/,
    '\n',
  );
  assert.notEqual(mutated, siteCssText, 'mutation did not apply -- print override comment text drifted from the fixture');
  assert.equal(parseContentLinkColours(mutated).print, null);
  const problems = contentLinkProblems({ siteCssText: mutated, tokens });
  assert.ok(problems.length > 0);
  assert.ok(problems.some((p) => p.includes('3.64')), `expected a problem mentioning 3.64:1, got: ${problems.join('\n')}`);
});
