#!/usr/bin/env node
// Runtime check (issue #10, P8; hash-quoting proof issue #45): HEADs a
// handful of paths against a live instance of the built image and asserts
// every response carries all eight security headers with their expected
// values, the deliberately missing path 404s, and the CSP script-src names
// a validly quoted hash source (not merely a `sha256-` substring, and not
// the build placeholder) and no http(s) origin. It also GETs `/` once, and
// requires the CSP's hash source to equal the SHA-256 of the inline script
// actually served, so a correctly quoted but stale hash fails too. Invoked
// from .github/workflows/build.yml after `docker run`, since nothing in
// `npm test` can start a container -- this is the mechanical form of the
// issue's `curl -sI` criterion and of the deferred item's "every response
// still carries all six [now eight] headers".

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scriptSrcHashProblems, staleHashProblems } from '../src/lib/csp.ts';
import { hashMismatch } from '../src/lib/content-hash.ts';

// baseUrl is read from argv only inside main(), guarded by isEntryPoint()
// below (T8) -- so this module can be imported by node --test (as
// test/check-headers.test.ts does, to exercise discoverHashedAssetPath()
// and discoverStylesPath() as pure functions over fixture markup) without
// exiting the process or requiring a live server.
let baseUrl;

const EXPECTED_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=(), microphone=(), camera=()',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};

// Every page's <head> stylesheets link directly to /assets/ and /styles/
// (public/ files, never bundled), and the site ships no client script, so
// `astro build` currently never writes anything under dist/_astro/ -- the
// `location /_astro/` block in nginx.conf exists defensively for whatever a
// future cycle might put there. Discovery from the home page markup is
// still attempted first (so this keeps working the moment something *does*
// land under /_astro/); the fallback probes a path that is guaranteed not
// to exist and expects 404, which still exercises the location's header set
// via nginx's `add_header ... always`.
const ASTRO_FALLBACK_PATH = '/_astro/probe-check-headers.css';

// B4: mirrors the /_astro/ fallback pattern above for /styles/. Base.astro
// always links assets.json's styles[4] (site.<hash>.css) directly, so
// discovery should normally succeed; the fallback keeps the location's
// header set exercised even if that markup ever changed shape.
const STYLES_FALLBACK_PATH = '/styles/probe-check-headers.css';

/**
 * B3a: GETs `/` and returns `{ path, expectStatus, homePage }` for the
 * `/_astro/` (or fallback) probe target, where `homePage` is
 * `{ html, headers }` on success or `null` when the fetch itself failed --
 * pushed to `problems` as a problem rather than left to throw out of
 * `main()`, so every remaining probe still runs and the report is complete.
 */
