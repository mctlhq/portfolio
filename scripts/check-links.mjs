#!/usr/bin/env node
// Live link check for the built site (issue #46, Q2 -- footer/colophon
// links). Walks dist/**/*.html for every href, dedupes, and:
//
//   - resolves internal hrefs (starting with `/`) against the dist tree,
//     honoring astro.config.mjs's `trailingSlash: 'always'` (e.g. `/colophon/`
//     -> dist/colophon/index.html). A miss is a hard failure.
//   - records `mailto:` hrefs and skips them (never fetched).
//   - does a real sequential GET against every external http(s) href, one
//     retry, 30s timeout, redirects followed -- modelled on
//     scripts/vendor-assets.mjs's fetch-with-timeout /
//     network-failure-degrades-gracefully split. A final status other than
//     200 is a hard failure, except the release-tag URL
//     (`${REPO_URL}/releases/tag/...`), which is "soft": a 404 there prints a
//     warning and passes; anything else still fails.
//
// If the request layer itself throws for the whole run (DNS failure,
// timeout, connection refused -- i.e. this sandbox/CI has no route to the
// internet at all), this prints a single note and exits 0: an unreachable
// network is not a broken link.
//
// Usage: node scripts/check-links.mjs <dist-dir>

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_URL } from '../src/lib/links.ts';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const RELEASE_TAG_PREFIX = `${REPO_URL}/releases/tag/`;
const TIMEOUT_MS = 30_000;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

function extractHrefs(html) {
  const hrefs = [];
  const re = /\shref="([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    hrefs.push(m[1]);
  }
  return hrefs;
}

async function fileExists(p) {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

/** Resolves an internal href (starting with `/`) to a dist-relative file
 * path, honoring `trailingSlash: 'always'`: `/colophon/` -> `colophon/index.html`,
 * `/` -> `index.html`. Strips any query string or fragment first. */
async function resolveInternal(distDir, href) {
  const clean = href.split('#')[0].split('?')[0];
  if (clean === '/' || clean === '') {
    return fileExists(path.join(distDir, 'index.html'));
  }
  const trimmed = clean.replace(/^\/+/, '').replace(/\/+$/, '');
  const candidate = clean.endsWith('/')
    ? path.join(distDir, trimmed, 'index.html')
    : path.join(distDir, trimmed);
  return fileExists(candidate);
}

/** A network-layer failure (DNS, timeout, connection refused) rather than an
 * HTTP-level result. Distinguishes "could not reach the internet at all"
 * from "reached it and got a bad status". */
class NetworkError extends Error {}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

async function fetchOnce(url) {
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new NetworkError(`${url}: ${err.message}`);
  }
  return res.status;
}

async function fetchWithRetry(url) {
  try {
    const status = await fetchOnce(url);
    if (RETRYABLE_STATUSES.has(status)) {
      return await fetchOnce(url); // one retry
    }
    return status;
  } catch (err) {
    if (!(err instanceof NetworkError)) throw err;
    return await fetchOnce(url); // one retry
  }
}

async function main() {
  const distArg = process.argv[2];
  if (!distArg) {
    console.error('check-links: usage: node scripts/check-links.mjs <dist-dir>');
    process.exitCode = 1;
    return;
  }
  const distDir = path.resolve(ROOT, distArg);

  let stats;
  try {
    stats = await stat(distDir);
  } catch {
    stats = null;
  }
  if (!stats || !stats.isDirectory()) {
    console.error(`check-links: ${distDir} does not exist; run npm run build first`);
    process.exitCode = 1;
    return;
  }

  const htmlFiles = await walk(distDir);
  const allHrefs = new Set();
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    for (const href of extractHrefs(html)) {
      allHrefs.add(href);
    }
  }

  const problems = [];
  const internal = [];
  const mailto = [];
  const external = [];

  for (const href of allHrefs) {
    if (href.startsWith('mailto:')) {
      mailto.push(href);
    } else if (href.startsWith('/')) {
      internal.push(href);
    } else if (/^https?:\/\//.test(href)) {
      external.push(href);
    }
    // Anything else (relative paths, #fragments-only, other schemes) is
    // outside this check's scope: every internal link on this site is
    // authored root-relative (astro.config.mjs's trailingSlash: 'always').
  }

  for (const href of internal.sort()) {
    const ok = await resolveInternal(distDir, href);
    if (ok) {
      console.log(`check-links: OK internal ${href}`);
    } else {
      problems.push(`check-links: internal href "${href}" does not resolve to a file under ${path.relative(ROOT, distDir)}/`);
      console.log(`check-links: FAIL internal ${href}`);
    }
  }

  for (const href of mailto.sort()) {
    console.log(`check-links: SKIP mailto ${href} (not fetched)`);
  }

  let networkUnreachable = false;
  for (const href of external.sort()) {
    if (networkUnreachable) break;
    try {
      const status = await fetchWithRetry(href);
      const isReleaseTag = href.startsWith(RELEASE_TAG_PREFIX);
      if (status === 200) {
        console.log(`check-links: OK external ${href} (${status})`);
      } else if (isReleaseTag && status === 404) {
        console.log(`check-links: WARN external ${href} (${status}) -- release-tag URL is soft, not yet published`);
      } else {
        problems.push(`check-links: external href "${href}" returned HTTP ${status}, expected 200`);
        console.log(`check-links: FAIL external ${href} (${status})`);
      }
    } catch (err) {
      if (err instanceof NetworkError) {
        console.log('check-links: network unreachable, skipping external checks');
        networkUnreachable = true;
        break;
      }
      throw err;
    }
  }

  if (networkUnreachable && problems.length === 0) {
    process.exitCode = 0;
    return;
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `check-links: OK -- ${internal.length} internal, ${mailto.length} mailto (skipped), ${external.length} external checked`,
  );
}

await main();
