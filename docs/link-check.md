# Link check (issue #46, Q2)

Command run: `npm run build && node scripts/check-links.mjs dist`

Date: 2026-09-11

This sandbox had outbound network access at the time of this run, so the
external-URL table below reflects a real `fetch()` result for every
external `href` in the built site, not a fabricated status. If a future CI
run has no route to the internet, `scripts/check-links.mjs` prints
`check-links: network unreachable, skipping external checks` and exits 0
instead of failing the build — see the script's own header comment for the
exact policy (one retry, 30s timeout, redirects followed; the
`releases/tag/...` URL is the one soft check, a 404 there warns and passes).

## Internal hrefs

28 internal (root-relative) hrefs were checked against the `dist/` tree,
honoring `trailingSlash: 'always'`. All 28 resolved. 1 `mailto:` href
(`mailto:hello@dmitriimashkov.com`) was recorded and skipped, as designed —
it is never fetched.

## External hrefs

60 external `http(s)` hrefs were checked with a real sequential GET. All 60
returned `200`.

| URL | Status |
| --- | --- |
| https://dmitriimashkov.com/ | 200 |
| https://dmitriimashkov.com/approach/ | 200 |
| https://dmitriimashkov.com/colophon/ | 200 |
| https://dmitriimashkov.com/colophon/adr/0001-bootstrap-boundary/ | 200 |
| https://dmitriimashkov.com/colophon/adr/0002-static-astro-no-client-bundles/ | 200 |
| https://dmitriimashkov.com/colophon/adr/0003-custom-domain-via-mctl-registry/ | 200 |
| https://dmitriimashkov.com/colophon/adr/0004-no-analytics/ | 200 |
| https://dmitriimashkov.com/colophon/adr/0005-self-contained-runtime-assets/ | 200 |
| https://dmitriimashkov.com/colophon/adr/0006-browser-verified-security-headers/ | 200 |
| https://dmitriimashkov.com/colophon/journal/2026-09-10-add-portfolio-to-the-devloop-service-enums/ | 200 |
| https://dmitriimashkov.com/colophon/journal/2026-09-10-astro-static-skeleton-and-nginx-image/ | 200 |
| https://dmitriimashkov.com/colophon/journal/2026-09-10-base-layout-vendored-tokens-and-fonts/ | 200 |
| https://dmitriimashkov.com/colophon/journal/2026-09-10-register-portfolio-as-a-devloop-service/ | 200 |
| https://dmitriimashkov.com/colophon/journal/2026-09-11-approach-page/ | 200 |
| https://dmitriimashkov.com/colophon/journal/2026-09-11-content-collections/ | 200 |
| https://dmitriimashkov.com/colophon/journal/2026-09-11-hero-name-in-the-reader-s-script/ | 200 |
| https://dmitriimashkov.com/colophon/journal/2026-09-11-home-page/ | 200 |
| https://dmitriimashkov.com/colophon/journal/2026-09-11-metrics-provenance-and-no-analytics/ | 200 |
| https://dmitriimashkov.com/colophon/journal/2026-09-11-p8-production-hardening-accessibility-wc/ | 200 |
| https://dmitriimashkov.com/colophon/journal/2026-09-11-production-cutover/ | 200 |
| https://dmitriimashkov.com/colophon/journal/2026-09-11-work-page/ | 200 |
| https://dmitriimashkov.com/work/ | 200 |
| https://docs.mctl.ai | 200 |
| https://github.com/mashkoffdmitry/pelican-libertex-social | 200 |
| https://github.com/mctlhq | 200 |
| https://github.com/mctlhq/mctl-academy | 200 |
| https://github.com/mctlhq/mctl-agent | 200 |
| https://github.com/mctlhq/mctl-agents | 200 |
| https://github.com/mctlhq/mctl-agents/issues/330 | 200 |
| https://github.com/mctlhq/mctl-agents/pull/331 | 200 |
| https://github.com/mctlhq/mctl-api | 200 |
| https://github.com/mctlhq/mctl-api/issues/281 | 200 |
| https://github.com/mctlhq/mctl-api/pull/282 | 200 |
| https://github.com/mctlhq/mctl-design | 200 |
| https://github.com/mctlhq/mctl-gitops | 200 |
| https://github.com/mctlhq/mctl-loyalty | 200 |
| https://github.com/mctlhq/mctl-openclaw | 200 |
| https://github.com/mctlhq/mctl-pairdesk | 200 |
| https://github.com/mctlhq/mctl-portal | 200 |
| https://github.com/mctlhq/mctl-telegram | 200 |
| https://github.com/mctlhq/portfolio | 200 |
| https://github.com/mctlhq/portfolio/issues/10 | 200 |
| https://github.com/mctlhq/portfolio/issues/11 | 200 |
| https://github.com/mctlhq/portfolio/issues/27 | 200 |
| https://github.com/mctlhq/portfolio/issues/3 | 200 |
| https://github.com/mctlhq/portfolio/issues/4 | 200 |
| https://github.com/mctlhq/portfolio/issues/42 | 200 |
| https://github.com/mctlhq/portfolio/issues/5 | 200 |
| https://github.com/mctlhq/portfolio/issues/6 | 200 |
| https://github.com/mctlhq/portfolio/issues/7 | 200 |
| https://github.com/mctlhq/portfolio/issues/8 | 200 |
| https://github.com/mctlhq/portfolio/packages | 200 |
| https://github.com/mctlhq/portfolio/pull/12 | 200 |
| https://github.com/mctlhq/portfolio/pull/16 | 200 |
| https://github.com/mctlhq/portfolio/pull/21 | 200 |
| https://github.com/mctlhq/portfolio/pull/24 | 200 |
| https://github.com/mctlhq/portfolio/pull/28 | 200 |
| https://github.com/mctlhq/portfolio/pull/32 | 200 |
| https://github.com/mctlhq/portfolio/releases/tag/0.1.11 | 200 (also the one URL this script treats as soft: a 404 here would warn and pass rather than fail) |
| https://github.com/mctlhq/seerrsense | 200 |

Result: `check-links: OK -- 28 internal, 1 mailto (skipped), 60 external
checked`, exit code 0.

## CI wiring

`.github/workflows/build.yml`'s `test` job now runs `npm run build` (which
still runs the full `npm test` suite via `prebuild`) followed by
`node scripts/check-links.mjs dist`, so this same check runs on every pull
request against a freshly built `dist/`.
