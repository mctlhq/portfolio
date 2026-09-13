// Coverage for scripts/check-links.mjs (issue #55, Q2', Part 4): a static
// proof that the script never touches the network, and a dynamic proof
// (over a temporary fixture tree, never the real dist/) that resolution
// honours trailingSlash: 'always', classifies same-origin absolute hrefs by
// origin comparison rather than byte equality, and correctly separates
// "checked", "skipped" and "broken".

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { classifyHref, collectHrefs, resolveInternal, run } from '../scripts/check-links.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCRIPT_PATH = path.join(ROOT, 'scripts/check-links.mjs');
const ORIGIN = 'https://dmitriimashkov.com';

// -- T6: no-network proof ---------------------------------------------------

test('scripts/check-links.mjs source contains none of the forbidden network identifiers', () => {
  const source = readFileSync(SCRIPT_PATH, 'utf8');
  const forbidden = [
    'fetch(',
    'node:http',
    'node:https',
    'node:net',
    'undici',
    'XMLHttpRequest',
    'setTimeout',
    'AbortSignal',
    'retry',
    'backoff',
  ];
  for (const token of forbidden) {
    assert.ok(!source.includes(token), `scripts/check-links.mjs must not contain "${token}"`);
  }
});

async function withFixture(fn: (distDir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), 'check-links-fixture-'));
  try {
    await mkdir(path.join(dir, 'colophon'), { recursive: true });
    await mkdir(path.join(dir, 'weird'), { recursive: true });

    await writeFile(
      path.join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
        <a href="/colophon/">Colophon</a>
      </body></html>`,
      'utf8',
    );

    await writeFile(
      path.join(dir, 'colophon', 'index.html'),
      `<!doctype html><html><head></head><body><p>Colophon page</p></body></html>`,
      'utf8',
    );

    await writeFile(
      path.join(dir, 'weird', 'index.html'),
      `<!doctype html><html><head>
        <link rel="canonical" href="https://dmitriimashkov.com/colophon/">
      </head><body>
        <a href="/colophon/">root-relative, working</a>
        <a href="https://dmitriimashkov.com/colophon/#build">same-origin absolute with fragment, working</a>
        <a href="https://dmitriimashkov.com/colophon">same-origin absolute, no trailing slash, working</a>
        <a href="/colophon/adr/does-not-exist/">broken internal href</a>
        <a href="mailto:hello@dmitriimashkov.com">mail</a>
        <a href="https://github.com/mctlhq/portfolio">off-origin</a>
      </body></html>`,
      'utf8',
    );

    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('run({ distDir }) calls globalThis.fetch zero times even when the stub would throw', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  // @ts-expect-error -- intentionally replacing with a throwing stub for the test
  globalThis.fetch = (...args: unknown[]) => {
    calls += 1;
    throw new Error(`check-links must never call fetch(); called with ${JSON.stringify(args)}`);
  };
  try {
    await withFixture(async (distDir) => {
      await run({ distDir, origin: ORIGIN });
    });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// -- T7: behaviour over the fixture tree ------------------------------------

test('root-relative, same-origin-absolute-with-fragment, and same-origin-absolute-without-trailing-slash all resolve', async () => {
  await withFixture(async (distDir) => {
    const { problems, checked, skipped } = await run({ distDir, origin: ORIGIN });
    // 6 internal hrefs are expected to be attempted: index.html's own
    // root-relative link, weird/index.html's canonical, its root-relative
    // link, its same-origin-with-fragment link, its same-origin-no-trailing-
    // slash link, and its broken link -- "checked" counts an attempt, not a
    // success.
    assert.equal(checked, 6);
    assert.equal(skipped.get('mailto:hello@dmitriimashkov.com'), 1);
    assert.equal(skipped.get('https://github.com/mctlhq/portfolio'), 1);
    const problemText = problems.join('\n');
    assert.doesNotMatch(problemText, /\/colophon\/#build/);
    assert.ok(
      !problems.some((p) => p.includes('"https://dmitriimashkov.com/colophon"')),
      'the no-trailing-slash same-origin absolute href must resolve, not fail',
    );
  });
});

test('a broken internal href appears in problems, naming both the href and the expected file', async () => {
  await withFixture(async (distDir) => {
    const { problems } = await run({ distDir, origin: ORIGIN });
    const match = problems.find((p) => p.includes('/colophon/adr/does-not-exist/'));
    assert.ok(match, `expected a problem naming the broken href, got: ${problems.join('\n')}`);
    assert.match(match!, /does-not-exist[\\/]index\.html/);
  });
});

test('mailto: and an off-origin https href both appear in skipped and neither is counted in checked', async () => {
  await withFixture(async (distDir) => {
    const { checked, skipped } = await run({ distDir, origin: ORIGIN });
    assert.ok(skipped.has('mailto:hello@dmitriimashkov.com'));
    assert.ok(skipped.has('https://github.com/mctlhq/portfolio'));
    // Only the 6 genuinely internal hrefs count toward `checked`; if either
    // skipped href had been miscounted, this would be 8.
    assert.equal(checked, 6);
  });
});

test('classifyHref reports mailto and off-origin with their specific reasons', () => {
  assert.deepEqual(classifyHref('mailto:hello@dmitriimashkov.com', ORIGIN), { kind: 'skipped', reason: 'mailto' });
  assert.deepEqual(classifyHref('https://github.com/mctlhq/portfolio', ORIGIN), {
    kind: 'skipped',
    reason: 'off-origin',
  });
});

test('resolveInternal names both candidates for an extensionless, slash-less broken path', () => {
  const { ok, candidates } = resolveInternal('/colophon/adr/does-not-exist', '/dist');
  assert.equal(ok, false);
  assert.equal(candidates.length, 2);
});

test('collectHrefs extracts hrefs from <a> and <link rel="canonical">, entity-decoded', () => {
  const html = `<a href="/a?x=1&amp;y=2">x</a><link rel="canonical" href="https://dmitriimashkov.com/colophon/">`;
  const { hrefs, unparsed } = collectHrefs(html);
  assert.deepEqual(hrefs, ['/a?x=1&y=2', 'https://dmitriimashkov.com/colophon/']);
  assert.deepEqual(unparsed, []);
});

// -- B2/B2a: single-quoted, unquoted and unparseable hrefs -------------------

test("collectHrefs extracts a single-quoted href", () => {
  const html = `<a href='/single-quoted/'>x</a>`;
  const { hrefs, unparsed } = collectHrefs(html);
  assert.deepEqual(hrefs, ['/single-quoted/']);
  assert.deepEqual(unparsed, []);
});

test('collectHrefs extracts an unquoted href', () => {
  const html = `<a href=/unquoted/>x</a>`;
  const { hrefs, unparsed } = collectHrefs(html);
  assert.deepEqual(hrefs, ['/unquoted/']);
  assert.deepEqual(unparsed, []);
});

test('collectHrefs reports (never drops) an <a> whose href= is unparseable by any alternative', () => {
  // href= immediately followed by `>` -- an empty, unquoted value with
  // nothing for the unquoted alternative to capture (it requires at least
  // one non-delimiter character).
  const html = `<a href=>malformed</a>`;
  const { hrefs, unparsed } = collectHrefs(html);
  assert.deepEqual(hrefs, []);
  assert.equal(unparsed.length, 1);
  assert.match(unparsed[0], /href=/);
});

test('run() counts a single-quoted and an unquoted href in checked, and reports an unparseable one by count and tag text', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'check-links-b2-fixture-'));
  try {
    await writeFile(
      path.join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
        <a href='/colophon/'>single-quoted</a>
        <a href=/colophon/>unquoted</a>
        <a href=>malformed</a>
      </body></html>`,
      'utf8',
    );
    const { problems, checked } = await run({ distDir: dir, origin: ORIGIN });
    assert.equal(checked, 2, 'the single-quoted and unquoted hrefs must both be counted in checked');
    const problemText = problems.join('\n');
    assert.match(problemText, /1 <a> element\(s\) with an unparseable href/);
    assert.match(problemText, /href=/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// -- Q15 (issue #98): the three new off-origin hrefs are reported, not -----
// -- silently passed over (open question 2) --------------------------------

test('classifyHref reports the three Q15 off-origin hrefs with reason off-origin', () => {
  assert.deepEqual(classifyHref('https://rewards.mctl.ai', ORIGIN), { kind: 'skipped', reason: 'off-origin' });
  assert.deepEqual(classifyHref('https://www.linkedin.com/in/dmitriimashkov', ORIGIN), {
    kind: 'skipped',
    reason: 'off-origin',
  });
  assert.deepEqual(classifyHref('https://t.me/dmitriimashkov', ORIGIN), { kind: 'skipped', reason: 'off-origin' });
});

test('run() counts and lists rewards.mctl.ai, linkedin and t.me alongside mailto in skipped, and none of the four in checked or problems', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'check-links-q15-fixture-'));
  try {
    await writeFile(
      path.join(dir, 'index.html'),
      `<!doctype html><html><head></head><body>
        <a href="https://rewards.mctl.ai">Service</a>
        <a href="https://www.linkedin.com/in/dmitriimashkov">LinkedIn</a>
        <a href="https://t.me/dmitriimashkov">Telegram</a>
        <a href="mailto:hello@dmitriimashkov.com">Email</a>
      </body></html>`,
      'utf8',
    );
    const { checked, problems, skipped } = await run({ distDir: dir, origin: ORIGIN });
    assert.equal(checked, 0, 'none of the four hrefs are internal');
    assert.deepEqual(problems, []);
    assert.equal(skipped.get('https://rewards.mctl.ai'), 1);
    assert.equal(skipped.get('https://www.linkedin.com/in/dmitriimashkov'), 1);
    assert.equal(skipped.get('https://t.me/dmitriimashkov'), 1);
    assert.equal(skipped.get('mailto:hello@dmitriimashkov.com'), 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// -- T8: canonical resolved by origin comparison, not byte equality --------

test('a <link rel="canonical"> pointing at a different page than its own resolves via origin comparison', async () => {
  await withFixture(async (distDir) => {
    const { problems } = await run({ distDir, origin: ORIGIN });
    // weird/index.html carries <link rel="canonical" href=".../colophon/">,
    // which is NOT its own path (/weird/) -- if classification required byte
    // equality with the page's own canonical/path it would be misclassified;
    // instead it is recognised as same-origin and resolves cleanly.
    assert.ok(
      !problems.some((p) => p.includes('dmitriimashkov.com/colophon/') && p.includes('weird')),
      `canonical href should have resolved via origin comparison, got: ${problems.join('\n')}`,
    );
  });
});
