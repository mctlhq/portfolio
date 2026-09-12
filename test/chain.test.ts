// Coverage for src/lib/chain.ts (issue #55, Q2', Part 3): chainSegments must
// linkify github.com/mctlhq/portfolio and ghcr.io/mctlhq/portfolio wherever
// they appear in a colophon chain item, and leave every other character
// unchanged -- checked as a structural invariant (segment texts concatenate
// back to the original string byte-for-byte), not just on the two items
// that happen to carry an identifier today.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chainSegments, CHAIN_LINKS } from '../src/lib/chain.ts';
import { ui } from '../src/i18n/ui.ts';

const GITHUB_HREF = 'https://github.com/mctlhq/portfolio';
const GHCR_HREF = 'https://github.com/mctlhq/portfolio/packages';

test('CHAIN_LINKS maps the two identifiers to the expected hrefs', () => {
  const byText = Object.fromEntries(CHAIN_LINKS.map((l) => [l.text, l.href]));
  assert.equal(byText['github.com/mctlhq/portfolio'], GITHUB_HREF);
  assert.equal(byText['ghcr.io/mctlhq/portfolio'], GHCR_HREF);
});

for (const lang of ['en', 'ru'] as const) {
  for (const item of ui.colophonChainItems[lang]) {
    test(`chainSegments(${JSON.stringify(item)}) [${lang}] concatenates back to the original string`, () => {
      const segments = chainSegments(item);
      assert.equal(
        segments.map((s) => s.text).join(''),
        item,
      );
    });
  }
}

test('the English "Source" item yields exactly one github.com/mctlhq/portfolio link', () => {
  const item = ui.colophonChainItems.en.find((i) => i.includes('github.com/mctlhq/portfolio'));
  assert.ok(item, 'no English chain item contains github.com/mctlhq/portfolio');
  const linked = chainSegments(item!).filter((s) => s.href);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].href, GITHUB_HREF);
  assert.equal(linked[0].text, 'github.com/mctlhq/portfolio');
});

test('the Russian "Source" item yields exactly one github.com/mctlhq/portfolio link', () => {
  const item = ui.colophonChainItems.ru.find((i) => i.includes('github.com/mctlhq/portfolio'));
  assert.ok(item, 'no Russian chain item contains github.com/mctlhq/portfolio');
  const linked = chainSegments(item!).filter((s) => s.href);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].href, GITHUB_HREF);
  assert.equal(linked[0].text, 'github.com/mctlhq/portfolio');
});

test('the English "Image" item yields exactly one ghcr.io/mctlhq/portfolio link', () => {
  const item = ui.colophonChainItems.en.find((i) => i.includes('ghcr.io/mctlhq/portfolio'));
  assert.ok(item, 'no English chain item contains ghcr.io/mctlhq/portfolio');
  const linked = chainSegments(item!).filter((s) => s.href);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].href, GHCR_HREF);
  assert.equal(linked[0].text, 'ghcr.io/mctlhq/portfolio');
});

test('the Russian "Image" item yields exactly one ghcr.io/mctlhq/portfolio link', () => {
  const item = ui.colophonChainItems.ru.find((i) => i.includes('ghcr.io/mctlhq/portfolio'));
  assert.ok(item, 'no Russian chain item contains ghcr.io/mctlhq/portfolio');
  const linked = chainSegments(item!).filter((s) => s.href);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].href, GHCR_HREF);
  assert.equal(linked[0].text, 'ghcr.io/mctlhq/portfolio');
});

test('an item containing neither identifier yields a single unlinked segment', () => {
  const item = ui.colophonChainItems.en.find(
    (i) => !i.includes('github.com/mctlhq/portfolio') && !i.includes('ghcr.io/mctlhq/portfolio'),
  );
  assert.ok(item, 'expected at least one English chain item with neither identifier');
  const segments = chainSegments(item!);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].href, undefined);
  assert.equal(segments[0].text, item);
});
