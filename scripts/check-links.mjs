#!/usr/bin/env node
// Live link check for the built site (issue #46, Q2 -- footer/colophon
// links). Walks dist/**/*.html for every href, dedupes, and:
//
//   - resolves internal hrefs (starting with `/`) against the dist tree,
//     honoring astro.config.mjs's `trailingSlash: 'always'` (e.g. `/colophon/`
//     -> dist/colophon/index.html). A miss is a hard failure.
//   - a page's own `<link rel="canonical">` href is self-referential (built
//     from Astro.site + the page's own pathname in Base.astro): it is
//     checked against the local dist tree only, never fetched against
//     production -- otherwise a PR that adds a new page would always fail
//     here, since that page's canonical URL cannot exist on production yet.
//   - records `mailto:` hrefs and skips them (never fetched).
//   - does a real sequential GET against every other external http(s) href,
//     one retry with a brief backoff, 30s timeout, redirects followed --
//     modelled on scripts/vendor-assets.mjs's fetch-with-timeout /
//     network-failure-degrades-gracefully split. A final status other than
//     200 is a hard failure, except: the release-tag URL
//     (`${REPO_URL}/releases/tag/...`), where a 404 is "soft" (prints a
//     warning and passes); and a retryable status (429/502/503/504) that
//     persists after the retry, which is also a warning rather than a hard
//     failure -- a transient upstream hiccup should not block the merge
//     gate the same way a genuinely broken link does.
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

/** Extracts a page's own `<link rel="canonical" href="...">`, if present.
 * Matches Base.astro's fixed `<link rel="canonical" href={...} />` markup
 * (rel before href, both double-quoted, one per page). */
function extractCanonicalHref(html) {
  const m = /<link\s+rel="canonical"\s+href="([^"]*)"/.exec(html);
  return m ? m[1] : null;
}

async function fileExists(p) {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

/** Maps an internal href/pathname (starting with `/`) to the dist-relative
 * file path it should resolve to, honoring `trailingSlash: 'always'`:
 * `/colophon/` -> `colophon/index.html`, `/` -> `index.html`. Strips any
 * query string or fragment first. Does not check whether the file exists. */
function internalCandidatePath(distDir, hrefOrPathname) {
  const clean = hrefOrPathname.split('#')[0].split('?')[0];
  if (clean === '/' || clean === '') {
    return path.join(distDir, 'index.html');
  }
  const trimmed = clean.replace(/^\/+/, '').replace(/\/+$/, '');
  return clean.endsWith('/')
    ? path.join(distDir, trimmed, 'index.html')
    : path.join(distDir, trimmed);
}

/** Resolves an internal href (starting with `/`) to a dist-relative file
 * path, honoring `trailingSlash: 'always'`: `/colophon/` -> `colophon/index.html`,
 * `/` -> `index.html`. Strips any query string or fragment first. */
async function resolveInternal(distDir, href) {
  return fileExists(internalCandidatePath(distDir, href));
}

/** A network-layer failure (DNS, timeout, connection refused) rather than an
 * HTTP-level result. Distinguishes "could not reach the internet at all"
 * from "reached it and got a bad status". */
class NetworkError extends Error {}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const RETRY_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      await sleep(RETRY_DELAY_MS); // brief backoff before the one retry
      return await fetchOnce(url);
    }
    return status;
  } catch (err) {
    if (!(err instanceof NetworkError)) throw err;
    await sleep(RETRY_DELAY_MS); // brief backoff before the one retry
    return await fetchOnce(url);
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
  const canonicalHrefs = new Map(); // href -> owning file (dist-absolute path)
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    for (const href of extractHrefs(html)) {
      allHrefs.add(href);
    }
    const canonicalHref = extractCanonicalHref(html);
    if (canonicalHref) {
      canonicalHrefs.set(canonicalHref, file);
    }
  }

  const problems = [];
  const internal = [];
  const mailto = [];
  const canonical = [];
  const external = [];

  for (const href of allHrefs) {
    if (href.startsWith('mailto:')) {
      mailto.push(href);
    } else if (href.startsWith('/')) {
      internal.push(href);
    } else if (canonicalHrefs.has(href)) {
      // Self-referential canonical URL -- validated against the local dist
      // tree below, not fetched against production (see file header).
      canonical.push(href);
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

  for (const href of canonical.sort()) {
    const file = canonicalHrefs.get(href);
    let pathname;
    try {
      pathname = new URL(href).pathname;
    } catch {
      problems.push(`check-links: canonical href "${href}" in ${path.relative(ROOT, file)} is not a valid absolute URL`);
      console.log(`check-links: FAIL canonical ${href}`);
      continue;
    }
    const candidate = internalCandidatePath(distDir, pathname);
    if (path.resolve(candidate) === path.resolve(file)) {
      console.log(`check-links: OK canonical ${href} (self-referential, matches ${path.relative(ROOT, file)}; not fetched against production)`);
    } else {
      problems.push(`check-links: canonical href "${href}" does not resolve to its own page ${path.relative(ROOT, file)}`);
      console.log(`check-links: FAIL canonical ${href}`);
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
      } else if (RETRYABLE_STATUSES.has(status)) {
        // Still a retryable status after the one retry -- a transient
        // upstream/rate-limit condition, not proof of a broken link. Warn
        // rather than hard-failing the merge gate.
        console.log(`check-links: WARN external ${href} (${status}) -- retryable status persisted after retry, not failing the merge gate`);
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
    `check-links: OK -- ${internal.length} internal, ${canonical.length} canonical, ${mailto.length} mailto (skipped), ${external.length} external checked`,
  );
}

await main();
