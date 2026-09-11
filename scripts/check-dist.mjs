#!/usr/bin/env node
// Mechanical gate for three acceptance criteria of issue #6 (P4: Home
// page), modelled on scripts/csp-hash.mjs. Walks dist/ (produced by
// `npm run build`) and exits non-zero, naming the reason, if:
//
//   (a) any file under dist/ ends in .js -- ADR-0002, no client bundles;
//   (b) any dist/**/*.html has an unequal count of class="l en" and
//       class="l ru" -- bilingual parity;
//   (c) dist/index.html is 40960 bytes (40 KB) or larger -- page weight.
//
// This has to run post-build, not from `npm test`: `prebuild` is
// `npm run vendor && npm test`, which runs before `astro build`, so dist/
// does not exist yet at that point.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');
const MAX_INDEX_BYTES = 40 * 1024;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

async function main() {
  let stats;
  try {
    stats = await stat(DIST_DIR);
  } catch {
    stats = null;
  }
  if (!stats || !stats.isDirectory()) {
    console.error(`check-dist: ${DIST_DIR} does not exist; run npm run build first`);
    process.exitCode = 1;
    return;
  }

  const allFiles = await walk(DIST_DIR);
  const problems = [];

  const jsFiles = allFiles.filter((file) => file.endsWith('.js'));
  if (jsFiles.length > 0) {
    for (const file of jsFiles) {
      problems.push(`check-dist: found a .js file under dist/: ${path.relative(ROOT, file)}`);
    }
  }

  const htmlFiles = allFiles.filter((file) => file.endsWith('.html'));
  if (htmlFiles.length === 0) {
    problems.push(`check-dist: no .html files found under ${DIST_DIR}`);
  }
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    const enCount = countOccurrences(html, 'class="l en"');
    const ruCount = countOccurrences(html, 'class="l ru"');
    if (enCount !== ruCount) {
      problems.push(
        `check-dist: ${path.relative(ROOT, file)} has ${enCount} occurrences of class="l en" but ${ruCount} of class="l ru"`,
      );
    }
  }

  const indexPath = path.join(DIST_DIR, 'index.html');
  let indexBytes = null;
  try {
    indexBytes = (await stat(indexPath)).size;
  } catch {
    problems.push(`check-dist: ${path.relative(ROOT, indexPath)} does not exist`);
  }
  if (indexBytes !== null && indexBytes >= MAX_INDEX_BYTES) {
    problems.push(
      `check-dist: dist/index.html is ${indexBytes} bytes, at or over the ${MAX_INDEX_BYTES}-byte cap`,
    );
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    process.exitCode = 1;
    return;
  }

  const enTotal = countOccurrences(await readFile(indexPath, 'utf8'), 'class="l en"');
  const ruTotal = countOccurrences(await readFile(indexPath, 'utf8'), 'class="l ru"');
  console.log(`check-dist: OK -- dist/index.html is ${indexBytes} bytes (cap ${MAX_INDEX_BYTES}), class="l en" x${enTotal}, class="l ru" x${ruTotal}, no .js under dist/`);
}

await main();
