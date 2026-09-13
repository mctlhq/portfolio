// Mutation-proof coverage for src/lib/csp.ts (issue #45): a CSP hash source
// is valid only when quoted, so scripts/csp-hash.mjs must emit
// `'sha256-<base64>'` and scripts/check-headers.mjs must reject anything
// less than a full match -- not merely a `sha256-` substring. Every failing
// case here asserts on the message text (assert.match), not only on array
// length, so a refactor that quietly turns the check back into a substring
// test fails here too.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractInlineScripts,
  hashToken,
  scriptSrcHashProblems,
  scriptSrcTokens,
  sha256Base64,
  staleHashProblems,
} from '../src/lib/csp.ts';

const BODY = "document.documentElement.dataset.theme='dark';";
const TOKEN = hashToken(sha256Base64(BODY));

function csp(scriptSrc: string): string {
  return (
    `default-src 'self'; script-src 'self' ${scriptSrc}; style-src 'self'; font-src 'self'; ` +
    `img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
  );
}

// -- T1: quoting, proven by mutation in both directions --------------------

test('scriptSrcHashProblems returns [] for a correctly quoted hash', () => {
  assert.deepEqual(scriptSrcHashProblems(csp(TOKEN), 'label'), []);
});

test('scriptSrcHashProblems reports the offending token when the surrounding quotes are stripped', () => {
  const unquoted = TOKEN.slice(1, -1); // strip both single quotes
  const problems = scriptSrcHashProblems(csp(unquoted), 'label');
  assert.ok(problems.length > 0);
  assert.match(problems.join('\n'), new RegExp(unquoted.replace(/[+/]/g, '\\$&')));
});

test('scriptSrcHashProblems reports exactly the unquoted token in a mixed list, not the quoted one', () => {
  const good = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='";
  const badUnquoted = 'sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=';
  const problems = scriptSrcHashProblems(csp(`${good} ${badUnquoted}`), 'label');
  const joined = problems.join('\n');
  assert.match(joined, /sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=/);
  assert.ok(
    !problems.some((p) => p.includes(good)),
    'the correctly quoted token must not be reported',
  );
});

// -- T2: all three algorithms and malformed shapes --------------------------

test('scriptSrcHashProblems reports an unquoted sha384- token', () => {
  const token = 'sha384-' + 'A'.repeat(64) + '==';
  const problems = scriptSrcHashProblems(csp(token), 'label');
  assert.match(problems.join('\n'), /sha384-A+==/);
});

test('scriptSrcHashProblems reports an unquoted sha512- token', () => {
  const token = 'sha512-' + 'A'.repeat(88);
  const problems = scriptSrcHashProblems(csp(token), 'label');
  assert.match(problems.join('\n'), /sha512-A+/);
});

test('scriptSrcHashProblems reports a token quoted on only one side (leading quote missing)', () => {
  const token = 'sha256-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=' + "'";
  const problems = scriptSrcHashProblems(csp(token), 'label');
  assert.match(problems.join('\n'), /sha256-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=/);
});

test('scriptSrcHashProblems reports a token quoted on only one side (trailing quote missing)', () => {
  const token = "'" + 'sha256-DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD=';
  const problems = scriptSrcHashProblems(csp(token), 'label');
  assert.match(problems.join('\n'), /sha256-DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD=/);
});

test("scriptSrcHashProblems does not report 'self', 'none' or a plain host token", () => {
  assert.deepEqual(
    scriptSrcHashProblems(csp(`${TOKEN} 'self' 'none' example.com`), 'label'),
    [],
  );
});

test('scriptSrcHashProblems reports a script-src with no hash token at all', () => {
  const problems = scriptSrcHashProblems(csp("'self'"), 'label');
  assert.ok(problems.length > 0);
  assert.match(problems.join('\n'), /no hash source/);
});

test('scriptSrcHashProblems reports a header with no script-src directive', () => {
  const noScriptSrc = "default-src 'self'; style-src 'self'";
  const problems = scriptSrcHashProblems(noScriptSrc, 'label');
  assert.ok(problems.length > 0);
  assert.match(problems.join('\n'), /no script-src directive/);
});

// -- T3: end-to-end staleness ------------------------------------------------

const FIXTURE_HTML = `<!doctype html><html><head><script>${BODY}</script></head><body></body></html>`;

test('staleHashProblems returns [] when the CSP carries the hash of the inline script actually served', () => {
  assert.deepEqual(staleHashProblems(csp(TOKEN), FIXTURE_HTML, 'label'), []);
});

test('staleHashProblems names both the expected and the found token for a stale hash', () => {
  const staleToken = "'sha256-EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE='";
  const problems = staleHashProblems(csp(staleToken), FIXTURE_HTML, 'label');
  assert.ok(problems.length > 0);
  const joined = problems.join('\n');
  assert.match(joined, new RegExp(TOKEN.replace(/[+/]/g, '\\$&')));
  assert.match(joined, /EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE=/);
});

// -- A1: a guard that reports success without having checked anything ------
// staleHashProblems() must not return [] merely because it found zero
// inline <script> bodies to hash -- that shape (an "OK" that never compared
// a hash) is exactly what let portfolio#45 ship a CSP that disabled the
// site's only script while this guard stayed green.

test('staleHashProblems reports a problem naming the label when the HTML has no <script> element at all', () => {
  const noScriptHtml = '<!doctype html><html><head></head><body><p>no script here</p></body></html>';
  const problems = staleHashProblems(csp(TOKEN), noScriptHtml, 'my-label');
  assert.ok(problems.length > 0);
  assert.match(problems.join('\n'), /my-label: CSP hash was not compared -- no inline <script> body found/);
});

test('staleHashProblems reports a problem when the HTML has only <script src="..."> (no inline body)', () => {
  const externalOnlyHtml =
    '<!doctype html><html><head><script src="/foo.js"></script></head><body></body></html>';
  const problems = staleHashProblems(csp(TOKEN), externalOnlyHtml, 'my-label');
  assert.ok(problems.length > 0);
  assert.match(problems.join('\n'), /my-label: CSP hash was not compared -- no inline <script> body found/);
});

test('staleHashProblems still returns [] for the existing single-inline-script fixture', () => {
  assert.deepEqual(staleHashProblems(csp(TOKEN), FIXTURE_HTML, 'label'), []);
});

// -- T4: generator contract ---------------------------------------------------

test('hashToken output starts and ends with a single quote', () => {
  const token = hashToken('abc');
  assert.equal(token.at(0), "'");
  assert.equal(token.at(-1), "'");
  assert.equal(token, "'sha256-abc'");
});

test('extractInlineScripts ignores <script src=...> and captures an inline body', () => {
  const html =
    '<script src="/foo.js"></script>' +
    `<script>${BODY}</script>` +
    '<script type="module" src="/bar.js"></script>';
  assert.deepEqual(extractInlineScripts(html), [BODY]);
});

test('scriptSrcTokens returns null when there is no script-src directive', () => {
  assert.equal(scriptSrcTokens("default-src 'self'"), null);
});

test('scriptSrcTokens splits the directive on whitespace', () => {
  assert.deepEqual(scriptSrcTokens(`script-src 'self' ${TOKEN}`), ["'self'", TOKEN]);
});

// -- T5: application/ld+json is data, not script (issue #88, Q13) -----------

test('extractInlineScripts ignores a <script type="application/ld+json"> body', () => {
  const html = `<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>`;
  assert.deepEqual(extractInlineScripts(html), []);
});

test('extractInlineScripts still captures the executable inline script when a ld+json block is also present', () => {
  const html =
    `<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>` +
    `<script>${BODY}</script>`;
  assert.deepEqual(extractInlineScripts(html), [BODY]);
});

test('staleHashProblems returns [] for a fixture carrying both an executable inline script and a ld+json block', () => {
  const html =
    `<!doctype html><html><head>` +
    `<script>${BODY}</script>` +
    `<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>` +
    `</head><body></body></html>`;
  assert.deepEqual(staleHashProblems(csp(TOKEN), html, 'label'), []);
});
