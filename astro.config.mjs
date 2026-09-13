import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { noindexJournalPaths } from './src/lib/indexing.ts';

// Computed once at config load, from the journal collection's own files
// (issue #88, Q13) -- no hand-typed path list, the defect class
// test/entry-point.test.ts's header records two prior cycles (#69, #75)
// losing coverage to (see also test/indexing.test.ts).
const NOINDEX_JOURNAL_PATHS = new Set(noindexJournalPaths('./src/content/journal'));

export default defineConfig({
  output: 'static',
  site: 'https://dmitriimashkov.com',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      // The 404 page and the dev-only collection-count route are not public
      // pages: the 404 already carries <meta name="robots" content="noindex">
      // (Base.astro) and dev/[check] emits nothing outside `astro dev`, but
      // the filter is the belt to that suspenders in case either route ever
      // ends up in the static path list this integration walks. A journal
      // entry marked `indexing: noindex` stays published, linked and
      // reachable -- only its sitemap row and its index eligibility change.
      filter: (page) => {
        const pathname = new URL(page).pathname;
        if (pathname.startsWith('/404') || pathname.startsWith('/dev/')) return false;
        return !NOINDEX_JOURNAL_PATHS.has(pathname);
      },
    }),
  ],
  build: {
    // The existing style-src 'self' CSP header carries no 'unsafe-inline',
    // so any stylesheet Astro would otherwise inline into a <style> element
    // must instead become a _astro/*.css link, which the header already
    // allows.
    inlineStylesheets: 'never',
  },
});
