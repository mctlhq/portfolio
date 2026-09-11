// Source-level checks for the nginx header extraction (issue #10, P8): the
// eight security headers must be defined exactly once, in
// security-headers.conf, and nginx.conf must include that file at server
// level and in each of its four location blocks rather than repeating any
// add_header line. Runs against the committed config text, not a running
// nginx -- scripts/check-headers.mjs (invoked from CI) is the runtime
// counterpart that proves the include actually resolves.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const nginxConf = readFileSync(path.join(ROOT, 'nginx.conf'), 'utf8');
const securityHeadersConf = readFileSync(path.join(ROOT, 'security-headers.conf'), 'utf8');

const HEADERS = [
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Strict-Transport-Security',
  'Content-Security-Policy',
  'Cross-Origin-Opener-Policy',
  'Cross-Origin-Resource-Policy',
];

function countAddHeader(text: string, header: string): number {
  const re = new RegExp(`add_header\\s+${header}\\b`, 'g');
  return (text.match(re) ?? []).length;
}

test('nginx.conf defines none of the eight security headers directly', () => {
  for (const header of HEADERS) {
    assert.equal(
      countAddHeader(nginxConf, header),
      0,
      `nginx.conf must not add_header ${header} directly; it belongs only in security-headers.conf`,
    );
  }
});

test('security-headers.conf defines each of the eight headers exactly once', () => {
  for (const header of HEADERS) {
    assert.equal(
      countAddHeader(securityHeadersConf, header),
      1,
      `security-headers.conf must add_header ${header} exactly once`,
    );
  }
});

test('the CSP total across both files is exactly 1', () => {
  const total =
    countAddHeader(nginxConf, 'Content-Security-Policy') +
    countAddHeader(securityHeadersConf, 'Content-Security-Policy');
  assert.equal(total, 1);
});

test('nginx.conf includes security-headers.conf exactly once at server level and in each of the four location blocks', () => {
  const includeRe = /include\s+\/etc\/nginx\/security-headers\.conf;/g;
  const includeCount = (nginxConf.match(includeRe) ?? []).length;
  assert.equal(includeCount, 5, 'expected 5 includes: server level plus 4 location blocks');

  const blocks = [
    /server\s*\{[\s\S]*?\n\}/,
    /location\s*=\s*\/healthz\s*\{[\s\S]*?\n {4}\}/,
    /location\s*=\s*\/readyz\s*\{[\s\S]*?\n {4}\}/,
    /location\s*\/_astro\/\s*\{[\s\S]*?\n {4}\}/,
    /location\s*\/\s*\{[\s\S]*?\n {4}\}/,
  ];
  // Each location block (extracted independently below) must itself carry
  // exactly one include; the server block match above is only used for the
  // total count, since its slice also contains every location block.
  for (const label of ['= /healthz', '= /readyz', '/_astro/', '/']) {
    const blockRe = new RegExp(
      `location ${label.replace(/[/]/g, '\\/')} \\{([\\s\\S]*?)\\n {4}\\}`,
    );
    const match = nginxConf.match(blockRe);
    assert.ok(match, `could not find location ${label} block`);
    const includeMatches = match![1].match(includeRe) ?? [];
    assert.equal(includeMatches.length, 1, `location ${label} must include security-headers.conf exactly once`);
  }
});

test('/_astro/ location keeps its own Cache-Control add_header next to the include', () => {
  const blockMatch = nginxConf.match(/location \/_astro\/ \{([\s\S]*?)\n {4}\}/);
  assert.ok(blockMatch);
  assert.match(blockMatch![1], /add_header Cache-Control "public, immutable" always;/);
});

test('location / keeps error_page 404 and try_files', () => {
  const blockMatch = nginxConf.match(/location \/ \{([\s\S]*?)\n {4}\}/);
  assert.ok(blockMatch);
  assert.match(blockMatch![1], /error_page 404 \/404\.html;/);
  assert.match(blockMatch![1], /try_files \$uri \$uri\/index\.html \$uri\.html =404;/);
});

test('the CSP in security-headers.conf carries the hash placeholder, no unsafe-inline and no external origin', () => {
  const cspLine = securityHeadersConf
    .split('\n')
    .find((line) => line.includes('Content-Security-Policy'));
  assert.ok(cspLine, 'no Content-Security-Policy line found in security-headers.conf');
  assert.match(cspLine!, /__SCRIPT_SRC_HASHES__/);
  assert.doesNotMatch(cspLine!, /'unsafe-inline'/);
  assert.doesNotMatch(cspLine!, /https?:\/\//);
});
