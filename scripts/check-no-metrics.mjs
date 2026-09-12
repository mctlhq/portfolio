#!/usr/bin/env node
// Mechanical gate for the "numbers are never typed into templates or
// content" rule in AGENTS.md. Walks src/pages, src/components and
// src/layouts and fails the run on any occurrence of \b[0-9]{2,}\b -- a
// number of two or more digits -- that is not accounted for as one of two
// kinds:
//
//   RULES: pattern classifiers (an ISO date, a year, a CSS length, a module
//   specifier) applied to the match in its line context. Forward-looking:
//   a rule that currently matches nothing in the tree is fine, since it
//   names a kind of literal the project has decided is not a metric even
//   before one shows up.
//
//   ALLOW: explicit per-file entries, each naming the file, the exact
//   permitted values, and the reason -- for anything a RULES entry cannot
//   classify. A stale ALLOW entry (a listed file that no longer exists, or
//   a listed value that no longer matches anything in that file) is itself
//   a failure, so the allowlist cannot silently outlive the code it
//   excused.
//
// Modelled on scripts/check-dist.mjs: problems accumulated into an array
// and printed together, process.exitCode = 1 rather than process.exit.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN_DIRS = ['src/pages', 'src/components', 'src/layouts'];
const MATCH_RE = /\b[0-9]{2,}\b/g;

// Tier 1: pattern classifiers. Each returns true when it recognizes the
// match at `line[start:end]` as a permitted kind, given the full line for
// context. An unused rule is fine -- these are forward-looking kinds
// AGENTS.md and the issue this gate implements both name explicitly.
export const RULES = [
  {
    reason: 'ISO date',
    test: (line, start, end) => {
      const ISO_RE = /\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))?/g;
      let m;
      while ((m = ISO_RE.exec(line))) {
        if (start >= m.index && end <= m.index + m[0].length) return true;
      }
      return false;
    },
  },
  {
    // Also covers the "2000" segment of xmlns="http://www.w3.org/2000/svg"
    // in src/components/CycleDiagram.astro: the rule classifies on the
    // matched text alone, and 2000 reads as a year regardless of the
    // surrounding markup.
    reason: 'year in copy',
    test: (line, start, end) => /^(19|20)\d{2}$/.test(line.slice(start, end)),
  },
  {
    reason: 'CSS length',
    test: (line, start, end) => /^(px|rem|em|%|vh|vw|ch)\b/.test(line.slice(end)),
  },
  {
    reason: 'module specifier',
    test: (line, start, end) => {
      const SPEC_RE = /\b(?:import\b[^'"]*from|from|require\()\s*['"]([^'"]+)['"]/g;
      let m;
      while ((m = SPEC_RE.exec(line))) {
        const specStart = m.index + m[0].indexOf(m[1]);
        const specEnd = specStart + m[1].length;
        if (start >= specStart && end <= specEnd) return true;
      }
      return false;
    },
  },
];

// Tier 2: explicit per-file allowances for anything a RULES entry cannot
// classify. Regenerated from the tree as it stands at implementation time
// (not copied from any earlier draft): `node scripts/check-no-metrics.mjs`
// itself fails on a stale entry, so this list cannot drift from the code it
// excuses.
export const ALLOW = [
  {
    file: 'src/components/CycleDiagram.astro',
    values: [10, 13, 30, 40, 44, 60, 64, 130, 146, 200, 220, 320],
    reason:
      'SVG geometry for the DevLoop cycle diagram: box width/height, column/row origins, ' +
      'path coordinates and viewBox extent. The component is props-less and never imports ' +
      'src/data/metrics.json, so none of these can be a metric value. See the file header comment.',
  },
  {
    file: 'src/components/CycleDiagram.astro',
    values: [11],
    reason:
      'Cross-reference to "requirements criterion 11" in the file header comment -- not a ' +
      'metric value.',
  },
  {
    file: 'src/layouts/Base.astro',
    values: [64],
    reason:
      'Cross-reference to pull request #64 in the comment above the four font preloads, ' +
      'recording that the latin-only reduction was reviewed and rejected there -- not a ' +
      'metric value.',
  },
];

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
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

async function fileExists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scans every file under `scanDirs` (relative to `root`) for
 * \b[0-9]{2,}\b, classifying each match against `rules` and `allow`.
 * Returns `{ problems, matchCount }`; `problems` is empty when every match
 * is permitted and every allowance was used.
 */
export async function scanForTypedNumbers(root, scanDirs, rules, allow) {
  const problems = [];
  let matchCount = 0;

  const allowByFile = new Map();
  for (const entry of allow) {
    const list = allowByFile.get(entry.file) ?? [];
    list.push(entry);
    allowByFile.set(entry.file, list);
  }
  const usedAllowValues = new Map(); // "file\0value" -> true

  const allFiles = [];
  for (const dir of scanDirs) {
    allFiles.push(...(await walk(path.join(root, dir))));
  }

  for (const absFile of allFiles) {
    const rel = path.relative(root, absFile).split(path.sep).join('/');
    const text = await readFile(absFile, 'utf8');
    const lines = text.split('\n');
    const fileAllows = allowByFile.get(rel) ?? [];

    lines.forEach((line, idx) => {
      MATCH_RE.lastIndex = 0;
      let m;
      while ((m = MATCH_RE.exec(line))) {
        matchCount += 1;
        const start = m.index;
        const end = start + m[0].length;
        const value = Number(m[0]);

        const rule = rules.find((r) => r.test(line, start, end));
        if (rule) continue;

        const allowEntry = fileAllows.find((a) => a.values.includes(value));
        if (allowEntry) {
          usedAllowValues.set(`${rel} ${value}`, true);
          continue;
        }

        problems.push(`${rel}:${idx + 1}: matched "${m[0]}" -- not permitted`);
      }
    });
  }

  for (const entry of allow) {
    if (!(await fileExists(path.join(root, entry.file)))) {
      problems.push(`check-no-metrics: stale ALLOW entry, file no longer exists: ${entry.file}`);
      continue;
    }
    for (const value of entry.values) {
      if (!usedAllowValues.get(`${entry.file} ${value}`)) {
        problems.push(
          `check-no-metrics: stale ALLOW entry, value ${value} no longer matches anything in ${entry.file}`,
        );
      }
    }
  }

  return { problems, matchCount };
}

async function main() {
  const { problems, matchCount } = await scanForTypedNumbers(ROOT, SCAN_DIRS, RULES, ALLOW);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`check-no-metrics: OK -- ${matchCount} matches, all permitted`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
