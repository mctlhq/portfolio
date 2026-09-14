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
//
// checkHomePage() (issue #27, P4a) extends this for dist/index.html: the
// hero name renders as a bilingual class="l en" / class="l ru" pair inside
// class="hero-name", and <title> -- which can hold only one string, so it
// cannot itself carry the toggled pair -- stays exactly "Dmitrii Mashkov"
// with no Cyrillic character, independent of the data-lang a reader has
// selected. Source-level tests in npm test cannot see this: they run before
// `astro build` (prebuild is `npm run vendor && npm test`), so they can
// assert the template renders through <Lang> but not what the built markup
// or <title> text actually is.

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashMismatch } from '../src/lib/content-hash.ts';
import { indexingFromFrontmatter, noindexJournalIds } from '../src/lib/indexing.ts';

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

  // Issue #108 (Q18): the header's ThemeToggle renders two decorative,
  // aria-hidden sun/moon <svg> glyphs into every page, this one included.
  // The per-slice loop below asserts the DevLoop cycle diagram's own
  // contract (role="img", an aria-labelledby resolving to a <title>/<desc>
  // pair) and the 12 KB budget this function's docstring scopes to "the two
  // inline <svg> variants of the DevLoop cycle diagram" -- neither applies
  // to a decorative glyph. Narrow the slice list to the diagram by the
  // `cycle-svg` class src/components/CycleDiagram.astro puts on both
  // variants, so an unrelated inline icon anywhere in the layout can
  // neither fail this check nor eat the diagram's byte budget.
  const slices = extractSvgSlices(html).filter((slice) => /\bcycle-svg\b/.test(svgOpenTag(slice)));
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

  const openDetailsCount = countDetailsOpen(html);
  if (openDetailsCount !== 1) {
    problems.push(
      `check-dist: ${path.relative(ROOT, approachPath)} has ${openDetailsCount} <details open> element(s), expected exactly 1 (the Gates block)`,
    );
  }

  const summaryH2Count = countOccurrences(html, '<summary><h2');
  if (summaryH2Count !== 0) {
    problems.push(
      `check-dist: ${path.relative(ROOT, approachPath)} has ${summaryH2Count} "<summary><h2" opening(s), expected exactly 0 (approach's disclosure summaries carry no heading)`,
    );
  }

  return { problems, svgBytes };
}

/**
 * Checks dist/index.html (issue #27, P4a) against the one criterion that
 * only the built page can prove: the hero name renders as a bilingual
 * `.l.en` / `.l.ru` pair inside `class="hero-name"`, and the `<title>`
 * element -- which can hold only one string -- stays the Latin
 * `Dmitrii Mashkov` with no Cyrillic character, independent of whichever
 * `data-lang` half a reader has toggled to. Returns an array of problem
 * strings.
 */
async function checkHomePage() {
  const problems = [];
  const indexPath = path.join(DIST_DIR, 'index.html');
  let html;
  try {
    html = await readFile(indexPath, 'utf8');
  } catch {
    problems.push(`check-dist: ${path.relative(ROOT, indexPath)} does not exist`);
    return problems;
  }

  const heroMatch = html.match(/<h1\b[^>]*\bclass="hero-name"[^>]*>[\s\S]*?<\/h1>/);
  if (!heroMatch) {
    problems.push(`check-dist: ${path.relative(ROOT, indexPath)} has no <h1 class="hero-name"> element`);
  } else {
    const heroSlice = heroMatch[0];
    if (!/<span\b[^>]*class="l en"[^>]*>Dmitrii Mashkov<\/span>/.test(heroSlice)) {
      problems.push(
        `check-dist: the hero <h1 class="hero-name"> in ${path.relative(ROOT, indexPath)} does not contain "Dmitrii Mashkov" inside an element with class="l en"`,
      );
    }
    if (!/<span\b[^>]*class="l ru"[^>]*>Дмитрий Машков<\/span>/.test(heroSlice)) {
      problems.push(
        `check-dist: the hero <h1 class="hero-name"> in ${path.relative(ROOT, indexPath)} does not contain "Дмитрий Машков" inside an element with class="l ru"`,
      );
    }
  }

  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  const titleText = titleMatch ? titleMatch[1] : null;
  if (titleText !== 'Dmitrii Mashkov') {
    problems.push(
      `check-dist: <title> in ${path.relative(ROOT, indexPath)} is "${titleText ?? '(missing)'}", expected exactly "Dmitrii Mashkov"`,
    );
  }
  if (titleText && /[\u0400-\u04ff]/.test(titleText)) {
    problems.push(
      `check-dist: <title> in ${path.relative(ROOT, indexPath)} contains a Cyrillic character; the browser tab must stay Latin regardless of data-lang`,
    );
  }

  const openDetailsCount = countDetailsOpen(html);
  if (openDetailsCount !== 0) {
    problems.push(
      `check-dist: ${path.relative(ROOT, indexPath)} has ${openDetailsCount} <details open> element(s), expected exactly 0 (issue #98, Q15: the contact disclosure was replaced by a visible #contact section)`,
    );
  }

  const summaryH2Count = countOccurrences(html, '<summary><h2');
  if (summaryH2Count !== 2) {
    problems.push(
      `check-dist: ${path.relative(ROOT, indexPath)} has ${summaryH2Count} "<summary><h2" opening(s), expected exactly 2 (issue #98, Q15: only detailsRunSummary and detailsWorkSummary remain)`,
    );
  }

  // scripts/check-links.mjs classifies a bare `#fragment` href as resolving
  // to the current document without checking that a matching id exists
  // there (see its classifyHref() doc comment) -- the same gap
  // checkNavigationState() above already closes for the skip link
  // (href="#main" against <main id="main">). The primary CTA's
  // href="#contact" gets the same treatment here: prove the id it targets
  // is actually present on the page, rather than leaving it the one link on
  // the site no gate resolves.
  if (!/<a\b[^>]*\bclass="cta cta-primary"[^>]*\bhref="#contact"[^>]*>/.test(html)) {
    problems.push(
      `check-dist: ${path.relative(ROOT, indexPath)} has no <a class="cta cta-primary" href="#contact"> primary CTA`,
    );
  }
  if (!/\bid="contact"/.test(html)) {
    problems.push(
      `check-dist: ${path.relative(ROOT, indexPath)} has no element carrying id="contact"; the primary CTA's href="#contact" does not resolve to anything on the page`,
    );
  }
  if (!/<section\s+id="contact"\s+tabindex="-1">/.test(html)) {
    problems.push(
      `check-dist: ${path.relative(ROOT, indexPath)} has no <section id="contact" tabindex="-1">; the primary CTA's href="#contact" target must be focusable, same pattern as <main id="main" tabindex="-1">`,
    );
  }

  problems.push(...checkHomeJsonLd(html, path.relative(ROOT, indexPath)));

  return problems;
}

