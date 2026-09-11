// Zero-import helper module: no `astro:content`, no `astro/loaders`, no
// `zod`, and (unlike src/lib/journal.ts, which is zero-import but lives in
// the same directory) no import of a sibling module either, so this file's
// import list stays empty. This keeps the module importable by plain
// `node --test`, with no build step, so `test/metrics.test.ts` can exercise
// the real logic and P8b's generator can reuse `metricProblems` without
// pulling in Astro.

// Mirrors src/lib/journal.ts's ISO_WITH_OFFSET exactly; duplicated rather
// than imported to keep this module's import list empty (see above).
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const EM_DASH = '—';

export interface MetricRepo {
  commits: number | null;
  releases: number | null;
  first_commit_at: string | null;
  last_commit_at: string | null;
}

export interface MetricSourceGithub {
  collected_at: string | null;
  method: string;
  repos: number | null;
  commits: number | null;
  releases: number | null;
  per_repo: Record<string, MetricRepo>;
}

export interface MetricSourceMctl {
  collected_at: string | null;
  method: string;
  services: number | null;
  devloop_proposals: number | null;
  stale: boolean;
}

export interface Metrics {
  generated_at: string | null;
  sources: {
    github: MetricSourceGithub;
    mctl: MetricSourceMctl;
  };
}

/**
 * Renders a metric value for display. `null` means "not yet collected" and
 * renders as an em dash; this must branch on `value === null`, never on
 * falsiness, so a real `0` still renders as `0`.
 */
export function formatStat(value: number | null): string {
  return value === null ? EM_DASH : String(value);
}

/**
 * Renders the snapshot caption date. `null` means no snapshot has run yet
 * and renders as an em dash. A non-null timestamp is language-neutral
 * (YYYY-MM-DD), so no per-language date formatting is needed.
 */
export function snapshotDate(generatedAt: string | null): string {
  if (generatedAt === null) {
    return EM_DASH;
  }
  return generatedAt.slice(0, 10);
}

const REPO_URL_RE = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)\/?$/;

/**
 * `'https://github.com/mctlhq/mctl-api'` -> `'mctlhq/mctl-api'`; a trailing
 * slash is tolerated; `undefined` or anything that is not a github.com
 * repository URL of the `owner/name` shape gives `null`.
 */
export function repoKey(repoUrl: string | undefined): string | null {
  if (!repoUrl) {
    return null;
  }
  const match = REPO_URL_RE.exec(repoUrl);
  return match ? `${match[1]}/${match[2]}` : null;
}

const EMPTY_REPO_METRIC: MetricRepo = {
  commits: null,
  releases: null,
  first_commit_at: null,
  last_commit_at: null,
};

/**
 * The `per_repo` entry for a project's `repo` URL, or an all-null
 * `MetricRepo` when the URL does not resolve, `per_repo` is missing, or the
 * key is absent -- so a card can always render through `formatStat(null)`
 * rather than needing a conditional in the template.
 */
