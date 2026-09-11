#!/usr/bin/env node
// Mechanical proxy for WCAG 2.2 contrast (issue #10, P8): reads the vendored
// raw hex tokens from public/assets/mctl/mctl.css, resolves the foreground/
// background pairs src/styles/site.css actually uses -- surface-fg,
// surface-fg-muted and accent over surface-bg and surface-elevated, and
// accent-fg over accent -- for both data-theme values, computes the WCAG 2.x
// relative-luminance contrast ratio for each pair, and fails the build if
// any text pair is under 4.5:1 or the focus-ring pair (accent, which
// site.css's --focus-ring resolves to, over a surface) is under 3:1.
//
// Runs without a browser: a number the build can check, not an opinion. A
// pair the design system ships that genuinely fails is not a script bug --
// see the "exemptions" list below, which names the pair explicitly rather
// than lowering a threshold.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
    'accent-highlight': 'mctl-accent-terracotta-dark-highlight',
    'accent-fg': 'mctl-accent-terracotta-dark-fg',
  },
  light: {
    'surface-bg': 'mctl-surface-light-bg',
    'surface-elevated': 'mctl-surface-light-elevated',
    'surface-fg': 'mctl-surface-light-fg',
    'surface-fg-muted': 'mctl-surface-light-fg-muted',
    accent: 'mctl-accent-terracotta-light-primary',
    'accent-highlight': 'mctl-accent-terracotta-light-highlight',
    'accent-fg': 'mctl-accent-terracotta-light-fg',
  },
};

// var(--x) custom property -> semantic token name, for the subset that
// main a / main a:visited / main a:hover / .cta:visited / .project-links
// a:visited actually declare a `color:` in terms of.
const VAR_TO_SEMANTIC = {
  '--accent': 'accent',
  '--accent-highlight': 'accent-highlight',
  '--surface-fg': 'surface-fg',
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

export function hexToRgb(hex) {
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

export function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

export function parseTokens(css) {
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
 * Resolves a CSS `color:` declaration value to a hex colour for a given
 * theme: `var(--accent)` / `var(--accent-highlight)` / `var(--surface-fg)`
 * resolve through SEMANTIC_TOKENS + the raw mctl.css tokens; a literal
 * `#rrggbb` resolves to itself regardless of theme; anything else (unknown
 * var, missing token) resolves to null.
 */
export function resolveColour(value, theme, tokens) {
  const trimmed = value.trim();
  const hexMatch = /^#[0-9a-fA-F]{6}$/.exec(trimmed);
  if (hexMatch) return trimmed;

  const varMatch = /^var\((--[a-z0-9-]+)\)$/.exec(trimmed);
  if (!varMatch) return null;
  const semantic = VAR_TO_SEMANTIC[varMatch[1]];
  if (!semantic) return null;
  const rawName = SEMANTIC_TOKENS[theme]?.[semantic];
  if (!rawName) return null;
  return tokens.get(rawName) ?? null;
}

// The three content-link selectors, and the browser default that would
// apply (dark surface, since that is the site's only authored data-theme --
// see site.css's print-block comment) if the rule covering that selector
// were reverted/removed.
const LINK_STATES = [
  { selector: 'main a', state: 'link', defaultHex: '#0000EE', defaultRatio: '2.10' },
  { selector: 'main a:visited', state: 'visited', defaultHex: '#551A8B', defaultRatio: '1.79' },
  { selector: 'main a:hover', state: 'hover', defaultHex: '#0000EE', defaultRatio: '2.10' },
];

/** Finds the `color:` declaration value of the CSS rule block in `siteCss`
 * whose comma-separated selector list contains `selector` exactly. Returns
 * null if no such rule, or no `color:` declaration, is found. */
function findDeclaredColour(siteCss, selector) {
  const withoutComments = siteCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const ruleRe = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = ruleRe.exec(withoutComments))) {
    const selectors = m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' '));
    if (!selectors.includes(selector)) continue;
    const colourMatch = /color:\s*([^;]+);/.exec(m[2]);
    if (colourMatch) return colourMatch[1].trim();
  }
  return null;
}

/**
 * Checks the three content-link states (`main a`, `main a:visited`,
 * `main a:hover`) declared in `siteCss` against the same 4.5:1 text
 * threshold as PAIRS above, over both surface-bg and surface-elevated, in
 * both themes. Returns an array of problem strings (empty when every state
 * resolves to a colour and every resulting pair clears its threshold).
 */
export function linkColourProblems(siteCss, tokens) {
  const problems = [];

  for (const { selector, state, defaultHex, defaultRatio } of LINK_STATES) {
    const declared = findDeclaredColour(siteCss, selector);
    if (declared === null) {
      problems.push(
        `check-contrast: no "${selector} { color: ... }" rule found in src/styles/site.css -- reverting to the browser default for the ${state} state would render ${defaultHex} at ${defaultRatio}:1 on dark, below the 4.5:1 minimum`,
      );
      continue;
    }

    for (const theme of ['dark', 'light']) {
      const resolved = resolveColour(declared, theme, tokens);
      if (!resolved) {
        problems.push(
          `check-contrast: [${theme}] could not resolve "${selector}" color declaration "${declared}" to a hex colour`,
        );
        continue;
      }
      for (const bg of ['surface-bg', 'surface-elevated']) {
        const bgRaw = SEMANTIC_TOKENS[theme][bg];
        const bgHex = tokens.get(bgRaw);
        if (!bgHex) {
          problems.push(`check-contrast: [${theme}] could not resolve ${bg} (${bgRaw}) from public/assets/mctl/mctl.css`);
          continue;
        }
        const ratio = contrastRatio(resolved, bgHex);
        if (ratio < TEXT_MIN_RATIO) {
          problems.push(
            `check-contrast: [${theme}] "${selector}" (${resolved}) over ${bg} (${bgHex}) is ${ratio.toFixed(2)}:1, below the ${TEXT_MIN_RATIO}:1 minimum for a text pair`,
          );
        }
      }
    }
  }

  return problems;
}

async function main() {
  const css = await readFile(MCTL_CSS_PATH, 'utf8');
  const tokens = parseTokens(css);
  const siteCss = await readFile(SITE_CSS_PATH, 'utf8');

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

  // Content-link states (main a / main a:visited / main a:hover): same
  // report-then-problems shape as the PAIRS loop above, over both themes and
  // both surfaces.
  for (const { selector } of LINK_STATES) {
    const declared = findDeclaredColour(siteCss, selector);
    if (declared === null) continue; // absence is already captured by linkColourProblems below
    for (const theme of ['dark', 'light']) {
      const resolved = resolveColour(declared, theme, tokens);
      if (!resolved) continue;
      for (const bg of ['surface-bg', 'surface-elevated']) {
        const bgHex = tokens.get(SEMANTIC_TOKENS[theme][bg]);
        if (!bgHex) continue;
        const ratio = contrastRatio(resolved, bgHex);
        report.push(
          `check-contrast: [${theme}] "${selector}" (${resolved}) over ${bg} (${bgHex}) = ${ratio.toFixed(2)}:1 (min ${TEXT_MIN_RATIO}:1, text)`,
        );
      }
    }
  }
  problems.push(...linkColourProblems(siteCss, tokens));

  for (const line of report) {
    console.log(line);
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`check-contrast: OK -- ${report.length} pairs checked, all at or above their minimum`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
