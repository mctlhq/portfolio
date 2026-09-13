import assert from 'node:assert/strict';
import { test } from 'node:test';
import { breadcrumbJsonLd, clampDescription, homeJsonLd } from '../src/lib/seo.ts';

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

// -- homeJsonLd (issue #98, Q15) ---------------------------------------------

interface HomeGraph {
  '@context': string;
  '@graph': Record<string, unknown>[];
}

test('homeJsonLd returns a @graph with exactly two nodes: Person then WebSite', () => {
  const result = homeJsonLd() as HomeGraph;
  assert.equal(result['@context'], 'https://schema.org');
  assert.equal(result['@graph'].length, 2);
  assert.equal(result['@graph'][0]['@type'], 'Person');
  assert.equal(result['@graph'][1]['@type'], 'WebSite');
});

test('homeJsonLd Person node carries exactly the six Appendix A.11 fields with their exact values', () => {
  const result = homeJsonLd() as HomeGraph;
  const person = result['@graph'][0];
  assert.deepEqual(Object.keys(person).sort(), ['@type', 'email', 'jobTitle', 'name', 'sameAs', 'url'].sort());
  assert.equal(person.name, 'Dmitrii Mashkov');
  assert.equal(person.url, 'https://dmitriimashkov.com/');
  assert.equal(person.jobTitle, 'Senior platform engineer');
  assert.equal(person.email, 'mailto:hello@dmitriimashkov.com');
});

test('homeJsonLd Person.sameAs deep-equals the three URLs in Appendix A.11 order', () => {
  const result = homeJsonLd() as HomeGraph;
  const person = result['@graph'][0];
  assert.deepEqual(person.sameAs, [
    'https://www.linkedin.com/in/dmitriimashkov',
    'https://github.com/mctlhq',
    'https://t.me/dmitriimashkov',
  ]);
});

test('homeJsonLd WebSite node carries exactly the four Appendix A.11 fields with their exact values', () => {
  const result = homeJsonLd() as HomeGraph;
  const site = result['@graph'][1];
  assert.deepEqual(Object.keys(site).sort(), ['@type', 'inLanguage', 'name', 'url'].sort());
  assert.equal(site.name, 'Dmitrii Mashkov');
  assert.equal(site.url, 'https://dmitriimashkov.com/');
  assert.equal(site.inLanguage, 'en');
});

test('homeJsonLd carries no worksFor, address, alumniOf, telephone or potentialAction on either node', () => {
  const result = homeJsonLd() as HomeGraph;
  for (const node of result['@graph']) {
    for (const forbidden of ['worksFor', 'address', 'alumniOf', 'telephone', 'potentialAction']) {
      assert.ok(!(forbidden in node), `unexpected field "${forbidden}" on @type ${node['@type']}`);
    }
  }
});

test('homeJsonLd is pure and returns a fresh object on every call', () => {
  const first = homeJsonLd() as HomeGraph;
  const second = homeJsonLd() as HomeGraph;
  assert.notEqual(first, second);
  assert.notEqual(first['@graph'], second['@graph']);
  first['@graph'][0].name = 'mutated';
  assert.equal((second['@graph'][0] as Record<string, unknown>).name, 'Dmitrii Mashkov');
});
