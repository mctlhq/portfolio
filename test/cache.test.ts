// Mechanical checks for issue #50 (Q6), "Cache lifetime": nginx.conf gives
// /assets/ and /styles/ a year plus immutable (with the mandatory
// security-headers include), location / carries neither directive, and
// every href in src/data/assets.json is both content-hashed and resolves
// to a real file. test/nginx.test.ts already covers the include-count and
// enumerated-block invariants shared with the other locations; this file
// is scoped to the two new locations' cache directives and the manifest.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const nginxConf = readFileSync(path.join(ROOT, 'nginx.conf'), 'utf8');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'src/data/assets.json'), 'utf8'));

function locationBlock(label: string): string {
  const re = new RegExp(`location ${label.replace(/[/]/g, '\\/')} \\{([\\s\\S]*?)\\n {4}\\}`);
  const match = nginxConf.match(re);
  assert.ok(match, `could not find location ${label} block in nginx.conf`);
  return match![1];
}

for (const label of ['/assets/', '/styles/']) {
  test(`nginx.conf's location ${label} sets expires 1y and Cache-Control public, immutable`, () => {
    const block = locationBlock(label);
    assert.match(block, /expires 1y;/);
    assert.match(block, /add_header Cache-Control "public, immutable" always;/);
  });

  test(`nginx.conf's location ${label} includes security-headers.conf exactly once`, () => {
    const block = locationBlock(label);
    const includeMatches = block.match(/include\s+\/etc\/nginx\/security-headers\.conf;/g) ?? [];
    assert.equal(includeMatches.length, 1);
  });
}

test('nginx.conf location / carries neither expires nor add_header Cache-Control', () => {
  const block = locationBlock('/');
  assert.doesNotMatch(block, /expires/);
  assert.doesNotMatch(block, /add_header Cache-Control/);
});

const HASHED_HREF_RE = /\.[0-9a-f]{8}\.(css|woff2)$/;

test('every href in src/data/assets.json.styles carries an 8-hex content hash and resolves to an existing file', () => {
  assert.equal(assets.styles.length, 5, 'expected exactly five stylesheet hrefs');
  for (const href of assets.styles) {
    assert.match(href, HASHED_HREF_RE, `${href} does not carry an 8-hex content hash`);
    const filePath = path.join(ROOT, 'public', href.replace(/^\/+/, ''));
    assert.ok(existsSync(filePath), `${href} does not resolve to an existing file`);
  }
});

test('every href in src/data/assets.json.preload carries an 8-hex content hash and resolves to an existing file', () => {
  const hrefs = Object.values(assets.preload) as string[];
  assert.equal(hrefs.length, 4, 'expected exactly four preload hrefs');
  for (const href of hrefs) {
    assert.match(href, HASHED_HREF_RE, `${href} does not carry an 8-hex content hash`);
    const filePath = path.join(ROOT, 'public', href.replace(/^\/+/, ''));
    assert.ok(existsSync(filePath), `${href} does not resolve to an existing file`);
  }
});

test('src/data/assets.json.styles is ordered mctl, global, prose, fonts, site', () => {
  const names = assets.styles.map((href: string) => {
    const m = href.match(/\/([a-z]+)\.[0-9a-f]{8}\.css$/);
    return m ? m[1] : href;
  });
  assert.deepEqual(names, ['mctl', 'global', 'prose', 'fonts', 'site']);
});
