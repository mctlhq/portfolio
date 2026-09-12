// Zero-import helper module: only `node:crypto`, no `astro:content`, no
// `astro/loaders`, no `zod`. This keeps the module importable by plain
// `node --test`, with no build step, so `test/csp.test.ts` can exercise the
// real logic and both `scripts/csp-hash.mjs` (the generator) and
// `scripts/check-headers.mjs` (the runtime checker) can import the same
// inline-script regex and the same quoting function -- "the same regex
// scripts/csp-hash.mjs uses" and "the token a browser accepts" are then
// enforced by identity, not by two hand-kept copies.

import { createHash } from 'node:crypto';

/**
 * Matches every inline `<script>` element -- one without a `src=` attribute
 * -- capturing its text content. Moved verbatim out of the generator's
 * former local copy; do not retype it.
 */
export const INLINE_SCRIPT_RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

/** Extracts the text content of every inline `<script>` element in `html`. */
export function extractInlineScripts(html: string): string[] {
  const bodies: string[] = [];
  const re = new RegExp(INLINE_SCRIPT_RE.source, INLINE_SCRIPT_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    bodies.push(m[1]);
  }
  return bodies;
}

/** SHA-256 of `body`, base64-encoded -- the digest a CSP hash source names. */
export function sha256Base64(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('base64');
}

/**
 * Renders a digest as a quoted CSP hash source, e.g. `'sha256-<base64>'`.
 * This is the only place a quote character is written -- the generator and
 * the checker both call this, so neither can drift from the other on
 * whether or how the token is quoted.
 */
export function hashToken(hash: string, algo = 'sha256'): string {
  return `'${algo}-${hash}'`;
}

/**
 * Splits a Content-Security-Policy header on `;`, finds the directive whose
 * first whitespace-delimited word is `script-src`, and returns its
 * remaining tokens. Returns `null` when the header has no `script-src`
 * directive at all.
 */
export function scriptSrcTokens(csp: string): string[] | null {
  const directives = csp.split(';').map((d) => d.trim()).filter((d) => d.length > 0);
  for (const directive of directives) {
    const words = directive.split(/\s+/).filter((w) => w.length > 0);
    if (words[0] === 'script-src') {
      return words.slice(1);
    }
  }
  return null;
}

/** Matches a token that names a hash algorithm anywhere within it. */
export const HASH_TOKEN_RE = /sha(256|384|512)-/;

/** Matches a token that is exactly a validly quoted hash source expression. */
export const QUOTED_HASH_RE = /^'sha(256|384|512)-[A-Za-z0-9+/]+={0,2}'$/;

/**
 * Reports every `script-src` hash-source problem in `csp`: a missing
 * `script-src` directive, a directive with no hash-shaped token at all, and
 * any hash-shaped token that is not a full match of `QUOTED_HASH_RE` (e.g.
 * unquoted, quoted on only one side, or quoted alongside a stray unquoted
 * token). Each message carries the offending token verbatim and is prefixed
 * with `label` so multiple checks can be told apart.
 */
export function scriptSrcHashProblems(csp: string, label: string): string[] {
  const problems: string[] = [];
  const tokens = scriptSrcTokens(csp);
  if (tokens === null) {
    problems.push(`${label}: CSP has no script-src directive`);
    return problems;
  }
  const hashLike = tokens.filter((t) => HASH_TOKEN_RE.test(t));
  if (hashLike.length === 0) {
    problems.push(`${label}: CSP script-src has no hash source (expected '<algo>-<base64>')`);
    return problems;
  }
  for (const token of hashLike) {
    if (!QUOTED_HASH_RE.test(token)) {
      problems.push(
        `${label}: CSP script-src hash source is not a valid quoted source expression: ${token} (expected '<algo>-<base64>')`,
      );
    }
  }
  return problems;
}

/**
 * Extracts the inline `<script>` bodies from `html`, hashes each with
 * SHA-256, and requires `scriptSrcTokens(csp)` to contain `hashToken(hash)`
 * for every one of them. Reports a problem naming both the expected token
 * and the tokens actually found when a hash is missing from `script-src` --
 * this is the end-to-end check that a correctly quoted hash still matches
 * the bytes actually served, not just the shape of a hash.
 */
export function staleHashProblems(csp: string, html: string, label: string): string[] {
  const problems: string[] = [];
  const bodies = extractInlineScripts(html);
  if (bodies.length === 0) {
    problems.push(`${label}: CSP hash was not compared -- no inline <script> body found in the response`);
    return problems;
  }
  const tokens = scriptSrcTokens(csp) ?? [];
  for (const body of bodies) {
    const expected = hashToken(sha256Base64(body));
    if (!tokens.includes(expected)) {
      problems.push(
        `${label}: CSP script-src hash is stale -- expected ${expected}, found: ${tokens.join(' ') || '(none)'}`,
      );
    }
  }
  return problems;
}
