import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import type { Loader } from 'astro/loaders';
import {
  checkJournalCollection,
  isRealTimestamp,
  journalEntryProblems,
  yyyyMmDd,
  type JournalCollectionEntry,
  type JournalEntryData,
} from './lib/journal.ts';
import { checkAdrBodies } from './lib/adr.ts';

const idFromFile = ({ entry }: { entry: string }) => entry.replace(/\.md$/, '');

const githubUrl = z.string().regex(/^https:\/\/github\.com\/[^\s]+$/);
const httpsUrl = z.string().regex(/^https:\/\/[^\s]+$/);
const semver = z.string().regex(/^\d+\.\d+\.\d+$/); // no v prefix, AGENTS.md
const bilingual = z.strictObject({ en: z.string().min(1), ru: z.string().min(1) });
// The existing `bilingual` above uses `.min(1)`, which accepts a
// whitespace-only string ('   '); `abandoned_reason` needs a real reason in
// both languages, so it gets its own non-blank string check instead.
const nonBlank = z.string().refine((s) => s.trim().length > 0, 'must contain non-whitespace text');
const nonBlankBilingual = z.strictObject({ en: nonBlank, ru: nonBlank });
const stamp = z
  .string()
  .refine(isRealTimestamp, {
    message:
      "must be a quoted ISO 8601 timestamp with a timezone denoting a real instant, e.g. " +
      "'2026-09-10T22:44:09Z' -- quote it so YAML does not parse it into a Date, and make sure " +
      "the calendar date and time are real (e.g. not '2026-02-31T00:00:00Z')",
  })
  .transform((s) => new Date(s));

const projectsSchema = z.strictObject({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  lang: z.enum(['en', 'ru']),
  name: z.string().min(1),
  group: z.enum(['platform', 'product']),
  order: z.number().int().nonnegative(),
  repo: githubUrl.optional(),
  private: z.boolean().optional(),
  stack: z.array(z.string().min(1)).min(1),
  summary: z.string().min(1).refine((s) => !s.includes('\n'), 'summary is one line'),
  links: z.array(z.strictObject({ label: z.string().min(1), url: httpsUrl })).optional(),
});

type ProjectData = z.infer<typeof projectsSchema>;

/**
 * Checks that every project `slug` has exactly one `en` and one `ru` entry,
 * and that the two agree on every field that is not itself the
 * language-specific content: `group`, `order`, `repo`, `private`, `stack`
 * and each link's `url`. `name`, `summary`, `links[].label` and the body are
 * allowed to differ because they carry the language-specific text.
 */
