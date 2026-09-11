// Zero-import helper module: no `astro:content`, no `astro/loaders`, no
// `zod`. This keeps the module importable by plain `node --test`, with no
// build step, so `test/journal.test.ts` can exercise the real logic.

export const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const yyyyMmDd = /^\d{4}-\d{2}-\d{2}$/;

export function isoWithOffset(value: unknown): boolean {
  return typeof value === 'string' && ISO_WITH_OFFSET.test(value);
}

export interface Intervention {
  what: string;
  why: string;
  at: Date | string;
}

export interface JournalTimes {
  issue_opened_at: Date | string;
  deployed_at?: Date | string | null;
  interventions?: readonly Intervention[];
}

/** JournalTimes plus the two middle-of-cycle timestamps that cycleTimestamp
 * also considers -- proposal_approved_at and merged_at, along with
 * released_at (already implied by JournalTimes' sibling fields on the real
 * schema, listed explicitly here so this module stays import-free). */
export interface JournalCycleTimes extends JournalTimes {
  proposal_approved_at?: Date | string | null;
  merged_at?: Date | string | null;
  released_at?: Date | string | null;
}

export interface JournalSortEntry {
  id: string;
  data: JournalCycleTimes;
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`unparseable timestamp: ${String(value)}`);
  }
  return date;
}

export function leadTimeHours(entry: JournalTimes): number | null {
  const { deployed_at: deployedAt } = entry;
  if (deployedAt === undefined || deployedAt === null || deployedAt === '') {
    return null;
  }
  const opened = toDate(entry.issue_opened_at);
  const deployed = toDate(deployedAt);
  if (deployed.getTime() < opened.getTime()) {
    throw new RangeError(
      'deployed_at precedes issue_opened_at: this is a data error, not a renderable value',
    );
  }
  return (deployed.getTime() - opened.getTime()) / 3_600_000;
}

export function interventionCount(entry: JournalTimes): number {
  return entry.interventions?.length ?? 0;
}

// Duplicated rather than imported from src/lib/metrics.ts, which documents
// the same rule for its own EM_DASH: each module in src/lib keeps its
// import list empty by repeating a constant instead of importing a sibling.
const EM_DASH = '—';

/**
 * The single timestamp a cycle is dated and sorted by: the last event
 * recorded for it, preferring the latest-stage timestamp that is present.
 */
export function cycleTimestamp(entry: JournalCycleTimes): Date {
  const candidate =
    entry.deployed_at ??
    entry.released_at ??
    entry.merged_at ??
    entry.proposal_approved_at ??
    entry.issue_opened_at;
  return toDate(candidate);
}

/**
 * Sorts journal entries newest cycle first, by cycleTimestamp; ties (same
 * timestamp) break on id, descending, so the ordering is total and stable.
 */
export function byNewestFirst(a: JournalSortEntry, b: JournalSortEntry): number {
  const diff = cycleTimestamp(b.data).getTime() - cycleTimestamp(a.data).getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** Renders a Date/string timestamp as a language-neutral 'YYYY-MM-DD'. */
export function isoDate(value: Date | string): string {
  return toDate(value).toISOString().slice(0, 10);
}

/** Renders a Date/string timestamp as UTC with no fractional seconds, e.g.
 * '2026-09-11T06:41:07Z'. */
export function isoStamp(value: Date | string): string {
  return toDate(value).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Formats a lead-time-in-hours value for display: an em dash for `null`,
 * otherwise one decimal place (so `0` renders as `'0.0'`, never the dash). */
export function formatLeadTime(hours: number | null): string {
  return hours === null ? EM_DASH : hours.toFixed(1);
}

/** Sums interventionCount across a list of journal entry data objects. */
export function totalInterventions(entries: readonly JournalTimes[]): number {
  return entries.reduce((sum, entry) => sum + interventionCount(entry), 0);
}

/**
 * Shortens a GitHub issue/pull-request URL to its '#<number>' reference when
 * the URL ends in one (e.g. '.../pull/28' -> '#28'); returns the URL
 * unchanged otherwise, so a malformed link degrades to something readable
 * instead of throwing at build time.
 */
export function githubRef(url: string): string {
  const match = /\/(\d+)\/?$/.exec(url);
  return match ? `#${match[1]}` : url;
}
