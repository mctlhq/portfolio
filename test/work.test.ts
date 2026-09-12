import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chipIsKnown, chipRu } from '../src/i18n/ui.ts';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const WORK_PATH = fileURLToPath(new URL('../src/pages/work.astro', import.meta.url));
const CARD_PATH = fileURLToPath(new URL('../src/components/ProjectCard.astro', import.meta.url));
const DETAILS_PATH = fileURLToPath(new URL('../src/components/Details.astro', import.meta.url));
const SITE_CSS_PATH = path.join(ROOT, 'src/styles/site.css');
const PROJECTS_DIR = path.join(ROOT, 'src/content/projects');

const work = readFileSync(WORK_PATH, 'utf8');
const card = readFileSync(CARD_PATH, 'utf8');
const details = readFileSync(DETAILS_PATH, 'utf8');
const siteCss = readFileSync(SITE_CSS_PATH, 'utf8');

// A representative sample of literals that must never appear typed into the
// template: proper stack chips (language/tool names) and the two plain-word
// chips that have a Russian counterpart in stackChipRu.
const CHIP_LITERALS = [
  'TypeScript',
  'PostgreSQL',
  'Go',
  'design tokens',
  'upstream fork',
  'ArgoCD',
  'MCP',
];

/**
 * Removes `<!-- ... -->`, `/* ... *\/` and `// ...` comments so a chip named
 * only inside a comment cannot fail the anchored literal check below.
 */
function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

/**
 * True when `literal` appears in `source` anchored as a quoted string
 * literal (`'`, `"`, backtick) or as element text (preceded by `>`), and
 * closed the same way (or followed by `<`) -- i.e. hard-coded, not merely
 * mentioned in prose or a comment.
 */
function hasAnchoredLiteral(source: string, literal: string): boolean {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:'|"|\`|>)\\s*${escaped}\\s*(?:'|"|\`|<)`);
  return pattern.test(stripComments(source));
}

test('ProjectCard derives chips from en.data.stack, not from a literal', () => {
  assert.match(card, /en\.data\.stack\.map/);
});

test('neither work.astro nor ProjectCard.astro hard-codes a chip literal', () => {
  for (const literal of CHIP_LITERALS) {
    assert.ok(
      !hasAnchoredLiteral(work, literal),
      `work.astro must not hard-code the chip literal "${literal}"`,
    );
    assert.ok(
      !hasAnchoredLiteral(card, literal),
      `ProjectCard.astro must not hard-code the chip literal "${literal}"`,
    );
  }
});

// T7: control assertions proving the anchor above means what it claims --
// a comment-only occurrence passes, a hard-coded occurrence fails.
test('hasAnchoredLiteral control: a literal mentioned only in a comment does not count as hard-coded', () => {
  const lineComment = "// TypeScript is used here\nconst x = 1;";
  const blockComment = "/* TypeScript is used here */\nconst x = 1;";
  const htmlComment = "<!-- TypeScript is used here -->\n<div>x</div>";
  assert.ok(!hasAnchoredLiteral(lineComment, 'TypeScript'));
  assert.ok(!hasAnchoredLiteral(blockComment, 'TypeScript'));
  assert.ok(!hasAnchoredLiteral(htmlComment, 'TypeScript'));
});

test('hasAnchoredLiteral control: a hard-coded literal is caught', () => {
  const source = 'const stack = ["TypeScript"];';
  assert.ok(hasAnchoredLiteral(source, 'TypeScript'));
});

test('neither file references --font-editorial', () => {
  assert.doesNotMatch(work, /--font-editorial/);
  assert.doesNotMatch(card, /--font-editorial/);
});

test('neither file contains a tabindex override', () => {
  assert.doesNotMatch(work, /tabindex/);
  assert.doesNotMatch(card, /tabindex/);
});

test('work.astro sorts project entries on data.order', () => {
  assert.match(work, /\.sort\(\(a,\s*b\)\s*=>\s*a\.data\.order\s*-\s*b\.data\.order\)/);
});

