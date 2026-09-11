import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { linkColourProblems, parseTokens } from '../scripts/check-contrast.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const siteCss = readFileSync(path.join(ROOT, 'src/styles/site.css'), 'utf8');
const mctlCss = readFileSync(path.join(ROOT, 'public/assets/mctl/mctl.css'), 'utf8');
const tokens = parseTokens(mctlCss);

const SHARED_RULE_RE = /(main a,\s*\nmain a:visited\s*\{\s*\n\s*color:\s*)var\(--accent\)(;)/;
const WHOLE_RULE_RE = /main a,\s*\nmain a:visited\s*\{\s*\n\s*color:\s*var\(--accent\);\s*\n\}\s*\n/;

test('linkColourProblems finds zero problems against the committed site.css and real tokens', () => {
  const problems = linkColourProblems(siteCss, tokens);
  assert.deepEqual(problems, []);
});

test('a literal #0000EE color on "main a" is flagged, naming the dark theme', () => {
  assert.match(siteCss, SHARED_RULE_RE, 'fixture assumption about site.css shape is stale');
  const mutated = siteCss.replace(SHARED_RULE_RE, '$1#0000EE$2');
  assert.notEqual(mutated, siteCss);

  const problems = linkColourProblems(mutated, tokens);
  assert.ok(problems.length > 0, 'expected at least one problem');
  assert.ok(problems.some((p) => p.includes('dark')), 'expected a problem naming the dark theme');
});

test('a literal #551A8B color on "main a:visited" is flagged, naming the dark theme', () => {
  assert.match(siteCss, SHARED_RULE_RE, 'fixture assumption about site.css shape is stale');
  const mutated = siteCss.replace(SHARED_RULE_RE, '$1#551A8B$2');
  assert.notEqual(mutated, siteCss);

  const problems = linkColourProblems(mutated, tokens);
  assert.ok(problems.length > 0, 'expected at least one problem');
  assert.ok(problems.some((p) => p.includes('dark')), 'expected a problem naming the dark theme');
});

test('deleting the whole "main a" rule block is flagged as a missing rule, naming the dark theme', () => {
  assert.match(siteCss, WHOLE_RULE_RE, 'fixture assumption about site.css shape is stale');
  const mutated = siteCss.replace(WHOLE_RULE_RE, '');
  assert.notEqual(mutated, siteCss);

  const problems = linkColourProblems(mutated, tokens);
  assert.ok(problems.length > 0, 'expected at least one problem');
  assert.ok(problems.some((p) => p.includes('dark')), 'expected a problem naming the dark theme');
});
