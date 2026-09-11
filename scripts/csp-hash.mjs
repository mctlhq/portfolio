#!/usr/bin/env node
// Reads every dist/**/*.html produced by `npm run build`, extracts the text
// content of each inline <script> element, and prints one quoted
// `'sha256-<base64>'` token per unique body on stdout, space-separated if
// more than one -- the form a browser accepts as a CSP hash source. Quoting
// and hashing come from src/lib/csp.ts, the single source of truth shared
// with scripts/check-headers.mjs.
//
// Hashing must happen against dist/, never the .astro source: the hash has
// to cover exactly the bytes the browser receives, and Astro's
// build.compressHTML may alter surrounding whitespace between elements.
//
// AGENTS.md and the P2 proposal fix the site to exactly one inline script
// of at most 400 bytes, so this also doubles as the build-time enforcement
// of that budget: more than one distinct body, or a body over 400 bytes,
// fails the build rather than relying on review.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractInlineScripts, hashToken, sha256Base64 } from '../src/lib/csp.ts';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');
const MAX_BYTES = 400;

async function findHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findHtmlFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const htmlFiles = await findHtmlFiles(DIST_DIR);
  if (htmlFiles.length === 0) {
    console.error(`csp-hash: no .html files found under ${DIST_DIR}; run npm run build first`);
    process.exitCode = 1;
    return;
  }

  const uniqueBodies = new Set();
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    for (const body of extractInlineScripts(html)) {
      uniqueBodies.add(body);
    }
  }

  if (uniqueBodies.size === 0) {
    console.error('csp-hash: found zero inline <script> bodies in dist/');
    process.exitCode = 1;
    return;
  }
  if (uniqueBodies.size > 1) {
    console.error(
      `csp-hash: expected exactly one distinct inline script body, found ${uniqueBodies.size}`,
    );
    process.exitCode = 1;
    return;
  }

  const [body] = uniqueBodies;
  const byteLength = Buffer.byteLength(body, 'utf8');
  if (byteLength > MAX_BYTES) {
    console.error(`csp-hash: inline script is ${byteLength} bytes, over the ${MAX_BYTES}-byte cap`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`${hashToken(sha256Base64(body))}\n`);
}

await main();
