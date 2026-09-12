// Mechanical checks for issue #50 (Q6), "Cache lifetime": nginx.conf gives
// /assets/ and /styles/ a year plus immutable (with the mandatory
// security-headers include), location / carries neither directive, and
// every href in src/data/assets.json is both content-hashed and resolves
// to a real file. test/nginx.test.ts already covers the include-count and
// enumerated-block invariants shared with the other locations; this file
// is scoped to the two new locations' cache directives and the manifest.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { HASHED_NAME_RE, hashMismatch } from '../src/lib/content-hash.ts';

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

// F1: /assets/fonts/LICENSES/ -- the three unhashed licence texts -- must
// not inherit /assets/'s year-long immutable lifetime, so a corrected
// licence text can actually reach a reader. Excluded by a longer-prefix
// location block rather than hashed: nothing on the site links to it, so a
// hashed URL would be undiscoverable, and hashing it would drag
// public/assets/fonts/LICENSES/ into pruneManaged(), which its own comment
// deliberately excludes.
test("nginx.conf's location /assets/fonts/LICENSES/ exists, includes security-headers.conf exactly once, and carries neither immutable nor max-age=31536000", () => {
  const block = locationBlock('/assets/fonts/LICENSES/');
  const includeMatches = block.match(/include\s+\/etc\/nginx\/security-headers\.conf;/g) ?? [];
  assert.equal(includeMatches.length, 1);
  assert.doesNotMatch(block, /immutable/);
  assert.doesNotMatch(block, /max-age=31536000/);
});

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

// The immutable, year-long Cache-Control on /assets/ and /styles/ (asserted
// above) relies entirely on the embedded 8-hex segment tracking the file's
// real bytes -- scripts/vendor-assets.mjs's emit() derives it as
// sha256(bytes).slice(0, 8). If that derivation ever drifted (stale cache,
// wrong buffer, truncated hash), a reader would be stranded on stale bytes
// for a year with no cache-buster to escape it, and nothing above would
// catch it since those tests only check the hash's shape, not its value.
const HASHED_HREF_CAPTURE_RE = /\.([0-9a-f]{8})\.(?:css|woff2)$/;

test('every hashed href in src/data/assets.json actually hashes to its own file bytes', () => {
  const hrefs = [...assets.styles, ...(Object.values(assets.preload) as string[])];
  assert.ok(hrefs.length > 0, 'expected at least one hashed href to verify');
  for (const href of hrefs) {
    const match = href.match(HASHED_HREF_CAPTURE_RE);
    assert.ok(match, `${href} does not carry an 8-hex content hash`);
    const filePath = path.join(ROOT, 'public', href.replace(/^\/+/, ''));
    const actualHash = createHash('sha256').update(readFileSync(filePath)).digest('hex').slice(0, 8);
    assert.equal(
      actualHash,
      match![1],
      `${href}'s embedded hash ${match![1]} does not match its file's actual SHA-256 (${actualHash})`,
    );
  }
});

test('src/data/assets.json.styles is ordered mctl, global, prose, fonts, site', () => {
  const names = assets.styles.map((href: string) => {
    const m = href.match(/\/([a-z]+)\.[0-9a-f]{8}\.css$/);
    return m ? m[1] : href;
  });
  assert.deepEqual(names, ['mctl', 'global', 'prose', 'fonts', 'site']);
});

// A3: the #66 tests above only cover the 9 hrefs src/data/assets.json names
// (5 styles + 4 preload). The 24 .woff2 files that only fonts.<hash>.css
// references, and fonts.<hash>.css itself, sit outside that set -- a
// diverged byte in any of them would carry nginx's year-long immutable
// Cache-Control on stale content and nothing above would catch it. This
// walks every content-hashed file actually committed under public/assets/
// and checks each one against its own name, using the same predicate
// scripts/vendor-assets.mjs, scripts/check-dist.mjs and
// scripts/check-headers.mjs share via src/lib/content-hash.ts.
function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

test('every content-hashed file under public/assets/ hashes to its own name (24 .woff2 files and fonts.<hash>.css included)', () => {
  const assetsDir = path.join(ROOT, 'public/assets');
  const hashedFiles = walkFiles(assetsDir).filter((f) => HASHED_NAME_RE.test(path.basename(f)));
  assert.ok(hashedFiles.length >= 29, `expected at least 29 hashed files under public/assets/, found ${hashedFiles.length}`);
  for (const file of hashedFiles) {
    const bytes = readFileSync(file);
    const mismatch = hashMismatch(path.basename(file), bytes);
    assert.equal(mismatch, null, mismatch ?? undefined);
  }
});