test('work.astro imports ProjectCard and getCollection', () => {
  assert.match(work, /import\s+ProjectCard\s+from\s+['"]\.\.\/components\/ProjectCard\.astro['"]/);
  assert.match(work, /getCollection/);
});

// -- T1: structure -----------------------------------------------------

test('T1: project-links and project-metrics sit before <Details>, never inside it, and no hand-written disclosure remains', () => {
  const detailsOpenIdx = card.indexOf('<Details');
  const detailsCloseIdx = card.indexOf('</Details>');
  assert.ok(detailsOpenIdx > -1, 'ProjectCard.astro must render <Details ...>');
  assert.ok(detailsCloseIdx > detailsOpenIdx, 'ProjectCard.astro must render a matching </Details>');

  const linksIdx = card.indexOf('<ul class="project-links"');
  const metricsIdx = card.indexOf('<p class="project-metrics"');
  assert.ok(linksIdx > -1, 'ProjectCard.astro must render <ul class="project-links">');
  assert.ok(metricsIdx > -1, 'ProjectCard.astro must render <p class="project-metrics">');

  assert.ok(linksIdx < detailsOpenIdx, 'project-links must appear before <Details>');
  assert.ok(metricsIdx < detailsOpenIdx, 'project-metrics must appear before <Details>');
  assert.ok(
    !(linksIdx > detailsOpenIdx && linksIdx < detailsCloseIdx),
    'project-links must not appear between <Details> and </Details>',
  );
  assert.ok(
    !(metricsIdx > detailsOpenIdx && metricsIdx < detailsCloseIdx),
    'project-metrics must not appear between <Details> and </Details>',
  );

  assert.doesNotMatch(card, /<details\b/, 'ProjectCard.astro must contain no hand-written <details');
  assert.doesNotMatch(card, /<summary\b/, 'ProjectCard.astro must contain no hand-written <summary');
  assert.doesNotMatch(card, /project-details/, 'ProjectCard.astro must not reference project-details');
});

test('T1: work-group is gone from src/', () => {
  const srcDir = path.join(ROOT, 'src');
  function walk(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    let files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files = files.concat(walk(full));
      else files.push(full);
    }
    return files;
  }
  for (const file of walk(srcDir)) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /work-group/, `${path.relative(ROOT, file)} must not reference work-group`);
  }
});

// -- T2: cascade ---------------------------------------------------------

interface CssRule {
  selectors: string[];
  declarations: string;
  sourceIndex: number;
}

/** Modelled on test/link-cascade.test.ts's parseTopLevelRules: strips
 * comments, skips @media blocks, and returns every other top-level
 * `selector { body }` rule in source order. */
function parseTopLevelRules(cssText: string): CssRule[] {
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: CssRule[] = [];
  let i = 0;
  let sourceIndex = 0;

  function skipBlock(openBraceIndex: number): number {
    let depth = 0;
    let j = openBraceIndex;
    for (; j < css.length; j += 1) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    return j;
  }

  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i += 1;
    if (i >= css.length) break;

    if (css.startsWith('@media', i)) {
      const braceIdx = css.indexOf('{', i);
      if (braceIdx === -1) break;
      i = skipBlock(braceIdx);
      continue;
    }

    const braceIdx = css.indexOf('{', i);
    if (braceIdx === -1) break;
    const selectorText = css.slice(i, braceIdx).trim();
    const closeIdx = skipBlock(braceIdx);
    const declarations = css.slice(braceIdx + 1, closeIdx - 1);
    const selectors = selectorText
      .split(',')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter((s) => s.length > 0);
    rules.push({ selectors, declarations, sourceIndex });
    sourceIndex += 1;
    i = closeIdx;
  }

  return rules;
}

/** (a, b, c) specificity for the closed set of selector shapes this file
 * needs to resolve: class count (b) and type-selector count (c). No id, no
 * attribute, no pseudo-class is used by any selector under test here. */
function specificity(selectorText: string): [number, number, number] {
  let s = selectorText;
  let b = 0;
  let c = 0;
  b += (s.match(/\.[a-zA-Z0-9_-]+/g) ?? []).length;
  s = s.replace(/\.[a-zA-Z0-9_-]+/g, ' ');
  const typeTokens = s
    .split(/[\s>+~]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t !== '*');
  c += typeTokens.length;
  return [0, b, c];
}

interface SimpleElement {
  tag: string;
  classes: string[];
}

/** Parses one compound selector (no combinator), e.g. ".block", "ul",
 * "details.block" into a tag + class list. */
function parseCompound(compound: string): { tag: string | null; classes: string[] } {
  const classes = (compound.match(/\.[a-zA-Z0-9_-]+/g) ?? []).map((c) => c.slice(1));
  const tagMatch = compound.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
  return { tag: tagMatch ? tagMatch[0] : null, classes };
}

/** True when a selector (possibly a descendant-combinator chain of
 * compounds) matches `target` given its `ancestors` (immediate parent
 * first). Only descendant (space) combinators are modelled -- the only
 * combinator any selector under test here uses. */
