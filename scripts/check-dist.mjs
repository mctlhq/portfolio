#!/usr/bin/env node
// Mechanical gate for three acceptance criteria of issue #6 (P4: Home
// page), modelled on scripts/csp-hash.mjs. Walks dist/ (produced by
// `npm run build`) and exits non-zero, naming the reason, if:
//
//   (a) any file under dist/ ends in .js -- ADR-0002, no client bundles;
//   (b) any dist/**/*.html has an unequal count of class="l en" and
//       class="l ru" -- bilingual parity;
//   (c) dist/index.html is 40960 bytes (40 KB) or larger -- page weight.
//
// This has to run post-build, not from `npm test`: `prebuild` is
// `npm run vendor && npm test`, which runs before `astro build`, so dist/
// does not exist yet at that point.
//
// checkApproachPage() (issue #8, P6) extends this for dist/approach/index.html,
// which carries the DevLoop cycle as two inline <svg> elements (wide, narrow).
// It is the only place that can see the built markup, so it also covers the
// accessibility, weight and no-raster criteria that a source-level test in
// npm test cannot verify against emitted HTML.
//
// checkColophonPages() (issue #9, P7) extends this for dist/colophon/**: the
// cycle table's two totals and row count against an independent scan of
// src/content/journal/*.md, one page per public journal/ADR entry and none
// for a private one, data-release parity with package.json on every page,
// and no absolute-URL subresource in any dist/**/*.html or dist/**/*.css.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');
const MAX_INDEX_BYTES = 40 * 1024;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

const MAX_SVG_BYTES = 12 * 1024; // 12 KB, summed over every <svg> on the page.
const NARROW_MAX_VIEWBOX_WIDTH = 360;

function extractSvgSlices(html) {
  return html.match(/<svg\b[\s\S]*?<\/svg>/g) ?? [];
}

function svgOpenTag(slice) {
  return (slice.match(/<svg\b[^>]*>/) ?? [''])[0];
}

/**
 * Checks dist/approach/index.html (issue #8, P6) against the criteria that
 * only the built page can prove: the two inline <svg> variants of the
 * DevLoop cycle diagram carry no raster data, no literal colour, an
 * accessible name/description pair, a fluid viewBox with no width/height
 * attribute, per-slice bilingual parity, and a combined byte budget under
 * 12 KB. Returns an array of problem strings (empty when everything holds).
 */
