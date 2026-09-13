// Plain support module (not a test file): the shared flat-regex rule-block
// parser both test/a11y.test.ts and test/header.test.ts use. The parser does
// not understand @media nesting, so a selector that also appears inside
// @media print (e.g. `.site-header`, `.toggle-group`) resolves to more than
// one block body -- the real one and the print block's `display: none;`
// one. ruleBlockBodies() therefore returns every matching body, in source
// order, rather than picking one: callers that need "the real declarations"
// must use .some()/.every() over the returned list rather than assume a
// single body or that the last one wins. This file exports no test and
// registers nothing with node:test; it is deliberately absent from the
// `npm test` file list in package.json.

/**
 * Returns every rule block body in `css` whose selector list -- comma-split
 * and whitespace-normalised -- contains the exact `selector`, in source
 * order. A selector that appears in more than one rule block (most notably
 * because the flat regex below also matches inside @media blocks) yields
 * one entry per block.
 */
export function ruleBlockBodies(css: string, selector: string): string[] {
  const bodies: string[] = [];
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(css))) {
    const selectors = m[1]
      .split(',')
      .map((s) => s.trim().replace(/\s+/g, ' '));
    if (selectors.includes(selector)) {
      bodies.push(m[2]);
    }
  }
  return bodies;
}

/**
 * Returns every `min-block-size` value (in px) declared across every rule
 * block whose selector list contains the exact `selector`, in source order.
 */
export function minBlockSizes(css: string, selector: string): number[] {
  const sizes: number[] = [];
  for (const body of ruleBlockBodies(css, selector)) {
    const sizeMatch = body.match(/min-block-size:\s*(\d+)px/);
    if (sizeMatch) {
      sizes.push(Number(sizeMatch[1]));
    }
  }
  return sizes;
}
