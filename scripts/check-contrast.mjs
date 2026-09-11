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
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const MCTL_CSS_PATH = path.join(ROOT, 'public/assets/mctl/mctl.css');

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

async function main() {
  const css = await readFile(MCTL_CSS_PATH, 'utf8');
  const tokens = parseTokens(css);

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

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`check-contrast: OK -- ${report.length} pairs checked, all at or above their minimum`);
}

await main();
