// Zero-import helper module: only `node:crypto`, no `astro:content`, no
// `astro/loaders`, no `zod`. Modelled exactly on `src/lib/csp.ts` -- the same
// "the same regex, the same derivation, enforced by identity rather than by
// hand-kept copies" pattern -- so `scripts/vendor-assets.mjs` (the producer),
// `scripts/check-dist.mjs` and `scripts/check-headers.mjs` (checkers), and
// `test/cache.test.ts` (`node --test`) all compute "does this name match
// these bytes" the same way.

import { createHash } from 'node:crypto';

/**
 * Matches a filename or URL of the shape `<base>.<hash8>.<ext>`, capturing
 * the 8-hex-character hash segment -- the naming convention
 * `scripts/vendor-assets.mjs`'s `emit()` writes every hashed asset under.
 */
export const HASHED_NAME_RE = /\.([0-9a-f]{8})\.[a-zA-Z0-9]+$/;

/** The first 8 hex characters of the SHA-256 of `bytes` -- the identity
 * `emit()` writes into a filename and every checker below compares against. */
export function contentHash8(bytes: Buffer | string): string {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
  return createHash('sha256').update(buf).digest('hex').slice(0, 8);
}

/** The 8-hex hash segment embedded in `nameOrUrl` (the last path segment
 * before its extension), or `null` when the name is not hash-shaped at all. */
export function hashInName(nameOrUrl: string): string | null {
  const match = HASHED_NAME_RE.exec(nameOrUrl);
  return match ? match[1] : null;
}

/**
 * Compares the hash embedded in `nameOrUrl` against `contentHash8(bytes)`.
 * Returns `null` when the name matches its own bytes (or carries no hash
 * segment at all -- nothing to check), or a message naming both the expected
 * and actual hash on a mismatch.
 */
export function hashMismatch(nameOrUrl: string, bytes: Buffer | string): string | null {
  const expected = hashInName(nameOrUrl);
  if (expected === null) return null;
  const actual = contentHash8(bytes);
  if (actual === expected) return null;
  return `${nameOrUrl}: embedded hash ${expected} does not match its bytes' actual SHA-256 (${actual})`;
}
