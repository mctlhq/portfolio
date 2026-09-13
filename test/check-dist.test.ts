// Coverage for scripts/check-dist.mjs's checkHashedSubresources() (A3b):
// before this cycle it only checked that a /assets/ or /styles/ reference
// was hash-shaped (HASHED_SUFFIX_RE), never that the referenced file exists
// under dist/ or that its bytes actually hash to the segment named in the
// URL. scripts/check-dist.mjs has no isEntryPoint() guard -- it calls
// `await main()` unconditionally at module scope -- so this proves the fix
// by spawning the real script against a temporary, dist/-shaped fixture
// tree (never the real dist/), the same posture test/vendor-assets.test.ts
// already uses for verifyExistingTree(): the script's own ROOT is derived
// from import.meta.url, so running a *copy* scopes every path it touches to
// that copy.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Builds a minimal dist/-shaped fixture tree in a fresh mkdtemp directory:
 * scripts/check-dist.mjs and its src/lib/content-hash.ts dependency, a
 * astro.config.mjs carrying a `site`, empty journal/adr content dirs (so
 * checkColophonPages()'s readdir does not throw), and a dist/index.html
 * referencing one hashed /assets/ subresource. Returns the temp dir path.
 *
 * `astroConfig` (A2 proofs, issue #71) controls what astro.config.mjs looks
 * like in the fixture: `'site'` (default) writes one carrying a `site` key,
 * `'no-site'` writes one exporting an object with no `site` key at all, and
 * `'missing'` writes none, so `siteOrigin()`'s `readFile` itself throws. */
async function makeFixture(
  assetBytes: Buffer,
  opts: { astroConfig?: 'site' | 'no-site' | 'missing' } = {},
): Promise<string> {
  const astroConfig = opts.astroConfig ?? 'site';
  const tmp = await mkdtemp(path.join(tmpdir(), 'check-dist-test-'));
  await mkdir(path.join(tmp, 'scripts'), { recursive: true });
  await cp(path.join(ROOT, 'scripts/check-dist.mjs'), path.join(tmp, 'scripts/check-dist.mjs'));
  await cp(path.join(ROOT, 'src/lib'), path.join(tmp, 'src/lib'), { recursive: true });
  if (astroConfig === 'site') {
    await writeFile(
      path.join(tmp, 'astro.config.mjs'),
      "export default { site: 'https://example.invalid' };\n",
      'utf8',
    );
  } else if (astroConfig === 'no-site') {
    await writeFile(path.join(tmp, 'astro.config.mjs'), 'export default {};\n', 'utf8');
  }
  // 'missing' -- write no astro.config.mjs at all.
  await mkdir(path.join(tmp, 'src/content/journal'), { recursive: true });
  await mkdir(path.join(tmp, 'src/content/adr'), { recursive: true });
  await mkdir(path.join(tmp, 'dist/assets'), { recursive: true });
  await writeFile(path.join(tmp, 'dist/assets/x.deadbeef.css'), assetBytes);
  await writeFile(
    path.join(tmp, 'dist/index.html'),
    '<!doctype html><html><head>' +
      '<link rel="stylesheet" href="/assets/x.deadbeef.css">' +
      '</head><body></body></html>',
    'utf8',
  );
  return tmp;
}

const UPSTREAM_ANCHOR = 'problems.push(...checkNavigationState(html, rel));';

/** Builds the normal fixture, then patches the copied scripts/check-dist.mjs
 * so its one occurrence of `UPSTREAM_ANCHOR` -- a call from a stage that
 * runs strictly before checkSitemap() -- throws instead. Proves the A3b
 * control's reach marker (task 3) is load-bearing: with this mutation in
 * place, the script dies before checkSitemap() ever runs, so the reach
 * marker must disappear. */
async function makeFixtureWithUpstreamThrow(assetBytes: Buffer): Promise<string> {
  const tmp = await makeFixture(assetBytes);
  const scriptPath = path.join(tmp, 'scripts/check-dist.mjs');
  const source = await readFile(scriptPath, 'utf8');
  assert.equal(
    source.split(UPSTREAM_ANCHOR).length - 1,
    1,
    'expected exactly one upstream anchor to inject a throw at',
  );
  await writeFile(
    scriptPath,
    source.replace(UPSTREAM_ANCHOR, "throw new Error('injected upstream failure');"),
    'utf8',
  );
  return tmp;
}

function runCheckDist(tmp: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', [path.join(tmp, 'scripts/check-dist.mjs')], {
    cwd: tmp,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

test('A3b: a hashed /assets/ reference whose file bytes hash differently is reported, naming both hashes', async () => {
  const bytes = Buffer.from('not the bytes deadbeef claims to be', 'utf8');
  const actualHash8 = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  const tmp = await makeFixture(bytes);
  try {
    const result = runCheckDist(tmp);
    assert.notEqual(result.status, 0, `expected a non-zero exit; stdout: ${result.stdout}`);
    assert.match(result.stderr, /\/assets\/x\.deadbeef\.css/);
    assert.match(result.stderr, /deadbeef/);
    assert.match(result.stderr, new RegExp(actualHash8));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('A3b control: a hashed /assets/ reference whose file bytes match its own name is not reported', async () => {
  // Build bytes whose real hash is used as the filename, so the reference is
  // genuinely self-consistent.
  const seed = Buffer.from('genuinely matching bytes', 'utf8');
  const realHash8 = createHash('sha256').update(seed).digest('hex').slice(0, 8);
  const tmp = await mkdtemp(path.join(tmpdir(), 'check-dist-test-'));
  try {
    await mkdir(path.join(tmp, 'scripts'), { recursive: true });
    await cp(path.join(ROOT, 'scripts/check-dist.mjs'), path.join(tmp, 'scripts/check-dist.mjs'));
    await cp(path.join(ROOT, 'src/lib'), path.join(tmp, 'src/lib'), { recursive: true });
    await writeFile(
      path.join(tmp, 'astro.config.mjs'),
      "export default { site: 'https://example.invalid' };\n",
      'utf8',
    );
    await mkdir(path.join(tmp, 'src/content/journal'), { recursive: true });
    await mkdir(path.join(tmp, 'src/content/adr'), { recursive: true });
    await mkdir(path.join(tmp, 'dist/assets'), { recursive: true });
    await writeFile(path.join(tmp, `dist/assets/x.${realHash8}.css`), seed);
    await writeFile(
      path.join(tmp, 'dist/index.html'),
      '<!doctype html><html><head>' +
        `<link rel="stylesheet" href="/assets/x.${realHash8}.css">` +
        '</head><body></body></html>',
      'utf8',
    );
    const result = runCheckDist(tmp);
    // A1 (issue #71): a positive reach marker -- `checkSitemap()` runs
    // strictly after `checkHashedSubresources()`, so this line's presence
    // proves the spawned script actually reached the stage under test,
    // rather than the two doesNotMatch assertions below merely proving it
    // never printed the *specific wrong thing* -- true just the same if the
    // script died before ever getting there. See the mutation test below.
    assert.match(result.stderr, /check-dist: dist\/sitemap-index\.xml does not exist/);
    assert.doesNotMatch(result.stderr, new RegExp(`x\\.${realHash8}\\.css.*does not match`));
    assert.doesNotMatch(result.stderr, /does not exist under dist/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('A1 mutant: an injected upstream throw makes the A3b control\'s reach marker disappear (proves it is load-bearing)', async () => {
  const bytes = Buffer.from('genuinely matching bytes for the mutant fixture', 'utf8');
  const tmp = await makeFixtureWithUpstreamThrow(bytes);
  try {
    const result = runCheckDist(tmp);
    assert.notEqual(result.status, 0, `expected a non-zero exit; stdout: ${result.stdout}`);
    assert.match(result.stderr, /check-dist: unhandled error: injected upstream failure/);
    assert.doesNotMatch(result.stderr, /sitemap-index\.xml does not exist/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('A2 proof: with no astro.config.mjs, every non-empty stderr line carries the check-dist: prefix', async () => {
  const bytes = Buffer.from('genuinely matching bytes for the missing-config fixture', 'utf8');
  const tmp = await makeFixture(bytes, { astroConfig: 'missing' });
  try {
    const result = runCheckDist(tmp);
    const lines = result.stderr.split('\n').filter((line) => line.length > 0);
    assert.ok(lines.length > 0, 'expected at least one stderr line');
    for (const line of lines) {
      assert.ok(line.startsWith('check-dist: '), `expected every stderr line to start with "check-dist: ", got: ${line}`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('A2 proof: an astro.config.mjs with no `site` key is reported once-prefixed, never double-prefixed', async () => {
  const bytes = Buffer.from('genuinely matching bytes for the no-site fixture', 'utf8');
  const tmp = await makeFixture(bytes, { astroConfig: 'no-site' });
  try {
    const result = runCheckDist(tmp);
    assert.match(result.stderr, /check-dist: could not find `site` in astro\.config\.mjs/);
    assert.doesNotMatch(result.stderr, /check-dist: check-dist:/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

// -- Q15 (issue #98): checkHomePage()'s new home-page JSON-LD branch --------
// A minimal dist/-shaped fixture with a controllable dist/index.html, in the
// same spawn-the-real-script-against-a-temporary-tree style as A3b above.

const VALID_HOME_GRAPH = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Person',
      name: 'Dmitrii Mashkov',
      url: 'https://dmitriimashkov.com/',
      jobTitle: 'Senior platform engineer',
      email: 'mailto:hello@dmitriimashkov.com',
      sameAs: [
        'https://www.linkedin.com/in/dmitriimashkov',
        'https://github.com/mctlhq',
        'https://t.me/dmitriimashkov',
      ],
    },
    { '@type': 'WebSite', name: 'Dmitrii Mashkov', url: 'https://dmitriimashkov.com/', inLanguage: 'en' },
  ],
};

function ldJsonScript(graph: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
}

/** Builds a minimal dist/-shaped fixture with one dist/index.html carrying
 * the hero markup, the two `<summary><h2` disclosures, the primary CTA and
 * its `#contact` target that checkHomePage() otherwise requires -- so this
 * fixture satisfies every one of that function's other branches and this
 * test isolates the JSON-LD branch's own problems from all of them -- plus
 * whatever `headExtra` supplies inside <head> -- typically zero, one or two
 * application/ld+json blocks.
 *
 * Without this, all four JSON-LD fixtures below shared one incomplete body
 * that tripped the "<summary><h2" count, the primary-CTA and both #contact
 * checks identically regardless of what the JSON-LD graph looked like,
 * making the "well-formed graph" case a false control (it never actually
 * passed those other branches, so it proved nothing about them) and leaving
 * every mutation case unable to prove its assertion was reporting only the
 * one thing it changed. */
async function makeHomeJsonLdFixture(headExtra: string): Promise<string> {
  const tmp = await mkdtemp(path.join(tmpdir(), 'check-dist-jsonld-test-'));
  await mkdir(path.join(tmp, 'scripts'), { recursive: true });
  await cp(path.join(ROOT, 'scripts/check-dist.mjs'), path.join(tmp, 'scripts/check-dist.mjs'));
  await cp(path.join(ROOT, 'src/lib'), path.join(tmp, 'src/lib'), { recursive: true });
  await writeFile(
    path.join(tmp, 'astro.config.mjs'),
    "export default { site: 'https://example.invalid' };\n",
    'utf8',
  );
  await mkdir(path.join(tmp, 'src/content/journal'), { recursive: true });
  await mkdir(path.join(tmp, 'src/content/adr'), { recursive: true });
  await mkdir(path.join(tmp, 'dist'), { recursive: true });
  await writeFile(
    path.join(tmp, 'dist/index.html'),
    '<!doctype html><html><head><title>Dmitrii Mashkov</title>' +
      headExtra +
      '</head><body>' +
      '<h1 class="hero-name"><span class="l en">Dmitrii Mashkov</span><span class="l ru" lang="ru">Дмитрий Машков</span></h1>' +
      '<nav class="ctas"><a class="cta cta-primary" href="#contact">Contact</a></nav>' +
      '<details><summary><h2>Run summary</h2></summary></details>' +
      '<details><summary><h2>Work summary</h2></summary></details>' +
      '<section id="contact" tabindex="-1"></section>' +
      '</body></html>',
    'utf8',
  );
  return tmp;
}

/** Asserts that none of checkHomePage()'s non-JSON-LD branches -- the
 * "<summary><h2" count, the primary CTA and both #contact-target checks --
 * fired. Every one of the four tests below calls this so that whichever
 * JSON-LD-specific assertion follows is proven to be the only thing that
 * fixture actually tripped, rather than one line lost in noise the fixture
 * always produced regardless of the graph under test. */
function assertNoOtherHomePageProblems(stderr: string): void {
  assert.doesNotMatch(stderr, /"<summary><h2" opening\(s\)/);
  assert.doesNotMatch(stderr, /no <a class="cta cta-primary" href="#contact"> primary CTA/);
  assert.doesNotMatch(stderr, /no element carrying id="contact"/);
  assert.doesNotMatch(stderr, /no <section id="contact" tabindex="-1">/);
}

test('checkHomePage: a well-formed Person/WebSite graph reports no JSON-LD-specific problem', async () => {
  const tmp = await makeHomeJsonLdFixture(ldJsonScript(VALID_HOME_GRAPH));
  try {
    const result = runCheckDist(tmp);
    assert.doesNotMatch(result.stderr, /application\/ld\+json block\(s\)/);
    assert.doesNotMatch(result.stderr, /Person node keys are/);
    assert.doesNotMatch(result.stderr, /Person\.\w+ is/);
    assert.doesNotMatch(result.stderr, /WebSite node keys are/);
    assert.doesNotMatch(result.stderr, /WebSite\.\w+ is/);
    assertNoOtherHomePageProblems(result.stderr);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('checkHomePage: a Person.sameAs missing one entry is reported, naming Person.sameAs', async () => {
  const graph = JSON.parse(JSON.stringify(VALID_HOME_GRAPH));
  graph['@graph'][0].sameAs = graph['@graph'][0].sameAs.slice(0, 2);
  const tmp = await makeHomeJsonLdFixture(ldJsonScript(graph));
  try {
    const result = runCheckDist(tmp);
    assert.match(result.stderr, /Person\.sameAs is/);
    assertNoOtherHomePageProblems(result.stderr);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('checkHomePage: a Person node missing jobTitle is reported, naming jobTitle in the expected key list', async () => {
  const graph = JSON.parse(JSON.stringify(VALID_HOME_GRAPH));
  delete graph['@graph'][0].jobTitle;
  const tmp = await makeHomeJsonLdFixture(ldJsonScript(graph));
  try {
    const result = runCheckDist(tmp);
    assert.match(result.stderr, /Person node keys are/);
    assert.match(result.stderr, /jobTitle/);
    assertNoOtherHomePageProblems(result.stderr);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('checkHomePage: two application/ld+json blocks are reported, naming the count', async () => {
  const tmp = await makeHomeJsonLdFixture(ldJsonScript(VALID_HOME_GRAPH) + ldJsonScript(VALID_HOME_GRAPH));
  try {
    const result = runCheckDist(tmp);
    assert.match(result.stderr, /has 2 application\/ld\+json block\(s\), expected exactly 1/);
    assertNoOtherHomePageProblems(result.stderr);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
