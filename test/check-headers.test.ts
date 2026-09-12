// B3/B3a/B4: coverage for the pure discovery helpers in
// scripts/check-headers.mjs. discoverHashedAssetPath() used to throw when
// the home page markup carried no hashed /assets/ href, aborting main()
// before the report ever printed; it now pushes a problem and returns null
// so every remaining probe still runs. discoverStylesPath() (B4) mirrors the
// existing /_astro/ fallback pattern for /styles/, which had never been
// probed at runtime before this cycle. scripts/check-headers.mjs carries an
// isEntryPoint() guard (mirroring scripts/check-contrast.mjs and
// scripts/check-links.mjs) specifically so importing it here does not read
// argv or require a live server.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverHashedAssetPath, discoverStylesPath } from '../scripts/check-headers.mjs';

// -- B3: discoverHashedAssetPath ---------------------------------------------

test('discoverHashedAssetPath returns the first hashed /assets/ href found in the markup', () => {
  const html = '<link rel="stylesheet" href="/assets/mctl/mctl.baf7fec1.css">';
  const problems: string[] = [];
  const result = discoverHashedAssetPath(html, problems);
  assert.equal(result, '/assets/mctl/mctl.baf7fec1.css');
  assert.deepEqual(problems, []);
});

test('discoverHashedAssetPath returns null and pushes a problem (never throws) when no hashed /assets/ href is present', () => {
  const html = '<html><head></head><body>no assets here</body></html>';
  const problems: string[] = [];
  const result = discoverHashedAssetPath(html, problems);
  assert.equal(result, null);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no hashed \/assets\/ href found/);
});

// -- B4: discoverStylesPath ---------------------------------------------------

test('discoverStylesPath returns the hashed /styles/ href found in the markup, expecting 200', () => {
  const html = '<link rel="stylesheet" href="/styles/site.555be412.css">';
  const result = discoverStylesPath(html);
  assert.deepEqual(result, { path: '/styles/site.555be412.css', expectStatus: 200 });
});

test('discoverStylesPath selects the guaranteed-404 fallback path when no /styles/ href is present', () => {
  const html = '<html><head></head><body>no styles here</body></html>';
  const result = discoverStylesPath(html);
  assert.equal(result.expectStatus, 404);
  assert.match(result.path, /^\/styles\//);
});
