#!/usr/bin/env node
// Vendors the @mctlhq/css design system and the three OFL font families
// (Onest, Instrument Serif, JetBrains Mono) into public/assets/, with their
// licences, plus a generated public/assets/fonts/fonts.css and a copy of
// src/styles/site.css at public/styles/site.css. Everything under public/
// is committed, so `npm run build` (and the Docker build) works offline.
//
// Fallback note: fonts are resolved from their pinned @fontsource npm
// tarballs rather than scraped from Google's `css2` endpoint, because the
// fontsource artifact is version-pinned and reproducible while a gstatic URL
// embeds a mutable revision segment. If a family/weight/subset combination
// is ever missing from fontsource, css2 is the documented fallback source
// for the same faces (same unicode-range split).
//
// Network handling: this script always attempts a fresh fetch. If the
// network step itself fails (DNS, timeout, connection refused, non-2xx
// response), it falls back to verifying the committed tree already on disk
// and exits 0 if that tree is valid, non-zero otherwise. A *content*
// validation failure on a successful download (wrong mctl.css version,
// missing weight/subset, missing or empty licence) always exits non-zero,
// network state notwithstanding.
//
// Content hashing (issue #50, Q6): every file this script writes under
// public/assets/ or public/styles/ is named `<baseName>.<hash8><ext>`,
// where `hash8` is the first 8 hex characters of the file's own SHA-256.
// This lets nginx put `Cache-Control: public, max-age=31536000, immutable`
// on `/assets/` and `/styles/` without ever stranding a reader across a
// content change: a changed file gets a new URL. `emit()` is the one place
// that computes the hash and writes the file; every asset below goes
// through it. The resulting hrefs are recorded in `src/data/assets.json`
// (read by `Base.astro` at build time), and `pruneManaged()` deletes any
// previously hashed file no longer named by the manifest, so a re-run never
// leaves an orphan behind. `scripts/render-og.mjs`'s build-only TTF output
// under `scripts/fonts/` is untouched by any of this -- it is never served.

import { mkdir, writeFile, readFile, readdir, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { contentHash8, hashMismatch } from '../src/lib/content-hash.ts';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const ASSETS_JSON_PATH = path.join(ROOT, 'src/data/assets.json');

/**
 * Computes the first 8 hex characters of `bytes`'s SHA-256, writes
 * `<baseName>.<hash><ext>` into `dir` (creating it if needed), records the
 * written filename against `dir` in `managed` (so callers can prune
 * anything else in that directory afterwards), and returns the public href
 * -- `dir`'s path relative to `public/`, with the hashed filename appended,
 * forward-slashed regardless of platform.
 */
async function emit(dir, baseName, ext, bytes, managed) {
  await mkdir(dir, { recursive: true });
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
  const hash = contentHash8(buf);
  const filename = `${baseName}.${hash}${ext}`;
  await writeFile(path.join(dir, filename), buf);
  if (managed) {
    const set = managed.get(dir) ?? new Set();
    set.add(filename);
    managed.set(dir, set);
  }
  const relDir = path.relative(PUBLIC_DIR, dir).split(path.sep).join('/');
  return `/${relDir}/${filename}`;
}

/**
 * Deletes every file directly inside `dir` (non-recursive -- callers pass
 * one directory at a time, and public/assets/fonts/LICENSES/ is never
 * passed here) whose name is not in `keepNames`, so a content change or a
 * dropped weight/subset leaves no orphaned hashed file in the committed
 * tree.
 */
async function pruneDir(dir, keepNames) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (keepNames.has(entry.name)) continue;
    await unlink(path.join(dir, entry.name));
    console.log(`vendor: pruned orphaned ${path.relative(ROOT, path.join(dir, entry.name))}`);
  }
}

const MCTL_VERSION = '0.5.0';
const MCTL_BASE = `https://ui.mctl.ai/${MCTL_VERSION}/`;
const MCTL_FILES = ['mctl.css', 'global.css', 'prose.css'];
const MCTL_DIR = path.join(ROOT, 'public/assets/mctl');

