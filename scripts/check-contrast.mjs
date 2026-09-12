#!/usr/bin/env node
// Mechanical proxy for WCAG 2.2 contrast (issue #10, P8; extended by issue
// #55, Q2'): reads the vendored raw hex tokens from
// public/assets/mctl/mctl.css, resolves the foreground/background pairs
// src/styles/site.css actually uses -- surface-fg, surface-fg-muted and
// accent over surface-bg and surface-elevated, and accent-fg over accent --
// for both data-theme values, computes the WCAG 2.x relative-luminance
// contrast ratio for each pair, and fails the build if any text pair is
// under 4.5:1 or the focus-ring pair (accent, which site.css's
// --focus-ring resolves to, over a surface) is under 3:1.
//
// Issue #55 (Q2') additionally checks the content-link colours declared by
// `main a`, `main a:visited:not(:hover)` and `main a:hover` in
// src/styles/site.css -- the class-less <a> inside <main> -- against
// surface-bg and surface-elevated in both themes at the 4.5:1 text minimum,
// plus the print override (or, absent one, the dark --accent that the
// browser would actually resolve) against a forced white background.
//
// Runs without a browser: a number the build can check, not an opinion. A
// pair the design system ships that genuinely fails is not a script bug --
// see the "exemptions" list below, which names the pair explicitly rather
// than lowering a threshold.

import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const MCTL_CSS_PATH = path.join(ROOT, 'public/assets/mctl/mctl.css');
const SITE_CSS_PATH = path.join(ROOT, 'src/styles/site.css');

const TEXT_MIN_RATIO = 4.5;
const FOCUS_RING_MIN_RATIO = 3;

// Semantic token -> raw --mctl-* token name, per theme, mirroring the
// semantic layer in public/assets/mctl/mctl.css itself (the default accent
// there is terracotta, which is also the only accent this site ever sets --
// Base.astro never writes data-accent).
const SEMANTIC_TOKENS = {
  dark: {
    'surface-bg': 'mctl-surface-dark-bg',
    'surface-elevated': 'mctl-surface-dark-elevated',
    'surface-fg': 'mctl-surface-dark-fg',
    'surface-fg-muted': 'mctl-surface-dark-fg-muted',
    accent: 'mctl-accent-terracotta-dark-primary',
    'accent-fg': 'mctl-accent-terracotta-dark-fg',
  },
  light: {
    'surface-bg': 'mctl-surface-light-bg',
    'surface-elevated': 'mctl-surface-light-elevated',
    'surface-fg': 'mctl-surface-light-fg',
    'surface-fg-muted': 'mctl-surface-light-fg-muted',
    accent: 'mctl-accent-terracotta-light-primary',
    'accent-fg': 'mctl-accent-terracotta-light-fg',
  },
};

// Extends the semantic map above with --accent-highlight, purely for
// resolving the content-link :hover colour below. A separate object, not a
// mutation of SEMANTIC_TOKENS: the existing PAIRS loop never needs
// accent-highlight, and SEMANTIC_TOKENS stays exactly what it was.
const CONTENT_LINK_SEMANTIC_TOKENS = {
  dark: { ...SEMANTIC_TOKENS.dark, 'accent-highlight': 'mctl-accent-terracotta-dark-highlight' },
  light: { ...SEMANTIC_TOKENS.light, 'accent-highlight': 'mctl-accent-terracotta-light-highlight' },
};

// Pairs site.css actually renders. `kind` picks the threshold: 'text' is a
// foreground colour rendering text over a background (4.5:1); 'focus-ring'
// is the non-text --focus-ring outline against a surface it sits on (3:1),
// per WCAG 1.4.11 Non-text Contrast.
const PAIRS = [
  { fg: 'surface-fg', bg: 'surface-bg', kind: 'text' },
  { fg: 'surface-fg', bg: 'surface-elevated', kind: 'text' },
  { fg: 'surface-fg-muted', bg: 'surface-bg', kind: 'text' },
  { fg: 'surface-fg-muted', bg: 'surface-elevated', kind: 'text' },
  { fg: 'accent', bg: 'surface-bg', kind: 'focus-ring' },
  { fg: 'accent', bg: 'surface-elevated', kind: 'focus-ring' },
  { fg: 'accent-fg', bg: 'accent', kind: 'text' },
];

// Named exemptions only, never a lowered threshold: { theme, fg, bg, reason }.
const EXEMPTIONS = [];

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

