// B1: scripts/check-contrast.mjs and scripts/check-links.mjs each carry an
// isEntryPoint() that must keep its hybrid form -- import.meta.main when
// defined, a realpathSync() comparison of process.argv[1] against
// fileURLToPath(import.meta.url) below it -- rather than drifting to a bare
// process.argv[1] string comparison (not symlink-safe: a symlinked checkout
// would silently skip the check with exit 0) or to import.meta.main with no
// fallback (unavailable before Node 22.18/24.2). This proves the shape by
// isolating the real `function isEntryPoint() { ... }` block out of each
// committed file and asserting on it, and proves the matcher discriminates
// by running it over synthetic bare-form sources.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const FILES = ['scripts/check-contrast.mjs', 'scripts/check-links.mjs', 'scripts/check-headers.mjs'];

/** Isolates the `function isEntryPoint() { ... }` block's source text out
 * of a script's full source, by brace counting from the function keyword. */
function isolateIsEntryPoint(source: string): string {
  const start = source.indexOf('function isEntryPoint()');
  assert.ok(start !== -1, 'expected a `function isEntryPoint()` declaration');
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        i += 1;
        break;
      }
    }
  }
  return source.slice(start, i);
}

/**
 * Reports a problem when `source` (an isEntryPoint() function body) does
 * not carry both halves of the hybrid form: an `import.meta.main` reference,
 * and a `realpathSync(` comparison against `fileURLToPath(import.meta.url)`.
 * Exported locally (not from either script) so the same matcher can be run
 * over both the real files and synthetic bare-form sources, proving it
 * discriminates rather than merely matching everything.
 */
function entryPointProblems(source: string, label: string): string[] {
  const problems: string[] = [];
  const hasImportMetaMain = /import\.meta\.main/.test(source);
  const hasRealpathFallback = /realpathSync\(/.test(source) && /fileURLToPath\(import\.meta\.url\)/.test(source);
  if (!hasImportMetaMain) {
    problems.push(`${label}: isEntryPoint() is missing an import.meta.main check`);
  }
  if (!hasRealpathFallback) {
    problems.push(`${label}: isEntryPoint() is missing a realpathSync() fallback comparison against fileURLToPath(import.meta.url)`);
  }
  return problems;
}

for (const file of FILES) {
  test(`${file}'s isEntryPoint() keeps the hybrid import.meta.main / realpathSync() form`, () => {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    const block = isolateIsEntryPoint(source);
    assert.deepEqual(entryPointProblems(block, file), []);
  });
}

// -- B1a: the matcher discriminates -----------------------------------------

test('entryPointProblems reports a bare process.argv[1] === fileURLToPath(import.meta.url) form (missing import.meta.main)', () => {
  const bareRealpath = `
    function isEntryPoint() {
      return process.argv[1] === fileURLToPath(import.meta.url);
    }
  `;
  const problems = entryPointProblems(bareRealpath, 'synthetic');
  assert.ok(problems.length > 0);
  assert.match(problems.join('\n'), /missing an import\.meta\.main check/);
});

test('entryPointProblems reports a bare import.meta.main form (missing the realpathSync() fallback)', () => {
  const bareImportMetaMain = `
    function isEntryPoint() {
      return import.meta.main;
    }
  `;
  const problems = entryPointProblems(bareImportMetaMain, 'synthetic');
  assert.ok(problems.length > 0);
  assert.match(problems.join('\n'), /missing a realpathSync\(\) fallback/);
});

test('entryPointProblems reports nothing for the correct hybrid form', () => {
  const hybrid = `
    function isEntryPoint() {
      if (typeof import.meta.main !== 'undefined') {
        return import.meta.main;
      }
      if (!process.argv[1]) return false;
      try {
        return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
      } catch {
        return false;
      }
    }
  `;
  assert.deepEqual(entryPointProblems(hybrid, 'synthetic'), []);
});