// SHA-256 of each file at MCTL_VERSION, pinned from the copy in
// public/assets/mctl/ already committed and reviewed in this repo. The
// `/0.5.0/` path segment names a version but ui.mctl.ai is a plain origin,
// not an immutable content-addressed registry -- nothing stops it from
// serving different bytes under the same path later. Comparing against this
// pinned digest turns that into a loud, deliberate failure instead of a
// silent content swap. Update these digests only as a reviewed, intentional
// re-pin (e.g. alongside a genuine upstream 0.5.0 republish), never as a
// reflexive fix for a failing vendor run.
const MCTL_SHA256 = {
  'mctl.css': 'baf7fec102ffa91d38a6a6bdcc8e2084dc4d3554674ef8dea1e10e46495dba62',
  'global.css': '948edca94a20df44499b1166346172be91bc03e382d7d8ee46299c3190f40f61',
  'prose.css': '4636eeb77ecfdec9bae6fbe4513909f10bccf7cf14128888645705b5531d85ba',
};

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function sha256HexBuffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

const FONTS_DIR = path.join(ROOT, 'public/assets/fonts');
const LICENSES_DIR = path.join(FONTS_DIR, 'LICENSES');

const SITE_CSS_SRC = path.join(ROOT, 'src/styles/site.css');
const SITE_CSS_DEST_DIR = path.join(ROOT, 'public/styles');

const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'];

// Every family here is pinned to an exact @fontsource version so a refresh
// is reproducible. `hasCyrillic` records whether this family is expected to
// carry a cyrillic subset, so the coverage check below can tell "this family
// legitimately has none" (Instrument Serif) from "a cyrillic file went
// missing" (a bug).
//
// `sha256` pins the exact tarball bytes fetched from registry.npmjs.org for
// each pinned version, the same way MCTL_SHA256 above pins the mctl.css
// family: the registry path names a version but is not a content-addressed
// store, so nothing stops it from serving different bytes under the same
// path later. Comparing against this pinned digest turns that into a loud,
// deliberate build failure instead of a silent content swap. Re-pin only as
// a reviewed, intentional version bump, never as a reflexive fix for a
// failing vendor run.
const FAMILIES = [
  {
    pkgName: '@fontsource/onest',
    version: '5.3.1',
    slug: 'onest',
    family: 'Onest',
    weights: [400, 500, 600, 700],
    styles: ['normal'],
    subsets: SUBSETS,
    hasCyrillic: true,
    sha256: '7e289e83ab5b1d8b3f982232295da79b41c21291ca3f928de28903d7523b24a6',
  },
  {
    pkgName: '@fontsource/instrument-serif',
    version: '5.3.0',
    slug: 'instrument-serif',
    family: 'Instrument Serif',
    weights: [400],
    styles: ['normal', 'italic'],
    subsets: ['latin', 'latin-ext'],
    hasCyrillic: false,
    sha256: 'b342b7a7844a0025bc6185a28dd23e8b382202d73a5a574e3bf6d969bef3875d',
  },
  {
    pkgName: '@fontsource/jetbrains-mono',
    version: '5.3.0',
    slug: 'jetbrains-mono',
    family: 'JetBrains Mono',
    weights: [400, 500],
    styles: ['normal'],
    subsets: SUBSETS,
    hasCyrillic: true,
    sha256: '1bbea47d1387406da5b6ccc4184cc61eae6851cc0db5c1d9bbd088ea9daa0b4a',
  },
];

/** A downloaded artifact fails content validation (bad version, missing
 * weight/subset, missing licence). This always fails the run, regardless of
 * whether the network was reachable. */
class ValidationError extends Error {}

/** The network step itself could not be completed (DNS, timeout, refused
 * connection, non-2xx response). Falls back to the committed tree. */
class NetworkError extends Error {}

async function fetchText(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    throw new NetworkError(`fetch failed for ${url}: ${err.message}`);
  }
  if (!res.ok) {
    throw new NetworkError(`fetch ${url} returned HTTP ${res.status}`);
  }
  return res.text();
}

