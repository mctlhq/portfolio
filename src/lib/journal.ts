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
