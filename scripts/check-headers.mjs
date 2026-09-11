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

import { scriptSrcHashProblems, staleHashProblems } from '../src/lib/csp.ts';

const [, , baseUrlArg] = process.argv;
if (!baseUrlArg) {
  console.error('check-headers: usage: node scripts/check-headers.mjs <base-url>');
  process.exitCode = 1;
  process.exit(1);
}
const baseUrl = baseUrlArg.replace(/\/$/, '');

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

async function discoverAstroAsset() {
  const res = await fetch(`${baseUrl}/`);
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

async function main() {
  const problems = [];

  const { homePage, ...astroAsset } = await discoverAstroAsset();

  const targets = [
    { path: '/', expectStatus: 200 },
    { path: '/healthz', expectStatus: 200 },
    astroAsset,
    { path: '/this-path-does-not-exist-check-headers', expectStatus: 404 },
  ];

  for (const { path: p, expectStatus } of targets) {
    const url = `${baseUrl}${p}`;
    let res;
    try {
      res = await fetch(url, { method: 'HEAD' });
    } catch (err) {
      problems.push(`${url}: request failed: ${err.message}`);
      console.log(`check-headers: HEAD ${url} -> (request failed)`);
      continue;
    }
    console.log(`check-headers: HEAD ${url} -> ${res.status}`);
    if (res.status !== expectStatus) {
      problems.push(`${url}: status is ${res.status}, expected ${expectStatus}`);
    }
    checkHeaders(url, res.headers, problems);
  }

  const homeCsp = homePage.headers.get('content-security-policy');
  if (homeCsp) {
    problems.push(...staleHashProblems(homeCsp, homePage.html, `${baseUrl}/`));
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

await main();
