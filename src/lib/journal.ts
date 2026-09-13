// Zero-import helper module: no `astro:content`, no `astro/loaders`, no
// `zod`. This keeps the module importable by plain `node --test`, with no
// build step, so `test/journal.test.ts` can exercise the real logic.

export const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const yyyyMmDd = /^\d{4}-\d{2}-\d{2}$/;

export function isoWithOffset(value: unknown): boolean {
  return typeof value === 'string' && ISO_WITH_OFFSET.test(value);
}

/**
 * Validates a timestamp's real value, not only its textual shape:
 * isoWithOffset only checks the ISO-with-offset regex, so a string such as
 * '2026-02-31T00:00:00Z' matches the shape but denotes no real instant --
 * Date.parse returns NaN for it. Used by the journal schema's `stamp` (via
 * content.config.ts) to reject such a value instead of letting it become an
 * Invalid Date.
 */
export function isRealTimestamp(value: unknown): boolean {
  if (!isoWithOffset(value)) return false;
  // JS Date parsing is lenient about overflow (e.g. '2026-02-31' silently
  // rolls over to March 3), so Date.parse alone cannot tell a real instant
  // from an ISO-shaped one that denotes none. Validate the calendar fields
  // by hand -- day against the actual days in that year/month, hour/minute/
  // second against their real ranges -- before trusting Date.parse at all.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value as string);
  if (!match) return false;
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  return !Number.isNaN(Date.parse(value as string));
}

// -- Status ------------------------------------------------------------------

export type JournalStatus = 'in_progress' | 'complete' | 'abandoned';

export interface JournalStatusData {
  status: JournalStatus;
}

/** True only for a `complete` entry. Distinct from a plain equality check
 * only in that it names the one predicate every status-aware caller
 * (leadTimeHours, CycleTable.astro, the journal detail page) shares. */
export function isComplete(data: JournalStatusData): boolean {
  return data.status === 'complete';
}

/**
 * Tallies journal data objects (the same shape totalInterventions accepts,
 * not collection wrappers) by status. Starts from all-zero so every key is
 * present even for an empty input.
 */
export function statusCounts(
  entries: readonly JournalStatusData[],
): { complete: number; in_progress: number; abandoned: number } {
  const counts = { complete: 0, in_progress: 0, abandoned: 0 };
  for (const entry of entries) {
    counts[entry.status] += 1;
  }
  return counts;
}

export interface BilingualText {
  en: string;
  ru: string;
}

/** The subset of journal frontmatter journalEntryProblems reasons over. Every
 * timestamp field accepts Date or string so the same function serves both
 * `node --test` fixtures (plain strings) and the real schema's superRefine
 * (already-transformed Date values). */
export interface JournalEntryData extends JournalStatusData {
  pr?: string | null;
  release?: string | null;
  abandoned_reason?: BilingualText | null;
  issue_opened_at: Date | string;
  proposal_approved_at?: Date | string | null;
  merged_at?: Date | string | null;
  released_at?: Date | string | null;
  deployed_at?: Date | string | null;
}

export interface JournalProblem {
  /** The offending field name -- becomes the zod issue's `path` in
   * content.config.ts, so Astro's own diagnostic names the field. */
  field: string;
  message: string;
}