export function repoMetrics(metrics: Metrics, repoUrl: string | undefined): MetricRepo {
  const key = repoKey(repoUrl);
  if (key === null) {
    return EMPTY_REPO_METRIC;
  }
  const perRepo = metrics.sources?.github?.per_repo;
  if (!perRepo || !(key in perRepo)) {
    return EMPTY_REPO_METRIC;
  }
  return perRepo[key];
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function metricValueProblems(path: string, value: unknown): string[] {
  if (value === null || isNonNegativeInteger(value)) {
    return [];
  }
  return [`${path}: must be null or a non-negative integer, got ${JSON.stringify(value)}`];
}

function timestampProblems(path: string, value: unknown): string[] {
  if (value === null) {
    return [];
  }
  if (typeof value === 'string' && ISO_WITH_OFFSET.test(value)) {
    return [];
  }
  return [`${path}: must be null or an ISO 8601 timestamp with a timezone, got ${JSON.stringify(value)}`];
}

function methodProblems(path: string, value: unknown): string[] {
  if (typeof value === 'string' && value.length > 0) {
    return [];
  }
  return [`${path}: must be a non-empty string, got ${JSON.stringify(value)}`];
}

function booleanProblems(path: string, value: unknown): string[] {
  if (typeof value === 'boolean') {
    return [];
  }
  return [`${path}: must be a boolean, got ${JSON.stringify(value)}`];
}

/**
 * Validates every entry of `sources.github.per_repo`: each entry's
 * `commits`/`releases` via the same rule as any other metric value, and
 * each `first_commit_at`/`last_commit_at` via the same rule as any other
 * timestamp. Reports problems under paths like
 * `sources.github.per_repo["mctlhq/mctl-api"].commits`.
 */
function perRepoProblems(path: string, raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) {
    return [`${path}: must be an object`];
  }
  const problems: string[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entryPath = `${path}["${key}"]`;
    if (typeof value !== 'object' || value === null) {
      problems.push(`${entryPath}: must be an object`);
      continue;
    }
    const entry = value as Record<string, unknown>;
    problems.push(...metricValueProblems(`${entryPath}.commits`, entry.commits));
    problems.push(...metricValueProblems(`${entryPath}.releases`, entry.releases));
    problems.push(...timestampProblems(`${entryPath}.first_commit_at`, entry.first_commit_at));
    problems.push(...timestampProblems(`${entryPath}.last_commit_at`, entry.last_commit_at));
  }
  return problems;
}

function sourceProblems(
  path: string,
  raw: unknown,
  metricKeys: readonly string[],
): string[] {
  if (typeof raw !== 'object' || raw === null) {
    return [`${path}: must be an object`];
  }
  const source = raw as Record<string, unknown>;
  const problems: string[] = [];
  problems.push(...timestampProblems(`${path}.collected_at`, source.collected_at));
  problems.push(...methodProblems(`${path}.method`, source.method));
  for (const key of metricKeys) {
    problems.push(...metricValueProblems(`${path}.${key}`, source[key]));
  }
  return problems;
}

/**
 * Validates the shape of a parsed metrics.json. Returns an empty array when
 * the object is well formed: `generated_at` and each `collected_at` are
 * `null` or an ISO 8601 timestamp with a timezone, each `method` is a
 * non-empty string, every metric value is `null` or a non-negative
 * integer, every `sources.github.per_repo` entry is well formed, and
 * `sources.mctl.stale` is a boolean. Returns one message per problem
 * otherwise.
 */
export function metricProblems(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) {
    return ['metrics: must be an object'];
  }
  const metrics = raw as Record<string, unknown>;
  const problems: string[] = [];
  problems.push(...timestampProblems('generated_at', metrics.generated_at));

  if (typeof metrics.sources !== 'object' || metrics.sources === null) {
    problems.push('sources: must be an object');
    return problems;
  }
  const sources = metrics.sources as Record<string, unknown>;

  if ('github' in sources) {
    problems.push(...sourceProblems('sources.github', sources.github, ['repos', 'commits', 'releases']));
    const github = sources.github as Record<string, unknown> | null;
    if (github && typeof github === 'object') {
      if ('per_repo' in github) {
        problems.push(...perRepoProblems('sources.github.per_repo', github.per_repo));
      } else {
        problems.push('sources.github.per_repo: missing');
      }
    }
  } else {
    problems.push('sources.github: missing');
  }

  if ('mctl' in sources) {
    problems.push(
      ...sourceProblems('sources.mctl', sources.mctl, ['services', 'devloop_proposals']),
    );
    const mctl = sources.mctl as Record<string, unknown> | null;
    if (mctl && typeof mctl === 'object') {
      if ('stale' in mctl) {
        problems.push(...booleanProblems('sources.mctl.stale', mctl.stale));
      } else {
        problems.push('sources.mctl.stale: missing');
      }
    }
  } else {
    problems.push('sources.mctl: missing');
  }

  return problems;
}
