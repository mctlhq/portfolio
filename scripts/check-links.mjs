#!/usr/bin/env node
// Internal-only link check (issue #55, Q2', Part 4). Supersedes issue #46 /
// PR #54, whose single requirement -- proving link health by fetching every
// link and checking for HTTP 200 -- made CI flake on shared GitHub Actions
// egress addresses hitting an unauthenticated secondary rate limit,
// unrelated to any defect in this repository. This script issues no network
// request of any kind: it walks the built `dist/` tree, extracts every
// `href` from an `<a>` element and every `<link rel="canonical">`, and
// resolves internal ones against files actually present under `dist/`.
// Off-origin, `mailto:` and other-scheme hrefs are reported as skipped, by
// count and listed, never silently dropped and never counted as checked.
//
// It never opens a socket, never imports a low-level HTTP/TCP client
// module or a third-party HTTP library, never retries or waits between
// attempts, sets no timeout, and consults no status-code table -- see
// docs/link-check.md for what this does and does not prove.

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');
const ASTRO_CONFIG_PATH = path.join(ROOT, 'astro.config.mjs');

/** Reads the `site` origin out of astro.config.mjs (no trailing slash), the
 * same regex scripts/check-dist.mjs uses, so the config stays the single
 * source of truth for what counts as "this origin". */
export async function siteOrigin() {
  const text = await readFile(ASTRO_CONFIG_PATH, 'utf8');
  const match = text.match(/site:\s*['"]([^'"]+)['"]/);
  if (!match) {
    throw new Error('check-links: could not find `site` in astro.config.mjs');
  }
  return match[1].replace(/\/$/, '');
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const A_TAG_RE = /<a\b[^>]*>/gi;
const CANONICAL_TAG_RE = /<link\b[^>]*\brel="canonical"[^>]*>/gi;
const HREF_ATTR_RE = /\shref="([^"]*)"/i;

/** Extracts every `href` from an `<a ...>` element and every
 * `<link rel="canonical" ...>` element in `html`, HTML-entity-decoded. */
export function collectHrefs(html) {
  const hrefs = [];
  for (const m of html.matchAll(A_TAG_RE)) {
    const hrefMatch = m[0].match(HREF_ATTR_RE);
    if (hrefMatch) hrefs.push(decodeEntities(hrefMatch[1]));
  }
  for (const m of html.matchAll(CANONICAL_TAG_RE)) {
    const hrefMatch = m[0].match(HREF_ATTR_RE);
    if (hrefMatch) hrefs.push(decodeEntities(hrefMatch[1]));
  }
  return hrefs;
}

/**
 * Classifies one `href` relative to `origin` (the site's own origin, no
 * trailing slash):
 *
 *   - `{ kind: 'fragment' }` -- a bare `#...` href, which resolves to the
 *     current document; not verified further (no `href="#..."` exists on
 *     the site today, per the proposal's open questions).
 *   - `{ kind: 'skipped', reason: 'mailto' | 'other-scheme' | 'off-origin' }`
 *     -- `mailto:`, any other non-`http(s)` scheme, or an absolute
 *     `http(s)` URL whose origin differs from `origin`.
 *   - `{ kind: 'internal', pathname }` -- a root-relative or relative href,
 *     or an absolute `http(s)` URL whose origin equals `origin` (classified
 *     by origin comparison, never by byte equality with any other string --
 *     an absolute self-link with a fragment, a missing trailing slash, or
 *     appearing on a noindex page with no canonical of its own is routine).
 *     `pathname` still carries any query string and fragment; stripping
 *     those is `resolveInternal`'s job.
 */
export function classifyHref(href, origin) {
  if (href.startsWith('#')) {
    return { kind: 'fragment' };
  }
  if (/^mailto:/i.test(href)) {
    return { kind: 'skipped', reason: 'mailto' };
  }
  if (/^https?:\/\//i.test(href)) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return { kind: 'skipped', reason: 'other-scheme' };
    }
    if (url.origin !== origin) {
      return { kind: 'skipped', reason: 'off-origin' };
    }
    return { kind: 'internal', pathname: `${url.pathname}${url.search}${url.hash}` };
  }
  // Any other URL carrying an explicit scheme (tel:, javascript:, etc.) --
  // anything that is not root-relative/relative and not already handled
  // above.
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return { kind: 'skipped', reason: 'other-scheme' };
  }
  return { kind: 'internal', pathname: href };
}