function parseTokens(css) {
  const tokens = new Map();
  const re = /--(mctl-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g;
  let m;
  while ((m = re.exec(css))) {
    tokens.set(m[1], m[2]);
  }
  return tokens;
}

function isExempt(theme, fg, bg) {
  return EXEMPTIONS.some((e) => e.theme === theme && e.fg === fg && e.bg === bg);
}

/**
 * Extracts the body of a top-level `@media <query> { ... }` block (one level
 * of brace nesting inside is expected and handled -- site.css's print block
 * contains a `:root { ... }` rule). Returns `null` if the at-rule is not
 * found. Used to isolate `@media print` so the ordinary `main a` rules are
 * parsed from the rest of the file, and so the print `--accent` override is
 * parsed only from inside it.
 */
function extractAtRuleBlock(css, atRuleNeedle) {
  const start = css.indexOf(atRuleNeedle);
  if (start === -1) return null;
  const openBrace = css.indexOf('{', start);
  if (openBrace === -1) return null;
  let depth = 0;
  for (let i = openBrace; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return { block: css.slice(openBrace + 1, i), start, end: i + 1 };
      }
    }
  }
  return null;
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Classifies a raw CSS colour value (the right-hand side of a `color:` or
 * custom-property declaration, already trimmed of its trailing `;`) as
 * either a `var(--token)` reference or a literal hex colour. Returns `null`
 * for a shape neither parser recognises, e.g. a keyword or `rgb(...)` --
 * this file never emits either, and a mutation into one is exactly the kind
 * of drift this check exists to catch.
 */
function classifyColorValue(raw) {
  const value = raw.trim();
  const varMatch = value.match(/^var\((--[a-z0-9-]+)\)$/i);
  if (varMatch) {
    return { kind: 'var', name: varMatch[1] };
  }
  const hexMatch = value.match(/^#[0-9a-fA-F]{3,8}$/);
  if (hexMatch) {
    return { kind: 'hex', value };
  }
  return null;
}

/**
 * Parses the four colours issue #55 (Q2') cares about out of the raw
 * `src/styles/site.css` text: the `color` declared by `main a`,
 * `main a:visited:not(:hover)` and `main a:hover` (searched outside
 * `@media print`), and the `--accent` custom property declared inside the
 * `@media print` block's `:root` rule, if any. Each of `normal`, `visited`,
 * `hover` and `print` is `{ kind: 'var', name }`, `{ kind: 'hex', value }`,
 * or `null` when the rule/declaration is absent.
 */
export function parseContentLinkColours(siteCssText) {
  const withoutComments = stripComments(siteCssText);
  const printBlock = extractAtRuleBlock(withoutComments, '@media print');
  const withoutPrint = printBlock
    ? withoutComments.slice(0, printBlock.start) + withoutComments.slice(printBlock.end)
    : withoutComments;

  function findRuleColor(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, 'm');
    const match = css.match(re);
    if (!match) return null;
    const body = match[1];
    const colorMatch = body.match(/(?:^|;)\s*color:\s*([^;]+);/);
    if (!colorMatch) return null;
    return classifyColorValue(colorMatch[1]);
  }

  const normal = findRuleColor(withoutPrint, 'main a');
  const visited = findRuleColor(withoutPrint, 'main a:visited:not(:hover)');
  const hover = findRuleColor(withoutPrint, 'main a:hover');

  let print = null;
  if (printBlock) {
    const accentMatch = printBlock.block.match(/--accent:\s*([^;]+);/);
    if (accentMatch) {
      print = classifyColorValue(accentMatch[1]);
    }
  }

  return { normal, visited, hover, print };
}

/**
 * Resolves a parsed content-link colour ({ kind, ... } or null) to a hex
 * string for one theme, using `tokens` (the raw --mctl-* map read from
 * mctl.css). A `var(--accent)` / `var(--accent-highlight)` reference goes
 * through CONTENT_LINK_SEMANTIC_TOKENS for that theme; a hex is returned
 * literally, since a literal hex renders the same regardless of theme --
 * which is exactly why reverting to one is a regression. Returns `null`
 * when the colour itself is `null` or resolves to an unknown token.
 */
function resolveHex(colour, theme, tokens) {
  if (!colour) return null;
  if (colour.kind === 'hex') return colour.value;
  const semanticName = colour.name.replace(/^--/, '');
  const rawName = CONTENT_LINK_SEMANTIC_TOKENS[theme][semanticName];
  if (!rawName) return null;
  return tokens.get(rawName) ?? null;
}

/**
 * Checks the content-link colours parsed out of `siteCssText` against
 * surface-bg and surface-elevated in both themes (normal, visited and
 * hover, each at the 4.5:1 text minimum), and the print colour -- the print
 * override if present, otherwise the dark-theme --accent, which is exactly
 * what an unpatched browser would render -- against a forced white
 * background, also at 4.5:1. Returns an array of problem strings, empty
 * when every check clears its minimum. `tokens` is the raw --mctl-* map
 * parsed from mctl.css by `parseTokens`.
 */
