import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import type { Loader } from 'astro/loaders';
import { isoWithOffset, yyyyMmDd } from './lib/journal.ts';
import { checkAdrBodies } from './lib/adr.ts';

const idFromFile = ({ entry }: { entry: string }) => entry.replace(/\.md$/, '');

const githubUrl = z.string().regex(/^https:\/\/github\.com\/[^\s]+$/);
const httpsUrl = z.string().regex(/^https:\/\/[^\s]+$/);
const semver = z.string().regex(/^\d+\.\d+\.\d+$/); // no v prefix, AGENTS.md
const bilingual = z.strictObject({ en: z.string().min(1), ru: z.string().min(1) });
const stamp = z
  .string()
  .refine(isoWithOffset, {
    message:
      "must be a quoted ISO 8601 timestamp with a timezone, e.g. '2026-09-10T22:44:09Z' -- " +
      'quote it so YAML does not parse it into a Date',
  })
  .transform((s) => new Date(s));

const projects = defineCollection({
  loader: glob({
    pattern: '*.{en,ru}.md',
    base: './src/content/projects',
    generateId: idFromFile,
  }),
  schema: z.strictObject({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    lang: z.enum(['en', 'ru']),
    name: z.string().min(1),
    group: z.enum(['platform', 'product']),
    order: z.number().int().nonnegative(),
    repo: githubUrl,
    stack: z.array(z.string().min(1)).min(1),
    summary: z.string().min(1).refine((s) => !s.includes('\n'), 'summary is one line'),
    links: z.array(z.strictObject({ label: z.string().min(1), url: httpsUrl })).optional(),
  }),
});

const journal = defineCollection({
  loader: glob({
    pattern: '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*.md',
    base: './src/content/journal',
    generateId: idFromFile,
  }),
  schema: z.strictObject({
    service: z.enum(['portfolio', 'mctl-agents', 'mctl-api']),
    issue: githubUrl,
    proposal_slug: z.string().min(1),
    pr: githubUrl.optional(),
    release: semver.optional(),
    visibility: z.enum(['public', 'private']),
    title: bilingual,
    decided: bilingual,
    issue_opened_at: stamp,
    proposal_approved_at: stamp.optional(),
    merged_at: stamp.optional(),
    released_at: stamp.optional(),
    deployed_at: stamp.optional(),
    interventions: z
      .array(
        z.strictObject({
          what: z.string().min(1),
          why: z.string().min(1),
          at: stamp,
        }),
      )
      .default([]),
  }),
});

// The base glob loader validates each entry's frontmatter against the `adr`
// schema (via ctx.parseData, wired up by the content layer from the schema
// below) and stores the parsed `data` -- including the numeric `id` field --
// in ctx.store alongside the raw markdown `body`. Wrapping the loader lets us
// run one extra pass, after the base loader has synced every file, that
// checks the whole store: both the five-section/bilingual body shape
// (checkAdrBodies -> adrBodyProblems) and that every entry's frontmatter `id`
// still matches the four-digit prefix of its filename. This runs on
// `astro sync`, `astro check`, `astro dev` and `astro build` alike, because
// all four call the loader; an `astro:build:done` integration hook would run
// only after `dist/` was already written, and could not call `getCollection`.
function adrLoader(): Loader {
  const base = glob({
    pattern: '[0-9][0-9][0-9][0-9]-*.md',
    base: './src/content/adr',
    generateId: idFromFile,
  });
  return {
    ...base,
    name: 'adr-with-section-check',
    load: async (ctx) => {
      await base.load(ctx);
      checkAdrBodies(
        ctx.store.entries().map(([id, entry]) => ({
          id,
          body: entry.body ?? '',
          frontmatterId: entry.data.id as number | undefined,
        })),
      );
    },
  };
}

const adr = defineCollection({
  loader: adrLoader(),
  schema: z.strictObject({
    id: z.number().int().positive(),
    title: bilingual,
    status: z.enum(['proposed', 'accepted', 'superseded', 'deprecated']),
    date: z.string().regex(yyyyMmDd),
    supersedes: z.number().int().positive().optional(),
    visibility: z.enum(['public', 'private']),
  }),
});

export const collections = { projects, journal, adr };
