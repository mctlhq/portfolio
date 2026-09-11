// Zero-import helper module: no `astro:content`, no `astro/loaders`, no
// `zod`. This keeps the module importable by plain `node --test`, with no
// build step, so `test/content.test.ts` can exercise the real logic. The
// generic `T extends { data: HasVisibility }` shape lets both the `journal`
// and `adr` collections (and any future collection carrying a `visibility`
// field) share one filter instead of three copies of
// `.filter(e => e.data.visibility === 'public')`.

export interface HasVisibility {
  visibility: 'public' | 'private';
}

export function isPublic<T extends { data: HasVisibility }>(entry: T): boolean {
  return entry.data.visibility === 'public';
}

export function publicEntries<T extends { data: HasVisibility }>(entries: readonly T[]): T[] {
  return entries.filter(isPublic);
}
