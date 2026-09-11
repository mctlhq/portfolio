// Zero-import helper module: no `astro:content`, no `astro/loaders`, no
// `zod`. This keeps the module importable by plain `node --test`, with no
// build step, so `test/adr.test.ts` can exercise the real logic.

export const ADR_SECTIONS = ['Context', 'Decision', 'Consequences', 'Drivers', 'Revisit criteria'] as const;

type AdrSection = (typeof ADR_SECTIONS)[number];

const HEADING_RE = /^##[ \t]+(.*)$/gm;
const EN_SPAN_RE = /<span class="l en">([^<]*)<\/span>/;
const RU_SPAN_RE = /<span class="l ru">([^<]*)<\/span>/;

interface SectionBlock {
  key: AdrSection | null;
  headingLine: string;
  content: string;
}

function isAdrSection(key: string): key is AdrSection {
  return (ADR_SECTIONS as readonly string[]).includes(key);
}

/**
 * Identifies a section only from its English span -- a heading with no
 * English span (plain text, or only a Russian span) is never treated as a
 * match. Whether the heading also carries the required Russian span is
 * checked separately in adrBodyProblems, so an English-only heading is
 * still reported as a problem rather than silently accepted.
 */
function sectionKeyOf(headingLine: string): AdrSection | null {
  const spanMatch = EN_SPAN_RE.exec(headingLine);
  if (!spanMatch) return null;
  const text = spanMatch[1].trim();
  return isAdrSection(text) ? text : null;
}

function splitSections(body: string): SectionBlock[] {
  const blocks: SectionBlock[] = [];
  const matches = [...body.matchAll(HEADING_RE)];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? body.length) : body.length;
    blocks.push({ key: sectionKeyOf(match[1]), headingLine: match[1], content: body.slice(start, end) });
  }
  return blocks;
}

/**
 * Reports every structural problem with one ADR body: a missing section, the
 * five sections present but out of order, and any section whose text lacks
 * an English (`class="l en"`) or a Russian (`class="l ru"`) block. `id` is
 * the entry's filename stem (e.g. `0001-bootstrap-boundary`), used only to
 * name the offending file in each message.
 */
export function adrBodyProblems(id: string, body: string): string[] {
  const problems: string[] = [];
  const label = `${id}.md`;
  const blocks = splitSections(body);
  const foundOrder = blocks
    .map((block) => block.key)
    .filter((key): key is AdrSection => key !== null);

  for (const section of ADR_SECTIONS) {
    if (!foundOrder.includes(section)) {
      problems.push(`${label}: missing section "${section}"`);
    }
  }

  if (foundOrder.length >= ADR_SECTIONS.length) {
    let lastIndex = -1;
    for (const key of foundOrder) {
      const index = ADR_SECTIONS.indexOf(key);
      if (index < lastIndex) {
        problems.push(
          `${label}: sections are out of order (found ${foundOrder.join(', ')}, expected ${ADR_SECTIONS.join(', ')})`,
        );
        break;
      }
      lastIndex = index;
    }
  }

  for (const block of blocks) {
    if (block.key === null) continue;
    if (!RU_SPAN_RE.test(block.headingLine)) {
      problems.push(`${label}: heading "${block.key}" is missing its Russian (.l.ru) span`);
    }
    const hasEn = /class="l en"/.test(block.content);
    const hasRu = /class="l ru"/.test(block.content);
    if (!hasEn) problems.push(`${label}: section "${block.key}" is missing an English (.l.en) block`);
    if (!hasRu) problems.push(`${label}: section "${block.key}" is missing a Russian (.l.ru) block`);
  }

  return problems;
}

export interface AdrStoreEntry {
  id: string;
  body: string;
  /** The validated frontmatter `id`, if the caller has it available. */
  frontmatterId?: number;
}

/**
 * Aggregates every body problem, from every entry, into one thrown Error --
 * so a failing run names every offending file and section at once, not just
 * the first. Also checks, for any entry that supplies `frontmatterId` (the
 * schema-validated frontmatter `id`, only known after the base loader has
 * parsed the file -- it is never present in the raw body text), that it
 * matches the four-digit prefix of the filename, naming both values when it
 * does not.
 */
export function checkAdrBodies(entries: readonly AdrStoreEntry[]): void {
  const problems: string[] = [];
  for (const entry of entries) {
    problems.push(...adrBodyProblems(entry.id, entry.body));
    if (entry.frontmatterId !== undefined) {
      const prefixMatch = /^(\d{4})-/.exec(entry.id);
      const filenamePrefix = prefixMatch ? prefixMatch[1] : null;
      const frontmatterPrefix = String(entry.frontmatterId).padStart(4, '0');
      if (filenamePrefix === null || filenamePrefix !== frontmatterPrefix) {
        problems.push(
          `${entry.id}.md: frontmatter id ${entry.frontmatterId} does not match the ` +
            `four-digit filename prefix ${filenamePrefix ?? '(none)'}`,
        );
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`ADR validation failed:\n${problems.map((p) => `- ${p}`).join('\n')}`);
  }
}
