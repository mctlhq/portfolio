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

import { mkdir, writeFile, readFile, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

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
const FONTS_CSS_PATH = path.join(FONTS_DIR, 'fonts.css');

const SITE_CSS_SRC = path.join(ROOT, 'src/styles/site.css');
const SITE_CSS_DEST_DIR = path.join(ROOT, 'public/styles');
const SITE_CSS_DEST = path.join(SITE_CSS_DEST_DIR, 'site.css');

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
    weights: [300, 400, 500, 600, 700],
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
    weights: [400, 500, 600, 700],
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

async function vendorMctl() {
  await mkdir(MCTL_DIR, { recursive: true });
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
  for (const file of MCTL_FILES) {
    await writeFile(path.join(MCTL_DIR, file), contents[file], 'utf8');
  }
  console.log(`vendor: wrote ${MCTL_FILES.length} files to public/assets/mctl/`);
}

async function vendorFonts() {
  await mkdir(FONTS_DIR, { recursive: true });
  await mkdir(LICENSES_DIR, { recursive: true });

  const faceRules = [];
  let fontFileCount = 0;

  for (const fam of FAMILIES) {
    const tar = await fetchPackageTarball(fam.pkgName, fam.version, fam.sha256);

    const licenseData = tar.get('package/LICENSE');
    if (!licenseData || licenseData.length === 0) {
      throw new ValidationError(`${fam.pkgName}@${fam.version} has no (or empty) LICENSE file`);
    }
    await writeFile(path.join(LICENSES_DIR, `${fam.slug}.txt`), licenseData);

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
          const outName = `${base}.woff2`;
          await writeFile(path.join(FONTS_DIR, outName), data);
          fontFileCount++;
          if (subset === 'cyrillic' || subset === 'cyrillic-ext') familyHasCyrillic = true;
          faceRules.push({
            family: fam.family,
            weight,
            style,
            file: outName,
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
  src: url('/assets/fonts/${r.file}') format('woff2');
  unicode-range: ${r.range};
}
`,
    )
    .join('\n');
  await writeFile(FONTS_CSS_PATH, css, 'utf8');
  console.log(`vendor: wrote ${fontFileCount} font files and fonts.css`);
}

async function nonEmptyFile(p) {
  try {
    const s = await stat(p);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

/** Used only when the network step fails: is the tree already on disk (from
 * a previous, committed vendor run) complete and valid? */
async function verifyExistingTree() {
  const mctlCssPath = path.join(MCTL_DIR, 'mctl.css');
  if (!(await nonEmptyFile(mctlCssPath))) return false;
  const firstLine = (await readFile(mctlCssPath, 'utf8')).split('\n')[0] ?? '';
  if (!firstLine.includes(MCTL_VERSION)) return false;
  for (const file of MCTL_FILES) {
    if (!(await nonEmptyFile(path.join(MCTL_DIR, file)))) return false;
  }

  for (const fam of FAMILIES) {
    if (!(await nonEmptyFile(path.join(LICENSES_DIR, `${fam.slug}.txt`)))) return false;
    for (const subset of fam.subsets) {
      for (const weight of fam.weights) {
        for (const style of fam.styles) {
          const p = path.join(FONTS_DIR, `${fam.slug}-${subset}-${weight}-${style}.woff2`);
          if (!(await nonEmptyFile(p))) return false;
        }
      }
    }
  }
  if (!(await nonEmptyFile(FONTS_CSS_PATH))) return false;
  return true;
}

async function copySiteCss() {
  await mkdir(SITE_CSS_DEST_DIR, { recursive: true });
  await copyFile(SITE_CSS_SRC, SITE_CSS_DEST);
}

async function main() {
  // site.css is a plain local copy -- no network dependency, always safe.
  await copySiteCss();

  try {
    await vendorMctl();
    await vendorFonts();
  } catch (err) {
    if (err instanceof ValidationError) {
      console.error(`vendor: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    console.warn(`vendor: network step failed (${err.message})`);
    console.warn('vendor: checking existing committed tree...');
    if (await verifyExistingTree()) {
      console.log('vendor: existing tree under public/assets/ is complete and valid; continuing offline.');
      return;
    }
    console.error('vendor: no valid existing tree and the network step failed; failing.');
    process.exitCode = 1;
    return;
  }
  console.log('vendor: done.');
}

await main();
