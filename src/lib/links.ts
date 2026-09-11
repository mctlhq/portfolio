// Shared link targets for the footer and colophon "Build and deploy chain"
// list, plus the longest-match-at-position scanner that turns a plain-text
// chain item into linked/plain segments without touching the copy itself
// (src/i18n/ui.ts stays byte-identical -- see colophon/index.astro).

export const REPO_URL = 'https://github.com/mctlhq/portfolio';
export const PACKAGES_URL = `${REPO_URL}/packages`;

export function releaseTagUrl(version: string): string {
  return `${REPO_URL}/releases/tag/${version}`;
}

export const CHAIN_LINKS = [
  { text: 'github.com/mctlhq/portfolio', href: REPO_URL },
  { text: 'ghcr.io/mctlhq/portfolio', href: PACKAGES_URL },
] as const;

export interface LinkSegment {
  text: string;
  href?: string;
}

/**
 * Scans `item` left to right. At each position, checks CHAIN_LINKS for the
 * longest entry whose `text` starts there. A match becomes a linked segment
 * and advances past it; anything else is accumulated into a plain-text
 * segment. Concatenating every returned segment's `text` reconstructs `item`
 * exactly -- no character is lost, duplicated, or reordered.
 */
export function splitByLinks(item: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  let plain = '';
  let i = 0;

  while (i < item.length) {
    let best: (typeof CHAIN_LINKS)[number] | null = null;
    for (const link of CHAIN_LINKS) {
      if (item.startsWith(link.text, i) && (best === null || link.text.length > best.text.length)) {
        best = link;
      }
    }
    if (best) {
      if (plain) {
        segments.push({ text: plain });
        plain = '';
      }
      segments.push({ text: best.text, href: best.href });
      i += best.text.length;
    } else {
      plain += item[i];
      i += 1;
    }
  }
  if (plain) {
    segments.push({ text: plain });
  }
  return segments;
}