async function checkApproachPage() {
  const problems = [];
  const approachPath = path.join(DIST_DIR, 'approach', 'index.html');
  let html;
  try {
    html = await readFile(approachPath, 'utf8');
  } catch {
    problems.push(`check-dist: ${path.relative(ROOT, approachPath)} does not exist`);
    return { problems, svgBytes: null };
  }

  const slices = extractSvgSlices(html);
  if (slices.length < 2) {
    problems.push(
      `check-dist: ${path.relative(ROOT, approachPath)} has ${slices.length} <svg> root(s), expected at least 2 (wide and narrow variants)`,
    );
    return { problems, svgBytes: null };
  }

  const svgBytes = slices.reduce((sum, slice) => sum + Buffer.byteLength(slice, 'utf8'), 0);
  if (svgBytes >= MAX_SVG_BYTES) {
    problems.push(
      `check-dist: the <svg> elements in ${path.relative(ROOT, approachPath)} total ${svgBytes} bytes, at or over the ${MAX_SVG_BYTES}-byte cap`,
    );
  }

  const RASTER_RE = /<image\b|data:|xlink:href|\.(png|jpe?g|gif|webp)\b/i;
  const COLOR_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/;

  let sawNarrowSlice = false;

  for (const slice of slices) {
    const openTag = svgOpenTag(slice);
    const label = openTag.match(/class="([^"]*)"/)?.[1] ?? '(no class)';

    if (RASTER_RE.test(slice)) {
      problems.push(`check-dist: an <svg class="${label}"> in ${path.relative(ROOT, approachPath)} references raster data (<image>, data:, xlink:href, or a raster file extension)`);
    }
    if (COLOR_LITERAL_RE.test(slice)) {
      problems.push(`check-dist: an <svg class="${label}"> in ${path.relative(ROOT, approachPath)} contains a literal colour (expected currentColor / var(--...) only)`);
    }

    if (!/role="img"/.test(openTag)) {
      problems.push(`check-dist: <svg class="${label}"> in ${path.relative(ROOT, approachPath)} is missing role="img"`);
    }
    const labelledBy = openTag.match(/aria-labelledby="([^"]*)"/)?.[1];
    if (!labelledBy) {
      problems.push(`check-dist: <svg class="${label}"> in ${path.relative(ROOT, approachPath)} is missing aria-labelledby`);
    } else {
      for (const token of labelledBy.split(/\s+/).filter(Boolean)) {
        const idRe = new RegExp(`<(?:title|desc)\\b[^>]*\\bid="${token}"`);
        if (!idRe.test(slice)) {
          problems.push(`check-dist: <svg class="${label}"> aria-labelledby token "${token}" does not resolve to a <title>/<desc> id inside the same <svg>`);
        }
      }
    }
    const titleCount = (slice.match(/<title\b/g) ?? []).length;
    const descCount = (slice.match(/<desc\b/g) ?? []).length;
    if (titleCount !== 1 || descCount !== 1) {
      problems.push(`check-dist: <svg class="${label}"> in ${path.relative(ROOT, approachPath)} has ${titleCount} <title> and ${descCount} <desc>, expected exactly one of each`);
    }

    const viewBoxMatch = openTag.match(/viewBox="([^"]*)"/);
    if (!viewBoxMatch) {
      problems.push(`check-dist: <svg class="${label}"> in ${path.relative(ROOT, approachPath)} is missing viewBox`);
    }
    if (/\bwidth="/.test(openTag) || /\bheight="/.test(openTag)) {
      problems.push(`check-dist: <svg class="${label}"> in ${path.relative(ROOT, approachPath)} carries a width or height attribute; sizing must come from CSS`);
    }

    const enCount = countOccurrences(slice, 'class="l en"');
    const ruCount = countOccurrences(slice, 'class="l ru"');
    if (enCount !== ruCount) {
      problems.push(`check-dist: <svg class="${label}"> in ${path.relative(ROOT, approachPath)} has ${enCount} occurrences of class="l en" but ${ruCount} of class="l ru"`);
    }

    if (label.includes('cycle-narrow')) {
      sawNarrowSlice = true;
      if (viewBoxMatch) {
        const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
        const width = parts[2];
        if (!Number.isFinite(width) || width > NARROW_MAX_VIEWBOX_WIDTH) {
          problems.push(`check-dist: the narrow <svg> viewBox width is ${width}, over the ${NARROW_MAX_VIEWBOX_WIDTH}px cap`);
        }
      }
    }
  }

  if (!sawNarrowSlice) {
    problems.push(`check-dist: no <svg> with a "cycle-narrow" class found in ${path.relative(ROOT, approachPath)}; the ${NARROW_MAX_VIEWBOX_WIDTH}px narrow-viewBox cap was not checked`);
  }

  return { problems, svgBytes };
}

const JOURNAL_DIR = path.join(ROOT, 'src', 'content', 'journal');
const ADR_DIR = path.join(ROOT, 'src', 'content', 'adr');
const VISIBILITY_RE = /^visibility:\s*(public|private)\s*$/m;
const WHAT_RE = /^\s*-\s+what:/gm;
const ABSOLUTE_URL_RE = /^(https?:)?\/\//i;

async function idsByVisibility(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const publicIds = [];
  const privateIds = [];
  let whatTotal = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const id = entry.name.replace(/\.md$/, '');
    const text = await readFile(path.join(dir, entry.name), 'utf8');
    const visibilityMatch = VISIBILITY_RE.exec(text);
    const visibility = visibilityMatch ? visibilityMatch[1] : null;
    if (visibility === 'public') {
      publicIds.push(id);
      whatTotal += (text.match(WHAT_RE) ?? []).length;
    } else if (visibility === 'private') {
      privateIds.push(id);
    }
  }
  return { publicIds, privateIds, whatTotal };
}