function checkProjectParity(entries: readonly { id: string; data: ProjectData }[]): void {
  const problems: string[] = [];
  const bySlug = new Map<string, { id: string; data: ProjectData }[]>();
  for (const entry of entries) {
    const list = bySlug.get(entry.data.slug) ?? [];
    list.push(entry);
    bySlug.set(entry.data.slug, list);
  }

  for (const [slug, list] of bySlug) {
    const en = list.filter((entry) => entry.data.lang === 'en');
    const ru = list.filter((entry) => entry.data.lang === 'ru');
    if (en.length !== 1 || ru.length !== 1) {
      const found = list.map((entry) => `${entry.id} (${entry.data.lang})`).join(', ') || 'none';
      problems.push(`project "${slug}": expected exactly one en and one ru file, found ${found}`);
      continue;
    }
    const linkUrls = (data: ProjectData) => (data.links ?? []).map((link) => link.url);
    const agrees =
      en[0].data.group === ru[0].data.group &&
      en[0].data.order === ru[0].data.order &&
      en[0].data.repo === ru[0].data.repo &&
      en[0].data.private === ru[0].data.private &&
      JSON.stringify(en[0].data.stack) === JSON.stringify(ru[0].data.stack) &&
      JSON.stringify(linkUrls(en[0].data)) === JSON.stringify(linkUrls(ru[0].data));
    if (!agrees) {
      problems.push(
        `project "${slug}": ${en[0].id}.md and ${ru[0].id}.md disagree on group, order, repo, private, stack, or links[].url`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(`Project validation failed:\n${problems.map((p) => `- ${p}`).join('\n')}`);
  }
}

/**
 * Wraps the base glob loader for `projects` to run one extra pass, after
 * every file has synced, that checks the whole store for en/ru parity
 * (checkProjectParity): every slug must have exactly one entry per
 * language, and the two must agree on every field that is not
 * language-specific. Mirrors adrLoader below, which does the equivalent
 * check for the adr collection.
 */
function projectsLoader(): Loader {
  const base = glob({
    pattern: '*.{en,ru}.md',
    base: './src/content/projects',
    generateId: idFromFile,
  });
  return {
    ...base,
    name: 'projects-with-parity-check',
    load: async (ctx) => {
      await base.load(ctx);
      checkProjectParity(
        ctx.store.entries().map(([id, entry]) => ({ id, data: entry.data as ProjectData })),
      );
    },
  };
}

const projects = defineCollection({
  loader: projectsLoader(),
  schema: projectsSchema,
});

const journalSchema = z
  .strictObject({
    service: z.enum(['portfolio', 'mctl-agents', 'mctl-api']),
    issue: githubUrl,
    proposal_slug: z.string().min(1),
    status: z.enum(['in_progress', 'complete', 'abandoned']),
    abandoned_reason: nonBlankBilingual.optional(),
    pr: githubUrl.optional(),
    release: semver.optional(),
    visibility: z.enum(['public', 'private']),
    title: bilingual,
    seoTitle: z.string().min(1).optional(),
    indexing: z.enum(['index', 'noindex']).default('index'),
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
  })
  // Cross-field lifecycle rules (status <-> evidence fields, merged_at implies
  // pr, abandoned_reason implies abandoned, nondecreasing timestamp order) are
  // written once as a pure function in src/lib/journal.ts, so `node --test`
  // can exercise them directly; this superRefine only maps journalEntryProblems'
  // output onto ctx.addIssue, naming the offending field in `path`, so Astro's
  // own "frontmatter does not match collection schema" diagnostic identifies
  // the entry, the field and the violation.
  .superRefine((data, ctx) => {
    for (const problem of journalEntryProblems(data as JournalEntryData)) {
      ctx.addIssue({ code: 'custom', path: [problem.field], message: problem.message });
    }
  });

// Wraps the base glob loader for `journal` to run one extra pass, after
// every file has synced, that enforces the one-cycle-at-a-time rule across
// the whole collection (checkJournalCollection): at most one entry, public
// or private, may be `status: in_progress`. Mirrors projectsLoader and
// adrLoader above -- the loader runs on `astro sync`, `astro check`,
// `astro dev` and `astro build` alike, so the guard cannot be bypassed by
// any of them. No ordering or issue-age rule is added here: a backlog issue
// may run after a newer one, and the display sort (byNewestFirst over
// cycleTimestamp) is untouched.
function journalLoader(): Loader {
  const base = glob({
    pattern: '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-*.md',
    base: './src/content/journal',
    generateId: idFromFile,
  });
  return {
    ...base,
    name: 'journal-with-lifecycle-check',
    load: async (ctx) => {
      await base.load(ctx);
      checkJournalCollection(
        ctx.store.entries().map(([id, entry]) => ({
          id,
          data: entry.data as unknown as JournalCollectionEntry['data'],
        })),
      );
    },
  };
}

const journal = defineCollection({
  loader: journalLoader(),
  schema: journalSchema,
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
    seoTitle: z.string().min(1).optional(),
    status: z.enum(['proposed', 'accepted', 'superseded', 'deprecated']),
    date: z.string().regex(yyyyMmDd),
    supersedes: z.number().int().positive().optional(),
    visibility: z.enum(['public', 'private']),
  }),
});

export const collections = { projects, journal, adr };
