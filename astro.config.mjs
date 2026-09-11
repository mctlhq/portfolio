import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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
      // ends up in the static path list this integration walks.
      filter: (page) => {
        const path = new URL(page).pathname;
        return !path.startsWith('/404') && !path.startsWith('/dev/');
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
