import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://dmitriimashkov.com',
  trailingSlash: 'always',
  integrations: [],
});