const HOME_PERSON_KEYS = ['@type', 'name', 'url', 'jobTitle', 'email', 'sameAs'];
const HOME_WEBSITE_KEYS = ['@type', 'name', 'url', 'inLanguage'];
const HOME_SAME_AS = [
  'https://www.linkedin.com/in/dmitriimashkov',
  'https://github.com/mctlhq',
  'https://t.me/dmitriimashkov',
];

/**
 * Checks the `Person`/`WebSite` JSON-LD graph on dist/index.html (issue #98,
 * Q15, Appendix A.11): exactly one `application/ld+json` block, it parses,
 * its `@graph` carries a `Person` node with exactly the five named fields
 * (plus `@type`) and the three ordered `sameAs` entries, and a `WebSite`
 * node with exactly its three named fields (plus `@type`). Mirrors
 * checkJsonLd()'s shape for the journal/ADR BreadcrumbList, but home-page
 * specific: this is the one route whose graph never carries a
 * BreadcrumbList, so it needs its own field list rather than reusing
 * checkJsonLd().
 */
function checkHomeJsonLd(html, rel) {
  const problems = [];
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (blocks.length !== 1) {
    problems.push(`check-dist: ${rel} has ${blocks.length} application/ld+json block(s), expected exactly 1`);
    return problems;
  }
  let parsed;
  try {
    parsed = JSON.parse(blocks[0][1]);
  } catch (err) {
    problems.push(`check-dist: ${rel} application/ld+json block does not parse: ${err.message}`);
    return problems;
  }
  const graph = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [];
  if (graph.length !== 2) {
    problems.push(`check-dist: ${rel} application/ld+json @graph has ${graph.length} node(s), expected exactly 2`);
    return problems;
  }
  const [person, site] = graph;

  if (person['@type'] !== 'Person') {
    problems.push(`check-dist: ${rel} application/ld+json @graph[0].@type is "${person['@type']}", expected "Person"`);
  }
  const personKeys = Object.keys(person).sort();
  if (JSON.stringify(personKeys) !== JSON.stringify([...HOME_PERSON_KEYS].sort())) {
    problems.push(`check-dist: ${rel} Person node keys are ${personKeys.join(',')}, expected exactly ${HOME_PERSON_KEYS.join(',')}`);
  }
  if (person.name !== 'Dmitrii Mashkov') {
    problems.push(`check-dist: ${rel} Person.name is "${person.name}", expected "Dmitrii Mashkov"`);
  }
  if (person.url !== 'https://dmitriimashkov.com/') {
    problems.push(`check-dist: ${rel} Person.url is "${person.url}", expected "https://dmitriimashkov.com/"`);
  }
  if (person.jobTitle !== 'Senior platform engineer') {
    problems.push(`check-dist: ${rel} Person.jobTitle is "${person.jobTitle}", expected "Senior platform engineer"`);
  }
  if (person.email !== 'mailto:hello@dmitriimashkov.com') {
    problems.push(`check-dist: ${rel} Person.email is "${person.email}", expected "mailto:hello@dmitriimashkov.com"`);
  }
  if (JSON.stringify(person.sameAs) !== JSON.stringify(HOME_SAME_AS)) {
    problems.push(`check-dist: ${rel} Person.sameAs is ${JSON.stringify(person.sameAs)}, expected ${JSON.stringify(HOME_SAME_AS)}`);
  }

  if (site['@type'] !== 'WebSite') {
    problems.push(`check-dist: ${rel} application/ld+json @graph[1].@type is "${site['@type']}", expected "WebSite"`);
  }
  const siteKeys = Object.keys(site).sort();
  if (JSON.stringify(siteKeys) !== JSON.stringify([...HOME_WEBSITE_KEYS].sort())) {
    problems.push(`check-dist: ${rel} WebSite node keys are ${siteKeys.join(',')}, expected exactly ${HOME_WEBSITE_KEYS.join(',')}`);
  }
  if (site.name !== 'Dmitrii Mashkov') {
    problems.push(`check-dist: ${rel} WebSite.name is "${site.name}", expected "Dmitrii Mashkov"`);
  }
  if (site.url !== 'https://dmitriimashkov.com/') {
    problems.push(`check-dist: ${rel} WebSite.url is "${site.url}", expected "https://dmitriimashkov.com/"`);
  }
  if (site.inLanguage !== 'en') {
    problems.push(`check-dist: ${rel} WebSite.inLanguage is "${site.inLanguage}", expected "en"`);
  }

  return problems;
}