export function contentLinkProblems({ siteCssText, tokens }) {
  const problems = [];
  const parsed = parseContentLinkColours(siteCssText);

  const STATES = [
    { key: 'normal', label: 'main a (normal)' },
    { key: 'visited', label: 'main a:visited:not(:hover)' },
    { key: 'hover', label: 'main a:hover' },
  ];

  for (const theme of ['dark', 'light']) {
    for (const { key, label } of STATES) {
      const colour = parsed[key];
      if (!colour) {
        problems.push(`check-contrast: content link rule "${label}" is missing or unparseable in src/styles/site.css`);
        continue;
      }
      const fgHex = resolveHex(colour, theme, tokens);
      if (!fgHex) {
        problems.push(`check-contrast: could not resolve content link colour for "${label}" in theme ${theme}`);
        continue;
      }
      for (const bg of ['surface-bg', 'surface-elevated']) {
        const bgRaw = SEMANTIC_TOKENS[theme][bg];
        const bgHex = tokens.get(bgRaw);
        if (!bgHex) {
          problems.push(`check-contrast: could not resolve ${theme}/${bg} (${bgRaw}) from mctl.css`);
          continue;
        }
        const ratio = contrastRatio(fgHex, bgHex);
        if (ratio < TEXT_MIN_RATIO) {
          problems.push(
            `check-contrast: [${theme}] content link "${label}" (${fgHex}) over ${bg} (${bgHex}) is ${ratio.toFixed(2)}:1, below the ${TEXT_MIN_RATIO}:1 minimum`,
          );
        }
      }
    }
  }

  // Print: the override if present (a literal hex, theme-independent),
  // otherwise the dark --accent, which is what an unpatched browser resolves
  // --accent to inside @media print (the print block never sets data-theme).
  const printHex = parsed.print
    ? resolveHex(parsed.print, 'light', tokens)
    : resolveHex({ kind: 'var', name: '--accent' }, 'dark', tokens);

  if (!printHex) {
    problems.push('check-contrast: could not resolve the print content-link colour');
  } else {
    const ratio = contrastRatio(printHex, '#ffffff');
    if (ratio < TEXT_MIN_RATIO) {
      problems.push(
        `check-contrast: [print] content link colour (${printHex}) over #fff is ${ratio.toFixed(2)}:1, below the ${TEXT_MIN_RATIO}:1 minimum`,
      );
    }
  }

  return problems;
}

async function main() {
  const [mctlCss, siteCss] = await Promise.all([readFile(MCTL_CSS_PATH, 'utf8'), readFile(SITE_CSS_PATH, 'utf8')]);
  const tokens = parseTokens(mctlCss);

  const problems = [];
  const report = [];

  for (const theme of ['dark', 'light']) {
    const map = SEMANTIC_TOKENS[theme];
    for (const { fg, bg, kind } of PAIRS) {
      const fgRaw = map[fg];
      const bgRaw = map[bg];
      const fgHex = tokens.get(fgRaw);
      const bgHex = tokens.get(bgRaw);
      if (!fgHex || !bgHex) {
        problems.push(
          `check-contrast: could not resolve ${theme}/${fg} (${fgRaw}) or ${theme}/${bg} (${bgRaw}) from ${path.relative(ROOT, MCTL_CSS_PATH)}`,
        );
        continue;
      }
      const ratio = contrastRatio(fgHex, bgHex);
      const min = kind === 'text' ? TEXT_MIN_RATIO : FOCUS_RING_MIN_RATIO;
      report.push(`check-contrast: [${theme}] ${fg} (${fgHex}) over ${bg} (${bgHex}) = ${ratio.toFixed(2)}:1 (min ${min}:1, ${kind})`);
      if (ratio < min && !isExempt(theme, fg, bg)) {
        problems.push(
          `check-contrast: [${theme}] ${fg} over ${bg} is ${ratio.toFixed(2)}:1, below the ${min}:1 minimum for a ${kind} pair`,
        );
      }
    }
  }

  for (const line of report) {
    console.log(line);
  }

  const contentProblems = contentLinkProblems({ siteCssText: siteCss, tokens });
  problems.push(...contentProblems);
  console.log(`check-contrast: content-link states checked (normal, visited, hover) x (surface-bg, surface-elevated) x (dark, light) + print`);

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`check-contrast: OK -- ${report.length} pairs checked, all at or above their minimum`);
}

/**
 * True when this module is being run directly (as a CLI entry point)
 * rather than imported, e.g. by a test. Prefers `import.meta.main`, which
 * is symlink-safe and has no false-negative on a symlinked checkout (Node
 * >= 22.18/24.2; CI runs Node 24). Where that is not exposed, falls back
 * to comparing realpaths of `process.argv[1]` and this module's URL --
 * realpath, not a raw string compare, so a symlinked checkout does not
 * make the guard silently evaluate false and skip the check with exit 0
 * and no error.
 */
function isEntryPoint() {
  if (typeof import.meta.main !== 'undefined') {
    return import.meta.main;
  }
  if (!process.argv[1]) {
    return false;
  }
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  await main();
}
