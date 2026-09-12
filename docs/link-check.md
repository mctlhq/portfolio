# Internal link check

Record of the internal-only link check added in issue #55 (Q2', Part 4):
what `scripts/check-links.mjs` proves, what it deliberately does not, how to
run it, and why external checking stays out of scope.

## What it proves

`scripts/check-links.mjs` walks every `dist/**/*.html` produced by
`npm run build`, extracts the `href` of every `<a>` element and every
`<link rel="canonical">`, and resolves each internal one against a real file
under `dist/`:

- A root-relative href (`/colophon/`) or an absolute `http(s)` href whose
  origin matches the `site` configured in `astro.config.mjs` is classified
  as internal. Classification is by origin comparison, never by byte
  equality with the page's own canonical or its own path -- an absolute
  self-link carrying a fragment, missing a trailing slash, or appearing on a
  `noindex` page with no canonical of its own (`src/pages/404.astro`) is
  routine on this site, not a sign of anything wrong.
- Resolution honours `trailingSlash: 'always'`: a trailing slash resolves to
  `<path>/index.html`; a path with a file extension resolves to `<path>`
  itself; an extensionless, slash-less path tries `<path>/index.html` first
  and falls back to `<path>`, naming both candidates if neither exists.
- `mailto:`, any other non-`http(s)` scheme, and an off-origin `http(s)` URL
  are reported as skipped, by count and listed -- on a passing run as well
  as a failing one, so nothing skipped is ever mistaken for something that
  passed.
- The check exits non-zero, naming the page, the href, and the file(s) it
  expected, the moment one internal href fails to resolve.

It runs from `.github/workflows/build.yml`, right after `npm run build`, so
every pull request proves this property against the exact tree the build
produced.

## What it deliberately does not prove

- **Third-party reachability.** It makes no network request of any kind: no
  `fetch`, no socket, no HTTP client, no retry, no timeout, no status-code
  table. An off-origin href is only ever classified as skipped, never
  checked. See "Why external checking is out of scope" below.
- **Fragment targets.** A same-origin href carrying a `#fragment` resolves
  the document the fragment is attached to; the check does not verify that
  an element with that `id` actually exists on the page. No `href="#..."`
  exists on the site today (the skip-link is a separate, later issue), so
  this is a documented non-claim rather than an observed gap.
- **nginx redirect behaviour.** The check reasons about the static `dist/`
  tree only. Whatever `nginx.conf` does at request time -- the `www` to
  apex redirect, trailing-slash normalisation at the edge -- is out of its
  view entirely.
- **Link text.** It checks where an href points, not what the link says or
  whether the wording is a good description of the destination.

## How to run it locally

```sh
npm run build
node scripts/check-links.mjs
```

`npm run build` runs `prebuild` first (`npm run vendor && npm test`), so a
local run also re-proves everything `npm test` already covers before the
link check ever sees a `dist/` tree.

## Why external checking is out of scope

This proposal supersedes issue #46, whose pull request (#54) closed
unmerged over exactly this question. That cycle required every link --
including every third-party one -- to return HTTP 200. Roughly sixty
sequential unauthenticated requests per pull request from shared GitHub
Actions egress addresses makes a rate-limit response a routine outcome
unrelated to the diff being reviewed: forgiving that failure lets the gate
pass without actually having checked anything, and refusing to forgive it
makes CI flake on infrastructure this repository does not control. Both
directions are wrong, which is the signal that the requirement itself, not
any particular implementation of it, was the defect. A snapshot of whether
some other site returned 200 on some other day is not evidence about a
change in this repository, so this check was rebuilt to prove only what it
can prove without leaving this repository's own build output.