async function fetchBuffer(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    throw new NetworkError(`fetch failed for ${url}: ${err.message}`);
  }
  if (!res.ok) {
    throw new NetworkError(`fetch ${url} returned HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function readTarStr(buf, start, len) {
  let end = start;
  while (end < start + len && buf[end] !== 0) end++;
  return buf.toString('utf8', start, end);
}

/** Minimal ustar/GNU-longname reader. Yields { name, data } for regular
 * files only. No external dependency: node's built-in zlib does the gunzip,
 * this walks the (already decompressed) tar byte stream by hand. */
function* iterateTar(buffer) {
  let offset = 0;
  let longName = null;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name0 = readTarStr(header, 0, 100);
    const sizeOctal = readTarStr(header, 124, 12).trim();
    const size = sizeOctal ? parseInt(sizeOctal, 8) : 0;
    const typeflag = String.fromCharCode(header[156]);
    const prefix = readTarStr(header, 345, 155);
    offset += 512;
    const data = buffer.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    if (typeflag === 'L') {
      // GNU long-name extension: this entry's data is the real name of the
      // very next header.
      longName = data.toString('utf8').replace(/\0+$/, '');
      continue;
    }
    const name = longName || (prefix ? `${prefix}/${name0}` : name0);
    longName = null;
    if (typeflag === '0' || typeflag === '\0' || typeflag === '') {
      yield { name, data };
    }
  }
}

async function fetchPackageTarball(pkgName, version, expectedSha256) {
  const basename = pkgName.split('/').pop();
  const url = `https://registry.npmjs.org/${pkgName}/-/${basename}-${version}.tgz`;
  const gz = await fetchBuffer(url);
  const actual = sha256HexBuffer(gz);
  if (expectedSha256 && actual !== expectedSha256) {
    throw new ValidationError(
      `${pkgName}@${version} tarball sha256 mismatch: expected ${expectedSha256}, got ${actual} -- ` +
        `registry.npmjs.org served different bytes than the pinned digest`,
    );
  }
  let buf;
  try {
    buf = zlib.gunzipSync(gz);
  } catch (err) {
    throw new NetworkError(`could not gunzip ${url}: ${err.message}`);
  }
  const files = new Map();
  for (const { name, data } of iterateTar(buf)) {
    files.set(name, data);
  }
  return files;
}

/** Parses a fontsource package's index.css (which carries every
 * subset/weight/style combination with its unicode-range) into a map keyed
 * by the woff2 basename (no extension). */
function parseUnicodeRanges(indexCss) {
  const map = new Map();
  const blockRe = /@font-face\s*\{([^}]*)\}/g;
  let m;
  while ((m = blockRe.exec(indexCss))) {
    const block = m[1];
    const srcMatch = /url\(\.\/files\/([^)]+)\.woff2\)/.exec(block);
    const rangeMatch = /unicode-range:\s*([^;]+);/.exec(block);
    if (srcMatch && rangeMatch) {
      map.set(srcMatch[1], rangeMatch[1].trim());
    }
  }
  return map;
}

/** Vendors public/assets/mctl/*.css, each through `emit()` so it carries a
 * content hash. Returns `{ mctl, global, prose }` public hrefs, in that
 * order -- the order `src/data/assets.json`'s `styles` array requires. */
async function vendorMctl(managed) {
  const contents = {};
  const mctlCss = await fetchText(MCTL_BASE + 'mctl.css');
  const firstLine = mctlCss.split('\n')[0] ?? '';
  if (!firstLine.includes(MCTL_VERSION)) {
    throw new ValidationError(
      `mctl.css first line does not name version ${MCTL_VERSION}: "${firstLine}"`,
    );
  }
  contents['mctl.css'] = mctlCss;
  for (const file of MCTL_FILES) {
    if (file === 'mctl.css') continue;
    contents[file] = await fetchText(MCTL_BASE + file);
  }
  for (const file of MCTL_FILES) {
    const expected = MCTL_SHA256[file];
    const actual = sha256Hex(contents[file]);
    if (expected && actual !== expected) {
      throw new ValidationError(
        `${file} sha256 mismatch: expected ${expected}, got ${actual} -- ` +
          `ui.mctl.ai served different bytes than the pinned ${MCTL_VERSION} digest`,
      );
    }
  }
  const hrefs = {};
  for (const file of MCTL_FILES) {
    const baseName = file.replace(/\.css$/, '');
    hrefs[baseName] = await emit(MCTL_DIR, baseName, '.css', contents[file], managed);
  }
  console.log(`vendor: wrote ${MCTL_FILES.length} files to public/assets/mctl/`);
  return { mctl: hrefs.mctl, global: hrefs.global, prose: hrefs.prose };
}

