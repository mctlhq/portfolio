// Zero-import helper module: no `astro:content`, no `astro/loaders`, no
// `zod`. This keeps the module importable by plain `node --test`, with no
// build step, so `test/seo.test.ts` can exercise the real logic.

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
