// Coverage for scripts/check-dist.mjs's checkHashedSubresources() (A3b):
// before this cycle it only checked that a /assets/ or /styles/ reference
// was hash-shaped (HASHED_SUFFIX_RE), never that the referenced file exists
// under dist/ or that its bytes actually hash to the segment named in the
// URL. scripts/check-dist.mjs has no isEntryPoint() guard -- it calls
// `await main()` unconditionally at module scope -- so this proves the fix
// by spawning the real script against a temporary, dist/-shaped fixture
// tree (never the real dist/), the same posture test/vendor-assets.test.ts
// already uses for verifyExistingTree(): the script's own ROOT is derived
// from import.meta.url, so running a *copy* scopes every path it touches to
// that copy.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Builds a minimal dist/-shaped fixture tree in a fresh mkdtemp directory:
 * scripts/check-dist.mjs and its src/lib/content-hash.ts dependency, a
 * astro.config.mjs carrying a `site`, empty journal/adr content dirs (so
 * checkColophonPages()'s readdir does not throw), and a dist/index.html
 * referencing one hashed /assets/ subresource. Returns the temp dir path. */
async function makeFixture(assetBytes: Buffer): Promise<string> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'check-dist-test-'));
  await mkdir(path.join(tmp, 'scripts'), { recursive: true });
  await cp(path.join(ROOT, 'scripts/check-dist.mjs'), path.join(tmp, 'scripts/check-dist.mjs'));
  await cp(path.join(ROOT, 'src/lib'), path.join(tmp, 'src/lib'), { recursive: true });
  await writeFile(
    path.join(tmp, 'astro.config.mjs'),
    "export default { site: 'https://example.invalid' };\n",
    'utf8',
  );
  await mkdir(path.join(tmp, 'src/content/journal'), { recursive: true });
  await mkdir(path.join(tmp, 'src/content/adr'), { recursive: true });
  await mkdir(path.join(tmp, 'dist/assets'), { recursive: true });
  await writeFile(path.join(tmp, 'dist/assets/x.deadbeef.css'), assetBytes);
  await writeFile(
    path.join(tmp, 'dist/index.html'),
    '<!doctype html><html><head>' +
      '<link rel="stylesheet" href="/assets/x.deadbeef.css">' +
      '</head><body></body></html>',
    'utf8',
  );
  return tmp;
}

function runCheckDist(tmp: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', [path.join(tmp, 'scripts/check-dist.mjs')], {
    cwd: tmp,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

test('A3b: a hashed /assets/ reference whose file bytes hash differently is reported, naming both hashes', async () => {
  const bytes = Buffer.from('not the bytes deadbeef claims to be', 'utf8');
  const actualHash8 = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  const tmp = await makeFixture(bytes);
  try {
    const result = runCheckDist(tmp);
    assert.notEqual(result.status, 0, `expected a non-zero exit; stdout: ${result.stdout}`);
    assert.match(result.stderr, /\/assets\/x\.deadbeef\.css/);
    assert.match(result.stderr, /deadbeef/);
    assert.match(result.stderr, new RegExp(actualHash8));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('A3b control: a hashed /assets/ reference whose file bytes match its own name is not reported', async () => {
  // Build bytes whose real hash is used as the filename, so the reference is
  // genuinely self-consistent.
  const seed = Buffer.from('genuinely matching bytes', 'utf8');
  const realHash8 = createHash('sha256').update(seed).digest('hex').slice(0, 8);
  const tmp = await mkdtemp(path.join(tmpdir(), 'check-dist-test-'));
  try {
    await mkdir(path.join(tmp, 'scripts'), { recursive: true });
    await cp(path.join(ROOT, 'scripts/check-dist.mjs'), path.join(tmp, 'scripts/check-dist.mjs'));
    await cp(path.join(ROOT, 'src/lib'), path.join(tmp, 'src/lib'), { recursive: true });
    await writeFile(
      path.join(tmp, 'astro.config.mjs'),
      "export default { site: 'https://example.invalid' };\n",
      'utf8',
    );
    await mkdir(path.join(tmp, 'src/content/journal'), { recursive: true });
    await mkdir(path.join(tmp, 'src/content/adr'), { recursive: true });
    await mkdir(path.join(tmp, 'dist/assets'), { recursive: true });
    await writeFile(path.join(tmp, `dist/assets/x.${realHash8}.css`), seed);
    await writeFile(
      path.join(tmp, 'dist/index.html'),
      '<!doctype html><html><head>' +
        `<link rel="stylesheet" href="/assets/x.${realHash8}.css">` +
        '</head><body></body></html>',
      'utf8',
    );
    const result = runCheckDist(tmp);
    assert.doesNotMatch(result.stderr, new RegExp(`x\\.${realHash8}\\.css.*does not match`));
    assert.doesNotMatch(result.stderr, /does not exist under dist/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
