import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseTagUrl, splitByLinks } from '../src/lib/links.ts';
import { ui } from '../src/i18n/ui.ts';

test('releaseTagUrl builds a github releases/tag URL from a version string', () => {
  assert.equal(releaseTagUrl('0.1.11'), 'https://github.com/mctlhq/portfolio/releases/tag/0.1.11');
});

test('splitByLinks rejoins exactly and linkifies exactly the source/image chain items, in both languages', () => {
  for (const lang of ['en', 'ru'] as const) {
    const items = ui.colophonChainItems[lang];
    for (const item of items) {
      const segments = splitByLinks(item);
      const rejoined = segments.map((s) => s.text).join('');
      assert.equal(rejoined, item, `${lang} item "${item}" did not rejoin exactly`);

      const linkedCount = segments.filter((s) => s.href).length;
      if (item.includes('github.com/mctlhq/portfolio') || item.includes('ghcr.io/mctlhq/portfolio')) {
        assert.equal(linkedCount, 1, `${lang} item "${item}" expected exactly one linked segment`);
      } else {
        assert.equal(linkedCount, 0, `${lang} item "${item}" expected no linked segment`);
      }
    }
  }
});
