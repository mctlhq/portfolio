// D1 (issue #71): a raw NUL byte inside a text file makes grep report
// "Binary file ... matches" and silently skip it -- git's own diff view
// still renders it as text (the binary heuristic only reads the first 8 KB),
// so a NUL byte anywhere in the tree is invisible to exactly the tool an
// agent or human reaches for first when sweeping the suite. This walks
// test/, scripts/ and src/, filtered to the extensions actually used there
// (so a vendored binary -- scripts/fonts/*.ttf -- is excluded by
// construction, never by an ad hoc skip list), and asserts no file contains
// a 0x00 byte, naming the file and the byte offset of the first occurrence.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN_DIRS = ['test', 'scripts', 'src'];
const TEXT_EXTENSIONS = new Set(['.ts', '.mjs', '.astro', '.css', '.md', '.json']);

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
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

test('no file under test/, scripts/ or src/ (of the extensions this repo writes as text) contains a raw NUL byte', async () => {
  const problems: string[] = [];
  const allFiles: string[] = [];
  for (const dir of SCAN_DIRS) {
    allFiles.push(...(await walk(path.join(ROOT, dir))));
  }
  const textFiles = allFiles.filter((file) => TEXT_EXTENSIONS.has(path.extname(file)));
  assert.ok(textFiles.length > 0, 'expected at least one text file under test/, scripts/ or src/');

  for (const file of textFiles) {
    const buf = await readFile(file);
    const offset = buf.indexOf(0);
    if (offset !== -1) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      problems.push(`${rel} contains a raw NUL byte at offset ${offset}`);
    }
  }

  assert.deepEqual(problems, [], problems.join('\n'));
});
