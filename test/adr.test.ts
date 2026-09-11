import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADR_SECTIONS, adrBodyProblems, checkAdrBodies } from '../src/lib/adr.ts';

function section(name: string, heading: string, ru: string, en = 'English prose.', ruBody = 'Русский текст.') {
  return (
    `## <span class="l en">${heading}</span><span class="l ru">${ru}</span>\n\n` +
    `<div class="l en">\n\n${en}\n\n</div>\n\n` +
    `<div class="l ru" lang="ru">\n\n${ruBody}\n\n</div>\n\n`
  );
}

const HEADINGS_RU: Record<(typeof ADR_SECTIONS)[number], string> = {
  Context: 'Контекст',
  Decision: 'Решение',
  Consequences: 'Последствия',
  Drivers: 'Движущие факторы',
  'Revisit criteria': 'Критерии пересмотра',
};

function wellFormedBody(): string {
  return ADR_SECTIONS.map((s) => section(s, s, HEADINGS_RU[s])).join('');
}

test('adrBodyProblems returns [] for a well-formed bilingual body', () => {
  assert.deepEqual(adrBodyProblems('0001-bootstrap-boundary', wellFormedBody()), []);
});

test('adrBodyProblems reports a missing section', () => {
  const withoutDrivers = ADR_SECTIONS.filter((s) => s !== 'Drivers')
    .map((s) => section(s, s, HEADINGS_RU[s]))
    .join('');
  const problems = adrBodyProblems('0001-bootstrap-boundary', withoutDrivers);
  assert.ok(problems.some((p) => p.includes('missing section "Drivers"')));
});

test('adrBodyProblems reports sections out of order', () => {
  const reordered =
    section('Context', 'Context', HEADINGS_RU.Context) +
    section('Decision', 'Decision', HEADINGS_RU.Decision) +
    section('Drivers', 'Drivers', HEADINGS_RU.Drivers) +
    section('Consequences', 'Consequences', HEADINGS_RU.Consequences) +
    section('Revisit criteria', 'Revisit criteria', HEADINGS_RU['Revisit criteria']);
  const problems = adrBodyProblems('0001-bootstrap-boundary', reordered);
  assert.ok(problems.some((p) => p.includes('out of order')));
});

test('adrBodyProblems reports a section missing its English or Russian block', () => {
  const missingRu = ADR_SECTIONS.map((s) => {
    if (s !== 'Context') return section(s, s, HEADINGS_RU[s]);
    return `## <span class="l en">Context</span><span class="l ru">Контекст</span>\n\n<div class="l en">\n\nEnglish only.\n\n</div>\n\n`;
  }).join('');
  const problems = adrBodyProblems('0001-bootstrap-boundary', missingRu);
  assert.ok(problems.some((p) => p.includes('Context') && p.includes('Russian')));
});

test('adrBodyProblems reports a heading missing its Russian span', () => {
  const missingHeadingRuSpan = ADR_SECTIONS.map((s) => {
    if (s !== 'Context') return section(s, s, HEADINGS_RU[s]);
    return (
      `## <span class="l en">Context</span>\n\n` +
      `<div class="l en">\n\nEnglish prose.\n\n</div>\n\n` +
      `<div class="l ru" lang="ru">\n\nРусский текст.\n\n</div>\n\n`
    );
  }).join('');
  const problems = adrBodyProblems('0001-bootstrap-boundary', missingHeadingRuSpan);
  assert.ok(problems.some((p) => p.includes('heading "Context"') && p.includes('Russian')));
});

test('adrBodyProblems accepts the accessible Russian span markup (lang="ru" attribute)', () => {
  const accessibleRuSpan = ADR_SECTIONS.map((s) => {
    if (s !== 'Context') return section(s, s, HEADINGS_RU[s]);
    return (
      `## <span class="l en">Context</span><span class="l ru" lang="ru">${HEADINGS_RU.Context}</span>\n\n` +
      `<div class="l en">\n\nEnglish prose.\n\n</div>\n\n` +
      `<div class="l ru" lang="ru">\n\nРусский текст.\n\n</div>\n\n`
    );
  }).join('');
  const problems = adrBodyProblems('0001-bootstrap-boundary', accessibleRuSpan);
  assert.ok(!problems.some((p) => p.includes('heading "Context"') && p.includes('missing its Russian')));
});

test('checkAdrBodies throws once naming every problem from every bad entry, and does not throw for good entries', () => {
  const good = { id: '0001-bootstrap-boundary', body: wellFormedBody(), frontmatterId: 1 };
  const missingSection = {
    id: '0002-static-astro-no-client-bundles',
    body: ADR_SECTIONS.filter((s) => s !== 'Consequences')
      .map((s) => section(s, s, HEADINGS_RU[s]))
      .join(''),
    frontmatterId: 2,
  };
  const badId = { id: '0005-self-contained-runtime-assets', body: wellFormedBody(), frontmatterId: 9 };

  assert.doesNotThrow(() => checkAdrBodies([good]));

  assert.throws(() => checkAdrBodies([good, missingSection, badId]), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes('0002-static-astro-no-client-bundles'));
    assert.ok(error.message.includes('missing section "Consequences"'));
    assert.ok(error.message.includes('0005-self-contained-runtime-assets'));
    assert.ok(error.message.includes('frontmatter id 9'));
    // The good entry must not appear as a problem.
    assert.ok(!error.message.includes('0001-bootstrap-boundary:'));
    return true;
  });
});

test('checkAdrBodies reports a frontmatter id that disagrees with the filename prefix, naming both values', () => {
  assert.throws(
    () =>
      checkAdrBodies([{ id: '0001-bootstrap-boundary', body: wellFormedBody(), frontmatterId: 7 }]),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('0001'));
      assert.ok(error.message.includes('7'));
      return true;
    },
  );
});
