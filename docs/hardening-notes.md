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

**The hash source must be quoted (issue #45).** The header as served is
`content-security-policy: default-src 'self'; script-src 'self' 'sha256-<base64>'; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.
For one release the hash was emitted without its surrounding single quotes, so
the browser discarded it as an invalid source and refused to run the inline
language/theme script, while `grep -q "sha256-"` in the Dockerfile and
`csp.includes('sha256-')` in `scripts/check-headers.mjs` both stayed green:
they asserted the presence of a substring, not the validity of a source
expression. Both now parse the `script-src` directive and require every
hash-shaped token to be exactly `'<algo>-<base64>'`, and the runtime check also
compares the token against the SHA-256 of the inline script actually served, so
a quoted but stale hash fails as well.

## Open Graph image: build-time PNG, rendered from the SVG source

`public/og.svg` is a 1200×630 text-only SVG (`Dmitrii Mashkov` /
`Platform engineering with AI on proven open source` / `dmitriimashkov.com`),
with no `<image>`, no `data:` URI, no `xlink:href` and no raster file
extension anywhere in it. Since issue #50 (Q6), `src/layouts/Base.astro`
points `og:image` and `twitter:image` at `/og.png`, not `/og.svg` directly:
`scripts/render-og.mjs` rasterises `public/og.svg` to `dist/og.png` at build
time via `@resvg/resvg-wasm`, so the source of truth stays the hand-authored
SVG while the served meta tags name a format every social platform actually
rasterises for a link preview. `scripts/check-dist.mjs`'s
`checkOgImageMeta()` asserts `og:image` and `twitter:image` carry the same
value and that it resolves to a file under `dist/`; `checkOgPngDimensions()`
additionally requires `dist/og.png`, when present, to be exactly 1200×630.

The no-raster rule this section used to attribute to ADR-0005 does not come
from there: ADR-0005 (`self-contained-runtime-assets`) speaks only to
third-party origins — vendoring design tokens and fonts so the page makes no
external request — and says nothing about the format of a same-origin,
build-time-generated image. The rule that `/og.svg` (and now, equivalently,
the PNG rendered from it) must never be fetched from a third party or ship an
image-processing dependency that reaches the network is issue #50 (Q6)'s own
constraint, not a restatement of ADR-0005.

If a future `@resvg/resvg-wasm` install ever fails, `scripts/vendor-assets.mjs`
documents a stop path: revert `og:image`/`twitter:image` in `Base.astro` back
to `/og.svg` directly, and record the reversion in that cycle's journal entry.

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

## Reviewer-step results from #10 (post-deployment)

1. **HAR check — pass.** A HAR capture of all four pages — `/`, `/work/`,
   `/approach/`, `/colophon/` — in both languages and both themes shows zero
   off-origin requests. Every byte the browser fetched came from the site's own
   origin, as ADR-0004 and ADR-0005 require.
2. **CSP check — pass by construction.** Zero `<style>` tags and zero `style=`
   attributes in the built markup, zero external scripts, and exactly one inline
   script per page — the language/theme bootstrap in
   `src/layouts/Base.astro` — whose SHA-256 is listed in `script-src` by
   `scripts/csp-hash.mjs` and substituted into `security-headers.conf` at image
   build time. `scripts/check-dist.mjs` fails the build on a `<style` element, a
   ` style="` attribute or any absolute-URL subresource, so this property is
   mechanically held rather than observed once.
3. **Two Cloudflare edge rewrites had to be disabled before either check could
   pass.** Cloudflare **Web Analytics** injected
   `static.cloudflareinsights.com/beacon.min.js` into every page, against
   ADR-0004; the Content-Security-Policy blocked it, so nothing executed, but
   the tag shipped in the markup and every page load produced a blocked
   third-party request. Cloudflare **Email Obfuscation** replaced the contact
   `mailto:` with a `/cdn-cgi/l/email-protection` link and injected a decoder
   script, which broke the contact link with JavaScript disabled — on a site
   whose promise is full usability without JavaScript. Both were disabled for the
   zone; both are recorded as manual interventions in the journal entry for this
   cycle, because the edge configuration is wiring and sits outside the DevLoop
   by ADR-0001.
4. **Lighthouse mobile — not run; still outstanding for a human.** The
   implementer has no browser, so the mobile Lighthouse pass over the four pages
   has not been performed and remains a reviewer step. The empty score table in
   the "Lighthouse mobile (reviewer step, post-deployment)" section above is the
   place to record it.