/**
 * Checks dist/404.html (issue #88, Q13, acceptance criterion E): below the
 * existing home link, two new links -- /work/ ("See the work" / "Посмотреть
 * работы") and mailto:hello@dmitriimashkov.com ("Get in touch" / "Написать")
 * -- and the page stays noindex.
 */
function check404Page(html, rel) {
  const problems = [];
  if (!/<a href="\/work\/">/.test(html)) {
    problems.push(`check-dist: ${rel} is missing a link to /work/`);
  }
  if (!html.includes('See the work')) {
    problems.push(`check-dist: ${rel} is missing the EN string "See the work"`);
  }
  if (!html.includes('Посмотреть работы')) {
    problems.push(`check-dist: ${rel} is missing the RU string "Посмотреть работы"`);
  }
  if (!/<a href="mailto:hello@dmitriimashkov\.com">/.test(html)) {
    problems.push(`check-dist: ${rel} is missing a mailto:hello@dmitriimashkov.com link`);
  }
  if (!html.includes('Get in touch')) {
    problems.push(`check-dist: ${rel} is missing the EN string "Get in touch"`);
  }
  if (!html.includes('Написать')) {
    problems.push(`check-dist: ${rel} is missing the RU string "Написать"`);
  }
  if (!/<meta name="robots" content="noindex"\s*\/?>/.test(html)) {
    problems.push(`check-dist: ${rel} is missing <meta name="robots" content="noindex">`);
  }
  return problems;
}

/**
 * Counts `<details ...open...>` elements in built markup: `open` renders as
 * a bare boolean attribute (no `="..."` value), so this looks for `open` as
 * its own token inside a `<details` opening tag rather than matching the
 * literal substring `open` anywhere (which would also match e.g. a future
 * class name).
 */
function countDetailsOpen(html) {
  const tags = html.match(/<details\b[^>]*>/g) ?? [];
  return tags.filter((tag) => /\bopen\b/.test(tag)).length;
}

/**
 * Returns the { href, value } that the .site-nav anchor for the current page
 * must carry, or null when no anchor should carry aria-current at all (the
 * 404 page). Mirrors the current(href) derivation in
 * src/components/Nav.astro: an exact path match gets 'page'; a
 * /colophon/journal/<id>/ or /colophon/adr/<id>/ page is under the Colophon
 * prefix without being it, so the Colophon anchor gets 'true'.
 */
function expectedNavCurrent(rel) {
  if (rel === 'index.html') return { href: '/', value: 'page' };
  if (rel === path.join('work', 'index.html')) return { href: '/work/', value: 'page' };
  if (rel === path.join('approach', 'index.html')) return { href: '/approach/', value: 'page' };
  if (rel === path.join('colophon', 'index.html')) return { href: '/colophon/', value: 'page' };
  if (
    rel.startsWith(`${path.join('colophon', 'journal')}${path.sep}`) ||
    rel.startsWith(`${path.join('colophon', 'adr')}${path.sep}`)
  ) {
    return { href: '/colophon/', value: 'true' };
  }
  return null;
}

/**
 * Checks issue #49 (Q5) navigation-state invariants against one built page:
 * the hoisted <main id="main" tabindex="-1">, a #main skip link before the
 * first <nav, that exactly the anchor expectedNavCurrent() names (and no
 * other) carries aria-current inside .site-nav, with the exact value it
 * names (zero anchors on the 404 page), and no aria-label value mixing a
 * Latin and a Cyrillic letter -- with one named exemption for the
 * .table-scroll region on dist/colophon/index.html, which this cycle does
 * not touch.
 */