/**
 * Reverses a WOFF1 container back into a bare sfnt (TTF/OTF): reads the
 * 44-byte header and the per-table directory, `zlib.inflateSync`s any table
 * whose compressed length differs from its original length (WOFF1 tables
 * are individually zlib-deflated, never Brotli -- that is WOFF2), and
 * rewrites the sfnt table directory with recomputed offsets, padding each
 * table to a 4-byte boundary as the sfnt format requires. Per-table
 * checksums are carried over from the WOFF directory unchanged; resvg's
 * font parser (ttf-parser) does not validate them, and the wasted effort of
 * recomputing `head`'s checksumAdjustment against new table offsets buys
 * nothing a build-only, never-served font buffer needs.
 */
function woffToTtf(woffBuf) {
  const signature = woffBuf.toString('ascii', 0, 4);
  if (signature !== 'wOFF') {
    throw new ValidationError(`expected a WOFF1 container, got signature "${signature}"`);
  }
  const flavor = woffBuf.readUInt32BE(4);
  const numTables = woffBuf.readUInt16BE(12);

  const entries = [];
  const dirOffset = 44;
  for (let i = 0; i < numTables; i++) {
    const base = dirOffset + i * 20;
    const tag = woffBuf.toString('ascii', base, base + 4);
    const offset = woffBuf.readUInt32BE(base + 4);
    const compLength = woffBuf.readUInt32BE(base + 8);
    const origLength = woffBuf.readUInt32BE(base + 12);
    const origChecksum = woffBuf.readUInt32BE(base + 16);
    let tableData = woffBuf.subarray(offset, offset + compLength);
    if (compLength !== origLength) {
      tableData = zlib.inflateSync(tableData);
    }
    if (tableData.length !== origLength) {
      throw new ValidationError(
        `WOFF table "${tag}" decompressed to ${tableData.length} bytes, expected ${origLength}`,
      );
    }
    entries.push({ tag, data: tableData, checksum: origChecksum });
  }
  entries.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  let entrySelector = 0;
  while (2 ** (entrySelector + 1) <= numTables) entrySelector++;
  const searchRange = 2 ** entrySelector * 16;
  const rangeShift = numTables * 16 - searchRange;

  const headerSize = 12 + numTables * 16;
  const paddedLengths = entries.map((e) => Math.ceil(e.data.length / 4) * 4);
  const bodySize = paddedLengths.reduce((sum, n) => sum + n, 0);

  const out = Buffer.alloc(headerSize + bodySize);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(rangeShift, 10);

  let dataOffset = headerSize;
  entries.forEach((e, i) => {
    const dirBase = 12 + i * 16;
    out.write(e.tag, dirBase, 'ascii');
    out.writeUInt32BE(e.checksum >>> 0, dirBase + 4);
    out.writeUInt32BE(dataOffset, dirBase + 8);
    out.writeUInt32BE(e.data.length, dirBase + 12);
    e.data.copy(out, dataOffset);
    dataOffset += paddedLengths[i];
  });

  return out;
}

const SCRIPT_FONTS_DIR = path.join(ROOT, 'scripts/fonts');
const OG_RENDER_WEIGHTS = [400, 700];

/**
 * Extracts the WOFF1 `onest-latin-{400,700}-normal.woff` entries out of the
 * already-fetched, already-SHA-256-verified `@fontsource/onest` tarball,
 * converts each to a bare TTF via `woffToTtf()`, and writes them to
 * `scripts/fonts/` -- build-only, never under `public/`, so they are never
 * served. `scripts/render-og.mjs` loads these as font buffers for resvg,
 * which needs sfnt (TTF/OTF), not woff2. Returns the list of files written,
 * or `null` if the tarball carries no `.woff` entry for either weight (the
 * documented stop-path trigger for item 1 of issue #50 Q6).
 */
