// Zero-import helper module: no `astro:content`, no `astro/loaders`, no
// `zod`. This keeps the module importable by plain `node --test`, with no
// build step, so `test/seo.test.ts` can exercise the real logic. The one
// exception is `padAdrId` from `src/lib/adr.ts`, itself zero-import for the
// same reason, so `adrPageTitle` does not retype the id-padding format.

import { padAdrId } from './adr.ts';

const ELLIPSIS = '…';

/**
 * Clamps `text` to at most `max` characters, cutting at the last word
 * boundary before the limit and appending a single ellipsis only when the
 * text actually had to be shortened. Returns `text` unchanged when it
 * already fits. Never returns more than `max` characters.
 */
export function clampDescription(text: string, max = 160): string {
  if (text.length <= max) {
    return text;
  }
  const limit = max - ELLIPSIS.length;
  let truncated = text.slice(0, limit);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 0) {
    truncated = truncated.slice(0, lastSpace);
  }
  truncated = truncated.replace(/\s+$/, '');
  return `${truncated}${ELLIPSIS}`;
}

/**
 * Reports a problem when `title`, counted in code points (so an em dash
 * counts once, not as a UTF-16 surrogate pair's worth), exceeds `warn` or
 * `fail` characters. Returns `[]` at or below `warn`; one `warning:` problem
 * naming the measured length and `warn` when above `warn` but at or below
 * `fail`; one `failure:` problem naming the measured length and `fail` when
 * above `fail`. A search-result title and an editorial <h1> are different
 * jobs (issue #88, Q13) -- this only judges the former.
 */
export function titleProblems(title: string, { warn = 65, fail = 75 }: { warn?: number; fail?: number } = {}): string[] {
  const length = [...title].length;
  if (length <= warn) {
    return [];
  }
  if (length <= fail) {
    return [`warning: title is ${length} characters, over the ${warn}-character budget`];
  }
  return [`failure: title is ${length} characters, over the ${fail}-character limit`];
}

/**
 * The `<title>` a journal entry page renders: `data.seoTitle` verbatim when
 * present, otherwise the editorial template. Kept as the single source both
 * the route and test/title.test.ts call, so the computed title is the
 * rendered title by construction.
 */
export function journalPageTitle(data: { title: { en: string }; seoTitle?: string }): string {
  return data.seoTitle ?? `${data.title.en} — Dmitrii Mashkov`;
}

/**
 * The `<title>` an ADR page renders: `data.seoTitle` verbatim when present,
 * otherwise the editorial template. Imports `padAdrId` from `src/lib/adr.ts`
 * (itself zero-import) rather than retyping the four-digit id format.
 */
export function adrPageTitle(data: { id: number; title: { en: string }; seoTitle?: string }): string {
  return data.seoTitle ?? `ADR-${padAdrId(data.id)}: ${data.title.en} — Dmitrii Mashkov`;
}

/**
 * A `BreadcrumbList` JSON-LD object for `items` (Home, Colophon, current
 * page, in order): `position` 1..n, `name`, and an absolute `item` URL built
 * from `site`. Both the journal and the ADR route build the same three-item
 * array from the same values their visible <Breadcrumb> already renders, so
 * the JSON-LD and the breadcrumb cannot drift.
 */
export function breadcrumbJsonLd(site: string, items: { name: string; path: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: new URL(item.path, site).href,
    })),
  };
}
