import assert from 'node:assert/strict';
import { test } from 'node:test';
import { breadcrumbJsonLd, clampDescription } from '../src/lib/seo.ts';

test('clampDescription returns short text unchanged', () => {
  const text = 'A short description.';
  assert.equal(clampDescription(text), text);
});

test('clampDescription returns text unchanged when exactly max length', () => {
  const text = 'x'.repeat(160);
  assert.equal(clampDescription(text), text);
});

test('clampDescription trims at a word boundary and appends one ellipsis', () => {
  const text = 'word '.repeat(50).trim(); // 249 chars, well over 160
  const result = clampDescription(text);
  assert.ok(result.length <= 160);
  assert.ok(result.endsWith('…'));
  assert.equal((result.match(/…/g) ?? []).length, 1);
  assert.ok(!result.slice(0, -1).endsWith(' '));
});

test('clampDescription never returns more than max characters', () => {
  const text = 'a'.repeat(500);
  const result = clampDescription(text, 160);
  assert.ok(result.length <= 160);
});

test('clampDescription respects a custom max', () => {
  const text = 'one two three four five';
  const result = clampDescription(text, 10);
  assert.ok(result.length <= 10);
  assert.ok(result.endsWith('…'));
});

test('clampDescription falls back to a hard cut when there is no word boundary', () => {
  const text = 'a'.repeat(200);
  const result = clampDescription(text, 20);
  assert.equal(result.length, 20);
  assert.equal(result, `${'a'.repeat(19)}…`);
});

test('breadcrumbJsonLd returns a BreadcrumbList with three positioned ListItems and absolute-URL items', () => {
  const result = breadcrumbJsonLd('https://dmitriimashkov.com', [
    { name: 'Home', path: '/' },
    { name: 'Colophon', path: '/colophon/' },
    { name: 'Entry', path: '/colophon/journal/foo/' },
  ]) as {
    '@context': string;
    '@type': string;
    itemListElement: { '@type': string; position: number; name: string; item: string }[];
  };
  assert.equal(result['@context'], 'https://schema.org');
  assert.equal(result['@type'], 'BreadcrumbList');
  assert.equal(result.itemListElement.length, 3);
  assert.deepEqual(
    result.itemListElement.map((item) => item.position),
    [1, 2, 3],
  );
  assert.deepEqual(
    result.itemListElement.map((item) => item.name),
    ['Home', 'Colophon', 'Entry'],
  );
  assert.equal(result.itemListElement[2].item, 'https://dmitriimashkov.com/colophon/journal/foo/');
});