async function discoverAstroAsset(problems) {
  let res;
  try {
    res = await fetch(`${baseUrl}/`);
  } catch (err) {
    problems.push(`${baseUrl}/: request failed: ${err.message}`);
    return { path: ASTRO_FALLBACK_PATH, expectStatus: 404, homePage: null };
  }
  const html = await res.text();
  const homePage = { html, headers: res.headers };
  const match = html.match(/\/_astro\/[^"'<>]+/);
  if (!match) {
    console.log(
      `check-headers: no /_astro/ asset found in the home page markup (the build currently emits none); ` +
        `probing ${ASTRO_FALLBACK_PATH} instead to exercise the location's header set`,
    );
    return { path: ASTRO_FALLBACK_PATH, expectStatus: 404, homePage };
  }
  return { path: match[0], expectStatus: 200, homePage };
}

/**
 * Finds one hashed `/assets/...` href in the already-fetched home page
 * markup (issue #50, Q6) -- a stylesheet link is guaranteed present, unlike
 * `/_astro/`. Used to prove nginx's `location /assets/` block actually
 * answers with the year-plus-immutable Cache-Control at runtime, which
 * `test/cache.test.ts` cannot: that test reads nginx.conf's source text,
 * never a live response. B3: returns `null` and pushes a problem instead of
 * throwing, so the caller can skip the asset probe and continue with the
 * remaining checks rather than aborting `main()` before the report prints.
 */
export function discoverHashedAssetPath(html, problems) {
  const match = html.match(/\/assets\/[^"'<>]+\.[0-9a-f]{8}\.(?:css|woff2)/);
  if (!match) {
    problems.push('check-headers: no hashed /assets/ href found in the home page markup');
    return null;
  }
  return match[0];
}

/**
 * B4: finds a hashed `/styles/...` href in the home page markup, falling
 * back to a path guaranteed not to exist under `/styles/` (mirroring
 * `discoverAstroAsset()`'s `/_astro/` fallback above), so nginx's
 * `location /styles/` block -- added in #65, never probed at runtime before
 * this cycle -- gets its eight-header set verified against a live response
 * either way.
 */
export function discoverStylesPath(html) {
  const match = html.match(/\/styles\/[^"'<>]+\.[0-9a-f]{8}\.css/);
  if (!match) {
    console.log(
      `check-headers: no /styles/ href found in the home page markup; ` +
        `probing ${STYLES_FALLBACK_PATH} instead to exercise the location's header set`,
    );
    return { path: STYLES_FALLBACK_PATH, expectStatus: 404 };
  }
  return { path: match[0], expectStatus: 200 };
}

function checkHeaders(url, headers, problems) {
  for (const [name, expected] of Object.entries(EXPECTED_HEADERS)) {
    const actual = headers.get(name);
    if (actual !== expected) {
      problems.push(`${url}: header ${name} is "${actual ?? '(missing)'}", expected "${expected}"`);
    }
  }
  const csp = headers.get('content-security-policy');
  if (!csp) {
    problems.push(`${url}: missing Content-Security-Policy header`);
  } else {
    problems.push(...scriptSrcHashProblems(csp, url));
    if (/https?:\/\//.test(csp)) {
      problems.push(`${url}: CSP names an external http(s) origin: ${csp}`);
    }
  }
}

async function probeAndCheck(problems, path, expectStatus) {
  const url = `${baseUrl}${path}`;
  let res;
  try {
    res = await fetch(url, { method: 'HEAD' });
  } catch (err) {
    problems.push(`${url}: request failed: ${err.message}`);
    console.log(`check-headers: HEAD ${url} -> (request failed)`);
    return;
  }
  console.log(`check-headers: HEAD ${url} -> ${res.status}`);
  if (res.status !== expectStatus) {
    problems.push(`${url}: status is ${res.status}, expected ${expectStatus}`);
  }
  checkHeaders(url, res.headers, problems);
}

async function run() {
  const problems = [];

  const { homePage, ...astroAsset } = await discoverAstroAsset(problems);

  // B4: the /styles/ probe joins the target list so its eight headers are
  // verified at runtime, exactly like /_astro/ and /assets/ already are.
  // Discovery needs the home page markup; with no home page (the fetch to
  // `/` itself failed -- B3a above), fall back to the guaranteed-404 path
  // rather than skip the probe outright, so the location's header set is
  // still exercised.
  const stylesAsset = homePage ? discoverStylesPath(homePage.html) : { path: STYLES_FALLBACK_PATH, expectStatus: 404 };

  const targets = [
    { path: '/', expectStatus: 200 },
    { path: '/healthz', expectStatus: 200 },
    astroAsset,
    stylesAsset,
    { path: '/this-path-does-not-exist-check-headers', expectStatus: 404 },
  ];

  // B4a: every probe's result is reported, in one flat loop, before any
  // exit -- a single failing probe (or the fetch to `/` itself failing)
  // never suppresses the rest.
  for (const { path: p, expectStatus } of targets) {
    await probeAndCheck(problems, p, expectStatus);
  }

  if (homePage) {
    // Cache lifetime (issue #50, Q6): a hashed /assets/ path answers with a
    // year plus immutable, and / -- which keeps its existing, un-hashed
    // cache policy -- carries neither directive. A3c: GETs the body (not
    // just HEADs it) and compares contentHash8(body) to the hash segment
    // embedded in the URL, so a byte-content-hash divergence at runtime --
    // not just a shape-valid URL -- fails this check too. This is a second
    // request against the local container only; it opens no external
    // socket. B3: discoverHashedAssetPath() no longer throws when nothing is
    // found -- it pushes a problem and returns null, and the asset probe is
    // simply skipped so every other check still runs.
    const assetPath = discoverHashedAssetPath(homePage.html, problems);
    let assetRes;
    let assetUrl;
    if (assetPath) {
      assetUrl = `${baseUrl}${assetPath}`;
      try {
        assetRes = await fetch(assetUrl);
      } catch (err) {
        problems.push(`${assetUrl}: request failed: ${err.message}`);
      }
    }
    if (assetRes) {
      console.log(`check-headers: GET ${assetUrl} -> ${assetRes.status}`);
      const cacheControl = assetRes.headers.get('cache-control') ?? '';
      if (!cacheControl.includes('max-age=31536000') || !cacheControl.includes('immutable')) {
        problems.push(
          `${assetUrl}: Cache-Control is "${cacheControl || '(missing)'}", expected it to contain both "max-age=31536000" and "immutable"`,
        );
      }
      const body = Buffer.from(await assetRes.arrayBuffer());
      const mismatch = hashMismatch(assetPath, body);
      if (mismatch) {
        problems.push(`${assetUrl}: ${mismatch}`);
      }
    }
    const homeCacheControl = homePage.headers.get('cache-control') ?? '';
    if (homeCacheControl.includes('max-age=31536000') || homeCacheControl.includes('immutable')) {
      problems.push(`${baseUrl}/: Cache-Control is "${homeCacheControl}", expected it to carry neither "max-age=31536000" nor "immutable"`);
    }

    const homeCsp = homePage.headers.get('content-security-policy');
    if (homeCsp) {
      problems.push(...staleHashProblems(homeCsp, homePage.html, `${baseUrl}/`));
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`check-headers: ${problem}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log('check-headers: OK -- all responses carried the expected headers');
}

/**
 * B3a: wraps the whole run so any residual throw -- from a helper this file
 * does not yet know to guard, or from a future edit that reintroduces one --
 * becomes one final accumulated problem and a non-zero exit, rather than an
 * uncaught rejection that skips the report entirely.
 */
async function main() {
  const [, , baseUrlArg] = process.argv;
  if (!baseUrlArg) {
    console.error('check-headers: usage: node scripts/check-headers.mjs <base-url>');
    process.exitCode = 1;
    return;
  }
  baseUrl = baseUrlArg.replace(/\/$/, '');

  try {
    await run();
  } catch (err) {
    console.error(`check-headers: unhandled error: ${err.message}`);
    process.exitCode = 1;
  }
}

/**
 * True when this module is being run directly (as a CLI entry point)
 * rather than imported, e.g. by a test -- same hybrid form (B1) as
 * scripts/check-contrast.mjs and scripts/check-links.mjs: import.meta.main
 * where defined, falling back to a realpathSync() comparison so a
 * symlinked checkout does not silently skip the check.
 */
function isEntryPoint() {
  if (typeof import.meta.main !== 'undefined') {
    return import.meta.main;
  }
  if (!process.argv[1]) {
    return false;
  }
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  await main();
}
