// Render-time linkification for the colophon "Build and deploy chain" list
// (issue #55, Q2'). `src/i18n/ui.ts` must keep every entry a plain string or
// array of plain strings -- test/ui.test.ts asserts that shape -- so the two
// identifiers in each chain item are turned into links here, at render time,
// rather than by storing markup in the dictionary.

/** One slice of a chain item: plain text, or text wrapped in a link. */
export interface ChainSegment {
  text: string;
  href?: string;
}

// Longest text first so a future prefix relationship (one identifier being a
// prefix of another) cannot mis-split at the shorter match.
export const CHAIN_LINKS = [
  { text: 'github.com/mctlhq/portfolio', href: 'https://github.com/mctlhq/portfolio' },
  { text: 'ghcr.io/mctlhq/portfolio', href: 'https://github.com/mctlhq/portfolio/packages' },
] as const;

/**
 * Scans `item` left to right. At each position, takes the earliest-starting
 * match among `CHAIN_LINKS` (ties broken by longest `text`), emits any
 * skipped prefix as a plain segment, and emits the match as a linked
 * segment. The concatenation of every returned segment's `text` is always
 * byte-identical to `item` -- this is "leaving every other character
 * unchanged" as a structural property, not merely an assertion in a test.
 */
export function chainSegments(item: string): ChainSegment[] {
  if (item.length === 0) {
    return [{ text: '' }];
  }

  const segments: ChainSegment[] = [];
  let cursor = 0;

  while (cursor < item.length) {
    let bestIndex = -1;
    let bestLink: (typeof CHAIN_LINKS)[number] | null = null;

    for (const link of CHAIN_LINKS) {
      const index = item.indexOf(link.text, cursor);
      if (index === -1) continue;
      if (
        bestIndex === -1 ||
        index < bestIndex ||
        (index === bestIndex && link.text.length > (bestLink?.text.length ?? 0))
      ) {
        bestIndex = index;
        bestLink = link;
      }
    }

    if (bestIndex === -1 || bestLink === null) {
      segments.push({ text: item.slice(cursor) });
      break;
    }

    if (bestIndex > cursor) {
      segments.push({ text: item.slice(cursor, bestIndex) });
    }
    segments.push({ text: bestLink.text, href: bestLink.href });
    cursor = bestIndex + bestLink.text.length;
  }

  return segments;
}
