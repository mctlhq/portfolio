// Plain support module (not a test file): finishes a throwaway Astro project
// tree that test/home.test.ts, test/journal-build.test.ts and
// test/project-card-private.test.ts build with a real `astro build`. Each of
// them copies src/ (then swaps in its own fixtures) and calls this to add
// the rest: package.json, tsconfig.json, astro.config.mjs, and node_modules
// and public/ symlinked from the real repository.
//
// The symlinked node_modules is why the config is wrapped rather than
// copied. Astro's cacheDir defaults to ./node_modules/.astro, where the
// content layer keeps data-store.json, and Vite's to ./node_modules/.vite.
// Through the symlink every tree shared those two directories, and
// `node --test` runs the three files in parallel, so a build could read
// another tree's content: the home build rendering project-card-private's
// fixture projects and missing https://rewards.mctl.ai was one observed
// flake. The wrapper points both caches inside the tree itself, which the
// test's own cleanup removes. The real astro.config.mjs is copied unchanged
// as astro.config.base.mjs, so the build is otherwise the production one.
//
// This file exports no test and registers nothing with node:test; it is
// deliberately absent from the `npm test` file list in package.json.

import { cp, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CONFIG_WRAPPER = `import base from './astro.config.base.mjs';

export default {
  ...base,
  cacheDir: './.astro-cache',
  vite: { ...base.vite, cacheDir: './.vite-cache' },
};
`;

export async function finishAstroTree(root: string, tmp: string): Promise<void> {
  await cp(path.join(root, 'astro.config.mjs'), path.join(tmp, 'astro.config.base.mjs'));
  await writeFile(path.join(tmp, 'astro.config.mjs'), CONFIG_WRAPPER, 'utf8');
  await cp(path.join(root, 'package.json'), path.join(tmp, 'package.json'));
  await cp(path.join(root, 'tsconfig.json'), path.join(tmp, 'tsconfig.json'));
  await symlink(path.join(root, 'node_modules'), path.join(tmp, 'node_modules'));
  await symlink(path.join(root, 'public'), path.join(tmp, 'public'));
}
