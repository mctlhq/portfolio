#!/usr/bin/env node
// Renders public/og.svg to dist/og.png at build time (issue #50, Q6, item
// 1) so a link preview on Telegram, Slack, LinkedIn or X carries an image --
// no social platform renders SVG in a card. Runs after `astro build` and
// before scripts/check-dist.mjs (wired into the `build` script in
// package.json), and makes no network request of any kind.
//
// The renderer is @resvg/resvg-wasm: the only SVG rasteriser that installs
// as a pure WebAssembly npm package, with no platform-gated
// optionalDependencies and no postinstall download -- see AGENTS.md's
// lockfile-hazard note and docs/hardening-notes.md for why `sharp` and
// @resvg/resvg-js (its native sibling) are not an option here. It also
// needs no system fontconfig or installed fonts, unlike a librsvg-backed
// renderer, which would render the three <text> elements empty on
// node:24-alpine.
//
// resvg needs its font as an sfnt (TTF/OTF) buffer, not woff2. The two
// Onest weights og.svg uses (400, 700) are converted from the WOFF1 entries
// the pinned @fontsource/onest tarball already carries, by
// scripts/vendor-assets.mjs's woffToTtf()/extractOnestTtfs(), and written
// to scripts/fonts/ -- build-only, never under public/, so they are never
// served. This script fails loudly if npm run vendor has not produced them.
//
// og.svg's <text> elements carry font-family="Arial, Helvetica,
// sans-serif": resvg's font matcher tries each name in turn against its
// loaded font database, so on node:24-alpine (no system fonts, no
// fontconfig) "Arial" and "Helvetica" resolve to nothing and the generic
// "sans-serif" keyword is what actually renders -- redirected to the
// loaded Onest buffers via the `sansSerifFamily`/`defaultFontFamily`
// options below, with no edit to og.svg itself. og.svg stays the single
// source of truth for the composition.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const OG_SVG_PATH = path.join(ROOT, 'public/og.svg');
const DIST_DIR = path.join(ROOT, 'dist');
const OG_PNG_PATH = path.join(DIST_DIR, 'og.png');
const FONT_DIR = path.join(ROOT, 'scripts/fonts');
const FONT_PATHS = [
  path.join(FONT_DIR, 'onest-latin-400-normal.ttf'),
  path.join(FONT_DIR, 'onest-latin-700-normal.ttf'),
];
const WASM_PATH = fileURLToPath(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url));

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

async function main() {
  let fontBuffers;
  try {
    fontBuffers = await Promise.all(FONT_PATHS.map((p) => readFile(p)));
  } catch (err) {
    console.error(
      `render-og: could not read a build-only TTF under scripts/fonts/ (${err.message}). ` +
        `Run "npm run vendor" first -- it converts the pinned @fontsource/onest WOFF1 entries.`,
    );
    process.exitCode = 1;
    return;
  }

  const wasmBuffer = await readFile(WASM_PATH);
  await initWasm(wasmBuffer);

  const svg = await readFile(OG_SVG_PATH);

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: OG_WIDTH },
    font: {
      loadSystemFonts: false,
      fontBuffers,
      defaultFontFamily: 'Onest',
      sansSerifFamily: 'Onest',
    },
  });

  const rendered = resvg.render();
  if (rendered.width !== OG_WIDTH || rendered.height !== OG_HEIGHT) {
    console.error(
      `render-og: rendered ${rendered.width}x${rendered.height}, expected exactly ${OG_WIDTH}x${OG_HEIGHT} -- ` +
        `check public/og.svg's viewBox`,
    );
    process.exitCode = 1;
    return;
  }

  const pngBytes = rendered.asPng();

  await mkdir(DIST_DIR, { recursive: true });
  await writeFile(OG_PNG_PATH, pngBytes);
  console.log(`render-og: wrote dist/og.png (${OG_WIDTH}x${OG_HEIGHT}, ${pngBytes.length} bytes)`);
}

await main();