async function extractOnestTtfs(onestTar) {
  await mkdir(SCRIPT_FONTS_DIR, { recursive: true });
  const written = [];
  for (const weight of OG_RENDER_WEIGHTS) {
    const woffData = onestTar.get(`package/files/onest-latin-${weight}-normal.woff`);
    if (!woffData) {
      return null;
    }
    const ttf = woffToTtf(woffData);
    if (ttf.readUInt32BE(0) !== 0x00010000) {
      throw new ValidationError(
        `onest-latin-${weight}-normal.woff did not convert to a valid sfnt (bad magic)`,
      );
    }
    const outPath = path.join(SCRIPT_FONTS_DIR, `onest-latin-${weight}-normal.ttf`);
    await writeFile(outPath, ttf);
    written.push(outPath);
  }
  console.log(`vendor: wrote ${written.length} build-only TTF file(s) to scripts/fonts/ for render-og.mjs`);
  return written;
}

/** Vendors every font file and the generated fonts.css through `emit()`.
 * Returns `{ fontsHref, preload }`: `fontsHref` is the hashed href of the
 * generated fonts.css, and `preload` maps the four preload keys
 * `src/data/assets.json` needs to their hashed woff2 hrefs. Also extracts
 * the two build-only Onest TTFs render-og.mjs needs (see
 * `extractOnestTtfs()`); `og` in the return value is `null` when that
 * extraction found no `.woff` entry, the documented stop-path trigger. */
async function vendorFonts(managed) {
  await mkdir(LICENSES_DIR, { recursive: true });

  const faceRules = [];
  let fontFileCount = 0;
  const hrefByBase = new Map();
  let ogTtfPaths = null;

  for (const fam of FAMILIES) {
    const tar = await fetchPackageTarball(fam.pkgName, fam.version, fam.sha256);

    const licenseData = tar.get('package/LICENSE');
    if (!licenseData || licenseData.length === 0) {
      throw new ValidationError(`${fam.pkgName}@${fam.version} has no (or empty) LICENSE file`);
    }
    await writeFile(path.join(LICENSES_DIR, `${fam.slug}.txt`), licenseData);

    if (fam.slug === 'onest') {
      ogTtfPaths = await extractOnestTtfs(tar);
    }

    // Each fontsource package ships one per-weight(-style) CSS file with
    // every subset's unicode-range (e.g. `400.css`, `400-italic.css`).
    // `index.css` only ever carries the package's default weight, so it
    // cannot be used for the full weight matrix this proposal vendors.
    const unicodeRanges = new Map();
    for (const weight of fam.weights) {
      for (const style of fam.styles) {
        const suffix = style === 'italic' ? '-italic' : '';
        const cssPath = `package/${weight}${suffix}.css`;
        const cssData = tar.get(cssPath);
        if (!cssData) {
          throw new ValidationError(
            `${fam.pkgName}@${fam.version} has no ${cssPath} (weight ${weight} ${style})`,
          );
        }
        for (const [k, v] of parseUnicodeRanges(cssData.toString('utf8'))) {
          unicodeRanges.set(k, v);
        }
      }
    }

    let familyHasCyrillic = false;
    for (const subset of fam.subsets) {
      for (const weight of fam.weights) {
        for (const style of fam.styles) {
          const base = `${fam.slug}-${subset}-${weight}-${style}`;
          const tarPath = `package/files/${base}.woff2`;
          const data = tar.get(tarPath);
          const range = unicodeRanges.get(base);
          if (!data || !range) {
            throw new ValidationError(
              `${fam.pkgName}@${fam.version}: requested ${subset}/${weight}/${style} resolved to no file`,
            );
          }
          const href = await emit(FONTS_DIR, base, '.woff2', data, managed);
          hrefByBase.set(base, href);
          fontFileCount++;
          if (subset === 'cyrillic' || subset === 'cyrillic-ext') familyHasCyrillic = true;
          faceRules.push({
            family: fam.family,
            weight,
            style,
            href,
            range,
          });
        }
      }
    }
    if (fam.hasCyrillic && !familyHasCyrillic) {
      throw new ValidationError(
        `${fam.pkgName} is expected to offer a cyrillic subset but none was vendored`,
      );
    }
  }

  const css = faceRules
    .map(
      (r) => `@font-face {
  font-family: '${r.family}';
  font-style: ${r.style};
  font-weight: ${r.weight};
  font-display: swap;
  src: url('${r.href}') format('woff2');
  unicode-range: ${r.range};
}
`,
    )
    .join('\n');
  const fontsHref = await emit(FONTS_DIR, 'fonts', '.css', css, managed);
  console.log(`vendor: wrote ${fontFileCount} font files and fonts.css`);

  const preload = {
    onestLatin400: hrefByBase.get('onest-latin-400-normal'),
    onestLatin700: hrefByBase.get('onest-latin-700-normal'),
    onestCyrillic400: hrefByBase.get('onest-cyrillic-400-normal'),
    onestCyrillic700: hrefByBase.get('onest-cyrillic-700-normal'),
  };
  for (const [key, href] of Object.entries(preload)) {
    if (!href) {
      throw new ValidationError(`vendor: could not resolve preload href for "${key}"`);
    }
  }

  return { fontsHref, preload, og: ogTtfPaths };
}

