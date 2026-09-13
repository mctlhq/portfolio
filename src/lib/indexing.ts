// Zero-import helper module apart from node:fs and node:path -- no
// `astro:content`, no `astro/loaders`, no `zod`. This keeps the module
// importable three ways that already exist in this repo: `astro.config.mjs`
// loads it through Vite, `scripts/*.mjs` import `.ts` siblings under plain
// Node 24 today (e.g. `../src/lib/csp.ts`), and `node --test` runs `.ts`
// directly. It is the single source of truth for "which journal entries
// leave the index" (issue #88, Q13): the sitemap filter in
// astro.config.mjs and the expected-set derivation in
// scripts/check-dist.mjs both call it, so the two cannot disagree.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const INDEXING_RE = /^indexing:\s*(index|noindex)\s*$/m;

/** Extracts the `indexing:` frontmatter value from a journal entry's raw
 * text, or `null` when no such line is present. */
export function indexingFromFrontmatter(text: string): 'index' | 'noindex' | null {
  const match = INDEXING_RE.exec(text);
  return match ? (match[1] as 'index' | 'noindex') : null;
}

/** Sorted ids of every journal entry under `dir` whose frontmatter declares
 * `indexing: noindex`. A synchronous read: this runs at `astro.config.mjs`
 * load time, before any async loader has a chance to run. */
export function noindexJournalIds(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const text = readFileSync(path.join(dir, entry.name), 'utf8');
    if (indexingFromFrontmatter(text) === 'noindex') {
      ids.push(entry.name.replace(/\.md$/, ''));
    }
  }
  return ids.sort();
}

/** The sitemap-excluded `/colophon/journal/<id>/` path for every `noindex`
 * journal entry under `dir`. */
export function noindexJournalPaths(dir: string): string[] {
  return noindexJournalIds(dir).map((id) => `/colophon/journal/${id}/`);
}