function selectorMatches(selectorText: string, target: SimpleElement, ancestors: SimpleElement[]): boolean {
  const parts = selectorText.trim().split(/\s+/);
  const last = parseCompound(parts[parts.length - 1]);
  if (last.tag && last.tag !== target.tag) return false;
  if (!last.classes.every((c) => target.classes.includes(c))) return false;

  let ancestorCursor = 0;
  for (let idx = parts.length - 2; idx >= 0; idx -= 1) {
    const compound = parseCompound(parts[idx]);
    let matched = false;
    while (ancestorCursor < ancestors.length) {
      const ancestor = ancestors[ancestorCursor];
      ancestorCursor += 1;
      const tagOk = !compound.tag || compound.tag === ancestor.tag;
      const classesOk = compound.classes.every((c) => ancestor.classes.includes(c));
      if (tagOk && classesOk) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

/** Extracts the effective `padding-inline-start` value from a declaration
 * block: the explicit longhand if present, else computed from the
 * `padding` shorthand (1-4 space-separated values, assuming LTR so
 * inline-start is the left side). Every value in this stylesheet is a
 * single token (a length or a var()), so no paren-aware splitting is
 * needed. */
function extractPaddingInlineStart(declarations: string): string | null {
  const longhand = declarations.match(/(?<![\w-])padding-inline-start\s*:\s*([^;]+);/);
  if (longhand) return longhand[1].trim();
  const shorthand = declarations.match(/(?<![\w-])padding\s*:\s*([^;]+);/);
  if (!shorthand) return null;
  const values = shorthand[1].trim().split(/\s+/);
  switch (values.length) {
    case 1:
      return values[0];
    case 2:
    case 3:
      return values[1];
    case 4:
      return values[3];
    default:
      return null;
  }
}

function resolveDeclaration(
  rules: CssRule[],
  property: 'padding-inline-start',
  target: SimpleElement,
  ancestors: SimpleElement[],
  uaDefault: { value: string; spec: [number, number, number] },
): string {
  type Candidate = { value: string; spec: [number, number, number]; sourceIndex: number };
  const candidates: Candidate[] = [{ value: uaDefault.value, spec: uaDefault.spec, sourceIndex: -1 }];

  for (const rule of rules) {
    for (const selector of rule.selectors) {
      if (!selectorMatches(selector, target, ancestors)) continue;
      const value = extractPaddingInlineStart(rule.declarations);
      if (value === null) continue;
      candidates.push({ value, spec: specificity(selector), sourceIndex: rule.sourceIndex });
    }
  }

  let winner = candidates[0];
  for (const candidate of candidates.slice(1)) {
    const cmp = compareSpecificity(candidate.spec, winner.spec);
    if (cmp > 0 || (cmp === 0 && candidate.sourceIndex > winner.sourceIndex)) {
      winner = candidate;
    }
  }
  return winner.value;
}

function compareSpecificity(x: [number, number, number], y: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return 0;
}

const cssRules = parseTopLevelRules(siteCss);

test('T2: .project-links resolves padding-inline-start to 0 under article.project (no .block ancestor)', () => {
  const target: SimpleElement = { tag: 'ul', classes: ['project-links'] };
  const ancestors: SimpleElement[] = [{ tag: 'article', classes: ['project'] }];
  const resolved = resolveDeclaration(cssRules, 'padding-inline-start', target, ancestors, {
    value: '40px',
    spec: [0, 0, 0],
  });
  assert.equal(resolved, '0');
});

test('T2: control -- the same element under details.block resolves padding-inline-start to var(--mctl-space-5)', () => {
  const target: SimpleElement = { tag: 'ul', classes: ['project-links'] };
  const ancestors: SimpleElement[] = [{ tag: 'details', classes: ['block'] }];
  const resolved = resolveDeclaration(cssRules, 'padding-inline-start', target, ancestors, {
    value: '40px',
    spec: [0, 0, 0],
  });
  assert.equal(resolved, 'var(--mctl-space-5)');
});

test('T2: site.css declares no !important on any .project- selector', () => {
  for (const rule of cssRules) {
    if (!rule.selectors.some((s) => s.includes('.project-'))) continue;
    assert.doesNotMatch(
      rule.declarations,
      /!important/,
      `rule for ${rule.selectors.join(', ')} must not use !important`,
    );
  }
});

// -- T3: empty-list gating -----------------------------------------------

function frontmatterField(source: string, field: string): string | null {
  const match = source.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

test('T3: ProjectCard.astro gates project-links on hasLinks and project-metrics on en.data.repo', () => {
  assert.match(card, /const\s+hasLinks\s*=\s*Boolean\(en\.data\.repo\)\s*\|\|\s*links\.length\s*>\s*0/);
  assert.match(card, /\{hasLinks\s*&&\s*\(/);
  assert.match(card, /<ul class="project-links">/);
  assert.match(card, /\{en\.data\.repo\s*&&\s*\(\s*<p class="project-metrics">/);
});

test('T3: ProjectCard.astro renders the private-repo chip from an explicit privacy field, not from !repo', () => {
  assert.match(card, /\{en\.data\.private\s*&&\s*\(/);
  assert.match(card, /ui\.workPrivateRepo\.en/);
  assert.match(card, /ui\.workPrivateRepo\.ru/);
});

test('T3: pfeifenpatenschaft-backend has neither repo: nor links:, and is marked private: true, in either language file', () => {
  for (const lang of ['en', 'ru'] as const) {
    const source = readFileSync(path.join(PROJECTS_DIR, `pfeifenpatenschaft-backend.${lang}.md`), 'utf8');
    assert.doesNotMatch(source, /^repo:/m);
    assert.doesNotMatch(source, /^links:/m);
    assert.match(source, /^private:\s*true/m);
  }
});

// -- T4: distinct accessible names ----------------------------------------

test('T4: the fourteen project names are distinct per language', () => {
  const files = readdirSync(PROJECTS_DIR).filter((name) => name.endsWith('.md'));
  for (const lang of ['en', 'ru'] as const) {
    const names = files
      .filter((name) => name.endsWith(`.${lang}.md`))
      .map((name) => frontmatterField(readFileSync(path.join(PROJECTS_DIR, name), 'utf8'), 'name'));
    assert.equal(names.length, 14, `expected 14 ${lang} project files`);
    assert.equal(new Set(names).size, 14, `${lang} project names must be distinct`);
  }
});

test('T4: ProjectCard.astro passes en.data.name / ru.data.name into <Details> suffix props', () => {
  assert.match(card, /<Details[\s\S]*?suffixEn=\{en\.data\.name\}[\s\S]*?suffixRu=\{ru\.data\.name\}[\s\S]*?>/);
});

test('T4: Details.astro renders the suffix inside a visually-hidden span within <summary>, after the summary Lang', () => {
  const summaryMatch = details.match(/<summary>([\s\S]*?)<\/summary>/);
  assert.ok(summaryMatch, 'Details.astro must render a <summary>...</summary>');
  const summaryBody = summaryMatch![1];
  const langIdx = summaryBody.indexOf('<Lang');
  const spanIdx = summaryBody.indexOf('<span class="visually-hidden">');
  assert.ok(langIdx > -1, 'summary must contain the summary <Lang>');
  assert.ok(spanIdx > -1, 'summary must contain a visually-hidden span');
  assert.ok(spanIdx > langIdx, 'the visually-hidden span must come after the summary <Lang>');
  assert.match(summaryBody, /suffixEn/);
  assert.match(summaryBody, /suffixRu/);
});

// -- T5: visually hidden, not hidden --------------------------------------

test('T5: .visually-hidden clips rather than hides', () => {
  const match = siteCss.match(/\.visually-hidden\s*\{([^}]*)\}/);
  assert.ok(match, 'site.css must declare .visually-hidden');
  const body = match![1];
  assert.doesNotMatch(body, /display\s*:\s*none/);
  assert.doesNotMatch(body, /visibility\s*:\s*hidden/);
  assert.match(body, /clip-path\s*:/);
  assert.match(body, /position\s*:\s*absolute/);
});

// -- T6: chip lookup -------------------------------------------------------

test('T6: chipRu resolves own properties and leaves everything else, including Object.prototype names, unchanged', () => {
  assert.equal(chipRu('constructor'), 'constructor');
  assert.equal(chipRu('toString'), 'toString');
  assert.equal(chipRu('__proto__'), '__proto__');
  assert.equal(chipRu('design tokens'), 'дизайн-токены');
});

test('T6: chipIsKnown is false for inherited Object.prototype names and true for a known untranslated chip', () => {
  assert.equal(chipIsKnown('constructor'), false);
  assert.equal(chipIsKnown('TypeScript'), true);
});

test('T6: ProjectCard.astro no longer indexes or guards via the prototype chain', () => {
  assert.doesNotMatch(card, /chip\s+in\s+stackChipRu/);
  assert.doesNotMatch(card, /stackChipRu\[/);
  assert.match(card, /chipIsKnown\(chip\)/);
  assert.match(card, /chipRu\(chip\)/);
});

// -- T8: metrics separators ------------------------------------------------

test('T8: the metrics line uses the literal middle dot, never an HTML entity', () => {
  assert.match(card, /·/);
  assert.doesNotMatch(card, /&middot;/);
  assert.doesNotMatch(card, /&#183;/);
  assert.doesNotMatch(card, /&#x[bB]7;/);
});

test('T8: every metrics number still comes from formatStat(repoStats.*)', () => {
  assert.match(card, /formatStat\(repoStats\.commits\)/);
  assert.match(card, /formatStat\(repoStats\.releases\)/);
});