async function nonEmptyFile(p) {
  try {
    const s = await stat(p);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

function publicPathForHref(href) {
  return path.join(PUBLIC_DIR, href.replace(/^\/+/, ''));
}

/** Used only when the network step fails: is the tree already on disk (from
 * a previous, committed vendor run) complete and valid? Validates against
 * `src/data/assets.json` -- every href it names resolves to a non-empty
 * file, plus the licence and MCTL_VERSION first-line checks -- rather than
 * reconstructing filenames from FAMILIES, since the manifest (not the
 * family table) is what Base.astro and nginx actually consume. Per-font-file
 * coverage (every woff2 fonts.css references, not just the four preloaded
 * ones) is restored by reading fonts.css itself -- styles[3] by construction
 * (see main()) -- rather than reconstructing filenames from FAMILIES, which
 * is the same manifest-driven posture the rest of this function already
 * takes. This also covers scripts/render-og.mjs's two build-only Onest
 * TTFs: without them, `npm run build`'s render-og.mjs step fails even
 * though this offline path reports success, so an existing tree is not
 * "complete" without them either. */
async function verifyExistingTree() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(ASSETS_JSON_PATH, 'utf8'));
  } catch {
    return false;
  }
  if (!Array.isArray(manifest.styles) || manifest.styles.length !== 5) return false;
  if (!manifest.preload || typeof manifest.preload !== 'object') return false;

  for (const href of manifest.styles) {
    if (typeof href !== 'string' || !(await nonEmptyFile(publicPathForHref(href)))) return false;
  }
  for (const href of Object.values(manifest.preload)) {
    if (typeof href !== 'string' || !(await nonEmptyFile(publicPathForHref(href)))) return false;
  }

  // styles[0] is mctl.css by construction (see vendorMctl()); its first
  // line must still name the pinned MCTL_VERSION.
  const firstLine = (await readFile(publicPathForHref(manifest.styles[0]), 'utf8')).split('\n')[0] ?? '';
  if (!firstLine.includes(MCTL_VERSION)) return false;

  // styles[3] is the generated fonts.css by construction (see main()).
  // Every `url(...)` it declares must also resolve on disk -- this is what
  // covers the 24 font files (JetBrains Mono, Instrument Serif, and the
  // non-preloaded Onest weights) that the manifest itself never names.
  // Filenames are no longer reconstructed from FAMILIES here because emit()
  // content-hashes them, but the *count* is: url() resolving is only
  // self-consistency (every reference that exists on disk does point to a
  // real file), so on its own it would report an offline tree "valid" even
  // if fonts.css were missing entries FAMILIES currently declares (e.g. a
  // stale committed tree left over from a FAMILIES edit that never got a
  // successful network vendor run). Cross-checking the url() count against
  // the count FAMILIES independently implies restores that coverage.
  let fontsCss;
  try {
    fontsCss = await readFile(publicPathForHref(manifest.styles[3]), 'utf8');
  } catch {
    return false;
  }
  const fontUrlRe = /url\('([^']+)'\)/g;
  let fontUrlMatch;
  let fontUrlCount = 0;
  while ((fontUrlMatch = fontUrlRe.exec(fontsCss))) {
    fontUrlCount++;
    if (!(await nonEmptyFile(publicPathForHref(fontUrlMatch[1])))) return false;
  }
  const expectedFontFileCount = FAMILIES.reduce(
    (sum, fam) => sum + fam.weights.length * fam.styles.length * fam.subsets.length,
    0,
  );
  if (fontUrlCount !== expectedFontFileCount) return false;

  for (const fam of FAMILIES) {
    if (!(await nonEmptyFile(path.join(LICENSES_DIR, `${fam.slug}.txt`)))) return false;
  }

  for (const weight of OG_RENDER_WEIGHTS) {
    const ttfPath = path.join(SCRIPT_FONTS_DIR, `onest-latin-${weight}-normal.ttf`);
    if (!(await nonEmptyFile(ttfPath))) return false;
  }

  return true;
}