function checkNavigationState(html, rel) {
  const problems = [];

  if (!/<main\s+id="main"\s+tabindex="-1">/.test(html)) {
    problems.push(`check-dist: ${rel} is missing <main id="main" tabindex="-1">`);
  }

  const skipLinkIndex = html.indexOf('href="#main"');
  const firstNavIndex = html.indexOf('<nav');
  if (skipLinkIndex === -1) {
    problems.push(`check-dist: ${rel} has no href="#main" skip link`);
  } else if (firstNavIndex === -1 || skipLinkIndex > firstNavIndex) {
    problems.push(`check-dist: ${rel} skip link (href="#main") does not occur before the first <nav`);
  }

  const siteNavMatch = html.match(/<nav\s+class="site-nav"[^>]*>[\s\S]*?<\/nav>/);
  if (!siteNavMatch) {
    problems.push(`check-dist: ${rel} has no <nav class="site-nav"> element`);
  } else {
    const currentAnchors = [...siteNavMatch[0].matchAll(/<a\b([^>]*)>/g)].filter(([, attrs]) =>
      /\baria-current="/.test(attrs),
    );
    const expected = expectedNavCurrent(rel);
    const expectedCount = expected ? 1 : 0;
    if (currentAnchors.length !== expectedCount) {
      problems.push(
        `check-dist: ${rel} has ${currentAnchors.length} aria-current attribute(s) inside .site-nav, expected ${expectedCount}`,
      );
    } else if (expected) {
      const attrs = currentAnchors[0][1];
      const hrefMatch = attrs.match(/\bhref="([^"]*)"/);
      const valueMatch = attrs.match(/\baria-current="([^"]*)"/);
      if (!hrefMatch || hrefMatch[1] !== expected.href) {
        problems.push(
          `check-dist: ${rel} carries aria-current on the anchor with href="${hrefMatch?.[1] ?? '(missing)'}" inside .site-nav, expected it on href="${expected.href}"`,
        );
      }
      if (!valueMatch || valueMatch[1] !== expected.value) {
        problems.push(
          `check-dist: ${rel} has aria-current="${valueMatch?.[1] ?? '(missing)'}" inside .site-nav, expected aria-current="${expected.value}"`,
        );
      }
    }
  }

  let scanHtml = html;
  if (rel === path.join('colophon', 'index.html')) {
    scanHtml = html.replace(/<div\s+class="table-scroll"[^>]*>[\s\S]*?<\/div>/g, '');
  }
  for (const match of scanHtml.matchAll(/aria-label="([^"]*)"/g)) {
    const value = match[1];
    if (/[A-Za-z]/.test(value) && /[\u0400-\u04ff]/.test(value)) {
      problems.push(`check-dist: ${rel} has an aria-label mixing a Latin and a Cyrillic letter: "${value}"`);
    }
  }

  return problems;
}

/**
 * Checks the footer release block (issue #55, Q2', Part 2) on every
 * dist/**\/*.html: the label, exactly one space, then an anchor whose
 * `href` is `https://github.com/mctlhq/portfolio/releases/tag/<version>`
 * and whose text and `data-release` value both equal `<version>`, with
 * `<version>` read from package.json. This is the built-markup counterpart
 * to test/footer.test.ts, which can only see the source template --
 * npm test runs before `astro build`. Returns an array of problem strings.
 */
function checkFooter(html, rel, pkgVersion) {
  const problems = [];
  const releaseBlockRe =
    /<span class="l en">Release<\/span><span class="l ru" lang="ru">Релиз<\/span> <a href="([^"]*)" data-release>([^<]*)<\/a>/;
  const match = html.match(releaseBlockRe);
  if (!match) {
    problems.push(`check-dist: ${rel} footer does not match the expected release block shape (label, one space, then the version anchor)`);
    return problems;
  }
  const [, href, text] = match;
  const expectedHref = `https://github.com/mctlhq/portfolio/releases/tag/${pkgVersion}`;
  if (href !== expectedHref) {
    problems.push(`check-dist: ${rel} footer release anchor href is "${href}", expected "${expectedHref}"`);
  }
  if (text !== pkgVersion) {
    problems.push(`check-dist: ${rel} footer release anchor text is "${text}", expected "${pkgVersion}"`);
  }
  return problems;
}

/**
 * Asserts exactly one <main> landmark per built page.
 */
function checkMainLandmark(html, rel) {
  const problems = [];
  const count = (html.match(/<main[\s>]/gi) || []).length;
  if (count !== 1) {
    problems.push(`check-dist: ${rel} has ${count} <main> landmarks, expected exactly 1`);
  }
  return problems;
}

/**
 * Checks the og:image / twitter:image pair on one built page (issue #50,
 * Q6): both meta tags must carry the same value, and that value must
 * resolve to a file that exists under dist/ -- true whichever branch item 1
 * took (a build-time /og.png, or the documented stop path that leaves both
 * tags on the always-present /og.svg). Returns an array of problem strings.
 */
const OG_META_RE = /<meta\s+(?:property|name)="(og:image|twitter:image)"\s+content="([^"]*)"/g;
const OG_IMAGE_ALT = 'Dmitrii Mashkov — platform engineering with AI on proven open source, dmitriimashkov.com';
const OG_ALT_META_RE = /<meta\s+(?:property|name)="(og:image:alt|twitter:image:alt)"\s+content="([^"]*)"/g;

