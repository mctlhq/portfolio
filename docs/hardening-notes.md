# Hardening notes

Record of the production-hardening work in issue #10 (P8): what landed, why,
and what is left to a human reviewer after deployment.

## Response headers

One row per header this site sends, six pre-existing plus the two added this
cycle (COOP, CORP). Every header is now defined exactly once, in
`security-headers.conf`, and included into `nginx.conf` at server level and
in each of its four `location` blocks — see "Header set defined once" below.

| Header | Landed | Why |
| --- | --- | --- |
| `X-Content-Type-Options: nosniff` | yes (pre-existing, relocated) | Stops the browser from MIME-sniffing a response into an executable type. |
| `X-Frame-Options: DENY` | yes (pre-existing, relocated) | Belt-and-suspenders against clickjacking alongside `frame-ancestors 'none'` in the CSP; value unchanged this cycle. |
| `Referrer-Policy: strict-origin-when-cross-origin` | yes (pre-existing, relocated) | Sends the full referrer only same-origin, and only the origin cross-origin; value unchanged. |
| `Permissions-Policy: geolocation=(), microphone=(), camera=()` | yes (pre-existing, relocated) | The site uses none of these APIs, so all three are denied outright; value unchanged. |
| `Strict-Transport-Security: max-age=31536000; includeSubDomains` | yes (pre-existing, relocated) | One year, subdomains included; value unchanged. |
| `Content-Security-Policy` | yes (pre-existing, relocated; the one directive that actually changes this cycle in its script-src hash set) | `default-src 'self'; script-src 'self' <hashes>; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` — no external origin, no `'unsafe-inline'` anywhere. The hash placeholder now lives in `security-headers.conf` instead of `nginx.conf`; the Dockerfile substitutes it at image build time and asserts the result before copying `dist/`. |
| `Cross-Origin-Opener-Policy: same-origin` | yes (new this cycle) | Isolates the page's browsing context group from cross-origin openers/openees. Cannot break this site: it opens no cross-origin window and is never opened as one. |
| `Cross-Origin-Resource-Policy: same-origin` | yes (new this cycle) | Blocks cross-origin `no-cors` reads of this site's responses. Cannot break this site: it has zero third-party consumers by design (ADR-0005) and embeds no cross-origin resource itself. |

`Cross-Origin-Embedder-Policy` was explicitly out of scope for this cycle —
not requested by the issue, and it is the one isolation header that can break
subresource loading if a future resource ever needs `crossorigin` wiring.

## Header set defined once

Before this cycle, the six original `add_header` lines were repeated
verbatim at server level and in each of the four `location` blocks of
`nginx.conf` — thirty lines, because a `location`-level `add_header`
discards the set it would otherwise inherit from its parent. This cycle
extracts all eight headers into a new repository-root file,
`security-headers.conf`, and replaces every repetition with
`include /etc/nginx/security-headers.conf;`. The file is installed at
`/etc/nginx/security-headers.conf` — deliberately not under
`/etc/nginx/conf.d/`, since the stock `nginx:alpine` image's own
`nginx.conf` already does `include /etc/nginx/conf.d/*.conf;` inside `http`,
which would load the snippet a second time at that level if it lived there.
`test/nginx.test.ts` asserts the shape (zero `add_header` for any of the
eight headers in `nginx.conf`, exactly one per header in
`security-headers.conf`, exactly one include per block) at the source level;
`scripts/check-headers.mjs`, run from `.github/workflows/build.yml` against
a container built from the actual image, proves the include resolves at
runtime and every response still carries all eight headers.

`scripts/check-headers.mjs` tries to discover a real `/_astro/` asset from
the home page markup first, as the issue's criterion assumes; in this site's
current state `astro build` never writes anything under `dist/_astro/` —
every stylesheet is linked directly from `public/assets/` and `public/styles/`
rather than bundled, and there is no client script to chunk. When discovery
finds nothing, the script falls back to probing a path under `/_astro/` that
is guaranteed not to exist, and expects `404` instead of `200`; the
`location /_astro/` block still has to answer with the full eight-header set
on that `404` (`add_header ... always`), which is exactly what the check
verifies. The fallback keeps the location itself covered by the gate without
inventing a fixture file; discovery takes over automatically the moment a
future cycle does put something there.

## `style-src` and the inline script

`style-src 'self'` has carried no `'unsafe-inline'` since the CSP was first
written, and `astro.config.mjs` already set `build.inlineStylesheets:
'never'` in an earlier cycle specifically so that Astro never emits an
inline `<style>` element that policy would block — this cycle only records
that decision, not decides it. `scripts/check-dist.mjs` now also fails the
build if any `dist/**/*.html` contains a `<style` element or a `style="`
attribute, as the buildable proxy for "no CSP violation in the console" that
requires a browser to observe directly. The single inline element the page
does ship — the language/theme bootstrap `<script>` in `Base.astro`, capped
at 400 bytes by `scripts/csp-hash.mjs` — is allowed by its SHA-256 hash in
`script-src`, not by a keyword, so it is unaffected by (and does not weaken)
the "no `'unsafe-inline'`" posture.

## Open Graph image: SVG, not raster

`public/og.svg` is a 1200×630 text-only SVG (`Dmitrii Mashkov` /
`Platform engineering with AI on proven open source` / `dmitriimashkov.com`),
with no `<image>`, no `data:` URI, no `xlink:href` and no raster file
extension anywhere in it — ADR-0005 and the issue both rule out shipping a
PNG/JPEG/WebP or an image-processing build dependency. The cost: most social
platforms (Facebook, LinkedIn, Slack, Telegram, X) do not rasterize an SVG
`og:image` for a link preview and will render the card with no image at all,
title and description only. This is a known, accepted trade-off (see
proposal `design.md`, Open question 2) rather than an oversight; revisiting
it requires a new issue that relaxes the no-raster rule.

## Lighthouse mobile (reviewer step, post-deployment)

Run Lighthouse (mobile) against the four static pages — `/`, `/work/`,
`/approach/`, `/colophon/` — on the deployed site and record the scores and
any flagged issue here.

_Not yet run — the implementer has no browser. Fill in after deployment._

| Page | Performance | Accessibility | Best Practices | SEO | Notes |
| --- | --- | --- | --- | --- | --- |
| `/` | — | — | — | — | |
| `/work/` | — | — | — | — | |
| `/approach/` | — | — | — | — | |
| `/colophon/` | — | — | — | — | |
