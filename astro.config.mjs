import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://dmitriimashkov.com',
  trailingSlash: 'always',
  integrations: [],
  build: {
    // The existing style-src 'self' CSP header carries no 'unsafe-inline',
    // so any stylesheet Astro would otherwise inline into a <style> element
    // must instead become a _astro/*.css link, which the header already
    // allows.
    inlineStylesheets: 'never',
  },
});