/** Copies src/styles/site.css to public/styles/ through `emit()` (a plain
 * local read -- no network dependency, always safe to run). Returns the
 * hashed public href. */
async function copySiteCss(managed) {
  const bytes = await readFile(SITE_CSS_SRC);
  return emit(SITE_CSS_DEST_DIR, 'site', '.css', bytes, managed);
}

/** Deletes every previously hashed file under the three managed directories
 * that this run did not (re)write, so a content change or a dropped
 * weight/subset never leaves an orphan in the committed tree.
 * public/assets/fonts/LICENSES/ is a subdirectory, never touched here. */
async function pruneManaged(managed) {
  for (const dir of [MCTL_DIR, FONTS_DIR, SITE_CSS_DEST_DIR]) {
    await pruneDir(dir, managed.get(dir) ?? new Set());
  }
}

async function main() {
  const managed = new Map();
  // site.css is a plain local copy -- no network dependency, always safe.
  const siteHref = await copySiteCss(managed);

  try {
    // Test seam for test/vendor-assets.test.ts: forces this run down the
    // network-failure branch below without touching the network, so the
    // offline verifyExistingTree() path can be exercised deterministically.
    // A plain Error (not a ValidationError) is deliberate -- it lands in the
    // `catch` branch that warns and falls back to verifyExistingTree()
    // rather than the branch that exits non-zero without consulting the
    // existing tree, so this seam can only ever skip work and route to the
    // stricter offline check, never loosen a production run.
    if (process.env.VENDOR_FORCE_OFFLINE === '1') {
      throw new Error('VENDOR_FORCE_OFFLINE=1 -- skipping the network step (test seam)');
    }

    const mctlHrefs = await vendorMctl(managed);
    const fontsResult = await vendorFonts(managed);
    if (!fontsResult.og) {
      throw new ValidationError(
        '@fontsource/onest carries no .woff entry for latin 400/700 -- resvg needs an sfnt buffer ' +
          'it cannot get from woff2 alone. Item 1 (share image) must take its documented stop path: ' +
          'revert og:image/twitter:image to /og.svg and commit docs/og-image.md.',
      );
    }

    const manifest = {
      styles: [mctlHrefs.mctl, mctlHrefs.global, mctlHrefs.prose, fontsResult.fontsHref, siteHref],
      preload: fontsResult.preload,
    };
    await writeFile(ASSETS_JSON_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await pruneManaged(managed);
  } catch (err) {
    if (err instanceof ValidationError) {
      console.error(`vendor: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    console.warn(`vendor: network step failed (${err.message})`);
    console.warn('vendor: checking existing committed tree...');
    if (await verifyExistingTree()) {
      console.log('vendor: existing tree under public/assets/, public/styles/ and src/data/assets.json is complete and valid; continuing offline.');
      return;
    }
    console.error('vendor: no valid existing tree and the network step failed; failing.');
    process.exitCode = 1;
    return;
  }
  console.log('vendor: done.');
}

await main();