function has(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

/**
 * Cross-field rules tying `status` to which evidence fields may or must be
 * present: `complete` requires `pr`/`release`/`merged_at`/`released_at`;
 * `in_progress` forbids `release`/`released_at`/`deployed_at` (but permits a
 * known `pr` and `merged_at`); `abandoned` requires `abandoned_reason` and
 * forbids `merged_at`/`release`/`released_at`/`deployed_at` while still
 * permitting a known unmerged `pr`; `merged_at` implies `pr` regardless of
 * status; and `abandoned_reason` implies `status === 'abandoned'`.
 */
export function statusEvidenceProblems(data: JournalEntryData): JournalProblem[] {
  const problems: JournalProblem[] = [];

  if (data.status === 'complete') {
    for (const field of ['pr', 'release', 'merged_at', 'released_at'] as const) {
      if (!has(data[field])) {
        problems.push({ field, message: `status is 'complete' but ${field} is missing` });
      }
    }
  } else if (data.status === 'in_progress') {
    for (const field of ['release', 'released_at', 'deployed_at'] as const) {
      if (has(data[field])) {
        problems.push({ field, message: `status is 'in_progress' but ${field} is present` });
      }
    }
  } else if (data.status === 'abandoned') {
    if (!has(data.abandoned_reason)) {
      problems.push({
        field: 'abandoned_reason',
        message: "status is 'abandoned' but abandoned_reason is missing",
      });
    }
    for (const field of ['merged_at', 'release', 'released_at', 'deployed_at'] as const) {
      if (has(data[field])) {
        problems.push({ field, message: `status is 'abandoned' but ${field} is present` });
      }
    }
  }

  if (has(data.merged_at) && !has(data.pr)) {
    problems.push({ field: 'pr', message: 'merged_at is present but pr is missing' });
  }

  if (has(data.abandoned_reason) && data.status !== 'abandoned') {
    problems.push({
      field: 'abandoned_reason',
      message: `abandoned_reason is present but status is '${data.status}'`,
    });
  }

  return problems;
}

const LIFECYCLE_STAGES = [
  'issue_opened_at',
  'proposal_approved_at',
  'merged_at',
  'released_at',
  'deployed_at',
] as const;

/**
 * Requires the lifecycle timestamps present on `data` to be nondecreasing in
 * lifecycle order (issue_opened_at -> proposal_approved_at -> merged_at ->
 * released_at -> deployed_at), skipping absent stages and allowing equal
 * instants. Reports the later field's name and both instants.
 */
export function timestampOrderProblems(data: JournalEntryData): JournalProblem[] {
  const problems: JournalProblem[] = [];
  const present = LIFECYCLE_STAGES.filter((stage) => has(data[stage])).map((stage) => ({
    stage,
    date: toDate(data[stage] as Date | string),
  }));

  for (let i = 1; i < present.length; i += 1) {
    const previous = present[i - 1];
    const current = present[i];
    if (current.date.getTime() < previous.date.getTime()) {
      problems.push({
        field: current.stage,
        message:
          `${current.stage} (${current.date.toISOString()}) precedes ${previous.stage} ` +
          `(${previous.date.toISOString()}); lifecycle timestamps must be nondecreasing`,
      });
    }
  }

  return problems;
}

/** Every cross-field and timestamp-order rule for one journal entry, in one
 * list -- content.config.ts's `.superRefine` maps each onto a `ctx.addIssue`
 * with `path: [problem.field]`, so Astro's own diagnostic names the entry,
 * the field and the violation. */
export function journalEntryProblems(data: JournalEntryData): JournalProblem[] {
  return [...statusEvidenceProblems(data), ...timestampOrderProblems(data)];
}

export interface JournalCollectionEntry {
  id: string;
  data: JournalStatusData;
}

/**
 * Enforces the one-cycle-at-a-time rule across the whole journal collection
 * (public and private alike): at most one entry may carry
 * `status: in_progress`; zero is valid. Throws, naming every offending id,
 * when more than one does -- the shape journalLoader() in content.config.ts
 * wraps around the base glob loader, mirroring checkProjectParity and
 * checkAdrBodies.
 */
export function checkJournalCollection(entries: readonly JournalCollectionEntry[]): void {
  const inProgress = entries.filter((entry) => entry.data.status === 'in_progress');
  if (inProgress.length > 1) {
    throw new Error(
      `Journal validation failed:\n- two entries are in_progress: ${inProgress
        .map((entry) => entry.id)
        .join(', ')}`,
    );
  }
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

/** Collapses the `undefined | null | ''` "absent" check shared by
 * cycleEndTimestamp's two candidate fields. */
function present(value: Date | string | null | undefined): value is Date | string {
  return value !== undefined && value !== null && value !== '';
}

/**
 * The timestamp that marks a cycle's end for lead-time purposes: `deployed_at`
 * when present, otherwise `released_at`, otherwise `null` when the cycle has
 * not reached either stage yet. Stops at `released_at` rather than falling
 * further back to `merged_at` and beyond (see cycleTimestamp): those earlier
 * stages do not mean the cycle is done, and reporting a lead time against one
 * of them would turn a genuinely unmeasured cycle into a confident-looking
 * number.
 */
export function cycleEndTimestamp(entry: JournalCycleTimes): Date | null {
  if (present(entry.deployed_at)) return toDate(entry.deployed_at);
  if (present(entry.released_at)) return toDate(entry.released_at);
  return null;
}

/** JournalCycleTimes plus the status field: leadTimeHours() only reports a
 * number for a `complete` entry, so an in_progress or abandoned entry never
 * renders a lead time even when it happens to carry a stray timestamp. */
export interface JournalLeadTimeData extends JournalCycleTimes, JournalStatusData {}

export function leadTimeHours(entry: JournalLeadTimeData): number | null {
  if (!isComplete(entry)) return null;
  const end = cycleEndTimestamp(entry);
  if (end === null) return null;
  const opened = toDate(entry.issue_opened_at);
  if (end.getTime() < opened.getTime()) {
    throw new RangeError(
      'end timestamp precedes issue_opened_at: this is a data error, not a renderable value',
    );
  }
  return (end.getTime() - opened.getTime()) / 3_600_000;
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

/**
 * Renders a timestamp as a bilingual-ready wall clock label, e.g.
 * '11 Sep, 05:20 UTC'. Always reads through the getUTC* accessors, so no
 * local time zone of the build host can leak in. The day is not zero-padded;
 * hour and minute are. The month name is looked up in the supplied array
 * (ui.monthAbbrev.en / .ru) rather than embedded here, so the copy stays in
 * the i18n dictionary and this module stays both import-free and
 * language-agnostic. The literal 'UTC' suffix is language-neutral and is not
 * translated.
 */
export function formatStamp(value: Date | string, months: readonly string[]): string {
  const date = toDate(value);
  const day = date.getUTCDate();
  const month = months[date.getUTCMonth()];
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month}, ${hours}:${minutes} UTC`;
}

/** Whole minutes elapsed from `from` to `to`; throws RangeError when `to`
 * precedes `from`, matching leadTimeHours' treatment of a reversed pair. */
export function intervalMinutes(from: Date | string, to: Date | string): number {
  const start = toDate(from);
  const end = toDate(to);
  if (end.getTime() < start.getTime()) {
    throw new RangeError(
      'interval end precedes interval start: this is a data error, not a renderable value',
    );
  }
  return Math.floor((end.getTime() - start.getTime()) / 60_000);
}

/**
 * Renders the elapsed interval from `from` to `to` as '+6 h 32 min' when the
 * hour part is non-zero, or '+44 min' (including '+0 min') when it is zero.
 * Hours are total hours, never rolled into days, so the unit always agrees
 * with the Lead time (h) column. `units` supplies the language-specific hour
 * and minute abbreviations (ui.unitHour / ui.unitMinute).
 */
export function formatInterval(
  from: Date | string,
  to: Date | string,
  units: { hour: string; minute: string },
): string {
  const totalMinutes = intervalMinutes(from, to);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `+${hours} ${units.hour} ${minutes} ${units.minute}` : `+${minutes} ${units.minute}`;
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
