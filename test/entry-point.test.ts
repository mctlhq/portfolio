// B1: every scripts/*.mjs whose source carries a top-level
// `if (...) { await main(); }` block must declare an isEntryPoint() in the
// hybrid form -- import.meta.main when defined, a realpathSync() comparison
// of process.argv[1] against fileURLToPath(import.meta.url) below it --
// rather than drifting to a bare process.argv[1] string comparison (not
// symlink-safe: a symlinked checkout would silently skip the check with exit
// 0) or to import.meta.main with no fallback (unavailable before Node
// 22.18/24.2). The set of files to check is derived by scanning
// scripts/*.mjs for that shape, not typed by hand: a hand-typed list was
// wrong once (issue #69 had to add scripts/check-headers.mjs to it) and
// wrong again (issue #75 found it still missing scripts/check-no-metrics.mjs
// and scripts/snapshot-metrics.mjs), so a new script now gets covered the
// day it is written instead of the day someone remembers to edit an array.
// scripts/check-dist.mjs, scripts/csp-hash.mjs, scripts/render-og.mjs and
// scripts/vendor-assets.mjs call an unconditional top-level `await main();`
// with no `if (...)` wrapper -- a different shape -- and are excluded by the
// matcher itself, not by a skip list.
//
// The derivation is asserted at a floor of four files (below today's true
// count of five) plus by name for all five known scripts, so a scan that
// regresses to matching nothing -- or drops one of the five -- fails loudly
// instead of silently reducing coverage. scripts/check-headers.mjs is the
// one whose silent pass would make the build job's only assertion vacuous --
// .github/workflows/build.yml's final step,
// `node scripts/check-headers.mjs http://127.0.0.1:8080`, is that job's sole
// check -- and scripts/check-no-metrics.mjs is the first command `npm test`
// runs. This proves the shape by isolating the real
// `function isEntryPoint() { ... }` block out of each derived file and
// asserting on it, and proves the matcher discriminates by running it over
// synthetic bare-form sources.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const ENTRY_BLOCK_RE = /^if \(.*\) \{\r?\n\s*await main\(\);\r?\n\}/m;
const REQUIRED = [
  'scripts/check-contrast.mjs',
  'scripts/check-links.mjs',
  'scripts/check-headers.mjs',
  'scripts/check-no-metrics.mjs',
  'scripts/snapshot-metrics.mjs',
];
const MIN_DERIVED = 4;

/**
 * Enumerates `scriptsDir` for `.mjs` files whose source carries a top-level
 * `if (...) { await main(); }` block, and returns their repo-relative POSIX
 * paths (`scripts/<name>.mjs`), sorted. Takes the directory as a parameter
 * (rather than reading SCRIPTS_DIR from module scope) so a test can point it
 * at an empty directory and prove the emptiness case actually fires.
 */
function deriveEntryPointScripts(scriptsDir: string): string[] {
  let entries;
  try {
    entries = readdirSync(scriptsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const matches: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) {
      continue;
    }
    const source = readFileSync(path.join(scriptsDir, entry.name), 'utf8');
    if (ENTRY_BLOCK_RE.test(source)) {
      matches.push(`scripts/${entry.name}`);
    }
  }
  return matches.sort();
}

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

// -- B1: the derivation itself is trustworthy --------------------------------

const derived = deriveEntryPointScripts(SCRIPTS_DIR);

test(`the derivation over scripts/*.mjs matches at least ${MIN_DERIVED} files`, () => {
  assert.ok(
    derived.length >= MIN_DERIVED,
    `derivation over scripts/*.mjs matched ${derived.length} file(s), expected at least ${MIN_DERIVED} -- short by ${MIN_DERIVED - derived.length}; the enumeration is broken, not the scripts`,
  );
});

for (const required of REQUIRED) {
  test(`the derivation includes ${required}`, () => {
    assert.ok(
      derived.includes(required),
      `expected ${required} in the derived set, got: ${JSON.stringify(derived)}`,
    );
  });
}

test('deriveEntryPointScripts over an empty directory returns no files', async () => {
  const emptyDir = await mkdtemp(path.join(tmpdir(), 'entry-point-empty-'));
  try {
    assert.deepEqual(deriveEntryPointScripts(emptyDir), []);
  } finally {
    await rm(emptyDir, { recursive: true, force: true });
  }
});

test('the derivation excludes the unconditional-await-main scripts', () => {
  for (const excluded of [
    'scripts/check-dist.mjs',
    'scripts/csp-hash.mjs',
    'scripts/render-og.mjs',
    'scripts/vendor-assets.mjs',
  ]) {
    assert.ok(!derived.includes(excluded), `expected ${excluded} to be excluded from the derived set`);
  }
});

// -- B1: every derived file keeps the hybrid form ----------------------------

for (const file of derived) {
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