/**
 * Checks the og:image:alt / twitter:image:alt pair on one built page (issue
 * #88, Q13): both meta tags must carry exactly OG_IMAGE_ALT.
 */
function checkOgImageAlt(html, rel) {
  const problems = [];
  const values = {};
  for (const m of html.matchAll(OG_ALT_META_RE)) {
    values[m[1]] = m[2];
  }
  for (const key of ['og:image:alt', 'twitter:image:alt']) {
    if (values[key] !== OG_IMAGE_ALT) {
      problems.push(`check-dist: ${rel} ${key} is "${values[key] ?? '(missing)'}", expected "${OG_IMAGE_ALT}"`);
    }
  }
  return problems;
}

async function checkOgImageMeta(html, rel) {
  const problems = [];
  const values = {};
  for (const m of html.matchAll(OG_META_RE)) {
    values[m[1]] = m[2];
  }
  const og = values['og:image'];
  const twitter = values['twitter:image'];
  if (!og || !twitter) {
    problems.push(`check-dist: ${rel} is missing an og:image or twitter:image meta tag`);
    return problems;
  }
  if (og !== twitter) {
    problems.push(`check-dist: ${rel} og:image ("${og}") and twitter:image ("${twitter}") differ`);
    return problems;
  }
  let pathname;
  try {
    pathname = new URL(og).pathname;
  } catch {
    problems.push(`check-dist: ${rel} og:image "${og}" is not a valid absolute URL`);
    return problems;
  }
  const filePath = path.join(DIST_DIR, pathname.replace(/^\/+/, ''));
  if (!(await fileExists(filePath))) {
    problems.push(`check-dist: ${rel} og:image/twitter:image points at "${pathname}", which does not exist under dist/`);
  }
  return problems;
}

/**
 * If (and only if) `dist/og.png` exists (issue #50, Q6: the happy-path
 * branch of item 1), reads its IHDR chunk -- 8 bytes at a fixed offset,
 * width then height, no dependency -- and fails unless it is exactly
 * 1200x630. A missing og.png is not itself a problem here; that is what
 * `checkOgImageMeta` already covers via the meta tag it must still resolve
 * to something that exists (og.svg, on the documented stop path).
 */
async function checkOgPngDimensions() {
  const problems = [];
  const ogPngPath = path.join(DIST_DIR, 'og.png');
  if (!(await fileExists(ogPngPath))) {
    return problems;
  }
  const buf = await readFile(ogPngPath);
  const isPng = buf.length >= 24 && buf.toString('ascii', 12, 16) === 'IHDR';
  if (!isPng) {
    problems.push(`check-dist: dist/og.png does not start with a valid PNG IHDR chunk`);
    return problems;
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width !== 1200 || height !== 630) {
    problems.push(`check-dist: dist/og.png is ${width}x${height}, expected exactly 1200x630`);
  }
  return problems;
}

/**
 * Checks that every `<link|script|img|source ... href|src="/assets/..."`
 * or `.../styles/...` reference on a built page carries an 8-hex-character
 * content hash before its extension (issue #50, Q6), and (A3b) that the hash
 * is not merely shape-valid: the referenced file must actually exist under
 * `dist/` and its bytes must hash to the segment named in the URL -- the
 * inverse guard to `scripts/vendor-assets.mjs`'s `emit()`, so nothing
 * unversioned, missing, or stale can ever be dropped into an
 * `immutable`-cached location later. Async because it now reads the
 * referenced file.
 */
const HASHED_SUFFIX_RE = /\.[0-9a-f]{8}\.[a-zA-Z0-9]+$/;
const MANAGED_PATH_RE = /^\/(?:assets|styles)\//;
const SUBRESOURCE_TAG_RE = /<(link|script|img|source)\b[^>]*\s(?:href|src)="([^"]*)"[^>]*>/gi;