/**
 * Resolves an internal pathname (already stripped of origin, still possibly
 * carrying a query string and/or fragment) against `distDir`, honouring
 * `trailingSlash: 'always'`: query and fragment are stripped first; a
 * trailing slash resolves to `<path>/index.html`; a path with a file
 * extension resolves to `<path>` as-is; an extensionless, slash-less path
 * tries `<path>/index.html` first, falling back to `<path>`, and both are
 * named in the result either way. Returns `{ ok, candidates }`.
 */
export function resolveInternal(pathname, distDir) {
  let clean = pathname.split('#')[0].split('?')[0];
  if (clean === '') clean = '/';
  const relPath = clean.replace(/^\/+/, '');
  const hasTrailingSlash = clean.endsWith('/');
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(path.posix.basename(clean));

  let candidates;
  if (hasTrailingSlash) {
    candidates = [path.join(distDir, relPath, 'index.html')];
  } else if (hasExtension) {
    candidates = [path.join(distDir, relPath)];
  } else {
    candidates = [path.join(distDir, relPath, 'index.html'), path.join(distDir, relPath)];
  }

  const ok = candidates.some((c) => existsSync(c));
  return { ok, candidates };
}

async function walkHtmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkHtmlFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

/** The pathname `dist/<rel>/index.html` corresponds to, given
 * `trailingSlash: 'always'`: `dist/index.html` -> `/`,
 * `dist/colophon/index.html` -> `/colophon/`. */
function pagePathnameFor(file, distDir) {
  const rel = path.relative(distDir, file).split(path.sep).join('/');
  const withoutIndex = rel.replace(/index\.html$/, '');
  return `/${withoutIndex}`;
}

/**
 * Walks every `dist/**\/*.html` under `distDir`, extracts hrefs, classifies
 * and resolves each one, and returns `{ problems, checked, pages, skipped }`
 * -- `skipped` maps the raw href to how many times it was seen. Nothing
 * skipped is ever counted in `checked`.
 */
export async function run({ distDir, origin }) {
  const files = await walkHtmlFiles(distDir);
  const problems = [];
  const skipped = new Map();
  let checked = 0;

  for (const file of files) {
    const html = await readFile(file, 'utf8');
    const pagePathname = pagePathnameFor(file, distDir);
    const hrefs = collectHrefs(html);

    for (const href of hrefs) {
      const classification = classifyHref(href, origin);

      if (classification.kind === 'fragment') {
        continue;
      }

      if (classification.kind === 'skipped') {
        skipped.set(href, (skipped.get(href) ?? 0) + 1);
        continue;
      }

      let pathname = classification.pathname;
      if (!pathname.startsWith('/')) {
        pathname = new URL(pathname, `http://internal${pagePathname}`).pathname;
      }

      checked += 1;
      const { ok, candidates } = resolveInternal(pathname, distDir);
      if (!ok) {
        const relCandidates = candidates.map((c) => path.relative(ROOT, c));
        problems.push(
          `check-links: ${pagePathname} links to "${href}", which does not resolve to any of: ${relCandidates.join(', ')}`,
        );
      }
    }
  }

  return { problems, checked, pages: files.length, skipped };
}

async function main() {
  if (!existsSync(DIST_DIR)) {
    console.error(`check-links: ${path.relative(ROOT, DIST_DIR)} does not exist; run npm run build first`);
    process.exitCode = 1;
    return;
  }

  const origin = await siteOrigin();
  const { problems, checked, pages, skipped } = await run({ distDir: DIST_DIR, origin });

  const skippedTotal = [...skipped.values()].reduce((sum, count) => sum + count, 0);
  console.log(`check-links: ${pages} pages, ${checked} internal hrefs resolved, ${skippedTotal} skipped`);
  for (const [href, count] of skipped) {
    console.log(`check-links: skipped x${count}: ${href}`);
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    process.exitCode = 1;
    return;
  }

  console.log('check-links: OK -- every internal href resolved to a file under dist/');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
