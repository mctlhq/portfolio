// Committed proof for acceptance criterion 7 (issue #65, Q6'): scripts/vendor-assets.mjs's
// verifyExistingTree() must reject a committed tree whose fonts.css is missing an
// @font-face entry that FAMILIES implies. #64's review proved this by a manual mutation
// during review; this test proves it by actually mutating a tree on disk and running the
// real script against it, not by exporting a helper and mutating a string in memory --
// that would test the arithmetic but not the wiring (see design.md's "Alternatives").
//
// scripts/vendor-assets.mjs derives ROOT from `import.meta.url` (`path.resolve(
// fileURLToPath(new URL('.', import.meta.url)), '..')`), so running a *copy* of the
// script scopes every path it touches -- public/, src/data/assets.json, src/styles/ --
// to that copy. The real repository tree is never written to by this test.
//
// Both runs set VENDOR_FORCE_OFFLINE=1, the test seam added to main()'s try block: it
// throws a plain Error (not a ValidationError) as the first statement, which routes
// straight to the network-failure branch and verifyExistingTree(), with no network
// reachable and no registry involved.

import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Copies the committed scripts/, public/, src/data/assets.json and
 * src/styles/site.css into a fresh mkdtemp directory, preserving the
 * relative layout vendor-assets.mjs expects under its own ROOT. Returns the
 * temp directory path; the caller is responsible for removing it. */
async function makeTreeCopy(): Promise<string> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'vendor-assets-test-'));
  await cp(path.join(ROOT, 'scripts'), path.join(tmp, 'scripts'), { recursive: true });
  await cp(path.join(ROOT, 'public'), path.join(tmp, 'public'), { recursive: true });
  await mkdir(path.join(tmp, 'src/data'), { recursive: true });
  await cp(path.join(ROOT, 'src/data/assets.json'), path.join(tmp, 'src/data/assets.json'));
  await mkdir(path.join(tmp, 'src/styles'), { recursive: true });
  await cp(path.join(ROOT, 'src/styles/site.css'), path.join(tmp, 'src/styles/site.css'));
  // scripts/vendor-assets.mjs imports src/lib/content-hash.ts (A3a) --
  // the copy needs it too, at the same relative path.
  await cp(path.join(ROOT, 'src/lib'), path.join(tmp, 'src/lib'), { recursive: true });
  return tmp;
}

function runVendorOffline(tmp: string): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync('node', [path.join(tmp, 'scripts/vendor-assets.mjs')], {
    cwd: tmp,
    env: { ...process.env, VENDOR_FORCE_OFFLINE: '1' },
    encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr ?? '', stdout: result.stdout ?? '' };
}

/** Deletes exactly one `@font-face { ... }` block from the copied fonts.css,
 * located through the copy's own src/data/assets.json (styles[3] is the
 * generated fonts.css by construction -- see vendor-assets.mjs's main()). */
async function deleteOneFontFaceBlock(tmp: string): Promise<void> {
  const manifest = JSON.parse(await readFile(path.join(tmp, 'src/data/assets.json'), 'utf8'));
  const fontsHref = manifest.styles[3] as string;
  const fontsCssPath = path.join(tmp, 'public', fontsHref.replace(/^\/+/, ''));
  const css = await readFile(fontsCssPath, 'utf8');
  const blocks = css.split(/\n\n+/).filter((b) => b.trim().length > 0);
  const faceIndex = blocks.findIndex((b) => b.includes('@font-face'));
  assert.ok(faceIndex !== -1, 'expected at least one @font-face block in the copied fonts.css');
  blocks.splice(faceIndex, 1);
  await writeFile(fontsCssPath, `${blocks.join('\n\n')}\n`, 'utf8');
}

test('control: vendor-assets.mjs against an unmutated copy exits 0 under VENDOR_FORCE_OFFLINE=1', async () => {
  const tmp = await makeTreeCopy();
  try {
    const result = runVendorOffline(tmp);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('mutant: vendor-assets.mjs rejects a fonts.css missing one @font-face block', async () => {
  const tmp = await makeTreeCopy();
  try {
    await deleteOneFontFaceBlock(tmp);
    const result = runVendorOffline(tmp);
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}; stdout: ${result.stdout}`);
    assert.match(result.stderr, /vendor: no valid existing tree/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

/** Appends one byte to a hashed .woff2 file in the copied tree, keeping its
 * filename (and therefore its embedded hash segment) unchanged -- a
 * name/bytes divergence, the exact shape A3a's fix exists to reject.
 * Located through the copy's own src/data/assets.json.preload, which always
 * names at least one hashed .woff2. */
async function corruptOnePreloadedWoff2(tmp: string): Promise<void> {
  const manifest = JSON.parse(await readFile(path.join(tmp, 'src/data/assets.json'), 'utf8'));
  const href = Object.values(manifest.preload)[0] as string;
  const filePath = path.join(tmp, 'public', href.replace(/^\/+/, ''));
  const original = await readFile(filePath);
  await writeFile(filePath, Buffer.concat([original, Buffer.from([0x00])]));
}

test('mutant: vendor-assets.mjs rejects a hashed .woff2 whose bytes no longer match its own name', async () => {
  const tmp = await makeTreeCopy();
  try {
    await corruptOnePreloadedWoff2(tmp);
    const result = runVendorOffline(tmp);
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}; stdout: ${result.stdout}`);
    assert.match(result.stderr, /vendor: no valid existing tree/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

/** A3 (issue #71): points the copied manifest's styles[4] (site.css) at a
 * name that carries no content hash at all, and writes a non-empty file of
 * that exact name -- the shape `nonEmptyHashedFile()` used to accept because
 * `hashMismatch()` returns null both for "matches" and for "nothing to
 * check". Located through the copy's own src/data/assets.json, the same
 * manifest-driven posture as the other two mutants in this file. */
async function unhashSiteCssEntry(tmp: string): Promise<void> {
  const manifestPath = path.join(tmp, 'src/data/assets.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.styles[4] = '/styles/site.css';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await mkdir(path.join(tmp, 'public/styles'), { recursive: true });
  await writeFile(path.join(tmp, 'public/styles/site.css'), 'body { color: red }\n', 'utf8');
}

test('mutant: vendor-assets.mjs rejects a manifest entry whose filename carries no content hash at all', async () => {
  const tmp = await makeTreeCopy();
  try {
    await unhashSiteCssEntry(tmp);
    const result = runVendorOffline(tmp);
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}; stdout: ${result.stdout}`);
    assert.match(result.stderr, /vendor: no valid existing tree/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