async function checkHashedSubresources(html, rel) {
  const problems = [];
  for (const match of html.matchAll(SUBRESOURCE_TAG_RE)) {
    const [, , url] = match;
    if (!MANAGED_PATH_RE.test(url)) continue;
    if (!HASHED_SUFFIX_RE.test(url)) {
      problems.push(
        `check-dist: ${rel} references "${url}" under /assets/ or /styles/ with no 8-hex content hash before its extension`,
      );
      continue;
    }
    const filePath = path.join(DIST_DIR, url.replace(/^\/+/, ''));
    let bytes;
    try {
      bytes = await readFile(filePath);
    } catch {
      problems.push(
        `check-dist: ${rel} references "${url}", which does not exist under ${path.relative(ROOT, DIST_DIR)}/`,
      );
      continue;
    }
    const mismatch = hashMismatch(url, bytes);
    if (mismatch) {
      problems.push(`check-dist: ${rel} references "${url}" -- ${mismatch}`);
    }
  }
  return problems;
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
 * Checks the breadcrumb (issue #49, Q5) on one built journal or ADR page:
 * src/components/Breadcrumb.astro renders a <nav class="breadcrumb"> with an
 * <ol> of exactly three <li> items -- a link to "/", a link to "/colophon/",
 * and a non-link current entry carrying aria-current="page" -- and nothing
 * else in the check suite verifies this component's rendered output.
 */
function checkBreadcrumb(html, rel) {
  const problems = [];
  const navMatch = html.match(/<nav\s+class="breadcrumb"[^>]*>[\s\S]*?<\/nav>/);
  if (!navMatch) {
    problems.push(`check-dist: ${rel} has no <nav class="breadcrumb"> element`);
    return problems;
  }
  const items = [...navMatch[0].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  if (items.length !== 3) {
    problems.push(`check-dist: ${rel} breadcrumb has ${items.length} <li> item(s), expected exactly 3`);
    return problems;
  }
  if (!/<a\s+href="\/"/.test(items[0])) {
    problems.push(`check-dist: ${rel} breadcrumb's first item is not a link to "/"`);
  }
  if (!/<a\s+href="\/colophon\/"/.test(items[1])) {
    problems.push(`check-dist: ${rel} breadcrumb's second item is not a link to "/colophon/"`);
  }
  if (/<a\b/.test(items[2])) {
    problems.push(`check-dist: ${rel} breadcrumb's third item is a link, expected a non-link current entry`);
  }
  if (!/<span\s+aria-current="page"/.test(items[2])) {
    problems.push(`check-dist: ${rel} breadcrumb's third item is missing aria-current="page"`);
  }
  return problems;
}

/** Decodes the small set of HTML entities Astro emits into element text
 * (Astro escapes `&`, `<`, `>`, `"` and `'`), so a name compared against a
 * JSON-LD string (which carries no HTML escaping) matches byte for byte. */
function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Reads the three visible breadcrumb names (English half) out of a built
 * journal or ADR page's `<nav class="breadcrumb">` -- the same source
 * checkBreadcrumb() already parses -- for checkJsonLd() to compare against
 * the JSON-LD names, so the two cannot drift silently. Returns `null` when
 * the breadcrumb itself is malformed (checkBreadcrumb() already reports
 * that).
 */
function breadcrumbEnNames(html) {
  const navMatch = html.match(/<nav\s+class="breadcrumb"[^>]*>[\s\S]*?<\/nav>/);
  if (!navMatch) return null;
  const items = [...navMatch[0].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  if (items.length !== 3) return null;
  const names = items.map((item) => {
    const enSpan = item.match(/<span class="l en">([^<]*)<\/span>/);
    return enSpan ? decodeHtmlEntities(enSpan[1]) : null;
  });
  if (names.some((name) => name === null)) return null;
  return names;
}

/**
 * Checks the `BreadcrumbList` JSON-LD block on one built journal or ADR page
 * (issue #88, Q13, acceptance criterion D): exactly one
 * `application/ld+json` block, it parses, its `@type` is `BreadcrumbList`,
 * it has three `itemListElement` entries at positions 1, 2, 3, and their
 * three `name` values equal the three names read out of that same page's
 * rendered `<nav class="breadcrumb">` English spans -- the anti-drift proof,
 * measured on built bytes, not on the template.
 */
function checkJsonLd(html, rel) {
  const problems = [];
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (blocks.length !== 1) {
    problems.push(`check-dist: ${rel} has ${blocks.length} application/ld+json block(s), expected exactly 1`);
    return problems;
  }
  let parsed;
  try {
    parsed = JSON.parse(blocks[0][1]);
  } catch (err) {
    problems.push(`check-dist: ${rel} application/ld+json block does not parse: ${err.message}`);
    return problems;
  }
  if (parsed['@type'] !== 'BreadcrumbList') {
    problems.push(`check-dist: ${rel} application/ld+json @type is "${parsed['@type']}", expected "BreadcrumbList"`);
  }
  const items = Array.isArray(parsed.itemListElement) ? parsed.itemListElement : [];
  if (items.length !== 3) {
    problems.push(`check-dist: ${rel} application/ld+json itemListElement has ${items.length} entries, expected exactly 3`);
    return problems;
  }
  for (const [index, item] of items.entries()) {
    if (item.position !== index + 1) {
      problems.push(`check-dist: ${rel} application/ld+json itemListElement[${index}].position is ${item.position}, expected ${index + 1}`);
    }
  }
  const expectedNames = breadcrumbEnNames(html);
  if (expectedNames === null) {
    problems.push(`check-dist: ${rel} could not read the visible breadcrumb's English names to compare against JSON-LD`);
  } else {
    const actualNames = items.map((item) => item.name);
    for (let i = 0; i < 3; i += 1) {
      if (actualNames[i] !== expectedNames[i]) {
        problems.push(
          `check-dist: ${rel} application/ld+json itemListElement[${i}].name is "${actualNames[i]}", expected "${expectedNames[i]}" (the visible breadcrumb's English name)`,
        );
      }
    }
  }
  return problems;
}

const TITLE_MAX_LENGTH = 75;

/** Reports a problem when a built page's <title> exceeds TITLE_MAX_LENGTH
 * code points -- the gap between "the template renders this" (test/title.
 * test.ts) and "the browser receives this" (issue #88, Q13). */
function checkTitleLength(html, rel) {
  const problems = [];
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  const titleText = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';
  const length = [...titleText].length;
  if (length > TITLE_MAX_LENGTH) {
    problems.push(`check-dist: ${rel} <title> is ${length} characters, over the ${TITLE_MAX_LENGTH}-character limit: "${titleText}"`);
  }
  return problems;
}

/**
 * Checks a built journal page's robots meta and canonical against its
 * entry's `indexing` value (issue #88, Q13, acceptance criterion C): a
 * `noindex` entry must carry exactly
 * `<meta name="robots" content="noindex,follow">` and a
 * `<link rel="canonical">`; an `index` entry must carry no robots meta at
 * all.
 */
function checkJournalIndexing(html, rel, indexing) {
  const problems = [];
  const hasNoindexFollow = /<meta name="robots" content="noindex,follow"\s*\/?>/.test(html);
  const hasAnyRobots = /<meta name="robots"/.test(html);
  const hasCanonical = /<link rel="canonical"/.test(html);
  if (indexing === 'noindex') {
    if (!hasNoindexFollow) {
      problems.push(`check-dist: ${rel} is a noindex journal entry but is missing <meta name="robots" content="noindex,follow">`);
    }
    if (!hasCanonical) {
      problems.push(`check-dist: ${rel} is a noindex journal entry but is missing <link rel="canonical">`);
    }
  } else if (hasAnyRobots) {
    problems.push(`check-dist: ${rel} is an index journal entry but carries a robots meta tag`);
  }
  return problems;
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

  // id -> 'index' | 'noindex', read straight from frontmatter (issue #88,
  // Q13) so checkJournalIndexing() below can compare the built page's
  // robots meta against the entry's own declared value.
  const journalIndexingById = new Map();
  for (const id of journal.publicIds) {
    const text = await readFile(path.join(JOURNAL_DIR, `${id}.md`), 'utf8');
    journalIndexingById.set(id, indexingFromFrontmatter(text) ?? 'index');
  }

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

    if (pkgVersion !== null) {
      problems.push(...checkFooter(html, rel, pkgVersion));
    }
    problems.push(...checkMainLandmark(html, rel));

    const distRel = path.relative(DIST_DIR, file);
    const journalPrefix = `${path.join('colophon', 'journal')}${path.sep}`;
    const adrPrefix = `${path.join('colophon', 'adr')}${path.sep}`;
    if (distRel.startsWith(journalPrefix) || distRel.startsWith(adrPrefix)) {
      problems.push(...checkBreadcrumb(html, rel));
      problems.push(...checkTitleLength(html, rel));
      problems.push(...checkJsonLd(html, rel));
    }
    if (distRel.startsWith(journalPrefix)) {
      const id = distRel.slice(journalPrefix.length).split(path.sep)[0];
      const indexing = journalIndexingById.get(id) ?? 'index';
      problems.push(...checkJournalIndexing(html, rel, indexing));
    }

    for (const match of html.matchAll(SUBRESOURCE_RE)) {
      const [full, tag, url] = match;
      if (tag.toLowerCase() === 'link') {
        const relMatch = full.match(/\srel="([^"]*)"/i);
        const relValue = relMatch ? relMatch[1].toLowerCase() : '';
        if (relValue === 'canonical' || relValue === 'alternate') continue;
      }
      if (ABSOLUTE_URL_RE.test(url)) {
        problems.push(`check-dist: ${rel} has a <${tag}> pointing at an absolute/protocol-relative URL: ${url}`);
      }
    }

    if (/<style\b/i.test(html)) {
      problems.push(`check-dist: ${rel} contains a <style> element, which style-src 'self' (no 'unsafe-inline') would block at runtime`);
    }
    if (/\sstyle="/i.test(html)) {
      problems.push(`check-dist: ${rel} contains a style="..." attribute, which style-src 'self' (no 'unsafe-inline') would block at runtime`);
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

const ASTRO_CONFIG_PATH = path.join(ROOT, 'astro.config.mjs');

/** Reads the `site` origin out of astro.config.mjs (no trailing slash), so
 * the config stays the single source of truth for the expected sitemap
 * URLs. */
async function siteOrigin() {
  const text = await readFile(ASTRO_CONFIG_PATH, 'utf8');
  const match = text.match(/site:\s*['"]([^'"]+)['"]/);
  if (!match) {
    throw new Error('check-dist: could not find `site` in astro.config.mjs');
  }
  return match[1].replace(/\/$/, '');
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
}

/**
 * Checks dist/sitemap-index.xml and the sitemap file(s) it references
 * (issue #10, P8) against the closure of every public page: `/`, `/work/`,
 * `/approach/`, `/colophon/`, one `/colophon/journal/<id>/` per public
 * journal entry and one `/colophon/adr/<id>/` per public ADR entry --
 * derived independently from src/content/journal and src/content/adr via
 * idsByVisibility(), the same helper checkColophonPages() uses, so a page
 * missing from the sitemap or a private id leaking into it both fail here
 * regardless of what the sitemap integration itself claims to have done.
 * Returns an array of problem strings.
 */
async function checkSitemap() {
  const problems = [];
  // B3a: siteOrigin() throws when astro.config.mjs has no `site` -- caught
  // here and returned as a problem instead of left to abort main() before
  // the report prints, the same treatment scripts/check-headers.mjs applies
  // to discoverHashedAssetPath()/discoverAstroAsset() for the identical
  // shape of defect.
  let origin;
  try {
    origin = await siteOrigin();
  } catch (err) {
    problems.push(err.message.startsWith('check-dist:') ? err.message : `check-dist: ${err.message}`);
    return problems;
  }

  const indexPath = path.join(DIST_DIR, 'sitemap-index.xml');
  if (!(await fileExists(indexPath))) {
    problems.push(`check-dist: ${path.relative(ROOT, indexPath)} does not exist`);
    return problems;
  }

  const indexXml = await readFile(indexPath, 'utf8');
  const childLocs = extractLocs(indexXml);
  if (childLocs.length === 0) {
    problems.push(`check-dist: ${path.relative(ROOT, indexPath)} lists no child sitemap`);
    return problems;
  }

  const found = new Set();
  for (const loc of childLocs) {
    if (!loc.startsWith(origin)) {
      problems.push(`check-dist: sitemap-index.xml references a child sitemap outside ${origin}: ${loc}`);
      continue;
    }
    const relPath = loc.slice(origin.length);
    const childPath = path.join(DIST_DIR, relPath);
    if (!(await fileExists(childPath))) {
      problems.push(`check-dist: child sitemap ${relPath} referenced by sitemap-index.xml does not exist under dist/`);
      continue;
    }
    const childXml = await readFile(childPath, 'utf8');
    for (const url of extractLocs(childXml)) {
      found.add(url);
    }
  }

  const journal = await idsByVisibility(JOURNAL_DIR);
  const adr = await idsByVisibility(ADR_DIR);
  const noindexIds = new Set(noindexJournalIds(JOURNAL_DIR));
  const indexedJournalIds = journal.publicIds.filter((id) => !noindexIds.has(id));
  const expectedPaths = [
    '/',
    '/work/',
    '/approach/',
    '/colophon/',
    ...indexedJournalIds.map((id) => `/colophon/journal/${id}/`),
    ...adr.publicIds.map((id) => `/colophon/adr/${id}/`),
  ];
  const expected = new Set(expectedPaths.map((p) => `${origin}${p}`));

  for (const url of expected) {
    if (!found.has(url)) {
      problems.push(`check-dist: sitemap is missing expected URL ${url}`);
    }
  }
  for (const url of found) {
    if (!expected.has(url)) {
      problems.push(`check-dist: sitemap contains unexpected URL ${url}`);
    }
  }

  return problems;
}

async function run() {
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
    const rel = path.relative(DIST_DIR, file);
    const enCount = countOccurrences(html, 'class="l en"');
    const ruCount = countOccurrences(html, 'class="l ru"');
    if (enCount !== ruCount) {
      problems.push(
        `check-dist: ${path.relative(ROOT, file)} has ${enCount} occurrences of class="l en" but ${ruCount} of class="l ru"`,
      );
    }

    problems.push(...checkNavigationState(html, rel));
    problems.push(...(await checkOgImageMeta(html, rel)));
    problems.push(...checkOgImageAlt(html, rel));
    problems.push(...(await checkHashedSubresources(html, rel)));

    if (rel === '404.html') {
      problems.push(...check404Page(html, rel));
    }

    if (rel === path.join('work', 'index.html')) {
      const summaryH2Count = countOccurrences(html, '<summary><h2');
      if (summaryH2Count !== 0) {
        problems.push(
          `check-dist: ${rel} has ${summaryH2Count} "<summary><h2" opening(s), expected exactly 0 (work.astro's disclosures carry no heading)`,
        );
      }
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

  const homePageProblems = await checkHomePage();
  problems.push(...homePageProblems);

  const approachResult = await checkApproachPage();
  problems.push(...approachResult.problems);

  const colophonResult = await checkColophonPages(allFiles);
  problems.push(...colophonResult.problems);

  const sitemapProblems = await checkSitemap();
  problems.push(...sitemapProblems);

  const ogPngProblems = await checkOgPngDimensions();
  problems.push(...ogPngProblems);

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

/**
 * B3a (issue #71, A2): wraps the whole run so any residual throw -- from a
 * helper this file does not yet guard, or from a future edit that
 * reintroduces one -- becomes one final problem line and a non-zero exit,
 * rather than an uncaught rejection that discards the accumulated report.
 * Same shape as scripts/check-headers.mjs's main()/run() split.
 */
async function main() {
  try {
    await run();
  } catch (err) {
    console.error(`check-dist: unhandled error: ${err.message}`);
    process.exitCode = 1;
  }
}

await main();
