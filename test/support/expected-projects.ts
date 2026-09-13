// Plain support module (not a test file): the single source of truth for
// the ten projects `/work/` renders, one row per slug in the order the
// table in proposal task 2 specifies. `test/projects.test.ts` and
// `test/work.test.ts` both import this instead of hand-typing the slug list
// and its counts twice, so a list and a count that must agree cannot drift
// apart again (issue #89, criterion C.9). This file exports no test and
// registers nothing with node:test; it is deliberately absent from the
// `npm test` file list in package.json.

export interface ExpectedProject {
  slug: string;
  group: 'platform' | 'product';
  order: number;
}

export const EXPECTED_PROJECTS: readonly ExpectedProject[] = [
  { slug: 'mctl-api', group: 'platform', order: 1 },
  { slug: 'mctl-gitops', group: 'platform', order: 2 },
  { slug: 'mctl-agents', group: 'platform', order: 3 },
  { slug: 'mctl-portal', group: 'platform', order: 4 },
  { slug: 'mctl-design', group: 'platform', order: 5 },
  { slug: 'mctl-telegram', group: 'product', order: 6 },
  { slug: 'seerrsense', group: 'product', order: 7 },
  { slug: 'mctl-academy', group: 'product', order: 8 },
  { slug: 'mctl-loyalty', group: 'product', order: 9 },
  { slug: 'pelican-libertex-social', group: 'product', order: 10 },
] as const;

export const EXPECTED_SLUGS: readonly string[] = EXPECTED_PROJECTS.map((p) => p.slug);