async function fileExists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks dist/colophon/** (issue #9, P7) against the criteria that only the
 * built output can prove: the cycle table and its totals are derived from
 * the journal (not typed), every public journal/ADR entry has its own page
 * and no private one does, the footer release matches package.json across
 * every page, and no page issues an absolute-URL subresource request. Scans
 * src/content/journal and src/content/adr independently of the page's own
 * getCollection() calls, so the two can only agree when the page really is
 * generated from the content. Returns an array of problem strings.
 */
async function checkColophonPages(allFiles) {
  const problems = [];

  const journal = await idsByVisibility(JOURNAL_DIR);
  const adr = await idsByVisibility(ADR_DIR);

  const indexPath = path.join(DIST_DIR, 'colophon', 'index.html');
  if (!(await fileExists(indexPath))) {
    problems.push(`check-dist: ${path.relative(ROOT, indexPath)} does not exist`);
  } else {
    const html = await readFile(indexPath, 'utf8');
    const cycleCountMatch = html.match(/data-cycle-count="(\d+)"/);
    const interventionCountMatch = html.match(/data-intervention-count="(\d+)"/);
    const cycleRowCount = countOccurrences(html, 'data-cycle-row');

    if (!cycleCountMatch || Number(cycleCountMatch[1]) !== journal.publicIds.length) {
      problems.push(
        `check-dist: dist/colophon/index.html data-cycle-count is ${cycleCountMatch?.[1] ?? '(missing)'}, expected ${journal.publicIds.length} (public journal files)`,
      );
    }
    if (!interventionCountMatch || Number(interventionCountMatch[1]) !== journal.whatTotal) {
      problems.push(
        `check-dist: dist/colophon/index.html data-intervention-count is ${interventionCountMatch?.[1] ?? '(missing)'}, expected ${journal.whatTotal} ("- what:" items across public journal files)`,
      );
    }
    if (cycleRowCount !== journal.publicIds.length) {
      problems.push(
        `check-dist: dist/colophon/index.html has ${cycleRowCount} data-cycle-row occurrences, expected ${journal.publicIds.length}`,
      );
    }
  }

  for (const id of journal.publicIds) {
    const p = path.join(DIST_DIR, 'colophon', 'journal', id, 'index.html');
    if (!(await fileExists(p))) {
      problems.push(`check-dist: ${path.relative(ROOT, p)} does not exist for public journal entry "${id}"`);
    }
  }
  for (const id of journal.privateIds) {
    const p = path.join(DIST_DIR, 'colophon', 'journal', id, 'index.html');
    if (await fileExists(p)) {
      problems.push(`check-dist: ${path.relative(ROOT, p)} exists for private journal entry "${id}"`);
    }
  }
  for (const id of adr.publicIds) {
    const p = path.join(DIST_DIR, 'colophon', 'adr', id, 'index.html');
    if (!(await fileExists(p))) {
      problems.push(`check-dist: ${path.relative(ROOT, p)} does not exist for public ADR entry "${id}"`);
    }
  }
  for (const id of adr.privateIds) {
    const p = path.join(DIST_DIR, 'colophon', 'adr', id, 'index.html');
    if (await fileExists(p)) {
      problems.push(`check-dist: ${path.relative(ROOT, p)} exists for private ADR entry "${id}"`);
    }
  }

  const privateIds = [...journal.privateIds, ...adr.privateIds];
  const htmlFiles = allFiles.filter((file) => file.endsWith('.html'));
  const cssFiles = allFiles.filter((file) => file.endsWith('.css'));

  let pkgVersion = null;
  try {
    pkgVersion = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
  } catch {
    problems.push('check-dist: could not read package.json to compare against data-release');
  }

  const SUBRESOURCE_RE = /<(link|script|img|source)\b[^>]*\s(?:href|src)="([^"]*)"[^>]*>/gi;

  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    const rel = path.relative(ROOT, file);

    for (const id of privateIds) {
      if (html.includes(id)) {
        problems.push(`check-dist: ${rel} contains the private id "${id}"`);
      }
    }

    const releaseMatch = html.match(/data-release>([^<]*)</);
    if (pkgVersion !== null && releaseMatch && releaseMatch[1] !== pkgVersion) {
      problems.push(`check-dist: ${rel} data-release is "${releaseMatch[1]}", expected package.json version "${pkgVersion}"`);
    }

    for (const match of html.matchAll(SUBRESOURCE_RE)) {
      const [, tag, url] = match;
      if (ABSOLUTE_URL_RE.test(url)) {
        problems.push(`check-dist: ${rel} has a <${tag}> pointing at an absolute/protocol-relative URL: ${url}`);
      }
    }
  }

  for (const file of cssFiles) {
    const css = await readFile(file, 'utf8');
    const rel = path.relative(ROOT, file);
    for (const match of css.matchAll(/url\(\s*['"]?(https?:)?\/\/[^)]*\)/gi)) {
      problems.push(`check-dist: ${rel} contains an absolute-URL url(...): ${match[0]}`);
    }
  }

  return { problems, cycleCount: journal.publicIds.length, interventionTotal: journal.whatTotal };
}

async function main() {
  let stats;
  try {
    stats = await stat(DIST_DIR);
  } catch {
    stats = null;
  }
  if (!stats || !stats.isDirectory()) {
    console.error(`check-dist: ${DIST_DIR} does not exist; run npm run build first`);
    process.exitCode = 1;
    return;
  }

  const allFiles = await walk(DIST_DIR);
  const problems = [];

  const jsFiles = allFiles.filter((file) => file.endsWith('.js'));
  if (jsFiles.length > 0) {
    for (const file of jsFiles) {
      problems.push(`check-dist: found a .js file under dist/: ${path.relative(ROOT, file)}`);
    }
  }

  const htmlFiles = allFiles.filter((file) => file.endsWith('.html'));
  if (htmlFiles.length === 0) {
    problems.push(`check-dist: no .html files found under ${DIST_DIR}`);
  }
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8');
    const enCount = countOccurrences(html, 'class="l en"');
    const ruCount = countOccurrences(html, 'class="l ru"');
    if (enCount !== ruCount) {
      problems.push(
        `check-dist: ${path.relative(ROOT, file)} has ${enCount} occurrences of class="l en" but ${ruCount} of class="l ru"`,
      );
    }
  }

  const indexPath = path.join(DIST_DIR, 'index.html');
  let indexBytes = null;
  try {
    indexBytes = (await stat(indexPath)).size;
  } catch {
    problems.push(`check-dist: ${path.relative(ROOT, indexPath)} does not exist`);
  }
  if (indexBytes !== null && indexBytes >= MAX_INDEX_BYTES) {
    problems.push(
      `check-dist: dist/index.html is ${indexBytes} bytes, at or over the ${MAX_INDEX_BYTES}-byte cap`,
    );
  }

  const approachResult = await checkApproachPage();
  problems.push(...approachResult.problems);

  const colophonResult = await checkColophonPages(allFiles);
  problems.push(...colophonResult.problems);

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    process.exitCode = 1;
    return;
  }

  const enTotal = countOccurrences(await readFile(indexPath, 'utf8'), 'class="l en"');
  const ruTotal = countOccurrences(await readFile(indexPath, 'utf8'), 'class="l ru"');
  const svgBytesMsg = approachResult.svgBytes !== null ? `, approach.astro <svg> total ${approachResult.svgBytes} bytes (cap ${MAX_SVG_BYTES})` : '';
  const colophonMsg = `, colophon: ${colophonResult.cycleCount} cycles, ${colophonResult.interventionTotal} interventions`;
  console.log(`check-dist: OK -- dist/index.html is ${indexBytes} bytes (cap ${MAX_INDEX_BYTES}), class="l en" x${enTotal}, class="l ru" x${ruTotal}, no .js under dist/${svgBytesMsg}${colophonMsg}`);
}

await main();
